import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export interface H3AutoPromptInput {
  prompt: string;
  mode: 'text_to_video' | 'image_to_video' | 'reference_to_video';
  durationSeconds: number;
  images: string[];
}

let active = false;

const MODEL_NAME = 'Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-NEO-MAX-MTP-Q8_0.gguf';
const MODEL_DIR = ['Tools', 'ComfyUI', 'models', 'llm', 'qwen35-h3-autoprompter'];

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => port ? resolve(port) : reject(new Error('Could not reserve a local prompt port.')));
    });
  });
}

export function normalizeH3AutoPromptInput(value: unknown): H3AutoPromptInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid prompt request.');
  const body = value as Record<string, unknown>;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) throw new Error('Enter a video idea of at most 4,000 characters.');
  const mode = body.mode;
  if (mode !== 'text_to_video' && mode !== 'image_to_video' && mode !== 'reference_to_video') {
    throw new Error('Choose a supported MiniMax H3 video mode.');
  }
  const durationSeconds = Number(body.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 30) {
    throw new Error('Video duration must be between 1 and 30 seconds.');
  }
  const images = body.images === undefined ? [] : body.images;
  if (!Array.isArray(images) || images.length > 3 || images.some((image) => typeof image !== 'string'
    || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)
    || image.length > 3_000_000)) {
    throw new Error('Attach up to three small JPEG, PNG or WebP reference images.');
  }
  if (mode === 'text_to_video' && images.length) throw new Error('Text-to-video drafts cannot include reference images.');
  return { prompt, mode, durationSeconds, images };
}

export async function draftMiniMaxH3Prompt(rootDir: string, input: H3AutoPromptInput): Promise<string> {
  if (active) throw new Error('The local Auto Prompter is already drafting.');
  active = true;
  const modelDir = join(rootDir, ...MODEL_DIR);
  const model = process.env.UMBRA_H3_PROMPT_MODEL || join(modelDir, MODEL_NAME);
  const projector = process.env.UMBRA_H3_PROMPT_PROJECTOR || join(modelDir, 'mmproj-F16.gguf');
  const binary = process.env.UMBRA_H3_LLAMA_SERVER
    || join(rootDir, 'Tools', 'LlamaCpp', 'b11146', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  try {
    if (!existsSync(binary) || !existsSync(model)) {
      throw new Error('Install MiniMax H3 Auto Prompter from Umbra Setup first. The local runtime or Qwen model is missing.');
    }
    if (input.images.length && !existsSync(projector)) {
      throw new Error('Image-aware drafting needs the matching Qwen vision projector from Umbra Setup.');
    }
    const port = await getFreePort();
    const apiKey = randomBytes(32).toString('hex');
    const args = ['--model', model, '--host', '127.0.0.1', '--port', String(port), '--api-key', apiKey,
      '--no-ui', '--n-gpu-layers', '0', '--ctx-size', '4096', '--parallel', '1'];
    if (input.images.length) args.push('--mmproj', projector, '--no-mmproj-offload');
    const child = spawn(binary, args, { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let startupError = '';
    let spawnFailure = '';
    child.once('error', (error) => { spawnFailure = error.message; });
    child.stdout?.on('data', () => undefined);
    child.stderr?.on('data', (chunk) => { startupError = `${startupError}${String(chunk)}`.slice(-2500); });
    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { Authorization: `Bearer ${apiKey}` };
      let ready = false;
      for (let attempt = 0; attempt < 240; attempt++) {
        if (spawnFailure) throw new Error(`Could not start the local prompt runtime: ${spawnFailure}`);
        if (child.exitCode !== null) throw new Error(`Local prompt runtime exited during startup: ${startupError.slice(-600)}`);
        try {
          const health = await fetch(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(1000) });
          if (health.ok) { ready = true; break; }
        } catch { /* Model loading is still in progress. */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error('Local prompt model did not become ready within two minutes.');
      const mode = input.mode === 'reference_to_video' ? 'reference-to-video'
        : input.mode === 'image_to_video' ? 'image-to-video' : 'text-to-video';
      const system = `Write one MiniMax H3 audio-video prompt from the user's idea. Mode: ${mode}; duration: ${input.durationSeconds} seconds. Preserve the user's subject and intent. If pictures are supplied, keep their visible identity and scene details consistent; refer to them as <Picture 1>, <Picture 2>, and <Picture 3> in order. Describe concrete motion, camera movement, lighting and audible ambience. Use [Shot 1] for the opening shot; only add later timestamped shots when the idea calls for cuts. Preserve any supplied dialogue exactly. Return only the finished prompt, without analysis, Markdown, or commentary.`;
      const userContent = input.images.length
        ? [{ type: 'text', text: input.prompt }, ...input.images.map((url) => ({ type: 'image_url', image_url: { url } }))]
        : input.prompt;
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'local', messages: [
          { role: 'system', content: system }, { role: 'user', content: userContent },
        ], max_tokens: 512, temperature: 0.45, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) throw new Error(`Local prompt runtime rejected the request (${response.status}).`);
      const result = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const draft = String(result.choices?.[0]?.message?.content || '').trim().replace(/^```(?:text)?\s*|\s*```$/g, '').trim();
      if (!draft || draft.length > 20_000) throw new Error('The local model returned no usable prompt. Retry the draft.');
      return draft;
    } finally {
      if (child.exitCode === null && child.pid) {
        child.kill();
        await Promise.race([
          new Promise<void>((resolve) => child.once('close', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
    }
  } finally {
    active = false;
  }
}
