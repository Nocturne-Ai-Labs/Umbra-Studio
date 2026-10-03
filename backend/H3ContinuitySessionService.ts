import { open, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { mediaFileRevision } from './mediaFileRevision';

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv']);
const MAX_CLIP_JSON_BYTES = 64 * 1024;
const MAX_SESSION_RESPONSE_BYTES = 16 * 1024 * 1024;

export class H3ContinuitySessionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function isH3ContinuityId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Empty ComfyUI continuity response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SESSION_RESPONSE_BYTES) throw new Error('ComfyUI continuity response is too large.');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

async function readClipMetadata(path: string): Promise<Record<string, unknown> | null> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 2 || info.size > MAX_CLIP_JSON_BYTES) return null;
    const bytes = Buffer.alloc(MAX_CLIP_JSON_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== info.size) return null;
    const data = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } finally {
    await file.close();
  }
}

export interface H3ContinuitySessionOptions {
  session: string;
  selected?: string;
  comfyBaseUrl: string;
  outputRoot: string;
  appRoot: string;
  canReadThumbnailPath: (path: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

async function previewForClip(
  clip: Record<string, unknown>, options: H3ContinuitySessionOptions,
  physicalOutputRoot: string,
): Promise<{ thumbnailUrl: string | null; filename: string }> {
  const unavailable = { thumbnailUrl: null, filename: '' };
  const clipId = clip.clip_id;
  if (typeof clipId !== 'string' || !isH3ContinuityId(clipId)) return unavailable;
  try {
    const continuityRoot = await realpath(join(options.outputRoot, 'df_h3_continuity'));
    const clipDirectory = await realpath(join(continuityRoot, options.session, clipId));
    if (!isWithin(physicalOutputRoot, continuityRoot) || !isWithin(continuityRoot, clipDirectory)) return unavailable;
    const metadataPath = await realpath(join(clipDirectory, 'clip.json'));
    if (relative(clipDirectory, metadataPath) !== 'clip.json') return unavailable;
    const metadata = await readClipMetadata(metadataPath);
    if (metadata?.session !== options.session || metadata.clip_id !== clipId || metadata.status !== 'ready') return unavailable;
    const outputPath = metadata.output_path;
    if (typeof outputPath !== 'string' || !isAbsolute(outputPath)
      || !VIDEO_EXTENSIONS.has(extname(outputPath).toLowerCase())) return unavailable;
    const videoPath = await realpath(outputPath);
    if (!isWithin(physicalOutputRoot, videoPath) || !VIDEO_EXTENSIONS.has(extname(videoPath).toLowerCase())) return unavailable;
    const video = await stat(videoPath);
    if (!video.isFile() || video.size === 0) return unavailable;
    const outputRelativePath = relative(resolve(options.appRoot), resolve(options.outputRoot)).split(sep).join('/');
    if (outputRelativePath !== 'Tools/ComfyUI/output') return unavailable;
    const videoRelativePath = relative(physicalOutputRoot, videoPath);
    if (!videoRelativePath || videoRelativePath === '..' || videoRelativePath.startsWith(`..${sep}`)
      || isAbsolute(videoRelativePath)) return unavailable;
    const clientPath = `${outputRelativePath}/${videoRelativePath.split(sep).join('/')}`;
    if (!await options.canReadThumbnailPath(clientPath)) return unavailable;
    const params = new URLSearchParams({ path: clientPath, size: 'small', q: '70', rev: mediaFileRevision(video) });
    return { thumbnailUrl: `/api/fs/thumbnail?${params.toString()}`, filename: basename(outputPath) };
  } catch {
    return unavailable;
  }
}

export async function getH3ContinuitySession(options: H3ContinuitySessionOptions): Promise<Record<string, unknown>> {
  if (!isH3ContinuityId(options.session) || options.session === '_imports'
    || (options.selected !== undefined && !isH3ContinuityId(options.selected))) {
    throw new H3ContinuitySessionError('Invalid continuity session or selected checkpoint ID.', 400);
  }
  const target = new URL(`/df_h3_continuity/session/${encodeURIComponent(options.session)}`, options.comfyBaseUrl);
  if (options.selected) target.searchParams.set('selected', options.selected);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(target, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch {
    throw new H3ContinuitySessionError('Managed ComfyUI continuity session is unavailable.', 502);
  }
  let payload: unknown;
  try { payload = await readBoundedJson(response); }
  catch { throw new H3ContinuitySessionError('Invalid managed ComfyUI continuity response.', 502); }
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray((payload as Record<string, unknown>).clips)) {
    throw new H3ContinuitySessionError('Managed ComfyUI continuity session is unavailable.', 502);
  }
  const data = payload as Record<string, unknown>;
  const physicalOutputRoot = await realpath(options.outputRoot).catch(() => '');
  const clips = await Promise.all((data.clips as unknown[]).slice(0, 201).flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const clip = value as Record<string, unknown>;
    if (clip.status !== 'ready' || clip.session !== options.session
      || typeof clip.clip_id !== 'string' || !isH3ContinuityId(clip.clip_id)) return [];
    return [clip];
  }).map(async clip => {
    const { output_path: _outputPath, ...publicClip } = clip;
    return { ...publicClip, ...(physicalOutputRoot
      ? await previewForClip(clip, options, physicalOutputRoot)
      : { thumbnailUrl: null, filename: '' }) };
  }));
  return { ...data, clips };
}
