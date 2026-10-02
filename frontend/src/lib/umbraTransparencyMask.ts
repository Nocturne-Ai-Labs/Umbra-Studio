export type TransparencyPoint = [number, number];
export interface TransparencyStroke {
  mode: 'erase' | 'restore';
  points: TransparencyPoint[];
  radius: number;
  hardness: number;
  strength: number;
}
export interface TransparencyMask {
  base: { width: number; height: number; alpha: Uint8ClampedArray } | null;
  strokes: TransparencyStroke[];
}
export interface TransparencyHistory {
  present: TransparencyMask;
  undo: TransparencyMask[];
  redo: TransparencyMask[];
  revision: number;
}
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const emptyTransparencyMask = (): TransparencyMask => ({ base: null, strokes: [] });
export const createTransparencyHistory = (): TransparencyHistory => ({ present: emptyTransparencyMask(), undo: [], redo: [], revision: 0 });
export function editTransparencyHistory(history: TransparencyHistory, present: TransparencyMask): TransparencyHistory {
  return { present, undo: [...history.undo.slice(-39), history.present], redo: [], revision: history.revision + 1 };
}
export function moveTransparencyHistory(history: TransparencyHistory, redo: boolean): TransparencyHistory {
  const from = redo ? history.redo : history.undo;
  if (!from.length) return history;
  return {
    present: from[from.length - 1], revision: history.revision + 1,
    undo: redo ? [...history.undo, history.present] : from.slice(0, -1),
    redo: redo ? from.slice(0, -1) : [...history.redo, history.present],
  };
}

// Each gesture blends toward erase/restore once per pixel, independent of the
// pointer event frequency. Source alpha is immutable and composed separately.
export function applyTransparencyStroke(alpha: Uint8ClampedArray, width: number, height: number, stroke: TransparencyStroke): void {
  if (!stroke.points.length) return;
  const radius = Math.max(0.5, stroke.radius * Math.min(width, height));
  const inner = radius * clamp(stroke.hardness);
  const coverage = new Map<number, number>();
  const dab = (x: number, y: number) => {
    for (let py = Math.max(0, Math.floor(y - radius)); py < Math.min(height, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(width, Math.ceil(x + radius)); px++) {
        const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        if (distance >= radius) continue;
        const amount = distance <= inner ? 1 : (radius - distance) / (radius - inner);
        const index = py * width + px;
        if (amount > (coverage.get(index) || 0)) coverage.set(index, amount);
      }
    }
  };
  let previous = stroke.points[0];
  dab(clamp(previous[0]) * width, clamp(previous[1]) * height);
  for (const next of stroke.points.slice(1)) {
    const dx = (clamp(next[0]) - clamp(previous[0])) * width;
    const dy = (clamp(next[1]) - clamp(previous[1])) * height;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(0.5, radius / 4)));
    for (let step = 1; step <= steps; step++) dab(clamp(previous[0]) * width + dx * step / steps, clamp(previous[1]) * height + dy * step / steps);
    previous = next;
  }
  const target = stroke.mode === 'erase' ? 0 : 255;
  for (const [index, amount] of coverage) alpha[index] += (target - alpha[index]) * amount * clamp(stroke.strength);
}
export function renderTransparencyMask(mask: TransparencyMask, width: number, height: number): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  if (mask.base) {
    const base = mask.base;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      alpha[y * width + x] = base.alpha[Math.min(base.height - 1, Math.floor(y * base.height / height)) * base.width + Math.min(base.width - 1, Math.floor(x * base.width / width))];
    }
  } else alpha.fill(255);
  for (const stroke of mask.strokes) applyTransparencyStroke(alpha, width, height, stroke);
  return alpha;
}
export function composeTransparencyPixels(source: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
  if (source.length !== mask.length * 4) throw new Error('The transparency mask does not match the original image.');
  const output = source.slice();
  for (let pixel = 0; pixel < mask.length; pixel++) output[pixel * 4 + 3] = Math.round(source[pixel * 4 + 3] * mask[pixel] / 255);
  return output;
}
export function transparencyExportName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'image'}-transparent.png`;
}
