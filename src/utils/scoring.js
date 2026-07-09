/**
 * Points = Max(500, 1000 * (1 - (responseTime / (2 * totalTime))))
 * Only awarded when the answer is correct; wrong answers score 0.
 * All time values must be in the same unit (this codebase uses ms).
 */
export function calculatePoints({ isCorrect, responseTimeMs, totalTimeMs }) {
  if (!isCorrect) return 0;

  const clampedResponseTime = Math.min(Math.max(responseTimeMs, 0), totalTimeMs);
  const raw = 1000 * (1 - clampedResponseTime / (2 * totalTimeMs));

  return Math.round(Math.max(500, raw));
}
