export function selectNextUmbraCanvasPendingGeneration<T extends { jobId: string }>(
  pending: readonly T[],
  settledJobId: string,
): T | null {
  return [...pending].reverse().find((entry) => entry.jobId !== settledJobId) || null;
}
