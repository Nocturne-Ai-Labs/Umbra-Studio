import { getLocalServerProxyUrl } from './localServerApps';

export interface TrainingToolAvailability {
  running: boolean;
  healthy: boolean;
  url: string;
}

export interface TrainingProgressJob {
  id: string;
  name: string;
  status: 'running' | 'queued' | 'stopping';
  step: number | null;
  totalSteps: number | null;
  progress: number | null;
}

export interface TrainingProgressSnapshot {
  jobs: TrainingProgressJob[];
  additionalJobs: number;
}

export const TRAINING_PROGRESS_MAX_BYTES = 256 * 1024;
export const TRAINING_PROGRESS_MAX_JOBS = 3;
export const TRAINING_PROGRESS_TIMEOUT_MS = 5000;
export const TRAINING_PROGRESS_ACTIVE_MS = 15000;
export const TRAINING_PROGRESS_IDLE_MS = 30000;

export class TrainingProgressError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    this.name = 'TrainingProgressError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function stepCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function label(value: unknown, fallback: string): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || fallback
    : fallback;
}

// AI-Toolkit /api/jobs returns configuration too. Never retain or inspect it,
// free-form info, sample paths, dataset fields, or prompts for sidebar status.
export function normalizeTrainingProgress(payload: unknown): TrainingProgressSnapshot {
  const rawJobs = record(payload)?.jobs;
  if (!Array.isArray(rawJobs) || rawJobs.length > 1000) {
    throw new TrainingProgressError('Training progress is unsupported.');
  }
  const jobs: TrainingProgressJob[] = [];
  const seen = new Set<string>();
  for (const raw of rawJobs) {
    const job = record(raw);
    if (!job) continue;
    if (job.job_type != null && job.job_type !== 'train') continue;
    if (job.status !== 'running' && job.status !== 'queued' && job.status !== 'stopping') continue;
    if (typeof job.id !== 'string' || !job.id || job.id.length > 256 || seen.has(job.id)) continue;
    seen.add(job.id);
    const step = stepCount(job.step);
    const total = stepCount(job.total_steps);
    const totalSteps = total && total > 0 ? total : null;
    jobs.push({
      id: job.id,
      name: label(job.name, 'Training job'),
      status: job.status,
      step,
      totalSteps,
      progress: step !== null && totalSteps !== null ? Math.min(100, Math.round(step / totalSteps * 100)) : null,
    });
  }
  const order = { running: 0, stopping: 1, queued: 2 };
  jobs.sort((a, b) => order[a.status] - order[b.status]);
  return { jobs: jobs.slice(0, TRAINING_PROGRESS_MAX_JOBS), additionalJobs: Math.max(0, jobs.length - TRAINING_PROGRESS_MAX_JOBS) };
}

export function getTrainingProgressUrls(tool?: TrainingToolAvailability | null): { status: string; trainer: string } | null {
  if (!tool?.running || !tool.healthy) return null;
  try {
    const base = new URL(tool.url);
    if (base.username || base.password) return null;
    const status = getLocalServerProxyUrl(new URL('/api/jobs?only_active=true&job_type=train', base).toString());
    const trainer = getLocalServerProxyUrl(new URL('/jobs', base).toString());
    return status && trainer ? { status, trainer } : null;
  } catch {
    return null;
  }
}

export async function fetchTrainingProgress(endpoint: string, signal: AbortSignal): Promise<TrainingProgressSnapshot> {
  const response = await fetch(endpoint, {
    method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new TrainingProgressError(
      response.status === 401 || response.status === 403 ? 'Trainer sign-in required.' : 'Training progress unavailable.',
      response.status >= 500 || response.status === 429,
    );
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')
    || Number(response.headers.get('content-length')) > TRAINING_PROGRESS_MAX_BYTES) {
    await response.body?.cancel();
    throw new TrainingProgressError('Training progress is unsupported or too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TrainingProgressError('Training progress unavailable.');
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > TRAINING_PROGRESS_MAX_BYTES) throw new TrainingProgressError('Training progress response is too large.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return normalizeTrainingProgress(JSON.parse(text));
  } catch (error) {
    if (error instanceof TrainingProgressError) throw error;
    throw new TrainingProgressError('Training progress is unsupported.');
  }
}

export type TrainingProgressUpdate =
  | { status: 'ready'; snapshot: TrainingProgressSnapshot }
  | { status: 'error'; message: string };

// One request at a time, only for a caller-verified available tool. Visibility
// changes cancel both the request and timer; terminal errors require remount/retry.
export function watchTrainingProgress(endpoint: string, update: (value: TrainingProgressUpdate) => void): () => void {
  let disposed = false;
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  const cancel = () => {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
  };
  const poll = async () => {
    if (disposed || stopped || document.hidden || controller) return;
    const current = new AbortController();
    controller = current;
    const timeout = setTimeout(() => current.abort(), TRAINING_PROGRESS_TIMEOUT_MS);
    let delay = TRAINING_PROGRESS_IDLE_MS;
    try {
      const snapshot = await fetchTrainingProgress(endpoint, current.signal);
      if (disposed || controller !== current || current.signal.aborted) return;
      failures = 0;
      update({ status: 'ready', snapshot });
      delay = snapshot.jobs.length ? TRAINING_PROGRESS_ACTIVE_MS : TRAINING_PROGRESS_IDLE_MS;
    } catch (error) {
      if (disposed || controller !== current) return;
      failures += 1;
      stopped = failures >= 3 || (error instanceof TrainingProgressError && !error.retryable);
      update({ status: 'error', message: error instanceof TrainingProgressError ? error.message : 'Training progress unavailable.' });
      delay = TRAINING_PROGRESS_IDLE_MS * failures;
    } finally {
      clearTimeout(timeout);
      if (controller === current) {
        controller = null;
        if (!disposed && !stopped && !document.hidden) timer = setTimeout(() => void poll(), delay);
      }
    }
  };
  const visibility = () => {
    cancel();
    if (!document.hidden) void poll();
  };
  document.addEventListener('visibilitychange', visibility);
  void poll();
  return () => {
    disposed = true;
    cancel();
    document.removeEventListener('visibilitychange', visibility);
  };
}
