import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;
type PipelineFeature = 'txt2img' | 'img2img' | 'inpainting';

const root = process.cwd();
const workflowDirectories = [
  join(root, 'defaults', 'PowerPrompter', 'API Workflows'),
  join(root, 'User', 'PowerPrompter', 'API Workflows'),
];
const modelName = 'Anima-2.9B-preview-v1.safetensors';
const family = 'Anima 2.9B';

function defaults(denoise?: number) {
  return {
    model_name: modelName,
    model_names_by_source: { diffusion_model: modelName },
    steps: 35,
    cfg: 4,
    sampler_name: 'euler',
    scheduler: 'sgm_uniform',
    width: 832,
    height: 1216,
    clip_skip: 1,
    ...(typeof denoise === 'number' ? { denoise } : {}),
  };
}

function descriptor(feature: PipelineFeature) {
  return {
    feature,
    model_family: family,
    model_sources: ['diffusion_model'],
    ...(feature === 'inpainting' ? { inpaint_adapter: 'classic_conditioning' } : {}),
    priority: 100,
    defaults: defaults(feature === 'img2img' ? 0.3 : undefined),
  };
}

function replaceResource(node: PromptNode, id: string, label: string) {
  node._meta = {
    ...(node._meta || {}),
    title: label,
    umbra_resources: [{
      id,
      label,
      kind: id.endsWith('.vae') ? 'vae' : 'text_encoder',
      input: id.endsWith('.vae') ? 'vae_name' : 'clip_name',
      required: true,
      order: id.endsWith('.vae') ? 20 : 10,
    }],
  };
}

function convert(base: PromptGraph, feature: 'txt2img' | 'img2img'): PromptGraph {
  const graph = structuredClone(base);
  replaceResource(graph['1'], 'anima29b.text_encoder', 'Anima 2.9B Text Encoder');
  replaceResource(graph['2'], 'anima29b.vae', 'Anima 2.9B VAE');

  const prompter = graph['3'];
  Object.assign(prompter.inputs, {
    model_type: 'diffusion_model',
    checkpoint_name: '',
    diffusers_model: '',
    diffusion_model_name: modelName,
    unet_name: '',
    gguf_name: '',
    weight_dtype: 'default',
    aspect_ratio: 'custom',
    width: 832,
    height: 1216,
    steps: 35,
    cfg: 4,
    sampler_name: 'euler',
    scheduler: 'sgm_uniform',
  });
  prompter._meta = {
    ...(prompter._meta || {}),
    title: 'Power Prompter (Anima 2.9B)',
    umbra_model_family: family,
    umbra_ui_pipelines: feature === 'txt2img'
      ? [descriptor('txt2img'), descriptor('inpainting')]
      : [descriptor('img2img')],
  };

  const resize = Object.values(graph).find(node => node._meta?.umbra_role === 'img2img_resize');
  if (resize) Object.assign(resize.inputs, { width: 832, height: 1216 });

  const save = Object.values(graph).find(node => node.class_type === 'UmbraLabSaveImage');
  if (save) {
    save.inputs.filename_prefix = feature === 'txt2img'
      ? 'UmbraUI_Anima29B_%date%'
      : 'UmbraUI_IMG2IMG_Anima29B_%date%';
  }
  return graph;
}

const sources = [
  {
    source: '[Umbra UI] Anima Image Pipeline.json',
    output: '[Umbra UI] Anima 2.9B Image Pipeline.json',
    feature: 'txt2img' as const,
  },
  {
    source: '[Umbra UI] Anima Image to Image Pipeline.json',
    output: '[Umbra UI] Anima 2.9B Image to Image Pipeline.json',
    feature: 'img2img' as const,
  },
];

for (const entry of sources) {
  const base = JSON.parse(await readFile(join(workflowDirectories[0], entry.source), 'utf8')) as PromptGraph;
  const graph = convert(base, entry.feature);
  for (const directory of workflowDirectories) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, entry.output), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
}

console.log(`Generated ${sources.length} locked Anima 2.9B workflow(s) in ${workflowDirectories.length} directories.`);
