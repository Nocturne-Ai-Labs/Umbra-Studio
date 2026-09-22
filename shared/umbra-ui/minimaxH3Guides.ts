export interface MiniMaxH3Guide {
  id: string;
  kind: 'image' | 'audio';
  sourcePath: string;
  sourceName: string;
  frameIndex: number;
}

export function normalizeMiniMaxH3Guides(raw: unknown): MiniMaxH3Guide[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  return raw.map((value, index) => {
    const guide = value && typeof value === 'object' ? value : {};
    const frame = Number(guide.frameIndex ?? 0);
    let id = String(guide.id || `h3-guide-${index + 1}`);
    while (ids.has(id)) id += '_';
    ids.add(id);
    return {
      id,
      kind: guide.kind === 'audio' ? 'audio' : 'image',
      sourcePath: String(guide.sourcePath || '').trim(),
      sourceName: String(guide.sourceName || '').trim().replace(/\\/g, '/'),
      frameIndex: Number.isFinite(frame) ? Math.round(frame) : 0,
    };
  });
}

export function miniMaxH3GuideIssue(guides: MiniMaxH3Guide[], frames: number, referenceMode = false): string {
  if (!guides.length) return '';
  if (referenceMode) return 'Timed guides require Text to Video or Image to Video. Remove the guides to use Reference to Video.';
  if (guides.length > 16) return 'Use at most 16 timed guides.';
  const occupied = new Set<string>();
  for (const [index, guide] of guides.entries()) {
    if (!guide.sourcePath && !guide.sourceName) return `Choose a source for timed guide ${index + 1}.`;
    const frame = guide.frameIndex < 0 ? frames + guide.frameIndex : guide.frameIndex;
    if (!Number.isInteger(frame) || frame < 0 || frame >= frames) return `Timed guide ${index + 1} must fall within the ${frames}-frame clip.`;
    const key = `${guide.kind}:${frame}`;
    if (occupied.has(key)) return `Only one ${guide.kind} guide can start at frame ${frame}.`;
    occupied.add(key);
  }
  return '';
}
