import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const conceptTails = new Map<string, Promise<void>>();

function conceptKey(path: string): string {
  let canonical: string;
  try {
    canonical = realpathSync.native(path);
  } catch {
    canonical = resolve(path);
  }
  const normalized = canonical.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function acquireConcept(key: string): Promise<() => void> {
  const previous = conceptTails.get(key);
  let release!: () => void;
  const current = new Promise<void>(resolveRelease => { release = resolveRelease; });
  conceptTails.set(key, current);
  if (previous) await previous;
  return () => {
    if (conceptTails.get(key) === current) conceptTails.delete(key);
    release();
  };
}

/** Serialize caption and image mutations that touch the same dataset concept. */
export async function withDatasetConceptLocks<T>(
  conceptPaths: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const keys = [...new Set(conceptPaths.map(conceptKey))].sort();
  const releases: Array<() => void> = [];
  try {
    for (const key of keys) releases.push(await acquireConcept(key));
    return await operation();
  } finally {
    for (const release of releases.reverse()) release();
  }
}
