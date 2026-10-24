import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { release } from 'node:os';
import { spawnSync } from 'node:child_process';
import { verifyBundledMediaRuntime } from '../shared/bundledMediaRuntime';

const inputs = [
  '.github/workflows/release.yml',
  'defaults/MediaTools/source-build-manifest.json',
  'scripts/build-media-from-source.sh',
  'scripts/prepare-media-runtime.ts',
  'scripts/media-build-cache.ts',
  'shared/bundledMediaRuntime.ts',
];

export function mediaBuildCacheKey(sourceRoot: string, platform = process.platform, arch = process.arch, hostRelease = process.env.ImageOS || release()) {
  const hash = createHash('sha256').update(JSON.stringify({ schema: 1, platform, arch, hostRelease }));
  for (const name of inputs) hash.update(name).update('\0').update(readFileSync(join(sourceRoot, name))).update('\0');
  return `${platform}-${arch}-${hash.digest('hex')}`;
}

// Cache roots are build-owned, but must never redirect writes into another tree.
export function assertMediaCachePath(path: string) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Media build cache contains a redirected path.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export function probeMediaTools(root: string, platform = process.platform) {
  const suffix = platform === 'win32' ? '.exe' : '';
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const result = spawnSync(join(root, 'Runtime', 'FFmpeg', platform, 'bin', tool + suffix), ['-version'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (result.status !== 0 || result.error) throw new Error(`Cached source-built ${tool} does not run on this host.`);
  }
}

export function readMediaBuildCache(cacheRoot: string, key: string) {
  const entry = join(resolve(cacheRoot), 'bundles', key);
  assertMediaCachePath(entry);
  if (!existsSync(entry)) return null;
  try {
    verifyBundledMediaRuntime(entry);
    probeMediaTools(entry);
    return entry;
  } catch (error) {
    console.warn(`[media-runtime] Cache did not verify; rebuilding: ${String(error)}`);
    return null;
  }
}

export function writeMediaBuildCache(cacheRoot: string, key: string, runtimeRoot: string) {
  const entry = join(resolve(cacheRoot), 'bundles', key);
  assertMediaCachePath(entry);
  mkdirSync(dirname(entry), { recursive: true });
  const stage = `${entry}.pending-${randomUUID()}`;
  const previous = `${entry}.previous-${randomUUID()}`;
  let movedPrevious = false;
  try {
    verifyBundledMediaRuntime(runtimeRoot);
    const source = join(runtimeRoot, 'Runtime', 'FFmpeg', process.platform);
    // The verifier rejects all links before cpSync can follow a source entry.
    cpSync(source, join(stage, 'Runtime', 'FFmpeg', process.platform), { recursive: true });
    verifyBundledMediaRuntime(stage);
    if (existsSync(entry)) { renameSync(entry, previous); movedPrevious = true; }
    try { renameSync(stage, entry); }
    catch (error) { if (movedPrevious) { renameSync(previous, entry); movedPrevious = false; } throw error; }
  } finally {
    for (const target of [stage, ...(movedPrevious ? [previous] : [])]) {
      assertMediaCachePath(target);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    }
  }
}
