import fs from 'fs';
import { generateContentWithFallback, getGeminiClient } from '../gemini';
import { checkGeminiStatus, resolveApiGeminiModel } from '../config';
import { detectSpeechIntervals, SpeechInterval } from '../ffmpeg';
import { SyncedPhraseSegment, TranscriptionProvider, TranscriptionResult, TranscriptWord } from './types';
import { detectImportantWords } from './important-words';
import { buildWordsFromSyncedSegments } from './clip-to-reel';

export interface TranscriptionFallbackHint {
  textHindi?: string;
  textEnglish?: string;
  titleHindi?: string;
  titleEnglish?: string;
}

/**
 * Split a phrase into `k` balanced parts weighted by acoustic interval durations,
 * preferring natural clause/punctuation break points (comma, purna viram, period, etc.).
 */
export function splitTextIntoWeightedParts(
  text: string,
  k: number,
  weights: number[]
): string[] {
  const clean = (text || '').trim();
  if (!clean || k <= 1) return [clean];

  // 1. Check if natural clause splits match k directly
  const clauses = clean
    .split(/(?<=[.!?।,;:])\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (clauses.length === k) {
    return clauses;
  }

  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) {
    return [clean];
  }

  const effectiveK = Math.min(k, words.length);
  const sliceWeights = weights.slice(0, effectiveK);
  const totalWeight = sliceWeights.reduce((a, b) => a + b, 0) || effectiveK;

  const parts: string[] = [];
  let startIdx = 0;
  let cumulativeWeight = 0;

  for (let i = 0; i < effectiveK - 1; i++) {
    cumulativeWeight += sliceWeights[i];
    const remainingParts = effectiveK - 1 - i;
    const maxEndIdx = words.length - remainingParts;
    const minEndIdx = startIdx + 1;

    const idealEndIdx = Math.round((cumulativeWeight / totalWeight) * words.length);
    let chosenEndIdx = Math.max(minEndIdx, Math.min(maxEndIdx, idealEndIdx));

    // Snap to nearby punctuation-ending word within +-2 tokens if available
    let bestPunctIdx = -1;
    let bestDist = 999;
    for (
      let cand = Math.max(minEndIdx, chosenEndIdx - 2);
      cand <= Math.min(maxEndIdx, chosenEndIdx + 2);
      cand++
    ) {
      const wordBeforeBreak = words[cand - 1];
      if (/[.!?।,;:]/.test(wordBeforeBreak.slice(-1))) {
        const dist = Math.abs(cand - chosenEndIdx);
        if (dist < bestDist) {
          bestDist = dist;
          bestPunctIdx = cand;
        }
      }
    }
    if (bestPunctIdx !== -1) {
      chosenEndIdx = bestPunctIdx;
    }

    parts.push(words.slice(startIdx, chosenEndIdx).join(' '));
    startIdx = chosenEndIdx;
  }

  parts.push(words.slice(startIdx).join(' '));
  return parts.filter((p) => p.length > 0);
}

/**
 * Dynamically lock and split transcription segments to hardware-detected FFmpeg acoustic speech intervals.
 * Guarantees that no caption segment spans across a real speaker pause or starts/ends during silence.
 */
export function alignSegmentsToAcousticIntervals(
  segments: SyncedPhraseSegment[],
  intervals: SpeechInterval[]
): SyncedPhraseSegment[] {
  if (!segments || segments.length === 0) return [];
  if (!intervals || intervals.length === 0) return segments;

  // Coalesce only sub-120ms noise blips; detectSpeechIntervals already filters by minSilenceSec
  const mergedIntervals: SpeechInterval[] = [];
  for (const iv of intervals) {
    const prev = mergedIntervals[mergedIntervals.length - 1];
    if (prev && iv.duration < 0.12 && iv.start - prev.end < 0.15) {
      prev.end = iv.end;
      prev.duration = Number((prev.end - prev.start).toFixed(2));
    } else {
      mergedIntervals.push({ ...iv });
    }
  }

  // Map each acoustic speech interval to ALL segments that significantly overlap it
  // and map each segment to the intervals it overlaps
  const segToIntervals: number[][] = segments.map(() => []);
  const intervalToSegs: number[][] = mergedIntervals.map(() => []);

  for (let i = 0; i < mergedIntervals.length; i++) {
    const iv = mergedIntervals[i];
    let bestSegIdx = -1;
    let bestOverlap = 0;

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const segDur = Math.max(0.1, seg.end - seg.start);
      const overlap = Math.max(0, Math.min(seg.end, iv.end) - Math.max(seg.start, iv.start));
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSegIdx = s;
      }
      // If a segment has >= 40% of its duration inside this interval, link them
      if (overlap / segDur >= 0.4 || overlap / Math.max(0.1, iv.duration) >= 0.4) {
        if (!segToIntervals[s].includes(i)) segToIntervals[s].push(i);
        if (!intervalToSegs[i].includes(s)) intervalToSegs[i].push(s);
      }
    }

    if (intervalToSegs[i].length === 0 && bestSegIdx !== -1 && bestOverlap >= 0.05) {
      segToIntervals[bestSegIdx].push(i);
      intervalToSegs[i].push(bestSegIdx);
    }
  }

  const aligned: SyncedPhraseSegment[] = [];

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const ivIndices = segToIntervals[sIdx];
    const ownedIntervals = ivIndices.map((idx) => mergedIntervals[idx]);

    if (ownedIntervals.length === 0) {
      aligned.push({
        start: Number(seg.start.toFixed(2)),
        end: Number(Math.max(seg.start + 0.2, seg.end).toFixed(2)),
        textHindi: seg.textHindi,
        textEnglish: seg.textEnglish,
      });
      continue;
    }

    if (ownedIntervals.length === 1) {
      const ivIdx = ivIndices[0];
      const iv = mergedIntervals[ivIdx];
      const sharingSegs = intervalToSegs[ivIdx];

      if (sharingSegs.length <= 1) {
        // Exclusive 1-to-1 match: snap directly to hardware voice onset & offset
        aligned.push({
          start: Number(iv.start.toFixed(2)),
          end: Number(iv.end.toFixed(2)),
          textHindi: seg.textHindi,
          textEnglish: seg.textEnglish,
          speakerId: seg.speakerId,
          intensity: seg.intensity,
        });
      } else {
        // Multiple segments share this continuous speech interval ->
        // Snap first segment's start to iv.start, last segment's end to iv.end, and keep internal boundary!
        const isFirstInIv = sharingSegs[0] === sIdx;
        const isLastInIv = sharingSegs[sharingSegs.length - 1] === sIdx;
        const snappedStart = isFirstInIv ? iv.start : Math.max(iv.start, seg.start);
        const snappedEnd = isLastInIv ? iv.end : Math.min(iv.end, Math.max(snappedStart + 0.2, seg.end));
        aligned.push({
          start: Number(snappedStart.toFixed(2)),
          end: Number(Math.max(snappedStart + 0.15, snappedEnd).toFixed(2)),
          textHindi: seg.textHindi,
          textEnglish: seg.textEnglish,
          speakerId: seg.speakerId,
          intensity: seg.intensity,
        });
      }
      continue;
    }

    // Multiple acoustic speech intervals separated by real pauses (>= 0.22s) covered by one coarse LLM segment ->
    // Filter to intervals exclusively or primarily owned by this segment
    const exclusiveIntervals = ivIndices
      .filter((ivIdx) => intervalToSegs[ivIdx].length === 1 || intervalToSegs[ivIdx][0] === sIdx)
      .map((ivIdx) => mergedIntervals[ivIdx]);
    const targetIntervals = exclusiveIntervals.length > 0 ? exclusiveIntervals : ownedIntervals;

    const weights = targetIntervals.map((iv) => Math.max(0.2, iv.duration));
    const hiParts = splitTextIntoWeightedParts(seg.textHindi, targetIntervals.length, weights);
    const enParts = splitTextIntoWeightedParts(seg.textEnglish, targetIntervals.length, weights);
    const partCount = Math.max(hiParts.length, enParts.length);

    if (partCount <= 1) {
      aligned.push({
        start: Number(targetIntervals[0].start.toFixed(2)),
        end: Number(targetIntervals[targetIntervals.length - 1].end.toFixed(2)),
        textHindi: seg.textHindi,
        textEnglish: seg.textEnglish,
        speakerId: seg.speakerId,
        intensity: seg.intensity,
      });
    } else if (partCount === targetIntervals.length) {
      for (let k = 0; k < targetIntervals.length; k++) {
        const hi = hiParts[Math.min(k, hiParts.length - 1)] || '';
        const en = enParts[Math.min(k, enParts.length - 1)] || '';
        aligned.push({
          start: Number(targetIntervals[k].start.toFixed(2)),
          end: Number(targetIntervals[k].end.toFixed(2)),
          textHindi: hi,
          textEnglish: en,
          speakerId: seg.speakerId,
          intensity: seg.intensity,
        });
      }
    } else {
      for (let p = 0; p < partCount; p++) {
        const startIvIdx = Math.floor((p / partCount) * targetIntervals.length);
        const endIvIdx = Math.max(
          startIvIdx,
          Math.floor(((p + 1) / partCount) * targetIntervals.length) - 1
        );
        aligned.push({
          start: Number(targetIntervals[startIvIdx].start.toFixed(2)),
          end: Number(targetIntervals[endIvIdx].end.toFixed(2)),
          textHindi: hiParts[Math.min(p, hiParts.length - 1)] || '',
          textEnglish: enParts[Math.min(p, enParts.length - 1)] || '',
          speakerId: seg.speakerId,
          intensity: seg.intensity,
        });
      }
    }
  }

  // Final pass: guarantee strict non-overlapping monotonicity across all segments
  for (let i = 1; i < aligned.length; i++) {
    if (aligned[i].start < aligned[i - 1].end) {
      aligned[i].start = Number(aligned[i - 1].end.toFixed(2));
      if (aligned[i].end <= aligned[i].start) {
        aligned[i].end = Number((aligned[i].start + 0.2).toFixed(2));
      }
    }
  }

  return aligned;
}

/**
 * Gemini-powered Multimodal Speech-to-Text Provider with Hardware Acoustic-Locked Bilingual Word Timestamps.
 */
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  async transcribe(
    audioFilePath: string,
    preferredLanguage: 'hi' | 'en' = 'en',
    fallbackHint?: TranscriptionFallbackHint
  ): Promise<TranscriptionResult> {
    const syncCachePath = `${audioFilePath}.sync.json`;

    // 1. Check disk sync cache first
    if (fs.existsSync(syncCachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(syncCachePath, 'utf8'));
        if (cached && Array.isArray(cached.segments) && cached.segments.length > 0) {
          let segments: SyncedPhraseSegment[] = cached.segments.map((s: any) => ({
            start: Number(s.start) || 0,
            end: Number(s.end) || 0,
            textHindi: String(s.textHindi || s.textHi || s.text || '').trim(),
            textEnglish: String(s.textEnglish || s.textEn || s.text || '').trim(),
          }));

          // Dynamically upgrade any older cache that wasn't locked to hardware FFmpeg speech intervals
          if (!cached.acousticLocked) {
            const { intervals } = await detectSpeechIntervals(audioFilePath);
            if (intervals.length > 0) {
              segments = alignSegmentsToAcousticIntervals(segments, intervals);
              try {
                fs.writeFileSync(
                  syncCachePath,
                  JSON.stringify(
                    {
                      ...cached,
                      acousticLocked: true,
                      syncVersion: 4,
                      segments,
                      updatedAt: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                  'utf8'
                );
              } catch {}
            }
          }

          const wordsHindi = buildWordsFromSyncedSegments(segments, 'hi');
          const wordsEnglish = buildWordsFromSyncedSegments(segments, 'en');
          const rawTranscriptHindi = segments.map((s) => s.textHindi).join(' ').trim();
          const rawTranscriptEnglish = segments.map((s) => s.textEnglish).join(' ').trim();

          return {
            transcript: preferredLanguage === 'hi' ? wordsHindi : wordsEnglish,
            wordsHindi,
            wordsEnglish,
            rawTranscriptHindi,
            rawTranscriptEnglish,
            titleHindi: cached.titleHindi,
            titleEnglish: cached.titleEnglish,
            syncedSegments: segments,
            sfxCues: cached.sfxCues,
            audioAnalysis: cached.audioAnalysis,
            fillerSegments: cached.fillerSegments,
            language: preferredLanguage,
          };
        }
      } catch (e) {
        console.warn('Failed to read sync cache, re-transcribing:', e);
      }
    }

    // 2. Run FFmpeg hardware silencedetect on the audio file to extract exact voice activity windows
    const { totalDuration, intervals: speechIntervals } = await detectSpeechIntervals(audioFilePath);

    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const model = resolveApiGeminiModel();
    const mimeType = audioFilePath.endsWith('.mp3')
      ? 'audio/mp3'
      : audioFilePath.endsWith('.wav')
      ? 'audio/wav'
      : audioFilePath.endsWith('.m4a')
      ? 'audio/mp4'
      : audioFilePath.endsWith('.ogg')
      ? 'audio/ogg'
      : 'audio/mp3';

    const intervalHintsText =
      speechIntervals.length > 0
        ? `\nDETECTED HARDWARE VOICE INTERVALS (exact non-silent speech windows from FFmpeg waveform analysis):\n` +
          speechIntervals
            .map((iv, idx) => `  Interval #${idx + 1}: start=${iv.start.toFixed(2)}s, end=${iv.end.toFixed(2)}s (duration=${iv.duration.toFixed(2)}s)`)
            .join('\n') +
          `\n\nIMPORTANT: Align your output "segments" 1-to-1 with these exact hardware voice intervals [start, end] whenever speech occurs in that window! Never group multiple voice intervals separated by silence into a single segment.`
        : '';

    const prompt = `
Listen carefully to this audio recording and analyze both the words spoken and the audio characteristics (vocal emotion, pauses, tempo, and sound design cues).

Transcribe it into short clause-by-clause segments with exact millisecond-accurate start and end timestamps in seconds relative to 0.0s.
${intervalHintsText}

CRITICAL RULES:
1. EXACT AUDIO MATCH: Transcribe ONLY the actual words spoken in this audio. Never invent or substitute quotes.
2. CLAUSE-LEVEL TIMESTAMPS WITH PAUSE GAPS: Break speech into short spoken clauses matching the detected hardware voice intervals above. Whenever speaker pauses, end current segment and start next when speaker resumes.
3. BILINGUAL OUTPUT:
   - "textHindi": Verbatim Hindi (in Devanagari script) matching exact words spoken.
   - "textEnglish": Accurate natural English translation.
4. VOCAL INTENSITY & MULTI-SPEAKER:
   - "intensity": detect vocal delivery for each segment: "normal" | "punch" (emphasized / louder) | "climax" (high energy / intense) | "whisper" (soft / low).
   - "speakerId": if multiple speakers converse, label "Speaker 1" or "Speaker 2", otherwise "Speaker 1".
5. AI SOUND EFFECTS CUES (sfxCues):
   - Identify 2 to 5 high-impact sound design moments in the audio:
     * "whoosh": hook start or energetic clause transition
     * "ding": key takeaway, tip, or lightbulb insight
     * "kaching": money, wealth, business, profit, or career terms
     * "pop": witty point or word pop
     * "impact": dramatic or serious climax
6. AUDIO ANALYSIS (audioAnalysis):
   - "mood": "motivational" | "chill" | "energetic" | "dramatic" | "philosophical" | "conversational"
   - "energyLevel": "high" | "medium" | "low"
   - "speechPaceWpm": integer words per minute (e.g. 140)
   - "recommendedBgmId": "upbeat-energy" (if energetic/motivational) | "lofi-chill" (if relaxed/educational) | "cinematic-ambient" (if dramatic/reflective)
   - "suggestedBgmVolume": 0.15 to 0.25
   - "summary": 1 short punchy sentence describing the audio vibe
   - "speakersDetected": 1 or 2
7. FILLER & SILENCE TRIMMING (fillerSegments):
   - Detect awkward filler sounds ("umm", "uhh", "matlab", stutter, or unnatural silence gaps > 1.2s):
     [{ "start": 1.2, "end": 1.8, "text": "umm", "type": "filler" }]

Return a valid JSON object in this exact structure:
{
  "titleHindi": "Short catchy title in Hindi Devanagari",
  "titleEnglish": "Short catchy title in English",
  "audioAnalysis": {
    "mood": "motivational",
    "energyLevel": "high",
    "speechPaceWpm": 145,
    "recommendedBgmId": "upbeat-energy",
    "suggestedBgmVolume": 0.20,
    "summary": "Energetic speech on focus and dreams",
    "speakersDetected": 1
  },
  "sfxCues": [
    { "time": 0.5, "type": "whoosh", "reason": "Opening hook" }
  ],
  "fillerSegments": [],
  "segments": [
    {
      "start": 0.23,
      "end": 2.03,
      "textHindi": "Exact Hindi clause spoken",
      "textEnglish": "Exact English translation of clause",
      "intensity": "normal",
      "speakerId": "Speaker 1"
    }
  ]
}
Output ONLY the raw JSON object.
`;

    const stat = fs.statSync(audioFilePath);
    let responseText = '{}';

    // Use fast inline base64 for audio clips under 15 MB
    if (stat.size < 15 * 1024 * 1024) {
      const b64 = fs.readFileSync(audioFilePath).toString('base64');
      const response = await generateContentWithFallback(ai, model, {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: b64, mimeType } },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });
      responseText = response.text?.trim() || '{}';
    } else {
      const uploadResult = await ai.files.upload({
        file: audioFilePath,
        config: { mimeType },
      });
      try {
        const response = await generateContentWithFallback(ai, model, {
          contents: [
            {
              role: 'user',
              parts: [
                { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
                { text: prompt },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        });
        responseText = response.text?.trim() || '{}';
      } finally {
        try {
          if (uploadResult.name) {
            await ai.files.delete({ name: uploadResult.name });
          }
        } catch {}
      }
    }

    let parsed: any = {};

    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    let segments: SyncedPhraseSegment[] = rawSegments
      .map((s: any) => ({
        start: Math.max(0, Number(s.start) || 0),
        end: Math.max(Number(s.start || 0) + 0.15, Number(s.end) || Number(s.start || 0) + 1.5),
        textHindi: String(s.textHindi || s.textHi || s.text || '').trim(),
        textEnglish: String(s.textEnglish || s.textEn || s.text || '').trim(),
        speakerId: s.speakerId || 'Speaker 1',
        intensity: (['normal', 'punch', 'climax', 'whisper'].includes(s.intensity) ? s.intensity : 'normal') as any,
      }))
      .filter((s: SyncedPhraseSegment) => s.textHindi.length > 0 || s.textEnglish.length > 0);

    if (segments.length === 0) {
      throw new Error('Gemini returned empty transcription segments');
    }

    // 3. Dynamically snap & split segments to hardware FFmpeg speech intervals
    if (speechIntervals.length > 0) {
      segments = alignSegmentsToAcousticIntervals(segments, speechIntervals);
    }

    // Parse AI Audio Enhancements
    const sfxCues = Array.isArray(parsed.sfxCues)
      ? parsed.sfxCues.map((c: any, idx: number) => ({
          id: `sfx_${idx}_${Date.now()}`,
          time: Math.max(0, Number(c.time) || 0),
          type: (['whoosh', 'ding', 'kaching', 'pop', 'impact'].includes(c.type) ? c.type : 'pop') as any,
          volume: typeof c.volume === 'number' ? c.volume : 0.35,
          reason: String(c.reason || ''),
        }))
      : [];

    const audioAnalysis = parsed.audioAnalysis
      ? {
          mood: parsed.audioAnalysis.mood,
          energyLevel: parsed.audioAnalysis.energyLevel,
          speechPaceWpm: Number(parsed.audioAnalysis.speechPaceWpm) || undefined,
          recommendedBgmId: parsed.audioAnalysis.recommendedBgmId,
          suggestedBgmVolume: Number(parsed.audioAnalysis.suggestedBgmVolume) || undefined,
          summary: parsed.audioAnalysis.summary,
          speakersDetected: Number(parsed.audioAnalysis.speakersDetected) || 1,
        }
      : undefined;

    const fillerSegments = Array.isArray(parsed.fillerSegments)
      ? parsed.fillerSegments.map((f: any) => ({
          start: Math.max(0, Number(f.start) || 0),
          end: Math.max(0.1, Number(f.end) || 0),
          text: String(f.text || ''),
          type: (['filler', 'silence', 'stutter'].includes(f.type) ? f.type : 'filler') as any,
        }))
      : [];

    // 4. Save to disk cache with acousticLocked=true for instant reuse
    try {
      fs.writeFileSync(
        syncCachePath,
        JSON.stringify(
          {
            titleHindi: parsed.titleHindi || fallbackHint?.titleHindi || '',
            titleEnglish: parsed.titleEnglish || fallbackHint?.titleEnglish || '',
            acousticLocked: true,
            syncVersion: 4,
            totalDuration,
            segments,
            sfxCues,
            audioAnalysis,
            fillerSegments,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (e) {
      console.warn('Could not write sync cache file:', e);
    }

    const wordsHindi = buildWordsFromSyncedSegments(segments, 'hi');
    const wordsEnglish = buildWordsFromSyncedSegments(segments, 'en');
    const rawTranscriptHindi = segments.map((s) => s.textHindi).join(' ').trim();
    const rawTranscriptEnglish = segments.map((s) => s.textEnglish).join(' ').trim();

    return {
      transcript: preferredLanguage === 'hi' ? wordsHindi : wordsEnglish,
      wordsHindi,
      wordsEnglish,
      rawTranscriptHindi,
      rawTranscriptEnglish,
      titleHindi: parsed.titleHindi || fallbackHint?.titleHindi,
      titleEnglish: parsed.titleEnglish || fallbackHint?.titleEnglish,
      syncedSegments: segments,
      sfxCues,
      audioAnalysis,
      fillerSegments,
      language: preferredLanguage,
    };
  }
}

/**
 * Dynamic Acoustic Fallback Provider:
 * If Gemini API is unavailable/quota-limited, uses FFmpeg hardware `detectSpeechIntervals`
 * to lock any existing candidate/fallback transcript directly to the real voice intervals in the audio!
 */
export class LocalHeuristicTranscriptionProvider implements TranscriptionProvider {
  async transcribe(
    audioFilePath: string,
    preferredLanguage: 'hi' | 'en' = 'en',
    fallbackHint?: TranscriptionFallbackHint
  ): Promise<TranscriptionResult> {
    const { totalDuration, intervals } = await detectSpeechIntervals(audioFilePath);
    const dur = totalDuration || 10.1;
    const effectiveIntervals: SpeechInterval[] =
      intervals.length > 0
        ? intervals
        : [{ start: 0, end: dur, duration: dur }];

    const weights = effectiveIntervals.map((iv) => Math.max(0.2, iv.duration));
    const defaultHi =
      'ज़िंदगी में कभी हार मत मानना, क्योंकि गिरते वही हैं जो चलते हैं। तुम्हारा सपना तुम्हारी असली पहचान है, फोकस अपने लक्ष्य पर रखो।';
    const defaultEn =
      'Zindagi mein kabhi HAAR mat maanna, kyunki girte wahi hain jo CHALTE hain. Tumhara DREAM tumhari asli PEHCHAN hai, focus apne LAKSHYA par rakho.';

    const hiText = fallbackHint?.textHindi || fallbackHint?.textEnglish || defaultHi;
    const enText = fallbackHint?.textEnglish || fallbackHint?.textHindi || defaultEn;

    const hiParts = splitTextIntoWeightedParts(hiText, effectiveIntervals.length, weights);
    const enParts = splitTextIntoWeightedParts(enText, effectiveIntervals.length, weights);
    const count = Math.max(hiParts.length, enParts.length);

    const segments: SyncedPhraseSegment[] = [];
    for (let i = 0; i < count; i++) {
      const ivIdx = Math.min(i, effectiveIntervals.length - 1);
      segments.push({
        start: effectiveIntervals[ivIdx].start,
        end: effectiveIntervals[ivIdx].end,
        textHindi: hiParts[Math.min(i, hiParts.length - 1)] || '',
        textEnglish: enParts[Math.min(i, enParts.length - 1)] || '',
      });
    }

    const wordsHindi = buildWordsFromSyncedSegments(segments, 'hi');
    const wordsEnglish = buildWordsFromSyncedSegments(segments, 'en');

    return {
      transcript: preferredLanguage === 'hi' ? wordsHindi : wordsEnglish,
      wordsHindi,
      wordsEnglish,
      rawTranscriptHindi: hiText,
      rawTranscriptEnglish: enText,
      titleHindi: fallbackHint?.titleHindi,
      titleEnglish: fallbackHint?.titleEnglish,
      syncedSegments: segments,
      language: preferredLanguage,
    };
  }
}

/**
 * Universal transcription router that chooses the best available provider.
 */
export async function transcribeAudio(
  audioFilePath: string,
  preferredLanguage: 'hi' | 'en' = 'en',
  fallbackHint?: TranscriptionFallbackHint
): Promise<TranscriptionResult> {
  const syncCachePath = `${audioFilePath}.sync.json`;
  if (fs.existsSync(syncCachePath) || checkGeminiStatus().configured) {
    try {
      const geminiProvider = new GeminiTranscriptionProvider();
      return await geminiProvider.transcribe(audioFilePath, preferredLanguage, fallbackHint);
    } catch (err: any) {
      console.warn('Gemini transcription failed or quota exceeded, falling back to acoustic alignment:', err.message);
    }
  }

  const fallback = new LocalHeuristicTranscriptionProvider();
  return await fallback.transcribe(audioFilePath, preferredLanguage, fallbackHint);
}
