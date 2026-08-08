import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;

const root = process.cwd();
const workflowDirectories = [
  join(root, 'defaults', 'PowerPrompter', 'API Workflows'),
  join(root, 'User', 'PowerPrompter', 'API Workflows'),
];
const sourceFileName = '[Umbra UI] Illustrious XL Image Pipeline.json';
const outputFileName = '[Umbra UI] NoobAI XL V-Pred Image Pipeline.json';

function pipeline(feature: 'txt2img' | 'inpainting') {
  return {
    feature,
    model_family: 'NoobAI XL V-Pred',
    model_sources: ['checkpoint'],
    ...(feature === 'inpainting' ? { inpaint_adapter: 'classic_conditioning' } : {}),
    priority: 100,
    defaults: {
      modelName: 'NoobAI-XL-Vpred-v1.0.safetensors',
      modelNamesBySource: { checkpoint: 'NoobAI-XL-Vpred-v1.0.safetensors' },
      steps: 28,
      cfg: 5,
      samplerName: 'euler',
      scheduler: 'normal',
      width: 832,
      height: 1216,
      clipSkip: 2,
    },
  };
}

const base = JSON.parse(await readFile(join(workflowDirectories[0], sourceFileName), 'utf8')) as PromptGraph;
const graph = structuredClone(base);

graph['1'].inputs.checkpoint_name = 'NoobAI-XL-Vpred-v1.0.safetensors';
graph['1']._meta = {
  title: 'Umbra UI NoobAI XL V-Pred',
  umbra_model_family: 'NoobAI XL V-Pred',
  umbra_ui_pipelines: [pipeline('txt2img'), pipeline('inpainting')],
};
graph['3'].inputs.model = ['12', 0];
graph['4']._meta = { title: 'NoobAI XL V-Pred Negative Conditioning' };
graph['5']._meta = { title: 'NoobAI XL V-Pred Latent' };
graph['6'].inputs.steps = 28;
graph['6'].inputs.cfg = 5;
graph['6'].inputs.sampler_name = 'euler';
graph['6']._meta = { title: 'Sample NoobAI XL V-Pred + Optional Hires Fix' };
graph['10'].inputs.filename_prefix = 'UmbraUI_NoobAI_VPred_%date%';
graph['10'].inputs.steps = 28;
graph['10'].inputs.cfg = 5;
graph['10'].inputs.sampler_name = 'euler';
graph['10']._meta = { title: 'Save NoobAI XL V-Pred Image' };
graph['11'].inputs.stop_at_clip_layer = -2;
graph['11']._meta = { title: 'NoobAI XL V-Pred CLIP Skip 2' };
graph['12'] = {
  class_type: 'ModelSamplingDiscrete',
  inputs: {
    model: ['1', 0],
    sampling: 'v_prediction',
    zsnr: true,
  },
  _meta: {
    title: 'NoobAI XL V-Pred Sampling (Zero Terminal SNR)',
    umbra_role: 'noobai_vpred_sampling',
    umbra_prediction_type: 'v_prediction',
    umbra_zero_terminal_snr: true,
  },
};

for (const directory of workflowDirectories) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, outputFileName), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

console.log(`Generated ${outputFileName} in ${workflowDirectories.length} workflow directories.`);
