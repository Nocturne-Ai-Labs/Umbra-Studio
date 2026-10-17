import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, any> };
type Graph = Record<string, Node>;
const directory = join(process.cwd(), 'defaults', 'PowerPrompter', 'API Workflows');
const model = 'moss_image_sft_int8_convrot.safetensors';
// Base and SFT have the same native architecture and share these pipelines.
for (const mode of ['Image', 'Image to Image', 'Inpaint']) {
  const text = await readFile(join(directory, `[Umbra UI] Krea 2 ${mode} Pipeline.json`), 'utf8');
  const graph: Graph = JSON.parse(text.replaceAll('krea2_turbo_fp8_scaled.safetensors', model)
    .replaceAll('Krea 2', 'MOSS Image').replaceAll('Krea2', 'MOSSImage').replaceAll('krea2', 'mossimage'));
  graph['1'].inputs.diffusion_model_name = model;
  const descriptor = graph['1']._meta!.umbra_ui_pipelines[0];
  descriptor.model_sources = ['diffusion_model', 'unet'];
  descriptor.defaults = { modelName: model, modelNamesBySource: { diffusion_model: model, unet: model },
    steps: 50, cfg: 3, samplerName: 'euler', scheduler: 'sgm_uniform', width: 1024, height: 1024, clipSkip: 1,
    ...(mode !== 'Image' ? { denoise: mode === 'Inpaint' ? 0.8 : 0.65 } : {}) };
  Object.assign(graph['3'].inputs, { clip_name: 'qwen3.5_9b_w4a8_gptq.safetensors', type: 'moss_image' });
  graph['4'].inputs.vae_name = 'flux2-vae.safetensors';
  graph['6'] = { class_type: 'CLIPTextEncode', inputs: { clip: ['5', 1], text: ['2', 8] },
    _meta: { title: 'MOSS Negative Prompt', umbra_role: 'negative_prompt' } };
  if (mode !== 'Inpaint') graph['7'].class_type = 'EmptyFlux2LatentImage';
  // Native MOSS uses normalized timesteps (multiplier 1), unlike SD3's 1000.
  // Scheduling precedes SLG so the skip interval uses the same shifted sigmas.
  graph['30'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['5', 0], shift: 5 }, _meta: { title: 'MOSS Normalized Flow Shift' } };
  graph['31'] = { class_type: 'SkipLayerGuidanceDiTSimple', inputs: { model: ['30', 0], double_layers: '',
    single_layers: '22', start_percent: 0, end_percent: 1 }, _meta: { title: 'MOSS Negative-Branch Layer Skip' } };
  for (const node of Object.values(graph)) {
    if (['UmbraKSamplerHiResFix', 'UmbraImageDetailer'].includes(node.class_type)) node.inputs.model = ['31', 0];
    if (node.class_type === 'UmbraKSamplerHiResFix') Object.assign(node.inputs, { steps: 50, cfg: 3, sampler_name: 'euler', scheduler: 'sgm_uniform',
      denoise: mode === 'Image' ? 1 : descriptor.defaults.denoise });
    if (node.class_type === 'UmbraLabSaveImage') Object.assign(node.inputs, { steps: 50, cfg: 3, sampler_name: 'euler', scheduler: 'sgm_uniform' });
  }
  await writeFile(join(directory, `[Umbra UI] MOSS Image ${mode} Pipeline.json`), JSON.stringify(graph, null, 2) + '\n');
}
