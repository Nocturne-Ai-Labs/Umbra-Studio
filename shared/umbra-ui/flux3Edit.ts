export interface Flux3LayoutRegion {
  id: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function bindFlux3LayoutPrompt(graph: Record<string, any>, consumer: any, prompt: string): boolean {
  const reference = consumer?.inputs?.prompt_text;
  const layout = Array.isArray(reference) && reference[1] === 0 ? graph[String(reference[0])] : null;
  if (layout?.class_type !== 'Flux3LayoutPrompt' || layout?._meta?.umbra_role !== 'edit_layout_prompt') return false;
  layout.inputs.prompt = prompt;
  // ComfyUI reserves bare arrays for node links, including empty arrays.
  const elements = layout.inputs.element;
  if (Array.isArray(elements) && !(elements.length === 2 && typeof elements[0] === 'string' && Number.isInteger(elements[1]))) {
    layout.inputs.element = { __value__: elements };
  }
  return true;
}

export function parseFlux3LayoutRegions(value: unknown): Flux3LayoutRegion[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid layout region list.');
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid layout region.');
    const region = raw as Flux3LayoutRegion;
    const id = String(region.id || '');
    if (!/^[\w-]{1,160}$/.test(id) || ids.has(id)) throw new Error('Layout region IDs must be unique.');
    ids.add(id);
    if (typeof region.description !== 'string' || region.description.length > 10_000) throw new Error('Invalid layout description.');
    if (![region.x, region.y, region.width, region.height].every((n) => typeof n === 'number' && Number.isFinite(n))
      || region.width <= 0 || region.height <= 0) throw new Error('Layout regions need finite coordinates and positive dimensions.');
    return { id, description: region.description, x: region.x, y: region.y, width: region.width, height: region.height };
  });
}

// ComfyUI's FLUX3 boxes are [ymin, xmin, ymax, xmax], normalized to 0..1000.
// Reject boxes outside the generation region rather than moving them silently.
export function flux3LayoutElements(regions: Flux3LayoutRegion[], frame: { x: number; y: number; width: number; height: number }) {
  if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) {
    throw new Error('Invalid layout generation frame.');
  }
  return parseFlux3LayoutRegions(regions).map((region, index) => {
    const x = (region.x - frame.x) / frame.width;
    const y = (region.y - frame.y) / frame.height;
    const right = x + region.width / frame.width;
    const bottom = y + region.height / frame.height;
    if (x < 0 || y < 0 || right > 1.000001 || bottom > 1.000001) throw new Error(`Layout box ${index + 1} must fit inside the generation box.`);
    const bbox = [y, x, bottom, right].map((n) => Math.max(0, Math.min(1000, Math.round(n * 1000))));
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) throw new Error(`Layout box ${index + 1} is too small for FLUX3 layout coordinates.`);
    return { bbox, desc: region.description };
  });
}

export function applyFlux3References(graph: Record<string, any>, sourceId: string, references: string[]) {
  if (references.length > 9) throw new Error('FLUX3 accepts nine additional references plus the editable image.');
  const sink = Object.values(graph).find((node) => node?._meta?.umbra_role === 'inpaint_reference_sink');
  if (sink?.class_type !== 'ReferenceMultiLatent' || sink?._meta?.umbra_reference_method !== 'flux3_reference') {
    throw new Error('FLUX3 requires its native ReferenceMultiLatent reference sink.');
  }
  const inputs = sink.inputs;
  if (!Array.isArray(inputs?.['images.image0']) || inputs['images.image0'][0] !== sourceId
    || inputs['images.image0'][1] !== 0 || !inputs.positive || !inputs.negative || !inputs.vae) {
    throw new Error('FLUX3 must preserve its source, VAE and both conditioning connections.');
  }
  for (const key of Object.keys(inputs)) if (/^images\.image\d+$/.test(key) && key !== 'images.image0') delete inputs[key];
  references.forEach((id, index) => { inputs[`images.image${index + 1}`] = [id, 0]; });
}

export function removeFlux3BlankReference(graph: Record<string, any>) {
  const entry = Object.entries(graph).find(([, node]) => node?.class_type === 'ReferenceMultiLatent'
    && node?._meta?.umbra_reference_method === 'flux3_reference');
  if (!entry) return;
  const [id, node] = entry;
  const keys = Object.keys(node.inputs).filter((key) => /^images\.image\d+$/.test(key))
    .sort((a, b) => Number(a.slice(12)) - Number(b.slice(12)));
  const references = keys.filter((key) => key !== 'images.image0').map((key) => node.inputs[key]);
  for (const key of keys) delete node.inputs[key];
  if (references.length) {
    references.forEach((reference, index) => { node.inputs[`images.image${index}`] = reference; });
    return;
  }
  for (const target of Object.values(graph)) {
    for (const [key, value] of Object.entries(target.inputs || {})) {
      if (!Array.isArray(value) || value[0] !== id) continue;
      if (value[1] !== 0 && value[1] !== 1) throw new Error('FLUX3 source-free generation requires an independent empty output latent.');
      target.inputs[key] = value[1] === 0 ? node.inputs.positive : node.inputs.negative;
    }
  }
  delete graph[id];
}
