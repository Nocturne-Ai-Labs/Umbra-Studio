'use client';

import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Move,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { useToastStore } from '@/store/useToastStore';
import { useStore } from '@/store/useStore';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

type SourceTab = 'local' | 'civitai' | 'browser';
type LocalRootKey = 'user' | 'comfyui' | 'aitoolkit';

type ModelRoot = {
  key: LocalRootKey;
  label: string;
  path: string;
  fullPath: string;
  exists?: boolean;
  folderCount?: number;
  fileCount?: number;
};

type TreeFolderEntry = {
  name: string;
  path: string;
  hasChildren: boolean;
};

type TreeNodeState = {
  loading: boolean;
  loaded: boolean;
  folders: TreeFolderEntry[];
  error?: string;
};

type ListFolderEntry = {
  name: string;
  path: string;
  folderCount: number;
  fileCount: number;
};

type ListFileEntry = {
  name: string;
  path: string;
  size: number;
  modifiedMs: number;
  extension: string;
  modelType: string;
  snapshot?: ModelSnapshotSummary;
};

type ModelSnapshotSummary = {
  source?: string;
  capturedAt?: number;
  modelId?: number;
  modelName?: string;
  creator?: string;
  description?: string;
  tags?: string[];
  trainedWords?: string[];
  baseModel?: string;
  sourceUrl?: string;
  previewImageUrl?: string;
  thumbnailPath?: string;
  workflow?: unknown;
  metadata?: unknown;
  localInspection?: {
    reportPath?: string;
    capturedAt?: number;
    summary?: {
      settings?: Record<string, unknown>;
      training?: Record<string, unknown>;
      base?: Record<string, unknown>;
      triggerWords?: string[];
      rawKeyCount?: number;
    };
  } | null;
  raw?: unknown;
};

type ModelUpdateInfo = {
  status: 'available' | 'current' | 'unknown';
  checkedAt: number;
  modelId: number;
  currentVersionId: number;
  currentVersionName: string;
  latestVersionId: number;
  latestVersionName: string;
  model?: CivitAIModel;
  version?: CivitAIVersion;
  versions?: CivitAIVersion[];
  file?: CivitAIFile;
  error?: string;
};

type ModelUpdateProgress = {
  active: boolean;
  phase: 'idle' | 'scanning' | 'checking' | 'done' | 'cancelled' | 'error';
  done: number;
  total: number;
  available: number;
  message: string;
};

type ListPayload = {
  path: string;
  folders: ListFolderEntry[];
  files: ListFileEntry[];
  counts?: {
    folders: number;
    files: number;
  };
};

type CivitAIFile = {
  name: string;
  sizeKB: number;
  downloadUrl: string;
  primary?: boolean;
  type?: string;
};

type CivitAIImage = {
  url: string;
  nsfw?: boolean;
  nsfwLevel?: number;
  width?: number;
  height?: number;
  type?: string;
  meta?: Record<string, unknown> | null;
};

type CivitAIVersion = {
  id: number;
  name: string;
  description?: string;
  baseModel?: string;
  trainedWords?: string[];
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  files: CivitAIFile[];
  images?: CivitAIImage[];
};

type CivitAIModel = {
  id: number;
  name: string;
  type: string;
  description?: string;
  nsfw?: boolean;
  tags?: string[];
  creator?: { username?: string; image?: string | null };
  stats?: {
    downloadCount?: number;
    favoriteCount?: number;
    commentCount?: number;
    ratingCount?: number;
    rating?: number;
  };
  modelVersions?: CivitAIVersion[];
  communityMedia?: CivitAIImage[];
  __placeholder?: boolean;
};

type OpenedModelsPayload = {
  openedModelIds?: unknown;
  civitaiClipboard?: unknown;
  model?: unknown;
  removedModelId?: unknown;
};

type CivitAIAuthStatus = {
  hasToken: boolean;
  maskedToken?: string;
};

type BrowserBookmarkItem = {
  id: string;
  type: 'link' | 'folder';
  label: string;
  url?: string;
  children?: BrowserBookmarkItem[];
};

type BrowserHistoryEntry = {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
};

type BrowserDownload = {
  id: string;
  url: string;
  fileName: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: 'progressing' | 'interrupted' | 'completed' | 'cancelled' | string;
  startedAt: number;
  endedAt: number | null;
  error: string | null;
};

type BrowserContextMenu = {
  open: boolean;
  x: number;
  y: number;
  linkUrl: string;
  srcUrl: string;
  mediaType: string;
  selectionText: string;
  isEditable: boolean;
};

type DownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

type DownloadJob = {
  jobId: string;
  status: DownloadJobStatus;
  fileName: string;
  modelType: string;
  destinationPath: string;
  bytesTotal: number;
  bytesDownloaded: number;
  progress: number;
  error?: string;
};

type LocalTransferMode = 'copy' | 'move';
type LocalTransferStatus = 'running' | 'completed' | 'failed';

type LocalTransferJob = {
  id?: string;
  jobId: string;
  mode: LocalTransferMode;
  status: LocalTransferStatus;
  destination: string;
  totalPaths: number;
  totalUnits: number;
  completedUnits: number;
  percent: number;
  currentPath: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  selectedPaths: string[];
  isFolder: boolean;
  targetPath: string;
} | null;
type DropActionMenuState = {
  x: number;
  y: number;
  destinationPath: string;
  sourcePaths: string[];
} | null;

type LocalListEntry =
  | ({ kind: 'folder' } & ListFolderEntry)
  | ({ kind: 'file' } & ListFileEntry);

type LocalActionDialogMode = 'mkdir' | 'rename' | 'copy' | 'move' | 'delete';

type LocalActionDialogState = {
  mode: LocalActionDialogMode;
  title: string;
  description: string;
  submitLabel: string;
  value: string;
  placeholder?: string;
  targetPaths: string[];
  targetPath?: string;
} | null;

const ROOT_ORDER: LocalRootKey[] = ['user', 'comfyui', 'aitoolkit'];
const MODEL_TREE_REQUEST_TIMEOUT_MS = 15000;
const MODEL_MANAGER_UPDATE_TIMEOUT_MS = 30000;
const MODEL_MANAGER_RECURSIVE_UPDATE_TIMEOUT_MS = 120000;
const MODEL_MANAGER_DETAIL_TIMEOUT_MS = 20000;
const MODEL_MANAGER_LIST_TIMEOUT_MS = 10000;
const MODEL_MANAGER_RECURSIVE_LIST_TIMEOUT_MS = 60000;
const CIVITAI_BROWSER_SITES = {
  pg: 'https://civitai.com',
  all: 'https://civitai.red',
} as const;
type CivitaiBrowserSite = keyof typeof CIVITAI_BROWSER_SITES;

const MODEL_MANAGER_BROWSER_BOOKMARK_STORAGE_KEY = 'umbra.modelManager.browser.bookmarks.v1';
const MODEL_MANAGER_BROWSER_HISTORY_STORAGE_KEY = 'umbra.modelManager.browser.history.v1';
const MODEL_MANAGER_BROWSER_MAX_HISTORY_ENTRIES = 500;
const CIVITAI_DISCOVERY_TYPES = [
  { value: 'Checkpoint', label: 'Checkpoint' },
  { value: 'LORA', label: 'LoRA' },
  { value: 'LoCon', label: 'LoCon' },
  { value: 'DoRA', label: 'DoRA' },
  { value: 'TextualInversion', label: 'Textual Inversion' },
  { value: 'Controlnet', label: 'ControlNet' },
  { value: 'VAE', label: 'VAE' },
  { value: 'Upscaler', label: 'Upscaler' },
] as const;
const CIVITAI_DISCOVERY_SORTS = ['Highest Rated', 'Most Downloaded', 'Newest', 'Most Comments'] as const;
const CIVITAI_DISCOVERY_PERIODS = ['AllTime', 'Year', 'Month', 'Week', 'Day'] as const;
const CIVITAI_DISCOVERY_BASE_MODELS = ['All', 'SD 1.5', 'SDXL 1.0', 'Pony', 'Flux.1 D', 'SD 2.1'] as const;

const CIVITAI_TYPE_GROUP_ORDER = [
  'Checkpoints',
  'LoRA',
  'LyCORIS',
  'Textual Inversion',
  'ControlNet',
  'VAE',
  'Upscalers',
  'Workflows',
  'Other',
] as const;

function getCivitaiTypeGroup(typeValue: string): (typeof CIVITAI_TYPE_GROUP_ORDER)[number] {
  const type = String(typeValue || '').trim().toLowerCase();
  if (!type) return 'Other';
  if (type.includes('checkpoint')) return 'Checkpoints';
  if (type.includes('lora') || type.includes('locon') || type.includes('dora')) return 'LoRA';
  if (type.includes('lycoris') || type.includes('lyrcoris')) return 'LyCORIS';
  if (type.includes('textualinversion') || type.includes('textual inversion') || type.includes('embedding')) return 'Textual Inversion';
  if (type.includes('controlnet')) return 'ControlNet';
  if (type.includes('vae')) return 'VAE';
  if (type.includes('upscaler')) return 'Upscalers';
  if (type.includes('workflow')) return 'Workflows';
  return 'Other';
}

function normalizePath(input: string): string {
  return String(input || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = normalizePath(parentPath);
  const child = normalizePath(childPath);
  if (!parent || !child) return false;
  return child === parent || child.startsWith(`${parent}/`);
}

function joinClientPath(basePath: string, name: string): string {
  const base = normalizePath(basePath);
  const child = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!base) return child;
  if (!child) return base;
  return `${base}/${child}`;
}

function getClientParentPath(pathValue: string): string {
  const path = normalizePath(pathValue);
  if (!path || !path.includes('/')) return '';
  return path.slice(0, path.lastIndexOf('/'));
}

function formatBytes(bytes: number): string {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatFolderSummary(entry: Pick<ListFolderEntry, 'folderCount' | 'fileCount'>): string {
  const folderCount = Number(entry.folderCount);
  const fileCount = Number(entry.fileCount);
  if (!Number.isFinite(folderCount) || !Number.isFinite(fileCount) || folderCount < 0 || fileCount < 0) {
    return 'Folder';
  }
  return `${folderCount} dir | ${fileCount} files`;
}

function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '-';
  }
}

function formatCompactNumber(value: number | undefined): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.floor(n));
}

function decodeHtmlEntities(input: string): string {
  const text = String(input || '');
  if (!text) return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      if (!Number.isFinite(n)) return _;
      try {
        return String.fromCharCode(n);
      } catch {
        return _;
      }
    });
}

function normalizeDescriptionText(input: string): string {
  const decoded = decodeHtmlEntities(String(input || ''));
  const withoutHtml = decoded.replace(/<[^>]+>/g, ' ');
  const noMarkdownLinks = withoutHtml.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  const noImageLinks = noMarkdownLinks.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');
  const noCodeFences = noImageLinks
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1');
  const cleaned = noCodeFences
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned;
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeRichHtml(input: string): string {
  let html = String(input || '');
  if (!html) return '';

  html = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');

  return html.trim();
}

function toRichDescriptionHtml(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const decoded = decodeHtmlEntities(raw);
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(decoded);
  if (hasHtml) return sanitizeRichHtml(decoded);
  return escapeHtml(decoded)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '<br/>');
}

function isLikelyNsfw(model: CivitAIModel, image?: CivitAIImage): boolean {
  if (image) {
    if (image.nsfw === true) return true;
    if (Number(image.nsfwLevel || 0) > 0) return true;
  }
  return model.nsfw === true;
}

function isVideoMedia(image?: CivitAIImage | null): boolean {
  if (!image?.url) return false;
  const typeHint = String(image.type || '').toLowerCase();
  if (typeHint.includes('video')) return true;
  const lower = String(image.url).toLowerCase();
  return (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.m4v') ||
    lower.includes('.avi')
  );
}

function getModelPreviewImage(model: CivitAIModel): CivitAIImage | null {
  const versions = Array.isArray(model.modelVersions) ? model.modelVersions : [];
  for (const version of versions) {
    const images = Array.isArray(version.images) ? version.images : [];
    if (images.length > 0) return images[0];
  }
  return null;
}

function capModelUploadMedia(input: CivitAIModel, maxImages = 5): CivitAIModel {
  let remaining = Math.max(0, Math.floor(Number(maxImages) || 0));
  const versions = Array.isArray(input.modelVersions) ? input.modelVersions : [];
  const cappedVersions = versions.map((version) => {
    const images = Array.isArray(version.images) ? version.images : [];
    const keep = Math.max(0, remaining);
    const trimmed = images.slice(0, keep);
    remaining -= trimmed.length;
    return {
      ...version,
      images: trimmed,
    };
  });
  return {
    ...input,
    modelVersions: cappedVersions,
    communityMedia: [],
  };
}

function parseCivitaiModelId(input: string): number | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const direct = Number(raw);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }

  const tryExtract = (value: string): number | null => {
    const modelPathMatch = value.match(/\/models\/(\d+)(?:\/|$|\?)/i);
    if (modelPathMatch && modelPathMatch[1]) {
      const parsed = Number(modelPathMatch[1]);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    const apiPathMatch = value.match(/\/api\/v1\/models\/(\d+)(?:\/|$|\?)/i);
    if (apiPathMatch && apiPathMatch[1]) {
      const parsed = Number(apiPathMatch[1]);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const directMatch = tryExtract(raw);
  if (directMatch) return directMatch;

  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    const queryModelId = Number(url.searchParams.get('modelId') || '');
    if (Number.isFinite(queryModelId) && queryModelId > 0) return queryModelId;
    const urlMatch = tryExtract(url.pathname + url.search);
    if (urlMatch) return urlMatch;
  } catch {
    // Ignore parse errors and return null.
  }
  return null;
}

function normalizeCivitaiBrowserUrl(input: string, site: CivitaiBrowserSite): string {
  const raw = String(input || '').trim();
  const fallback = CIVITAI_BROWSER_SITES[site] || CIVITAI_BROWSER_SITES.pg;
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return `${fallback}/models/${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${fallback}${raw}`;
  return `${fallback}/${raw.replace(/^\/+/, '')}`;
}

function titleFromBrowserUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '') || url;
  } catch {
    return url || 'CivitAI';
  }
}

function fileNameFromBrowserUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const leaf = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(leaf) || 'download';
  } catch {
    return 'download';
  }
}

function normalizeBrowserBookmarkItem(entry: any): BrowserBookmarkItem | null {
  const type = entry?.type === 'folder' ? 'folder' : 'link';
  const id = String(entry?.id || `${type}-${Math.random().toString(36).slice(2, 8)}`);
  const label = String(entry?.label || '').trim();
  if (!label) return null;
  if (type === 'folder') {
    const children = Array.isArray(entry?.children)
      ? entry.children.map(normalizeBrowserBookmarkItem).filter(Boolean) as BrowserBookmarkItem[]
      : [];
    return { id, type, label, children };
  }
  const rawUrl = String(entry?.url || '').trim();
  if (!rawUrl) return null;
  return { id, type: 'link', label, url: normalizeCivitaiBrowserUrl(rawUrl, 'pg') };
}

function loadModelManagerBrowserBookmarks(): BrowserBookmarkItem[] {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(MODEL_MANAGER_BROWSER_BOOKMARK_STORAGE_KEY);
  } catch {
    // Legacy cleanup only.
  }
  return [];
}

function removeBrowserBookmarkItem(items: BrowserBookmarkItem[], id: string): BrowserBookmarkItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) => item.type === 'folder'
      ? { ...item, children: removeBrowserBookmarkItem(item.children || [], id) }
      : item);
}

function loadModelManagerBrowserHistory(): BrowserHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    window.localStorage.removeItem(MODEL_MANAGER_BROWSER_HISTORY_STORAGE_KEY);
  } catch {
    // Legacy cleanup only.
  }
  return [];
}

function getModelMediaSrc(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    return `/api/model-manager/media?url=${encodeURIComponent(value)}`;
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('User/') || value.startsWith('Tools/')) {
    return `/api/fs/image?path=${encodeURIComponent(value)}`;
  }
  return value;
}

function getModelThumbnailSrc(snapshot?: ModelSnapshotSummary | null): string {
  if (!snapshot) return '';
  const localPath = String(snapshot.thumbnailPath || '').trim();
  if (localPath) {
    return `/api/fs/thumbnail?path=${encodeURIComponent(localPath)}&size=small&q=92&rev=model-thumb-v1`;
  }
  const previewUrl = String(snapshot.previewImageUrl || '').trim();
  if (!previewUrl) return '';
  if (/^https?:\/\//i.test(previewUrl)) {
    return `/api/model-manager/media?url=${encodeURIComponent(previewUrl)}&thumb=1&size=320`;
  }
  return getModelMediaSrc(previewUrl);
}

function normalizeClipboardModel(input: unknown): CivitAIModel | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const id = Number(candidate.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const normalized = {
    ...candidate,
    id: Math.floor(id),
  } as CivitAIModel;
  return capModelUploadMedia(normalized, 5);
}

function normalizeClipboardModels(input: unknown): CivitAIModel[] {
  if (!Array.isArray(input)) return [];
  const normalized: CivitAIModel[] = [];
  const seen = new Set<number>();
  for (const raw of input) {
    const model = normalizeClipboardModel(raw);
    if (!model) continue;
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    normalized.push(model);
  }
  return normalized;
}

function normalizeOpenedModelIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const raw of input) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) continue;
    const value = Math.floor(id);
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function pickSnapshotVersionId(snapshot?: ModelSnapshotSummary | null): number {
  if (!snapshot) return 0;
  const raw = toRecord(snapshot.raw);
  const version = toRecord(raw.version);
  const file = toRecord(raw.file);
  return pickNumber(version.id)
    || pickNumber(raw.versionId)
    || pickNumber(raw.modelVersionId)
    || pickNumber(file.modelVersionId);
}

function pickSnapshotVersionName(snapshot?: ModelSnapshotSummary | null): string {
  if (!snapshot) return '';
  const raw = toRecord(snapshot.raw);
  const version = toRecord(raw.version);
  return String(version.name || raw.versionName || '').trim();
}

function getSnapshotCivitaiUrl(snapshot?: ModelSnapshotSummary | null): string {
  if (!snapshot) return '';
  const directUrl = String(snapshot.sourceUrl || '').trim();
  if (/^https:\/\/(?:www\.)?civitai\.com\/models\/\d+/i.test(directUrl)) return directUrl;

  const raw = toRecord(snapshot.raw);
  const rawModelPageUrl = String(raw.modelPageUrl || '').trim();
  if (/^https:\/\/(?:www\.)?civitai\.com\/models\/\d+/i.test(rawModelPageUrl)) return rawModelPageUrl;

  const modelId = pickNumber(snapshot.modelId) || pickNumber(toRecord(raw.model).id) || pickNumber(toRecord(raw.version).modelId);
  if (!modelId) return '';
  const versionId = pickSnapshotVersionId(snapshot);
  return `https://civitai.com/models/${modelId}${versionId ? `?modelVersionId=${versionId}` : ''}`;
}

function getSortedModelVersions(model?: CivitAIModel | null): CivitAIVersion[] {
  const versions = Array.isArray(model?.modelVersions) ? model.modelVersions : [];
  const candidates = versions.filter((version) => Number.isFinite(Number(version?.id)) && Number(version.id) > 0);
  if (candidates.length <= 0) return [];
  const versionTime = (version: CivitAIVersion) => {
    const raw = String(version.publishedAt || version.createdAt || version.updatedAt || '').trim();
    const parsed = raw ? Date.parse(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...candidates].sort((a, b) => {
    const timeDelta = versionTime(b) - versionTime(a);
    if (timeDelta !== 0) return timeDelta;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function getLatestModelVersion(model?: CivitAIModel | null): CivitAIVersion | null {
  return getSortedModelVersions(model)[0] || null;
}

function getModelVersionDate(version?: CivitAIVersion | null): string {
  return String(version?.publishedAt || version?.createdAt || version?.updatedAt || '').trim();
}

function formatModelVersionDate(version?: CivitAIVersion | null): string {
  const raw = getModelVersionDate(version);
  const parsed = raw ? Date.parse(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? formatDateTime(parsed) : 'Unknown upload date';
}

function getDownloadableModelFile(version?: CivitAIVersion | null): CivitAIFile | null {
  const files = Array.isArray(version?.files) ? version.files : [];
  return files.find((file) => file.primary === true && String(file.downloadUrl || '').trim())
    || files.find((file) => String(file.downloadUrl || '').trim())
    || null;
}

function parsePossibleJson(value: unknown): unknown | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseInfotextMetadata(input: unknown): Record<string, unknown> {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return {};

  const normalized = text.replace(/\r/g, '');
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const result: Record<string, unknown> = {};

  const negativeIndex = lines.findIndex((line) => /^negative prompt:/i.test(line));
  if (negativeIndex >= 0) {
    const positiveLines = lines.slice(0, negativeIndex);
    if (positiveLines.length > 0) result.prompt = positiveLines.join('\n').trim();

    const negativeLine = lines[negativeIndex] || '';
    const negativeRest = negativeLine.replace(/^negative prompt:\s*/i, '').trim();
    const trailingLines = lines.slice(negativeIndex + 1);
    const paramStart = trailingLines.findIndex((line) => /\bsteps\s*:/i.test(line));
    if (paramStart >= 0) {
      const negativeLines = [negativeRest, ...trailingLines.slice(0, paramStart)].filter(Boolean);
      if (negativeLines.length > 0) result.negativePrompt = negativeLines.join('\n').trim();
      const paramText = trailingLines.slice(paramStart).join(' ');
      if (paramText.trim()) result.__paramText = paramText.trim();
    } else if (negativeRest) {
      result.negativePrompt = negativeRest;
    }
  } else if (lines.length > 0) {
    const stepsLineIndex = lines.findIndex((line) => /\bsteps\s*:/i.test(line));
    if (stepsLineIndex > 0) {
      result.prompt = lines.slice(0, stepsLineIndex).join('\n').trim();
      result.__paramText = lines.slice(stepsLineIndex).join(' ').trim();
    } else {
      result.prompt = lines.join('\n').trim();
    }
  }

  const paramText = typeof result.__paramText === 'string'
    ? String(result.__paramText)
    : lines.find((line) => /\bsteps\s*:/i.test(line)) || '';
  if (paramText) {
    const regex = /([A-Za-z][A-Za-z0-9 _/().+-]*?):\s*([^,]+)(?=,\s*[A-Za-z][A-Za-z0-9 _/().+-]*?:|$)/g;
    let match: RegExpExecArray | null = regex.exec(paramText);
    while (match) {
      const key = String(match[1] || '').trim();
      const value = String(match[2] || '').trim();
      if (key && value && !Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = value;
      }
      match = regex.exec(paramText);
    }
  }

  if (!result.cfgScale) {
    const cfg = result['CFG scale'] ?? result['CFG Scale'] ?? result['cfg scale'] ?? result['CFG'];
    if (cfg != null) result.cfgScale = cfg;
  }
  if (!result.steps && result.Steps != null) result.steps = result.Steps;
  if (!result.seed && result.Seed != null) result.seed = result.Seed;
  if (!result.sampler) {
    const sampler = result.Sampler ?? result['Sampler name'] ?? result['sampler_name'];
    if (sampler != null) result.sampler = sampler;
  }
  if (!result.resolution) {
    const resolution = result.Size ?? result.size ?? result.Resolution;
    if (resolution != null) result.resolution = resolution;
  }

  delete result.__paramText;
  return result;
}

function extractMediaMeta(image?: CivitAIImage | null): Record<string, unknown> {
  if (!image) return {};
  const imageRecord = toRecord(image as unknown);
  const merged: Record<string, unknown> = {};

  const mergeFrom = (value: unknown) => {
    const parsed = parsePossibleJson(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.assign(merged, parsed as Record<string, unknown>);
      return;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(merged, value as Record<string, unknown>);
    }
  };

  mergeFrom(imageRecord.meta);
  mergeFrom(imageRecord.metadata);
  mergeFrom(imageRecord.generationData);
  mergeFrom(imageRecord.generation_data);
  mergeFrom(imageRecord.params);
  mergeFrom(imageRecord.parameters);

  const textCandidates = [
    imageRecord.infotext,
    imageRecord.generationParameters,
    imageRecord.generation_parameters,
    imageRecord.promptText,
    imageRecord.prompt,
    imageRecord.parameters,
  ];
  for (const candidate of textCandidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const parsed = parseInfotextMetadata(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (merged[key] == null || merged[key] === '') merged[key] = value;
    }
  }

  const passthroughKeys = [
    'prompt',
    'negativePrompt',
    'cfgScale',
    'steps',
    'seed',
    'sampler',
    'workflow',
    'Workflow',
    'comfyWorkflow',
    'comfyuiWorkflow',
  ];
  for (const key of passthroughKeys) {
    const value = imageRecord[key];
    if ((merged[key] == null || merged[key] === '') && value != null) merged[key] = value;
  }

  return merged;
}

function getMediaWorkflowPayload(meta: Record<string, unknown>): unknown | null {
  const workflowCandidates = [
    'workflow',
    'Workflow',
    'comfyWorkflow',
    'ComfyWorkflow',
    'comfyuiWorkflow',
    'ComfyUIWorkflow',
    'comfyui_prompt',
    'comfy_prompt',
  ];
  for (const key of workflowCandidates) {
    const raw = meta[key];
    const parsed = parsePossibleJson(raw);
    if (parsed != null) return parsed;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  timeoutMessage = 'Request timed out',
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetchJson<T>(url, {
      ...(init || {}),
      signal: controller.signal,
    });
  } catch (error: any) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ModelManagerWorkspace() {
  const addToast = useToastStore((state) => state.addToast);
  const nsfwThumbnailBlurEnabled = useStore((state) => state.appSettings['ui.nsfwThumbnailBlurEnabled'] === true);
  const nsfwThumbnailBlurIntensity = useStore((state) => {
    const raw = Number(state.appSettings['ui.nsfwThumbnailBlurIntensity'] ?? 85);
    if (!Number.isFinite(raw)) return 85;
    return Math.min(100, Math.max(0, Math.round(raw)));
  });

  const [sourceTab, setSourceTab] = React.useState<SourceTab>('local');
  const [browserSite, setBrowserSite] = React.useState<CivitaiBrowserSite>('pg');
  const [browserUrl, setBrowserUrl] = React.useState(CIVITAI_BROWSER_SITES.pg);
  const [browserAddressInput, setBrowserAddressInput] = React.useState(CIVITAI_BROWSER_SITES.pg);
  const [browserLoading, setBrowserLoading] = React.useState(false);
  const [browserWebviewKey, setBrowserWebviewKey] = React.useState(0);
  const [browserBookmarks, setBrowserBookmarks] = React.useState<BrowserBookmarkItem[]>(loadModelManagerBrowserBookmarks);
  const [browserOpenBookmarkFolderId, setBrowserOpenBookmarkFolderId] = React.useState<string | null>(null);
  const [browserHistory, setBrowserHistory] = React.useState<BrowserHistoryEntry[]>(loadModelManagerBrowserHistory);
  const [browserHistoryOpen, setBrowserHistoryOpen] = React.useState(false);
  const [browserDownloads, setBrowserDownloads] = React.useState<BrowserDownload[]>([]);
  const [browserDownloadsOpen, setBrowserDownloadsOpen] = React.useState(false);
  const [civitaiDiscoveryQuery, setCivitaiDiscoveryQuery] = React.useState('');
  const [civitaiDiscoveryTypes, setCivitaiDiscoveryTypes] = React.useState<string[]>(['Checkpoint']);
  const [civitaiDiscoverySort, setCivitaiDiscoverySort] = React.useState('Highest Rated');
  const [civitaiDiscoveryPeriod, setCivitaiDiscoveryPeriod] = React.useState('AllTime');
  const [civitaiDiscoveryBaseModel, setCivitaiDiscoveryBaseModel] = React.useState('All');
  const [civitaiDiscoveryPage, setCivitaiDiscoveryPage] = React.useState(1);
  const [civitaiDiscoveryHasMore, setCivitaiDiscoveryHasMore] = React.useState(false);
  const [civitaiDiscoveryLoading, setCivitaiDiscoveryLoading] = React.useState(false);
  const [civitaiDiscoveryWarning, setCivitaiDiscoveryWarning] = React.useState('');
  const [browserContextMenu, setBrowserContextMenu] = React.useState<BrowserContextMenu>({
    open: false,
    x: 0,
    y: 0,
    linkUrl: '',
    srcUrl: '',
    mediaType: '',
    selectionText: '',
    isEditable: false,
  });
  const [localRootKey, setLocalRootKey] = React.useState<LocalRootKey>('user');
  const [roots, setRoots] = React.useState<ModelRoot[]>([]);
  const [rootsLoading, setRootsLoading] = React.useState(false);
  const [treeByPath, setTreeByPath] = React.useState<Record<string, TreeNodeState>>({});
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const [currentFolderPath, setCurrentFolderPath] = React.useState('');
  const [localList, setLocalList] = React.useState<ListPayload>({
    path: '',
    folders: [],
    files: [],
    counts: { folders: 0, files: 0 },
  });
  const [localFilterQuery, setLocalFilterQuery] = React.useState('');
  const [localLoading, setLocalLoading] = React.useState(false);
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(new Set());
  const [selectionAnchorPath, setSelectionAnchorPath] = React.useState('');
  const [localInfoPanelClosed, setLocalInfoPanelClosed] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [dropActionMenu, setDropActionMenu] = React.useState<DropActionMenuState>(null);
  const [actionDialog, setActionDialog] = React.useState<LocalActionDialogState>(null);
  const [draggingPaths, setDraggingPaths] = React.useState<string[]>([]);
  const [dropTargetPath, setDropTargetPath] = React.useState('');

  const [civitaiLinkInput, setCivitaiLinkInput] = React.useState('');
  const [civitaiModels, setCivitaiModels] = React.useState<CivitAIModel[]>([]);
  const [civitaiDetails, setCivitaiDetails] = React.useState<Record<number, CivitAIModel>>({});
  const [civitaiAuthStatus, setCivitaiAuthStatus] = React.useState<CivitAIAuthStatus>({ hasToken: false });
  const [civitaiTokenInput, setCivitaiTokenInput] = React.useState('');
  const [civitaiAuthSaving, setCivitaiAuthSaving] = React.useState(false);
  const [civitaiAuthRevision, setCivitaiAuthRevision] = React.useState(0);
  const [downloadJobs, setDownloadJobs] = React.useState<Record<string, DownloadJob>>({});
  const [localTransferJobs, setLocalTransferJobs] = React.useState<Record<string, LocalTransferJob>>({});
  const [savedOpenedModelIds, setSavedOpenedModelIds] = React.useState<number[]>([]);
  const [civitaiModelAction, setCivitaiModelAction] = React.useState<{ id: number; kind: 'refresh' | 'delete' } | null>(null);
  const [modelUpdateByPath, setModelUpdateByPath] = React.useState<Record<string, ModelUpdateInfo>>({});
  const [checkingModelUpdates, setCheckingModelUpdates] = React.useState(false);
  const [modelUpdateProgress, setModelUpdateProgress] = React.useState<ModelUpdateProgress>({
    active: false,
    phase: 'idle',
    done: 0,
    total: 0,
    available: 0,
    message: '',
  });
  const [modelUpdateDropdownOpen, setModelUpdateDropdownOpen] = React.useState(false);
  const [modelVersionListOpen, setModelVersionListOpen] = React.useState(false);
  const [modelInspectingPath, setModelInspectingPath] = React.useState('');
  const [activeModelId, setActiveModelId] = React.useState<number | null>(null);
  const [activeModelImageUrl, setActiveModelImageUrl] = React.useState('');
  const [revealedNsfwMedia, setRevealedNsfwMedia] = React.useState<Set<string>>(new Set());

  const treeByPathRef = React.useRef<Record<string, TreeNodeState>>({});
  const treeRequestsRef = React.useRef<Map<string, { promise: Promise<void>; controller: AbortController }>>(new Map());
  const treeRequestTokenByPathRef = React.useRef<Map<string, number>>(new Map());
  const treeRequestSeqRef = React.useRef(0);
  const listAbortRef = React.useRef<AbortController | null>(null);
  const announcedTerminalJobsRef = React.useRef<Set<string>>(new Set());
  const announcedTerminalTransferJobsRef = React.useRef<Set<string>>(new Set());
  const civitaiDetailsRef = React.useRef<Record<number, CivitAIModel>>({});
  const browserWebviewRef = React.useRef<any>(null);
  const browserWebviewElementId = React.useId();
  const browserWebviewSupported = typeof window !== 'undefined' && Boolean((window as any).umbraDesktop);
  const detailRequestsRef = React.useRef<Map<number, Promise<CivitAIModel | null>>>(new Map());
  const modelUpdateRunRef = React.useRef(0);
  const modelUpdateCancelRef = React.useRef(false);
  const hydratedOpenedIdsRef = React.useRef<Set<number>>(new Set());
  const civitaiLinkInputRef = React.useRef<HTMLInputElement | null>(null);
  const civitaiTokenInputRef = React.useRef<HTMLInputElement | null>(null);
  const browserConfigHydratedRef = React.useRef(false);

  React.useEffect(() => {
    civitaiDetailsRef.current = civitaiDetails;
  }, [civitaiDetails]);

  React.useEffect(() => {
    treeByPathRef.current = treeByPath;
  }, [treeByPath]);

  React.useEffect(() => {
    let disposed = false;
    void readUserConfig<{
      bookmarks?: unknown;
      history?: unknown;
    }>('model-manager-browser', {}).then((config) => {
      if (disposed) return;
      const bookmarks = Array.isArray(config?.bookmarks)
        ? config.bookmarks.map(normalizeBrowserBookmarkItem).filter(Boolean) as BrowserBookmarkItem[]
        : [];
      const history = Array.isArray(config?.history)
        ? config.history
            .map((entry) => ({
              id: String((entry as any)?.id || `history-${Math.random().toString(36).slice(2, 8)}`),
              title: String((entry as any)?.title || '').trim(),
              url: normalizeCivitaiBrowserUrl(String((entry as any)?.url || '').trim(), 'pg'),
              visitedAt: Number((entry as any)?.visitedAt || 0),
            }))
            .filter((entry) => entry.url && Number.isFinite(entry.visitedAt))
            .sort((a, b) => b.visitedAt - a.visitedAt)
            .slice(0, MODEL_MANAGER_BROWSER_MAX_HISTORY_ENTRIES)
        : [];
      setBrowserBookmarks(bookmarks);
      setBrowserHistory(history);
      browserConfigHydratedRef.current = true;
    }).catch(() => {
      browserConfigHydratedRef.current = true;
    });
    return () => { disposed = true; };
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.removeItem(MODEL_MANAGER_BROWSER_BOOKMARK_STORAGE_KEY);
      window.localStorage.removeItem(MODEL_MANAGER_BROWSER_HISTORY_STORAGE_KEY);
    } catch {
      // Legacy cleanup only.
    }
    if (!browserConfigHydratedRef.current) return;
    void writeUserConfig('model-manager-browser', {
      bookmarks: browserBookmarks,
      history: browserHistory.slice(0, MODEL_MANAGER_BROWSER_MAX_HISTORY_ENTRIES),
    }).catch((error) => console.warn('[ModelManager] Failed to persist browser state:', error));
  }, [browserBookmarks, browserHistory]);

  React.useEffect(() => {
    let disposed = false;
    void (window as any).umbraDesktop?.getBrowserDownloads?.().then((items: BrowserDownload[]) => {
      if (!disposed && Array.isArray(items)) setBrowserDownloads(items);
    });
    const unsubscribe = (window as any).umbraDesktop?.onBrowserDownloads?.((items: BrowserDownload[]) => {
      if (Array.isArray(items)) setBrowserDownloads(items);
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const addBrowserHistoryEntry = React.useCallback((url: string, title?: string) => {
    const normalized = normalizeCivitaiBrowserUrl(url, browserSite);
    if (!normalized || normalized.startsWith('file:')) return;
    const nextTitle = String(title || titleFromBrowserUrl(normalized)).trim();
    setBrowserHistory((current) => {
      const filtered = current.filter((entry) => entry.url !== normalized);
      return [{
        id: `history-${Date.now()}`,
        title: nextTitle,
        url: normalized,
        visitedAt: Date.now(),
      }, ...filtered].slice(0, MODEL_MANAGER_BROWSER_MAX_HISTORY_ENTRIES);
    });
  }, [browserSite]);

  React.useEffect(() => {
    const webview = browserWebviewRef.current;
    if (!webview) return;
    const syncUrl = () => {
      try {
        const nextUrl = typeof webview.getURL === 'function' ? webview.getURL() : webview.src;
        if (nextUrl) {
          const nextTitle = titleFromBrowserUrl(String(nextUrl));
          setBrowserUrl(String(nextUrl));
          setBrowserAddressInput(String(nextUrl));
          addBrowserHistoryEntry(String(nextUrl), nextTitle);
        }
      } catch {
        // Ignore webview URL read errors.
      }
    };
    const startLoading = () => setBrowserLoading(true);
    const stopLoading = () => {
      setBrowserLoading(false);
      syncUrl();
    };
    const titleChanged = (event: any) => {
      const title = String(event?.title || '').trim();
      if (!title) return;
      try {
        const nextUrl = typeof webview.getURL === 'function' ? webview.getURL() : webview.src;
        if (nextUrl) addBrowserHistoryEntry(String(nextUrl), title);
      } catch {
        // Ignore title history sync failures.
      }
    };
    const showContextMenu = (event: any) => {
      const params = event?.params || {};
      setBrowserContextMenu({
        open: true,
        x: Math.max(8, Number(params.x ?? event?.clientX ?? 0)),
        y: Math.max(8, Number(params.y ?? event?.clientY ?? 0)),
        linkUrl: String(params.linkURL || params.linkUrl || ''),
        srcUrl: String(params.srcURL || params.srcUrl || ''),
        mediaType: String(params.mediaType || ''),
        selectionText: String(params.selectionText || ''),
        isEditable: Boolean(params.isEditable || params.editFlags?.canPaste || params.inputFieldType),
      });
    };
    const openRequestedWindow = (event: any) => {
      const nextUrl = String(event?.url || event?.detail?.url || '').trim();
      if (!nextUrl) return;
      event?.preventDefault?.();
      const normalized = normalizeCivitaiBrowserUrl(nextUrl, browserSite);
      setBrowserUrl(normalized);
      setBrowserAddressInput(normalized);
      setBrowserWebviewKey((prev) => prev + 1);
    };
    webview.addEventListener?.('did-start-loading', startLoading);
    webview.addEventListener?.('did-stop-loading', stopLoading);
    webview.addEventListener?.('did-navigate', syncUrl);
    webview.addEventListener?.('did-navigate-in-page', syncUrl);
    webview.addEventListener?.('page-title-updated', titleChanged);
    webview.addEventListener?.('context-menu', showContextMenu);
    webview.addEventListener?.('new-window', openRequestedWindow);
    webview.addEventListener?.('did-create-window', openRequestedWindow);
    return () => {
      webview.removeEventListener?.('did-start-loading', startLoading);
      webview.removeEventListener?.('did-stop-loading', stopLoading);
      webview.removeEventListener?.('did-navigate', syncUrl);
      webview.removeEventListener?.('did-navigate-in-page', syncUrl);
      webview.removeEventListener?.('page-title-updated', titleChanged);
      webview.removeEventListener?.('context-menu', showContextMenu);
      webview.removeEventListener?.('new-window', openRequestedWindow);
      webview.removeEventListener?.('did-create-window', openRequestedWindow);
    };
  }, [addBrowserHistoryEntry, browserSite, browserWebviewKey, sourceTab]);

  React.useEffect(() => {
    if (!browserContextMenu.open) return;
    const close = () => setBrowserContextMenu((current) => ({ ...current, open: false }));
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [browserContextMenu.open]);

  React.useEffect(() => {
    if (!browserOpenBookmarkFolderId) return;
    const close = () => setBrowserOpenBookmarkFolderId(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [browserOpenBookmarkFolderId]);

  const applyOpenedModelsPayload = React.useCallback((payload: OpenedModelsPayload) => {
    const openedIds = normalizeOpenedModelIds(payload?.openedModelIds);
    const clipboard = normalizeClipboardModels(payload?.civitaiClipboard);
    const modelFromPayload = normalizeClipboardModel(payload?.model);
    const idSet = new Set(openedIds);
    const hydratedIds = new Set<number>();
    for (const model of clipboard) hydratedIds.add(model.id);
    if (modelFromPayload) hydratedIds.add(modelFromPayload.id);

    setSavedOpenedModelIds(openedIds);
    hydratedOpenedIdsRef.current = hydratedIds;

    setCivitaiDetails((prev) => {
      const next: Record<number, CivitAIModel> = {};
      for (const id of openedIds) {
        if (prev[id]) next[id] = prev[id];
      }
      for (const model of clipboard) {
        next[model.id] = model;
      }
      if (modelFromPayload) {
        next[modelFromPayload.id] = modelFromPayload;
      }
      return next;
    });

    setCivitaiModels((prev) => {
      const byId = new Map<number, CivitAIModel>();
      for (const model of prev) {
        if (idSet.has(model.id)) byId.set(model.id, model);
      }
      for (const model of clipboard) {
        byId.set(model.id, model);
      }
      if (modelFromPayload) {
        byId.set(modelFromPayload.id, modelFromPayload);
      }
      const ordered: CivitAIModel[] = [];
      for (const id of openedIds) {
        const model = byId.get(id);
        if (model) ordered.push(model);
      }
      return ordered;
    });
  }, []);

  const sortedRoots = React.useMemo(() => {
    const byKey = new Map(roots.map((root) => [root.key, root]));
    return ROOT_ORDER.map((key) => byKey.get(key)).filter((root): root is ModelRoot => Boolean(root));
  }, [roots]);

  const activeRoot = React.useMemo(() => {
    return sortedRoots.find((root) => root.key === localRootKey) || sortedRoots[0] || null;
  }, [localRootKey, sortedRoots]);

  const resolveRootForPath = React.useCallback((pathValue: string): ModelRoot | null => {
    const normalized = normalizePath(pathValue);
    if (!normalized) return null;
    const matches = sortedRoots
      .filter((root) => isPathInside(root.path, normalized))
      .sort((a, b) => normalizePath(b.path).length - normalizePath(a.path).length);
    return matches[0] || null;
  }, [sortedRoots]);

  const currentFolderRoot = React.useMemo(() => (
    resolveRootForPath(currentFolderPath)
  ), [currentFolderPath, resolveRootForPath]);

  const effectiveLocalRoot = currentFolderRoot || activeRoot;
  const effectiveLocalRootKey = effectiveLocalRoot?.key || localRootKey;

  const localEntries = React.useMemo<LocalListEntry[]>(() => {
    const folders = (localList.folders || []).map((folder) => ({ ...folder, kind: 'folder' as const }));
    const files = (localList.files || []).map((file) => ({ ...file, kind: 'file' as const }));
    return [...folders, ...files];
  }, [localList.files, localList.folders]);

  const visibleLocalEntries = React.useMemo<LocalListEntry[]>(() => {
    const query = String(localFilterQuery || '').trim().toLowerCase();
    if (!query) return localEntries;
    return localEntries.filter((entry) => {
      const name = String(entry.name || '').toLowerCase();
      const path = String(entry.path || '').toLowerCase();
      if (name.includes(query) || path.includes(query)) return true;
      if (entry.kind === 'file') {
        const modelType = String(entry.modelType || '').toLowerCase();
        const extension = String(entry.extension || '').toLowerCase();
        return modelType.includes(query) || extension.includes(query);
      }
      return false;
    });
  }, [localEntries, localFilterQuery]);

  const selectedPathsArray = React.useMemo(() => Array.from(selectedPaths), [selectedPaths]);
  const nsfwBlurPx = React.useMemo(() => (nsfwThumbnailBlurIntensity / 100) * 20, [nsfwThumbnailBlurIntensity]);
  const selectedLocalEntry = React.useMemo<LocalListEntry | null>(() => {
    if (selectedPathsArray.length !== 1) return null;
    const path = normalizePath(selectedPathsArray[0]);
    return localEntries.find((entry) => normalizePath(entry.path) === path) || null;
  }, [localEntries, selectedPathsArray]);
  const selectedLocalFile = React.useMemo<ListFileEntry | null>(() => {
    if (!selectedLocalEntry || selectedLocalEntry.kind !== 'file') return null;
    return selectedLocalEntry;
  }, [selectedLocalEntry]);
  const selectedLocalSnapshot = React.useMemo<ModelSnapshotSummary | null>(() => {
    return selectedLocalFile?.snapshot || null;
  }, [selectedLocalFile]);
  const selectedLocalCivitaiUrl = React.useMemo(() => (
    getSnapshotCivitaiUrl(selectedLocalSnapshot)
  ), [selectedLocalSnapshot]);
  const localInfoPanelOpen = Boolean(selectedLocalFile && !localInfoPanelClosed);
  const selectedLocalUpdate = React.useMemo<ModelUpdateInfo | null>(() => {
    if (!selectedLocalEntry || selectedLocalEntry.kind !== 'file') return null;
    return modelUpdateByPath[normalizePath(selectedLocalEntry.path)] || null;
  }, [modelUpdateByPath, selectedLocalEntry]);
  const localSnapshotFiles = React.useMemo(
    () => (localList.files || []).filter((file) => file.snapshot && Number(file.snapshot.modelId || 0) > 0),
    [localList.files]
  );
  const availableUpdateCount = React.useMemo(
    () => Object.values(modelUpdateByPath).filter((entry) => entry.status === 'available').length,
    [modelUpdateByPath]
  );
  const availableUpdateEntries = React.useMemo(() => (
    Object.entries(modelUpdateByPath)
      .filter(([, entry]) => entry.status === 'available')
      .map(([path, entry]) => ({
        path: normalizePath(path),
        name: normalizePath(path).split('/').pop() || normalizePath(path),
        entry,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  ), [modelUpdateByPath]);
  const modelUpdatePercent = React.useMemo(() => {
    const total = Number(modelUpdateProgress.total || 0);
    if (!Number.isFinite(total) || total <= 0) return modelUpdateProgress.active ? 8 : 0;
    return Math.max(0, Math.min(100, Math.round((Number(modelUpdateProgress.done || 0) / total) * 100)));
  }, [modelUpdateProgress.active, modelUpdateProgress.done, modelUpdateProgress.total]);

  const mergedCivitaiModels = React.useMemo<CivitAIModel[]>(() => {
    return civitaiModels.map((model) => civitaiDetails[model.id] || model);
  }, [civitaiDetails, civitaiModels]);
  const visibleCivitaiModels = mergedCivitaiModels;
  const groupedCivitaiModels = React.useMemo(() => {
    const grouped = new Map<(typeof CIVITAI_TYPE_GROUP_ORDER)[number], CivitAIModel[]>();
    for (const model of visibleCivitaiModels) {
      const group = getCivitaiTypeGroup(model.type || '');
      const existing = grouped.get(group);
      if (existing) existing.push(model);
      else grouped.set(group, [model]);
    }
    return CIVITAI_TYPE_GROUP_ORDER
      .map((label) => {
        const items = grouped.get(label) || [];
        items.sort((a, b) => {
          const aName = String(a.name || `Model ${a.id}`);
          const bName = String(b.name || `Model ${b.id}`);
          return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        });
        return { label, items };
      })
      .filter((group) => group.items.length > 0);
  }, [visibleCivitaiModels]);

  const activeModel = React.useMemo<CivitAIModel | null>(() => {
    if (!activeModelId) return null;
    return mergedCivitaiModels.find((model) => model.id === activeModelId)
      || civitaiDetails[activeModelId]
      || null;
  }, [activeModelId, civitaiDetails, mergedCivitaiModels]);

  const activeModelImages = React.useMemo<CivitAIImage[]>(() => {
    if (!activeModel) return [];
    const images: CivitAIImage[] = [];
    for (const version of activeModel.modelVersions || []) {
      for (const image of version.images || []) {
        if (!image?.url) continue;
        images.push(image);
        if (images.length >= 5) return images;
      }
    }
    return images;
  }, [activeModel]);

  const activeAllMedia = React.useMemo<CivitAIImage[]>(() => {
    const merged: CivitAIImage[] = [];
    const seen = new Set<string>();
    for (const media of activeModelImages) {
      const key = String(media?.url || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(media);
    }
    return merged;
  }, [activeModelImages]);

  const activePreviewMedia = React.useMemo<CivitAIImage | null>(() => {
    if (!activeModelImageUrl) return null;
    return activeAllMedia.find((image) => image.url === activeModelImageUrl) || null;
  }, [activeAllMedia, activeModelImageUrl]);

  const activePreviewMeta = React.useMemo<Record<string, unknown>>(() => {
    return extractMediaMeta(activePreviewMedia);
  }, [activePreviewMedia]);

  const activePreviewWorkflow = React.useMemo(() => getMediaWorkflowPayload(activePreviewMeta), [activePreviewMeta]);

  const activePreviewJson = React.useMemo(() => {
    if (!activePreviewMedia) return '';
    try {
      return JSON.stringify(activePreviewMedia, null, 2);
    } catch {
      return '';
    }
  }, [activePreviewMedia]);

  const activeModelLoRaTags = React.useMemo<string[]>(() => {
    if (!activeModel) return [];
    const isLora = String(activeModel.type || '').toLowerCase().includes('lora');
    if (!isLora) return [];
    const tags = new Set<string>();
    for (const version of activeModel.modelVersions || []) {
      for (const token of version.trainedWords || []) {
        const normalized = String(token || '').trim();
        if (!normalized) continue;
        tags.add(normalized);
      }
    }
    return Array.from(tags);
  }, [activeModel]);

  const activeModelDescriptionHtml = React.useMemo(() => {
    if (!activeModel) return '';
    return toRichDescriptionHtml(String(activeModel.description || activeModel.modelVersions?.[0]?.description || ''));
  }, [activeModel]);

  const selectedSnapshotDescriptionHtml = React.useMemo(() => {
    if (!selectedLocalSnapshot) return '';
    return toRichDescriptionHtml(String(selectedLocalSnapshot.description || ''));
  }, [selectedLocalSnapshot]);
  const selectedLocalInspection = selectedLocalSnapshot?.localInspection || null;
  const selectedLocalInspectionSummary = selectedLocalInspection?.summary || null;

  React.useEffect(() => {
    setLocalInfoPanelClosed(false);
    setModelVersionListOpen(false);
  }, [selectedLocalFile?.path]);

  const loadRoots = React.useCallback(async () => {
    setRootsLoading(true);
    try {
      const data = await fetchJson<{ roots?: ModelRoot[] }>('/api/model-manager/roots');
      setRoots(Array.isArray(data.roots) ? data.roots : []);
    } catch (error: any) {
      addToast({
        type: 'error',
        message: error?.message || 'Failed to load model roots',
      });
    } finally {
      setRootsLoading(false);
    }
  }, [addToast]);

  const ensureTreeLoaded = React.useCallback(async (pathValue: string, force = false) => {
    const normalizedPath = normalizePath(pathValue);
    if (!normalizedPath) return;

    if (!force) {
      const existing = treeByPathRef.current[normalizedPath];
      if (existing?.loaded && !existing.error) return;
    }

    const inFlight = treeRequestsRef.current.get(normalizedPath);
    if (inFlight && !force) return inFlight.promise;
    if (inFlight && force) {
      inFlight.controller.abort();
      treeRequestsRef.current.delete(normalizedPath);
    }

    setTreeByPath((prev) => ({
      ...prev,
      [normalizedPath]: {
        loading: true,
        loaded: false,
        folders: prev[normalizedPath]?.folders || [],
        error: undefined,
      },
    }));

    const controller = new AbortController();
    const requestToken = treeRequestSeqRef.current + 1;
    treeRequestSeqRef.current = requestToken;
    treeRequestTokenByPathRef.current.set(normalizedPath, requestToken);

    const request = (async () => {
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, MODEL_TREE_REQUEST_TIMEOUT_MS);
      try {
        const data = await fetchJson<{ folders?: TreeFolderEntry[] }>(
          `/api/model-manager/tree?path=${encodeURIComponent(normalizedPath)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (treeRequestTokenByPathRef.current.get(normalizedPath) !== requestToken) return;
        const folders = Array.isArray(data.folders) ? data.folders : [];
        setTreeByPath((prev) => ({
          ...prev,
          [normalizedPath]: {
            loading: false,
            loaded: true,
            folders,
          },
        }));
      } catch (error: any) {
        if (treeRequestTokenByPathRef.current.get(normalizedPath) !== requestToken) return;
        const aborted = controller.signal.aborted;
        setTreeByPath((prev) => ({
          ...prev,
          [normalizedPath]: {
            loading: false,
            loaded: false,
            folders: prev[normalizedPath]?.folders || [],
            error: aborted ? 'Folder load timed out' : (error?.message || 'Failed to load folders'),
          },
        }));
      } finally {
        window.clearTimeout(timeout);
        if (treeRequestTokenByPathRef.current.get(normalizedPath) === requestToken) {
          treeRequestTokenByPathRef.current.delete(normalizedPath);
          treeRequestsRef.current.delete(normalizedPath);
        }
      }
    })();

    treeRequestsRef.current.set(normalizedPath, { promise: request, controller });
    return request;
  }, []);

  const loadFolder = React.useCallback(async (pathValue: string, options?: { preserveSelection?: boolean }) => {
    const normalizedPath = normalizePath(pathValue);
    if (!normalizedPath) return;

    const normalizeListPayload = (payload: any): ListPayload => ({
      path: normalizePath(String(payload.path || normalizedPath)),
      folders: Array.isArray(payload.folders) ? payload.folders : [],
      files: Array.isArray(payload.files) ? payload.files : [],
      counts: payload.counts && typeof payload.counts === 'object'
        ? payload.counts
        : {
            folders: Array.isArray(payload.folders) ? payload.folders.length : 0,
            files: Array.isArray(payload.files) ? payload.files.length : 0,
          },
    });

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setLocalLoading(true);
    try {
      const response = await fetch(`/api/model-manager/list?path=${encodeURIComponent(normalizedPath)}&fast=1`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : `Failed to load folder (${response.status})`;
        throw new Error(message);
      }
      if (controller.signal.aborted) return;

      const nextList = normalizeListPayload(payload);
      setCurrentFolderPath(nextList.path || normalizedPath);
      setLocalList(nextList);
      if (!options?.preserveSelection) {
        setSelectedPaths(new Set());
        setSelectionAnchorPath('');
      }
      setLocalLoading(false);

      try {
        const detailedResponse = await fetch(`/api/model-manager/list?path=${encodeURIComponent(normalizedPath)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const detailedPayload = await detailedResponse.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (detailedResponse.ok) {
          const detailedList = normalizeListPayload(detailedPayload);
          setLocalList(detailedList);
        }
      } catch {
        // The fast list is already visible; metadata can catch up on refresh.
      }
    } catch (error: any) {
      if (!controller.signal.aborted) {
        addToast({
          type: 'error',
          message: error?.message || 'Failed to load folder',
        });
      }
    } finally {
      if (listAbortRef.current === controller) {
        listAbortRef.current = null;
        setLocalLoading(false);
      }
    }
  }, [addToast]);

  const refreshLocalView = React.useCallback(async () => {
    if (!currentFolderPath) return;
    await ensureTreeLoaded(currentFolderPath, true);
    await loadFolder(currentFolderPath, { preserveSelection: true });
    await loadRoots();
  }, [currentFolderPath, ensureTreeLoaded, loadFolder, loadRoots]);

  const inspectLocalModelMetadata = React.useCallback(async (file: ListFileEntry | null) => {
    if (!file?.path) return;
    const ext = String(file.extension || '').toLowerCase();
    if (ext !== '.safetensors' && ext !== '.gguf') {
      addToast({ type: 'info', message: 'Local inspection supports .safetensors and .gguf models only' });
      return;
    }
    setModelInspectingPath(file.path);
    try {
      const result = await fetchJson<{ reportPath?: string; rawKeyCount?: number }>('/api/model-manager/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path }),
      });
      await refreshLocalView();
      addToast({
        type: 'success',
        message: `Metadata report saved${result.rawKeyCount ? ` (${result.rawKeyCount} keys)` : ''}`,
      });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to inspect model metadata' });
    } finally {
      setModelInspectingPath('');
    }
  }, [addToast, refreshLocalView]);

  const loadCivitaiAuthStatus = React.useCallback(async () => {
    try {
      const data = await fetchJson<CivitAIAuthStatus>('/api/model-manager/civitai/auth', { cache: 'no-store' });
      setCivitaiAuthStatus({
        hasToken: data.hasToken === true,
        maskedToken: String(data.maskedToken || ''),
      });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to read CivitAI account token' });
    }
  }, [addToast]);

  const saveCivitaiAuthToken = React.useCallback(async () => {
    if (civitaiAuthSaving) return;
    const liveToken = String(civitaiTokenInputRef.current?.value || '').trim();
    const apiToken = liveToken || String(civitaiTokenInput || '').trim();
    if (!apiToken) {
      addToast({ type: 'error', message: 'Paste a CivitAI API token first' });
      return;
    }
    setCivitaiAuthSaving(true);
    try {
      const data = await fetchJson<CivitAIAuthStatus>('/api/model-manager/civitai/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken }),
      });
      setCivitaiAuthStatus({
        hasToken: data.hasToken === true,
        maskedToken: String(data.maskedToken || ''),
      });
      setCivitaiTokenInput('');
      setCivitaiAuthRevision((current) => current + 1);
      addToast({ type: 'success', message: 'CivitAI account token saved' });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to save CivitAI account token' });
    } finally {
      setCivitaiAuthSaving(false);
    }
  }, [addToast, civitaiAuthSaving, civitaiTokenInput]);

  const removeCivitaiAuthToken = React.useCallback(async () => {
    if (civitaiAuthSaving) return;
    setCivitaiAuthSaving(true);
    try {
      const data = await fetchJson<CivitAIAuthStatus>('/api/model-manager/civitai/auth', {
        method: 'DELETE',
      });
      setCivitaiAuthStatus({
        hasToken: data.hasToken === true,
        maskedToken: String(data.maskedToken || ''),
      });
      setCivitaiTokenInput('');
      setCivitaiAuthRevision((current) => current + 1);
      addToast({ type: 'success', message: 'CivitAI account token removed' });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to remove CivitAI account token' });
    } finally {
      setCivitaiAuthSaving(false);
    }
  }, [addToast, civitaiAuthSaving]);

  React.useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  React.useEffect(() => {
    if (sourceTab !== 'civitai') return;
    void loadCivitaiAuthStatus();
  }, [loadCivitaiAuthStatus, sourceTab]);

  React.useEffect(() => {
    if (sourceTab !== 'civitai') return;
    let cancelled = false;
    const run = async () => {
      try {
        const data = await fetchJson<OpenedModelsPayload>('/api/model-manager/opened-models');
        if (cancelled) return;
        applyOpenedModelsPayload(data);
      } catch {
        if (cancelled) return;
        setSavedOpenedModelIds([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applyOpenedModelsPayload, sourceTab]);

  React.useEffect(() => {
    if (sortedRoots.length <= 0) return;
    const preferredRoot = activeRoot || sortedRoots[0] || null;
    if (!preferredRoot) {
      setLocalRootKey(sortedRoots[0].key);
      return;
    }
    const currentOwner = currentFolderPath ? resolveRootForPath(currentFolderPath) : null;
    if (currentOwner) {
      if (currentOwner.key !== localRootKey) {
        setLocalRootKey(currentOwner.key);
      }
      void ensureTreeLoaded(currentOwner.path);
      return;
    }
    void ensureTreeLoaded(preferredRoot.path);
    if (!currentFolderPath) {
      setCurrentFolderPath(preferredRoot.path);
      void loadFolder(preferredRoot.path);
    }
  }, [activeRoot, currentFolderPath, ensureTreeLoaded, loadFolder, localRootKey, resolveRootForPath, sortedRoots]);

  React.useEffect(() => {
    if (sortedRoots.length <= 0) return;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const root of sortedRoots) {
        const rootPath = normalizePath(root.path);
        if (rootPath) next.add(rootPath);
      }
      return next;
    });
    for (const root of sortedRoots) {
      void ensureTreeLoaded(root.path);
    }
  }, [ensureTreeLoaded, sortedRoots]);

  React.useEffect(() => {
    if (!currentFolderPath) return;
    const currentOwner = resolveRootForPath(currentFolderPath);
    if (currentOwner && currentOwner.key !== localRootKey) {
      setLocalRootKey(currentOwner.key);
    }
  }, [currentFolderPath, localRootKey, resolveRootForPath]);

  React.useEffect(() => {
    const handlePointerDown = () => {
      setContextMenu(null);
      setDropActionMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  React.useEffect(() => {
    return () => {
      for (const request of treeRequestsRef.current.values()) {
        request.controller.abort();
      }
      treeRequestsRef.current.clear();
      treeRequestTokenByPathRef.current.clear();
      listAbortRef.current?.abort();
      listAbortRef.current = null;
    };
  }, []);

  const postFsAction = React.useCallback(async (
    endpoint: string,
    body: Record<string, unknown>,
    successMessage: string,
  ): Promise<boolean> => {
    try {
      await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      addToast({ type: 'success', message: successMessage });
      await refreshLocalView();
      return true;
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Action failed' });
      return false;
    }
  }, [addToast, refreshLocalView]);

  const startLocalTransfer = React.useCallback(async (
    mode: LocalTransferMode,
    paths: string[],
    destination: string,
  ): Promise<boolean> => {
    const endpoint = mode === 'copy' ? '/api/model-manager/fs/copy' : '/api/model-manager/fs/move';
    const verb = mode === 'copy' ? 'Copy' : 'Move';
    try {
      const response = await fetchJson<{ jobId?: string; job?: Partial<LocalTransferJob> }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, destination, trackProgress: true }),
      });
      const jobId = String(response.jobId || response.job?.jobId || '').trim();
      if (!jobId) throw new Error(`${verb} job did not start`);
      setLocalTransferJobs((prev) => ({
        ...prev,
        [jobId]: {
          jobId,
          mode,
          status: (response.job?.status as LocalTransferStatus) || 'running',
          destination,
          totalPaths: Number(response.job?.totalPaths || paths.length || 0),
          totalUnits: Number(response.job?.totalUnits || 0),
          completedUnits: Number(response.job?.completedUnits || 0),
          percent: Number(response.job?.percent || 0),
          currentPath: String(response.job?.currentPath || paths[0] || ''),
          error: typeof response.job?.error === 'string' ? response.job.error : undefined,
          startedAt: Number(response.job?.startedAt || Date.now()),
          finishedAt: Number(response.job?.finishedAt || 0) || undefined,
        },
      }));
      addToast({ type: 'info', message: `${verb} started for ${paths.length} item(s)` });
      return true;
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || `${verb} failed to start` });
      return false;
    }
  }, [addToast]);

  const withSelection = React.useCallback((fallbackPath?: string): string[] => {
    if (selectedPathsArray.length > 0) return selectedPathsArray;
    const single = normalizePath(String(fallbackPath || ''));
    return single ? [single] : [];
  }, [selectedPathsArray]);

  const runDropAction = React.useCallback(async (
    mode: 'copy' | 'move',
    destinationPath: string,
    requestedPaths: string[],
  ) => {
    const destination = normalizePath(destinationPath);
    if (!destination) return;
    const normalized = Array.from(new Set(
      (requestedPaths || [])
        .map((value) => normalizePath(value))
        .filter((value) => Boolean(value)),
    ));
    if (normalized.length <= 0) return;
    const movable = normalized.filter((sourcePath) => {
      if (!sourcePath) return false;
      if (sourcePath === destination) return false;
      if (isPathInside(sourcePath, destination)) return false;
      return true;
    });
    if (movable.length <= 0) {
      addToast({ type: 'info', message: 'Nothing to apply for this target folder' });
      return;
    }
    const ok = await startLocalTransfer(mode, movable, destination);
    if (!ok) return;
    if (mode === 'move') {
      setSelectedPaths(new Set());
      setSelectionAnchorPath('');
    }
  }, [addToast, startLocalTransfer]);

  const resolveDragPaths = React.useCallback((event: React.DragEvent): string[] => {
    const seeded = draggingPaths
      .map((value) => normalizePath(value))
      .filter((value) => Boolean(value));
    if (seeded.length > 0) return Array.from(new Set(seeded));

    const payload = event.dataTransfer.getData('application/x-umbra-model-paths')
      || event.dataTransfer.getData('text/plain')
      || '';
    if (!payload) return [];

    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed
          .map((value) => normalizePath(String(value || '')))
          .filter((value) => Boolean(value))));
      }
    } catch {
      // Fallback to plain text parsing below.
    }

    return Array.from(new Set(
      String(payload)
        .split(/\r?\n/g)
        .map((value) => normalizePath(value))
        .filter((value) => Boolean(value)),
    ));
  }, [draggingPaths]);

  const handleEntryDragStart = React.useCallback((event: React.DragEvent<HTMLButtonElement>, entry: LocalListEntry) => {
    const sourcePath = normalizePath(entry.path);
    if (!sourcePath) return;
    const paths = selectedPaths.has(sourcePath) ? selectedPathsArray : [sourcePath];
    const normalized = Array.from(new Set(paths
      .map((value) => normalizePath(value))
      .filter((value) => Boolean(value))));
    if (normalized.length <= 0) return;
    if (!selectedPaths.has(sourcePath)) {
      setSelectedPaths(new Set([sourcePath]));
      setSelectionAnchorPath(sourcePath);
    }
    setDraggingPaths(normalized);
    setDropTargetPath('');
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('application/x-umbra-model-paths', JSON.stringify(normalized));
      event.dataTransfer.setData('text/plain', normalized.join('\n'));
    } catch {
      // Ignore drag payload write errors.
    }
  }, [selectedPaths, selectedPathsArray]);

  const handleEntryDragEnd = React.useCallback(() => {
    setDraggingPaths([]);
    setDropTargetPath('');
  }, []);

  const handleFolderDragOver = React.useCallback((event: React.DragEvent, folderPath: string) => {
    const targetPath = normalizePath(folderPath);
    if (!targetPath) return;
    const dragPaths = resolveDragPaths(event);
    if (dragPaths.length <= 0) return;
    const canDrop = dragPaths.some((sourcePath) => sourcePath && sourcePath !== targetPath && !isPathInside(sourcePath, targetPath));
    if (!canDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTargetPath !== targetPath) setDropTargetPath(targetPath);
  }, [dropTargetPath, resolveDragPaths]);

  const handleFolderDrop = React.useCallback(async (event: React.DragEvent, folderPath: string) => {
    event.preventDefault();
    event.stopPropagation();
    const targetPath = normalizePath(folderPath);
    const dragPaths = resolveDragPaths(event);
    setDropTargetPath('');
    if (!targetPath || dragPaths.length <= 0) return;
    setDropActionMenu({
      x: event.clientX,
      y: event.clientY,
      destinationPath: targetPath,
      sourcePaths: dragPaths,
    });
    setDraggingPaths([]);
  }, [resolveDragPaths]);

  const handleOpenFolder = React.useCallback((folderPath: string) => {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const owningRoot = resolveRootForPath(normalized);
    if (owningRoot && owningRoot.key !== localRootKey) {
      setLocalRootKey(owningRoot.key);
    }
    setCurrentFolderPath(normalized);
    void ensureTreeLoaded(normalized);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (owningRoot) {
        const rootPath = normalizePath(owningRoot.path);
        if (rootPath) next.add(rootPath);
        const suffix = normalized.startsWith(`${rootPath}/`)
          ? normalized.slice(rootPath.length).replace(/^\/+/, '')
          : '';
        let walk = rootPath;
        for (const part of suffix.split('/').filter(Boolean)) {
          walk = normalizePath(`${walk}/${part}`);
          if (walk) next.add(walk);
        }
      }
      next.add(normalized);
      return next;
    });
    void loadFolder(normalized);
  }, [ensureTreeLoaded, loadFolder, localRootKey, resolveRootForPath]);

  const openModelUpdateTarget = React.useCallback(async (filePath: string) => {
    const normalized = normalizePath(filePath);
    if (!normalized) return;
    const parentPath = getClientParentPath(normalized);
    if (!parentPath) return;
    const owningRoot = resolveRootForPath(normalized);
    if (owningRoot && owningRoot.key !== localRootKey) {
      setLocalRootKey(owningRoot.key);
    }
    setSourceTab('local');
    setModelUpdateDropdownOpen(false);
    setLocalFilterQuery('');
    setLocalInfoPanelClosed(false);
    setCurrentFolderPath(parentPath);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (owningRoot) {
        const rootPath = normalizePath(owningRoot.path);
        if (rootPath) next.add(rootPath);
        const suffix = parentPath.startsWith(`${rootPath}/`)
          ? parentPath.slice(rootPath.length).replace(/^\/+/, '')
          : '';
        let walk = rootPath;
        for (const part of suffix.split('/').filter(Boolean)) {
          walk = normalizePath(`${walk}/${part}`);
          if (walk) next.add(walk);
        }
      }
      next.add(parentPath);
      return next;
    });
    await ensureTreeLoaded(parentPath);
    await loadFolder(parentPath, { preserveSelection: true });
    setSelectedPaths(new Set([normalized]));
    setSelectionAnchorPath(normalized);
  }, [ensureTreeLoaded, loadFolder, localRootKey, resolveRootForPath]);

  const handleCreateFolder = React.useCallback((basePath?: string) => {
    const parentPath = normalizePath(basePath || currentFolderPath || effectiveLocalRoot?.path || '');
    if (!parentPath) return;
    setActionDialog({
      mode: 'mkdir',
      title: 'Create Folder',
      description: `Parent: ${parentPath}`,
      submitLabel: 'Create',
      value: 'New Folder',
      placeholder: 'Folder name',
      targetPaths: [parentPath],
      targetPath: parentPath,
    });
  }, [currentFolderPath, effectiveLocalRoot?.path]);

  const handleRename = React.useCallback((targetPath?: string) => {
    const paths = withSelection(targetPath);
    if (paths.length !== 1) {
      addToast({ type: 'info', message: 'Select one item to rename' });
      return;
    }
    const currentPath = paths[0];
    const currentName = currentPath.split('/').pop() || currentPath;
    setActionDialog({
      mode: 'rename',
      title: 'Rename',
      description: currentPath,
      submitLabel: 'Rename',
      value: currentName,
      placeholder: 'New name',
      targetPaths: paths,
      targetPath: currentPath,
    });
  }, [addToast, withSelection]);

  const handleDelete = React.useCallback((targetPath?: string) => {
    const paths = withSelection(targetPath);
    if (paths.length <= 0) return;
    setActionDialog({
      mode: 'delete',
      title: `Delete ${paths.length} item(s)?`,
      description: 'This removes selected models/folders from disk.',
      submitLabel: 'Delete',
      value: '',
      targetPaths: paths,
      targetPath: paths[0],
    });
  }, [withSelection]);

  const handleCopy = React.useCallback((targetPath?: string) => {
    const paths = withSelection(targetPath);
    if (paths.length <= 0) return;
    const defaultDestination = normalizePath(currentFolderPath || effectiveLocalRoot?.path || '');
    setActionDialog({
      mode: 'copy',
      title: `Copy ${paths.length} item(s)`,
      description: 'Destination folder path',
      submitLabel: 'Copy',
      value: defaultDestination,
      placeholder: 'User/Models/...',
      targetPaths: paths,
      targetPath: paths[0],
    });
  }, [currentFolderPath, effectiveLocalRoot?.path, withSelection]);

  const handleMove = React.useCallback((targetPath?: string) => {
    const paths = withSelection(targetPath);
    if (paths.length <= 0) return;
    const defaultDestination = normalizePath(currentFolderPath || effectiveLocalRoot?.path || '');
    setActionDialog({
      mode: 'move',
      title: `Move ${paths.length} item(s)`,
      description: 'Destination folder path',
      submitLabel: 'Move',
      value: defaultDestination,
      placeholder: 'User/Models/...',
      targetPaths: paths,
      targetPath: paths[0],
    });
  }, [currentFolderPath, effectiveLocalRoot?.path, withSelection]);

  const handleReveal = React.useCallback(async (targetPath?: string) => {
    if (isUmbraRemoteClient()) {
      addToast({ type: 'error', message: 'Opening File Explorer is only available from the host PC.' });
      return;
    }
    const paths = withSelection(targetPath);
    if (paths.length !== 1) {
      addToast({ type: 'info', message: 'Select one item to reveal' });
      return;
    }
    try {
      await fetchJson('/api/model-manager/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: paths[0] }),
      });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to reveal path' });
    }
  }, [addToast, withSelection]);

  const submitActionDialog = React.useCallback(async () => {
    if (!actionDialog) return;
    const dialog = actionDialog;
    const trimmedValue = String(dialog.value || '').trim();

    if (dialog.mode === 'mkdir') {
      const parentPath = normalizePath(dialog.targetPath || '');
      if (!parentPath || !trimmedValue) return;
      const targetPath = joinClientPath(parentPath, trimmedValue);
      const ok = await postFsAction('/api/model-manager/fs/mkdir', { path: targetPath }, `Created ${trimmedValue}`);
      if (!ok) return;
      setExpandedPaths((prev) => new Set(prev).add(parentPath));
      void ensureTreeLoaded(parentPath, true);
      setActionDialog(null);
      return;
    }

    if (dialog.mode === 'rename') {
      const sourcePath = String(dialog.targetPath || '').trim();
      if (!sourcePath || !trimmedValue) return;
      const currentName = sourcePath.split('/').pop() || sourcePath;
      if (currentName === trimmedValue) {
        setActionDialog(null);
        return;
      }
      const ok = await postFsAction('/api/model-manager/fs/rename', { path: sourcePath, newName: trimmedValue }, `Renamed to ${trimmedValue}`);
      if (!ok) return;
      setActionDialog(null);
      return;
    }

    if (dialog.mode === 'delete') {
      if (dialog.targetPaths.length <= 0) return;
      const ok = await postFsAction('/api/model-manager/fs/delete', { paths: dialog.targetPaths }, `Deleted ${dialog.targetPaths.length} item(s)`);
      if (!ok) return;
      setSelectedPaths(new Set());
      setSelectionAnchorPath('');
      setActionDialog(null);
      return;
    }

    if (dialog.mode === 'copy') {
      if (dialog.targetPaths.length <= 0 || !trimmedValue) return;
      const ok = await startLocalTransfer('copy', dialog.targetPaths, trimmedValue);
      if (!ok) return;
      setActionDialog(null);
      return;
    }

    if (dialog.mode === 'move') {
      if (dialog.targetPaths.length <= 0 || !trimmedValue) return;
      const ok = await startLocalTransfer('move', dialog.targetPaths, trimmedValue);
      if (!ok) return;
      setSelectedPaths(new Set());
      setSelectionAnchorPath('');
      setActionDialog(null);
    }
  }, [actionDialog, ensureTreeLoaded, postFsAction, startLocalTransfer]);

  const handleSelectEntry = React.useCallback((entry: LocalListEntry, event: React.MouseEvent<HTMLButtonElement>) => {
    const path = normalizePath(entry.path);
    if (!path) return;

    const isMultiToggle = event.ctrlKey || event.metaKey;
    const isRange = event.shiftKey && selectionAnchorPath;
    if (isRange) {
      const anchorIndex = visibleLocalEntries.findIndex((item) => normalizePath(item.path) === normalizePath(selectionAnchorPath));
      const currentIndex = visibleLocalEntries.findIndex((item) => normalizePath(item.path) === path);
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
        const next = new Set(selectedPaths);
        for (const item of visibleLocalEntries.slice(start, end + 1)) {
          next.add(normalizePath(item.path));
        }
        setSelectedPaths(next);
        return;
      }
    }

    if (isMultiToggle) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setSelectionAnchorPath(path);
      return;
    }

    setSelectedPaths(new Set([path]));
    setSelectionAnchorPath(path);
  }, [selectedPaths, selectionAnchorPath, visibleLocalEntries]);

  const handleContextMenu = React.useCallback((event: React.MouseEvent, entry: LocalListEntry) => {
    event.preventDefault();
    const targetPath = normalizePath(entry.path);
    if (!targetPath) return;
    const selection = selectedPaths.has(targetPath) ? selectedPathsArray : [targetPath];
    if (!selectedPaths.has(targetPath)) {
      setSelectedPaths(new Set([targetPath]));
      setSelectionAnchorPath(targetPath);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      selectedPaths: selection,
      isFolder: entry.kind === 'folder',
      targetPath,
    });
  }, [selectedPaths, selectedPathsArray]);

  React.useEffect(() => {
    if (sourceTab === 'civitai') return;
    setActiveModelId(null);
    setActiveModelImageUrl('');
  }, [sourceTab]);

  React.useEffect(() => {
    if (!activeModelId || activeModelImageUrl) return;
    const model = mergedCivitaiModels.find((entry) => entry.id === activeModelId);
    const preview = model ? getModelPreviewImage(model) : null;
    if (preview?.url) setActiveModelImageUrl(preview.url);
  }, [activeModelId, activeModelImageUrl, mergedCivitaiModels]);

  const loadModelDetail = React.useCallback(async (modelId: number, options?: { force?: boolean; slim?: boolean; quiet?: boolean }) => {
    const force = options?.force === true;
    const slim = options?.slim === true;
    const quiet = options?.quiet === true;
    const cached = civitaiDetailsRef.current[modelId];
    if (!force && !slim && cached && cached.__placeholder !== true) return cached;
    const inFlight = detailRequestsRef.current.get(modelId);
    if (!force && !slim && inFlight) return inFlight;
    const request = (async () => {
      try {
        const data = await fetchJsonWithTimeout<CivitAIModel>(
          `/api/model-manager/civitai/model?id=${encodeURIComponent(String(modelId))}${slim ? '&slim=1' : ''}`,
          { cache: 'no-store' },
          MODEL_MANAGER_DETAIL_TIMEOUT_MS,
          'CivitAI model detail request timed out',
        );
        if (!slim) {
          setCivitaiDetails((prev) => ({ ...prev, [modelId]: data }));
        }
        return data;
      } catch (error: any) {
        if (!slim) {
          setCivitaiDetails((prev) => {
            const existing = prev[modelId];
            if (!existing || existing.__placeholder !== true) return prev;
            const next = { ...prev };
            delete next[modelId];
            return next;
          });
        }
        if (!quiet) addToast({ type: 'error', message: error?.message || 'Failed to load model details' });
        return null;
      } finally {
        if (!slim) detailRequestsRef.current.delete(modelId);
      }
    })();

    if (!slim) detailRequestsRef.current.set(modelId, request);
    return request;
  }, [addToast]);

  React.useEffect(() => {
    if (civitaiAuthRevision <= 0 || sourceTab !== 'civitai') return;
    let cancelled = false;

    detailRequestsRef.current.clear();
    hydratedOpenedIdsRef.current = new Set();
    civitaiDetailsRef.current = {};
    setCivitaiDetails({});

    const reload = async () => {
      try {
        await loadCivitaiAuthStatus();
        const opened = await fetchJson<OpenedModelsPayload>('/api/model-manager/opened-models', { cache: 'no-store' });
        if (cancelled) return;
        applyOpenedModelsPayload(opened);
      } catch {
        if (!cancelled) {
          setSavedOpenedModelIds([]);
          setCivitaiModels([]);
        }
      }

      if (!activeModelId || cancelled) return;
      const detail = await loadModelDetail(activeModelId, { force: true });
      if (!detail || cancelled) return;
      setCivitaiModels((prev) => {
        const withoutActive = prev.filter((entry) => entry.id !== detail.id);
        return [detail, ...withoutActive];
      });
      const preview = getModelPreviewImage(detail);
      setActiveModelImageUrl(String(preview?.url || ''));
    };

    void reload();
    return () => {
      cancelled = true;
    };
  }, [
    activeModelId,
    applyOpenedModelsPayload,
    civitaiAuthRevision,
    loadCivitaiAuthStatus,
    loadModelDetail,
    sourceTab,
  ]);

  const searchCivitaiDiscovery = React.useCallback(async (options?: { append?: boolean; queryOverride?: string }) => {
    const append = options?.append === true;
    const queryText = String(options?.queryOverride ?? civitaiDiscoveryQuery).trim();
    const nextPage = append ? civitaiDiscoveryPage + 1 : 1;
    setCivitaiDiscoveryLoading(true);
    setCivitaiDiscoveryWarning('');
    try {
      const params = new URLSearchParams({
        limit: '36',
        page: String(nextPage),
        sort: civitaiDiscoverySort,
      });
      if (queryText) params.set('query', queryText);
      if (civitaiDiscoveryTypes.length > 0) params.set('types', civitaiDiscoveryTypes.join(','));
      if (civitaiDiscoveryPeriod !== 'AllTime') params.set('period', civitaiDiscoveryPeriod);
      if (civitaiDiscoveryBaseModel !== 'All') params.set('baseModels', civitaiDiscoveryBaseModel);
      const payload = await fetchJsonWithTimeout<{
        items?: CivitAIModel[];
        metadata?: { nextPage?: unknown };
        warning?: string;
      }>(
        `/api/model-manager/civitai/search?${params.toString()}`,
        { cache: 'no-store' },
        MODEL_MANAGER_DETAIL_TIMEOUT_MS,
        'CivitAI search timed out',
      );
      const items = Array.isArray(payload.items) ? payload.items : [];
      setCivitaiModels((current) => {
        if (!append) return items;
        const byId = new Map<number, CivitAIModel>();
        for (const model of current) byId.set(Number(model.id), model);
        for (const model of items) byId.set(Number(model.id), model);
        return Array.from(byId.values());
      });
      setCivitaiDiscoveryPage(nextPage);
      setCivitaiDiscoveryHasMore(Boolean(payload.metadata?.nextPage));
      setCivitaiDiscoveryWarning(String(payload.warning || ''));
      if (!append && items.length === 0 && !payload.warning) {
        addToast({ type: 'info', message: 'No CivitAI models found' });
      }
    } catch (error: any) {
      const message = error?.message || 'CivitAI search failed';
      setCivitaiDiscoveryWarning(message);
      addToast({ type: 'error', message });
    } finally {
      setCivitaiDiscoveryLoading(false);
    }
  }, [
    addToast,
    civitaiDiscoveryBaseModel,
    civitaiDiscoveryPage,
    civitaiDiscoveryPeriod,
    civitaiDiscoveryQuery,
    civitaiDiscoverySort,
    civitaiDiscoveryTypes,
  ]);

  const toggleCivitaiDiscoveryType = React.useCallback((type: string) => {
    setCivitaiDiscoveryTypes((current) => (
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    ));
  }, []);

  const persistOpenedModelIds = React.useCallback(async (ids: number[], modelSnapshot?: CivitAIModel) => {
    const normalized = Array.from(new Set(
      (ids || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value)),
    ));
    setSavedOpenedModelIds(normalized);
    try {
      await fetchJson('/api/model-manager/opened-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openedModelIds: normalized,
          ...(modelSnapshot ? { modelSnapshot } : {}),
        }),
      });
    } catch {
      // best effort persistence; keep local state even if save fails.
    }
  }, []);

  React.useEffect(() => {
    if (sourceTab !== 'civitai') return;
    if (savedOpenedModelIds.length <= 0) return;
    for (const modelId of savedOpenedModelIds) {
      if (!Number.isFinite(modelId) || modelId <= 0) continue;
      if (hydratedOpenedIdsRef.current.has(modelId)) continue;
      const alreadyLoaded = Boolean(
        civitaiDetailsRef.current[modelId]
          || civitaiModels.some((entry) => entry.id === modelId),
      );
      if (alreadyLoaded) {
        hydratedOpenedIdsRef.current.add(modelId);
        continue;
      }
      hydratedOpenedIdsRef.current.add(modelId);
      void (async () => {
        const detail = await loadModelDetail(modelId);
        if (!detail) return;
        setCivitaiModels((prev) => {
          if (prev.some((entry) => entry.id === detail.id)) return prev;
          return [...prev, detail];
        });
      })();
    }
  }, [civitaiModels, loadModelDetail, savedOpenedModelIds, sourceTab]);

  const startDownload = React.useCallback(async (
    model: CivitAIModel,
    file: CivitAIFile,
    versionHint?: CivitAIVersion,
    options?: { destinationFolder?: string },
  ) => {
    try {
      const versions = Array.isArray(model.modelVersions) ? model.modelVersions : [];
      const version = versionHint
        || versions.find((entry) => Array.isArray(entry.files) && entry.files.some((candidate) => candidate.downloadUrl === file.downloadUrl))
        || versions[0]
        || null;
      const previewImage = (version?.images || [])[0];
      const modelPageUrl = Number.isFinite(Number(model.id)) ? `https://civitai.com/models/${model.id}` : '';
      const snapshotPayload = {
        source: 'civitai',
        capturedAt: Date.now(),
        modelPageUrl,
        model: {
          id: model.id,
          name: model.name || '',
          type: model.type || '',
          description: model.description || '',
          nsfw: model.nsfw === true,
          tags: Array.isArray(model.tags) ? model.tags : [],
          creator: model.creator?.username || '',
          stats: model.stats || {},
        },
        version: version ? {
          id: version.id,
          name: version.name || '',
          description: version.description || '',
          baseModel: version.baseModel || '',
          trainedWords: Array.isArray(version.trainedWords) ? version.trainedWords : [],
          images: Array.isArray(version.images) ? version.images.slice(0, 5) : [],
        } : {},
        file: {
          name: file.name || '',
          sizeKB: Number(file.sizeKB || 0),
          downloadUrl: file.downloadUrl || '',
          type: file.type || '',
          primary: file.primary === true,
          previewImageUrl: previewImage?.url || '',
          previewImage: previewImage || null,
        },
        workflow: previewImage?.meta ?? null,
        metadata: previewImage?.meta ?? null,
      };

      const response = await fetchJson<{ jobId?: string; job?: DownloadJob }>('/api/model-manager/civitai/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          downloadUrl: file.downloadUrl,
          fileName: file.name,
          modelType: model.type || file.type || 'Other',
          destinationFolder: normalizePath(options?.destinationFolder || ''),
          snapshot: snapshotPayload,
        }),
      });
      if (!response.jobId) throw new Error('Download job did not start');
      if (response.job) {
        setDownloadJobs((prev) => ({ ...prev, [response.jobId!]: response.job! }));
      }
      addToast({ type: 'success', message: `Download queued: ${file.name}` });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to start download' });
    }
  }, [addToast]);

  const getBrowserWebview = React.useCallback(() => {
    const refWebview = browserWebviewRef.current;
    if (refWebview) return refWebview;
    if (typeof window === 'undefined') return null;
    const element = window.document.getElementById(browserWebviewElementId);
    if (element) {
      browserWebviewRef.current = element;
      return element as any;
    }
    return null;
  }, [browserWebviewElementId]);

  const setBrowserWebviewNode = React.useCallback((node: any) => {
    browserWebviewRef.current = node;
  }, []);

  const navigateBrowser = React.useCallback((target?: string) => {
    const nextUrl = normalizeCivitaiBrowserUrl(target ?? browserAddressInput, browserSite);
    const webview = getBrowserWebview();
    setBrowserUrl(nextUrl);
    setBrowserAddressInput(nextUrl);
    if (webview && typeof webview.loadURL === 'function') {
      try {
        webview.loadURL(nextUrl);
      } catch {
        setBrowserWebviewKey((prev) => prev + 1);
      }
    } else {
      setBrowserWebviewKey((prev) => prev + 1);
    }
    addBrowserHistoryEntry(nextUrl);
  }, [addBrowserHistoryEntry, browserAddressInput, browserSite, getBrowserWebview]);

  const switchBrowserSite = React.useCallback((site: CivitaiBrowserSite) => {
    setBrowserSite(site);
    const nextUrl = CIVITAI_BROWSER_SITES[site];
    const webview = getBrowserWebview();
    setBrowserUrl(nextUrl);
    setBrowserAddressInput(nextUrl);
    if (webview && typeof webview.loadURL === 'function') {
      try {
        webview.loadURL(nextUrl);
      } catch {
        setBrowserWebviewKey((prev) => prev + 1);
      }
    } else {
      setBrowserWebviewKey((prev) => prev + 1);
    }
    addBrowserHistoryEntry(nextUrl, site === 'all' ? 'civitai.red' : 'civitai.com');
  }, [addBrowserHistoryEntry, getBrowserWebview]);

  const addCurrentBrowserBookmark = React.useCallback(() => {
    const url = String(browserUrl || browserAddressInput || '').trim();
    if (!url) return;
    setBrowserBookmarks((current) => [{
      id: `bookmark-${Date.now()}`,
      type: 'link',
      label: titleFromBrowserUrl(url),
      url,
    }, ...current]);
  }, [browserAddressInput, browserUrl]);

  const addBrowserBookmarkFolder = React.useCallback(() => {
    const label = window.prompt('Bookmark folder name');
    if (!label?.trim()) return;
    setBrowserBookmarks((current) => [...current, {
      id: `folder-${Date.now()}`,
      type: 'folder',
      label: label.trim(),
      children: [],
    }]);
  }, []);

  const runBrowserWebviewCommand = React.useCallback(async (command: string) => {
    const webview = getBrowserWebview();
    setBrowserContextMenu((current) => ({ ...current, open: false }));
    try {
      if (!webview) {
        if (command === 'reload') setBrowserWebviewKey((prev) => prev + 1);
        else addToast({ type: 'error', message: 'Browser view is not ready yet' });
        return;
      }
      if (command === 'back') {
        if (typeof webview.canGoBack !== 'function' || webview.canGoBack()) webview.goBack?.();
      }
      else if (command === 'forward') {
        if (typeof webview.canGoForward !== 'function' || webview.canGoForward()) webview.goForward?.();
      }
      else if (command === 'reload') webview.reload?.();
      else if (command === 'copy') webview?.copy?.();
      else if (command === 'paste') webview?.paste?.();
      else if (command === 'cut') webview?.cut?.();
      else if (command === 'selectAll') webview?.selectAll?.();
      else if (command === 'openLink' && browserContextMenu.linkUrl) navigateBrowser(browserContextMenu.linkUrl);
      else if (command === 'copyLink' && browserContextMenu.linkUrl) void navigator.clipboard?.writeText(browserContextMenu.linkUrl);
      else if (command === 'openMedia' && browserContextMenu.srcUrl) navigateBrowser(browserContextMenu.srcUrl);
      else if (command === 'copyMedia' && browserContextMenu.srcUrl) void navigator.clipboard?.writeText(browserContextMenu.srcUrl);
      else if (command === 'saveMedia' && browserContextMenu.srcUrl) webview?.downloadURL?.(browserContextMenu.srcUrl);
      else if (command === 'saveMediaAs' && browserContextMenu.srcUrl) {
        const savePath = await (window as any).umbraDesktop?.prepareBrowserSaveAs?.({
          url: browserContextMenu.srcUrl,
          fileName: fileNameFromBrowserUrl(browserContextMenu.srcUrl),
        });
        if (savePath) webview?.downloadURL?.(browserContextMenu.srcUrl);
      }
      else if (command === 'saveLink' && browserContextMenu.linkUrl) webview?.downloadURL?.(browserContextMenu.linkUrl);
      else if (command === 'saveLinkAs' && browserContextMenu.linkUrl) {
        const savePath = await (window as any).umbraDesktop?.prepareBrowserSaveAs?.({
          url: browserContextMenu.linkUrl,
          fileName: fileNameFromBrowserUrl(browserContextMenu.linkUrl),
        });
        if (savePath) webview?.downloadURL?.(browserContextMenu.linkUrl);
      }
      else if (command === 'copyPage') {
        const currentUrl = browserUrl || webview?.getURL?.() || '';
        if (currentUrl) void navigator.clipboard?.writeText(currentUrl);
      }
      else if (command === 'copySelection' && browserContextMenu.selectionText) void navigator.clipboard?.writeText(browserContextMenu.selectionText);
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Browser command failed' });
    }
  }, [addToast, browserContextMenu.linkUrl, browserContextMenu.selectionText, browserContextMenu.srcUrl, browserUrl, getBrowserWebview, navigateBrowser]);

  const clearCompletedBrowserDownloads = React.useCallback(async () => {
    const next = await (window as any).umbraDesktop?.clearBrowserDownloads?.();
    if (Array.isArray(next)) setBrowserDownloads(next);
  }, []);

  const checkLocalModelUpdates = React.useCallback(async (targetPaths?: string[]) => {
    const runId = modelUpdateRunRef.current + 1;
    modelUpdateRunRef.current = runId;
    modelUpdateCancelRef.current = false;
    const targetSet = new Set(
      (targetPaths || [])
        .map((value) => normalizePath(value))
        .filter(Boolean)
    );
    const scopedToSelection = targetSet.size > 0;
    const scanRootPath = scopedToSelection
      ? currentFolderPath
      : normalizePath(effectiveLocalRoot?.path || currentFolderPath);
    setModelUpdateDropdownOpen(false);
    setCheckingModelUpdates(true);
    setModelUpdateProgress({
      active: true,
      phase: 'scanning',
      done: 0,
      total: 0,
      available: 0,
      message: scopedToSelection ? 'Checking selected model...' : 'Scanning model root...',
    });
    let available = 0;
    let checked = 0;
    try {
      if (scanRootPath && scopedToSelection) {
        const selectedTargetPath = Array.from(targetSet)[0] || scanRootPath;
        const reconcile = await fetchJsonWithTimeout<{ repaired?: number; recovered?: number }>('/api/model-manager/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: selectedTargetPath,
            recoverFromCivitai: true,
            recursive: false,
          }),
        }, MODEL_MANAGER_UPDATE_TIMEOUT_MS, 'Model metadata repair timed out').catch(() => null);
        if (currentFolderPath && reconcile && (Number(reconcile.repaired || 0) > 0 || Number(reconcile.recovered || 0) > 0)) {
          await loadFolder(currentFolderPath, { preserveSelection: true });
        }
      }

      let candidateSource = localSnapshotFiles;
      if (scanRootPath) {
        const fresh = await fetchJsonWithTimeout<{ files?: ListFileEntry[] }>(
          `/api/model-manager/list?path=${encodeURIComponent(scanRootPath)}${scopedToSelection ? '' : '&recursive=1'}`,
          { cache: 'no-store' },
          scopedToSelection ? MODEL_MANAGER_LIST_TIMEOUT_MS : MODEL_MANAGER_RECURSIVE_LIST_TIMEOUT_MS,
          'Model list refresh timed out',
        );
        if (fresh && Array.isArray(fresh.files)) {
          candidateSource = fresh.files.filter((file) => file.snapshot && Number(file.snapshot.modelId || 0) > 0);
        }
      }
      if (modelUpdateRunRef.current !== runId || modelUpdateCancelRef.current) {
        setModelUpdateProgress((prev) => ({ ...prev, active: false, phase: 'cancelled', message: 'Update check cancelled' }));
        return;
      }

      const candidates = candidateSource.filter((file) => {
        const path = normalizePath(file.path);
        if (!path) return false;
        if (targetSet.size > 0 && !targetSet.has(path)) return false;
        return Number(file.snapshot?.modelId || 0) > 0;
      });
      if (candidates.length <= 0) {
        setModelUpdateProgress({
          active: false,
          phase: 'done',
          done: 0,
          total: 0,
          available: 0,
          message: 'No snapshot-backed models found',
        });
        addToast({
          type: 'info',
          message: scopedToSelection
            ? 'No CivitAI snapshot-backed models to check'
            : 'No CivitAI snapshot-backed models found in this model root',
        });
        return;
      }

      const nextEntries: Record<string, ModelUpdateInfo> = {};
      setModelUpdateProgress({
        active: true,
        phase: 'checking',
        done: 0,
        total: candidates.length,
        available: 0,
        message: `Checking 0 of ${candidates.length} models...`,
      });
      for (const file of candidates) {
        if (modelUpdateRunRef.current !== runId || modelUpdateCancelRef.current) {
          setModelUpdateProgress((prev) => ({ ...prev, active: false, phase: 'cancelled', message: 'Update check cancelled' }));
          addToast({ type: 'info', message: `Update check cancelled after ${checked} model${checked === 1 ? '' : 's'}` });
          return;
        }
        const path = normalizePath(file.path);
        const snapshot = file.snapshot || null;
        const modelId = Math.floor(Number(snapshot?.modelId || 0));
        const currentVersionId = pickSnapshotVersionId(snapshot);
        const currentVersionName = pickSnapshotVersionName(snapshot);
        try {
          const model = await loadModelDetail(modelId, { force: true, slim: true, quiet: true });
          if (!model) throw new Error('CivitAI model update request timed out');
          const allVersions = getSortedModelVersions(model);
          const latestVersion = allVersions[0] || null;
          const latestVersionId = pickNumber(latestVersion?.id);
          const latestVersionName = String(latestVersion?.name || '').trim();
          const fileForDownload = getDownloadableModelFile(latestVersion);
          const hasUpdate = Boolean(currentVersionId && latestVersionId && currentVersionId !== latestVersionId);
          nextEntries[path] = {
            status: hasUpdate ? 'available' : (latestVersionId ? 'current' : 'unknown'),
            checkedAt: Date.now(),
            modelId,
            currentVersionId,
            currentVersionName,
            latestVersionId,
            latestVersionName,
            model: model || undefined,
            version: latestVersion || undefined,
            versions: allVersions,
            file: fileForDownload || undefined,
            ...(!latestVersionId ? { error: 'No current CivitAI version found' } : {}),
            ...(latestVersionId && !fileForDownload ? { error: 'Latest version has no downloadable file' } : {}),
          };
          if (hasUpdate) available += 1;
        } catch (error: any) {
          nextEntries[path] = {
            status: 'unknown',
            checkedAt: Date.now(),
            modelId,
            currentVersionId,
            currentVersionName,
            latestVersionId: 0,
            latestVersionName: '',
            error: error?.message || 'Update check failed',
          };
        } finally {
          checked += 1;
          setModelUpdateProgress({
            active: true,
            phase: 'checking',
            done: checked,
            total: candidates.length,
            available,
            message: `Checking ${checked} of ${candidates.length} models...`,
          });
        }
      }
      setModelUpdateByPath((prev) => ({ ...prev, ...nextEntries }));
      setModelUpdateProgress({
        active: false,
        phase: 'done',
        done: checked,
        total: candidates.length,
        available,
        message: available > 0
          ? `${available} update${available === 1 ? '' : 's'} available`
          : `Checked ${checked} model${checked === 1 ? '' : 's'}`,
      });
      addToast({
        type: available > 0 ? 'success' : 'info',
        message: available > 0
          ? `${available} model update${available === 1 ? '' : 's'} available`
          : `Checked ${checked} model${checked === 1 ? '' : 's'}; no updates found`,
      });
    } catch (error: any) {
      setModelUpdateProgress({
        active: false,
        phase: 'error',
        done: checked,
        total: 0,
        available,
        message: error?.message || 'Update check failed',
      });
      addToast({ type: 'error', message: error?.message || 'Update check failed' });
    } finally {
      if (modelUpdateRunRef.current === runId) {
        setCheckingModelUpdates(false);
      }
    }
  }, [addToast, currentFolderPath, effectiveLocalRoot?.path, loadFolder, loadModelDetail, localSnapshotFiles]);

  const cancelModelUpdateCheck = React.useCallback(() => {
    modelUpdateCancelRef.current = true;
    modelUpdateRunRef.current += 1;
    setCheckingModelUpdates(false);
    setModelUpdateProgress((prev) => ({
      ...prev,
      active: false,
      phase: 'cancelled',
      message: prev.done > 0 ? `Cancelled after ${prev.done} of ${prev.total}` : 'Update check cancelled',
    }));
  }, []);

  const downloadModelUpdate = React.useCallback(async (
    update: ModelUpdateInfo | null | undefined,
    options?: { destinationFolder?: string },
  ) => {
    if (!update || update.status !== 'available') return;
    if (!update.model || !update.version || !update.file) {
      addToast({ type: 'error', message: update.error || 'Latest version is not downloadable' });
      return;
    }
    await startDownload(update.model, update.file, update.version, options);
  }, [addToast, startDownload]);

  const downloadModelUpdateVersion = React.useCallback(async (
    update: ModelUpdateInfo | null | undefined,
    version: CivitAIVersion | null | undefined,
    options?: { destinationFolder?: string },
  ) => {
    if (!update?.model || !version) return;
    const file = getDownloadableModelFile(version);
    if (!file) {
      addToast({ type: 'error', message: 'This version has no downloadable file' });
      return;
    }
    await startDownload(update.model, file, version, options);
  }, [addToast, startDownload]);

  const openModelViewer = React.useCallback((model: CivitAIModel) => {
    const resolved = civitaiDetailsRef.current[model.id] || model;
    const preview = getModelPreviewImage(resolved);
    setActiveModelId(model.id);
    setActiveModelImageUrl(String(preview?.url || ''));
    if (!civitaiDetailsRef.current[model.id]) {
      void loadModelDetail(model.id);
    }
  }, [loadModelDetail]);

  const openBrowserModelViaApi = React.useCallback(async () => {
    const modelId = parseCivitaiModelId(browserAddressInput || browserUrl);
    if (!modelId) {
      addToast({ type: 'error', message: 'Open a CivitAI model page or paste a model id first' });
      return;
    }
    const detail = await loadModelDetail(modelId, { force: true });
    if (!detail) return;
    setCivitaiModels((prev) => (prev.some((entry) => entry.id === detail.id) ? prev : [...prev, detail]));
    openModelViewer(detail);
  }, [addToast, browserAddressInput, browserUrl, loadModelDetail, openModelViewer]);

  const downloadBrowserLatestModel = React.useCallback(async () => {
    const modelId = parseCivitaiModelId(browserAddressInput || browserUrl);
    if (!modelId) {
      addToast({ type: 'error', message: 'Open a CivitAI model page or paste a model id first' });
      return;
    }
    const detail = await loadModelDetail(modelId, { force: true, slim: true });
    if (!detail) return;
    const latestVersion = getLatestModelVersion(detail);
    const file = getDownloadableModelFile(latestVersion);
    if (!latestVersion || !file) {
      addToast({ type: 'error', message: 'No downloadable latest version found for this model' });
      return;
    }
    await startDownload(detail, file, latestVersion);
  }, [addToast, browserAddressInput, browserUrl, loadModelDetail, startDownload]);

  const runBrowserAddressAction = React.useCallback(() => {
    if (browserWebviewSupported) {
      navigateBrowser();
      return;
    }
    const rawInput = String(browserAddressInput || '').trim();
    const modelId = parseCivitaiModelId(rawInput);
    if (modelId) {
      void openBrowserModelViaApi();
      return;
    }
    setCivitaiDiscoveryQuery(rawInput);
    void searchCivitaiDiscovery({ queryOverride: rawInput });
  }, [browserAddressInput, browserWebviewSupported, navigateBrowser, openBrowserModelViaApi, searchCivitaiDiscovery]);

  const downloadDiscoveryModelLatest = React.useCallback(async (model: CivitAIModel) => {
    const detail = await loadModelDetail(Number(model.id), { force: true });
    const resolved = detail || model;
    const latestVersion = getLatestModelVersion(resolved);
    const file = getDownloadableModelFile(latestVersion);
    if (!latestVersion || !file) {
      addToast({ type: 'error', message: 'No downloadable latest version found for this model' });
      return;
    }
    await startDownload(resolved, file, latestVersion);
  }, [addToast, loadModelDetail, startDownload]);

  const openModelFromLink = React.useCallback(async () => {
    const liveInput = String(civitaiLinkInputRef.current?.value || '').trim();
    const modelId = parseCivitaiModelId(liveInput || civitaiLinkInput);
    if (!modelId) {
      addToast({ type: 'error', message: 'Enter a valid CivitAI model URL or model id' });
      return;
    }
    const cached = civitaiDetailsRef.current[modelId]
      || mergedCivitaiModels.find((entry) => entry.id === modelId)
      || null;
    const cachedPreview = cached ? getModelPreviewImage(cached) : null;
    if (!cached) {
      setCivitaiDetails((prev) => {
        if (prev[modelId]) return prev;
        return {
          ...prev,
          [modelId]: {
            id: modelId,
            name: `Model ${modelId}`,
            type: 'Loading...',
            description: 'Loading model details...',
            modelVersions: [],
            communityMedia: [],
            __placeholder: true,
          },
        };
      });
    }
    setActiveModelId(modelId);
    setActiveModelImageUrl(String(cachedPreview?.url || ''));
    let detail = await loadModelDetail(modelId, { force: true });
    if (!detail) {
      try {
        const resolved = await fetchJsonWithTimeout<{ modelId?: number }>(
          `/api/model-manager/civitai/version?id=${encodeURIComponent(String(modelId))}`,
          { cache: 'no-store' },
          MODEL_MANAGER_DETAIL_TIMEOUT_MS,
          'CivitAI version request timed out',
        );
        const resolvedModelId = Number(resolved?.modelId || 0);
        if (Number.isFinite(resolvedModelId) && resolvedModelId > 0 && resolvedModelId !== modelId) {
          setActiveModelId(resolvedModelId);
          const resolvedCached = civitaiDetailsRef.current[resolvedModelId]
            || mergedCivitaiModels.find((entry) => entry.id === resolvedModelId)
            || null;
          const resolvedPreview = resolvedCached ? getModelPreviewImage(resolvedCached) : null;
          setActiveModelImageUrl(String(resolvedPreview?.url || ''));
          detail = await loadModelDetail(resolvedModelId, { force: true });
        }
      } catch {
        // Preserve original model-detail error toast.
      }
    }
    if (!detail) return;
    const resolvedId = Number(detail.id || modelId);
    setCivitaiModels((prev) => {
      const withoutResolved = prev.filter((entry) => entry.id !== resolvedId);
      return [detail, ...withoutResolved];
    });
    const nextOpened = [resolvedId, ...civitaiModels.map((entry) => Number(entry.id || 0))];
    void persistOpenedModelIds(nextOpened, detail);
    const preview = getModelPreviewImage(detail);
    if (preview?.url) setActiveModelImageUrl(preview.url);
  }, [addToast, civitaiLinkInput, civitaiModels, loadModelDetail, mergedCivitaiModels, persistOpenedModelIds]);

  const refreshSavedModelCache = React.useCallback(async (modelId: number) => {
    if (!Number.isFinite(modelId) || modelId <= 0) return;
    setCivitaiModelAction({ id: modelId, kind: 'refresh' });
    try {
      const data = await fetchJson<OpenedModelsPayload>('/api/model-manager/opened-models/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      applyOpenedModelsPayload(data);
      const refreshedModel = normalizeClipboardModel(data.model);
      if (refreshedModel && activeModelId === refreshedModel.id) {
        const preview = getModelPreviewImage(refreshedModel);
        if (preview?.url) setActiveModelImageUrl(preview.url);
      }
      addToast({ type: 'success', message: `Refreshed model cache: #${modelId}` });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to refresh model cache' });
    } finally {
      setCivitaiModelAction((prev) => (prev?.id === modelId ? null : prev));
    }
  }, [activeModelId, addToast, applyOpenedModelsPayload]);

  const deleteSavedModelCache = React.useCallback(async (modelId: number) => {
    if (!Number.isFinite(modelId) || modelId <= 0) return;
    setCivitaiModelAction({ id: modelId, kind: 'delete' });
    try {
      const data = await fetchJson<OpenedModelsPayload>('/api/model-manager/opened-models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      applyOpenedModelsPayload(data);
      hydratedOpenedIdsRef.current.delete(modelId);
      if (activeModelId === modelId) {
        setActiveModelId(null);
        setActiveModelImageUrl('');
      }
      addToast({ type: 'success', message: `Deleted saved model: #${modelId}` });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to delete saved model' });
    } finally {
      setCivitaiModelAction((prev) => (prev?.id === modelId ? null : prev));
    }
  }, [activeModelId, addToast, applyOpenedModelsPayload]);

  const copyJsonToClipboard = React.useCallback(async (label: string, payload: unknown) => {
    try {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      if (!text || !String(text).trim()) {
        addToast({ type: 'info', message: `No ${label.toLowerCase()} available` });
        return;
      }
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: `${label} copied` });
    } catch {
      addToast({ type: 'error', message: `Failed to copy ${label.toLowerCase()}` });
    }
  }, [addToast]);

  const handleMediaStripWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!Number.isFinite(dominantDelta) || Math.abs(dominantDelta) < 0.5) return;
    event.preventDefault();
    target.scrollBy({
      left: dominantDelta,
      behavior: 'smooth',
    });
  }, []);

  React.useEffect(() => {
    const activeJobs = Object.values(downloadJobs).filter((job) => job.status === 'queued' || job.status === 'downloading');
    if (activeJobs.length <= 0) return;

    let cancelled = false;
    const pollOnce = async () => {
      const updates: Array<{ jobId: string; job: DownloadJob | null }> = [];
      for (const job of activeJobs) {
        try {
          const data = await fetchJson<{ job?: DownloadJob | null }>(`/api/model-manager/downloads/${encodeURIComponent(job.jobId)}`);
          updates.push({ jobId: job.jobId, job: data.job || null });
        } catch {
          // ignore transient status errors
        }
      }
      if (cancelled || updates.length <= 0) return;

      let hasTerminalUpdate = false;
      setDownloadJobs((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          if (update.job) {
            next[update.jobId] = update.job;
            const done = update.job.status === 'completed' || update.job.status === 'failed' || update.job.status === 'cancelled';
            if (done && !announcedTerminalJobsRef.current.has(update.jobId)) {
              announcedTerminalJobsRef.current.add(update.jobId);
              hasTerminalUpdate = true;
              addToast({
                type: update.job.status === 'completed' ? 'success' : 'error',
                message: update.job.status === 'completed'
                  ? `Downloaded ${update.job.fileName}`
                  : `${update.job.fileName}: ${update.job.error || update.job.status}`,
              });
            }
          } else {
            delete next[update.jobId];
          }
        }
        return next;
      });

      if (hasTerminalUpdate) {
        const userRoot = roots.find((root) => root.key === 'user');
        if (userRoot && isPathInside(userRoot.path, currentFolderPath)) {
          void loadFolder(currentFolderPath, { preserveSelection: true });
          void loadRoots();
        }
      }
    };

    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [addToast, currentFolderPath, downloadJobs, loadFolder, loadRoots, roots]);

  React.useEffect(() => {
    const activeJobs = Object.values(localTransferJobs).filter((job) => job.status === 'running');
    if (activeJobs.length <= 0) return;

    let cancelled = false;
    const pollOnce = async () => {
      const updates: Array<{ jobId: string; job: LocalTransferJob | null }> = [];
      for (const job of activeJobs) {
        const endpoint = job.mode === 'copy'
          ? '/api/model-manager/fs/copy/status'
          : '/api/model-manager/fs/move/status';
        try {
          const data = await fetchJson<{ job?: Partial<LocalTransferJob> | null }>(
            `${endpoint}?jobId=${encodeURIComponent(job.jobId)}`,
            { cache: 'no-store' },
          );
          const nextJob = data.job ? {
            ...job,
            ...data.job,
            jobId: String(data.job.jobId || data.job.id || job.jobId),
            mode: (data.job.mode as LocalTransferMode) || job.mode,
            status: (data.job.status as LocalTransferStatus) || job.status,
            destination: String(data.job.destination || job.destination),
            totalPaths: Number(data.job.totalPaths || job.totalPaths || 0),
            totalUnits: Number(data.job.totalUnits || job.totalUnits || 0),
            completedUnits: Number(data.job.completedUnits || job.completedUnits || 0),
            percent: Number(data.job.percent || 0),
            currentPath: String(data.job.currentPath || job.currentPath || ''),
            error: typeof data.job.error === 'string' ? data.job.error : job.error,
          } : null;
          updates.push({ jobId: job.jobId, job: nextJob });
        } catch {
          // ignore transient status errors
        }
      }
      if (cancelled || updates.length <= 0) return;

      let hasTerminalUpdate = false;
      setLocalTransferJobs((prev) => {
        const next = { ...prev };
        for (const update of updates) {
          if (!update.job) {
            delete next[update.jobId];
            continue;
          }
          next[update.jobId] = update.job;
          const done = update.job.status === 'completed' || update.job.status === 'failed';
          if (done && !announcedTerminalTransferJobsRef.current.has(update.jobId)) {
            announcedTerminalTransferJobsRef.current.add(update.jobId);
            hasTerminalUpdate = true;
            const verb = update.job.mode === 'copy' ? 'Copied' : 'Moved';
            addToast({
              type: update.job.status === 'completed' ? 'success' : 'error',
              message: update.job.status === 'completed'
                ? `${verb} ${update.job.totalPaths || 1} item(s)`
                : `${verb} failed: ${update.job.error || 'transfer failed'}`,
            });
          }
        }
        return next;
      });

      if (hasTerminalUpdate) {
        void refreshLocalView();
      }
    };

    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [addToast, localTransferJobs, refreshLocalView]);

  const cancelDownload = React.useCallback(async (jobId: string) => {
    try {
      await fetchJson(`/api/model-manager/downloads/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
      });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to cancel download' });
      return;
    }
    setDownloadJobs((prev) => {
      const current = prev[jobId];
      if (!current) return prev;
      return {
        ...prev,
        [jobId]: {
          ...current,
          status: 'cancelled',
        },
      };
    });
    addToast({ type: 'info', message: 'Download cancelled' });
  }, [addToast]);

  const revealSpecificPath = React.useCallback(async (pathValue: string) => {
    if (isUmbraRemoteClient()) {
      addToast({ type: 'error', message: 'Opening File Explorer is only available from the host PC.' });
      return;
    }
    const normalizedPath = normalizePath(pathValue);
    if (!normalizedPath) return;
    try {
      await fetchJson('/api/model-manager/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: normalizedPath }),
      });
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Failed to reveal path' });
    }
  }, [addToast]);

  const clearFinishedDownloads = React.useCallback(() => {
    setDownloadJobs((prev) => {
      const next: Record<string, DownloadJob> = {};
      for (const [jobId, job] of Object.entries(prev)) {
        if (job.status === 'queued' || job.status === 'downloading') {
          next[jobId] = job;
          continue;
        }
        announcedTerminalJobsRef.current.delete(jobId);
      }
      return next;
    });
  }, []);

  const clearFinishedTransfers = React.useCallback(() => {
    setLocalTransferJobs((prev) => {
      const next: Record<string, LocalTransferJob> = {};
      for (const [jobId, job] of Object.entries(prev)) {
        if (job.status === 'running') {
          next[jobId] = job;
          continue;
        }
        announcedTerminalTransferJobsRef.current.delete(jobId);
      }
      return next;
    });
  }, []);

  const renderTreeNode = React.useCallback((pathValue: string, depth: number): React.ReactNode => {
    const state = treeByPath[pathValue];
    const folders = Array.isArray(state?.folders) ? state.folders : [];
    if (folders.length <= 0) return null;
    return (
      <div>
        {folders.map((folder) => {
          const childPath = normalizePath(folder.path);
          const isExpanded = expandedPaths.has(childPath);
          const isSelected = normalizePath(currentFolderPath) === childPath;
          return (
            <div key={childPath}>
              <div
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors',
                  isSelected ? 'bg-[var(--umbra-accent)]/20 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white',
                  dropTargetPath === childPath ? 'ring-1 ring-[var(--umbra-accent)] bg-[var(--umbra-accent)]/25 text-white' : '',
                )}
                style={{ paddingLeft: `${10 + depth * 14}px` }}
                onDragOver={(event) => handleFolderDragOver(event, childPath)}
                onDragEnter={(event) => handleFolderDragOver(event, childPath)}
                onDragLeave={() => {
                  if (dropTargetPath === childPath) setDropTargetPath('');
                }}
                onDrop={(event) => { void handleFolderDrop(event, childPath); }}
              >
                <button
                  type="button"
                  className="h-5 w-5 rounded text-zinc-400 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    if (!folder.hasChildren) return;
                    setExpandedPaths((prev) => {
                      const next = new Set(prev);
                      if (next.has(childPath)) next.delete(childPath);
                      else next.add(childPath);
                      return next;
                    });
                    if (!isExpanded) void ensureTreeLoaded(childPath);
                  }}
                >
                  {folder.hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => handleOpenFolder(childPath)}
                >
                  {folder.name}
                </button>
              </div>
              {isExpanded ? (
                <div>
                  {treeByPath[childPath]?.loading ? (
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-500" style={{ paddingLeft: `${30 + depth * 14}px` }}>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Loading...</span>
                    </div>
                  ) : null}
                  {!treeByPath[childPath]?.loading && treeByPath[childPath]?.error ? (
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-red-300" style={{ paddingLeft: `${30 + depth * 14}px` }}>
                      <span className="truncate">{treeByPath[childPath]?.error}</span>
                      <button
                        type="button"
                        onClick={() => { void ensureTreeLoaded(childPath, true); }}
                        className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 hover:bg-red-500/20"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {renderTreeNode(childPath, depth + 1)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [currentFolderPath, dropTargetPath, ensureTreeLoaded, expandedPaths, handleFolderDragOver, handleFolderDrop, handleOpenFolder, treeByPath]);

  const rootSummary = localList.counts || {
    folders: localList.folders.length,
    files: localList.files.length,
  };

  const breadcrumbPaths = React.useMemo(() => {
    const activeRootPath = normalizePath(effectiveLocalRoot?.path || '');
    const currentPath = normalizePath(currentFolderPath || activeRootPath);
    if (!activeRootPath || !currentPath) return [];
    const rootLabel = effectiveLocalRoot?.label || 'Root';
    const crumbs: Array<{ label: string; path: string }> = [{ label: rootLabel, path: activeRootPath }];
    if (!isPathInside(activeRootPath, currentPath) || currentPath === activeRootPath) return crumbs;
    const suffix = currentPath.slice(activeRootPath.length).replace(/^\/+/, '');
    if (!suffix) return crumbs;
    const parts = suffix.split('/').filter(Boolean);
    let walk = activeRootPath;
    for (const part of parts) {
      walk = joinClientPath(walk, part);
      crumbs.push({ label: part, path: walk });
    }
    return crumbs;
  }, [currentFolderPath, effectiveLocalRoot?.label, effectiveLocalRoot?.path]);

  const canNavigateUp = React.useMemo(() => {
    const activeRootPath = normalizePath(effectiveLocalRoot?.path || '');
    const currentPath = normalizePath(currentFolderPath || '');
    return Boolean(activeRootPath && currentPath && currentPath !== activeRootPath && isPathInside(activeRootPath, currentPath));
  }, [currentFolderPath, effectiveLocalRoot?.path]);

  const browserActiveDownloads = browserDownloads.filter((item) => item.state === 'progressing').length;
  const browserOpenBookmarkFolder = browserBookmarks.find((item) => item.type === 'folder' && item.id === browserOpenBookmarkFolderId);

  const renderBrowserBookmarkLink = (link: BrowserBookmarkItem, compact = false) => {
    if (link.type !== 'link' || !link.url) return null;
    return (
      <button
        key={link.id}
        type="button"
        onClick={() => {
          setBrowserOpenBookmarkFolderId(null);
          navigateBrowser(link.url);
        }}
        className={cn(
          'min-w-0 truncate rounded-md text-left font-semibold text-zinc-200 hover:bg-white/10 hover:text-white',
          compact ? 'w-full px-3 py-2 text-sm' : 'max-w-[180px] px-2.5 py-1.5 text-xs',
        )}
        title={link.url}
      >
        {link.label}
      </button>
    );
  };

  return (
    <div className="relative h-full w-full bg-[var(--umbra-bg)] text-[var(--umbra-text)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[var(--umbra-border)] bg-black/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSourceTab('local')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                sourceTab === 'local'
                  ? 'bg-[var(--umbra-accent)]/25 text-white'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white',
              )}
            >
              <Boxes size={14} />
              <span>Local</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('civitai')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                sourceTab === 'civitai'
                  ? 'bg-[var(--umbra-accent)]/25 text-white'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white',
              )}
            >
              <Cloud size={14} />
              <span>CivitAI Downloader</span>
            </button>

            {sourceTab === 'local' ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {sortedRoots.map((root) => (
                  <button
                    key={root.key}
                    type="button"
                    onClick={() => {
                      handleOpenFolder(root.path);
                    }}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                      effectiveLocalRootKey === root.key
                        ? 'border-[var(--umbra-accent)]/70 bg-[var(--umbra-accent)]/20 text-white'
                        : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:text-white',
                    )}
                  >
                    {root.label.replace(' Models', '')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void refreshLocalView()}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:border-white/20 hover:text-white"
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
                <div className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => {
                      if (availableUpdateCount > 0 && !checkingModelUpdates) {
                        setModelUpdateDropdownOpen((prev) => !prev);
                        return;
                      }
                      void checkLocalModelUpdates();
                    }}
                    disabled={checkingModelUpdates || !effectiveLocalRoot}
                    className="inline-flex items-center gap-2 rounded-l-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                    title={availableUpdateCount > 0 ? 'Show models with available updates' : 'Check CivitAI updates across this model root'}
                  >
                    {checkingModelUpdates ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Updates{availableUpdateCount > 0 ? ` (${availableUpdateCount})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelUpdateDropdownOpen((prev) => !prev)}
                    disabled={checkingModelUpdates || availableUpdateCount <= 0}
                    className="inline-flex items-center rounded-r-md border border-l-0 border-emerald-400/35 bg-emerald-500/10 px-1.5 py-1.5 text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                    title="Show available model updates"
                  >
                    {modelUpdateDropdownOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {modelUpdateDropdownOpen && availableUpdateEntries.length > 0 ? (
                    <div className="absolute right-0 top-full z-30 mt-1 w-96 overflow-hidden rounded-md border border-white/10 bg-zinc-950/95 shadow-xl shadow-black/40">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-2">
                        <div className="text-xs font-semibold text-zinc-100">Available Updates</div>
                        <button
                          type="button"
                          onClick={() => void checkLocalModelUpdates()}
                          className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:text-white"
                        >
                          <RefreshCw size={10} />
                          Rescan
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-1 custom-scrollbar">
                        {availableUpdateEntries.map(({ path, name, entry }) => (
                          <button
                            key={`update-target:${path}`}
                            type="button"
                            onClick={() => void openModelUpdateTarget(path)}
                            className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-white/10"
                            title={path}
                          >
                            <Boxes size={14} className="mt-0.5 shrink-0 text-cyan-200" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-zinc-100">{name}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                                {entry.currentVersionName || `#${entry.currentVersionId}`} {'->'} {entry.latestVersionName || `#${entry.latestVersionId}`}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-zinc-600">{path}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {checkingModelUpdates ? (
                  <button
                    type="button"
                    onClick={cancelModelUpdateCheck}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/25 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : sourceTab === 'browser' ? (
              <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void runBrowserWebviewCommand('back')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white"
                  title="Back"
                  aria-label="Back"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void runBrowserWebviewCommand('forward')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white"
                  title="Forward"
                  aria-label="Forward"
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void runBrowserWebviewCommand('reload')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white"
                  title="Reload"
                  aria-label="Reload"
                >
                  <RefreshCw size={15} />
                </button>
                <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-black/20">
                  <button
                    type="button"
                    onClick={() => switchBrowserSite('pg')}
                    className={cn(
                      'px-2.5 py-1.5 text-xs font-semibold',
                      browserSite === 'pg' ? 'bg-[var(--umbra-accent)]/25 text-white' : 'text-zinc-300 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    PG-13
                  </button>
                  <button
                    type="button"
                    onClick={() => switchBrowserSite('all')}
                    className={cn(
                      'border-l border-white/10 px-2.5 py-1.5 text-xs font-semibold',
                      browserSite === 'all' ? 'bg-[var(--umbra-accent)]/25 text-white' : 'text-zinc-300 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    All Models
                  </button>
                </div>
                <input
                  type="text"
                  value={browserAddressInput}
                  onChange={(event) => setBrowserAddressInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runBrowserAddressAction();
                  }}
                  placeholder={browserWebviewSupported ? 'https://civitai.com/models/...' : 'Search CivitAI, paste a model URL, or enter a model ID'}
                  className="min-w-[280px] flex-1 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]/70"
                />
                <button
                  type="button"
                  onClick={runBrowserAddressAction}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white"
                >
                  {browserWebviewSupported ? <ExternalLink size={12} /> : <Search size={12} />}
                  {browserWebviewSupported ? 'Go' : 'Search'}
                </button>
                <button
                  type="button"
                  onClick={addCurrentBrowserBookmark}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white"
                  title="Bookmark page"
                  aria-label="Bookmark page"
                >
                  <Star size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setBrowserDownloadsOpen((open) => !open)}
                  className={cn(
                    'relative inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
                    browserDownloadsOpen ? 'border-[var(--umbra-accent)]/50 bg-[var(--umbra-accent)]/20 text-white' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Download size={13} />
                  Downloads
                  {browserActiveDownloads > 0 ? (
                    <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-black text-white">{browserActiveDownloads}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setBrowserHistoryOpen((open) => !open)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
                    browserHistoryOpen ? 'border-[var(--umbra-accent)]/50 bg-[var(--umbra-accent)]/20 text-white' : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Clock size={13} />
                  History
                </button>
                <button
                  type="button"
                  onClick={() => void openBrowserModelViaApi()}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
                >
                  <Eye size={12} />
                  API Panel
                </button>
                <button
                  type="button"
                  onClick={() => void downloadBrowserLatestModel()}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                >
                  <Download size={12} />
                  Latest
                </button>
              </div>
            ) : (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  ref={civitaiLinkInputRef}
                  type="text"
                  value={civitaiLinkInput}
                  onChange={(event) => setCivitaiLinkInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void openModelFromLink();
                  }}
                  placeholder="Paste CivitAI model URL or id..."
                  className="min-w-[240px] rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]/70"
                />
                <button
                  type="button"
                  onClick={() => void openModelFromLink()}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white"
                >
                  <ExternalLink size={13} />
                  Open Link
                </button>
              </div>
            )}
          </div>
          {sourceTab === 'local' && (modelUpdateProgress.active || modelUpdateProgress.phase === 'done' || modelUpdateProgress.phase === 'cancelled' || modelUpdateProgress.phase === 'error') ? (
            <div className="mt-2 rounded-md border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-300">
                <span className="truncate">{modelUpdateProgress.message || 'Checking model updates...'}</span>
                <span className="shrink-0 text-zinc-500">
                  {modelUpdateProgress.total > 0 ? `${modelUpdateProgress.done}/${modelUpdateProgress.total}` : modelUpdateProgress.phase}
                  {modelUpdateProgress.available > 0 ? ` | ${modelUpdateProgress.available} available` : ''}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    modelUpdateProgress.phase === 'error'
                      ? 'bg-red-400'
                      : modelUpdateProgress.phase === 'cancelled'
                        ? 'bg-zinc-400'
                        : 'bg-emerald-400',
                    modelUpdateProgress.active && modelUpdateProgress.total <= 0 ? 'animate-pulse' : '',
                  )}
                  style={{ width: `${modelUpdatePercent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {sourceTab === 'local' ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-[320px] shrink-0 border-r border-[var(--umbra-border)] bg-black/20">
              <div className="h-full overflow-y-auto custom-scrollbar p-2">
                {rootsLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-400">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Loading roots...</span>
                  </div>
                ) : null}

                {sortedRoots.map((root) => {
                  const rootPath = normalizePath(root.path);
                  const rootExpanded = expandedPaths.has(rootPath) || effectiveLocalRootKey === root.key;
                  const rootState = treeByPath[rootPath];
                  return (
                    <div key={root.key} className="mb-2 rounded-lg border border-white/10 bg-black/20">
                      <div
                        className={cn(
                          'flex items-center gap-1 px-2 py-1.5',
                          dropTargetPath === rootPath ? 'ring-1 ring-[var(--umbra-accent)] bg-[var(--umbra-accent)]/20' : '',
                        )}
                        onDragOver={(event) => handleFolderDragOver(event, rootPath)}
                        onDragEnter={(event) => handleFolderDragOver(event, rootPath)}
                        onDragLeave={() => {
                          if (dropTargetPath === rootPath) setDropTargetPath('');
                        }}
                        onDrop={(event) => { void handleFolderDrop(event, rootPath); }}
                      >
                        <button
                          type="button"
                          className="h-5 w-5 rounded text-zinc-400 hover:bg-white/10 hover:text-white"
                          onClick={() => {
                            setExpandedPaths((prev) => {
                              const next = new Set(prev);
                              if (next.has(rootPath)) next.delete(rootPath);
                              else next.add(rootPath);
                              return next;
                            });
                            if (!rootExpanded) void ensureTreeLoaded(rootPath);
                          }}
                        >
                          {rootExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm',
                            effectiveLocalRootKey === root.key ? 'text-white' : 'text-zinc-300 hover:text-white',
                          )}
                          onClick={() => {
                            handleOpenFolder(root.path);
                          }}
                        >
                          {root.label}
                        </button>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                          {root.fileCount ?? 0}
                        </span>
                      </div>
                      {rootExpanded ? (
                        <div className="pb-1">
                          {rootState?.loading ? (
                            <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-500">
                              <Loader2 size={12} className="animate-spin" />
                              <span>Loading folders...</span>
                            </div>
                          ) : null}
                          {!rootState?.loading && rootState?.error ? (
                            <div className="flex items-center gap-2 px-2 py-1 text-xs text-red-300">
                              <span className="truncate">{rootState.error}</span>
                              <button
                                type="button"
                                onClick={() => { void ensureTreeLoaded(rootPath, true); }}
                                className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-200 hover:bg-red-500/20"
                              >
                                Retry
                              </button>
                            </div>
                          ) : null}
                          {renderTreeNode(rootPath, 1)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </aside>

            <main className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-[var(--umbra-border)] bg-black/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canNavigateUp}
                    onClick={() => {
                      const currentPath = normalizePath(currentFolderPath || '');
                      const parentPath = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
                      if (!parentPath) return;
                      handleOpenFolder(parentPath);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                  >
                    <ArrowUp size={12} />
                    Up
                  </button>
                  <div className="min-w-[280px] flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-zinc-300">
                      {breadcrumbPaths.map((crumb, index) => (
                        <React.Fragment key={crumb.path}>
                          {index > 0 ? <span className="text-zinc-500">/</span> : null}
                          <button
                            type="button"
                            className={cn(
                              'truncate rounded px-1 py-0.5',
                              normalizePath(currentFolderPath) === normalizePath(crumb.path)
                                ? 'bg-[var(--umbra-accent)]/25 text-white'
                                : 'text-zinc-300 hover:bg-white/10 hover:text-white',
                            )}
                            onClick={() => handleOpenFolder(crumb.path)}
                            title={crumb.path}
                          >
                            {crumb.label}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {rootSummary.folders} folders - {rootSummary.files} files
                      {selectedPathsArray.length > 0 ? ` - ${selectedPathsArray.length} selected` : ''}
                    </div>
                  </div>
                  <div className="relative min-w-[220px] flex-1">
                    <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={localFilterQuery}
                      onChange={(event) => setLocalFilterQuery(event.target.value)}
                      placeholder="Filter current folder..."
                      className="w-full rounded-md border border-white/10 bg-black/30 px-7 py-1.5 text-xs text-white outline-none focus:border-[var(--umbra-accent)]/70"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCreateFolder()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300 hover:text-white"
                  >
                    <FolderPlus size={12} />
                    New Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRename()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300 hover:text-white"
                  >
                    <Pencil size={12} />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReveal()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300 hover:text-white"
                  >
                    <ExternalLink size={12} />
                    Reveal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete()}
                    className="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                {localLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Loading files...</span>
                  </div>
                ) : null}

                {localFilterQuery.trim() ? (
                  <div className="px-3 py-1.5 text-[11px] text-zinc-500">
                    Showing {visibleLocalEntries.length} of {localEntries.length} entries
                  </div>
                ) : null}

                <div className="divide-y divide-white/5">
                  {visibleLocalEntries.map((entry) => {
                    const path = normalizePath(entry.path);
                    const isSelected = selectedPaths.has(path);
                    const isDropTarget = entry.kind === 'folder' && dropTargetPath === path;
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={(event) => handleSelectEntry(entry, event)}
                        onDoubleClick={() => {
                          if (entry.kind === 'folder') handleOpenFolder(entry.path);
                          else void handleReveal(entry.path);
                        }}
                        onContextMenu={(event) => handleContextMenu(event, entry)}
                        draggable
                        onDragStart={(event) => handleEntryDragStart(event, entry)}
                        onDragEnd={handleEntryDragEnd}
                        onDragOver={entry.kind === 'folder' ? (event) => handleFolderDragOver(event, entry.path) : undefined}
                        onDragEnter={entry.kind === 'folder' ? (event) => handleFolderDragOver(event, entry.path) : undefined}
                        onDragLeave={entry.kind === 'folder' ? () => {
                          if (dropTargetPath === path) setDropTargetPath('');
                        } : undefined}
                        onDrop={entry.kind === 'folder' ? (event) => { void handleFolderDrop(event, entry.path); } : undefined}
                        className={cn(
                          'grid w-full grid-cols-[64px_minmax(260px,2fr)_120px_130px_140px_190px] items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                          isSelected ? 'bg-[var(--umbra-accent)]/20 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white',
                          isDropTarget ? 'ring-1 ring-[var(--umbra-accent)] bg-[var(--umbra-accent)]/25 text-white' : '',
                        )}
                      >
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/30">
                          {entry.kind === 'file' && getModelThumbnailSrc(entry.snapshot) ? (
                            <img
                              src={getModelThumbnailSrc(entry.snapshot)}
                              alt=""
                              width={320}
                              height={320}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                            />
                          ) : entry.kind === 'folder' ? (
                            <Folder size={22} className="text-zinc-500" />
                          ) : (
                            <Boxes size={20} className="text-zinc-500" />
                          )}
                        </div>
                        <div className="min-w-0 truncate font-medium">
                          <span className="inline-flex items-center gap-2">
                            {entry.kind === 'folder' ? <Folder size={14} /> : <Boxes size={14} />}
                            <span className="truncate">{entry.name}</span>
                            {entry.kind === 'file' && entry.snapshot ? (
                              <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                                Snap
                              </span>
                            ) : null}
                            {entry.kind === 'file' && modelUpdateByPath[path]?.status === 'available' ? (
                              <span className="rounded bg-cyan-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100">
                                Update
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400">
                          {entry.kind === 'folder'
                            ? formatFolderSummary(entry)
                            : String(entry.modelType || entry.extension || 'file')}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {entry.kind === 'folder' ? '-' : formatBytes(entry.size)}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {entry.kind === 'folder'
                            ? '-'
                            : modelUpdateByPath[path]?.status === 'available'
                              ? `New: ${modelUpdateByPath[path]?.latestVersionName || `#${modelUpdateByPath[path]?.latestVersionId}`}`
                              : modelUpdateByPath[path]?.status === 'current'
                                ? 'Current'
                                : entry.snapshot
                                  ? 'Not checked'
                                  : '-'}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {entry.kind === 'folder' ? '-' : formatDateTime(entry.modifiedMs)}
                        </div>
                      </button>
                    );
                  })}
                  {!localLoading && visibleLocalEntries.length <= 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-zinc-500">
                      {localFilterQuery.trim() ? 'No matches in this folder.' : 'This folder is empty.'}
                    </div>
                  ) : null}
                </div>
              </div>

            </main>

            {localInfoPanelOpen ? (
              <aside className="flex w-[420px] shrink-0 flex-col border-l border-[var(--umbra-border)] bg-black/25">
                <div className="flex items-start gap-3 border-b border-[var(--umbra-border)] p-3">
                  {getModelThumbnailSrc(selectedLocalSnapshot) ? (
                    <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
                      <img
                        src={getModelThumbnailSrc(selectedLocalSnapshot)}
                        alt="Model snapshot thumbnail"
                        width={320}
                        height={320}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500">
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {selectedLocalSnapshot?.modelName || selectedLocalFile?.name || 'Model'}
                    </div>
                    <div className="mt-1 break-all text-[11px] text-zinc-500">
                      {selectedLocalFile?.name || ''}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {selectedLocalSnapshot?.source || 'local'}{selectedLocalSnapshot?.capturedAt ? ` | ${formatDateTime(Number(selectedLocalSnapshot.capturedAt))}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalInfoPanelClosed(true)}
                    className="rounded-md border border-white/10 bg-black/25 p-1 text-zinc-400 hover:text-white"
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 border-b border-[var(--umbra-border)] p-3">
                  <button
                    type="button"
                    onClick={() => selectedLocalFile && void checkLocalModelUpdates([selectedLocalFile.path])}
                    disabled={checkingModelUpdates || !selectedLocalFile}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-45"
                  >
                    {checkingModelUpdates ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Check Version
                  </button>
                  <button
                    type="button"
                    onClick={() => void inspectLocalModelMetadata(selectedLocalFile)}
                    disabled={
                      !selectedLocalFile
                      || modelInspectingPath === selectedLocalFile.path
                      || !['.safetensors', '.gguf'].includes(String(selectedLocalFile.extension || '').toLowerCase())
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-500/20 disabled:opacity-45"
                    title="Read embedded local metadata and save a text report"
                  >
                    {modelInspectingPath === selectedLocalFile?.path ? <Loader2 size={12} className="animate-spin" /> : <Tags size={12} />}
                    Inspect Metadata
                  </button>
                  {selectedLocalCivitaiUrl ? (
                    <a
                      href={selectedLocalCivitaiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100 hover:bg-sky-500/20"
                    >
                      <ExternalLink size={12} />
                      CivitAI
                    </a>
                  ) : null}
                  {selectedLocalSnapshot ? (
                    <button
                      type="button"
                      onClick={() => void copyJsonToClipboard('Snapshot JSON', selectedLocalSnapshot.raw || selectedLocalSnapshot)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200 hover:text-white"
                    >
                      <Copy size={12} />
                      Copy Snapshot
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyJsonToClipboard('Workflow JSON', selectedLocalSnapshot?.workflow || '')}
                    disabled={!selectedLocalSnapshot?.workflow}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200 hover:text-white disabled:opacity-45"
                  >
                    <Copy size={12} />
                    Copy Workflow
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3">
                  {selectedLocalUpdate?.status === 'available' ? (
                    <div className="mb-3 rounded-md border border-cyan-400/30 bg-cyan-500/10 p-2 text-xs text-cyan-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">New version available</div>
                          <div className="truncate text-[11px] text-cyan-100/80">
                            {selectedLocalUpdate.currentVersionName || `#${selectedLocalUpdate.currentVersionId}`} {'->'} {selectedLocalUpdate.latestVersionName || `#${selectedLocalUpdate.latestVersionId}`}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void downloadModelUpdate(selectedLocalUpdate, {
                              destinationFolder: getClientParentPath(selectedLocalFile?.path || ''),
                            })}
                            disabled={!selectedLocalUpdate.file || !selectedLocalFile}
                            className="inline-flex items-center gap-1 rounded border border-cyan-300/40 bg-cyan-400/15 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-400/25 disabled:opacity-45"
                            title="Download the new version into this model's current folder"
                          >
                            <Download size={11} />
                            Here
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadModelUpdate(selectedLocalUpdate)}
                            disabled={!selectedLocalUpdate.file}
                            className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[10px] font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-45"
                            title="Download the new version into User Models"
                          >
                            <Download size={11} />
                            User Models
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : selectedLocalUpdate?.status === 'current' ? (
                    <div className="mb-3 rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-100">
                      Current version: {selectedLocalUpdate.currentVersionName || selectedLocalUpdate.latestVersionName || `#${selectedLocalUpdate.currentVersionId || selectedLocalUpdate.latestVersionId}`}
                    </div>
                  ) : selectedLocalUpdate?.status === 'unknown' ? (
                    <div className="mb-3 rounded-md border border-yellow-400/25 bg-yellow-500/10 px-2.5 py-1.5 text-[11px] text-yellow-100">
                      Version check unavailable: {selectedLocalUpdate.error || 'unknown response'}
                    </div>
                  ) : null}

                  {selectedLocalUpdate?.model && Array.isArray(selectedLocalUpdate.versions) && selectedLocalUpdate.versions.length > 0 ? (
                    <div className="mb-3 rounded-md border border-white/10 bg-black/25 text-xs text-zinc-200">
                      <button
                        type="button"
                        onClick={() => setModelVersionListOpen((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-white/5"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {modelVersionListOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span className="truncate font-semibold">CivitAI Versions</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            {selectedLocalUpdate.versions.length}
                          </span>
                        </span>
                        <span className="truncate text-[10px] text-zinc-500">
                          Upload dates included
                        </span>
                      </button>
                      {modelVersionListOpen ? (
                        <div className="max-h-72 space-y-1 overflow-y-auto border-t border-white/10 p-2 custom-scrollbar">
                          {selectedLocalUpdate.versions.map((version) => {
                            const versionId = pickNumber(version.id);
                            const file = getDownloadableModelFile(version);
                            const isCurrent = versionId > 0 && versionId === selectedLocalUpdate.currentVersionId;
                            const isLatest = versionId > 0 && versionId === selectedLocalUpdate.latestVersionId;
                            return (
                              <div key={`version:${versionId || version.name}`} className="rounded border border-white/10 bg-black/25 p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <span className="truncate font-semibold text-zinc-100">{version.name || `Version #${versionId}`}</span>
                                      {isLatest ? (
                                        <span className="rounded bg-cyan-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100">Newest</span>
                                      ) : null}
                                      {isCurrent ? (
                                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-100">Installed</span>
                                      ) : null}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-zinc-500">
                                      Uploaded: {formatModelVersionDate(version)}
                                    </div>
                                    {version.baseModel ? (
                                      <div className="mt-0.5 text-[10px] text-zinc-500">Base: {version.baseModel}</div>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void downloadModelUpdateVersion(selectedLocalUpdate, version, {
                                        destinationFolder: getClientParentPath(selectedLocalFile?.path || ''),
                                      })}
                                      disabled={!file || !selectedLocalFile}
                                      className="inline-flex items-center gap-1 rounded border border-cyan-300/35 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-50 hover:bg-cyan-400/20 disabled:opacity-45"
                                      title="Download this version into this model's current folder"
                                    >
                                      <Download size={10} />
                                      Here
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void downloadModelUpdateVersion(selectedLocalUpdate, version)}
                                      disabled={!file}
                                      className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[10px] font-semibold text-zinc-100 hover:bg-white/10 disabled:opacity-45"
                                      title="Download this version into User Models"
                                    >
                                      <Download size={10} />
                                      User
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedLocalInspectionSummary ? (
                    <div className="mb-3 rounded-md border border-violet-400/25 bg-violet-500/10 p-2 text-xs text-violet-50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">Local metadata inspection</div>
                          <div className="mt-0.5 truncate text-[11px] text-violet-100/75">
                            {selectedLocalInspection?.capturedAt ? formatDateTime(Number(selectedLocalInspection.capturedAt)) : 'Saved report'}
                            {selectedLocalInspectionSummary.rawKeyCount ? ` | ${selectedLocalInspectionSummary.rawKeyCount} raw keys` : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {!isUmbraRemoteClient() ? (
                            <button
                              type="button"
                              onClick={() => selectedLocalInspection?.reportPath && void revealSpecificPath(selectedLocalInspection.reportPath)}
                              disabled={!selectedLocalInspection?.reportPath}
                              className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/25 px-2 py-1 text-[10px] font-semibold text-violet-50 hover:bg-white/10 disabled:opacity-45"
                              title="Open the generated inspection report in Explorer"
                            >
                              <ExternalLink size={11} />
                              Open Path
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
                        <div className="text-violet-100/60">Software</div>
                        <div className="min-w-0 break-words">{String(selectedLocalInspectionSummary.training?.software || selectedLocalInspectionSummary.settings?.format || '-')}</div>
                        <div className="text-violet-100/60">Network</div>
                        <div className="min-w-0 break-words">{String(selectedLocalInspectionSummary.settings?.networkModule || selectedLocalInspectionSummary.settings?.networkDim || '-')}</div>
                        <div className="text-violet-100/60">Base</div>
                        <div className="min-w-0 break-words">{String(selectedLocalInspectionSummary.base?.baseModel || selectedLocalInspectionSummary.base?.sdModelName || '-')}</div>
                        <div className="text-violet-100/60">Triggers</div>
                        <div className="min-w-0 break-words">
                          {Array.isArray(selectedLocalInspectionSummary.triggerWords) && selectedLocalInspectionSummary.triggerWords.length > 0
                            ? selectedLocalInspectionSummary.triggerWords.slice(0, 30).join(', ')
                            : '-'}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs text-zinc-300">
                    <div className="text-zinc-500">Creator</div>
                    <div className="min-w-0 break-words">{selectedLocalSnapshot?.creator || '-'}</div>
                    <div className="text-zinc-500">Version</div>
                    <div className="min-w-0 break-words">
                      {selectedLocalSnapshot
                        ? pickSnapshotVersionName(selectedLocalSnapshot) || (pickSnapshotVersionId(selectedLocalSnapshot) ? `#${pickSnapshotVersionId(selectedLocalSnapshot)}` : '-')
                        : '-'}
                    </div>
                    <div className="text-zinc-500">Base Model</div>
                    <div className="min-w-0 break-words">{selectedLocalSnapshot?.baseModel || '-'}</div>
                    <div className="text-zinc-500">Type</div>
                    <div className="min-w-0 break-words">{selectedLocalFile?.modelType || selectedLocalFile?.extension || '-'}</div>
                    <div className="text-zinc-500">Size</div>
                    <div>{selectedLocalFile ? formatBytes(selectedLocalFile.size) : '-'}</div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Tags</div>
                    <div className="max-h-24 overflow-y-auto rounded-md border border-white/10 bg-black/25 p-2 text-xs text-zinc-300 custom-scrollbar">
                      {Array.isArray(selectedLocalSnapshot?.tags) && selectedLocalSnapshot.tags.length > 0
                        ? selectedLocalSnapshot.tags.join(', ')
                        : '-'}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Trained Words</div>
                    <div className="max-h-28 overflow-y-auto rounded-md border border-white/10 bg-black/25 p-2 text-xs text-zinc-300 custom-scrollbar">
                      {Array.isArray(selectedLocalSnapshot?.trainedWords) && selectedLocalSnapshot.trainedWords.length > 0
                        ? selectedLocalSnapshot.trainedWords.join(', ')
                        : '-'}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Description</div>
                    <div className="max-h-[42vh] overflow-y-auto rounded-md border border-white/10 bg-black/25 p-2 custom-scrollbar">
                      {selectedSnapshotDescriptionHtml ? (
                        <div
                          className="break-words text-xs leading-relaxed text-zinc-200 [&_p]:mb-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_a]:text-[var(--umbra-accent)] [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: selectedSnapshotDescriptionHtml }}
                        />
                      ) : (
                        <p className="text-xs text-zinc-500">No description available.</p>
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        ) : sourceTab === 'browser' ? (
          <div className="flex min-h-0 flex-1 flex-col bg-black/20">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--umbra-border)] px-3 py-2">
              <div className="min-w-0 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">Inline CivitAI Browser</span>
                <span className="mx-2 text-zinc-600">|</span>
                <span className="truncate">
                  Browse normally, then use API Panel or Latest when you are on a model page.
                </span>
              </div>
              {browserLoading ? (
                <div className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading
                </div>
              ) : null}
            </div>
            <div className="relative flex min-h-[34px] items-center gap-1 border-b border-[var(--umbra-border)] bg-black/25 px-2 py-1">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {browserBookmarks.length === 0 ? (
                  <div className="px-2 text-xs text-zinc-600">No bookmarks yet</div>
                ) : (
                  browserBookmarks.map((item) => item.type === 'folder' ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setBrowserOpenBookmarkFolderId((current) => current === item.id ? null : item.id);
                      }}
                      className={cn(
                        'flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 hover:text-white',
                        browserOpenBookmarkFolderId === item.id && 'bg-white/10 text-white',
                      )}
                    >
                      <FolderOpen size={13} className="shrink-0 text-zinc-400" />
                      <span className="truncate">{item.label}</span>
                      <ChevronDown size={12} className="shrink-0 text-zinc-500" />
                    </button>
                  ) : renderBrowserBookmarkLink(item))
                )}
              </div>
              <button
                type="button"
                onClick={addBrowserBookmarkFolder}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <FolderPlus size={12} />
                Folder
              </button>
              {browserOpenBookmarkFolder?.type === 'folder' ? (
                <div
                  className="absolute left-2 top-[calc(100%+4px)] z-30 w-64 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 shadow-2xl shadow-black/50 backdrop-blur"
                  onClick={(event) => event.stopPropagation()}
                >
                  {(browserOpenBookmarkFolder.children || []).length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-zinc-500">Empty folder</div>
                  ) : (
                    (browserOpenBookmarkFolder.children || []).map((item) => renderBrowserBookmarkLink(item, true))
                  )}
                </div>
              ) : null}
            </div>
            <div className="relative min-h-0 flex-1">
              {browserWebviewSupported ? (
                React.createElement('webview', {
                  key: browserWebviewKey,
                  id: browserWebviewElementId,
                  ref: setBrowserWebviewNode,
                  src: browserUrl,
                  partition: 'persist:umbra-model-manager-browser',
                  className: 'h-full w-full bg-white',
                } as any)
              ) : (
                <div className="flex h-full min-h-0 flex-col bg-[#090a10]">
                  <div className="border-b border-white/10 bg-black/25 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1">
                        {CIVITAI_DISCOVERY_TYPES.map((type) => (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => toggleCivitaiDiscoveryType(type.value)}
                            className={cn(
                              'rounded px-2 py-1 text-[11px] font-semibold',
                              civitaiDiscoveryTypes.includes(type.value)
                                ? 'bg-[var(--umbra-accent)]/25 text-white'
                                : 'text-zinc-400 hover:bg-white/10 hover:text-white',
                            )}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={civitaiDiscoverySort}
                        onChange={(event) => setCivitaiDiscoverySort(event.target.value)}
                        className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-zinc-200 outline-none"
                      >
                        {CIVITAI_DISCOVERY_SORTS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <select
                        value={civitaiDiscoveryPeriod}
                        onChange={(event) => setCivitaiDiscoveryPeriod(event.target.value)}
                        className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-zinc-200 outline-none"
                      >
                        {CIVITAI_DISCOVERY_PERIODS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <select
                        value={civitaiDiscoveryBaseModel}
                        onChange={(event) => setCivitaiDiscoveryBaseModel(event.target.value)}
                        className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs font-semibold text-zinc-200 outline-none"
                      >
                        {CIVITAI_DISCOVERY_BASE_MODELS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => void searchCivitaiDiscovery()}
                        disabled={civitaiDiscoveryLoading}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--umbra-accent)]/45 bg-[var(--umbra-accent)]/20 px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                      >
                        {civitaiDiscoveryLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                        Search
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Umbra uses its CivitAI API browser here so model search works in the portable webapp runtime.
                    </div>
                    {civitaiDiscoveryWarning ? (
                      <div className="mt-2 rounded border border-yellow-400/20 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-100">
                        {civitaiDiscoveryWarning}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
                    {civitaiDiscoveryLoading && civitaiModels.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-zinc-500">
                        <Loader2 size={32} className="animate-spin text-[var(--umbra-accent)]" />
                      </div>
                    ) : civitaiModels.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <Cloud size={38} className="text-zinc-600" />
                        <div className="mt-3 text-sm font-semibold text-zinc-300">Search CivitAI models inline</div>
                        <div className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">
                          Search by model name, paste a CivitAI model URL, or enter a model ID in the address bar above.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {civitaiModels.map((model) => {
                          const preview = getModelPreviewImage(model);
                          const latestVersion = getLatestModelVersion(model);
                          const latestFile = getDownloadableModelFile(latestVersion);
                          const flagged = isLikelyNsfw(model, preview || undefined);
                          const blurred = nsfwThumbnailBlurEnabled && flagged;
                          return (
                            <div key={`browser-result:${model.id}`} className="overflow-hidden rounded-lg border border-white/10 bg-black/30 hover:border-white/20">
                              <button
                                type="button"
                                onClick={() => void openModelViewer(model)}
                                className="block w-full text-left"
                              >
                                <div className="aspect-[4/3] overflow-hidden border-b border-white/10 bg-black/40">
                                  {preview?.url ? (
                                    isVideoMedia(preview) ? (
                                      <video
                                        src={getModelMediaSrc(preview.url)}
                                        className="h-full w-full object-cover"
                                        muted
                                        playsInline
                                        preload="metadata"
                                        style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                      />
                                    ) : (
                                      <img
                                        src={getModelMediaSrc(preview.url)}
                                        alt={`${model.name || `Model ${model.id}`} preview`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                      />
                                    )
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-zinc-600">
                                      <ImageIcon size={28} />
                                    </div>
                                  )}
                                </div>
                                <div className="p-3">
                                  <div className="line-clamp-1 text-sm font-semibold text-zinc-100">{model.name || `Model ${model.id}`}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
                                    <span>{model.type || 'Unknown'}</span>
                                    <span>|</span>
                                    <span>#{model.id}</span>
                                    {model.creator?.username ? (
                                      <>
                                        <span>|</span>
                                        <span>{model.creator.username}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400">
                                    <span>{formatCompactNumber(model.stats?.downloadCount)} downloads</span>
                                    <span>{formatCompactNumber(model.stats?.favoriteCount)} likes</span>
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center gap-2 border-t border-white/10 p-2">
                                <button
                                  type="button"
                                  onClick={() => void openModelViewer(model)}
                                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 hover:text-white"
                                >
                                  <Eye size={12} />
                                  Open
                                </button>
                                <button
                                  type="button"
                                  disabled={!latestVersion || !latestFile}
                                  onClick={() => void downloadDiscoveryModelLatest(model)}
                                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--umbra-accent)]/45 bg-[var(--umbra-accent)]/20 px-2 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
                                >
                                  <Download size={12} />
                                  Latest
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {civitaiDiscoveryHasMore && civitaiModels.length > 0 ? (
                      <div className="mt-5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => void searchCivitaiDiscovery({ append: true })}
                          disabled={civitaiDiscoveryLoading}
                          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          {civitaiDiscoveryLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                          Load More
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              {browserContextMenu.open ? (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setBrowserContextMenu((current) => ({ ...current, open: false }))}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setBrowserContextMenu((current) => ({ ...current, open: false }));
                    }}
                  />
                  <div
                    className="fixed z-50 w-56 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 text-sm shadow-2xl shadow-black/60 backdrop-blur"
                    style={{ left: browserContextMenu.x, top: browserContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    {browserContextMenu.linkUrl ? (
                      <>
                        <button type="button" onClick={() => runBrowserWebviewCommand('openLink')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><ExternalLink size={14} />Open Link</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('copyLink')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Copy size={14} />Copy Link</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('saveLink')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Download size={14} />Save Link</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('saveLinkAs')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Download size={14} />Save Link As</button>
                        <div className="my-1 border-t border-white/10" />
                      </>
                    ) : null}
                    {browserContextMenu.srcUrl ? (
                      <>
                        <button type="button" onClick={() => runBrowserWebviewCommand('openMedia')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><ExternalLink size={14} />Open Media</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('copyMedia')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Copy size={14} />Copy Media Address</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('saveMedia')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Download size={14} />Save Media</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('saveMediaAs')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Download size={14} />Save Media As</button>
                        <div className="my-1 border-t border-white/10" />
                      </>
                    ) : null}
                    <button type="button" onClick={() => runBrowserWebviewCommand('back')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><ArrowLeft size={14} />Back</button>
                    <button type="button" onClick={() => runBrowserWebviewCommand('forward')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><ArrowRight size={14} />Forward</button>
                    <button type="button" onClick={() => runBrowserWebviewCommand('reload')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><RefreshCw size={14} />Reload</button>
                    <button type="button" onClick={() => runBrowserWebviewCommand('copyPage')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Copy size={14} />Copy Page Address</button>
                    <div className="my-1 border-t border-white/10" />
                    {browserContextMenu.selectionText ? (
                      <button type="button" onClick={() => runBrowserWebviewCommand('copySelection')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Copy size={14} />Copy Selection</button>
                    ) : null}
                    <button type="button" onClick={() => runBrowserWebviewCommand('copy')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white"><Copy size={14} />Copy</button>
                    {browserContextMenu.isEditable ? (
                      <>
                        <button type="button" onClick={() => runBrowserWebviewCommand('cut')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white">Cut</button>
                        <button type="button" onClick={() => runBrowserWebviewCommand('paste')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white">Paste</button>
                      </>
                    ) : null}
                    <button type="button" onClick={() => runBrowserWebviewCommand('selectAll')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white">Select All</button>
                  </div>
                </>
              ) : null}
              {browserDownloadsOpen ? (
                <div className="absolute right-3 top-3 z-20 flex max-h-[min(520px,calc(100%-24px))] w-[420px] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/50 backdrop-blur">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-black text-white"><Download size={15} />Downloads</div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void (window as any).umbraDesktop?.openBrowserDownloadsFolder?.()} className="h-7 w-7 rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" title="Open downloads folder"><FolderOpen size={14} className="mx-auto" /></button>
                      <button type="button" onClick={() => void clearCompletedBrowserDownloads()} className="h-7 w-7 rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" title="Clear finished downloads"><Trash2 size={14} className="mx-auto" /></button>
                      <button type="button" onClick={() => setBrowserDownloadsOpen(false)} className="h-7 w-7 rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" title="Close downloads"><X size={14} className="mx-auto" /></button>
                    </div>
                  </div>
                  <div className="min-h-0 overflow-auto p-2">
                    {browserDownloads.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-zinc-500">No downloads yet.</div>
                    ) : (
                      browserDownloads.slice().reverse().map((item) => {
                        const total = Math.max(0, item.totalBytes || 0);
                        const received = Math.max(0, item.receivedBytes || 0);
                        const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
                        return (
                          <div key={item.id} className="mb-2 rounded-md border border-white/10 bg-white/[0.04] p-3 last:mb-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-100">{item.fileName}</div>
                                <div className="mt-0.5 truncate text-[11px] text-zinc-500">{item.savePath}</div>
                              </div>
                              <div className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-200">{item.state}</div>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full bg-[var(--umbra-accent)]" style={{ width: `${item.state === 'completed' ? 100 : percent}%` }} />
                            </div>
                            <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
                              <span>{formatBytes(received)}{total ? ` / ${formatBytes(total)}` : ''}</span>
                              <span>{item.state === 'completed' ? 'Done' : total ? `${percent}%` : 'Receiving'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
              {browserHistoryOpen ? (
                <div className="absolute right-3 top-3 z-20 flex max-h-[min(560px,calc(100%-24px))] w-[460px] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/50 backdrop-blur">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-black text-white"><Clock size={15} />History</div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setBrowserHistory([])} className="h-7 w-7 rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" title="Clear history"><Trash2 size={14} className="mx-auto" /></button>
                      <button type="button" onClick={() => setBrowserHistoryOpen(false)} className="h-7 w-7 rounded-md text-zinc-300 hover:bg-white/10 hover:text-white" title="Close history"><X size={14} className="mx-auto" /></button>
                    </div>
                  </div>
                  <div className="min-h-0 overflow-auto p-2">
                    {browserHistory.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-zinc-500">No browser history yet.</div>
                    ) : (
                      browserHistory.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => {
                            setBrowserHistoryOpen(false);
                            navigateBrowser(entry.url);
                          }}
                          title={entry.url}
                          className="mb-1 flex w-full flex-col rounded-md border border-transparent px-3 py-2 text-left hover:border-white/10 hover:bg-white/[0.06]"
                        >
                          <span className="truncate text-sm font-semibold text-zinc-100">{entry.title || titleFromBrowserUrl(entry.url)}</span>
                          <span className="truncate text-[11px] text-zinc-500">{entry.url}</span>
                          <span className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">{new Date(entry.visitedAt).toLocaleString()}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)]">
                <div>
                  <div className="text-sm font-semibold text-white">CivitAI Downloader</div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                    Paste a CivitAI model URL or model ID above, then click
                    <span className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-100">Open Link</span>
                    to load the model and download files.
                  </p>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Example: <span className="font-mono">https://civitai.com/models/12345</span> or <span className="font-mono">12345</span>
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                      <KeyRound size={13} className="text-[var(--umbra-accent)]" />
                      CivitAI Account
                    </div>
                    <span
                      className={cn(
                        'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        civitaiAuthStatus.hasToken
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-zinc-400',
                      )}
                    >
                      {civitaiAuthStatus.hasToken ? 'Connected' : 'No Token'}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    {civitaiAuthStatus.hasToken && civitaiAuthStatus.maskedToken
                      ? `Saved token: ${civitaiAuthStatus.maskedToken}`
                      : 'Add your CivitAI API token to download login-required models.'}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={civitaiTokenInputRef}
                      type="password"
                      value={civitaiTokenInput}
                      onChange={(event) => setCivitaiTokenInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveCivitaiAuthToken();
                      }}
                      placeholder={civitaiAuthStatus.hasToken ? 'Paste a replacement token...' : 'Paste CivitAI API token...'}
                      className="min-w-[220px] flex-1 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]/70"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCivitaiAuthToken()}
                      disabled={civitaiAuthSaving}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--umbra-accent)]/50 bg-[var(--umbra-accent)]/20 px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      {civitaiAuthSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Save
                    </button>
                    {civitaiAuthStatus.hasToken ? (
                      <button
                        type="button"
                        onClick={() => void removeCivitaiAuthToken()}
                        disabled={civitaiAuthSaving}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
                      >
                        <X size={12} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {groupedCivitaiModels.length > 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Opened This Session</div>
                <div className="space-y-3">
                  {groupedCivitaiModels.map((group) => (
                    <div key={`group:${group.label}`} className="rounded-lg border border-white/10 bg-black/25 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">{group.label}</div>
                        <div className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {group.items.length}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((model) => {
                          const preview = getModelPreviewImage(model);
                          const flagged = isLikelyNsfw(model, preview || undefined);
                          const blurred = nsfwThumbnailBlurEnabled && flagged;
                          const isRefreshing = civitaiModelAction?.id === model.id && civitaiModelAction.kind === 'refresh';
                          const isDeleting = civitaiModelAction?.id === model.id && civitaiModelAction.kind === 'delete';
                          return (
                            <div
                              key={`opened:${model.id}`}
                              className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-2 hover:border-white/20 hover:bg-black/40"
                            >
                              <button
                                type="button"
                                onClick={() => void openModelViewer(model)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <div className="h-12 w-16 shrink-0 overflow-hidden rounded border border-white/10 bg-black/40">
                                  {preview?.url ? (
                                    isVideoMedia(preview) ? (
                                      <video
                                        src={getModelMediaSrc(preview.url)}
                                        className="h-full w-full object-cover"
                                        muted
                                        loop
                                        playsInline
                                        preload="metadata"
                                        style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                      />
                                    ) : (
                                      <img
                                        src={getModelMediaSrc(preview.url)}
                                        alt={`${model.name || `Model ${model.id}`} thumbnail`}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                      />
                                    )
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-zinc-600">
                                      <ImageIcon size={14} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-semibold text-zinc-100">{model.name || `Model ${model.id}`}</div>
                                  <div className="truncate text-[11px] text-zinc-500">#{model.id} {model.type ? `| ${model.type}` : ''}</div>
                                </div>
                                <Eye size={13} className="text-zinc-400" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void refreshSavedModelCache(model.id);
                                }}
                                disabled={Boolean(civitaiModelAction)}
                                className="rounded border border-white/10 p-1 text-zinc-300 hover:text-white disabled:opacity-50"
                                title="Refresh saved cache from CivitAI"
                              >
                                {isRefreshing ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <RefreshCw size={12} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void deleteSavedModelCache(model.id);
                                }}
                                disabled={Boolean(civitaiModelAction)}
                                className="rounded border border-red-400/30 p-1 text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                                title="Delete saved model from cache"
                              >
                                {isDeleting ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeModel ? (
          <div className="absolute inset-0 z-[1500] bg-black/72">
            <div className="flex h-full w-full flex-col overflow-hidden bg-[#0f1118] shadow-2xl shadow-black/60">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{activeModel.name}</div>
                  <div className="text-xs text-zinc-400">
                    {activeModel.type || 'Unknown type'} | by {activeModel.creator?.username || 'Unknown'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshSavedModelCache(activeModel.id)}
                    disabled={Boolean(civitaiModelAction)}
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-zinc-300 hover:text-white disabled:opacity-50"
                  >
                    {civitaiModelAction?.id === activeModel.id && civitaiModelAction.kind === 'refresh' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Refresh Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSavedModelCache(activeModel.id)}
                    disabled={Boolean(civitaiModelAction)}
                    className="inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-500/15 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {civitaiModelAction?.id === activeModel.id && civitaiModelAction.kind === 'delete' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Delete Saved
                  </button>
                  <a
                    href={`https://civitai.com/models/${activeModel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                  >
                    <ExternalLink size={12} />
                    Open in CivitAI
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModelId(null);
                      setActiveModelImageUrl('');
                    }}
                    className="rounded border border-white/10 p-1.5 text-zinc-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-3 p-3">
                <div className="min-h-0 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  <div className="relative flex h-[clamp(210px,28vh,360px)] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/50">
                    {activeModelImageUrl ? (
                      (() => {
                        const image = activeAllMedia.find((item) => item.url === activeModelImageUrl);
                        const flagged = isLikelyNsfw(activeModel, image);
                        const blurred = nsfwThumbnailBlurEnabled && flagged && !revealedNsfwMedia.has(activeModelImageUrl);
                        const style = blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined;
                        if (isVideoMedia(image)) {
                          return (
                            <video
                              src={getModelMediaSrc(activeModelImageUrl)}
                              className="h-full w-full object-contain"
                              muted
                              loop
                              autoPlay
                              playsInline
                              controls
                              preload="metadata"
                              style={style}
                            />
                          );
                        }
                        return (
                          <img
                            src={getModelMediaSrc(activeModelImageUrl)}
                            alt={activeModel.name}
                            className="h-full w-full object-contain"
                            style={style}
                          />
                        );
                      })()
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-500">
                        <ImageIcon size={28} />
                      </div>
                    )}
                    {activeModelImageUrl && nsfwThumbnailBlurEnabled ? (
                      (() => {
                        const image = activeAllMedia.find((item) => item.url === activeModelImageUrl);
                        const flagged = isLikelyNsfw(activeModel, image);
                        const blurred = flagged && !revealedNsfwMedia.has(activeModelImageUrl);
                        if (!flagged || !blurred) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setRevealedNsfwMedia((prev) => {
                                const next = new Set(prev);
                                next.add(activeModelImageUrl);
                                return next;
                              });
                            }}
                            className="absolute left-2 top-2 rounded border border-white/20 bg-black/75 px-2 py-1 text-[10px] font-semibold text-zinc-100 hover:bg-black/90"
                          >
                            Reveal NSFW
                          </button>
                        );
                      })()
                    ) : null}
                  </div>

                  {activeModelImages.length > 0 ? (
                    <div className="space-y-1">
                      <div className="px-1 text-[10px] uppercase tracking-wide text-zinc-500">Model Uploads</div>
                      <div
                        className="h-[150px] overflow-x-auto overflow-y-hidden rounded-lg border border-white/10 bg-black/35 p-2 custom-scrollbar scroll-smooth"
                        onWheel={handleMediaStripWheel}
                      >
                        <div className="grid grid-flow-col grid-rows-2 gap-2">
                          {activeModelImages.map((image, index) => {
                            const flagged = isLikelyNsfw(activeModel, image);
                            const blurred = nsfwThumbnailBlurEnabled && flagged && !revealedNsfwMedia.has(image.url);
                            return (
                              <button
                                key={`${image.url}:${index}`}
                                type="button"
                                onClick={() => setActiveModelImageUrl(image.url)}
                                className={cn(
                                  'relative h-16 w-24 overflow-hidden rounded border bg-black/40',
                                  activeModelImageUrl === image.url
                                    ? 'border-[var(--umbra-accent)]'
                                    : 'border-white/10 hover:border-white/30',
                                )}
                              >
                                {isVideoMedia(image) ? (
                                  <video
                                    src={getModelMediaSrc(image.url)}
                                    className="h-full w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                    style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                  />
                                ) : (
                                  <img
                                    src={getModelMediaSrc(image.url)}
                                    alt={`${activeModel.name} preview ${index + 1}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    style={blurred ? { filter: `blur(${nsfwBlurPx.toFixed(2)}px)` } : undefined}
                                  />
                                )}
                                {isVideoMedia(image) ? (
                                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold text-zinc-100">
                                    VID
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">Model Description</div>
                    <div className="h-[clamp(260px,46vh,620px)] overflow-y-auto custom-scrollbar rounded bg-black/25 p-2">
                      {activeModelDescriptionHtml ? (
                        <div
                          className="break-words text-xs leading-relaxed text-zinc-200 [&_p]:mb-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_a]:text-[var(--umbra-accent)] [&_a]:underline"
                          dangerouslySetInnerHTML={{ __html: activeModelDescriptionHtml }}
                        />
                      ) : (
                        <p className="text-xs text-zinc-500">No description provided.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex flex-col gap-3 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="rounded-md border border-white/10 bg-black/25 p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">Preview Actions</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyJsonToClipboard('Media JSON', activePreviewJson)}
                        disabled={!activePreviewJson}
                        className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[10px] text-zinc-200 hover:text-white disabled:opacity-45"
                      >
                        <Copy size={11} />
                        Copy Media JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyJsonToClipboard('Workflow JSON', activePreviewWorkflow || '')}
                        disabled={!activePreviewWorkflow}
                        className="inline-flex items-center gap-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-[10px] text-zinc-200 hover:text-white disabled:opacity-45"
                      >
                        <Copy size={11} />
                        Copy Workflow
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-md border border-white/10 bg-black/25 p-2 text-[11px] text-zinc-300">
                    <div>Downloads: {formatCompactNumber(activeModel.stats?.downloadCount)}</div>
                    <div>Favorites: {formatCompactNumber(activeModel.stats?.favoriteCount)}</div>
                    <div>Comments: {formatCompactNumber(activeModel.stats?.commentCount)}</div>
                    <div>Rating: {Number(activeModel.stats?.rating || 0).toFixed(2)}</div>
                  </div>

                  {activeModelLoRaTags.length > 0 ? (
                    <div className="rounded-md border border-violet-400/25 bg-violet-500/10 p-2">
                      <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                        <Sparkles size={12} />
                        LoRA Trigger Tags
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activeModelLoRaTags.map((token) => (
                          <button
                            key={`viewer:lora:${token}`}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(token).catch(() => {});
                              addToast({ type: 'success', message: `Copied tag: ${token}` });
                            }}
                            className="rounded border border-violet-400/25 bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-100 hover:bg-violet-500/30"
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="min-h-0 flex flex-1 flex-col space-y-2 rounded-md border border-white/10 bg-black/25 p-2">
                    <div className="text-[11px] uppercase tracking-wide text-zinc-400">Files</div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                      {(activeModel.modelVersions || []).map((version) => (
                        <div key={version.id} className="rounded border border-white/10 bg-black/25 p-2">
                          <div className="truncate text-xs font-semibold text-zinc-100">{version.name}</div>
                          {version.baseModel ? (
                            <div className="mt-0.5 text-[10px] text-zinc-500">Base: {version.baseModel}</div>
                          ) : null}
                          <div className="mt-1 space-y-1">
                            {(version.files || []).map((file) => (
                              <div key={`${version.id}:${file.name}`} className="flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[11px] text-zinc-300">{file.name}</div>
                                  <div className="text-[10px] text-zinc-500">{formatBytes((file.sizeKB || 0) * 1024)}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void startDownload(activeModel, file, version)}
                                  className="inline-flex items-center gap-1 rounded border border-[var(--umbra-accent)]/40 bg-[var(--umbra-accent)]/20 px-2 py-1 text-[10px] text-white hover:brightness-110"
                                >
                                  <Download size={10} />
                                  Download
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {Object.keys(localTransferJobs).length > 0 ? (
          <div className="border-t border-[var(--umbra-border)] bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Transfers</div>
              <button
                type="button"
                onClick={clearFinishedTransfers}
                className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:text-white"
              >
                Clear Finished
              </button>
            </div>
            <div className="max-h-[140px] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
              {Object.values(localTransferJobs)
                .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0))
                .map((job) => {
                  const percent = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
                  const verb = job.mode === 'copy' ? 'Copying' : 'Moving';
                  const finishedVerb = job.mode === 'copy' ? 'Copied' : 'Moved';
                  const label = job.status === 'completed'
                    ? finishedVerb
                    : job.status === 'failed'
                      ? `${finishedVerb} failed`
                      : verb;
                  return (
                    <div key={job.jobId} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-zinc-200">
                            {label} {job.totalPaths || 1} item(s)
                          </div>
                          <div className="truncate text-[10px] text-zinc-500" title={job.currentPath || job.destination || '-'}>
                            {job.currentPath || job.destination || '-'}
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-400">{percent}%</div>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-white/10">
                        <div
                          className={cn(
                            'h-1.5 rounded transition-[width] duration-200',
                            job.status === 'failed' ? 'bg-red-400' : 'bg-[var(--umbra-accent)]',
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="mt-1 truncate text-[10px] text-zinc-500" title={job.destination || '-'}>
                        {job.status === 'failed' ? (job.error || 'Transfer failed') : job.destination || '-'}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}

        {Object.keys(downloadJobs).length > 0 ? (
          <div className="border-t border-[var(--umbra-border)] bg-black/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Downloads</div>
              <button
                type="button"
                onClick={clearFinishedDownloads}
                className="rounded border border-white/10 px-2 py-1 text-[10px] text-zinc-300 hover:text-white"
              >
                Clear Finished
              </button>
            </div>
            <div className="max-h-[140px] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
              {Object.values(downloadJobs)
                .sort((a, b) => String(a.fileName).localeCompare(String(b.fileName)))
                .map((job) => (
                  <div key={job.jobId} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-zinc-200">{job.fileName}</div>
                        <div className="text-[10px] text-zinc-500">{job.status}</div>
                      </div>
                      <div className="text-[11px] text-zinc-400">{Math.max(0, Math.min(100, Math.round(job.progress || 0)))}%</div>
                      {(job.status === 'queued' || job.status === 'downloading') ? (
                        <button
                          type="button"
                          onClick={() => void cancelDownload(job.jobId)}
                          className="rounded border border-white/10 p-1 text-zinc-400 hover:text-white"
                          title="Cancel download"
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                      {job.status === 'completed' && !isUmbraRemoteClient() ? (
                        <button
                          type="button"
                          onClick={() => void revealSpecificPath(job.destinationPath)}
                          className="rounded border border-white/10 p-1 text-zinc-400 hover:text-white"
                          title="Reveal in Explorer"
                        >
                          <ExternalLink size={12} />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-white/10">
                      <div
                        className="h-1.5 rounded bg-[var(--umbra-accent)] transition-[width] duration-200"
                        style={{ width: `${Math.max(0, Math.min(100, Math.round(job.progress || 0)))}%` }}
                      />
                    </div>
                    <div className="mt-1 truncate text-[10px] text-zinc-500" title={job.destinationPath || '-'}>
                      {job.destinationPath || '-'}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {actionDialog ? (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-[520px] rounded-xl border border-white/15 bg-[#0f1118] p-4 shadow-2xl shadow-black/60">
              <div className="text-sm font-semibold text-white">{actionDialog.title}</div>
              <div className="mt-1 break-all text-xs text-zinc-400">{actionDialog.description}</div>

              {actionDialog.mode !== 'delete' ? (
                <input
                  type="text"
                  value={actionDialog.value}
                  onChange={(event) => setActionDialog((prev) => prev ? { ...prev, value: event.target.value } : prev)}
                  placeholder={actionDialog.placeholder}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setActionDialog(null);
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      void submitActionDialog();
                    }
                  }}
                  className="mt-3 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--umbra-accent)]/70"
                />
              ) : (
                <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  Deleted items cannot be recovered automatically.
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionDialog(null)}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitActionDialog()}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold',
                    actionDialog.mode === 'delete'
                      ? 'border border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : 'border border-[var(--umbra-accent)]/50 bg-[var(--umbra-accent)]/20 text-white hover:brightness-110',
                  )}
                >
                  {actionDialog.mode === 'delete' ? <Trash2 size={12} /> : <Check size={12} />}
                  {actionDialog.submitLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {contextMenu ? (
          <div
            className="fixed z-[1500] w-max min-w-0 rounded-lg border border-white/15 bg-[#0f1118] p-1.5 shadow-xl shadow-black/60"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {(contextMenu.isFolder || !isUmbraRemoteClient()) ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                onClick={() => {
                  setContextMenu(null);
                  if (contextMenu.isFolder) handleOpenFolder(contextMenu.targetPath);
                  else void handleReveal(contextMenu.targetPath);
                }}
              >
                {contextMenu.isFolder ? <Folder size={12} /> : <ExternalLink size={12} />}
                <span>{contextMenu.isFolder ? 'Open Folder' : 'Reveal in Explorer'}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              onClick={() => {
                setContextMenu(null);
                void handleCopy(contextMenu.targetPath);
              }}
            >
              <Copy size={12} />
              <span>Copy</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              onClick={() => {
                setContextMenu(null);
                void handleMove(contextMenu.targetPath);
              }}
            >
              <Move size={12} />
              <span>Move</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              onClick={() => {
                setContextMenu(null);
                void handleRename(contextMenu.targetPath);
              }}
            >
              <Pencil size={12} />
              <span>Rename</span>
            </button>
            {contextMenu.isFolder ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                onClick={() => {
                  setContextMenu(null);
                  void handleCreateFolder(contextMenu.targetPath);
                }}
              >
                <FolderPlus size={12} />
                <span>New Subfolder</span>
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-200 hover:bg-red-500/20"
              onClick={() => {
                setContextMenu(null);
                void handleDelete(contextMenu.targetPath);
              }}
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          </div>
        ) : null}

        {dropActionMenu ? (
          <div
            className="fixed z-[1520] w-max min-w-0 rounded-lg border border-white/15 bg-[#0f1118] p-1.5 shadow-xl shadow-black/60"
            style={{ left: dropActionMenu.x, top: dropActionMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              onClick={() => {
                const menu = dropActionMenu;
                setDropActionMenu(null);
                if (!menu) return;
                void runDropAction('move', menu.destinationPath, menu.sourcePaths);
              }}
            >
              <Move size={12} />
              <span>Move Here</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              onClick={() => {
                const menu = dropActionMenu;
                setDropActionMenu(null);
                if (!menu) return;
                void runDropAction('copy', menu.destinationPath, menu.sourcePaths);
              }}
            >
              <Copy size={12} />
              <span>Copy Here</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              onClick={() => setDropActionMenu(null)}
            >
              <X size={12} />
              <span>Cancel</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
