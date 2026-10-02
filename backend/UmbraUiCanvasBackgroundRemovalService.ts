import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface UmbraCanvasBackgroundRemovalStatus {
  available: boolean;
  provider: 'CPUExecutionProvider';
  model: 'isnet-anime';
  reason?: string;
}

interface ActiveRequest {
  controller: AbortController;
  done: Promise<unknown>;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_BYTES = 256 * 1024 * 1024;
const PROVIDER = 'CPUExecutionProvider' as const;

export class UmbraUiCanvasBackgroundRemovalService {
  private readonly active = new Map<string, ActiveRequest>();
  private readonly canceled = new Map<string, number>();
  private cachedStatus: { expires: number; value: UmbraCanvasBackgroundRemovalStatus } | null = null;
  private checkingStatus: Promise<UmbraCanvasBackgroundRemovalStatus> | null = null;

  constructor(private readonly rootDir: string, private readonly sourceDir = rootDir) {}

  private python(): string {
    const root = join(this.rootDir, 'Tools', 'ComfyUI');
    const candidates = process.platform === 'win32'
      ? ['venv', '.venv'].map(folder => join(root, folder, 'Scripts', 'python.exe'))
      : ['venv', '.venv'].flatMap(folder => ['python3', 'python'].map(name => join(root, folder, 'bin', name)));
    const python = candidates.find(existsSync);
    if (!python) throw new Error("Canvas CPU background removal needs Umbra's managed ComfyUI Python environment. ComfyUI itself can stay stopped.");
    return python;
  }

  private async helper(args: string[], signal: AbortSignal, directory: string): Promise<Record<string, unknown>> {
    signal.throwIfAborted();
    const script = join(this.sourceDir, 'backend', 'python', 'canvas_background_removal.py');
    if (!existsSync(script)) throw new Error('The Canvas CPU background-removal helper is missing.');
    const cancelFile = join(directory, 'cancel');
    return new Promise((resolve, reject) => {
      const child = spawn(this.python(), [script, '--model', join(this.rootDir, 'Tools', 'ComfyUI', 'models', 'rembg', 'isnet-anime.onnx'), '--cancel-file', cancelFile, ...args], {
        cwd: this.rootDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', CUDA_VISIBLE_DEVICES: '-1', HF_HUB_OFFLINE: '1', PIP_NO_INDEX: '1' },
      });
      let stdout = '';
      let stderr = '';
      let timeout = false;
      let cancellationFailure: Error | null = null;
      const stop = () => {
        // Only this random request directory is signaled. The helper exits its
        // own process, including Windows' venv child, before cleanup is allowed.
        void writeFile(cancelFile, '').catch(error => { cancellationFailure = error; });
      };
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      const timer = setTimeout(() => { timeout = true; stop(); }, 180_000);
      child.stdout.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-64 * 1024); });
      child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-64 * 1024); });
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
      child.once('error', error => { finish(); reject(error); });
      child.once('close', code => {
        finish();
        if (cancellationFailure) return reject(new Error('The CPU background-removal worker could not be signaled to stop.'));
        if (signal.aborted) return reject(new DOMException('Background removal canceled.', 'AbortError'));
        if (timeout) return reject(new Error('CPU background removal timed out. Its worker was stopped; the original layer was kept.'));
        if (code !== 0) {
          let message = 'CPU background removal failed. The original layer was kept.';
          try { message = String(JSON.parse(stderr.trim()).error || message); } catch { /* Keep runtime diagnostics out of the user message. */ }
          return reject(new Error(message));
        }
        try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('The CPU background-removal worker returned invalid output.')); }
      });
    });
  }

  async status(): Promise<UmbraCanvasBackgroundRemovalStatus> {
    if (this.cachedStatus && this.cachedStatus.expires > Date.now()) return this.cachedStatus.value;
    if (this.checkingStatus) return this.checkingStatus;
    this.checkingStatus = (async () => {
      const directory = join(this.rootDir, 'User', 'Temp', 'CanvasBackgroundRemoval', `probe-${randomUUID()}`);
      try {
        await mkdir(directory, { recursive: true });
        const probe = await this.helper(['--probe'], new AbortController().signal, directory);
        return { available: probe.available === true, provider: PROVIDER, model: 'isnet-anime' } as UmbraCanvasBackgroundRemovalStatus;
      } catch (error) {
        return { available: false, provider: PROVIDER, model: 'isnet-anime', reason: String((error as Error).message || error) } as UmbraCanvasBackgroundRemovalStatus;
      } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      }
    })();
    try {
      const value = await this.checkingStatus;
      this.cachedStatus = { expires: Date.now() + (value.available ? 30_000 : 5_000), value };
      return value;
    } finally { this.checkingStatus = null; }
  }

  async remove(options: { requestId: string; image: () => Promise<ArrayBuffer>; signal?: AbortSignal }): Promise<{ bytes: Uint8Array; provider: string; filename: string }> {
    const id = options.requestId.toLowerCase();
    if (!UUID.test(id)) throw new Error('A valid Canvas background-removal request id is required.');
    for (const [key, expires] of this.canceled) if (expires <= Date.now()) this.canceled.delete(key);
    if (this.canceled.has(id) || options.signal?.aborted) throw new DOMException('Background removal canceled.', 'AbortError');
    if (this.active.has(id)) throw new Error('This Canvas background-removal request is already running.');
    if (this.active.size >= 2) throw new Error('Two CPU background removals are already running. Wait for one to finish and retry.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const directory = join(this.rootDir, 'User', 'Temp', 'CanvasBackgroundRemoval', id);
    const request: ActiveRequest = { controller, done: Promise.resolve() };
    this.active.set(id, request);
    request.done = (async () => {
      try {
        const status = await this.status();
        controller.signal.throwIfAborted();
        if (!status.available) throw new Error(status.reason || 'Canvas CPU background removal is unavailable.');
        const bytes = new Uint8Array(await options.image());
        controller.signal.throwIfAborted();
        if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('Choose a nonempty image smaller than 256 MB.');
        await mkdir(directory, { recursive: true });
        const input = join(directory, 'source');
        const output = join(directory, 'cutout.png');
        await writeFile(input, bytes);
        controller.signal.throwIfAborted();
        const result = await this.helper(['--input', input, '--output', output], controller.signal, directory);
        controller.signal.throwIfAborted();
        if (result.provider !== PROVIDER || result.mask !== 'soft') throw new Error('The Canvas worker did not return a CPU soft-alpha cutout.');
        const size = (await stat(output)).size;
        if (size <= 0 || size > MAX_BYTES) throw new Error('The CPU cutout exceeds the supported output size.');
        const outputBytes = new Uint8Array(await readFile(output));
        controller.signal.throwIfAborted();
        return { bytes: outputBytes, provider: PROVIDER, filename: 'canvas-cutout.png' };
      } finally {
        options.signal?.removeEventListener('abort', abort);
        // Files are private staging for this request, never project assets.
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        this.active.delete(id);
      }
    })();
    return request.done as Promise<{ bytes: Uint8Array; provider: string; filename: string }>;
  }

  async cancel(requestId: string): Promise<{ stopped: boolean }> {
    requestId = requestId.toLowerCase();
    if (!UUID.test(requestId)) throw new Error('A valid Canvas background-removal request id is required.');
    // Remember early cancellation if it races the upload/registration. IDs are
    // opaque and never map to ComfyUI, OS PIDs, or another subsystem's jobs.
    if (this.canceled.size >= 128) this.canceled.delete(this.canceled.keys().next().value!);
    this.canceled.set(requestId, Date.now() + 60_000);
    const request = this.active.get(requestId);
    if (request) {
      request.controller.abort();
      await request.done.catch(() => undefined);
    }
    return { stopped: true };
  }
}
