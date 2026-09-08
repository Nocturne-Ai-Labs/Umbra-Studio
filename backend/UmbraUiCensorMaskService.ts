import sharp from 'sharp';
import type { UmbraUiCensorRegion } from './UmbraUiMediaToolsService';

/** Union in source-image coordinates before rendering, so overlaps share one mosaic grid. */
export async function unionCensorRegions(width: number, height: number, regions: UmbraUiCensorRegion[], edgePixels = 0): Promise<UmbraUiCensorRegion | null> {
  if (!regions.length) return null;
  let union: Buffer = Buffer.alloc(width * height);
  for (const region of regions) {
    const left = Math.max(0, Math.min(width - 1, Math.round(region.x * width)));
    const top = Math.max(0, Math.min(height - 1, Math.round(region.y * height)));
    const w = Math.max(1, Math.min(width - left, Math.round(region.width * width)));
    const h = Math.max(1, Math.min(height - top, Math.round(region.height * height)));
    const mask = region.maskPngBase64
      ? await sharp(Buffer.from(region.maskPngBase64, 'base64')).resize(w, h, { fit: 'fill', kernel: 'nearest' }).removeAlpha().greyscale().raw().toBuffer()
      : Buffer.alloc(w * h, 255);
    if (!mask.some(value => value > 0)) throw new Error('Censor segmentation returned an empty mask.');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const index = (top + y) * width + left + x;
      union[index] = Math.max(union[index], mask[y * w + x]);
    }
  }
  if (edgePixels > 0) {
    // libvips morphology treats black as foreground; erode expands a white censor mask.
    union = await sharp(union, { raw: { width, height, channels: 1 } }).greyscale().erode(edgePixels).raw().toBuffer();
  }
  return { x: 0, y: 0, width: 1, height: 1,
    maskPngBase64: (await sharp(union, { raw: { width, height, channels: 1 } }).png().toBuffer()).toString('base64') };
}
