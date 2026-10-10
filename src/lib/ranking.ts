import { ClipCandidate, TopicCategory } from './types';

/**
 * Filter and deduplicate candidates based on duration settings and timeline overlap.
 */
export function processCandidates(
  candidates: ClipCandidate[],
  durationSetting: '15' | '30' | '45' | '60' | 'auto',
  maxOverlapRatio = 0.65
): ClipCandidate[] {
  const maxSeconds = durationSetting === 'auto' ? 60 : parseInt(durationSetting, 10);

  // 1. Strictly enforce duration cap
  const filtered = candidates.filter(c => c.duration <= maxSeconds + 0.5 && c.duration >= 3.0);

  // 2. Sort candidates descending by total score
  const sorted = [...filtered].sort((a, b) => b.scores.total - a.scores.total);

  // 3. Remove duplicate or substantially overlapping candidates
  const accepted: ClipCandidate[] = [];

  for (const candidate of sorted) {
    let isOverlap = false;

    for (const existing of accepted) {
      const overlapStart = Math.max(candidate.start, existing.start);
      const overlapEnd = Math.min(candidate.end, existing.end);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);

      const smallerDuration = Math.min(candidate.duration, existing.duration);
      const overlapRatio = smallerDuration > 0 ? overlapDuration / smallerDuration : 0;

      if (overlapRatio > maxOverlapRatio) {
        isOverlap = true;
        break;
      }
    }

    if (!isOverlap) {
      accepted.push(candidate);
    }
  }

  // Return candidates ordered by highest score
  return accepted;
}

export type SortField = 'score' | 'topic' | 'duration' | 'timestamp' | 'confidence';

/**
 * Sort candidates by user-selected criteria.
 */
export function sortCandidates(
  candidates: ClipCandidate[],
  sortBy: SortField = 'score',
  ascending = false
): ClipCandidate[] {
  const sorted = [...candidates];

  sorted.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'score':
        comparison = b.scores.total - a.scores.total;
        break;
      case 'confidence':
        comparison = b.contextVerification.contextConfidence - a.contextVerification.contextConfidence;
        break;
      case 'duration':
        comparison = b.duration - a.duration;
        break;
      case 'timestamp':
        comparison = a.start - b.start;
        break;
      case 'topic':
        comparison = a.topic.localeCompare(b.topic);
        break;
      default:
        comparison = b.scores.total - a.scores.total;
    }
    return ascending ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Filter candidates by topic category.
 */
export function filterCandidatesByTopic(
  candidates: ClipCandidate[],
  topic: TopicCategory | 'All'
): ClipCandidate[] {
  if (topic === 'All') return candidates;
  return candidates.filter(c => c.topic === topic);
}
