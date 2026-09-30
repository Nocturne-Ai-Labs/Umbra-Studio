import { join } from 'node:path';
import { buildLtx23OmniForgeWorkflow } from '../backend/Ltx23OmniForgeWorkflow';
import { createDefaultLtx23OmniForgeControls } from '../shared/umbra-ui/ltx23OmniForge';

const controls = createDefaultLtx23OmniForgeControls();
Object.assign(controls, {
  enabled: true,
  modelName: 'ltx-2.3-22b-dev_transformer_only_bf16.safetensors',
  textEncoder: 'gemma_3_12B_it_fp8_scaled.safetensors',
  connector: 'ltx-2.3_text_projection_bf16.safetensors',
  videoVae: 'LTX23_video_vae_bf16.safetensors',
  audioVae: 'LTX23_audio_vae_bf16.safetensors',
  latentUpscaleModel: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
});
const graph = buildLtx23OmniForgeWorkflow({
  controls, prompt: 'A scenic mountain lake at sunrise, a gentle camera move and natural ambient sound.',
  negativePrompt: '', width: 1280, height: 704, frames: 121, fps: 24, seed: 0,
});
graph.model._meta.umbra_attribution = {
  workflow: 'DaSiWa LTX-2.3 OmniForge V5.0',
  workflowAuthor: 'DaSiWa / darksidewalker',
  director: 'Jonathan Watkins (WhatDreamsCost), PodJamz fork',
  nodes: ['DaSiWa Nodes', 'WhatDreamsCost', 'KJNodes', 'Lightricks ComfyUI-LTXVideo', 'WhiteRabbit (optional)', 'ComfyUI'],
  integration: 'Umbra-owned API wiring and frontend; upstream workflow and custom-node source are not vendored or modified.',
};
const target = join(import.meta.dir, '..', 'defaults', 'PowerPrompter', 'API Workflows', '[Umbra UI] LTX-2.3 OmniForge.json');
await Bun.write(target, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Generated ${target}`);
