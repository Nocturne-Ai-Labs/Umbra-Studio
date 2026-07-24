import { join, basename, extname, dirname, resolve } from 'path';
import { existsSync, type Dirent } from 'fs';
import * as fs from 'fs/promises';
import { spawn } from 'node:child_process';

type FsFilter = string | null;

type TrashMetaItem = {
  trashPath: string;
  name: string;
  originalPath: string;
  deletedAt: string;
  expiresAt: string;
};

type FsWarmupRequest = {
  id: string;
  type: 'warmup';
  payload: {};
};

type FsInvalidateRequest = {
  id: string;
  type: 'invalidate';
  payload: {
    paths: string[];
  };
};

type FsListRequest = {
  id: string;
  type: 'list';
  payload: {
    fullPath: string;
    targetPath: string;
    filter: FsFilter;
    isTrashPath: boolean;
    isTrashRoot: boolean;
    recursive?: boolean;
    trashMetadataPath?: string;
  };
};

type FsListProgressiveRequest = {
  id: string;
  type: 'list-progressive';
  payload: {
    fullPath: string;
    targetPath: string;
    limit: number;
    cursor: number;
    force?: boolean;
  };
};

type FsTreeRequest = {
  id: string;
  type: 'tree';
  payload: {
    fullPath: string;
    targetPath: string;
    maxDepth: number;
  };
};

type FsFolderSummaryRequest = {
  id: string;
  type: 'folder-summary';
  payload: {
    fullPath: string;
    targetPath: string;
    force?: boolean;
  };
};

type FsStatFilesRequest = {
  id: string;
  type: 'stat-files';
  payload: {
    items: Array<{
      path: string;
      fullPath: string;
      folderPath: string;
      name: string;
      type: 'image' | 'gif' | 'video';
    }>;
  };
};

type FsMoveRequest = {
  id: string;
  type: 'move';
  payload: {
    items: Array<{
      sourcePath: string;
      sourceFullPath: string;
      targetFullPath?: string;
    }>;
    destination: string;
    destinationFullPath: string;
    transferMode: 'default' | 'cloud';
  };
};

type FsCopyRequest = {
  id: string;
  type: 'copy';
  payload: {
    items: Array<{
      sourcePath: string;
      sourceFullPath: string;
      targetFullPath?: string;
    }>;
    destination: string;
    destinationFullPath: string;
  };
};

type FsMkdirRequest = {
  id: string;
  type: 'mkdir';
  payload: {
    fullPath: string;
  };
};

type FsRenameRequest = {
  id: string;
  type: 'rename';
  payload: {
    oldFullPath: string;
    newFullPath: string;
  };
};

type FsWriteRequest = {
  id: string;
  type: 'write';
  payload: {
    fullPath: string;
    content: string;
    encoding: 'utf8' | 'base64';
  };
};

type FsReadRequest = {
  id: string;
  type: 'read';
  payload: {
    fullPath: string;
  };
};

type FsDeleteRequest = {
  id: string;
  type: 'delete';
  payload: {
    items: Array<{
      path: string;
      fullPath: string;
    }>;
    force?: boolean;
  };
};

type FsSystemTrashRequest = {
  id: string;
  type: 'system-trash';
  payload: {
    fullPath: string;
  };
};

type FsWorkerRequest =
  | FsWarmupRequest
  | FsInvalidateRequest
  | FsListRequest
  | FsListProgressiveRequest
  | FsTreeRequest
  | FsFolderSummaryRequest
  | FsStatFilesRequest
  | FsMoveRequest
  | FsCopyRequest
  | FsMkdirRequest
  | FsRenameRequest
  | FsWriteRequest
  | FsReadRequest
  | FsDeleteRequest
  | FsSystemTrashRequest;

type FsWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string }
  | { id: string; event: 'progress'; progress: unknown };

function writeResponse(response: FsWorkerResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function buildGalleryThumbnailUrl(itemPath: string, stats?: { mtimeMs?: number; size?: number }): string {
  const params = new URLSearchParams({
    path: itemPath,
    size: 'small',
    q: '70',
  });
  if (stats) {
    params.set(
      'rev',
      `m${Math.max(0, Math.floor(Number(stats.mtimeMs) || 0))}-s${Math.max(0, Math.floor(Number(stats.size) || 0))}`,
    );
  }
  return `/api/fs/thumbnail?${params.toString()}`;
}

type ProgressiveSeedEntry = {
  name: string;
  kind: 'folder' | 'file';
  mediaType?: 'image' | 'video';
};

type ProgressiveSeedCacheEntry = {
  createdAt: number;
  entries: ProgressiveSeedEntry[];
  totalMedia: number;
};

type ProgressiveSeedSnapshot = ProgressiveSeedCacheEntry & {
  seedSource: 'cache' | 'inflight' | 'scan';
  seedWaitMs: number;
  seedBuildMs: number;
};

const PROGRESSIVE_SEED_TTL_MS = 120_000;
const PROGRESSIVE_SEED_CACHE_MAX = 256;
const DIRECTORY_TREE_SEED_TTL_MS = 30_000;
const DIRECTORY_TREE_SEED_CACHE_MAX = 256;
const progressiveSeedCache = new Map<string, ProgressiveSeedCacheEntry>();
const directoryTreeSeedCache = new Map<string, ProgressiveSeedCacheEntry>();
const progressiveSeedInFlight = new Map<string, Promise<ProgressiveSeedEntry[]>>();
const directoryTreeSeedInFlight = new Map<string, Promise<ProgressiveSeedEntry[]>>();
const progressiveNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function pruneProgressiveSeedCache() {
  const now = Date.now();
  for (const [key, entry] of progressiveSeedCache.entries()) {
    if (now - entry.createdAt > PROGRESSIVE_SEED_TTL_MS) {
      progressiveSeedCache.delete(key);
    }
  }

  while (progressiveSeedCache.size > PROGRESSIVE_SEED_CACHE_MAX) {
    const oldestKey = progressiveSeedCache.keys().next().value;
    if (!oldestKey) break;
    progressiveSeedCache.delete(oldestKey);
  }
}

function compareProgressiveSeedEntries(a: ProgressiveSeedEntry, b: ProgressiveSeedEntry) {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return progressiveNameCollator.compare(a.name, b.name);
}

function createSeedCacheEntry(entries: ProgressiveSeedEntry[]): ProgressiveSeedCacheEntry {
  let totalMedia = 0;
  for (const entry of entries) {
    if (entry.kind === 'file') totalMedia += 1;
  }
  return {
    createdAt: Date.now(),
    entries,
    totalMedia,
  };
}

function invalidateProgressiveSeedCachePath(pathLike?: string | null) {
  if (!pathLike) return;
  try {
    const resolvedPath = resolve(String(pathLike));
    progressiveSeedCache.delete(resolvedPath);
    directoryTreeSeedCache.delete(resolvedPath);
    progressiveSeedInFlight.delete(resolvedPath);
    directoryTreeSeedInFlight.delete(resolvedPath);
    progressiveSeedCache.delete(resolve(dirname(resolvedPath)));
    directoryTreeSeedCache.delete(resolve(dirname(resolvedPath)));
    progressiveSeedInFlight.delete(resolve(dirname(resolvedPath)));
    directoryTreeSeedInFlight.delete(resolve(dirname(resolvedPath)));
  } catch {
    // best effort
  }
}

function pruneDirectoryTreeSeedCache() {
  const now = Date.now();
  for (const [key, entry] of directoryTreeSeedCache.entries()) {
    if (now - entry.createdAt > DIRECTORY_TREE_SEED_TTL_MS) {
      directoryTreeSeedCache.delete(key);
    }
  }

  while (directoryTreeSeedCache.size > DIRECTORY_TREE_SEED_CACHE_MAX) {
    const oldestKey = directoryTreeSeedCache.keys().next().value;
    if (!oldestKey) break;
    directoryTreeSeedCache.delete(oldestKey);
  }
}

async function buildProgressiveSeed(fullPath: string) {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif', '.jxl', '.tiff', '.tif', '.svg', '.apng']);
  const videoExts = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv']);
  const rawEntries = await fs.readdir(fullPath, { withFileTypes: true });
  const entries: ProgressiveSeedEntry[] = [];

  for (const entry of rawEntries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      entries.push({ name: entry.name, kind: 'folder' });
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!imageExts.has(ext) && !videoExts.has(ext)) continue;
    entries.push({
      name: entry.name,
      kind: 'file',
      mediaType: videoExts.has(ext) ? 'video' : 'image',
    });
  }

  entries.sort(compareProgressiveSeedEntries);
  return entries;
}

async function getProgressiveSeedSnapshot(fullPath: string, force = false): Promise<ProgressiveSeedSnapshot> {
  const cacheKey = resolve(fullPath);
  if (force) {
    invalidateProgressiveSeedCachePath(cacheKey);
  }
  pruneProgressiveSeedCache();
  const cached = progressiveSeedCache.get(cacheKey);
  if (cached && (Date.now() - cached.createdAt) <= PROGRESSIVE_SEED_TTL_MS) {
    return {
      ...cached,
      seedSource: 'cache',
      seedWaitMs: 0,
      seedBuildMs: 0,
    };
  }

  const inFlight = progressiveSeedInFlight.get(cacheKey);
  if (inFlight) {
    const waitStartedAt = Date.now();
    const entries = await inFlight;
    return {
      ...(progressiveSeedCache.get(cacheKey) || createSeedCacheEntry(entries)),
      seedSource: 'inflight',
      seedWaitMs: Date.now() - waitStartedAt,
      seedBuildMs: 0,
    };
  }

  const buildStartedAt = Date.now();
  let request: Promise<ProgressiveSeedEntry[]>;
  request = buildProgressiveSeed(fullPath)
    .then((entries) => {
      if (progressiveSeedInFlight.get(cacheKey) === request) {
        progressiveSeedCache.set(cacheKey, createSeedCacheEntry(entries));
        pruneProgressiveSeedCache();
      }
      return entries;
    })
    .finally(() => {
      if (progressiveSeedInFlight.get(cacheKey) === request) {
        progressiveSeedInFlight.delete(cacheKey);
      }
    });
  progressiveSeedInFlight.set(cacheKey, request);
  const entries = await request;
  return {
    ...(progressiveSeedCache.get(cacheKey) || createSeedCacheEntry(entries)),
    seedSource: 'scan',
    seedWaitMs: 0,
    seedBuildMs: Date.now() - buildStartedAt,
  };
}

async function getProgressiveSeed(fullPath: string, force = false) {
  return (await getProgressiveSeedSnapshot(fullPath, force)).entries;
}

async function buildDirectoryTreeSeed(fullPath: string) {
  const rawEntries = await fs.readdir(fullPath, { withFileTypes: true });
  const entries: ProgressiveSeedEntry[] = [];

  for (const entry of rawEntries) {
    if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
    entries.push({ name: entry.name, kind: 'folder' });
  }

  entries.sort(compareProgressiveSeedEntries);
  return entries;
}

async function getDirectoryTreeSeed(fullPath: string) {
  const cacheKey = resolve(fullPath);
  pruneDirectoryTreeSeedCache();
  const cached = directoryTreeSeedCache.get(cacheKey);
  if (cached && (Date.now() - cached.createdAt) <= DIRECTORY_TREE_SEED_TTL_MS) {
    return cached.entries;
  }

  const inFlight = directoryTreeSeedInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildDirectoryTreeSeed(fullPath)
    .then((entries) => {
      directoryTreeSeedCache.set(cacheKey, {
        createdAt: Date.now(),
        entries,
        totalMedia: 0,
      });
      pruneDirectoryTreeSeedCache();
      return entries;
    })
    .finally(() => {
      directoryTreeSeedInFlight.delete(cacheKey);
    });
  directoryTreeSeedInFlight.set(cacheKey, request);
  return request;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) return;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

function inferLegacyTrashName(entryName: string) {
  const withRandom = entryName.match(/^\d+_[a-z0-9]{6}_(.+)$/i);
  if (withRandom?.[1]) return withRandom[1];

  const legacy = entryName.match(/^\d+_(.+)$/);
  if (legacy?.[1]) return legacy[1];

  return entryName;
}

async function loadTrashMeta(trashMetadataPath?: string) {
  const trashMetaByPath = new Map<string, TrashMetaItem>();
  const trashMetaItems: TrashMetaItem[] = [];
  if (!trashMetadataPath || !existsSync(trashMetadataPath)) {
    return { trashMetaByPath, trashMetaItems };
  }

  try {
    const metadataRaw = await fs.readFile(trashMetadataPath, 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    const items = Array.isArray(metadata?.items) ? metadata.items : [];

    for (const item of items) {
      const trashPath = typeof item?.trashPath === 'string' ? normalizeRelPath(item.trashPath) : '';
      if (!trashPath) continue;

      const explicitName = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : '';
      const originalPath = typeof item?.originalPath === 'string' ? item.originalPath : '';
      const deletedAt = typeof item?.deletedAt === 'string' ? item.deletedAt : '';
      const expiresAt = typeof item?.expiresAt === 'string' ? item.expiresAt : '';
      const derivedName = explicitName || basename(originalPath) || basename(trashPath);
      const normalizedOriginalPath = normalizeRelPath(originalPath);

      const normalized: TrashMetaItem = {
        trashPath,
        name: derivedName,
        originalPath: normalizedOriginalPath,
        deletedAt,
        expiresAt,
      };

      trashMetaByPath.set(trashPath, normalized);
      trashMetaItems.push(normalized);
    }
  } catch (error) {
    console.error('[FsWorker] Failed to load trash metadata:', error);
  }

  return { trashMetaByPath, trashMetaItems };
}

function createTrashDisplayResolver(
  isTrashPath: boolean,
  isTrashRoot: boolean,
  trashMetaByPath: Map<string, TrashMetaItem>,
  trashMetaItems: TrashMetaItem[],
) {
  return (itemPath: string, entryName: string) => {
    if (!isTrashPath) {
      return { displayName: entryName, originalPath: '', deletedAt: '', expiresAt: '' };
    }

    const normalizedPath = normalizeRelPath(itemPath);
    const direct = trashMetaByPath.get(normalizedPath);
    if (direct) {
      return {
        displayName: direct.name || entryName,
        originalPath: direct.originalPath || '',
        deletedAt: direct.deletedAt || '',
        expiresAt: direct.expiresAt || '',
      };
    }

    let best: TrashMetaItem | null = null;
    for (const meta of trashMetaItems) {
      const base = meta.trashPath;
      if (normalizedPath === base || normalizedPath.startsWith(`${base}/`)) {
        if (!best || base.length > best.trashPath.length) {
          best = meta;
        }
      }
    }

    if (best) {
      const suffix = normalizedPath.slice(best.trashPath.length).replace(/^\/+/, '');
      const originalBase = String(best.originalPath || '').replace(/\/+$/, '');
      const inferredOriginalPath = suffix
        ? (originalBase ? `${originalBase}/${suffix}` : suffix)
        : best.originalPath;
      const inferredDisplayName = suffix ? basename(suffix) : (best.name || entryName);
      return {
        displayName: inferredDisplayName || entryName,
        originalPath: inferredOriginalPath || '',
        deletedAt: best.deletedAt || '',
        expiresAt: best.expiresAt || '',
      };
    }

    return {
      displayName: isTrashRoot ? inferLegacyTrashName(entryName) : entryName,
      originalPath: '',
      deletedAt: '',
      expiresAt: '',
    };
  };
}

async function runList(payload: FsListRequest['payload']) {
  const { fullPath, targetPath, filter, isTrashPath, isTrashRoot, recursive, trashMetadataPath } = payload;
  const folders: any[] = [];
  const files: any[] = [];
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif', '.jxl', '.tiff', '.tif', '.svg', '.apng']);
  const videoExts = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv']);
  const textExts = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.log']);
  const fontExts = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
  const mediaTypeCounts = {
    image: 0,
    video: 0,
    gif: 0,
    media: 0,
  };

  const { trashMetaByPath, trashMetaItems } = await loadTrashMeta(trashMetadataPath);
  const resolveTrashDisplayMeta = createTrashDisplayResolver(isTrashPath, isTrashRoot, trashMetaByPath, trashMetaItems);

  const fileEntries: { entry: Dirent; itemPath: string; fullFilePath: string; ext: string }[] = [];

  const collectDirectoryEntries = async (dirFullPath: string, dirClientPath: string, recurse: boolean): Promise<void> => {
    let dirEntries: Dirent[] = [];
    try {
      dirEntries = await fs.readdir(dirFullPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.')) continue;

      const fullEntryPath = join(dirFullPath, entry.name);
      const itemPath = normalizeRelPath(join(dirClientPath, entry.name));
      const trashMeta = resolveTrashDisplayMeta(itemPath, entry.name);
      const displayName = trashMeta.displayName;

      if (entry.isDirectory()) {
        if (recurse) {
          await collectDirectoryEntries(fullEntryPath, itemPath, true);
          continue;
        }

        const folderStats = await fs.stat(fullEntryPath).catch(() => null);
        const folderDeletedAtMs = Date.parse(String(trashMeta.deletedAt || ''));
        const folderModified = Number.isFinite(folderDeletedAtMs)
          ? folderDeletedAtMs
          : (folderStats?.mtimeMs || Date.now());
        const folderCreated = Number.isFinite(folderDeletedAtMs)
          ? folderDeletedAtMs
          : (folderStats?.birthtimeMs || folderStats?.ctimeMs || folderModified);

        folders.push({
          name: displayName,
          path: itemPath,
          relativePath: itemPath,
          modified: folderModified,
          created: folderCreated,
          hasChildren: true,
          ...(isTrashPath ? {
            trashOriginalPath: trashMeta.originalPath || undefined,
            trashDeletedAt: trashMeta.deletedAt || undefined,
            trashExpiresAt: trashMeta.expiresAt || undefined,
          } : {}),
        });
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      if (filter === 'text') {
        if (textExts.has(ext)) fileEntries.push({ entry, itemPath, fullFilePath: fullEntryPath, ext });
      } else if (filter === 'font') {
        if (fontExts.has(ext)) fileEntries.push({ entry, itemPath, fullFilePath: fullEntryPath, ext });
      } else if (filter === 'all') {
        fileEntries.push({ entry, itemPath, fullFilePath: fullEntryPath, ext });
      } else if (imageExts.has(ext) || videoExts.has(ext)) {
        mediaTypeCounts.media += 1;
        if (videoExts.has(ext)) {
          mediaTypeCounts.video += 1;
        } else if (ext === '.gif') {
          mediaTypeCounts.gif += 1;
        } else {
          mediaTypeCounts.image += 1;
        }
        fileEntries.push({ entry, itemPath, fullFilePath: fullEntryPath, ext });
      }
    }
  };

  await collectDirectoryEntries(fullPath, targetPath, Boolean(isTrashRoot || recursive));

  const fileStats = await mapWithConcurrency(
    fileEntries,
    24,
    async ({ entry, itemPath, fullFilePath, ext }) => {
      const trashMeta = resolveTrashDisplayMeta(itemPath, entry.name);
      const displayName = trashMeta.displayName;
      try {
        const stats = await fs.stat(fullFilePath);
        const deletedAtMs = Date.parse(String(trashMeta.deletedAt || ''));
        const created = Number.isFinite(deletedAtMs)
          ? deletedAtMs
          : (stats.birthtimeMs || stats.ctimeMs || stats.mtimeMs);
        const modified = Number.isFinite(deletedAtMs) ? deletedAtMs : stats.mtimeMs;

        if (filter === 'text') {
          return { name: displayName, path: itemPath, created, modified, size: stats.size };
        }
        if (filter === 'font') {
          return { name: displayName, path: itemPath, url: `/api/fs/image?path=${encodeURIComponent(itemPath)}`, created, modified, size: stats.size };
        }
        if (filter === 'all') {
          return { name: displayName, path: itemPath, created, modified, size: stats.size };
        }

        return {
          id: itemPath,
          name: displayName,
          path: itemPath,
          relativePath: itemPath,
          url: `/api/fs/image?path=${encodeURIComponent(itemPath)}`,
          thumbnailUrl: buildGalleryThumbnailUrl(itemPath, stats),
          type: videoExts.has(ext) ? 'video' : 'image',
          width: 512,
          height: 512,
          created,
          modified,
          size: stats.size,
          ...(isTrashPath ? {
            trashOriginalPath: trashMeta.originalPath || undefined,
            trashDeletedAt: trashMeta.deletedAt || undefined,
            trashExpiresAt: trashMeta.expiresAt || undefined,
          } : {}),
        };
      } catch {
        const deletedAtMs = Date.parse(String(trashMeta.deletedAt || ''));
        const fallbackTimestamp = Number.isFinite(deletedAtMs) ? deletedAtMs : Date.now();

        if (filter === 'text') {
          return { name: displayName, path: itemPath, created: fallbackTimestamp, modified: fallbackTimestamp, size: 0 };
        }
        if (filter === 'font') {
          return { name: displayName, path: itemPath, url: `/api/fs/image?path=${encodeURIComponent(itemPath)}`, created: fallbackTimestamp, modified: fallbackTimestamp, size: 0 };
        }
        if (filter === 'all') {
          return { name: displayName, path: itemPath, created: fallbackTimestamp, modified: fallbackTimestamp, size: 0 };
        }

        return {
          id: itemPath,
          name: displayName,
          path: itemPath,
          relativePath: itemPath,
          url: `/api/fs/image?path=${encodeURIComponent(itemPath)}`,
          thumbnailUrl: buildGalleryThumbnailUrl(itemPath),
          type: videoExts.has(ext) ? 'video' : 'image',
          width: 512,
          height: 512,
          created: fallbackTimestamp,
          modified: fallbackTimestamp,
          size: 0,
          ...(isTrashPath ? {
            trashOriginalPath: trashMeta.originalPath || undefined,
            trashDeletedAt: trashMeta.deletedAt || undefined,
            trashExpiresAt: trashMeta.expiresAt || undefined,
          } : {}),
        };
      }
    },
  );

  files.push(...fileStats);

  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  if (isTrashPath && filter !== 'text' && filter !== 'font') {
    files.sort((a: any, b: any) => {
      const aDeleted = Date.parse(String(a?.trashDeletedAt || ''));
      const bDeleted = Date.parse(String(b?.trashDeletedAt || ''));
      const delta = (Number.isFinite(bDeleted) ? bDeleted : 0) - (Number.isFinite(aDeleted) ? aDeleted : 0);
      if (delta !== 0) return delta;
      return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  } else {
    files.sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  }

  return {
    path: targetPath,
    folders: isTrashRoot ? [] : folders,
    files,
    total: files.length,
    ...(filter === 'text' || filter === 'font' || filter === 'all' ? {} : { counts: mediaTypeCounts }),
  };
}

async function runListProgressive(payload: FsListProgressiveRequest['payload']) {
  const requestStartedAt = Date.now();
  const { fullPath, targetPath, limit, cursor, force } = payload;
  const folders: any[] = [];
  const files: any[] = [];
  const safeCursor = Math.max(0, Math.floor(cursor || 0));
  const safeLimit = Math.max(1, Math.min(256, Math.floor(limit || 1)));
  const seedStartedAt = Date.now();
  const snapshot = await getProgressiveSeedSnapshot(fullPath, force === true);
  const seedMs = Date.now() - seedStartedAt;
  const entries = snapshot.entries;
  const chunk = entries.slice(safeCursor, safeCursor + safeLimit);

  for (const entry of chunk) {
    const itemPath = normalizeRelPath(join(targetPath, entry.name));

    if (entry.kind === 'folder') {
      folders.push({
        name: entry.name,
        path: itemPath,
        relativePath: itemPath,
        modified: 0,
        created: 0,
        hasChildren: true,
      });
      continue;
    }

    files.push({
      id: itemPath,
      name: entry.name,
      path: itemPath,
      relativePath: itemPath,
      url: `/api/fs/image?path=${encodeURIComponent(itemPath)}`,
      thumbnailUrl: buildGalleryThumbnailUrl(itemPath),
      type: entry.mediaType === 'video' ? 'video' : 'image',
      width: 512,
      height: 512,
      created: 0,
      modified: 0,
      size: 0,
    });
  }

  const nextCursor = safeCursor + chunk.length;
  const done = nextCursor >= entries.length;

  return {
    path: targetPath,
    folders,
    files,
    total: snapshot.totalMedia,
    done,
    nextCursor: done ? null : nextCursor,
    debug: {
      cursor: safeCursor,
      limit: safeLimit,
      seedSource: snapshot.seedSource,
      seedMs,
      seedWaitMs: snapshot.seedWaitMs,
      seedBuildMs: snapshot.seedBuildMs,
      totalEntries: entries.length,
      totalMedia: snapshot.totalMedia,
      chunkEntries: chunk.length,
      folderCount: folders.length,
      fileCount: files.length,
      elapsedMs: Date.now() - requestStartedAt,
    },
  };
}

async function buildFolderTree(fullPath: string, targetPath: string, depth: number, maxDepth: number): Promise<any[]> {
  const entries = await getDirectoryTreeSeed(fullPath);
  const folders = await mapWithConcurrency(
    entries,
    12,
    async (entry) => {
      const itemPath = normalizeRelPath(join(targetPath, entry.name));
      const childFullPath = join(fullPath, entry.name);
      const children = depth < maxDepth
        ? await buildFolderTree(childFullPath, itemPath, depth + 1, maxDepth)
        : [];
      const folder: Record<string, unknown> = {
        name: entry.name,
        path: itemPath,
        relativePath: itemPath,
        hasChildren: children.length > 0 || depth >= maxDepth,
      };
      if (children.length > 0) {
        folder.children = children;
      }
      return folder;
    },
  );

  return folders;
}

async function runTree(payload: FsTreeRequest['payload']) {
  const { fullPath, targetPath } = payload;
  const requestedMaxDepth = Number.isFinite(payload.maxDepth) ? Math.floor(payload.maxDepth) : 0;
  const maxDepth = Math.max(0, Math.min(8, requestedMaxDepth));
  const folders = await buildFolderTree(fullPath, targetPath, 0, maxDepth);

  return { folders };
}

async function runFolderSummary(payload: FsFolderSummaryRequest['payload']) {
  const { fullPath, targetPath, force } = payload;
  const entries = await getProgressiveSeed(fullPath, force === true);
  let subfolderCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let gifCount = 0;

  for (const entry of entries) {
    if (entry.kind === 'folder') {
      subfolderCount += 1;
      continue;
    }
    if (entry.mediaType === 'video') {
      videoCount += 1;
      continue;
    }
    if (entry.mediaType === 'gif') {
      gifCount += 1;
      continue;
    }
    imageCount += 1;
  }

  return {
    path: targetPath,
    subfolderCount,
    imageCount,
    videoCount,
    gifCount,
    totalMediaCount: imageCount + videoCount + gifCount,
  };
}

function runInvalidate(payload: FsInvalidateRequest['payload']) {
  for (const pathValue of payload.paths || []) {
    invalidateProgressiveSeedCachePath(pathValue);
  }
  return { success: true };
}

async function runStatFiles(payload: FsStatFilesRequest['payload']) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const files = (await mapWithConcurrency(items, 4, async (item) => {
    const normalizedPath = normalizeRelPath(String(item?.path || ''));
    const fullPath = String(item?.fullPath || '');
    if (!normalizedPath || !fullPath) return null;
    const fileStat = await fs.stat(fullPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) return null;

    const createdMs = Number.isFinite(fileStat.birthtimeMs) && fileStat.birthtimeMs > 0
      ? Math.floor(fileStat.birthtimeMs)
      : (Number.isFinite(fileStat.ctimeMs) && fileStat.ctimeMs > 0
        ? Math.floor(fileStat.ctimeMs)
        : Math.floor(fileStat.mtimeMs || 0));
    const modifiedMs = Number.isFinite(fileStat.mtimeMs) ? Math.floor(fileStat.mtimeMs) : createdMs;

    return {
      path: normalizedPath,
      folderPath: normalizeRelPath(String(item.folderPath || '')),
      name: String(item.name || basename(normalizedPath)).trim() || basename(normalizedPath),
      type: item.type,
      size: Number.isFinite(fileStat.size) ? Number(fileStat.size) : 0,
      createdMs,
      modifiedMs,
    };
  })).filter(Boolean);

  return { files };
}

function normalizePathForCompare(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isTransientMoveError(err: any): boolean {
  const code = String(err?.code || '');
  return code === 'EBUSY'
    || code === 'EPERM'
    || code === 'ETIMEDOUT'
    || code === 'EIO'
    || code === 'ENOTEMPTY'
    || code === 'EMFILE'
    || code === 'ENFILE'
    || code === 'EBADF'
    || code === 'ESTALE'
    || code === 'EAGAIN';
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMoveRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let delayMs = 350;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err: any) {
      if (!isTransientMoveError(err) || attempt >= attempts) {
        throw err;
      }
      console.warn(`[FsWorker] ${label} retry ${attempt}/${attempts} after ${err?.code || 'error'}`);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 2500);
    }
  }
  throw new Error(`[FsWorker] ${label} failed`);
}

function assertSafeRemovalPath(targetPath: string): void {
  const normalized = resolve(targetPath);
  if (!normalized || normalized === '/') {
    throw new Error(`Refusing to remove unsafe path: ${targetPath}`);
  }
  if (process.platform === 'win32' && /^[a-zA-Z]:[\\/]?$/.test(normalized)) {
    throw new Error(`Refusing to remove drive root: ${targetPath}`);
  }
}

async function removePathRecursiveSafe(targetPath: string, force = false): Promise<void> {
  try {
    await withMoveRetry('remove-recursive', () => fs.rm(targetPath, { recursive: true, force }));
    return;
  } catch (error: any) {
    const code = String(error?.code || '');
    if (force && code === 'ENOENT') return;
    if (code !== 'EFAULT') throw error;
  }

  assertSafeRemovalPath(targetPath);

  if (process.platform !== 'win32') {
    const args = force ? ['rm', '-rf', targetPath] : ['rm', '-r', targetPath];
    const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode === 0) return;
    const stderrText = (await new Response(proc.stderr).text()).trim();
    throw new Error(stderrText || `Failed to remove path: ${targetPath}`);
  }

  const args = force
    ? ['powershell', '-NoProfile', '-Command', `Remove-Item -LiteralPath '${targetPath.replace(/'/g, "''")}' -Recurse -Force -ErrorAction Stop`]
    : ['powershell', '-NoProfile', '-Command', `Remove-Item -LiteralPath '${targetPath.replace(/'/g, "''")}' -Recurse -ErrorAction Stop`];
  const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'pipe' });
  const exitCode = await proc.exited;
  if (exitCode === 0) return;
  const stderrText = (await new Response(proc.stderr).text()).trim();
  throw new Error(stderrText || `Failed to remove path: ${targetPath}`);
}

async function copyPathRecursive(sourcePath: string, targetPath: string): Promise<void> {
  const sourceStat = await fs.lstat(sourcePath);

  if (sourceStat.isSymbolicLink()) {
    const linkTarget = await fs.readlink(sourcePath);
    await withMoveRetry('symlink', () => fs.symlink(linkTarget, targetPath));
    return;
  }

  if (sourceStat.isDirectory()) {
    await withMoveRetry('mkdir', () => fs.mkdir(targetPath, { recursive: true }));
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const childSource = join(sourcePath, entry.name);
      const childTarget = join(targetPath, entry.name);
      await copyPathRecursive(childSource, childTarget);
    }
    return;
  }

  await withMoveRetry('copy-file', () => fs.copyFile(sourcePath, targetPath));
}

async function movePathWithFallback(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await withMoveRetry('rename', () => fs.rename(sourcePath, targetPath));
    return;
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err;
  }

  await copyPathRecursive(sourcePath, targetPath);
  await removePathRecursiveSafe(sourcePath, false);
}

async function waitForFileStable(filePath: string): Promise<void> {
  let lastSize = -1;
  let stableCount = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size === lastSize) {
        stableCount += 1;
        if (stableCount >= 2) return;
      } else {
        stableCount = 0;
        lastSize = stats.size;
      }
    } catch {
      stableCount = 0;
      lastSize = -1;
    }
    await sleep(300);
  }
}

async function movePathCloudSafe(
  sourcePath: string,
  targetPath: string,
  onUnitDone?: (movedPath: string) => Promise<void> | void,
): Promise<void> {
  const stats = await fs.lstat(sourcePath);

  if (stats.isSymbolicLink()) {
    const linkTarget = await fs.readlink(sourcePath);
    await withMoveRetry('cloud-symlink', () => fs.symlink(linkTarget, targetPath));
    await removePathRecursiveSafe(sourcePath, false);
    await onUnitDone?.(targetPath);
    return;
  }

  if (stats.isDirectory()) {
    await withMoveRetry('cloud-mkdir', () => fs.mkdir(targetPath, { recursive: true }));
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const childSource = join(sourcePath, entry.name);
      const childTarget = join(targetPath, entry.name);
      await movePathCloudSafe(childSource, childTarget, onUnitDone);
    }
    await removePathRecursiveSafe(sourcePath, false);
    return;
  }

  await withMoveRetry('cloud-copy-file', () => fs.copyFile(sourcePath, targetPath));
  await waitForFileStable(targetPath);
  await removePathRecursiveSafe(sourcePath, false);
  await onUnitDone?.(targetPath);
  await sleep(180);
}

async function countTransferUnits(sourcePath: string): Promise<number> {
  const sourceStat = await fs.lstat(sourcePath);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) return 1;

  let total = 0;
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const childSource = join(sourcePath, entry.name);
    total += await countTransferUnits(childSource);
  }
  return total || 1;
}

function resolveUniqueMoveTargetPath(baseTargetPath: string, sourceIsDirectory: boolean): string {
  if (!existsSync(baseTargetPath)) return baseTargetPath;

  const targetDir = dirname(baseTargetPath);
  const baseName = basename(baseTargetPath);
  const ext = sourceIsDirectory ? '' : extname(baseName);
  const nameWithoutExt = sourceIsDirectory ? baseName : baseName.slice(0, -(ext.length || 0));

  let counter = 1;
  let candidate = baseTargetPath;
  while (existsSync(candidate)) {
    const nextName = ext ? `${nameWithoutExt} (${counter})${ext}` : `${nameWithoutExt} (${counter})`;
    candidate = join(targetDir, nextName);
    counter += 1;
  }
  return candidate;
}

function resolveReservedMoveTargetPath(
  baseTargetPath: string,
  sourceIsDirectory: boolean,
  reservedTargets: Set<string>,
): string {
  const targetDir = dirname(baseTargetPath);
  const baseName = basename(baseTargetPath);
  const ext = sourceIsDirectory ? '' : extname(baseName);
  const nameWithoutExt = sourceIsDirectory ? baseName : baseName.slice(0, -(ext.length || 0));

  let counter = 1;
  let candidate = baseTargetPath;
  while (existsSync(candidate) || reservedTargets.has(normalizePathForCompare(candidate))) {
    const nextName = ext ? `${nameWithoutExt} (${counter})${ext}` : `${nameWithoutExt} (${counter})`;
    candidate = join(targetDir, nextName);
    counter += 1;
  }
  reservedTargets.add(normalizePathForCompare(candidate));
  return candidate;
}

function emitProgress(id: string, progress: unknown) {
  writeResponse({ id, event: 'progress', progress });
}

async function runMove(id: string, payload: FsMoveRequest['payload']) {
  const { items, destinationFullPath, transferMode } = payload;
  await fs.mkdir(destinationFullPath, { recursive: true });

  const pathUnits = new Map<string, number>();
  if (transferMode === 'cloud') {
    for (const item of items) {
      try {
        pathUnits.set(item.sourcePath, await countTransferUnits(item.sourceFullPath));
      } catch {
        pathUnits.set(item.sourcePath, 1);
      }
    }
  } else {
    for (const item of items) pathUnits.set(item.sourcePath, 1);
  }

  const totalUnits = Array.from(pathUnits.values()).reduce((sum, units) => sum + Math.max(units, 1), 0) || Math.max(items.length, 1);
  let completedUnits = 0;
  const reservedMoveTargets = new Set<string>();

  const results = await mapWithConcurrency(items, transferMode === 'cloud' ? 1 : 4, async (item) => {
    const sourceUnits = Math.max(pathUnits.get(item.sourcePath) || 1, 1);
    try {
      const sourceStat = await fs.lstat(item.sourceFullPath);
      const filename = basename(item.sourceFullPath);
      const sourceParentNormalized = normalizePathForCompare(dirname(item.sourceFullPath));
      const destinationNormalized = normalizePathForCompare(destinationFullPath);
      if (destinationNormalized === sourceParentNormalized) {
        completedUnits += sourceUnits;
        emitProgress(id, { deltaUnits: sourceUnits, completedUnits, totalUnits, currentPath: item.sourcePath });
        return { path: item.sourcePath, success: false, error: 'Source and destination are the same folder' };
      }

      const rawTargetPath = item.targetFullPath || join(destinationFullPath, filename);
      const targetPath = item.targetFullPath
        ? rawTargetPath
        : resolveReservedMoveTargetPath(rawTargetPath, sourceStat.isDirectory() && !sourceStat.isSymbolicLink(), reservedMoveTargets);
      await fs.mkdir(dirname(targetPath), { recursive: true });
      const sourceNormalized = normalizePathForCompare(item.sourceFullPath);
      const targetNormalized = normalizePathForCompare(targetPath);
      if (targetNormalized === sourceNormalized || targetNormalized.startsWith(`${sourceNormalized}/`)) {
        completedUnits += sourceUnits;
        emitProgress(id, { deltaUnits: sourceUnits, completedUnits, totalUnits, currentPath: item.sourcePath });
        return { path: item.sourcePath, success: false, error: 'Cannot move a folder into itself' };
      }

      if (transferMode === 'cloud') {
        await movePathCloudSafe(item.sourceFullPath, targetPath, async () => {
          completedUnits = Math.min(totalUnits, completedUnits + 1);
          emitProgress(id, { deltaUnits: 1, completedUnits, totalUnits, currentPath: item.sourcePath });
        });
      } else {
        await movePathWithFallback(item.sourceFullPath, targetPath);
        completedUnits = Math.min(totalUnits, completedUnits + sourceUnits);
        emitProgress(id, { deltaUnits: sourceUnits, completedUnits, totalUnits, currentPath: item.sourcePath });
      }

      return {
        path: item.sourcePath,
        success: true,
        newPath: targetPath,
        isDirectory: sourceStat.isDirectory() && !sourceStat.isSymbolicLink(),
        size: Number(sourceStat.size || 0),
      };
    } catch (error: any) {
      completedUnits = Math.min(totalUnits, completedUnits + sourceUnits);
      emitProgress(id, { deltaUnits: sourceUnits, completedUnits, totalUnits, currentPath: item.sourcePath });
      return { path: item.sourcePath, success: false, error: error?.message || 'Move failed' };
    }
  });

  invalidateProgressiveSeedCachePath(destinationFullPath);
  for (const item of items) {
    invalidateProgressiveSeedCachePath(item.sourceFullPath);
  }

  return {
    results,
    moved: results.filter((entry) => entry.success).length,
    total: items.length,
    totalUnits,
  };
}

async function runCopy(id: string, payload: FsCopyRequest['payload']) {
  const { items, destinationFullPath } = payload;
  await fs.mkdir(destinationFullPath, { recursive: true });
  const totalUnits = Math.max(items.length, 1);
  let completedUnits = 0;

  const results = await mapWithConcurrency(items, 4, async (item) => {
    try {
      const sourceStat = await fs.lstat(item.sourceFullPath);
      const filename = basename(item.sourceFullPath);
      const rawTargetPath = item.targetFullPath || join(destinationFullPath, filename);
      const targetPath = item.targetFullPath
        ? rawTargetPath
        : resolveUniqueMoveTargetPath(rawTargetPath, sourceStat.isDirectory() && !sourceStat.isSymbolicLink());
      await fs.mkdir(dirname(targetPath), { recursive: true });
      await copyPathRecursive(item.sourceFullPath, targetPath);
      completedUnits = Math.min(totalUnits, completedUnits + 1);
      emitProgress(id, {
        deltaUnits: 1,
        completedUnits,
        totalUnits,
        currentPath: item.sourcePath,
      });
      return { path: item.sourcePath, success: true, newPath: targetPath };
    } catch (error: any) {
      completedUnits = Math.min(totalUnits, completedUnits + 1);
      emitProgress(id, {
        deltaUnits: 1,
        completedUnits,
        totalUnits,
        currentPath: item.sourcePath,
      });
      return { path: item.sourcePath, success: false, error: error?.message || 'Copy failed' };
    }
  });

  invalidateProgressiveSeedCachePath(destinationFullPath);
  for (const item of items) {
    invalidateProgressiveSeedCachePath(item.sourceFullPath);
  }

  return {
    results,
    copied: results.filter((entry) => entry.success).length,
    total: items.length,
    totalUnits,
  };
}

async function runMkdir(payload: FsMkdirRequest['payload']) {
  await fs.mkdir(payload.fullPath, { recursive: true });
  invalidateProgressiveSeedCachePath(payload.fullPath);
  return { success: true };
}

async function runRename(payload: FsRenameRequest['payload']) {
  await fs.rename(payload.oldFullPath, payload.newFullPath);
  invalidateProgressiveSeedCachePath(payload.oldFullPath);
  invalidateProgressiveSeedCachePath(payload.newFullPath);
  return { success: true };
}

async function runWrite(payload: FsWriteRequest['payload']) {
  const parentDir = dirname(payload.fullPath);
  if (parentDir && !existsSync(parentDir)) {
    await fs.mkdir(parentDir, { recursive: true });
  }
  if (payload.encoding === 'base64') {
    const binary = Buffer.from(payload.content ?? '', 'base64');
    await Bun.write(payload.fullPath, binary);
  } else {
    await fs.writeFile(payload.fullPath, payload.content ?? '', 'utf-8');
  }
  invalidateProgressiveSeedCachePath(payload.fullPath);
  return { success: true };
}

async function runRead(payload: FsReadRequest['payload']) {
  const buffer = await fs.readFile(payload.fullPath);
  return {
    contentBase64: Buffer.from(buffer).toString('base64'),
  };
}

async function runDelete(payload: FsDeleteRequest['payload']) {
  const results = await mapWithConcurrency(payload.items, 8, async (item) => {
    try {
      if (!existsSync(item.fullPath)) {
        return { path: item.path, success: false, error: 'Path does not exist' };
      }
      await removePathRecursiveSafe(item.fullPath, payload.force !== false);
      return { path: item.path, success: true };
    } catch (error: any) {
      return { path: item.path, success: false, error: error?.message || 'Delete failed' };
    }
  });
  for (const item of payload.items) {
    invalidateProgressiveSeedCachePath(item.fullPath);
  }
  return {
    results,
    deleted: results.filter((entry) => entry.success).length,
    total: payload.items.length,
  };
}

async function runSystemCommand(args: string[], timeoutMs = 30_000): Promise<boolean> {
  if (!args[0]) return false;

  return await new Promise<boolean>((resolveCommand) => {
    let settled = false;
    const proc = spawn(args[0], args.slice(1), {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveCommand(ok);
    };

    const timeout = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Best-effort cleanup; the command is already considered failed.
      }
      settle(false);
    }, timeoutMs);
    timeout.unref();

    proc.once('error', () => settle(false));
    proc.once('exit', (code) => settle(code === 0));
  });
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function runSystemTrash(payload: FsSystemTrashRequest['payload']) {
  const fullPath = payload.fullPath;
  if (!existsSync(fullPath)) {
    throw new Error('Path does not exist');
  }

  if (process.platform === 'win32') {
    const targetLiteral = escapePowerShellSingleQuoted(fullPath);
    const psScript = [
      '$ErrorActionPreference = "Stop";',
      'Add-Type -AssemblyName Microsoft.VisualBasic;',
      '$target = \'' + targetLiteral + '\';',
      '$ui = [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs;',
      '$recycle = [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin;',
      'if (Test-Path -LiteralPath $target -PathType Container) {',
      '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, $ui, $recycle);',
      '} else {',
      '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, $ui, $recycle);',
      '}',
    ].join(' ');

    if (!await runSystemCommand(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', psScript])) {
      throw new Error('Windows Recycle Bin operation failed');
    }
  } else if (process.platform === 'darwin') {
    const escaped = escapeAppleScriptString(fullPath);
    if (!await runSystemCommand([
      'osascript',
      '-e',
      `tell application "Finder" to delete POSIX file "${escaped}"`,
    ])) {
      throw new Error('macOS Trash operation failed');
    }
  } else {
    const fallbackCommands: string[][] = [
      ['gio', 'trash', fullPath],
      ['trash-put', fullPath],
      ['gvfs-trash', fullPath],
      ['kioclient5', 'move', fullPath, 'trash:/'],
      ['kioclient', 'move', fullPath, 'trash:/'],
    ];
    let moved = false;
    for (const args of fallbackCommands) {
      if (await runSystemCommand(args)) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      throw new Error('No supported Linux trash command found (gio/trash-put/gvfs-trash/kioclient)');
    }
  }

  invalidateProgressiveSeedCachePath(fullPath);
  return { success: true };
}

async function handleRequest(request: FsWorkerRequest) {
  switch (request.type) {
    case 'warmup':
      return { ready: true };
    case 'invalidate':
      return runInvalidate(request.payload);
    case 'list':
      return runList(request.payload);
    case 'list-progressive':
      return runListProgressive(request.payload);
    case 'tree':
      return runTree(request.payload);
    case 'folder-summary':
      return runFolderSummary(request.payload);
    case 'stat-files':
      return runStatFiles(request.payload);
    case 'move':
      return runMove(request.id, request.payload);
    case 'copy':
      return runCopy(request.id, request.payload);
    case 'mkdir':
      return runMkdir(request.payload);
    case 'rename':
      return runRename(request.payload);
    case 'write':
      return runWrite(request.payload);
    case 'read':
      return runRead(request.payload);
    case 'delete':
      return runDelete(request.payload);
    case 'system-trash':
      return runSystemTrash(request.payload);
    default: {
      const neverRequest: never = request;
      throw new Error(`Unsupported worker request: ${JSON.stringify(neverRequest)}`);
    }
  }
}

async function main() {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true });
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      try {
        const request = JSON.parse(line) as FsWorkerRequest;
        const result = await handleRequest(request);
        writeResponse({ id: request.id, ok: true, result });
      } catch (error: any) {
        writeResponse({
          id: (() => {
            try {
              return String(JSON.parse(line)?.id || '');
            } catch {
              return '';
            }
          })(),
          ok: false,
          error: String(error?.message || error || 'Unknown worker error'),
          stack: typeof error?.stack === 'string' ? error.stack : undefined,
        });
      }
    }
  }
}

main().catch((error) => {
  console.error('[FsWorker] Fatal error:', error);
  process.exit(1);
});
