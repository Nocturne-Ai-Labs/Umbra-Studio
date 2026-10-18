import { parseFlux3LayoutRegions, type Flux3LayoutRegion } from './flux3Edit';

/** MOSS uses output pixels relative to the image centre, ordered yxyx. */
export function compileMossLayoutPrompt(caption: string, regions: Flux3LayoutRegion[],
  frame: { x: number; y: number; width: number; height: number }, output: { width: number; height: number }) {
  if (![frame.x, frame.y, frame.width, frame.height, output.width, output.height].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0 || output.width <= 0 || output.height <= 0) {
    throw new Error('Invalid MOSS layout generation frame.');
  }
  const items = parseFlux3LayoutRegions(regions).map((region, index) => {
    const x = (region.x - frame.x) / frame.width;
    const y = (region.y - frame.y) / frame.height;
    const right = x + region.width / frame.width;
    const bottom = y + region.height / frame.height;
    if (x < 0 || y < 0 || right > 1.000001 || bottom > 1.000001) throw new Error(`Layout box ${index + 1} must fit inside the generation box.`);
    const bbox = [Math.round(y * output.height - output.height / 2), Math.round(x * output.width - output.width / 2),
      Math.round(Math.min(1, bottom) * output.height - output.height / 2), Math.round(Math.min(1, right) * output.width - output.width / 2)];
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) throw new Error(`Layout box ${index + 1} is too small for the output resolution.`);
    if (region.label === 'text' && !region.text?.trim()) throw new Error(`Text box ${index + 1} needs the words to render.`);
    return { label: region.label || 'object', caption: region.description,
      ...(region.label === 'text' ? { text: region.text } : {}), bbox };
  });
  return JSON.stringify({ summary: { canvas: 'single', caption }, items,
    bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' });
}
