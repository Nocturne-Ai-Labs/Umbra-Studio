import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { resolveMediaExecutable } from './MediaExecutables';

const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm']);

export function resolveUmbraExtendedVideoFfmpeg(comfyRoot: string): string {
  return resolveMediaExecutable('ffmpeg', { comfyRoot, runtimeRoot: dirname(dirname(comfyRoot)) }).executable;
}

function runProcess(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      child.kill();
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      if (killTimer) clearTimeout(killTimer);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code) => {
      cleanup();
      if (signal?.aborted) {
        reject(signal.reason || new Error('Video finalization cancelled.'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}.`));
    });
  });
}

function quoteConcatPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

export function isUmbraExtendedVideoOutputPath(path: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function concatenateUmbraExtendedVideoClips(options: {
  comfyRoot: string;
  clipPaths: string[];
  outputPath: string;
  workDirectory: string;
  signal?: AbortSignal;
}): Promise<void> {
  options.signal?.throwIfAborted();
  if (options.clipPaths.length < 2) {
    throw new Error('An extended video needs at least two completed clips to merge.');
  }
  await fs.mkdir(options.workDirectory, { recursive: true });
  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  const concatListPath = join(options.workDirectory, 'clips.txt');
  await fs.writeFile(
    concatListPath,
    `${options.clipPaths.map((path) => `file '${quoteConcatPath(path)}'`).join('\n')}\n`,
    'utf8',
  );
  const ffmpeg = resolveUmbraExtendedVideoFfmpeg(options.comfyRoot);
  try {
    await runProcess(ffmpeg, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-map', '0',
      '-c', 'copy',
      '-movflags', '+faststart',
      options.outputPath,
    ], options.workDirectory, options.signal);
  } catch {
    options.signal?.throwIfAborted();
    await runProcess(ffmpeg, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      options.outputPath,
    ], options.workDirectory, options.signal);
  } finally {
    await fs.rm(concatListPath, { force: true }).catch(() => undefined);
  }
}
