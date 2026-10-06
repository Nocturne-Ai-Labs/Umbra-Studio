import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import policy from '../defaults/PythonHelpers/manifest.json';
import { downloadMediaArchive } from '../setup/MediaTools';
import { bundledHelperRoot, fileSha256, helperPolicyHash, verifyBundledPythonHelpers } from '../shared/bundledPythonHelpers';

function assertLocal(root: string, target: string) {
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Python bundle escaped its package root.');
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Python packaging refuses redirected directories.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
type Asset = { bytes: number; sha256: string; url: string };
async function cachedAsset(cache: string, name: string, item: Asset) {
  const path = join(cache, name);
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || lstatSync(path).size !== item.bytes || fileSha256(path) !== item.sha256))
    throw new Error(`Invalid helper build cache: ${path}. Remove this file and retry.`);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const partial = `${path}.${randomUUID()}.partial`;
    try {
      await downloadMediaArchive(item.url, partial, item, line => console.log(`[python-helpers] ${name}: ${line}`));
      renameSync(partial, path);
    } finally { if (existsSync(partial)) rmSync(partial); }
  }
  return path;
}
function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONNOUSERSITE: '1' } });
  if (result.status !== 0 || result.error) throw new Error(`Python bundle preparation failed: ${String(result.stderr || result.stdout || result.error).slice(-3000)}`);
  return result.stdout;
}

export async function preparePythonHelpers(runtimeRoot: string, cache = resolve(import.meta.dir, '../node_modules/.cache/umbra-helpers')) {
  const pin = policy.platforms[process.platform as keyof typeof policy.platforms];
  if (!pin || process.arch !== 'x64') throw new Error('Python helper bundling supports native Windows/Linux x64 builds.');
  const root = resolve(runtimeRoot);
  const target = bundledHelperRoot(root);
  assertLocal(root, target);
  if (existsSync(join(target, 'installed.json'))) {
    try { verifyBundledPythonHelpers(root); console.log('[python-helpers] Existing pinned bundle verified.'); return target; }
    catch { /* Build a fresh, verified replacement below. */ }
  }
  mkdirSync(cache, { recursive: true });
  const archive = await cachedAsset(cache, pin.python.name, pin.python);
  const listing = run('tar', ['-tzf', archive], root).split(/\r?\n/).filter(Boolean);
  if (!listing.length || listing.some(name => !name.startsWith('python/') || name.includes('\\') || name.split('/').includes('..')))
    throw new Error('Standalone Python archive contains an unsafe path.');
  for (const wheel of pin.wheels) await cachedAsset(cache, `wheels/${process.platform}/${wheel.filename}`, wheel);
  mkdirSync(dirname(target), { recursive: true });
  // pip extraction can exceed Windows MAX_PATH beneath a long release root.
  const temporaryRoot = resolve(tmpdir());
  const stage = await mkdtemp(join(temporaryRoot, 'umbra-helpers-'));
  let previous = '';
  try {
    const extraction = join(stage, 'extracted'); mkdirSync(extraction);
    console.log('[python-helpers] Extracting pinned standalone Python.');
    run('tar', ['-xzf', archive, '-C', extraction], root);
    const pythonSource = join(extraction, 'python');
    const pending = [pythonSource];
    while (pending.length) {
      const current = pending.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const file = join(current, entry.name);
        if (entry.isSymbolicLink()) {
          const rel = relative(pythonSource, realpathSync(file));
          if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Standalone Python contains an external link.');
        } else if (entry.isDirectory()) pending.push(file);
        else if (!entry.isFile()) throw new Error('Standalone Python contains a non-regular file.');
      }
    }
    const bundle = join(stage, 'bundle'); mkdirSync(bundle);
    cpSync(pythonSource, join(bundle, 'python'), { recursive: true, dereference: true });
    const python = join(bundle, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3.11');
    const lock = join(stage, 'requirements.txt');
    console.log('[python-helpers] Installing checksum-pinned CPU wheels.');
    writeFileSync(lock, pin.wheels.map(item => `${item.name}==${item.version} --hash=sha256:${item.sha256}`).join('\n') + '\n');
    run(python, ['-I', '-B', '-m', 'pip', 'install', '--no-index', '--only-binary=:all:', '--require-hashes', '--no-compile', '--find-links', join(cache, 'wheels', process.platform), '-r', lock], root);
    run(python, ['-I', '-B', '-m', 'pip', 'check'], root);
    console.log('[python-helpers] Verifying imports and removing caches, tests and sample models.');
    run(python, ['-I', '-B', '-c', `import importlib,sys\nassert sys.version.split()[0] == ${JSON.stringify(policy.pythonVersion)}\nfor name in ${JSON.stringify(policy.modules)}: importlib.import_module(name)`], root);
    // Console-script wrappers embed the temporary interpreter's absolute path.
    // Helpers run modules/scripts through Python directly, so omit those wrappers.
    const scripts = run(python, ['-I', '-B', '-c', 'import importlib.metadata as m,json\nprint(json.dumps(sorted({e.name for d in m.distributions() for e in d.entry_points if e.group == "console_scripts"})))'], root);
    for (const name of JSON.parse(scripts) as string[]) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Unsafe Python console script name.');
      for (const suffix of process.platform === 'win32' ? ['.exe', '-script.py', '.py'] : ['']) {
        const wrapper = join(bundle, 'python', process.platform === 'win32' ? 'Scripts' : 'bin', name + suffix);
        if (existsSync(wrapper)) rmSync(wrapper);
      }
    }
    const prune = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (['__pycache__', 'tests', 'test'].includes(entry.name)) { assertLocal(bundle, file); rmSync(file, { recursive: true, force: true }); }
          else prune(file);
        } else if (/\.(pyc|pyo|onnx|safetensors|ckpt|pt)$/i.test(entry.name)) rmSync(file);
      }
    };
    prune(join(bundle, 'python'));
    writeFileSync(join(bundle, 'PACKAGES.json'), JSON.stringify({ python: pin.python, packages: pin.wheels, modelsIncluded: false }, null, 2) + '\n');
    const files: Record<string, { bytes: number; sha256: string }> = {};
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile() && !entry.isSymbolicLink()) files[relative(bundle, file).split(sep).join('/')] = { bytes: lstatSync(file).size, sha256: fileSha256(file) };
        else throw new Error('Python release bundle contains a linked or non-regular file.');
      }
    };
    walk(bundle);
    console.log(`[python-helpers] ${Object.keys(files).length} dependency files inventoried; copying to release stage.`);
    writeFileSync(join(bundle, 'installed.json'), JSON.stringify({ schemaVersion: 1, pythonVersion: policy.pythonVersion,
      policySha256: helperPolicyHash(), pythonArchiveSha256: pin.python.sha256, files }, null, 2) + '\n');
    assertLocal(root, target);
    if (existsSync(target)) { previous = `${target}.previous-${randomUUID()}`; renameSync(target, previous); }
    let installed = false;
    try {
      installed = true;
      cpSync(bundle, target, { recursive: true, dereference: true });
      verifyBundledPythonHelpers(root);
    }
    catch (error) {
      if (installed) { assertLocal(root, target); rmSync(target, { recursive: true, force: true }); }
      if (previous) { renameSync(previous, target); previous = ''; }
      throw error;
    }
    if (previous) { assertLocal(root, previous); rmSync(previous, { recursive: true, force: true }); }
    console.log(`[python-helpers] Bundled Python ${policy.pythonVersion} and CPU dependencies; model weights excluded.`);
    return target;
  } finally { assertLocal(temporaryRoot, stage); rmSync(stage, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const index = Bun.argv.indexOf('--root');
  if (index < 0 || !Bun.argv[index + 1]) throw new Error('An explicit --root package destination is required.');
  await preparePythonHelpers(Bun.argv[index + 1]);
}
