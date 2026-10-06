import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import defaults from '../defaults/MediaTools/manifest.json';

export function verifyBundledMediaRuntime(runtimeRoot: string, platform: NodeJS.Platform = process.platform, policy = defaults) {
  const pin = policy.packages[platform as keyof typeof policy.packages];
  if (!pin) throw new Error('No bundled media policy for this platform.');
  const root = join(runtimeRoot, 'Runtime', 'FFmpeg', platform);
  const installed = JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'));
  if (installed.version !== policy.version || installed.release !== policy.release || installed.license !== policy.license
    || installed.binDirectory !== 'bin' || installed.archiveSha256 !== pin.sha256 || installed.archiveBytes !== pin.bytes)
    throw new Error('Bundled media provenance does not match the release policy.');
  const suffix = platform === 'win32' ? '.exe' : '';
  for (const name of [`bin/ffmpeg${suffix}`, `bin/ffprobe${suffix}`, 'LICENSE.txt']) {
    const file = join(root, name);
    const entry = lstatSync(file);
    const expected = installed.files?.[name];
    if (!entry.isFile() || entry.isSymbolicLink() || !expected || entry.size !== expected.bytes
      || createHash('sha256').update(readFileSync(file)).digest('hex') !== expected.sha256)
      throw new Error(`Bundled media verification failed: ${name}`);
  }
  for (const name of ['SOURCE.json', 'BUILD-CONFIG.txt']) {
    if (!lstatSync(join(root, name)).isFile()) throw new Error(`Bundled media is missing ${name}.`);
  }
  return installed;
}
