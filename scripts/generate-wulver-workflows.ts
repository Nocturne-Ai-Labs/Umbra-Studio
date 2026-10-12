import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type Graph = Record<string, Node>;
const root = process.cwd();
const directories = [join(root, 'defaults', 'PowerPrompter', 'API Workflows'), join(root, 'User', 'PowerPrompter', 'API Workflows')];
const variants = [
  { family: 'Wulver Turbo', model: 'Wulver_v0.5_fp8_e4m3fn.safetensors', steps: 8, cfg: 1 },
  { family: 'Wulver Non-Turbo', model: 'Wulver_v0.5_non_turbo_bf16.safetensors', steps: 52, cfg: 3.5 },
];
const sources = [
  { suffix: 'Image Pipeline', feature: 'txt2img' },
  { suffix: 'Image to Image Pipeline', feature: 'img2img' },
  { suffix: 'Inpaint Pipeline', feature: 'inpainting' },
];

for (const variant of variants) for (const source of sources) {
  const graph = JSON.parse(await readFile(join(directories[0], `[Umbra UI] Krea 2 ${source.suffix}.json`), 'utf8')) as Graph;
  const loader = graph['1'];
  loader.inputs.diffusion_model_name = variant.model;
  loader._meta = {
    title: `Umbra UI ${variant.family}`, umbra_model_family: variant.family,
    umbra_lora_adapter: 'wulver_model_only',
    umbra_ui_pipelines: [{
      feature: source.feature, model_family: variant.family, model_sources: ['diffusion_model', 'unet'], priority: 100,
      ...(source.feature === 'inpainting' ? { inpaint_adapter: 'native_edit' } : {}),
      defaults: {
        modelName: variant.model, modelNamesBySource: { diffusion_model: variant.model, unet: variant.model },
        steps: variant.steps, cfg: variant.cfg, samplerName: 'euler', scheduler: 'simple', width: 1024, height: 1024, clipSkip: 1,
        ...(source.feature === 'img2img' ? { denoise: 0.3 } : source.feature === 'inpainting' ? { denoise: 0.8 } : {}),
      },
    }],
  };
  graph['2'].inputs.prompt_text = 'sfw, A detailed illustration of two adult anthropomorphic wolves sharing tea in a sunlit village garden.';
  graph['3'].inputs.clip_name = 'qwen3vl_4b_bf16.safetensors';
  // Real empty-text conditioning also works when users raise Turbo CFG or add a lighter Turbo LoRA.
  graph['6'] = {
    class_type: 'CLIPTextEncode', inputs: { clip: ['5', 1], text: ['2', 8] },
    _meta: { title: `${variant.family} Negative Prompt`, umbra_role: 'negative_prompt' },
  };
  graph['5'].inputs.strict_mode = true;
  for (const node of Object.values(graph)) {
    if (node._meta?.title) node._meta.title = String(node._meta.title).replaceAll('Krea 2', variant.family);
    const resources = node._meta?.umbra_resources as Array<Record<string, unknown>> | undefined;
    for (const resource of resources || []) {
      resource.id = String(resource.id).replace('krea2.', 'wulver.');
      resource.label = String(resource.label).replace('Krea 2', 'Wulver');
    }
    if (node.class_type === 'UmbraKSamplerHiResFix' || node.class_type === 'UmbraLabSaveImage') {
      node.inputs.steps = variant.steps; node.inputs.cfg = variant.cfg;
    }
    if (node.class_type === 'UmbraLabSaveImage') node.inputs.filename_prefix = `UmbraUI_${source.feature}_${variant.family.replaceAll(/[^A-Za-z0-9]/g, '')}_%date%`;
  }
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `[Umbra UI] ${variant.family} ${source.suffix}.json`), `${JSON.stringify(graph, null, 2)}\n`);
  }
}
console.log('Generated six Wulver Turbo / Non-Turbo image workflows.');
