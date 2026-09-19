import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveMigrationPath(path: string): string {
  let candidate = resolve(path);
  const missing: string[] = [];
  for (;;) {
    try {
      return resolve(realpathSync(candidate), ...missing);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      missing.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

export function isMigrationPathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function isSameMigrationPath(first: string, second: string): boolean {
  if (relative(first, second) === '') return true;
  try {
    const a = statSync(first, { bigint: true });
    const b = statSync(second, { bigint: true });
    return a.ino !== 0n && a.dev === b.dev && a.ino === b.ino;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function assertSeparateMigrationPaths(source: string, destination: string): void {
  const from = resolveMigrationPath(source);
  const to = resolveMigrationPath(destination);
  if (isSameMigrationPath(from, to)
    || isMigrationPathInside(from, to) || isMigrationPathInside(to, from)) {
    throw new Error('Migration source and destination must be separate, non-overlapping paths.');
  }
}
