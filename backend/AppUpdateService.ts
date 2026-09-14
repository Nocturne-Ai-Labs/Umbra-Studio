import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import type { BigIntStats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import {
  compareUmbraVersions as compareSharedUmbraVersions,
  createIdleUmbraUpdateState,
  filterNewerUmbraReleases,
  normalizeUmbraVersion,
  normalizeUmbraUpdateState,
  type UmbraReleaseBuild,
  type UmbraUpdateState,
} from '../shared/appUpdate';
import { resolveUmbraUpdaterCacheRoot } from '../shared/umbraUpdaterWorkspace';
import {
  detectUmbraWindowsLauncherFlavor,
  type UmbraWindowsLauncherFlavor,
} from '../shared/portableLauncher';

const RELEASES_API_URL = 'https://api.github.com/repos/Nocturne-Ai-Labs/Umbra-Studio/releases?per_page=30';
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024 * 1024;

type GithubAsset = {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
  digest?: unknown;
};

type GithubRelease = {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  assets?: unknown;
};

export function readUmbraAppVersion(runtimeRoot: string, sourceRoot: string): string {
  const candidates = [
    join(resolve(sourceRoot), 'package.json'),
    join(resolve(runtimeRoot), 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, unknown>;
      const version = normalizeUmbraVersion(parsed.version);
      if (version) return version;
    } catch {
      // Try the next supported portable layout.
    }
  }
  return '0.0.0';
}

export function compareUmbraVersions(left: string, right: string): number {
  return compareSharedUmbraVersions(left, right);
}

function releaseAssetPattern(
  platform: NodeJS.Platform,
  arch: string,
  windowsLauncherFlavor: UmbraWindowsLauncherFlavor = 'bat',
): RegExp {
  if (arch !== 'x64') return /$a/;
  if (platform === 'win32') {
    return windowsLauncherFlavor === 'bat'
      ? /^Umbra-Studio-v.+-Windows-x64-BAT\.zip$/i
      : /^Umbra-Studio-v.+-Windows-x64\.zip$/i;
  }
  if (platform === 'linux') return /^Umbra-Studio-v.+-Linux-x64\.zip$/i;
  return /$a/;
}

function normalizeDigest(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  return raw.startsWith('sha256:') ? raw.slice('sha256:'.length) : raw;
}

export function normalizeGithubRelease(
  value: GithubRelease,
  platform: NodeJS.Platform,
  arch: string,
  windowsLauncherFlavor: UmbraWindowsLauncherFlavor = 'bat',
): UmbraReleaseBuild | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.draft === true) return null;
  const tag = String(value.tag_name || '').trim();
  const version = normalizeUmbraVersion(tag);
  if (!tag || !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(version)) return null;
  const assets = Array.isArray(value.assets) ? value.assets as GithubAsset[] : [];
  const packagePattern = releaseAssetPattern(platform, arch, windowsLauncherFlavor);
  const asset = assets.find((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const name = String(entry.name || '').trim();
    const assetVersion = /^Umbra-Studio-v(.+)-(?:Windows-x64(?:-BAT)?|Linux-x64)\.zip$/i.exec(name)?.[1];
    return packagePattern.test(name) && assetVersion?.toLowerCase() === version.toLowerCase();
  });
  if (!asset) return null;
  const packageUrl = String(asset.browser_download_url || '').trim();
  if (!packageUrl.startsWith('https://github.com/')) return null;
  return {
    tag,
    version,
    name: String(value.name || tag).trim() || tag,
    channel: value.prerelease === true ? 'prerelease' : 'stable',
    publishedAt: String(value.published_at || '').trim(),
    notes: String(value.body || '').trim(),
    releaseUrl: String(value.html_url || '').trim(),
    packageName: String(asset.name || basename(new URL(packageUrl).pathname)).trim(),
    packageUrl,
    packageBytes: Math.max(0, Number(asset.size) || 0),
    sha256: normalizeDigest(asset.digest),
  };
}

function writeJsonAtomic(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      renameSync(temporaryPath, filePath);
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (!['EACCES', 'EBUSY', 'EPERM'].includes(code) || attempt === 39) throw error;
      Bun.sleepSync(50);
    }
  }
}

export class AppUpdateService {
  readonly runtimeRoot: string;
  readonly currentVersion: string;
  readonly statePath: string;
  readonly windowsLauncherFlavor: UmbraWindowsLauncherFlavor;
  private releaseCache: { expiresAt: number; releases: UmbraReleaseBuild[] } | null = null;

  constructor(runtimeRoot: string, currentVersion: string) {
    this.runtimeRoot = resolve(runtimeRoot);
    this.currentVersion = normalizeUmbraVersion(currentVersion);
    this.statePath = join(this.runtimeRoot, 'User', 'Config', 'app-update.json');
    this.windowsLauncherFlavor = process.platform === 'win32'
      ? detectUmbraWindowsLauncherFlavor(this.runtimeRoot) || 'bat'
      : 'bat';
  }

  readState(): UmbraUpdateState {
    try {
      if (!existsSync(this.statePath)) return createIdleUmbraUpdateState(this.currentVersion);
      return normalizeUmbraUpdateState(JSON.parse(readFileSync(this.statePath, 'utf8')), this.currentVersion);
    } catch {
      return createIdleUmbraUpdateState(this.currentVersion);
    }
  }

  writeState(state: UmbraUpdateState): UmbraUpdateState {
    const normalized = normalizeUmbraUpdateState(state, this.currentVersion);
    writeJsonAtomic(this.statePath, normalized);
    return normalized;
  }

  async listReleases(options: { refresh?: boolean; includePrerelease?: boolean } = {}) {
    if (!options.refresh && this.releaseCache && this.releaseCache.expiresAt > Date.now()) {
      return this.summarizeReleases(this.releaseCache.releases, options.includePrerelease === true);
    }
    const response = await fetch(RELEASES_API_URL, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Umbra-Studio/${this.currentVersion || 'unknown'}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Cache-Control': 'no-cache',
      },
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim().slice(0, 300);
      throw new Error(detail
        ? `GitHub release check failed (${response.status}): ${detail}`
        : `GitHub release check failed (${response.status}).`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('Invalid GitHub release list. Please try checking for updates again.');
    const releases = payload
      .map((entry) => normalizeGithubRelease(
        entry as GithubRelease,
        process.platform,
        process.arch,
        this.windowsLauncherFlavor,
      ))
      .filter((entry): entry is UmbraReleaseBuild => Boolean(entry))
      .sort((left, right) => compareUmbraVersions(right.version, left.version));
    this.releaseCache = {
      expiresAt: Date.now() + RELEASE_CACHE_TTL_MS,
      releases,
    };
    return this.summarizeReleases(releases, options.includePrerelease === true);
  }

  private summarizeReleases(releases: UmbraReleaseBuild[], includePrerelease: boolean) {
    const visible = releases.filter((entry) => includePrerelease || entry.channel === 'stable');
    const updates = filterNewerUmbraReleases(visible, this.currentVersion);
    return {
      currentVersion: this.currentVersion,
      platform: process.platform,
      arch: process.arch,
      updateCount: updates.length,
      latestVersion: updates[0]?.version || this.currentVersion,
      releases: visible,
    };
  }

  createWorkspace(release: UmbraReleaseBuild): string {
    const cacheRoot = resolveUmbraUpdaterCacheRoot(this.runtimeRoot);
    mkdirSync(cacheRoot, { recursive: true });
    const safeVersion = release.version.replace(/[^a-z0-9._-]+/gi, '-');
    const workspaceRoot = join(cacheRoot, `session-${safeVersion}-${Date.now()}`);
    mkdirSync(workspaceRoot, { recursive: false });
    return workspaceRoot;
  }

  async downloadRelease(
    release: UmbraReleaseBuild,
    workspaceRoot: string,
    onProgress: (processedBytes: number, totalBytes: number) => void,
  ): Promise<{ archivePath: string; sha256: string; totalBytes: number }> {
    if (!release.packageName || /[<>:"/\\|?*\x00-\x1f]/.test(release.packageName) || !/\.zip$/i.test(release.packageName))
      throw new Error('Invalid release package filename.');
    const archivePath = join(workspaceRoot, release.packageName);
    const expectedBytes = release.packageBytes;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_PACKAGE_BYTES)
      throw new Error('Invalid release package size.');
    const controller = new AbortController();
    const network = async <T>(operation: () => Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Release download stalled for two minutes. Retry when the connection is available.');
          controller.abort(error);
          reject(error);
        }, DOWNLOAD_IDLE_TIMEOUT_MS);
      });
      try { return await Promise.race([operation(), deadline]); }
      finally { clearTimeout(timer); }
    };
    const response = await network(() => fetch(release.packageUrl, {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': `Umbra-Studio/${this.currentVersion || 'unknown'}`,
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
      signal: controller.signal,
    }));
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Release package download failed (${response.status}).`);
    }
    const reader = response.body.getReader();
    let output: Awaited<ReturnType<typeof fs.open>> | undefined;
    let owned: BigIntStats | undefined;
    let complete = false;
    const digest = createHash('sha256');
    let processedBytes = 0;
    try {
      const declaredBytes = Number(response.headers.get('content-length') || 0);
      if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_PACKAGE_BYTES
        || (expectedBytes && declaredBytes && expectedBytes !== declaredBytes))
        throw new Error('Release package size does not match the published asset.');
      const contentLength = expectedBytes || declaredBytes;
      output = await fs.open(archivePath, 'wx');
      owned = await output.stat({ bigint: true });
      while (true) {
        const chunk = await network(() => reader.read());
        if (chunk.done) break;
        const buffer = chunk.value;
        processedBytes += buffer.length;
        if (processedBytes > (contentLength || MAX_PACKAGE_BYTES)) throw new Error('Release package exceeds its expected size.');
        digest.update(buffer);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesWritten } = await output.write(buffer, offset, buffer.length - offset);
          if (!bytesWritten) throw new Error('Release package could not be written.');
          offset += bytesWritten;
        }
        onProgress(processedBytes, contentLength);
      }
      if (!processedBytes || (contentLength && processedBytes !== contentLength))
        throw new Error('Downloaded release package is empty or incomplete.');
      const sha256 = digest.digest('hex');
      if (release.sha256 && sha256.toLowerCase() !== release.sha256.toLowerCase())
        throw new Error('Downloaded release package failed SHA-256 verification.');
      await output.sync();
      await output.close();
      output = undefined;
      complete = true;
      return { archivePath, sha256, totalBytes: processedBytes };
    } finally {
      try { await output?.close(); }
      finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
        if (!complete && owned) {
          const current = await fs.lstat(archivePath, { bigint: true }).catch(() => null);
          if (current?.dev === owned.dev && current?.ino === owned.ino)
            await fs.unlink(archivePath).catch(() => undefined);
        }
      }
    }
  }

  async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    for await (const chunk of input) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }
}
