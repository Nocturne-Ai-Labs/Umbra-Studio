import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareUmbraVersions,
  normalizeGithubRelease,
  readUmbraAppVersion,
} from './AppUpdateService';
import {
  filterNewerUmbraReleases,
  isKnownUmbraVersion,
} from '../shared/appUpdate';

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.20.2',
    name: 'Umbra Studio 0.20.2',
    body: 'A focused update.',
    html_url: 'https://github.com/Nocturne-Ai-Labs/Umbra-Studio/releases/tag/v0.20.2',
    published_at: '2026-07-25T12:00:00Z',
    prerelease: false,
    draft: false,
    assets: [
      {
        name: 'Umbra-Studio-v0.20.2-Windows-x64.zip',
        browser_download_url: 'https://github.com/Nocturne-Ai-Labs/Umbra-Studio/releases/download/v0.20.2/Umbra-Studio-v0.20.2-Windows-x64.zip',
        size: 268435456,
        digest: 'sha256:abcdef',
      },
      {
        name: 'Umbra-Studio-v0.20.2-Linux-x64.zip',
        browser_download_url: 'https://github.com/Nocturne-Ai-Labs/Umbra-Studio/releases/download/v0.20.2/Umbra-Studio-v0.20.2-Linux-x64.zip',
        size: 260000000,
        digest: 'sha256:123456',
      },
    ],
    ...overrides,
  };
}

describe('Umbra release versions', () => {
  test('orders patch, minor, and major versions numerically', () => {
    expect(compareUmbraVersions('0.20.10', '0.20.9')).toBe(1);
    expect(compareUmbraVersions('0.21.0', '0.20.99')).toBe(1);
    expect(compareUmbraVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareUmbraVersions('v0.20.1', '0.20.1')).toBe(0);
  });

  test('reads the packaged version from the source root when the portable root has no package file', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'umbra-update-version-'));
    try {
      const runtimeRoot = join(temporaryRoot, 'Umbra Studio');
      const sourceRoot = join(runtimeRoot, 'resources', 'app');
      mkdirSync(sourceRoot, { recursive: true });
      writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({ version: '0.20.4' }));

      expect(readUmbraAppVersion(runtimeRoot, sourceRoot)).toBe('0.20.4');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('prefers the packaged source version over a stale portable-root manifest', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'umbra-update-version-'));
    try {
      const runtimeRoot = join(temporaryRoot, 'Umbra Studio');
      const sourceRoot = join(runtimeRoot, 'resources', 'app');
      mkdirSync(sourceRoot, { recursive: true });
      writeFileSync(join(runtimeRoot, 'package.json'), JSON.stringify({ version: '0.10.4' }));
      writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({ version: '0.20.4' }));

      expect(readUmbraAppVersion(runtimeRoot, sourceRoot)).toBe('0.20.4');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('counts only releases strictly newer than the installed build', () => {
    const releases = [
      { version: '0.20.5' },
      { version: '0.20.4' },
      { version: '0.20.3' },
      { version: '0.10.4' },
    ];

    expect(filterNewerUmbraReleases(releases, '0.20.4')).toEqual([{ version: '0.20.5' }]);
    expect(filterNewerUmbraReleases(releases, '0.20.5')).toEqual([]);
  });

  test('does not turn an unknown installed version into an all-releases badge', () => {
    expect(isKnownUmbraVersion('0.0.0')).toBe(false);
    expect(filterNewerUmbraReleases([
      { version: '0.20.4' },
      { version: '0.20.3' },
    ], '0.0.0')).toEqual([]);
  });
});

describe('GitHub release normalization', () => {
  test('selects the correct Windows package and digest', () => {
    const normalized = normalizeGithubRelease(release(), 'win32', 'x64');
    expect(normalized?.version).toBe('0.20.2');
    expect(normalized?.packageName).toBe('Umbra-Studio-v0.20.2-Windows-x64.zip');
    expect(normalized?.sha256).toBe('abcdef');
  });

  test('selects the correct Linux package', () => {
    const normalized = normalizeGithubRelease(release(), 'linux', 'x64');
    expect(normalized?.packageName).toBe('Umbra-Studio-v0.20.2-Linux-x64.zip');
    expect(normalized?.sha256).toBe('123456');
  });

  test('rejects drafts, public redirects, and unsupported architectures', () => {
    expect(normalizeGithubRelease(release({ draft: true }), 'win32', 'x64')).toBeNull();
    expect(normalizeGithubRelease(release({
      assets: [{
        name: 'Umbra-Studio-v0.20.2-Windows-x64.zip',
        browser_download_url: 'https://example.com/Umbra.zip',
      }],
    }), 'win32', 'x64')).toBeNull();
    expect(normalizeGithubRelease(release(), 'win32', 'arm64')).toBeNull();
  });
});
