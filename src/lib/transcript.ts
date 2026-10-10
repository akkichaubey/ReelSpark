import { SearchMatch, TimelineCoverage, TranscriptSegment } from './types';

export interface TranscriptChunk {
  index: number;
  startTime: number;
  endTime: number;
  segments: TranscriptSegment[];
  text: string;
}

/**
 * Split a full timeline transcript into overlapping chunks for complete video understanding.
 * Default: 180 seconds window (3 minutes) with 30 seconds overlap.
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  windowSeconds = 180,
  overlapSeconds = 30
): TranscriptChunk[] {
  if (segments.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  const maxTime = Math.max(...segments.map(s => s.end));
  let currentStart = 0;
  let chunkIdx = 0;

  while (currentStart < maxTime) {
    const currentEnd = currentStart + windowSeconds;
    // Find all segments in this window
    const chunkSegments = segments.filter(
      s => s.end > currentStart && s.start < currentEnd
    );

    if (chunkSegments.length > 0) {
      chunks.push({
        index: chunkIdx++,
        startTime: currentStart,
        endTime: Math.min(currentEnd, maxTime),
        segments: chunkSegments,
        text: chunkSegments.map(s => s.text).join(' '),
      });
    }

    currentStart += windowSeconds - overlapSeconds;
  }

  return chunks;
}

/**
 * Compute the timeline coverage of analyzed ranges.
 */
export function calculateTimelineCoverage(
  analyzedRanges: Array<[number, number]>,
  totalDuration: number
): TimelineCoverage {
  if (totalDuration <= 0) {
    return {
      analyzedSeconds: 0,
      totalSeconds: 0,
      coveragePercent: 0,
      ranges: [],
    };
  }

  // Merge overlapping ranges
  const sorted = [...analyzedRanges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];

  for (const range of sorted) {
    if (merged.length === 0) {
      merged.push([range[0], range[1]]);
    } else {
      const prev = merged[merged.length - 1];
      if (range[0] <= prev[1]) {
        prev[1] = Math.max(prev[1], range[1]);
      } else {
        merged.push([range[0], range[1]]);
      }
    }
  }

  let totalAnalyzed = 0;
  for (const [start, end] of merged) {
    totalAnalyzed += Math.max(0, Math.min(totalDuration, end) - Math.max(0, start));
  }

  const coveragePercent = Math.min(100, Math.round((totalAnalyzed / totalDuration) * 100));

  return {
    analyzedSeconds: Math.round(totalAnalyzed * 10) / 10,
    totalSeconds: Math.round(totalDuration * 10) / 10,
    coveragePercent,
    ranges: merged,
  };
}

/**
 * Perform semantic & keyword search across the complete transcript.
 * Supports queries like "Find the strongest moments where Osho explains fear and self-respect".
 */
export function searchTranscript(
  transcript: TranscriptSegment[],
  query: string
): SearchMatch[] {
  if (!query || query.trim().length === 0 || transcript.length === 0) {
    return [];
  }

  const cleanQuery = query.toLowerCase().trim();
  const stopWords = new Set(['find', 'the', 'strongest', 'moments', 'where', 'explains', 'about', 'and', 'or', 'in', 'of', 'to', 'a', 'an', 'osho']);
  const keywords = cleanQuery
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2 && !stopWords.has(w));

  const results: SearchMatch[] = [];

  // Search per segment for precise timestamps
  for (let i = 0; i < transcript.length; i++) {
    const seg = transcript[i];
    const lowerText = seg.text.toLowerCase();

    let matches = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        matches++;
      }
    }

    if (matches > 0 || lowerText.includes(cleanQuery)) {
      const relevanceScore = Math.min(
        100,
        Math.round((matches / (keywords.length || 1)) * 80 + (lowerText.includes(cleanQuery) ? 20 : 0))
      );

      results.push({
        segmentId: seg.id,
        start: seg.start,
        end: seg.end,
        snippet: seg.text,
        relevanceScore,
        contextNote: `Matched ${matches} key concept(s): ${keywords.filter(k => lowerText.includes(k)).join(', ')}`,
      });
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);
}

/**
 * Generate a realistic philosophical/motivational demo transcript
 * for speeches (such as Osho) when running without an external STT service.
 */
export function generateDemoSpeechTranscript(totalDurationSeconds: number): TranscriptSegment[] {
  const oshoExcerpts = [
    "Drop all fear. Fear is always about the future; fear never exists in the present moment.",
    "The moment you are in the present, fear disappears because death is not here right now.",
    "Be a light unto yourself. Do not follow others; the crowd has never reached the truth.",
    "Self-respect is not ego. Ego is demanding respect from others, whereas self-respect is knowing your own divine nature.",
    "Meditation is simply the art of being aware without any judgment.",
    "When you observe your thoughts without saying 'this is good' or 'this is bad', a deep silence arises.",
    "Love is not a relationship; love is a state of your being. You don't fall in love, you arise in love.",
    "Courage is not the absence of fear. Courage is moving forward into the unknown despite the trembling.",
    "Live each moment with totality, as if this is your very first and very last breath.",
    "The mind is a wonderful servant, but a catastrophic master.",
    "Listen to your own inner voice. The society wants you to be a robot, but you are a living song.",
    "Celebration is my message. Don't weep for the past, celebrate the gift of consciousness.",
  ];

  const segments: TranscriptSegment[] = [];
  const duration = Math.max(30, totalDurationSeconds);
  let currentTime = 0;
  let quoteIndex = 0;

  while (currentTime < duration - 4) {
    const quote = oshoExcerpts[quoteIndex % oshoExcerpts.length];
    const words = quote.split(' ').length;
    // speech rate approx 2.2 words per second for deliberate speech
    const segDuration = Math.min(12, Math.max(3.5, words / 2.2));
    const nextTime = Math.min(duration, currentTime + segDuration);

    segments.push({
      id: `seg_${segments.length + 1}`,
      start: Math.round(currentTime * 10) / 10,
      end: Math.round(nextTime * 10) / 10,
      text: quote,
      speaker: 'Speaker',
      confidence: 0.98,
    });

    currentTime = nextTime + 1.2; // brief pause between thoughts
    quoteIndex++;
  }

  return segments;
}
