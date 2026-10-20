import { normalizeMossPromptField, type MossPromptField } from './mossPromptFields';
import { parseFlux3LayoutRegions, type Flux3LayoutRegion } from './flux3Edit';

/** MOSS uses output pixels relative to the image centre, ordered yxyx. */
export function compileMossLayoutPrompt(caption: string, regions: Flux3LayoutRegion[],
  frame: { x: number; y: number; width: number; height: number }, output: { width: number; height: number }) {
  if (![frame.x, frame.y, frame.width, frame.height, output.width, output.height].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0 || output.width <= 0 || output.height <= 0) {
    throw new Error('Invalid MOSS layout generation frame.');
  }
  let document: Record<string, any> = { summary: { canvas: 'single', caption }, items: [] };
  if (caption.trim().startsWith('{')) {
    try { document = JSON.parse(caption); } catch { throw new Error('The MOSS JSON prompt is invalid.'); }
    if (!document || typeof document !== 'object' || !document.summary || typeof document.summary.caption !== 'string'
      || !Array.isArray(document.items) || document.items.some((item: any) => !item || typeof item !== 'object' || typeof item.label !== 'string' || typeof item.caption !== 'string')) {
      throw new Error('MOSS JSON prompts need a summary caption and labeled items.');
    }
    if (document.items.some((item: any) => item.bbox) && (document.bbox_format !== 'yxyx' || document.bbox_coord_space !== 'abs_centralized')) {
      throw new Error('Existing JSON boxes must use abs_centralized yxyx coordinates.');
    }
  }
  document.items.forEach((item: Record<string, unknown>, index: number) => {
    if (item.bbox === undefined) return;
    const box = item.bbox;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(value => typeof value === 'number' && Number.isFinite(value))
      || box[0] >= box[2] || box[1] >= box[3]
      || box[0] < -output.height / 2 || box[2] > output.height / 2 || box[1] < -output.width / 2 || box[3] > output.width / 2) {
      throw new Error(`JSON item ${index + 1} needs a valid yxyx box inside the output image.`);
    }
  });
  const items = document.items.map((item: Record<string, unknown>) => ({ ...item }));
  const linkedItems = new Set<number>();
  parseFlux3LayoutRegions(regions).forEach((region, index) => {
    const x = (region.x - frame.x) / frame.width;
    const y = (region.y - frame.y) / frame.height;
    const right = x + region.width / frame.width;
    const bottom = y + region.height / frame.height;
    if (x < 0 || y < 0 || right > 1.000001 || bottom > 1.000001) throw new Error(`Layout box ${index + 1} must fit inside the generation box.`);
    const bbox = [Math.round(y * output.height - output.height / 2), Math.round(x * output.width - output.width / 2),
      Math.round(Math.min(1, bottom) * output.height - output.height / 2), Math.round(Math.min(1, right) * output.width - output.width / 2)];
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) throw new Error(`Layout box ${index + 1} is too small for the output resolution.`);
    if (region.promptItemIndex === undefined && region.label === 'text' && !region.text?.trim()) throw new Error(`Text box ${index + 1} needs the words to render.`);
    if (region.promptItemIndex !== undefined) {
      const item = items[region.promptItemIndex];
      if (!item || linkedItems.has(region.promptItemIndex)) throw new Error(`Layout box ${index + 1} needs a unique JSON prompt field.`);
      if (item.label === 'text' && !String(item.text || '').trim()) throw new Error(`Text box ${index + 1} needs the words to render.`);
      linkedItems.add(region.promptItemIndex);
      item.bbox = bbox;
    } else {
      if (region.promptFieldId) throw new Error(`Layout box ${index + 1} has an unresolved prompt field.`);
      items.push({ label: region.label || 'object', caption: region.description,
        ...(region.label === 'text' ? { text: region.text } : {}), bbox });
    }
  });
  return JSON.stringify({ ...document, items,
    bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' });
}

/** Resolve stable field IDs at submission time so reordering fields cannot move a box to another subject. */
export function bindMossLayoutFields(regions: Flux3LayoutRegion[], fields: { id: string; text: string; moss?: MossPromptField }[]): Flux3LayoutRegion[] {
  const items = fields.filter(field => {
    const config = normalizeMossPromptField(field.moss);
    return fields.some(entry => entry.moss?.enabled) && config?.purpose === 'item' && (field.text.trim() || config.text.trim());
  });
  return regions.map(region => {
    if (!region.promptFieldId) {
      return { ...region, promptItemIndex: undefined };
    }
    const index = items.findIndex(field => field.id === region.promptFieldId);
    if (index < 0) throw new Error('A layout box references a removed, empty, or non-item JSON field. Choose another field or unlink the box.');
    return { ...region, promptItemIndex: index };
  });
}
