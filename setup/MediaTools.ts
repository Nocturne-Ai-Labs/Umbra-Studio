import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { managedMediaBin, resolveMediaExecutable, type MediaTool } from '../backend/MediaExecutables';
import mediaManifest from '../defaults/MediaTools/manifest.json';

// A retained monthly upstream build; checksums bind downloads independently of the URL.
export const MEDIA_TOOLS_RELEASE = mediaManifest.release;
export const MEDIA_TOOLS_VERSION = mediaManifest.version;
export const MEDIA_TOOLS_PACKAGES = mediaManifest.packages;

export function mediaToolsPackage(platform: NodeJS.Platform = process.platform, arch = process.arch) {
  if (arch !== 'x64' || !(platform in MEDIA_TOOLS_PACKAGES)) throw new Error('Media tool repair supports Windows and Linux x64.');
  const item = MEDIA_TOOLS_PACKAGES[platform as keyof typeof MEDIA_TOOLS_PACKAGES];
  return { ...item, url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${MEDIA_TOOLS_RELEASE}/${item.name}` };
}

const probes = new Map<string, { ready: boolean; version: string; detail: string }>();
export function probeMediaTool(executable: string, tool: MediaTool) {
  let key = '';
  try { const info = statSync(executable); key = `${tool}:${executable}:${info.size}:${info.mtimeMs}`; }
  catch { return { ready: false, version: '', detail: `${tool} is unavailable. Use Install / repair media tools.` }; }
  const cached = probes.get(key);
  if (cached) return cached;
  const result = spawnSync(executable, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 128 * 1024 });
  const version = String(result.stdout || '').match(new RegExp(`^${tool} version (\\S+)`))?.[1] || '';
  const status = { ready: result.status === 0 && Boolean(version), version,
    detail: result.status === 0 && version ? `${tool} executable verified` : `${tool} could not run. Use Install / repair media tools.` };
  if (probes.size > 64) probes.clear();
  if (status.ready) probes.set(key, status);
  return status;
}

export function inspectMediaTools(runtimeRoot: string) {
  const tools = (['ffmpeg', 'ffprobe'] as const).map((tool) => {
    const resolved = resolveMediaExecutable(tool, { runtimeRoot });
    const probe = resolved.source === 'missing' ? { ready: false, version: '', detail: `${tool} was not found.` }
      : probeMediaTool(resolved.executable, tool);
    return { tool, source: resolved.source, ...probe };
  });
  let downloadBytes = 0;
  let supported = true;
  try { downloadBytes = mediaToolsPackage().bytes; } catch { supported = false; }
  return { ready: tools.every((tool) => tool.ready), supported, tools, downloadBytes, version: MEDIA_TOOLS_VERSION,
    detail: 'Video thumbnails and metadata. Repair installs a separate portable FFmpeg/ffprobe pair; no global PATH change or ComfyUI reinstall.',
    license: 'GPL-3.0-or-later', release: MEDIA_TOOLS_RELEASE };
}

function assertLocalTree(runtimeRoot: string, target: string) {
  const root = resolve(runtimeRoot);
  const path = relative(root, resolve(target));
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new Error('Media tool target is outside its application root.');
  let current = root;
  for (const part of path.split(sep)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Media tool installation refuses linked directories.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export async function downloadMediaArchive(url: string, target: string, expected: { bytes: number; sha256: string },
  log: (line: string) => void, request: typeof fetch = fetch,
  timeouts: { headersMs?: number; idleMs?: number } = {}) {
  const headersMs = timeouts.headersMs ?? 30_000;
  const idleMs = timeouts.idleMs ?? 120_000;
  if (![headersMs, idleMs].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid media download timeout.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelReader: (() => Promise<void>) | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  const armTimeout = (milliseconds: number, detail: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(detail)), milliseconds);
  };
  try {
    armTimeout(headersMs, 'Media tool download headers timed out. Retry Install / repair.');
    const response = await request(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok || !response.body) throw new Error(`Media tool download failed (${response.status}). Retry Install / repair.`);
    const reader = response.body.getReader();
    cancelReader = () => reader.cancel();
    handle = await open(target, 'wx');
    const hash = createHash('sha256');
    let bytes = 0;
    let lastProgress = 0;
    // Bound each network wait, allowing slow downloads to keep making progress.
    armTimeout(idleMs, 'Media tool download stalled. Retry Install / repair.');
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value.byteLength) continue;
      clearTimeout(timer);
      bytes += chunk.value.byteLength;
      if (bytes > expected.bytes) throw new Error('Media tool download exceeded its declared size.');
      hash.update(chunk.value);
      let offset = 0;
      while (offset < chunk.value.byteLength) {
        const written = (await handle.write(chunk.value, offset, chunk.value.byteLength - offset)).bytesWritten;
        if (!written) throw new Error('Media tool download could not be written to disk.');
        offset += written;
      }
      if (Date.now() - lastProgress > 1500) { log(`Downloading media tools: ${Math.round(bytes / 1024 / 1024)} / ${Math.round(expected.bytes / 1024 / 1024)} MiB`); lastProgress = Date.now(); }
      armTimeout(idleMs, 'Media tool download stalled. Retry Install / repair.');
    }
    clearTimeout(timer);
    if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Media tool checksum verification failed. Nothing was installed.');
  } finally {
    clearTimeout(timer);
    controller.abort();
    await cancelReader?.().catch(() => {});
    await handle?.close();
  }
}

function runTar(args: string[]): string {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Media tool extraction failed. Install tar${process.platform === 'linux' ? ' and xz-utils' : ''} and retry. ${String(result.stderr || result.error || '').slice(-1000)}`);
  return result.stdout;
}

export function extractAndVerifyMediaArchive(archive: string, stage: string): string {
  const { root, selected } = selectMediaArchiveEntries(runTar(['-tf', archive]), process.platform);
  const details = runTar(['-tvf', archive, ...selected]).split(/\r?\n/).filter(Boolean);
  if (details.length !== selected.length || details.some((line) => !line.startsWith('-'))) throw new Error('Media tool archive entries must be regular files.');
  runTar(['-xf', archive, '-C', stage, ...selected]);
  const extracted = join(stage, root);
  const bin = join(extracted, 'bin');
  for (const tool of ['ffmpeg', 'ffprobe'] as const) {
    const executable = join(bin, `${tool}${process.platform === 'win32' ? '.exe' : ''}`);
    if (!probeMediaTool(executable, tool).ready) throw new Error(`${tool} failed executable verification; the previous tools remain installed.`);
  }
  const encoders = spawnSync(join(bin, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), ['-hide_banner', '-encoders'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
  if (encoders.status !== 0 || !/\blibwebp\b/.test(encoders.stdout) || !/\bpng\b/.test(encoders.stdout)) throw new Error('Media tool build lacks the required PNG/WebP thumbnail encoders.');
  return extracted;
}

export function selectMediaArchiveEntries(listing: string, platform: NodeJS.Platform) {
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.length > 10000) throw new Error('Media tool archive has an invalid entry count.');
  const seen = new Set<string>();
  for (const path of entries) {
    if (path.includes('\\') || path.startsWith('/') || path.includes(':') || path.split('/').some((part) => part === '..' || part === '.')
      || seen.has(path.toLowerCase())) throw new Error('Media tool archive contains an unsafe or duplicate path.');
    seen.add(path.toLowerCase());
  }
  const roots = new Set(entries.map((path) => path.split('/')[0]));
  if (roots.size !== 1) throw new Error('Media tool archive must have one root.');
  const root = [...roots][0];
  const suffix = platform === 'win32' ? '.exe' : '';
  const binaries = ['ffmpeg', 'ffprobe'].map((tool) => `${root}/bin/${tool}${suffix}`);
  if (binaries.some((path) => !entries.includes(path))) throw new Error('Media tool archive is missing FFmpeg or ffprobe.');
  const licenses = entries.filter((path) => /\/(?:LICENSE|COPYING)(?:[^/]*)$/i.test(path));
  if (!licenses.length) throw new Error('Media tool archive has no license notice.');
  return { root, selected: [...binaries, ...licenses] };
}

export async function installMediaTools(runtimeRoot: string, log: (line: string) => void) {
  const item = mediaToolsPackage();
  const toolRoot = resolve(runtimeRoot, 'Tools', 'FFmpeg', process.platform);
  const cacheRoot = resolve(runtimeRoot, 'User', 'Cache', 'MediaTools');
  assertLocalTree(runtimeRoot, toolRoot);
  assertLocalTree(runtimeRoot, cacheRoot);
  if (inspectMediaTools(runtimeRoot).ready) { log('Existing FFmpeg and ffprobe executables verified; no download needed.'); return; }
  const currentBin = managedMediaBin(runtimeRoot);
  if (currentBin) {
    try {
      const installed = JSON.parse(readFileSync(join(toolRoot, 'installed.json'), 'utf8'));
      if (installed.archiveSha256 === item.sha256 && (['ffmpeg', 'ffprobe'] as const).every((tool) =>
        probeMediaTool(join(currentBin, `${tool}${process.platform === 'win32' ? '.exe' : ''}`), tool).ready)) {
        log('Portable FFmpeg and ffprobe verified; no download needed.'); return;
      }
    } catch { /* Stage a fresh pair; retain the existing installation until verification succeeds. */ }
  }
  mkdirSync(cacheRoot, { recursive: true });
  const stage = await mkdtemp(join(cacheRoot, 'install-'));
  try {
    const archive = join(stage, item.name);
    log(`Installing FFmpeg ${MEDIA_TOOLS_VERSION} and ffprobe (${Math.round(item.bytes / 1024 / 1024)} MiB, GPL-3.0-or-later).`);
    await downloadMediaArchive(item.url, archive, item, log);
    const extracted = extractAndVerifyMediaArchive(archive, stage);
    assertLocalTree(runtimeRoot, toolRoot);
    const version = `${item.sha256.slice(0, 12)}-${randomUUID()}`;
    await mkdir(join(toolRoot, 'versions'), { recursive: true });
    await rename(extracted, join(toolRoot, 'versions', version));
    const manifest = { version: MEDIA_TOOLS_VERSION, archiveSha256: item.sha256, release: MEDIA_TOOLS_RELEASE,
      binDirectory: `versions/${version}/bin`, installedAt: new Date().toISOString(),
      source: 'https://github.com/BtbN/FFmpeg-Builds', license: 'GPL-3.0-or-later' };
    const pending = join(toolRoot, `installed-${randomUUID()}.tmp`);
    await writeFile(pending, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(pending, join(toolRoot, 'installed.json'));
    log('Portable FFmpeg and ffprobe installed and verified. Existing tools and PATH were preserved.');
  } finally { await rm(stage, { recursive: true, force: true }); }
}
