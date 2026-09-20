import { spawn } from 'node:child_process';

export interface PreviewProcessOptions {
  maxBytes: number;
  timeoutMs: number;
  spawnProcess?: typeof spawn;
}

export function runFfmpegPreview(args: string[], options: PreviewProcessOptions): Promise<Buffer | null> {
  return runMediaProcess('ffmpeg', args, options);
}

export function runFfprobe(args: string[], options: PreviewProcessOptions): Promise<Buffer | null> {
  return runMediaProcess('ffprobe', args, options);
}

function runMediaProcess(command: 'ffmpeg' | 'ffprobe', args: string[], options: PreviewProcessOptions): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const child = (options.spawnProcess ?? spawn)(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let chunks: Buffer[] = [];
    let bytes = 0;
    let detail = '';
    let settled = false;
    let failure: Error | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, output: Buffer | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chunks = [];
      if (error) reject(error); else resolve(output);
    };
    const stop = (error: Error) => {
      if (settled || failure) return;
      failure = error;
      chunks = [];
      // Retain the caller's decode slot until the owned child actually closes.
      try { child.kill('SIGKILL'); } catch { /* Still wait for close, never admit overlapping work. */ }
    };
    timer = setTimeout(() => stop(new Error(command === 'ffprobe' ? 'Timed out while reading video metadata' : 'Timed out while generating video preview')), options.timeoutMs);
    child.stdout!.on('data', (value: Buffer | string) => {
      if (settled || failure) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      bytes += chunk.length;
      if (bytes > options.maxBytes) { stop(new Error(`${command === 'ffprobe' ? 'Video metadata' : 'Video preview'} exceeded the output size limit`)); return; }
      chunks.push(chunk);
    });
    child.stderr!.on('data', (value: Buffer | string) => {
      if (settled || failure) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      detail = (detail + chunk.subarray(-16384).toString('utf8')).slice(-16384);
    });
    child.on('error', error => {
      if (child.pid) stop(error); else finish(error);
    });
    child.stdout!.on('error', error => stop(error));
    child.stderr!.on('error', error => stop(error));
    child.on('close', code => {
      if (settled) return;
      if (failure) { finish(failure); return; }
      if (code !== 0) { finish(new Error(detail.trim() || `Failed to ${command === 'ffprobe' ? 'read video metadata' : 'generate video preview'} (exit ${code ?? 'unknown'})`)); return; }
      finish(undefined, bytes ? Buffer.concat(chunks, bytes) : null);
    });
  });
}
