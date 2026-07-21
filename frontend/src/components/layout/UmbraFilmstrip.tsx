'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filmstrip, type FilmstripImage, type SortDirection, type SortField } from '@/components/filmstrip';
import { resolveFilmstripSelectedImages } from '@/components/filmstrip/filmstripSelection';
import { useStore } from '@/store/useStore';
import { useToastStore } from '@/store/useToastStore';
import { deletePathsWithSettings } from '@/utils/trashActions';
import { isDiagnosticLoggingEnabled, logDiagnostic } from '@/lib/diagnostics';
import { getWorkflowJsonExport, type ImageMetadata } from '@/utils/metadata';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { galleryMediaRevision } from '@/lib/galleryMediaIdentity';

interface UmbraFilmstripProps {
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  onHeightChange?: (height: number) => void;
}

type FsListMediaFile = {
  uid?: string;
  id?: string;
  name: string;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  type?: 'image' | 'video' | 'gif';
  width?: number;
  height?: number;
  size?: number;
  created?: number;
  modified?: number;
  createdMs?: number;
  modifiedMs?: number;
  customOrder?: number;
  tags?: string[];
};

type GallerySortBy = 'created' | 'modified' | 'name' | 'custom';
type GallerySortOrder = 'asc' | 'desc';
type FeedMode = 'replace' | 'append' | 'remove';

const DEFAULT_OUTPUT_ROOT = 'Tools/ComfyUI/output';
const NO_COMFY_WORKFLOW_MESSAGE = 'No workflow JSON found in selection.';
const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';
const LIVE_GENERATION_PREVIEW_PATH = 'umbra-live-generation://powerprompter/current.png';

function normalizePath(value: string | null | undefined): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function pathsLikelySame(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizePath(left || '');
  const b = normalizePath(right || '');
  if (!a || !b) return false;
  if (a === b) return true;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower) return true;
  if (aLower.endsWith(`/${bLower}`)) return true;
  if (bLower.endsWith(`/${aLower}`)) return true;
  return false;
}

function pathLeaf(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  if (!normalized) return '';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function pathParent(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  if (!normalized) return '';
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalizePath(normalized.slice(0, index));
}

function pathsLikelyRelated(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizePath(left || '');
  const b = normalizePath(right || '');
  if (!a || !b) return false;
  if (pathsLikelySame(a, b)) return true;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  return aLower.startsWith(`${bLower}/`) || bLower.startsWith(`${aLower}/`);
}

function isLiveGenerationPreviewPath(pathValue: string | null | undefined): boolean {
  return normalizePath(pathValue).startsWith('umbra-live-generation://');
}

function filmstripImageFromGenerationPreview(detail: unknown): FilmstripImage | null {
  const payload = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
  const imageDataUrl = String(payload.imageDataUrl || '').trim();
  if (!imageDataUrl) return null;
  const updatedAt = safeNumber(payload.updatedAt) || Date.now();
  const step = Math.max(0, Math.trunc(safeNumber(payload.step)));
  const maxStep = Math.max(0, Math.trunc(safeNumber(payload.maxStep)));
  return {
    id: LIVE_GENERATION_PREVIEW_PATH,
    uid: LIVE_GENERATION_PREVIEW_PATH,
    name: maxStep > 0 ? `Live Generation Preview - Step ${step}/${maxStep}` : 'Live Generation Preview',
    path: LIVE_GENERATION_PREVIEW_PATH,
    url: imageDataUrl,
    thumbnailUrl: imageDataUrl,
    type: 'image',
    width: 0,
    height: 0,
    size: 0,
    dateCreated: String(updatedAt),
    dateModified: String(updatedAt),
  };
}

function collectOutputSavedFolders(detail: unknown): string[] {
  const payload = (detail && typeof detail === 'object')
    ? detail as Record<string, unknown>
    : {};
  const folders = new Set<string>();

  const addFolder = (value: unknown) => {
    const normalized = normalizePath(String(value || ''));
    if (!normalized) return;
    folders.add(isLikelyFilePath(normalized) ? pathParent(normalized) : normalized);
  };

  const rawFolderPaths = Array.isArray(payload.folderPaths) ? payload.folderPaths : [];
  for (const folderPath of rawFolderPaths) addFolder(folderPath);

  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  for (const output of outputs) {
    const outputPayload = (output && typeof output === 'object')
      ? output as Record<string, unknown>
      : {};
    addFolder(outputPayload.fullpath || outputPayload.fullPath || outputPayload.path);
  }

  return Array.from(folders);
}

function safeNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function appendFilmstripRevision(rawUrl: string, revision: string): string {
  if (!rawUrl || !revision) return rawUrl;
  const [base, rawSearch = ''] = rawUrl.split('?');
  const search = new URLSearchParams(rawSearch);
  search.set('rev', revision);
  search.set('lane', 'filmstrip');
  return `${base}?${search.toString()}`;
}

function toFilmstripImage(item: FsListMediaFile): FilmstripImage {
  const normalizedPath = normalizePath(item.path);
  const normalizedUid = normalizeId(item.uid);
  const fallbackId = normalizeId(item.id || item.path);
  const stableId = normalizedUid || fallbackId;
  const normalizedType = String(item.type || '').toLowerCase();
  const size = safeNumber(item.size);
  const createdMs = safeNumber(item.createdMs ?? item.created);
  const modifiedMs = safeNumber(item.modifiedMs ?? item.modified);
  const revision = galleryMediaRevision({
    uid: normalizedUid,
    id: fallbackId,
    path: normalizedPath,
    createdMs,
    modifiedMs,
    size,
  });
  const inferredType = normalizedType === 'video'
    ? 'video'
    : normalizedPath.toLowerCase().endsWith('.gif')
      ? 'gif'
      : 'image';

  return {
    id: stableId,
    uid: normalizedUid || undefined,
    name: String(item.name || normalizedPath.split('/').pop() || 'untitled'),
    path: normalizedPath,
    url: appendFilmstripRevision(
      String(item.url || '').trim() || `/api/fs/image?path=${encodeURIComponent(normalizedPath)}`,
      revision,
    ),
    thumbnailUrl: String(item.thumbnailUrl || '').trim() || `/api/fs/thumbnail?path=${encodeURIComponent(normalizedPath)}&size=small&q=70&rev=${encodeURIComponent(revision)}&fit=cover&lane=filmstrip&defer=1`,
    type: inferredType,
    width: safeNumber(item.width),
    height: safeNumber(item.height),
    size,
    dateCreated: String(safeNumber(item.createdMs ?? item.created)),
    dateModified: String(modifiedMs),
  };
}

function filmstripImagesFromSavedOutputs(detail: unknown): FilmstripImage[] {
  const payload = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  const seen = new Set<string>();
  const images: FilmstripImage[] = [];
  for (const output of outputs) {
    const item = output && typeof output === 'object' ? output as Record<string, unknown> : {};
    const path = normalizePath(String(item.fullpath || item.fullPath || item.path || ''));
    const key = path.toLowerCase();
    if (!path || seen.has(key)) continue;
    seen.add(key);
    images.push(toFilmstripImage({
      path,
      name: String(item.filename || item.name || pathLeaf(path) || 'generation'),
      type: String(item.type || '').toLowerCase() as FsListMediaFile['type'],
      modifiedMs: safeNumber(item.modifiedMs ?? item.modified ?? Date.now()) || Date.now(),
      createdMs: safeNumber(item.createdMs ?? item.created ?? item.modifiedMs ?? item.modified ?? Date.now()) || Date.now(),
      size: safeNumber(item.size),
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || '')).filter(Boolean) : undefined,
    }));
  }
  return images;
}

function buildFilmstripFeedSignature(folderPath: string, items: FilmstripImage[]): string {
  const normalizedFolder = normalizePath(folderPath);
  if (!Array.isArray(items) || items.length === 0) return `${normalizedFolder}|0`;
  const parts = items.map((item) => `${normalizeId(item.id)}|${normalizePath(item.path)}|${String(item.thumbnailUrl || '')}`);
  return `${normalizedFolder}|${items.length}|${parts.join('||')}`;
}

function shouldTraceFilmstrip(): boolean {
  try {
    window.localStorage.removeItem('umbra.filmstripTrace');
  } catch {
    // Legacy cleanup only.
  }
  return isDiagnosticLoggingEnabled();
}

function sortFilmstripImages(
  items: FilmstripImage[],
  sortField: SortField,
  sortDirection: SortDirection,
  customOrder: string[],
): FilmstripImage[] {
  const direction = sortDirection === 'asc' ? 1 : -1;
  const next = [...items];

  if (sortField === 'custom') {
    const order = new Map<string, number>();
    customOrder.forEach((id, index) => order.set(id, index));
    next.sort((a, b) => {
      const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    return next;
  }

  next.sort((a, b) => {
    if (sortField === 'name') {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortField === 'size') {
      return safeNumber(a.size) - safeNumber(b.size);
    }
    if (sortField === 'created') {
      return safeNumber(a.dateCreated) - safeNumber(b.dateCreated);
    }
    return safeNumber(a.dateModified) - safeNumber(b.dateModified);
  });

  return direction === 1 ? next : next.reverse();
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function reorderIdsAsBlock(
  sourceIds: string[],
  movedIdsInput: string[],
  overIdInput: string,
  position: 'before' | 'after',
): string[] {
  const source = Array.from(new Set(sourceIds.map((id) => normalizeId(id)).filter(Boolean)));
  const overId = normalizeId(overIdInput);
  if (source.length === 0 || !overId) return source;

  const movedIds = Array.from(new Set(movedIdsInput.map((id) => normalizeId(id)).filter(Boolean)))
    .filter((id) => id !== overId && source.includes(id));
  if (movedIds.length === 0) return source;

  const movedSet = new Set(movedIds);
  const remaining = source.filter((id) => !movedSet.has(id));
  const overIndex = remaining.indexOf(overId);
  if (overIndex < 0) return source;

  const insertIndex = position === 'before' ? overIndex : overIndex + 1;
  const next = remaining.slice();
  next.splice(insertIndex, 0, ...movedIds);
  return next;
}

function splitFileName(name: string): { base: string; extension: string } {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { base: '', extension: '' };
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { base: trimmed, extension: '' };
  }
  return {
    base: trimmed.slice(0, dotIndex),
    extension: trimmed.slice(dotIndex),
  };
}

function isTrashPath(value: string): boolean {
  const normalized = normalizePath(value);
  return normalized === 'User/Trash' || normalized.startsWith('User/Trash/');
}

function isLikelyFilePath(value: string): boolean {
  const leaf = pathLeaf(value);
  return Boolean(leaf) && leaf.includes('.');
}

function resolveRestoredPath(
  entry: unknown,
  fallbackPath?: string,
): string {
  const payload = (entry && typeof entry === 'object'
    ? entry as Record<string, unknown>
    : null);
  return normalizePath(
    String(
      payload?.restoredPath
      || payload?.originalPath
      || payload?.path
      || fallbackPath
      || '',
    ),
  );
}

function normalizeGallerySortBy(input: unknown): GallerySortBy {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'modified' || value === 'name' || value === 'custom') return value;
  return 'created';
}

function normalizeGallerySortOrder(input: unknown): GallerySortOrder {
  return String(input || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function mapGallerySortByToFilmstrip(sortBy: GallerySortBy): SortField {
  if (sortBy === 'modified') return 'date';
  if (sortBy === 'name') return 'name';
  if (sortBy === 'custom') return 'custom';
  return 'created';
}

function mapFilmstripSortFieldToGallery(sortField: SortField): GallerySortBy | null {
  if (sortField === 'date') return 'modified';
  if (sortField === 'created') return 'created';
  if (sortField === 'name') return 'name';
  if (sortField === 'custom') return 'custom';
  return null;
}

export function UmbraFilmstrip({
  initialHeight = 180,
  minHeight = 120,
  maxHeight = 600,
  onHeightChange,
}: UmbraFilmstripProps) {
  const activeWorkspace = useStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const addScannedImport = useStore((state) => state.addScannedImport);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const appSettings = useStore((state) => state.appSettings);
  const pinnedFoldersSetting = useStore((state) => state.appSettings['library.pinnedFolders']);
  const recentFoldersSetting = useStore((state) => state.appSettings['library.recentFolders']);
  const metadataTooltipEnabled = useStore((state) => state.appSettings['library.metadataHoverTooltips'] !== false);
  const { addToast } = useToastStore();

  const rootPath = DEFAULT_OUTPUT_ROOT;

  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [images, setImages] = useState<FilmstripImage[]>([]);
  const [liveGenerationPreviewImage, setLiveGenerationPreviewImage] = useState<FilmstripImage | null>(null);
  const [recentGenerationOutputImages, setRecentGenerationOutputImages] = useState<FilmstripImage[]>([]);
  const [recentGenerationsExpanded, setRecentGenerationsExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string>('');
  const [touchSelectionMode, setTouchSelectionMode] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>('replace');
  const [dropTargetPath, setDropTargetPath] = useState<string>('');
  const suppressSelectionEmitRef = useRef(false);
  const externalSelectionRef = useRef<{ paths: string[]; primaryPath?: string } | null>(null);
  const pendingSelectionRef = useRef<{ folderPath?: string; paths: string[]; primaryPath?: string } | null>(null);
  const feedSignatureRef = useRef<string>('');
  const lastFeedRequestAtRef = useRef(0);
  const lastForceRefreshBurstAtRef = useRef(0);
  const currentFolderRef = useRef<string>('');
  const isTouchRemote = typeof document !== 'undefined'
    && (document.documentElement.dataset.umbraRemoteMode === 'phone' || document.documentElement.dataset.umbraRemoteMode === 'tablet');

  useEffect(() => {
    currentFolderRef.current = normalizePath(currentFolder);
  }, [currentFolder]);

  useEffect(() => {
    if (!isTouchRemote) setTouchSelectionMode(false);
  }, [isTouchRemote]);

  const pinnedFolders = useMemo(() => {
    const raw = pinnedFoldersSetting;
    const deduped = new Set<string>();
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        const normalized = normalizePath(entry);
        if (normalized) deduped.add(normalized);
      }
    }
    return Array.from(deduped);
  }, [pinnedFoldersSetting]);

  const recentFolders = useMemo(() => {
    const raw = recentFoldersSetting;
    const deduped = new Map<string, string>();
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        const normalized = normalizePath(entry);
        const key = normalized.toLowerCase();
        if (normalized && !deduped.has(key)) deduped.set(key, normalized);
      }
    }
    return Array.from(deduped.values()).slice(0, 8);
  }, [recentFoldersSetting]);

  const rememberRecentFolders = useCallback((folderPaths: string[]) => {
    const normalizedRoot = normalizePath(rootPath).toLowerCase();
    const incoming = folderPaths
      .map((entry) => normalizePath(entry))
      .filter((entry) => entry && entry.toLowerCase() !== normalizedRoot);
    if (incoming.length === 0) return;

    const stored = useStore.getState().appSettings['library.recentFolders'];
    const current = Array.isArray(stored) ? stored : [];
    const next = new Map<string, string>();
    for (const entry of [...incoming, ...current]) {
      const normalized = normalizePath(entry);
      const key = normalized.toLowerCase();
      if (normalized && key !== normalizedRoot && !next.has(key)) next.set(key, normalized);
      if (next.size >= 8) break;
    }
    const nextFolders = Array.from(next.values());
    const currentFolders = current.map((entry) => normalizePath(entry)).filter(Boolean).slice(0, 8);
    if (nextFolders.length === currentFolders.length
      && nextFolders.every((entry, index) => entry.toLowerCase() === currentFolders[index]?.toLowerCase())) return;
    setAppSetting('library.recentFolders', nextFolders);
  }, [rootPath, setAppSetting]);

  const displayedImages = useMemo(() => {
    const sortedImages = sortFilmstripImages(images, sortField, sortDirection, customOrder)
      .filter((image) => !isLiveGenerationPreviewPath(image.path));
    return sortedImages;
  }, [customOrder, images, sortDirection, sortField]);

  const recentGenerationLaneImages = useMemo(() => {
    const recentLimit = recentGenerationsExpanded ? 10 : 3;
    const lane = [
      ...(liveGenerationPreviewImage ? [liveGenerationPreviewImage] : []),
      ...recentGenerationOutputImages.slice(0, recentLimit),
    ];
    const seen = new Set<string>();
    return lane.filter((image) => {
      const key = normalizePath(image.path).toLowerCase() || normalizeId(image.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [liveGenerationPreviewImage, recentGenerationOutputImages, recentGenerationsExpanded]);

  const selectableImages = useMemo(() => {
    if (recentGenerationLaneImages.length === 0) return displayedImages;
    const byId = new Map<string, FilmstripImage>();
    for (const image of recentGenerationLaneImages) {
      const id = normalizeId(image.id);
      if (id && !byId.has(id)) byId.set(id, image);
    }
    for (const image of displayedImages) {
      const id = normalizeId(image.id);
      if (id && !byId.has(id)) byId.set(id, image);
    }
    return Array.from(byId.values());
  }, [displayedImages, recentGenerationLaneImages]);

  const resolveSelectedImages = useCallback((ids: string[]): FilmstripImage[] => {
    return resolveFilmstripSelectedImages(selectableImages, selectableImages, ids);
  }, [selectableImages]);

  const resolveSelectionPaths = useCallback((ids: string[], imageOnly = false): string[] => {
    const selected = resolveSelectedImages(ids);
    const seen = new Set<string>();
    const next: string[] = [];
    for (const entry of selected) {
      if (imageOnly && entry.type !== 'image' && entry.type !== 'gif') continue;
      const normalized = normalizePath(entry.path);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      next.push(normalized);
    }
    return next;
  }, [resolveSelectedImages]);

  const resolveIdsForSelectionPaths = useCallback((pathsInput: string[], primaryPathInput?: string) => {
    const normalizedPaths = Array.from(new Set(
      (pathsInput || [])
        .map((entry) => normalizePath(entry))
        .filter(Boolean),
    ));
    const byPath = new Map<string, string>();
    for (const image of selectableImages) {
      const normalizedPath = normalizePath(image.path);
      if (!normalizedPath) continue;
      byPath.set(normalizedPath, image.id);
    }
    const resolvedIds = normalizedPaths
      .map((pathValue) => byPath.get(pathValue) || '')
      .filter(Boolean);
    const uniqueIds = Array.from(new Set(resolvedIds));
    const primaryPath = normalizePath(primaryPathInput || '');
    const primaryId = primaryPath ? byPath.get(primaryPath) || '' : '';
    const nextAnchor = primaryId && uniqueIds.includes(primaryId)
      ? primaryId
      : (uniqueIds.at(-1) || '');

    return {
      ids: uniqueIds,
      anchorId: nextAnchor,
      paths: normalizedPaths,
      primaryPath,
    };
  }, [selectableImages]);

  const applyIncomingSelection = useCallback((pathsInput: string[], primaryPathInput?: string) => {
    const resolved = resolveIdsForSelectionPaths(pathsInput, primaryPathInput);
    externalSelectionRef.current = {
      paths: resolved.paths,
      ...(resolved.primaryPath ? { primaryPath: resolved.primaryPath } : {}),
    };
    suppressSelectionEmitRef.current = true;
    setSelectedIds(new Set(resolved.ids));
    setLastSelectedId(resolved.anchorId);
  }, [resolveIdsForSelectionPaths]);

  const clearExternalSelection = useCallback(() => {
    externalSelectionRef.current = null;
  }, []);

  const sendSelectionToWorkspace = useCallback((paths: string[], workspace: 'scanner' | 'waifudiffusion') => {
    if (paths.length === 0) {
      addToast({
        type: 'error',
        message: workspace === 'scanner'
          ? 'No valid items selected for Metadata Scanner'
          : 'No valid images selected for Waifu Diffusion',
      });
      return;
    }
    addScannedImport(paths);
    if (workspace === 'scanner' || workspace === 'waifudiffusion') {
      useStore.getState().setUI('imageInspectorTab', workspace === 'scanner' ? 'scanner' : 'waifu');
      setActiveWorkspace('imageinspector');
    } else {
      setActiveWorkspace(workspace);
    }
    addToast({
      type: 'success',
      message: workspace === 'scanner'
        ? `Sent ${paths.length} item${paths.length === 1 ? '' : 's'} to Metadata Scanner`
        : `Sent ${paths.length} image${paths.length === 1 ? '' : 's'} to Waifu Diffusion`,
    });
  }, [addScannedImport, addToast, setActiveWorkspace]);

  const persistCustomOrder = useCallback(async (nextOrderIds: string[]) => {
    const folder = normalizePath(currentFolder || rootPath);
    if (!folder) return;

    const orderIndex = new Map<string, number>();
    nextOrderIds.forEach((id, index) => {
      const normalized = normalizeId(id);
      if (normalized) orderIndex.set(normalized, index);
    });

    const orderedFiles = images.slice().sort((a, b) => {
      const ai = orderIndex.get(normalizeId(a.id)) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.get(normalizeId(b.id)) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    const orderedUids = orderedFiles
      .map((file) => normalizeId(file.uid))
      .filter(Boolean);
    const orderedPaths = orderedFiles
      .map((file) => normalizePath(file.path))
      .filter(Boolean);
    if (orderedUids.length === 0 && orderedPaths.length === 0) return;

    try {
      const response = await fetch('/api/fs/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: folder,
          orderedUids,
          orderedPaths,
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to persist filmstrip order'));
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to persist filmstrip order',
      });
    }
  }, [addToast, currentFolder, images, rootPath]);

  const refreshImages = useCallback((options?: { force?: boolean }) => {
    const folder = normalizePath(currentFolder || rootPath);
    if (!folder) return;
    const now = Date.now();
    if (!options?.force && now - lastFeedRequestAtRef.current < 850) return;
    lastFeedRequestAtRef.current = now;
    window.dispatchEvent(new CustomEvent('umbra:gallery-request-filmstrip-feed', {
      detail: {
        path: folder,
        folderPath: folder,
        source: options?.force ? 'gallery-content-changed' : 'filmstrip-refresh',
      },
    }));
  }, [currentFolder, rootPath]);

  useEffect(() => {
    if (!rootPath) return;
    setCurrentFolder((current) => {
      if (current) return current;
      if (pinnedFolders.length > 0) return pinnedFolders[0];
      return rootPath;
    });
  }, [pinnedFolders, rootPath]);

  useEffect(() => {
    const onGalleryFolderChanged = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string }>;
      const incoming = normalizePath(custom?.detail?.path || custom?.detail?.folderPath || '');
      if (!incoming) return;
      setCurrentFolder(incoming);
      rememberRecentFolders([incoming]);
    };
    window.addEventListener('umbra:gallery-folder-changed', onGalleryFolderChanged as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-folder-changed', onGalleryFolderChanged as EventListener);
    };
  }, [rememberRecentFolders]);

  useEffect(() => {
    const onFilmstripFeed = (event: Event) => {
      const custom = event as CustomEvent<{
        folderPath?: string;
        files?: FsListMediaFile[];
        mode?: 'replace' | 'append' | 'remove' | string;
        removedPaths?: string[];
        sortBy?: string;
        sortOrder?: string;
        source?: string;
      }>;
      const folderPath = normalizePath(custom?.detail?.folderPath || '');
      const rawFiles = Array.isArray(custom?.detail?.files) ? custom.detail.files : [];
      const rawMode = String(custom?.detail?.mode || '').trim().toLowerCase();
      const mode = rawMode === 'append' ? 'append' : (rawMode === 'remove' ? 'remove' : 'replace');
      const removedPaths = Array.isArray(custom?.detail?.removedPaths)
        ? custom.detail.removedPaths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];

      const seenPaths = new Set<string>();
      const mapped: FilmstripImage[] = [];
      for (const entry of rawFiles) {
        const image = toFilmstripImage(entry);
        const imagePath = normalizePath(image.path);
        if (!imagePath || seenPaths.has(imagePath)) continue;
        seenPaths.add(imagePath);
        mapped.push(image);
      }

      const nextSortBy = normalizeGallerySortBy(custom?.detail?.sortBy);
      const nextSortOrder = normalizeGallerySortOrder(custom?.detail?.sortOrder);
      const nextFilmstripField = mapGallerySortByToFilmstrip(nextSortBy);
      setSortField((current) => (current === nextFilmstripField ? current : nextFilmstripField));
      setSortDirection((current) => (current === nextSortOrder ? current : nextSortOrder));

      const activeFolder = normalizePath(currentFolderRef.current || '');
      const canAppend = mode === 'append'
        && !!folderPath
        && !!activeFolder
        && folderPath === activeFolder;
      const canRemove = mode === 'remove'
        && removedPaths.length > 0
        && !!folderPath
        && !!activeFolder
        && folderPath === activeFolder;

      if (canAppend) {
        if (mapped.length === 0) return;
        setFeedMode('append');
        setImages((current) => {
          const seen = new Set(current.map((item) => normalizePath(item.path)));
          const additions = mapped.filter((item) => {
            const key = normalizePath(item.path);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (additions.length === 0) return current;
          const next = [...current, ...additions];
          const last = next.at(-1);
          feedSignatureRef.current = `${folderPath}|${next.length}|${normalizeId(last?.id)}|${normalizePath(last?.path)}`;
          setCustomOrder((currentOrder) => {
            if (currentOrder.length === 0) return currentOrder;
            const existing = new Set(currentOrder.map(normalizeId));
            const nextIds = additions
              .map((item) => normalizeId(item.id))
              .filter((id) => id && !existing.has(id));
            return nextIds.length > 0 ? [...currentOrder, ...nextIds] : currentOrder;
          });
          return next;
        });
        return;
      }

      if (canRemove) {
        const removedList = removedPaths;
        setFeedMode('remove');
        setImages((current) => {
          const next = current.filter((item) => !removedList.some((pathValue) => pathsLikelySame(item.path, pathValue)));
          if (next.length === current.length) return current;
          feedSignatureRef.current = buildFilmstripFeedSignature(folderPath, next);
          setCustomOrder(next.map((item) => item.id));
          setSelectedIds((existing) => {
            const valid = new Set(next.map((item) => item.id));
            return new Set(Array.from(existing).filter((id) => valid.has(id)));
          });
          return next;
        });
        return;
      }

      const feedSignature = buildFilmstripFeedSignature(folderPath, mapped);
      if (shouldTraceFilmstrip()) {
        logDiagnostic('[Umbra Filmstrip]', {
          event: 'incoming-feed',
          source: String(custom?.detail?.source || '').trim() || 'gallery',
          mode,
          folderPath,
          fileCount: mapped.length,
          removedCount: removedPaths.length,
        }, 'debug');
      }
      const feedChanged = feedSignatureRef.current !== feedSignature;
      if (feedChanged) {
        feedSignatureRef.current = feedSignature;
        setFeedMode(mode === 'append' ? 'append' : (mode === 'remove' ? 'remove' : 'replace'));
        if (folderPath) setCurrentFolder(folderPath);
        setImages(mapped);
        setCustomOrder(mapped.map((item) => item.id));
        setSelectedIds((current) => {
          const valid = new Set(mapped.map((item) => item.id));
          const next = new Set(Array.from(current).filter((id) => valid.has(id)));
          return next;
        });
      }
      const pending = pendingSelectionRef.current;
      if (pending) {
        const pendingFolder = normalizePath(pending.folderPath || '');
        if (!pendingFolder || !folderPath || pendingFolder === folderPath) {
          pendingSelectionRef.current = null;
          const byPath = new Map<string, string>();
          for (const image of mapped) {
            const normalizedPath = normalizePath(image.path);
            if (normalizedPath) byPath.set(normalizedPath, image.id);
          }
          const resolvedIds = Array.from(new Set((pending.paths || [])
            .map((pathValue) => byPath.get(normalizePath(pathValue)) || '')
            .filter(Boolean)));
          const primaryId = pending.primaryPath ? byPath.get(normalizePath(pending.primaryPath)) || '' : '';
          suppressSelectionEmitRef.current = true;
          setSelectedIds(new Set(resolvedIds));
          setLastSelectedId(primaryId && resolvedIds.includes(primaryId) ? primaryId : (resolvedIds.at(-1) || ''));
        }
      }
    };
    window.addEventListener('umbra:gallery-filmstrip-feed', onFilmstripFeed as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-filmstrip-feed', onFilmstripFeed as EventListener);
    };
  }, []);

  useEffect(() => {
    const onGallerySortChanged = (event: Event) => {
      const custom = event as CustomEvent<{ sortBy?: string; sortOrder?: string; source?: string }>;
      const nextSortBy = normalizeGallerySortBy(custom?.detail?.sortBy);
      const nextSortOrder = normalizeGallerySortOrder(custom?.detail?.sortOrder);
      const nextFilmstripField = mapGallerySortByToFilmstrip(nextSortBy);
      setSortField((current) => (current === nextFilmstripField ? current : nextFilmstripField));
      setSortDirection((current) => (current === nextSortOrder ? current : nextSortOrder));
    };
    window.addEventListener('umbra:gallery-sort-changed', onGallerySortChanged as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-sort-changed', onGallerySortChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const onGallerySelectionChanged = (event: Event) => {
      const custom = event as CustomEvent<{
        paths?: string[];
        primaryPath?: string;
        folderPath?: string;
        source?: string;
      }>;
      const source = String(custom?.detail?.source || '').trim();
      if (source === 'filmstrip') return;

      const incomingPaths = Array.isArray(custom?.detail?.paths)
        ? custom.detail.paths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];
      const incomingPrimaryPath = normalizePath(String(custom?.detail?.primaryPath || ''));
      const incomingFolderPath = normalizePath(String(custom?.detail?.folderPath || ''));
      const activeFolder = normalizePath(currentFolder || rootPath);

      if (incomingFolderPath && activeFolder && incomingFolderPath !== activeFolder) {
        pendingSelectionRef.current = {
          folderPath: incomingFolderPath,
          paths: incomingPaths,
          primaryPath: incomingPrimaryPath || undefined,
        };
        setCurrentFolder(incomingFolderPath);
        return;
      }

      applyIncomingSelection(incomingPaths, incomingPrimaryPath);
    };

    window.addEventListener('umbra:gallery-selection-changed', onGallerySelectionChanged as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-selection-changed', onGallerySelectionChanged as EventListener);
    };
  }, [applyIncomingSelection, currentFolder, rootPath]);

  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    const pendingFolder = normalizePath(pending.folderPath || '');
    const activeFolder = normalizePath(currentFolder || rootPath);
    if (pendingFolder && activeFolder && pendingFolder !== activeFolder) return;
    if (pendingFolder && activeFolder && pendingFolder === activeFolder && displayedImages.length === 0) return;
    pendingSelectionRef.current = null;
    applyIncomingSelection(pending.paths, pending.primaryPath);
  }, [applyIncomingSelection, displayedImages, currentFolder, rootPath]);

  useEffect(() => {
    const externalSelection = externalSelectionRef.current;
    if (!externalSelection) return;
    const resolved = resolveIdsForSelectionPaths(externalSelection.paths, externalSelection.primaryPath);
    const currentIds = Array.from(selectedIds).map(normalizeId).sort();
    const nextIds = [...resolved.ids].map(normalizeId).sort();
    const idsChanged = currentIds.length !== nextIds.length
      || currentIds.some((id, index) => id !== nextIds[index]);
    const anchorChanged = normalizeId(lastSelectedId) !== normalizeId(resolved.anchorId);
    if (!idsChanged && !anchorChanged) return;
    suppressSelectionEmitRef.current = true;
    setSelectedIds(new Set(resolved.ids));
    setLastSelectedId(resolved.anchorId);
  }, [lastSelectedId, resolveIdsForSelectionPaths, selectedIds]);

  useEffect(() => {
    const onTrashUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ source?: string }>;
      const source = String(custom?.detail?.source || '').trim();
      if (
        source === 'filmstrip'
        || source === 'powerprompter-recent-output'
        || source === 'powerprompter-queue-output'
      ) return;
      refreshImages();
    };
    window.addEventListener('umbra:gallery-trash-updated', onTrashUpdated);
    return () => {
      window.removeEventListener('umbra:gallery-trash-updated', onTrashUpdated);
    };
  }, [refreshImages]);

  useEffect(() => {
    const onRemovePaths = (event: Event) => {
      const custom = event as CustomEvent<{ paths?: string[]; source?: string }>;
      const removedPaths = Array.isArray(custom?.detail?.paths)
        ? custom.detail.paths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];
      if (removedPaths.length <= 0) return;

      setFeedMode('remove');
      setImages((current) => {
        const next = current.filter((item) => !removedPaths.some((pathValue) => pathsLikelySame(item.path, pathValue)));
        if (next.length === current.length) return current;
        const folder = normalizePath(currentFolderRef.current || rootPath);
        feedSignatureRef.current = buildFilmstripFeedSignature(folder, next);
        const validIds = new Set(next.map((item) => item.id));
        setCustomOrder(next.map((item) => item.id));
        setSelectedIds((existing) => new Set(Array.from(existing).filter((id) => validIds.has(id))));
        setLastSelectedId((current) => (current && validIds.has(current) ? current : ''));
        return next;
      });
      setRecentGenerationOutputImages((current) =>
        current.filter((item) => !removedPaths.some((pathValue) => pathsLikelySame(item.path, pathValue)))
      );
    };

    window.addEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
    };
  }, [rootPath]);

  useEffect(() => {
    const onContentChanged = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string; source?: string; reason?: string }>;
      if (custom?.detail?.source === 'filmstrip') return;
      const reason = String(custom?.detail?.reason || '').trim().toLowerCase();
      if (reason === 'reorder' || reason === 'delete') return;
      const changedPath = normalizePath(custom?.detail?.path || custom?.detail?.folderPath || '');
      const activeFolder = normalizePath(currentFolder || rootPath);
      if (changedPath && activeFolder && changedPath !== activeFolder) return;
      refreshImages();
    };
    window.addEventListener('umbra:gallery-content-changed', onContentChanged as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-content-changed', onContentChanged as EventListener);
    };
  }, [currentFolder, refreshImages, rootPath]);

  useEffect(() => {
    const retryTimers: number[] = [];
    const forceRefreshBurst = () => {
      const now = Date.now();
      const burstCooldownMs = 2500;
      if (now - lastForceRefreshBurstAtRef.current < burstCooldownMs) return;
      lastForceRefreshBurstAtRef.current = now;
      refreshImages({ force: true });
      retryTimers.push(window.setTimeout(() => {
        refreshImages({ force: true });
      }, 1800));
    };

    const shouldRefreshForFolders = (folders: string[]) => {
      if (folders.length === 0) return true;
      const activeFolder = normalizePath(currentFolder || rootPath);
      return folders.some((folder) => pathsLikelyRelated(folder, activeFolder));
    };

    const onPowerPrompterOutputSaved = (event: Event) => {
      const detail = (event as CustomEvent<unknown>)?.detail;
      const folders = collectOutputSavedFolders(detail);
      rememberRecentFolders(folders);
      const savedImages = filmstripImagesFromSavedOutputs(detail);
      if (savedImages.length > 0) {
        setRecentGenerationOutputImages((current) => {
          const byPath = new Map<string, FilmstripImage>();
          for (const image of [...savedImages, ...current]) {
            const key = normalizePath(image.path).toLowerCase();
            if (key && !byPath.has(key)) byPath.set(key, image);
          }
          return Array.from(byPath.values()).slice(0, 40);
        });
      }
      setLiveGenerationPreviewImage(null);
      if (!shouldRefreshForFolders(folders)) return;
      forceRefreshBurst();
    };

    const onPowerPrompterGenerationPreview = (event: Event) => {
      const liveImage = filmstripImageFromGenerationPreview((event as CustomEvent<unknown>)?.detail);
      if (!liveImage) return;
      setLiveGenerationPreviewImage(liveImage);
    };

    const onGenerationComplete = (event: Event) => {
      const detail = ((event as CustomEvent<{ folderPaths?: unknown[] }>)?.detail || {});
      const folders = Array.isArray(detail.folderPaths)
        ? detail.folderPaths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];
      rememberRecentFolders(folders);
      if (!shouldRefreshForFolders(folders)) return;
      forceRefreshBurst();
    };

    const onWake = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      forceRefreshBurst();
    };

    const onVisibilityChange = () => {
      if (!document.visibilityState || document.visibilityState === 'visible') {
        forceRefreshBurst();
      }
    };

    window.addEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
    window.addEventListener('umbra:powerprompter-generation-preview', onPowerPrompterGenerationPreview as EventListener);
    window.addEventListener('umbra:gallery-generation-complete', onGenerationComplete as EventListener);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
      window.removeEventListener('umbra:powerprompter-generation-preview', onPowerPrompterGenerationPreview as EventListener);
      window.removeEventListener('umbra:gallery-generation-complete', onGenerationComplete as EventListener);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [currentFolder, refreshImages, rememberRecentFolders, rootPath]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const now = Date.now();
      const minInterval = activeWorkspace === 'library' ? 15000 : 30000;
      if (now - lastFeedRequestAtRef.current < minInterval) return;
      const folder = normalizePath(currentFolder || rootPath);
      if (!folder) return;
      refreshImages();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeWorkspace, currentFolder, refreshImages, rootPath]);

  useEffect(() => {
    if (suppressSelectionEmitRef.current) {
      suppressSelectionEmitRef.current = false;
      return;
    }
    if (externalSelectionRef.current) return;

    const normalizedSelectedIds = new Set(Array.from(selectedIds).map(normalizeId).filter(Boolean));
    const selectedPathList = selectableImages
      .filter((item) => normalizedSelectedIds.has(normalizeId(item.id)))
      .map((item) => normalizePath(item.path))
      .filter(Boolean);

    const primaryId = normalizeId(lastSelectedId);
    const primaryImage = selectableImages.find((item) => normalizeId(item.id) === primaryId)
      || selectableImages.find((item) => normalizedSelectedIds.has(normalizeId(item.id)))
      || null;
    const primaryPath = normalizePath(primaryImage?.path || '');
    const folderPath = normalizePath(currentFolder || rootPath);

    window.dispatchEvent(new CustomEvent('umbra:gallery-set-selection', {
      detail: {
        paths: selectedPathList,
        ...(primaryPath ? { primaryPath } : {}),
        ...(folderPath ? { folderPath } : {}),
        source: 'filmstrip',
      },
    }));
  }, [currentFolder, lastSelectedId, rootPath, selectableImages, selectedIds]);

  const openPathInGallery = useCallback((targetPath: string, source: string, restoreType?: 'file' | 'folder') => {
    const normalizedTargetPath = normalizePath(targetPath);
    if (!normalizedTargetPath) return;
    if (isLiveGenerationPreviewPath(normalizedTargetPath)) {
      window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', {
        detail: {
          imagePath: normalizedTargetPath,
          source,
        },
      }));
      return;
    }
    const treatAsFile = restoreType ? restoreType === 'file' : isLikelyFilePath(normalizedTargetPath);
    const folderPath = treatAsFile
      ? pathParent(normalizedTargetPath) || normalizedTargetPath
      : normalizedTargetPath;
    const imagePath = treatAsFile ? normalizedTargetPath : '';
    setCurrentFolder(folderPath);
    setActiveWorkspace('library');
    const detail = { path: folderPath, folderPath, ...(imagePath ? { imagePath } : {}), source };
    window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', { detail }));
  }, [setActiveWorkspace]);

  const onSelect = useCallback((id: string, event: React.MouseEvent) => {
    clearExternalSelection();
    const orderedIds = displayedImages.map((item) => item.id);
    const clickedIndex = orderedIds.indexOf(id);
    if (clickedIndex < 0) return;

    if (isTouchRemote && touchSelectionMode) {
      if (event.shiftKey && lastSelectedId) {
        const lastIndex = orderedIds.indexOf(lastSelectedId);
        if (lastIndex >= 0) {
          const from = Math.min(lastIndex, clickedIndex);
          const to = Math.max(lastIndex, clickedIndex);
          const range = orderedIds.slice(from, to + 1);
          setSelectedIds((current) => new Set([...Array.from(current), ...range]));
          setLastSelectedId(id);
          return;
        }
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
      return;
    }

    if (event.shiftKey && lastSelectedId) {
      const lastIndex = orderedIds.indexOf(lastSelectedId);
      if (lastIndex >= 0) {
        const from = Math.min(lastIndex, clickedIndex);
        const to = Math.max(lastIndex, clickedIndex);
        const range = orderedIds.slice(from, to + 1);
        setSelectedIds((current) => {
          if (event.ctrlKey || event.metaKey) return new Set([...Array.from(current), ...range]);
          return new Set(range);
        });
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
      return;
    }

    setSelectedIds(new Set([id]));
    setLastSelectedId(id);

    const viewerOpen = typeof document !== 'undefined'
      && Boolean(document.querySelector('[data-umbra-gallery-viewer]'));
    if (viewerOpen) {
      const imagePath = normalizePath(displayedImages[clickedIndex]?.path || '');
      if (imagePath && !isLiveGenerationPreviewPath(imagePath)) openPathInGallery(imagePath, 'filmstrip-open', 'file');
    }
  }, [clearExternalSelection, displayedImages, isTouchRemote, lastSelectedId, openPathInGallery, touchSelectionMode]);

  const notifyGalleryTrashUpdated = useCallback(() => {
    window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', { detail: { source: 'filmstrip' } }));
  }, []);

  const notifyGalleryRemovePaths = useCallback((paths: string[]) => {
    const normalized = Array.from(new Set(paths.map((entry) => normalizePath(entry)).filter(Boolean)));
    if (normalized.length === 0) return;
    window.dispatchEvent(new CustomEvent('umbra:gallery-remove-paths', {
      detail: {
        paths: normalized,
        source: 'filmstrip',
      },
    }));
  }, []);

  const notifyGalleryRestorePaths = useCallback((paths: string[]) => {
    const normalized = Array.from(new Set(paths.map((entry) => normalizePath(entry)).filter(Boolean)));
    if (normalized.length === 0) return;
    window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
      detail: {
        paths: normalized,
        source: 'filmstrip',
      },
    }));
  }, []);

  const addRestoredToast = useCallback((
    restoredPath: string,
    fallbackName?: string,
    restoredType?: 'file' | 'folder',
  ) => {
    const normalizedRestoredPath = normalizePath(restoredPath);
    if (!normalizedRestoredPath) return;
    const name = String(fallbackName || pathLeaf(normalizedRestoredPath) || 'item').trim();
    addToast({
      type: 'success',
      message: `Restored ${name}`,
      action: {
        label: 'View',
        onClick: () => {
          openPathInGallery(normalizedRestoredPath, 'filmstrip-restore-view', restoredType);
        },
      },
    });
  }, [addToast, openPathInGallery]);

  const addRestoredBatchToast = useCallback((
    restoredPaths: string[],
    fallbackCount: number,
    restoredType?: 'file' | 'folder',
  ) => {
    const normalizedPaths = Array.from(new Set(
      restoredPaths.map((entry) => normalizePath(entry)).filter(Boolean),
    ));
    const count = normalizedPaths.length || fallbackCount;
    if (count <= 0) return;
    if (count === 1 && normalizedPaths[0]) {
      addRestoredToast(normalizedPaths[0], undefined, restoredType);
      return;
    }
    const firstPath = normalizedPaths[0] || '';
    addToast({
      type: 'success',
      message: `Restored ${count} item${count === 1 ? '' : 's'}`,
      ...(firstPath
        ? {
          action: {
            label: 'View',
            onClick: () => {
              openPathInGallery(firstPath, 'filmstrip-restore-batch-view', restoredType);
            },
          },
        }
        : {}),
    });
  }, [addRestoredToast, addToast, openPathInGallery]);

  const onDelete = useCallback(async (ids: string[]) => {
    const selectedEntries = resolveSelectedImages(ids);
    const selectedPaths = selectedEntries.map((item) => item.path);
    if (selectedPaths.length === 0) return;
    const selectedPathSet = new Set(selectedPaths.map((entry) => normalizePath(entry)).filter(Boolean));
    const firstRemovedIndex = displayedImages.findIndex((item) => selectedPathSet.has(normalizePath(item.path)));
    const resolveNextSelectionAfterRemoval = (removedPathsInput: string[]): FilmstripImage | null => {
      const removed = removedPathsInput.map((entry) => normalizePath(entry)).filter(Boolean);
      if (removed.length === 0) return null;
      const nextImages = displayedImages.filter((item) =>
        !removed.some((removedPath) => pathsLikelySame(item.path, removedPath)));
      if (nextImages.length === 0) return null;
      const safeIndex = Math.max(0, Math.min(firstRemovedIndex >= 0 ? firstRemovedIndex : 0, nextImages.length - 1));
      return nextImages[safeIndex] || nextImages[nextImages.length - 1] || null;
    };
    const nameByPath = new Map<string, string>(
      selectedEntries.map((item) => [normalizePath(item.path), item.name || pathLeaf(item.path)]),
    );
    const applyOptimisticRemoval = (removePaths: string[]) => {
      const normalizedRemovePaths = Array.from(new Set(
        removePaths.map((entry) => normalizePath(entry)).filter(Boolean),
      ));
      if (normalizedRemovePaths.length === 0) return false;
      const removedIdSet = new Set(
        selectedEntries
          .filter((entry) => normalizedRemovePaths.some((pathValue) => pathsLikelySame(entry.path, pathValue)))
          .map((entry) => normalizeId(entry.id)),
      );
      const nextSelection = resolveNextSelectionAfterRemoval(normalizedRemovePaths);
      setFeedMode('remove');
      notifyGalleryRemovePaths(normalizedRemovePaths);
      setImages((current) =>
        current.filter((item) => !normalizedRemovePaths.some((pathValue) => pathsLikelySame(item.path, pathValue))));
      setCustomOrder((current) => current.filter((id) => !removedIdSet.has(normalizeId(id))));
      if (nextSelection) {
        setSelectedIds(new Set([nextSelection.id]));
        setLastSelectedId(nextSelection.id);
      } else {
        setSelectedIds(new Set());
        setLastSelectedId('');
      }
      return true;
    };
    const trashPaths = selectedPaths.filter((pathValue) => isTrashPath(pathValue));
    const deletePaths = selectedPaths.filter((pathValue) => !isTrashPath(pathValue));
    if (trashPaths.length === selectedPaths.length) {
      try {
        const response = await fetch('/api/trash/permanent-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paths: trashPaths,
          }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
        }
        addToast({
          type: 'success',
          message: `Deleted ${trashPaths.length} item${trashPaths.length === 1 ? '' : 's'} permanently`,
        });
        setSelectedIds(new Set());
        setLastSelectedId('');
        notifyGalleryTrashUpdated();
        void refreshImages({ force: true });
      } catch (error) {
        addToast({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to permanently delete from trash',
        });
      }
      return;
    }

    const didOptimisticRemove = deletePaths.length > 0
      ? applyOptimisticRemoval(deletePaths)
      : false;

    try {
      const failedItems: Array<{ path?: string; error?: string }> = [];
      const removeSignalPaths: string[] = [];
      const undoItems: Array<{ trashPath: string; originalPath: string; name: string }> = [];
      let movedToUmbraTrash = 0;
      let systemTrashed = 0;
      let permanentlyDeleted = 0;

      if (deletePaths.length > 0) {
        const deleteResult = await deletePathsWithSettings(deletePaths, appSettings);
        failedItems.push(...deleteResult.failed);
        const successfulPaths = Array.from(new Set(
          (deleteResult.deletedPaths.length > 0
            ? deleteResult.deletedPaths
            : deletePaths.filter((entry) => !deleteResult.failed.some((failed) => pathsLikelySame(failed.path, entry))))
            .map((entry) => normalizePath(entry))
            .filter(Boolean),
        ));
        if (successfulPaths.length === 0 && failedItems.length > 0) {
          throw new Error(String(failedItems[0]?.error || 'Failed to delete selection'));
        }
        removeSignalPaths.push(...successfulPaths);
        if (deleteResult.mode === 'umbra-trash') {
          movedToUmbraTrash += successfulPaths.length;
          undoItems.push(...deleteResult.trashItems
            .map((item) => {
              const trashPath = normalizePath(item?.trashPath || '');
              const originalPath = normalizePath(item?.originalPath || '');
              if (!trashPath) return null;
              return {
                trashPath,
                originalPath,
                name: String(
                  nameByPath.get(originalPath)
                  || pathLeaf(originalPath)
                  || pathLeaf(trashPath)
                  || 'item',
                ),
              };
            })
            .filter(Boolean) as Array<{ trashPath: string; originalPath: string; name: string }>);
        } else if (deleteResult.mode === 'system-trash') {
          systemTrashed += successfulPaths.length;
        } else {
          permanentlyDeleted += successfulPaths.length;
        }
      }

      if (trashPaths.length > 0) {
        const response = await fetch('/api/trash/permanent-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: trashPaths }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
        }
        removeSignalPaths.push(...trashPaths);
        permanentlyDeleted += trashPaths.length;
      }

      const dedupedRemoveSignalPaths = Array.from(new Set(
        removeSignalPaths
          .map((entry) => normalizePath(entry))
          .filter(Boolean),
      ));

      if (undoItems.length > 0) {
        const count = undoItems.length;
        addToast({
          type: 'success',
          message: count === 1 ? `Moved ${undoItems[0].name} to Trash` : `Moved ${count} items to Trash`,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const restoreResponse = await fetch('/api/trash/restore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    items: undoItems.map(({ trashPath, originalPath }) => ({
                      trashPath,
                      ...(originalPath ? { originalPath } : {}),
                    })),
                  }),
                });
                const restorePayload = await restoreResponse.json().catch(() => ({} as Record<string, unknown>));
                if (!restoreResponse.ok) {
                  throw new Error(String(restorePayload?.error || 'Failed to restore from trash'));
                }
                const restoredItems = Array.isArray((restorePayload as { restored?: unknown[] }).restored)
                  ? (restorePayload as {
                    restored?: Array<{ restoredPath?: string; originalPath?: string; type?: 'file' | 'folder' }>;
                  }).restored || []
                  : [];
                const restoredPaths = restoredItems
                  .map((entry, index) => resolveRestoredPath(entry, undoItems[index]?.originalPath))
                  .filter(Boolean);
                addRestoredBatchToast(restoredPaths, undoItems.length, restoredItems[0]?.type);
                if (restoredPaths.length > 0) notifyGalleryRestorePaths(restoredPaths);
                notifyGalleryTrashUpdated();
                void refreshImages({ force: true });
              } catch (error) {
                addToast({
                  type: 'error',
                  message: error instanceof Error ? error.message : 'Failed to restore from trash',
                });
              }
            },
          },
        });
      }

      if (failedItems.length > 0) {
        const firstError = String(failedItems[0]?.error || 'Failed to move item to Trash');
        addToast({
          type: 'error',
          message: failedItems.length > 1 ? `${firstError} (+${failedItems.length - 1} more)` : firstError,
        });
      }

      if ((movedToUmbraTrash > 0 && undoItems.length === 0) || systemTrashed > 0 || permanentlyDeleted > 0) {
        const messages: string[] = [];
        if (movedToUmbraTrash > 0 && undoItems.length === 0) messages.push(`Moved ${movedToUmbraTrash} to Umbra Trash`);
        if (systemTrashed > 0) messages.push(`Moved ${systemTrashed} to system trash`);
        if (permanentlyDeleted > 0) messages.push(`Deleted ${permanentlyDeleted} permanently`);
        addToast({ type: 'success', message: messages.join(', ') });
      }

      if (dedupedRemoveSignalPaths.length > 0) {
        if (!didOptimisticRemove) {
          applyOptimisticRemoval(dedupedRemoveSignalPaths);
        } else if (failedItems.length > 0) {
          void refreshImages({ force: true });
        }
      } else if (!didOptimisticRemove) {
        setSelectedIds(new Set());
        setLastSelectedId('');
      }
    } catch (error) {
      if (didOptimisticRemove) {
        void refreshImages({ force: true });
      }
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete items',
      });
    }
  }, [
    addRestoredBatchToast,
    addToast,
    appSettings,
    displayedImages,
    notifyGalleryRemovePaths,
    notifyGalleryRestorePaths,
    notifyGalleryTrashUpdated,
    refreshImages,
    resolveSelectedImages,
  ]);

  const onRestoreFromTrash = useCallback(async (ids: string[]) => {
    const selectedPaths = resolveSelectionPaths(ids).filter((pathValue) => isTrashPath(pathValue));
    if (selectedPaths.length === 0) return;

    try {
      const response = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedPaths.map((trashPath) => ({ trashPath })),
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to restore from trash'));
      }
      const restoredItems = Array.isArray((payload as { restored?: unknown[] }).restored)
        ? (payload as {
          restored?: Array<{ restoredPath?: string; originalPath?: string; type?: 'file' | 'folder' }>;
        }).restored || []
        : [];
      const count = restoredItems.length || selectedPaths.length;

      if (restoredItems.length === 1) {
        const restoredPath = resolveRestoredPath(restoredItems[0]);
        if (restoredPath) {
          addRestoredToast(restoredPath, undefined, restoredItems[0]?.type);
        } else {
          addToast({
            type: 'success',
            message: `Restored ${count} item${count === 1 ? '' : 's'}`,
          });
        }
      } else {
        const firstPath = resolveRestoredPath(restoredItems[0]);
        addToast({
          type: 'success',
          message: `Restored ${count} item${count === 1 ? '' : 's'}`,
          ...(firstPath
            ? {
              action: {
                label: 'View',
                onClick: () => {
                  openPathInGallery(firstPath, 'filmstrip-restore-batch-view', restoredItems[0]?.type);
                },
              },
            }
            : {}),
        });
      }
      const restoredPaths = restoredItems
        .map((entry) => resolveRestoredPath(entry))
        .filter(Boolean);
      if (restoredPaths.length > 0) {
        notifyGalleryRestorePaths(restoredPaths);
      }
      setSelectedIds(new Set());
      setLastSelectedId('');
      notifyGalleryTrashUpdated();
      void refreshImages({ force: true });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to restore from trash',
      });
    }
  }, [addRestoredToast, addToast, notifyGalleryRestorePaths, notifyGalleryTrashUpdated, openPathInGallery, refreshImages, resolveSelectionPaths]);

  const onDeleteForeverFromTrash = useCallback(async (ids: string[]) => {
    const selectedPaths = resolveSelectionPaths(ids).filter((pathValue) => isTrashPath(pathValue));
    if (selectedPaths.length === 0) return;

    try {
      const response = await fetch('/api/trash/permanent-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: selectedPaths,
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
      }
      addToast({
        type: 'success',
        message: `Deleted ${selectedPaths.length} item${selectedPaths.length === 1 ? '' : 's'} permanently`,
      });
      setSelectedIds(new Set());
      setLastSelectedId('');
      notifyGalleryTrashUpdated();
      void refreshImages({ force: true });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to permanently delete from trash',
      });
    }
  }, [addToast, notifyGalleryTrashUpdated, refreshImages, resolveSelectionPaths]);

  const onShowInExplorer = useCallback(async (ids: string[]) => {
    const targetPath = resolveSelectionPaths(ids).at(0) || '';
    if (!targetPath) return;
    try {
      const response = await fetch('/api/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to open in file explorer'));
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to open in file explorer',
      });
    }
  }, [addToast, resolveSelectionPaths]);

  const onCopyPaths = useCallback(async (ids: string[]) => {
    const paths = resolveSelectionPaths(ids);
    if (paths.length === 0) return;
    try {
      await navigator.clipboard.writeText(paths.join('\n'));
      addToast({
        type: 'success',
        message: paths.length === 1 ? 'Copied path' : `Copied ${paths.length} paths`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to copy paths',
      });
    }
  }, [addToast, resolveSelectionPaths]);

  const onCopyComfyJson = useCallback(async (ids: string[]) => {
    const paths = resolveSelectionPaths(ids);
    if (paths.length === 0) return;
    let lastErrorMessage = '';
    try {
      for (const pathValue of paths) {
        try {
          const response = await fetch('/api/metadata/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pathValue }),
          });
          const payload = await response.json().catch(() => ({} as Record<string, unknown>));
          if (!response.ok) {
            lastErrorMessage = String(payload?.error || 'Failed to read metadata');
            continue;
          }
          const exportPayload = getWorkflowJsonExport(payload as ImageMetadata);
          if (!exportPayload) continue;
          await navigator.clipboard.writeText(exportPayload.text);
          addToast({
            type: 'success',
            message: 'Copied workflow JSON',
          });
          return;
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : 'Failed to read metadata';
        }
      }

      addToast({
        type: 'error',
        message: paths.length === 1 && lastErrorMessage && !/writeText|Clipboard API|permissions policy/i.test(lastErrorMessage)
          ? lastErrorMessage
          : NO_COMFY_WORKFLOW_MESSAGE,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy ComfyUI JSON';
      addToast({
        type: 'error',
        message: /writeText|Clipboard API|permissions policy/i.test(message)
          ? NO_COMFY_WORKFLOW_MESSAGE
          : message,
      });
    }
  }, [addToast, resolveSelectionPaths]);

  const onSendToScanner = useCallback((ids: string[]) => {
    sendSelectionToWorkspace(resolveSelectionPaths(ids), 'scanner');
  }, [resolveSelectionPaths, sendSelectionToWorkspace]);

  const onOpenWaifuTab = useCallback(() => {
    useStore.getState().setUI('imageInspectorTab', 'waifu');
    setActiveWorkspace('imageinspector');
  }, [setActiveWorkspace]);

  const onSendToWaifu = useCallback((ids: string[]) => {
    sendSelectionToWorkspace(resolveSelectionPaths(ids, true), 'waifudiffusion');
  }, [resolveSelectionPaths, sendSelectionToWorkspace]);

  const onRename = useCallback(async (ids: string[]) => {
    const selection = resolveSelectedImages(ids);
    if (selection.length === 0) return;

    try {
      let renamed = 0;
      let failed = 0;
      const touchedFolderPaths = new Set<string>();

      if (selection.length === 1) {
        const single = selection[0];
        const currentName = pathLeaf(single.path) || single.name;
        const entered = window.prompt('Rename to:', currentName);
        if (entered == null) return;
        const nextName = String(entered || '').trim();
        if (!nextName) {
          addToast({ type: 'error', message: 'Name cannot be empty' });
          return;
        }
        const response = await fetch('/api/fs/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: single.path, name: nextName }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'Failed to rename item'));
        }
        renamed = 1;
        const nextPath = normalizePath(String((payload as { newPath?: unknown }).newPath || ''));
        const oldFolder = normalizePath(pathParent(single.path));
        const newFolder = normalizePath(pathParent(nextPath));
        if (oldFolder) touchedFolderPaths.add(oldFolder);
        if (newFolder) touchedFolderPaths.add(newFolder);
      } else {
        const templatePrompt = window.prompt(
          'Rename template (tokens: [original_filename], [index])',
          '[original_filename]',
        );
        if (templatePrompt == null) return;
        const template = String(templatePrompt || '').trim();
        if (!template) {
          addToast({ type: 'error', message: 'Template cannot be empty' });
          return;
        }

        const planned: Array<{ path: string; name: string }> = [];
        for (let index = 0; index < selection.length; index += 1) {
          const entry = selection[index];
          const currentName = pathLeaf(entry.path) || entry.name;
          const { base, extension } = splitFileName(currentName);
          const renderedBase = template
            .replaceAll('[original_filename]', base || currentName)
            .replaceAll('[index]', String(index + 1))
            .trim();
          const nextName = extension && !renderedBase.toLowerCase().endsWith(extension.toLowerCase())
            ? `${renderedBase}${extension}`
            : renderedBase;
          if (!nextName) {
            failed += 1;
            continue;
          }
          if (nextName === currentName) continue;
          planned.push({ path: entry.path, name: nextName });
        }

        if (planned.length > 0) {
          const response = await fetch('/api/fs/rename/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: planned.map((entry) => ({ path: entry.path, name: entry.name })),
            }),
          });
          const payload = await response.json().catch(() => ({} as Record<string, unknown>));
          if (!response.ok) {
            throw new Error(String(payload?.error || 'Failed to rename items'));
          }
          const reportedRenamed = Number((payload as { renamed?: unknown }).renamed);
          if (Number.isFinite(reportedRenamed) && reportedRenamed >= 0) {
            renamed += Math.trunc(reportedRenamed);
          } else {
            const results = Array.isArray((payload as { results?: unknown[] }).results)
              ? (payload as { results?: Array<{ success?: boolean }> }).results || []
              : [];
            renamed += results.filter((entry) => entry && entry.success).length;
          }
          const reportedFailed = Number((payload as { failed?: unknown }).failed);
          if (Number.isFinite(reportedFailed) && reportedFailed >= 0) {
            failed += Math.trunc(reportedFailed);
          } else {
            const results = Array.isArray((payload as { results?: unknown[] }).results)
              ? (payload as { results?: Array<{ success?: boolean }> }).results || []
              : [];
            failed += results.filter((entry) => entry && entry.success !== true).length;
          }
          const results = Array.isArray((payload as { results?: unknown[] }).results)
            ? (payload as { results?: Array<{ success?: boolean; path?: string; newPath?: string }> }).results || []
            : [];
          for (const entry of results) {
            if (!entry || entry.success !== true) continue;
            const oldFolder = normalizePath(pathParent(String(entry.path || '')));
            const newFolder = normalizePath(pathParent(String(entry.newPath || '')));
            if (oldFolder) touchedFolderPaths.add(oldFolder);
            if (newFolder) touchedFolderPaths.add(newFolder);
          }
        }
      }

      if (renamed > 0) {
        const folderPaths = Array.from(touchedFolderPaths);
        if (folderPaths.length > 0) {
          window.dispatchEvent(new CustomEvent('umbra:gallery-generation-complete', {
            detail: {
              source: 'filmstrip-rename',
              folderPaths,
            },
          }));
        }
        addToast({
          type: 'success',
          message: failed > 0
            ? `Renamed ${renamed} item${renamed === 1 ? '' : 's'} (${failed} failed)`
            : `Renamed ${renamed} item${renamed === 1 ? '' : 's'}`,
        });
        void refreshImages({ force: true });
      } else if (failed > 0) {
        addToast({
          type: 'error',
          message: 'No files were renamed',
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to rename items',
      });
    }
  }, [addToast, refreshImages, resolveSelectedImages]);

  const onAddTag = useCallback(async (ids: string[]) => {
    const paths = resolveSelectionPaths(ids);
    if (paths.length === 0) {
      addToast({
        type: 'error',
        message: 'No valid items selected for tag editing',
      });
      return;
    }

    setActiveWorkspace('library');
    window.dispatchEvent(new CustomEvent('umbra:gallery-open-tag-editor', {
      detail: { paths },
    }));
  }, [addToast, resolveSelectionPaths, setActiveWorkspace]);

  const onOpen = useCallback((image: FilmstripImage) => {
    const imagePath = normalizePath(image?.path || '');
    if (!imagePath) return;
    openPathInGallery(imagePath, 'filmstrip-open', 'file');
  }, [openPathInGallery]);

  const onReorderMany = useCallback((draggedIds: string[], overId: string, position: 'before' | 'after') => {
    const normalizedDraggedIds = Array.from(new Set(draggedIds.map((id) => normalizeId(id)).filter(Boolean)));
    const normalizedOverId = normalizeId(overId);
    if (!normalizedOverId) return;
    if (normalizedDraggedIds.length === 0) return;

    setSortField('custom');
    setCustomOrder((current) => {
      const source = current.length > 0
        ? [...current]
        : displayedImages.map((item) => item.id);
      const next = reorderIdsAsBlock(source, normalizedDraggedIds, normalizedOverId, position);
      if (arraysEqual(source, next)) return source;
      void persistCustomOrder(next);
      return next;
    });
  }, [displayedImages, persistCustomOrder]);

  const onReorder = useCallback((draggedId: string, overId: string, position: 'before' | 'after') => {
    const normalizedDraggedId = normalizeId(draggedId);
    if (!normalizedDraggedId) return;
    onReorderMany([normalizedDraggedId], overId, position);
  }, [onReorderMany]);

  const openFilmstripFolder = useCallback((folderPath: string, source: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setCurrentFolder(normalized);
    setSelectedIds(new Set());
    setLastSelectedId('');
    rememberRecentFolders([normalized]);
    window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', {
      detail: {
        path: normalized,
        folderPath: normalized,
        source,
      },
    }));
  }, [rememberRecentFolders]);

  const openPinnedFolder = useCallback((folderPath: string) => {
    openFilmstripFolder(folderPath, 'filmstrip-pinned-local');
  }, [openFilmstripFolder]);

  const openNewestFolder = useCallback((folderPath: string) => {
    openFilmstripFolder(folderPath, 'filmstrip-newest-local');
  }, [openFilmstripFolder]);

  const removePinnedFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const nextPinned = pinnedFolders.filter((entry) => normalizePath(entry) !== normalized);
    setAppSetting('library.pinnedFolders', nextPinned);
  }, [pinnedFolders, setAppSetting]);

  const readDraggedPaths = useCallback((transfer: DataTransfer | null): string[] => {
    if (!transfer) return [];
    try {
      const raw = transfer.getData(GALLERY_DRAG_PATHS_MIME);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => normalizePath(String(entry || ''))).filter(Boolean);
        }
      }
    } catch {
      // Fall back to legacy JSON payloads below.
    }
    try {
      const raw = transfer.getData('application/json');
      if (raw) {
        const payload = JSON.parse(raw) as { paths?: unknown };
        if (Array.isArray(payload.paths)) {
          return payload.paths
            .map((entry) => normalizePath(String(entry || '')))
            .filter(Boolean);
        }
      }
    } catch {
      // Fall back to newline-delimited text below.
    }
    try {
      return transfer.getData('text/plain')
        .split(/\r?\n/)
        .map((entry) => normalizePath(entry))
        .filter(Boolean);
    } catch {
      return [];
    }
  }, []);

  const onPinnedDrop = useCallback((event: DragEvent, destinationPath: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetPath('');

    const destination = normalizePath(destinationPath);
    if (!destination) return;

    const transferPaths = readDraggedPaths(event.dataTransfer)
      .filter((pathValue) => pathValue && pathValue !== destination);
    if (transferPaths.length === 0) return;

    const action = (event.ctrlKey || event.metaKey) ? 'copy' : 'move';
    window.dispatchEvent(new CustomEvent('umbra:gallery-transfer-request', {
      detail: {
        paths: transferPaths,
        destination,
        mode: action,
        source: 'filmstrip-pinned',
      },
    }));
  }, [readDraggedPaths]);

  const pinnedFolderItems = useMemo(() => (
    pinnedFolders.map((folderPath) => ({
      path: folderPath,
      label: pathLeaf(folderPath) || folderPath,
      isCurrent: normalizePath(folderPath) === normalizePath(currentFolder),
      isDropActive: normalizePath(folderPath) === dropTargetPath,
    }))
  ), [currentFolder, dropTargetPath, pinnedFolders]);
  const newestFolderItems = useMemo(() => {
    const pinned = new Set(pinnedFolders.map((folderPath) => normalizePath(folderPath).toLowerCase()));
    return recentFolders
      .filter((folderPath) => !pinned.has(normalizePath(folderPath).toLowerCase()))
      .map((folderPath) => ({
        path: folderPath,
        label: pathLeaf(folderPath) || folderPath,
        isCurrent: normalizePath(folderPath) === normalizePath(currentFolder),
      }));
  }, [currentFolder, pinnedFolders, recentFolders]);
  const recentGenerationPathSet = useMemo(() => new Set(
    recentGenerationLaneImages.map((image) => normalizePath(image.path).toLowerCase()).filter(Boolean)
  ), [recentGenerationLaneImages]);

  return (
    <>
      <Filmstrip
        images={displayedImages}
        recentGenerationImages={recentGenerationLaneImages}
        recentGenerationExpanded={recentGenerationsExpanded}
        onToggleRecentGenerationExpanded={() => setRecentGenerationsExpanded((current) => !current)}
        selectedIds={selectedIds}
        onSelect={onSelect}
        onClearSelection={() => {
          clearExternalSelection();
          setSelectedIds(new Set());
          setLastSelectedId('');
        }}
        selectionMode={isTouchRemote && touchSelectionMode}
        onEnterSelectionMode={() => setTouchSelectionMode(true)}
        onExitSelectionMode={() => setTouchSelectionMode(false)}
        onSelectAll={() => {
          clearExternalSelection();
          if (isTouchRemote && !touchSelectionMode) {
            setTouchSelectionMode(true);
            return;
          }
          setSelectedIds(new Set(displayedImages.map((item) => item.id)));
          setLastSelectedId(displayedImages.at(-1)?.id || '');
        }}
        onDelete={onDelete}
        onOpen={onOpen}
        onContextMenuRequest={({ x, y, targetId, ids, images: contextImages }) => {
          const resolvedImages = resolveSelectedImages(ids);
          const resolvedPaths = resolvedImages.map((image) => normalizePath(image.path)).filter(Boolean);
          const fallbackPaths = contextImages.map((image) => normalizePath(image.path)).filter(Boolean);
          const paths = resolvedPaths.length > 0 ? resolvedPaths : fallbackPaths;
          const targetPath = normalizePath(
            resolvedImages.find((image) => normalizeId(image.id) === normalizeId(targetId))?.path
            || contextImages.find((image) => normalizeId(image.id) === normalizeId(targetId))?.path
            || paths.at(-1)
            || ''
          );
          if (!targetPath) return;
          window.dispatchEvent(new CustomEvent('umbra:gallery-media-context-menu', {
            detail: {
              x,
              y,
              targetPath,
              paths: paths.length > 0 ? paths : [targetPath],
              reorderPaths: paths.length > 0 ? paths : [targetPath],
              source: recentGenerationPathSet.has(targetPath.toLowerCase())
                ? 'powerprompter-recent-output'
                : 'filmstrip',
            },
          }));
        }}
        onShowInExplorer={isUmbraRemoteClient() ? undefined : onShowInExplorer}
        onCopyPaths={onCopyPaths}
        onCopyComfyJson={onCopyComfyJson}
        onSendToScanner={onSendToScanner}
        onOpenWaifuTab={onOpenWaifuTab}
        onSendToWaifu={onSendToWaifu}
        onRename={onRename}
        onAddTag={onAddTag}
        onRestoreFromTrash={onRestoreFromTrash}
        onDeleteForeverFromTrash={onDeleteForeverFromTrash}
        onReorder={onReorder}
        onReorderMany={onReorderMany}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortField(field);
          setSortDirection(direction);
          const mappedSortBy = mapFilmstripSortFieldToGallery(field);
          if (!mappedSortBy) return;
          window.dispatchEvent(new CustomEvent('umbra:gallery-set-sort', {
            detail: {
              sortBy: mappedSortBy,
              sortOrder: direction,
              source: 'filmstrip',
            },
          }));
        }}
        minHeight={Math.max(minHeight, 120)}
        maxHeight={Math.max(maxHeight, minHeight + 120)}
        defaultHeight={Math.min(maxHeight, Math.max(minHeight, initialHeight))}
        displayMode="strip"
        fillContainer={false}
        className="z-40"
        activeWorkspace={activeWorkspace}
        metadataTooltipEnabled={metadataTooltipEnabled}
        onDataChanged={refreshImages}
        onHeightChange={onHeightChange}
        folderLabel={pathLeaf(currentFolder || rootPath) || 'No folder'}
        pinnedFolders={pinnedFolderItems}
        newestFolders={newestFolderItems}
        onOpenPinnedFolder={openPinnedFolder}
        onOpenNewestFolder={openNewestFolder}
        onRemovePinnedFolder={removePinnedFolder}
        onPinnedDrop={onPinnedDrop}
        onPinnedDropTargetChange={setDropTargetPath}
        onRefresh={refreshImages}
        expanded={false}
        onRequestMore={() => {
          window.dispatchEvent(new CustomEvent('umbra:gallery-load-more', {
            detail: { source: 'filmstrip' },
          }));
        }}
        changeHint={feedMode}
      />
    </>
  );
}

export default UmbraFilmstrip;

