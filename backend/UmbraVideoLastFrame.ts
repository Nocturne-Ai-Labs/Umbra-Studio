import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, link, mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { resolveAllowedGalleryPath } from './GalleryPathAccess';
import { runFfmpegPreview } from './FfmpegPreviewProcess';
import { resolveUmbraExtendedVideoFfmpeg } from './UmbraUiExtendedVideoService';

const exportsInFlight = new Map<string, Promise<string>>();
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.gif', '.avi', '.m4v', '.webp', '.avif']);
const LOCAL_VIDEO_FORMATS = 'mov,matroska,webm,avi,gif,webp,avif,m4v';

export function isLastFrameVideoOutput(output: Record<string, unknown>): boolean {
  return output.type === 'output' && /\.(mp4|webm|mov|mkv|gif|avi|m4v|webp|avif)$/i.test(String(output.filename || output.fullpath || ''));
}

export function saveUmbraVideoLastFrame(options: {
  videoPath: string;
  comfyRoot: string;
  allowedRoots: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const active = exportsInFlight.get(options.videoPath);
  if (active) return active;
  const operation = exportLastFrame(options).finally(() => {
    if (exportsInFlight.get(options.videoPath) === operation) exportsInFlight.delete(options.videoPath);
  });
  exportsInFlight.set(options.videoPath, operation);
  return operation;
}

async function exportLastFrame(options: Parameters<typeof saveUmbraVideoLastFrame>[0]): Promise<string> {
  options.signal?.throwIfAborted();
  const video = await resolveAllowedGalleryPath(options.videoPath, options.allowedRoots);
  if (!video || !(await stat(video)).isFile()) throw new Error('The video is outside the authorized output folders or is unavailable.');
  if (!VIDEO_EXTENSIONS.has(extname(video).toLowerCase())) throw new Error('Last-frame export requires a supported local video file.');
  const parent = dirname(video);
  let directory = await resolveAllowedGalleryPath(join(parent, 'Last Frames'), [parent]);
  if (!directory) throw new Error('The last-frame folder is outside the video output folder.');
  await mkdir(directory, { recursive: true });
  directory = await resolveAllowedGalleryPath(join(parent, 'Last Frames'), [parent]);
  if (!directory) throw new Error('The last-frame folder is outside the video output folder.');
  const id = randomUUID();
  const temporary = join(directory, `.last-frame-${id}.png`);
  const cancelFile = join(directory, `.last-frame-${id}.cancel`);
  try {
    // Fast path decodes the tail into a private staging PNG; its last write is
    // the final encoded frame after ping-pong and audio cropping.
    let ffmpegError: Error | null = null;
    try {
      await runFfmpegPreview([
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-protocol_whitelist', 'file', '-format_whitelist', LOCAL_VIDEO_FORMATS,
        '-sseof', '-1', '-i', video,
        '-map', '0:v:0', '-an', '-sn', '-vsync', '0', '-threads', '1',
        '-compression_level', '1', '-update', '1', '-f', 'image2', temporary,
      ], { executable: resolveUmbraExtendedVideoFfmpeg(options.comfyRoot), maxBytes: 1024, timeoutMs: 60_000, signal: options.signal });
      await validatePng(temporary);
    } catch (error) {
      options.signal?.throwIfAborted();
      ffmpegError = error as Error;
    }
    if (ffmpegError) {
      // The managed FFmpeg may lack a decoder for video produced by ComfyUI's
      // PyAV wheel. The fallback keeps only one decoded frame in memory.
      await rm(temporary, { force: true });
      try {
        await runPyavLastFrame(video, temporary, cancelFile, options.comfyRoot, options.signal);
        await validatePng(temporary);
      } catch (error) {
        options.signal?.throwIfAborted();
        throw new Error(`Last-frame export failed. FFmpeg: ${briefError(ffmpegError)}. Managed PyAV: ${briefError(error)}.`);
      }
    }
    options.signal?.throwIfAborted();
    if (!await resolveAllowedGalleryPath(temporary, [parent])) throw new Error('The staging image left the authorized video folder.');
    const stem = `${basename(video, extname(video))}-last-frame`;
    for (let attempt = 0; attempt < 1000; attempt++) {
      options.signal?.throwIfAborted();
      const destination = join(directory, `${stem}${attempt ? `-${attempt}` : ''}.png`);
      try {
        try { await link(temporary, destination); }
        catch (error: any) {
          if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error?.code)) throw error;
          await copyFile(temporary, destination, constants.COPYFILE_EXCL);
        }
        return destination;
      } catch (error: any) { if (error?.code !== 'EEXIST') throw error; }
    }
    throw new Error('Too many last-frame filename conflicts.');
  } finally {
    await rm(temporary, { force: true }).catch(error => console.warn('[VideoLastFrame] Staging cleanup failed:', error));
    await rm(cancelFile, { force: true }).catch(error => console.warn('[VideoLastFrame] Cancellation cleanup failed:', error));
  }
}

function briefError(error: unknown): string {
  const message = String((error as Error)?.message || error);
  const useful = message.match(/Bitstream not supported|No sequence header|Timed out[^\r\n]*|No last frame[^\r\n]*|[^\r\n]+$/i);
  return (useful?.[0] || message).slice(0, 500);
}

async function validatePng(path: string): Promise<void> {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead !== 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)
      || !header.readUInt32BE(16) || !header.readUInt32BE(20)) throw new Error('No last frame was decoded from the completed video.');
  } finally { await file.close(); }
}

function managedPython(comfyRoot: string): string {
  const candidates = process.platform === 'win32'
    ? ['venv', '.venv'].map(folder => join(comfyRoot, folder, 'Scripts', 'python.exe'))
    : ['venv', '.venv'].flatMap(folder => ['python3', 'python'].map(name => join(comfyRoot, folder, 'bin', name)));
  const python = candidates.find(existsSync);
  if (!python) throw new Error("Umbra's managed ComfyUI Python environment is missing; install PyAV there to decode this video.");
  return python;
}

function runPyavLastFrame(video: string, output: string, cancelFile: string, comfyRoot: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const python = managedPython(comfyRoot);
  const script = [
    join(import.meta.dir, 'python', 'video_last_frame.py'),
    join(import.meta.dir, 'backend', 'python', 'video_last_frame.py'),
    join(import.meta.dir, '..', 'backend', 'python', 'video_last_frame.py'),
  ].find(existsSync);
  if (!script) throw new Error('The local PyAV last-frame helper is missing from Umbra source.');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, '--input', video, '--output', output, '--cancel-file', cancelFile], {
      cwd: comfyRoot, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', CUDA_VISIBLE_DEVICES: '-1', HF_HUB_OFFLINE: '1', PIP_NO_INDEX: '1' },
    });
    let stderr = '';
    let spawnError: Error | null = null;
    let cancellationFailure: Error | null = null;
    let cancellationWrite: Promise<void> | null = null;
    let timedOut = false;
    const stop = () => {
      // The venv launcher may own a second Python process on Windows. Its
      // worker observes this file and exits before the launcher closes.
      cancellationWrite ??= writeFile(cancelFile, '').catch(error => { cancellationFailure = error; });
    };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const timer = setTimeout(() => { timedOut = true; stop(); }, 90_000);
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8192); });
    child.once('error', error => { spawnError = error; });
    child.once('close', async code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      await cancellationWrite;
      if (cancellationFailure) return reject(new Error('The managed PyAV worker could not be signaled to stop.'));
      if (signal?.aborted) return reject(new DOMException('Last-frame export canceled.', 'AbortError'));
      if (timedOut) return reject(new Error('Timed out decoding the final video frame; the managed worker has exited.'));
      if (spawnError) return reject(spawnError);
      if (code === 124) return reject(new Error('Managed PyAV watchdog timed out decoding the final video frame. Use a shorter or repaired video.'));
      if (code !== 0) {
        let message = stderr.trim() || `Managed PyAV exited with code ${code ?? 'unknown'}`;
        try { message = String(JSON.parse(message).error || message); } catch { /* Preserve a bounded native diagnostic. */ }
        return reject(new Error(message));
      }
      resolve();
    });
  });
}
