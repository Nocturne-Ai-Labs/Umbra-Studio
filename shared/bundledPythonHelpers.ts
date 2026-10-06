import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import policy from '../defaults/PythonHelpers/manifest.json';

export const helperPolicyHash = (value = policy) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const bundledHelperRoot = (runtimeRoot: string, platform = process.platform) => join(runtimeRoot, 'Runtime', 'PythonHelpers', 'bundled', platform);
export function bundledHelperPython(runtimeRoot: string, platform = process.platform): string {
  const root = bundledHelperRoot(runtimeRoot, platform);
  const python = join(root, 'python', platform === 'win32' ? 'python.exe' : 'bin/python3.11');
  return existsSync(join(root, 'installed.json')) && existsSync(python) ? python : '';
}

export function fileSha256(path: string): string {
  const hash = createHash('sha256');
  const handle = openSync(path, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let count: number;
    while ((count = readSync(handle, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { closeSync(handle); }
}

export function verifyBundledPythonHelpers(runtimeRoot: string, platform = process.platform, expected = policy) {
  const root = bundledHelperRoot(runtimeRoot, platform);
  const pin = expected.platforms[platform as keyof typeof expected.platforms];
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error('Python release bundle contains a linked or non-regular entry.');
  const manifestInfo = lstatSync(join(root, 'installed.json'));
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink())
    throw new Error('Python release bundle contains a linked or non-regular entry.');
  const installed = JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'));
  if (!pin || installed.schemaVersion !== 1 || installed.policySha256 !== helperPolicyHash(expected)
    || installed.pythonVersion !== expected.pythonVersion || installed.pythonArchiveSha256 !== pin.python.sha256
    || !installed.files || typeof installed.files !== 'object') throw new Error('Bundled Python helpers do not match release policy.');
  const files = Object.entries(installed.files) as [string, { bytes: number; sha256: string }][];
  if (!files.length || files.length > 50_000 || installed.files['installed.json']) throw new Error('Invalid bundled Python file inventory.');
  for (const [name] of files) {
    const rel = relative(root, resolve(root, name));
    if (!name || isAbsolute(name) || name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..')
      || !rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Unsafe bundled Python file inventory.');
  }
  const actualFiles = new Set<string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      const name = relative(root, file).split(sep).join('/');
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
        throw new Error('Python release bundle contains a linked or non-regular entry.');
      if (name.toLowerCase() === 'models' || name.toLowerCase().startsWith('models/') || /\.(onnx|safetensors|ckpt|pt)$/i.test(name))
        throw new Error('Python dependency bundles must not include model weights.');
      if (entry.isDirectory()) walk(file);
      else {
        actualFiles.add(name);
        if (actualFiles.size > 50_001) throw new Error('Invalid bundled Python file inventory.');
      }
    }
  };
  walk(root);
  const declaredFiles = new Set(files.map(([name]) => name));
  for (const name of actualFiles) {
    if (name !== 'installed.json' && !declaredFiles.has(name)) throw new Error(`Unlisted bundled Python file: ${name}`);
  }
  for (const [name, item] of files) {
    const file = resolve(root, name);
    if (!actualFiles.has(name)) throw new Error(`Bundled Python file inventory is incomplete: ${name}`);
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== item.bytes || fileSha256(file) !== item.sha256)
      throw new Error(`Bundled Python checksum failed: ${name}`);
  }
  const required = ['python/' + (platform === 'win32' ? 'python.exe' : 'bin/python3.11'), 'PACKAGES.json'];
  for (const name of required) if (!installed.files[name]) throw new Error(`Bundled Python file inventory is incomplete: ${name}`);
  if (expected.modelsIncluded !== false || files.some(([name]) => name.startsWith('models/') || /\.(onnx|safetensors|ckpt|pt)$/i.test(name)))
    throw new Error('Python dependency bundles must not include model weights.');
  return installed;
}
