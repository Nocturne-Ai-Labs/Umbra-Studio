export function getUmbraCanvasPinnedCopyFailure(payload: unknown, expectedCount: number): string {
  const response = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const reportedCount = Number(response.copied);
  const copied = Number.isSafeInteger(reportedCount) && reportedCount >= 0 ? reportedCount : 0;
  const failures = (Array.isArray(response.results) ? response.results : [])
    .filter((result): result is Record<string, unknown> => !!result && typeof result === 'object')
    .filter((result) => result.success === false);
  if (copied === expectedCount && failures.length === 0) return '';
  const detail = failures.map((result) => String(result.error || '').trim()).find(Boolean)?.slice(0, 200);
  return `Saved ${copied} of ${expectedCount} staged samples to the pinned Gallery folder. Some copies failed.${detail ? ` ${detail}` : ''}`;
}
