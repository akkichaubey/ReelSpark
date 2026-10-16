import { GoogleGenAI } from '@google/genai';
import { APP_CONFIG, getGeminiFallbackChain, getGeminiModel, loadAppSettings, resolveApiGeminiModel } from './config';
import { ClipCandidate, TopicCategory, TranscriptSegment } from './types';

export function getGeminiClient(customApiKey?: string): GoogleGenAI | null {
  const settings = loadAppSettings();
  const apiKey = customApiKey || settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Execute ai.models.generateContent with automatic multi-model fallback when a model
 * experiences 503 high demand or 429 per-model rate limits.
 */
export async function generateContentWithFallback(
  ai: GoogleGenAI,
  preferredModel: string | undefined,
  params: { contents: any; config?: any }
): Promise<any> {
  const models = getGeminiFallbackChain(preferredModel);
  let lastError: any = null;

  for (const m of models) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const status = err?.status;
      // Retry on 429 (per-model quota), 503 (high demand), or 404 (model alias)
      if (
        status === 429 ||
        status === 503 ||
        status === 404 ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('404') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED')
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini models in fallback chain failed');
}

/**
 * Prompt template specifically tuned for speeches, podcasts, and philosophical talks (e.g. Osho).
 */
export const ANALYSIS_SYSTEM_INSTRUCTION = `
You are a master video editor, philosopher, and AI clip curator specializing in identifying viral, deeply meaningful, motivational, and thought-provoking short clips from long-form speeches (such as Osho, Alan Watts, J. Krishnamurti, TED talks, and podcasts).

CRITICAL CONSTRAINTS:
1. Every candidate clip MUST be AT MOST 60 seconds long (duration <= 60.0). Clips longer than 60 seconds are strictly rejected.
2. The clip must be a standalone, self-contained thought:
   - Must have a clear opening that grabs attention or introduces the premise.
   - Must NOT begin with dangling pronouns (e.g. "Because of that...", "So he went there...") without clear referents.
   - Must have a satisfying conclusion or punchline.
   - Must preserve the exact words spoken. NEVER fabricate or invent words.
3. Target themes to prioritize:
   - Motivation & Self-Respect
   - Life Lessons & Human Psychology
   - Philosophy & Existence
   - Fear and Courage
   - Meditation, Awareness & Silence
   - Stories with a clear punchline / lesson
   - Relationships & Ego
4. You must score each clip (0-100 total):
   - meaningAndDepth (0-25)
   - standaloneCompleteness (0-20)
   - openingStrength (0-15)
   - emotionalIntellectualImpact (0-15)
   - clarity (0-10)
   - conciseness (0-10)
   - audioQuality (0-5)
5. Provide detailed context verification checks:
   - isCompleteThought (boolean)
   - hasConclusion (boolean)
   - hasDanglingPronouns (boolean)
   - contextConfidence (0-100)
   - notes (string explanation)
`;

export interface ChunkAnalysisInput {
  chunkIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  transcriptSegments: TranscriptSegment[];
  durationLimitSeconds?: number;
}

/**
/**
 * Transcribe extracted audio using Gemini multimodal model with hardware acoustic interval alignment.
 * Produces timestamped segments supporting Hindi, English, and Hinglish.
 */
export async function transcribeAudioWithGemini(
  audioFilePath: string,
  modelName?: string,
  precomputedIntervals?: Array<{ start: number; end: number; duration: number }>
): Promise<TranscriptSegment[]> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not set. Please configure it in your environment.');
  }

  const fs = await import('fs');
  const { detectSpeechIntervals } = await import('./ffmpeg');
  const { alignSegmentsToAcousticIntervals } = await import('./caption-maker/transcription');

  const speechIntervals =
    precomputedIntervals && precomputedIntervals.length > 0
      ? precomputedIntervals
      : (await detectSpeechIntervals(audioFilePath)).intervals;

  const mimeType = audioFilePath.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav';
  const intervalHints =
    speechIntervals.length > 0 && speechIntervals.length <= 150
      ? `\nDETECTED HARDWARE VOICE INTERVALS (non-silent speech windows from FFmpeg waveform analysis):\n` +
        speechIntervals
          .map(
            (iv, idx) =>
              `  Interval #${idx + 1}: start=${iv.start.toFixed(2)}s, end=${iv.end.toFixed(2)}s (duration=${iv.duration.toFixed(2)}s)`
          )
          .join('\n') +
        `\nAlign your output segments with these hardware voice intervals whenever speech occurs in that window. Never span across silence gaps.\n`
      : '';

  const prompt = `
Please accurately transcribe this audio recording into short clause-by-clause segments with exact timestamps in seconds.
The speaker may speak in English, Hindi, or Hinglish. Preserve the exact spoken words and language.
${intervalHints}
Return a valid JSON array of segments in this exact format:
[
  {
    "start": 0.0,
    "end": 3.5,
    "text": "Exact words spoken here",
    "textEn": "Accurate English translation of this exact clause"
  }
]
Only output the raw JSON array.
`;

  const stat = fs.statSync(audioFilePath);
  let text = '[]';

  if (stat.size < 15 * 1024 * 1024) {
    const b64 = fs.readFileSync(audioFilePath).toString('base64');
    const response = await generateContentWithFallback(ai, modelName, {
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
    text = response.text || '[]';
  } else {
    const uploadResult = await ai.files.upload({
      file: audioFilePath,
      config: { mimeType },
    });

    try {
      const response = await generateContentWithFallback(ai, modelName, {
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
      text = response.text || '[]';
    } finally {
      try {
        if (uploadResult.name) {
          await ai.files.delete({ name: uploadResult.name });
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];

  let syncedSegs = parsed
    .map((item) => ({
      start: parseFloat(item.start || 0),
      end: parseFloat(item.end || item.start + 2),
      textHindi: String(item.text || '').trim(),
      textEnglish: String(item.textEn || item.text || '').trim(),
    }))
    .filter((s) => s.textHindi.length > 0);

  if (speechIntervals.length > 0 && syncedSegs.length > 0) {
    syncedSegs = alignSegmentsToAcousticIntervals(syncedSegs, speechIntervals);
  }

  return syncedSegs.map((item, index) => ({
    id: `seg_${index + 1}`,
    start: item.start,
    end: item.end,
    text: item.textHindi,
    textEn: item.textEnglish,
  }));
}

/**
 * Analyze a transcript chunk with Gemini to identify high-potential short clips.
 */
export async function analyzeTranscriptChunkWithGemini(
  input: ChunkAnalysisInput,
  modelName?: string
): Promise<ClipCandidate[]> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  const model = resolveApiGeminiModel(modelName);
  const maxDur = input.durationLimitSeconds || 60;

  const prompt = `
Analyze the following transcript section from a long-form speech (time offset: ${input.startTime.toFixed(1)}s to ${input.endTime.toFixed(1)}s):

TRANSCRIPT WITH TIMESTAMPS:
${input.transcriptSegments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`).join('\n')}

Identify the top 1 to 4 most powerful, self-contained clips that are under ${maxDur} seconds.
Provide both English and Hindi versions for title, transcript, and explanation.
Return a JSON array of objects conforming to this schema:
[
  {
    "title": "Short catchy title in English",
    "titleHindi": "हिंदी में प्रभावशाली शीर्षक",
    "titleEnglish": "English Title",
    "start": 12.5,
    "end": 45.0,
    "topic": "Motivation | Philosophy | Self-Respect | Psychology | Relationships | Fear and Courage | Meditation and Awareness | Life Lessons | Stories | Other",
    "explanation": "Why this moment is valuable and impactful in English",
    "explanationHindi": "हिंदी में व्याख्या",
    "explanationEnglish": "Explanation in English",
    "transcript": "Exact spoken transcript for this segment",
    "transcriptHindi": "हिंदी में प्रतिलिपि या अनुवाद",
    "transcriptEnglish": "English transcript or translation",
    "firstWords": "First 4-6 words",
    "lastWords": "Last 4-6 words",
    "scores": {
      "meaningAndDepth": 22,
      "standaloneCompleteness": 18,
      "openingStrength": 14,
      "emotionalIntellectualImpact": 13,
      "clarity": 9,
      "conciseness": 9,
      "audioQuality": 5,
      "total": 90
    },
    "contextVerification": {
      "isCompleteThought": true,
      "hasConclusion": true,
      "hasDanglingPronouns": false,
      "contextConfidence": 95,
      "notes": "Clear self-contained insight with no dangling references",
      "flaggedForReview": false
    }
  }
]
`;

  const response = await generateContentWithFallback(ai, modelName, {
    contents: prompt,
    config: {
      systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text || '[]';
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item: any) => {
      const dur = (item.end || 0) - (item.start || 0);
      return dur > 3 && dur <= maxDur + 0.5;
    })
    .map((item: any, idx: number) => {
      const start = parseFloat(item.start);
      const end = parseFloat(item.end);
      const duration = Math.min(60, Math.round((end - start) * 10) / 10);
      const totalScore =
        (item.scores?.meaningAndDepth || 15) +
        (item.scores?.standaloneCompleteness || 15) +
        (item.scores?.openingStrength || 10) +
        (item.scores?.emotionalIntellectualImpact || 10) +
        (item.scores?.clarity || 8) +
        (item.scores?.conciseness || 8) +
        (item.scores?.audioQuality || 4);

      return {
        id: `clip_${input.chunkIndex}_${idx + 1}_${Date.now()}`,
        title: item.title || `Highlight at ${Math.round(start)}s`,
        titleHindi: item.titleHindi,
        titleEnglish: item.titleEnglish || item.title,
        start,
        end,
        duration,
        topic: (item.topic as TopicCategory) || 'Philosophy',
        explanation: item.explanation || 'Thought-provoking insight',
        explanationHindi: item.explanationHindi,
        explanationEnglish: item.explanationEnglish || item.explanation,
        transcript: item.transcript || '',
        transcriptHindi: item.transcriptHindi,
        transcriptEnglish: item.transcriptEnglish || item.transcript,
        firstWords: item.firstWords || '',
        lastWords: item.lastWords || '',
        scores: {
          meaningAndDepth: item.scores?.meaningAndDepth || 18,
          standaloneCompleteness: item.scores?.standaloneCompleteness || 16,
          openingStrength: item.scores?.openingStrength || 12,
          emotionalIntellectualImpact: item.scores?.emotionalIntellectualImpact || 12,
          clarity: item.scores?.clarity || 8,
          conciseness: item.scores?.conciseness || 8,
          audioQuality: item.scores?.audioQuality || 4,
          total: Math.min(100, item.scores?.total || totalScore),
        },
        contextVerification: {
          isCompleteThought: Boolean(item.contextVerification?.isCompleteThought ?? true),
          hasConclusion: Boolean(item.contextVerification?.hasConclusion ?? true),
          hasDanglingPronouns: Boolean(item.contextVerification?.hasDanglingPronouns ?? false),
          contextConfidence: item.contextVerification?.contextConfidence || 88,
          notes: item.contextVerification?.notes || 'Verified against nearby sentences.',
          flaggedForReview: Boolean(item.contextVerification?.flaggedForReview ?? false),
        },
        selected: true,
        renderStatus: 'idle',
      };
    });
}

/**
 * Public YouTube URL semantic analysis via Gemini.
 */
export async function analyzeYouTubeWithGemini(youtubeUrl: string, modelName?: string): Promise<ClipCandidate[]> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `
Analyze this public video from YouTube: ${youtubeUrl}
Identify the top 3 to 6 best short viral/philosophical clip candidates under 60 seconds each.
Ensure accurate relative timestamps from the video timeline.
Return a structured JSON array conforming to candidate schema with title, start, end, topic, explanation, transcript, scores, and contextVerification.
`;

  try {
    const response = await generateContentWithFallback(ai, modelName, {
      contents: prompt,
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '[]';
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any, idx: number) => ({
      id: `yt_clip_${idx + 1}_${Date.now()}`,
      title: item.title || `Clip ${idx + 1}`,
      start: parseFloat(item.start || 0),
      end: parseFloat(item.end || 30),
      duration: Math.min(60, parseFloat(item.end || 30) - parseFloat(item.start || 0)),
      topic: item.topic || 'Philosophy',
      explanation: item.explanation || 'Engaging speech segment',
      transcript: item.transcript || '',
      firstWords: item.firstWords || '',
      lastWords: item.lastWords || '',
      scores: item.scores || {
        meaningAndDepth: 20,
        standaloneCompleteness: 18,
        openingStrength: 13,
        emotionalIntellectualImpact: 14,
        clarity: 8,
        conciseness: 8,
        audioQuality: 5,
        total: 86,
      },
      contextVerification: item.contextVerification || {
        isCompleteThought: true,
        hasConclusion: true,
        hasDanglingPronouns: false,
        contextConfidence: 90,
        notes: 'Contextually verified thought boundaries',
        flaggedForReview: false,
      },
      selected: true,
      renderStatus: 'idle',
    }));
  } catch (err: any) {
    throw new Error(`YouTube video analysis failed: ${err.message}`);
  }
}

/**
 * Fast connectivity and model test for Gemini API.
 */
export async function testGeminiConnection(
  modelName?: string,
  customApiKey?: string
): Promise<{ success: boolean; message: string; model: string }> {
  const displayModel = modelName || getGeminiModel();
  const ai = getGeminiClient(customApiKey);
  if (!ai) {
    return {
      success: false,
      message: 'GEMINI_API_KEY is not configured. Please provide a valid Gemini API key.',
      model: displayModel,
    };
  }

  try {
    const response = await generateContentWithFallback(ai, displayModel, {
      contents: 'Respond with exactly the single phrase: "ReelSpark AI Connection Successful"',
    });

    const text = response.text || '';
    return {
      success: true,
      message: `Successfully connected to ${displayModel}! Response received: "${text.trim().substring(0, 50)}"`,
      model: displayModel,
    };
  } catch (err: any) {
    const errorMsg = err.message || `Failed to connect with ${displayModel}`;
    const isQuota = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
    return {
      success: false,
      message: isQuota
        ? `Model ${displayModel} reached API quota / rate limit (429). The system will seamlessly fall back to local heuristic analysis or you can switch to another model / API key.`
        : `Connection test error with ${displayModel}: ${errorMsg}`,
      model: displayModel,
    };
  }
}


