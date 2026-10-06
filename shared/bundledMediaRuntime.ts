import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import defaults from '../defaults/MediaTools/source-build-manifest.json';

export function verifyBundledMediaRuntime(runtimeRoot: string, platform: NodeJS.Platform = process.platform, policy = defaults) {
  if (!policy.platforms.includes(platform)) throw new Error('No bundled media policy for this platform.');
  const root = join(runtimeRoot, 'Runtime', 'FFmpeg', platform);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('Bundled media directory is redirected.');
  const installed = JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'));
  const policySha256 = createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  if (installed.schemaVersion !== 2 || installed.buildKind !== 'pinned-source' || installed.policySha256 !== policySha256
    || installed.version !== policy.version || installed.release !== policy.release || installed.license !== policy.license
    || installed.platform !== platform || installed.binDirectory !== 'bin') throw new Error('Bundled media provenance does not match the pinned-source policy.');
  const actual = new Set<string>();
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const absolute = join(path, name); const entry = lstatSync(absolute);
      if (entry.isSymbolicLink()) throw new Error('Bundled media contains a redirected file or directory.');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const key = relative(root, absolute).split(sep).join('/');
        if (key === 'installed.json') continue;
        actual.add(key); const expected = installed.files?.[key];
        if (!expected || entry.size !== expected.bytes || createHash('sha256').update(readFileSync(absolute)).digest('hex') !== expected.sha256)
          throw new Error(`Bundled media verification failed: ${key}`);
      } else throw new Error('Bundled media contains an irregular entry.');
    }
  };
  walk(root);
  if (Object.keys(installed.files || {}).length !== actual.size) throw new Error('Bundled media inventory is incomplete.');
  const suffix = platform === 'win32' ? '.exe' : '';
  for (const name of [`bin/ffmpeg${suffix}`, `bin/ffprobe${suffix}`, 'LICENSE.txt', 'SOURCE.json', 'BUILD-CONFIG.txt',
    'corresponding-source/source-build-manifest.json', 'corresponding-source/build-media-from-source.sh', 'corresponding-source/README.txt',
    'build-evidence/toolchain.txt', 'build-evidence/encoders.txt', 'build-evidence/decoders.txt', 'build-evidence/native-dependencies.txt',
    'build-evidence/ffmpeg-configure-args.txt', 'build-evidence/ffmpeg-config.txt', 'build-evidence/x264-config.txt', 'build-evidence/vpx-config.txt',
    'build-evidence/webp-config.txt', 'build-evidence/zlib-config.txt', 'build-evidence/smoke-results.json',
    'NOTICE.txt', 'licenses/ffmpeg.txt', 'licenses/x264.txt', 'licenses/vpx.txt', 'licenses/webp.txt', 'licenses/zlib.txt', 'licenses/dav1d.txt', 'build-evidence/dav1d-config.txt']) if (!actual.has(name)) throw new Error(`Bundled media missing ${name}.`);
  if (JSON.stringify(JSON.parse(readFileSync(join(root, 'corresponding-source/source-build-manifest.json'), 'utf8'))) !== JSON.stringify(policy))
    throw new Error('Bundled corresponding-source policy differs.');
  if (installed.files['corresponding-source/build-media-from-source.sh'].sha256 !== policy.recipeSha256) throw new Error('Bundled media build recipe differs from policy.');
  for (const source of policy.sources) {
    const entry = installed.files[`corresponding-source/${source.name}.tar.gz`];
    if (!entry || entry.bytes !== source.bytes || entry.sha256 !== source.sha256) throw new Error(`Corresponding source mismatch: ${source.name}`);
  }
  const provenance = JSON.parse(readFileSync(join(root, 'SOURCE.json'), 'utf8'));
  if (provenance.policySha256 !== policySha256 || provenance.buildKind !== 'pinned-source'
    || JSON.stringify(provenance.sources) !== JSON.stringify(policy.sources) || JSON.stringify(provenance.patches) !== '[]') throw new Error('Source provenance mismatch.');
  const config = readFileSync(join(root, 'BUILD-CONFIG.txt'), 'utf8');
  for (const flag of ['--disable-autodetect', '--enable-gpl', '--enable-version3', '--enable-libx264', '--enable-libvpx', '--enable-libwebp', '--enable-zlib', '--enable-libdav1d'])
    if (!config.includes(flag)) throw new Error(`Bundled media configuration lacks ${flag}.`);
  if (config.includes('--enable-nonfree')) throw new Error('Nonfree media builds cannot be bundled.');
  const encoders = readFileSync(join(root, 'build-evidence/encoders.txt'), 'utf8');
  for (const name of policy.requiredEncoders) if (!new RegExp(`\\b${name}\\b`).test(encoders)) throw new Error(`Bundled media lacks ${name}.`);
  const decoders = readFileSync(join(root, 'build-evidence/decoders.txt'), 'utf8');
  for (const name of policy.requiredDecoders) if (!new RegExp(`\\b${name}\\b`).test(decoders)) throw new Error(`Bundled media lacks decoder ${name}.`);
  const smoke = JSON.parse(readFileSync(join(root, 'build-evidence/smoke-results.json'), 'utf8'));
  if (smoke.platform !== platform || smoke.passed !== true || smoke.results?.length !== 5 || smoke.results.some((item: { decodePassed: boolean }) => item.decodePassed !== true)) throw new Error('Media codec smoke qualification missing.');
  return installed;
}
