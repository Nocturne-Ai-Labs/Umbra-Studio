export interface MediaFileRevisionStats {
  mtimeMs: number;
  size: number;
  ctimeMs?: number;
  birthtimeMs?: number;
  ino?: number;
}

export function mediaFileRevision(stats: MediaFileRevisionStats): string {
  const number = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
  // Copy tools can preserve modification time and size when replacing content.
  // Keep timestamp precision and include change time and filesystem identity.
  return `m${number(stats.mtimeMs)}-c${number(stats.ctimeMs)}-b${number(stats.birthtimeMs)}-s${number(stats.size)}-i${number(stats.ino)}`;
}
