import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';
import { settingsManager } from './settings/SettingsManager';
import { normalizeGalleryDirectoryPath } from './GalleryDirectoryPath';

export interface ResolvedPath {
  fullPath: string;
  baseDir: string;
  relativePath: string;
}

export interface RuntimePathOptions {
  rootDir: string;
  comfyOutputRoot?: string;
  legacyOutputRoot?: string;
  trashRoot?: string;
  datasetsRelativeRoot?: string;
}

export function createRuntimePathHelpers(options: RuntimePathOptions) {
  const ROOT_DIR_RESOLVED = resolve(options.rootDir);
  const COMFY_OUTPUT_ROOT = options.comfyOutputRoot || 'Tools/ComfyUI/output';
  const LEGACY_OUTPUT_ROOT = options.legacyOutputRoot || 'User/Outputs';
  const TRASH_ROOT = options.trashRoot || 'User/Trash';
  const DATASETS_ROOT = resolve(ROOT_DIR_RESOLVED, options.datasetsRelativeRoot || 'User/Datasets');

  function isAbsolutePathInput(input: string): boolean {
    return isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input);
  }

  function normalizePathForCompare(input: string): string {
    const normalized = resolve(input).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  function normalizeConfiguredPath(value: unknown): string {
    if (typeof value !== 'string') return '';
    return normalizeGalleryDirectoryPath(value);
  }

  function getDefaultOutputRootPath(): string {
    return COMFY_OUTPUT_ROOT;
  }

  function getConfiguredTrashStoragePath(): string {
    const configured = normalizeConfiguredPath(settingsManager.getAppSettings()['library.trashStoragePath']);
    return configured || TRASH_ROOT;
  }

  function normalizeOutputPathInput(inputPath: string): string {
    const normalized = String(inputPath || '').replace(/\\/g, '/');
    if (normalized === LEGACY_OUTPUT_ROOT || normalized.startsWith(`${LEGACY_OUTPUT_ROOT}/`)) {
      const defaultRoot = getDefaultOutputRootPath();
      return `${defaultRoot}${normalized.slice(LEGACY_OUTPUT_ROOT.length)}`;
    }
    return normalized;
  }

  function resolvePathCandidate(candidate: string): string {
    const outputPath = normalizeOutputPathInput(candidate);
    const normalized = /^[a-z]:$/i.test(outputPath) ? `${outputPath}/` : outputPath;
    if (isAbsolutePathInput(normalized)) return resolve(normalized);
    return resolve(ROOT_DIR_RESOLVED, normalized.replace(/^\/+/, ''));
  }

  function getResolvedTrashStorageDir(): string {
    return resolvePathCandidate(getConfiguredTrashStoragePath());
  }

  function getConfiguredExternalRoots(): string[] {
    const appSettings = settingsManager.getAppSettings();
    const roots = new Set<string>();

    const configuredOutput = normalizeConfiguredPath(appSettings['comfyui.externalOutputPath']);
    if (configuredOutput) roots.add(configuredOutput);

    const extraRootsEnabled = appSettings['library.enableExternalRoots'] !== false;
    if (extraRootsEnabled) {
      const configuredRoots = Array.isArray(appSettings['library.externalRoots']) ? appSettings['library.externalRoots'] : [];
      for (const entry of configuredRoots) {
        const normalized = normalizeConfiguredPath(entry);
        if (normalized && normalized !== TRASH_ROOT) roots.add(normalized);
      }
    }

    return Array.from(roots);
  }

  function isPathInsideRoot(fullPath: string): boolean {
    const root = normalizePathForCompare(ROOT_DIR_RESOLVED);
    const target = normalizePathForCompare(fullPath);
    return target === root || target.startsWith(`${root}/`);
  }

  function isPathInsideAllowedRoots(fullPath: string): boolean {
    if (isPathInsideRoot(fullPath)) return true;
    const target = normalizePathForCompare(fullPath);
    const trashRoot = normalizePathForCompare(getResolvedTrashStorageDir());
    if (target === trashRoot || target.startsWith(`${trashRoot}/`)) return true;
    const externalRoots = getConfiguredExternalRoots();
    for (const rootPath of externalRoots) {
      const root = normalizePathForCompare(resolvePathCandidate(rootPath));
      if (target === root || target.startsWith(`${root}/`)) return true;
    }
    return false;
  }

  function toClientPath(fullPath: string): string {
    const resolvedPath = resolve(fullPath);
    const normalizedTarget = normalizePathForCompare(resolvedPath);
    const trashRoot = normalizePathForCompare(getResolvedTrashStorageDir());
    if (normalizedTarget === trashRoot) return TRASH_ROOT;
    if (normalizedTarget.startsWith(`${trashRoot}/`)) {
      const suffix = relative(getResolvedTrashStorageDir(), resolvedPath).replace(/\\/g, '/');
      return suffix && suffix !== '.' ? `${TRASH_ROOT}/${suffix}`.replace(/\/+/, '/') : TRASH_ROOT;
    }

    if (isPathInsideRoot(fullPath)) {
      const rel = relative(ROOT_DIR_RESOLVED, fullPath).replace(/\\/g, '/');
      return rel && rel !== '.' ? rel : '.';
    }
    return resolvedPath.replace(/\\/g, '/');
  }

  function sanitizeDatasetSegment(raw: unknown): string {
    const value = String(raw ?? '').trim();
    if (!value || value.includes('\0')) return '';
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized === '.' || normalized === '..') return '';
    if (normalized.includes('/')) return '';
    if (normalized.includes('..')) return '';
    return normalized;
  }

  function sanitizeDatasetRelativePath(raw: unknown): string {
    const normalized = String(raw ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
    if (!normalized || normalized.includes('\0')) return '';
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 0) return '';
    const safeParts: string[] = [];
    for (const part of parts) {
      const safePart = sanitizeDatasetSegment(part);
      if (!safePart) return '';
      safeParts.push(safePart);
    }
    return safeParts.join('/');
  }

  // Resolve existing ancestors so a junction or symlink inside User/Datasets cannot
  // redirect a dataset operation outside the configured datasets root. Missing
  // descendants are kept lexical so new dataset and concept paths still work.
  function canonicalizeNearestExisting(input: string): string | null {
    let ancestor = input;
    const missing: string[] = [];
    while (true) {
      try {
        lstatSync(ancestor);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
        const parent = dirname(ancestor);
        if (parent === ancestor) return null;
        missing.push(basename(ancestor));
        ancestor = parent;
        continue;
      }
      try {
        return resolve(realpathSync.native(ancestor), ...missing.reverse());
      } catch {
        // A dangling link or an inaccessible ancestor must never be treated as missing.
        return null;
      }
    }
  }

  function resolveDatasetPathSafe(...segments: Array<unknown>): string | null {
    const safeSegments: string[] = [];
    for (const rawSegment of segments) {
      if (rawSegment == null || rawSegment === '') continue;
      const safeSegment = sanitizeDatasetSegment(rawSegment);
      if (!safeSegment) return null;
      safeSegments.push(safeSegment);
    }
    const candidate = resolve(DATASETS_ROOT, ...safeSegments);
    const datasetsRootNormalized = normalizePathForCompare(DATASETS_ROOT);
    const candidateNormalized = normalizePathForCompare(candidate);
    if (candidateNormalized !== datasetsRootNormalized && !candidateNormalized.startsWith(`${datasetsRootNormalized}/`)) {
      return null;
    }
    const canonicalRoot = canonicalizeNearestExisting(DATASETS_ROOT);
    const canonicalCandidate = canonicalizeNearestExisting(candidate);
    if (!canonicalRoot || !canonicalCandidate) return null;
    const fromRoot = relative(canonicalRoot, canonicalCandidate);
    if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
    return candidate;
  }

  function resolvePath(inputPath: string, resolveOptions: { allowOutsideRoot?: boolean } = {}): ResolvedPath | null {
    let raw = String(inputPath || '');
    if (!raw || raw.includes('\0')) return null;
    raw = raw.trim();
    if (!raw) return null;

    const allowOutsideRoot = resolveOptions.allowOutsideRoot === true;
    const absolute = isAbsolutePathInput(raw);
    if (!absolute) {
      raw = normalizeOutputPathInput(raw);
    }

    let fullPath = absolute ? resolve(raw) : resolve(ROOT_DIR_RESOLVED, raw.replace(/^\/+/, ''));

    if (!absolute) {
      const normalized = raw.replace(/\\/g, '/');
      if (normalized === TRASH_ROOT || normalized.startsWith(`${TRASH_ROOT}/`)) {
        const suffix = normalized.slice(TRASH_ROOT.length).replace(/^\/+/, '');
        const trashRoot = getResolvedTrashStorageDir();
        fullPath = suffix ? resolve(trashRoot, suffix) : resolve(trashRoot);
      }
    }

    if (!allowOutsideRoot && !isPathInsideAllowedRoots(fullPath)) return null;

    return {
      fullPath,
      baseDir: ROOT_DIR_RESOLVED,
      relativePath: toClientPath(fullPath),
    };
  }

  return {
    COMFY_OUTPUT_ROOT,
    LEGACY_OUTPUT_ROOT,
    TRASH_ROOT,
    DATASETS_ROOT,
    isAbsolutePathInput,
    normalizePathForCompare,
    normalizeConfiguredPath,
    getDefaultOutputRootPath,
    getConfiguredTrashStoragePath,
    normalizeOutputPathInput,
    resolvePathCandidate,
    getResolvedTrashStorageDir,
    getConfiguredExternalRoots,
    isPathInsideRoot,
    isPathInsideAllowedRoots,
    toClientPath,
    sanitizeDatasetSegment,
    sanitizeDatasetRelativePath,
    resolveDatasetPathSafe,
    resolvePath,
  };
}
