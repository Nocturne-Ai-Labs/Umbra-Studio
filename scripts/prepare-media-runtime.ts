import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import manifest from '../defaults/MediaTools/manifest.json';
import { downloadMediaArchive, extractAndVerifyMediaArchive, mediaToolsPackage } from '../setup/MediaTools';
import { verifyBundledMediaRuntime } from '../shared/bundledMediaRuntime';

function assertLocal(root: string, target: string) {
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Media bundle escaped its package root.');
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Media packaging refuses redirected directories.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export async function prepareMediaRuntime(runtimeRoot: string, cacheRoot = resolve(import.meta.dir, '../node_modules/.cache/umbra-media')) {
  const root = resolve(runtimeRoot);
  const target = join(root, 'Runtime', 'FFmpeg', process.platform);
  assertLocal(root, target);
  const item = mediaToolsPackage();
  mkdirSync(cacheRoot, { recursive: true });
  const archive = join(cacheRoot, item.name);
  if (existsSync(archive) && (lstatSync(archive).isSymbolicLink() || lstatSync(archive).size !== item.bytes || hash(archive) !== item.sha256)) {
    throw new Error(`Invalid media build cache: ${archive}. Remove this cache file and retry.`);
  }
  if (!existsSync(archive)) {
    const partial = `${archive}.${randomUUID()}.partial`;
    try {
      await downloadMediaArchive(item.url, partial, item, line => console.log(`[media-runtime] ${line}`));
      await rename(partial, archive);
    } finally { if (existsSync(partial)) rmSync(partial); }
  }
  mkdirSync(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), '.prepare-'));
  let previous = '';
  try {
    const extracted = extractAndVerifyMediaArchive(archive, stage);
    const files: Record<string, { bytes: number; sha256: string }> = {};
    const walk = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const absolute = join(path, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Media bundle contains a linked file.');
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile()) files[relative(extracted, absolute).split(sep).join('/')] = { bytes: lstatSync(absolute).size, sha256: hash(absolute) };
        else throw new Error('Media bundle contains a non-regular file.');
      }
    };
    walk(extracted);
    const ffmpeg = join(extracted, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const configuration = spawnSync(ffmpeg, ['-hide_banner', '-buildconf'], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 128 * 1024 });
    if (configuration.status !== 0) throw new Error('Bundled FFmpeg build configuration could not be verified.');
    writeFileSync(join(extracted, 'BUILD-CONFIG.txt'), `${configuration.stdout || ''}${configuration.stderr || ''}`);
    writeFileSync(join(extracted, 'SOURCE.json'), JSON.stringify({ ffmpeg: manifest.ffmpegSource, build: manifest.buildSource, upstreamBinary: item.url }, null, 2) + '\n');
    writeFileSync(join(extracted, 'installed.json'), JSON.stringify({ schemaVersion: 1, version: manifest.version, release: manifest.release,
      license: manifest.license, binDirectory: 'bin', archiveSha256: item.sha256, archiveBytes: item.bytes, archiveUrl: item.url, files }, null, 2) + '\n');
    assertLocal(root, target);
    if (existsSync(target)) { previous = `${target}.previous-${randomUUID()}`; renameSync(target, previous); }
    let installed = false;
    try {
      renameSync(extracted, target);
      installed = true;
      verifyBundledMediaRuntime(root);
    } catch (error) {
      if (installed) { assertLocal(root, target); rmSync(target, { recursive: true, force: true }); }
      if (previous) { renameSync(previous, target); previous = ''; }
      throw error;
    }
    if (previous) { assertLocal(root, previous); rmSync(previous, { recursive: true, force: true }); }
    console.log(`[media-runtime] Bundled FFmpeg ${manifest.version} and ffprobe for ${process.platform}/${process.arch}.`);
    return target;
  } finally { assertLocal(root, stage); rmSync(stage, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const index = Bun.argv.indexOf('--root');
  if (index < 0 || !Bun.argv[index + 1]) throw new Error('An explicit --root package destination is required.');
  await prepareMediaRuntime(Bun.argv[index + 1]);
}
