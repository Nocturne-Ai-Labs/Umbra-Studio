import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;

const root = process.cwd();
const baseUrl = String(process.env.UMBRA_BASE_URL || 'http://127.0.0.1:8218').replace(/\/$/, '');
const workflowRoot = join(root, 'defaults', 'PowerPrompter', 'API Workflows');
const comfyRoot = join(root, 'Tools', 'ComfyUI');
const outputRoot = join(comfyRoot, 'output');
const inputFixture = join(comfyRoot, 'input', 'umbra-anima29-e2e-source.png');

async function fetchJson(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}: ${text.slice(0, 1200)}`);
  return payload;
}

async function readWorkflow(name: string): Promise<PromptGraph> {
  return JSON.parse(await readFile(join(workflowRoot, name), 'utf8')) as PromptGraph;
}

function prepareGraph(graph: PromptGraph, mode: 'txt2img' | 'img2img') {
  const prompt = graph['3'].inputs;
  Object.assign(prompt, {
    prompt_text: 'masterpiece, best quality, newest, 1girl, solo, adult woman, detailed eyes, long black hair, red dress, rooftop garden, sunset, city skyline, cinematic lighting, wind, dynamic composition',
    negative_prompt: 'worst quality, low quality, blurry, bad anatomy, bad hands, extra fingers, text, watermark',
    model_type: 'diffusion_model',
    checkpoint_name: '',
    diffusion_model_name: 'Anima-2.9B-preview-v1.safetensors',
    aspect_ratio: 'custom',
    width: 832,
    height: 1216,
    batch_size: 1,
    steps: mode === 'txt2img' ? 28 : 12,
    cfg: 4,
    sampler_name: 'euler',
    scheduler: 'sgm_uniform',
    seed: mode === 'txt2img' ? 29000001 : 29000002,
    control_after_generate: 'fixed',
    denoise: mode === 'txt2img' ? 1 : 0.3,
  });
  if (mode === 'img2img') {
    graph['9'].inputs.image = 'umbra-anima29-e2e-source.png';
    Object.assign(graph['10'].inputs, { width: 832, height: 1216 });
  }

  // Umbra's production queue compiler resolves menu-typed outputs to literals
  // before submitting the graph. Mirror that compile step in this direct E2E
  // qualifier so ComfyUI validates the same payload shape used by the app.
  for (const node of Object.values(graph)) {
    if (node.class_type === 'UmbraKSamplerHiResFix') {
      Object.assign(node.inputs, {
        seed: prompt.seed,
        steps: prompt.steps,
        cfg: prompt.cfg,
        sampler_name: prompt.sampler_name,
        scheduler: prompt.scheduler,
        denoise: prompt.denoise,
      });
    }
    if (node.class_type === 'UmbraLabSaveImage') {
      Object.assign(node.inputs, {
        model_name: prompt.diffusion_model_name,
        seed: prompt.seed,
        steps: prompt.steps,
        cfg: prompt.cfg,
        sampler_name: prompt.sampler_name,
        scheduler: prompt.scheduler,
      });
    }
  }

  // Qualify the model and locked sampling path without optional post-process providers.
  graph['8'].inputs.images = ['5', 0];
  graph['8'].inputs.output_folder = 'Umbra UI/Anima 2.9B Qualification';
  graph['8'].inputs.save_to_yyyy_mm_dd_folder = false;
  graph['8'].inputs.save_to_set_subfolder = false;
  graph['8'].inputs.set_subfolder = '';
  graph['8'].inputs.save_set_to_style_subfolder = '';
  graph['8'].inputs.filename_prefix = mode === 'txt2img'
    ? 'Anima29B_T2I_E2E'
    : 'Anima29B_I2I_E2E';
}

async function queueGraph(graph: PromptGraph) {
  const clientId = `umbra-anima29-${randomUUID()}`;
  const queued = await fetchJson('/comfy/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  const promptId = String(queued?.prompt_id || '').trim();
  if (!promptId) throw new Error(`ComfyUI did not return a prompt id: ${JSON.stringify(queued)}`);
  return promptId;
}

async function resolveReportedOutput(candidate: string): Promise<string> {
  if (existsSync(candidate)) return candidate;
  const names = new Set([
    basename(candidate),
    basename(candidate).replace('_umbra_img.', '_.'),
  ]);
  for (const name of names) {
    const glob = new Bun.Glob(`**/${name}`);
    for await (const match of glob.scan({ cwd: outputRoot, absolute: true, onlyFiles: true })) {
      return match;
    }
  }
  return candidate;
}

async function outputFiles(historyEntry: any): Promise<string[]> {
  const files: string[] = [];
  for (const output of Object.values(historyEntry?.outputs || {}) as any[]) {
    for (const image of Array.isArray(output?.images) ? output.images : []) {
      const filename = String(image?.filename || '').trim();
      if (!filename) continue;
      const subfolder = String(image?.subfolder || '').trim();
      files.push(await resolveReportedOutput(join(outputRoot, subfolder, filename)));
    }
  }
  return files;
}

async function waitForPrompt(promptId: string, timeoutMs = 15 * 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const history = await fetchJson(`/comfy/history/${encodeURIComponent(promptId)}`);
    const entry = history?.[promptId];
    if (entry) {
      const statusText = String(entry?.status?.status_str || '').toLowerCase();
      if (entry?.status?.completed === true || statusText === 'success') {
        const files = await outputFiles(entry);
        if (files.length === 0) throw new Error(`Prompt ${promptId} completed without an image output.`);
        return { promptId, durationMs: Date.now() - startedAt, files };
      }
      if (statusText === 'error') {
        throw new Error(`Prompt ${promptId} failed: ${JSON.stringify(entry?.status?.messages || entry?.status)}`);
      }
    }
    await Bun.sleep(1000);
  }
  throw new Error(`Prompt ${promptId} did not complete within ${timeoutMs}ms.`);
}

await mkdir(dirname(inputFixture), { recursive: true });
try {
  const txtGraph = await readWorkflow('[Umbra UI] Anima 2.9B Image Pipeline.json');
  prepareGraph(txtGraph, 'txt2img');
  const txtResult = await waitForPrompt(await queueGraph(txtGraph));

  await copyFile(txtResult.files[0], inputFixture);
  const imgGraph = await readWorkflow('[Umbra UI] Anima 2.9B Image to Image Pipeline.json');
  prepareGraph(imgGraph, 'img2img');
  const imgResult = await waitForPrompt(await queueGraph(imgGraph));

  console.log(JSON.stringify({
    success: true,
    baseUrl,
    textToImage: txtResult,
    imageToImage: imgResult,
  }, null, 2));
} finally {
  await rm(inputFixture, { force: true });
}
