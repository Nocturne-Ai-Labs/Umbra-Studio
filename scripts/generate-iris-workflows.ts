import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type Graph = Record<string, Node>;
const directory = join(process.cwd(), 'defaults', 'PowerPrompter', 'API Workflows');
const template: Graph = JSON.parse(await readFile(join(directory, '[Umbra UI] Krea 2 Image Pipeline.json'), 'utf8'));
const clone = (value: Node): Node => structuredClone(value);
for (const turbo of [false, true]) for (const img2img of [false, true]) {
  const family = turbo ? 'Iris 3B Turbo' : 'Iris 3B';
  const model = turbo ? 'iris-3b/turbo/model.safetensors' : 'iris-3b/model.safetensors';
  const feature = img2img ? 'img2img' : 'txt2img';
  const defaults = { modelName: model, modelNamesBySource: { diffusion_model: model }, steps: turbo ? 4 : 100,
    cfg: turbo ? 1 : 3, samplerName: turbo ? 'euler' : 'dpmpp_2m', scheduler: turbo ? 'iris_turbo' : 'iris', width: 1024, height: 1024, denoise: 0.65 };
  const graph: Graph = {
    '1': { class_type: 'IrisModelLoader', inputs: { model_name: model, weight_dtype: turbo ? 'float32' : 'default' },
      _meta: { title: family, umbra_role: 'model_loader', umbra_model_family: family,
        umbra_ui_pipelines: [{ feature, model_family: family, model_sources: ['diffusion_model'], priority: 100, defaults }] } },
    '2': clone(template['2']),
    '3': { class_type: 'IrisCLIPLoader', inputs: { clip_name: 'qwen3vl_4b_bf16.safetensors' },
      _meta: { title: 'Iris Qwen3-VL Text Encoder', umbra_resources: [{ id: 'iris.text_encoder', label: 'Iris Text Encoder', kind: 'text_encoder', input: 'clip_name', required: true, order: 10 }] } },
    '4': clone(template['5']),
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['4', 1], text: ['2', 8] }, _meta: { title: 'Negative prompt', umbra_role: 'negative_prompt' } },
    '6': { class_type: 'IrisKSampler', inputs: { model: ['4', 0], positive: ['4', 3], negative: ['5', 0],
      seed: ['2', 3], steps: 100, cfg: 3, sampler_name: 'dpmpp_2m', scheduler: 'iris', width: ['2', 4], height: ['2', 5], batch_size: ['2', 6], denoise: img2img ? 0.65 : 1 },
      _meta: { title: 'Iris Pixel Sampler', umbra_role: img2img ? 'img2img_sampler' : 'iris_sampler' } },
    '7': clone(template['11']), '8': clone(template['12']),
  };
  graph['4'].inputs.model = ['1', 0]; graph['4'].inputs.clip = ['3', 0];
  graph['7'].inputs.image = ['6', 0];
  graph['8']._meta = { title: `Save ${family} Image` };
  Object.assign(graph['8'].inputs, { images: ['7', 0], positive_prompt: ['4', 2], positive: ['4', 3],
    negative: ['5', 0], model_name: model, ...{ steps: defaults.steps, cfg: defaults.cfg, sampler_name: defaults.samplerName, scheduler: defaults.scheduler } });
  if (turbo) {
    delete graph['5']; delete graph['8'].inputs.negative;
    graph['9'] = { class_type: 'BasicGuider', inputs: { model: ['4', 0], conditioning: ['4', 3] } };
    graph['10'] = { class_type: 'RandomNoise', inputs: { noise_seed: ['2', 3] } };
    graph['11'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' }, _meta: { umbra_role: 'iris_turbo_sampler' } };
    graph['12'] = { class_type: 'ManualSigmas', inputs: { sigmas: '1, 0.938, 0.833, 0.625, 0' }, _meta: { title: 'Official Iris Turbo schedule' } };
    graph['6'] = { class_type: 'IrisSamplerCustomAdvanced', inputs: { noise: ['10', 0], guider: ['9', 0], sampler: ['11', 0], sigmas: ['12', 0],
      width: ['2', 4], height: ['2', 5], batch_size: ['2', 6], denoise: img2img ? 0.65 : 1 },
      _meta: { title: 'Official Iris Turbo Pixel Sampler', umbra_role: img2img ? 'img2img_sampler' : 'iris_sampler' } };
  }
  if (img2img) {
    graph['13'] = { class_type: 'LoadImage', inputs: { image: 'umbra_img2img_input.png' }, _meta: { umbra_role: 'img2img_source' } };
    graph['14'] = { class_type: 'ImageScale', inputs: { image: ['13', 0], upscale_method: 'bicubic', width: ['2', 4], height: ['2', 5], crop: 'disabled' }, _meta: { umbra_role: 'img2img_resize' } };
    graph['6'].inputs.image = ['14', 0];
  }
  await writeFile(join(directory, `[Umbra UI] ${family} ${img2img ? 'Image to Image' : 'Image'} Pipeline.json`), JSON.stringify(graph, null, 2) + '\n');
}
