import type { spawn } from 'node:child_process';
import { runFfmpegPreview } from '../backend/FfmpegPreviewProcess';

type Options = { spawnProcess?: typeof spawn; timeoutMs?: number; format?: 'png' | 'webp' | 'jpeg'; quality?: number };

export async function extractVideoFrame(
  path: string, size: number, fit: 'cover' | 'contain', options: Options = {},
): Promise<Buffer> {
  const pixels = Math.max(16, Math.min(2048, Math.round(size) || 256));
  const scale = fit === 'cover'
    ? `crop='min(iw,ih)':'min(iw,ih)',scale=${pixels}:${pixels}:flags=lanczos`
    : `scale=${pixels}:${pixels}:force_original_aspect_ratio=decrease:flags=lanczos`;
  const maxBytes = pixels * pixels * 4 + 65536;
  const timeoutMs = options.timeoutMs ?? 10000;

  const quality = Math.max(1, Math.min(100, Math.round(options.quality ?? 100) || 100));
  const encoding = options.format === 'webp'
    ? ['-vcodec', 'libwebp', '-q:v', String(quality), '-compression_level', '6']
    : options.format === 'jpeg' ? ['-vcodec', 'mjpeg', '-q:v', '1']
      : ['-pix_fmt', 'rgba', '-vcodec', 'png'];
  const attempt = (position: string) => runFfmpegPreview([
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-threads', '1', '-ss', position, '-i', path,
      '-map', '0:v:0', '-an', '-sn', '-dn', '-frames:v', '1',
      '-filter_threads', '1', '-vf', scale,
      '-threads', '1', '-f', 'image2pipe', ...encoding, 'pipe:1',
    ], { maxBytes, timeoutMs, spawnProcess: options.spawnProcess });

  // Some valid clips contain no frame at 0.15 seconds. Retry only that empty,
  // successful extraction, never corrupt-input, timeout or size-limit failures.
  const frame = await attempt('0.15') ?? await attempt('0');
  if (!frame) throw new Error('Video contains no decodable frame');
  return frame;
}
