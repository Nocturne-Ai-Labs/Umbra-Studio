import { basename, dirname, join } from 'path';
import { existsSync, type Dirent } from 'fs';
import * as fs from 'fs/promises';

type ModelRootDescriptor = {
  key: 'user' | 'comfyui' | 'aitoolkit';
  label: string;
  path: string;
  fullPath: string;
};

type ModelIndexWorkerRequest =
  | {
      id: string;
      type: 'roots';
      payload: {
        roots: ModelRootDescriptor[];
      };
    }
  | {
      id: string;
      type: 'tree';
      payload: {
        path: string;
        fullPath: string;
        includeMetadata?: boolean;
      };
    }
  | {
      id: string;
      type: 'list';
      payload: {
        path: string;
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'summary';
      payload: {
        path: string;
        fullPath: string;
      };
    }
  | {
      id: string;
      type: 'invalidate';
      payload: {
        fullPaths: string[];
      };
    };

type ModelIndexWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; stack?: string };

type CachedEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 7_500;
const MAX_CACHE_ITEMS = 256;
const MODEL_SNAPSHOT_SUFFIX = '.umbra-model.json';
const MODEL_THUMB_PREFIX = '.umbra-model-thumb';
const MODEL_ARTIFACT_DIR = '.umbra';
const folderFirstCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const modelFileExtensions = new Set([
  '.safetensors',
  '.ckpt',
  '.pt',
  '.pth',
  '.bin',
  '.onnx',
  '.gguf',
  '.engine',
  '.json',
  '.yaml',
  '.yml',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.mp4',
  '.webm',
]);

const listCache = new Map<string, CachedEntry<any>>();
const treeCache = new Map<string, CachedEntry<any>>();
const summaryCache = new Map<string, CachedEntry<any>>();

function writeResponse(response: ModelIndexWorkerResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function normalizePathForKey(value: string): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizeClientPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function pruneCache(cache: Map<string, CachedEntry<any>>) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ITEMS) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function getCached<T>(cache: Map<string, CachedEntry<T>>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCached<T>(cache: Map<string, CachedEntry<T>>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
  pruneCache(cache);
}

function invalidatePathCaches(fullPath: string) {
  const normalized = normalizePathForKey(fullPath);
  if (!normalized) return;
  for (const cache of [listCache, treeCache, summaryCache]) {
    for (const key of Array.from(cache.keys())) {
      if (key === normalized || key.startsWith(`${normalized}::`) || key.startsWith(`${normalized}/`)) {
        cache.delete(key);
      }
    }
  }
}

function normalizeModelTypeByExt(name: string): string {
  const ext = String(name || '').toLowerCase().slice(String(name || '').lastIndexOf('.'));
  if (ext === '.safetensors' || ext === '.ckpt' || ext === '.pt' || ext === '.pth') return 'model';
  if (ext === '.onnx' || ext === '.engine' || ext === '.gguf') return 'runtime';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.bmp' || ext === '.avif') return 'preview-image';
  if (ext === '.mp4' || ext === '.webm') return 'preview-video';
  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.txt') return 'metadata';
  return 'other';
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readSnapshotValue(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value == null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

async function readModelSnapshotSummary(fullPath: string, clientPath: string) {
  const artifactDir = join(dirname(fullPath), MODEL_ARTIFACT_DIR);
  const artifactClientDir = normalizeClientPath(join(dirname(clientPath), MODEL_ARTIFACT_DIR));
  const baseName = basename(fullPath);
  const preferredSnapshotPath = join(artifactDir, `${baseName}${MODEL_SNAPSHOT_SUFFIX}`);
  const legacySnapshotPath = `${fullPath}${MODEL_SNAPSHOT_SUFFIX}`;
  const snapshotPath = existsSync(preferredSnapshotPath) ? preferredSnapshotPath : legacySnapshotPath;
  if (!existsSync(snapshotPath)) return null;
  try {
    const raw = await fs.readFile(snapshotPath, 'utf8');
    const parsed = toRecord(JSON.parse(String(raw || '{}')));
    const model = toRecord(parsed.model);
    const version = toRecord(parsed.version);
    const file = toRecord(parsed.file);

    let thumbnailPath = '';
    const thumbPrefix = `${baseName}${MODEL_THUMB_PREFIX}.`;
    try {
      const entries = existsSync(artifactDir) ? await fs.readdir(artifactDir) : [];
      const thumbName = entries.find((entry) => entry.startsWith(thumbPrefix));
      if (thumbName) {
        thumbnailPath = normalizeClientPath(join(artifactClientDir, thumbName));
      }
    } catch {
      thumbnailPath = '';
    }
    if (!thumbnailPath) {
      try {
        const entries = await fs.readdir(dirname(fullPath));
        const thumbName = entries.find((entry) => entry.startsWith(thumbPrefix));
        if (thumbName) {
          thumbnailPath = normalizeClientPath(join(dirname(clientPath), thumbName));
        }
      } catch {
        thumbnailPath = '';
      }
    }

    const summary = {
      source: readSnapshotValue(parsed, ['source']) || 'civitai',
      capturedAt: Number(parsed.capturedAt || parsed.savedAt || 0) || 0,
      modelId: Number(readSnapshotValue(model, ['id']) || 0) || 0,
      modelName: readSnapshotValue(model, ['name']) || readSnapshotValue(parsed, ['modelName']),
      creator: readSnapshotValue(model, ['creator']) || readSnapshotValue(parsed, ['creator']),
      description: readSnapshotValue(model, ['description']) || readSnapshotValue(version, ['description']) || readSnapshotValue(parsed, ['description']),
      tags: Array.isArray(model.tags) ? model.tags.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      trainedWords: Array.isArray(version.trainedWords) ? version.trainedWords.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      baseModel: readSnapshotValue(version, ['baseModel']),
      sourceUrl: readSnapshotValue(model, ['url']) || readSnapshotValue(parsed, ['modelPageUrl']),
      previewImageUrl: readSnapshotValue(file, ['previewImageUrl']) || readSnapshotValue(parsed, ['previewImageUrl']),
      thumbnailPath,
      workflow: parsed.workflow ?? parsed.workflowJson ?? null,
      metadata: parsed.metadata ?? parsed.imageMeta ?? null,
      localInspection: parsed.localInspection ?? null,
      raw: parsed,
    };
    return summary;
  } catch {
    return null;
  }
}

async function listDirectoryEntries(fullPath: string): Promise<Dirent[]> {
  if (!existsSync(fullPath)) return [];
  try {
    return await fs.readdir(fullPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function compareNames(a: { name: string }, b: { name: string }) {
  return folderFirstCollator.compare(a.name, b.name);
}

async function buildSummary(path: string, fullPath: string) {
  const cacheKey = normalizePathForKey(fullPath);
  const cached = getCached(summaryCache, cacheKey);
  if (cached) return cached;

  const entries = await listDirectoryEntries(fullPath);
  let folderCount = 0;
  let modelFileCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === MODEL_ARTIFACT_DIR) continue;
      folderCount += 1;
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = `.${String(entry.name || '').split('.').pop() || ''}`.toLowerCase();
    if (modelFileExtensions.has(ext)) modelFileCount += 1;
  }

  const summary = {
    path,
    folderCount,
    fileCount: modelFileCount,
  };
  setCached(summaryCache, cacheKey, summary);
  return summary;
}

async function buildTree(path: string, fullPath: string) {
  const cacheKey = normalizePathForKey(fullPath);
  const cached = getCached(treeCache, cacheKey);
  if (cached) return cached;

  const entries = await listDirectoryEntries(fullPath);
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== MODEL_ARTIFACT_DIR)
    .map((entry) => ({
      name: entry.name,
      path: normalizeClientPath(join(path, entry.name)),
      // Fast-path tree rendering: avoid scanning every child folder just to determine
      // if it has descendants. Expanding a leaf folder simply returns an empty list.
      hasChildren: true,
    }));
  folders.sort(compareNames);

  const tree = {
    path,
    folders,
  };
  setCached(treeCache, cacheKey, tree);
  return tree;
}

async function buildList(path: string, fullPath: string, options: { includeMetadata?: boolean } = {}) {
  const includeMetadata = options.includeMetadata !== false;
  const cacheKey = `${normalizePathForKey(fullPath)}::metadata=${includeMetadata ? '1' : '0'}`;
  const cached = getCached(listCache, cacheKey);
  if (cached) return cached;

  const entries = await listDirectoryEntries(fullPath);

  const folders = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== MODEL_ARTIFACT_DIR)
    .map((entry) => {
      const childPath = normalizeClientPath(join(path, entry.name));
      return {
        name: entry.name,
        path: childPath,
        folderCount: -1,
        fileCount: -1,
      };
    });

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => {
        const ext = `.${String(entry.name || '').split('.').pop() || ''}`.toLowerCase();
        return modelFileExtensions.has(ext);
      })
      .map(async (entry) => {
        const fullFilePath = join(fullPath, entry.name);
        const stat = await fs.stat(fullFilePath).catch(() => null);
        const ext = String(entry.name).includes('.')
          ? `.${String(entry.name).split('.').pop() || ''}`.toLowerCase()
          : '';
        const modelType = normalizeModelTypeByExt(entry.name);
        const clientFilePath = normalizeClientPath(join(path, entry.name));
        const snapshot = includeMetadata && (modelType === 'model' || modelType === 'runtime')
          ? await readModelSnapshotSummary(fullFilePath, clientFilePath).catch(() => null)
          : null;
        return {
          name: entry.name,
          path: clientFilePath,
          size: stat?.size || 0,
          modifiedMs: stat?.mtimeMs ? Math.floor(stat.mtimeMs) : 0,
          extension: ext,
          modelType,
          snapshot: snapshot || undefined,
        };
      }),
  );

  folders.sort(compareNames);
  files.sort(compareNames);

  const list = {
    path,
    folders,
    files,
    counts: {
      folders: folders.length,
      files: files.length,
    },
    complete: includeMetadata,
  };
  setCached(listCache, cacheKey, list);
  return list;
}

async function handleRequest(request: ModelIndexWorkerRequest) {
  switch (request.type) {
    case 'roots': {
      const payloadRoots = Array.isArray(request.payload.roots) ? request.payload.roots : [];
      const roots = await Promise.all(payloadRoots.map(async (root) => {
        const normalizedPath = normalizeClientPath(root.path);
        const normalizedFullPath = String(root.fullPath || '').trim();
        if (!normalizedFullPath) {
          return {
            ...root,
            path: normalizedPath,
            exists: false,
            folderCount: 0,
            fileCount: 0,
          };
        }
        if (!existsSync(normalizedFullPath)) {
          return {
            ...root,
            path: normalizedPath,
            exists: false,
            folderCount: 0,
            fileCount: 0,
          };
        }
        const summary = await buildSummary(normalizedPath, normalizedFullPath);
        return {
          ...root,
          path: normalizedPath,
          exists: true,
          folderCount: summary.folderCount,
          fileCount: summary.fileCount,
        };
      }));
      return { roots };
    }
    case 'tree': {
      const path = normalizeClientPath(request.payload.path);
      const fullPath = String(request.payload.fullPath || '').trim();
      return await buildTree(path, fullPath);
    }
    case 'list': {
      const path = normalizeClientPath(request.payload.path);
      const fullPath = String(request.payload.fullPath || '').trim();
      return await buildList(path, fullPath, {
        includeMetadata: request.payload.includeMetadata !== false,
      });
    }
    case 'summary': {
      const path = normalizeClientPath(request.payload.path);
      const fullPath = String(request.payload.fullPath || '').trim();
      return await buildSummary(path, fullPath);
    }
    case 'invalidate': {
      const fullPaths = Array.isArray(request.payload.fullPaths) ? request.payload.fullPaths : [];
      for (const fullPath of fullPaths) {
        invalidatePathCaches(String(fullPath || ''));
      }
      return { success: true };
    }
    default:
      throw new Error('Unsupported request type');
  }
}

async function processLine(line: string) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;

  let parsed: ModelIndexWorkerRequest;
  try {
    parsed = JSON.parse(trimmed) as ModelIndexWorkerRequest;
  } catch (error: any) {
    writeResponse({
      id: 'unknown',
      ok: false,
      error: `Invalid JSON: ${error?.message || 'parse error'}`,
    });
    return;
  }

  try {
    const result = await handleRequest(parsed);
    writeResponse({
      id: parsed.id,
      ok: true,
      result,
    });
  } catch (error: any) {
    writeResponse({
      id: parsed.id,
      ok: false,
      error: error?.message || 'Model index worker error',
      stack: error?.stack,
    });
  }
}

const decoder = new TextDecoder();
let buffer = '';

process.stdin.on('data', (chunk: Buffer) => {
  buffer += decoder.decode(chunk, { stream: true });
  while (true) {
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) break;
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    void processLine(line);
  }
});

process.stdin.on('end', () => {
  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.trim()) {
    void processLine(buffer);
  }
});
