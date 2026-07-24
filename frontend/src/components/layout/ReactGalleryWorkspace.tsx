'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  AlertTriangle,
  CheckSquare,
  Clapperboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  Folder,
  FolderOpen,
  Grid3X3,
  HardDrive,
  Image as ImageIcon,
  Images,
  Info,
  Loader2,
  MoreHorizontal,
  Paintbrush,
  RotateCcw,
  ScanSearch,
  Send,
  SkipForward,
  Pin,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Video,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';
import {
  GALLERY_DIRECT_BASE_URLS,
  fetchGalleryFs,
  galleryBridgeFsUrl,
  normalizeGalleryFsUrl,
  setGalleryDirectBaseUrl,
} from '@/lib/galleryBridgeFs';
import { galleryMediaCacheKey, galleryMediaRevision } from '@/lib/galleryMediaIdentity';
import { reconcileGalleryViewerNavigation } from '@/lib/galleryViewerNavigation';
import { extractGenerationParams, extractPrompts, getWorkflowJsonExport, type ImageMetadata } from '@/utils/metadata';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { BaseModal } from '@/components/modals/BaseModal';
import { deletePathsWithSettings } from '@/utils/trashActions';
import { POWER_PROMPTER_MAX_QUEUE_SETS } from '@/lib/powerPrompter';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { subscribeUiSession } from '@/lib/uiSessionSocket';
import { isDiagnosticLoggingEnabled, logDiagnostic } from '@/lib/diagnostics';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  stageUmbraUiMediaHandoff,
  type UmbraUiMediaHandoffMode,
  type UmbraUiVideoFrameRole,
} from '@/lib/umbraUiMediaHandoff';
import { stagePowerPrompterImageRestoreHandoff } from '@/lib/powerPrompterImageRestoreHandoff';
import type { Dataset } from '@/components/board/types';
import { resolveGalleryContextSelectionPaths } from './galleryContextSelection';

type GallerySortBy = 'created' | 'modified' | 'name' | 'custom';
type GallerySortOrder = 'asc' | 'desc';
type GallerySetSortRule = {
  sortBy: GallerySortBy;
  sortOrder: GallerySortOrder;
};

type GalleryUiSession = {
  currentFolder?: string;
  focusedFolder?: string;
  sortBy?: GallerySortBy;
  sortOrder?: GallerySortOrder;
  groupBySet?: boolean;
  mobileView?: 'folders' | 'media';
  mobileMediaView?: GalleryMobileMediaView;
  updatedAt?: number;
  clientId?: string;
};

type GalleryFolder = {
  name: string;
  path: string;
};

type GalleryFolderTreeNode = GalleryFolder & {
  relativePath?: string;
  hasChildren?: boolean;
  children?: GalleryFolderTreeNode[];
};

type GalleryFile = {
  uid?: string;
  id?: string;
  name: string;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  type?: 'image' | 'video' | 'gif' | 'folder';
  size?: number;
  createdMs?: number;
  modifiedMs?: number;
  customOrder?: number;
  width?: number;
  height?: number;
  metadataReady?: boolean;
  metadataFormat?: string | null;
  tags?: string[];
  originalPath?: string;
  expiresMs?: number;
  trashOriginalPath?: string;
  trashDeletedAt?: string;
  trashExpiresAt?: string;
};

type PowerPrompterGenerationPreviewEvent = {
  requestId?: string;
  promptIndex?: number;
  promptId?: string;
  imageDataUrl?: string;
  prompt?: string;
  negativePrompt?: string;
  status?: string;
  step?: number;
  maxStep?: number;
  updatedAt?: number;
};

type TrashMetadataItem = {
  id?: string;
  originalPath?: string;
  trashPath?: string;
  name?: string;
  type?: 'image' | 'video' | 'folder';
  size?: number;
  deletedAt?: string;
  expiresAt?: string;
};

type GallerySavedOutputFile = {
  path: string;
  name?: string;
  type?: string;
  modifiedMs?: number;
  size?: number;
  tags?: string[];
  metadata?: GalleryViewerMetadata;
};

const LIVE_GENERATION_PREVIEW_PATH = 'umbra-live-generation://powerprompter/current.png';

function isLiveGenerationPreviewPath(path: string | null | undefined): boolean {
  return normalizePath(path).startsWith('umbra-live-generation://');
}

function stripLiveGenerationPreviewPaths(paths: string[]): string[] {
  return uniqueNormalizedPaths(paths).filter((path) => !isLiveGenerationPreviewPath(path));
}

function galleryFileFromGenerationPreview(detail: unknown): GalleryFile | null {
  const payload = detail && typeof detail === 'object' ? detail as PowerPrompterGenerationPreviewEvent : {};
  const imageDataUrl = String(payload.imageDataUrl || '').trim();
  if (!imageDataUrl) return null;
  const updatedAt = Number(payload.updatedAt || Date.now());
  const step = Math.max(0, Math.trunc(Number(payload.step || 0)));
  const maxStep = Math.max(0, Math.trunc(Number(payload.maxStep || 0)));
  const status = String(payload.status || 'running').trim();
  const name = maxStep > 0
    ? `Live Generation Preview - Step ${step}/${maxStep}`
    : 'Live Generation Preview';
  return {
    id: LIVE_GENERATION_PREVIEW_PATH,
    uid: LIVE_GENERATION_PREVIEW_PATH,
    name,
    path: LIVE_GENERATION_PREVIEW_PATH,
    url: imageDataUrl,
    thumbnailUrl: imageDataUrl,
    type: 'image',
    createdMs: updatedAt,
    modifiedMs: updatedAt,
    metadataReady: true,
    metadataFormat: 'live-preview',
    tags: ['Live preview', status].filter(Boolean),
  };
}

function metadataFromGenerationPreview(detail: unknown): GalleryViewerMetadata | null {
  const payload = detail && typeof detail === 'object' ? detail as PowerPrompterGenerationPreviewEvent : {};
  const positivePrompt = String(payload.prompt || '').trim();
  const negativePrompt = String(payload.negativePrompt || '').trim();
  if (!positivePrompt && !negativePrompt) return null;
  return {
    type: 'image',
    format: 'comfyui',
    positive_prompt: positivePrompt,
    negative_prompt: negativePrompt,
    parsedPrompts: {
      positive: positivePrompt || undefined,
      negative: negativePrompt || undefined,
    },
  };
}

type GalleryViewerMetadata = ImageMetadata & {
  modified?: string;
};

type GalleryApiWorkflowOpenPayload = {
  workflow: unknown;
  workflowName: string;
  workflowId?: string;
};

function getGalleryApiWorkflowInfo(metadata: ImageMetadata | null | undefined): { workflowId: string; workflowName: string; hasApiWorkflow: boolean } | null {
  if (!metadata) return null;
  const powerMeta = metadata.umbra_power_prompter && typeof metadata.umbra_power_prompter === 'object'
    ? metadata.umbra_power_prompter
    : null;
  const workflowId = String(
    powerMeta?.apiWorkflowId
      || powerMeta?.apiWorkflowFileName
      || powerMeta?.workflowId
      || ''
  ).trim().replace(/\.json$/i, '');
  const workflowName = String(
    powerMeta?.apiWorkflowName
      || powerMeta?.apiWorkflowFileName
      || workflowId
      || 'API workflow'
  ).trim() || 'API workflow';
  const hasApiWorkflow = metadata.umbra_api_workflow !== undefined
    || metadata.prompt !== undefined
    || Boolean(workflowId);
  return hasApiWorkflow ? { workflowId, workflowName, hasApiWorkflow } : null;
}

async function resolveGalleryApiWorkflowOpenPayload(
  metadata: ImageMetadata,
  fallbackName = 'API workflow',
): Promise<GalleryApiWorkflowOpenPayload | null> {
  const apiInfo = getGalleryApiWorkflowInfo(metadata);
  if (!apiInfo) return null;
  if (apiInfo.workflowId) {
    const response = await fetch(`/api/powerprompter/api-workflows/open?id=${encodeURIComponent(apiInfo.workflowId)}`, {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.error || 'Failed to load API workflow.'));
    }
    return {
      workflow: payload?.document,
      workflowName: String(payload?.item?.name || apiInfo.workflowName || fallbackName),
      workflowId: apiInfo.workflowId,
    };
  }

  const workflow = metadata.workflow ?? metadata.umbra_api_workflow ?? metadata.prompt;
  if (!workflow || typeof workflow !== 'object') return null;
  return {
    workflow,
    workflowName: apiInfo.workflowName || fallbackName,
  };
}

function dispatchGalleryWorkflowOpen(payload: GalleryApiWorkflowOpenPayload) {
  try {
    window.sessionStorage.setItem('umbra.pendingComfyWorkflowLoad', JSON.stringify(payload));
  } catch {
    // The live event below still works when storage is unavailable.
  }
  const dispatchWorkflowLoad = () => {
    window.dispatchEvent(new CustomEvent('umbra:comfyui-load-workflow', { detail: payload }));
  };
  dispatchWorkflowLoad();
  window.setTimeout(dispatchWorkflowLoad, 500);
  window.setTimeout(dispatchWorkflowLoad, 1500);
}

type GalleryListPayload = {
  folders?: GalleryFolder[];
  files?: GalleryFile[];
  done?: boolean;
  nextCursor?: number | null;
  total?: number;
  sortBy?: GallerySortBy;
  sortOrder?: GallerySortOrder;
  mode?: 'replace' | 'append' | 'remove';
};

type GallerySearchPayload = {
  query?: string;
  folders?: GalleryFolder[];
  files?: GalleryFile[];
  scannedFolders?: number;
  done?: boolean;
  error?: string;
};

type GalleryMetadataSearchMatch = {
  uid?: string;
  path: string;
  name?: string;
  folderPath?: string;
  metadataFormat?: string | null;
  snippet?: string;
};

type GalleryMetadataSearchPayload = {
  query?: string;
  folderPath?: string;
  matches?: GalleryMetadataSearchMatch[];
  total?: number;
  error?: string;
};

type GallerySearchGroup = {
  folder: GalleryFolder;
  files: GalleryFile[];
};

type GallerySetGroup = {
  setId: number;
  label: string;
  color: string;
  files: GalleryFile[];
  rule: GallerySetSortRule;
};

type GallerySearchSuggestion = {
  type: 'tag' | 'folder';
  label: string;
  detail: string;
  value: string;
};

type GalleryTagSummaryItem = {
  tag: string;
  count: number;
};

type GalleryFolderPreviewGroup = {
  folder: GalleryFolder;
  files: GalleryFile[];
  loading: boolean;
  loadingMore?: boolean;
  depth?: 0 | 1 | 2;
  parentPath?: string;
  rootPath?: string;
  expansionLevel?: 0 | 1 | 2;
  visibleCount?: number;
  total: number;
  childFolderCount?: number;
  nextCursor?: number | null;
  done?: boolean;
  error?: string;
};

type GalleryFolderSummary = {
  path?: string;
  subfolderCount?: number;
  imageCount?: number;
  videoCount?: number;
  gifCount?: number;
  totalMediaCount?: number;
  firstMediaPath?: string | null;
  firstMediaType?: 'image' | 'gif' | 'video' | null;
};

type GalleryOptimisticRemovalSnapshot = {
  folder: string;
  files: GalleryFile[];
  knownFiles: GalleryFile[];
  activeViewerFiles: GalleryFile[];
  viewerSessionFiles: GalleryFile[];
  searchResults: GallerySearchPayload | null;
  folderPreviewGroups: GalleryFolderPreviewGroup[];
  selectedPaths: Set<string>;
  lastSelectedPath: string;
  viewerPath: string;
  viewerFileFallback: GalleryFile | null;
};

type GalleryTransferProgressState = {
  active: boolean;
  mode: 'move' | 'copy';
  destination: string;
  totalPaths: number;
  completedPaths: number;
  totalUnits: number;
  completedUnits: number;
  percent: number;
  currentPath: string;
  error?: string;
};

type GalleryPageCacheEntry = {
  payload: GalleryListPayload;
  cachedAt: number;
};

const DEFAULT_OUTPUT_ROOT = 'Tools/ComfyUI/output';
const TRASH_ROOT = 'User/Trash';
const TRASH_RETENTION_OPTIONS = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;
const PAGE_SIZE = 72;
const FOLDER_PREVIEW_PAGE_SIZE = 36;
const FOLDER_PREVIEW_EXPANDED_SIZE = FOLDER_PREVIEW_PAGE_SIZE * 2;
const FOLDER_PREVIEW_CONCURRENCY = 3;
const FOLDER_PREVIEW_MAX_DEPTH = 2;
const FOLDER_PREVIEW_MAX_GROUPS = 160;
const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';
const SELECT_ALL_PAGE_SIZE = 256;
const PAGE_CACHE_LIMIT = 18;
const PAGE_CACHE_TTL_MS = 90_000;
const PAGE_CACHE_KEY_SEPARATOR = '\u0001';
const TREE_CACHE_LIMIT = 220;
const TREE_FETCH_TIMEOUT_MS = 8_000;
const GRID_MIN_CARD_WIDTH = 216;
const GRID_CARD_EXTRA_HEIGHT = 72;
const PHONE_GRID_MIN_CARD_WIDTH = 104;
const PHONE_SINGLE_CARD_EXTRA_HEIGHT = 88;
const PHONE_GRID_CARD_EXTRA_HEIGHT = 0;
const GRID_GAP = 10;
const READY_THUMBNAIL_CACHE_LIMIT = 3000;
const THUMBNAIL_LOAD_CONCURRENCY = 8;
const OPENED_FOLDER_LIMIT = 10;
const VIEWER_METADATA_CACHE_TTL_MS = 5 * 60_000;
const VIEWER_METADATA_CACHE_LIMIT = 300;
const CURRENT_FOLDER_SUMMARY_POLL_MS = 5_000;
const CURRENT_FOLDER_RECONCILE_DEBOUNCE_MS = 180;
const CURRENT_FOLDER_RECONCILE_COOLDOWN_MS = 1_200;
const CURRENT_FOLDER_RECONCILE_MAX_LIMIT = 240;
const GALLERY_UI_SESSION_LOCAL_NAVIGATION_GUARD_MS = 30_000;
const RENAME_TEMPLATE_TOKENS = ['{original}', '{sequence}', '{yyyy}', '{mm}', '{dd}', '{hh}', '{min}'] as const;
const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
const SEARCH_CONTAINS_MIN_QUERY_LENGTH = 3;
const GLOBAL_SEARCH_DEBOUNCE_MS = 120;
const GLOBAL_SEARCH_PAGE_SIZE = 120;
const GLOBAL_SEARCH_MAX_FOLDERS = 100_000;
const SEARCH_SUGGESTION_MAX_ITEMS = 12;
const GALLERY_SET_COLOR_PALETTE = [
  '#22c55e',
  '#38bdf8',
  '#f59e0b',
  '#f43f5e',
  '#14b8a6',
  '#eab308',
  '#3b82f6',
  '#9ca3af',
  '#84cc16',
  '#a78bfa',
];
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const readyThumbnailCache = new Set<string>();
const viewerMetadataCache = new Map<string, { value: GalleryViewerMetadata; cachedAt: number }>();

class ThumbnailLoadScheduler {
  private readonly limit: number;
  private active = 0;
  private readonly queue: Array<{ key: string; high: boolean; grant: (release: () => void) => void }> = [];
  private readonly queuedKeys = new Set<string>();

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  acquire(key: string, grant: (release: () => void) => void, options?: { high?: boolean }): () => void {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return () => undefined;
    if (this.queuedKeys.has(normalizedKey)) return () => undefined;
    const item = { key: normalizedKey, high: options?.high === true, grant };
    this.queuedKeys.add(normalizedKey);
    if (item.high) {
      const insertAt = this.queue.findIndex((entry) => !entry.high);
      if (insertAt === -1) this.queue.push(item);
      else this.queue.splice(insertAt, 0, item);
    } else {
      this.queue.push(item);
    }
    this.pump();
    return () => {
      this.queuedKeys.delete(normalizedKey);
      const index = this.queue.findIndex((entry) => entry.key === normalizedKey);
      if (index >= 0) this.queue.splice(index, 1);
    };
  }

  private pump() {
    while (this.active < this.limit && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;
      if (!this.queuedKeys.delete(item.key)) continue;
      this.active += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.pump();
      };
      item.grant(release);
    }
  }
}

const thumbnailLoadScheduler = new ThumbnailLoadScheduler(THUMBNAIL_LOAD_CONCURRENCY);

type GalleryRootKind = 'output' | 'external' | 'trash';

type GalleryRootChoice = {
  label: string;
  path: string;
  kind: GalleryRootKind;
};

type GalleryContextMenuState = {
  kind: 'media' | 'folder' | 'transfer';
  x: number;
  y: number;
  targetPath: string;
  paths?: string[];
  reorderPaths?: string[];
};

type GalleryDatasetPickerState = {
  x: number;
  y: number;
  paths: string[];
};

type GalleryContextMenuEvent = Pick<React.MouseEvent, 'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'>;
type GalleryLongPressPoint = {
  clientX: number;
  clientY: number;
};

type GalleryRenameModalState = {
  paths: string[];
  template: string;
  submitting: boolean;
};

type GalleryTagModalState = {
  paths: string[];
  tags: string[];
  input: string;
  submitting: boolean;
};

type GalleryFolderNameModalState = {
  mode: 'create' | 'rename';
  parentPath: string;
  folderPath: string;
  value: string;
  submitting: boolean;
};

type GalleryDeleteWarningFolder = {
  path: string;
  name: string;
  mediaCount?: number;
  subfolderCount?: number;
};

type GalleryDeleteWarningModalState = {
  paths: string[];
  folders: GalleryDeleteWarningFolder[];
  mediaCount: number;
  keepSelection: boolean;
};

type GalleryEmptyFolderCleanupModalState = {
  rootPath: string;
  folders: string[];
  submitting: boolean;
};

type GalleryMobileMediaView = 'single' | 'grid';

type GalleryRenamePreviewItem = {
  path: string;
  currentName: string;
  nextName: string;
};

type GalleryTrashUndoItem = {
  trashPath: string;
  originalPath: string;
  name: string;
};

function normalizePath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function isMissingGalleryFolderMessage(value: unknown): boolean {
  const message = String(value || '').toLowerCase();
  return message.includes('enoent')
    || message.includes('enotdir')
    || message.includes('no such file or directory')
    || message.includes('path does not exist');
}

function createGalleryUiSessionClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `gallery-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function selectionPathKey(value: unknown): string {
  return normalizePath(value).toLowerCase();
}

function pathLeaf(value: unknown): string {
  const normalized = normalizePath(value);
  if (!normalized) return '';
  return normalized.split('/').pop() || normalized;
}

function pathParent(value: unknown): string {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalizePath(normalized.slice(0, index)) : '';
}

function splitFileName(value: unknown): { base: string; extension: string } {
  const name = pathLeaf(value);
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return { base: name, extension: '' };
  return { base: name.slice(0, index), extension: name.slice(index) };
}

function isLikelyFilePath(value: unknown): boolean {
  const leaf = pathLeaf(value);
  return Boolean(leaf) && leaf.includes('.');
}

function pathsEqual(left: unknown, right: unknown): boolean {
  return normalizePath(left).toLowerCase() === normalizePath(right).toLowerCase();
}

function pathIsInsideRoot(pathValue: unknown, rootValue: unknown): boolean {
  const path = normalizePath(pathValue).toLowerCase();
  const root = normalizePath(rootValue).toLowerCase();
  return Boolean(path && root) && (path === root || path.startsWith(`${root}/`));
}

function getValidTransferPathsForDestination(paths: string[], destinationPath: string): string[] {
  const destination = normalizePath(destinationPath);
  if (!destination || isTrashPath(destination)) return [];
  return uniqueNormalizedPaths(paths).filter((pathValue) => {
    const path = normalizePath(pathValue);
    if (!path || isTrashPath(path)) return false;
    if (pathsEqual(path, destination)) return false;
    if (pathsEqual(pathParent(path), destination)) return false;
    if (destination.toLowerCase().startsWith(`${path.toLowerCase()}/`)) return false;
    return true;
  });
}

function readDragTransferPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  try {
    const raw = dataTransfer.getData(GALLERY_DRAG_PATHS_MIME) || dataTransfer.getData('text/plain');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return uniqueNormalizedPaths(parsed.map(normalizePath));
  } catch {
    // Fall back to newline-delimited text below.
  }
  try {
    const rawJson = dataTransfer.getData('application/json');
    if (rawJson) {
      const payload = JSON.parse(rawJson) as { paths?: unknown };
      if (Array.isArray(payload.paths)) return uniqueNormalizedPaths(payload.paths.map(normalizePath));
    }
  } catch {
    // Fall back to newline-delimited text below.
  }
  try {
    const text = dataTransfer.getData('text/plain');
    return uniqueNormalizedPaths(text.split(/\r?\n/).map(normalizePath));
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTrashPath(pathValue: unknown): boolean {
  const normalized = normalizePath(pathValue);
  return normalized === TRASH_ROOT || normalized.startsWith(`${TRASH_ROOT}/`);
}

function isTrashRootPath(pathValue: unknown): boolean {
  return normalizePath(pathValue) === TRASH_ROOT;
}

function resolveRestoredPath(entry: unknown, fallbackPath?: string): string {
  const payload = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
  return normalizePath(String(
    payload?.restoredPath
    || payload?.originalPath
    || payload?.path
    || fallbackPath
    || '',
  ));
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName?.toUpperCase();
  return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function folderPathChain(pathValue: unknown, rootValue: unknown): string[] {
  const path = normalizePath(pathValue);
  const root = normalizePath(rootValue);
  if (!path || !root || !pathIsInsideRoot(path, root)) return root ? [root] : [];
  const chain: string[] = [];
  let cursor = path;
  while (cursor && !pathsEqual(cursor, root)) {
    chain.unshift(cursor);
    cursor = pathParent(cursor);
  }
  return [root, ...chain];
}

function galleryFoldersToTreeNodes(folders: GalleryFolder[]): GalleryFolderTreeNode[] {
  return folders.map((folder) => ({
    name: folder.name,
    path: normalizePath(folder.path),
    relativePath: normalizePath(folder.path),
    hasChildren: true,
  }));
}

function galleryPageCacheKey(
  folderPath: string,
  cursor: number,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
): string {
  return [
    normalizePath(folderPath).toLowerCase(),
    Math.max(0, Math.trunc(Number(cursor || 0))),
    PAGE_SIZE,
    sortBy,
    sortOrder,
  ].join(PAGE_CACHE_KEY_SEPARATOR);
}

function galleryFolderPreviewCacheKey(
  folderPath: string,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
): string {
  return [
    normalizePath(folderPath).toLowerCase(),
    FOLDER_PREVIEW_PAGE_SIZE,
    sortBy,
    sortOrder,
  ].join(PAGE_CACHE_KEY_SEPARATOR);
}

function cloneGalleryListPayload(payload: GalleryListPayload): GalleryListPayload {
  return {
    ...payload,
    folders: Array.isArray(payload.folders) ? [...payload.folders] : [],
    files: Array.isArray(payload.files) ? [...payload.files] : [],
  };
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { name?: unknown; message?: unknown };
  return record.name === 'AbortError' || String(record.message || '').toLowerCase().includes('abort');
}

function uniqueNormalizedPaths(values: unknown[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizePath(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next;
}

function normalizeTag(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
    .slice(0, 48);
}

function normalizeTags(values: unknown): string[] {
  const rawValues = Array.isArray(values)
    ? values
    : String(values || '').split(',');
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of rawValues) {
    const tag = normalizeTag(value);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 32) break;
  }
  return tags;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const safe = String(hexColor || '').replace('#', '').trim();
  if (safe.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const imageAccentColorCache = new Map<string, string>();
const IMAGE_ACCENT_COLOR_CACHE_LIMIT = 800;

function rgbaToCss(r: number, g: number, b: number, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function rememberImageAccentColor(key: string, color: string) {
  if (!key || !color) return;
  if (imageAccentColorCache.has(key)) imageAccentColorCache.delete(key);
  imageAccentColorCache.set(key, color);
  while (imageAccentColorCache.size > IMAGE_ACCENT_COLOR_CACHE_LIMIT) {
    const oldest = imageAccentColorCache.keys().next().value;
    if (!oldest) break;
    imageAccentColorCache.delete(oldest);
  }
}

function sampleImageAccentColor(image: HTMLImageElement): string {
  try {
    const width = Math.max(1, Math.min(24, image.naturalWidth || image.width || 1));
    const height = Math.max(1, Math.min(24, image.naturalHeight || image.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    let weightTotal = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha < 0.4) continue;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (luminance < 0.08 || luminance > 0.92) continue;
      const weight = alpha * (0.45 + saturation * 1.2) * (1 - Math.abs(luminance - 0.55) * 0.45);
      rTotal += r * weight;
      gTotal += g * weight;
      bTotal += b * weight;
      weightTotal += weight;
    }
    if (weightTotal <= 0) return '';
    return `${Math.round(rTotal / weightTotal)}, ${Math.round(gTotal / weightTotal)}, ${Math.round(bTotal / weightTotal)}`;
  } catch {
    return '';
  }
}

function getGallerySetColor(setId: number): string {
  const idx = Math.max(0, Math.floor(Number(setId || 1)) - 1) % GALLERY_SET_COLOR_PALETTE.length;
  return GALLERY_SET_COLOR_PALETTE[idx];
}

function gallerySetTag(setId: number): string {
  return normalizeTag(`set ${Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number(setId || 1))))}`);
}

function parseGallerySetTag(tagValue: unknown): number | null {
  const normalized = normalizeTag(tagValue);
  const match = normalized.match(/^set[\s_-]*(\d+)$/i);
  if (!match) return null;
  const setId = Math.floor(Number(match[1]));
  if (!Number.isFinite(setId) || setId < 1 || setId > POWER_PROMPTER_MAX_QUEUE_SETS) return null;
  return setId;
}

function stripGallerySetTags(tags: string[]): string[] {
  return normalizeTags(tags).filter((tag) => parseGallerySetTag(tag) === null);
}

function getGallerySetIdsForFile(file: GalleryFile): number[] {
  const setIds = normalizeTags(file.tags)
    .map(parseGallerySetTag)
    .filter((setId): setId is number => typeof setId === 'number');
  return Array.from(new Set(setIds)).sort((left, right) => left - right);
}

function galleryMediaTypeFromPath(pathValue: unknown, explicitType?: unknown): 'image' | 'video' | 'gif' {
  const normalizedType = String(explicitType || '').trim().toLowerCase();
  if (normalizedType === 'video') return 'video';
  if (normalizedType === 'gif') return 'gif';
  const lowerPath = normalizePath(pathValue).toLowerCase();
  if (lowerPath.endsWith('.gif')) return 'gif';
  if (/\.(mp4|webm|mkv|mov|avi|m4v)$/.test(lowerPath)) return 'video';
  return 'image';
}

function galleryFileTypeFromPath(pathValue: unknown, explicitType?: unknown): GalleryFile['type'] {
  const normalizedType = String(explicitType || '').trim().toLowerCase();
  if (normalizedType === 'folder') return 'folder';
  return galleryMediaTypeFromPath(pathValue, explicitType);
}

function parseIsoMs(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimeRemaining(ms: number): string {
  if (!Number.isFinite(ms)) return 'Unknown';
  if (ms <= 0) return 'Expired';
  if (ms < MS_PER_HOUR) return `${Math.max(1, Math.ceil(ms / (60 * 1000)))}m left`;
  if (ms < MS_PER_DAY) return `${Math.max(1, Math.ceil(ms / MS_PER_HOUR))}h left`;
  return `${Math.max(1, Math.ceil(ms / MS_PER_DAY))}d left`;
}

function clampTrashRetentionDays(value: unknown): number {
  const parsed = Math.floor(Number(value || 30));
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(3650, Math.max(1, parsed));
}

function getTrashExpiresMs(file: GalleryFile): number {
  const direct = Number(file.expiresMs || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromString = parseIsoMs(file.trashExpiresAt);
  if (fromString > 0) return fromString;
  const modified = Number(file.modifiedMs || 0);
  return Number.isFinite(modified) && modified > 0 ? modified : 0;
}

function getTrashGroupForFile(file: GalleryFile, now = Date.now()): { id: string; order: number; label: string } {
  const expiresMs = getTrashExpiresMs(file);
  if (!Number.isFinite(expiresMs) || expiresMs <= 0) return { id: 'unknown', order: 99999, label: 'No expiry info' };
  const remaining = expiresMs - now;
  if (remaining <= 0) return { id: 'expired', order: 0, label: 'Expired' };
  if (remaining < MS_PER_HOUR) return { id: 'lt1h', order: 1, label: 'Expires in < 1 hour' };
  if (remaining < MS_PER_DAY) return { id: 'lt24h', order: 2, label: 'Expires in < 24 hours' };
  const daysLeft = Math.max(1, Math.ceil(remaining / MS_PER_DAY));
  return { id: `days-${daysLeft}`, order: 2 + daysLeft, label: daysLeft === 1 ? 'Expires in 1 day' : `Expires in ${daysLeft} days` };
}

function toTrashGalleryFile(entry: TrashMetadataItem, index: number): GalleryFile | null {
  const trashPath = normalizePath(entry?.trashPath);
  const originalPath = normalizePath(entry?.originalPath);
  const id = String(entry?.id || trashPath || '').trim();
  const name = String(entry?.name || pathLeaf(originalPath) || pathLeaf(trashPath) || '').trim();
  if (!trashPath || !id || !name) return null;
  const type = galleryFileTypeFromPath(trashPath, entry?.type);
  const deletedMs = parseIsoMs(entry?.deletedAt);
  const expiresMs = parseIsoMs(entry?.expiresAt);
  return {
    uid: id,
    id,
    path: trashPath,
    originalPath,
    trashOriginalPath: originalPath,
    name,
    type,
    size: Number(entry?.size || 0),
    createdMs: deletedMs,
    modifiedMs: expiresMs || deletedMs,
    expiresMs: expiresMs || deletedMs,
    customOrder: index,
    metadataReady: false,
    metadataFormat: null,
    tags: [],
    trashDeletedAt: String(entry?.deletedAt || ''),
    trashExpiresAt: String(entry?.expiresAt || ''),
  };
}

function normalizeGalleryFile(file: GalleryFile, index = 0): GalleryFile {
  const path = normalizePath(file.path);
  const deletedMs = parseIsoMs(file.trashDeletedAt);
  const expiresMs = parseIsoMs(file.trashExpiresAt);
  const createdRaw = Number(file.createdMs ?? (file as any).created ?? 0);
  const modifiedRaw = Number(file.modifiedMs ?? (file as any).modified ?? 0);
  return {
    ...file,
    id: String(file.id || file.uid || path || '').trim(),
    uid: String(file.uid || file.id || path || '').trim(),
    name: String(file.name || pathLeaf(path) || 'item'),
    path,
    type: galleryFileTypeFromPath(path, file.type),
    createdMs: deletedMs || (Number.isFinite(createdRaw) ? createdRaw : 0),
    modifiedMs: expiresMs || deletedMs || (Number.isFinite(modifiedRaw) ? modifiedRaw : 0),
    expiresMs: Number(file.expiresMs || 0) || expiresMs || 0,
    customOrder: Number.isFinite(Number(file.customOrder)) ? Number(file.customOrder) : index,
    originalPath: normalizePath(file.originalPath || file.trashOriginalPath),
    trashOriginalPath: normalizePath(file.trashOriginalPath || file.originalPath),
    tags: normalizeTags(file.tags),
  };
}

function collectSavedOutputFiles(detail: unknown): GallerySavedOutputFile[] {
  const payload = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  const payloadTags = normalizeTags(payload.tags);
  const seen = new Set<string>();
  const files: GallerySavedOutputFile[] = [];

  for (const output of outputs) {
    const item = output && typeof output === 'object' ? output as Record<string, unknown> : {};
    const path = normalizePath(String(item.fullpath || item.fullPath || item.path || ''));
    const key = path.toLowerCase();
    if (!path || seen.has(key)) continue;
    seen.add(key);
    const name = String(item.filename || item.name || pathLeaf(path) || '').trim();
    const type = String(item.type || '').trim();
    const modified = Number(item.modified ?? item.modifiedMs ?? Date.now());
    const size = Number(item.size ?? 0);
    const workflow = item.workflow ?? item.workflowJson ?? payload.workflow ?? payload.workflowJson;
    const prompt = item.prompt ?? item.promptGraph ?? payload.prompt ?? payload.promptGraph;
    const umbraApiWorkflow = item.umbra_api_workflow ?? item.apiWorkflow ?? payload.umbra_api_workflow ?? payload.apiWorkflow;
    const umbraPowerPrompter = item.umbra_power_prompter ?? payload.umbra_power_prompter;
    const sourceFile = item.source_file ?? item.sourceFile ?? payload.source_file ?? payload.sourceFile;
    const hasMetadata = workflow !== undefined
      || prompt !== undefined
      || umbraApiWorkflow !== undefined
      || umbraPowerPrompter !== undefined
      || sourceFile !== undefined;
    const mediaType = galleryMediaTypeFromPath(path, type);
    const metadata = hasMetadata
      ? {
          type: mediaType === 'video' ? 'video' : 'image',
          name: name || pathLeaf(path) || undefined,
          ...(Number.isFinite(size) && size > 0 ? { size } : {}),
          format: 'comfyui',
          ...(workflow !== undefined ? { workflow } : {}),
          ...(prompt !== undefined ? { prompt } : {}),
          ...(umbraApiWorkflow !== undefined ? { umbra_api_workflow: umbraApiWorkflow } : {}),
          ...(umbraPowerPrompter !== undefined && typeof umbraPowerPrompter === 'object' && !Array.isArray(umbraPowerPrompter)
            ? { umbra_power_prompter: umbraPowerPrompter as Record<string, unknown> }
            : {}),
          ...(sourceFile !== undefined ? { source_file: String(sourceFile || '') } : {}),
        } satisfies GalleryViewerMetadata
      : undefined;
    const tags = normalizeTags([
      ...payloadTags,
      ...(Array.isArray(item.tags) ? item.tags : []),
      item.promptSetLabel,
    ]);
    files.push({
      path,
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(Number.isFinite(modified) ? { modifiedMs: modified } : {}),
      ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(metadata ? { metadata } : {}),
    });
  }

  return files;
}

function revisionFor(file: GalleryFile): string {
  return galleryMediaRevision(file);
}

function revisionParamFor(file: GalleryFile): string | undefined {
  return revisionFor(file) || undefined;
}

function markThumbnailReady(key: string) {
  if (!key) return;
  if (readyThumbnailCache.has(key)) readyThumbnailCache.delete(key);
  readyThumbnailCache.add(key);
  while (readyThumbnailCache.size > READY_THUMBNAIL_CACHE_LIMIT) {
    const oldest = readyThumbnailCache.values().next().value;
    if (!oldest) break;
    readyThumbnailCache.delete(oldest);
  }
}

function appendUrlParams(rawUrl: string, params: Record<string, string | number | boolean | undefined>): string {
  const hashIndex = rawUrl.indexOf('#');
  const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
  const [base, rawSearch = ''] = withoutHash.split('?');
  const search = new URLSearchParams(rawSearch);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    search.set(key, value === true ? '1' : String(value));
  }
  const query = search.toString();
  return `${base}${query ? `?${query}` : ''}${hash}`;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function shouldTraceGalleryLoad(): boolean {
  try {
    window.localStorage.removeItem('umbra.galleryLoadTrace');
  } catch {
    // Legacy cleanup only.
  }
  return isDiagnosticLoggingEnabled();
}

function traceGalleryLoad(payload: Record<string, unknown>) {
  const durationMs = Math.round(Number(payload.durationMs || 0) * 10) / 10;
  if (!shouldTraceGalleryLoad() && durationMs < 250) return;
  try {
    const level = durationMs >= 1000 || payload.event === 'replace_error' || payload.event === 'append_error'
      ? 'warn'
      : 'debug';
    logDiagnostic('[Umbra Gallery Load]', {
      ...payload,
      durationMs,
    }, level);
  } catch {
    // Best-effort diagnostics only.
  }
}

function isRemoteGalleryClient(): boolean {
  return isUmbraRemoteClient();
}

function thumbnailUrl(file: GalleryFile, options?: { defer?: boolean; retry?: number; lane?: 'gallery' | 'filmstrip' }): string {
  const path = normalizePath(file.path);
  if (file.type === 'folder') return '';
  if (isLiveGenerationPreviewPath(path)) return String(file.thumbnailUrl || file.url || '').trim();
  const remoteClient = isRemoteGalleryClient();
  const thumbSize = 'small';
  const thumbQuality = remoteClient ? '64' : '70';
  if (isTrashPath(path)) {
    return appendUrlParams(`/api/fs/thumbnail?path=${encodeURIComponent(path)}&size=${thumbSize}&q=${thumbQuality}&fit=contain`, {
      defer: options?.defer ? '1' : undefined,
      rev: revisionParamFor(file),
      retry: options?.retry && options.retry > 0 ? options.retry : undefined,
    });
  }
  const baseUrl = normalizeGalleryFsUrl(
    file.thumbnailUrl || galleryBridgeFsUrl('/thumbnail', new URLSearchParams({
      path,
      size: thumbSize,
      q: thumbQuality,
      fit: 'contain',
      rev: revisionFor(file),
      lane: options?.lane || 'gallery',
    })),
  );
  const versionedUrl = appendUrlParams(baseUrl, {
    defer: options?.defer ? '1' : undefined,
    fit: 'contain',
    rev: revisionParamFor(file),
    lane: options?.lane || undefined,
  });
  return appendUrlParams(versionedUrl, {
    retry: options?.retry && options.retry > 0 ? options.retry : undefined,
  });
}

function imageUrl(file: GalleryFile, options?: { lane?: 'gallery' | 'filmstrip'; remoteOriginals?: boolean }): string {
  const path = normalizePath(file.path);
  if (isLiveGenerationPreviewPath(path)) return String(file.url || file.thumbnailUrl || '').trim();
  const useRemoteViewerWebp = options?.lane === 'gallery'
    && !options?.remoteOriginals
    && isRemoteGalleryClient()
    && file.type === 'image';
  const viewerWebpParams = useRemoteViewerWebp
    ? {
      preview: 'viewer-webp',
      gpm: '1536',
      gpq: '78',
    }
    : {};
  if (isTrashPath(path)) {
    return appendUrlParams(`/api/fs/image?path=${encodeURIComponent(path)}`, {
      ...viewerWebpParams,
      rev: revisionParamFor(file),
    });
  }
  const baseUrl = normalizeGalleryFsUrl(
    file.url || galleryBridgeFsUrl('/image', new URLSearchParams({
      path,
      rev: revisionFor(file),
      lane: options?.lane || 'gallery',
    })),
  );
  return appendUrlParams(baseUrl, {
    ...viewerWebpParams,
    rev: revisionParamFor(file),
    lane: options?.lane || undefined,
  });
}

function fileId(file: GalleryFile): string {
  return String(file.uid || file.id || file.path || file.name || '').trim();
}

function galleryFileForFilmstrip(file: GalleryFile): GalleryFile {
  return {
    ...file,
    id: fileId(file),
    uid: file.uid || fileId(file),
    url: imageUrl(file, { lane: 'filmstrip' }),
    thumbnailUrl: thumbnailUrl(file, { defer: true, lane: 'filmstrip' }),
  };
}

function uniqueGalleryMediaFiles(files: GalleryFile[]): GalleryFile[] {
  const seen = new Set<string>();
  const next: GalleryFile[] = [];
  for (const file of files) {
    const path = normalizePath(file?.path);
    if (!path || file?.type === 'folder') continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      ...file,
      path,
      type: galleryMediaTypeFromPath(path, file.type),
    });
  }
  return next;
}

function formatCount(total: number, loaded: number): string {
  if (total > 0) return `${loaded}/${total}`;
  return String(loaded);
}

function formatBytes(value: unknown): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(value: unknown): string {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

function sanitizeRenameFileName(value: unknown): string {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderRenameTemplate(templateValue: string, originalBase: string, index: number, total: number, now = new Date()): string {
  const template = String(templateValue || '').trim();
  const sequence = String(index + 1).padStart(Math.max(2, String(Math.max(1, total)).length), '0');
  const values: Record<string, string> = {
    original: originalBase,
    filename: originalBase,
    original_filename: originalBase,
    sequence,
    index: sequence,
    yyyy: String(now.getFullYear()),
    mm: String(now.getMonth() + 1).padStart(2, '0'),
    dd: String(now.getDate()).padStart(2, '0'),
    hh: String(now.getHours()).padStart(2, '0'),
    min: String(now.getMinutes()).padStart(2, '0'),
  };
  let rendered = template;
  for (const [token, value] of Object.entries(values)) {
    rendered = rendered
      .replaceAll(`{${token}}`, value)
      .replaceAll(`[${token}]`, value);
  }
  return sanitizeRenameFileName(rendered);
}

function withDuplicateRenameSuffix(name: string, duplicateIndex: number, force = false): string {
  if (!force && duplicateIndex <= 0) return name;
  const { base, extension } = splitFileName(name);
  return `${base || 'item'}_${String(force ? duplicateIndex + 1 : duplicateIndex + 1).padStart(4, '0')}${extension}`;
}

function buildRenamePreview(paths: string[], templateValue: string): GalleryRenamePreviewItem[] {
  const normalized = uniqueNormalizedPaths(paths);
  const now = new Date();
  const desired = normalized.map((path, index) => {
    const currentName = pathLeaf(path);
    const { base, extension } = splitFileName(currentName);
    const renderedBase = renderRenameTemplate(templateValue, base || currentName, index, normalized.length, now);
    const desiredName = sanitizeRenameFileName(
      extension && renderedBase && !renderedBase.toLowerCase().endsWith(extension.toLowerCase())
        ? `${renderedBase}${extension}`
        : renderedBase,
    );
    return {
      path,
      currentName,
      desiredName: desiredName || currentName,
    };
  });
  const desiredCounts = new Map<string, number>();
  for (const item of desired) {
    const duplicateKey = `${pathParent(item.path).toLowerCase()}/${item.desiredName.toLowerCase()}`;
    desiredCounts.set(duplicateKey, Number(desiredCounts.get(duplicateKey) || 0) + 1);
  }
  const seenDesired = new Map<string, number>();

  return desired.map((item) => {
    const duplicateKey = `${pathParent(item.path).toLowerCase()}/${item.desiredName.toLowerCase()}`;
    const duplicateIndex = Number(seenDesired.get(duplicateKey) || 0);
    seenDesired.set(duplicateKey, duplicateIndex + 1);
    const hasBatchDuplicate = Number(desiredCounts.get(duplicateKey) || 0) > 1;
    return {
      path: item.path,
      currentName: item.currentName,
      nextName: withDuplicateRenameSuffix(item.desiredName, duplicateIndex, hasBatchDuplicate),
    };
  });
}

function compareGalleryFiles(
  left: GalleryFile,
  right: GalleryFile,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
): number {
  let value = 0;
  if (sortBy === 'modified') {
    value = Number(left.modifiedMs || 0) - Number(right.modifiedMs || 0);
  } else if (sortBy === 'name') {
    value = String(left.name || pathLeaf(left.path)).localeCompare(String(right.name || pathLeaf(right.path)), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  } else if (sortBy === 'custom') {
    value = Number(left.customOrder || 0) - Number(right.customOrder || 0);
  } else {
    value = Number(left.createdMs || 0) - Number(right.createdMs || 0);
  }

  if (value === 0) {
    value = String(left.name || pathLeaf(left.path)).localeCompare(String(right.name || pathLeaf(right.path)), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  if (value === 0) value = normalizePath(left.path).localeCompare(normalizePath(right.path));
  return sortOrder === 'desc' ? -value : value;
}

function folderSummarySignature(summary: GalleryFolderSummary | null | undefined): string {
  if (!summary) return '';
  return [
    Math.max(0, Math.trunc(Number(summary.totalMediaCount || 0))),
    Math.max(0, Math.trunc(Number(summary.subfolderCount || 0))),
    Math.max(0, Math.trunc(Number(summary.imageCount || 0))),
    Math.max(0, Math.trunc(Number(summary.videoCount || 0))),
    Math.max(0, Math.trunc(Number(summary.gifCount || 0))),
    normalizePath(String(summary.firstMediaPath || '')).toLowerCase(),
    String(summary.firstMediaType || '').toLowerCase(),
  ].join('|');
}

function galleryFilesEquivalent(left: GalleryFile | null | undefined, right: GalleryFile | null | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    normalizePath(left.path) === normalizePath(right.path)
    && String(left.uid || left.id || '') === String(right.uid || right.id || '')
    && String(left.name || '') === String(right.name || '')
    && String(left.type || '') === String(right.type || '')
    && Number(left.size || 0) === Number(right.size || 0)
    && Number(left.createdMs || 0) === Number(right.createdMs || 0)
    && Number(left.modifiedMs || 0) === Number(right.modifiedMs || 0)
    && Number(left.customOrder || 0) === Number(right.customOrder || 0)
    && Number(left.width || 0) === Number(right.width || 0)
    && Number(left.height || 0) === Number(right.height || 0)
    && String(left.metadataFormat || '') === String(right.metadataFormat || '')
    && (left.metadataReady === right.metadataReady)
    && (left.tags || []).join('\u0001') === (right.tags || []).join('\u0001')
  );
}

function mergeGalleryFilePreservingIdentity(previous: GalleryFile | undefined, incoming: GalleryFile): GalleryFile {
  if (!previous) return incoming;
  const samePhysicalFile = (
    normalizePath(previous.path) === normalizePath(incoming.path)
    && Number(previous.size || 0) === Number(incoming.size || 0)
    && Number(previous.createdMs || 0) === Number(incoming.createdMs || 0)
    && Number(previous.modifiedMs || 0) === Number(incoming.modifiedMs || 0)
  );
  const merged: GalleryFile = {
    ...previous,
    ...incoming,
    tags: samePhysicalFile && Array.isArray(incoming.tags) && incoming.tags.length === 0
      ? (Array.isArray(previous.tags) ? previous.tags : [])
      : normalizeTags(incoming.tags),
  };
  return galleryFilesEquivalent(previous, merged) ? previous : merged;
}

function galleryFileArraysEquivalent(left: GalleryFile[], right: GalleryFile[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index] && !galleryFilesEquivalent(left[index], right[index])) return false;
  }
  return true;
}

function buildReorderedGalleryFiles(
  currentFiles: GalleryFile[],
  paths: string[],
  targetPath: string,
  position: 'before' | 'after',
): { files: GalleryFile[]; orderedPaths: string[]; movingCount: number } | null {
  const target = normalizePath(targetPath);
  if (!target || currentFiles.length === 0) return null;
  const movingPaths = uniqueNormalizedPaths(paths).filter((path) => !pathsEqual(path, target));
  if (movingPaths.length === 0) return null;

  const byPath = new Map(currentFiles.map((file) => [normalizePath(file.path).toLowerCase(), file]));
  const movingFiles = movingPaths
    .map((path) => byPath.get(normalizePath(path).toLowerCase()) || null)
    .filter((file): file is GalleryFile => Boolean(file));
  if (movingFiles.length === 0) return null;

  const movingSet = new Set(movingFiles.map((file) => normalizePath(file.path).toLowerCase()));
  const withoutMoving = currentFiles.filter((file) => !movingSet.has(normalizePath(file.path).toLowerCase()));
  const targetIndex = withoutMoving.findIndex((file) => pathsEqual(file.path, target));
  if (targetIndex < 0) return null;

  const nextFiles = [...withoutMoving];
  nextFiles.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, ...movingFiles);
  const files = nextFiles.map((file, index) => ({ ...file, customOrder: index }));
  return {
    files,
    orderedPaths: files.map((file) => normalizePath(file.path)).filter(Boolean),
    movingCount: movingFiles.length,
  };
}

function normalizeSearchQuery(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenizeSearchText(value: unknown): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function textMatchesSearch(text: unknown, needle: string): boolean {
  if (!needle) return true;
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  const tokens = tokenizeSearchText(normalized);
  if (tokens.some((token) => token.startsWith(needle))) return true;
  return needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalized.includes(needle);
}

function tagSearchPriority(tags: string[] | undefined, needle: string): number {
  if (!needle) return 0;
  let best = 0;
  for (const tag of tags || []) {
    const normalized = String(tag || '').toLowerCase().trim();
    if (!normalized) continue;
    if (normalized === needle) return 4;
    if (normalized.startsWith(needle)) best = Math.max(best, 3);
    else if (tokenizeSearchText(normalized).some((token) => token.startsWith(needle))) best = Math.max(best, 2);
    else if (needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalized.includes(needle)) best = Math.max(best, 1);
  }
  return best;
}

function fileMatchesSearch(file: GalleryFile, needle: string): boolean {
  if (!needle) return true;
  if (tagSearchPriority(file.tags, needle) > 0) return true;
  const name = String(file.name || pathLeaf(file.path));
  const baseName = splitFileName(name).base;
  const folderPath = pathParent(file.path);
  return (
    textMatchesSearch(name, needle)
    || textMatchesSearch(baseName, needle)
    || textMatchesSearch(pathLeaf(folderPath), needle)
    || (needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalizePath(folderPath).toLowerCase().includes(needle))
  );
}

function compareSearchFiles(left: GalleryFile, right: GalleryFile, needle: string, sortBy: GallerySortBy, sortOrder: GallerySortOrder): number {
  const tagDelta = tagSearchPriority(right.tags, needle) - tagSearchPriority(left.tags, needle);
  if (tagDelta !== 0) return tagDelta;
  return compareGalleryFiles(left, right, sortBy, sortOrder);
}

function buildSearchGroups(files: GalleryFile[], folders: GalleryFolder[]): GallerySearchGroup[] {
  const groupsByPath = new Map<string, GallerySearchGroup>();
  for (const folder of folders) {
    const folderPath = normalizePath(folder.path);
    if (!folderPath) continue;
    const key = folderPath.toLowerCase();
    groupsByPath.set(key, {
      folder: { name: folder.name || pathLeaf(folderPath) || folderPath, path: folderPath },
      files: [],
    });
  }
  for (const file of files) {
    const folderPath = pathParent(file.path) || normalizePath(file.path);
    if (!folderPath) continue;
    const key = folderPath.toLowerCase();
    const existing = groupsByPath.get(key);
    if (existing) {
      existing.files.push(file);
    } else {
      groupsByPath.set(key, {
        folder: { name: pathLeaf(folderPath) || folderPath, path: folderPath },
        files: [file],
      });
    }
  }
  return Array.from(groupsByPath.values()).sort((left, right) => (
    left.folder.path.localeCompare(right.folder.path, undefined, { numeric: true, sensitivity: 'base' })
  ));
}

function mergeSearchPayload(
  current: GallerySearchPayload | null,
  additions: {
    files?: GalleryFile[];
    folders?: GalleryFolder[];
    scannedFolders?: number;
    done?: boolean;
  },
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
  needle: string,
): GallerySearchPayload {
  const filesByPath = new Map<string, GalleryFile>();
  for (const file of current?.files || []) {
    const path = normalizePath(file.path);
    if (path) filesByPath.set(path.toLowerCase(), file);
  }
  for (const file of additions.files || []) {
    const normalized = normalizeGalleryFile(file, filesByPath.size);
    const path = normalizePath(normalized.path);
    if (path && fileMatchesSearch(normalized, needle)) filesByPath.set(path.toLowerCase(), normalized);
  }

  const foldersByPath = new Map<string, GalleryFolder>();
  for (const folder of current?.folders || []) {
    const path = normalizePath(folder.path);
    if (path) foldersByPath.set(path.toLowerCase(), { name: folder.name || pathLeaf(path), path });
  }
  for (const folder of additions.folders || []) {
    const path = normalizePath(folder.path);
    if (path) foldersByPath.set(path.toLowerCase(), { name: folder.name || pathLeaf(path), path });
  }

  const files = Array.from(filesByPath.values())
    .sort((left, right) => compareSearchFiles(left, right, needle, sortBy, sortOrder));
  const folders = Array.from(foldersByPath.values())
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    ...(current || {}),
    query: needle,
    files,
    folders,
    scannedFolders: Math.max(Number(current?.scannedFolders || 0), Number(additions.scannedFolders || 0)),
    done: additions.done === true,
  };
}

function suggestionMatches(value: unknown, needle: string): boolean {
  if (!needle) return false;
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized) return false;
  if (normalized === needle || normalized.startsWith(needle)) return true;
  if (tokenizeSearchText(normalized).some((token) => token.startsWith(needle))) return true;
  return needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalized.includes(needle);
}

function addSearchSuggestion(
  map: Map<string, GallerySearchSuggestion>,
  suggestion: GallerySearchSuggestion,
) {
  const normalizedKey = normalizeSearchQuery(suggestion.value);
  if (!normalizedKey) return;
  const key = `${suggestion.type}:${normalizedKey}`;
  if (map.has(key)) return;
  const value = suggestion.type === 'tag'
    ? normalizeTag(suggestion.value)
    : normalizePath(suggestion.value);
  if (!value) return;
  map.set(key, {
    ...suggestion,
    value,
    label: suggestion.label || value,
    detail: suggestion.detail || value,
  });
}

function buildLocalSearchSuggestions(
  needle: string,
  sources: {
    roots: GalleryRootChoice[];
    files: GalleryFile[];
    searchFiles: GalleryFile[];
    treeChildrenByPath: Record<string, GalleryFolderTreeNode[]>;
    currentFolder: string;
  },
): GallerySearchSuggestion[] {
  if (!needle) return [];
  const suggestions = new Map<string, GallerySearchSuggestion>();

  const addTag = (tagValue: unknown) => {
    const tag = normalizeTag(tagValue);
    if (!tag || !suggestionMatches(tag, needle)) return;
    addSearchSuggestion(suggestions, {
      type: 'tag',
      label: tag,
      detail: 'Tag',
      value: tag,
    });
  };
  const addFolder = (folderPathValue: unknown) => {
    const folderPath = normalizePath(folderPathValue);
    if (!folderPath) return;
    const label = pathLeaf(folderPath) || folderPath;
    if (!suggestionMatches(label, needle) && !suggestionMatches(folderPath, needle)) return;
    addSearchSuggestion(suggestions, {
      type: 'folder',
      label,
      detail: folderPath,
      value: folderPath,
    });
  };

  for (const file of [...sources.files, ...sources.searchFiles]) {
    for (const tag of normalizeTags(file.tags)) addTag(tag);
    addFolder(pathParent(file.path));
  }
  for (const root of sources.roots) addFolder(root.path);
  for (const [parentPath, children] of Object.entries(sources.treeChildrenByPath)) {
    addFolder(parentPath);
    for (const child of children || []) addFolder(child.path);
  }
  addFolder(sources.currentFolder);

  return Array.from(suggestions.values())
    .sort((left, right) => {
      const typeDelta = left.type === right.type ? 0 : left.type === 'tag' ? -1 : 1;
      if (typeDelta !== 0) return typeDelta;
      const leftExact = left.value === needle ? 0 : left.value.startsWith(needle) ? 1 : 2;
      const rightExact = right.value === needle ? 0 : right.value.startsWith(needle) ? 1 : 2;
      if (leftExact !== rightExact) return leftExact - rightExact;
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    })
    .slice(0, SEARCH_SUGGESTION_MAX_ITEMS);
}

function summarizeTagsForFiles(files: GalleryFile[]): GalleryTagSummaryItem[] {
  const counts = new Map<string, number>();
  for (const file of files || []) {
    for (const tag of normalizeTags(file.tags)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) return countDelta;
      return left.tag.localeCompare(right.tag, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function mergeTagSummaries(primary: GalleryTagSummaryItem[], fallback: GalleryTagSummaryItem[]): GalleryTagSummaryItem[] {
  const counts = new Map<string, number>();
  for (const item of primary || []) {
    const tag = normalizeTag(item.tag);
    if (!tag) continue;
    counts.set(tag, Math.max(0, Math.trunc(Number(item.count || 0))));
  }
  for (const item of fallback || []) {
    const tag = normalizeTag(item.tag);
    if (!tag) continue;
    counts.set(tag, Math.max(counts.get(tag) || 0, Math.max(0, Math.trunc(Number(item.count || 0)))));
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) return countDelta;
      return left.tag.localeCompare(right.tag, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function getSetSortRule(
  setId: number,
  rules: Record<string, GallerySetSortRule>,
  fallbackSortBy: GallerySortBy,
  fallbackSortOrder: GallerySortOrder,
): GallerySetSortRule {
  const rule = rules[String(setId)];
  return {
    sortBy: rule?.sortBy || fallbackSortBy,
    sortOrder: rule?.sortOrder || fallbackSortOrder,
  };
}

function buildGallerySetGroups(
  files: GalleryFile[],
  rules: Record<string, GallerySetSortRule>,
  fallbackSortBy: GallerySortBy,
  fallbackSortOrder: GallerySortOrder,
): GallerySetGroup[] {
  const groups = new Map<number, GalleryFile[]>();
  for (const file of files || []) {
    const setIds = getGallerySetIdsForFile(file);
    const targetSetIds = setIds.length > 0 ? setIds : [0];
    for (const setId of targetSetIds) {
      const existing = groups.get(setId) || [];
      existing.push(file);
      groups.set(setId, existing);
    }
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === 0 && right !== 0) return 1;
      if (right === 0 && left !== 0) return -1;
      return left - right;
    })
    .map(([setId, groupFiles]) => {
      const rule = getSetSortRule(setId, rules, fallbackSortBy, fallbackSortOrder);
      const color = setId > 0 ? getGallerySetColor(setId) : '#a1a1aa';
      return {
        setId,
        label: setId > 0 ? `Set ${setId}` : 'No Set',
        color,
        rule,
        files: [...groupFiles].sort((left, right) => compareGalleryFiles(left, right, rule.sortBy, rule.sortOrder)),
      };
    });
}

function getFolderPreviewVisibleCount(group: GalleryFolderPreviewGroup): number {
  const requested = Number.isFinite(Number(group.visibleCount))
    ? Math.max(0, Math.trunc(Number(group.visibleCount)))
    : FOLDER_PREVIEW_PAGE_SIZE;
  return Math.min(group.files.length, requested);
}

function getVisibleFolderPreviewFiles(group: GalleryFolderPreviewGroup): GalleryFile[] {
  return group.files.slice(0, getFolderPreviewVisibleCount(group));
}

function flattenFolderPreviewFiles(groups: GalleryFolderPreviewGroup[]): GalleryFile[] {
  return groups.flatMap((group) => getVisibleFolderPreviewFiles(group));
}

function compactText(value: unknown, maxLength = 700): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function getCachedViewerMetadata(pathValue: string, file?: GalleryFile): GalleryViewerMetadata | null {
  const key = file
    ? galleryMediaCacheKey(pathValue, file)
    : `${normalizePath(pathValue).toLowerCase()}\u0000unversioned`;
  if (!key) return null;
  const cached = viewerMetadataCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > VIEWER_METADATA_CACHE_TTL_MS) {
    viewerMetadataCache.delete(key);
    return null;
  }
  viewerMetadataCache.delete(key);
  viewerMetadataCache.set(key, cached);
  return cached.value;
}

function setCachedViewerMetadata(pathValue: string, value: GalleryViewerMetadata, file?: GalleryFile) {
  const key = file
    ? galleryMediaCacheKey(pathValue, file)
    : `${normalizePath(pathValue).toLowerCase()}\u0000unversioned`;
  if (!key) return;
  viewerMetadataCache.set(key, { value, cachedAt: Date.now() });
  while (viewerMetadataCache.size > VIEWER_METADATA_CACHE_LIMIT) {
    const oldestKey = viewerMetadataCache.keys().next().value;
    if (!oldestKey) break;
    viewerMetadataCache.delete(oldestKey);
  }
}

function clearCachedViewerMetadata(pathValue: string) {
  const prefix = `${normalizePath(pathValue).toLowerCase()}\u0000`;
  if (prefix === '\u0000') return;
  for (const key of Array.from(viewerMetadataCache.keys())) {
    if (key.startsWith(prefix)) viewerMetadataCache.delete(key);
  }
}

function findActiveRoot(folderPath: string, roots: GalleryRootChoice[]): GalleryRootChoice | null {
  const matches = roots
    .filter((root) => pathIsInsideRoot(folderPath, root.path))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length);
  return matches[0] || null;
}

type LibraryNavigatorProps = {
  mobileActive?: boolean;
  roots: GalleryRootChoice[];
  currentFolder: string;
  focusedFolder: string;
  pinnedFolders: string[];
  expandedFolders: Set<string>;
  treeChildrenByPath: Record<string, GalleryFolderTreeNode[]>;
  loadingTreePaths: Set<string>;
  onFocusFolder: (folderPath: string) => void;
  onOpenFolder: (folderPath: string) => void;
  onToggleExpand: (folderPath: string) => void;
  onRefreshTree: (folderPath: string) => void;
  onTogglePinnedFolder: (folderPath: string) => void;
  onFolderContextMenu: (event: GalleryContextMenuEvent, folderPath: string) => void;
  searchQuery: string;
  searchLoading: boolean;
  searchSuggestions: GallerySearchSuggestion[];
  searchSuggestionsOpen: boolean;
  searchSuggestionIndex: number;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSearchSuggestionHover: (index: number) => void;
  onSearchSuggestionSelect: (index: number) => void;
  draggingCount: number;
  dropTargetFolder: string;
  transferProgress: GalleryTransferProgressState | null;
  onFolderDragStart: (event: React.DragEvent, folderPath: string) => void;
  onFolderDragEnd: () => void;
  onFolderDragOver: (event: React.DragEvent, folderPath: string) => void;
  onFolderDragLeave: (folderPath: string) => void;
  onFolderDrop: (event: React.DragEvent, folderPath: string) => void;
  mobileExpandOnTap?: boolean;
  showContextButtons?: boolean;
};

const LIBRARY_TREE_INDENT_PX = 14;
const LIBRARY_TREE_ROW_PADDING_PX = 4;
const LIBRARY_TREE_CONNECTOR_X_PX = 8;
const GALLERY_LONG_PRESS_MS = 560;
const GALLERY_LONG_PRESS_MOVE_PX = 12;

function galleryPointToContextEvent(point: GalleryLongPressPoint): GalleryContextMenuEvent {
  return {
    clientX: point.clientX,
    clientY: point.clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
}

function useGalleryLongPress(
  onLongPress: (point: GalleryLongPressPoint) => void,
  enabled = true,
) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<GalleryLongPressPoint | null>(null);
  const suppressNextClickRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || (event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.button !== 0) return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    startRef.current = point;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      suppressNextClickRef.current = true;
      onLongPress(point);
    }, GALLERY_LONG_PRESS_MS);
  }, [enabled, onLongPress]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.clientX) > GALLERY_LONG_PRESS_MOVE_PX
      || Math.abs(event.clientY - start.clientY) > GALLERY_LONG_PRESS_MOVE_PX
    ) {
      clear();
    }
  }, [clear]);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressNextClickRef.current) return false;
    suppressNextClickRef.current = false;
    return true;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    consumeSuppressedClick,
  };
}

function LibraryFolderRow({
  node,
  depth,
  isLast = true,
  ancestorLast = [],
  currentFolder,
  focusedFolder,
  pinned,
  expandedFolders,
  treeChildrenByPath,
  loadingTreePaths,
  onFocusFolder,
  onOpenFolder,
  onToggleExpand,
  onFolderContextMenu,
  canDrag,
  draggingCount,
  dropTargetFolder,
  onFolderDragStart,
  onFolderDragEnd,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  mobileExpandOnTap = false,
  showContextButtons = false,
}: {
  node: GalleryFolderTreeNode;
  depth: number;
  isLast?: boolean;
  ancestorLast?: boolean[];
  currentFolder: string;
  focusedFolder: string;
  pinned?: boolean;
  expandedFolders: Set<string>;
  treeChildrenByPath: Record<string, GalleryFolderTreeNode[]>;
  loadingTreePaths: Set<string>;
  onFocusFolder: (folderPath: string) => void;
  onOpenFolder: (folderPath: string) => void;
  onToggleExpand: (folderPath: string) => void;
  onFolderContextMenu: (event: GalleryContextMenuEvent, folderPath: string) => void;
  canDrag: (folderPath: string) => boolean;
  draggingCount: number;
  dropTargetFolder: string;
  onFolderDragStart: (event: React.DragEvent, folderPath: string) => void;
  onFolderDragEnd: () => void;
  onFolderDragOver: (event: React.DragEvent, folderPath: string) => void;
  onFolderDragLeave: (folderPath: string) => void;
  onFolderDrop: (event: React.DragEvent, folderPath: string) => void;
  mobileExpandOnTap?: boolean;
  showContextButtons?: boolean;
}) {
  const folderPath = normalizePath(node.path);
  const children = treeChildrenByPath[folderPath] || node.children || [];
  const treeLoaded = Object.prototype.hasOwnProperty.call(treeChildrenByPath, folderPath);
  const expanded = expandedFolders.has(folderPath);
  const loading = loadingTreePaths.has(folderPath);
  const canExpand = node.hasChildren !== false && (!treeLoaded || children.length > 0);
  const isOpen = pathsEqual(currentFolder, folderPath);
  const isFocused = pathsEqual(focusedFolder, folderPath);
  const dropActive = pathsEqual(dropTargetFolder, folderPath);
  const draggable = canDrag(folderPath);
  const rowPaddingLeft = Math.min(96, depth * LIBRARY_TREE_INDENT_PX + LIBRARY_TREE_ROW_PADDING_PX);
  const currentConnectorX = LIBRARY_TREE_ROW_PADDING_PX
    + (depth - 1) * LIBRARY_TREE_INDENT_PX
    + LIBRARY_TREE_CONNECTOR_X_PX;
  const childAncestorLast = depth === 0 ? [] : [...ancestorLast, isLast];
  const longPress = useGalleryLongPress(
    (point) => onFolderContextMenu(galleryPointToContextEvent(point), folderPath),
    !showContextButtons,
  );

  return (
    <>
      <div
        data-umbra-library-folder-row=""
        className={cn(
          'group relative flex h-7 items-center gap-1 rounded px-1 text-xs',
          isOpen
            ? 'bg-[var(--umbra-accent-glow)] text-white'
            : isFocused
              ? 'bg-white/[0.06] text-zinc-100'
              : 'text-zinc-400 hover:bg-white/5 hover:text-white',
          dropActive && 'bg-[var(--umbra-accent-glow)] text-white ring-1 ring-[var(--umbra-accent)]',
          draggable && 'cursor-grab active:cursor-grabbing',
        )}
        style={{ paddingLeft: `${rowPaddingLeft}px` }}
        draggable={draggable}
        onDragStart={(event) => onFolderDragStart(event, folderPath)}
        onDragEnd={onFolderDragEnd}
        onDragOver={(event) => onFolderDragOver(event, folderPath)}
        onDragLeave={() => onFolderDragLeave(folderPath)}
        onDrop={(event) => onFolderDrop(event, folderPath)}
      >
        {ancestorLast.map((last, index) => (
          last ? null : (
            <span
              key={`rail-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 w-px"
              style={{
                left: `${LIBRARY_TREE_ROW_PADDING_PX + index * LIBRARY_TREE_INDENT_PX + LIBRARY_TREE_CONNECTOR_X_PX}px`,
                backgroundColor: 'var(--umbra-library-tree-line)',
              }}
            />
          )
        ))}
        {depth > 0 ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute w-px"
              style={{
                left: `${currentConnectorX}px`,
                top: 0,
                bottom: isLast ? '50%' : 0,
                backgroundColor: 'var(--umbra-library-tree-line)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-px"
              style={{
                left: `${currentConnectorX}px`,
                top: '50%',
                width: `${Math.max(8, LIBRARY_TREE_INDENT_PX - 3)}px`,
                backgroundColor: 'var(--umbra-library-tree-line)',
              }}
            />
          </>
        ) : null}
        <button
          type="button"
          className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-20"
          disabled={!canExpand}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpand(folderPath);
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : expanded ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
        </button>
        <button
          type="button"
          className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onPointerDown={longPress.onPointerDown}
          onPointerMove={longPress.onPointerMove}
          onPointerUp={longPress.onPointerUp}
          onPointerCancel={longPress.onPointerCancel}
          onClick={(event) => {
            if (longPress.consumeSuppressedClick()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            onFocusFolder(folderPath);
            if (canExpand && (mobileExpandOnTap || !expanded)) onToggleExpand(folderPath);
            onOpenFolder(folderPath);
          }}
          onContextMenu={(event) => onFolderContextMenu(event, folderPath)}
          title={folderPath}
        >
          {isOpen ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
          <span className="truncate">{node.name || pathLeaf(folderPath) || folderPath}</span>
        </button>
        {pinned ? <Pin size={11} className="relative z-10 shrink-0 text-zinc-500" /> : null}
        {dropActive && draggingCount > 0 ? (
          <span className="relative z-10 rounded border border-[var(--umbra-accent)]/40 bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-100">
            {draggingCount}
          </span>
        ) : null}
        {showContextButtons ? (
          <button
            type="button"
            className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-zinc-950/80 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-white"
            aria-label={`Open folder menu for ${node.name || pathLeaf(folderPath) || folderPath}`}
            title="Folder menu"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFolderContextMenu(event, folderPath);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        ) : null}
      </div>
      {expanded ? children.map((child, childIndex) => (
        <LibraryFolderRow
          key={child.path}
          node={child}
          depth={depth + 1}
          isLast={childIndex === children.length - 1}
          ancestorLast={childAncestorLast}
          currentFolder={currentFolder}
          focusedFolder={focusedFolder}
          pinned={pinned}
          expandedFolders={expandedFolders}
          treeChildrenByPath={treeChildrenByPath}
          loadingTreePaths={loadingTreePaths}
          onFocusFolder={onFocusFolder}
          onOpenFolder={onOpenFolder}
          onToggleExpand={onToggleExpand}
          onFolderContextMenu={onFolderContextMenu}
          canDrag={canDrag}
          draggingCount={draggingCount}
          dropTargetFolder={dropTargetFolder}
          onFolderDragStart={onFolderDragStart}
          onFolderDragEnd={onFolderDragEnd}
          onFolderDragOver={onFolderDragOver}
          onFolderDragLeave={onFolderDragLeave}
          onFolderDrop={onFolderDrop}
          mobileExpandOnTap={mobileExpandOnTap}
          showContextButtons={showContextButtons}
        />
      )) : null}
    </>
  );
}

function LibraryNavigator({
  mobileActive = true,
  roots,
  currentFolder,
  focusedFolder,
  pinnedFolders,
  expandedFolders,
  treeChildrenByPath,
  loadingTreePaths,
  onFocusFolder,
  onOpenFolder,
  onToggleExpand,
  onRefreshTree,
  onTogglePinnedFolder,
  onFolderContextMenu,
  searchQuery,
  searchLoading,
  searchSuggestions,
  searchSuggestionsOpen,
  searchSuggestionIndex,
  onSearchQueryChange,
  onClearSearch,
  onSearchFocus,
  onSearchBlur,
  onSearchKeyDown,
  onSearchSuggestionHover,
  onSearchSuggestionSelect,
  draggingCount,
  dropTargetFolder,
  transferProgress,
  onFolderDragStart,
  onFolderDragEnd,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  mobileExpandOnTap = false,
  showContextButtons = false,
}: LibraryNavigatorProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<'pinned' | 'roots', boolean>>({
    roots: false,
    pinned: false,
  });
  const focusedPinned = pinnedFolders.some((folderPath) => pathsEqual(folderPath, focusedFolder));
  const rootPathSet = useMemo(() => new Set(roots.map((root) => normalizePath(root.path).toLowerCase()).filter(Boolean)), [roots]);
  const canDragFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    return Boolean(normalized) && !isTrashPath(normalized) && !rootPathSet.has(normalized.toLowerCase());
  }, [rootPathSet]);
  const progressPercent = transferProgress ? Math.max(0, Math.min(100, Math.round(transferProgress.percent || 0))) : 0;
  const progressVerb = transferProgress?.mode === 'copy' ? 'Copying' : 'Moving';
  const progressPastVerb = transferProgress?.mode === 'copy' ? 'Copied' : 'Moved';
  const progressTotal = transferProgress
    ? Math.max(transferProgress.totalUnits || 0, transferProgress.totalPaths || 0)
    : 0;
  const progressDone = transferProgress
    ? Math.max(transferProgress.completedUnits || 0, transferProgress.completedPaths || 0)
    : 0;
  const toggleSection = useCallback((section: 'pinned' | 'roots') => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const renderSectionHeader = (
    section: 'pinned' | 'roots',
    label: string,
    trailing?: React.ReactNode,
  ) => {
    const collapsed = collapsedSections[section] === true;
    return (
      <div data-umbra-library-section-header="" className="mb-1 flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          data-umbra-library-section-toggle=""
          onClick={() => toggleSection(section)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          aria-expanded={!collapsed}
        >
          <span className="truncate">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {trailing}
          <button
            type="button"
            data-umbra-library-section-collapse=""
            onClick={() => toggleSection(section)}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
            aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
            title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
    );
  };

  const renderFolderButton = (
    folderPath: string,
    options: {
      icon?: React.ReactNode;
      action?: React.ReactNode;
      muted?: boolean;
    } = {},
  ) => {
    const normalized = normalizePath(folderPath);
    const isOpen = pathsEqual(currentFolder, normalized);
    const isFocused = pathsEqual(focusedFolder, normalized);
    const dropActive = pathsEqual(dropTargetFolder, normalized);
    const draggable = canDragFolder(normalized);
    return (
      <div
        key={normalized}
        data-umbra-library-folder-row=""
        className={cn(
          'group flex h-7 items-center gap-1 rounded px-1 text-xs',
          isOpen
            ? 'bg-[var(--umbra-accent-glow)] text-white'
            : isFocused
              ? 'bg-white/[0.06] text-zinc-100'
              : options.muted
                ? 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white',
          dropActive && 'bg-[var(--umbra-accent-glow)] text-white ring-1 ring-[var(--umbra-accent)]',
          draggable && 'cursor-grab active:cursor-grabbing',
        )}
        draggable={draggable}
        onDragStart={(event) => onFolderDragStart(event, normalized)}
        onDragEnd={onFolderDragEnd}
        onDragOver={(event) => onFolderDragOver(event, normalized)}
        onDragLeave={() => onFolderDragLeave(normalized)}
        onDrop={(event) => onFolderDrop(event, normalized)}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => {
            onFocusFolder(normalized);
            onOpenFolder(normalized);
          }}
          onContextMenu={(event) => onFolderContextMenu(event, normalized)}
          title={normalized}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500">
            {options.icon || <Folder size={14} />}
          </span>
          <span className="truncate">{pathLeaf(normalized) || normalized}</span>
        </button>
        {dropActive && draggingCount > 0 ? (
          <span className="rounded border border-[var(--umbra-accent)]/40 bg-zinc-950/80 px-1.5 py-0.5 text-[10px] text-zinc-100">
            {draggingCount}
          </span>
        ) : null}
        {options.action}
        {showContextButtons ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/10 bg-zinc-950/80 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-white"
            aria-label={`Open folder menu for ${pathLeaf(normalized) || normalized}`}
            title="Folder menu"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFolderContextMenu(event, normalized);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      data-umbra-gallery-navigator=""
      data-umbra-gallery-mobile-active={mobileActive ? '1' : '0'}
      className="flex w-[300px] shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/96"
    >
      <div className="border-b border-zinc-800/80 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Grid3X3 size={16} />
          Library
        </div>
        <div className="mt-2 flex items-start gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
              onKeyDown={onSearchKeyDown}
              placeholder="Search library"
              autoComplete="off"
              spellCheck={false}
              aria-expanded={searchSuggestionsOpen}
              className="h-8 w-full rounded border border-zinc-800 bg-zinc-900/80 pl-8 pr-8 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]"
            />
            {searchLoading ? (
              <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
            ) : searchQuery ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClearSearch}
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-white"
                title="Clear search"
              >
                <X size={13} />
              </button>
            ) : null}
            {searchSuggestionsOpen && searchSuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded border border-zinc-800 bg-zinc-950/98 shadow-2xl shadow-black/45">
                {(['tag', 'folder'] as const).map((kind) => {
                  const entries = searchSuggestions
                    .map((suggestion, index) => ({ suggestion, index }))
                    .filter((entry) => entry.suggestion.type === kind);
                  if (entries.length === 0) return null;
                  return (
                    <div key={kind} className="border-b border-zinc-900 last:border-b-0">
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                        {kind === 'tag' ? 'Tags' : 'Folders'}
                      </div>
                      {entries.map(({ suggestion, index }) => (
                        <button
                          key={`${suggestion.type}:${suggestion.value}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => onSearchSuggestionHover(index)}
                          onClick={() => onSearchSuggestionSelect(index)}
                          className={cn(
                            'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs',
                            index === searchSuggestionIndex
                              ? 'bg-[var(--umbra-accent-glow)] text-white'
                              : 'text-zinc-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 text-[10px] font-semibold text-zinc-500">
                            {kind === 'tag' ? 'TAG' : 'DIR'}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{suggestion.label}</span>
                            <span className="block truncate text-[11px] text-zinc-600">{suggestion.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!focusedFolder}
            onClick={() => onTogglePinnedFolder(focusedFolder)}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40',
              focusedPinned && 'border-[var(--umbra-accent)] text-white',
            )}
            title={focusedPinned ? 'Unpin focused folder' : 'Pin focused folder'}
          >
            <Pin size={13} />
          </button>
        </div>
        <div className="mt-2 truncate text-[11px] text-zinc-500" title={focusedFolder}>
          {focusedFolder || 'No folder focused'}
        </div>
      </div>

      <div data-umbra-library-body="" className="min-h-0 flex-1 overflow-y-auto p-2">
        {transferProgress ? (
          <div data-umbra-library-transfer="" className="mb-3 rounded border border-[var(--umbra-accent)]/35 bg-zinc-900/70 p-2 shadow-[0_0_18px_color-mix(in_srgb,var(--umbra-accent)_18%,transparent)]">
            <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-300">
              <span>{transferProgress.active ? progressVerb : progressPastVerb}</span>
              <span>{progressDone}/{progressTotal} media</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-950">
              <div
                className="h-full rounded bg-[var(--umbra-accent)] transition-[width]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
              <span className="min-w-0 truncate" title={transferProgress.currentPath || transferProgress.destination}>
                {transferProgress.error || pathLeaf(transferProgress.currentPath) || pathLeaf(transferProgress.destination) || transferProgress.destination}
              </span>
              <span className="shrink-0">{progressPercent}%</span>
            </div>
          </div>
        ) : null}
        <div data-umbra-library-pinned="" className="mb-3 border-t border-zinc-900 pt-2">
          {renderSectionHeader('pinned', 'Pinned')}
          {!collapsedSections.pinned ? (
          <div className="space-y-1">
            {pinnedFolders.length === 0 ? (
              <div className="px-2 py-1 text-xs text-zinc-600">No pinned folders</div>
            ) : pinnedFolders.map((folderPath) => renderFolderButton(folderPath, {
              icon: <Pin size={13} />,
              action: (
                <button
                  type="button"
                  className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-100 group-hover:flex"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePinnedFolder(folderPath);
                  }}
                  title="Unpin"
                >
                  <X size={12} />
                </button>
              ),
            }))}
          </div>
          ) : null}
        </div>

        <div data-umbra-library-roots="" className="border-t border-zinc-900 pt-2">
          {renderSectionHeader('roots', 'Roots')}
          {!collapsedSections.roots ? (
            <div className="space-y-3">
              {roots.map((root) => {
                const rootFolderPath = normalizePath(root.path);
                const rootChildren = rootFolderPath ? treeChildrenByPath[rootFolderPath] || [] : [];
                const rootLoaded = rootFolderPath
                  ? Object.prototype.hasOwnProperty.call(treeChildrenByPath, rootFolderPath)
                  : false;
                const rootExpanded = expandedFolders.has(rootFolderPath);
                const rootIsTrash = root.kind === 'trash';
                const rootIcon = rootIsTrash
                  ? <Trash2 size={14} />
                  : root.kind === 'external'
                    ? <HardDrive size={14} />
                    : <FolderOpen size={14} />;
                return (
                  <div
                    key={rootFolderPath}
                    data-umbra-library-root-group=""
                    className="rounded border border-zinc-900/80 bg-zinc-950/35 p-1.5"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 px-1">
                      <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
                          {rootIcon}
                        </span>
                        <span className="truncate">{root.label}</span>
                      </div>
                      {!rootIsTrash ? (
                        <button
                          type="button"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
                          title={`Refresh ${root.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRefreshTree(rootFolderPath);
                          }}
                        >
                          {loadingTreePaths.has(rootFolderPath) ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        </button>
                      ) : null}
                    </div>
                    {rootIsTrash ? (
                      <div className="space-y-1">
                        {(isTrashPath(currentFolder) ? folderPathChain(currentFolder || rootFolderPath, rootFolderPath) : [rootFolderPath]).map((folderPath, index) => (
                          <div
                            key={folderPath}
                            style={{ marginLeft: index > 0 ? Math.min(48, index * 12) : 0 }}
                          >
                            {renderFolderButton(folderPath, {
                              icon: index === 0 ? <Trash2 size={14} /> : <Folder size={14} />,
                              muted: index > 0 && !pathsEqual(folderPath, currentFolder),
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <LibraryFolderRow
                          node={{
                            name: root.label || pathLeaf(rootFolderPath) || rootFolderPath,
                            path: rootFolderPath,
                            hasChildren: rootChildren.length > 0 || !rootLoaded,
                          }}
                          depth={0}
                          currentFolder={currentFolder}
                          focusedFolder={focusedFolder}
                          expandedFolders={expandedFolders}
                          treeChildrenByPath={treeChildrenByPath}
                          loadingTreePaths={loadingTreePaths}
                          onFocusFolder={onFocusFolder}
                          onOpenFolder={onOpenFolder}
                          onToggleExpand={onToggleExpand}
                          onFolderContextMenu={onFolderContextMenu}
                          canDrag={canDragFolder}
                          draggingCount={draggingCount}
                          dropTargetFolder={dropTargetFolder}
                          onFolderDragStart={onFolderDragStart}
                          onFolderDragEnd={onFolderDragEnd}
                          onFolderDragOver={onFolderDragOver}
                          onFolderDragLeave={onFolderDragLeave}
                          onFolderDrop={onFolderDrop}
                          mobileExpandOnTap={mobileExpandOnTap}
                          showContextButtons={showContextButtons}
                        />
                        {rootExpanded && !rootLoaded && loadingTreePaths.has(rootFolderPath) ? (
                          <div className="flex items-center gap-2 px-7 py-1 text-xs text-zinc-500">
                            <Loader2 size={13} className="animate-spin" />
                            Loading folders
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function GalleryImageTile({
  file,
  selected,
  contextTargeted = false,
  restoredHighlighted = false,
  metadataHighlighted = false,
  metadataSnippet = '',
  setColor,
  setLabel,
  prioritize,
  cardSize,
  cardHeight,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragEnd,
  selectionMode = false,
  singleTapOpen = false,
  showContextButton = false,
  onLongPressContextMenu,
  onSelectionPointerDown,
  onSelectionPointerEnter,
  onSelectionPointerUp,
}: {
  file: GalleryFile;
  selected: boolean;
  contextTargeted?: boolean;
  restoredHighlighted?: boolean;
  metadataHighlighted?: boolean;
  metadataSnippet?: string;
  setColor?: string;
  setLabel?: string;
  prioritize: boolean;
  cardSize: number;
  cardHeight: number;
  onSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: (event: React.DragEvent) => void;
  selectionMode?: boolean;
  singleTapOpen?: boolean;
  showContextButton?: boolean;
  onLongPressContextMenu?: (point: GalleryLongPressPoint) => void;
  onSelectionPointerDown?: (event: React.PointerEvent<HTMLElement>, file: GalleryFile) => void;
  onSelectionPointerEnter?: (event: React.PointerEvent<HTMLElement>, file: GalleryFile) => void;
  onSelectionPointerUp?: () => void;
}) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const selectionPointerHandledRef = useRef(false);
  const path = normalizePath(file.path);
  const stableSrc = useMemo(() => thumbnailUrl(file, { defer: true }), [
    file.createdMs,
    file.id,
    file.modifiedMs,
    file.path,
    file.size,
    file.thumbnailUrl,
    file.type,
    file.uid,
  ]);
  const isLivePreview = isLiveGenerationPreviewPath(path);
  const cacheKey = isLivePreview ? `${path}|${file.modifiedMs || 0}` : stableSrc;
  const isFolder = file.type === 'folder';
  const isTrashItem = isTrashPath(path);
  const trashCountdown = isTrashItem ? formatTimeRemaining(getTrashExpiresMs(file) - Date.now()) : '';
  const tags = useMemo(() => normalizeTags(file.tags), [file.tags]);
  const tagLine = tags.length > 0 ? tags.slice(0, 5).join(', ') : 'No tags';
  const typeLabel = isFolder ? 'FOLDER' : file.type === 'video' ? 'VIDEO' : file.type === 'gif' ? 'GIF' : 'IMAGE';
  const effectiveSetColor = !isFolder && !contextTargeted && !restoredHighlighted && setColor ? setColor : '';
  const [imageAccentColor, setImageAccentColor] = useState(() => imageAccentColorCache.get(cacheKey) || '');
  const imageAccentRgb = useMemo(() => {
    const parts = imageAccentColor.split(',').map((part) => Number(part.trim()));
    if (parts.length !== 3 || !parts.every((part) => Number.isFinite(part))) return null;
    return [parts[0], parts[1], parts[2]] as [number, number, number];
  }, [imageAccentColor]);
  const imageAccentCardStyle = useMemo<React.CSSProperties>(() => {
    if (isFolder || isLivePreview || !imageAccentRgb) return {};
    return {
      borderColor: selected
        ? rgbaToCss(imageAccentRgb[0], imageAccentRgb[1], imageAccentRgb[2], 0.72)
        : rgbaToCss(imageAccentRgb[0], imageAccentRgb[1], imageAccentRgb[2], 0.28),
      background: selected
        ? `linear-gradient(180deg, rgba(${imageAccentColor}, 0.24), rgba(9,9,11,0.96))`
        : `linear-gradient(180deg, rgba(${imageAccentColor}, 0.13), rgba(9,9,11,0.94))`,
      boxShadow: selected
        ? `0 0 0 1px rgba(${imageAccentColor}, 0.56), 0 0 22px rgba(${imageAccentColor}, 0.2)`
        : `inset 0 1px 0 rgba(${imageAccentColor}, 0.16), 0 0 16px rgba(${imageAccentColor}, 0.08)`,
    };
  }, [imageAccentColor, imageAccentRgb, isFolder, isLivePreview, selected]);
  const cardStyle: React.CSSProperties = {
    width: cardSize,
    height: cardHeight,
    ...(effectiveSetColor ? {
      borderColor: hexToRgba(effectiveSetColor, selected ? 0.82 : 0.38),
      background: selected
        ? `linear-gradient(180deg, ${hexToRgba(effectiveSetColor, 0.24)}, rgba(9,9,11,0.96))`
        : `linear-gradient(180deg, ${hexToRgba(effectiveSetColor, 0.11)}, rgba(9,9,11,0.94))`,
      boxShadow: selected
        ? `0 0 0 1px ${hexToRgba(effectiveSetColor, 0.72)}, 0 0 20px ${hexToRgba(effectiveSetColor, 0.24)}`
        : `inset 0 1px 0 ${hexToRgba(effectiveSetColor, 0.12)}`,
    } : imageAccentCardStyle),
  };
  const [thumbnailReady, setThumbnailReady] = useState(() => isLivePreview || readyThumbnailCache.has(cacheKey));
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(() => !(isLivePreview || readyThumbnailCache.has(cacheKey)));
  const [loadGranted, setLoadGranted] = useState(() => isLivePreview || readyThumbnailCache.has(cacheKey));
  const [nearViewport, setNearViewport] = useState(() => isLivePreview || prioritize || readyThumbnailCache.has(cacheKey));
  const retryTimerRef = useRef<number | null>(null);
  const releaseLoadSlotRef = useRef<(() => void) | null>(null);
  const src = useMemo(() => (
    thumbnailReady ? stableSrc : thumbnailUrl(file, { defer: true, retry })
  ), [file, retry, stableSrc, thumbnailReady]);
  const schedulerKey = `${cacheKey}|${retry}`;

  useEffect(() => {
    if (isFolder) return;
    setRetry(0);
    const ready = isLivePreview || readyThumbnailCache.has(cacheKey);
    setThumbnailReady(ready);
    setPending(!ready);
    setLoadGranted(ready);
    setNearViewport(isLivePreview || prioritize || ready);
    setImageAccentColor(imageAccentColorCache.get(cacheKey) || '');
    releaseLoadSlotRef.current?.();
    releaseLoadSlotRef.current = null;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      releaseLoadSlotRef.current?.();
      releaseLoadSlotRef.current = null;
    };
  }, [cacheKey, isFolder, isLivePreview, path, prioritize]);

  useEffect(() => {
    if (isFolder || isLivePreview || prioritize || thumbnailReady || nearViewport || readyThumbnailCache.has(cacheKey)) {
      if (!isFolder && (isLivePreview || prioritize || thumbnailReady || readyThumbnailCache.has(cacheKey))) setNearViewport(true);
      return;
    }
    const node = tileRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, {
      root: null,
      rootMargin: '900px 0px',
      threshold: 0.01,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cacheKey, isFolder, isLivePreview, nearViewport, prioritize, thumbnailReady]);

  useEffect(() => {
    if (isFolder) {
      setLoadGranted(false);
      setPending(false);
      return;
    }
    releaseLoadSlotRef.current?.();
    releaseLoadSlotRef.current = null;
    if (thumbnailReady || readyThumbnailCache.has(cacheKey)) {
      setLoadGranted(true);
      return;
    }
    if (!nearViewport) {
      setLoadGranted(false);
      return;
    }
    setLoadGranted(false);
    const cancel = thumbnailLoadScheduler.acquire(schedulerKey, (release) => {
      releaseLoadSlotRef.current = release;
      setLoadGranted(true);
    }, { high: prioritize });
    return () => {
      cancel();
    };
  }, [cacheKey, isFolder, nearViewport, prioritize, schedulerKey, thumbnailReady]);

  const scheduleRetry = useCallback(() => {
    if (thumbnailReady || retryTimerRef.current !== null || retry >= 60) return;
    const delay = Math.min(4000, 450 + retry * 350);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetry((current) => Math.min(current + 1, 60));
    }, delay);
  }, [retry, thumbnailReady]);

  const onImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const isPlaceholder = img.naturalWidth <= 2 && img.naturalHeight <= 2;
    if (isPlaceholder) {
      if (!thumbnailReady) {
        setPending(true);
        scheduleRetry();
      }
      return;
    }
    markThumbnailReady(cacheKey);
    if (!isLivePreview) {
      const sampledAccent = imageAccentColorCache.get(cacheKey) || sampleImageAccentColor(img);
      if (sampledAccent) {
        rememberImageAccentColor(cacheKey, sampledAccent);
        setImageAccentColor(sampledAccent);
      }
    }
    setThumbnailReady(true);
    setPending(false);
    releaseLoadSlotRef.current?.();
    releaseLoadSlotRef.current = null;
    if (retry !== 0) setRetry(0);
  }, [cacheKey, isLivePreview, retry, scheduleRetry, thumbnailReady]);

  const onImageError = useCallback(() => {
    setPending(true);
    releaseLoadSlotRef.current?.();
    releaseLoadSlotRef.current = null;
    scheduleRetry();
  }, [scheduleRetry]);
  const longPress = useGalleryLongPress(
    (point) => onLongPressContextMenu?.(point),
    Boolean(onLongPressContextMenu) && !showContextButton,
  );

  return (
    <div
      ref={tileRef}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (longPress.consumeSuppressedClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (isFolder) {
          onOpen();
          return;
        }
        if (selectionMode && selectionPointerHandledRef.current) {
          selectionPointerHandledRef.current = false;
          return;
        }
        if (singleTapOpen) {
          onOpen();
          return;
        }
        onSelect(event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen();
        } else if (event.key === ' ') {
          event.preventDefault();
          onSelect(event as unknown as React.MouseEvent);
        }
      }}
      onDoubleClick={isFolder || selectionMode || singleTapOpen ? undefined : onOpen}
      onContextMenu={isLivePreview ? undefined : onContextMenu}
      draggable={!isLivePreview && !isTrashItem && !selectionMode && !singleTapOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={(event) => {
        longPress.onPointerDown(event);
        if (!selectionMode || isFolder) return;
        selectionPointerHandledRef.current = true;
        onSelectionPointerDown?.(event, file);
      }}
      onPointerEnter={(event) => {
        if (!selectionMode || isFolder) return;
        onSelectionPointerEnter?.(event, file);
      }}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={() => {
        longPress.onPointerUp();
        if (!selectionMode || isFolder) return;
        onSelectionPointerUp?.();
      }}
      onPointerCancel={() => {
        longPress.onPointerCancel();
        if (!selectionMode || isFolder) return;
        onSelectionPointerUp?.();
      }}
      data-umbra-gallery-tile=""
      data-umbra-gallery-tile-type={isLivePreview ? 'live-preview' : isFolder ? 'folder' : 'media'}
      data-umbra-gallery-selection-mode={selectionMode && !isFolder ? '1' : '0'}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-zinc-950/90 p-1.5 text-left shadow-sm outline-none transition-colors',
        isLivePreview && 'cursor-pointer',
        selectionMode && !isFolder
          ? 'cursor-crosshair touch-none select-none'
          : !isLivePreview && !isTrashItem && !singleTapOpen && 'cursor-grab active:cursor-grabbing',
        'before:pointer-events-none before:absolute before:inset-0 before:z-10 before:border before:border-white/5',
        selected
          ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] shadow-[0_0_0_1px_var(--umbra-accent),0_0_18px_color-mix(in_srgb,var(--umbra-accent)_32%,transparent)]'
          : isLivePreview
            ? 'border-emerald-300/80 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(110,231,183,0.55),0_0_26px_rgba(16,185,129,0.28),inset_0_0_20px_rgba(16,185,129,0.08)] hover:border-emerald-200 hover:bg-emerald-400/15'
            : contextTargeted || restoredHighlighted
              ? 'border-amber-300/80 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.45),0_0_18px_rgba(252,211,77,0.18)]'
              : metadataHighlighted
                ? 'border-cyan-300/80 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.42),0_0_18px_rgba(103,232,249,0.16)]'
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]',
      )}
      style={cardStyle}
      title={`${file.name}\n${setLabel ? `${setLabel}\n` : ''}${metadataSnippet ? `Metadata match: ${metadataSnippet}\n` : ''}${path}`}
    >
      <div
        data-umbra-gallery-tile-header
        className="mb-1 flex h-5 shrink-0 items-center justify-between gap-2 px-0.5"
      >
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400"
          style={effectiveSetColor ? { color: effectiveSetColor } : undefined}
        >
          {typeLabel}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {trashCountdown ? (
            <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-200">
              {trashCountdown}
            </span>
          ) : null}
          {isLivePreview ? (
            <span className="rounded border border-emerald-300/35 bg-emerald-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.28)]">
              LIVE
            </span>
          ) : null}
          {metadataHighlighted && !isLivePreview ? (
            <span
              className="rounded border border-cyan-300/35 bg-cyan-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100"
              title={metadataSnippet || 'Metadata match'}
            >
              META
            </span>
          ) : null}
          {showContextButton && !isLivePreview ? (
            <button
              type="button"
              className="-mr-0.5 flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-zinc-950/90 text-zinc-400 shadow-sm hover:border-white/20 hover:bg-white/10 hover:text-white"
              aria-label={`Open media menu for ${file.name}`}
              title="Media menu"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(event);
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          ) : null}
        </span>
      </div>
      <div
        data-umbra-gallery-tile-media
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden rounded-md border bg-black/65',
          selected
            ? 'border-[var(--umbra-accent)]/70'
            : isLivePreview
              ? 'border-emerald-300/40 shadow-[inset_0_0_18px_rgba(16,185,129,0.16)]'
              : 'border-white/10',
        )}
      >
        {isFolder ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900/70 text-zinc-400">
            <FolderOpen size={Math.max(30, Math.min(54, Math.floor(cardSize * 0.25)))} />
            {file.trashOriginalPath || file.originalPath ? (
              <div className="mt-2 max-w-[80%] truncate text-[10px] text-zinc-500" title={file.trashOriginalPath || file.originalPath}>
                {pathLeaf(file.trashOriginalPath || file.originalPath)}
              </div>
            ) : null}
          </div>
        ) : (
          <img
            key={`${fileId(file)}:${src}`}
            src={loadGranted ? src : undefined}
            alt={file.name}
            loading={loadGranted || prioritize ? 'eager' : 'lazy'}
            fetchPriority={prioritize ? 'high' : 'auto'}
            decoding="async"
            className={cn(
              'h-full w-full object-contain object-center',
              pending ? 'opacity-25' : 'opacity-100',
            )}
            draggable={false}
            onLoad={onImageLoad}
            onError={onImageError}
          />
        )}
        {!isFolder && pending ? (
          <div className="pointer-events-none absolute inset-0 z-10 bg-zinc-950/25" />
        ) : null}
        {isLivePreview ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-emerald-300/18 to-transparent" />
        ) : null}
      </div>
      <div data-umbra-gallery-tile-footer className="shrink-0 px-0.5 pb-0.5 pt-1.5">
        <div className="truncate text-xs font-medium leading-4 text-zinc-100" title={file.name}>{file.name}</div>
        <div
          className={cn(
            'truncate text-[10px] leading-3',
            tags.length > 0 ? 'text-zinc-300' : 'text-zinc-600',
          )}
          title={tags.length > 0 ? tags.join(', ') : 'No tags'}
        >
          {tagLine}
        </div>
      </div>
    </div>
  );
}

function GalleryMediaViewer({
  file,
  files,
  totalCount,
  remoteMode,
  selectedCount,
  loadingMore,
  canLoadMore,
  remoteViewerOriginals,
  onClose,
  onStep,
  onReveal,
  onCopyPath,
  onSendScanner,
  onSendWaifu,
  onSendUmbra,
  onDelete,
}: {
  file: GalleryFile | null;
  files: GalleryFile[];
  totalCount: number;
  remoteMode: string;
  selectedCount: number;
  loadingMore: boolean;
  canLoadMore: boolean;
  remoteViewerOriginals: boolean;
  onClose: () => void;
  onStep: (delta: number) => void;
  onReveal: () => void;
  onCopyPath: () => void;
  onSendScanner: () => void;
  onSendWaifu: () => void;
  onSendUmbra: (mode: UmbraUiMediaHandoffMode, frameRole?: UmbraUiVideoFrameRole, metadata?: ImageMetadata | null) => void;
  onDelete: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const { addToast } = useToastStore();
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const viewerRemoteMode = remoteMode || (typeof window !== 'undefined'
    ? (document.documentElement.dataset.umbraRemoteMode || new URLSearchParams(window.location.search).get('remoteMode') || '')
    : '');
  const isPhoneViewer = viewerRemoteMode === 'phone';
  const isTabletViewer = viewerRemoteMode === 'tablet';
  const isTouchViewer = isPhoneViewer || isTabletViewer;
  const [showInfo, setShowInfo] = useState(() => !isPhoneViewer);
  const [metadata, setMetadata] = useState<GalleryViewerMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState('');
  const [skipLivePreviewBusy, setSkipLivePreviewBusy] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; at: number; axis: 'x' | 'y' | null; cancelled: boolean } | null>(null);
  const touchLastRef = useRef<{ x: number; y: number } | null>(null);
  const viewerPath = normalizePath(file?.path || '');
  const isLivePreview = isLiveGenerationPreviewPath(viewerPath);
  const viewerIndex = useMemo(() => (
    viewerPath ? files.findIndex((entry) => pathsEqual(entry.path, viewerPath)) : -1
  ), [files, viewerPath]);
  const viewerTotal = Math.max(files.length, Math.trunc(Number(totalCount || 0)));
  const imageSrc = useMemo(() => (file ? imageUrl(file, { lane: 'gallery', remoteOriginals: remoteViewerOriginals }) : ''), [file, remoteViewerOriginals]);
  const stillSrc = useMemo(() => (file ? thumbnailUrl(file, { lane: 'gallery' }) : ''), [file]);
  const isVideo = file?.type === 'video';
  const isGif = file?.type === 'gif';
  const canSendWaifu = Boolean(file && !isLivePreview && (file.type === 'image' || file.type === 'gif'));
  const sizeLabel = formatBytes(file?.size);
  const createdLabel = formatDateTime(file?.createdMs);
  const modifiedLabel = formatDateTime(file?.modifiedMs);
  const metadataParams = useMemo(() => (metadata ? extractGenerationParams(metadata) : {}), [metadata]);
  const metadataPrompts = useMemo(() => (metadata ? extractPrompts(metadata) : { positive: null, negative: null }), [metadata]);
  const dimensions = metadataParams.width && metadataParams.height
    ? `${metadataParams.width} x ${metadataParams.height}`
    : (file?.width && file?.height ? `${file.width} x ${file.height}` : '');
  const metadataFormat = String(metadata?.format || file?.metadataFormat || '').trim();
  const positivePrompt = String(metadataPrompts.positive || '').trim();
  const negativePrompt = String(metadataPrompts.negative || '').trim();
  const workflowJsonExport = useMemo(() => getWorkflowJsonExport(metadata), [metadata]);
  const apiWorkflowOpenInfo = useMemo(() => getGalleryApiWorkflowInfo(metadata), [metadata]);
  const hostRevealAvailable = !isUmbraRemoteClient();
  const generationRows = useMemo(() => ([
    ['Model', metadataParams.model],
    ['Seed', metadataParams.seed],
    ['Steps', metadataParams.steps],
    ['CFG', metadataParams.cfg],
    ['Sampler', metadataParams.sampler],
    ['Scheduler', metadataParams.scheduler],
    ['Denoise', metadataParams.denoise],
    ['VAE', metadataParams.vae],
  ] as Array<[string, unknown]>).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''), [metadataParams]);

  const handleSkipLivePreview = useCallback(async () => {
    if (skipLivePreviewBusy) return;
    setSkipLivePreviewBusy(true);
    try {
      const skipEvent = new CustomEvent('umbra:powerprompter-skip-active-job', { cancelable: true });
      window.dispatchEvent(skipEvent);
      if (!skipEvent.defaultPrevented) {
        const response = await fetch('/api/umbrabridge/comfyui/interrupt', { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(String(payload?.error || `ComfyUI interrupt failed (${response.status})`));
        }
        addToast({ type: 'success', message: 'Skipped current generation' });
      }
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to skip current generation.' });
    } finally {
      setSkipLivePreviewBusy(false);
    }
  }, [addToast, skipLivePreviewBusy]);

  useEffect(() => {
    setZoom(1);
    if (isPhoneViewer) setShowInfo(false);
  }, [isPhoneViewer, viewerPath]);

  const touchTargetIsInteractive = useCallback((target: EventTarget | null) => (
    target instanceof Element
      ? Boolean(target.closest('button, a, input, textarea, select, video, [role="button"], [data-umbra-gallery-viewer-info]'))
      : false
  ), []);

  const resetTouchNavigation = useCallback(() => {
    touchStartRef.current = null;
    touchLastRef.current = null;
  }, []);

  const handleMediaTouchStart = useCallback((event: React.TouchEvent) => {
    if (!isTouchViewer || touchTargetIsInteractive(event.target) || event.touches.length !== 1) {
      resetTouchNavigation();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now(), axis: null, cancelled: zoom > 1.05 };
    touchLastRef.current = { x: touch.clientX, y: touch.clientY };
  }, [isTouchViewer, resetTouchNavigation, touchTargetIsInteractive, zoom]);

  const handleMediaTouchMove = useCallback((event: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!isTouchViewer || !start) return;
    if (event.touches.length !== 1) {
      start.cancelled = true;
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    touchLastRef.current = { x: touch.clientX, y: touch.clientY };
    if (start.cancelled) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!start.axis && (absX >= 12 || absY >= 12)) {
      start.axis = absX > absY * 1.15 ? 'x' : 'y';
    }
    if (start.axis === 'x') event.preventDefault();
  }, [isTouchViewer]);

  const handleMediaTouchEnd = useCallback((event: React.TouchEvent) => {
    if (!isTouchViewer) return;
    const start = touchStartRef.current;
    const last = touchLastRef.current;
    resetTouchNavigation();
    if (!start || !last || start.cancelled || event.changedTouches.length !== 1) return;

    const dx = last.x - start.x;
    const dy = last.y - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const durationMs = Date.now() - start.at;
    if (durationMs > 900) return;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390;
    const horizontalThreshold = Math.max(44, Math.min(92, viewportWidth * 0.12));
    if (zoom <= 1.05 && absX >= horizontalThreshold && absX > absY * 1.25) {
      onStep(dx < 0 ? 1 : -1);
      return;
    }

    if (absY >= 64 && absY > absX * 1.15) {
      setShowInfo(dy > 0);
    }
  }, [isTouchViewer, onStep, resetTouchNavigation, zoom]);

  useEffect(() => {
    if (!viewerPath || !file) {
      setMetadata(null);
      setMetadataError('');
      setMetadataLoading(false);
      return;
    }
    if (isLiveGenerationPreviewPath(viewerPath)) {
      setMetadata(getCachedViewerMetadata(viewerPath));
      setMetadataError('');
      setMetadataLoading(false);
      return;
    }

    const cached = getCachedViewerMetadata(viewerPath, file);
    if (cached) {
      setMetadata(cached);
      setMetadataError('');
      setMetadataLoading(false);
      return;
    }

    const controller = new AbortController();
    setMetadata(null);
    setMetadataError('');
    setMetadataLoading(true);

    fetchGalleryFs('/metadata', new URLSearchParams({ path: viewerPath }), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `Metadata scan failed (${response.status})`);
        }
        return response.json() as Promise<GalleryViewerMetadata>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const next = (payload || {}) as GalleryViewerMetadata;
        setCachedViewerMetadata(viewerPath, next, file);
        setMetadata(next);
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setMetadataError(error instanceof Error ? error.message : 'Metadata scan failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetadataLoading(false);
      });

    return () => controller.abort();
  }, [file, viewerPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom((current) => Math.min(4, Math.round((current + 0.25) * 100) / 100));
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom((current) => Math.max(0.25, Math.round((current - 0.25) * 100) / 100));
      } else if (event.key === '0') {
        event.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleViewerWorkflowAction = useCallback(async () => {
    if (!workflowJsonExport) return;
    if (metadata && apiWorkflowOpenInfo) {
      try {
        const workflowPayload = await resolveGalleryApiWorkflowOpenPayload(metadata, file?.name || 'API workflow');
        if (!workflowPayload) {
          throw new Error('No API workflow document was found in this image.');
        }
        setActiveWorkspace('comfyui');
        dispatchGalleryWorkflowOpen(workflowPayload);
      } catch (error) {
        addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to open API workflow in ComfyUI.' });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(workflowJsonExport.text);
      addToast({ type: 'success', message: `Copied ${workflowJsonExport.label}` });
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to copy workflow JSON' });
    }
  }, [addToast, apiWorkflowOpenInfo, file?.name, metadata, setActiveWorkspace, workflowJsonExport]);

  const renderUmbraSendMenu = () => (
    <details className="group relative">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded border border-cyan-300/20 text-cyan-200 hover:bg-cyan-400/10 [&::-webkit-details-marker]:hidden"
        title="Send to Umbra UI"
      >
        <Send size={15} />
      </summary>
      <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-md border border-cyan-300/25 bg-[#070a0c] p-1 shadow-2xl shadow-black/70">
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('txt2img', undefined, metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Sparkles size={12} className="text-emerald-300" /> TXT2IMG Parameters
        </button>
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('img2img', undefined, metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Images size={12} className="text-cyan-300" /> IMG2IMG
        </button>
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('inpaint', undefined, metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Paintbrush size={12} className="text-rose-300" /> Inpaint
        </button>
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('video', 'first', metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Clapperboard size={12} className="text-fuchsia-300" /> IMG2VID / First Frame
        </button>
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('video', 'middle', metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Clapperboard size={12} className="text-cyan-300" /> Video Middle Frame
        </button>
        <button type="button" disabled={isVideo} onClick={() => onSendUmbra('video', 'last', metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Clapperboard size={12} className="text-amber-300" /> Video Last Frame
        </button>
        <button type="button" disabled={!isVideo} onClick={() => onSendUmbra('video', 'source_video', metadata)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
          <Video size={12} className="text-emerald-300" /> VID2VID Source
        </button>
      </div>
    </details>
  );

  if (!file) return null;

  const viewerElement = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95 text-zinc-100"
      data-umbra-gallery-viewer
      data-umbra-gallery-viewer-info-open={showInfo ? '1' : '0'}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close media viewer"
        onClick={onClose}
      />

      <header data-umbra-gallery-viewer-header="" className="relative z-10 flex min-h-12 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-3">
        <div data-umbra-gallery-viewer-title="" className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{file.name || pathLeaf(file.path)}</div>
          <div className="truncate text-[11px] text-zinc-500">
            {viewerIndex >= 0 ? `${viewerIndex + 1}/${viewerTotal}` : 'Media'}{selectedCount > 1 ? ` - ${selectedCount} selected` : ''}{loadingMore ? ' - loading more...' : ''}
          </div>
        </div>

        <div data-umbra-gallery-viewer-actions="" className="flex items-center gap-1.5">
          {isPhoneViewer ? (
            <>
              <button type="button" data-umbra-gallery-viewer-action="close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Close">
                <X size={16} />
              </button>
              <button type="button" data-umbra-gallery-viewer-action="info" onClick={() => setShowInfo((current) => !current)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title={showInfo ? 'Hide info' : 'Show info'}>
                <Info size={15} />
              </button>
              {!isLivePreview && canSendWaifu ? renderUmbraSendMenu() : null}
              <button
                type="button"
                data-umbra-gallery-viewer-action={isLivePreview ? 'skip-live-preview' : 'delete'}
                onClick={isLivePreview ? handleSkipLivePreview : onDelete}
                disabled={isLivePreview && skipLivePreviewBusy}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded border disabled:opacity-50',
                  isLivePreview
                    ? 'border-amber-400/35 text-amber-200 hover:bg-amber-400/10'
                    : 'border-red-500/30 text-red-300 hover:bg-red-500/10',
                )}
                title={isLivePreview ? 'Skip current generation' : 'Move to trash'}
              >
                {isLivePreview ? (
                  skipLivePreviewBusy ? <Loader2 size={15} className="animate-spin" /> : <SkipForward size={15} />
                ) : <Trash2 size={15} />}
              </button>
            </>
          ) : (
            <>
              <button type="button" data-umbra-gallery-viewer-action="previous" onClick={() => onStep(-1)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Previous">
                <ChevronLeft size={16} />
              </button>
              <button type="button" data-umbra-gallery-viewer-action="next" onClick={() => onStep(1)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Next">
                <ChevronRight size={16} />
              </button>
              <div data-umbra-gallery-viewer-divider="" className="mx-1 h-5 w-px bg-white/10" />
              <button type="button" data-umbra-gallery-viewer-action="zoom-out" onClick={() => setZoom((current) => Math.max(0.25, Math.round((current - 0.25) * 100) / 100))} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Zoom out">
                <ZoomOut size={15} />
              </button>
              <button type="button" data-umbra-gallery-viewer-action="reset-zoom" onClick={() => setZoom(1)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Reset zoom">
                <RotateCcw size={14} />
              </button>
              <button type="button" data-umbra-gallery-viewer-action="zoom-in" onClick={() => setZoom((current) => Math.min(4, Math.round((current + 0.25) * 100) / 100))} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Zoom in">
                <ZoomIn size={15} />
              </button>
              <div data-umbra-gallery-viewer-zoom-label="" className="w-12 text-center text-[11px] text-zinc-500">{Math.round(zoom * 100)}%</div>
              <div data-umbra-gallery-viewer-divider="" className="mx-1 h-5 w-px bg-white/10" />
              {hostRevealAvailable && !isLivePreview ? (
                <button type="button" data-umbra-gallery-viewer-action="reveal" onClick={onReveal} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Show in Explorer">
                  <FolderOpen size={15} />
                </button>
              ) : null}
              {!isLivePreview ? (
                <>
                  {canSendWaifu ? renderUmbraSendMenu() : null}
                  <button type="button" data-umbra-gallery-viewer-action="copy" onClick={onCopyPath} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Copy path">
                    <Copy size={15} />
                  </button>
                  <button type="button" data-umbra-gallery-viewer-action="scanner" onClick={onSendScanner} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Send to Metadata Scanner">
                    <ScanSearch size={15} />
                  </button>
                  <button type="button" data-umbra-gallery-viewer-action="waifu" disabled={!canSendWaifu} onClick={onSendWaifu} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10 disabled:opacity-35" title="Send to Waifu Diffusion">
                    <Sparkles size={15} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                data-umbra-gallery-viewer-action={isLivePreview ? 'skip-live-preview' : 'delete'}
                onClick={isLivePreview ? handleSkipLivePreview : onDelete}
                disabled={isLivePreview && skipLivePreviewBusy}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded border disabled:opacity-50',
                  isLivePreview
                    ? 'border-amber-400/35 text-amber-200 hover:bg-amber-400/10'
                    : 'border-red-500/30 text-red-300 hover:bg-red-500/10',
                )}
                title={isLivePreview ? 'Skip current generation' : 'Move to trash'}
              >
                {isLivePreview ? (
                  skipLivePreviewBusy ? <Loader2 size={15} className="animate-spin" /> : <SkipForward size={15} />
                ) : <Trash2 size={15} />}
              </button>
              <button type="button" data-umbra-gallery-viewer-action="info" onClick={() => setShowInfo((current) => !current)} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title={showInfo ? 'Hide info' : 'Show info'}>
                <Info size={15} />
              </button>
              <button type="button" data-umbra-gallery-viewer-action="close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-zinc-300 hover:bg-white/10" title="Close">
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        <main
          data-umbra-gallery-viewer-media=""
          className={cn('relative min-w-0 flex-1 bg-black', zoom > 1 ? 'overflow-auto' : 'overflow-hidden')}
          onTouchStart={handleMediaTouchStart}
          onTouchMove={handleMediaTouchMove}
          onTouchEnd={handleMediaTouchEnd}
          onTouchCancel={resetTouchNavigation}
          style={isTouchViewer && zoom <= 1.05 ? { touchAction: 'pan-y pinch-zoom' } : undefined}
        >
          <div
            className={cn(
              'flex p-4 sm:p-6',
              zoom > 1
                ? 'min-h-full min-w-full items-start justify-start'
                : 'absolute inset-0 items-center justify-center',
            )}
          >
            {isVideo ? (
              <video key={imageSrc} src={imageSrc} controls autoPlay playsInline preload="metadata" className="h-full max-h-full w-full max-w-full object-contain" />
            ) : (
              <div
                className="flex flex-none items-center justify-center"
                style={zoom > 1 ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` } : { width: '100%', height: '100%' }}
              >
                <img
                  key={imageSrc || stillSrc}
                  src={isGif ? imageSrc : imageSrc || stillSrc}
                  alt={file.name}
                  draggable={false}
                  className="h-full max-h-full w-full max-w-full object-contain"
                />
              </div>
            )}
          </div>
          {canLoadMore ? (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-white/10 bg-black/70 px-2 py-1 text-[11px] text-zinc-400">
              More items will load as you step forward
            </div>
          ) : null}
        </main>

        {showInfo ? (
          <aside data-umbra-gallery-viewer-info="" className="w-[340px] shrink-0 overflow-y-auto border-l border-white/10 bg-zinc-950 px-4 py-3">
            <button
              type="button"
              data-umbra-gallery-viewer-info-handle=""
              onClick={() => setShowInfo(false)}
              className="hidden"
              aria-label="Hide media details"
            />
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Details</div>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-zinc-500">Path</dt>
                <dd className="mt-1 break-all text-zinc-300">{normalizePath(file.path)}</dd>
              </div>
              {sizeLabel ? <div><dt className="text-zinc-500">Size</dt><dd className="mt-1 text-zinc-300">{sizeLabel}</dd></div> : null}
              {dimensions ? <div><dt className="text-zinc-500">Dimensions</dt><dd className="mt-1 text-zinc-300">{dimensions}</dd></div> : null}
              {createdLabel ? <div><dt className="text-zinc-500">Created</dt><dd className="mt-1 text-zinc-300">{createdLabel}</dd></div> : null}
              {modifiedLabel ? <div><dt className="text-zinc-500">Modified</dt><dd className="mt-1 text-zinc-300">{modifiedLabel}</dd></div> : null}
              {metadataFormat ? <div><dt className="text-zinc-500">Metadata</dt><dd className="mt-1 text-zinc-300">{metadataFormat}</dd></div> : null}
            </dl>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Generation</div>
                {metadataLoading ? <Loader2 size={14} className="animate-spin text-zinc-500" /> : null}
              </div>
              {metadataError ? (
                <div className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">{metadataError}</div>
              ) : null}
              {!metadataLoading && !metadataError && generationRows.length === 0 && !positivePrompt && !negativePrompt && !metadataFormat ? (
                <div className="text-xs text-zinc-500">No embedded generation metadata found.</div>
              ) : null}
              {generationRows.length > 0 ? (
                <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                  {generationRows.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-zinc-500">{label}</dt>
                      <dd className="min-w-0 truncate text-zinc-300" title={String(value)}>{String(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : null}
              {positivePrompt ? (
                <div className="mt-4">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Positive</div>
                  <div className="custom-scrollbar max-h-64 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs leading-5 text-zinc-300">{positivePrompt}</div>
                </div>
              ) : null}
              {negativePrompt ? (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Negative</div>
                  <div className="custom-scrollbar max-h-56 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs leading-5 text-zinc-400">{negativePrompt}</div>
                </div>
              ) : null}
              {workflowJsonExport ? (
                <div className="mt-4 rounded border border-orange-500/20 bg-orange-500/[0.05] p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-300">
                        <FileJson size={13} />
                        <span className="truncate">{workflowJsonExport.label}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {apiWorkflowOpenInfo
                          ? 'Open API workflow in ComfyUI'
                          : (workflowJsonExport.kind === 'workflow' ? 'Visual workflow' : 'API prompt graph')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleViewerWorkflowAction}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded border border-orange-500/25 bg-black/25 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-orange-200 transition hover:border-orange-400/45 hover:bg-orange-500/10 hover:text-orange-100"
                    >
                      {apiWorkflowOpenInfo ? <FolderOpen size={12} /> : <Copy size={12} />}
                      {apiWorkflowOpenInfo ? 'Open' : 'Copy'}
                    </button>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300">
                      Preview JSON
                    </summary>
                    <pre className="custom-scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-white/10 bg-black/35 p-2 font-mono text-[10px] leading-4 text-zinc-400">
                      {workflowJsonExport.text}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
            {file.tags && file.tags.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {file.tags.map((tag) => (
                    <span key={tag} className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-zinc-300">{tag}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(viewerElement, document.body) : viewerElement;
}

function GalleryRenameModal({
  state,
  preview,
  onTemplateChange,
  onCancel,
  onSubmit,
}: {
  state: GalleryRenameModalState;
  preview: GalleryRenamePreviewItem[];
  onTemplateChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemCount = state.paths.length;
  const canSubmit = !state.submitting && state.template.trim().length > 0 && preview.some((item) => item.currentName !== item.nextName);

  const insertToken = useCallback((token: string) => {
    const input = inputRef.current;
    if (!input) {
      onTemplateChange(`${state.template}${token}`);
      return;
    }
    const start = input.selectionStart ?? state.template.length;
    const end = input.selectionEnd ?? state.template.length;
    const next = `${state.template.slice(0, start)}${token}${state.template.slice(end)}`;
    onTemplateChange(next);
    window.requestAnimationFrame(() => {
      input.focus();
      const cursor = start + token.length;
      input.setSelectionRange(cursor, cursor);
    });
  }, [onTemplateChange, state.template]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BaseModal
      isOpen
      onClose={onCancel}
      title={itemCount === 1 ? 'Rename Item' : `Rename ${itemCount} Items`}
      size="md"
    >
      <form
        data-umbra-gallery-modal-form=""
        data-umbra-gallery-tag-modal=""
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div className="text-xs text-zinc-500">Extensions are preserved automatically.</div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300" htmlFor="gallery-rename-template">Name template</label>
          <input
            id="gallery-rename-template"
            ref={inputRef}
            value={state.template}
            onChange={(event) => onTemplateChange(event.target.value)}
            disabled={state.submitting}
            className="h-9 w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)] disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RENAME_TEMPLATE_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                disabled={state.submitting}
                onClick={() => insertToken(token)}
                className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-white disabled:opacity-50"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-zinc-300">Preview</div>
          <div className="max-h-56 overflow-y-auto rounded border border-white/10 bg-black/20">
            {preview.slice(0, 12).map((item) => (
              <div key={item.path} className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 border-b border-white/5 px-3 py-2 last:border-b-0">
                <div className="truncate text-xs text-zinc-500" title={item.currentName}>{item.currentName}</div>
                <div className="text-center text-xs text-zinc-700">to</div>
                <div className="truncate text-xs text-zinc-200" title={item.nextName}>{item.nextName}</div>
              </div>
            ))}
            {preview.length > 12 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">{preview.length - 12} more items</div>
            ) : null}
          </div>
        </div>

        <div data-umbra-gallery-modal-footer="" className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={onCancel} disabled={state.submitting} className="h-8 rounded border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className="inline-flex h-8 items-center gap-2 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-3 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-45">
            {state.submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            Rename
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

function GalleryTagModal({
  state,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: GalleryTagModalState;
  onChange: (next: GalleryTagModalState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemCount = state.paths.length;
  const canSubmit = !state.submitting;
  const selectedSetIds = useMemo(() => {
    const setIds = normalizeTags(state.tags)
      .map(parseGallerySetTag)
      .filter((setId): setId is number => typeof setId === 'number');
    return Array.from(new Set(setIds)).sort((left, right) => left - right);
  }, [state.tags]);

  const setImageSets = useCallback((setIds: number[]) => {
    const nextTags = stripGallerySetTags(state.tags);
    const normalizedSetIds = Array.from(new Set(
      setIds
        .map((setId) => Math.floor(Number(setId)))
        .filter((setId) => Number.isFinite(setId) && setId >= 1 && setId <= POWER_PROMPTER_MAX_QUEUE_SETS),
    )).sort((left, right) => left - right);
    onChange({ ...state, tags: normalizeTags([...normalizedSetIds.map(gallerySetTag), ...nextTags]) });
  }, [onChange, state]);

  const toggleImageSet = useCallback((setId: number) => {
    setImageSets(
      selectedSetIds.includes(setId)
        ? selectedSetIds.filter((entry) => entry !== setId)
        : [...selectedSetIds, setId],
    );
  }, [selectedSetIds, setImageSets]);

  const addInputTags = useCallback(() => {
    const nextTags = normalizeTags([...state.tags, ...String(state.input || '').split(',')]);
    onChange({ ...state, tags: nextTags, input: '' });
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange, state]);

  const removeTag = useCallback((tagValue: string) => {
    const target = normalizeTag(tagValue).toLowerCase();
    onChange({
      ...state,
      tags: normalizeTags(state.tags.filter((tag) => normalizeTag(tag).toLowerCase() !== target)),
    });
  }, [onChange, state]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BaseModal
      isOpen
      onClose={onCancel}
      title={itemCount === 1 ? 'Edit Tags' : `Edit Tags (${itemCount})`}
      size="md"
    >
      <form
        data-umbra-gallery-modal-form=""
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.input.trim()) {
            addInputTags();
            return;
          }
          if (canSubmit) onSubmit();
        }}
      >
        <div className="text-xs text-zinc-500">
          Saves the exact tag list for {itemCount} item{itemCount === 1 ? '' : 's'}.
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-zinc-300">Image sets</label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={state.submitting}
                onClick={() => setImageSets(Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, index) => index + 1))}
                className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
              >
                All
              </button>
              <button
                type="button"
                disabled={state.submitting}
                onClick={() => setImageSets([])}
                className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"
              >
                Off
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, index) => index + 1).map((setId) => {
              const color = getGallerySetColor(setId);
              const active = selectedSetIds.includes(setId);
              return (
                <button
                  key={`gallery-tag-set-${setId}`}
                  type="button"
                  disabled={state.submitting}
                  onClick={() => toggleImageSet(setId)}
                  className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
                  style={{
                    color: active ? color : '#9ca3af',
                    borderColor: active ? hexToRgba(color, 0.52) : 'rgba(255,255,255,0.16)',
                    backgroundColor: active ? hexToRgba(color, 0.18) : 'rgba(255,255,255,0.03)',
                  }}
                  title={`Toggle Set ${setId}`}
                >
                  S{setId}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-24 rounded border border-white/10 bg-black/20 p-3">
          {state.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {state.tags.map((tag) => {
                const setId = parseGallerySetTag(tag);
                const setColor = setId ? getGallerySetColor(setId) : '';
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={state.submitting}
                    onClick={() => removeTag(tag)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] disabled:opacity-50',
                      setId ? '' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-red-400/40 hover:text-red-200',
                    )}
                    style={setId
                      ? {
                          color: setColor,
                          borderColor: hexToRgba(setColor, 0.42),
                          backgroundColor: hexToRgba(setColor, 0.1),
                        }
                      : undefined}
                    title={`Remove ${tag}`}
                  >
                    <span>{tag}</span>
                    <X size={11} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-16 items-center justify-center text-xs text-zinc-600">No tags. Add one below.</div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300" htmlFor="gallery-tag-input">Add tags</label>
          <div className="flex gap-2">
            <input
              id="gallery-tag-input"
              ref={inputRef}
              value={state.input}
              disabled={state.submitting}
              placeholder="Add tag and press Enter"
              onChange={(event) => onChange({ ...state, input: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ',') return;
                event.preventDefault();
                addInputTags();
              }}
              className="h-9 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)] disabled:opacity-60"
            />
            <button
              type="button"
              disabled={state.submitting || !state.input.trim()}
              onClick={addInputTags}
              className="h-9 rounded border border-zinc-800 bg-zinc-900/70 px-3 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-600">Comma separated tags are supported.</div>
        </div>

        <div data-umbra-gallery-modal-footer="" className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={onCancel} disabled={state.submitting} className="h-8 rounded border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className="inline-flex h-8 items-center gap-2 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-3 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-45">
            {state.submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            Save Tags
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

function GalleryFolderNameModal({
  state,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: GalleryFolderNameModalState;
  onChange: (next: GalleryFolderNameModalState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const title = state.mode === 'create' ? 'New Folder' : 'Rename Folder';
  const label = state.mode === 'create' ? 'Folder name' : 'New folder name';
  const trimmed = state.value.trim();
  const hasInvalidChars = /[<>:"/\\|?*]/.test(trimmed);
  const canSubmit = !state.submitting
    && trimmed.length > 0
    && !hasInvalidChars
    && (state.mode === 'create' || trimmed !== pathLeaf(state.folderPath));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <BaseModal
      isOpen
      onClose={onCancel}
      title={title}
      size="sm"
    >
      <form
        data-umbra-gallery-modal-form=""
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-500">
          <div className="truncate text-zinc-300" title={state.mode === 'create' ? state.parentPath : state.folderPath}>
            {state.mode === 'create' ? state.parentPath : state.folderPath}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-300" htmlFor="gallery-folder-name-input">{label}</label>
          <input
            id="gallery-folder-name-input"
            ref={inputRef}
            value={state.value}
            disabled={state.submitting}
            onChange={(event) => onChange({ ...state, value: event.target.value })}
            className="h-10 w-full rounded border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)] disabled:opacity-60"
          />
          <div className={cn('mt-1.5 text-[11px]', hasInvalidChars ? 'text-red-300' : 'text-zinc-600')}>
            {hasInvalidChars ? 'Folder names cannot contain < > : " / \\ | ? *' : 'Creates a folder inside the selected location.'}
          </div>
        </div>

        <div data-umbra-gallery-modal-footer="" className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={onCancel} disabled={state.submitting} className="h-8 rounded border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className="inline-flex h-8 items-center gap-2 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-3 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-45">
            {state.submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            {state.mode === 'create' ? 'Create' : 'Rename'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

function GalleryDeleteWarningModal({
  state,
  onCancel,
  onConfirm,
}: {
  state: GalleryDeleteWarningModalState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const folderCount = state.folders.length;
  const knownSubfolderCount = state.folders.reduce((total, folder) => total + Math.max(0, Math.trunc(Number(folder.subfolderCount || 0))), 0);
  const unknownSubfolderCount = state.folders.some((folder) => folder.subfolderCount == null);
  const knownMediaCount = state.folders.reduce((total, folder) => total + Math.max(0, Math.trunc(Number(folder.mediaCount || 0))), 0);
  const title = knownSubfolderCount > 0 || unknownSubfolderCount
    ? 'Move Folder Tree to Trash?'
    : 'Move Folder to Trash?';

  return (
    <BaseModal
      isOpen
      onClose={onCancel}
      title={title}
      size="md"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded border border-red-500/25 bg-red-500/10 p-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-300" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-red-100">
              This will move {folderCount} folder{folderCount === 1 ? '' : 's'} to Trash.
            </div>
            <p className="mt-1 text-xs leading-5 text-red-100/75">
              Folder deletes include everything inside them. If a selected folder has subfolders, those subfolders and their media go with it.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-lg font-black text-white">{folderCount}</div>
            <div className="text-zinc-500">folders</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-lg font-black text-white">{unknownSubfolderCount ? `${knownSubfolderCount}+` : knownSubfolderCount}</div>
            <div className="text-zinc-500">subfolders</div>
          </div>
          <div className="rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-lg font-black text-white">{knownMediaCount + state.mediaCount}</div>
            <div className="text-zinc-500">known media</div>
          </div>
        </div>

        <div className="max-h-56 overflow-y-auto rounded border border-white/10 bg-black/25">
          {state.folders.map((folder) => (
            <div key={folder.path} className="border-b border-white/5 px-3 py-2 last:border-b-0">
              <div className="truncate text-xs font-semibold text-zinc-100" title={folder.name}>{folder.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-500" title={folder.path}>{folder.path}</div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {folder.mediaCount != null ? `${folder.mediaCount} known media` : 'Media count unknown'}
                {' · '}
                {folder.subfolderCount != null ? `${folder.subfolderCount} subfolder${folder.subfolderCount === 1 ? '' : 's'}` : 'Subfolders unknown'}
              </div>
            </div>
          ))}
        </div>

        {state.mediaCount > 0 ? (
          <div className="text-xs text-zinc-500">
            Also moving {state.mediaCount} selected media item{state.mediaCount === 1 ? '' : 's'}.
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={onCancel} className="h-8 rounded border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex h-8 items-center gap-2 rounded border border-red-500/40 bg-red-500/15 px-3 text-xs font-semibold text-red-100 hover:bg-red-500/25">
            <Trash2 size={13} />
            Move to Trash
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function GalleryEmptyFolderCleanupModal({
  state,
  onCancel,
  onConfirm,
}: {
  state: GalleryEmptyFolderCleanupModalState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const folderCount = state.folders.length;

  return (
    <BaseModal
      isOpen
      onClose={onCancel}
      title="Clear Empty Folders?"
      size="md"
      showCloseButton={!state.submitting}
      closeOnEscape={!state.submitting}
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded border border-amber-500/25 bg-amber-500/10 p-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-200" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-amber-100">
              This will permanently remove {folderCount} empty folder{folderCount === 1 ? '' : 's'}.
            </div>
            <p className="mt-1 text-xs leading-5 text-amber-100/75">
              Only folders with no files and no remaining subfolders are listed. Media files are not deleted.
            </p>
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.03] p-2 text-xs">
          <div className="text-zinc-500">Root</div>
          <div className="mt-1 truncate font-semibold text-zinc-100" title={state.rootPath}>{state.rootPath}</div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded border border-white/10 bg-black/25">
          {state.folders.map((folderPath) => (
            <div key={folderPath} className="border-b border-white/5 px-3 py-2 last:border-b-0">
              <div className="truncate text-xs font-semibold text-zinc-100" title={pathLeaf(folderPath)}>{pathLeaf(folderPath)}</div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-500" title={folderPath}>{folderPath}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={state.submitting}
            className="h-8 rounded border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={state.submitting || folderCount <= 0}
            className="inline-flex h-8 items-center gap-2 rounded border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.submitting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Clear Empty Folders
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function getDatasetModifiedMs(dataset: Dataset): number {
  return Number((dataset as Dataset & { modifiedMs?: number }).modifiedMs || 0);
}

function getDatasetConceptModifiedMs(concept: Dataset['concepts'][number]): number {
  return Number((concept as Dataset['concepts'][number] & { modifiedMs?: number }).modifiedMs || 0);
}

function getDatasetConceptFolder(concept: Dataset['concepts'][number]): string {
  const explicitFolder = String((concept as Dataset['concepts'][number] & { folder?: string }).folder || '').trim();
  if (explicitFolder) return explicitFolder;
  return `${concept.repeats}_${concept.isReg ? 'reg_' : ''}${concept.name}`;
}

function GalleryDatasetTargetPicker({
  state,
  datasets,
  loading,
  onClose,
  onRefresh,
  onSelect,
}: {
  state: GalleryDatasetPickerState | null;
  datasets: Dataset[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (dataset: string, concept: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(() => new Set());
  const sortedDatasets = useMemo(() => (
    [...datasets]
      .sort((a, b) => getDatasetModifiedMs(b) - getDatasetModifiedMs(a) || a.name.localeCompare(b.name))
      .map((dataset) => ({
        ...dataset,
        concepts: [...dataset.concepts].sort((a, b) => (
          getDatasetConceptModifiedMs(b) - getDatasetConceptModifiedMs(a)
          || getDatasetConceptFolder(a).localeCompare(getDatasetConceptFolder(b), undefined, { numeric: true, sensitivity: 'base' })
        )),
      }))
  ), [datasets]);

  useEffect(() => {
    if (!state) return;
    setExpandedDatasets((current) => {
      if (current.size > 0 || sortedDatasets.length === 0) return current;
      return new Set([sortedDatasets[0].name]);
    });
  }, [sortedDatasets, state]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, state]);

  if (!state || typeof document === 'undefined') return null;

  const panelWidth = 360;
  const panelHeight = Math.min(520, Math.max(280, window.innerHeight - 24));
  const left = Math.min(Math.max(8, state.x), Math.max(8, window.innerWidth - panelWidth - 8));
  const top = Math.min(Math.max(8, state.y), Math.max(8, window.innerHeight - panelHeight - 8));
  const selectedCount = state.paths.length;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[10020] flex w-[360px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-[var(--umbra-border)] bg-[#05080a]/98 shadow-2xl shadow-black/70 backdrop-blur-xl"
      style={{ left, top, maxHeight: panelHeight }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <FolderOpen size={14} className="text-emerald-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-zinc-100">
            Add {selectedCount} Image{selectedCount === 1 ? '' : 's'} To Dataset
          </div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Newest first</div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="umbra-icon-button rounded p-1"
          title="Refresh datasets"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="umbra-icon-button rounded p-1"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
      <div className="custom-scrollbar max-h-[460px] overflow-y-auto p-2">
        {loading && sortedDatasets.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">Loading datasets...</div>
        ) : sortedDatasets.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            <div>No dataset concepts found.</div>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 rounded border border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-200 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedDatasets.map((dataset) => {
              const expanded = expandedDatasets.has(dataset.name);
              const conceptCount = dataset.concepts.length;
              return (
                <div key={dataset.name} className="rounded-md border border-white/10 bg-white/[0.025]">
                  <button
                    type="button"
                    onClick={() => setExpandedDatasets((current) => {
                      const next = new Set(current);
                      if (next.has(dataset.name)) next.delete(dataset.name);
                      else next.add(dataset.name);
                      return next;
                    })}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/5"
                  >
                    {expanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                    <FolderOpen size={14} className="text-amber-400" />
                    <span className="min-w-0 flex-1 truncate font-bold">{dataset.name}</span>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      {conceptCount}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="space-y-0.5 border-t border-white/10 p-1.5">
                      {dataset.concepts.length === 0 ? (
                        <div className="px-7 py-2 text-[11px] text-zinc-500">No concepts</div>
                      ) : dataset.concepts.map((concept) => {
                        const conceptFolder = getDatasetConceptFolder(concept);
                        const imageCount = Array.isArray(concept.images) ? concept.images.length : 0;
                        return (
                          <button
                            type="button"
                            key={`${dataset.name}:${conceptFolder}`}
                            onClick={() => onSelect(dataset.name, conceptFolder)}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-emerald-500/12 hover:text-emerald-100"
                          >
                            <ImageIcon size={13} className="text-emerald-300" />
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
                              concept.isReg ? 'border-cyan-400/25 text-cyan-200' : 'border-emerald-400/25 text-emerald-300'
                            }`}>
                              {concept.repeats}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {concept.isReg ? 'reg_' : ''}{concept.name}
                            </span>
                            <span className="text-[10px] text-zinc-500">{imageCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ReactGalleryWorkspace() {
  const appSettings = useStore((state) => state.appSettings);
  const externalOutputPath = useStore((state) => state.appSettings['comfyui.externalOutputPath']);
  const externalRootsSetting = useStore((state) => state.appSettings['library.externalRoots']);
  const externalRootsEnabled = useStore((state) => state.appSettings['library.enableExternalRoots'] !== false);
  const pinnedFoldersSetting = useStore((state) => state.appSettings['library.pinnedFolders']);
  const trashAutoDeleteSetting = useStore((state) => state.appSettings['library.trashAutoDeleteDays']);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const addScannedImport = useStore((state) => state.addScannedImport);
  const { addToast } = useToastStore();
  const syncUiAcrossDevices = appSettings['remote.syncUiAcrossDevices'] !== false;
  const remoteViewerOriginals = appSettings['remote.galleryViewerOriginals'] === true;
  const [remoteMode, setRemoteMode] = useState<string>(() => {
    if (typeof document === 'undefined') return 'desktop';
    return document.documentElement.dataset.umbraRemoteMode || 'desktop';
  });
  const [galleryMobileView, setGalleryMobileView] = useState<'folders' | 'media'>('folders');
  const galleryMobileViewRef = useRef<'folders' | 'media'>('folders');
  const isPhoneRemote = remoteMode === 'phone';
  const isRemoteClient = isRemoteGalleryClient();

  const rootPath = DEFAULT_OUTPUT_ROOT;
  const externalRoots = useMemo(() => uniqueNormalizedPaths([
    externalOutputPath,
    ...(externalRootsEnabled && Array.isArray(externalRootsSetting) ? externalRootsSetting : []),
  ]).filter((entry) => entry.toLowerCase() !== rootPath.toLowerCase()), [
    externalOutputPath,
    externalRootsEnabled,
    externalRootsSetting,
    rootPath,
  ]);
  const pinnedFolders = useMemo(() => (
    Array.isArray(pinnedFoldersSetting)
      ? Array.from(new Set(pinnedFoldersSetting.map((entry) => normalizePath(entry)).filter(Boolean)))
      : []
  ), [pinnedFoldersSetting]);
  const rootChoices = useMemo<GalleryRootChoice[]>(() => [
    {
      label: 'Comfy output',
      path: rootPath,
      kind: 'output',
    },
    ...externalRoots.map((path) => ({
      label: pathLeaf(path) || path,
      path,
      kind: 'external' as const,
    })),
    {
      label: 'Trash',
      path: TRASH_ROOT,
      kind: 'trash',
    },
  ], [externalRoots, rootPath]);

  const [currentFolder, setCurrentFolder] = useState(rootPath);
  const trashMode = isTrashPath(currentFolder);
  const [focusedFolder, setFocusedFolder] = useState(rootPath);
  const [, setOpenedFolders] = useState<string[]>([rootPath]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set([rootPath]));
  const [treeChildrenByPath, setTreeChildrenByPath] = useState<Record<string, GalleryFolderTreeNode[]>>({});
  const [loadingTreePaths, setLoadingTreePaths] = useState<Set<string>>(() => new Set());
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [liveGenerationPreviewFile, setLiveGenerationPreviewFile] = useState<GalleryFile | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState('');
  const [touchSelectionMode, setTouchSelectionMode] = useState(false);
  const [mobileMediaView, setMobileMediaView] = useState<GalleryMobileMediaView>('single');
  const [viewerPath, setViewerPath] = useState('');
  const [viewerSessionFiles, setViewerSessionFilesState] = useState<GalleryFile[]>([]);
  const [viewerFileFallback, setViewerFileFallback] = useState<GalleryFile | null>(null);
  const [restoredHighlightPaths, setRestoredHighlightPaths] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<GalleryContextMenuState | null>(null);
  const [datasetPicker, setDatasetPicker] = useState<GalleryDatasetPickerState | null>(null);
  const [renameModal, setRenameModal] = useState<GalleryRenameModalState | null>(null);
  const [tagModal, setTagModal] = useState<GalleryTagModalState | null>(null);
  const [folderNameModal, setFolderNameModal] = useState<GalleryFolderNameModalState | null>(null);
  const [deleteWarningModal, setDeleteWarningModal] = useState<GalleryDeleteWarningModalState | null>(null);
  const [emptyFolderCleanupModal, setEmptyFolderCleanupModal] = useState<GalleryEmptyFolderCleanupModalState | null>(null);
  const [sortBy, setSortBy] = useState<GallerySortBy>('created');
  const [sortOrder, setSortOrder] = useState<GallerySortOrder>('asc');
  const [groupBySet, setGroupBySet] = useState(false);
  const [setSortRules, setSetSortRules] = useState<Record<string, GallerySetSortRule>>({});
  const [galleryUiSessionHydrated, setGalleryUiSessionHydrated] = useState(false);
  const galleryUiSessionHydratedRef = useRef(false);
  const galleryUiSessionSaveTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GallerySearchPayload | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<GallerySearchSuggestion[]>([]);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(-1);
  const [metadataQuery, setMetadataQuery] = useState('');
  const [metadataMatches, setMetadataMatches] = useState<GalleryMetadataSearchMatch[]>([]);
  const [metadataSearchLoading, setMetadataSearchLoading] = useState(false);
  const [metadataSearchError, setMetadataSearchError] = useState('');
  const [tagFlyoutOpen, setTagFlyoutOpen] = useState(false);
  const [tagFlyoutLoading, setTagFlyoutLoading] = useState(false);
  const [tagFlyoutError, setTagFlyoutError] = useState('');
  const [tagFlyoutRemoteTags, setTagFlyoutRemoteTags] = useState<GalleryTagSummaryItem[]>([]);
  const [datasetTargets, setDatasetTargets] = useState<Dataset[]>([]);
  const [datasetTargetsLoading, setDatasetTargetsLoading] = useState(false);
  const [folderPreviewGroups, setFolderPreviewGroups] = useState<GalleryFolderPreviewGroup[]>([]);
  const [folderPreviewRefreshVersion, setFolderPreviewRefreshVersion] = useState(0);
  const [draggingPaths, setDraggingPaths] = useState<string[]>([]);
  const [dropTargetFolder, setDropTargetFolder] = useState('');
  const [transferInProgress, setTransferInProgress] = useState(false);
  const [transferProgress, setTransferProgress] = useState<GalleryTransferProgressState | null>(null);
  const [trashRetentionDays, setTrashRetentionDays] = useState(() => clampTrashRetentionDays(trashAutoDeleteSetting));
  const [savingTrashSettings, setSavingTrashSettings] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [collapsedTrashGroups, setCollapsedTrashGroups] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const [openingFolder, setOpeningFolder] = useState('');
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [done, setDone] = useState(false);
  const [total, setTotal] = useState(0);
  const [, setGalleryDirectBaseVersion] = useState(0);
  const loadSeqRef = useRef(0);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const filesRef = useRef<GalleryFile[]>([]);
  const knownFilesRef = useRef<GalleryFile[]>([]);
  const activeViewerFilesRef = useRef<GalleryFile[]>([]);
  const viewerSessionFilesRef = useRef<GalleryFile[]>([]);
  const followLiveGenerationViewerRef = useRef(false);
  const pendingDeletePathsRef = useRef<Set<string>>(new Set());
  const restoredHighlightTimersRef = useRef<number[]>([]);
  const selectedPathsRef = useRef<Set<string>>(new Set());
  const touchSelectionDragRef = useRef<{
    active: boolean;
    anchorPath: string;
    baseSelection: Set<string>;
    mode: 'select' | 'deselect';
    lastPath: string;
  } | null>(null);
  const skipNextSortReloadRef = useRef(false);
  const appendRequestKeyRef = useRef('');
  const pendingFilmstripLoadMoreRef = useRef(false);
  const viewportLoadMoreKeyRef = useRef('');
  const contentRefreshKeyRef = useRef('');
  const transferProgressHideTimerRef = useRef<number | null>(null);
  const pendingTrashUndoToastRef = useRef<{ timer: number | null; items: GalleryTrashUndoItem[] }>({
    timer: null,
    items: [],
  });
  const pendingRevealPathRef = useRef('');
  const directOutputSyncRef = useRef<Map<string, number>>(new Map());
  const dirtyAfterDeleteFoldersRef = useRef<Map<string, number>>(new Map());
  const folderSummarySnapshotRef = useRef<{ path: string; signature: string; totalMediaCount: number; subfolderCount: number } | null>(null);
  const folderSummaryPollInFlightRef = useRef(false);
  const currentFolderReconcileTimerRef = useRef<number | null>(null);
  const currentFolderReconcileInFlightRef = useRef<Promise<boolean> | null>(null);
  const currentFolderReconcileFolderRef = useRef('');
  const currentFolderLastReconcileAtRef = useRef(0);
  const treeChildrenRef = useRef<Record<string, GalleryFolderTreeNode[]>>({});
  const treeCacheRef = useRef<Map<string, GalleryFolderTreeNode[]>>(new Map());
  const treeRequestByPathRef = useRef<Map<string, Promise<GalleryFolderTreeNode[]>>>(new Map());
  const pageCacheRef = useRef<Map<string, GalleryPageCacheEntry>>(new Map());
  const folderLoadAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSuggestAbortRef = useRef<AbortController | null>(null);
  const metadataSearchAbortRef = useRef<AbortController | null>(null);
  const tagFlyoutAbortRef = useRef<AbortController | null>(null);
  const tagFlyoutRef = useRef<HTMLDivElement | null>(null);
  const folderPreviewAbortRef = useRef<AbortController | null>(null);
  const folderPreviewCacheRef = useRef<Map<string, GalleryFolderPreviewGroup>>(new Map());
  const folderPreviewGroupsRef = useRef<GalleryFolderPreviewGroup[]>([]);
  const trashAllFilesRef = useRef<GalleryFile[] | null>(null);
  const currentFolderRef = useRef(currentFolder);
  const initialGalleryFolderLoadedRef = useRef(false);
  const latestLocalFolderNavigationAtRef = useRef(Date.now());
  const latestAppliedGalleryUiSessionAtRef = useRef(0);
  const galleryUiSessionClientIdRef = useRef(createGalleryUiSessionClientId());
  const galleryUiSessionDirtyRef = useRef(false);
  const pendingLocalFolderNavigationRef = useRef<{ folder: string; at: number } | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const isTouchRemote = remoteMode === 'phone' || remoteMode === 'tablet';

  const markGalleryUiSessionDirty = useCallback(() => {
    galleryUiSessionDirtyRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const readRemoteMode = () => setRemoteMode(document.documentElement.dataset.umbraRemoteMode || 'desktop');
    readRemoteMode();
    window.addEventListener('umbra:remote-mode-change', readRemoteMode);
    return () => window.removeEventListener('umbra:remote-mode-change', readRemoteMode);
  }, []);

  useEffect(() => {
    galleryMobileViewRef.current = galleryMobileView;
  }, [galleryMobileView]);

  useEffect(() => {
    if (!isTouchRemote) setTouchSelectionMode(false);
  }, [isTouchRemote]);

  useEffect(() => {
    if (isTouchRemote && touchSelectionMode) {
      markGalleryUiSessionDirty();
      setMobileMediaView('grid');
    }
  }, [isTouchRemote, markGalleryUiSessionDirty, touchSelectionMode]);

  const setGalleryMobileViewWithHistory = useCallback((
    nextView: 'folders' | 'media',
    options: { pushHistory?: boolean } = {},
  ) => {
    const previousView = galleryMobileViewRef.current;
    markGalleryUiSessionDirty();
    setGalleryMobileView(nextView);
    galleryMobileViewRef.current = nextView;
    if (
      typeof window !== 'undefined'
      && isPhoneRemote
      && nextView === 'media'
      && previousView !== 'media'
      && options.pushHistory !== false
    ) {
      const historyState = window.history.state && typeof window.history.state === 'object'
        ? { ...window.history.state }
        : {};
      window.history.pushState({ ...historyState, umbraGalleryMobileView: 'media' }, '', window.location.href);
    }
  }, [isPhoneRemote, markGalleryUiSessionDirty]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isPhoneRemote) return;
    const handleGalleryBack = () => {
      if (galleryMobileViewRef.current !== 'media') return;
      markGalleryUiSessionDirty();
      setGalleryMobileView('folders');
      galleryMobileViewRef.current = 'folders';
    };
    window.addEventListener('popstate', handleGalleryBack);
    return () => window.removeEventListener('popstate', handleGalleryBack);
  }, [isPhoneRemote, markGalleryUiSessionDirty]);

  useEffect(() => {
    setTrashRetentionDays(clampTrashRetentionDays(trashAutoDeleteSetting));
  }, [trashAutoDeleteSetting]);

  useEffect(() => {
    let disposed = false;

    const probeDirectGalleryService = async () => {
      const applyBaseUrl = (value: unknown) => {
        const rawUrl = String(value || '').trim();
        if (!rawUrl) return false;
        try {
          const parsed = new URL(rawUrl, window.location.origin);
          const baseUrl = `${parsed.protocol}//${parsed.host}`;
          if (!GALLERY_DIRECT_BASE_URLS.some((candidate) => candidate === baseUrl)) return false;
          const changed = setGalleryDirectBaseUrl(baseUrl);
          if (changed) setGalleryDirectBaseVersion((current) => current + 1);
          return true;
        } catch {
          return false;
        }
      };

      try {
        const statusResponse = await fetch('/api/gallery-bridge/status', { cache: 'no-store' });
        if (statusResponse.ok) {
          const status = await statusResponse.json().catch(() => null) as { running?: boolean; healthy?: boolean; url?: string } | null;
          if (!disposed && status?.running && status?.healthy !== false && applyBaseUrl(status.url)) return;
        }
      } catch {
        // Startup and direct probes below cover source/dev cases where status is stale.
      }

      try {
        await fetch('/api/umbrabridge/backend/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'gallery' }),
        });
        await fetch('/api/umbrabridge/backend/wait-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'gallery', timeout: 30000 }),
        });
        const statusResponse = await fetch('/api/gallery-bridge/status', { cache: 'no-store' });
        if (statusResponse.ok) {
          const status = await statusResponse.json().catch(() => null) as { running?: boolean; healthy?: boolean; url?: string } | null;
          if (!disposed && status?.running && status?.healthy !== false && applyBaseUrl(status.url)) return;
        }
      } catch {
        // Fall through to direct loopback probes.
      }

      for (const baseUrl of GALLERY_DIRECT_BASE_URLS) {
        if (disposed) return;
        try {
          const response = await fetch(`${baseUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(1200) });
          const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
          if (response.ok && payload?.ok === true) {
            applyBaseUrl(baseUrl);
            return;
          }
        } catch {
          // Try the next loopback host.
        }
      }
    };

    void probeDirectGalleryService();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    currentFolderRef.current = currentFolder;
  }, [currentFolder]);

  useEffect(() => {
    selectedPathsRef.current = selectedPaths;
  }, [selectedPaths]);

  const selectedPathKeys = useMemo(() => new Set(
    Array.from(selectedPaths)
      .map(selectionPathKey)
      .filter(Boolean),
  ), [selectedPaths]);

  const getSelectionOrderedFiles = useCallback(() => {
    const active = activeViewerFilesRef.current;
    return active.length > 0 ? active : filesRef.current;
  }, []);

  const updateViewerSessionFiles = useCallback((nextFiles: GalleryFile[]) => {
    const next = uniqueGalleryMediaFiles(nextFiles);
    viewerSessionFilesRef.current = next;
    setViewerSessionFilesState(next);
  }, []);

  const getViewerOrderedFiles = useCallback(() => {
    const session = viewerSessionFilesRef.current;
    if (session.length > 0) return session;
    const active = activeViewerFilesRef.current;
    return active.length > 0 ? active : filesRef.current;
  }, []);

  useEffect(() => {
    treeChildrenRef.current = treeChildrenByPath;
  }, [treeChildrenByPath]);

  useEffect(() => {
    setCurrentFolder((current) => current || rootPath);
    setFocusedFolder((current) => current || rootPath);
  }, [rootPath]);

  const addOpenedFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setOpenedFolders((current) => {
      if (current[0] && pathsEqual(current[0], normalized)) return current;
      return [
        normalized,
        ...current.filter((entry) => !pathsEqual(entry, normalized)),
      ].slice(0, OPENED_FOLDER_LIMIT);
    });
  }, []);

  const focusFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setFocusedFolder((current) => (pathsEqual(current, normalized) ? current : normalized));
  }, []);

  const readCachedPage = useCallback((cacheKey: string): GalleryListPayload | null => {
    const cached = pageCacheRef.current.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > PAGE_CACHE_TTL_MS) {
      pageCacheRef.current.delete(cacheKey);
      return null;
    }
    pageCacheRef.current.delete(cacheKey);
    pageCacheRef.current.set(cacheKey, cached);
    return cloneGalleryListPayload(cached.payload);
  }, []);

  const writeCachedPage = useCallback((cacheKey: string, payload: GalleryListPayload) => {
    pageCacheRef.current.set(cacheKey, {
      payload: cloneGalleryListPayload(payload),
      cachedAt: Date.now(),
    });
    while (pageCacheRef.current.size > PAGE_CACHE_LIMIT) {
      const oldestKey = pageCacheRef.current.keys().next().value;
      if (!oldestKey) break;
      pageCacheRef.current.delete(oldestKey);
    }
  }, []);

  const clearPageCacheForFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath).toLowerCase();
    if (!normalized) return;
    for (const cacheKey of Array.from(pageCacheRef.current.keys())) {
      if (cacheKey.startsWith(`${normalized}${PAGE_CACHE_KEY_SEPARATOR}`)) {
        pageCacheRef.current.delete(cacheKey);
      }
    }
    for (const cacheKey of Array.from(folderPreviewCacheRef.current.keys())) {
      if (cacheKey.startsWith(`${normalized}${PAGE_CACHE_KEY_SEPARATOR}`)) {
        folderPreviewCacheRef.current.delete(cacheKey);
      }
    }
  }, []);

  const writeTreeChildrenCache = useCallback((folderPath: string, children: GalleryFolderTreeNode[]) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const nextChildren = [...children].sort((a, b) => (
      String(a.name || pathLeaf(a.path)).localeCompare(String(b.name || pathLeaf(b.path)), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    ));
    treeCacheRef.current.delete(normalized);
    treeCacheRef.current.set(normalized, nextChildren);
    while (treeCacheRef.current.size > TREE_CACHE_LIMIT) {
      const oldestKey = treeCacheRef.current.keys().next().value;
      if (!oldestKey) break;
      treeCacheRef.current.delete(oldestKey);
    }
    treeChildrenRef.current = {
      ...treeChildrenRef.current,
      [normalized]: nextChildren,
    };
    setTreeChildrenByPath((current) => {
      const existing = current[normalized];
      if (
        existing
        && existing.length === nextChildren.length
        && existing.every((child, index) => pathsEqual(child.path, nextChildren[index]?.path))
      ) {
        return current;
      }
      return {
        ...current,
        [normalized]: nextChildren,
      };
    });
  }, []);

  const invalidateTreeChildrenCache = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    treeCacheRef.current.delete(normalized);
    delete treeChildrenRef.current[normalized];
    setTreeChildrenByPath((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, normalized)) return current;
      const next = { ...current };
      delete next[normalized];
      return next;
    });
  }, []);

  const loadTreeChildren = useCallback((folderPath: string, force = false): Promise<GalleryFolderTreeNode[]> => {
    const normalized = normalizePath(folderPath);
    if (!normalized || normalized === TRASH_ROOT || normalized.startsWith(`${TRASH_ROOT}/`)) {
      writeTreeChildrenCache(normalized, []);
      return Promise.resolve([]);
    }
    if (!force) {
      const cached = treeCacheRef.current.get(normalized) || treeChildrenRef.current[normalized];
      if (cached) {
        treeCacheRef.current.delete(normalized);
        treeCacheRef.current.set(normalized, cached);
        writeTreeChildrenCache(normalized, cached);
        return Promise.resolve(cached);
      }
    }

    const existingRequest = force ? null : treeRequestByPathRef.current.get(normalized);
    if (existingRequest) return existingRequest;

    setLoadingTreePaths((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      return next;
    });

    const treeStartedAt = nowMs();
    const request = (async () => {
      const params = new URLSearchParams({ path: normalized, maxDepth: '0' });
      if (force) params.set('force', '1');
      const response = await fetchGalleryFs('/tree', params, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TREE_FETCH_TIMEOUT_MS),
      });
      const jsonStartedAt = nowMs();
      const payload = await response.json().catch(() => ({} as { folders?: GalleryFolderTreeNode[]; error?: string }));
      const jsonMs = nowMs() - jsonStartedAt;
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to load folders'));
      const nextFolders = Array.isArray(payload.folders)
        ? payload.folders.map((folder) => ({
          ...folder,
          name: String(folder.name || pathLeaf(folder.path)),
          path: normalizePath(folder.path),
          relativePath: normalizePath(folder.relativePath || folder.path),
          hasChildren: folder.hasChildren !== false,
        }))
        : [];
      writeTreeChildrenCache(normalized, nextFolders);
      traceGalleryLoad({
        event: 'tree_complete',
        folderPath: normalized,
        status: response.status,
        core: response.headers.get('x-gallery-core') || '',
        bridgeMs: response.headers.get('x-gallery-bridge-ms') || '',
        jsonMs,
        folders: nextFolders.length,
        durationMs: nowMs() - treeStartedAt,
      });
      return nextFolders;
    })().catch((treeError) => {
      traceGalleryLoad({
        event: 'tree_error',
        folderPath: normalized,
        error: treeError instanceof Error ? treeError.message : 'Failed to load folders',
        durationMs: nowMs() - treeStartedAt,
      });
      writeTreeChildrenCache(normalized, []);
      return [];
    }).finally(() => {
      treeRequestByPathRef.current.delete(normalized);
      setLoadingTreePaths((current) => {
        const next = new Set(current);
        next.delete(normalized);
        return next;
      });
    });

    treeRequestByPathRef.current.set(normalized, request);
    return request;
  }, [writeTreeChildrenCache]);

  const toggleTreeExpand = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
    if (!Object.prototype.hasOwnProperty.call(treeChildrenRef.current, normalized)) {
      void loadTreeChildren(normalized);
    }
  }, [loadTreeChildren]);

  const refreshTreeChildren = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    invalidateTreeChildrenCache(normalized);
    setExpandedFolders((current) => {
      if (current.has(normalized)) return current;
      const next = new Set(current);
      next.add(normalized);
      return next;
    });
    void loadTreeChildren(normalized, true);
  }, [invalidateTreeChildrenCache, loadTreeChildren]);

  const previewEmptyFolderCleanup = useCallback(async (folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized || isTrashPath(normalized)) return;
    try {
      const response = await fetchGalleryFs('/empty-folders/preview', new URLSearchParams(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: normalized }),
      });
      const payload = await response.json().catch(() => ({} as { rootPath?: string; folders?: string[]; error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to scan empty folders'));
      const folders = Array.isArray(payload.folders)
        ? payload.folders.map(normalizePath).filter(Boolean)
        : [];
      if (folders.length <= 0) {
        addToast({ type: 'info', message: 'No empty folders found' });
        return;
      }
      setEmptyFolderCleanupModal({
        rootPath: normalizePath(payload.rootPath || normalized),
        folders,
        submitting: false,
      });
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to scan empty folders' });
    }
  }, [addToast]);

  const emitFolderChanged = useCallback((folderPath: string) => {
    window.dispatchEvent(new CustomEvent('umbra:gallery-folder-changed', {
      detail: {
        path: folderPath,
        folderPath,
        source: 'react-gallery',
      },
    }));
  }, []);

  const emitFilmstripFeed = useCallback((folderPath: string, nextFiles: GalleryFile[], payload?: Partial<GalleryListPayload>) => {
    window.dispatchEvent(new CustomEvent('umbra:gallery-filmstrip-feed', {
      detail: {
        path: folderPath,
        folderPath,
        files: nextFiles.map(galleryFileForFilmstrip),
        mode: payload?.mode || 'replace',
        done: payload?.done ?? done,
        nextCursor: payload?.nextCursor ?? nextCursor,
        total: payload?.total ?? total,
        sortBy,
        sortOrder,
        source: 'react-gallery',
      },
    }));
  }, [done, nextCursor, sortBy, sortOrder, total]);

  const emitSelectionChanged = useCallback((paths: string[], primaryPath?: string) => {
    window.dispatchEvent(new CustomEvent('umbra:gallery-selection-changed', {
      detail: {
        paths,
        selectedPaths: paths,
        primaryPath: primaryPath || paths.at(-1) || '',
        folderPath: currentFolder,
        source: 'react-gallery',
      },
    }));
  }, [currentFolder]);

  const applyGallerySelection = useCallback((nextSelection: Set<string>, primaryPath: string) => {
    setSelectedPaths(nextSelection);
    selectedPathsRef.current = nextSelection;
    setLastSelectedPath(primaryPath);
    emitSelectionChanged(Array.from(nextSelection), primaryPath);
  }, [emitSelectionChanged]);

  const clearTrashCache = useCallback(() => {
    trashAllFilesRef.current = null;
    clearPageCacheForFolder(TRASH_ROOT);
  }, [clearPageCacheForFolder]);

  const fetchTrashListPayload = useCallback(async (
    folderPath: string,
    cursor: number,
    signal?: AbortSignal,
  ): Promise<GalleryListPayload> => {
    const normalizedFolder = normalizePath(folderPath);
    if (isTrashRootPath(normalizedFolder)) {
      if (!trashAllFilesRef.current) {
        const response = await fetch('/api/trash/list', { cache: 'no-store', signal });
        const payload = await response.json().catch(() => ({} as { items?: TrashMetadataItem[]; error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to load Trash'));
        trashAllFilesRef.current = (Array.isArray(payload.items) ? payload.items : [])
          .map((entry, index) => toTrashGalleryFile(entry, index))
          .filter((file): file is GalleryFile => Boolean(file))
          .sort((left, right) => {
            const expiresDelta = getTrashExpiresMs(left) - getTrashExpiresMs(right);
            if (expiresDelta !== 0) return expiresDelta;
            const createdDelta = Number(left.createdMs || 0) - Number(right.createdMs || 0);
            if (createdDelta !== 0) return createdDelta;
            return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
          });
      }
      const allFiles = trashAllFilesRef.current || [];
      const page = cursor <= 0 ? allFiles : [];
      return {
        folders: [],
        files: page,
        total: allFiles.length,
        done: true,
        nextCursor: null,
      };
    }

    const params = new URLSearchParams({
      path: normalizedFolder,
      offset: String(cursor),
      limit: String(PAGE_SIZE),
      recursive: 'false',
    });
    const response = await fetch(`/api/fs/list?${params.toString()}`, { cache: 'no-store', signal });
    const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string; hasMore?: boolean }));
    if (!response.ok) throw new Error(String(payload?.error || 'Failed to load Trash folder'));
    const files = Array.isArray(payload.files)
      ? payload.files.map((file, index) => normalizeGalleryFile(file, cursor + index))
      : [];
    const foldersAsFiles = Array.isArray(payload.folders)
      ? payload.folders.map((folder, index) => normalizeGalleryFile({
        uid: `folder:${normalizePath(folder.path)}`,
        id: `folder:${normalizePath(folder.path)}`,
        name: folder.name || pathLeaf(folder.path),
        path: normalizePath(folder.path),
        type: 'folder',
        customOrder: cursor + index,
        trashOriginalPath: (folder as any).trashOriginalPath,
        trashDeletedAt: (folder as any).trashDeletedAt,
        trashExpiresAt: (folder as any).trashExpiresAt,
      }, cursor + index))
      : [];
    const combined = cursor === 0 ? [...foldersAsFiles, ...files] : files;
    const hasMore = Boolean((payload as any).hasMore);
    return {
      folders: [],
      files: combined,
      total: Math.max(Number(payload.total || combined.length), cursor + combined.length),
      done: !hasMore,
      nextCursor: hasMore ? cursor + files.length : null,
    };
  }, []);

  const fetchFolderSummary = useCallback(async (
    folderPath: string,
    force = false,
    signal?: AbortSignal,
  ): Promise<GalleryFolderSummary> => {
    const normalized = normalizePath(folderPath);
    if (!normalized) throw new Error('Folder path required');
    const params = new URLSearchParams({ path: normalized });
    if (force) params.set('force', '1');
    const response = await fetchGalleryFs('/folder-summary', params, {
      cache: 'no-store',
      signal,
    });
    const payload = await response.json().catch(() => ({} as GalleryFolderSummary & { error?: string }));
    if (!response.ok) throw new Error(String((payload as GalleryFolderSummary & { error?: string })?.error || 'Failed to summarize folder'));
    return payload;
  }, []);

  const loadFolder = useCallback(async (options?: {
    folder?: string;
    append?: boolean;
    cursor?: number;
    keepSelection?: boolean;
    forceRefresh?: boolean;
    preserveScroll?: boolean;
    source?: 'local' | 'session' | 'system';
  }) => {
    const folderPath = normalizePath(options?.folder || currentFolder || rootPath);
    if (!folderPath) return;
    const cursor = Math.max(0, Math.trunc(Number(options?.cursor ?? 0)));
    const append = options?.append === true;
    const preserveScroll = options?.preserveScroll === true && pathsEqual(folderPath, currentFolder);
    const preservedScrollTop = preserveScroll ? (scrollParentRef.current?.scrollTop ?? 0) : 0;
    const appendRequestKey = append ? `${folderPath}|${cursor}|${sortBy}|${sortOrder}` : '';
    if (appendRequestKey && appendRequestKeyRef.current === appendRequestKey) return;
    if (appendRequestKey) appendRequestKeyRef.current = appendRequestKey;
    const seq = ++loadSeqRef.current;
    const loadSource = options?.source || 'system';
    if (!append && loadSource === 'local') {
      const navigationAt = Date.now();
      latestLocalFolderNavigationAtRef.current = navigationAt;
      pendingLocalFolderNavigationRef.current = { folder: folderPath, at: navigationAt };
      markGalleryUiSessionDirty();
    }
    const loadStartedAt = nowMs();
    const cacheKey = galleryPageCacheKey(folderPath, cursor, sortBy, sortOrder);
    const isTrashFolder = isTrashPath(folderPath);
    const cachedPayload = !isTrashFolder && !options?.forceRefresh && !append && cursor === 0 ? readCachedPage(cacheKey) : null;
    let abortController: AbortController | null = null;

    const applyPayload = (payload: GalleryListPayload) => {
      const incomingFiles = Array.isArray(payload.files) ? payload.files : [];
      const incomingFolders = Array.isArray(payload.folders) ? payload.folders : [];
      const currentFiles = filesRef.current;
      let nextFiles = incomingFiles;
      let appendedFiles = incomingFiles.length;
      if (append) {
        const seen = new Set(currentFiles.map((file) => normalizePath(file.path).toLowerCase()));
        const additions = incomingFiles.filter((file) => {
          const key = normalizePath(file.path).toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        nextFiles = additions.length > 0 ? [...currentFiles, ...additions] : currentFiles;
        appendedFiles = additions.length;
      }

      if (!append && seq !== loadSeqRef.current) {
        return {
          incomingFiles,
          appendedFiles: 0,
          nextFiles: filesRef.current,
          stale: true,
        };
      }
      setCurrentFolder((current) => (pathsEqual(current, folderPath) ? current : folderPath));
      setFocusedFolder((current) => (pathsEqual(current, folderPath) ? current : folderPath));
      setOpeningFolder((current) => (current && pathsEqual(current, folderPath) ? '' : current));
      const pendingNavigation = pendingLocalFolderNavigationRef.current;
      if (pendingNavigation && pathsEqual(pendingNavigation.folder, folderPath)) {
        pendingLocalFolderNavigationRef.current = null;
      }
      const incomingTreeNodes = galleryFoldersToTreeNodes(incomingFolders);
      if (!append) {
        writeTreeChildrenCache(folderPath, incomingTreeNodes);
      } else if (incomingTreeNodes.length > 0) {
        const existing = treeCacheRef.current.get(folderPath) || treeChildrenRef.current[folderPath] || [];
        const seen = new Set(existing.map((folder) => normalizePath(folder.path).toLowerCase()));
        const additions = incomingTreeNodes.filter((folder) => {
          const key = normalizePath(folder.path).toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (additions.length > 0) writeTreeChildrenCache(folderPath, [...existing, ...additions]);
      }
      setTreeChildrenByPath((current) => {
        if (!append) {
          return {
            ...current,
            [folderPath]: incomingTreeNodes,
          };
        }
        if (incomingFolders.length === 0) return current;
        const existing = current[folderPath] || [];
        const seen = new Set(existing.map((folder) => normalizePath(folder.path).toLowerCase()));
        const additions = incomingTreeNodes.filter((folder) => {
          const key = normalizePath(folder.path).toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (additions.length === 0) return current;
        return {
          ...current,
          [folderPath]: [...existing, ...additions],
        };
      });
      filesRef.current = nextFiles;
      setFiles(nextFiles);
      setDone(payload.done === true);
      setNextCursor(typeof payload.nextCursor === 'number' ? payload.nextCursor : null);
      setTotal(Math.max(0, Math.trunc(Number(payload.total || nextFiles.length))));
      if (!append && options?.keepSelection !== true) {
        setSelectedPaths(new Set());
        setLastSelectedPath('');
        emitSelectionChanged([]);
      }
      emitFolderChanged(folderPath);
      emitFilmstripFeed(folderPath, incomingFiles, {
        ...payload,
        mode: append ? 'append' : 'replace',
      });
      if (preserveScroll) {
        window.requestAnimationFrame(() => {
          const node = scrollParentRef.current;
          if (!node) return;
          node.scrollTop = Math.min(preservedScrollTop, Math.max(0, node.scrollHeight - node.clientHeight));
        });
      }
      return { incomingFiles, appendedFiles, nextFiles, stale: false };
    };

    if (!append) {
      setFocusedFolder((current) => (pathsEqual(current, folderPath) ? current : folderPath));
      addOpenedFolder(folderPath);
      if (!preserveScroll) scrollParentRef.current?.scrollTo({ top: 0 });
      setOpeningFolder((current) => (pathsEqual(current, folderPath) ? current : folderPath));
      if (cachedPayload) {
        const cachedResult = applyPayload(cachedPayload);
        if (cachedResult.stale) return;
        traceGalleryLoad({
          event: 'cache_hit',
          folderPath,
          cursor,
          limit: PAGE_SIZE,
          durationMs: nowMs() - loadStartedAt,
          incomingFiles: cachedResult.incomingFiles.length,
          loadedFiles: cachedResult.nextFiles.length,
          total: cachedPayload.total ?? cachedResult.nextFiles.length,
        });
        if (!options?.forceRefresh) {
          return;
        }
      }
    }
    abortController = new AbortController();
    folderLoadAbortRef.current?.abort();
    folderLoadAbortRef.current = abortController;
    if (!cachedPayload || append) setLoading(true);
    setError('');
    try {
      const fetchStartedAt = nowMs();
      let status = 200;
      let core = isTrashFolder ? 'main-trash' : '';
      let bridgeMs = '';
      let fallback = '';
      let jsonMs = 0;
      let payload: GalleryListPayload;
      if (isTrashFolder) {
        const responseStartedAt = nowMs();
        payload = await fetchTrashListPayload(folderPath, cursor, abortController.signal);
        jsonMs = nowMs() - responseStartedAt;
      } else {
        const params = new URLSearchParams({
          path: folderPath,
          cursor: String(cursor),
          limit: String(PAGE_SIZE),
          sortBy,
          sortOrder,
          fast: '1',
          recursive: 'false',
        });
        if (options?.forceRefresh) {
          params.set('force', '1');
        }
        const response = await fetchGalleryFs('/list-progressive', params, { signal: abortController.signal });
        const responseStartedAt = nowMs();
        payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
        jsonMs = nowMs() - responseStartedAt;
        if (!response.ok) throw new Error(String((payload as GalleryListPayload & { error?: string })?.error || 'Failed to load gallery folder'));
        status = response.status;
        core = response.headers.get('x-gallery-core') || response.headers.get('X-Gallery-Core') || '';
        bridgeMs = response.headers.get('x-gallery-bridge-ms') || response.headers.get('X-Gallery-Bridge-Ms') || '';
        fallback = response.headers.get('x-gallery-fallback') || response.headers.get('X-Gallery-Fallback') || '';
      }
      const fetchMs = nowMs() - fetchStartedAt;
      if (seq !== loadSeqRef.current) return;

      const prepareStartedAt = nowMs();
      if (!isTrashFolder) writeCachedPage(cacheKey, payload);
      const applied = applyPayload(payload);
      if (applied.stale) return;
      traceGalleryLoad({
        event: append ? 'append_complete' : 'replace_complete',
        folderPath,
        cursor,
        limit: PAGE_SIZE,
        fetchMs: Math.round(fetchMs * 10) / 10,
        jsonMs: Math.round(jsonMs * 10) / 10,
        status,
        core,
        bridgeMs,
        fallback,
        prepareMs: Math.round((nowMs() - prepareStartedAt) * 10) / 10,
        durationMs: nowMs() - loadStartedAt,
        incomingFiles: applied.incomingFiles.length,
        appendedFiles: applied.appendedFiles,
        loadedFiles: applied.nextFiles.length,
        nextCursor: payload.nextCursor ?? null,
        done: payload.done === true,
        total: payload.total ?? applied.nextFiles.length,
      });
    } catch (loadError) {
      if (isAbortError(loadError)) return;
      const message = loadError instanceof Error ? loadError.message : 'Failed to load gallery folder';
      if (!isTrashFolder && isMissingGalleryFolderMessage(message)) {
        clearPageCacheForFolder(folderPath);
        invalidateTreeChildrenCache(folderPath);
        const parentFolder = pathParent(folderPath);
        if (parentFolder && !pathsEqual(parentFolder, folderPath)) {
          invalidateTreeChildrenCache(parentFolder);
          void loadTreeChildren(parentFolder, true);
        }
        const missingPayload: GalleryListPayload = {
          folders: [],
          files: [],
          done: true,
          nextCursor: null,
          total: 0,
          sortBy,
          sortOrder,
        };
        const applied = applyPayload(missingPayload);
        if (!applied.stale) {
          traceGalleryLoad({
            event: 'missing_folder_cleared',
            folderPath,
            cursor,
            limit: PAGE_SIZE,
            durationMs: nowMs() - loadStartedAt,
            error: message,
          });
        }
        return;
      }
      if (options?.forceRefresh && !isTrashFolder) {
        const parentFolder = pathParent(folderPath);
        if (parentFolder && !pathsEqual(parentFolder, folderPath)) {
          invalidateTreeChildrenCache(parentFolder);
          void loadTreeChildren(parentFolder, true);
        }
      }
      traceGalleryLoad({
        event: append ? 'append_error' : 'replace_error',
        folderPath,
        cursor,
        limit: PAGE_SIZE,
        durationMs: nowMs() - loadStartedAt,
        error: message,
      });
      setError(message);
      addToast({ type: 'error', message });
    } finally {
      if (appendRequestKey && appendRequestKeyRef.current === appendRequestKey) {
        appendRequestKeyRef.current = '';
      }
      if (abortController && folderLoadAbortRef.current === abortController) {
        folderLoadAbortRef.current = null;
      }
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setOpeningFolder('');
      }
    }
  }, [addOpenedFolder, addToast, currentFolder, emitFilmstripFeed, emitFolderChanged, emitSelectionChanged, fetchTrashListPayload, invalidateTreeChildrenCache, loadTreeChildren, markGalleryUiSessionDirty, readCachedPage, rootPath, sortBy, sortOrder, writeCachedPage, writeTreeChildrenCache]);

  const refreshCurrentFolderFromDisk = useCallback(() => {
    const folderPath = normalizePath(currentFolder || rootPath);
    if (!folderPath) return;
    clearPageCacheForFolder(folderPath);
    invalidateTreeChildrenCache(folderPath);
    void loadTreeChildren(folderPath, true);
    const parentFolder = pathParent(folderPath);
    if (parentFolder && !pathsEqual(parentFolder, folderPath)) {
      clearPageCacheForFolder(parentFolder);
      invalidateTreeChildrenCache(parentFolder);
      void loadTreeChildren(parentFolder, true);
    }
    void loadFolder({
      folder: folderPath,
      keepSelection: true,
      forceRefresh: true,
      preserveScroll: true,
    });
  }, [
    clearPageCacheForFolder,
    currentFolder,
    invalidateTreeChildrenCache,
    loadFolder,
    loadTreeChildren,
    rootPath,
  ]);

  const reconcileCurrentFolderInPlace = useCallback(async (
    folderPathInput: string,
    summary: GalleryFolderSummary,
    reason = 'summary-poll',
  ): Promise<boolean> => {
    const folderPath = normalizePath(folderPathInput);
    if (!folderPath || isTrashPath(folderPath)) return false;
    if (!pathsEqual(folderPath, currentFolderRef.current)) return false;
    if (currentFolderReconcileInFlightRef.current) {
      return pathsEqual(currentFolderReconcileFolderRef.current, folderPath)
        ? currentFolderReconcileInFlightRef.current
        : false;
    }

    const reconcilePromise = (async () => {
      const startedAt = nowMs();
      const isStillCurrentFolder = () => pathsEqual(folderPath, currentFolderRef.current);
      if (!isStillCurrentFolder()) return false;

      const currentFiles = filesRef.current;
      const summaryTotal = Math.max(0, Math.trunc(Number(summary.totalMediaCount || 0)));
      const currentTotal = Math.max(0, Math.trunc(Number(total || currentFiles.length)));

      if (summaryTotal < currentFiles.length) {
        if (!isStillCurrentFolder()) return false;
        clearPageCacheForFolder(folderPath);
        await loadFolder({ folder: folderPath, keepSelection: true, forceRefresh: true, preserveScroll: true });
        if (!isStillCurrentFolder()) return false;
        traceGalleryLoad({
          event: 'summary_reconcile_full_refresh',
          folderPath,
          reason,
          previousTotal: currentTotal,
          summaryTotal,
          durationMs: nowMs() - startedAt,
        });
        return true;
      }

      const requestLimit = Math.min(
        CURRENT_FOLDER_RECONCILE_MAX_LIMIT,
        Math.max(PAGE_SIZE, Math.min(currentFiles.length + PAGE_SIZE, CURRENT_FOLDER_RECONCILE_MAX_LIMIT)),
      );
      const params = new URLSearchParams({
        path: folderPath,
        cursor: '0',
        limit: String(requestLimit),
        sortBy,
        sortOrder,
        fast: '1',
        recursive: 'false',
      });
      const response = await fetchGalleryFs('/list-progressive', params, { cache: 'no-store' });
      if (!isStillCurrentFolder()) return false;
      const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
      if (!isStillCurrentFolder()) return false;
      if (!response.ok) throw new Error(String((payload as GalleryListPayload & { error?: string })?.error || 'Failed to reconcile gallery folder'));

      const incomingFiles = Array.isArray(payload.files)
        ? payload.files.map((file, index) => normalizeGalleryFile(file, index))
        : [];
      const incomingFolders = Array.isArray(payload.folders) ? galleryFoldersToTreeNodes(payload.folders) : [];
      if (incomingFolders.length > 0) {
        writeTreeChildrenCache(folderPath, incomingFolders);
      }

      const existingByPath = new Map(currentFiles.map((file) => [normalizePath(file.path).toLowerCase(), file]));
      const mergedByPath = new Map<string, GalleryFile>();
      for (const file of currentFiles) {
        const key = normalizePath(file.path).toLowerCase();
        if (key) mergedByPath.set(key, file);
      }

      let added = 0;
      let updated = 0;
      const additions: GalleryFile[] = [];
      for (const incoming of incomingFiles) {
        const key = normalizePath(incoming.path).toLowerCase();
        if (!key) continue;
        const previous = existingByPath.get(key);
        const merged = mergeGalleryFilePreservingIdentity(previous, incoming);
        if (!previous) {
          added += 1;
          additions.push(merged);
        } else if (merged !== previous) {
          updated += 1;
        }
        mergedByPath.set(key, merged);
      }

      const nextFiles = Array.from(mergedByPath.values()).sort((left, right) => compareGalleryFiles(left, right, sortBy, sortOrder));
      if (!galleryFileArraysEquivalent(currentFiles, nextFiles)) {
        filesRef.current = nextFiles;
        setFiles(nextFiles);
      }

      const nextTotal = Math.max(summaryTotal, Number(payload.total || 0), nextFiles.length);
      const nextDone = nextTotal <= nextFiles.length || payload.done === true;
      setTotal(nextTotal);
      setDone(nextDone);
      setNextCursor(nextDone ? null : nextFiles.length);
      clearPageCacheForFolder(folderPath);

      if (added > 0 || updated > 0) {
        emitFilmstripFeed(folderPath, added > 0 ? additions : nextFiles, {
          mode: added > 0 ? 'append' : 'replace',
          files: added > 0 ? additions : nextFiles,
          total: nextTotal,
          done: nextDone,
          nextCursor: nextDone ? null : nextFiles.length,
        });
      }

      traceGalleryLoad({
        event: 'summary_reconcile_complete',
        folderPath,
        reason,
        incomingFiles: incomingFiles.length,
        appendedFiles: added,
        updatedFiles: updated,
        loadedFiles: nextFiles.length,
        previousTotal: currentTotal,
        summaryTotal,
        durationMs: nowMs() - startedAt,
      });
      return added > 0 || updated > 0;
    })().catch((error) => {
      traceGalleryLoad({
        event: 'summary_reconcile_error',
        folderPath,
        reason,
        error: error instanceof Error ? error.message : 'Failed to reconcile gallery folder',
        durationMs: 0,
      });
      return false;
    }).finally(() => {
      if (pathsEqual(currentFolderReconcileFolderRef.current, folderPath)) {
        currentFolderReconcileInFlightRef.current = null;
        currentFolderReconcileFolderRef.current = '';
        currentFolderLastReconcileAtRef.current = Date.now();
      }
    });

    currentFolderReconcileFolderRef.current = folderPath;
    currentFolderReconcileInFlightRef.current = reconcilePromise;
    return reconcilePromise;
  }, [clearPageCacheForFolder, emitFilmstripFeed, loadFolder, sortBy, sortOrder, total, writeTreeChildrenCache]);

  const scheduleCurrentFolderReconcile = useCallback((
    folderPath: string,
    summary: GalleryFolderSummary,
    reason = 'summary-poll',
  ) => {
    if (typeof window === 'undefined') return;
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    if (currentFolderReconcileTimerRef.current !== null) {
      window.clearTimeout(currentFolderReconcileTimerRef.current);
      currentFolderReconcileTimerRef.current = null;
    }
    const sinceLast = Date.now() - currentFolderLastReconcileAtRef.current;
    const delay = Math.max(
      CURRENT_FOLDER_RECONCILE_DEBOUNCE_MS,
      sinceLast < CURRENT_FOLDER_RECONCILE_COOLDOWN_MS
        ? CURRENT_FOLDER_RECONCILE_COOLDOWN_MS - sinceLast
        : 0,
    );
    currentFolderReconcileTimerRef.current = window.setTimeout(() => {
      currentFolderReconcileTimerRef.current = null;
      if (!pathsEqual(normalized, currentFolderRef.current)) return;
      void reconcileCurrentFolderInPlace(normalized, summary, reason);
    }, delay);
  }, [reconcileCurrentFolderInPlace]);

  useEffect(() => () => {
    if (currentFolderReconcileTimerRef.current !== null) {
      window.clearTimeout(currentFolderReconcileTimerRef.current);
      currentFolderReconcileTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!galleryUiSessionHydrated) return;
    if (skipNextSortReloadRef.current) {
      skipNextSortReloadRef.current = false;
      return;
    }
    if (!initialGalleryFolderLoadedRef.current) {
      initialGalleryFolderLoadedRef.current = true;
    }
    void loadFolder({ folder: currentFolder || rootPath });
  }, [galleryUiSessionHydrated, sortBy, sortOrder]);

  const openFolder = useCallback((folderPath: string, options: { showMedia?: boolean } = {}) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setQuery('');
    setFocusedFolder((current) => (pathsEqual(current, normalized) ? current : normalized));
    traceGalleryLoad({
      event: 'open_requested',
      folderPath: normalized,
      durationMs: 0,
    });
    if (isPhoneRemote && options.showMedia !== false) setGalleryMobileViewWithHistory('media');
    void loadFolder({ folder: normalized, source: 'local' });
  }, [isPhoneRemote, loadFolder, setGalleryMobileViewWithHistory]);

  const confirmEmptyFolderCleanup = useCallback(async () => {
    const pending = emptyFolderCleanupModal;
    if (!pending || pending.submitting) return;
    setEmptyFolderCleanupModal({ ...pending, submitting: true });
    try {
      const response = await fetchGalleryFs('/empty-folders/delete', new URLSearchParams(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pending.rootPath }),
      });
      const payload = await response.json().catch(() => ({} as {
        deleted?: string[];
        failed?: Array<{ path?: string; error?: string }>;
        error?: string;
      }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to clear empty folders'));
      const deleted = Array.isArray(payload.deleted)
        ? payload.deleted.map(normalizePath).filter(Boolean)
        : [];
      const failed = Array.isArray(payload.failed) ? payload.failed : [];
      const touchedParents = uniqueNormalizedPaths([
        pending.rootPath,
        ...deleted.map(pathParent),
      ]);
      for (const folder of touchedParents) {
        clearPageCacheForFolder(folder);
        invalidateTreeChildrenCache(folder);
        void loadTreeChildren(folder, true);
      }
      if (deleted.some((folder) => pathsEqual(folder, currentFolderRef.current) || currentFolderRef.current.startsWith(`${folder}/`))) {
        openFolder(pending.rootPath, { showMedia: false });
      } else if (pathsEqual(currentFolderRef.current, pending.rootPath)) {
        void loadFolder({ folder: pending.rootPath, keepSelection: true, forceRefresh: true, preserveScroll: true });
      }
      setEmptyFolderCleanupModal(null);
      addToast({
        type: failed.length > 0 ? 'error' : 'success',
        message: failed.length > 0
          ? `Cleared ${deleted.length} empty folder${deleted.length === 1 ? '' : 's'}; ${failed.length} failed`
          : `Cleared ${deleted.length} empty folder${deleted.length === 1 ? '' : 's'}`,
      });
    } catch (error) {
      setEmptyFolderCleanupModal((current) => current ? { ...current, submitting: false } : current);
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to clear empty folders' });
    }
  }, [
    addToast,
    clearPageCacheForFolder,
    emptyFolderCleanupModal,
    invalidateTreeChildrenCache,
    loadFolder,
    loadTreeChildren,
    openFolder,
  ]);

  const applyGalleryUiSession = useCallback((session: GalleryUiSession | null | undefined, options: { localRestore?: boolean } = {}) => {
    if (!options.localRestore && !syncUiAcrossDevices) return;
    if (!session || typeof session !== 'object') return;
    if (session.clientId && session.clientId === galleryUiSessionClientIdRef.current) return;
    const incomingUpdatedAt = Math.max(0, Math.floor(Number(session.updatedAt) || 0));
    const nextFolder = normalizePath(session.currentFolder || '');
    const pendingLocalNavigation = pendingLocalFolderNavigationRef.current;
    if (
      pendingLocalNavigation
      && Date.now() - pendingLocalNavigation.at < GALLERY_UI_SESSION_LOCAL_NAVIGATION_GUARD_MS
      && nextFolder
      && !pathsEqual(nextFolder, pendingLocalNavigation.folder)
    ) {
      return;
    }
    if (incomingUpdatedAt > 0) {
      if (incomingUpdatedAt <= latestAppliedGalleryUiSessionAtRef.current) return;
      if (
        incomingUpdatedAt < latestLocalFolderNavigationAtRef.current
        && Date.now() - latestLocalFolderNavigationAtRef.current < GALLERY_UI_SESSION_LOCAL_NAVIGATION_GUARD_MS
      ) {
        return;
      }
      latestAppliedGalleryUiSessionAtRef.current = incomingUpdatedAt;
    }
    const nextFocusedFolder = normalizePath(session.focusedFolder || nextFolder || '');
    const nextSortBy = session.sortBy;
    const nextSortOrder = session.sortOrder;
    const nextMobileView = session.mobileView;
    const nextMobileMediaView = session.mobileMediaView;
    if (nextSortBy === 'created' || nextSortBy === 'modified' || nextSortBy === 'name' || nextSortBy === 'custom') {
      setSortBy(nextSortBy);
    }
    if (nextSortOrder === 'asc' || nextSortOrder === 'desc') {
      setSortOrder(nextSortOrder);
    }
    if (typeof session.groupBySet === 'boolean') {
      setGroupBySet(session.groupBySet);
    }
    if (nextMobileView === 'folders' || nextMobileView === 'media') {
      setGalleryMobileView(nextMobileView);
      galleryMobileViewRef.current = nextMobileView;
    }
    if (nextMobileMediaView === 'single' || nextMobileMediaView === 'grid') {
      setMobileMediaView(nextMobileMediaView);
    }
    if (nextFocusedFolder) {
      setFocusedFolder(nextFocusedFolder);
    }
    if (nextFolder && !pathsEqual(nextFolder, currentFolderRef.current)) {
      currentFolderRef.current = nextFolder;
      setCurrentFolder(nextFolder);
      initialGalleryFolderLoadedRef.current = true;
      void loadFolder({ folder: nextFolder, keepSelection: true, source: 'session' });
    }
  }, [loadFolder, syncUiAcrossDevices]);

  useEffect(() => {
    if (galleryUiSessionHydratedRef.current) return;
    let cancelled = false;
    void readUserConfig<GalleryUiSession | null>('gallery-ui-session', null)
      .then((session) => {
        if (cancelled) return;
        applyGalleryUiSession(session, { localRestore: true });
        galleryUiSessionHydratedRef.current = true;
        setGalleryUiSessionHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          galleryUiSessionHydratedRef.current = true;
          setGalleryUiSessionHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyGalleryUiSession]);

  useEffect(() => subscribeUiSession((event) => {
    if (event.type === 'ui_session_state') {
      applyGalleryUiSession(event.sessions?.['gallery-ui-session'] as GalleryUiSession | null | undefined);
    } else if (event.key === 'gallery-ui-session') {
      applyGalleryUiSession(event.value as GalleryUiSession | null | undefined);
    }
  }), [applyGalleryUiSession]);

  useEffect(() => {
    if (!galleryUiSessionHydratedRef.current || typeof window === 'undefined' || !syncUiAcrossDevices) return;
    if (!galleryUiSessionDirtyRef.current) return;
    if (galleryUiSessionSaveTimerRef.current !== null) {
      window.clearTimeout(galleryUiSessionSaveTimerRef.current);
    }
    galleryUiSessionSaveTimerRef.current = window.setTimeout(() => {
      galleryUiSessionSaveTimerRef.current = null;
      const updatedAt = Date.now();
      const pendingLocalNavigation = pendingLocalFolderNavigationRef.current;
      const pendingFolder = pendingLocalNavigation
        && Date.now() - pendingLocalNavigation.at < GALLERY_UI_SESSION_LOCAL_NAVIGATION_GUARD_MS
        ? pendingLocalNavigation.folder
        : '';
      latestAppliedGalleryUiSessionAtRef.current = Math.max(latestAppliedGalleryUiSessionAtRef.current, updatedAt);
      galleryUiSessionDirtyRef.current = false;
      void writeUserConfig('gallery-ui-session', {
        currentFolder: pendingFolder || currentFolder,
        focusedFolder,
        sortBy,
        sortOrder,
        groupBySet,
        mobileView: galleryMobileView,
        mobileMediaView,
        updatedAt,
        clientId: galleryUiSessionClientIdRef.current,
      } satisfies GalleryUiSession).catch((error) => {
        galleryUiSessionDirtyRef.current = true;
        console.warn('[ReactGalleryWorkspace] Failed to persist gallery UI session:', error);
      });
    }, 250);
    return () => {
      if (galleryUiSessionSaveTimerRef.current !== null) {
        window.clearTimeout(galleryUiSessionSaveTimerRef.current);
        galleryUiSessionSaveTimerRef.current = null;
      }
    };
  }, [currentFolder, focusedFolder, galleryMobileView, groupBySet, mobileMediaView, sortBy, sortOrder, syncUiAcrossDevices]);

  const selectFile = useCallback((file: GalleryFile, event: React.MouseEvent) => {
    const path = normalizePath(file.path);
    if (!path) return;
    if (isLiveGenerationPreviewPath(path)) {
      followLiveGenerationViewerRef.current = true;
      setViewerPath(path);
      setViewerFileFallback(file);
      updateViewerSessionFiles([
        file,
        ...viewerSessionFilesRef.current.filter((entry) => !isLiveGenerationPreviewPath(entry.path)),
      ]);
      return;
    }
    const orderedPaths = getSelectionOrderedFiles().map((entry) => normalizePath(entry.path)).filter(Boolean);
    const clickedIndex = orderedPaths.indexOf(path);
    let next: Set<string>;

    if (event.shiftKey && lastSelectedPath) {
      const lastIndex = orderedPaths.indexOf(lastSelectedPath);
      if (lastIndex >= 0 && clickedIndex >= 0) {
        const from = Math.min(lastIndex, clickedIndex);
        const to = Math.max(lastIndex, clickedIndex);
        const range = orderedPaths.slice(from, to + 1);
        next = event.ctrlKey || event.metaKey
          ? new Set([...Array.from(selectedPaths), ...range])
          : new Set(range);
      } else {
        next = new Set([path]);
      }
    } else if (event.ctrlKey || event.metaKey) {
      next = new Set(selectedPaths);
      if (next.has(path)) next.delete(path);
      else next.add(path);
    } else {
      next = new Set([path]);
    }

    applyGallerySelection(next, path);
  }, [applyGallerySelection, getSelectionOrderedFiles, lastSelectedPath, selectedPaths, updateViewerSessionFiles]);

  const buildTouchSelectionRange = useCallback((
    anchorPath: string,
    targetPath: string,
    baseSelection: Set<string>,
    mode: 'select' | 'deselect',
  ) => {
    const orderedPaths = getSelectionOrderedFiles()
      .map((entry) => normalizePath(entry.path))
      .filter(Boolean);
    const anchorIndex = orderedPaths.indexOf(anchorPath);
    const targetIndex = orderedPaths.indexOf(targetPath);
    const next = new Set(baseSelection);
    const range = anchorIndex >= 0 && targetIndex >= 0
      ? orderedPaths.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
      : [targetPath];
    for (const entry of range) {
      if (mode === 'select') next.add(entry);
      else next.delete(entry);
    }
    return next;
  }, [getSelectionOrderedFiles]);

  const beginTouchSelectionDrag = useCallback((event: React.PointerEvent<HTMLElement>, file: GalleryFile) => {
    if (!isTouchRemote || !touchSelectionMode || file.type === 'folder' || event.button !== 0) return;
    const path = normalizePath(file.path);
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    const baseSelection = new Set(selectedPathsRef.current);
    const mode: 'select' | 'deselect' = baseSelection.has(path) ? 'deselect' : 'select';
    touchSelectionDragRef.current = {
      active: true,
      anchorPath: path,
      baseSelection,
      mode,
      lastPath: path,
    };
    if (mode === 'deselect' && baseSelection.size > 1) {
      applyGallerySelection(baseSelection, path);
      return;
    }
    const next = new Set(baseSelection);
    if (mode === 'select') next.add(path);
    else next.delete(path);
    applyGallerySelection(next, path);
  }, [applyGallerySelection, isTouchRemote, touchSelectionMode]);

  const extendTouchSelectionDrag = useCallback((event: React.PointerEvent<HTMLElement>, file: GalleryFile) => {
    const drag = touchSelectionDragRef.current;
    if (!drag?.active || !isTouchRemote || !touchSelectionMode || file.type === 'folder') return;
    const path = normalizePath(file.path);
    if (!path || pathsEqual(path, drag.lastPath)) return;
    event.preventDefault();
    event.stopPropagation();
    drag.lastPath = path;
    const next = buildTouchSelectionRange(drag.anchorPath, path, drag.baseSelection, drag.mode);
    applyGallerySelection(next, path);
  }, [applyGallerySelection, buildTouchSelectionRange, isTouchRemote, touchSelectionMode]);

  const endTouchSelectionDrag = useCallback(() => {
    touchSelectionDragRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const endDrag = () => {
      touchSelectionDragRef.current = null;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, []);

  const openFile = useCallback((file: GalleryFile) => {
    const path = normalizePath(file.path);
    if (!path) return;
    if (file.type === 'folder') {
      openFolder(path);
      return;
    }
    if (isLiveGenerationPreviewPath(path)) {
      setViewerPath(path);
      setViewerFileFallback(file);
      updateViewerSessionFiles([
        file,
        ...viewerSessionFilesRef.current.filter((entry) => !isLiveGenerationPreviewPath(entry.path)),
      ]);
      return;
    }
    followLiveGenerationViewerRef.current = false;
    setSelectedPaths(new Set([path]));
    setLastSelectedPath(path);
    setViewerPath(path);
    setViewerFileFallback(file);
    const orderedFiles = getSelectionOrderedFiles();
    updateViewerSessionFiles(
      orderedFiles.some((entry) => pathsEqual(entry.path, path))
        ? orderedFiles
        : [file, ...orderedFiles],
    );
    emitSelectionChanged([path], path);
    const folderPath = pathParent(path) || currentFolder;
    window.dispatchEvent(new CustomEvent('umbra:gallery-reveal-path', {
      detail: { path: folderPath, folderPath, imagePath: path, source: 'react-gallery' },
    }));
  }, [currentFolder, emitSelectionChanged, getSelectionOrderedFiles, openFolder, updateViewerSessionFiles]);

  const clearSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchSuggestAbortRef.current?.abort();
    setQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setSearchError('');
    setSearchSuggestions([]);
    setSearchSuggestionsOpen(false);
    setSearchSuggestionIndex(-1);
  }, []);

  const openSearchFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    clearSearch();
    openFolder(normalized);
  }, [clearSearch, openFolder]);

  const openSearchFile = useCallback((file: GalleryFile) => {
    const path = normalizePath(file.path);
    if (!path) return;
    const folderPath = pathParent(path);
    clearSearch();
    setSelectedPaths(new Set([path]));
    setLastSelectedPath(path);
    emitSelectionChanged([path], path);
    if (folderPath) {
      setFocusedFolder(folderPath);
      void loadFolder({ folder: folderPath, keepSelection: true });
      window.dispatchEvent(new CustomEvent('umbra:gallery-reveal-path', {
        detail: { path: folderPath, folderPath, imagePath: path, source: 'react-gallery' },
      }));
    }
  }, [clearSearch, emitSelectionChanged, loadFolder]);

  const closeViewer = useCallback(() => {
    followLiveGenerationViewerRef.current = false;
    setViewerPath('');
    setViewerFileFallback(null);
    updateViewerSessionFiles([]);
  }, [updateViewerSessionFiles]);

  const selectedOrViewerPaths = useCallback(() => {
    const viewer = normalizePath(viewerPath);
    const selected = stripLiveGenerationPreviewPaths(Array.from(selectedPaths).map(normalizePath).filter(Boolean));
    if (viewer && isLiveGenerationPreviewPath(viewer)) return [];
    if (selected.length > 0 && (!viewer || selected.some((path) => pathsEqual(path, viewer)))) return selected;
    return viewer ? stripLiveGenerationPreviewPaths([viewer]) : selected;
  }, [selectedPaths, viewerPath]);

  const sendSelectionToWorkspace = useCallback((paths: string[], workspace: 'scanner' | 'waifudiffusion') => {
    const normalizedPaths = Array.from(new Set(paths.map(normalizePath).filter(Boolean)));
    if (normalizedPaths.length === 0) {
      addToast({
        type: 'error',
        message: workspace === 'scanner'
          ? 'No valid items selected for Metadata Scanner'
          : 'No valid images selected for Waifu Diffusion',
      });
      return;
    }
    addScannedImport(normalizedPaths);
    useStore.getState().setUI('imageInspectorTab', workspace === 'scanner' ? 'scanner' : 'waifu');
    setActiveWorkspace('imageinspector');
    addToast({
      type: 'success',
      message: workspace === 'scanner'
        ? `Sent ${normalizedPaths.length} item${normalizedPaths.length === 1 ? '' : 's'} to Metadata Scanner`
        : `Sent ${normalizedPaths.length} image${normalizedPaths.length === 1 ? '' : 's'} to Waifu Diffusion`,
    });
  }, [addScannedImport, addToast, setActiveWorkspace]);

  const revealViewerSelection = useCallback(async () => {
    if (isRemoteClient) {
      addToast({ type: 'error', message: 'Opening File Explorer is only available from the host PC.' });
      return;
    }
    const targetPath = selectedOrViewerPaths().at(0) || '';
    if (!targetPath) return;
    try {
      const response = await fetch('/api/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to open in file explorer'));
    } catch (revealError) {
      addToast({
        type: 'error',
        message: revealError instanceof Error ? revealError.message : 'Failed to open in file explorer',
      });
    }
  }, [addToast, isRemoteClient, selectedOrViewerPaths]);

  const copyViewerPaths = useCallback(async () => {
    const paths = selectedOrViewerPaths();
    if (paths.length === 0) return;
    try {
      await navigator.clipboard.writeText(paths.join('\n'));
      addToast({ type: 'success', message: paths.length === 1 ? 'Copied path' : `Copied ${paths.length} paths` });
    } catch (copyError) {
      addToast({
        type: 'error',
        message: copyError instanceof Error ? copyError.message : 'Failed to copy paths',
      });
    }
  }, [addToast, selectedOrViewerPaths]);

  const sendViewerToScanner = useCallback(() => {
    sendSelectionToWorkspace(selectedOrViewerPaths(), 'scanner');
  }, [selectedOrViewerPaths, sendSelectionToWorkspace]);

  const sendViewerToWaifu = useCallback(() => {
    const selected = new Set(selectedOrViewerPaths().map((path) => normalizePath(path).toLowerCase()));
    const imagePaths = knownFilesRef.current
      .filter((file) => selected.has(normalizePath(file.path).toLowerCase()))
      .filter((file) => file.type === 'image' || file.type === 'gif')
      .map((file) => normalizePath(file.path));
    sendSelectionToWorkspace(imagePaths, 'waifudiffusion');
  }, [selectedOrViewerPaths, sendSelectionToWorkspace]);

  const sendPathToUmbraUi = useCallback(async (
    pathValue: string,
    mode: UmbraUiMediaHandoffMode,
    frameRole?: UmbraUiVideoFrameRole,
    metadata?: ImageMetadata | null,
  ) => {
    const path = normalizePath(pathValue);
    if (!path || isLiveGenerationPreviewPath(path)) return;
    setActiveWorkspace('umbraui');
    try {
      await stageUmbraUiMediaHandoff({
        mode,
        path,
        name: pathLeaf(path),
        imageUrl: `/api/fs/image?${new URLSearchParams({ path }).toString()}`,
        source: 'gallery',
        videoFrameRole: frameRole,
        metadata: metadata || undefined,
      });
      const label = mode === 'txt2img'
        ? 'TXT2IMG parameters'
        : mode === 'img2img'
          ? 'IMG2IMG source with metadata'
          : mode === 'inpaint'
            ? 'Inpaint with metadata'
            : frameRole === 'source_video'
              ? 'VID2VID source'
              : frameRole === 'middle'
                ? 'Video middle frame'
                : frameRole === 'last'
                  ? 'Video last frame'
                  : 'IMG2VID first frame';
      addToast({ type: 'success', message: `${label} loaded in Umbra UI` });
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to send the image to Umbra UI' });
    }
  }, [addToast, setActiveWorkspace]);

  const restorePathInPowerPrompter = useCallback((pathValue: string) => {
    const path = normalizePath(pathValue);
    try {
      stagePowerPrompterImageRestoreHandoff({
        path,
        name: pathLeaf(path),
        source: 'gallery-filmstrip',
      });
      setActiveWorkspace('powerprompter');
      addToast({
        type: 'success',
        message: 'Opening the image state in Power Prompter',
      });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to restore Power Prompter image',
      });
    }
  }, [addToast, setActiveWorkspace]);

  const sendViewerToUmbra = useCallback((
    mode: UmbraUiMediaHandoffMode,
    frameRole?: UmbraUiVideoFrameRole,
    metadata?: ImageMetadata | null,
  ) => {
    const path = selectedOrViewerPaths().at(0) || '';
    if (!path) return;
    closeViewer();
    void sendPathToUmbraUi(path, mode, frameRole, metadata);
  }, [closeViewer, selectedOrViewerPaths, sendPathToUmbraUi]);

  const restoreTrashUndoItems = useCallback(async (undoItems: GalleryTrashUndoItem[]) => {
    const items = undoItems
      .map((item) => ({
        trashPath: normalizePath(item.trashPath),
        originalPath: normalizePath(item.originalPath),
      }))
      .filter((item) => item.trashPath);
    if (items.length === 0) return;

    try {
      const response = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ trashPath, originalPath }) => ({
            trashPath,
            ...(originalPath ? { originalPath } : {}),
          })),
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to restore from trash'));

      const restoredItems = Array.isArray((payload as { restored?: unknown[] }).restored)
        ? (payload as { restored?: Array<Record<string, unknown>> }).restored || []
        : [];
      const failedItems = Array.isArray((payload as { failed?: unknown[] }).failed)
        ? (payload as { failed?: Array<{ error?: string }> }).failed || []
        : [];
      if (failedItems.length > 0 && restoredItems.length === 0) {
        throw new Error(String(failedItems[0]?.error || 'Failed to restore from trash'));
      }
      const restoredPaths = uniqueNormalizedPaths(
        restoredItems
          .map((entry, index) => resolveRestoredPath(entry, items[index]?.originalPath))
          .filter(Boolean),
      );

      if (restoredPaths.length > 0) {
        for (const restoredPath of restoredPaths) {
          clearPageCacheForFolder(pathParent(restoredPath));
        }
        window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
          detail: { paths: restoredPaths, source: 'react-gallery-undo' },
        }));
      }
      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
        detail: { source: 'react-gallery-undo' },
      }));
      clearTrashCache();

      const restoredCount = restoredPaths.length || items.length;
      addToast({
        type: 'success',
        message: restoredCount === 1
          ? `Restored ${pathLeaf(restoredPaths[0] || items[0]?.originalPath) || 'item'}`
          : `Restored ${restoredCount} items`,
      });
      if (failedItems.length > 0) {
        addToast({
          type: 'error',
          message: failedItems.length === 1
            ? String(failedItems[0]?.error || 'Failed to restore an item')
            : `${String(failedItems[0]?.error || 'Failed to restore an item')} (+${failedItems.length - 1} more)`,
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to restore from trash',
      });
    }
  }, [addToast, clearPageCacheForFolder, clearTrashCache]);

  const flushTrashUndoToast = useCallback(() => {
    const pending = pendingTrashUndoToastRef.current;
    if (pending.timer !== null) {
      window.clearTimeout(pending.timer);
      pending.timer = null;
    }

    const items = pending.items.splice(0);
    const undoItems: GalleryTrashUndoItem[] = [];
    const seenTrashPaths = new Set<string>();
    for (const item of items) {
      const trashPath = normalizePath(item.trashPath);
      if (!trashPath || seenTrashPaths.has(trashPath.toLowerCase())) continue;
      seenTrashPaths.add(trashPath.toLowerCase());
      const originalPath = normalizePath(item.originalPath);
      undoItems.push({
        trashPath,
        originalPath,
        name: String(item.name || pathLeaf(originalPath) || pathLeaf(trashPath) || 'item').trim(),
      });
    }

    if (undoItems.length === 0) return;
    const count = undoItems.length;
    addToast({
      type: 'success',
      message: count === 1 ? `Moved ${undoItems[0].name} to Trash` : `Moved ${count} items to Trash`,
      action: {
        label: 'Undo',
        onClick: () => {
          void restoreTrashUndoItems(undoItems);
        },
      },
    });
  }, [addToast, restoreTrashUndoItems]);

  const queueTrashUndoToast = useCallback((undoItems: GalleryTrashUndoItem[]) => {
    if (undoItems.length === 0) return;
    const pending = pendingTrashUndoToastRef.current;
    pending.items.push(...undoItems);
    if (pending.timer !== null) window.clearTimeout(pending.timer);
    pending.timer = window.setTimeout(() => {
      flushTrashUndoToast();
    }, 260);
  }, [flushTrashUndoToast]);

  useEffect(() => () => {
    const pending = pendingTrashUndoToastRef.current;
    if (pending.timer !== null) {
      window.clearTimeout(pending.timer);
      pending.timer = null;
    }
  }, []);

  const rememberRestoredHighlights = useCallback((paths: string[]) => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return;
    const keys = normalized.map((path) => path.toLowerCase());
    setRestoredHighlightPaths((current) => {
      const next = new Set(current);
      for (const key of keys) next.add(key);
      return next;
    });
    const timer = window.setTimeout(() => {
      setRestoredHighlightPaths((current) => {
        const next = new Set(current);
        for (const key of keys) next.delete(key);
        return next;
      });
    }, 12_000);
    restoredHighlightTimersRef.current.push(timer);
  }, []);

  useEffect(() => () => {
    for (const timer of restoredHighlightTimersRef.current) window.clearTimeout(timer);
    restoredHighlightTimersRef.current = [];
  }, []);

  const applyOptimisticPathRemoval = useCallback((
    paths: string[],
    options: { clearViewer?: boolean; keepSelection?: boolean; nextViewerPath?: string; reason?: string } = {},
  ): GalleryOptimisticRemovalSnapshot | null => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return null;
    const removedSet = new Set(normalized.map((path) => normalizePath(path).toLowerCase()));
    const snapshot: GalleryOptimisticRemovalSnapshot = {
      folder: currentFolderRef.current,
      files: filesRef.current,
      knownFiles: knownFilesRef.current,
      activeViewerFiles: activeViewerFilesRef.current,
      viewerSessionFiles: viewerSessionFilesRef.current,
      searchResults,
      folderPreviewGroups: folderPreviewGroupsRef.current,
      selectedPaths: new Set(selectedPathsRef.current),
      lastSelectedPath,
      viewerPath,
      viewerFileFallback,
    };
    const removeFromList = (source: GalleryFile[]) => source.filter((file) => (
      !removedSet.has(normalizePath(file.path).toLowerCase())
    ));
    const nextFiles = removeFromList(filesRef.current);
    const nextKnownFiles = removeFromList(knownFilesRef.current);
    const nextActiveViewerFiles = removeFromList(activeViewerFilesRef.current);
    const nextViewerSessionFiles = removeFromList(viewerSessionFilesRef.current);
    const nextViewerPath = normalizePath(options.nextViewerPath || '');
    const shouldUseNextViewer = Boolean(
      options.clearViewer
      && nextViewerPath
      && !removedSet.has(nextViewerPath.toLowerCase())
    );

    filesRef.current = nextFiles;
    knownFilesRef.current = nextKnownFiles;
    activeViewerFilesRef.current = nextActiveViewerFiles;
    setFiles(nextFiles);
    setSearchResults((current) => current ? {
      ...current,
      files: removeFromList(Array.isArray(current.files) ? current.files : []),
    } : current);
    const nextFolderPreviewGroups = folderPreviewGroupsRef.current.map((group) => ({
      ...group,
      files: removeFromList(Array.isArray(group.files) ? group.files : []),
    }));
    folderPreviewGroupsRef.current = nextFolderPreviewGroups;
    setFolderPreviewGroups(nextFolderPreviewGroups);
    updateViewerSessionFiles(nextViewerSessionFiles);

    if (options.clearViewer) {
      setViewerPath(shouldUseNextViewer ? nextViewerPath : '');
      if (!shouldUseNextViewer) {
        setViewerFileFallback(null);
        updateViewerSessionFiles([]);
      }
    }
    const nextSelection = options.keepSelection
      ? new Set(Array.from(selectedPathsRef.current).filter((path) => !removedSet.has(normalizePath(path).toLowerCase())))
      : shouldUseNextViewer
        ? new Set([nextViewerPath])
        : new Set<string>();
    selectedPathsRef.current = nextSelection;
    setSelectedPaths(nextSelection);
    setLastSelectedPath((current) => {
      if (shouldUseNextViewer) return nextViewerPath;
      return removedSet.has(normalizePath(current).toLowerCase()) ? '' : current;
    });
    if (shouldUseNextViewer) emitSelectionChanged([nextViewerPath], nextViewerPath);

    window.dispatchEvent(new CustomEvent('umbra:gallery-remove-paths', {
      detail: { paths: normalized, source: 'react-gallery' },
    }));
    const touchedFolders = uniqueNormalizedPaths([currentFolderRef.current, ...normalized.map(pathParent)]);
    for (const folder of touchedFolders) {
      clearPageCacheForFolder(folder);
    }
    return snapshot;
  }, [
    clearPageCacheForFolder,
    emitSelectionChanged,
    lastSelectedPath,
    searchResults,
    updateViewerSessionFiles,
    viewerFileFallback,
    viewerPath,
  ]);

  const rollbackOptimisticPathRemoval = useCallback((snapshot: GalleryOptimisticRemovalSnapshot | null) => {
    if (!snapshot) return;
    if (!pathsEqual(currentFolderRef.current, snapshot.folder)) return;
    filesRef.current = snapshot.files;
    knownFilesRef.current = snapshot.knownFiles;
    activeViewerFilesRef.current = snapshot.activeViewerFiles;
    folderPreviewGroupsRef.current = snapshot.folderPreviewGroups;
    setFiles(snapshot.files);
    setSearchResults(snapshot.searchResults);
    setFolderPreviewGroups(snapshot.folderPreviewGroups);
    updateViewerSessionFiles(snapshot.viewerSessionFiles);
    const restoredSelection = new Set(snapshot.selectedPaths);
    selectedPathsRef.current = restoredSelection;
    setSelectedPaths(restoredSelection);
    setLastSelectedPath(snapshot.lastSelectedPath);
    setViewerPath(snapshot.viewerPath);
    setViewerFileFallback(snapshot.viewerFileFallback);
    emitSelectionChanged(Array.from(snapshot.selectedPaths), snapshot.lastSelectedPath);
  }, [emitSelectionChanged, updateViewerSessionFiles]);

  const deleteGalleryPaths = useCallback(async (
    paths: string[],
    options: { clearViewer?: boolean; keepSelection?: boolean; nextViewerPath?: string; rollbackOnFailure?: boolean } = {},
  ) => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0) return;
    const nameByPath = new Map<string, string>();
    for (const file of [...knownFilesRef.current, ...filesRef.current]) {
      const filePath = normalizePath(file.path);
      if (!filePath) continue;
      nameByPath.set(filePath.toLowerCase(), String(file.name || pathLeaf(filePath) || 'item'));
    }
    const trashPaths = normalized.filter(isTrashPath);
    const deletePaths = normalized.filter((path) => !isTrashPath(path));
    const removedPaths: string[] = [];
    const undoItems: GalleryTrashUndoItem[] = [];
    let movedToUmbraTrash = 0;
    let systemTrashed = 0;
    let permanentlyDeleted = 0;
    const failedDeletePaths: string[] = [];
    let optimisticSnapshot = applyOptimisticPathRemoval(normalized, {
      ...options,
      reason: trashPaths.length > 0 && deletePaths.length === 0 ? 'permanent-delete' : 'delete',
    });

    try {
      if (deletePaths.length > 0) {
        const result = await deletePathsWithSettings(deletePaths, appSettings);
        const successfulPaths = uniqueNormalizedPaths(
          result.deletedPaths.length > 0
            ? result.deletedPaths
            : deletePaths.filter((path) => !result.failed.some((failed) => pathsEqual(failed.path, path))),
        );
        if (successfulPaths.length === 0) {
          throw new Error(result.failed[0]?.error || 'Delete failed');
        }
        removedPaths.push(...successfulPaths);
        if (result.mode === 'umbra-trash') {
          movedToUmbraTrash += successfulPaths.length;
          undoItems.push(...result.trashItems
            .map((item) => {
              const trashPath = normalizePath(item?.trashPath);
              const originalPath = normalizePath(item?.originalPath);
              if (!trashPath) return null;
              return {
                trashPath,
                originalPath,
                name: String(
                  nameByPath.get(originalPath.toLowerCase())
                  || pathLeaf(originalPath)
                  || pathLeaf(trashPath)
                  || 'item',
                ),
              };
            })
            .filter(Boolean) as GalleryTrashUndoItem[]);
        } else if (result.mode === 'system-trash') {
          systemTrashed += successfulPaths.length;
        } else {
          permanentlyDeleted += successfulPaths.length;
        }
        if (result.failed.length > 0) {
          failedDeletePaths.push(...result.failed.map((failed) => normalizePath(failed.path)).filter(Boolean));
          addToast({
            type: 'error',
            message: result.failed.length === 1
              ? result.failed[0].error
              : `${result.failed[0].error} (+${result.failed.length - 1} more)`,
          });
        }
      }

      if (trashPaths.length > 0) {
        const response = await fetch('/api/trash/permanent-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: trashPaths }),
        });
        const payload = await response.json().catch(() => ({} as { error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
        removedPaths.push(...trashPaths);
        permanentlyDeleted += trashPaths.length;
      }

      const dedupedRemovedPaths = uniqueNormalizedPaths(removedPaths);
      if (dedupedRemovedPaths.length === 0) {
        rollbackOptimisticPathRemoval(optimisticSnapshot);
        return;
      }
      for (const removedPath of dedupedRemovedPaths) clearCachedViewerMetadata(removedPath);

      if (failedDeletePaths.length > 0 && optimisticSnapshot) {
        rollbackOptimisticPathRemoval(optimisticSnapshot);
        optimisticSnapshot = applyOptimisticPathRemoval(dedupedRemovedPaths, {
          ...options,
          reason: trashPaths.length > 0 && deletePaths.length === 0 ? 'permanent-delete' : 'delete',
        });
      }

      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', { detail: { source: 'react-gallery' } }));
      const touchedFolders = uniqueNormalizedPaths([currentFolder, ...dedupedRemovedPaths.map(pathParent)]);
      const deleteMarkedAt = Date.now();
      for (const folder of touchedFolders) {
        clearPageCacheForFolder(folder);
        dirtyAfterDeleteFoldersRef.current.set(folder.toLowerCase(), deleteMarkedAt);
        window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
          detail: { path: folder, folderPath: folder, source: 'react-gallery', reason: 'delete' },
        }));
      }
      clearTrashCache();
      if (undoItems.length > 0) {
        queueTrashUndoToast(undoItems);
      }
      if ((movedToUmbraTrash > 0 && undoItems.length === 0) || systemTrashed > 0 || permanentlyDeleted > 0 || undoItems.length === 0) {
        const messages: string[] = [];
        if (movedToUmbraTrash > 0 && undoItems.length === 0) messages.push(`Moved ${movedToUmbraTrash} to Umbra Trash`);
        if (systemTrashed > 0) messages.push(`Moved ${systemTrashed} to system trash`);
        if (permanentlyDeleted > 0) messages.push(`Deleted ${permanentlyDeleted} permanently`);
        if (messages.length > 0 || undoItems.length === 0) {
          addToast({ type: 'success', message: messages.join(', ') || `Deleted ${dedupedRemovedPaths.length} item${dedupedRemovedPaths.length === 1 ? '' : 's'}` });
        }
      }
      if (trashMode) {
        void loadFolder({ folder: currentFolder, keepSelection: !!options.keepSelection, forceRefresh: true, preserveScroll: true });
      } else if (touchedFolders.some((folder) => pathsEqual(folder, currentFolder))) {
        window.setTimeout(() => {
          void loadFolder({
            folder: currentFolder,
            keepSelection: !!options.keepSelection,
            forceRefresh: true,
            preserveScroll: true,
          });
        }, 120);
      }
    } catch (deleteError) {
      if (options.rollbackOnFailure === false) {
        void loadFolder({ folder: currentFolderRef.current, keepSelection: true, forceRefresh: true, preserveScroll: true });
      } else {
        rollbackOptimisticPathRemoval(optimisticSnapshot);
      }
      addToast({ type: 'error', message: deleteError instanceof Error ? deleteError.message : 'Failed to delete selection' });
    }
  }, [addToast, appSettings, applyOptimisticPathRemoval, clearPageCacheForFolder, clearTrashCache, currentFolder, loadFolder, queueTrashUndoToast, rollbackOptimisticPathRemoval, trashMode]);

  const deleteViewerSelection = useCallback(() => {
    const currentViewerPath = normalizePath(viewerPath || lastSelectedPath);
    const deletePaths = currentViewerPath ? [currentViewerPath] : selectedOrViewerPaths().slice(0, 1);
    if (deletePaths.length === 0) return;
    const pendingDeleteKey = normalizePath(deletePaths[0]).toLowerCase();
    if (pendingDeleteKey && pendingDeletePathsRef.current.has(pendingDeleteKey)) return;
    if (pendingDeleteKey) pendingDeletePathsRef.current.add(pendingDeleteKey);
    const deleteSet = new Set(deletePaths.map((path) => normalizePath(path).toLowerCase()));
    const ordered = getViewerOrderedFiles();
    const current = normalizePath(currentViewerPath || ordered[0]?.path);
    const currentIndex = ordered.findIndex((file) => pathsEqual(file.path, current));
    let nextViewerPath = '';
    let nextViewerFile: GalleryFile | null = null;
    if (ordered.length > 0 && deleteSet.size < ordered.length) {
      const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
      for (let index = startIndex; index < ordered.length; index += 1) {
        const candidate = ordered[index];
        const candidatePath = normalizePath(candidate?.path || '');
        if (candidatePath && !deleteSet.has(candidatePath.toLowerCase())) {
          nextViewerPath = candidatePath;
          nextViewerFile = candidate;
          break;
        }
      }
    }
    const nextSessionFiles = ordered.filter((candidate) => {
      const candidatePath = normalizePath(candidate.path);
      return candidatePath && !deleteSet.has(candidatePath.toLowerCase());
    });
    updateViewerSessionFiles(nextSessionFiles);
    if (nextViewerPath && nextViewerFile) {
      setViewerPath(nextViewerPath);
      setViewerFileFallback(nextViewerFile);
      setSelectedPaths(new Set([nextViewerPath]));
      setLastSelectedPath(nextViewerPath);
      emitSelectionChanged([nextViewerPath], nextViewerPath);
    }
    void deleteGalleryPaths(deletePaths, { clearViewer: true, nextViewerPath, rollbackOnFailure: false })
      .finally(() => {
        if (pendingDeleteKey) pendingDeletePathsRef.current.delete(pendingDeleteKey);
      });
  }, [deleteGalleryPaths, emitSelectionChanged, getViewerOrderedFiles, lastSelectedPath, selectedOrViewerPaths, updateViewerSessionFiles, viewerPath]);

  const stepViewer = useCallback((delta: number) => {
    const ordered = getViewerOrderedFiles();
    if (ordered.length === 0) return;
    const current = normalizePath(viewerPath || lastSelectedPath || ordered[0]?.path);
    const index = Math.max(0, ordered.findIndex((file) => pathsEqual(file.path, current)));
    const nearEnd = delta > 0 && ordered.length - index <= 10;
    if (nearEnd && !done && nextCursor != null && !loading) {
      void loadFolder({ folder: currentFolder, cursor: nextCursor, append: true, keepSelection: true });
    }
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= ordered.length) return;
    const nextFile = ordered[nextIndex];
    const nextPath = normalizePath(nextFile?.path || '');
    if (!nextPath) return;
    setViewerPath(nextPath);
    setViewerFileFallback(nextFile);
    setSelectedPaths(new Set([nextPath]));
    setLastSelectedPath(nextPath);
    emitSelectionChanged([nextPath], nextPath);
    window.dispatchEvent(new CustomEvent('umbra:gallery-reveal-path', {
      detail: { path: currentFolder, folderPath: currentFolder, imagePath: nextPath, source: 'react-gallery' },
    }));
  }, [currentFolder, done, emitSelectionChanged, getViewerOrderedFiles, lastSelectedPath, loadFolder, loading, nextCursor, viewerPath]);

  const setPinnedFolders = useCallback((next: string[]) => {
    const clean = Array.from(new Set(next.map((entry) => normalizePath(entry)).filter(Boolean)));
    setAppSetting('library.pinnedFolders', clean as any);
    window.dispatchEvent(new CustomEvent('umbra:gallery-pinned-folders-changed', {
      detail: { pinnedFolders: clean, source: 'react-gallery' },
    }));
  }, [setAppSetting]);

  const togglePinnedFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const exists = pinnedFolders.some((entry) => pathsEqual(entry, normalized));
    setPinnedFolders(exists
      ? pinnedFolders.filter((entry) => !pathsEqual(entry, normalized))
      : [...pinnedFolders, normalized]);
  }, [pinnedFolders, setPinnedFolders]);

  const createSubfolder = useCallback((parentPath: string) => {
    const parent = normalizePath(parentPath);
    if (!parent) return;
    setFolderNameModal({
      mode: 'create',
      parentPath: parent,
      folderPath: '',
      value: 'New Folder',
      submitting: false,
    });
  }, []);

  const renameFolder = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setFolderNameModal({
      mode: 'rename',
      parentPath: pathParent(normalized),
      folderPath: normalized,
      value: pathLeaf(normalized),
      submitting: false,
    });
  }, []);

  const submitFolderNameModal = useCallback(async () => {
    if (!folderNameModal || folderNameModal.submitting) return;
    const name = folderNameModal.value.trim();
    if (!name) {
      addToast({ type: 'error', message: 'Folder name cannot be empty' });
      return;
    }
    if (/[<>:"/\\|?*]/.test(name)) {
      addToast({ type: 'error', message: 'Folder name contains invalid characters' });
      return;
    }

    setFolderNameModal((current) => current ? { ...current, submitting: true } : current);

    try {
      if (folderNameModal.mode === 'create') {
        const parent = normalizePath(folderNameModal.parentPath);
        if (!parent) throw new Error('Missing parent folder');
        const response = await fetch('/api/fs/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: normalizePath(`${parent}/${name}`) }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to create folder'));
        invalidateTreeChildrenCache(parent);
        await loadTreeChildren(parent, true);
        addToast({ type: 'success', message: `Created ${name}` });
      } else {
        const normalized = normalizePath(folderNameModal.folderPath);
        if (!normalized) throw new Error('Missing folder path');
        const response = await fetch('/api/fs/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: normalized, name }),
        });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to rename folder'));
        const parent = pathParent(normalized);
        if (parent) {
          invalidateTreeChildrenCache(parent);
          await loadTreeChildren(parent, true);
        }
        addToast({ type: 'success', message: 'Renamed folder' });
      }
      setFolderNameModal(null);
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save folder' });
      setFolderNameModal((current) => current ? { ...current, submitting: false } : current);
    }
  }, [addToast, folderNameModal, invalidateTreeChildrenCache, loadTreeChildren]);

  const deleteSelection = useCallback(() => {
    void deleteGalleryPaths(Array.from(selectedPaths), { rollbackOnFailure: false });
  }, [deleteGalleryPaths, selectedPaths]);

  const selectedPathsForContext = useCallback((state: GalleryContextMenuState | null = contextMenu) => {
    return stripLiveGenerationPreviewPaths(resolveGalleryContextSelectionPaths(state, selectedPaths));
  }, [contextMenu, selectedPaths]);

  const scheduleTransferProgressClear = useCallback((delayMs = 2600) => {
    if (transferProgressHideTimerRef.current !== null) {
      window.clearTimeout(transferProgressHideTimerRef.current);
    }
    transferProgressHideTimerRef.current = window.setTimeout(() => {
      transferProgressHideTimerRef.current = null;
      setTransferProgress(null);
    }, delayMs);
  }, []);

  const refreshAfterTransfer = useCallback((sourcePaths: string[], destination: string, mode: 'move' | 'copy') => {
    const affectedFolders = uniqueNormalizedPaths([
      currentFolder,
      destination,
      ...sourcePaths.map(pathParent),
    ]);
    for (const folder of affectedFolders) {
      clearPageCacheForFolder(folder);
      invalidateTreeChildrenCache(folder);
      window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
        detail: { path: folder, folderPath: folder, source: 'react-gallery', reason: mode },
      }));
    }
    setFolderPreviewRefreshVersion((current) => current + 1);
    if (mode === 'move') {
      const movedSet = new Set(sourcePaths.map((path) => normalizePath(path).toLowerCase()));
      const nextSelection = new Set(Array.from(selectedPathsRef.current).filter((path) => !movedSet.has(normalizePath(path).toLowerCase())));
      selectedPathsRef.current = nextSelection;
      setSelectedPaths(nextSelection);
      const nextLastSelectedPath = movedSet.has(normalizePath(lastSelectedPath).toLowerCase()) ? '' : lastSelectedPath;
      setLastSelectedPath(nextLastSelectedPath);
      emitSelectionChanged(Array.from(nextSelection), nextLastSelectedPath);
      window.dispatchEvent(new CustomEvent('umbra:gallery-remove-paths', {
        detail: { paths: sourcePaths, source: 'react-gallery-transfer' },
      }));
    }
    void loadFolder({ folder: currentFolder, keepSelection: mode !== 'move', forceRefresh: true, preserveScroll: true });
    void loadTreeChildren(destination, true);
  }, [clearPageCacheForFolder, currentFolder, emitSelectionChanged, invalidateTreeChildrenCache, lastSelectedPath, loadFolder, loadTreeChildren]);

  const pollTransferJob = useCallback(async (mode: 'move' | 'copy', jobId: string) => {
    const endpoint = mode === 'copy' ? '/api/fs/copy/status' : '/api/fs/move/status';
    for (let attempt = 0; attempt < 360; attempt += 1) {
      const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || `Failed to read ${mode} status`));
      const job = (payload as { job?: Record<string, unknown> }).job || {};
      const status = String(job.status || '');
      const results = Array.isArray(job.results) ? job.results as Array<Record<string, unknown>> : [];
      const completedPaths = Number(job[mode === 'copy' ? 'copied' : 'moved'] || 0)
        || results.filter((entry) => entry.success === true).length;
      const totalPaths = Number(job.totalPaths || 0);
      const totalUnits = Number(job.totalUnits || 0);
      const completedUnits = Number(job.completedUnits || 0);
      const percent = Number(job.percent || (totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0));
      setTransferProgress((current) => current ? {
        ...current,
        active: status !== 'completed' && status !== 'failed',
        totalPaths: totalPaths || current.totalPaths,
        completedPaths: Math.max(current.completedPaths, completedPaths),
        totalUnits: totalUnits || current.totalUnits,
        completedUnits: Math.max(current.completedUnits, completedUnits),
        percent: Math.max(current.percent, Math.min(100, percent)),
        currentPath: String(job.currentPath || current.currentPath || ''),
        error: status === 'failed' ? String(job.error || '') : undefined,
      } : current);
      if (status === 'completed') {
        return results.filter((entry) => entry.success === true).length;
      }
      if (status === 'failed') throw new Error(String(job.error || `${mode === 'copy' ? 'Copy' : 'Move'} failed`));
      await sleep(450);
    }
    throw new Error(`${mode === 'copy' ? 'Copy' : 'Move'} is still running`);
  }, []);

  const transferPathsToFolder = useCallback(async (paths: string[], destinationPath: string, mode: 'move' | 'copy') => {
    if (transferInProgress) {
      addToast({ type: 'info', message: 'A transfer is already running' });
      return;
    }
    const destination = normalizePath(destinationPath);
    const validPaths = getValidTransferPathsForDestination(paths, destination);
    if (!destination || validPaths.length === 0) {
      addToast({ type: 'info', message: 'Nothing to transfer to that folder' });
      return;
    }

    setTransferInProgress(true);
    if (transferProgressHideTimerRef.current !== null) {
      window.clearTimeout(transferProgressHideTimerRef.current);
      transferProgressHideTimerRef.current = null;
    }
    setTransferProgress({
      active: true,
      mode,
      destination,
      totalPaths: validPaths.length,
      completedPaths: 0,
      totalUnits: validPaths.length,
      completedUnits: 0,
      percent: 0,
      currentPath: validPaths[0] || destination,
    });
    try {
      const endpoint = mode === 'copy' ? '/api/fs/copy' : '/api/fs/move';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: validPaths,
          destination,
          trackProgress: true,
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || `Failed to ${mode} media`));
      let completed = 0;
      const jobId = String(payload.jobId || '').trim();
      if (jobId) {
        completed = await pollTransferJob(mode, jobId);
      } else {
        const results = Array.isArray(payload.results) ? payload.results as Array<Record<string, unknown>> : [];
        completed = results.filter((entry) => entry.success === true).length || Number(payload[mode === 'copy' ? 'copied' : 'moved'] || 0);
      }
      refreshAfterTransfer(validPaths, destination, mode);
      setTransferProgress((current) => current ? {
        ...current,
        active: false,
        completedPaths: completed || validPaths.length,
        completedUnits: current.totalUnits || completed || validPaths.length,
        percent: 100,
        currentPath: destination,
      } : current);
      scheduleTransferProgressClear();
      addToast({
        type: completed > 0 ? 'success' : 'info',
        message: `${mode === 'copy' ? 'Copied' : 'Moved'} ${completed || validPaths.length} item${(completed || validPaths.length) === 1 ? '' : 's'} to ${pathLeaf(destination) || destination}`,
      });
    } catch (error) {
      setTransferProgress((current) => current ? {
        ...current,
        active: false,
        error: error instanceof Error ? error.message : `Failed to ${mode} media`,
      } : current);
      scheduleTransferProgressClear(5000);
      addToast({ type: 'error', message: error instanceof Error ? error.message : `Failed to ${mode} media` });
    } finally {
      setTransferInProgress(false);
      setDropTargetFolder('');
      setDraggingPaths([]);
    }
  }, [addToast, pollTransferJob, refreshAfterTransfer, scheduleTransferProgressClear, transferInProgress]);

  const openTransferChoiceMenu = useCallback((event: React.MouseEvent | React.DragEvent, paths: string[], destinationPath: string) => {
    const destination = normalizePath(destinationPath);
    const validPaths = getValidTransferPathsForDestination(paths, destination);
    if (!destination || validPaths.length === 0) return;
    setContextMenu({
      kind: 'transfer',
      x: event.clientX,
      y: event.clientY,
      targetPath: destination,
      paths: validPaths,
    });
  }, []);

  const startGalleryPathDrag = useCallback((event: React.DragEvent, pathValue: string, selectedFallback = false) => {
    const path = normalizePath(pathValue);
    if (!path || isTrashPath(path)) {
      event.preventDefault();
      return;
    }
    const paths = selectedFallback && selectedPathKeys.has(selectionPathKey(path)) ? Array.from(selectedPaths) : [path];
    const validPaths = uniqueNormalizedPaths(paths).filter((entry) => !isTrashPath(entry));
    if (validPaths.length === 0) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(GALLERY_DRAG_PATHS_MIME, JSON.stringify(validPaths));
    event.dataTransfer.setData('application/json', JSON.stringify({ source: 'react-gallery', paths: validPaths }));
    event.dataTransfer.setData('text/plain', validPaths.join('\n'));
    setDraggingPaths(validPaths);
  }, [selectedPathKeys, selectedPaths]);

  const startMediaDrag = useCallback((event: React.DragEvent, file: GalleryFile) => {
    startGalleryPathDrag(event, file.path, file.type !== 'folder');
  }, [startGalleryPathDrag]);

  const clearMediaDrag = useCallback(() => {
    setDraggingPaths([]);
    setDropTargetFolder('');
  }, []);

  const startFolderDrag = useCallback((event: React.DragEvent, folderPath: string) => {
    startGalleryPathDrag(event, folderPath, false);
  }, [startGalleryPathDrag]);

  const handleFolderDropTargetDragOver = useCallback((event: React.DragEvent, folderPath: string) => {
    const validPaths = getValidTransferPathsForDestination(
      draggingPaths.length > 0 ? draggingPaths : readDragTransferPaths(event.dataTransfer),
      folderPath,
    );
    if (validPaths.length === 0 || transferInProgress) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.ctrlKey || event.metaKey ? 'copy' : 'move';
    setDropTargetFolder(normalizePath(folderPath));
  }, [draggingPaths, transferInProgress]);

  const handleFolderDropTargetDrop = useCallback((event: React.DragEvent, folderPath: string) => {
    const validPaths = getValidTransferPathsForDestination(
      draggingPaths.length > 0 ? draggingPaths : readDragTransferPaths(event.dataTransfer),
      folderPath,
    );
    clearMediaDrag();
    if (validPaths.length === 0 || transferInProgress) return;
    event.preventDefault();
    openTransferChoiceMenu(event, validPaths, folderPath);
  }, [clearMediaDrag, draggingPaths, openTransferChoiceMenu, transferInProgress]);

  const handleFolderDropTargetDragLeave = useCallback((folderPath: string) => {
    setDropTargetFolder((current) => pathsEqual(current, folderPath) ? '' : current);
  }, []);

  useEffect(() => () => {
    if (transferProgressHideTimerRef.current !== null) {
      window.clearTimeout(transferProgressHideTimerRef.current);
      transferProgressHideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleTransferRequest = (event: Event) => {
      const detail = (event as CustomEvent).detail as { paths?: unknown; destination?: unknown; mode?: unknown } | undefined;
      const paths = Array.isArray(detail?.paths) ? uniqueNormalizedPaths(detail.paths.map(normalizePath)) : [];
      const destination = normalizePath(detail?.destination);
      const mode = detail?.mode === 'copy' ? 'copy' : 'move';
      if (paths.length === 0 || !destination) return;
      void transferPathsToFolder(paths, destination, mode);
    };
    window.addEventListener('umbra:gallery-transfer-request', handleTransferRequest);
    return () => window.removeEventListener('umbra:gallery-transfer-request', handleTransferRequest);
  }, [transferPathsToFolder]);

  const revealPaths = useCallback(async (paths: string[]) => {
    if (isRemoteClient) {
      addToast({ type: 'error', message: 'Opening File Explorer is only available from the host PC.' });
      return;
    }
    const targetPath = stripLiveGenerationPreviewPaths(paths).at(0) || '';
    if (!targetPath) return;
    try {
      const response = await fetch('/api/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to open in file explorer'));
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to open in file explorer' });
    }
  }, [addToast]);

  const copyPaths = useCallback(async (paths: string[]) => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0) return;
    try {
      await navigator.clipboard.writeText(normalized.join('\n'));
      addToast({ type: 'success', message: normalized.length === 1 ? 'Copied path' : `Copied ${normalized.length} paths` });
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to copy paths' });
    }
  }, [addToast, isRemoteClient]);

  const downloadOriginalPaths = useCallback((paths: string[]) => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0 || typeof document === 'undefined') return;
    if (normalized.length > 1) {
      const form = document.createElement('form');
      const input = document.createElement('input');
      form.method = 'POST';
      form.action = '/api/fs/download-zip';
      form.style.display = 'none';
      input.type = 'hidden';
      input.name = 'paths';
      input.value = JSON.stringify(normalized);
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      window.setTimeout(() => form.remove(), 1000);
      addToast({ type: 'success', message: `Packing ${normalized.length} originals into a zip` });
      return;
    }
    normalized.forEach((path, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a');
        anchor.href = `/api/fs/image?path=${encodeURIComponent(path)}&download=1`;
        anchor.download = pathLeaf(path) || 'umbra-media';
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }, index * 125);
    });
    addToast({
      type: 'success',
      message: normalized.length === 1 ? 'Downloading original' : `Downloading ${normalized.length} originals`,
    });
  }, [addToast]);

  const downloadJpegZip = useCallback((paths: string[], metadata: 'keep' | 'strip') => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0 || typeof document === 'undefined') return;
    const form = document.createElement('form');
    const pathsInput = document.createElement('input');
    const metadataInput = document.createElement('input');
    form.method = 'POST';
    form.action = '/api/fs/download-jpeg-zip';
    form.style.display = 'none';
    pathsInput.type = 'hidden';
    pathsInput.name = 'paths';
    pathsInput.value = JSON.stringify(normalized);
    metadataInput.type = 'hidden';
    metadataInput.name = 'metadata';
    metadataInput.value = metadata;
    form.appendChild(pathsInput);
    form.appendChild(metadataInput);
    document.body.appendChild(form);
    form.submit();
    window.setTimeout(() => form.remove(), 1000);
    addToast({
      type: 'success',
      message: metadata === 'keep'
        ? `Packing ${normalized.length} JPEG${normalized.length === 1 ? '' : 's'} with metadata`
        : `Packing ${normalized.length} clean JPEG${normalized.length === 1 ? '' : 's'}`,
    });
  }, [addToast]);

  const refreshDatasetTargets = useCallback(async (options: { quiet?: boolean } = {}) => {
    setDatasetTargetsLoading(true);
    try {
      const response = await fetch('/api/datasets');
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to load datasets'));
      setDatasetTargets(Array.isArray((payload as any).datasets) ? (payload as any).datasets : []);
    } catch (error) {
      if (!options.quiet) {
        addToast({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to load datasets',
        });
      }
    } finally {
      setDatasetTargetsLoading(false);
    }
  }, [addToast]);

  const importPathsToDatasetConcept = useCallback(async (paths: string[], dataset: string, concept: string) => {
    const normalized = uniqueNormalizedPaths(stripLiveGenerationPreviewPaths(paths));
    const imagePaths = normalized.filter((path) => {
      const file = knownFilesRef.current.find((entry) => pathsEqual(entry.path, path));
      return !file || file.type === 'image' || file.type === 'gif';
    });
    if (imagePaths.length === 0) {
      addToast({ type: 'error', message: 'Select image files to add to a dataset' });
      return;
    }

    try {
      const response = await fetch('/api/datasets/import-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePaths: imagePaths, dataset, concept }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to add images to dataset'));

      const imported = Number((payload as any).imported || 0);
      const failed = Number((payload as any).failed || 0);
      addToast({
        type: failed > 0 ? 'info' : 'success',
        message: failed > 0
          ? `Added ${imported} image${imported === 1 ? '' : 's'} to ${dataset}; ${failed} failed`
          : `Added ${imported} image${imported === 1 ? '' : 's'} to ${dataset}`,
      });
      void refreshDatasetTargets({ quiet: true });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to add images to dataset',
      });
    }
  }, [addToast, refreshDatasetTargets]);

  useEffect(() => {
    void refreshDatasetTargets({ quiet: true });
  }, [refreshDatasetTargets]);

  const openOrCopyComfyWorkflow = useCallback(async (paths: string[]) => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return;
    let lastError = '';
    for (const path of normalized) {
      try {
        const cachedMetadata = getCachedViewerMetadata(path);
        const cachedApiPayload = cachedMetadata
          ? await resolveGalleryApiWorkflowOpenPayload(cachedMetadata, pathLeaf(path) || 'API workflow')
          : null;
        if (cachedApiPayload) {
          setActiveWorkspace('comfyui');
          dispatchGalleryWorkflowOpen(cachedApiPayload);
          return;
        }
        const cachedExport = getWorkflowJsonExport(cachedMetadata);
        if (cachedExport) {
          await navigator.clipboard.writeText(cachedExport.text);
          addToast({ type: 'success', message: `Copied ${cachedExport.label}` });
          return;
        }
        const response = await fetchGalleryFs('/metadata', new URLSearchParams({ path }));
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          lastError = String(payload?.error || 'Failed to read metadata');
          continue;
        }
        setCachedViewerMetadata(path, payload as GalleryViewerMetadata);
        const metadataPayload = payload as ImageMetadata;
        const apiPayload = await resolveGalleryApiWorkflowOpenPayload(metadataPayload, pathLeaf(path) || 'API workflow');
        if (apiPayload) {
          setActiveWorkspace('comfyui');
          dispatchGalleryWorkflowOpen(apiPayload);
          return;
        }
        const exportPayload = getWorkflowJsonExport(metadataPayload);
        if (!exportPayload) continue;
        await navigator.clipboard.writeText(exportPayload.text);
        addToast({ type: 'success', message: `Copied ${exportPayload.label}` });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Failed to read metadata';
      }
    }
    addToast({ type: 'error', message: lastError || 'No workflow JSON found in selection' });
  }, [addToast, setActiveWorkspace]);

  const renamePreview = useMemo(() => (
    renameModal ? buildRenamePreview(renameModal.paths, renameModal.template) : []
  ), [renameModal]);

  const renamePaths = useCallback((paths: string[]) => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return;
    const initialTemplate = normalized.length === 1
      ? (splitFileName(pathLeaf(normalized[0])).base || pathLeaf(normalized[0]))
      : '{original}';
    setRenameModal({
      paths: normalized,
      template: initialTemplate,
      submitting: false,
    });
  }, []);

  const submitRenameModal = useCallback(async () => {
    if (!renameModal || renameModal.submitting) return;
    const normalized = uniqueNormalizedPaths(renameModal.paths);
    if (normalized.length === 0) return;
    const items = buildRenamePreview(normalized, renameModal.template)
      .filter((entry) => entry.nextName && entry.nextName !== entry.currentName)
      .map((entry) => ({ path: entry.path, name: entry.nextName }));
    if (items.length === 0) {
      addToast({ type: 'info', message: 'No rename changes to apply' });
      return;
    }

    try {
      setRenameModal((current) => current ? { ...current, submitting: true } : current);
      const response = await fetch('/api/fs/rename/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to rename items'));
      const results = Array.isArray((payload as { results?: unknown }).results)
        ? (payload as { results?: Array<Record<string, unknown>> }).results || []
        : [];
      const renamed = Number((payload as { renamed?: unknown }).renamed);
      const failed = Number((payload as { failed?: unknown }).failed);
      const renamedCount = Number.isFinite(renamed) ? Math.trunc(renamed) : results.filter((entry) => entry?.success === true).length;
      const failedCount = Number.isFinite(failed) ? Math.trunc(failed) : Math.max(0, items.length - renamedCount);
      if (renamedCount <= 0) {
        const firstFailure = results.find((entry) => entry?.success !== true);
        throw new Error(String(firstFailure?.error || 'Failed to rename items'));
      }
      const newPathByOldPath = new Map<string, string>();
      for (const result of results) {
        if (result?.success !== true) continue;
        const oldPath = normalizePath(result.path);
        const newPath = normalizePath(result.newPath);
        if (oldPath && newPath) newPathByOldPath.set(oldPath.toLowerCase(), newPath);
      }
      if (newPathByOldPath.size > 0) {
        setSelectedPaths((current) => {
          const next = new Set<string>();
          for (const path of current) {
            next.add(newPathByOldPath.get(normalizePath(path).toLowerCase()) || path);
          }
          return next;
        });
        setViewerPath((current) => newPathByOldPath.get(normalizePath(current).toLowerCase()) || current);
      }
      setRenameModal(null);
      addToast({
        type: failedCount > 0 ? 'info' : 'success',
        message: failedCount > 0 ? `Renamed ${renamedCount} item${renamedCount === 1 ? '' : 's'} (${failedCount} failed)` : `Renamed ${renamedCount} item${renamedCount === 1 ? '' : 's'}`,
      });
      const folders = uniqueNormalizedPaths(normalized.map(pathParent));
      for (const folder of folders) {
        window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
          detail: { path: folder, folderPath: folder, source: 'react-gallery', reason: 'rename' },
        }));
      }
      clearPageCacheForFolder(currentFolder);
      void loadFolder({ folder: currentFolder, keepSelection: true, forceRefresh: true, preserveScroll: true });
    } catch (error) {
      setRenameModal((current) => current ? { ...current, submitting: false } : current);
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to rename item' });
    }
  }, [addToast, clearPageCacheForFolder, currentFolder, loadFolder, renameModal]);

  const getUnionTagsForPaths = useCallback((paths: string[]) => {
    const requested = new Set(uniqueNormalizedPaths(paths).map((path) => path.toLowerCase()));
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const file of knownFilesRef.current) {
      const key = normalizePath(file.path).toLowerCase();
      if (!requested.has(key)) continue;
      for (const tag of normalizeTags(file.tags)) {
        const tagKey = tag.toLowerCase();
        if (seen.has(tagKey)) continue;
        seen.add(tagKey);
        tags.push(tag);
      }
    }
    return tags;
  }, []);

  const openTagEditor = useCallback((paths: string[]) => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return;
    setTagModal({
      paths: normalized,
      tags: getUnionTagsForPaths(normalized),
      input: '',
      submitting: false,
    });
  }, [getUnionTagsForPaths]);

  const applyTagsToLoadedFiles = useCallback((paths: string[], tags: string[]) => {
    const pathSet = new Set(uniqueNormalizedPaths(paths).map((path) => path.toLowerCase()));
    const nextTags = normalizeTags(tags);
    const updateFile = (file: GalleryFile): GalleryFile => (
      pathSet.has(normalizePath(file.path).toLowerCase())
        ? { ...file, tags: nextTags }
        : file
    );

    setFiles((current) => {
      const nextFiles = current.map(updateFile);
      filesRef.current = nextFiles;
      return nextFiles;
    });
    setSearchResults((current) => current ? {
      ...current,
      files: Array.isArray(current.files) ? current.files.map(updateFile) : current.files,
    } : current);
    setFolderPreviewGroups((current) => current.map((group) => {
      const nextGroup = { ...group, files: group.files.map(updateFile) };
      folderPreviewCacheRef.current.set(galleryFolderPreviewCacheKey(group.folder.path, sortBy, sortOrder), nextGroup);
      return nextGroup;
    }));
  }, [sortBy, sortOrder]);

  const submitTagModal = useCallback(async () => {
    if (!tagModal || tagModal.submitting) return;
    const normalized = uniqueNormalizedPaths(tagModal.paths);
    if (normalized.length === 0) return;
    const tags = normalizeTags(tagModal.tags);
    try {
      setTagModal((current) => current ? { ...current, submitting: true } : current);
      const response = await fetchGalleryFs('/tags/set', new URLSearchParams(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: normalized, tags }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to update tags'));
      applyTagsToLoadedFiles(normalized, tags);
      setTagModal(null);
      addToast({ type: 'success', message: `Saved tags for ${normalized.length} item${normalized.length === 1 ? '' : 's'}` });
    } catch (error) {
      setTagModal((current) => current ? { ...current, submitting: false } : current);
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update tags' });
    }
  }, [addToast, applyTagsToLoadedFiles, tagModal]);

  useEffect(() => {
    const onOpenTagEditor = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const paths = Array.isArray(detail.paths)
        ? detail.paths.map(normalizePath).filter(Boolean)
        : [];
      openTagEditor(paths);
    };
    window.addEventListener('umbra:gallery-open-tag-editor', onOpenTagEditor as EventListener);
    return () => window.removeEventListener('umbra:gallery-open-tag-editor', onOpenTagEditor as EventListener);
  }, [openTagEditor]);

  const buildDeleteWarningState = useCallback((paths: string[], keepSelection: boolean): GalleryDeleteWarningModalState | null => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0) return null;

    const knownMediaKeys = new Set<string>();
    for (const file of [
      ...knownFilesRef.current,
      ...filesRef.current,
      ...activeViewerFilesRef.current,
      ...viewerSessionFilesRef.current,
    ]) {
      const filePath = normalizePath(file.path);
      if (filePath) knownMediaKeys.add(filePath.toLowerCase());
    }

    const groups = folderPreviewGroupsRef.current;
    const currentSummary = folderSummarySnapshotRef.current;
    const currentChildren = treeChildrenByPath[normalizePath(currentFolder)] || [];
    const folders: GalleryDeleteWarningFolder[] = [];
    let mediaCount = 0;

    for (const path of normalized) {
      const key = path.toLowerCase();
      const knownAsMedia = knownMediaKeys.has(key);
      const previewGroup = groups.find((group) => pathsEqual(group.folder.path, path));
      const isCurrentFolderDelete = pathsEqual(path, currentFolder);
      const shouldTreatAsFolder = Boolean(previewGroup || isCurrentFolderDelete || (!knownAsMedia && !isLikelyFilePath(path)));

      if (!shouldTreatAsFolder) {
        mediaCount += 1;
        continue;
      }

      const currentSubfolderCount = isCurrentFolderDelete
        ? Math.max(
            currentChildren.length,
            pathsEqual(currentSummary?.path, path) ? Math.max(0, Math.trunc(Number(currentSummary?.subfolderCount || 0))) : 0,
          )
        : undefined;

      folders.push({
        path,
        name: previewGroup?.folder.name || pathLeaf(path) || path,
        mediaCount: previewGroup
          ? Math.max(0, Math.trunc(Number(previewGroup.total || previewGroup.files.length || 0)))
          : isCurrentFolderDelete && pathsEqual(currentSummary?.path, path)
            ? Math.max(0, Math.trunc(Number(currentSummary?.totalMediaCount || 0)))
            : undefined,
        subfolderCount: previewGroup
          ? Math.max(0, Math.trunc(Number(previewGroup.childFolderCount || 0)))
          : currentSubfolderCount,
      });
    }

    if (folders.length === 0) return null;
    return {
      paths: normalized,
      folders,
      mediaCount,
      keepSelection,
    };
  }, [currentFolder, treeChildrenByPath]);

  const executeMovePathsToTrash = useCallback((paths: string[], options: { keepSelection?: boolean } = {}) => {
    void deleteGalleryPaths(paths, { keepSelection: !!options.keepSelection, rollbackOnFailure: false });
  }, [deleteGalleryPaths]);

  const movePathsToTrash = useCallback((paths: string[], options: { keepSelection?: boolean; bypassFolderWarning?: boolean } = {}) => {
    const keepSelection = options.keepSelection ?? true;
    if (!options.bypassFolderWarning) {
      const warningState = buildDeleteWarningState(paths, keepSelection);
      if (warningState) {
        setContextMenu(null);
        setDeleteWarningModal(warningState);
        return;
      }
    }
    executeMovePathsToTrash(paths, { keepSelection });
  }, [buildDeleteWarningState, executeMovePathsToTrash]);

  const restoreTrashPaths = useCallback(async (paths: string[]) => {
    const normalized = stripLiveGenerationPreviewPaths(paths);
    if (normalized.length === 0) return;
    let optimisticSnapshot = applyOptimisticPathRemoval(normalized, {
      keepSelection: false,
      reason: 'restore',
    });
    try {
      const response = await fetch('/api/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: normalized.map((trashPath) => {
            const file = filesRef.current.find((entry) => pathsEqual(entry.path, trashPath));
            const originalPath = normalizePath(file?.trashOriginalPath || file?.originalPath);
            return {
              trashPath,
              ...(originalPath ? { originalPath } : {}),
            };
          }),
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to restore from trash'));
      const restored = Array.isArray((payload as { restored?: unknown[] }).restored)
        ? (payload as { restored?: Array<Record<string, unknown>> }).restored || []
        : [];
      const failed = Array.isArray((payload as { failed?: unknown[] }).failed)
        ? (payload as { failed?: Array<{ trashPath?: string; error?: string }> }).failed || []
        : [];
      if (failed.length > 0 && restored.length === 0) {
        throw new Error(String(failed[0]?.error || 'Failed to restore from trash'));
      }
      const restoredPaths = restored
        .map((entry) => normalizePath(String(entry?.restoredPath || entry?.originalPath || entry?.path || '')))
        .filter(Boolean);
      if (failed.length > 0 && optimisticSnapshot) {
        const restoredTrashPaths = uniqueNormalizedPaths(
          restored.map((entry) => normalizePath(String(entry?.trashPath || ''))).filter(Boolean),
        );
        rollbackOptimisticPathRemoval(optimisticSnapshot);
        optimisticSnapshot = applyOptimisticPathRemoval(restoredTrashPaths, {
          keepSelection: false,
          reason: 'restore',
        });
      }
      if (restoredPaths.length > 0) {
        rememberRestoredHighlights(restoredPaths);
        window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
          detail: { paths: restoredPaths, source: 'react-gallery' },
        }));
      }
      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', { detail: { source: 'react-gallery' } }));
      addToast({ type: 'success', message: `Restored ${restoredPaths.length || normalized.length} item${(restoredPaths.length || normalized.length) === 1 ? '' : 's'}` });
      if (failed.length > 0) {
        addToast({
          type: 'error',
          message: failed.length === 1
            ? String(failed[0]?.error || 'Failed to restore an item')
            : `${String(failed[0]?.error || 'Failed to restore an item')} (+${failed.length - 1} more)`,
        });
      }
      clearTrashCache();
      void loadFolder({ folder: currentFolder, keepSelection: false, forceRefresh: true, preserveScroll: true });
    } catch (error) {
      rollbackOptimisticPathRemoval(optimisticSnapshot);
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to restore from trash' });
    }
  }, [addToast, applyOptimisticPathRemoval, clearTrashCache, currentFolder, loadFolder, rememberRestoredHighlights, rollbackOptimisticPathRemoval]);

  const deleteTrashPathsForever = useCallback(async (paths: string[]) => {
    const normalized = uniqueNormalizedPaths(paths);
    if (normalized.length === 0) return;
    try {
      const response = await fetch('/api/trash/permanent-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: normalized }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', { detail: { source: 'react-gallery' } }));
      addToast({ type: 'success', message: `Deleted ${normalized.length} item${normalized.length === 1 ? '' : 's'} permanently` });
      clearTrashCache();
      void loadFolder({ folder: currentFolder, keepSelection: false, forceRefresh: true, preserveScroll: true });
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to permanently delete from trash' });
    }
  }, [addToast, clearTrashCache, currentFolder, loadFolder]);

  const applyTrashRetention = useCallback(async () => {
    const days = clampTrashRetentionDays(trashRetentionDays);
    setSavingTrashSettings(true);
    try {
      setAppSetting('library.trashAutoDeleteDays', days as any);
      const response = await fetch('/api/trash/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to update trash retention'));
      clearTrashCache();
      addToast({ type: 'success', message: `Trash retention set to ${days} day${days === 1 ? '' : 's'}` });
      if (isTrashPath(currentFolder)) {
        void loadFolder({ folder: currentFolder, keepSelection: true, forceRefresh: true, preserveScroll: true });
      }
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update trash retention' });
    } finally {
      setSavingTrashSettings(false);
    }
  }, [addToast, clearTrashCache, currentFolder, loadFolder, setAppSetting, trashRetentionDays]);

  const emptyTrash = useCallback(async () => {
    if (emptyingTrash) return;
    setEmptyingTrash(true);
    try {
      const response = await fetch('/api/trash/empty', { method: 'POST' });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to empty Trash'));
      clearTrashCache();
      setSelectedPaths(new Set());
      setLastSelectedPath('');
      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', { detail: { source: 'react-gallery' } }));
      addToast({ type: 'success', message: 'Emptied Trash' });
      if (isTrashPath(currentFolder)) {
        void loadFolder({ folder: TRASH_ROOT, keepSelection: false, forceRefresh: true, preserveScroll: true });
      }
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to empty Trash' });
    } finally {
      setEmptyingTrash(false);
    }
  }, [addToast, clearTrashCache, currentFolder, emptyingTrash, loadFolder]);

  const reorderPathsRelativeToTarget = useCallback(async (paths: string[], targetPath: string, position: 'before' | 'after') => {
    const target = normalizePath(targetPath);
    if (!target) return;
    const previousFiles = filesRef.current;
    const previousSortBy = sortBy;
    const previousSortOrder = sortOrder;
    const previousSetSortRules = setSortRules;
    const reordered = buildReorderedGalleryFiles(previousFiles, paths, target, position);
    if (!reordered) return;
    const targetFile = previousFiles.find((file) => pathsEqual(file.path, target));
    const targetSetId = groupBySet && targetFile ? (getGallerySetIdsForFile(targetFile)[0] ?? 0) : null;
    const switchingToCustomSort = targetSetId === null && (previousSortBy !== 'custom' || previousSortOrder !== 'asc');

    if (switchingToCustomSort) skipNextSortReloadRef.current = true;
    filesRef.current = reordered.files;
    setFiles(reordered.files);
    if (targetSetId !== null) {
      setSetSortRules((current) => ({
        ...current,
        [String(targetSetId)]: {
          ...getSetSortRule(targetSetId, current, previousSortBy, previousSortOrder),
          sortBy: 'custom',
          sortOrder: 'asc',
        },
      }));
    } else {
      markGalleryUiSessionDirty();
      setSortBy('custom');
      setSortOrder('asc');
    }
    clearPageCacheForFolder(currentFolder);
    emitFilmstripFeed(currentFolder, reordered.files, {
      mode: 'replace',
      files: reordered.files,
      total: Math.max(total, reordered.files.length),
      done,
      nextCursor,
      sortBy: 'custom',
      sortOrder: 'asc',
    });

    try {
      const response = await fetch('/api/fs/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFolder, orderedPaths: reordered.orderedPaths }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to reorder items'));
      addToast({ type: 'success', message: `Reordered ${reordered.movingCount} item${reordered.movingCount === 1 ? '' : 's'}` });
    } catch (error) {
      if (switchingToCustomSort) skipNextSortReloadRef.current = true;
      filesRef.current = previousFiles;
      setFiles(previousFiles);
      if (targetSetId !== null) setSetSortRules(previousSetSortRules);
      setSortBy(previousSortBy);
      setSortOrder(previousSortOrder);
      emitFilmstripFeed(currentFolder, previousFiles, {
        mode: 'replace',
        files: previousFiles,
        total: Math.max(total, previousFiles.length),
        done,
        nextCursor,
        sortBy: previousSortBy,
        sortOrder: previousSortOrder,
      });
      addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to reorder items' });
    }
  }, [addToast, clearPageCacheForFolder, currentFolder, done, emitFilmstripFeed, groupBySet, markGalleryUiSessionDirty, nextCursor, setSortRules, sortBy, sortOrder, total]);

  const selectAllInFolder = useCallback(async () => {
    const folderPath = normalizePath(currentFolder);
    if (!folderPath || selectAllLoading) return;
    setSelectAllLoading(true);
    try {
      if (isTrashRootPath(folderPath)) {
        const response = await fetch('/api/trash/list', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({} as { items?: TrashMetadataItem[]; error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to select Trash items'));
        const paths = (Array.isArray(payload.items) ? payload.items : [])
          .map((item) => normalizePath(item.trashPath))
          .filter(Boolean);
        trashAllFilesRef.current = (Array.isArray(payload.items) ? payload.items : [])
          .map((entry, index) => toTrashGalleryFile(entry, index))
          .filter((file): file is GalleryFile => Boolean(file));
        const nextSelection = new Set(paths);
        setSelectedPaths(nextSelection);
        selectedPathsRef.current = nextSelection;
        setLastSelectedPath(paths.at(-1) || '');
        emitSelectionChanged(paths, paths.at(-1));
        addToast({ type: 'success', message: `Selected ${paths.length} Trash item${paths.length === 1 ? '' : 's'}` });
        return;
      }

      const selected = new Set<string>();
      let cursor = 0;
      let pageCount = 0;
      let nextCursorValue: number | null = 0;

      while (nextCursorValue != null && pageCount < 2000) {
        const params = new URLSearchParams({
          path: folderPath,
          cursor: String(cursor),
          limit: String(SELECT_ALL_PAGE_SIZE),
          sortBy,
          sortOrder,
          fast: '1',
          recursive: 'false',
        });
        const response = await fetchGalleryFs('/list-progressive', params);
        const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to select folder media'));

        for (const file of Array.isArray(payload.files) ? payload.files : []) {
          const path = normalizePath(file.path);
          if (path) selected.add(path);
        }

        const incomingNextCursor = typeof payload.nextCursor === 'number' ? payload.nextCursor : null;
        if (payload.done === true || incomingNextCursor == null || incomingNextCursor <= cursor) {
          nextCursorValue = null;
        } else {
          nextCursorValue = incomingNextCursor;
          cursor = incomingNextCursor;
        }
        pageCount += 1;
      }

      const paths = Array.from(selected);
      const nextSelection = new Set(paths);
      setSelectedPaths(nextSelection);
      selectedPathsRef.current = nextSelection;
      setLastSelectedPath(paths.at(-1) || '');
      emitSelectionChanged(paths, paths.at(-1));
      addToast({
        type: 'success',
        message: `Selected ${paths.length} item${paths.length === 1 ? '' : 's'} in folder`,
      });
    } catch (selectError) {
      addToast({
        type: 'error',
        message: selectError instanceof Error ? selectError.message : 'Failed to select folder media',
      });
    } finally {
      setSelectAllLoading(false);
    }
  }, [addToast, currentFolder, emitSelectionChanged, selectAllLoading, sortBy, sortOrder]);

  const selectMetadataMatches = useCallback(() => {
    const paths = uniqueNormalizedPaths(metadataMatches.map((match) => match.path));
    const nextSelection = new Set(paths);
    applyGallerySelection(nextSelection, paths.at(-1) || '');
    addToast({
      type: paths.length > 0 ? 'success' : 'info',
      message: paths.length > 0
        ? `Selected ${paths.length} metadata match${paths.length === 1 ? '' : 'es'}`
        : 'No metadata matches to select',
    });
  }, [addToast, applyGallerySelection, metadataMatches]);

  const upsertDirectSavedOutputs = useCallback((savedFiles: GallerySavedOutputFile[], source = 'powerprompter-output-saved') => {
    if (savedFiles.length === 0) return false;

    for (const file of savedFiles) {
      if (!file.metadata) continue;
      const existing = getCachedViewerMetadata(file.path);
      setCachedViewerMetadata(file.path, {
        ...(existing || {}),
        ...file.metadata,
      });
    }

    const normalizedCurrentFolder = normalizePath(currentFolder);
    if (!normalizedCurrentFolder) return false;

    const currentFolderFiles = savedFiles.filter((file) => pathsEqual(pathParent(file.path), normalizedCurrentFolder));
    const childFolderPaths = Array.from(new Set(
      savedFiles
        .map((file) => pathParent(file.path))
        .filter((folderPath) => folderPath && !pathsEqual(folderPath, normalizedCurrentFolder) && pathIsInsideRoot(folderPath, normalizedCurrentFolder)),
    ));

    if (childFolderPaths.length > 0) {
      invalidateTreeChildrenCache(normalizedCurrentFolder);
      void loadTreeChildren(normalizedCurrentFolder);
    }

    if (currentFolderFiles.length === 0) return childFolderPaths.length > 0;

    const now = Date.now();
    directOutputSyncRef.current.set(normalizedCurrentFolder.toLowerCase(), now);
    for (const file of currentFolderFiles) {
      directOutputSyncRef.current.set(pathParent(file.path).toLowerCase(), now);
    }
    for (const [folderPath, timestamp] of Array.from(directOutputSyncRef.current.entries())) {
      if (now - timestamp > 10_000) directOutputSyncRef.current.delete(folderPath);
    }

    const incomingFiles = currentFolderFiles.map((file): GalleryFile => {
      const path = normalizePath(file.path);
      const modifiedMs = Number.isFinite(Number(file.modifiedMs)) ? Number(file.modifiedMs) : Date.now();
      const size = Number.isFinite(Number(file.size)) ? Number(file.size) : 0;
      return {
        id: path,
        uid: path,
        path,
        name: String(file.name || pathLeaf(path) || 'untitled'),
        type: galleryMediaTypeFromPath(path, file.type),
        modifiedMs,
        createdMs: modifiedMs,
        size,
        metadataReady: false,
        metadataFormat: null,
        tags: normalizeTags(file.tags),
      };
    });

    const byPath = new Map(filesRef.current.map((file) => [normalizePath(file.path).toLowerCase(), file]));
    let added = 0;
    for (const incoming of incomingFiles) {
      const key = normalizePath(incoming.path).toLowerCase();
      const previous = byPath.get(key);
      if (!previous) added += 1;
      byPath.set(key, mergeGalleryFilePreservingIdentity(previous, incoming));
    }

    const nextFiles = Array.from(byPath.values()).sort((left, right) => compareGalleryFiles(left, right, sortBy, sortOrder));
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setTotal((current) => Math.max(current, nextFiles.length));
    setDone((current) => current || nextCursor == null);
    clearPageCacheForFolder(normalizedCurrentFolder);
    const dirtyAfterDeleteAt = dirtyAfterDeleteFoldersRef.current.get(normalizedCurrentFolder.toLowerCase()) || 0;
    const shouldReconcileAfterDelete = dirtyAfterDeleteAt > 0 && now - dirtyAfterDeleteAt < 30_000;
    if (shouldReconcileAfterDelete) {
      dirtyAfterDeleteFoldersRef.current.delete(normalizedCurrentFolder.toLowerCase());
      window.setTimeout(() => {
        void loadFolder({
          folder: normalizedCurrentFolder,
          keepSelection: true,
          forceRefresh: true,
          preserveScroll: true,
        });
      }, 80);
    }
    emitFilmstripFeed(normalizedCurrentFolder, added === incomingFiles.length ? incomingFiles : nextFiles, {
      mode: added === incomingFiles.length ? 'append' : 'replace',
      files: added === incomingFiles.length ? incomingFiles : nextFiles,
      total: Math.max(total, nextFiles.length),
    });
    traceGalleryLoad({
      event: 'direct_output_upsert',
      folderPath: normalizedCurrentFolder,
      incomingFiles: incomingFiles.length,
      appendedFiles: added,
      loadedFiles: nextFiles.length,
      source,
      durationMs: 0,
    });
    return true;
  }, [
    clearPageCacheForFolder,
    currentFolder,
    emitFilmstripFeed,
    invalidateTreeChildrenCache,
    loadFolder,
    loadTreeChildren,
    nextCursor,
    sortBy,
    sortOrder,
    total,
  ]);

  const requestFilmstripLoadMore = useCallback(() => {
    if (done || nextCursor == null) {
      pendingFilmstripLoadMoreRef.current = false;
      return;
    }
    if (loading) {
      pendingFilmstripLoadMoreRef.current = true;
      return;
    }
    pendingFilmstripLoadMoreRef.current = false;
    void loadFolder({
      folder: currentFolder,
      cursor: nextCursor,
      append: true,
      keepSelection: true,
    });
  }, [currentFolder, done, loadFolder, loading, nextCursor]);

  useEffect(() => {
    if (loading || !pendingFilmstripLoadMoreRef.current) return;
    requestFilmstripLoadMore();
  }, [loading, requestFilmstripLoadMore]);

  useEffect(() => {
    const onOpenPath = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const folderPath = normalizePath(detail.folderPath || detail.path || '');
      const imagePath = normalizePath(detail.imagePath || '');
      if (imagePath && isLiveGenerationPreviewPath(imagePath)) {
        followLiveGenerationViewerRef.current = true;
        const targetFile = liveGenerationPreviewFile || viewerFileFallback || galleryFileFromGenerationPreview(detail);
        const liveMetadata = metadataFromGenerationPreview(detail);
        if (liveMetadata) setCachedViewerMetadata(imagePath, liveMetadata);
        if (targetFile) {
          setViewerPath(targetFile.path);
          setViewerFileFallback(targetFile);
          updateViewerSessionFiles([
            targetFile,
            ...viewerSessionFilesRef.current.filter((file) => !isLiveGenerationPreviewPath(file.path)),
          ]);
        }
        return;
      }
      const targetFolder = imagePath ? pathParent(imagePath) || folderPath : folderPath;
      if (targetFolder) {
        setFocusedFolder(targetFolder);
        addOpenedFolder(targetFolder);
        void loadFolder({ folder: targetFolder, keepSelection: Boolean(imagePath) });
      }
      if (imagePath) {
        followLiveGenerationViewerRef.current = false;
        const targetFile = knownFilesRef.current.find((file) => pathsEqual(file.path, imagePath))
          || filesRef.current.find((file) => pathsEqual(file.path, imagePath))
          || {
            path: imagePath,
            name: pathLeaf(imagePath) || 'image',
            type: galleryMediaTypeFromPath(imagePath),
          } satisfies GalleryFile;
        const orderedFiles = getSelectionOrderedFiles();
        updateViewerSessionFiles(
          orderedFiles.some((file) => pathsEqual(file.path, imagePath))
            ? orderedFiles
            : [targetFile, ...orderedFiles],
        );
        setSelectedPaths(new Set([imagePath]));
        setLastSelectedPath(imagePath);
        setViewerPath(imagePath);
        setViewerFileFallback(targetFile);
        emitSelectionChanged([imagePath], imagePath);
      }
    };
    const onRevealPath = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const folderPath = normalizePath(detail.folderPath || detail.path || '');
      const imagePath = normalizePath(detail.imagePath || '');
      const targetFolder = imagePath ? pathParent(imagePath) || folderPath : folderPath;
      if (targetFolder) {
        setFocusedFolder(targetFolder);
        addOpenedFolder(targetFolder);
        pendingRevealPathRef.current = imagePath || targetFolder;
        void loadFolder({ folder: targetFolder, keepSelection: Boolean(imagePath), forceRefresh: true });
      }
      if (imagePath) {
        setSelectedPaths(new Set([imagePath]));
        setLastSelectedPath(imagePath);
        emitSelectionChanged([imagePath], imagePath);
      }
    };
    const onRequestFeed = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const folderPath = normalizePath(detail.folderPath || detail.path || currentFolder);
      if (folderPath && folderPath !== currentFolder) {
        void loadFolder({ folder: folderPath, keepSelection: true });
      } else {
        emitFilmstripFeed(currentFolder, files);
      }
    };
    const onSetSelection = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === 'react-gallery') return;
      const paths = Array.isArray(detail.paths) ? detail.paths.map(normalizePath).filter(Boolean) : [];
      const nextSelection = new Set(paths);
      setSelectedPaths(nextSelection);
      selectedPathsRef.current = nextSelection;
      setLastSelectedPath(normalizePath(detail.primaryPath || paths.at(-1) || ''));
    };
    const onSetSort = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === 'react-gallery') return;
      const nextSortBy = String(detail.sortBy || '').toLowerCase();
      const nextSortOrder = String(detail.sortOrder || '').toLowerCase();
      if (nextSortBy === 'created' || nextSortBy === 'modified' || nextSortBy === 'name' || nextSortBy === 'custom') {
        setSortBy(nextSortBy);
      }
      setSortOrder(nextSortOrder === 'desc' ? 'desc' : 'asc');
    };
    const onLoadMore = () => requestFilmstripLoadMore();
    const onPowerPrompterOutputSaved = (event: Event) => {
      const savedFiles = collectSavedOutputFiles((event as CustomEvent<unknown>)?.detail);
      if (savedFiles.length === 0) return;
      const firstSaved = savedFiles[0];
      const savedViewerFile = firstSaved ? normalizeGalleryFile({
        id: normalizePath(firstSaved.path),
        uid: normalizePath(firstSaved.path),
        path: normalizePath(firstSaved.path),
        name: String(firstSaved.name || pathLeaf(firstSaved.path) || 'untitled'),
        type: galleryMediaTypeFromPath(firstSaved.path, firstSaved.type),
        modifiedMs: Number(firstSaved.modifiedMs || Date.now()),
        createdMs: Number(firstSaved.modifiedMs || Date.now()),
        size: Number(firstSaved.size || 0),
        metadataReady: Boolean(firstSaved.metadata),
        metadataFormat: firstSaved.metadata ? 'comfyui' : null,
        tags: normalizeTags(firstSaved.tags),
      }) : null;
      upsertDirectSavedOutputs(savedFiles, 'powerprompter-output-saved');
      setLiveGenerationPreviewFile(null);
      setViewerPath((current) => {
        if (!isLiveGenerationPreviewPath(current) || !savedViewerFile) return current;
        setViewerFileFallback(savedViewerFile);
        updateViewerSessionFiles([
          savedViewerFile,
          ...viewerSessionFilesRef.current.filter((file) => !isLiveGenerationPreviewPath(file.path)),
        ]);
        return savedViewerFile.path;
      });
    };
    const onPowerPrompterGenerationPreview = (event: Event) => {
      const detail = (event as CustomEvent<unknown>)?.detail;
      const liveFile = galleryFileFromGenerationPreview(detail);
      if (!liveFile) return;
      const liveMetadata = metadataFromGenerationPreview(detail);
      if (liveMetadata) setCachedViewerMetadata(liveFile.path, liveMetadata);
      setLiveGenerationPreviewFile(liveFile);
      setViewerFileFallback(liveFile);
      updateViewerSessionFiles([
        liveFile,
        ...viewerSessionFilesRef.current.filter((file) => !isLiveGenerationPreviewPath(file.path)),
      ]);
      if (followLiveGenerationViewerRef.current) {
        setViewerPath(liveFile.path);
      }
    };
    const onRemovePaths = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === 'react-gallery') return;
      const removedPaths = Array.isArray(detail.paths)
        ? uniqueNormalizedPaths(detail.paths.map(normalizePath))
        : [];
      if (removedPaths.length === 0) return;
      const removedSet = new Set(removedPaths.map((path) => path.toLowerCase()));
      const removeFromList = (source: GalleryFile[]) => source.filter((file) => (
        !removedSet.has(normalizePath(file.path).toLowerCase())
      ));
      setFiles((current) => {
        const next = removeFromList(current);
        if (next.length === current.length) return current;
        filesRef.current = next;
        return next;
      });
      setSearchResults((current) => current ? {
        ...current,
        files: removeFromList(Array.isArray(current.files) ? current.files : []),
      } : current);
      setFolderPreviewGroups((current) => {
        const nextGroups = current.map((group) => ({
          ...group,
          files: removeFromList(Array.isArray(group.files) ? group.files : []),
        }));
        folderPreviewGroupsRef.current = nextGroups;
        return nextGroups;
      });
      knownFilesRef.current = removeFromList(knownFilesRef.current);
      activeViewerFilesRef.current = removeFromList(activeViewerFilesRef.current);
      updateViewerSessionFiles(removeFromList(viewerSessionFilesRef.current));
      setSelectedPaths((current) => {
        const nextSelection = new Set(Array.from(current).filter((path) => !removedSet.has(normalizePath(path).toLowerCase())));
        selectedPathsRef.current = nextSelection;
        return nextSelection;
      });
      setLastSelectedPath((current) => (removedSet.has(normalizePath(current).toLowerCase()) ? '' : current));
      setViewerPath((current) => (removedSet.has(normalizePath(current).toLowerCase()) ? '' : current));
      for (const removedPath of removedPaths) {
        clearPageCacheForFolder(pathParent(removedPath));
      }
      clearPageCacheForFolder(currentFolder);
    };
    const onRestorePaths = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === 'react-gallery') return;
      const restoredPaths = Array.isArray(detail.paths)
        ? uniqueNormalizedPaths(detail.paths.map(normalizePath))
        : [];
      if (restoredPaths.length === 0) return;
      rememberRestoredHighlights(restoredPaths);
      for (const restoredPath of restoredPaths) {
        clearPageCacheForFolder(pathParent(restoredPath));
      }
      if (
        trashMode
        || restoredPaths.some((path) => pathsEqual(pathParent(path), currentFolder) || pathIsInsideRoot(path, currentFolder))
      ) {
        void loadFolder({ folder: currentFolder, keepSelection: false, forceRefresh: true, preserveScroll: true });
      }
    };
    const onTrashUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.source === 'react-gallery') return;
      clearTrashCache();
      if (trashMode) void loadFolder({ folder: currentFolder, keepSelection: false, forceRefresh: true, preserveScroll: true });
    };
    const onContentChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const detailPath = normalizePath(detail.path || '');
      const detailFolderPath = normalizePath(detail.folderPath || '');
      const changedMediaPath = normalizePath(
        detail.mediaPath
        || (detailFolderPath && detailPath && !pathsEqual(detailFolderPath, detailPath) ? detailPath : ''),
      );
      if (changedMediaPath) clearCachedViewerMetadata(changedMediaPath);
      const changedPath = detailFolderPath || (changedMediaPath ? pathParent(changedMediaPath) : detailPath);
      if (!changedPath) return;
      if (
        !pathsEqual(changedPath, currentFolder)
        && !pathIsInsideRoot(currentFolder, changedPath)
        && !pathIsInsideRoot(changedPath, currentFolder)
      ) {
        return;
      }
      invalidateTreeChildrenCache(currentFolder);
      if (changedPath) invalidateTreeChildrenCache(changedPath);

      const reason = String(detail.reason || '').trim().toLowerCase();
      const source = String(detail.source || '').trim();
      if (source === 'react-gallery' && reason === 'delete') {
        clearPageCacheForFolder(currentFolder);
        clearPageCacheForFolder(changedPath);
        dirtyAfterDeleteFoldersRef.current.set(changedPath.toLowerCase(), Date.now());
        if (pathsEqual(changedPath, currentFolder)) {
          void loadFolder({ folder: currentFolder, keepSelection: true, forceRefresh: true, preserveScroll: true });
        }
        return;
      }

      const recentDirectSync = directOutputSyncRef.current.get(changedPath.toLowerCase()) || 0;
      if (reason === 'generation' && recentDirectSync && Date.now() - recentDirectSync < 5_000) {
        clearPageCacheForFolder(changedPath);
        return;
      }

      if (!pathsEqual(changedPath, currentFolder) && pathIsInsideRoot(changedPath, currentFolder)) {
        void loadTreeChildren(currentFolder);
        return;
      }

      const refreshKey = `${normalizePath(currentFolder).toLowerCase()}|${normalizePath(changedPath).toLowerCase()}|${Math.floor(Date.now() / 750)}`;
      if (contentRefreshKeyRef.current === refreshKey) return;
      contentRefreshKeyRef.current = refreshKey;
      clearPageCacheForFolder(currentFolder);
      clearPageCacheForFolder(changedPath);
      void loadFolder({ folder: currentFolder, keepSelection: true, forceRefresh: true, preserveScroll: true });
    };

    window.addEventListener('umbra:gallery-open-path', onOpenPath as EventListener);
    window.addEventListener('umbra:gallery-reveal-path', onRevealPath as EventListener);
    window.addEventListener('umbra:gallery-request-filmstrip-feed', onRequestFeed as EventListener);
    window.addEventListener('umbra:gallery-set-selection', onSetSelection as EventListener);
    window.addEventListener('umbra:gallery-set-sort', onSetSort as EventListener);
    window.addEventListener('umbra:gallery-load-more', onLoadMore as EventListener);
    window.addEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
    window.addEventListener('umbra:powerprompter-generation-preview', onPowerPrompterGenerationPreview as EventListener);
    window.addEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
    window.addEventListener('umbra:gallery-restore-paths', onRestorePaths as EventListener);
    window.addEventListener('umbra:gallery-trash-updated', onTrashUpdated as EventListener);
    window.addEventListener('umbra:gallery-content-changed', onContentChanged as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-open-path', onOpenPath as EventListener);
      window.removeEventListener('umbra:gallery-reveal-path', onRevealPath as EventListener);
      window.removeEventListener('umbra:gallery-request-filmstrip-feed', onRequestFeed as EventListener);
      window.removeEventListener('umbra:gallery-set-selection', onSetSelection as EventListener);
      window.removeEventListener('umbra:gallery-set-sort', onSetSort as EventListener);
      window.removeEventListener('umbra:gallery-load-more', onLoadMore as EventListener);
      window.removeEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
      window.removeEventListener('umbra:powerprompter-generation-preview', onPowerPrompterGenerationPreview as EventListener);
      window.removeEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
      window.removeEventListener('umbra:gallery-restore-paths', onRestorePaths as EventListener);
      window.removeEventListener('umbra:gallery-trash-updated', onTrashUpdated as EventListener);
      window.removeEventListener('umbra:gallery-content-changed', onContentChanged as EventListener);
    };
  }, [addOpenedFolder, clearPageCacheForFolder, clearTrashCache, currentFolder, emitFilmstripFeed, emitSelectionChanged, files, getSelectionOrderedFiles, invalidateTreeChildrenCache, liveGenerationPreviewFile, loadFolder, loadTreeChildren, rememberRestoredHighlights, requestFilmstripLoadMore, trashMode, updateViewerSessionFiles, upsertDirectSavedOutputs, viewerFileFallback]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('umbra:gallery-sort-changed', {
      detail: { sortBy, sortOrder, source: 'react-gallery' },
    }));
  }, [sortBy, sortOrder]);

  useEffect(() => {
    const activeRoot = findActiveRoot(currentFolder || rootPath, rootChoices);
    if (!activeRoot) return;
    let cancelled = false;
    const nextFocusedFolder = currentFolder || activeRoot.path;
    setFocusedFolder((current) => (pathsEqual(current, nextFocusedFolder) ? current : nextFocusedFolder));
    const chain = folderPathChain(currentFolder || activeRoot.path, activeRoot.path);
    if (activeRoot.kind !== 'trash') {
      setExpandedFolders((current) => {
        let changed = false;
        const next = new Set(current);
        for (const folderPath of chain) {
          if (next.has(folderPath)) continue;
          next.add(folderPath);
          changed = true;
        }
        return changed ? next : current;
      });
      void (async () => {
        for (const folderPath of chain) {
          if (cancelled) return;
          if (!treeCacheRef.current.has(folderPath) && !Object.prototype.hasOwnProperty.call(treeChildrenRef.current, folderPath)) {
            await loadTreeChildren(folderPath);
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [currentFolder, loadTreeChildren, rootPath, rootChoices]);

  const searchNeedle = useMemo(() => normalizeSearchQuery(query), [query]);
  const globalSearchActive = !isTrashPath(currentFolder) && searchNeedle.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH;
  const metadataSearchNeedle = useMemo(() => normalizeSearchQuery(metadataQuery), [metadataQuery]);
  const metadataSearchActive = !isTrashPath(currentFolder) && metadataSearchNeedle.length >= 2;
  const metadataMatchByPath = useMemo(() => {
    const map = new Map<string, GalleryMetadataSearchMatch>();
    if (!metadataSearchActive) return map;
    for (const match of metadataMatches) {
      const path = normalizePath(match.path);
      if (path) map.set(path.toLowerCase(), match);
    }
    return map;
  }, [metadataMatches, metadataSearchActive]);
  const localFilteredFiles = useMemo(() => {
    if (!searchNeedle) return files;
    return files
      .filter((file) => fileMatchesSearch(file, searchNeedle))
      .sort((left, right) => compareSearchFiles(left, right, searchNeedle, sortBy, sortOrder));
  }, [files, searchNeedle, sortBy, sortOrder]);
  const searchableRoots = useMemo(() => (
    rootChoices
      .filter((root) => root.kind !== 'trash')
      .map((root) => normalizePath(root.path))
      .filter(Boolean)
  ), [rootChoices]);

  useEffect(() => {
    const folderPath = normalizePath(currentFolder);
    metadataSearchAbortRef.current?.abort();
    if (!metadataSearchActive || !folderPath) {
      setMetadataMatches([]);
      setMetadataSearchLoading(false);
      setMetadataSearchError('');
      return;
    }

    const controller = new AbortController();
    metadataSearchAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      setMetadataSearchLoading(true);
      setMetadataSearchError('');
      const params = new URLSearchParams({
        path: folderPath,
        q: metadataSearchNeedle,
        limit: '5000',
      });
      fetchGalleryFs('/metadata-search', params, {
        cache: 'no-store',
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({} as GalleryMetadataSearchPayload));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to search metadata'));
        if (controller.signal.aborted) return;
        setMetadataMatches(Array.isArray(payload.matches) ? payload.matches : []);
      }).catch((metadataError) => {
        if (isAbortError(metadataError) || controller.signal.aborted) return;
        setMetadataMatches([]);
        setMetadataSearchError(metadataError instanceof Error ? metadataError.message : 'Failed to search metadata');
      }).finally(() => {
        if (!controller.signal.aborted) setMetadataSearchLoading(false);
      });
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentFolder, metadataSearchActive, metadataSearchNeedle]);

  useEffect(() => {
    const folderPath = normalizePath(currentFolder);
    if (!folderPath || isTrashPath(folderPath) || globalSearchActive) {
      folderSummarySnapshotRef.current = null;
      return;
    }

    let disposed = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      if (disposed) return;
      if (folderSummaryPollInFlightRef.current) return;
      if (loading || transferInProgress || selectAllLoading) return;
      if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;

      folderSummaryPollInFlightRef.current = true;
      controller?.abort();
      controller = new AbortController();
      const startedAt = nowMs();

      try {
        const summary = await fetchFolderSummary(folderPath, true, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (!pathsEqual(folderPath, currentFolder)) return;

        const signature = folderSummarySignature(summary);
        const summaryTotal = Math.max(0, Math.trunc(Number(summary.totalMediaCount || 0)));
        const summarySubfolders = Math.max(0, Math.trunc(Number(summary.subfolderCount || 0)));
        const previous = folderSummarySnapshotRef.current;
        folderSummarySnapshotRef.current = {
          path: folderPath,
          signature,
          totalMediaCount: summaryTotal,
          subfolderCount: summarySubfolders,
        };

        const stateTotal = Math.max(0, Math.trunc(Number(total || filesRef.current.length)));
        const folderChanged = !previous || !pathsEqual(previous.path, folderPath);
        const signatureChanged = previous?.signature !== signature;
        const mediaChanged = previous
          ? previous.totalMediaCount !== summaryTotal
          : (filesRef.current.length > 0 && summaryTotal !== stateTotal);
        const subfoldersChanged = previous
          ? previous.subfolderCount !== summarySubfolders
          : false;

        if (folderChanged && !mediaChanged) return;
        if (!signatureChanged && !mediaChanged) return;

        traceGalleryLoad({
          event: 'folder_summary_changed',
          folderPath,
          previousTotal: previous?.totalMediaCount ?? stateTotal,
          summaryTotal,
          subfoldersChanged,
          durationMs: nowMs() - startedAt,
        });

        if (subfoldersChanged) {
          invalidateTreeChildrenCache(folderPath);
          void loadTreeChildren(folderPath, true);
          setFolderPreviewRefreshVersion((current) => current + 1);
        }

        if (mediaChanged || previous?.signature !== signature) {
          scheduleCurrentFolderReconcile(folderPath, summary, 'summary-poll');
        }
      } catch (error) {
        if (!isAbortError(error)) {
          const message = error instanceof Error ? error.message : 'Failed to summarize folder';
          if (message.toLowerCase().includes('gallery worker queue is busy')) {
            traceGalleryLoad({
              event: 'folder_summary_poll_busy',
              folderPath,
              durationMs: nowMs() - startedAt,
            });
            return;
          }
          traceGalleryLoad({
            event: 'folder_summary_poll_error',
            folderPath,
            error: message,
            durationMs: nowMs() - startedAt,
          });
        }
      } finally {
        folderSummaryPollInFlightRef.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(poll, CURRENT_FOLDER_SUMMARY_POLL_MS);
    const onWake = () => {
      void poll();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [
    currentFolder,
    fetchFolderSummary,
    globalSearchActive,
    invalidateTreeChildrenCache,
    loadTreeChildren,
    loading,
    scheduleCurrentFolderReconcile,
    selectAllLoading,
    total,
    transferInProgress,
  ]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    if (!globalSearchActive) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError('');
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setSearchError('');
    setSearchResults({ query: searchNeedle, files: [], folders: [], scannedFolders: 0, done: false });
    scrollParentRef.current?.scrollTo({ top: 0 });
    const timer = window.setTimeout(() => {
      const startedAt = nowMs();

      const appendResults = (additions: { files?: GalleryFile[]; folders?: GalleryFolder[]; scannedFolders?: number; done?: boolean }) => {
        if (controller.signal.aborted) return;
        setSearchResults((current) => mergeSearchPayload(current, additions, sortBy, sortOrder, searchNeedle));
      };

      (async () => {
        const queue = [...searchableRoots];
        const visited = new Set<string>();
        let scannedFolders = 0;

        while (queue.length > 0 && scannedFolders < GLOBAL_SEARCH_MAX_FOLDERS) {
          if (controller.signal.aborted) return;
          const folderPath = normalizePath(queue.shift());
          const folderKey = folderPath.toLowerCase();
          if (!folderPath || isTrashPath(folderPath) || visited.has(folderKey)) continue;
          visited.add(folderKey);
          scannedFolders += 1;

          const matchedFolders: GalleryFolder[] = [];
          if (textMatchesSearch(pathLeaf(folderPath) || folderPath, searchNeedle) || textMatchesSearch(folderPath, searchNeedle)) {
            matchedFolders.push({ name: pathLeaf(folderPath) || folderPath, path: folderPath });
          }

          let cursor = 0;
          let doneLoadingFiles = false;
          let safety = 0;
          while (!doneLoadingFiles && safety < 500) {
            if (controller.signal.aborted) return;
            const params = new URLSearchParams({
              path: folderPath,
              cursor: String(cursor),
              limit: String(GLOBAL_SEARCH_PAGE_SIZE),
              sortBy,
              sortOrder,
              fast: '1',
              recursive: 'false',
            });
            const response = await fetchGalleryFs('/list-progressive', params, {
              cache: 'no-store',
              signal: controller.signal,
            });
            const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
            if (!response.ok) throw new Error(String(payload?.error || 'Gallery search failed'));
            const pageFiles = Array.isArray(payload.files)
              ? payload.files
                .map((file, index) => normalizeGalleryFile(file, cursor + index))
                .filter((file) => fileMatchesSearch(file, searchNeedle))
              : [];
            if (pageFiles.length > 0 || matchedFolders.length > 0) {
              appendResults({
                files: pageFiles,
                folders: matchedFolders,
                scannedFolders,
                done: false,
              });
              matchedFolders.length = 0;
            } else {
              appendResults({ scannedFolders, done: false });
            }
            const nextCursor = typeof payload.nextCursor === 'number' ? payload.nextCursor : null;
            if (payload.done === true || nextCursor == null || nextCursor === cursor) {
              doneLoadingFiles = true;
            } else {
              cursor = nextCursor;
            }
            safety += 1;
          }

          const children = await loadTreeChildren(folderPath);
          const childMatches: GalleryFolder[] = [];
          for (const child of children) {
            const childPath = normalizePath(child.path);
            const childKey = childPath.toLowerCase();
            if (!childPath || visited.has(childKey)) continue;
            queue.push(childPath);
            if (textMatchesSearch(child.name || pathLeaf(childPath), searchNeedle) || textMatchesSearch(childPath, searchNeedle)) {
              childMatches.push({ name: child.name || pathLeaf(childPath) || childPath, path: childPath });
            }
          }
          if (childMatches.length > 0) appendResults({ folders: childMatches, scannedFolders, done: false });
        }

        if (controller.signal.aborted) return;
        appendResults({ scannedFolders, done: true });
        traceGalleryLoad({
          event: 'search_complete',
          query: searchNeedle,
          scannedFolders,
          done: true,
          durationMs: nowMs() - startedAt,
        });
      })()
        .catch((searchFailure) => {
          if (controller.signal.aborted || isAbortError(searchFailure)) return;
          const message = searchFailure instanceof Error ? searchFailure.message : 'Gallery search failed';
          setSearchError(message);
          traceGalleryLoad({
            event: 'search_error',
            query: searchNeedle,
            error: message,
            durationMs: nowMs() - startedAt,
          });
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, GLOBAL_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [globalSearchActive, loadTreeChildren, searchableRoots, searchNeedle, sortBy, sortOrder]);

  const searchFiles = globalSearchActive && Array.isArray(searchResults?.files) ? searchResults.files : [];
  const searchFolders = globalSearchActive && Array.isArray(searchResults?.folders) ? searchResults.folders : [];
  const liveDisplayFiles = useMemo(() => (
    liveGenerationPreviewFile && !trashMode ? [liveGenerationPreviewFile] : []
  ), [liveGenerationPreviewFile, trashMode]);
  const displayFiles = useMemo(() => {
    const baseFiles = globalSearchActive ? searchFiles : localFilteredFiles;
    if (liveDisplayFiles.length === 0) return baseFiles;
    return [
      ...liveDisplayFiles,
      ...baseFiles.filter((file) => !isLiveGenerationPreviewPath(file.path)),
    ];
  }, [globalSearchActive, liveDisplayFiles, localFilteredFiles, searchFiles]);
  const searchGroups = useMemo(() => buildSearchGroups(searchFiles, searchFolders), [searchFiles, searchFolders]);
  const localSearchSuggestions = useMemo(() => buildLocalSearchSuggestions(searchNeedle, {
    roots: rootChoices.filter((root) => root.kind !== 'trash'),
    files,
    searchFiles,
    treeChildrenByPath,
    currentFolder,
  }), [currentFolder, files, rootChoices, searchFiles, searchNeedle, treeChildrenByPath]);

  useEffect(() => {
    searchSuggestAbortRef.current?.abort();
    if (!searchNeedle) {
      setSearchSuggestions([]);
      setSearchSuggestionIndex(-1);
      return;
    }

    const controller = new AbortController();
    searchSuggestAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: searchNeedle,
        limit: String(SEARCH_SUGGESTION_MAX_ITEMS),
      });
      for (const rootPath of searchableRoots) params.append('root', rootPath);
      fetchGalleryFs('/search-suggestions', params, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({} as { suggestions?: GallerySearchSuggestion[] }));
          if (!response.ok) return [];
          return Array.isArray(payload.suggestions) ? payload.suggestions : [];
        })
        .then((remoteSuggestions) => {
          if (controller.signal.aborted) return;
          const merged = new Map<string, GallerySearchSuggestion>();
          for (const suggestion of remoteSuggestions) {
            addSearchSuggestion(merged, {
              type: suggestion.type === 'folder' ? 'folder' : 'tag',
              label: String(suggestion.label || suggestion.value || ''),
              detail: String(suggestion.detail || suggestion.value || ''),
              value: String(suggestion.value || suggestion.label || ''),
            });
          }
          for (const suggestion of localSearchSuggestions) addSearchSuggestion(merged, suggestion);
          const next = Array.from(merged.values()).slice(0, SEARCH_SUGGESTION_MAX_ITEMS);
          setSearchSuggestions(next);
          setSearchSuggestionIndex((current) => next.length === 0 ? -1 : Math.max(0, Math.min(current < 0 ? 0 : current, next.length - 1)));
        })
        .catch((error) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setSearchSuggestions(localSearchSuggestions);
          setSearchSuggestionIndex(localSearchSuggestions.length > 0 ? 0 : -1);
        });
    }, 80);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [localSearchSuggestions, searchableRoots, searchNeedle]);

  const applySearchSuggestion = useCallback((index: number) => {
    const suggestion = searchSuggestions[index];
    if (!suggestion) return;
    setQuery(suggestion.value);
    setSearchSuggestionsOpen(false);
    setSearchSuggestionIndex(index);
  }, [searchSuggestions]);

  const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchSuggestionsOpen || searchSuggestions.length === 0) {
      if (event.key === 'Escape') {
        setSearchSuggestionsOpen(false);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchSuggestionIndex((current) => (current + 1) % searchSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchSuggestionIndex((current) => (current <= 0 ? searchSuggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && searchSuggestionIndex >= 0) {
      event.preventDefault();
      applySearchSuggestion(searchSuggestionIndex);
    } else if (event.key === 'Escape') {
      setSearchSuggestionsOpen(false);
    }
  }, [applySearchSuggestion, searchSuggestionIndex, searchSuggestions, searchSuggestionsOpen]);

  const trashRootMode = isTrashRootPath(currentFolder) && !globalSearchActive;
  const childFolderNodes = useMemo(() => {
    const folderPath = normalizePath(currentFolder);
    if (!folderPath) return [];
    return (treeChildrenByPath[folderPath] || [])
      .map((folder) => ({
        name: String(folder.name || pathLeaf(folder.path)),
        path: normalizePath(folder.path),
      }))
      .filter((folder) => folder.path && !isTrashPath(folder.path));
  }, [currentFolder, treeChildrenByPath]);
  const folderPreviewMode = !isPhoneRemote && !trashMode && !globalSearchActive && !searchNeedle && childFolderNodes.length > 0;
  const currentFolderIsRoot = useMemo(() => (
    rootChoices.some((root) => pathsEqual(root.path, currentFolder))
  ), [currentFolder, rootChoices]);
  const folderPreviewFiles = useMemo(() => flattenFolderPreviewFiles(folderPreviewGroups), [folderPreviewGroups]);
  const setSortableFiles = useMemo(() => {
    if (globalSearchActive) return searchFiles;
    if (folderPreviewMode) return [...displayFiles, ...folderPreviewFiles];
    return displayFiles;
  }, [displayFiles, folderPreviewFiles, folderPreviewMode, globalSearchActive, searchFiles]);
  const setGroups = useMemo(() => (
    groupBySet && !trashMode
      ? buildGallerySetGroups(setSortableFiles, setSortRules, sortBy, sortOrder)
      : []
  ), [groupBySet, setSortableFiles, setSortRules, sortBy, sortOrder, trashMode]);
  const setGroupedFiles = useMemo(() => (
    setGroups.flatMap((group) => group.files)
  ), [setGroups]);
  const updateSetSortRule = useCallback((setId: number, patch: Partial<GallerySetSortRule>) => {
    setSetSortRules((current) => {
      const currentRule = getSetSortRule(setId, current, sortBy, sortOrder);
      return {
        ...current,
        [String(setId)]: {
          ...currentRule,
          ...patch,
        },
      };
    });
  }, [sortBy, sortOrder]);
  const knownFiles = useMemo(() => {
    const byPath = new Map<string, GalleryFile>();
    for (const file of files) {
      const key = normalizePath(file.path).toLowerCase();
      if (key) byPath.set(key, file);
    }
    for (const file of searchFiles) {
      const key = normalizePath(file.path).toLowerCase();
      if (key) byPath.set(key, file);
    }
    for (const file of folderPreviewFiles) {
      const key = normalizePath(file.path).toLowerCase();
      if (key) byPath.set(key, file);
    }
    for (const file of liveDisplayFiles) {
      const key = normalizePath(file.path).toLowerCase();
      if (key) byPath.set(key, file);
    }
    return Array.from(byPath.values());
  }, [files, folderPreviewFiles, liveDisplayFiles, searchFiles]);
  const activeViewerFiles = useMemo(() => {
    const withLive = (items: GalleryFile[]) => (
      liveDisplayFiles.length > 0
        ? [
            ...liveDisplayFiles,
            ...items.filter((file) => !isLiveGenerationPreviewPath(file.path)),
          ]
        : items
    );
    if (groupBySet && !trashMode) return withLive(setGroupedFiles);
    if (folderPreviewMode) return withLive([...displayFiles, ...folderPreviewFiles]);
    if (globalSearchActive) return withLive(searchFiles);
    return withLive(files);
  }, [displayFiles, files, folderPreviewFiles, folderPreviewMode, globalSearchActive, groupBySet, liveDisplayFiles, searchFiles, setGroupedFiles, trashMode]);
  const tagScopeFolders = useMemo(() => {
    if (trashMode) return [];
    if (globalSearchActive) {
      return uniqueNormalizedPaths(searchGroups.map((group) => group.folder.path));
    }
    if (folderPreviewMode) {
      return uniqueNormalizedPaths([
        currentFolder,
        ...folderPreviewGroups.map((group) => group.folder.path),
      ]);
    }
    return uniqueNormalizedPaths([currentFolder]);
  }, [currentFolder, folderPreviewGroups, folderPreviewMode, globalSearchActive, searchGroups, trashMode]);
  const tagScopeKey = useMemo(() => tagScopeFolders.join('\u0001'), [tagScopeFolders]);
  const localTagSummary = useMemo(() => summarizeTagsForFiles(activeViewerFiles), [activeViewerFiles]);
  const tagFlyoutTags = useMemo(() => (
    mergeTagSummaries(tagFlyoutRemoteTags, localTagSummary).slice(0, 300)
  ), [localTagSummary, tagFlyoutRemoteTags]);
  useEffect(() => {
    knownFilesRef.current = knownFiles;
  }, [knownFiles]);
  useEffect(() => {
    activeViewerFilesRef.current = activeViewerFiles;
    if (!viewerPath || isLiveGenerationPreviewPath(viewerPath)) return;
    const currentSession = viewerSessionFilesRef.current;
    const nextSession = reconcileGalleryViewerNavigation(currentSession, activeViewerFiles, viewerPath);
    if (nextSession !== currentSession) updateViewerSessionFiles(nextSession);
  }, [activeViewerFiles, updateViewerSessionFiles, viewerPath]);
  useEffect(() => {
    folderPreviewGroupsRef.current = folderPreviewGroups;
  }, [folderPreviewGroups]);

  useEffect(() => {
    if (!tagFlyoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && tagFlyoutRef.current?.contains(target)) return;
      setTagFlyoutOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTagFlyoutOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [tagFlyoutOpen]);

  useEffect(() => {
    tagFlyoutAbortRef.current?.abort();
    if (!tagFlyoutOpen || tagScopeFolders.length === 0) {
      setTagFlyoutLoading(false);
      setTagFlyoutError('');
      if (!tagFlyoutOpen) setTagFlyoutRemoteTags([]);
      return;
    }

    const controller = new AbortController();
    tagFlyoutAbortRef.current = controller;
    setTagFlyoutLoading(localTagSummary.length === 0);
    setTagFlyoutError('');

    const params = new URLSearchParams({ limit: '300' });
    for (const folderPath of tagScopeFolders) params.append('folder', folderPath);

    fetchGalleryFs('/tags/summary', params, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({} as { tags?: GalleryTagSummaryItem[]; error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to load gallery tags'));
        return Array.isArray(payload.tags) ? payload.tags : [];
      })
      .then((tags) => {
        if (controller.signal.aborted) return;
        setTagFlyoutRemoteTags(tags.map((item) => ({
          tag: normalizeTag(item.tag),
          count: Math.max(0, Math.trunc(Number(item.count || 0))),
        })).filter((item) => item.tag && item.count > 0));
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setTagFlyoutError(error instanceof Error ? error.message : 'Failed to load gallery tags');
      })
      .finally(() => {
        if (!controller.signal.aborted) setTagFlyoutLoading(false);
      });

    return () => controller.abort();
  }, [localTagSummary.length, tagFlyoutOpen, tagScopeFolders, tagScopeKey]);

  useEffect(() => {
    folderPreviewAbortRef.current?.abort();
    if (!folderPreviewMode) {
      setFolderPreviewGroups([]);
      return;
    }

    const controller = new AbortController();
    folderPreviewAbortRef.current = controller;
    const cacheKeyFor = (folderPath: string) => galleryFolderPreviewCacheKey(folderPath, sortBy, sortOrder);
    type FolderPreviewTarget = {
      folder: GalleryFolderTreeNode;
      depth: 0 | 1 | 2;
      parentPath: string;
      rootPath: string;
    };

    const previewGroupForTarget = (target: FolderPreviewTarget, cached?: GalleryFolderPreviewGroup): GalleryFolderPreviewGroup => ({
      ...(cached || {
        files: [],
        loading: true,
        loadingMore: false,
        expansionLevel: 0,
        visibleCount: FOLDER_PREVIEW_PAGE_SIZE,
        total: 0,
        childFolderCount: 0,
        nextCursor: 0,
        done: false,
      }),
      folder: target.folder,
      depth: target.depth,
      parentPath: target.parentPath,
      rootPath: target.rootPath,
    });

    const initialTargets: FolderPreviewTarget[] = childFolderNodes.map((folder) => ({
      folder,
      depth: 0,
      parentPath: currentFolder,
      rootPath: folder.path,
    }));
    const queuedOrSeen = new Set(initialTargets.map((target) => normalizePath(target.folder.path).toLowerCase()).filter(Boolean));
    const pending: FolderPreviewTarget[] = [...initialTargets];

    setFolderPreviewGroups(initialTargets.map((target) => (
      previewGroupForTarget(target, folderPreviewCacheRef.current.get(cacheKeyFor(target.folder.path)))
    )));

    let nextIndex = 0;
    let cancelled = false;

    const addNestedTargets = (parentTarget: FolderPreviewTarget, folders: GalleryFolder[]): void => {
      if (parentTarget.depth >= FOLDER_PREVIEW_MAX_DEPTH || folders.length === 0) return;
      const depth = Math.min(FOLDER_PREVIEW_MAX_DEPTH, parentTarget.depth + 1) as 0 | 1 | 2;
      const additions: FolderPreviewTarget[] = [];
      for (const folder of folders) {
        if (queuedOrSeen.size >= FOLDER_PREVIEW_MAX_GROUPS) break;
        const path = normalizePath(folder.path);
        const key = path.toLowerCase();
        if (!path || !key || queuedOrSeen.has(key)) continue;
        queuedOrSeen.add(key);
        additions.push({
          folder: {
            ...folder,
            name: String(folder.name || pathLeaf(path)),
            path,
            hasChildren: true,
          },
          depth,
          parentPath: parentTarget.folder.path,
          rootPath: parentTarget.rootPath,
        });
      }
      if (additions.length === 0) return;
      pending.push(...additions);
      if (controller.signal.aborted || cancelled) return;
      setFolderPreviewGroups((current) => {
        const existing = new Set(current.map((group) => normalizePath(group.folder.path).toLowerCase()));
        const nextGroups = additions
          .filter((target) => !existing.has(normalizePath(target.folder.path).toLowerCase()))
          .map((target) => previewGroupForTarget(target, folderPreviewCacheRef.current.get(cacheKeyFor(target.folder.path))));
        if (nextGroups.length === 0) return current;
        const parentIndex = current.findIndex((group) => pathsEqual(group.folder.path, parentTarget.folder.path));
        if (parentIndex < 0) return [...current, ...nextGroups];
        let insertAt = parentIndex + 1;
        while (
          insertAt < current.length
          && pathsEqual(current[insertAt]?.rootPath || '', parentTarget.rootPath)
          && Math.max(0, Number(current[insertAt]?.depth || 0)) > parentTarget.depth
        ) {
          insertAt += 1;
        }
        return [
          ...current.slice(0, insertAt),
          ...nextGroups,
          ...current.slice(insertAt),
        ];
      });
    };

    const loadNext = async (): Promise<void> => {
      if (cancelled || controller.signal.aborted) return;
      const target = pending[nextIndex];
      nextIndex += 1;
      if (!target) return;
      const folder = target.folder;
      const groupKey = cacheKeyFor(folder.path);
      try {
        const params = new URLSearchParams({
          path: folder.path,
          cursor: '0',
          limit: String(FOLDER_PREVIEW_PAGE_SIZE),
          sortBy,
          sortOrder,
          fast: '1',
          recursive: 'false',
        });
        const response = await fetchGalleryFs('/list-progressive', params, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to load folder preview'));
        addNestedTargets(target, Array.isArray(payload.folders) ? payload.folders : []);
        const nextGroup: GalleryFolderPreviewGroup = {
          folder,
          files: (Array.isArray(payload.files) ? payload.files : [])
            .map((file, index) => normalizeGalleryFile(file, index)),
          loading: false,
          loadingMore: false,
          depth: target.depth,
          parentPath: target.parentPath,
          rootPath: target.rootPath,
          expansionLevel: 0,
          visibleCount: FOLDER_PREVIEW_PAGE_SIZE,
          total: Math.max(0, Math.trunc(Number(payload.total || payload.files?.length || 0))),
          childFolderCount: Array.isArray(payload.folders) ? payload.folders.length : 0,
          nextCursor: typeof payload.nextCursor === 'number' ? payload.nextCursor : null,
          done: payload.done === true || payload.nextCursor == null,
        };
        folderPreviewCacheRef.current.set(groupKey, nextGroup);
        if (!controller.signal.aborted) {
          setFolderPreviewGroups((current) => current.map((group) => (
            pathsEqual(group.folder.path, folder.path) ? nextGroup : group
          )));
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        const failedGroup: GalleryFolderPreviewGroup = {
          folder,
          files: [],
          loading: false,
          loadingMore: false,
          depth: target.depth,
          parentPath: target.parentPath,
          rootPath: target.rootPath,
          expansionLevel: 0,
          visibleCount: FOLDER_PREVIEW_PAGE_SIZE,
          total: 0,
          childFolderCount: 0,
          nextCursor: null,
          done: true,
          error: error instanceof Error ? error.message : 'Failed to load folder preview',
        };
        if (!controller.signal.aborted) {
          setFolderPreviewGroups((current) => current.map((group) => (
            pathsEqual(group.folder.path, folder.path) ? failedGroup : group
          )));
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) await loadNext();
      }
    };

    const workers = Array.from({ length: Math.min(FOLDER_PREVIEW_CONCURRENCY, pending.length) }, () => loadNext());
    void Promise.allSettled(workers);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [childFolderNodes, currentFolder, folderPreviewMode, folderPreviewRefreshVersion, sortBy, sortOrder]);

  const expandFolderPreview = useCallback(async (folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const cacheKey = galleryFolderPreviewCacheKey(normalized, sortBy, sortOrder);
    const currentGroup = folderPreviewGroupsRef.current.find((group) => pathsEqual(group.folder.path, normalized));
    if (!currentGroup || currentGroup.loading || currentGroup.loadingMore) return;

    const currentLevel = Math.min(2, Math.max(0, Math.trunc(Number(currentGroup.expansionLevel ?? 0)))) as 0 | 1 | 2;
    const targetLevel: 1 | 2 = currentLevel <= 0 ? 1 : 2;
    const targetVisibleCount = targetLevel === 1 ? FOLDER_PREVIEW_EXPANDED_SIZE : Number.POSITIVE_INFINITY;
    const canRevealAlreadyLoaded = currentGroup.files.length > getFolderPreviewVisibleCount(currentGroup);
    const needsFetch = currentGroup.done !== true
      && currentGroup.nextCursor != null
      && currentGroup.files.length < targetVisibleCount;

    if (!needsFetch) {
      setFolderPreviewGroups((current) => current.map((group) => {
        if (!pathsEqual(group.folder.path, normalized)) return group;
        const nextGroup: GalleryFolderPreviewGroup = {
          ...group,
          expansionLevel: targetLevel,
          visibleCount: targetLevel === 2 || group.done === true
            ? group.files.length
            : Math.min(group.files.length, FOLDER_PREVIEW_EXPANDED_SIZE),
          error: undefined,
        };
        folderPreviewCacheRef.current.set(cacheKey, nextGroup);
        return nextGroup;
      }));
      return;
    }

    if (!canRevealAlreadyLoaded && currentGroup.nextCursor == null) return;

    setFolderPreviewGroups((current) => current.map((group) => (
      pathsEqual(group.folder.path, normalized)
        ? { ...group, loadingMore: true, error: undefined }
        : group
    )));

    try {
      const byPath = new Map(currentGroup.files.map((file) => [normalizePath(file.path).toLowerCase(), file]));
      let nextCursorValue = typeof currentGroup.nextCursor === 'number' ? currentGroup.nextCursor : null;
      let doneValue = currentGroup.done === true || nextCursorValue == null;
      let totalValue = currentGroup.total;
      let pageCount = 0;

      while (!doneValue && nextCursorValue != null && byPath.size < targetVisibleCount && pageCount < 2000) {
        const cursor = Math.max(0, Math.trunc(Number(nextCursorValue)));
        const remainingForStep = targetLevel === 1 ? Math.max(1, FOLDER_PREVIEW_EXPANDED_SIZE - byPath.size) : SELECT_ALL_PAGE_SIZE;
        const params = new URLSearchParams({
          path: normalized,
          cursor: String(cursor),
          limit: String(targetLevel === 1 ? Math.min(FOLDER_PREVIEW_PAGE_SIZE, remainingForStep) : SELECT_ALL_PAGE_SIZE),
          sortBy,
          sortOrder,
          fast: '1',
          recursive: 'false',
        });
        const response = await fetchGalleryFs('/list-progressive', params, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({} as GalleryListPayload & { error?: string }));
        if (!response.ok) throw new Error(String(payload?.error || 'Failed to load more media'));

        for (const file of Array.isArray(payload.files) ? payload.files : []) {
          const normalizedFile = normalizeGalleryFile(file, byPath.size);
          const key = normalizePath(normalizedFile.path).toLowerCase();
          if (key) byPath.set(key, normalizedFile);
        }

        totalValue = Math.max(totalValue, Math.trunc(Number(payload.total || 0)) || byPath.size);
        const incomingNextCursor = typeof payload.nextCursor === 'number' ? payload.nextCursor : null;
        if (payload.done === true || incomingNextCursor == null || incomingNextCursor <= cursor) {
          doneValue = true;
          nextCursorValue = null;
        } else {
          nextCursorValue = incomingNextCursor;
        }
        pageCount += 1;
      }

      setFolderPreviewGroups((current) => current.map((group) => {
        if (!pathsEqual(group.folder.path, normalized)) return group;
        const mergedFiles = Array.from(byPath.values());
        const nextGroup: GalleryFolderPreviewGroup = {
          ...group,
          files: mergedFiles,
          loading: false,
          loadingMore: false,
          expansionLevel: targetLevel,
          visibleCount: targetLevel === 2 || doneValue
            ? mergedFiles.length
            : Math.min(mergedFiles.length, FOLDER_PREVIEW_EXPANDED_SIZE),
          total: Math.max(group.total, totalValue, mergedFiles.length),
          nextCursor: nextCursorValue,
          done: doneValue,
          error: undefined,
        };
        folderPreviewCacheRef.current.set(cacheKey, nextGroup);
        return nextGroup;
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load more media';
      setFolderPreviewGroups((current) => current.map((group) => (
        pathsEqual(group.folder.path, normalized)
          ? { ...group, loading: false, loadingMore: false, error: message }
          : group
      )));
      addToast({ type: 'error', message });
    }
  }, [addToast, sortBy, sortOrder]);

  const collapseFolderPreview = useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const cacheKey = galleryFolderPreviewCacheKey(normalized, sortBy, sortOrder);
    setFolderPreviewGroups((current) => current.map((group) => {
      if (!pathsEqual(group.folder.path, normalized) || group.loadingMore) return group;
      const nextGroup: GalleryFolderPreviewGroup = {
        ...group,
        expansionLevel: 0,
        visibleCount: FOLDER_PREVIEW_PAGE_SIZE,
      };
      folderPreviewCacheRef.current.set(cacheKey, nextGroup);
      return nextGroup;
    }));
  }, [sortBy, sortOrder]);

  const trashGroups = useMemo(() => {
    if (!trashRootMode) return [];
    const byId = new Map<string, { id: string; order: number; label: string; files: GalleryFile[] }>();
    const now = Date.now();
    for (const file of displayFiles) {
      const group = getTrashGroupForFile(file, now);
      const existing = byId.get(group.id) || { ...group, files: [] };
      existing.files.push(file);
      byId.set(group.id, existing);
    }
    return Array.from(byId.values()).sort((left, right) => (
      left.order !== right.order
        ? left.order - right.order
        : left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
    ));
  }, [displayFiles, trashRootMode]);
  const trashBreadcrumbChain = useMemo(() => (
    trashMode ? folderPathChain(currentFolder, TRASH_ROOT) : []
  ), [currentFolder, trashMode]);
  const trashParentFolder = useMemo(() => {
    if (!trashMode || isTrashRootPath(currentFolder)) return '';
    const parent = pathParent(currentFolder);
    return parent && isTrashPath(parent) ? parent : TRASH_ROOT;
  }, [currentFolder, trashMode]);
  const displayFolder = openingFolder || currentFolder;
  const openingDifferentFolder = Boolean(openingFolder && !pathsEqual(openingFolder, currentFolder));

  useEffect(() => {
    const node = scrollParentRef.current;
    if (!node) return;
    const updateWidth = () => setGridWidth(Math.max(0, Math.floor(node.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const effectiveGridWidth = useMemo(() => {
    if (gridWidth > 0) return gridWidth;
    if (isPhoneRemote && typeof window !== 'undefined') {
      return Math.max(0, Math.floor(window.innerWidth));
    }
    return gridWidth;
  }, [gridWidth, isPhoneRemote]);

  const columnCount = useMemo(() => {
    const available = Math.max(1, effectiveGridWidth - 24);
    if (isPhoneRemote) {
      if (mobileMediaView === 'single') return 1;
      return Math.max(2, Math.floor((available + GRID_GAP) / (PHONE_GRID_MIN_CARD_WIDTH + GRID_GAP)));
    }
    return Math.max(1, Math.floor((available + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)));
  }, [effectiveGridWidth, isPhoneRemote, mobileMediaView]);

  const cardSize = useMemo(() => {
    const minCardWidth = isPhoneRemote && mobileMediaView === 'grid' ? PHONE_GRID_MIN_CARD_WIDTH : GRID_MIN_CARD_WIDTH;
    const available = Math.max(minCardWidth, effectiveGridWidth - 24);
    return Math.max(
      minCardWidth,
      Math.floor((available - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount),
    );
  }, [columnCount, effectiveGridWidth, isPhoneRemote, mobileMediaView]);
  const cardHeight = cardSize + (
    isPhoneRemote
      ? mobileMediaView === 'single'
        ? PHONE_SINGLE_CARD_EXTRA_HEIGHT
        : PHONE_GRID_CARD_EXTRA_HEIGHT
      : GRID_CARD_EXTRA_HEIGHT
  );

  const fileRowCount = Math.ceil(displayFiles.length / columnCount);
  const rowVirtualizer = useVirtualizer({
    count: fileRowCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => cardHeight + GRID_GAP,
    overscan: 4,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1]?.index ?? -1 : -1;

  useEffect(() => {
    if (!isPhoneRemote || galleryMobileView !== 'media') return;
    let frame = 0;
    let secondFrame = 0;
    const measure = () => {
      const node = scrollParentRef.current;
      if (node) setGridWidth(Math.max(0, Math.floor(node.clientWidth)));
      rowVirtualizer.measure();
    };
    frame = window.requestAnimationFrame(() => {
      measure();
      secondFrame = window.requestAnimationFrame(measure);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [displayFiles.length, galleryMobileView, isPhoneRemote, mobileMediaView, rowVirtualizer]);

  useEffect(() => {
    const pendingPath = normalizePath(pendingRevealPathRef.current);
    if (!pendingPath || columnCount <= 0) return;
    const index = displayFiles.findIndex((file) => pathsEqual(file.path, pendingPath));
    if (index < 0) return;
    pendingRevealPathRef.current = '';
    rowVirtualizer.scrollToIndex(Math.max(0, Math.floor(index / columnCount)), { align: 'center' });
  }, [columnCount, displayFiles, rowVirtualizer]);

  const viewerFile = useMemo(() => {
    const normalized = normalizePath(viewerPath);
    if (!normalized) return null;
    return activeViewerFiles.find((file) => pathsEqual(file.path, normalized))
      || files.find((file) => pathsEqual(file.path, normalized))
      || knownFiles.find((file) => pathsEqual(file.path, normalized))
      || filesRef.current.find((file) => pathsEqual(file.path, normalized))
      || viewerSessionFiles.find((file) => pathsEqual(file.path, normalized))
      || viewerSessionFilesRef.current.find((file) => pathsEqual(file.path, normalized))
      || activeViewerFilesRef.current.find((file) => pathsEqual(file.path, normalized))
      || (viewerFileFallback && pathsEqual(viewerFileFallback.path, normalized) ? viewerFileFallback : null)
      || null;
  }, [activeViewerFiles, files, knownFiles, viewerFileFallback, viewerPath, viewerSessionFiles]);
  useEffect(() => {
    if (!viewerPath) {
      setViewerFileFallback(null);
      updateViewerSessionFiles([]);
      return;
    }
    if (viewerFile && !pathsEqual(viewerFileFallback?.path, viewerFile.path)) {
      setViewerFileFallback(viewerFile);
    }
  }, [updateViewerSessionFiles, viewerFile, viewerFileFallback?.path, viewerPath]);
  const viewerFilesForRender = useMemo(() => {
    const orderedFiles = viewerSessionFiles.length > 0 ? viewerSessionFiles : activeViewerFiles;
    if (!viewerFile) return orderedFiles;
    return orderedFiles.some((file) => pathsEqual(file.path, viewerFile.path))
      ? orderedFiles
      : [viewerFile, ...orderedFiles];
  }, [activeViewerFiles, viewerFile, viewerSessionFiles]);
  const viewerSelectionCount = selectedPaths.size > 0 ? selectedPaths.size : (viewerPath ? 1 : 0);

  useEffect(() => {
    if (globalSearchActive || loading || done || nextCursor == null || !currentFolder || fileRowCount === 0) return;
    const scrollElement = scrollParentRef.current;
    const underfilled = Boolean(scrollElement && scrollElement.scrollHeight <= scrollElement.clientHeight + cardHeight);
    const nearEnd = lastVirtualRowIndex >= Math.max(0, fileRowCount - 3);
    if (!underfilled && !nearEnd) return;

    const key = [
      normalizePath(currentFolder).toLowerCase(),
      nextCursor,
      sortBy,
      sortOrder,
      displayFiles.length,
    ].join('|');
    if (viewportLoadMoreKeyRef.current === key) return;
    viewportLoadMoreKeyRef.current = key;
    void loadFolder({ folder: currentFolder, cursor: nextCursor, append: true, keepSelection: true });
  }, [
    cardHeight,
    currentFolder,
    displayFiles.length,
    done,
    fileRowCount,
    globalSearchActive,
    lastVirtualRowIndex,
    loadFolder,
    loading,
    nextCursor,
    sortBy,
    sortOrder,
  ]);

  const openMediaContextMenu = useCallback((event: GalleryContextMenuEvent, file: GalleryFile) => {
    event.preventDefault();
    event.stopPropagation();
    setDatasetPicker(null);
    const path = normalizePath(file.path);
    if (!path) return;
    if (isLiveGenerationPreviewPath(path)) {
      setViewerPath(path);
      setViewerFileFallback(file);
      updateViewerSessionFiles([
        file,
        ...viewerSessionFilesRef.current.filter((entry) => !isLiveGenerationPreviewPath(entry.path)),
      ]);
      return;
    }
    const currentSelection = uniqueNormalizedPaths(Array.from(selectedPathsRef.current));
    const targetAlreadySelected = currentSelection.some((entry) => pathsEqual(entry, path));
    const reorderSelection = !targetAlreadySelected && currentSelection.length > 0
      ? currentSelection
      : undefined;
    const menuPaths = targetAlreadySelected && currentSelection.length > 0
      ? currentSelection
      : [path];
    if (!targetAlreadySelected && !reorderSelection) {
      const nextSelection = new Set([path]);
      setSelectedPaths(nextSelection);
      selectedPathsRef.current = nextSelection;
      setLastSelectedPath(path);
      emitSelectionChanged([path], path);
    }
    setContextMenu({
      kind: 'media',
      x: event.clientX,
      y: event.clientY,
      targetPath: path,
      paths: menuPaths,
      reorderPaths: reorderSelection,
    });
  }, [emitSelectionChanged, updateViewerSessionFiles]);

  const openFolderContextMenu = useCallback((event: GalleryContextMenuEvent, folderPath: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDatasetPicker(null);
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    setFocusedFolder(normalized);
    setContextMenu({
      kind: 'folder',
      x: event.clientX,
      y: event.clientY,
      targetPath: normalized,
    });
  }, []);

  useEffect(() => {
    const onFilmstripContextMenu = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const paths = Array.isArray(detail.paths)
        ? detail.paths.map(normalizePath).filter(Boolean)
        : [];
      const reorderPaths = Array.isArray(detail.reorderPaths)
        ? uniqueNormalizedPaths(detail.reorderPaths.map(normalizePath).filter(Boolean))
        : [];
      const targetPath = normalizePath(detail.targetPath || paths.at(-1) || '');
      if (!targetPath) return;
      const selected = paths.length > 0 ? paths : [targetPath];
      const nextSelection = new Set(selected);
      setSelectedPaths(nextSelection);
      selectedPathsRef.current = nextSelection;
      setLastSelectedPath(targetPath);
      emitSelectionChanged(selected, targetPath);
      setContextMenu({
        kind: 'media',
        x: Number(detail.x || 0),
        y: Number(detail.y || 0),
        targetPath,
        paths: selected,
        reorderPaths: reorderPaths.length > 0 ? reorderPaths : selected,
      });
      setDatasetPicker(null);
    };
    window.addEventListener('umbra:gallery-media-context-menu', onFilmstripContextMenu as EventListener);
    return () => window.removeEventListener('umbra:gallery-media-context-menu', onFilmstripContextMenu as EventListener);
  }, [emitSelectionChanged]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];
    const targetPath = normalizePath(contextMenu.targetPath);
    if (!targetPath) return [];
    if (isLiveGenerationPreviewPath(targetPath)) {
      const targetFile = viewerFileFallback && pathsEqual(viewerFileFallback.path, targetPath)
        ? viewerFileFallback
        : null;
      return [
        { label: 'Open Live Preview', icon: <ImageIcon size={14} />, disabled: !targetFile, action: () => targetFile && openFile(targetFile) },
      ];
    }

    if (contextMenu.kind === 'transfer') {
      const paths = getValidTransferPathsForDestination(contextMenu.paths || [], targetPath);
      return [
        {
          label: paths.length > 1 ? `Move ${paths.length} Items Here` : 'Move Here',
          icon: <FolderOpen size={14} />,
          disabled: paths.length === 0 || transferInProgress,
          action: () => void transferPathsToFolder(paths, targetPath, 'move'),
        },
        {
          label: paths.length > 1 ? `Copy ${paths.length} Items Here` : 'Copy Here',
          icon: <Copy size={14} />,
          disabled: paths.length === 0 || transferInProgress,
          action: () => void transferPathsToFolder(paths, targetPath, 'copy'),
        },
      ];
    }

    if (contextMenu.kind === 'folder') {
      if (isTrashPath(targetPath)) {
        return [
          { label: 'Open', icon: <FolderOpen size={14} />, action: () => openFolder(targetPath) },
          ...(!isRemoteClient ? [
            { label: 'Show in File Explorer', icon: <FolderOpen size={14} />, action: () => void revealPaths([targetPath]) },
          ] satisfies ContextMenuItem[] : []),
          { label: 'Copy Path', icon: <Copy size={14} />, action: () => void copyPaths([targetPath]) },
          { separator: true },
          { label: 'Restore', icon: <RotateCcw size={14} />, action: () => void restoreTrashPaths([targetPath]) },
          { label: 'Delete Permanently', icon: <Trash2 size={14} />, danger: true, action: () => void deleteTrashPathsForever([targetPath]) },
        ];
      }
      const pinned = pinnedFolders.some((entry) => pathsEqual(entry, targetPath));
      return [
        { label: 'Open Folder', icon: <FolderOpen size={14} />, action: () => openFolder(targetPath) },
        ...(!isRemoteClient ? [
          { label: 'Show in File Explorer', icon: <FolderOpen size={14} />, action: () => void revealPaths([targetPath]) },
        ] satisfies ContextMenuItem[] : []),
        { label: 'Copy Path', icon: <Copy size={14} />, action: () => void copyPaths([targetPath]) },
        { separator: true },
        {
          label: selectedPaths.size > 1 ? `Move ${selectedPaths.size} Selected Here` : 'Move Selected Here',
          icon: <FolderOpen size={14} />,
          disabled: getValidTransferPathsForDestination(Array.from(selectedPaths), targetPath).length === 0 || transferInProgress,
          action: () => void transferPathsToFolder(Array.from(selectedPaths), targetPath, 'move'),
        },
        {
          label: selectedPaths.size > 1 ? `Copy ${selectedPaths.size} Selected Here` : 'Copy Selected Here',
          icon: <Copy size={14} />,
          disabled: getValidTransferPathsForDestination(Array.from(selectedPaths), targetPath).length === 0 || transferInProgress,
          action: () => void transferPathsToFolder(Array.from(selectedPaths), targetPath, 'copy'),
        },
        { separator: true },
        { label: 'New Subfolder...', icon: <Folder size={14} />, action: () => void createSubfolder(targetPath) },
        { label: 'Rename Folder...', icon: <MoreHorizontal size={14} />, action: () => void renameFolder(targetPath) },
        { label: pinned ? 'Unpin Folder' : 'Pin Folder', icon: <Pin size={14} />, action: () => togglePinnedFolder(targetPath) },
        { label: 'Clear Empty Subfolders...', icon: <Trash2 size={14} />, action: () => void previewEmptyFolderCleanup(targetPath) },
        { separator: true },
        { label: 'Move Folder to Trash', icon: <Trash2 size={14} />, danger: true, action: () => void movePathsToTrash([targetPath]) },
      ];
    }

    const paths = selectedPathsForContext(contextMenu);
    const allTrash = paths.length > 0 && paths.every((path) => path === TRASH_ROOT || path.startsWith(`${TRASH_ROOT}/`));
    if (allTrash) {
      const targetFile = knownFiles.find((file) => pathsEqual(file.path, targetPath));
      const downloadablePaths = paths.filter((path) => {
        const file = knownFiles.find((entry) => pathsEqual(entry.path, path));
        return !file || file.type !== 'folder';
      });
      const downloadableImagePaths = paths.filter((path) => {
        const file = knownFiles.find((entry) => pathsEqual(entry.path, path));
        return !file || file.type === 'image' || file.type === 'gif';
      });
      return [
        { label: 'Open', icon: targetFile?.type === 'folder' ? <FolderOpen size={14} /> : <ImageIcon size={14} />, disabled: !targetFile, action: () => targetFile && openFile(targetFile) },
        ...(isRemoteClient ? [
          { label: downloadablePaths.length > 1 ? `Download ${downloadablePaths.length} Originals` : 'Download Original', icon: <Download size={14} />, disabled: downloadablePaths.length === 0, action: () => downloadOriginalPaths(downloadablePaths) },
        ] satisfies ContextMenuItem[] : []),
        { label: downloadableImagePaths.length > 1 ? `Download ${downloadableImagePaths.length} JPEGs + Metadata` : 'Download JPEG + Metadata', icon: <Download size={14} />, disabled: downloadableImagePaths.length === 0, action: () => downloadJpegZip(downloadableImagePaths, 'keep') },
        { label: downloadableImagePaths.length > 1 ? `Download ${downloadableImagePaths.length} Clean JPEGs` : 'Download Clean JPEG', icon: <Download size={14} />, disabled: downloadableImagePaths.length === 0, action: () => downloadJpegZip(downloadableImagePaths, 'strip') },
        ...(!isRemoteClient ? [
          { label: 'Show in File Explorer', icon: <FolderOpen size={14} />, action: () => void revealPaths(paths) },
        ] satisfies ContextMenuItem[] : []),
        ...(!isPhoneRemote ? [
          { label: paths.length > 1 ? `Copy ${paths.length} Paths` : 'Copy Path', icon: <Copy size={14} />, action: () => void copyPaths(paths) },
          { separator: true },
        ] satisfies ContextMenuItem[] : []),
        { label: paths.length > 1 ? `Restore ${paths.length} Items` : 'Restore', icon: <RotateCcw size={14} />, action: () => void restoreTrashPaths(paths) },
        { label: paths.length > 1 ? `Delete Permanently (${paths.length})` : 'Delete Permanently', icon: <Trash2 size={14} />, danger: true, action: () => void deleteTrashPathsForever(paths) },
      ];
    }

    const targetFile = knownFiles.find((file) => pathsEqual(file.path, targetPath));
    const downloadablePaths = paths.filter((path) => {
      const file = knownFiles.find((entry) => pathsEqual(entry.path, path));
      return !file || file.type !== 'folder';
    });
    const selectedImagePaths = paths.filter((path) => {
      const file = knownFiles.find((entry) => pathsEqual(entry.path, path));
      return !file || file.type === 'image' || file.type === 'gif';
    });
    const targetImagePath = targetFile && (targetFile.type === 'image' || targetFile.type === 'gif')
      ? normalizePath(targetFile.path)
      : '';
    const targetPowerPrompterPngPath = /\.png$/i.test(targetPath) ? targetPath : '';
    const targetVideoPath = targetFile?.type === 'video'
      ? normalizePath(targetFile.path)
      : '';
    const datasetImportItems: ContextMenuItem[] = selectedImagePaths.length === 0
      ? []
      : [
          {
            label: datasetTargetsLoading ? 'Loading Dataset Targets...' : 'Add to Dataset...',
            icon: <FolderOpen size={14} />,
            disabled: datasetTargetsLoading,
            action: () => {
              setDatasetPicker({
                x: (contextMenu?.x || 0) + 28,
                y: (contextMenu?.y || 0) + 24,
                paths: selectedImagePaths,
              });
            },
          },
        ];
    const orderablePathSet = new Set(files.map((file) => normalizePath(file.path).toLowerCase()).filter(Boolean));
    const reorderSourcePaths = contextMenu.reorderPaths && contextMenu.reorderPaths.length > 0
      ? contextMenu.reorderPaths
      : paths;
    const reorderPaths = uniqueNormalizedPaths(reorderSourcePaths)
      .filter((path) => !pathsEqual(path, targetPath))
      .filter((path) => orderablePathSet.has(normalizePath(path).toLowerCase()));
    const canReorder = !globalSearchActive
      && orderablePathSet.has(targetPath.toLowerCase())
      && reorderPaths.length > 0;
    return [
      { label: 'Open', icon: <ImageIcon size={14} />, disabled: !targetFile, action: () => targetFile && openFile(targetFile) },
      ...(targetPowerPrompterPngPath ? [
        {
          label: 'Restore in Power Prompter',
          icon: <RotateCcw size={14} />,
          action: () => restorePathInPowerPrompter(targetPowerPrompterPngPath),
        },
      ] satisfies ContextMenuItem[] : []),
      { label: 'Send Parameters to Umbra UI TXT2IMG', icon: <Sparkles size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'txt2img') },
      ...(isRemoteClient ? [
        { label: downloadablePaths.length > 1 ? `Download ${downloadablePaths.length} Originals` : 'Download Original', icon: <Download size={14} />, disabled: downloadablePaths.length === 0, action: () => downloadOriginalPaths(downloadablePaths) },
      ] satisfies ContextMenuItem[] : []),
      { label: selectedImagePaths.length > 1 ? `Download ${selectedImagePaths.length} JPEGs + Metadata` : 'Download JPEG + Metadata', icon: <Download size={14} />, disabled: selectedImagePaths.length === 0, action: () => downloadJpegZip(selectedImagePaths, 'keep') },
      { label: selectedImagePaths.length > 1 ? `Download ${selectedImagePaths.length} Clean JPEGs` : 'Download Clean JPEG', icon: <Download size={14} />, disabled: selectedImagePaths.length === 0, action: () => downloadJpegZip(selectedImagePaths, 'strip') },
      ...(!isRemoteClient ? [
        { label: 'Show in File Explorer', icon: <FolderOpen size={14} />, action: () => void revealPaths(paths) },
      ] satisfies ContextMenuItem[] : []),
      ...(!isPhoneRemote ? [
        { label: paths.length > 1 ? `Copy ${paths.length} Paths` : 'Copy Path', icon: <Copy size={14} />, action: () => void copyPaths(paths) },
        { label: 'Open Workflow in ComfyUI', icon: <FileJson size={14} />, action: () => void openOrCopyComfyWorkflow(paths) },
        { separator: true },
        ...datasetImportItems,
        ...(datasetImportItems.length > 0 ? [{ separator: true } satisfies ContextMenuItem] : []),
        { label: 'Send to Umbra UI IMG2IMG', icon: <Images size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'img2img') },
        { label: 'Send to Umbra UI Inpaint', icon: <Paintbrush size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'inpaint') },
        { label: 'Send to IMG2VID / First Frame', icon: <Clapperboard size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'video', 'first') },
        { label: 'Set as Video Middle Frame', icon: <Clapperboard size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'video', 'middle') },
        { label: 'Set as Video Last Frame', icon: <Clapperboard size={14} />, disabled: !targetImagePath, action: () => void sendPathToUmbraUi(targetImagePath, 'video', 'last') },
        { label: 'Send to Umbra UI VID2VID', icon: <Video size={14} />, disabled: !targetVideoPath, action: () => void sendPathToUmbraUi(targetVideoPath, 'video', 'source_video') },
        { separator: true },
        { label: paths.length > 1 ? `Metadata Scanner (${paths.length})` : 'Metadata Scanner', icon: <ScanSearch size={14} />, action: () => sendSelectionToWorkspace(paths, 'scanner') },
        { label: selectedImagePaths.length > 1 ? `Send to Waifu Diffusion (${selectedImagePaths.length})` : 'Send to Waifu Diffusion', icon: <Send size={14} />, disabled: selectedImagePaths.length === 0, action: () => sendSelectionToWorkspace(selectedImagePaths, 'waifudiffusion') },
        { separator: true },
      ] satisfies ContextMenuItem[] : []),
      { label: reorderPaths.length > 0 ? `Reorder ${reorderPaths.length > 1 ? `${reorderPaths.length} Items` : 'Selected'} Before` : 'Reorder Before', icon: <RotateCcw size={14} />, disabled: !canReorder, action: () => void reorderPathsRelativeToTarget(reorderPaths, targetPath, 'before') },
      { label: reorderPaths.length > 0 ? `Reorder ${reorderPaths.length > 1 ? `${reorderPaths.length} Items` : 'Selected'} After` : 'Reorder After', icon: <RotateCcw size={14} />, disabled: !canReorder, action: () => void reorderPathsRelativeToTarget(reorderPaths, targetPath, 'after') },
      { label: 'Rename', icon: <MoreHorizontal size={14} />, action: () => void renamePaths(paths) },
      { label: paths.length > 1 ? `Edit Tags (${paths.length})...` : 'Edit Tags...', icon: <Tags size={14} />, action: () => openTagEditor(paths) },
      { separator: true },
      { label: paths.length > 1 ? `Delete (${paths.length})` : 'Delete', icon: <Trash2 size={14} />, danger: true, action: () => void movePathsToTrash(paths) },
    ];
  }, [
    contextMenu,
    openOrCopyComfyWorkflow,
    copyPaths,
    createSubfolder,
    datasetTargetsLoading,
    deleteTrashPathsForever,
    downloadJpegZip,
    downloadOriginalPaths,
    files,
    globalSearchActive,
    isPhoneRemote,
    isRemoteClient,
    knownFiles,
    movePathsToTrash,
    openFile,
    openFolder,
    openTagEditor,
    pinnedFolders,
    previewEmptyFolderCleanup,
    renameFolder,
    renamePaths,
    reorderPathsRelativeToTarget,
    restorePathInPowerPrompter,
    restoreTrashPaths,
    revealPaths,
    refreshDatasetTargets,
    selectedPathsForContext,
    selectedPaths,
    sendPathToUmbraUi,
    sendSelectionToWorkspace,
    togglePinnedFolder,
    transferInProgress,
    transferPathsToFolder,
    viewerFileFallback,
  ]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || '');
      const viewerOpen = Boolean(viewerPath || document.querySelector('[data-umbra-gallery-viewer]'));
      const consumeGalleryKey = () => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      if (isEditableKeyboardTarget(event.target)) return;

      if (viewerOpen) {
        if (key === 'Escape') {
          consumeGalleryKey();
          closeViewer();
          return;
        }
        if (key === 'ArrowLeft') {
          consumeGalleryKey();
          stepViewer(-1);
          return;
        }
        if (key === 'ArrowRight') {
          consumeGalleryKey();
          stepViewer(1);
          return;
        }
        if (key === 'Delete' || key === 'Backspace') {
          consumeGalleryKey();
          if (!event.repeat) void deleteViewerSelection();
        }
        return;
      }

      if (event.defaultPrevented) return;
      if (key !== 'Delete' && key !== 'Backspace') return;
      if (event.repeat) return;
      const selected = uniqueNormalizedPaths(Array.from(selectedPathsRef.current));
      if (selected.length === 0 || loading || transferInProgress) return;
      consumeGalleryKey();
      setContextMenu(null);
      if (selected.every(isTrashPath)) void deleteTrashPathsForever(selected);
      else void movePathsToTrash(selected);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closeViewer, deleteTrashPathsForever, deleteViewerSelection, loading, movePathsToTrash, stepViewer, transferInProgress, viewerPath]);

  const reorderContextTargetPath = contextMenu?.kind === 'media' && (contextMenu.reorderPaths?.length || 0) > 0
    ? normalizePath(contextMenu.targetPath)
    : '';

  return (
    <section
      className="flex h-full min-h-0 w-full bg-zinc-950 text-zinc-100"
      data-umbra-react-gallery-root
      data-umbra-gallery-mobile-media-view={isPhoneRemote ? mobileMediaView : undefined}
    >
      <div data-umbra-gallery-mobile-switcher="">
        <button
          type="button"
          data-active={galleryMobileView === 'folders' ? '1' : '0'}
          onClick={() => setGalleryMobileViewWithHistory('folders', { pushHistory: false })}
        >
          <FolderOpen size={15} />
          Library
        </button>
        <button
          type="button"
          data-active={galleryMobileView === 'media' ? '1' : '0'}
          onClick={() => setGalleryMobileViewWithHistory('media')}
        >
          <Grid3X3 size={15} />
          Media
        </button>
      </div>
      <LibraryNavigator
        mobileActive={galleryMobileView === 'folders'}
        roots={rootChoices}
        currentFolder={currentFolder}
        focusedFolder={focusedFolder}
        pinnedFolders={pinnedFolders}
        expandedFolders={expandedFolders}
        treeChildrenByPath={treeChildrenByPath}
        loadingTreePaths={loadingTreePaths}
        onFocusFolder={focusFolder}
        onOpenFolder={(folderPath) => openFolder(folderPath, { showMedia: !isPhoneRemote })}
        onToggleExpand={toggleTreeExpand}
        onRefreshTree={refreshTreeChildren}
        onTogglePinnedFolder={togglePinnedFolder}
        onFolderContextMenu={openFolderContextMenu}
        searchQuery={query}
        searchLoading={searchLoading}
        searchSuggestions={searchSuggestions}
        searchSuggestionsOpen={searchSuggestionsOpen && searchSuggestions.length > 0}
        searchSuggestionIndex={searchSuggestionIndex}
        onSearchQueryChange={(value) => {
          setQuery(value);
          setSearchSuggestionsOpen(true);
        }}
        onClearSearch={clearSearch}
        onSearchFocus={() => setSearchSuggestionsOpen(true)}
        onSearchBlur={() => window.setTimeout(() => setSearchSuggestionsOpen(false), 120)}
        onSearchKeyDown={handleSearchKeyDown}
        onSearchSuggestionHover={setSearchSuggestionIndex}
        onSearchSuggestionSelect={applySearchSuggestion}
        draggingCount={draggingPaths.length}
        dropTargetFolder={dropTargetFolder}
        transferProgress={transferProgress}
        onFolderDragStart={startFolderDrag}
        onFolderDragEnd={clearMediaDrag}
        onFolderDragOver={handleFolderDropTargetDragOver}
        onFolderDragLeave={handleFolderDropTargetDragLeave}
        onFolderDrop={handleFolderDropTargetDrop}
        mobileExpandOnTap={isPhoneRemote}
        showContextButtons={isTouchRemote}
      />

      <main
        data-umbra-gallery-content=""
        data-umbra-gallery-mobile-active={galleryMobileView === 'media' ? '1' : '0'}
        className="flex min-w-0 flex-1 flex-col"
      >
        <header
          data-umbra-gallery-header=""
          className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/90 px-4"
        >
          <div data-umbra-gallery-folder-summary="" className="min-w-0 flex-1">
            <div data-umbra-gallery-folder-title="" className="truncate text-sm font-semibold text-zinc-100">
              {openingDifferentFolder ? `Opening ${pathLeaf(openingFolder) || openingFolder}` : (pathLeaf(currentFolder) || currentFolder)}
            </div>
            <div
              data-umbra-gallery-path-ticker=""
              className="truncate text-[11px] text-zinc-500"
              title={`${displayFolder} - ${openingDifferentFolder ? 'opening...' : `${formatCount(total, files.length)} loaded`}`}
            >
              <span>{displayFolder} - {openingDifferentFolder ? 'opening...' : `${formatCount(total, files.length)} loaded`}</span>
            </div>
          </div>

          <div data-umbra-gallery-sort-actions="" className="flex min-w-0 items-center gap-2">
            {!trashMode ? (
              <>
                <select
                  value={sortBy}
                  onChange={(event) => {
                    markGalleryUiSessionDirty();
                    setSortBy(event.target.value as GallerySortBy);
                  }}
                  className="h-8 rounded border border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]"
                >
                  <option value="created">Created</option>
                  <option value="modified">Modified</option>
                  <option value="name">Name</option>
                  <option value="custom">Custom</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    markGalleryUiSessionDirty();
                    setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white"
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortOrder === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markGalleryUiSessionDirty();
                    setGroupBySet((current) => !current);
                  }}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white',
                    groupBySet && 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white',
                  )}
                  title="Group the workspace by image set and sort each set independently"
                >
                  <Tags size={13} />
                  Sets
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => togglePinnedFolder(currentFolder)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white',
                pinnedFolders.some((entry) => pathsEqual(entry, currentFolder)) && 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white',
              )}
              title={pinnedFolders.some((entry) => pathsEqual(entry, currentFolder)) ? 'Unpin folder' : 'Pin folder'}
            >
              <Pin size={15} />
            </button>
            <button
              type="button"
              onClick={refreshCurrentFolderFromDisk}
              className="flex h-8 w-8 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {trashMode && !isTrashRootPath(currentFolder) ? (
            <div data-umbra-trash-breadcrumb="" className="flex min-h-10 items-center gap-2 border-b border-zinc-900 bg-zinc-950/70 px-4 py-2">
              <button
                type="button"
                onClick={() => openFolder(trashParentFolder || TRASH_ROOT)}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
                title="Up one Trash folder"
              >
                <ChevronLeft size={13} />
                Up
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar">
                {trashBreadcrumbChain.map((folderPath, index) => {
                  const isCurrent = pathsEqual(folderPath, currentFolder);
                  return (
                    <React.Fragment key={folderPath}>
                      {index > 0 ? <ChevronRight size={12} className="shrink-0 text-zinc-700" /> : null}
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => openFolder(folderPath)}
                        className={cn(
                          'max-w-[220px] shrink-0 truncate rounded px-2 py-1 text-xs',
                          isCurrent
                            ? 'bg-[var(--umbra-accent-glow)] text-white'
                            : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200',
                        )}
                        title={folderPath}
                      >
                        {index === 0 ? 'Trash' : pathLeaf(folderPath) || folderPath}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div>
          ) : null}
          {searchError ? (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{searchError}</div>
          ) : null}
          {metadataSearchError ? (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{metadataSearchError}</div>
          ) : null}

          <div data-umbra-gallery-action-bar="" className="flex items-center justify-between border-b border-zinc-900 px-4 py-2">
            <div className="text-xs text-zinc-500">
              {selectedPaths.size > 0
                ? `${selectedPaths.size} selected`
                : metadataSearchActive
                  ? `${metadataMatches.length} metadata match${metadataMatches.length === 1 ? '' : 'es'}${metadataSearchLoading ? ' - searching...' : ''}`
                : groupBySet
                  ? `${setGroupedFiles.length} media in ${setGroups.length} set${setGroups.length === 1 ? '' : 's'}`
                : globalSearchActive
                  ? `${displayFiles.length} media, ${searchFolders.length} folder${searchFolders.length === 1 ? '' : 's'}${searchResults?.scannedFolders ? ` - ${searchResults.scannedFolders} scanned` : ''}${searchLoading ? ' - searching...' : ''}`
                : folderPreviewMode
                  ? `${displayFiles.length + folderPreviewFiles.length} media, ${folderPreviewGroups.length || childFolderNodes.length} folder${(folderPreviewGroups.length || childFolderNodes.length) === 1 ? '' : 's'}`
                  : searchNeedle
                    ? `${displayFiles.length} match${displayFiles.length === 1 ? '' : 'es'} in current folder`
                    : `${displayFiles.length} visible`}
            </div>
            <div data-umbra-gallery-action-controls="" className="flex items-center gap-2">
              {!trashMode ? (
                <div data-umbra-gallery-metadata-search="" className="flex min-w-[220px] max-w-[360px] items-center overflow-hidden rounded border border-zinc-800 bg-zinc-950/80 text-zinc-400 focus-within:border-[var(--umbra-accent)]">
                  <ScanSearch size={13} className="ml-2 shrink-0" />
                  <input
                    value={metadataQuery}
                    onChange={(event) => setMetadataQuery(event.target.value)}
                    className="h-7 min-w-0 flex-1 bg-transparent px-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                    placeholder="Search metadata prompts..."
                    title="Search scanned image metadata in this folder"
                  />
                  {metadataSearchLoading ? (
                    <Loader2 size={13} className="mr-2 shrink-0 animate-spin text-zinc-500" />
                  ) : metadataQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMetadataQuery('');
                        setMetadataMatches([]);
                        setMetadataSearchError('');
                      }}
                      className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-white"
                      title="Clear metadata search"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {!trashMode && metadataSearchActive ? (
                <button
                  type="button"
                  disabled={metadataMatches.length === 0}
                  onClick={selectMetadataMatches}
                  className="inline-flex h-7 items-center gap-1.5 rounded border border-cyan-300/30 px-2 text-xs text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40"
                  title="Select all highlighted metadata matches"
                >
                  <CheckSquare size={13} />
                  Highlighted
                </button>
              ) : null}
              {isPhoneRemote ? (
                <button
                  type="button"
                  data-umbra-gallery-mobile-view-toggle=""
                  data-mode={mobileMediaView}
                  onClick={() => {
                    markGalleryUiSessionDirty();
                    setMobileMediaView((current) => current === 'single' ? 'grid' : 'single');
                  }}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950/80 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
                  title={mobileMediaView === 'single' ? 'Switch to grid browsing view' : 'Switch to single card view'}
                >
                  {mobileMediaView === 'single' ? <Grid3X3 size={13} /> : <ImageIcon size={13} />}
                  {mobileMediaView === 'single' ? 'Grid' : 'Single'}
                </button>
              ) : null}
              {isTouchRemote ? (
                touchSelectionMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setTouchSelectionMode(false)}
                      className="inline-flex h-7 items-center gap-1.5 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-2 text-xs text-white"
                    >
                      <CheckSquare size={13} />
                      Done
                    </button>
                    <button
                      type="button"
                      disabled={selectAllLoading || (activeViewerFiles.length === 0 && files.length === 0 && total === 0)}
                      onClick={() => void selectAllInFolder()}
                      className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                    >
                      {selectAllLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
                      All
                    </button>
                    <button
                      type="button"
                      disabled={selectedPaths.size === 0}
                      onClick={() => applyGallerySelection(new Set(), '')}
                      className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                    >
                      <X size={13} />
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-umbra-gallery-mobile-select=""
                    disabled={activeViewerFiles.length === 0 && files.length === 0 && total === 0}
                    onClick={() => setTouchSelectionMode(true)}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  >
                    <CheckSquare size={13} />
                    Select all
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={selectAllLoading || (files.length === 0 && total === 0)}
                  onClick={() => void selectAllInFolder()}
                  className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  {selectAllLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
                  Select all
                </button>
              )}
              {trashMode ? (
                <>
                  <select
                    value={trashRetentionDays}
                    disabled={savingTrashSettings}
                    onChange={(event) => setTrashRetentionDays(clampTrashRetentionDays(event.target.value))}
                    className="h-7 rounded border border-zinc-800 bg-zinc-900/80 px-2 text-xs text-zinc-300 outline-none focus:border-[var(--umbra-accent)]"
                    title="Trash auto-delete days"
                  >
                    {TRASH_RETENTION_OPTIONS.map((days) => (
                      <option key={days} value={days}>{days} day{days === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingTrashSettings}
                    onClick={() => void applyTrashRetention()}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  >
                    {savingTrashSettings ? <Loader2 size={13} className="animate-spin" /> : null}
                    Apply
                  </button>
                  <button
                    type="button"
                    disabled={selectedPaths.size === 0}
                    onClick={() => void restoreTrashPaths(Array.from(selectedPaths))}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw size={13} />
                    Restore
                  </button>
                  <button
                    type="button"
                    disabled={selectedPaths.size === 0}
                    onClick={deleteSelection}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-red-500/30 px-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={emptyingTrash || total === 0}
                    onClick={() => void emptyTrash()}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-red-500/30 px-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-40"
                  >
                    {emptyingTrash ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Empty
                  </button>
                </>
              ) : (
                <>
                  <div ref={tagFlyoutRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setTagFlyoutOpen((current) => !current)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded border border-zinc-800 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white',
                        tagFlyoutOpen && 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white',
                      )}
                      title="Browse tags in the visible folder groups"
                    >
                      {tagFlyoutLoading && tagFlyoutTags.length === 0 ? <Loader2 size={13} className="animate-spin" /> : <Tags size={13} />}
                      Tags
                    </button>
                    {tagFlyoutOpen ? (
                      <div data-umbra-gallery-tag-flyout="" className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded border border-zinc-800 bg-zinc-950/98 shadow-2xl shadow-black/50">
                        <div className="flex items-center justify-between gap-3 border-b border-zinc-900 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-100">Folder Tags</div>
                            <div className="truncate text-[11px] text-zinc-500">
                              {globalSearchActive
                                ? `${tagScopeFolders.length} search group${tagScopeFolders.length === 1 ? '' : 's'}`
                                : folderPreviewMode
                                  ? `${tagScopeFolders.length} folder group${tagScopeFolders.length === 1 ? '' : 's'}`
                                  : pathLeaf(currentFolder) || currentFolder}
                            </div>
                          </div>
                          {tagFlyoutLoading && tagFlyoutTags.length === 0 ? <Loader2 size={14} className="shrink-0 animate-spin text-zinc-500" /> : null}
                        </div>
                        {tagFlyoutError && tagFlyoutTags.length === 0 ? (
                          <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{tagFlyoutError}</div>
                        ) : null}
                        <div className="max-h-[360px] overflow-y-auto p-2">
                          {tagFlyoutTags.length === 0 ? (
                            <div className="px-2 py-6 text-center text-xs text-zinc-500">
                              {tagFlyoutLoading ? 'Loading tags...' : 'No tags found in this view'}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {tagFlyoutTags.map((item) => (
                                <button
                                  key={item.tag}
                                  type="button"
                                  onClick={() => {
                                    setQuery(item.tag);
                                    setSearchSuggestionsOpen(false);
                                    setTagFlyoutOpen(false);
                                  }}
                                  className="inline-flex max-w-full items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-left text-xs text-zinc-300 hover:border-[var(--umbra-accent)] hover:text-white"
                                  title={`Search tag: ${item.tag}`}
                                >
                                  <span className="truncate">{item.tag}</span>
                                  <span className="shrink-0 text-[10px] text-zinc-600">{item.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={selectedPaths.size === 0}
                    onClick={deleteSelection}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-red-500/30 px-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-100 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                    Trash
                  </button>
                </>
              )}
            </div>
          </div>

          <div ref={scrollParentRef} data-umbra-gallery-scroll="" className="min-h-0 flex-1 overflow-y-auto p-3">
            {openingDifferentFolder ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
                <div className="flex items-center text-sm">
                  <Loader2 className="mr-2 animate-spin" size={18} />
                  Opening folder
                </div>
                <div className="max-w-[70%] truncate text-xs text-zinc-600" title={openingFolder}>{openingFolder}</div>
              </div>
            ) : loading && files.length === 0 && !globalSearchActive ? (
              <div className="flex h-full items-center justify-center text-zinc-500">
                <Loader2 className="mr-2 animate-spin" size={18} />
                Loading gallery
              </div>
            ) : globalSearchActive && searchLoading && displayFiles.length === 0 && searchFolders.length === 0 ? (
              <div className="flex h-full items-center justify-center text-zinc-500">
                <Loader2 className="mr-2 animate-spin" size={18} />
                Searching gallery
              </div>
            ) : displayFiles.length === 0 && !folderPreviewMode && (!globalSearchActive || searchFolders.length === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                {searchNeedle ? 'No matches found' : trashMode ? 'No items in Trash' : 'No media in this folder'}
              </div>
            ) : groupBySet && !trashMode ? (
              <div className="space-y-4 pb-4">
                {globalSearchActive && searchFolders.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-zinc-900/55 px-3 py-2 text-left">
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderOpen size={15} className="shrink-0 text-zinc-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-100">Folder matches</span>
                          <span className="block truncate text-[11px] text-zinc-500">Search folders are listed before set groups</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-500">{searchFolders.length} folder{searchFolders.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {searchFolders.map((folder) => (
                        <button
                          key={folder.path}
                          type="button"
                          onClick={() => openSearchFolder(folder.path)}
                          onContextMenu={(event) => openFolderContextMenu(event, folder.path)}
                          className="flex min-w-0 items-center gap-2 rounded border border-white/10 bg-zinc-950/45 px-3 py-2 text-left hover:border-white/20 hover:bg-white/[0.04]"
                          title={folder.path}
                        >
                          <FolderOpen size={14} className="shrink-0 text-zinc-500" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-zinc-200">{folder.name || pathLeaf(folder.path) || folder.path}</span>
                            <span className="block truncate text-[11px] text-zinc-600">{folder.path}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
                {setGroups.map((group, groupIndex) => (
                  <section key={`set-group-${group.setId}`} className="space-y-2">
                    <div
                      className="flex w-full items-center justify-between gap-3 rounded border px-3 py-2 text-left"
                      style={{
                        borderColor: hexToRgba(group.color, 0.32),
                        background: `linear-gradient(90deg, ${hexToRgba(group.color, 0.14)}, rgba(24,24,27,0.58))`,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: group.color, boxShadow: `0 0 14px ${hexToRgba(group.color, 0.5)}` }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100">{group.label}</span>
                          <span className="block truncate text-[11px] text-zinc-500">
                            {group.files.length} media - {group.rule.sortBy === 'custom' ? 'Custom order' : `${group.rule.sortBy} ${group.rule.sortOrder}`}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <select
                          value={group.rule.sortBy}
                          onChange={(event) => updateSetSortRule(group.setId, { sortBy: event.target.value as GallerySortBy })}
                          className="h-7 rounded border border-white/10 bg-zinc-950/70 px-2 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]"
                          title={`Sort ${group.label}`}
                        >
                          <option value="created">Created</option>
                          <option value="modified">Modified</option>
                          <option value="name">Name</option>
                          <option value="custom">Custom</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => updateSetSortRule(group.setId, { sortOrder: group.rule.sortOrder === 'asc' ? 'desc' : 'asc' })}
                          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                          title={group.rule.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                        >
                          {group.rule.sortOrder === 'asc' ? <ArrowUpAZ size={13} /> : <ArrowDownAZ size={13} />}
                        </button>
                      </span>
                    </div>
                    {group.files.length > 0 ? (
                      <div
                        className="grid"
                        style={{
                          gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))`,
                          gap: GRID_GAP,
                        }}
                      >
                        {group.files.map((file, fileIndex) => {
                          const id = fileId(file);
                          const path = normalizePath(file.path);
                          const selected = selectedPathKeys.has(selectionPathKey(path));
                          const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                          return (
                            <GalleryImageTile
                              key={id}
                              file={file}
                              selected={selected}
                              contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                              restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                              metadataHighlighted={Boolean(metadataMatch)}
                              metadataSnippet={metadataMatch?.snippet || ''}
                              setColor={group.setId > 0 ? group.color : undefined}
                              setLabel={group.setId > 0 ? group.label : undefined}
                              prioritize={groupIndex === 0 && fileIndex <= 8}
                              cardSize={cardSize}
                              cardHeight={cardHeight}
                              onSelect={(event) => selectFile(file, event)}
                              onOpen={() => globalSearchActive ? openSearchFile(file) : openFile(file)}
                              onContextMenu={(event) => openMediaContextMenu(event, file)}
                              onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                              onDragStart={(event) => startMediaDrag(event, file)}
                              onDragEnd={clearMediaDrag}
                              selectionMode={isTouchRemote && touchSelectionMode}
                              singleTapOpen={isTouchRemote && !touchSelectionMode}
                              showContextButton={isTouchRemote}
                              onSelectionPointerDown={beginTouchSelectionDrag}
                              onSelectionPointerEnter={extendTouchSelectionDrag}
                              onSelectionPointerUp={endTouchSelectionDrag}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                ))}
                {globalSearchActive && searchLoading ? (
                  <div className="flex items-center justify-center py-3 text-xs text-zinc-500">
                    <Loader2 className="mr-2 animate-spin" size={14} />
                    Searching more folders
                  </div>
                ) : null}
              </div>
            ) : globalSearchActive ? (
              <div className="space-y-4 pb-4">
                {searchGroups.map((group, groupIndex) => (
                  <section key={group.folder.path} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => openSearchFolder(group.folder.path)}
                      onContextMenu={(event) => openFolderContextMenu(event, group.folder.path)}
                      className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-zinc-900/55 px-3 py-2 text-left hover:border-white/20 hover:bg-white/[0.04]"
                      title={group.folder.path}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderOpen size={15} className="shrink-0 text-zinc-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-100">{group.folder.name || pathLeaf(group.folder.path) || group.folder.path}</span>
                          <span className="block truncate text-[11px] text-zinc-500">{group.folder.path}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-500">
                        {group.files.length > 0 ? `${group.files.length} media` : 'folder'}
                      </span>
                    </button>
                    {group.files.length > 0 ? (
                      <div
                        className="grid"
                        style={{
                          gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))`,
                          gap: GRID_GAP,
                        }}
                      >
                        {group.files.map((file, fileIndex) => {
                          const id = fileId(file);
                          const path = normalizePath(file.path);
                          const selected = selectedPathKeys.has(selectionPathKey(path));
                          const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                          return (
                            <GalleryImageTile
                              key={id}
                              file={file}
                              selected={selected}
                              contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                              restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                              metadataHighlighted={Boolean(metadataMatch)}
                              metadataSnippet={metadataMatch?.snippet || ''}
                              prioritize={groupIndex === 0 && fileIndex <= 8}
                              cardSize={cardSize}
                              cardHeight={cardHeight}
                              onSelect={(event) => selectFile(file, event)}
                              onOpen={() => openSearchFile(file)}
                              onContextMenu={(event) => openMediaContextMenu(event, file)}
                              onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                              onDragStart={(event) => startMediaDrag(event, file)}
                              onDragEnd={clearMediaDrag}
                              selectionMode={isTouchRemote && touchSelectionMode}
                              singleTapOpen={isTouchRemote && !touchSelectionMode}
                              showContextButton={isTouchRemote}
                              onSelectionPointerDown={beginTouchSelectionDrag}
                              onSelectionPointerEnter={extendTouchSelectionDrag}
                              onSelectionPointerUp={endTouchSelectionDrag}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                ))}
                {searchLoading ? (
                  <div className="flex items-center justify-center py-3 text-xs text-zinc-500">
                    <Loader2 className="mr-2 animate-spin" size={14} />
                    Searching more folders
                  </div>
                ) : null}
              </div>
            ) : trashRootMode ? (
              <div className="space-y-4 pb-4">
                {trashGroups.map((group, groupIndex) => {
                  const collapsed = collapsedTrashGroups.has(group.id);
                  return (
                    <section key={group.id} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setCollapsedTrashGroups((current) => {
                          const next = new Set(current);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })}
                        className="flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-zinc-900/55 px-3 py-2 text-left hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {collapsed ? <ChevronRight size={14} className="shrink-0 text-zinc-500" /> : <ChevronDown size={14} className="shrink-0 text-zinc-500" />}
                          <span className="truncate text-xs font-medium text-zinc-100">{group.label}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500">{group.files.length}</span>
                      </button>
                      {!collapsed ? (
                        <div
                          className="grid"
                          style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))`,
                            gap: GRID_GAP,
                          }}
                        >
                          {group.files.map((file, fileIndex) => {
                            const id = fileId(file);
                            const path = normalizePath(file.path);
                            const selected = selectedPathKeys.has(selectionPathKey(path));
                            const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                            return (
                              <GalleryImageTile
                                key={id}
                                file={file}
                                selected={selected}
                                contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                                restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                                metadataHighlighted={Boolean(metadataMatch)}
                                metadataSnippet={metadataMatch?.snippet || ''}
                                prioritize={groupIndex === 0 && fileIndex <= 8}
                                cardSize={cardSize}
                                cardHeight={cardHeight}
                                onSelect={(event) => selectFile(file, event)}
                                onOpen={() => openFile(file)}
                                onContextMenu={(event) => openMediaContextMenu(event, file)}
                                onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                                onDragStart={(event) => startMediaDrag(event, file)}
                                onDragEnd={clearMediaDrag}
                                selectionMode={isTouchRemote && touchSelectionMode}
                                singleTapOpen={isTouchRemote && !touchSelectionMode}
                                showContextButton={isTouchRemote}
                                onSelectionPointerDown={beginTouchSelectionDrag}
                                onSelectionPointerEnter={extendTouchSelectionDrag}
                                onSelectionPointerUp={endTouchSelectionDrag}
                              />
                            );
                          })}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : folderPreviewMode ? (
              <div className="space-y-4 pb-4">
                {displayFiles.length > 0 ? (
                  <section className="space-y-2">
                    <div
                      onContextMenu={(event) => openFolderContextMenu(event, currentFolder)}
                      onDragOver={(event) => handleFolderDropTargetDragOver(event, currentFolder)}
                      onDragLeave={() => setDropTargetFolder((current) => pathsEqual(current, currentFolder) ? '' : current)}
                      onDrop={(event) => handleFolderDropTargetDrop(event, currentFolder)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-zinc-900/55 px-3 py-2 text-left hover:border-white/20 hover:bg-white/[0.04]',
                        pathsEqual(dropTargetFolder, currentFolder) && 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]',
                      )}
                      title={currentFolder}
                    >
                      <button
                        type="button"
                        onClick={() => openFolder(currentFolder)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FolderOpen size={15} className="shrink-0 text-zinc-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-100">This folder</span>
                          <span className="block truncate text-[11px] text-zinc-500">{currentFolder}</span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="px-1 text-[11px] text-zinc-500">{displayFiles.length} media</span>
                        <button
                          type="button"
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white',
                            pinnedFolders.some((entry) => pathsEqual(entry, currentFolder)) && 'border-[var(--umbra-accent)] text-white',
                          )}
                          title={pinnedFolders.some((entry) => pathsEqual(entry, currentFolder)) ? 'Unpin folder' : 'Pin folder'}
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePinnedFolder(currentFolder);
                          }}
                        >
                          <Pin size={13} />
                        </button>
                        {!isRemoteClient ? (
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                            title="Show in File Explorer"
                            onClick={(event) => {
                              event.stopPropagation();
                              void revealPaths([currentFolder]);
                            }}
                          >
                            <HardDrive size={13} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                          title="Copy path"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyPaths([currentFolder]);
                          }}
                        >
                          <Copy size={13} />
                        </button>
                        {!currentFolderIsRoot ? (
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded border border-red-500/25 text-red-300 hover:bg-red-500/10"
                            title="Move folder to Trash"
                            onClick={(event) => {
                              event.stopPropagation();
                              void movePathsToTrash([currentFolder]);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))`,
                        gap: GRID_GAP,
                      }}
                    >
                      {displayFiles.map((file, fileIndex) => {
                        const id = fileId(file);
                        const path = normalizePath(file.path);
                        const selected = selectedPathKeys.has(selectionPathKey(path));
                        const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                        return (
                          <GalleryImageTile
                            key={id}
                            file={file}
                            selected={selected}
                            contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                            restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                            metadataHighlighted={Boolean(metadataMatch)}
                            metadataSnippet={metadataMatch?.snippet || ''}
                            prioritize={fileIndex <= 8}
                            cardSize={cardSize}
                            cardHeight={cardHeight}
                            onSelect={(event) => selectFile(file, event)}
                            onOpen={() => openFile(file)}
                            onContextMenu={(event) => openMediaContextMenu(event, file)}
                            onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                            onDragStart={(event) => startMediaDrag(event, file)}
                            onDragEnd={clearMediaDrag}
                            selectionMode={isTouchRemote && touchSelectionMode}
                            singleTapOpen={isTouchRemote && !touchSelectionMode}
                            showContextButton={isTouchRemote}
                            onSelectionPointerDown={beginTouchSelectionDrag}
                            onSelectionPointerEnter={extendTouchSelectionDrag}
                            onSelectionPointerUp={endTouchSelectionDrag}
                          />
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                {folderPreviewGroups.map((group, groupIndex) => {
                  const visibleFiles = getVisibleFolderPreviewFiles(group);
                  const visibleCount = visibleFiles.length;
                  const expansionLevel = Math.min(2, Math.max(0, Math.trunc(Number(group.expansionLevel ?? 0))));
                  const depth = Math.min(FOLDER_PREVIEW_MAX_DEPTH, Math.max(0, Math.trunc(Number(group.depth || 0))));
                  const childFolderCount = Math.max(0, Math.trunc(Number(group.childFolderCount || 0)));
                  const canExpand = group.loading !== true
                    && group.error == null
                    && (group.done !== true || visibleCount < group.files.length);
                  const canCollapse = !group.loadingMore && (expansionLevel > 0 || visibleCount > FOLDER_PREVIEW_PAGE_SIZE);
                  const folderName = group.folder.name || pathLeaf(group.folder.path) || 'folder';
                  return (
                    <section
                      key={group.folder.path}
                      className="space-y-2"
                      style={{ marginLeft: depth > 0 ? depth * 18 : 0 }}
                    >
                    <div
                      onContextMenu={(event) => openFolderContextMenu(event, group.folder.path)}
                      onDragOver={(event) => handleFolderDropTargetDragOver(event, group.folder.path)}
                      onDragLeave={() => setDropTargetFolder((current) => pathsEqual(current, group.folder.path) ? '' : current)}
                      onDrop={(event) => handleFolderDropTargetDrop(event, group.folder.path)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded border border-white/10 bg-zinc-900/55 px-3 py-2 text-left hover:border-white/20 hover:bg-white/[0.04]',
                        pathsEqual(dropTargetFolder, group.folder.path) && 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]',
                      )}
                      title={group.folder.path}
                    >
                      <button
                        type="button"
                        onClick={() => openFolder(group.folder.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FolderOpen size={15} className="shrink-0 text-zinc-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-zinc-100">
                            {depth > 0 ? `${'-- '.repeat(depth)}${group.folder.name || pathLeaf(group.folder.path) || group.folder.path}` : group.folder.name || pathLeaf(group.folder.path) || group.folder.path}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-500">{group.folder.path}</span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="px-1 text-[11px] text-zinc-500">
                          {group.loading && group.files.length === 0
                            ? 'loading...'
                            : group.error
                              ? 'error'
                              : `${visibleCount}${group.total > visibleCount ? `/${group.total}` : ''} media${childFolderCount > 0 ? `, ${childFolderCount} folder${childFolderCount === 1 ? '' : 's'}` : ''}`}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white',
                            pinnedFolders.some((entry) => pathsEqual(entry, group.folder.path)) && 'border-[var(--umbra-accent)] text-white',
                          )}
                          title={pinnedFolders.some((entry) => pathsEqual(entry, group.folder.path)) ? 'Unpin folder' : 'Pin folder'}
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePinnedFolder(group.folder.path);
                          }}
                        >
                          <Pin size={13} />
                        </button>
                        {!isRemoteClient ? (
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                            title="Show in File Explorer"
                            onClick={(event) => {
                              event.stopPropagation();
                              void revealPaths([group.folder.path]);
                            }}
                          >
                            <HardDrive size={13} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
                          title="Copy path"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyPaths([group.folder.path]);
                          }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded border border-red-500/25 text-red-300 hover:bg-red-500/10"
                          title="Move folder to Trash"
                          onClick={(event) => {
                            event.stopPropagation();
                            void movePathsToTrash([group.folder.path]);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {group.loading && group.files.length === 0 ? (
                      <div className="flex h-20 items-center justify-center rounded border border-white/10 bg-zinc-950/45 text-xs text-zinc-500">
                        <Loader2 className="mr-2 animate-spin" size={14} />
                        Loading folder
                      </div>
                    ) : group.error ? (
                      <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{group.error}</div>
                    ) : visibleFiles.length > 0 ? (
                      <>
                        <div
                          className="grid"
                          style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, ${cardSize}px))`,
                            gap: GRID_GAP,
                          }}
                        >
                          {visibleFiles.map((file, fileIndex) => {
                            const id = fileId(file);
                            const path = normalizePath(file.path);
                            const selected = selectedPathKeys.has(selectionPathKey(path));
                            const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                            return (
                              <GalleryImageTile
                                key={id}
                                file={file}
                                selected={selected}
                                contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                                restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                                metadataHighlighted={Boolean(metadataMatch)}
                                metadataSnippet={metadataMatch?.snippet || ''}
                                prioritize={displayFiles.length === 0 && groupIndex === 0 && fileIndex <= 8}
                                cardSize={cardSize}
                                cardHeight={cardHeight}
                                onSelect={(event) => selectFile(file, event)}
                                onOpen={() => openFile(file)}
                                onContextMenu={(event) => openMediaContextMenu(event, file)}
                                onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                                onDragStart={(event) => startMediaDrag(event, file)}
                                onDragEnd={clearMediaDrag}
                                selectionMode={isTouchRemote && touchSelectionMode}
                                singleTapOpen={isTouchRemote && !touchSelectionMode}
                                showContextButton={isTouchRemote}
                                onSelectionPointerDown={beginTouchSelectionDrag}
                                onSelectionPointerEnter={extendTouchSelectionDrag}
                                onSelectionPointerUp={endTouchSelectionDrag}
                              />
                            );
                          })}
                        </div>
                        {canExpand || canCollapse ? (
                          <div className="flex gap-2">
                            {canExpand ? (
                              <button
                                type="button"
                                disabled={group.loadingMore === true}
                                onClick={() => void expandFolderPreview(group.folder.path)}
                                className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded border border-white/10 bg-zinc-900/40 px-3 text-xs text-zinc-300 hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                              >
                                {group.loadingMore ? <Loader2 size={14} className="shrink-0 animate-spin" /> : null}
                                <span className="truncate">
                                  {group.loadingMore
                                    ? `Loading ${folderName}`
                                    : expansionLevel <= 0
                                      ? `Show more from ${folderName}`
                                      : `Load all from ${folderName}`}
                                </span>
                              </button>
                            ) : null}
                            {canCollapse ? (
                              <button
                                type="button"
                                disabled={group.loadingMore === true}
                                onClick={() => collapseFolderPreview(group.folder.path)}
                                className="flex h-9 items-center justify-center gap-2 rounded border border-white/10 bg-zinc-950/45 px-3 text-xs text-zinc-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                                title={`Collapse ${folderName}`}
                              >
                                <ChevronDown size={14} className="rotate-180" />
                                Collapse
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : childFolderCount > 0 ? (
                      <div className="rounded border border-white/10 bg-zinc-950/35 px-3 py-2 text-xs text-zinc-500">
                        Showing nested folder previews below
                      </div>
                    ) : (
                      <div className="rounded border border-white/10 bg-zinc-950/45 px-3 py-2 text-xs text-zinc-500">No media in this folder</div>
                    )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div
                className="relative"
                style={{ height: rowVirtualizer.getTotalSize() }}
                data-umbra-virtualized-gallery-grid
              >
                {virtualRows.map((virtualRow) => {
                  const rowIndex = virtualRow.index;
                  const start = rowIndex * columnCount;
                  const rowFiles = displayFiles.slice(start, start + columnCount);
                  const rowKey = rowFiles
                    .map((file) => fileId(file) || normalizePath(file.path))
                    .join('|');
                  return (
                    <div
                      key={`${rowIndex}:${rowKey || virtualRow.key}`}
                      className="absolute left-0 right-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${cardSize}px))`,
                        gap: GRID_GAP,
                        height: cardHeight,
                        transform: `translateY(${virtualRow.start}px)`,
                        justifyContent: isPhoneRemote ? 'center' : undefined,
                      }}
                    >
                      {rowFiles.map((file) => {
                        const id = fileId(file);
                        const path = normalizePath(file.path);
                        const selected = selectedPathKeys.has(selectionPathKey(path));
                        const metadataMatch = metadataMatchByPath.get(path.toLowerCase());
                        const prioritizeThumbnail = rowIndex <= 1;
                        return (
                          <GalleryImageTile
                            key={id}
                            file={file}
                            selected={selected}
                            contextTargeted={pathsEqual(path, reorderContextTargetPath)}
                            restoredHighlighted={restoredHighlightPaths.has(path.toLowerCase())}
                            metadataHighlighted={Boolean(metadataMatch)}
                            metadataSnippet={metadataMatch?.snippet || ''}
                            prioritize={prioritizeThumbnail}
                            cardSize={cardSize}
                            cardHeight={cardHeight}
                            onSelect={(event) => selectFile(file, event)}
                            onOpen={() => openFile(file)}
                            onContextMenu={(event) => openMediaContextMenu(event, file)}
                            onLongPressContextMenu={(point) => openMediaContextMenu(galleryPointToContextEvent(point), file)}
                            onDragStart={(event) => startMediaDrag(event, file)}
                            onDragEnd={clearMediaDrag}
                            selectionMode={isTouchRemote && touchSelectionMode}
                            singleTapOpen={isTouchRemote && !touchSelectionMode}
                            showContextButton={isTouchRemote}
                            onSelectionPointerDown={beginTouchSelectionDrag}
                            onSelectionPointerEnter={extendTouchSelectionDrag}
                            onSelectionPointerUp={endTouchSelectionDrag}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {viewerFile ? (
        <GalleryMediaViewer
          file={viewerFile}
          files={viewerFilesForRender}
          totalCount={globalSearchActive || folderPreviewMode ? viewerFilesForRender.length : total}
          remoteMode={remoteMode}
          selectedCount={viewerSelectionCount}
          loadingMore={loading}
          canLoadMore={!done && nextCursor != null}
          remoteViewerOriginals={remoteViewerOriginals}
          onClose={closeViewer}
          onStep={stepViewer}
          onReveal={revealViewerSelection}
          onCopyPath={copyViewerPaths}
          onSendScanner={sendViewerToScanner}
          onSendWaifu={sendViewerToWaifu}
          onSendUmbra={sendViewerToUmbra}
          onDelete={deleteViewerSelection}
        />
      ) : null}
      {renameModal ? (
        <GalleryRenameModal
          state={renameModal}
          preview={renamePreview}
          onTemplateChange={(template) => setRenameModal((current) => current ? { ...current, template } : current)}
          onCancel={() => setRenameModal(null)}
          onSubmit={() => void submitRenameModal()}
        />
      ) : null}
      {tagModal ? (
        <GalleryTagModal
          state={tagModal}
          onChange={(next) => setTagModal(next)}
          onCancel={() => setTagModal(null)}
          onSubmit={() => void submitTagModal()}
        />
      ) : null}
      {folderNameModal ? (
        <GalleryFolderNameModal
          state={folderNameModal}
          onChange={(next) => setFolderNameModal(next)}
          onCancel={() => setFolderNameModal(null)}
          onSubmit={() => void submitFolderNameModal()}
        />
      ) : null}
      {deleteWarningModal ? (
        <GalleryDeleteWarningModal
          state={deleteWarningModal}
          onCancel={() => setDeleteWarningModal(null)}
          onConfirm={() => {
            const pending = deleteWarningModal;
            setDeleteWarningModal(null);
            executeMovePathsToTrash(pending.paths, { keepSelection: pending.keepSelection });
          }}
        />
      ) : null}
      {emptyFolderCleanupModal ? (
        <GalleryEmptyFolderCleanupModal
          state={emptyFolderCleanupModal}
          onCancel={() => {
            if (!emptyFolderCleanupModal.submitting) setEmptyFolderCleanupModal(null);
          }}
          onConfirm={() => void confirmEmptyFolderCleanup()}
        />
      ) : null}
      <ContextMenu
        isOpen={Boolean(contextMenu)}
        position={{ x: contextMenu?.x || 0, y: contextMenu?.y || 0 }}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
        boundarySelector="[data-umbra-react-gallery-root]"
      />
      <GalleryDatasetTargetPicker
        state={datasetPicker}
        datasets={datasetTargets}
        loading={datasetTargetsLoading}
        onClose={() => setDatasetPicker(null)}
        onRefresh={() => void refreshDatasetTargets()}
        onSelect={(dataset, concept) => {
          const paths = datasetPicker?.paths || [];
          setDatasetPicker(null);
          void importPathsToDatasetConcept(paths, dataset, concept);
        }}
      />
    </section>
  );
}

export default ReactGalleryWorkspace;
