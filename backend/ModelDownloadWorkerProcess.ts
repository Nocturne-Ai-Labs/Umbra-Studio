import { basename, dirname, extname, join } from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

type ModelDownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

type ModelDownloadJob = {
  jobId: string;
  status: ModelDownloadJobStatus;
  downloadUrl: string;
  fileName: string;
  modelType: string;
  destinationRoot: string;
  useExactDestination: boolean;
  destinationFolder: string;
  destinationPath: string;
  bytesTotal: number;
  bytesDownloaded: number;
  progress: number;
  error?: string;
  startedAt: number;
  finishedAt: number;
  cancelledAt: number;
  createdAt: number;
};

type ModelDownloadWorkerRequest =
  | {
      id: string;
      type: 'start';
      payload: {
        jobId: string;
        downloadUrl: string;
        fileName: string;
        modelType: string;
        destinationRoot: string;
        useExactDestination?: boolean;
        civitaiToken?: string;
        snapshot?: unknown;
      };
    }
  | {
      id: string;
      type: 'status';
      payload: {
        jobId: string;
      };
    }
  | {
      id: string;
      type: 'cancel';
      payload: {
        jobId: string;
      };
    };

type ModelDownloadWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string };

const jobs = new Map<string, ModelDownloadJob>();
const jobControllers = new Map<string, AbortController>();
const MAX_JOBS = 512;
const MODEL_SNAPSHOT_SUFFIX = '.umbra-model.json';
const MODEL_THUMB_SUFFIX = '.umbra-model-thumb';
const MODEL_ARTIFACT_DIR = '.umbra';

function getModelArtifactDir(destinationPath: string): string {
  return join(dirname(destinationPath), MODEL_ARTIFACT_DIR);
}

function getModelArtifactBaseName(destinationPath: string): string {
  return basename(destinationPath);
}

async function ensureModelArtifactDir(destinationPath: string): Promise<string> {
  const artifactDir = getModelArtifactDir(destinationPath);
  await fs.mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

function writeResponse(response: ModelDownloadWorkerResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function extractSnapshotImageUrl(snapshot: Record<string, unknown>): string {
  const candidates: unknown[] = [];
  const primaryImage = toRecord(snapshot.primaryImage);
  if (primaryImage.url) candidates.push(primaryImage.url);

  const file = toRecord(snapshot.file);
  const filePreviewImage = toRecord(file.previewImage);
  if (filePreviewImage.url) candidates.push(filePreviewImage.url);

  const version = toRecord(snapshot.version);
  const versionImages = Array.isArray(version.images) ? version.images : [];
  for (const entry of versionImages) {
    const image = toRecord(entry);
    if (image.url) {
      candidates.push(image.url);
      break;
    }
  }

  const model = toRecord(snapshot.model);
  const modelImages = Array.isArray(model.images) ? model.images : [];
  for (const entry of modelImages) {
    const image = toRecord(entry);
    if (image.url) {
      candidates.push(image.url);
      break;
    }
  }

  for (const candidate of candidates) {
    const text = pickString(candidate);
    if (text) return text;
  }
  return '';
}

function inferThumbExtension(urlValue: string, contentType: string): string {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('bmp')) return '.bmp';
  if (ct.includes('avif')) return '.avif';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';

  const lower = String(urlValue || '').toLowerCase();
  const knownExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'];
  for (const ext of knownExts) {
    if (lower.includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.jpg';
}

async function saveSnapshotThumbnail(
  imageUrl: string,
  destinationPath: string,
  civitaiToken?: string,
): Promise<string> {
  const normalizedUrl = pickString(imageUrl);
  if (!normalizedUrl) return '';

  try {
    const headers = new Headers();
    headers.set('User-Agent', 'UmbraStudio/0.8');
    const token = pickString(civitaiToken);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(normalizedUrl, { method: 'GET', headers });
    if (!response.ok) return '';
    const bytes = await response.arrayBuffer();
    if (!bytes || bytes.byteLength <= 0) return '';

    const extension = inferThumbExtension(normalizedUrl, String(response.headers.get('content-type') || ''));
    const artifactDir = await ensureModelArtifactDir(destinationPath);
    const thumbPath = join(artifactDir, `${getModelArtifactBaseName(destinationPath)}${MODEL_THUMB_SUFFIX}${extension}`);
    await fs.writeFile(thumbPath, Buffer.from(bytes));
    return thumbPath;
  } catch {
    return '';
  }
}

async function persistModelSnapshot(
  job: ModelDownloadJob,
  snapshotRaw: unknown,
  civitaiToken?: string,
) {
  const snapshot = toRecord(snapshotRaw);
  if (Object.keys(snapshot).length <= 0) return;

  const imageUrl = extractSnapshotImageUrl(snapshot);
  const thumbnailPath = imageUrl
    ? await saveSnapshotThumbnail(imageUrl, job.destinationPath, civitaiToken)
    : '';

  const payload: Record<string, unknown> = {
    ...snapshot,
    snapshotVersion: 1,
    source: 'civitai',
    capturedAt: Number(snapshot.capturedAt || Date.now()),
    savedAt: Date.now(),
    download: {
      destinationPath: job.destinationPath,
      destinationFolder: job.destinationFolder,
      modelType: job.modelType,
      fileName: basename(job.destinationPath),
      downloadUrl: job.downloadUrl,
      bytesTotal: job.bytesTotal,
      bytesDownloaded: job.bytesDownloaded,
      completedAt: Date.now(),
    },
  };

  if (thumbnailPath) {
    payload.localThumbnailPath = thumbnailPath;
  }

  const artifactDir = await ensureModelArtifactDir(job.destinationPath);
  const snapshotPath = join(artifactDir, `${getModelArtifactBaseName(job.destinationPath)}${MODEL_SNAPSHOT_SUFFIX}`);
  await fs.writeFile(snapshotPath, JSON.stringify(payload, null, 2), 'utf8');
}

function sanitizeFileName(input: string): string {
  const value = basename(String(input || '').trim()) || 'model';
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return normalized || 'model';
}

function normalizeCivitaiType(input: string): string {
  const value = String(input || '').trim().toLowerCase();
  if (value.includes('checkpoint')) return 'Checkpoints';
  if (value.includes('lora')) return 'Lora';
  if (value.includes('lycoris')) return 'Lycoris';
  if (value.includes('textual') || value.includes('embedding')) return 'TextualInversion';
  if (value === 'vae' || value.includes('vae')) return 'VAE';
  if (value.includes('control')) return 'ControlNet';
  if (value.includes('upscaler')) return 'Upscaler';
  if (value.includes('hypernetwork')) return 'Hypernetwork';
  return 'Other';
}

function resolveUniqueDestinationPath(targetPath: string): string {
  if (!existsSync(targetPath)) return targetPath;
  const parent = dirname(targetPath);
  const ext = extname(targetPath);
  const stem = basename(targetPath, ext);
  let index = 1;
  let candidate = targetPath;
  while (existsSync(candidate)) {
    candidate = join(parent, `${stem} (${index})${ext}`);
    index += 1;
  }
  return candidate;
}

function toPublicJob(job: ModelDownloadJob) {
  return {
    ...job,
    progress: Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(job.progress)
          ? Math.round(job.progress)
          : (
            job.bytesTotal > 0
              ? Math.round((job.bytesDownloaded / job.bytesTotal) * 100)
              : 0
          ),
      ),
    ),
  };
}

async function runDownload(jobId: string, civitaiToken?: string, snapshotRaw?: unknown) {
  const job = jobs.get(jobId);
  if (!job) return;

  const controller = new AbortController();
  jobControllers.set(jobId, controller);
  job.status = 'downloading';
  job.startedAt = Date.now();
  job.error = '';

  const destinationFolderName = normalizeCivitaiType(job.modelType);
  const destinationDir = job.useExactDestination
    ? job.destinationRoot
    : join(job.destinationRoot, destinationFolderName);
  await fs.mkdir(destinationDir, { recursive: true });
  job.destinationFolder = destinationDir;

  const safeFileName = sanitizeFileName(job.fileName || 'model.safetensors');
  const targetPath = resolveUniqueDestinationPath(join(destinationDir, safeFileName));
  const tempPath = `${targetPath}.part`;
  job.destinationPath = targetPath;
  job.bytesDownloaded = 0;
  job.bytesTotal = 0;
  job.progress = 0;

  try {
    const headers = new Headers();
    headers.set('User-Agent', 'UmbraStudio/0.8');
    const normalizedToken = String(civitaiToken || '').trim();
    if (normalizedToken) {
      headers.set('Authorization', `Bearer ${normalizedToken}`);
    }

    const response = await fetch(job.downloadUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const fallbackText = await response.text().catch(() => '');
      throw new Error(`CivitAI download failed (${response.status})${fallbackText ? `: ${fallbackText.slice(0, 160)}` : ''}`);
    }

    const totalHeader = Number(response.headers.get('content-length') || '0');
    if (Number.isFinite(totalHeader) && totalHeader > 0) {
      job.bytesTotal = Math.floor(totalHeader);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Download stream unavailable');
    }

    const fileHandle = await fs.open(tempPath, 'w');
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const value = chunk.value;
        if (!value || value.byteLength <= 0) continue;
        await fileHandle.write(value);
        job.bytesDownloaded += value.byteLength;
        if (job.bytesTotal > 0) {
          job.progress = Math.max(0, Math.min(100, (job.bytesDownloaded / job.bytesTotal) * 100));
        }
      }
    } finally {
      await fileHandle.close();
    }

    await fs.rename(tempPath, targetPath);
    await persistModelSnapshot(job, snapshotRaw, civitaiToken).catch(() => undefined);
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = Date.now();
  } catch (error: any) {
    const isAbort = controller.signal.aborted || String(error?.name || '').toLowerCase() === 'aborterror';
    if (isAbort) {
      job.status = 'cancelled';
      job.cancelledAt = Date.now();
      job.error = 'Cancelled';
    } else {
      job.status = 'failed';
      job.error = String(error?.message || 'Download failed');
      job.finishedAt = Date.now();
    }
    await fs.unlink(tempPath).catch(() => undefined);
  } finally {
    jobControllers.delete(jobId);
  }
}

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const removable = Array.from(jobs.values())
    .filter((job) => job.status !== 'queued' && job.status !== 'downloading')
    .sort((a, b) => a.createdAt - b.createdAt);
  while (jobs.size > MAX_JOBS && removable.length > 0) {
    const next = removable.shift();
    if (!next) break;
    jobs.delete(next.jobId);
  }
}

async function handleRequest(request: ModelDownloadWorkerRequest) {
  switch (request.type) {
    case 'start': {
      const payload = request.payload;
      const jobId = String(payload.jobId || '').trim();
      if (!jobId) {
        throw new Error('Missing jobId');
      }
      if (jobs.has(jobId)) {
        return { job: toPublicJob(jobs.get(jobId)!) };
      }
      const now = Date.now();
      const job: ModelDownloadJob = {
        jobId,
        status: 'queued',
        downloadUrl: String(payload.downloadUrl || '').trim(),
        fileName: String(payload.fileName || '').trim(),
        modelType: String(payload.modelType || '').trim(),
        destinationRoot: String(payload.destinationRoot || '').trim(),
        useExactDestination: payload.useExactDestination === true,
        destinationFolder: '',
        destinationPath: '',
        bytesTotal: 0,
        bytesDownloaded: 0,
        progress: 0,
        error: '',
        startedAt: 0,
        finishedAt: 0,
        cancelledAt: 0,
        createdAt: now,
      };

      if (!job.downloadUrl) throw new Error('Missing download URL');
      if (!job.destinationRoot) throw new Error('Missing destination root');

      jobs.set(jobId, job);
      pruneJobs();
      void runDownload(jobId, String(payload.civitaiToken || '').trim(), payload.snapshot);
      return { job: toPublicJob(job) };
    }
    case 'status': {
      const jobId = String(request.payload.jobId || '').trim();
      const job = jobs.get(jobId);
      if (!job) return { job: null };
      return { job: toPublicJob(job) };
    }
    case 'cancel': {
      const jobId = String(request.payload.jobId || '').trim();
      const job = jobs.get(jobId);
      if (!job) {
        return { success: false, error: 'Job not found' };
      }
      const controller = jobControllers.get(jobId);
      if (controller && !controller.signal.aborted) {
        controller.abort();
      } else if (job.status === 'queued') {
        job.status = 'cancelled';
        job.cancelledAt = Date.now();
        job.error = 'Cancelled';
      }
      return { success: true, job: toPublicJob(job) };
    }
    default:
      throw new Error('Unsupported request type');
  }
}

async function processLine(line: string) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;

  let parsed: ModelDownloadWorkerRequest;
  try {
    parsed = JSON.parse(trimmed) as ModelDownloadWorkerRequest;
  } catch (error: any) {
    writeResponse({
      id: 'unknown',
      ok: false,
      error: `Invalid JSON: ${error?.message || 'parse error'}`,
    });
    return;
  }

  try {
    const result = await handleRequest(parsed);
    writeResponse({
      id: parsed.id,
      ok: true,
      result,
    });
  } catch (error: any) {
    writeResponse({
      id: parsed.id,
      ok: false,
      error: error?.message || 'Model download worker error',
      stack: error?.stack,
    });
  }
}

const decoder = new TextDecoder();
let buffer = '';

process.stdin.on('data', (chunk: Buffer) => {
  buffer += decoder.decode(chunk, { stream: true });
  while (true) {
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) break;
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    void processLine(line);
  }
});

process.stdin.on('end', () => {
  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.trim()) {
    void processLine(buffer);
  }
});
