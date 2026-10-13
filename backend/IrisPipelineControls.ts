type Node = { class_type?: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type Graph = Record<string, unknown>;
function graphNodes(graph: Graph): Node[] {
  return Object.values(graph).filter((value): value is Node => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const node = value as Record<string, unknown>;
    return typeof node.class_type === 'string' && !!node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs)
      && (node._meta === undefined || (!!node._meta && typeof node._meta === 'object' && !Array.isArray(node._meta)));
  });
}
type Controls = { checkpointName: string; width: number; height: number; batchSize: number; seed: number; steps: number; cfg: number; samplerName: string; scheduler: string; negativePrompt?: string; img2img?: { denoise: number }; tiledVae?: { enabled: boolean } };

export function isOfficialIrisTurboGraph(graph: Graph): boolean {
  const nodes = graphNodes(graph);
  return nodes.some(node => node.class_type === 'IrisSamplerCustomAdvanced')
    && nodes.some(node => node._meta?.umbra_model_family === 'Iris 3B Turbo');
}
export function normalizeIrisSamplingControls(graph: Graph, controls: Controls): void {
  const nodes = graphNodes(graph);
  if (nodes.some(node => node?.class_type === 'IrisModelLoader')
    && !nodes.some(node => /^VAE/.test(node?.class_type || '')) && controls.tiledVae) controls.tiledVae.enabled = false;
  if (!isOfficialIrisTurboGraph(graph)) return;
  // CFG and the four-step schedule are distilled into the official checkpoint.
  controls.steps = 4; controls.cfg = 1; controls.samplerName = 'euler'; controls.scheduler = 'iris_turbo'; controls.negativePrompt = '';
}
export function applyIrisPipelineControls(graph: Graph, controls: Controls): void {
  const turbo = isOfficialIrisTurboGraph(graph);
  for (const node of graphNodes(graph)) {
    if (node?.class_type === 'IrisModelLoader') {
      node.inputs.model_name = controls.checkpointName;
      if (turbo) node.inputs.weight_dtype = 'float32';
    }
    if (node?.class_type === 'IrisKSampler' || node?.class_type === 'IrisSamplerCustomAdvanced') {
      Object.assign(node.inputs, { width: controls.width, height: controls.height, batch_size: controls.batchSize,
        denoise: node._meta?.umbra_role === 'img2img_sampler' ? controls.img2img?.denoise ?? 0.65 : 1 });
      if (node.class_type === 'IrisKSampler') Object.assign(node.inputs, { seed: controls.seed, steps: controls.steps,
        cfg: controls.cfg, sampler_name: controls.samplerName, scheduler: controls.scheduler });
    }
    if (turbo && node?._meta?.umbra_role === 'iris_turbo_sampler') node.inputs.sampler_name = 'euler';
    if (turbo && node?.class_type === 'ManualSigmas') node.inputs.sigmas = '1, 0.938, 0.833, 0.625, 0';
  }
}
