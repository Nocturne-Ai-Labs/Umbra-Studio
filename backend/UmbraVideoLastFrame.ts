import { randomUUID } from 'node:crypto';
import { copyFile, link, mkdir, open, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { resolveAllowedGalleryPath } from './GalleryPathAccess';
import { runFfmpegPreview } from './FfmpegPreviewProcess';
import { resolveUmbraExtendedVideoFfmpeg } from './UmbraUiExtendedVideoService';

const exportsInFlight = new Map<string, Promise<string>>();
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
  const parent = dirname(video);
  let directory = await resolveAllowedGalleryPath(join(parent, 'Last Frames'), [parent]);
  if (!directory) throw new Error('The last-frame folder is outside the video output folder.');
  await mkdir(directory, { recursive: true });
  directory = await resolveAllowedGalleryPath(join(parent, 'Last Frames'), [parent]);
  if (!directory) throw new Error('The last-frame folder is outside the video output folder.');
  const temporary = join(directory, `.last-frame-${randomUUID()}.png`);
  try {
    // Decode only the tail and overwrite our private staging PNG until the final
    // encoded frame. This also respects ping-pong and audio-cropped videos.
    await runFfmpegPreview([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-sseof', '-1', '-i', video,
      '-map', '0:v:0', '-an', '-sn', '-vsync', '0', '-threads', '1',
      '-compression_level', '1', '-update', '1', '-f', 'image2', temporary,
    ], { executable: resolveUmbraExtendedVideoFfmpeg(options.comfyRoot), maxBytes: 1024, timeoutMs: 60_000, signal: options.signal });
    options.signal?.throwIfAborted();
    const file = await open(temporary, 'r');
    try {
      const header = Buffer.alloc(24);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (bytesRead !== 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)
        || !header.readUInt32BE(16) || !header.readUInt32BE(20)) throw new Error('No last frame was decoded from the completed video.');
    } finally { await file.close(); }
    const stem = `${basename(video, extname(video))}-last-frame`;
    for (let attempt = 0; attempt < 1000; attempt++) {
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
  }
}
