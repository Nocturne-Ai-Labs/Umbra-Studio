import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { copyFileExclusive } from './FsTransferCopy';
import { fetchModelDownload } from './ModelDownloadHttp';
import { fetchModelMedia } from './ModelManagerMediaHttp';
import { ModelDownloadJournal, downloadFileIdentity, type DownloadReceipt } from './ModelDownloadJournal';
import { MODEL_ARTIFACT_DIR, MODEL_SNAPSHOT_SUFFIX, reserveUniqueModelDownloadPath } from './ModelDownloadDestination';

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
  | { id: string; type: 'list'; payload: Record<string, never> }
  | { id: string; type: 'dismiss'; payload: { jobIds: string[] } }
  | {
      id: string;
      type: 'start';
      payload: {
        jobId: string;
        downloadUrl: string;
        fileName: string;
        modelType: string;
        destinationRoot: string;
        allowedRootRealPath: string;
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
const reservedDestinations = new Set<string>();
const MAX_JOBS = 512;
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_PENDING_DOWNLOADS = 128;
const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;
const MODEL_THUMB_SUFFIX = '.umbra-model-thumb';
const THUMB_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/x-ms-bmp', 'image/avif']);
const BINARY_MODEL_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.onnx', '.gguf', '.engine']);
const journal = new ModelDownloadJournal(process.env.UMBRA_ROOT || '');
const receipts = new Map<string, DownloadReceipt>();
const downloadQueue: Array<{ jobId: string; allowedRootRealPath: string; civitaiToken: string; snapshot: unknown }> = [];
let activeDownloads = 0;

function getModelArtifactDir(destinationPath: string): string {
  return join(dirname(destinationPath), MODEL_ARTIFACT_DIR);
}

function getModelArtifactBaseName(destinationPath: string): string {
  return basename(destinationPath);
}

function isInsideRoot(root: string, path: string): boolean {
  const offset = relative(root, path);
  return offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`));
}

async function assertDestinationAllowed(path: string, allowedRootRealPath: string): Promise<string> {
  const actualPath = await fs.realpath(path);
  if (!isInsideRoot(allowedRootRealPath, actualPath)) throw new Error('Download destination moved outside its model root');
  return actualPath;
}

async function ensureModelArtifactDir(destinationPath: string, allowedRootRealPath: string): Promise<string> {
  await assertDestinationAllowed(dirname(destinationPath), allowedRootRealPath);
  const artifactDir = getModelArtifactDir(destinationPath);
  await fs.mkdir(artifactDir, { recursive: true });
  const stat = await fs.lstat(artifactDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Model artifact folder is not a regular directory');
  await assertDestinationAllowed(artifactDir, allowedRootRealPath);
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
  allowedRootRealPath: string,
  civitaiToken?: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalizedUrl = pickString(imageUrl);
  if (!normalizedUrl) return '';

  try {
    const { bytes, mimeType } = await fetchModelMedia(normalizedUrl, civitaiToken, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 5000,
      signal,
    });
    if (!THUMB_MIME_TYPES.has(mimeType)) return '';
    const extension = inferThumbExtension(normalizedUrl, mimeType);
    const artifactDir = await ensureModelArtifactDir(destinationPath, allowedRootRealPath);
    const thumbPath = join(artifactDir, `${getModelArtifactBaseName(destinationPath)}${MODEL_THUMB_SUFFIX}${extension}`);
    await fs.writeFile(thumbPath, bytes, { flag: 'wx' });
    return thumbPath;
  } catch {
    return '';
  }
}

async function persistModelSnapshot(
  job: ModelDownloadJob,
  snapshotRaw: unknown,
  allowedRootRealPath: string,
  civitaiToken?: string,
  signal?: AbortSignal,
) {
  const snapshot = toRecord(snapshotRaw);
  if (Object.keys(snapshot).length <= 0) return;

  const imageUrl = extractSnapshotImageUrl(snapshot);
  const payload: Record<string, unknown> = {
    ...snapshot,
    file: { ...toRecord(snapshot.file), downloadUrl: undefined },
    snapshotVersion: 1,
    source: 'civitai',
    capturedAt: Number(snapshot.capturedAt || Date.now()),
    savedAt: Date.now(),
    download: {
      destinationPath: job.destinationPath,
      destinationFolder: job.destinationFolder,
      modelType: job.modelType,
      fileName: basename(job.destinationPath),
      bytesTotal: job.bytesTotal,
      bytesDownloaded: job.bytesDownloaded,
      completedAt: Date.now(),
    },
  };

  const artifactDir = await ensureModelArtifactDir(job.destinationPath, allowedRootRealPath);
  const snapshotPath = join(artifactDir, `${getModelArtifactBaseName(job.destinationPath)}${MODEL_SNAPSHOT_SUFFIX}`);
  const thumbnailPath = imageUrl
    ? await saveSnapshotThumbnail(imageUrl, job.destinationPath, allowedRootRealPath, civitaiToken, signal)
    : '';
  if (thumbnailPath) payload.localThumbnailPath = thumbnailPath;
  await assertDestinationAllowed(artifactDir, allowedRootRealPath);
  await fs.writeFile(snapshotPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
}

function sanitizeFileName(input: string): string {
  const value = basename(String(input || '').trim()) || 'model';
  // Dot-only names resolve to the destination directory or its parent. Windows
  // also strips trailing dots/spaces and reserves device names even with an extension.
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '') || 'model';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(normalized) ? `_${normalized}` : normalized;
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

function toPublicJob(job: ModelDownloadJob) {
  return {
    ...job,
    downloadUrl: '',
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

async function runDownload(jobId: string, allowedRootRealPath: string, civitaiToken?: string, snapshotRaw?: unknown) {
  const job = jobs.get(jobId);
  if (!job) return;

  const controller = new AbortController();
  jobControllers.set(jobId, controller);
  job.status = 'downloading';
  job.startedAt = Date.now();
  job.error = '';

  let targetPath = '';
  let tempPath = '';
  let committed = false;
  let downloadTimedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const receipt = receipts.get(jobId)!;
  const stopIdleTimer = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = undefined; };
  const waitForNetwork = () => {
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      downloadTimedOut = true;
      controller.abort(new Error('Model download stalled: no network data for two minutes.'));
    }, DOWNLOAD_IDLE_TIMEOUT_MS);
  };
  try {
    const requestedDir = job.useExactDestination ? job.destinationRoot : join(job.destinationRoot, normalizeCivitaiType(job.modelType));
    if (job.useExactDestination) {
      const exactStat = await fs.stat(requestedDir);
      if (!exactStat.isDirectory()) throw new Error('Download destination is no longer a folder');
    } else {
      await assertDestinationAllowed(job.destinationRoot, allowedRootRealPath);
      await fs.mkdir(requestedDir, { recursive: true });
    }
    controller.signal.throwIfAborted();
    const destinationDir = await assertDestinationAllowed(requestedDir, allowedRootRealPath);
    job.destinationFolder = destinationDir;
    targetPath = reserveUniqueModelDownloadPath(join(destinationDir, sanitizeFileName(job.fileName || 'model.safetensors')), reservedDestinations);
    tempPath = `${targetPath}.${randomUUID()}.part`;
    job.destinationPath = targetPath;
    receipt.partial = tempPath;
    receipt.directory = await fs.realpath(destinationDir);
    journal.save(receipt);
    waitForNetwork();
    const response = await fetchModelDownload(job.downloadUrl, civitaiToken, controller.signal);
    stopIdleTimer();
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`CivitAI download failed (${response.status})`);
    }
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const isDocument = contentType === 'text/html' || contentType === 'application/xhtml+xml';
    const isTextForBinaryModel = BINARY_MODEL_EXTENSIONS.has(extname(job.fileName).toLowerCase())
      && (contentType.startsWith('text/') || contentType === 'application/json'
        || contentType.endsWith('+json') || contentType === 'application/xml' || contentType.endsWith('+xml'));
    if (isDocument || isTextForBinaryModel) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`CivitAI returned a ${contentType || 'document'} response instead of a model file`);
    }

    const totalHeader = Number(response.headers.get('content-length') || '0');
    const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    if ((!contentEncoding || contentEncoding === 'identity') && Number.isFinite(totalHeader) && totalHeader > 0) {
      job.bytesTotal = Math.floor(totalHeader);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Download stream unavailable');
    }

    await assertDestinationAllowed(destinationDir, allowedRootRealPath);
    const fileHandle = await fs.open(tempPath, 'wx');
    try {
      receipt.partialIdentity = downloadFileIdentity(await fileHandle.stat({ bigint: true }));
      journal.save(receipt);
      let lastSaved = Date.now();
      while (true) {
        controller.signal.throwIfAborted();
        waitForNetwork();
        const chunk = await reader.read();
        stopIdleTimer();
        if (chunk.done) break;
        const value = chunk.value;
        if (!value || value.byteLength <= 0) continue;
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await fileHandle.write(value, offset, value.byteLength - offset);
          if (!bytesWritten) throw new Error('Download destination stopped accepting data');
          offset += bytesWritten;
        }
        job.bytesDownloaded += value.byteLength;
        if (job.bytesTotal > 0) {
          job.progress = Math.max(0, Math.min(100, (job.bytesDownloaded / job.bytesTotal) * 100));
        }
        if (Date.now() - lastSaved >= 2000) { journal.save(receipt); lastSaved = Date.now(); }
      }
      if (job.bytesTotal > 0 && job.bytesDownloaded !== job.bytesTotal) throw new Error('Incomplete model download');
      if (!job.bytesDownloaded) throw new Error('Empty model download');
      await fileHandle.sync();
      receipt.partialIdentity = downloadFileIdentity(await fileHandle.stat({ bigint: true }));
      receipt.phase = 'ready';
      journal.save(receipt);
    } finally {
      await fileHandle.close();
      await reader.cancel().catch(() => undefined);
    }

    controller.signal.throwIfAborted();
    await assertDestinationAllowed(destinationDir, allowedRootRealPath);
    // A hard link publishes the finished file without replacing a late arrival.
    // Filesystems without link support use an exclusive copy instead.
    while (true) {
      try {
        try { await fs.link(tempPath, targetPath); }
        catch (error: any) {
          if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error?.code)) throw error;
          await copyFileExclusive(tempPath, targetPath, () => controller.signal.throwIfAborted(), (stat) => {
            receipt.phase = 'copying';
            receipt.targetIdentity = downloadFileIdentity(stat);
            journal.save(receipt);
          });
        }
        break;
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
        reservedDestinations.delete(targetPath.toLowerCase());
        targetPath = reserveUniqueModelDownloadPath(targetPath, reservedDestinations);
        job.destinationPath = targetPath;
        receipt.phase = 'ready';
        receipt.targetIdentity = undefined;
        journal.save(receipt);
        controller.signal.throwIfAborted();
      }
    }
    committed = true;
    receipt.targetIdentity = downloadFileIdentity(await fs.lstat(targetPath, { bigint: true }));
    receipt.phase = 'published';
    journal.save(receipt);
    await persistModelSnapshot(job, snapshotRaw, allowedRootRealPath, civitaiToken, controller.signal).catch((error) => {
      job.error = `Model saved, but metadata could not be saved: ${(error as Error).message}`;
    });
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = Date.now();
  } catch (error: any) {
    const isAbort = !downloadTimedOut && (controller.signal.aborted || String(error?.name || '').toLowerCase() === 'aborterror');
    if (committed) {
      job.status = 'completed';
      job.progress = 100;
      job.finishedAt = Date.now();
    } else if (isAbort) {
      job.status = 'cancelled';
      job.cancelledAt = Date.now();
      job.error = 'Cancelled';
    } else {
      job.status = 'failed';
      job.error = downloadTimedOut ? 'Model download stalled: no network data for two minutes.' : String(error?.message || 'Download failed');
      job.finishedAt = Date.now();
    }
  } finally {
    stopIdleTimer();
    controller.abort();
    try {
      await journal.cleanup(receipt);
      receipt.recoveryPending = false;
    } catch (error) {
      receipt.recoveryPending = true;
      job.error = `${job.error || 'Model saved.'} Partial cleanup needs attention: ${(error as Error).message}`;
    }
    try { journal.save(receipt); }
    catch { console.error('[ModelDownloadWorker] Could not persist final download status; recovery record retained.'); }
    if (targetPath) reservedDestinations.delete(targetPath.toLowerCase());
    jobControllers.delete(jobId);
  }
}

function drainDownloadQueue() {
  while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const next = downloadQueue.shift()!;
    if (jobs.get(next.jobId)?.status !== 'queued') continue;
    activeDownloads += 1;
    void runDownload(next.jobId, next.allowedRootRealPath, next.civitaiToken, next.snapshot)
      .finally(() => {
        activeDownloads -= 1;
        drainDownloadQueue();
      });
  }
}

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const removable = Array.from(jobs.values())
    .filter((job) => job.status !== 'queued' && job.status !== 'downloading' && !receipts.get(job.jobId)?.recoveryPending)
    .sort((a, b) => a.createdAt - b.createdAt);
  while (jobs.size > MAX_JOBS && removable.length > 0) {
    const next = removable.shift();
    if (!next) break;
    jobs.delete(next.jobId);
    receipts.delete(next.jobId);
    journal.remove(next.jobId);
  }
}

async function handleRequest(request: ModelDownloadWorkerRequest) {
  switch (request.type) {
    case 'list': return { jobs: Array.from(jobs.values(), toPublicJob) };
    case 'dismiss': {
      const removed: string[] = [];
      for (const id of request.payload.jobIds.slice(0, MAX_JOBS)) {
        const job = jobs.get(id);
        if (!job || job.status === 'queued' || job.status === 'downloading' || jobControllers.has(id)) continue;
        const receipt = receipts.get(id);
        if (receipt?.recoveryPending) continue;
        journal.remove(id);
        receipts.delete(id);
        jobs.delete(id);
        removed.push(id);
      }
      return { removed };
    }
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
      const allowedRootRealPath = String(payload.allowedRootRealPath || '').trim();
      if (!isAbsolute(allowedRootRealPath)) throw new Error('Missing canonical model root');
      if (downloadQueue.length >= MAX_PENDING_DOWNLOADS) throw new Error('Too many model downloads are waiting');

      const receipt: DownloadReceipt = { job, phase: 'downloading', recoveryPending: true };
      journal.save(receipt);
      receipts.set(jobId, receipt);
      jobs.set(jobId, job);
      pruneJobs();
      downloadQueue.push({ jobId, allowedRootRealPath, civitaiToken: String(payload.civitaiToken || '').trim(), snapshot: payload.snapshot });
      drainDownloadQueue();
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
        const queueIndex = downloadQueue.findIndex(entry => entry.jobId === jobId);
        if (queueIndex >= 0) downloadQueue.splice(queueIndex, 1);
        job.status = 'cancelled';
        job.cancelledAt = Date.now();
        job.error = 'Cancelled';
        const receipt = receipts.get(jobId);
        if (receipt) {
          receipt.recoveryPending = false;
          journal.save(receipt);
        }
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
for (const receipt of await journal.recover()) {
  receipts.set(receipt.job.jobId, receipt);
  jobs.set(receipt.job.jobId, { ...receipt.job, useExactDestination: true });
  receipt.job = jobs.get(receipt.job.jobId)!;
}
pruneJobs();

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
