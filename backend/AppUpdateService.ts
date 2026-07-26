import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
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

const RELEASES_API_URL = 'https://api.github.com/repos/Nocturne-Ai-Labs/Umbra-Studio/releases?per_page=30';
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;

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

function releaseAssetPattern(platform: NodeJS.Platform, arch: string): RegExp {
  if (arch !== 'x64') return /$a/;
  if (platform === 'win32') return /^Umbra-Studio-v.+-Windows-x64\.zip$/i;
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
): UmbraReleaseBuild | null {
  if (!value || value.draft === true) return null;
  const tag = String(value.tag_name || '').trim();
  const version = normalizeUmbraVersion(tag);
  if (!tag || !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(version)) return null;
  const assets = Array.isArray(value.assets) ? value.assets as GithubAsset[] : [];
  const packagePattern = releaseAssetPattern(platform, arch);
  const asset = assets.find((entry) => packagePattern.test(String(entry.name || '').trim()));
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
  renameSync(temporaryPath, filePath);
}

export class AppUpdateService {
  readonly runtimeRoot: string;
  readonly currentVersion: string;
  readonly statePath: string;
  private releaseCache: { expiresAt: number; releases: UmbraReleaseBuild[] } | null = null;

  constructor(runtimeRoot: string, currentVersion: string) {
    this.runtimeRoot = resolve(runtimeRoot);
    this.currentVersion = normalizeUmbraVersion(currentVersion);
    this.statePath = join(this.runtimeRoot, 'User', 'Config', 'app-update.json');
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
    const releases = (Array.isArray(payload) ? payload : [])
      .map((entry) => normalizeGithubRelease(entry as GithubRelease, process.platform, process.arch))
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
    const parentRoot = dirname(this.runtimeRoot);
    const safeVersion = release.version.replace(/[^a-z0-9._-]+/gi, '-');
    const workspaceRoot = join(parentRoot, `.umbra-update-${safeVersion}-${Date.now()}`);
    mkdirSync(workspaceRoot, { recursive: false });
    return workspaceRoot;
  }

  async downloadRelease(
    release: UmbraReleaseBuild,
    workspaceRoot: string,
    onProgress: (processedBytes: number, totalBytes: number) => void,
  ): Promise<{ archivePath: string; sha256: string; totalBytes: number }> {
    const archivePath = join(workspaceRoot, release.packageName);
    const response = await fetch(release.packageUrl, {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': `Umbra-Studio/${this.currentVersion || 'unknown'}`,
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    if (!response.ok || !response.body) {
      throw new Error(`Release package download failed (${response.status}).`);
    }
    const contentLength = Math.max(
      0,
      Number(response.headers.get('content-length')) || release.packageBytes || 0,
    );
    const output = createWriteStream(archivePath, { flags: 'wx' });
    const hash = createHash('sha256');
    let processedBytes = 0;
    try {
      for await (const chunk of response.body as any) {
        const buffer = Buffer.from(chunk);
        hash.update(buffer);
        processedBytes += buffer.length;
        if (!output.write(buffer)) await once(output, 'drain');
        onProgress(processedBytes, contentLength);
      }
      output.end();
      await once(output, 'close');
    } catch (error) {
      output.destroy();
      throw error;
    }
    const sha256 = hash.digest('hex');
    if (release.sha256 && sha256.toLowerCase() !== release.sha256.toLowerCase()) {
      throw new Error('Downloaded release package failed SHA-256 verification.');
    }
    return {
      archivePath,
      sha256,
      totalBytes: processedBytes,
    };
  }

  async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    for await (const chunk of input) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }
}
