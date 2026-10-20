/** Native MOSS model patches. Defaults retain Umbra's existing sampling behavior. */
export interface MossSamplingSettings {
  negativeSkip: boolean;
  negativeSkipEnd: number;
  guidance: boolean;
  guidanceScale: number;
  guidanceStart: number;
  guidanceEnd: number;
  spectrum: boolean;
  spectrumCache: 'main_device' | 'cpu';
}

export function normalizeMossSamplingSettings(value: unknown): MossSamplingSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = raw[key] === null || raw[key] === '' ? NaN : Number(raw[key]);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const start = number('guidanceStart', 0.01, 0, 1);
  return {
    negativeSkip: raw.negativeSkip !== false,
    negativeSkipEnd: number('negativeSkipEnd', 1, 0, 1),
    guidance: raw.guidance === true,
    guidanceScale: number('guidanceScale', 1, 0, 10),
    guidanceStart: start,
    guidanceEnd: Math.max(start, number('guidanceEnd', 0.15, 0, 1)),
    spectrum: raw.spectrum === true,
    spectrumCache: raw.spectrumCache === 'cpu' ? 'cpu' : 'main_device',
  };
}

type Graph = Record<string, any>;
const role = 'umbra_moss_sampling';

export function applyMossSamplingSettings(graph: Graph, value: unknown): void {
  if (!value || !Object.values(graph).some(n => n?.class_type === 'CLIPLoader' && n.inputs?.type === 'moss_image')) return;
  const settings = normalizeMossSamplingSettings(value);
  // Unwrap only our own patches, allowing a compiled graph to be edited/reused safely.
  for (const [id, node] of Object.entries(graph).reverse()) {
    if (node?._meta?.umbra_role !== role) continue;
    for (const consumer of Object.values(graph)) for (const [key, input] of Object.entries(consumer?.inputs || {})) {
      if (Array.isArray(input) && input[0] === id && input[1] === 0) consumer.inputs[key] = node.inputs.model;
    }
    delete graph[id];
  }
  const skip = Object.entries(graph).find(([, n]) => n?.class_type === 'SkipLayerGuidanceDiTSimple');
  if (!skip) throw new Error('MOSS sampling controls require the native MOSS pipeline with negative-branch layer skipping.');
  Object.assign(skip[1].inputs, { single_layers: settings.negativeSkip ? '22' : '', double_layers: '', start_percent: 0, end_percent: settings.negativeSkipEnd });
  let source: [string, number] = [skip[0], 0];
  const append = (base: string, class_type: string, inputs: Record<string, unknown>) => {
    let id = base;
    for (let suffix = 1; graph[id]; suffix++) id = `${base}_${suffix}`;
    const upstream = source;
    // Replace existing consumers before inserting the patch, avoiding self-cycles.
    for (const consumer of Object.values(graph)) for (const [key, input] of Object.entries(consumer?.inputs || {})) {
      if (Array.isArray(input) && input[0] === upstream[0] && input[1] === 0) consumer.inputs[key] = [id, 0];
    }
    graph[id] = { class_type, inputs: { model: upstream, ...inputs }, _meta: { umbra_role: role } };
    source = [id, 0];
  };
  if (settings.guidance && settings.guidanceScale > 0) append('umbra_moss_slg', 'SkipLayerGuidanceDiT', {
    double_layers: '', single_layers: '22', scale: settings.guidanceScale,
    start_percent: settings.guidanceStart, end_percent: settings.guidanceEnd, rescaling_scale: 0,
  });
  if (settings.spectrum) append('umbra_moss_spectrum', 'SpectrumMOSSImageAdaptive', {
    warmup_steps: 8, detail_guard_steps: 8, tail_actual_steps: 2, post_guard_horizon_cap: 6,
    window_size: 2, flex_window: 0.5, cache_device: settings.spectrumCache, debug: false, error_tolerance: 1,
  });
}

export function assertMossSamplingAvailable(graph: Graph, objectInfo: Record<string, unknown> | null): void {
  for (const node of Object.values(graph)) {
    if (node?._meta?.umbra_role !== role || objectInfo?.[node.class_type]) continue;
    throw new Error(node.class_type === 'SpectrumMOSSImageAdaptive'
      ? 'Spectrum for MOSS is not installed. Install MOSS Spectrum acceleration in Umbra Setup and restart ComfyUI when ready, or disable Spectrum.'
      : 'Extra MOSS guidance needs current ComfyUI. Update it in Umbra Setup and restart when ready, or disable Extra guidance.');
  }
}
