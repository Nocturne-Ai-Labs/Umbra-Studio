export type UmbraUiUpscaleItemStatus = 'staging' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type UmbraUiUpscaleJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'canceled';
export type UmbraUiUpscaleQueuePlacement = 'next' | 'end' | 'interrupt';

export interface UmbraUiUpscaleOutput {
  filename: string;
  subfolder: string;
  type: string;
  fullpath: string;
}

export interface UmbraUiUpscaleJobItem {
  id: string;
  clientSourceId?: string;
  name: string;
  sourcePath: string;
  status: UmbraUiUpscaleItemStatus;
  promptId: string;
  outputs: UmbraUiUpscaleOutput[];
  error: string;
}

export interface UmbraUiUpscaleJob {
  id: string;
  status: UmbraUiUpscaleJobStatus;
  modelName: string;
  maxDimension: number;
  outputFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
  outputFolder: string;
  queuePlacement: UmbraUiUpscaleQueuePlacement;
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  warning?: string;
  cancelRequested?: boolean;
  items: UmbraUiUpscaleJobItem[];
}

export interface UmbraUiUpscaleHandoff {
  path: string;
  name: string;
  imageUrl?: string;
  autoStart?: boolean;
  createdAt: number;
}

export interface UmbraUiUpscaleBatchHandoff {
  items: Array<Omit<UmbraUiUpscaleHandoff, 'createdAt'>>;
  createdAt: number;
}

export const UMBRA_UI_UPSCALE_HANDOFF_KEY = 'umbra-ui:pending-upscale-handoff';
export const UMBRA_UI_UPSCALE_ACTIVE_JOB_KEY = 'umbra-ui:active-upscale-job';

function createUpscaleStageBatchId(): string {
  try { return `upscale-${crypto.randomUUID()}`; } catch { return `upscale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

async function cleanupUmbraUiUpscaleStage(batchId: string): Promise<void> {
  if (!batchId) return;
  await fetch('/api/umbra-ui/upscale/stage/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  }).catch(() => undefined);
}

async function stageUmbraUiUpscaleFile(
  file: File,
  batchId: string,
  index: number,
): Promise<{ path: string; name: string }> {
  const form = new FormData();
  form.set('batchId', batchId);
  form.set('index', String(index));
  form.set('displayName', file.webkitRelativePath || file.name);
  form.set('file', file, file.name);
  const response = await fetch('/api/umbra-ui/upscale/stage', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.staged?.path) {
    throw new Error(String(payload?.error || `Failed to stage ${file.name} (${response.status}).`));
  }
  return {
    path: String(payload.staged.path),
    name: String(payload.staged.name || file.webkitRelativePath || file.name),
  };
}

export async function submitUmbraUiUpscaleJob(options: {
  paths?: string[];
  sourceIds?: Record<string, string>;
  folders?: string[];
  files?: File[];
  fileSourceIds?: string[];
  modelName: string;
  maxDimension: number;
  outputFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
  outputFolder?: string;
  pinnedOutputFolder?: string;
  queuePlacement?: UmbraUiUpscaleQueuePlacement;
  onStageProgress?: (completed: number, total: number) => void;
}): Promise<UmbraUiUpscaleJob> {
  const files = options.files || [];
  const batchId = files.length > 0 ? createUpscaleStageBatchId() : '';
  const staged: Array<{ path: string; name: string; clientSourceId: string }> = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const source = await stageUmbraUiUpscaleFile(files[index], batchId, index);
      staged.push({ ...source, clientSourceId: options.fileSourceIds?.[index] || '' });
      options.onStageProgress?.(index + 1, files.length);
    }
  } catch (error) {
    await cleanupUmbraUiUpscaleStage(batchId);
    throw error;
  }
  const form = new FormData();
  form.set('paths', JSON.stringify((options.paths || []).filter(Boolean)));
  form.set('sourceIds', JSON.stringify(options.sourceIds || {}));
  form.set('folders', JSON.stringify((options.folders || []).filter(Boolean)));
  form.set('staged', JSON.stringify(staged));
  form.set('modelName', options.modelName);
  form.set('maxDimension', String(options.maxDimension));
  form.set('outputFormat', options.outputFormat);
  form.set('quality', String(options.quality));
  form.set('pinnedOutputFolder', options.pinnedOutputFolder || '');
  form.set('outputFolder', String(options.outputFolder || '').trim());
  form.set('queuePlacement', String(options.queuePlacement || 'end'));
  const uncertainMessage = 'Upscale submission could not be confirmed. Staged files were retained; check the upscale queue before retrying.';
  let response: Response;
  let payload: any;
  try {
    response = await fetch('/api/umbra-ui/upscale', { method: 'POST', body: form });
    payload = await response.json();
  } catch {
    throw new Error(uncertainMessage);
  }
  if (response.status === 400 && payload?.success === false && typeof payload.error === 'string' && !payload.job) {
    await cleanupUmbraUiUpscaleStage(batchId);
    throw new Error(payload.error || 'Upscale request was rejected.');
  }
  if (!response.ok || payload?.success !== true || !payload.job || typeof payload.job !== 'object'
    || Array.isArray(payload.job) || typeof payload.job.id !== 'string' || !payload.job.id.trim()) {
    throw new Error(uncertainMessage);
  }
  return payload.job as UmbraUiUpscaleJob;
}

export class UmbraUiUpscaleStatusError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function fetchUmbraUiUpscaleJob(jobId: string, signal?: AbortSignal): Promise<UmbraUiUpscaleJob> {
  const response = await fetch(`/api/umbra-ui/upscale/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.job) {
    throw new UmbraUiUpscaleStatusError(String(payload?.error || `Upscale status failed (${response.status}).`), response.status);
  }
  return payload.job as UmbraUiUpscaleJob;
}

export function stageUmbraUiUpscaleHandoff(detail: Omit<UmbraUiUpscaleHandoff, 'createdAt'>) {
  const payload: UmbraUiUpscaleHandoff = { ...detail, createdAt: Date.now() };
  try { window.sessionStorage.setItem(UMBRA_UI_UPSCALE_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent('umbra:umbra-ui-upscale-handoff', { detail: payload }));
}

export function stageUmbraUiUpscaleBatchHandoff(items: Array<Omit<UmbraUiUpscaleHandoff, 'createdAt'>>) {
  const payload: UmbraUiUpscaleBatchHandoff = {
    items: items.filter((item) => String(item.path || '').trim()),
    createdAt: Date.now(),
  };
  if (payload.items.length === 0) throw new Error('Select at least one image to upscale.');
  try { window.sessionStorage.setItem(UMBRA_UI_UPSCALE_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent('umbra:umbra-ui-upscale-handoff', { detail: payload }));
  return payload;
}
