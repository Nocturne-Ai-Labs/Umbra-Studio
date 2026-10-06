import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
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
  const installed = JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'));
  if (!pin || installed.schemaVersion !== 1 || installed.policySha256 !== helperPolicyHash(expected)
    || installed.pythonVersion !== expected.pythonVersion || installed.pythonArchiveSha256 !== pin.python.sha256
    || !installed.files || typeof installed.files !== 'object') throw new Error('Bundled Python helpers do not match release policy.');
  const files = Object.entries(installed.files) as [string, { bytes: number; sha256: string }][];
  if (!files.length || files.length > 50_000) throw new Error('Invalid bundled Python file inventory.');
  for (const [name, item] of files) {
    const file = resolve(root, name);
    const rel = relative(root, file);
    if (!name || isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')
      || !rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Unsafe bundled Python file inventory.');
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
