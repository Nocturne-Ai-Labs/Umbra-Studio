import { useEffect, useSyncExternalStore } from 'react';

export type GalleryTransferResult = { path: string; newPath?: string; success: boolean; error?: string };
export type GalleryTransferState = {
  jobId?: string;
  active: boolean;
  mode: 'move' | 'copy';
  destination: string;
  totalPaths: number;
  completedPaths: number;
  totalUnits: number;
  completedUnits: number;
  percent: number;
  currentPath: string;
  phase: string;
  fileBytes?: number;
  fileTotalBytes?: number;
  reconnecting?: boolean;
  indexPending?: boolean;
  error?: string;
  results: GalleryTransferResult[];
};

const STORAGE_KEY = 'umbra.gallery.transfer.v1';
const listeners = new Set<() => void>();
const monitors = new Set<string>();
let state: GalleryTransferState | null = null;
let initialized = false;

function publish(next: GalleryTransferState | null, persist = false) {
  state = next;
  if (persist) {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* Tracking still works when browser storage is unavailable. */ }
  }
  listeners.forEach(listener => listener());
}

export function summarizeGalleryTransfer(job: Record<string, unknown>, current: GalleryTransferState): GalleryTransferState {
  const results = Array.isArray(job.results) ? job.results as GalleryTransferResult[] : [];
  const active = job.status !== 'completed' && job.status !== 'failed';
  const totalUnits = Number(job.totalUnits || 0);
  const completedUnits = Number(job.completedUnits || 0);
  return {
    ...current, active, results, reconnecting: false,
    completedPaths: results.filter(result => result.success === true).length,
    totalPaths: Number(job.totalPaths || current.totalPaths), totalUnits, completedUnits,
    percent: totalUnits > 0 ? Math.min(active ? 99 : 100, Math.round(completedUnits / totalUnits * 100)) : 0,
    phase: job.status === 'failed' ? 'failed' : String(job.phase || (active ? 'transferring' : 'completed')),
    indexPending: job.status === 'failed' && job.phase === 'indexing',
    currentPath: String(job.currentPath || current.currentPath),
    fileBytes: Number(job.fileBytes || 0), fileTotalBytes: Number(job.fileTotalBytes || 0),
    error: job.error ? String(job.error) : undefined,
  };
}

async function monitorTransfer(jobId: string) {
  if (monitors.has(jobId)) return;
  monitors.add(jobId);
  try {
    let failures = 0;
    while (state?.jobId === jobId && state.active) {
      try {
        const response = await fetch(`/api/fs/${state.mode}/status?jobId=${encodeURIComponent(jobId)}`, {
          cache: 'no-store', signal: AbortSignal.timeout(15000),
        });
        if (response.status === 404 || response.status === 400) {
          publish({ ...state, active: false, phase: 'failed', error: 'Transfer tracking is unavailable. Check source and destination before retrying; files may already have transferred.' }, true);
          break;
        }
        if (!response.ok) throw new Error('Transfer status unavailable');
        const payload = await response.json();
        if (!payload.job || !['running', 'completed', 'failed'].includes(payload.job.status)) throw new Error('Invalid transfer status');
        if (state?.jobId !== jobId) break;
        const next = summarizeGalleryTransfer(payload.job, state);
        publish(next, !next.active);
        failures = 0;
      } catch {
        if (state?.jobId !== jobId) break;
        failures++;
        publish({ ...state, reconnecting: true });
      }
      if (state?.active) await new Promise(resolve => setTimeout(resolve, failures ? Math.min(5000, failures * 1000) : 500));
    }
  } finally { monitors.delete(jobId); }
}

function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && (saved.mode === 'move' || saved.mode === 'copy') && typeof saved.destination === 'string' && Array.isArray(saved.results)) {
      publish(saved);
      if (saved.active && saved.jobId) void monitorTransfer(saved.jobId);
    }
  } catch { /* Ignore malformed local state. */ }
}

export function useGalleryTransfer() {
  const snapshot = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state, () => null,
  );
  useEffect(initialize, []);
  return snapshot;
}

export async function startGalleryTransfer(paths: string[], destination: string, mode: 'move' | 'copy') {
  initialize();
  if (state?.active) throw new Error('A transfer is already running');
  publish({ active: true, mode, destination, totalPaths: paths.length, completedPaths: 0, totalUnits: 0,
    completedUnits: 0, percent: 0, phase: 'queued', currentPath: paths[0] || destination, results: [] });
  try {
    const response = await fetch(`/api/fs/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, destination, trackProgress: true }), signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(String(payload.error || 'Unable to start transfer'));
    if (!state) return;
    if (payload.jobId) {
      publish({ ...state, jobId: String(payload.jobId) }, true);
      void monitorTransfer(String(payload.jobId));
    } else {
      publish(summarizeGalleryTransfer({ ...payload, status: 'completed' }, state), true);
    }
  } catch (error) {
    if (state) publish({ ...state, active: false, phase: 'failed', error: `${error instanceof Error ? error.message : 'Transfer submission failed'}. Check the destination before retrying.` }, true);
    throw error;
  }
}

export function dismissGalleryTransfer() {
  if (!state?.active) publish(null, true);
}

export async function retryGalleryTransferIndex() {
  if (!state?.jobId || !state.indexPending || state.active) return;
  const current = state;
  publish({ ...current, active: true, phase: 'indexing', error: undefined }, true);
  try {
    const response = await fetch('/api/fs/transfer/reconcile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: current.jobId }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Unable to retry Gallery indexing');
    void monitorTransfer(current.jobId!);
  } catch (error) {
    publish({ ...current, error: String(error) }, true);
  }
}
