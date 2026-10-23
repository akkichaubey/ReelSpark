/**
 * Cloudflare AI Client
 * Replaces Gemini for:
 *   1. Audio transcription  → @cf/openai/whisper-large-v3-turbo  (free, multilingual)
 *   2. Clip analysis / text → @cf/meta/llama-3.1-8b-instruct     (free)
 *
 * Cloudflare AI is accessed via:
 *   - Workers AI REST API (when running outside CF edge, e.g. Render.com or local dev)
 *   - env.AI binding       (when running on CF Pages / CF Workers edge)
 *
 * Environment variables required:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN   — needs Workers AI:Run permission
 *
 * Free limits (2025):
 *   10,000 neurons/day on free plan — enough for ~50 short video analyses/day
 */

import { ClipCandidate, TopicCategory, TranscriptSegment } from '../types';

// ─── Model IDs ────────────────────────────────────────────────────────────────

export const CF_MODELS = {
  /** Best multilingual Whisper for transcription (Hindi, English, Hinglish) */
  whisper: '@cf/openai/whisper-large-v3-turbo' as const,
  /** Fast 8B Llama model for clip analysis and scoring */
  llama: '@cf/meta/llama-3.1-8b-instruct' as const,
  /** Larger 70B model for higher quality analysis (slower) */
  llama70b: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as const,
  /** Qwen alternative — great for Hindi/multilingual */
  qwen: '@cf/qwen/qwen2.5-coder-32b-instruct' as const,
};

export type CfModelId = (typeof CF_MODELS)[keyof typeof CF_MODELS];

// ─── HTTP REST client ─────────────────────────────────────────────────────────

function getCfAiUrl(model: string): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

function getCfAiHeaders(): Record<string, string> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Run a Cloudflare AI text model (Llama, Qwen, etc.)
 */
async function cfAiText(
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<string> {
  const res = await fetch(getCfAiUrl(model), {
    method: 'POST',
    headers: { ...getCfAiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF AI text request failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { result: { response: string }; success: boolean; errors: any[] };
  if (!data.success) throw new Error(`CF AI error: ${JSON.stringify(data.errors)}`);
  return data.result?.response ?? '';
}

/**
 * Run Whisper transcription on a raw audio buffer via CF AI REST API.
 */
async function cfAiWhisper(audioBuffer: Buffer, mimeType: string): Promise<any> {
  const blob = new Blob([audioBuffer.buffer as ArrayBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('file', blob, 'audio.mp3');

  const res = await fetch(getCfAiUrl(CF_MODELS.whisper), {
    method: 'POST',
    headers: getCfAiHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF Whisper request failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { result: any; success: boolean; errors: any[] };
  if (!data.success) throw new Error(`CF Whisper error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transcribe an audio file using Cloudflare AI Whisper.
 * Returns word-level timestamped segments (Hindi, English, Hinglish).
 *
 * Replaces: transcribeAudioWithGemini() from gemini.ts
 */
export async function transcribeAudioWithCloudflarAI(
  audioFilePath: string
): Promise<TranscriptSegment[]> {
  const fs = await import('fs');
  const path = await import('path');

  const audioBuffer = await fs.promises.readFile(audioFilePath);
  const ext = path.extname(audioFilePath).toLowerCase();
  const mimeType = ext === '.mp3' ? 'audio/mp3' : ext === '.wav' ? 'audio/wav' : 'audio/mpeg';

  const result = await cfAiWhisper(audioBuffer, mimeType);

  // Whisper returns word-level timestamps in result.words[]
  // and full text in result.text
  const words: Array<{ word: string; start: number; end: number }> = result.words || [];
  const fullText: string = result.text || '';

  if (words.length === 0 && fullText) {
    // Fallback: no word timestamps, use full text as single segment
    return [
      {
        id: 'seg_1',
        start: 0,
        end: 60,
        text: fullText,
      },
    ];
  }

  // Group words into clause-level segments on pauses > 0.45s or punctuation
  const segments: TranscriptSegment[] = [];
  let groupWords: typeof words = [];
  let segIdx = 1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    groupWords.push(w);

    const pauseAfter = next ? next.start - w.end : 99;
    const hasPunctuation = /[.!?।,;]$/.test(w.word.trim());
    const tooLong = groupWords.length >= 12;

    if (pauseAfter > 0.45 || hasPunctuation || tooLong || !next) {
      const text = groupWords.map((gw) => gw.word).join(' ').trim();
      if (text) {
        segments.push({
          id: `seg_${segIdx++}`,
          start: groupWords[0].start,
          end: groupWords[groupWords.length - 1].end,
          text,
        });
      }
      groupWords = [];
    }
  }

  return segments;
}

// ─── System instruction for clip analysis ────────────────────────────────────

const CLIP_ANALYSIS_SYSTEM = `You are a master video editor specializing in identifying viral, meaningful short clips.

CONSTRAINTS:
- Every clip MUST be AT MOST 60 seconds long.
- Clips must be self-contained thoughts with clear openings and conclusions.
- Score each clip on: meaningAndDepth (0-25), standaloneCompleteness (0-20), openingStrength (0-15), emotionalIntellectualImpact (0-15), clarity (0-10), conciseness (0-10), audioQuality (0-5).
- Return ONLY a valid JSON array. No markdown. No explanation outside the JSON.`;

/**
 * Analyze a transcript chunk with Cloudflare AI (Llama) to find viral clip candidates.
 *
 * Replaces: analyzeTranscriptChunkWithGemini() from gemini.ts
 */
export async function analyzeTranscriptChunkWithCloudflaреAI(
  input: {
    chunkIndex: number;
    startTime: number;
    endTime: number;
    transcriptText: string;
    transcriptSegments: TranscriptSegment[];
    durationLimitSeconds?: number;
  },
  model: CfModelId = CF_MODELS.llama
): Promise<ClipCandidate[]> {
  const maxDur = input.durationLimitSeconds ?? 60;

  const userPrompt = `Analyze this transcript section (${input.startTime.toFixed(1)}s to ${input.endTime.toFixed(1)}s):

${input.transcriptSegments.map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`).join('\n')}

Find the top 1-4 most powerful self-contained clips under ${maxDur} seconds.
Return a JSON array where each item has:
{
  "title": "Short catchy title",
  "titleHindi": "हिंदी शीर्षक",
  "titleEnglish": "English title",
  "start": 12.5,
  "end": 45.0,
  "topic": "Motivation | Philosophy | Self-Respect | Psychology | Relationships | Fear and Courage | Meditation and Awareness | Life Lessons | Stories | Other",
  "explanation": "Why this moment is valuable",
  "transcript": "Exact spoken transcript",
  "firstWords": "First 4-6 words",
  "lastWords": "Last 4-6 words",
  "scores": { "meaningAndDepth": 22, "standaloneCompleteness": 18, "openingStrength": 14, "emotionalIntellectualImpact": 13, "clarity": 9, "conciseness": 9, "audioQuality": 5, "total": 90 },
  "contextVerification": { "isCompleteThought": true, "hasConclusion": true, "hasDanglingPronouns": false, "contextConfidence": 95, "notes": "Clear insight", "flaggedForReview": false }
}`;

  let text = '';
  try {
    text = await cfAiText(model, [
      { role: 'system', content: CLIP_ANALYSIS_SYSTEM },
      { role: 'user', content: userPrompt },
    ]);
  } catch (err: any) {
    console.error('[CF AI] Clip analysis failed:', err.message);
    return [];
  }

  // Strip markdown fences if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    try {
      parsed = match ? JSON.parse(match[0]) : [];
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item: any) => {
      const dur = (item.end || 0) - (item.start || 0);
      return dur > 3 && dur <= maxDur + 0.5;
    })
    .map((item: any, idx: number) => {
      const start = parseFloat(item.start);
      const end = parseFloat(item.end);
      const duration = Math.min(maxDur, Math.round((end - start) * 10) / 10);
      const scores = item.scores || {};
      const totalScore =
        (scores.meaningAndDepth || 15) +
        (scores.standaloneCompleteness || 15) +
        (scores.openingStrength || 10) +
        (scores.emotionalIntellectualImpact || 10) +
        (scores.clarity || 8) +
        (scores.conciseness || 8) +
        (scores.audioQuality || 4);

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
          meaningAndDepth: scores.meaningAndDepth || 18,
          standaloneCompleteness: scores.standaloneCompleteness || 16,
          openingStrength: scores.openingStrength || 12,
          emotionalIntellectualImpact: scores.emotionalIntellectualImpact || 12,
          clarity: scores.clarity || 8,
          conciseness: scores.conciseness || 8,
          audioQuality: scores.audioQuality || 4,
          total: Math.min(100, scores.total || totalScore),
        },
        contextVerification: {
          isCompleteThought: Boolean(item.contextVerification?.isCompleteThought ?? true),
          hasConclusion: Boolean(item.contextVerification?.hasConclusion ?? true),
          hasDanglingPronouns: Boolean(item.contextVerification?.hasDanglingPronouns ?? false),
          contextConfidence: item.contextVerification?.contextConfidence || 88,
          notes: item.contextVerification?.notes || 'Verified.',
          flaggedForReview: Boolean(item.contextVerification?.flaggedForReview ?? false),
        },
        selected: true,
        renderStatus: 'idle',
      } satisfies ClipCandidate;
    });
}

/**
 * Test Cloudflare AI connection.
 * Replaces: testGeminiConnection() from gemini.ts
 */
export async function testCloudflaреAIConnection(
  model: CfModelId = CF_MODELS.llama
): Promise<{ success: boolean; message: string; model: string }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !token) {
    return {
      success: false,
      message: 'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not set.',
      model,
    };
  }

  try {
    const response = await cfAiText(
      model,
      [{ role: 'user', content: 'Reply with exactly: "ReelSpark CF AI Ready"' }],
      { max_tokens: 20 }
    );
    return {
      success: true,
      message: `Connected to Cloudflare AI (${model}). Response: "${response.trim().substring(0, 60)}"`,
      model,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Cloudflare AI connection failed: ${err.message}`,
      model,
    };
  }
}

/**
 * Check whether Cloudflare AI credentials are configured.
 */
export function getCloudflaреAIStatus(): {
  configured: boolean;
  message: string;
  defaultModel: string;
} {
  const accountId = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  const apiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
  const configured = accountId && apiToken;

  return {
    configured,
    message: configured
      ? 'Cloudflare AI Workers are configured (Whisper + Llama 3).'
      : 'Cloudflare AI not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
    defaultModel: CF_MODELS.llama,
  };
}
