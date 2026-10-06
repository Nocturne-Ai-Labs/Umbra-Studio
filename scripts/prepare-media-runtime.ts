import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import policy from '../defaults/MediaTools/source-build-manifest.json';
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

export async function prepareMediaRuntime(runtimeRoot: string, cacheRoot = resolve(import.meta.dir, '../node_modules/.cache/umbra-media-source')) {
  if (!policy.platforms.includes(process.platform) || process.arch !== 'x64') throw new Error('Pinned-source media bundle requires Windows or Linux x64.');
  const root = resolve(runtimeRoot);
  const target = join(root, 'Runtime', 'FFmpeg', process.platform);
  assertLocal(root, target);
  mkdirSync(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), '.prepare-'));
  let previous = '';
  try {
    const prebuilt = process.env.UMBRA_MEDIA_SOURCE_BUILD;
    if (prebuilt) {
      // Inspect every source entry before copy; cpSync must never follow build-tree links.
      const inspect = (path: string) => {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Source media build contains a redirected or irregular entry.');
        if (stat.isDirectory()) for (const name of readdirSync(path)) inspect(join(path, name));
      };
      inspect(resolve(prebuilt));
      cpSync(resolve(prebuilt), stage, { recursive: true });
    } else {
      const work = join(resolve(cacheRoot), `build-${process.platform}-${randomUUID()}`);
      mkdirSync(work, { recursive: true });
      const script = resolve(import.meta.dir, 'build-media-from-source.sh');
      const build = spawnSync(process.env.UMBRA_MEDIA_BUILD_BASH || 'bash', [script, process.platform, stage, work], { stdio: 'inherit', windowsHide: true });
      if (build.status !== 0) throw new Error('Pinned-source FFmpeg build failed. Install the release workflow build tools or provide UMBRA_MEDIA_SOURCE_BUILD from the native source build.');
    }
    const suffix = process.platform === 'win32' ? '.exe' : '';
    for (const tool of ['ffmpeg', 'ffprobe']) {
      const probe = spawnSync(join(stage, 'bin', tool + suffix), ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      if (probe.status !== 0) throw new Error(`Source-built ${tool} does not run on the native packaging host.`);
    }
    const policySha256 = createHash('sha256').update(JSON.stringify(policy)).digest('hex');
    writeFileSync(join(stage, 'SOURCE.json'), JSON.stringify({ schemaVersion: 2, buildKind: 'pinned-source', policySha256,
      sources: policy.sources, recipe: 'corresponding-source/build-media-from-source.sh', patches: [] }, null, 2) + '\n');
    const files: Record<string, { bytes: number; sha256: string }> = {};
    const walk = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const absolute = join(path, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Media bundle contains a linked file.');
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile()) {
          const name = relative(stage, absolute).split(sep).join('/');
          if (name !== 'installed.json') files[name] = { bytes: lstatSync(absolute).size, sha256: hash(absolute) };
        } else throw new Error('Media bundle contains a non-regular file.');
      }
    };
    walk(stage);
    writeFileSync(join(stage, 'installed.json'), JSON.stringify({ schemaVersion: 2, buildKind: 'pinned-source', policySha256,
      version: policy.version, release: policy.release, license: policy.license, platform: process.platform, binDirectory: 'bin', files }, null, 2) + '\n');
    assertLocal(root, target);
    if (existsSync(target)) { previous = `${target}.previous-${randomUUID()}`; renameSync(target, previous); }
    let installed = false;
    try {
      renameSync(stage, target); installed = true;
      verifyBundledMediaRuntime(root);
    } catch (error) {
      if (installed) { assertLocal(root, target); rmSync(target, { recursive: true, force: true }); }
      if (previous) { renameSync(previous, target); previous = ''; }
      throw error;
    }
    if (previous) { assertLocal(root, previous); rmSync(previous, { recursive: true, force: true }); }
    console.log(`[media-runtime] Bundled source-built FFmpeg ${policy.version}, ffprobe and complete corresponding sources for ${process.platform}.`);
    return target;
  } finally { if (existsSync(stage)) { assertLocal(root, stage); rmSync(stage, { recursive: true, force: true }); } }
}

if (import.meta.main) {
  const index = Bun.argv.indexOf('--root');
  if (index < 0 || !Bun.argv[index + 1]) throw new Error('An explicit --root package destination is required.');
  await prepareMediaRuntime(Bun.argv[index + 1]);
}
