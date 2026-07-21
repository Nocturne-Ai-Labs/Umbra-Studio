export type UmbraUiUpscaleItemStatus = 'staging' | 'queued' | 'running' | 'completed' | 'failed';
export type UmbraUiUpscaleJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed';
export type UmbraUiUpscaleQueuePlacement = 'next' | 'end' | 'interrupt';

export interface UmbraUiUpscaleOutput {
  filename: string;
  subfolder: string;
  type: string;
  fullpath: string;
}

export interface UmbraUiUpscaleJobItem {
  id: string;
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
  outputFolder: string;
  queuePlacement: UmbraUiUpscaleQueuePlacement;
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  items: UmbraUiUpscaleJobItem[];
}

export interface UmbraUiUpscaleHandoff {
  path: string;
  name: string;
  imageUrl?: string;
  autoStart?: boolean;
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
  folders?: string[];
  files?: File[];
  modelName: string;
  maxDimension: number;
  outputFolder?: string;
  queuePlacement?: UmbraUiUpscaleQueuePlacement;
  onStageProgress?: (completed: number, total: number) => void;
}): Promise<UmbraUiUpscaleJob> {
  const files = options.files || [];
  const batchId = files.length > 0 ? createUpscaleStageBatchId() : '';
  const staged: Array<{ path: string; name: string }> = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      staged.push(await stageUmbraUiUpscaleFile(files[index], batchId, index));
      options.onStageProgress?.(index + 1, files.length);
    }
  } catch (error) {
    await cleanupUmbraUiUpscaleStage(batchId);
    throw error;
  }
  const form = new FormData();
  form.set('paths', JSON.stringify((options.paths || []).filter(Boolean)));
  form.set('folders', JSON.stringify((options.folders || []).filter(Boolean)));
  form.set('staged', JSON.stringify(staged));
  form.set('modelName', options.modelName);
  form.set('maxDimension', String(options.maxDimension));
  form.set('outputFolder', String(options.outputFolder || '').trim());
  form.set('queuePlacement', String(options.queuePlacement || 'end'));
  const response = await fetch('/api/umbra-ui/upscale', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.job) {
    await cleanupUmbraUiUpscaleStage(batchId);
    throw new Error(String(payload?.error || `Upscale request failed (${response.status}).`));
  }
  return payload.job as UmbraUiUpscaleJob;
}

export async function fetchUmbraUiUpscaleJob(jobId: string, signal?: AbortSignal): Promise<UmbraUiUpscaleJob> {
  const response = await fetch(`/api/umbra-ui/upscale/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.job) {
    throw new Error(String(payload?.error || `Upscale status failed (${response.status}).`));
  }
  return payload.job as UmbraUiUpscaleJob;
}

export function stageUmbraUiUpscaleHandoff(detail: Omit<UmbraUiUpscaleHandoff, 'createdAt'>) {
  const payload: UmbraUiUpscaleHandoff = { ...detail, createdAt: Date.now() };
  try { window.sessionStorage.setItem(UMBRA_UI_UPSCALE_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent('umbra:umbra-ui-upscale-handoff', { detail: payload }));
}
