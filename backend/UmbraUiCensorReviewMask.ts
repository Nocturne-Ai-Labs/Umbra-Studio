import sharp from 'sharp';
import type { CensorReviewRect, CensorReviewStroke } from '../shared/umbra-ui/censorReview';
import type { UmbraUiCensorRegion } from './UmbraUiMediaToolsService';
import { unionCensorRegions } from './UmbraUiCensorMaskService';

export async function renderCensorReviewMask(
  width: number,
  height: number,
  auto: UmbraUiCensorRegion[],
  rectangles: CensorReviewRect[],
  strokes: CensorReviewStroke[],
): Promise<{ bytes: Buffer; hasCoverage: boolean }> {
  const automatic = await unionCensorRegions(width, height, auto, 3);
  const combined = await unionCensorRegions(width, height, [
    ...(automatic ? [automatic] : []),
    ...rectangles.filter((rect) => rect.enabled),
  ]);
  const base = combined
    ? Buffer.from(combined.maskPngBase64!, 'base64')
    : await sharp({ create: { width, height, channels: 3, background: '#000000' } })
        .png()
        .toBuffer();
  // Only validated numeric geometry is emitted; no user-supplied SVG or resource URLs.
  const paths = strokes
    .map((stroke) => {
      const radius = stroke.radius * Math.min(width, height);
      const color = stroke.erase ? '#000000' : '#ffffff';
      const points = stroke.points.map(([x, y]) => `${x * width},${y * height}`);
      if (points.length === 1)
        return `<circle cx="${stroke.points[0][0] * width}" cy="${stroke.points[0][1] * height}" r="${radius}" fill="${color}"/>`;
      return `<path d="M${points.join(' L')}" fill="none" stroke="${color}" stroke-width="${radius * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const composite = paths
    ? sharp(base).composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths}</svg>`,
          ),
        },
      ])
    : sharp(base);
  const raw = await composite.removeAlpha().greyscale().raw().toBuffer();
  return {
    bytes: await sharp(raw, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer(),
    hasCoverage: raw.some((value) => value > 0),
  };
}

export async function censorReviewOverlayRegions(
  mask: Buffer,
  width: number,
  height: number,
  auto: UmbraUiCensorRegion[],
  rectangles: CensorReviewRect[],
  strokes: CensorReviewStroke[],
): Promise<UmbraUiCensorRegion[]> {
  type Bounds = { left: number; top: number; right: number; bottom: number };
  const boxes: Bounds[] = [];
  const add = (left: number, top: number, right: number, bottom: number) => {
    let box = {
      left: Math.max(0, Math.floor(left)),
      top: Math.max(0, Math.floor(top)),
      right: Math.min(width, Math.ceil(right)),
      bottom: Math.min(height, Math.ceil(bottom)),
    };
    // Overlapping masks get one overlay; separate regions retain their own image placement.
    for (let i = 0; i < boxes.length; ) {
      const other = boxes[i];
      if (
        box.left <= other.right &&
        box.right >= other.left &&
        box.top <= other.bottom &&
        box.bottom >= other.top
      ) {
        box = {
          left: Math.min(box.left, other.left),
          top: Math.min(box.top, other.top),
          right: Math.max(box.right, other.right),
          bottom: Math.max(box.bottom, other.bottom),
        };
        boxes.splice(i, 1);
        i = 0;
      } else i++;
    }
    boxes.push(box);
  };
  for (const r of auto)
    add(r.x * width - 3, r.y * height - 3, (r.x + r.width) * width + 3, (r.y + r.height) * height + 3);
  for (const r of rectangles.filter((r) => r.enabled))
    add(r.x * width, r.y * height, (r.x + r.width) * width, (r.y + r.height) * height);
  for (const stroke of strokes.filter((s) => !s.erase)) {
    let left = 1,
      top = 1,
      right = 0,
      bottom = 0;
    for (const [x, y] of stroke.points) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
    const radius = stroke.radius * Math.min(width, height) + 1;
    add(left * width - radius, top * height - radius, right * width + radius, bottom * height + radius);
  }
  const result: UmbraUiCensorRegion[] = [];
  for (const b of boxes) {
    const w = b.right - b.left,
      h = b.bottom - b.top;
    if (w <= 0 || h <= 0) continue;
    const pixels = await sharp(mask)
      .extract({ left: b.left, top: b.top, width: w, height: h })
      .greyscale()
      .raw()
      .toBuffer();
    if (!pixels.some((value) => value > 0)) continue;
    const cropped = await sharp(pixels, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer();
    result.push({
      x: b.left / width,
      y: b.top / height,
      width: w / width,
      height: h / height,
      maskPngBase64: cropped.toString('base64'),
    });
  }
  return result;
}
