import { useEffect, useSyncExternalStore } from 'react';

export interface GalleryArchiveJob {
  id: string;
  folder: string;
  phase: 'queued' | 'scanning' | 'packing' | 'saving' | 'completed' | 'failed';
  files: number;
  bytes: number;
  processedBytes: number;
  skippedLinks: number;
  currentFile?: string;
  path?: string;
  error?: string;
}

const storageKey = 'umbra.gallery.archive.v1';
const listeners = new Set<() => void>();
let job: GalleryArchiveJob | null = null;
let restored = false;
let polling = false;
export const archiveIsActive = (value: GalleryArchiveJob | null) => Boolean(value && !['completed', 'failed'].includes(value.phase));

function update(value: GalleryArchiveJob | null) {
  job = value;
  try {
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  } catch { /* Private browsing can disable storage. */ }
  listeners.forEach(listener => listener());
}

async function monitor() {
  if (polling || !job?.id || !archiveIsActive(job)) return;
  polling = true;
  try {
    while (job?.id && archiveIsActive(job)) {
      const id: string = job.id;
      try {
        const response = await fetch(`/api/fs/archives/status?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (job?.id !== id) return;
        if (response.status === 404) update({ ...job, phase: 'failed', error: result.error });
        else if (!response.ok) throw new Error(result.error || 'Unable to read archive progress');
        else update(result);
      } catch {
        // Keep tracking accepted work; a dropped connection does not cancel packing.
      }
      if (archiveIsActive(job)) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { polling = false; }
}

export async function startGalleryArchive(folder: string) {
  if (archiveIsActive(job)) return;
  update({ id: '', folder, phase: 'queued', files: 0, bytes: 0, processedBytes: 0, skippedLinks: 0 });
  try {
    const response = await fetch('/api/fs/archives', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folder }), signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'ZIP creation failed');
    update(result);
    void monitor();
  } catch (error) {
    if (job) update({ ...job, phase: 'failed', error: error instanceof Error ? error.message : 'ZIP creation failed' });
  }
}

export function dismissGalleryArchive() { if (!archiveIsActive(job)) update(null); }

export function useGalleryArchive() {
  const value = useSyncExternalStore(callback => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  }, () => job, () => null);
  useEffect(() => {
    if (!restored) {
      restored = true;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && typeof saved.id === 'string' && saved.id && typeof saved.folder === 'string') update(saved);
      } catch { /* Ignore invalid saved tracking state. */ }
    }
    void monitor();
  }, []);
  return value;
}
