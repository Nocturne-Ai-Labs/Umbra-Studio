import { rename, rm, mkdir, stat, writeFile, readFile, readdir, cp } from 'fs/promises';
import { join, basename, dirname, resolve, relative, sep } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { FsWorkerService } from '../FsWorkerService';
// import { db } from '../db';

// Inline helpers
function json(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
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

interface RouteContext {
  ROOT_DIR: string;
  USER_DIR: string;
  PROJECT_ROOT?: string;
  corsHeaders: Record<string, string>;
  thumbnailService?: any;
  fsWorkerService?: FsWorkerService;
  getTrashDir?: () => string;
  resolvePath?: (
    inputPath: string,
    options?: { allowOutsideRoot?: boolean }
  ) => { relativePath: string; fullPath: string } | null;
}

interface TrashMetadata {
  items: Array<{
    id: string;
    originalPath: string;
    trashPath: string;
    name: string;
    type: 'image' | 'video' | 'folder';
    size: number;
    deletedAt: string;
    expiresAt: string;
  }>;
}

function getTrashDir(context: RouteContext) {
  // Use configured Trash location, while API path remains virtual User/Trash.
  if (typeof context.getTrashDir === 'function') {
    return context.getTrashDir();
  }
  return join(context.ROOT_DIR, 'User', 'Trash');
}

function getConfigDir(context: RouteContext) {
  return join(context.ROOT_DIR, 'User', 'Config');
}

function getMetadataPath(context: RouteContext) {
  return join(getConfigDir(context), 'trash-metadata.json');
}

async function ensureTrashDir(trashDir: string, context?: RouteContext) {
  if (existsSync(trashDir)) return;
  if (context?.fsWorkerService) {
    await context.fsWorkerService.mkdir({ fullPath: trashDir });
    return;
  }
  await mkdir(trashDir, { recursive: true });
}

async function ensureConfigDir(context: RouteContext) {
  const configDir = getConfigDir(context);
  if (existsSync(configDir)) return;
  if (context.fsWorkerService) {
    await context.fsWorkerService.mkdir({ fullPath: configDir });
    return;
  }
  await mkdir(configDir, { recursive: true });
}

function sanitizeMetadata(data: any): TrashMetadata {
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const items: TrashMetadata['items'] = rawItems
    .map((item: any) => {
      const id = String(item?.id || '').trim();
      const originalPath = normalizeRelPath(item?.originalPath || '');
      const trashPath = normalizeRelPath(item?.trashPath || '');
      const name = String(item?.name || '').trim();
      const deletedAt = String(item?.deletedAt || '').trim();
      const expiresAt = String(item?.expiresAt || '').trim();
      const size = Number.isFinite(Number(item?.size)) ? Number(item.size) : 0;
      const rawType = String(item?.type || '').toLowerCase();
      const type: 'image' | 'video' | 'folder' =
        rawType === 'video' ? 'video' : rawType === 'folder' ? 'folder' : 'image';

      if (!id || !originalPath || !trashPath || !name || !deletedAt || !expiresAt) return null;
      return { id, originalPath, trashPath, name, type, size, deletedAt, expiresAt };
    })
    .filter((item: TrashMetadata['items'][number] | null): item is TrashMetadata['items'][number] => !!item);

  return { items };
}

async function loadMetadata(context: RouteContext): Promise<TrashMetadata> {
  const metadataFile = getMetadataPath(context);
  try {
    let data: string;
    if (context.fsWorkerService) {
      const result = await context.fsWorkerService.read({ fullPath: metadataFile });
      data = Buffer.from(String((result as any).contentBase64 || ''), 'base64').toString('utf-8');
    } else {
      if (!existsSync(metadataFile)) return { items: [] };
      data = await readFile(metadataFile, 'utf-8');
    }
    return sanitizeMetadata(JSON.parse(data));
  } catch { return { items: [] }; }
}

async function saveMetadata(context: RouteContext, metadata: TrashMetadata) {
  await ensureConfigDir(context);
  const content = JSON.stringify(sanitizeMetadata(metadata), null, 2);
  if (context.fsWorkerService) {
    await context.fsWorkerService.write({
      fullPath: getMetadataPath(context),
      content,
      encoding: 'utf8',
    });
    return;
  }
  await writeFile(getMetadataPath(context), content);
}

async function mergeMetadataItems(
  context: RouteContext,
  options: {
    add?: TrashMetadata['items'];
    removeTrashPaths?: Set<string>;
  },
): Promise<void> {
  const latest = await loadMetadata(context);
  const merged = new Map<string, TrashMetadata['items'][number]>();

  for (const item of latest.items) {
    merged.set(normalizeRelPath(item.trashPath), item);
  }

  if (Array.isArray(options.add) && options.add.length > 0) {
    for (const item of options.add) {
      merged.set(normalizeRelPath(item.trashPath), item);
    }
  }

  if (options.removeTrashPaths && options.removeTrashPaths.size > 0) {
    const removeBases = Array.from(options.removeTrashPaths);
    for (const key of Array.from(merged.keys())) {
      if (removeBases.some((base) => key === base || key.startsWith(`${base}/`))) {
        merged.delete(key);
      }
    }
  }

  await saveMetadata(context, { items: Array.from(merged.values()) });
}

const normalizeRelPath = (p: string): string => String(p || '').replace(/\\/g, '/');
const TRASH_ROOT = 'User/Trash';
const inFlightTrashDeletes = new Set<string>();

function getLocalDateStamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAbsolutePathInput(input: string): boolean {
  return input.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(input);
}

function normalizeFsPathForLock(fullPath: string): string {
  const normalized = resolve(fullPath).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveWorkspacePath(input: string, context: RouteContext): { relativePath: string; fullPath: string } {
  const raw = String(input || '');
  if (!raw) throw new Error('Path is required');
  if (raw.includes('\0')) throw new Error('Invalid path');

  // Prefer UmbraServer's resolver when available so external roots are supported
  // with the same allowlist/security model used by /api/fs routes.
  if (typeof context.resolvePath === 'function') {
    const resolved = context.resolvePath(raw);
    if (!resolved) throw new Error('Invalid path');
    const canonicalRelative = normalizeRelPath(resolved.relativePath || '');
    if (!canonicalRelative || canonicalRelative === '.') {
      throw new Error('Path cannot target workspace root');
    }
    return {
      relativePath: canonicalRelative,
      fullPath: resolve(resolved.fullPath),
    };
  }

  if (isAbsolutePathInput(raw)) throw new Error('Absolute paths are not allowed');

  const normalized = normalizeRelPath(raw).replace(/^\/+/, '');
  const root = resolve(context.ROOT_DIR);
  const fullPath = resolve(root, normalized);
  if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
    throw new Error('Path escapes workspace');
  }
  const canonicalRelative = normalizeRelPath(relative(root, fullPath));
  if (!canonicalRelative || canonicalRelative === '.') {
    throw new Error('Path cannot target workspace root');
  }

  return {
    relativePath: canonicalRelative,
    fullPath,
  };
}

function isTrashPath(path: string): boolean {
  const normalized = normalizeRelPath(path);
  return normalized === TRASH_ROOT || normalized.startsWith(`${TRASH_ROOT}/`);
}

function getTopLevelTrashEntry(path: string): string {
  const normalized = normalizeRelPath(path);
  const prefix = `${TRASH_ROOT}/`;
  if (!normalized.startsWith(prefix)) return '';
  const relativePart = normalized.slice(prefix.length);
  if (!relativePart) return '';
  return relativePart.split('/').filter(Boolean)[0] || '';
}

function inferOriginalPath(
  trashPath: string,
  explicitOriginalPath: string | undefined,
  metadata: TrashMetadata,
): string | null {
  const target = normalizeRelPath(trashPath);
  const explicit = explicitOriginalPath ? normalizeRelPath(explicitOriginalPath) : '';
  if (!target) return explicit || null;

  const direct = metadata.items.find((item) => normalizeRelPath(item.trashPath) === target);
  if (direct) return direct.originalPath;

  let best: TrashMetadata['items'][number] | null = null;
  for (const item of metadata.items) {
    const base = normalizeRelPath(item.trashPath);
    if (target.startsWith(`${base}/`) || target === base) {
      if (!best || base.length > normalizeRelPath(best.trashPath).length) {
        best = item;
      }
    }
  }

  if (best) {
    const base = normalizeRelPath(best.trashPath);
    const suffix = target.slice(base.length).replace(/^\/+/, '');
    if (!suffix) return best.originalPath;
    return `${normalizeRelPath(best.originalPath).replace(/\/+$/, '')}/${suffix}`;
  }

  return explicit || null;
}

function buildFallbackRestorePath(trashRelativePath: string): string {
  const fallbackName = basename(normalizeRelPath(trashRelativePath)) || `restored-${Date.now()}`;
  return normalizeRelPath(join('User', 'Recovered', getLocalDateStamp(new Date()), fallbackName));
}

async function findAvailableRestorePath(fullOriginalPath: string, reservedPaths?: Set<string>): Promise<string> {
  const parent = dirname(fullOriginalPath);
  const filename = basename(fullOriginalPath);
  const dot = filename.lastIndexOf('.');
  const hasExt = dot > 0;
  const stem = hasExt ? filename.slice(0, dot) : filename;
  const ext = hasExt ? filename.slice(dot) : '';

  let i = 1;
  let candidate = fullOriginalPath;
  while (existsSync(candidate) || reservedPaths?.has(normalizeFsPathForLock(candidate))) {
    candidate = join(parent, `${stem} (restored ${i})${ext}`);
    i += 1;
  }
  reservedPaths?.add(normalizeFsPathForLock(candidate));
  return candidate;
}

function findAvailableTrashFilename(trashDir: string, originalName: string, isDirectory: boolean): string {
  const normalizedName = String(originalName || '').trim();
  const safeName = normalizedName || 'untitled';
  const baseExt = isDirectory ? '' : (safeName.lastIndexOf('.') > 0 ? safeName.slice(safeName.lastIndexOf('.')) : '');
  const baseStem = isDirectory ? safeName : (baseExt ? safeName.slice(0, -baseExt.length) : safeName);

  let candidate = safeName;
  let i = 1;
  while (existsSync(join(trashDir, candidate))) {
    candidate = `${baseStem} (deleted ${i})${baseExt}`;
    i += 1;
  }
  return candidate;
}

async function ensureDailyTrashFolder(trashDir: string, dateStamp: string, context?: RouteContext): Promise<string> {
  const cleanDateStamp = /^\d{4}-\d{2}-\d{2}$/.test(dateStamp) ? dateStamp : getLocalDateStamp(new Date());
  const preferred = join(trashDir, cleanDateStamp);

  if (!existsSync(preferred)) {
    if (context?.fsWorkerService) {
      await context.fsWorkerService.mkdir({ fullPath: preferred });
    } else {
      await mkdir(preferred, { recursive: true });
    }
    return cleanDateStamp;
  }

  try {
    const existingStats = await stat(preferred);
    if (existingStats.isDirectory()) return cleanDateStamp;
  } catch {
    // Fall through to conflict-safe folder naming below.
  }

  const fallbackName = findAvailableTrashFilename(trashDir, cleanDateStamp, true);
  if (context?.fsWorkerService) {
    await context.fsWorkerService.mkdir({ fullPath: join(trashDir, fallbackName) });
  } else {
    await mkdir(join(trashDir, fallbackName), { recursive: true });
  }
  return fallbackName;
}

async function movePathSafely(sourcePath: string, targetPath: string, isDirectory: boolean): Promise<void> {
  try {
    await rename(sourcePath, targetPath);
    return;
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code !== 'EXDEV') throw err;
  }

  try {
    await cp(sourcePath, targetPath, {
      recursive: isDirectory,
      force: false,
      errorOnExist: true,
    });
    await rm(sourcePath, { recursive: true, force: true });
  } catch (err) {
    try {
      await rm(targetPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure for partial copies
    }
    throw err;
  }
}

// Cleanup expired items and orphaned files
async function cleanupTrash(context: RouteContext) {
  try {
    const trashDir = getTrashDir(context);
    const metadata = await loadMetadata(context);
    const now = new Date();
    let changed = false;

    // Step 1: Remove expired items from metadata
    const activeItems = [];
    for (const item of metadata.items) {
      if (item.expiresAt && new Date(item.expiresAt) < now) {
        try {
          const { relativePath, fullPath } = resolveWorkspacePath(item.trashPath, context);
          if (isTrashPath(relativePath) && existsSync(fullPath)) {
            try {
              await sendPathToSystemTrash(fullPath);
              console.log(`[Trash] Auto-expired to OS Trash: ${item.name}`);
            } catch (trashErr) {
              console.warn('[Trash] OS trash failed during expiry cleanup, falling back to direct delete:', trashErr);
              if (context.fsWorkerService) {
                await context.fsWorkerService.delete({
                  items: [{ path: normalizeRelPath(item.trashPath), fullPath }],
                  force: true,
                });
              } else {
                await rm(fullPath, { recursive: true, force: true });
              }
              console.log(`[Trash] Auto-expired via fallback delete: ${item.name}`);
            }
          }
        } catch {
          // Invalid metadata path: treat as stale and remove metadata entry.
        }
        changed = true;
      } else {
        activeItems.push(item);
      }
    }

    // Step 2: Clean up orphaned files (in directory but not in metadata)
    if (existsSync(trashDir)) {
      const trackedPaths = new Set(
        activeItems
          .map((item) => getTopLevelTrashEntry(item.trashPath))
          .filter(Boolean)
      );
      const entries = readdirSync(trashDir);

      for (const entry of entries) {
        // If this file/folder isn't tracked in metadata, it's orphaned
        if (!trackedPaths.has(entry)) {
          const fullPath = join(trashDir, entry);
          try {
            if (context.fsWorkerService) {
              await context.fsWorkerService.delete({
                items: [{ path: normalizeRelPath(join(TRASH_ROOT, entry)), fullPath }],
                force: true,
              });
            } else {
              await rm(fullPath, { recursive: true, force: true });
            }
            console.log(`[Trash] Cleaned up orphaned: ${entry}`);
            changed = true;
          } catch (err) {
            console.error(`[Trash] Failed to clean up orphaned ${entry}:`, err);
          }
        }
      }
    }

    if (changed) {
      metadata.items = activeItems;
      await saveMetadata(context, metadata);
    }
    return { items: activeItems };
  } catch (e) {
    console.error('[Trash] Cleanup failed:', e);
    return { items: [] };
  }
}

export async function runTrashCleanup(context: RouteContext) {
  return cleanupTrash(context);
}

export async function listTrash(_req: Request, _url: URL, context: RouteContext) {
  try {
    // Auto-cleanup before listing
    await cleanupTrash(context);

    const metadata = await loadMetadata(context);
    return json(metadata, 200, context.corsHeaders);
  } catch (error: any) {
    console.error('[Trash] List error:', error);
    return json({ error: error.message }, 500, context.corsHeaders);
  }
}

export async function updateTrashRetention(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }

  const rawDays = Number(body?.days ?? body?.autoDeleteDays ?? body?.trashAutoDeleteDays);
  if (!Number.isFinite(rawDays) || rawDays <= 0) {
    return json({ error: 'days must be a positive number' }, 400, context.corsHeaders);
  }
  const days = Math.min(Math.floor(rawDays), 3650);
  const msPerDay = 24 * 60 * 60 * 1000;

  try {
    const metadata = await loadMetadata(context);
    const nowMs = Date.now();
    let updated = 0;

    for (const item of metadata.items) {
      const deletedAtMs = Number(new Date(item.deletedAt).getTime());
      const baseMs = Number.isFinite(deletedAtMs) && deletedAtMs > 0 ? deletedAtMs : nowMs;
      item.expiresAt = new Date(baseMs + (days * msPerDay)).toISOString();
      updated += 1;
    }

    await saveMetadata(context, metadata);
    const cleaned = await cleanupTrash(context);
    return json(
      {
        success: true,
        days,
        updated,
        remaining: Array.isArray(cleaned.items) ? cleaned.items.length : metadata.items.length,
      },
      200,
      context.corsHeaders,
    );
  } catch (error: any) {
    console.error('[Trash] Retention update error:', error);
    return json({ error: error?.message || 'Failed to update trash retention' }, 500, context.corsHeaders);
  }
}

export async function deleteToTrash(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }

  const rawInputPaths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown): p is string => typeof p === 'string') : [];
  const inputPaths = Array.from(new Set(rawInputPaths.map((path) => String(path || '').trim()).filter(Boolean)));
  const rawAutoDeleteDays = Number(body?.autoDeleteDays);
  const autoDeleteDays = Number.isFinite(rawAutoDeleteDays) && rawAutoDeleteDays > 0
    ? Math.min(Math.floor(rawAutoDeleteDays), 3650)
    : 30;

  try {
    if (inputPaths.length === 0) {
      return json({ success: true, count: 0, items: [] }, 200, context.corsHeaders);
    }

    const trashDir = getTrashDir(context);
    await ensureTrashDir(trashDir, context);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (autoDeleteDays || 30) * 24 * 60 * 60 * 1000);
    const dateFolderName = await ensureDailyTrashFolder(trashDir, getLocalDateStamp(now), context);
    const dateFolderDir = join(trashDir, dateFolderName);
    const dateFolderRelativePath = normalizeRelPath(join(TRASH_ROOT, dateFolderName));

    const validItems: any[] = [];
    const failedItems: Array<{ path: string; error: string }> = [];
    const cacheClearPaths: string[] = [];
    const moveCandidates: Array<{
      inputPath: string;
      originalPath: string;
      relativePath: string;
      lockKey: string;
      filename: string;
    }> = [];
    for (const inputPath of inputPaths) {
      try {
        let resolvedOriginal: { relativePath: string; fullPath: string };
        try {
          resolvedOriginal = resolveWorkspacePath(inputPath, context);
        } catch {
          failedItems.push({ path: inputPath, error: 'Invalid path' });
          continue;
        }

        if (isTrashPath(resolvedOriginal.relativePath)) {
          failedItems.push({ path: inputPath, error: 'Path is already in Trash' });
          continue;
        }

        const originalPath = resolvedOriginal.fullPath;
        if (!existsSync(originalPath)) {
          failedItems.push({ path: inputPath, error: 'Path does not exist' });
          continue;
        }

        const deleteLockKey = normalizeFsPathForLock(originalPath);
        if (inFlightTrashDeletes.has(deleteLockKey)) {
          failedItems.push({ path: inputPath, error: 'Path is already being deleted' });
          continue;
        }

        inFlightTrashDeletes.add(deleteLockKey);
        moveCandidates.push({
          inputPath,
          originalPath,
          relativePath: normalizeRelPath(resolvedOriginal.relativePath),
          lockKey: deleteLockKey,
          filename: basename(originalPath),
        });
      } catch (err) {
        console.warn('[Trash] Skipping failed delete path:', inputPath, err);
        failedItems.push({
          path: inputPath,
          error: err instanceof Error ? err.message : 'Unknown trash delete error',
        });
      }
    }

    try {
      if (moveCandidates.length > 0 && context.fsWorkerService) {
        const execution = await context.fsWorkerService.move({
          items: moveCandidates.map((candidate) => ({
            sourcePath: candidate.relativePath,
            sourceFullPath: candidate.originalPath,
          })),
          destination: dateFolderRelativePath,
          destinationFullPath: dateFolderDir,
          transferMode: 'default',
        });
        const resultByPath = new Map<string, any>(
          (((execution as any).results || []) as any[]).map((entry) => [String(entry.path || ''), entry]),
        );

        for (const candidate of moveCandidates) {
          const entry = resultByPath.get(candidate.relativePath);
          if (!entry?.success) {
            failedItems.push({ path: candidate.inputPath, error: entry?.error || 'Failed to move to Trash' });
            continue;
          }
          cacheClearPaths.push(candidate.originalPath);
          const trashFilename = basename(String(entry.newPath || candidate.filename));
          let itemType: 'folder' | 'video' | 'image' = 'image';
          if (entry.isDirectory) {
            itemType = 'folder';
          } else if (candidate.filename.match(/\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i)) {
            itemType = 'video';
          }
          validItems.push({
            id: `trash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            originalPath: candidate.relativePath,
            trashPath: normalizeRelPath(join(dateFolderRelativePath, trashFilename)),
            name: candidate.filename,
            type: itemType,
            size: Number(entry.size || 0),
            deletedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          });
        }
      } else {
        for (const candidate of moveCandidates) {
          try {
            const originalStats = await stat(candidate.originalPath);
            let moved = false;
            let trashFilename = '';
            let trashPath = '';
            let moveError = '';
            for (let attempt = 0; attempt < 8; attempt++) {
              trashFilename = findAvailableTrashFilename(dateFolderDir, candidate.filename, originalStats.isDirectory());
              trashPath = join(dateFolderDir, trashFilename);
              try {
                await movePathSafely(candidate.originalPath, trashPath, originalStats.isDirectory());
                moved = true;
                break;
              } catch (err: any) {
                if (!existsSync(candidate.originalPath)) break;
                const code = String(err?.code || '');
                if (code === 'EEXIST' || code === 'ENOTEMPTY') continue;
                moveError = err?.message || 'Failed to move to Trash';
                break;
              }
            }
            if (!moved) {
              failedItems.push({ path: candidate.inputPath, error: moveError || 'Failed to move to Trash' });
              continue;
            }
            cacheClearPaths.push(candidate.originalPath);
            const stats = await stat(trashPath).catch(() => originalStats);
            let itemType: 'folder' | 'video' | 'image' = 'image';
            if (stats.isDirectory()) itemType = 'folder';
            else if (candidate.filename.match(/\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i)) itemType = 'video';
            validItems.push({
              id: `trash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              originalPath: candidate.relativePath,
              trashPath: normalizeRelPath(join(dateFolderRelativePath, trashFilename)),
              name: candidate.filename,
              type: itemType,
              size: stats.size,
              deletedAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
            });
          } catch (err: any) {
            failedItems.push({ path: candidate.inputPath, error: err?.message || 'Failed to move to Trash' });
          }
        }
      }
    } finally {
      for (const candidate of moveCandidates) {
        inFlightTrashDeletes.delete(candidate.lockKey);
      }
    }

    if (validItems.length === 0) {
      try {
        const remainingEntries = await readdir(dateFolderDir);
        if (remainingEntries.length === 0) {
          if (context.fsWorkerService) {
            await context.fsWorkerService.delete({
              items: [{ path: normalizeRelPath(dateFolderRelativePath), fullPath: dateFolderDir }],
              force: true,
            });
          } else {
            await rm(dateFolderDir, { recursive: true, force: true });
          }
        }
      } catch {
        // ignore cleanup issues for empty date folder
      }
    }

    let metadataWarning: string | null = null;
    if (cacheClearPaths.length > 0 && context.thumbnailService) {
      void context.thumbnailService.clearCacheForPaths(cacheClearPaths).catch((error) => {
        console.warn('[Trash] Thumbnail cache clear warning after delete:', error);
      });
    }
    if (validItems.length > 0) {
      try {
        await mergeMetadataItems(context, { add: validItems });
      } catch (err: any) {
        metadataWarning = err?.message || 'Trash metadata could not be saved';
        console.warn('[Trash] Metadata save warning after delete:', metadataWarning);
      }
    }

    return json(
      {
        success: failedItems.length === 0,
        count: validItems.length,
        items: validItems.map((item) => ({
          trashPath: item.trashPath,
          originalPath: item.originalPath,
          name: item.name,
        })),
        failed: failedItems,
        warning: metadataWarning || undefined,
      },
      200,
      context.corsHeaders,
    );
  } catch (error: any) {
    console.error('[Trash] Delete error:', error);
    return json({ error: error.message }, 500, context.corsHeaders);
  }
}

export async function restoreFromTrash(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }
  const items = (() => {
    if (!Array.isArray(body?.items)) return [];
    const deduped = new Map<string, { trashPath: string; originalPath?: string }>();
    for (const item of body.items) {
      const rawTrashPath = typeof item?.trashPath === 'string' ? item.trashPath.trim() : '';
      if (!rawTrashPath) continue;
      const normalizedTrashPath = normalizeRelPath(rawTrashPath);
      if (deduped.has(normalizedTrashPath)) continue;
      deduped.set(normalizedTrashPath, {
        trashPath: normalizedTrashPath,
        originalPath: typeof item?.originalPath === 'string' && item.originalPath.trim()
          ? item.originalPath.trim()
          : undefined,
      });
    }
    return Array.from(deduped.values());
  })();

  try {
    if (items.length === 0) {
      return json({ error: 'Items array required' }, 400, context.corsHeaders);
    }

    const metadata = await loadMetadata(context);
    const removedTrashPaths = new Set<string>();
    const reservedRestorePaths = new Set<string>();

    const restored: Array<{
      trashPath: string;
      originalPath: string;
      restoredPath: string;
      type: 'file' | 'folder';
      fallback?: boolean;
    }> = [];
    const failed: Array<{ trashPath: string; error: string }> = [];
    const restoreCandidates: Array<{
      trashPath: string;
      originalPath: string;
      resolvedTrashPath: { relativePath: string; fullPath: string };
      resolvedOriginal: { relativePath: string; fullPath: string };
      fullRestorePath: string;
      restoredIsDirectory: boolean;
      usedFallbackPath: boolean;
    }> = [];

    for (const { trashPath, originalPath } of items) {
      try {
        let resolvedTrashPath: { relativePath: string; fullPath: string };
        try {
          resolvedTrashPath = resolveWorkspacePath(trashPath, context);
        } catch {
          failed.push({ trashPath, error: 'Invalid trash path' });
          continue;
        }

        if (!isTrashPath(resolvedTrashPath.relativePath)) {
          failed.push({ trashPath, error: 'Path is not in Trash' });
          continue;
        }
        if (!existsSync(resolvedTrashPath.fullPath)) {
          failed.push({ trashPath, error: 'Trash item does not exist' });
          continue;
        }

        const inferredOriginalPath = inferOriginalPath(resolvedTrashPath.relativePath, originalPath, metadata);
        const fallbackOriginalPath = buildFallbackRestorePath(resolvedTrashPath.relativePath);

        let resolvedOriginal: { relativePath: string; fullPath: string } | null = null;
        let usedFallbackPath = false;
        const candidateOriginalPaths = [inferredOriginalPath, fallbackOriginalPath];
        for (let idx = 0; idx < candidateOriginalPaths.length; idx += 1) {
          const candidatePath = candidateOriginalPaths[idx];
          if (!candidatePath) continue;
          try {
            const resolvedCandidate = resolveWorkspacePath(candidatePath, context);
            if (isTrashPath(resolvedCandidate.relativePath)) continue;
            resolvedOriginal = resolvedCandidate;
            usedFallbackPath = idx > 0;
            break;
          } catch {
            // Try next candidate
          }
        }
        if (!resolvedOriginal) {
          failed.push({ trashPath, error: 'Invalid restore target path' });
          continue;
        }

        const restoredStats = await stat(resolvedTrashPath.fullPath);
        const restoredIsDirectory = restoredStats.isDirectory();
        const fullRestorePath = await findAvailableRestorePath(resolvedOriginal.fullPath, reservedRestorePaths);
        restoreCandidates.push({
          trashPath,
          originalPath: originalPath || '',
          resolvedTrashPath,
          resolvedOriginal,
          fullRestorePath,
          restoredIsDirectory,
          usedFallbackPath,
        });
      } catch (err: any) {
        failed.push({ trashPath, error: err?.message || 'Restore failed' });
      }
    }

    const cacheClearPaths: string[] = [];
    if (restoreCandidates.length > 0 && context.fsWorkerService) {
      const parentDirs = Array.from(new Set(restoreCandidates.map((candidate) => dirname(candidate.fullRestorePath))));
      await mapWithConcurrency(parentDirs, 8, async (fullPath) => {
        await context.fsWorkerService!.mkdir({ fullPath });
      });
      const execution = await context.fsWorkerService.move({
        items: restoreCandidates.map((candidate) => ({
          sourcePath: normalizeRelPath(candidate.resolvedTrashPath.relativePath),
          sourceFullPath: candidate.resolvedTrashPath.fullPath,
          targetFullPath: candidate.fullRestorePath,
        })),
        destination: '',
        destinationFullPath: context.ROOT_DIR,
        transferMode: 'default',
      });
      const resultByPath = new Map<string, any>(
        (((execution as any).results || []) as any[]).map((entry) => [normalizeRelPath(String(entry.path || '')), entry]),
      );
      for (const candidate of restoreCandidates) {
        const trashRelativePath = normalizeRelPath(candidate.resolvedTrashPath.relativePath);
        const result = resultByPath.get(trashRelativePath);
        if (!result?.success) {
          failed.push({ trashPath: candidate.trashPath, error: result?.error || 'Restore failed' });
          continue;
        }
        cacheClearPaths.push(candidate.resolvedTrashPath.fullPath);
        removedTrashPaths.add(trashRelativePath);
        const restoredPath = normalizeRelPath(resolveWorkspacePath(candidate.fullRestorePath, context).relativePath);
        restored.push({
          trashPath: trashRelativePath,
          originalPath: normalizeRelPath(candidate.resolvedOriginal.relativePath),
          restoredPath,
          type: candidate.restoredIsDirectory ? 'folder' : 'file',
          fallback: candidate.usedFallbackPath,
        });
      }
    } else if (restoreCandidates.length > 0) {
      await mapWithConcurrency(restoreCandidates, 4, async (candidate) => {
        try {
          await mkdir(dirname(candidate.fullRestorePath), { recursive: true });
          await movePathSafely(candidate.resolvedTrashPath.fullPath, candidate.fullRestorePath, candidate.restoredIsDirectory);
          cacheClearPaths.push(candidate.resolvedTrashPath.fullPath);
          const trashRelativePath = normalizeRelPath(candidate.resolvedTrashPath.relativePath);
          removedTrashPaths.add(trashRelativePath);
          const restoredPath = normalizeRelPath(resolveWorkspacePath(candidate.fullRestorePath, context).relativePath);
          restored.push({
            trashPath: trashRelativePath,
            originalPath: normalizeRelPath(candidate.resolvedOriginal.relativePath),
            restoredPath,
            type: candidate.restoredIsDirectory ? 'folder' : 'file',
            fallback: candidate.usedFallbackPath,
          });
        } catch (err: any) {
          failed.push({ trashPath: candidate.trashPath, error: err?.message || 'Restore failed' });
        }
      });
    }

    if (cacheClearPaths.length > 0 && context.thumbnailService) {
      void context.thumbnailService.clearCacheForPaths(cacheClearPaths).catch((error) => {
        console.warn('[Trash] Thumbnail cache clear warning after restore:', error);
      });
    }

    let metadataWarning: string | null = null;
    if (removedTrashPaths.size > 0) {
      try {
        await mergeMetadataItems(context, { removeTrashPaths: removedTrashPaths });
      } catch (err: any) {
        metadataWarning = err?.message || 'Trash metadata could not be saved';
        console.warn('[Trash] Metadata save warning after restore:', metadataWarning);
      }
    }
    return json(
      {
        success: failed.length === 0,
        restored,
        failed,
        warning: metadataWarning || undefined,
      },
      200,
      context.corsHeaders,
    );
  } catch (error: any) {
    console.error('[Trash] Restore error:', error);
    return json({ error: error.message }, 500, context.corsHeaders);
  }
}

export async function emptyTrash(_req: Request, _url: URL, context: RouteContext) {
  try {
    const trashDir = getTrashDir(context);

    // Delete ALL files and folders in the Trash directory (not just tracked items)
    // This handles orphaned files that may not be in metadata
    if (existsSync(trashDir)) {
      const entries = await readdir(trashDir, { withFileTypes: true });
      const fullEntries = entries.map((entry) => ({
        path: normalizeRelPath(join(TRASH_ROOT, entry.name)),
        fullPath: join(trashDir, entry.name),
      }));

      if (context.fsWorkerService) {
        const execution = await context.fsWorkerService.delete({ items: fullEntries, force: true });
        for (const entry of (((execution as any).results || []) as any[])) {
          if (entry?.success) {
            const matched = fullEntries.find((item) => item.path === entry.path);
            if (matched && context.thumbnailService) await context.thumbnailService.clearCache(matched.fullPath);
          }
        }
      } else {
        await mapWithConcurrency(entries, 8, async (entry) => {
            const fullPath = join(trashDir, entry.name);
            try {
              await rm(fullPath, { recursive: true, force: true });
              if (context.thumbnailService) await context.thumbnailService.clearCache(fullPath);
              console.log(`[Trash] Deleted: ${fullPath}`);
            } catch (err) {
              console.error(`[Trash] Failed to delete ${fullPath}:`, err);
            }
          });
      }
    }

    // Clear the metadata
    await saveMetadata(context, { items: [] });
    return json({ success: true }, 200, context.corsHeaders);
  } catch (error: any) {
    console.error('[Trash] Empty error:', error);
    return json({ error: error.message }, 500, context.corsHeaders);
  }
}

export async function permanentlyDelete(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }
  const paths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown): p is string => typeof p === 'string') : [];

  try {
    if (paths.length === 0) {
      return json({ error: 'Paths array required' }, 400, context.corsHeaders);
    }

    const resolvedPaths = paths.map((trashPath) => resolveWorkspacePath(trashPath, context));
    if (resolvedPaths.some((p) => !isTrashPath(p.relativePath))) {
      return json({ error: 'Only User/Trash paths are allowed' }, 400, context.corsHeaders);
    }

    const pathSet = new Set(resolvedPaths.map((p) => normalizeRelPath(p.relativePath)));

    if (context.fsWorkerService) {
      const execution = await context.fsWorkerService.delete({
        items: resolvedPaths.map(({ relativePath, fullPath }) => ({ path: normalizeRelPath(relativePath), fullPath })),
        force: true,
      });
      for (const entry of (((execution as any).results || []) as any[])) {
        if (entry?.success) {
          const matched = resolvedPaths.find((item) => normalizeRelPath(item.relativePath) === entry.path);
          if (matched && context.thumbnailService) await context.thumbnailService.clearCache(matched.fullPath);
        }
      }
    } else {
      await mapWithConcurrency(resolvedPaths, 8, async ({ fullPath }) => {
          if (existsSync(fullPath)) {
            await rm(fullPath, { recursive: true, force: true });
            if (context.thumbnailService) await context.thumbnailService.clearCache(fullPath);
          }
        });
    }

    let metadataWarning: string | null = null;
    try {
      await mergeMetadataItems(context, { removeTrashPaths: pathSet });
    } catch (err: any) {
      metadataWarning = err?.message || 'Trash metadata could not be saved';
      console.warn('[Trash] Metadata save warning after permanent delete:', metadataWarning);
    }
    return json(
      {
        success: true,
        deleted: resolvedPaths.length,
        warning: metadataWarning || undefined,
      },
      200,
      context.corsHeaders,
    );
  } catch (error: any) {
    console.error('[Trash] Permanent delete error:', error);
    const message = error instanceof Error ? error.message : 'Permanent delete failed';
    const status = String(message).toLowerCase().includes('path') ? 400 : 500;
    return json({ error: message }, status, context.corsHeaders);
  }
}

async function runDetachedCommand(args: string[]): Promise<boolean> {
  try {
    const proc = Bun.spawn(args, { stdout: 'ignore', stderr: 'ignore' });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function sendPathToSystemTrash(fullPath: string): Promise<void> {
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

    const ok = await runDetachedCommand(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', psScript]);
    if (!ok) throw new Error('Windows Recycle Bin operation failed');
    return;
  }

  if (process.platform === 'darwin') {
    const escaped = escapeAppleScriptString(fullPath);
    const ok = await runDetachedCommand([
      'osascript',
      '-e',
      `tell application "Finder" to delete POSIX file "${escaped}"`,
    ]);
    if (!ok) throw new Error('macOS Trash operation failed');
    return;
  }

  const linuxFallbackCommands: string[][] = [
    ['gio', 'trash', fullPath],
    ['trash-put', fullPath],
    ['gvfs-trash', fullPath],
    ['kioclient5', 'move', fullPath, 'trash:/'],
    ['kioclient', 'move', fullPath, 'trash:/'],
  ];

  for (const args of linuxFallbackCommands) {
    if (await runDetachedCommand(args)) return;
  }

  throw new Error('No supported Linux trash command found (gio/trash-put/gvfs-trash/kioclient)');
}

export async function permanentlyDeleteDirect(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }
  const paths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown): p is string => typeof p === 'string') : [];

  if (paths.length === 0) {
    return json({ error: 'Paths array required' }, 400, context.corsHeaders);
  }

  try {
    const removedTrashBases: string[] = [];
    const resolvedItems = paths.map((inputPath) => {
      let resolved: { relativePath: string; fullPath: string };
      try {
        resolved = resolveWorkspacePath(inputPath, context);
      } catch (err: any) {
        return { inputPath, error: err?.message || 'Invalid path' } as any;
      }
      return { inputPath, resolved };
    });
    const invalidResults = resolvedItems
      .filter((item: any) => item.error)
      .map((item: any) => ({ path: item.inputPath, success: false, error: item.error }));
    const validResolved = resolvedItems.filter((item: any) => item.resolved).map((item: any) => item.resolved as { relativePath: string; fullPath: string });
    let results: any[] = invalidResults;
    if (context.fsWorkerService && validResolved.length > 0) {
      const execution = await context.fsWorkerService.delete({
        items: validResolved.map(({ relativePath, fullPath }) => ({ path: normalizeRelPath(relativePath), fullPath })),
        force: true,
      });
      results = results.concat((((execution as any).results || []) as any[]));
      for (const entry of (((execution as any).results || []) as any[])) {
        if (entry?.success) {
          const matched = validResolved.find((item) => normalizeRelPath(item.relativePath) === entry.path);
          if (matched) {
            if (context.thumbnailService) await context.thumbnailService.clearCache(matched.fullPath);
            if (isTrashPath(normalizeRelPath(matched.relativePath))) {
              removedTrashBases.push(normalizeRelPath(matched.relativePath));
            }
          }
        }
      }
    } else if (validResolved.length > 0) {
      const fallbackResults = await mapWithConcurrency(validResolved, 8, async (resolved) => {
        const normalizedPath = normalizeRelPath(resolved.relativePath);
        if (!existsSync(resolved.fullPath)) {
          return { path: normalizedPath, success: false, error: 'Path does not exist' };
        }
        try {
          await rm(resolved.fullPath, { recursive: true, force: true });
          if (context.thumbnailService) await context.thumbnailService.clearCache(resolved.fullPath);
          if (isTrashPath(normalizedPath)) removedTrashBases.push(normalizedPath);
          return { path: normalizedPath, success: true };
        } catch (err: any) {
          return { path: normalizedPath, success: false, error: err?.message || 'Permanent delete failed' };
        }
      });
      results = results.concat(fallbackResults);
    }

    let metadataWarning: string | null = null;
    if (removedTrashBases.length > 0) {
      try {
        await mergeMetadataItems(context, { removeTrashPaths: new Set(removedTrashBases) });
      } catch (err: any) {
        metadataWarning = err?.message || 'Trash metadata could not be saved';
        console.warn('[Trash] Metadata save warning after direct delete:', metadataWarning);
      }
    }

    return json(
      {
        success: results.some((entry) => entry.success),
        deleted: results.filter((entry) => entry.success).length,
        results,
        warning: metadataWarning || undefined,
      },
      200,
      context.corsHeaders,
    );
  } catch (error: any) {
    console.error('[Trash] Permanent direct delete error:', error);
    return json({ error: error?.message || 'Permanent delete failed' }, 500, context.corsHeaders);
  }
}

export async function deleteToSystemTrash(req: Request, _url: URL, context: RouteContext) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, context.corsHeaders);
  }
  const paths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown) => typeof p === 'string') : [];

  if (paths.length === 0) {
    return json({ error: 'Paths array required' }, 400, context.corsHeaders);
  }

  try {
    const results = await mapWithConcurrency(paths, 3, async (p) => {
      let resolved: { relativePath: string; fullPath: string };
      try {
        resolved = resolveWorkspacePath(p, context);
      } catch (err: any) {
        return { path: p, success: false, error: err?.message || 'Invalid path' };
      }

      const fullPath = resolved.fullPath;

      if (!existsSync(fullPath)) return { path: p, success: false, error: 'File not found' };

      try {
        await sendPathToSystemTrash(fullPath);

        if (context.thumbnailService) await context.thumbnailService.clearCache(fullPath);
        // try { db.exec(`DELETE FROM images WHERE path = '${fullPath.replace(/'/g, "''")}'`); } catch { }

        return { path: p, success: true };
      } catch (err: any) {
        console.error(`Failed to trash ${fullPath}:`, err);
        return { path: p, success: false, error: err.message };
      }
    });

    return json({ success: true, results }, 200, context.corsHeaders);
  } catch (err: any) {
    console.error('[Trash] System trash error:', err);
    return json({ error: err.message }, 500, context.corsHeaders);
  }
}
