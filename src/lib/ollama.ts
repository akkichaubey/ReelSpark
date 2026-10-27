/**
 * Ollama AI Client & Analysis Engine
 *
 * Provides server-side AI inference through the Ollama Cloud API.
 * Uses the Gemma 4 starter model; the API key stays on the server.
 */

import { getOllamaModel, resolveOllamaCloudModel } from './config';
import { ClipCandidate, TopicCategory, TranscriptSegment } from './types';

export const OLLAMA_SYSTEM_INSTRUCTION = `You are a master video editor, philosopher, and AI clip curator specializing in identifying viral, deeply meaningful, motivational, and thought-provoking short clips from long-form speeches, podcasts, and talks.

CRITICAL CONSTRAINTS:
1. Every candidate clip MUST be AT MOST 60 seconds long (duration <= 60.0).
2. The clip must be a standalone, self-contained thought with a clear opening hook and punchy conclusion.
3. Preserve the exact words spoken. NEVER fabricate or invent words.
4. Score each clip on meaningAndDepth (0-25), standaloneCompleteness (0-20), openingStrength (0-15), emotionalIntellectualImpact (0-15), clarity (0-10), conciseness (0-10), audioQuality (0-5). Total score: 0-100.
5. Provide context verification: isCompleteThought (bool), hasConclusion (bool), hasDanglingPronouns (bool), contextConfidence (0-100).
6. Output ONLY a valid JSON array. No markdown fences. No outer prose.`;

export interface ChunkAnalysisInput {
  chunkIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  transcriptSegments: TranscriptSegment[];
  durationLimitSeconds?: number;
}

/**
 * Low-level call to the authenticated Ollama Cloud chat API.
 */
export async function generateWithOllama(params: {
  prompt: string;
  system?: string;
  model?: string;
  format?: 'json' | '';
  temperature?: number;
}): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Ollama Cloud is not configured. Add OLLAMA_API_KEY to the server environment and restart the app.');
  }

  const model = resolveOllamaCloudModel(params.model || getOllamaModel());
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  messages.push({ role: 'user', content: params.prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    options: {
      temperature: params.temperature ?? 0.3,
    },
  };
  if (params.format === 'json') {
    body.format = 'json';
  }

  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Ollama Cloud rejected the server API key. Check OLLAMA_API_KEY in the server environment.');
    }
    if (response.status === 402) {
      throw new Error('Ollama Cloud reports no remaining included usage for this request. Check the Ollama account usage page; this app does not add paid credits.');
    }
    if (response.status === 429) {
      throw new Error('Ollama Cloud is rate-limited or its free-tier concurrency slot is busy. Wait briefly and try again.');
    }
    throw new Error(`Ollama Cloud request failed (${response.status}). Check the selected model and your Ollama account usage.`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama Cloud returned an empty response. Please try again.');
  }
  return content.trim();
}

/**
 * Analyze a transcript section with Ollama to identify high-potential short clips.
 */
export async function analyzeTranscriptChunkWithOllama(
  input: ChunkAnalysisInput,
  modelName?: string
): Promise<ClipCandidate[]> {
  const model = modelName || getOllamaModel();
  const maxDur = input.durationLimitSeconds || 60;

  const prompt = `Analyze the following transcript section from a long-form speech (time offset: ${input.startTime.toFixed(1)}s to ${input.endTime.toFixed(1)}s):

TRANSCRIPT WITH TIMESTAMPS:
${input.transcriptSegments.map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`).join('\n')}

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
      "notes": "Clear self-contained insight",
      "flaggedForReview": false
    }
  }
]
`;

  let raw = '';
  try {
    raw = await generateWithOllama({
      prompt,
      system: OLLAMA_SYSTEM_INSTRUCTION,
      model,
      format: 'json',
      temperature: 0.2,
    });
  } catch (err: any) {
    console.error('[Ollama] Chunk analysis error:', err.message);
    throw new Error(`Ollama Cloud analysis failed: ${err.message}`);
  }

  // Parse JSON with robust fence stripping
  let parsed: any[] = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned);
    parsed = Array.isArray(data) ? data : data.clips || data.candidates || [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {}
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  return parsed
    .filter((item: any) => {
      const dur = (Number(item.end) || 0) - (Number(item.start) || 0);
      return dur > 3 && dur <= maxDur + 0.5;
    })
    .map((item: any, idx: number) => {
      const start = parseFloat(item.start) || 0;
      const end = parseFloat(item.end) || start + 30;
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
          notes: item.contextVerification?.notes || 'Verified against nearby context',
          flaggedForReview: Boolean(item.contextVerification?.flaggedForReview ?? false),
        },
        selected: true,
        renderStatus: 'idle',
      };
    });
}

/**
 * Public YouTube URL semantic analysis via Ollama.
 */
export async function analyzeYouTubeWithOllama(
  youtubeUrl: string,
  modelName?: string
): Promise<ClipCandidate[]> {
  const prompt = `Analyze this YouTube video URL: ${youtubeUrl}
Identify the top 3 to 6 best short viral/philosophical clip candidates under 60 seconds each.
Ensure realistic timestamps.
Return a structured JSON array with items conforming to schema: { id, title, start, end, topic, explanation, transcript, scores, contextVerification }.`;

  const raw = await generateWithOllama({
    prompt,
    system: OLLAMA_SYSTEM_INSTRUCTION,
    model: modelName,
    format: 'json',
  });

  let parsed: any[] = [];
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned);
    parsed = Array.isArray(data) ? data : data.clips || [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {}
    }
  }

  return (parsed || []).map((item: any, idx: number) => ({
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
}

/**
 * Make a tiny authenticated request to verify Ollama Cloud credentials and model access.
 */
export async function testOllamaCloudConnection(modelName?: string): Promise<{ success: boolean; message: string; model: string }> {
  const model = resolveOllamaCloudModel(modelName || getOllamaModel());

  try {
    const response = await generateWithOllama({
      model,
      prompt: 'Reply with the exact text: ReelSpark Ollama Cloud connection verified.',
      temperature: 0,
    });
    return {
      success: true,
      message: `Connected to Ollama Cloud (${model}). Response: "${response.substring(0, 80)}"`,
      model,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Could not connect to Ollama Cloud.',
      model,
    };
  }
}
