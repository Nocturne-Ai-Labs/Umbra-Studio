
import React, { forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Ban, Check, ChevronDown, ChevronRight, ChevronUp, Copy, Folder, FolderOpen, ImageIcon, Info, Link2, Loader2, Maximize2, Minimize2, Pencil, Plus, RefreshCw, RotateCw, Scissors, Shuffle, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useToastStore } from '@/store/useToastStore';
import { fetchAppSettingsFromBackend, loadAppSettings, pushAppSettingsToBackend } from '@/lib/appSettings';
import { deleteUserConfig, readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { deletePathsWithSettings } from '@/utils/trashActions';
import { extractGenerationParams, extractMetadataFromFile } from '@/utils/metadata';
import type { ImageMetadata } from '@/utils/metadata';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS,
  getQueueCycleWeightForSet,
  normalizePowerPrompterGenerationControls,
  normalizePowerPrompterPromptText,
  normalizeQueueTraversalRole,
  POWER_PROMPTER_ASPECT_RATIO_OPTIONS,
  POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT,
  POWER_PROMPTER_MAX_QUEUE_SETS,
  POWER_PROMPTER_SAMPLER_OPTIONS,
  POWER_PROMPTER_SCHEDULER_OPTIONS,
} from '@/lib/powerPrompter';
import { writePowerPrompterCardClipboard } from '@/lib/powerPrompterCardClipboard';
import {
  buildPowerPrompterActivePromptBlocks,
} from '@/lib/powerPrompterActivePrompt';
import { PowerPrompterActivePromptInline } from './PowerPrompterActivePromptInline';
import {
  PowerPrompterPromptChips,
  type PowerPrompterPromptChipConfig,
} from './PowerPrompterPromptChips';
import { buildMediaRevisionToken } from '@/lib/utils';
import { fetchGalleryFs, galleryBridgeFsUrl, normalizeGalleryFsUrl } from '@/lib/galleryBridgeFs';
import type {
  PowerPrompterCardDocument,
  PowerPrompterDeletedCardGroup,
  PowerPrompterCardNode,
  PowerPrompterCardType,
  PowerPrompterGenerationControls,
  PowerPrompterLoraEntry,
  PowerPrompterModelType,
  PowerPrompterQueueTraversalMode,
  PowerPrompterQueueTraversalRole,
} from '@/types/powerPrompter';
import type { PowerPrompterPipelineItem } from '@/components/power-prompter/pipelines/usePowerPrompterPipelines';
import { usePowerPrompterStageCatalog } from '@/components/power-prompter/pipelines/usePowerPrompterStageCatalog';
import { UmbraHiresFixControls } from '@/components/umbra-ui/UmbraHiresFixControls';
import { UmbraDetailerPipelineControls } from '@/components/umbra-ui/UmbraDetailerPipelineControls';
import {
  normalizeUmbraUiPipelineCapabilities,
  normalizeUmbraUiPipelineSelection,
  type UmbraUiPipelineModelSource,
} from '../../../../shared/umbra-ui/pipelineTypes';

export interface PowerPrompterCardChainEditorRef {
  insertAtCursor: (text: string) => void;
  refreshOutputPreview: () => void;
}

export interface PowerPrompterOutputPreviewItem {
  id: string;
  path: string;
  name: string;
  thumbnailUrl: string;
  imageUrl: string;
  type: OutputPreviewType;
  modified: number;
}

export interface PowerPrompterOutputPreviewSnapshot {
  items: PowerPrompterOutputPreviewItem[];
  isLoading: boolean;
  error: string | null;
}

interface PowerPrompterQueuePromptEntry {
  prompt: string;
  tokens: Array<{
    slotId: string;
    variantId: string;
  }>;
}

interface PowerPrompterQueueVisualState {
  requestId: string;
  mode: 'prompt' | 'selected' | 'variants';
  activeSetId: number;
  prompts: string[];
  promptEntries?: PowerPrompterQueuePromptEntry[];
  promptIds?: string[];
  promptSeeds?: number[];
  activeIndex: number;
  jobProgress: number;
}

interface PowerPrompterGenerationPreviewState {
  requestId: string;
  promptId: string;
  promptIndex: number;
  imageDataUrl: string;
  step: number;
  maxStep: number;
  status: 'running' | 'idle';
  updatedAt: number;
}

interface PowerPrompterCardChainEditorProps {
  document: PowerPrompterCardDocument;
  queueTargetType?: 'pipeline';
  pipelines?: PowerPrompterPipelineItem[];
  isActive?: boolean;
  queueVisualState?: PowerPrompterQueueVisualState | null;
  queuePreviewPrompts?: string[];
  queuePreviewEntries?: PowerPrompterQueuePromptEntry[];
  queueCyclePreviewPrompts?: string[];
  queueCyclePreviewEntries?: PowerPrompterQueuePromptEntry[];
  queueShuffleEnabled?: boolean;
  queueShuffleSeed?: number;
  queueTraversalMode?: PowerPrompterQueueTraversalMode;
  queuePreviewSetId?: number;
  queueCompletionTick?: number;
  outputPreviewActive?: boolean;
  generationPreview?: PowerPrompterGenerationPreviewState | null;
  generationPreviewHoldMs?: number | null;
  onChangeGenerationPreviewHoldMs?: (nextMs: number | null) => void;
  queueSetTarget?: number;
  editorResetTick?: number;
  globalSearchQuery?: string;
  globalSearchFocusValue?: string;
  globalSearchFocusNonce?: number;
  loraCatalog?: string[];
  onRefreshLoraCatalog?: (showFeedback?: boolean) => void | Promise<void>;
  onRequestLoraInfo?: (loraName: string, options?: { previewOnly?: boolean }) => Promise<PowerPrompterLoraInfoPayload>;
  modelCatalog?: string[];
  onRefreshModelCatalog?: (showFeedback?: boolean) => void | Promise<void>;
  onRequestModelInfo?: (modelName: string, options?: { previewOnly?: boolean }) => Promise<PowerPrompterModelInfoPayload>;
  onChange: (nextDocument: PowerPrompterCardDocument) => void;
  onActivePromptTypeProgress?: (charsAdded: number) => void;
  onChainLinkFeedback?: (event: 'anchor' | 'toggle' | 'save' | 'clear' | 'done') => void;
  path: string | null;
  enabledCSVs: string[];
  overlayMode?: boolean;
  mobileSelectionMode?: boolean;
  touchRemoteMode?: boolean;
  queueTrackerCard?: React.ReactNode;
  onOutputPreviewSnapshotChange?: (snapshot: PowerPrompterOutputPreviewSnapshot) => void;
}

interface PowerPrompterLoraInfoPayload {
  loraName: string;
  metadata: Record<string, unknown>;
  civitai: Record<string, unknown> | null;
  trainedTags: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

interface PowerPrompterModelInfoPayload {
  modelName: string;
  metadata: Record<string, unknown>;
  civitai: Record<string, unknown> | null;
  trainedTags: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

interface PowerPrompterLoraCardMeta {
  civitaiUrl: string;
  thumbnailUrl: string;
  thumbnailUrls: string[];
}

interface LoraBrowserFolderEntry {
  path: string;
  label: string;
  depth: number;
  fileCount: number;
}

interface FolderTreeRow {
  entry: LoraBrowserFolderEntry;
  hasChildren: boolean;
  expanded: boolean;
}

interface LoraBrowserFileEntry {
  path: string;
  folder: string;
  name: string;
  modelType?: PowerPrompterModelType;
}

interface ChainSlot {
  slotId: string;
  type: PowerPrompterCardType;
  label: string;
  variants: PowerPrompterCardNode[];
}

const QUEUE_TRAVERSAL_ROLE_ORDER: PowerPrompterQueueTraversalRole[] = ['hold', 'cycle', 'fast'];

function getNextQueueTraversalRole(role: unknown): PowerPrompterQueueTraversalRole {
  const normalized = normalizeQueueTraversalRole(role);
  const index = QUEUE_TRAVERSAL_ROLE_ORDER.indexOf(normalized);
  return QUEUE_TRAVERSAL_ROLE_ORDER[(index + 1) % QUEUE_TRAVERSAL_ROLE_ORDER.length] || 'cycle';
}

function getSlotQueueTraversalRole(slot: Pick<ChainSlot, 'variants'> | null | undefined): PowerPrompterQueueTraversalRole {
  return normalizeQueueTraversalRole(slot?.variants?.[0]?.queueTraversalRole);
}

function getQueueTraversalRoleLabel(role: PowerPrompterQueueTraversalRole): string {
  if (role === 'hold') return 'Hold';
  if (role === 'fast') return 'Fast';
  return 'Cycle';
}

function getQueueTraversalRoleTitle(role: PowerPrompterQueueTraversalRole): string {
  if (role === 'hold') return 'Hold: this card changes slowest and keeps a run grouped around one variant.';
  if (role === 'fast') return 'Fast: this card changes most often inside the current Hold/Cycle group.';
  return 'Cycle: this card changes between Hold cards and Fast cards.';
}

interface QueueVariantState {
  status: 'Active' | 'Queue' | 'Disabled';
  position: { position: number; total: number; remaining: number } | null;
  cycleCount: number;
  futureCycleCount?: number;
}

interface VariantViewportMetrics {
  clientHeight: number;
  scrollTop: number;
}

interface CardMenuState {
  slotId: string;
  x: number;
  y: number;
  preferAbove?: boolean;
}

interface PendingSlotDeleteState {
  slotId: string;
  label: string;
  variants: number;
}

interface CardLabelModalState {
  slotId: string;
  draftLabel: string;
}

interface CardRandomMenuState {
  slotId: string;
  x: number;
  y: number;
  preferAbove?: boolean;
  selectedNames: string[];
  nameQuery: string;
  maxVariants: number;
  targetSetId: number;
}

interface VariantDragState {
  slotId: string;
  variantId: string;
}

interface PromptChipEditState {
  variantId: string;
  chipIndex: number;
  value: string;
}

interface ChainLinkEditorState {
  mode: 'link' | 'block';
  anchorSlotId: string;
  anchorVariantId: string;
  draftVariantIds: string[];
  savedVariantIds: string[];
}

interface OutputPreviewMenuState {
  item: OutputPreviewItem;
  x: number;
  y: number;
}

interface DirectOutputPreviewDescriptor {
  fullpath?: string;
  fullPath?: string;
  path?: string;
  filename?: string;
  name?: string;
  subfolder?: string;
  type?: string;
  modified?: number;
}

interface PendingGalleryOpenPathPayload {
  path: string;
  folderPath?: string;
  imagePath?: string;
  source?: string;
}

interface LoraBrowserFileMenuState {
  path: string;
  x: number;
  y: number;
}

interface LoraBrowserFolderMenuState {
  path: string;
  x: number;
  y: number;
}

interface ExpandedVariantEditorState {
  slotId: string;
  variantId: string;
  slotLabel: string;
  variantName: string;
  draft: string;
  queueSetIds: number[];
  slotIndex?: number;
  variantIndex?: number;
  dirty?: boolean;
}

interface ExpandedVariantSuggestionEntry {
  tag: string;
  category: number;
  extra?: string;
  source?: string;
  type: 'tag' | 'character';
}

type OutputPreviewType = 'image' | 'video' | 'gif';
interface OutputPreviewItem extends PowerPrompterOutputPreviewItem {
  id: string;
  path: string;
  name: string;
  thumbnailUrl: string;
  imageUrl: string;
  type: OutputPreviewType;
  modified: number;
}

const OUTPUT_PREVIEW_SNAPSHOT_LIMIT = 300;
const OUTPUT_PREVIEW_COMPLETION_REFRESH_DEBOUNCE_MS = 1800;
const VARIANT_TEXTAREA_COLLAPSED_LINES = 2;
const VARIANT_TEXTAREA_LINE_HEIGHT_PX = 20;
const VARIANT_TEXTAREA_COLLAPSED_HEIGHT_PX = VARIANT_TEXTAREA_COLLAPSED_LINES * VARIANT_TEXTAREA_LINE_HEIGHT_PX;
const OUTPUT_PREVIEW_INITIAL_CANDIDATE_LIMIT = 600;
const OUTPUT_PREVIEW_MAX_CANDIDATE_LIMIT = 1200;
const OUTPUT_PREVIEW_METADATA_SCAN_LIMIT = 240;
const OUTPUT_PREVIEW_METADATA_SCAN_TIMEOUT_MS = 1200;
const OUTPUT_PREVIEW_FOLDER_SCAN_LIMIT = 96;
const OUTPUT_PREVIEW_FOLDER_FANOUT = 16;
const OUTPUT_PREVIEW_MAX_SCAN_DEPTH = 4;
const OUTPUT_PREVIEW_PATH_LIST_LIMIT = 256;
const OUTPUT_PREVIEW_REFRESH_MS = 120000;
const OUTPUT_PREVIEW_DEFAULT_ROOTS = ['Tools/ComfyUI/output', 'User/Outputs'];
const LORA_BROWSER_ROOT_CANDIDATES = [
  'Tools/ComfyUI/models/loras',
  'ComfyUI-Models/loras',
  'User/Models/loras',
  'resources/app/Tools/ComfyUI/models/loras',
];
const MODEL_BROWSER_ROOT_CANDIDATES = [
  'Tools/ComfyUI/models',
  'ComfyUI-Models',
  'User/Models',
  'resources/app/Tools/ComfyUI/models',
];
const THUMBNAIL_OVERRIDE_MAX_ITEMS_PER_ENTRY = 12;
const THUMBNAIL_OVERRIDE_MAX_DATA_URL_LENGTH = 2200000;
const THUMBNAIL_PICK_MAX_FILES = 8;
const GLOBAL_THUMBNAIL_OVERRIDES_STORAGE_KEY = 'umbra.powerprompter.globalThumbnailOverrides.v1';
const LOCAL_THUMBNAIL_SUFFIX = '__thumb_';
const IMAGE_PREVIEW_EXT_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?)(?:[?#].*)?$/i;
const VIDEO_PREVIEW_EXT_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv|wmv|flv)(?:[?#].*)?$/i;
const MODEL_BROWSER_IGNORE_FILE_PATTERN = /\.(sha256|sha1|md5)$/i;
const MODEL_BROWSER_FILE_PATTERN = /\.(safetensors|ckpt|pt|pth|bin|gguf)$/i;
const MODEL_BROWSER_ALLOWED_TOP_FOLDERS = new Set(['checkpoints', 'diffusion_models', 'unet', 'diffusers']);
const MODEL_BROWSER_TYPE_FOLDER_BY_ROOT_LEAF: Record<string, string> = {
  checkpoint: 'checkpoints',
  checkpoints: 'checkpoints',
  diffusion_model: 'diffusion_models',
  diffusion_models: 'diffusion_models',
  unet: 'unet',
  unets: 'unet',
  diffusers: 'diffusers',
  gguf: 'diffusion_models',
};
const POWER_PROMPTER_MODEL_BROWSER_TYPES: PowerPrompterModelType[] = ['checkpoint', 'diffusers', 'diffusion_model', 'unet', 'gguf'];
const POWER_PROMPTER_MODEL_BROWSER_LABELS: Record<PowerPrompterModelType, string> = {
  checkpoint: 'Checkpoints',
  diffusers: 'Diffusers',
  diffusion_model: 'Diffusion Models',
  unet: 'UNet',
  gguf: 'GGUF',
};
const LORA_BROWSER_FILE_PATTERN = /\.safetensors$/i;
const ALL_QUEUE_SET_IDS = Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, idx) => idx + 1);
const POWER_PROMPTER_CARD_STAGE_PADDING_X = 24;
const POWER_PROMPTER_CARD_STAGE_GAP = 12;
const POWER_PROMPTER_CARD_CONNECTOR_WIDTH = 22;
const POWER_PROMPTER_CONTROL_CARD_WIDTH = 412;
const POWER_PROMPTER_SLOT_CARD_WIDTH = 448;
const POWER_PROMPTER_SLOT_CARD_STRIDE = POWER_PROMPTER_SLOT_CARD_WIDTH + POWER_PROMPTER_CARD_STAGE_GAP;
const POWER_PROMPTER_SLOT_LANE_DESIGN_OFFSET =
  POWER_PROMPTER_CONTROL_CARD_WIDTH + POWER_PROMPTER_CARD_CONNECTOR_WIDTH + (POWER_PROMPTER_CARD_STAGE_GAP * 2);
const POWER_PROMPTER_SLOT_VIRTUAL_OVERSCAN = 1;
const POWER_PROMPTER_SLOT_INITIAL_RENDER_COUNT = 2;
const POWER_PROMPTER_VARIANT_CARD_HEIGHT = 148;
const POWER_PROMPTER_VARIANT_CARD_GAP = 6;
const POWER_PROMPTER_VARIANT_CARD_STRIDE = POWER_PROMPTER_VARIANT_CARD_HEIGHT + POWER_PROMPTER_VARIANT_CARD_GAP;
const POWER_PROMPTER_VARIANT_VIRTUAL_OVERSCAN = 1;
const POWER_PROMPTER_MIN_STAGE_SCALE = 0.95;
const POWER_PROMPTER_CARD_STAGE_OFFSET_Y = 15;
const POWER_PROMPTER_CARD_STAGE_BOTTOM_GAP = 0;
const POWER_PROMPTER_SIDE_CARD_BREATHING_ROOM = 10;
const CARD_NAV_BAR_HEIGHT_PX = 56;
const CARD_NAV_CHIP_WIDTH = 148;
const CARD_NAV_CHIP_GAP = 8;
const CARD_NAV_CHIP_STRIDE = CARD_NAV_CHIP_WIDTH + CARD_NAV_CHIP_GAP;
const CARD_NAV_CHIP_OVERSCAN = 4;
const CARD_MENU_BOTTOM_SAFE_PX = 132;
const MENU_VIEWPORT_MARGIN_PX = 8;
const CARD_MENU_WIDTH_PX = 320;
const CARD_MENU_HEIGHT_PX = 390;
const CARD_RANDOM_MENU_WIDTH_PX = 380;
const CARD_RANDOM_MENU_HEIGHT_PX = 400;
const SET_COLOR_PALETTE = [
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
const GENERATION_PREVIEW_HOLD_OPTIONS: Array<{ id: string; label: string; ms: number | null }> = [
  { id: '2m', label: '2 Minutes', ms: 120000 },
  { id: '5m', label: '5 Minutes', ms: 300000 },
  { id: '10m', label: '10 Minutes', ms: 600000 },
  { id: 'forever', label: 'Forever', ms: null },
];
const LORA_DESCRIPTION_ALLOWED_TAGS = new Set([
  'p', 'br',
  'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre',
  'a',
]);
const LORA_DESCRIPTION_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const DRAG_PROMPT_TOKEN_MIME = 'application/x-umbra-prompt-token';
const DRAG_LORA_FILE_MIME = 'text/x-umbra-lora-path';
const UMBRA_THEMED_SELECT_CLASS = 'umbra-themed-select';
let outputPreviewRootsCache: string[] | null = null;
let outputPreviewRootsPromise: Promise<string[]> | null = null;
const outputPreviewUnavailableRoots = new Set<string>();
const outputPreviewSourceKeyCache = new Map<string, { modified: number; sourceKey: string }>();

function getFolderAncestorPaths(folderPath: string): string[] {
  const normalized = normalizeLoraCatalogPath(folderPath);
  if (!normalized) return [];
  const parts = normalized.split('/').filter((part) => part.length > 0);
  const ancestors: string[] = [];
  let running = '';
  for (const part of parts.slice(0, -1)) {
    running = running ? `${running}/${part}` : part;
    ancestors.push(running);
  }
  return ancestors;
}

function expandCatalogFolderPaths(rawPaths: string[]): string[] {
  const expanded = new Set<string>();
  for (const rawPath of rawPaths) {
    const normalized = normalizeLoraCatalogPath(rawPath);
    if (!normalized) continue;
    for (const ancestor of getFolderAncestorPaths(normalized)) {
      expanded.add(ancestor);
    }
    expanded.add(normalized);
  }
  return Array.from(expanded).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function buildFolderTreeRows(
  folders: LoraBrowserFolderEntry[],
  expandedPaths: Set<string>,
): FolderTreeRow[] {
  if (folders.length === 0) return [];
  const byPath = new Map<string, LoraBrowserFolderEntry>();
  for (const folder of folders) {
    const key = normalizeLoraCatalogPath(folder.path);
    byPath.set(key, { ...folder, path: key });
  }
  if (!byPath.has('')) {
    byPath.set('', { path: '', label: 'All', depth: 0, fileCount: 0 });
  }

  const childrenByParent = new Map<string, string[]>();
  for (const entry of byPath.values()) {
    const parent = getLoraCatalogFolder(entry.path);
    const targetParent = entry.path ? parent : '__root__';
    const current = childrenByParent.get(targetParent) || [];
    current.push(entry.path);
    childrenByParent.set(targetParent, current);
  }
  for (const [parent, children] of childrenByParent.entries()) {
    const sorted = children
      .filter((pathValue) => pathValue !== parent || pathValue === '')
      .sort((a, b) => {
        if (!a) return -1;
        if (!b) return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      });
    childrenByParent.set(parent, sorted);
  }

  const rows: FolderTreeRow[] = [];
  const walk = (pathValue: string) => {
    const current = byPath.get(pathValue);
    if (!current) return;
    const childPaths = childrenByParent.get(pathValue) || [];
    const hasChildren = childPaths.length > 0;
    const expanded = pathValue === '' || expandedPaths.has(pathValue);
    rows.push({ entry: current, hasChildren, expanded });
    if (!expanded) return;
    for (const childPath of childPaths) {
      if (childPath === pathValue) continue;
      walk(childPath);
    }
  };

  if (byPath.has('')) {
    walk('');
  } else {
    const roots = childrenByParent.get('__root__') || [];
    for (const rootPath of roots) {
      walk(rootPath);
    }
  }

  return rows;
}

function getOutputPreviewType(rawType: unknown, name: string): OutputPreviewType {
  const normalizedType = String(rawType || '').trim().toLowerCase();
  const lowerName = String(name || '').trim().toLowerCase();
  const videoExtPattern = /\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i;
  if (normalizedType === 'video' || videoExtPattern.test(lowerName)) return 'video';
  if (normalizedType === 'gif' || lowerName.endsWith('.gif')) return 'gif';
  return 'image';
}

function isVideoPreviewUrl(rawValue: unknown): boolean {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith('data:video/')) return true;
  if (value.startsWith('blob:')) return false;
  if (value.startsWith('umbra-media://') || value.startsWith('/api/fs/read?') || value.startsWith('/api/fs/image?') || value.startsWith('/api/fs/thumbnail?')) {
    try {
      const parsed = new URL(value, 'http://localhost');
      const pathValue = decodeURIComponent(String(parsed.searchParams.get('path') || ''));
      if (VIDEO_PREVIEW_EXT_PATTERN.test(pathValue.toLowerCase())) return true;
    } catch {
      // ignore parse errors
    }
  }
  return VIDEO_PREVIEW_EXT_PATTERN.test(value);
}

function isImagePreviewUrl(rawValue: unknown): boolean {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('blob:')) return false;
  if (value.startsWith('umbra-media://') || value.startsWith('/api/fs/read?') || value.startsWith('/api/fs/image?') || value.startsWith('/api/fs/thumbnail?')) {
    try {
      const parsed = new URL(value, 'http://localhost');
      const pathValue = decodeURIComponent(String(parsed.searchParams.get('path') || ''));
      if (IMAGE_PREVIEW_EXT_PATTERN.test(pathValue.toLowerCase())) return true;
    } catch {
      // ignore parse errors
    }
  }
  return IMAGE_PREVIEW_EXT_PATTERN.test(value);
}

function isSupportedThumbnailSource(rawValue: unknown): boolean {
  const value = String(rawValue || '').trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('data:image/') || lower.startsWith('data:video/')) return true;
  if (lower.startsWith('umbra-media://')) return true;
  if (lower.startsWith('/api/fs/read?path=') || lower.startsWith('/api/fs/image?path=') || lower.startsWith('/api/fs/thumbnail?path=')) return true;
  return isImagePreviewUrl(value) || isVideoPreviewUrl(value);
}

function normalizeThumbnailOverrideSources(rawValue: unknown): string[] {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  return Array.from(new Set(
    values
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0 && entry.length <= THUMBNAIL_OVERRIDE_MAX_DATA_URL_LENGTH)
      .filter((entry) => isSupportedThumbnailSource(entry))
  )).slice(0, THUMBNAIL_OVERRIDE_MAX_ITEMS_PER_ENTRY);
}

function getParentFolderPath(filePath: string): string {
  const normalized = String(filePath || '').replace(/\\/g, '/').trim();
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  return normalized.slice(0, idx);
}

function joinClientPath(basePath: string, subPath: string): string {
  const left = String(basePath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const right = String(subPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function stripPathPrefix(pathValue: string, prefix: string): string {
  const full = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const root = String(prefix || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!root) return full;
  if (full === root) return '';
  if (full.startsWith(`${root}/`)) return full.slice(root.length + 1);
  return full;
}

function buildLoraRootCandidatesFromComfyPath(rawPath: unknown): string[] {
  const normalized = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const results = new Set<string>();
  const add = (value: string) => {
    const next = String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (next) results.add(next);
  };

  if (lower.endsWith('/models/loras')) {
    add(normalized);
    return Array.from(results);
  }

  if (lower.endsWith('/models')) {
    add(`${normalized}/loras`);
    return Array.from(results);
  }

  if (lower.endsWith('/main.py')) {
    const comfyRoot = normalized.slice(0, -'/main.py'.length);
    add(`${comfyRoot}/models/loras`);
    return Array.from(results);
  }

  add(`${normalized}/models/loras`);
  return Array.from(results);
}

function buildModelRootCandidatesFromComfyPath(rawPath: unknown): string[] {
  const normalized = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (!normalized) return [];
  const lower = normalized.toLowerCase();
  const results = new Set<string>();
  const add = (value: string) => {
    const next = String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (next) results.add(next);
  };

  if (lower.endsWith('/main.py')) {
    const comfyRoot = normalized.slice(0, -'/main.py'.length);
    add(`${comfyRoot}/models`);
    return Array.from(results);
  }

  if (lower.endsWith('/models')) {
    add(normalized);
    return Array.from(results);
  }

  const modelsMarker = '/models/';
  const modelsIndex = lower.indexOf(modelsMarker);
  if (modelsIndex >= 0) {
    const baseModelsPath = normalized.slice(0, modelsIndex + '/models'.length);
    add(baseModelsPath);
    return Array.from(results);
  }

  add(`${normalized}/models`);
  return Array.from(results);
}

function getModelBrowserRootTypePrefix(rootPath: string): string {
  const normalized = normalizeLoraCatalogPath(rootPath);
  if (!normalized) return '';
  const leaf = normalized.split('/').filter((part) => part.length > 0).slice(-1)[0]?.toLowerCase() || '';
  return MODEL_BROWSER_TYPE_FOLDER_BY_ROOT_LEAF[leaf] || '';
}

function qualifyModelBrowserRelativePath(relativePath: string, rootPath: string): string {
  const normalized = normalizeLoraCatalogPath(relativePath);
  if (!normalized) return '';
  const firstSegment = normalized.split('/').filter((part) => part.length > 0)[0]?.toLowerCase() || '';
  if (MODEL_BROWSER_ALLOWED_TOP_FOLDERS.has(firstSegment)) return normalized;
  const rootPrefix = getModelBrowserRootTypePrefix(rootPath);
  return rootPrefix ? normalizeLoraCatalogPath(`${rootPrefix}/${normalized}`) : normalized;
}

function hexToRgba(hexColor: string, alpha: number) {
  const safe = String(hexColor || '').replace('#', '').trim();
  if (safe.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSetColor(setId: number) {
  const idx = Math.max(0, Math.floor(Number(setId || 1)) - 1) % SET_COLOR_PALETTE.length;
  return SET_COLOR_PALETTE[idx];
}

function buildSetBandGradient(setIds: number[], alpha: number) {
  const normalized = Array.from(new Set(
    (Array.isArray(setIds) ? setIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  ));
  if (normalized.length === 0) return '';
  const segment = 100 / normalized.length;
  const stops: string[] = [];
  for (let idx = 0; idx < normalized.length; idx += 1) {
    const setColor = getSetColor(normalized[idx]);
    const start = (idx * segment).toFixed(3);
    const end = ((idx + 1) * segment).toFixed(3);
    const rgba = hexToRgba(setColor, alpha);
    stops.push(`${rgba} ${start}% ${end}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function getNowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pp-${prefix}-${crypto.randomUUID()}`;
  }
  return `pp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeCardType(rawType: unknown): PowerPrompterCardType {
  const type = String(rawType || '').trim().toLowerCase();
  if (type === 'character' || type === 'location' || type === 'expression' || type === 'action' || type === 'style' || type === 'custom') {
    return type;
  }
  return 'custom';
}

function cardTypeLabel(type: PowerPrompterCardType) {
  return type === 'custom' ? 'Custom' : `${type[0].toUpperCase()}${type.slice(1)}`;
}

function createSlotId(type: PowerPrompterCardType, label: string) {
  const slug = String(label || type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || type;
  return createId(`slot-${slug}`);
}

function clampQueueSetId(rawSetId: unknown) {
  const parsed = Number(rawSetId);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(parsed)));
}

function normalizeQueueSetIds(rawSets: unknown, fallbackEnabled = true): number[] {
  if (!Array.isArray(rawSets)) return fallbackEnabled ? [1] : [];
  const normalized = Array.from(new Set(
    rawSets
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  )).sort((a, b) => a - b);
  if (normalized.length === 0 && fallbackEnabled) return [1];
  return normalized;
}

function normalizeCardQueueSetIds(card: Pick<PowerPrompterCardNode, 'queueSetIds' | 'queueEnabled'>, fallbackSetId = 1): number[] {
  const queueSetIds = normalizeQueueSetIds(card.queueSetIds, false);
  if (Array.isArray(card.queueSetIds) || queueSetIds.length > 0 || card.queueEnabled === false) return queueSetIds;
  return [clampQueueSetId(fallbackSetId)];
}

function getSlotQueueSetIds(slot: Pick<ChainSlot, 'variants'>): number[] {
  return Array.from(new Set(
    (slot.variants || []).flatMap((variant) => normalizeQueueSetIds(variant.queueSetIds, false))
  )).sort((a, b) => a - b);
}

function normalizeRandomSetIds(rawSets: unknown): number[] {
  return normalizeQueueSetIds(rawSets, false);
}

function normalizeQueueCycleWeights(rawWeights: unknown, allowedSetIds: number[]): Record<string, number> {
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) return {};
  const allowed = new Set(allowedSetIds);
  if (allowed.size <= 0) return {};
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(rawWeights as Record<string, unknown>)) {
    const setId = Math.floor(Number(rawKey));
    if (!Number.isFinite(setId) || !allowed.has(setId)) continue;
    const weight = Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, Math.floor(Number(rawValue) || 1)));
    if (weight <= 1) continue;
    normalized[String(setId)] = weight;
  }
  return normalized;
}

function normalizeChainLinks(rawLinks: unknown, selfId = ''): string[] {
  if (!Array.isArray(rawLinks)) return [];
  const selfKey = String(selfId || '').trim();
  return Array.from(new Set(
    rawLinks
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0 && entry !== selfKey)
  ));
}

function normalizeBlockLinks(rawLinks: unknown, selfId = ''): string[] {
  return normalizeChainLinks(rawLinks, selfId);
}

function stableShuffleDisplayItems<T>(items: T[], salt: string, getKey: (item: T) => string): T[] {
  const hashValue = (input: string) => {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  return [...items]
    .map((item, index) => ({
      item,
      index,
      order: hashValue(`${salt}|${index}|${getKey(item)}`),
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ item }) => item);
}

function shuffleItemsRandomly<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    if (randomIndex === index) continue;
    const current = next[index];
    next[index] = next[randomIndex];
    next[randomIndex] = current;
  }
  return next;
}

function parseIntegerInput(rawValue: string, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function parseFloatInput(rawValue: string, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeLoraSyntaxName(rawName: string): string {
  return String(rawName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '');
}

function formatLoraSyntaxToken(entry: PowerPrompterLoraEntry): string {
  const name = normalizeLoraSyntaxName(entry.name);
  if (!name) return '';
  const model = Number.isFinite(entry.strengthModel) ? entry.strengthModel : 1;
  const clip = Number.isFinite(entry.strengthClip) ? entry.strengthClip : model;
  return `<lora:${name}:${model}:${clip}>`;
}

function readDraggedPromptToken(event: React.DragEvent): string {
  const dt = event.dataTransfer;
  if (!dt) return '';
  const types = Array.from(dt.types || []);
  if (!types.includes(DRAG_PROMPT_TOKEN_MIME)) return '';
  return String(dt.getData(DRAG_PROMPT_TOKEN_MIME) || '').trim();
}

function hasDraggedPromptTokenType(event: React.DragEvent): boolean {
  const dt = event.dataTransfer;
  if (!dt) return false;
  const types = Array.from(dt.types || []);
  return types.includes(DRAG_PROMPT_TOKEN_MIME);
}

function insertPromptTokenAtCursor(currentText: string, token: string, selectionStart: number, selectionEnd: number): string {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return String(currentText || '');
  const text = String(currentText || '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));

  const before = text.slice(0, start);
  const after = text.slice(end);
  const needsLeadingSpace = before.length > 0 && !/[,\s]$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^[,\s]/.test(after);
  const inserted = `${needsLeadingSpace ? ', ' : ''}${cleanToken}${needsTrailingSpace ? ', ' : ''}`;
  return normalizePowerPrompterPromptText(`${before}${inserted}${after}`);
}

function insertPromptTokenIntoDraftAtCursor(
  currentText: string,
  token: string,
  selectionStart: number,
  selectionEnd: number,
  appendTrailingComma = false,
): string {
  const cleanToken = String(token || '').trim().replace(/(?:\s*,\s*)+$/g, '');
  if (!cleanToken) return String(currentText || '');
  const text = String(currentText || '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const before = text.slice(0, start);
  const after = text.slice(end);
  const needsLeadingSeparator = before.length > 0 && !/[,\s]$/.test(before);
  const needsTrailingSeparator = after.length > 0 && !/^[,\s]/.test(after);
  const suffix = appendTrailingComma || needsTrailingSeparator ? ', ' : '';
  return `${before}${needsLeadingSeparator ? ', ' : ''}${cleanToken}${suffix}${after}`;
}

function cleanPowerPrompterSearchToken(rawValue: string): string {
  return String(rawValue ?? '')
    .replace(/_/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function buildPromptInsertionToken(rawValue: string, appendComma = false): string {
  const cleanValue = String(rawValue || '').trim().replace(/(?:\s*,\s*)+$/g, '');
  if (!cleanValue) return '';
  return appendComma ? `${cleanValue},` : cleanValue;
}

function formatPromptWeight(value: number): string {
  const clamped = Math.max(0, Math.min(10, Math.round(value * 100) / 100));
  return clamped.toFixed(2).replace(/\.?0+$/g, '');
}

function applyPromptWeightToToken(rawToken: string, delta: number): string {
  const token = String(rawToken || '').trim();
  if (!token) return rawToken;
  const weightedMatch = token.match(/^\(([\s\S]+):(-?\d+(?:\.\d+)?)\)$/);
  if (weightedMatch) {
    const prompt = String(weightedMatch[1] || '').trim();
    const currentWeight = Number.parseFloat(weightedMatch[2] || '1');
    const nextWeight = (Number.isFinite(currentWeight) ? currentWeight : 1) + delta;
    return `(${prompt}:${formatPromptWeight(nextWeight)})`;
  }
  return `(${token}:${formatPromptWeight(1 + delta)})`;
}

function applyPromptWeightToSelection(rawSelection: string, delta: number): string {
  return String(rawSelection || '')
    .split(/(,)/g)
    .map((part) => {
      if (part === ',') return part;
      const leading = part.match(/^\s*/)?.[0] || '';
      const trailing = part.match(/\s*$/)?.[0] || '';
      const token = part.slice(leading.length, part.length - trailing.length);
      if (!token.trim()) return part;
      return `${leading}${applyPromptWeightToToken(token, delta)}${trailing}`;
    })
    .join('');
}

function applyPromptWeightShortcutToTextarea(textarea: HTMLTextAreaElement, delta: number): {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
} | null {
  const source = String(textarea.value || '');
  const rawStart = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : source.length;
  const rawEnd = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : rawStart;
  let start = Math.max(0, Math.min(rawStart, source.length));
  let end = Math.max(start, Math.min(rawEnd, source.length));
  if (start === end) {
    const leftComma = source.lastIndexOf(',', Math.max(0, start - 1));
    const leftNewline = source.lastIndexOf('\n', Math.max(0, start - 1));
    const rightComma = source.indexOf(',', start);
    const rightNewline = source.indexOf('\n', start);
    start = Math.max(leftComma, leftNewline) + 1;
    const rightCandidates = [rightComma, rightNewline].filter((index) => index >= 0);
    end = rightCandidates.length > 0 ? Math.min(...rightCandidates) : source.length;
  }
  const rawSelection = source.slice(start, end);
  const leading = rawSelection.match(/^\s*/)?.[0] || '';
  const trailing = rawSelection.match(/\s*$/)?.[0] || '';
  const innerStart = start + leading.length;
  const innerEnd = end - trailing.length;
  if (innerStart >= innerEnd) return null;
  const replacement = applyPromptWeightToSelection(source.slice(innerStart, innerEnd), delta);
  const nextValue = `${source.slice(0, innerStart)}${replacement}${source.slice(innerEnd)}`;
  return {
    nextValue,
    selectionStart: innerStart,
    selectionEnd: innerStart + replacement.length,
  };
}

function buildSuggestionInsertionText(entry: ExpandedVariantSuggestionEntry): string {
  const primary = cleanPowerPrompterSearchToken(entry.tag);
  if (!primary) return '';
  if (entry.type === 'character' && String(entry.extra || '').trim()) {
    const extra = cleanPowerPrompterSearchToken(String(entry.extra || ''));
    return extra ? `${primary}, ${extra}` : primary;
  }
  return primary;
}

function normalizeCsvSourceIds(sourceIds: unknown): string[] {
  if (!Array.isArray(sourceIds)) return [];
  const seen = new Set<string>();
  for (const rawSourceId of sourceIds) {
    const sourceId = String(rawSourceId || '').trim();
    if (sourceId) seen.add(sourceId);
  }
  return Array.from(seen);
}

function getCsvSourceDisplayName(sourceId: string): string {
  const value = String(sourceId || '').trim();
  const separatorIndex = value.indexOf(':');
  const fileName = separatorIndex > 0 ? value.slice(separatorIndex + 1) : value;
  return fileName.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim() || value || 'CSV';
}

function getCsvSourceTypeLabel(sourceId: string): string {
  const type = String(sourceId || '').split(':')[0]?.trim().toLowerCase();
  if (type === 'character') return 'Character';
  if (type === 'tag') return 'Tag';
  return 'CSV';
}

function getExpandedVariantSuggestionQuery(text: string, caret: number): string {
  const source = String(text || '');
  const clampedCaret = Math.max(0, Math.min(Number.isFinite(caret) ? caret : source.length, source.length));
  const beforeCaret = source.slice(0, clampedCaret);
  const segment = beforeCaret.split(',').pop() || '';
  const query = segment.trim();
  if (query.length < 3 || query.length > 80) return '';
  if (/^\d+$/.test(query)) return '';
  if (!/[a-z_]/i.test(query)) return '';
  return query;
}

function resolveExpandedVariantEditorTarget(
  editor: ExpandedVariantEditorState | null,
  slots: ChainSlot[],
): { slot: ChainSlot; variant: PowerPrompterCardNode } | null {
  if (!editor) return null;
  const targetSlotId = String(editor.slotId || '').trim();
  const targetVariantId = String(editor.variantId || '').trim();
  const indexedSlot = Number.isInteger(editor.slotIndex)
    ? slots[Number(editor.slotIndex)]
    : null;
  const indexedVariant = indexedSlot && Number.isInteger(editor.variantIndex)
    ? indexedSlot.variants[Number(editor.variantIndex)]
    : null;
  if (indexedSlot && indexedVariant && String(indexedVariant.id || '').trim() === targetVariantId) {
    return { slot: indexedSlot, variant: indexedVariant };
  }
  const directSlot = slots.find((entry) => String(entry.slotId || '').trim() === targetSlotId) || null;
  const directVariant = directSlot
    ? directSlot.variants.find((entry) => String(entry.id || '').trim() === targetVariantId) || null
    : null;
  if (directSlot && directVariant) {
    return { slot: directSlot, variant: directVariant };
  }
  for (const slot of slots) {
    const variant = slot.variants.find((entry) => String(entry.id || '').trim() === targetVariantId) || null;
    if (variant) {
      return { slot, variant };
    }
  }
  return null;
}

function normalizeHttpUrl(rawValue: unknown): string {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function toCivitaiSizedImageUrl(rawValue: unknown, longEdge = 768): string {
  const normalized = normalizeHttpUrl(rawValue);
  if (!normalized) return '';
  if (isVideoPreviewUrl(normalized)) return normalized;
  try {
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || '').toLowerCase();
    if (!host.includes('civitai.com')) return normalized;

    const target = Math.max(256, Math.min(2048, Math.floor(Number(longEdge) || 768)));
    const currentPath = parsed.pathname || '';
    if (/\/width=\d+/i.test(currentPath)) {
      parsed.pathname = currentPath.replace(/\/width=\d+/i, `/width=${target}`);
    } else if (/\/w=\d+/i.test(currentPath)) {
      parsed.pathname = currentPath.replace(/\/w=\d+/i, `/w=${target}`);
    } else {
      parsed.searchParams.set('width', String(target));
    }
    parsed.searchParams.delete('height');
    return parsed.href;
  } catch {
    return normalized;
  }
}

function renderPreviewMedia(
  url: string,
  alt: string,
  className: string,
  options?: { autoPlay?: boolean; muted?: boolean; loop?: boolean }
): JSX.Element {
  const src = String(url || '').trim();
  if (!src) {
    return <div className={className} />;
  }
  if (isVideoPreviewUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        muted={options?.muted ?? true}
        loop={options?.loop ?? false}
        autoPlay={options?.autoPlay ?? false}
        playsInline
        preload="metadata"
        controls={false}
      />
    );
  }
  if (!isImagePreviewUrl(src) && !src.startsWith('data:image/')) {
    return <div className={className} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={className}
    />
  );
}

function parsePositiveInteger(rawValue: unknown): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function normalizeLookupToken(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapMetadataSamplerToPrompter(rawSampler: unknown): string {
  const normalized = normalizeLookupToken(rawSampler);
  if (!normalized) return '';
  const map: Record<string, string> = {
    euler: 'euler',
    eulera: 'euler_ancestral',
    heun: 'heun',
    dpm2: 'dpm_2',
    dpm2a: 'dpm_2_ancestral',
    lms: 'lms',
    dpmpp2sa: 'dpmpp_2s_ancestral',
    dpmppsde: 'dpmpp_sde',
    dpmpp2m: 'dpmpp_2m',
    dpmpp2msde: 'dpmpp_2m_sde',
    dpmpp3msde: 'dpmpp_3m_sde',
    lcm: 'lcm',
    unipc: 'uni_pc',
    unipcbh2: 'uni_pc_bh2',
  };
  return map[normalized] || '';
}

function mapMetadataSchedulerToPrompter(rawScheduler: unknown): string {
  const normalized = normalizeLookupToken(rawScheduler);
  if (!normalized) return '';
  const map: Record<string, string> = {
    normal: 'normal',
    automatic: 'normal',
    auto: 'normal',
    karras: 'karras',
    exponential: 'exponential',
    simple: 'simple',
    ddimuniform: 'ddim_uniform',
    sgmuniform: 'sgm_uniform',
    beta: 'beta',
  };
  return map[normalized] || '';
}

function buildCivitaiUrlFromPayload(payload: PowerPrompterLoraInfoPayload | null): string {
  if (!payload) return '';
  const civitaiRoot = payload.civitai && typeof payload.civitai === 'object'
    ? payload.civitai as Record<string, unknown>
    : {};
  const modelRecord = civitaiRoot.model && typeof civitaiRoot.model === 'object'
    ? civitaiRoot.model as Record<string, unknown>
    : {};
  const metadata = payload.metadata && typeof payload.metadata === 'object'
    ? payload.metadata as Record<string, unknown>
    : {};

  const directCandidates = [
    civitaiRoot.url,
    civitaiRoot.modelUrl,
    modelRecord.url,
    metadata.civitaiUrl,
    metadata.civitaiURL,
    metadata.modelUrl,
  ];
  for (const candidate of directCandidates) {
    const normalized = normalizeHttpUrl(candidate);
    if (normalized) return normalized;
  }

  const modelId = parsePositiveInteger(
    civitaiRoot.modelId
      ?? modelRecord.id
      ?? metadata.modelId
      ?? metadata.civitaiModelId
      ?? metadata.model_id
      ?? metadata.civitai_model_id
  );
  const versionId = parsePositiveInteger(
    civitaiRoot.modelVersionId
      ?? civitaiRoot.id
      ?? metadata.modelVersionId
      ?? metadata.civitaiVersionId
      ?? metadata.versionId
      ?? metadata.model_version_id
      ?? metadata.civitai_version_id
  );

  if (modelId > 0 && versionId > 0) {
    return `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`;
  }
  if (modelId > 0) {
    return `https://civitai.com/models/${modelId}`;
  }
  return '';
}

function extractCivitaiImageUrls(payload: PowerPrompterLoraInfoPayload | null, imageSize = 768): string[] {
  if (!payload) return [];
  const civitaiRoot = payload.civitai && typeof payload.civitai === 'object'
    ? payload.civitai as Record<string, unknown>
    : {};
  const modelRecord = civitaiRoot.model && typeof civitaiRoot.model === 'object'
    ? civitaiRoot.model as Record<string, unknown>
    : {};
  const rootImages = Array.isArray(civitaiRoot.images) ? civitaiRoot.images as unknown[] : [];
  const modelImages = Array.isArray(modelRecord.images) ? modelRecord.images as unknown[] : [];

  const urls = [...rootImages, ...modelImages]
    .map((entry) => (entry && typeof entry === 'object' ? entry as Record<string, unknown> : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => {
      const type = String(entry.type || '').trim().toLowerCase();
      return type === '' || type === 'image' || type === 'video';
    })
    .map((entry) => {
      const rawUrl = normalizeHttpUrl(entry.url);
      if (!rawUrl) return '';
      if (String(entry.type || '').trim().toLowerCase() === 'video' || isVideoPreviewUrl(rawUrl)) {
        return rawUrl;
      }
      return toCivitaiSizedImageUrl(rawUrl, imageSize);
    })
    .filter((url) => url.length > 0);

  return Array.from(new Set(urls));
}

function buildLoraCardMeta(payload: PowerPrompterLoraInfoPayload | null): PowerPrompterLoraCardMeta {
  const civitaiUrl = buildCivitaiUrlFromPayload(payload);
  const thumbnailUrls = extractCivitaiImageUrls(payload, 320).slice(0, 4);
  const thumbnailUrl = thumbnailUrls[0] || '';
  return { civitaiUrl, thumbnailUrl, thumbnailUrls };
}

function normalizeLoraCatalogPath(rawValue: unknown): string {
  const normalized = String(rawValue || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
  return normalized;
}

function getLoraCatalogFolder(pathValue: string): string {
  const normalized = normalizeLoraCatalogPath(pathValue);
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  return normalized.slice(0, idx);
}

function isCatalogPathInsideFolder(pathValue: string, folderPath: string): boolean {
  const normalizedPath = normalizeLoraCatalogPath(pathValue);
  const normalizedFolder = normalizeLoraCatalogPath(folderPath);
  if (!normalizedFolder) return true;
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

function getLoraCatalogName(pathValue: string): string {
  const normalized = normalizeLoraCatalogPath(pathValue);
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function stripFileExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

function getCatalogAliasKeys(rawPath: unknown): string[] {
  const normalized = normalizeLoraCatalogPath(rawPath);
  if (!normalized) return [];
  const withoutExtension = stripFileExtension(normalized);
  const fileName = getLoraCatalogName(normalized);
  const fileStem = stripFileExtension(fileName);
  const withoutKnownModelPrefix = normalized.replace(/^(checkpoints|diffusion_models|unet|loras)\//i, '');
  const withoutKnownModelPrefixStem = stripFileExtension(withoutKnownModelPrefix);
  return Array.from(new Set([
    normalized,
    withoutExtension,
    fileName,
    fileStem,
    withoutKnownModelPrefix,
    withoutKnownModelPrefixStem,
  ]
    .map((entry) => normalizeLoraCatalogPath(entry).toLowerCase())
    .filter((entry) => entry.length > 0)));
}

function mergeBrowserFileEntries(
  primary: LoraBrowserFileEntry[],
  secondary: LoraBrowserFileEntry[],
): LoraBrowserFileEntry[] {
  const merged = new Map<string, LoraBrowserFileEntry>();
  for (const entry of [...primary, ...secondary]) {
    const normalizedPath = normalizeLoraCatalogPath(entry.path);
    if (!normalizedPath) continue;
    const nextEntry = {
      path: normalizedPath,
      folder: normalizeLoraCatalogPath(entry.folder || getLoraCatalogFolder(normalizedPath)),
      name: String(entry.name || getLoraCatalogName(normalizedPath)).trim(),
      modelType: entry.modelType,
    };
    merged.set(normalizedPath.toLowerCase(), nextEntry);
  }
  return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
}

function isModelBrowserFileCandidate(pathValue: string): boolean {
  const normalized = normalizeLoraCatalogPath(pathValue);
  if (!normalized) return false;
  const fileName = getLoraCatalogName(normalized).toLowerCase();
  if (!fileName || MODEL_BROWSER_IGNORE_FILE_PATTERN.test(fileName)) return false;
  if (!MODEL_BROWSER_FILE_PATTERN.test(fileName)) return false;
  const firstSegment = normalized.split('/').filter((part) => part.length > 0)[0]?.toLowerCase() || '';
  return !firstSegment || MODEL_BROWSER_ALLOWED_TOP_FOLDERS.has(firstSegment);
}

function isComfyModelCatalogFileCandidate(pathValue: string): boolean {
  const normalized = normalizeLoraCatalogPath(pathValue);
  if (!normalized) return false;
  const fileName = getLoraCatalogName(normalized).toLowerCase();
  if (!fileName || MODEL_BROWSER_IGNORE_FILE_PATTERN.test(fileName)) return false;
  return MODEL_BROWSER_FILE_PATTERN.test(fileName);
}

function normalizePowerPrompterModelType(rawValue: unknown): PowerPrompterModelType {
  const normalized = String(rawValue || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'checkpoints' || normalized === 'ckpt' || normalized === 'checkpoint_loader') return 'checkpoint';
  if (normalized === 'diffuser' || normalized === 'diffusers_model') return 'diffusers';
  if (normalized === 'diffusion_models') return 'diffusion_model';
  if (normalized === 'unets' || normalized === 'unet_model') return 'unet';
  return POWER_PROMPTER_MODEL_BROWSER_TYPES.includes(normalized as PowerPrompterModelType)
    ? normalized as PowerPrompterModelType
    : 'checkpoint';
}

function inferModelTypeFromCatalogPath(pathValue: string): PowerPrompterModelType {
  if (normalizeLoraCatalogPath(pathValue).toLowerCase().endsWith('.gguf')) return 'gguf';
  const firstSegment = normalizeLoraCatalogPath(pathValue).split('/').filter((part) => part.length > 0)[0]?.toLowerCase() || '';
  if (firstSegment === 'diffusers') return 'diffusers';
  if (firstSegment === 'diffusion_models') return 'diffusion_model';
  if (firstSegment === 'unet') return 'unet';
  return 'checkpoint';
}

function stripModelFolderPrefixForType(pathValue: string, modelType: PowerPrompterModelType): string {
  const normalized = normalizeLoraCatalogPath(pathValue);
  const prefixes: Record<PowerPrompterModelType, string[]> = {
    checkpoint: ['checkpoints'],
    diffusers: ['diffusers'],
    diffusion_model: ['diffusion_models'],
    unet: ['unet'],
    gguf: ['diffusion_models', 'unet'],
  };
  const parts = normalized.split('/').filter((part) => part.length > 0);
  if (parts.length <= 1) return normalized;
  if (!prefixes[modelType].includes(parts[0].toLowerCase())) return normalized;
  return parts.slice(1).join('/');
}

function parseModelCatalogEntry(rawEntry: unknown): LoraBrowserFileEntry | null {
  const raw = String(rawEntry || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  const delimiterIdx = raw.indexOf('|');
  const rawType = delimiterIdx > 0 ? raw.slice(0, delimiterIdx) : '';
  const rawPath = delimiterIdx > 0 ? raw.slice(delimiterIdx + 1) : raw;
  const path = normalizeLoraCatalogPath(rawPath);
  if (!path) return null;
  let modelType = rawType ? normalizePowerPrompterModelType(rawType) : inferModelTypeFromCatalogPath(path);
  if (modelType === 'diffusion_model' && inferModelTypeFromCatalogPath(path) === 'unet') {
    modelType = 'unet';
  }
  if (modelType !== 'diffusers' && !isComfyModelCatalogFileCandidate(path)) return null;
  return {
    path,
    folder: getLoraCatalogFolder(path),
    name: getLoraCatalogName(path),
    modelType,
  };
}

function resolveCheckpointNameFromMetadata(rawModelName: unknown, catalog: string[]): string {
  const requested = String(rawModelName || '').trim().replace(/\\/g, '/');
  if (!requested) return '';
  if (!Array.isArray(catalog) || catalog.length === 0) return requested;

  const normalizedCatalog = catalog
    .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
    .filter((entry) => entry.length > 0);
  if (normalizedCatalog.length === 0) return requested;

  const requestedLower = requested.toLowerCase();
  const exact = normalizedCatalog.find((entry) => entry.toLowerCase() === requestedLower);
  if (exact) return exact;

  const requestedBase = requested.split('/').pop() || requested;
  const requestedBaseLower = requestedBase.toLowerCase();
  const requestedStemLower = stripFileExtension(requestedBaseLower);

  const byBase = normalizedCatalog.find((entry) => {
    const base = (entry.split('/').pop() || entry).toLowerCase();
    return base === requestedBaseLower;
  });
  if (byBase) return byBase;

  const byStem = normalizedCatalog.find((entry) => {
    const base = stripFileExtension((entry.split('/').pop() || entry).toLowerCase());
    return base === requestedStemLower;
  });
  if (byStem) return byStem;

  return requested;
}

function sanitizeThumbnailStem(fileName: string): string {
  const stem = stripFileExtension(getLoraCatalogName(fileName));
  const safe = stem
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return safe || 'thumbnail';
}

function extractCivitaiDescription(civitai: Record<string, unknown> | null | undefined): string {
  const root = civitai && typeof civitai === 'object' ? civitai : null;
  if (!root) return '';
  const direct = String(root.description || '').trim();
  if (direct) return direct;
  const model = root.model;
  if (model && typeof model === 'object') {
    const modelDescription = String((model as Record<string, unknown>).description || '').trim();
    if (modelDescription) return modelDescription;
  }
  return '';
}

function sanitizeLoraDescriptionHtml(rawHtml: string): string {
  const source = String(rawHtml || '').trim();
  if (!source || typeof DOMParser === 'undefined' || typeof document === 'undefined') return '';

  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(source, 'text/html');
    const safeDoc = document.implementation.createHTMLDocument('');
    const safeRoot = safeDoc.createElement('div');

    const sanitizeNode = (node: Node, parent: HTMLElement) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(safeDoc.createTextNode(String(node.textContent || '')));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as HTMLElement;
      const tag = String(element.tagName || '').toLowerCase();
      const children = Array.from(element.childNodes || []);
      if (!LORA_DESCRIPTION_ALLOWED_TAGS.has(tag)) {
        children.forEach((child) => sanitizeNode(child, parent));
        return;
      }

      const safeEl = safeDoc.createElement(tag);
      if (tag === 'a') {
        const rawHref = String(element.getAttribute('href') || '').trim();
        if (rawHref) {
          try {
            const parsedHref = new URL(rawHref, window.location.origin);
            if (LORA_DESCRIPTION_ALLOWED_PROTOCOLS.has(parsedHref.protocol)) {
              safeEl.setAttribute('href', parsedHref.href);
              safeEl.setAttribute('target', '_blank');
              safeEl.setAttribute('rel', 'noopener noreferrer');
            }
          } catch {
            // ignore invalid link
          }
        }
      }

      children.forEach((child) => sanitizeNode(child, safeEl));
      parent.appendChild(safeEl);
    };

    Array.from(parsed.body.childNodes || []).forEach((child) => sanitizeNode(child, safeRoot));
    return String(safeRoot.innerHTML || '').trim();
  } catch {
    return '';
  }
}

function normalizeLoraDescriptionText(rawHtml: string): string {
  const source = String(rawHtml || '').trim();
  if (!source || typeof DOMParser === 'undefined') return source;
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(source, 'text/html');
    return String(parsed.body?.textContent || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  } catch {
    return source;
  }
}

function buildSanitizedLoraDescription(payload: PowerPrompterLoraInfoPayload | null) {
  if (!payload) {
    return { descriptionHtml: '', descriptionText: '' };
  }
  const payloadHtml = String(payload.descriptionHtml || '').trim();
  const payloadText = String(payload.descriptionText || '').trim();
  const fallbackRaw = extractCivitaiDescription(payload.civitai);
  const rawCandidate = payloadHtml || fallbackRaw;
  const descriptionHtml = sanitizeLoraDescriptionHtml(rawCandidate);
  const descriptionText = payloadText || normalizeLoraDescriptionText(descriptionHtml || rawCandidate);
  return { descriptionHtml, descriptionText };
}

function sortCards(cards: PowerPrompterCardNode[]) {
  return [...cards].sort((a, b) => {
    const orderDelta = Number(a.order) - Number(b.order);
    if (orderDelta !== 0) return orderDelta;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function createCard(
  type: PowerPrompterCardType,
  label: string,
  slotId: string,
  order = 0,
  setId = 1,
  randomEnabled = false,
  randomSetIds: number[] = []
): PowerPrompterCardNode {
  const now = getNowIso();
  const queueSetIds = normalizeQueueSetIds([setId], true);
  return {
    id: createId(type),
    slotId,
    type,
    label,
    variantName: '',
    variantTags: [],
    skipVariant: false,
    text: '',
    randomEnabled: randomEnabled === true,
    randomSetIds: normalizeRandomSetIds(randomSetIds),
    queueEnabled: queueSetIds.length > 0,
    queueSetIds,
    queueTraversalRole: 'cycle',
    queueCycleWeights: {},
    chainLinks: [],
    blockLinks: [],
    order,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSlots(cards: PowerPrompterCardNode[]): ChainSlot[] {
  const now = getNowIso();
  const slots: ChainSlot[] = [];
  const byId = new Map<string, ChainSlot>();
  for (const card of sortCards(cards || [])) {
    const type = normalizeCardType(card.type);
    const label = String(card.label || '').trim() || cardTypeLabel(type);
    const slotId = String(card.slotId || '').trim() || createSlotId(type, label);
    let slot = byId.get(slotId);
    if (!slot) {
      slot = { slotId, type, label, variants: [] };
      byId.set(slotId, slot);
      slots.push(slot);
    }
    const queueSetIds = normalizeCardQueueSetIds(card);
    slot.variants.push({
      ...card,
      id: String(card.id || '').trim() || createId(type),
      slotId,
      type,
      label,
      variantName: normalizeVariantName(card.variantName),
      variantTags: normalizeVariantTags((card as any).variantTags),
      skipVariant: (card as any).skipVariant === true,
      text: String(card.text || ''),
      randomEnabled: card.randomEnabled === true,
      randomSetIds: normalizeRandomSetIds(card.randomSetIds),
      queueSetIds,
      queueTraversalRole: normalizeQueueTraversalRole((card as any).queueTraversalRole),
      queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds),
      queueEnabled: queueSetIds.length > 0,
      chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
      blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
      createdAt: String(card.createdAt || now),
      updatedAt: String(card.updatedAt || now),
    });
  }

  for (const slot of slots) {
    const randomEnabled = slot.variants.some((variant) => variant.randomEnabled === true);
    const randomSetIds = Array.from(new Set(
      slot.variants.flatMap((variant) => normalizeRandomSetIds(variant.randomSetIds))
    )).sort((a, b) => a - b);
    const queueTraversalRole = getSlotQueueTraversalRole(slot);
    slot.variants = sortCards(slot.variants).map((variant, idx) => ({
      ...variant,
      randomEnabled,
      randomSetIds,
      queueTraversalRole,
      order: idx,
    }));
  }

  if (slots.length === 0) {
    const slotId = createSlotId('character', 'Character');
    return [{ slotId, type: 'character', label: 'Character', variants: [createCard('character', 'Character', slotId, 0, 1)] }];
  }

  return slots;
}

function flattenSlots(slots: ChainSlot[]): PowerPrompterCardNode[] {
  const now = getNowIso();
  const flattened: PowerPrompterCardNode[] = [];
  for (const slot of slots) {
    const type = normalizeCardType(slot.type);
    const label = String(slot.label || '').trim() || cardTypeLabel(type);
    const slotId = String(slot.slotId || '').trim() || createSlotId(type, label);
    for (const variant of slot.variants) {
      const queueSetIds = normalizeCardQueueSetIds(variant);
      const randomSetIds = normalizeRandomSetIds(variant.randomSetIds);
      flattened.push({
        ...variant,
        id: String(variant.id || '').trim() || createId(type),
        slotId,
        type,
        label,
        variantName: normalizeVariantName(variant.variantName),
        variantTags: normalizeVariantTags((variant as any).variantTags),
        skipVariant: (variant as any).skipVariant === true,
        text: String(variant.text || ''),
        randomEnabled: variant.randomEnabled === true,
        randomSetIds,
        queueSetIds,
        queueTraversalRole: normalizeQueueTraversalRole((variant as any).queueTraversalRole),
        queueCycleWeights: normalizeQueueCycleWeights((variant as any).queueCycleWeights, queueSetIds),
        queueEnabled: queueSetIds.length > 0,
        chainLinks: normalizeChainLinks((variant as any).chainLinks, String(variant.id || '').trim()),
        blockLinks: normalizeBlockLinks((variant as any).blockLinks, String(variant.id || '').trim()),
        createdAt: String(variant.createdAt || now),
        updatedAt: String(variant.updatedAt || now),
        order: flattened.length,
      });
    }
  }
  return flattened;
}

function cloneSlots(slots: ChainSlot[]): ChainSlot[] {
  return slots.map((slot) => ({
    ...slot,
    variants: slot.variants.map((variant) => {
      const queueSetIds = normalizeCardQueueSetIds(variant);
      return {
        ...variant,
        variantTags: [...normalizeVariantTags((variant as any).variantTags)],
        skipVariant: (variant as any).skipVariant === true,
        randomSetIds: [...normalizeRandomSetIds(variant.randomSetIds)],
        queueSetIds: [...queueSetIds],
        queueTraversalRole: normalizeQueueTraversalRole((variant as any).queueTraversalRole),
        queueCycleWeights: normalizeQueueCycleWeights((variant as any).queueCycleWeights, queueSetIds),
        chainLinks: [...normalizeChainLinks((variant as any).chainLinks, String(variant.id || '').trim())],
        blockLinks: [...normalizeBlockLinks((variant as any).blockLinks, String(variant.id || '').trim())],
      };
    }),
  }));
}

function normalizeVariantName(rawName: unknown): string {
  return String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function formatVariantPositionLabel(index: number): string {
  return `Position ${Math.max(0, Math.floor(index)) + 1}`;
}

function getElementContextMenuPoint(
  event: React.MouseEvent<HTMLElement>,
  placement: 'inside' | 'below' = 'inside'
) {
  const rect = event.currentTarget.getBoundingClientRect();
  if (placement === 'below') {
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
    };
  }

  const rawX = Number(event.clientX);
  const rawY = Number(event.clientY);
  const xIsInside = Number.isFinite(rawX) && rawX >= rect.left - 8 && rawX <= rect.right + 8;
  const yIsInside = Number.isFinite(rawY) && rawY >= rect.top - 8 && rawY <= rect.bottom + 8;
  return {
    x: Math.round(xIsInside ? rawX : rect.left + 12),
    y: Math.round(yIsInside ? rawY : rect.top + 12),
  };
}

function normalizeVariantNameList(rawNames: unknown): string[] {
  if (!Array.isArray(rawNames)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawName of rawNames) {
    const name = normalizeVariantName(rawName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
    if (normalized.length >= 64) break;
  }
  return normalized;
}

function getDimensionsFromAspectRatioOption(rawOption: unknown): { width: number; height: number } | null {
  const option = String(rawOption || '').trim();
  if (!option || option.toLowerCase() === 'custom') return null;
  const match = option.match(/(\d{2,5})\s*x\s*(\d{2,5})\s*$/i);
  if (!match) return null;
  const width = Math.max(64, Math.min(8192, Math.floor(Number(match[1]) || 0)));
  const height = Math.max(64, Math.min(8192, Math.floor(Number(match[2]) || 0)));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function normalizeVariantTag(rawTag: unknown): string {
  return String(rawTag || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

function normalizeVariantTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of rawTags) {
    const tag = normalizeVariantTag(rawTag);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= 16) break;
  }
  return normalized;
}

function normalizeGlobalSearchTerms(rawQuery: unknown): string[] {
  const query = String(rawQuery || '').toLowerCase().trim();
  if (!query) return [];
  return query
    .split(/[\s,;|]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

function getPromptSearchText(rawText: unknown): string {
  return String(rawText || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLoraSyntaxChipName(rawChip: unknown): string {
  const token = String(rawChip || '').trim();
  if (!token) return '';
  const match = token.match(/^<\s*lora\s*:\s*([^:>]+?)\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+))?\s*>$/i);
  if (!match) return '';
  return normalizeLoraSyntaxName(match[1] || '').toLowerCase();
}

function variantMatchesGlobalChipSearch(variantName: unknown, _variantTags: unknown, variantText: unknown, terms: string[]): boolean {
  if (!Array.isArray(terms) || terms.length === 0) return false;
  const promptText = getPromptSearchText(variantText);
  const nameText = normalizeSearchChip(variantName);
  if (!promptText && !nameText) return false;
  return terms.every((term) => promptText.includes(term) || nameText.includes(term));
}

function normalizeSearchChip(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function variantHasSearchChip(variant: PowerPrompterCardNode, rawChip: unknown): boolean {
  const chip = normalizeSearchChip(rawChip);
  if (!chip) return false;
  const promptText = getPromptSearchText(variant.text);
  if (promptText.includes(chip)) return true;
  return normalizeSearchChip(variant.variantName).includes(chip);
}

function splitVariantTagDraft(rawInput: unknown): string[] {
  const source = String(rawInput || '');
  if (!source.trim()) return [];
  return normalizeVariantTags(
    source
      .split(/[\r\n,;|]+/g)
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0)
  );
}

function normalizeCustomGroupName(rawLabel: string) {
  return String(rawLabel || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isReservedStyleLabel(rawLabel: string) {
  return normalizeCustomGroupName(rawLabel) === normalizeCustomGroupName('Style');
}

function isStyleUtilitySlot(slot: Pick<ChainSlot, 'type'> | null | undefined) {
  return normalizeCardType(slot?.type) === 'style';
}

function getSlotGroupKeyForTypeLabel(rawType: PowerPrompterCardType, rawLabel: string) {
  const type = normalizeCardType(rawType);
  const normalizedName = normalizeCustomGroupName(rawLabel || '');
  if (normalizedName) {
    return `label:${normalizedName}`;
  }
  return `type:${type}`;
}

function getSlotGroupKey(slot: ChainSlot) {
  return getSlotGroupKeyForTypeLabel(slot.type, slot.label);
}

function normalizeDeletedCardGroups(rawGroups: unknown): Record<string, PowerPrompterDeletedCardGroup> {
  const now = getNowIso();
  if (!rawGroups || typeof rawGroups !== 'object') return {};
  const groups = rawGroups as Record<string, unknown>;
  const normalized: Record<string, PowerPrompterDeletedCardGroup> = {};
  for (const [rawKey, rawValue] of Object.entries(groups)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (!rawValue || typeof rawValue !== 'object') continue;
    const group = rawValue as Partial<PowerPrompterDeletedCardGroup>;
    const type = normalizeCardType(group.type);
    const label = String(group.label || '').trim() || cardTypeLabel(type);
    const cardsRaw = Array.isArray(group.cards) ? group.cards : [];
    const cards = sortCards(cardsRaw
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, idx) => {
        const card = entry as Partial<PowerPrompterCardNode>;
        const queueSetIds = normalizeCardQueueSetIds(card);
        return {
          id: String(card.id || createId(type)),
          slotId: String(card.slotId || '').trim(),
          type: normalizeCardType(card.type || type),
          label: String(card.label || '').trim() || label,
          variantName: normalizeVariantName(card.variantName),
          variantTags: normalizeVariantTags((card as any).variantTags),
          skipVariant: (card as any).skipVariant === true,
          text: String(card.text || ''),
          randomEnabled: card.randomEnabled === true,
          randomSetIds: normalizeRandomSetIds(card.randomSetIds),
          queueEnabled: queueSetIds.length > 0,
          queueSetIds,
          queueTraversalRole: normalizeQueueTraversalRole((card as any).queueTraversalRole),
          queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds),
          chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
          blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
          order: Number.isFinite(Number(card.order)) ? Math.max(0, Math.floor(Number(card.order))) : idx,
          createdAt: String(card.createdAt || now),
          updatedAt: String(card.updatedAt || now),
        } as PowerPrompterCardNode;
      }));
    normalized[key] = {
      key,
      type,
      label,
      deletedAt: String(group.deletedAt || now),
      cards,
    };
  }
  return normalized;
}

function coalesceSlotsByGrouping(slots: ChainSlot[]): ChainSlot[] {
  const merged: ChainSlot[] = [];
  const byKey = new Map<string, ChainSlot>();

  for (const slot of slots) {
    const type = normalizeCardType(slot.type);
    const label = String(slot.label || '').trim() || cardTypeLabel(type);
    const key = getSlotGroupKey({ ...slot, type, label });
    const existing = byKey.get(key);

    if (!existing) {
      const seeded: ChainSlot = {
        slotId: slot.slotId,
        type,
        label,
        variants: slot.variants.map((variant) => ({
          ...variant,
          slotId: slot.slotId,
          type,
          label,
        })),
      };
      byKey.set(key, seeded);
      merged.push(seeded);
      continue;
    }

    const seenVariantIds = new Set(existing.variants.map((variant) => variant.id));
    for (const variant of slot.variants) {
      const variantId = String(variant.id || '').trim();
      if (variantId && seenVariantIds.has(variantId)) continue;
      if (variantId) seenVariantIds.add(variantId);
      existing.variants.push({
        ...variant,
        slotId: existing.slotId,
        type: existing.type,
        label: existing.label,
      });
    }
  }

  for (const slot of merged) {
    const randomEnabled = slot.variants.some((variant) => variant.randomEnabled === true);
    const randomSetIds = Array.from(new Set(
      slot.variants.flatMap((variant) => normalizeRandomSetIds(variant.randomSetIds))
    )).sort((a, b) => a - b);
    const queueTraversalRole = getSlotQueueTraversalRole(slot);
    slot.variants = sortCards(slot.variants).map((variant, idx) => ({
      ...variant,
      randomEnabled,
      randomSetIds,
      queueTraversalRole,
      order: idx,
    }));
  }
  return merged;
}

function isSlotRandomEnabled(slot: ChainSlot): boolean {
  return slot.variants.some((variant) => variant.randomEnabled === true);
}

function getSlotRandomSetIds(slot: ChainSlot): number[] {
  return Array.from(new Set(
    slot.variants.flatMap((variant) => normalizeRandomSetIds(variant.randomSetIds))
  )).sort((a, b) => a - b);
}

function activePromptFromSlots(slots: ChainSlot[], setId: number): string {
  return normalizePowerPrompterPromptText(
    slots
      .map((slot) => {
        for (const variant of slot.variants) {
          const text = String(variant.text || '').trim();
          if (!text) continue;
          const sets = normalizeQueueSetIds(variant.queueSetIds, false);
          if (sets.includes(setId)) return text;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ')
  );
}

function cleanTagValue(rawValue: string): string {
  return String(rawValue || '').replace(/_/g, ' ').replace(/^["']|["']$/g, '').trim();
}

function appendPromptToken(currentText: string, token: string) {
  const cleanedToken = cleanTagValue(token);
  if (!cleanedToken) return currentText;
  const existing = String(currentText || '').trim();
  if (!existing) return cleanedToken;
  if (existing.endsWith(',')) return `${existing} ${cleanedToken}`;
  return `${existing}, ${cleanedToken}`;
}

function replaceTrailingPromptToken(currentText: string, token: string) {
  const cleanedToken = cleanTagValue(token);
  if (!cleanedToken) return String(currentText || '');
  const rawText = String(currentText || '');
  const trimmed = rawText.trim();
  if (!trimmed) return cleanedToken;

  const parts = rawText.split(',');
  if (parts.length <= 1) {
    return cleanedToken;
  }

  const head = parts
    .slice(0, -1)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(', ');
  return head ? `${head}, ${cleanedToken}` : cleanedToken;
}

function splitPromptChipsAndDraft(rawText: string): { chips: string[]; draft: string } {
  const source = String(rawText || '');
  if (!source.trim() && source.length === 0) return { chips: [], draft: '' };
  const hasTrailingComma = /,\s*$/.test(source);
  const rawParts = source.split(',');
  const normalizedParts = rawParts.map((entry) => cleanTagValue(entry)).filter((entry) => entry.length > 0);
  const normalizeDraftOnly = (value: string) => String(value || '').replace(/_/g, ' ').replace(/^["']|["']$/g, '');
  if (normalizedParts.length === 0 && !hasTrailingComma) {
    return { chips: [], draft: normalizeDraftOnly(source) };
  }
  if (hasTrailingComma) {
    return { chips: normalizedParts, draft: '' };
  }
  if (rawParts.length === 1) {
    return { chips: [], draft: normalizeDraftOnly(rawParts[0] || '') };
  }
  const chipParts = rawParts.slice(0, -1).map((entry) => cleanTagValue(entry)).filter((entry) => entry.length > 0);
  const draftPart = normalizeDraftOnly(rawParts[rawParts.length - 1] || '');
  return {
    chips: chipParts,
    draft: draftPart,
  };
}

function composePromptFromChips(
  chips: string[],
  draft = '',
  options?: { keepTrailingDelimiter?: boolean; preserveDraftWhitespace?: boolean }
): string {
  const normalizedChips = chips
    .map((entry) => cleanTagValue(entry))
    .filter((entry) => entry.length > 0);
  const rawDraft = String(draft || '').replace(/_/g, ' ').replace(/^["']|["']$/g, '');
  const normalizedDraft = cleanTagValue(rawDraft);
  if (options?.keepTrailingDelimiter && normalizedDraft.length === 0 && normalizedChips.length > 0) {
    return `${normalizedChips.join(', ')}, `;
  }
  if (options?.preserveDraftWhitespace) {
    if (normalizedChips.length === 0) return rawDraft;
    if (rawDraft.length === 0) return normalizedChips.join(', ');
    return `${normalizedChips.join(', ')}, ${rawDraft}`;
  }
  return normalizePowerPrompterPromptText(
    [...normalizedChips, normalizedDraft]
      .filter((entry) => entry.length > 0)
      .join(', ')
  );
}

function resetVariantTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = `${VARIANT_TEXTAREA_COLLAPSED_HEIGHT_PX}px`;
}

function tokenizePromptForMatch(rawPrompt: string): string[] {
  return normalizePowerPrompterPromptText(rawPrompt)
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function promptTokenPartsMatch(promptTokens: string[], tokenParts: string[]): boolean {
  if (!Array.isArray(promptTokens) || promptTokens.length === 0) return false;
  if (!Array.isArray(tokenParts) || tokenParts.length === 0) return false;
  return tokenParts.every((part) => promptTokens.includes(part));
}

function promptHasToken(prompt: string, token: string) {
  const loraName = extractLoraSyntaxChipName(token);
  if (loraName) {
    return tokenizePromptForMatch(prompt).some((promptToken) => extractLoraSyntaxChipName(promptToken) === loraName);
  }
  const promptTokens = tokenizePromptForMatch(prompt);
  const tokenParts = tokenizePromptForMatch(token);
  return promptTokenPartsMatch(promptTokens, tokenParts);
}

async function listOutputPreviewPath(path: string, limit: number): Promise<{ files: any[]; folders: any[] }> {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    cursor: '0',
    fast: '1',
    recursive: 'false',
    sortBy: 'modified',
    sortOrder: 'desc',
  });
  if (String(path || '').trim()) {
    searchParams.set('path', path);
  }
  const res = await fetchGalleryFs('/list-progressive', searchParams, { cache: 'no-store' });
  if (!res.ok) {
    const error = new Error(`Output list failed (${res.status})`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  const payload = await res.json();
  return {
    files: Array.isArray(payload?.files) ? payload.files : [],
    folders: Array.isArray(payload?.folders) ? payload.folders : [],
  };
}

function buildOutputPreviewThumbnailUrl(path: string, revision: string): string {
  return normalizeGalleryFsUrl(galleryBridgeFsUrl('/thumbnail', new URLSearchParams({
    path,
    size: 'small',
    q: '100',
    fit: 'contain',
    rev: revision,
    lane: 'powerprompter',
  })));
}

function buildOutputPreviewImageUrl(path: string, revision: string): string {
  return normalizeGalleryFsUrl(galleryBridgeFsUrl('/image', new URLSearchParams({
    path,
    rev: revision,
    lane: 'powerprompter',
  })));
}

function joinOutputPreviewPath(rootPath: string, subfolder: string, filename: string): string {
  const root = normalizeOutputPreviewRootPath(rootPath);
  const folder = normalizeOutputPreviewRootPath(subfolder);
  const file = String(filename || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!file) return '';
  if (/^[a-z]:\//i.test(file) || file.startsWith('//')) return normalizeOutputPreviewRootPath(file);
  return [root, folder, file].filter(Boolean).join('/');
}

function normalizeOutputPreviewItem(rawItem: any): OutputPreviewItem | null {
  const path = String(rawItem?.path || '').trim();
  if (!path) return null;
  const name = String(rawItem?.name || path.split(/[\\/]/).pop() || path).trim();
  const modifiedRaw = Number(rawItem?.modifiedMs ?? rawItem?.modified ?? rawItem?.createdMs ?? rawItem?.created ?? Date.now());
  const modified = Number.isFinite(modifiedRaw) ? modifiedRaw : Date.now();
  const type = getOutputPreviewType(rawItem?.type, name);
  const revision = buildMediaRevisionToken(modified, rawItem?.size);
  return {
    id: path,
    path,
    name,
    thumbnailUrl: normalizeGalleryFsUrl(String(rawItem?.thumbnailUrl || buildOutputPreviewThumbnailUrl(path, revision))),
    imageUrl: normalizeGalleryFsUrl(String(rawItem?.url || rawItem?.imageUrl || buildOutputPreviewImageUrl(path, revision))),
    type,
    modified,
  };
}

function normalizeDirectOutputPreviewItem(
  rawItem: DirectOutputPreviewDescriptor | null | undefined,
  outputRoots: string[] = [],
): OutputPreviewItem | null {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const filename = String(rawItem.filename || rawItem.name || '').trim();
  const directPath = String(rawItem.fullpath || rawItem.fullPath || rawItem.path || '').trim();
  const fallbackRoot = outputRoots.find((entry) => String(entry || '').trim()) || OUTPUT_PREVIEW_DEFAULT_ROOTS[0] || '';
  const path = normalizeOutputPreviewRootPath(
    directPath || joinOutputPreviewPath(fallbackRoot, String(rawItem.subfolder || ''), filename)
  );
  if (!path) return null;
  const name = String(filename || path.split(/[\\/]/).pop() || path).trim();
  const modifiedRaw = Number(rawItem.modified ?? Date.now());
  const modified = Number.isFinite(modifiedRaw) ? modifiedRaw : Date.now();
  const type = getOutputPreviewType(rawItem.type, name);
  const revision = buildMediaRevisionToken(modified, undefined);
  return {
    id: path,
    path,
    name,
    thumbnailUrl: buildOutputPreviewThumbnailUrl(path, revision),
    imageUrl: buildOutputPreviewImageUrl(path, revision),
    type,
    modified,
  };
}

function mergeOutputPreviewItems(
  incoming: OutputPreviewItem[],
  existing: OutputPreviewItem[],
  limit = OUTPUT_PREVIEW_SNAPSHOT_LIMIT,
): OutputPreviewItem[] {
  const merged = new Map<string, OutputPreviewItem>();
  for (const item of incoming) {
    if (!item?.path) continue;
    merged.set(item.path, item);
  }
  for (const item of existing) {
    if (!item?.path || merged.has(item.path)) continue;
    merged.set(item.path, item);
  }
  return Array.from(merged.values())
    .sort((a, b) => b.modified - a.modified)
    .slice(0, limit);
}

function mergeOutputPreviewItemMaps(
  existing: Map<string, OutputPreviewItem>,
  incoming: OutputPreviewItem[],
  limit = OUTPUT_PREVIEW_SNAPSHOT_LIMIT,
): Map<string, OutputPreviewItem> {
  const mergedItems = mergeOutputPreviewItems(incoming, Array.from(existing.values()), limit);
  return new Map(mergedItems.map((item) => [item.path, item]));
}

function areOutputPreviewItemsSame(left: OutputPreviewItem[], right: OutputPreviewItem[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem?.id !== rightItem?.id
      || leftItem?.path !== rightItem?.path
      || leftItem?.modified !== rightItem?.modified
      || leftItem?.thumbnailUrl !== rightItem?.thumbnailUrl
      || leftItem?.imageUrl !== rightItem?.imageUrl
    ) {
      return false;
    }
  }
  return true;
}

function normalizeOutputPreviewRootPath(value: unknown): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
}

function normalizeOutputPreviewSourceFileKey(value: unknown): string {
  const normalized = normalizeOutputPreviewRootPath(value);
  if (!normalized) return '';
  return normalized.replace(/\.ppcards\.json$/i, '').toLowerCase();
}

function uniqueOutputPreviewRoots(values: unknown[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const value of values) {
    const normalized = normalizeOutputPreviewRootPath(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(normalized);
  }
  return roots;
}

async function resolveOutputPreviewRoots(): Promise<string[]> {
  if (Array.isArray(outputPreviewRootsCache) && outputPreviewRootsCache.length > 0) {
    return outputPreviewRootsCache;
  }
  if (outputPreviewRootsPromise) return outputPreviewRootsPromise;

  outputPreviewRootsPromise = (async () => {
    const localSettings = loadAppSettings();
    const localExternal = localSettings['comfyui.externalOutputPath'];

    const backendSettings = await fetchAppSettingsFromBackend();
    const backendExternal = backendSettings?.['comfyui.externalOutputPath'];

    const roots = uniqueOutputPreviewRoots([
      localExternal,
      backendExternal,
      ...OUTPUT_PREVIEW_DEFAULT_ROOTS,
    ]);

    outputPreviewRootsCache = roots.length > 0 ? roots : [...OUTPUT_PREVIEW_DEFAULT_ROOTS];
    outputPreviewRootsPromise = null;
    return outputPreviewRootsCache;
  })();

  return outputPreviewRootsPromise;
}

function isOutputPreviewPathWithinRoots(path: string, roots: string[]): boolean {
  const normalizedPath = normalizeOutputPreviewRootPath(path).toLowerCase();
  if (!normalizedPath) return false;
  return roots.some((rootPath) => {
    const normalizedRoot = normalizeOutputPreviewRootPath(rootPath).toLowerCase();
    return !!normalizedRoot && (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`));
  });
}

function filterOutputPreviewItemMapToRoots(
  items: Map<string, OutputPreviewItem>,
  roots: string[],
): Map<string, OutputPreviewItem> {
  const next = new Map<string, OutputPreviewItem>();
  for (const [key, item] of items.entries()) {
    if (!item?.path || !isOutputPreviewPathWithinRoots(item.path, roots)) continue;
    next.set(key, item);
  }
  return next;
}

async function extractOutputPreviewMetadataFromGallery(path: string): Promise<ImageMetadata | null> {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return null;
  const response = await fetchGalleryFs('/metadata', new URLSearchParams({ path: normalizedPath }), { cache: 'no-store' });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as ImageMetadata | null;
}

async function resolveOutputPreviewItemSourceKey(item: OutputPreviewItem): Promise<string> {
  const normalizedPath = String(item?.path || '').trim();
  if (!normalizedPath) return '';
  const cacheKey = normalizedPath.toLowerCase();
  const modified = Number.isFinite(Number(item?.modified)) ? Number(item.modified) : 0;
  const cached = outputPreviewSourceKeyCache.get(cacheKey);
  if (cached && cached.modified === modified) {
    return cached.sourceKey;
  }
  const metadata = await extractOutputPreviewMetadataFromGallery(normalizedPath);
  const sourceCandidate = (
    metadata?.source_file
    ?? metadata?.sourceFile
    ?? metadata?.umbra_metadata?.source_file
    ?? metadata?.umbra_metadata?.sourceFile
    ?? ''
  );
  const sourceKey = normalizeOutputPreviewSourceFileKey(sourceCandidate);
  outputPreviewSourceKeyCache.set(cacheKey, { modified, sourceKey });
  return sourceKey;
}

async function resolveOutputPreviewItemSourceKeyWithTimeout(item: OutputPreviewItem): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      resolveOutputPreviewItemSourceKey(item),
      new Promise<string>((resolve) => {
        timeoutId = setTimeout(() => resolve(''), OUTPUT_PREVIEW_METADATA_SCAN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchPowerPrompterOutputPreviewItems(
  sourceFilePath: string,
  limit = OUTPUT_PREVIEW_SNAPSHOT_LIMIT,
): Promise<PowerPrompterOutputPreviewItem[]> {
  const sourceFileKey = normalizeOutputPreviewSourceFileKey(sourceFilePath);
  if (!sourceFileKey) return [];
  const candidateLimit = Math.max(
    OUTPUT_PREVIEW_INITIAL_CANDIDATE_LIMIT,
    Math.min(
      OUTPUT_PREVIEW_MAX_CANDIDATE_LIMIT,
      Math.max(limit * 8, OUTPUT_PREVIEW_SNAPSHOT_LIMIT * 4),
    ),
  );
  const seen = new Map<string, OutputPreviewItem>();
  const pushItems = (items: any[]) => {
    for (const item of items) {
      if (seen.size >= candidateLimit) break;
      const normalized = normalizeOutputPreviewItem(item);
      if (normalized && !seen.has(normalized.path)) seen.set(normalized.path, normalized);
    }
  };
  const roots = await resolveOutputPreviewRoots();
  for (const rootPath of roots) {
    const normalizedRootPath = normalizeOutputPreviewRootPath(rootPath);
    if (!normalizedRootPath || outputPreviewUnavailableRoots.has(normalizedRootPath.toLowerCase())) {
      continue;
    }
    try {
      const queue: Array<{ path: string; depth: number }> = [{ path: normalizedRootPath, depth: 0 }];
      let visitedFolders = 0;
      while (queue.length > 0 && seen.size < candidateLimit && visitedFolders < OUTPUT_PREVIEW_FOLDER_SCAN_LIMIT) {
        const current = queue.shift();
        if (!current?.path) continue;
        visitedFolders += 1;
        let listing: { files: any[]; folders: any[] } | null = null;
        try {
          listing = await listOutputPreviewPath(
            current.path,
            Math.max(64, Math.min(candidateLimit, OUTPUT_PREVIEW_PATH_LIST_LIMIT)),
          );
        } catch (error: any) {
          const status = Number(error?.status || 0);
          if (current.depth === 0 && (status === 400 || status === 404)) {
            outputPreviewUnavailableRoots.add(normalizedRootPath.toLowerCase());
          }
          listing = null;
        }
        if (!listing) continue;
        pushItems(listing.files);
        if (current.depth >= OUTPUT_PREVIEW_MAX_SCAN_DEPTH) continue;
        if (!Array.isArray(listing.folders) || listing.folders.length === 0) continue;
        const folders = [...listing.folders]
          .sort((a, b) => Number(b?.modified || 0) - Number(a?.modified || 0))
          .slice(0, OUTPUT_PREVIEW_FOLDER_FANOUT);
        for (const folder of folders) {
          const folderPath = String(folder?.path || '').trim();
          if (!folderPath) continue;
          queue.push({ path: folderPath, depth: current.depth + 1 });
        }
      }
    } catch {
      // try next root
    }
    if (seen.size >= candidateLimit) break;
  }
  const candidates = Array.from(seen.values())
    .sort((a, b) => b.modified - a.modified)
    .slice(0, candidateLimit);
  const matches: OutputPreviewItem[] = [];
  let scannedMetadataCount = 0;
  for (
    let index = 0;
    index < candidates.length && matches.length < limit && scannedMetadataCount < OUTPUT_PREVIEW_METADATA_SCAN_LIMIT;
    index += 6
  ) {
    const batch = candidates.slice(index, index + 6);
    const batchSourceKeys = await Promise.all(
      batch.map(async (entry) => {
        try {
          return await resolveOutputPreviewItemSourceKeyWithTimeout(entry);
        } catch {
          return '';
        }
      })
    );
    scannedMetadataCount += batch.length;
    batch.forEach((entry, batchIndex) => {
      if (batchSourceKeys[batchIndex] === sourceFileKey) {
        matches.push(entry);
      }
    });
  }
  return matches.slice(0, limit);
}

export const PowerPrompterCardChainEditor = React.memo(forwardRef<PowerPrompterCardChainEditorRef, PowerPrompterCardChainEditorProps>(({ 
  document,
  queueTargetType = 'pipeline',
  pipelines = [],
  isActive = true,
  queueVisualState = null,
  queuePreviewPrompts = [],
  queuePreviewEntries = [],
  queueCyclePreviewPrompts = [],
  queueCyclePreviewEntries = [],
  queueShuffleEnabled = false,
  queueShuffleSeed = 0,
  queueTraversalMode = 'cycle',
  queuePreviewSetId = 1,
  queueCompletionTick = 0,
  outputPreviewActive = isActive,
  queueSetTarget,
  editorResetTick = 0,
  globalSearchQuery = '',
  globalSearchFocusValue = '',
  globalSearchFocusNonce = 0,
  loraCatalog = [],
  onRefreshLoraCatalog,
  onRequestLoraInfo,
  modelCatalog = [],
  onRefreshModelCatalog,
  onRequestModelInfo,
  onChange,
  onChainLinkFeedback,
  path,
  enabledCSVs,
  overlayMode = false,
  mobileSelectionMode = false,
  touchRemoteMode = false,
  onOutputPreviewSnapshotChange,
}, ref) => {
  const isForgeMode = false;
  const showToast = useStore((state) => state.showToast);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const addScannedImport = useStore((state) => state.addScannedImport);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const pinnedFoldersSetting = useStore((state) => state.appSettings['library.pinnedFolders']);
  const addToast = useToastStore((state) => state.addToast);
  const [activeSlotId, setActiveSlotId] = useState('');
  const [activeVariantId, setActiveVariantId] = useState('');
  const [editingVariantId, setEditingVariantId] = useState('');
  const [variantTextDrafts, setVariantTextDrafts] = useState<Record<string, string>>({});
  const [editingVariantNameId, setEditingVariantNameId] = useState('');
  const [variantNameDrafts, setVariantNameDrafts] = useState<Record<string, string>>({});
  const [editingPromptChip, setEditingPromptChip] = useState<PromptChipEditState | null>(null);
  const [editingVariantTagId, setEditingVariantTagId] = useState('');
  const [variantTagDrafts, setVariantTagDrafts] = useState<Record<string, string>>({});
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [pendingSlotDelete, setPendingSlotDelete] = useState<PendingSlotDeleteState | null>(null);
  const [cardLabelModal, setCardLabelModal] = useState<CardLabelModalState | null>(null);
  const [cardRandomMenu, setCardRandomMenu] = useState<CardRandomMenuState | null>(null);
  const [variantDropSlotId, setVariantDropSlotId] = useState<string | null>(null);
  const [variantPromptDropId, setVariantPromptDropId] = useState<string | null>(null);
  const [chainLinkEditor, setChainLinkEditor] = useState<ChainLinkEditorState | null>(null);
  const [promptFieldsMinimized, setPromptFieldsMinimized] = useState(false);
  const [isLoadingLoraInfo, setIsLoadingLoraInfo] = useState(false);
  const [loraInfoModal, setLoraInfoModal] = useState<PowerPrompterLoraInfoPayload | null>(null);
  const [loraInfoError, setLoraInfoError] = useState<string | null>(null);
  const [isLoraDescriptionExpanded, setIsLoraDescriptionExpanded] = useState(false);
  const [loraTagBank, setLoraTagBank] = useState<Record<string, string[]>>({});
  const [loraCardMetaByName, setLoraCardMetaByName] = useState<Record<string, PowerPrompterLoraCardMeta>>({});
  const [loraCollapsedIds, setLoraCollapsedIds] = useState<string[]>([]);
  const [isLoraBrowserOpen, setIsLoraBrowserOpen] = useState(false);
  const [loraBrowserRootPath, setLoraBrowserRootPath] = useState('');
  const [loraBrowserAvailableRoots, setLoraBrowserAvailableRoots] = useState<string[]>([]);
  const [loraBrowserFsFolders, setLoraBrowserFsFolders] = useState<string[]>([]);
  const [loraBrowserFsFiles, setLoraBrowserFsFiles] = useState<LoraBrowserFileEntry[]>([]);
  const [loraBrowserExpandedFolders, setLoraBrowserExpandedFolders] = useState<string[]>(['']);
  const [loraBrowserFolder, setLoraBrowserFolder] = useState('');
  const [loraBrowserSearch, setLoraBrowserSearch] = useState('');
  const [loraBrowserSelectedPath, setLoraBrowserSelectedPath] = useState('');
  const [loraBrowserThumbTick, setLoraBrowserThumbTick] = useState(0);
  const [isLoraBrowserFsBusy, setIsLoraBrowserFsBusy] = useState(false);
  const [loraBrowserFileMenu, setLoraBrowserFileMenu] = useState<LoraBrowserFileMenuState | null>(null);
  const [loraBrowserFolderMenu, setLoraBrowserFolderMenu] = useState<LoraBrowserFolderMenuState | null>(null);
  const [loraBrowserDropFolderPath, setLoraBrowserDropFolderPath] = useState<string | null>(null);
  const [expandedVariantEditor, setExpandedVariantEditor] = useState<ExpandedVariantEditorState | null>(null);
  const [expandedVariantEditorCaret, setExpandedVariantEditorCaret] = useState({ start: 0, end: 0 });
  const [expandedVariantSuggestions, setExpandedVariantSuggestions] = useState<ExpandedVariantSuggestionEntry[]>([]);
  const [expandedVariantSuggestionOpen, setExpandedVariantSuggestionOpen] = useState(false);
  const [expandedVariantSuggestionIndex, setExpandedVariantSuggestionIndex] = useState(0);
  const [expandedVariantSuggestionLoading, setExpandedVariantSuggestionLoading] = useState(false);
  const [expandedVariantCsvSourceIds, setExpandedVariantCsvSourceIds] = useState<string[]>([]);
  const [modelInfoModal, setModelInfoModal] = useState<PowerPrompterModelInfoPayload | null>(null);
  const [modelInfoError, setModelInfoError] = useState<string | null>(null);
  const [isLoadingModelInfo, setIsLoadingModelInfo] = useState(false);
  const [isModelDescriptionExpanded, setIsModelDescriptionExpanded] = useState(false);
  const [modelCardMetaByName, setModelCardMetaByName] = useState<Record<string, PowerPrompterLoraCardMeta>>({});
  const [isModelBrowserOpen, setIsModelBrowserOpen] = useState(false);
  const [modelBrowserRootPath, setModelBrowserRootPath] = useState('');
  const [modelBrowserAvailableRoots, setModelBrowserAvailableRoots] = useState<string[]>([]);
  const [modelBrowserFsFolders, setModelBrowserFsFolders] = useState<string[]>([]);
  const [modelBrowserFsFiles, setModelBrowserFsFiles] = useState<LoraBrowserFileEntry[]>([]);
  const [modelBrowserExpandedFolders, setModelBrowserExpandedFolders] = useState<string[]>(['']);
  const [modelBrowserFolder, setModelBrowserFolder] = useState('');
  const [modelBrowserSearch, setModelBrowserSearch] = useState('');
  const [modelBrowserSelectedPath, setModelBrowserSelectedPath] = useState('');
  const [modelBrowserType, setModelBrowserType] = useState<PowerPrompterModelType>('checkpoint');
  const [isModelBrowserFsBusy, setIsModelBrowserFsBusy] = useState(false);
  const [modelBrowserThumbTick, setModelBrowserThumbTick] = useState(0);
  const [outputPreviewItems, setOutputPreviewItems] = useState<OutputPreviewItem[]>([]);
  const [isLoadingOutputPreview, setIsLoadingOutputPreview] = useState(false);
  const [outputPreviewError, setOutputPreviewError] = useState<string | null>(null);
  const [forgeMetadataSourceName, setForgeMetadataSourceName] = useState('');
  const [forgeMetadataApplying, setForgeMetadataApplying] = useState(false);
  const [revealedVariantIds, setRevealedVariantIds] = useState<string[]>([]);
  const [laneMetrics, setLaneMetrics] = useState({ clientWidth: 0, scrollWidth: 0, scrollLeft: 0 });
  const [cardNavMetrics, setCardNavMetrics] = useState({ clientWidth: 0, scrollLeft: 0 });
  const [variantViewportMetricsBySlotId, setVariantViewportMetricsBySlotId] = useState<Record<string, VariantViewportMetrics>>({});
  const [slotChipDragId, setSlotChipDragId] = useState('');
  const [slotChipDropId, setSlotChipDropId] = useState('');
  const variantDragRef = useRef<VariantDragState | null>(null);
  const outputPreviewLoadSeqRef = useRef(0);
  const outputPreviewItemsRef = useRef<OutputPreviewItem[]>([]);
  const directOutputPreviewItemsRef = useRef<Map<string, OutputPreviewItem>>(new Map());
  const outputPreviewCompletionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputPreviewCompletionRetryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const expandedVariantTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inlineVariantTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const expandedVariantSuggestionAbortRef = useRef<AbortController | null>(null);
  const expandedVariantSuggestionSeqRef = useRef(0);
  const expandedVariantFocusKeyRef = useRef('');
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const laneScrollRef = useRef<HTMLDivElement | null>(null);
  const laneBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const laneContentRef = useRef<HTMLDivElement | null>(null);
  const cardNavScrollRef = useRef<HTMLDivElement | null>(null);
  const touchHorizontalPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    dragging: boolean;
    node: HTMLElement;
    syncLaneBottom: boolean;
  } | null>(null);
  const suppressTouchPanClickUntilRef = useRef(0);
  const cardNavButtonRefMap = useRef(new Map<string, HTMLButtonElement>());
  const laneMetricsRafRef = useRef<number | null>(null);
  const cardNavMetricsRafRef = useRef<number | null>(null);
  const variantViewportMetricsRafRef = useRef<number | null>(null);
  const pendingVariantViewportMetricsRef = useRef(new Map<string, VariantViewportMetrics>());
  const slotSurfaceRefMap = useRef(new Map<string, HTMLDivElement>());
  const generationControlsSurfaceRef = useRef<HTMLDivElement | null>(null);
  const slotVariantViewportRefMap = useRef(new Map<string, HTMLDivElement>());
  const variantSurfaceRefMap = useRef(new Map<string, HTMLDivElement>());
  const variantPromptFieldRefMap = useRef(new Map<string, HTMLDivElement>());
  const isActiveRef = useRef(isActive);
  const prevSlotRectsRef = useRef(new Map<string, DOMRect>());
  const prevSlotOrderRef = useRef<string[]>([]);
  const pendingLaneRestoreLeftRef = useRef<number | null>(null);
  const loraCardMetaPendingRef = useRef(new Set<string>());
  const modelCardMetaPendingRef = useRef(new Set<string>());
  const modelBrowserFilesLoadSeqRef = useRef(0);
  const modelBrowserRootRefreshKeyRef = useRef('');
  const loraBrowserFilesLoadSeqRef = useRef(0);
  const loraBrowserRootPathRef = useRef('');
  const loraBrowserFolderRef = useRef('');
  const forgeMetadataInputRef = useRef<HTMLInputElement | null>(null);
  const tokenRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loraBrowserInfoClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelBrowserInfoClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHandledGlobalSearchFocusNonceRef = useRef(0);
  const loraThumbnailPickerRef = useRef<HTMLInputElement | null>(null);
  const pendingLoraThumbnailPathRef = useRef('');
  const suppressedVariantDragIdRef = useRef('');
  const globalThumbnailOverridesHydratedRef = useRef(false);
  const [globalThumbnailOverrides, setGlobalThumbnailOverrides] = useState<Record<string, string[]>>({});

  const activeQueueSet = clampQueueSetId(queueSetTarget ?? document.activeQueueSet);
  const documentShuffleSalt = useMemo(() => normalizePowerPrompterPromptText(JSON.stringify({
    queueShuffleSeed,
    activeQueueSet: document.activeQueueSet,
    cards: document.cards.map((card) => ({
      id: card.id,
      text: card.text,
      queueSetIds: normalizeQueueSetIds(card.queueSetIds, false),
    })),
  })), [queueShuffleSeed, document.activeQueueSet, document.cards]);
  const generation = useMemo(
    () => normalizePowerPrompterGenerationControls(document.generation),
    [document.generation]
  );
  const styleSeedMode = String((document as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same';
  const estimatedBatchSize = Math.max(1, Math.floor(Number(generation.batchSize) || 1));
  const slots = useMemo(() => buildSlots(document.cards), [document.cards]);
  const totalVariantCount = useMemo(
    () => slots.reduce((sum, slot) => sum + slot.variants.length, 0),
    [slots]
  );
  const shouldUseRenderContainment = totalVariantCount >= 40;
  const shouldUseVariantContentVisibility = totalVariantCount >= 40;
  // Keep card content-visibility off; horizontal slot windowing handles card-level virtualization.
  const shouldUseCardContentVisibility = false;
  const cardGroupNameOptions = useMemo(() => {
    const baseKeys = new Set([
      normalizeCustomGroupName('Character'),
      normalizeCustomGroupName('Location'),
      normalizeCustomGroupName('Expression'),
      normalizeCustomGroupName('Action'),
      normalizeCustomGroupName('Style'),
      normalizeCustomGroupName('Custom'),
    ]);
    const byKey = new Map<string, string>();
    for (const slot of slots) {
      const label = String(slot.label || '').trim();
      const key = normalizeCustomGroupName(label);
      if (!label || !key) continue;
      if (baseKeys.has(key)) continue;
      if (!byKey.has(key)) byKey.set(key, label);
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [slots]);
  const cardNameSelectOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const slot of slots) {
      const label = String(slot.label || '').trim() || cardTypeLabel(slot.type);
      const key = normalizeCustomGroupName(label);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, label);
    }
    const defaults = ['Character', 'Location', 'Expression', 'Action', 'Style', 'Custom'];
    for (const fallback of defaults) {
      const key = normalizeCustomGroupName(fallback);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, fallback);
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [slots]);
  const globalSearchTerms = useMemo(
    () => normalizeGlobalSearchTerms(globalSearchQuery),
    [globalSearchQuery]
  );
  const deferredGlobalSearchTerms = useDeferredValue(globalSearchTerms);
  const globalSearchMatchByVariantId = useMemo(() => {
    const matches = new Map<string, boolean>();
    if (!Array.isArray(deferredGlobalSearchTerms) || deferredGlobalSearchTerms.length === 0) return matches;
    for (const slot of slots) {
      for (const variant of slot.variants) {
        const variantTitle = normalizeVariantName(variant.variantName);
        matches.set(
          variant.id,
          variantMatchesGlobalChipSearch(variantTitle, null, variant.text, deferredGlobalSearchTerms)
        );
      }
    }
    return matches;
  }, [slots, deferredGlobalSearchTerms]);
  const getSlotDisplayVariants = useCallback((slot: ChainSlot, slotIndex: number) => {
    let prioritized: Array<{ variant: PowerPrompterCardNode; actualIndex: number }> = [];
    const remainder: Array<{ variant: PowerPrompterCardNode; actualIndex: number }> = [];
    for (let idx = 0; idx < slot.variants.length; idx += 1) {
      const variant = slot.variants[idx];
      const entry = { variant, actualIndex: idx };
      const setIds = normalizeQueueSetIds(variant.queueSetIds, false);
      if (setIds.includes(activeQueueSet)) prioritized.push(entry);
      else remainder.push(entry);
    }
    if (queueShuffleEnabled && prioritized.length > 1) {
      const shuffledEntries = stableShuffleDisplayItems(
        prioritized,
        `${documentShuffleSalt}|set:${activeQueueSet}|slot:${slotIndex}`,
        (entry) => `${normalizePowerPrompterPromptText(entry.variant.text)}|${entry.variant.id}`
      );
      const firstAppearanceByVariantId = new Map<string, number>();
      shuffledEntries.forEach((entry, index) => {
        if (!firstAppearanceByVariantId.has(entry.variant.id)) {
          firstAppearanceByVariantId.set(entry.variant.id, index);
        }
      });
      prioritized = [...prioritized].sort((a, b) => {
        const aIndex = firstAppearanceByVariantId.get(a.variant.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = firstAppearanceByVariantId.get(b.variant.id) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex || a.actualIndex - b.actualIndex;
      });
    }
    return [...prioritized, ...remainder];
  }, [activeQueueSet, documentShuffleSalt, queueShuffleEnabled]);
  const slotSurfaceStyle = useMemo<React.CSSProperties | undefined>(() => {
    const next: React.CSSProperties = {};
    if (shouldUseRenderContainment) {
      next.contain = 'paint';
    }
    if (shouldUseCardContentVisibility) {
      (next as React.CSSProperties & { contentVisibility?: string; containIntrinsicSize?: string }).contentVisibility = 'auto';
      (next as React.CSSProperties & { contentVisibility?: string; containIntrinsicSize?: string }).containIntrinsicSize = '700px';
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }, [shouldUseRenderContainment, shouldUseCardContentVisibility]);
  const variantSurfaceStyle = useMemo<React.CSSProperties | undefined>(() => {
    const next: React.CSSProperties & { contentVisibility?: string; containIntrinsicSize?: string } = {};
    if (shouldUseRenderContainment) {
      next.contain = 'layout paint style';
    }
    if (shouldUseVariantContentVisibility) {
      next.contentVisibility = 'auto';
      next.containIntrinsicSize = '148px';
    }
    return Object.keys(next).length > 0 ? next : undefined;
  }, [shouldUseRenderContainment, shouldUseVariantContentVisibility]);
  const outputPrompt = useMemo(() => activePromptFromSlots(slots, activeQueueSet), [slots, activeQueueSet]);
  const setSlotSurfaceRef = useCallback((slotId: string, node: HTMLDivElement | null) => {
    if (node) {
      slotSurfaceRefMap.current.set(slotId, node);
      return;
    }
    slotSurfaceRefMap.current.delete(slotId);
  }, []);
  const setVariantViewportMetricsIfChanged = useCallback((slotId: string, next: VariantViewportMetrics) => {
    setVariantViewportMetricsBySlotId((prev) => {
      const current = prev[slotId];
      if (
        current
        && Math.abs(current.clientHeight - next.clientHeight) < 1
        && Math.abs(current.scrollTop - next.scrollTop) < 1
      ) {
        return prev;
      }
      return { ...prev, [slotId]: next };
    });
  }, []);
  const flushVariantViewportMetrics = useCallback(() => {
    variantViewportMetricsRafRef.current = null;
    const pending = pendingVariantViewportMetricsRef.current;
    if (pending.size <= 0) return;
    const entries = Array.from(pending.entries());
    pending.clear();
    setVariantViewportMetricsBySlotId((prev) => {
      let nextState = prev;
      for (const [slotId, next] of entries) {
        const current = nextState[slotId];
        if (
          current
          && Math.abs(current.clientHeight - next.clientHeight) < 1
          && Math.abs(current.scrollTop - next.scrollTop) < 1
        ) {
          continue;
        }
        if (nextState === prev) nextState = { ...prev };
        nextState[slotId] = next;
      }
      return nextState;
    });
  }, []);
  const scheduleVariantViewportMetricsUpdate = useCallback((slotId: string, next: VariantViewportMetrics) => {
    pendingVariantViewportMetricsRef.current.set(slotId, next);
    if (variantViewportMetricsRafRef.current !== null) return;
    variantViewportMetricsRafRef.current = window.requestAnimationFrame(flushVariantViewportMetrics);
  }, [flushVariantViewportMetrics]);
  const setSlotVariantViewportRef = useCallback((slotId: string, node: HTMLDivElement | null) => {
    if (node) {
      slotVariantViewportRefMap.current.set(slotId, node);
      setVariantViewportMetricsIfChanged(slotId, {
        clientHeight: node.clientHeight,
        scrollTop: node.scrollTop,
      });
      return;
    }
    slotVariantViewportRefMap.current.delete(slotId);
  }, [setVariantViewportMetricsIfChanged]);
  const handleVariantViewportScroll = useCallback((slotId: string, event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    scheduleVariantViewportMetricsUpdate(slotId, {
      clientHeight: node.clientHeight,
      scrollTop: node.scrollTop,
    });
  }, [scheduleVariantViewportMetricsUpdate]);
  const scrollVariantIndexIntoView = useCallback((slotId: string, rawVariantIndex: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = slotVariantViewportRefMap.current.get(slotId);
    if (!viewport) return;
    const variantIndex = Math.max(0, Math.floor(Number(rawVariantIndex) || 0));
    const itemTop = variantIndex * POWER_PROMPTER_VARIANT_CARD_STRIDE;
    const itemBottom = itemTop + POWER_PROMPTER_VARIANT_CARD_HEIGHT;
    const viewportTop = viewport.scrollTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
    const breathingRoom = POWER_PROMPTER_VARIANT_CARD_GAP * 2;
    let nextTop = viewportTop;
    if (itemTop < viewportTop + breathingRoom) {
      nextTop = Math.max(0, itemTop - breathingRoom);
    } else if (itemBottom > viewportBottom - breathingRoom) {
      nextTop = Math.max(0, itemBottom - viewport.clientHeight + breathingRoom);
    }
    if (Math.abs(nextTop - viewportTop) < 1) return;
    viewport.scrollTo({ top: nextTop, behavior });
  }, []);
  const setCardNavButtonRef = useCallback((slotId: string, node: HTMLButtonElement | null) => {
    if (node) {
      cardNavButtonRefMap.current.set(slotId, node);
      return;
    }
    cardNavButtonRefMap.current.delete(slotId);
  }, []);
  const setCardNavMetricsIfChanged = useCallback((next: { clientWidth: number; scrollLeft: number }) => {
    setCardNavMetrics((prev) => (
      Math.abs(prev.clientWidth - next.clientWidth) < 1
      && Math.abs(prev.scrollLeft - next.scrollLeft) < 1
        ? prev
        : next
    ));
  }, []);
  const readCardNavMetrics = useCallback(() => {
    const container = cardNavScrollRef.current;
    if (!container) return;
    setCardNavMetricsIfChanged({
      clientWidth: container.clientWidth,
      scrollLeft: Math.max(0, container.scrollLeft),
    });
  }, [setCardNavMetricsIfChanged]);
  const scheduleCardNavMetricsRead = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (cardNavMetricsRafRef.current !== null) return;
    cardNavMetricsRafRef.current = window.requestAnimationFrame(() => {
      cardNavMetricsRafRef.current = null;
      readCardNavMetrics();
    });
  }, [readCardNavMetrics]);
  const handleCardNavScroll = useCallback(() => {
    scheduleCardNavMetricsRead();
  }, [scheduleCardNavMetricsRead]);
  const scrollCardNavButtonIntoView = useCallback((slotId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = cardNavScrollRef.current;
    if (!container) return;
    const slotIndex = slots.findIndex((slot) => slot.slotId === slotId);
    if (slotIndex < 0) return;
    const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxLeft <= 0) return;
    const targetLeft = Math.max(
      0,
      Math.min(
        maxLeft,
        (slotIndex * CARD_NAV_CHIP_STRIDE) - ((container.clientWidth - CARD_NAV_CHIP_WIDTH) / 2)
      )
    );
    container.scrollTo({ left: targetLeft, behavior });
  }, [slots]);
  const setVariantSurfaceRef = useCallback((variantId: string, node: HTMLDivElement | null) => {
    if (node) {
      variantSurfaceRefMap.current.set(variantId, node);
      return;
    }
    variantSurfaceRefMap.current.delete(variantId);
  }, []);
  const setVariantPromptFieldRef = useCallback((variantId: string, node: HTMLDivElement | null) => {
    if (node) {
      variantPromptFieldRefMap.current.set(variantId, node);
      return;
    }
    variantPromptFieldRefMap.current.delete(variantId);
  }, []);
  const activeSetAccentColor = useMemo(() => getSetColor(activeQueueSet), [activeQueueSet]);

  const clearTokenRevealTimer = useCallback(() => {
    if (!tokenRevealTimerRef.current) return;
    clearTimeout(tokenRevealTimerRef.current);
    tokenRevealTimerRef.current = null;
  }, []);
  const clearLoraBrowserInfoClickTimer = useCallback(() => {
    if (!loraBrowserInfoClickTimerRef.current) return;
    clearTimeout(loraBrowserInfoClickTimerRef.current);
    loraBrowserInfoClickTimerRef.current = null;
  }, []);
  const clearModelBrowserInfoClickTimer = useCallback(() => {
    if (!modelBrowserInfoClickTimerRef.current) return;
    clearTimeout(modelBrowserInfoClickTimerRef.current);
    modelBrowserInfoClickTimerRef.current = null;
  }, []);

  const revealVariantForToken = useCallback((rawToken: string) => {
    const token = String(rawToken || '').trim();
    if (!token) return;

    const matches: Array<{ slotId: string; slotLabel: string; variantId: string; variantIndex: number; slotIndex: number }> = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      for (let idx = 0; idx < slot.variants.length; idx += 1) {
        const variant = slot.variants[idx];
        if (promptHasToken(String(variant.text || ''), token)) {
          matches.push({
            slotId: slot.slotId,
            slotLabel: slot.label,
            variantId: variant.id,
            variantIndex: idx,
            slotIndex,
          });
        }
      }
    }

    if (matches.length <= 0) {
      showToast(`Token not found in any variant: ${token}`, 'error');
      return;
    }

    const found = matches[0];
    const revealedIds = Array.from(new Set(matches.map((match) => match.variantId).filter(Boolean)));
    setActiveSlotId(found.slotId);
    setActiveVariantId(found.variantId);
    setRevealedVariantIds(revealedIds);
    clearTokenRevealTimer();
    tokenRevealTimerRef.current = setTimeout(() => {
      tokenRevealTimerRef.current = null;
      setRevealedVariantIds((current) => (
        current.length === revealedIds.length && current.every((id, index) => id === revealedIds[index])
          ? []
          : current
      ));
    }, 1600);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        slotSurfaceRefMap.current.get(found!.slotId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
        window.requestAnimationFrame(() => {
          scrollVariantIndexIntoView(found!.slotId, found!.variantIndex, 'smooth');
        });
      });
    }

    showToast(
      matches.length === 1
        ? `Revealed ${found.slotLabel} ${formatVariantPositionLabel(found.variantIndex)}`
        : `Revealed ${matches.length} matching variants`,
      'success'
    );
  }, [clearTokenRevealTimer, scrollVariantIndexIntoView, showToast, slots]);

  useEffect(() => {
    const focusNonce = Number(globalSearchFocusNonce);
    if (!Number.isFinite(focusNonce) || focusNonce <= 0) return;
    if (focusNonce === lastHandledGlobalSearchFocusNonceRef.current) return;
    lastHandledGlobalSearchFocusNonceRef.current = focusNonce;
    const chip = String(globalSearchFocusValue || '').trim();
    if (!chip) return;

    let found: { slotId: string; variantId: string; slotIndex: number; variantIndex: number } | null = null;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      for (let variantIndex = 0; variantIndex < slot.variants.length; variantIndex += 1) {
        const variant = slot.variants[variantIndex];
        if (!variantHasSearchChip(variant, chip)) continue;
        found = { slotId: slot.slotId, variantId: variant.id, slotIndex, variantIndex };
        break;
      }
      if (found) break;
    }
    if (!found) return;

    setActiveSlotId(found.slotId);
    setActiveVariantId(found.variantId);
    setRevealedVariantIds([found.variantId]);
    clearTokenRevealTimer();
    tokenRevealTimerRef.current = setTimeout(() => {
      tokenRevealTimerRef.current = null;
      setRevealedVariantIds((current) => (
        current.length === 1 && current[0] === found?.variantId ? [] : current
      ));
    }, 1600);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        slotSurfaceRefMap.current.get(found!.slotId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
        window.requestAnimationFrame(() => {
          scrollVariantIndexIntoView(found!.slotId, found!.variantIndex, 'smooth');
        });
      });
    }
  }, [globalSearchFocusNonce, globalSearchFocusValue, slots, clearTokenRevealTimer, scrollVariantIndexIntoView]);

  useLayoutEffect(() => {
    const slotOrder = slots.map((slot) => slot.slotId);
    const prevOrder = prevSlotOrderRef.current;
    const shouldAnimate =
      prevOrder.length > 0 &&
      (prevOrder.length !== slotOrder.length || prevOrder.some((slotId, idx) => slotId !== slotOrder[idx]));

    const nextRects = new Map<string, DOMRect>();
    for (const slot of slots) {
      const node = slotSurfaceRefMap.current.get(slot.slotId);
      if (!node) continue;
      nextRects.set(slot.slotId, node.getBoundingClientRect());
    }

    prevSlotOrderRef.current = slotOrder;
    if (!shouldAnimate) {
      prevSlotRectsRef.current = nextRects;
      return;
    }

    const prevRects = prevSlotRectsRef.current;
    for (const [slotId, nextRect] of nextRects.entries()) {
      const prevRect = prevRects.get(slotId);
      if (!prevRect) continue;
      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const node = slotSurfaceRefMap.current.get(slotId);
      if (!node) continue;
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      void node.getBoundingClientRect();
      node.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
      node.style.transform = 'translate(0px, 0px)';
      const clearTransition = () => {
        node.style.transition = '';
        node.removeEventListener('transitionend', clearTransition);
      };
      node.addEventListener('transitionend', clearTransition);
    }

    prevSlotRectsRef.current = nextRects;
  }, [slots]);

  useLayoutEffect(() => {
    const pendingLeft = pendingLaneRestoreLeftRef.current;
    if (pendingLeft === null) return;
    const laneNode = laneScrollRef.current;
    const bottomNode = laneBottomScrollRef.current;
    if (laneNode) laneNode.scrollLeft = pendingLeft;
    if (bottomNode) bottomNode.scrollLeft = pendingLeft;
    setLaneMetrics((prev) => {
      const next = {
        clientWidth: laneNode?.clientWidth ?? prev.clientWidth,
        scrollWidth: laneNode?.scrollWidth ?? prev.scrollWidth,
        scrollLeft: pendingLeft,
      };
      if (
        Math.abs(prev.clientWidth - next.clientWidth) < 1
        && Math.abs(prev.scrollWidth - next.scrollWidth) < 1
        && Math.abs(prev.scrollLeft - next.scrollLeft) < 1
      ) {
        return prev;
      }
      return next;
    });
    pendingLaneRestoreLeftRef.current = null;
  }, [slots]);

  useLayoutEffect(() => {
    const activeSlotIds = new Set(slots.map((slot) => slot.slotId));
    setPendingSlotDelete((prev) => {
      if (!prev) return prev;
      return activeSlotIds.has(prev.slotId) ? prev : null;
    });
    setCardLabelModal((prev) => {
      if (!prev) return prev;
      return activeSlotIds.has(prev.slotId) ? prev : null;
    });
  }, [slots]);

  const queueActivePrompt = useMemo(() => {
    if (!queueVisualState || queueVisualState.prompts.length === 0) return '';
    const idx = Math.max(0, Math.min(queueVisualState.prompts.length - 1, Math.floor(queueVisualState.activeIndex || 0)));
    return String(queueVisualState.prompts[idx] || '');
  }, [queueVisualState]);
  const hasLiveQueue = Boolean(queueVisualState && queueVisualState.prompts.length > 0);

  const queueActiveSeed = useMemo(() => {
    if (!queueVisualState || queueVisualState.prompts.length === 0) return null;
    const idx = Math.max(0, Math.min(queueVisualState.prompts.length - 1, Math.floor(queueVisualState.activeIndex || 0)));
    const rawSeed = Number(queueVisualState.promptSeeds?.[idx]);
    if (!Number.isFinite(rawSeed)) return null;
    return Math.max(0, Math.floor(rawSeed));
  }, [queueVisualState]);

  const negativePromptValue = useMemo(
    () => String(generation.negativePrompt || ''),
    [generation.negativePrompt]
  );
  const activePromptSource = useMemo(() => {
    if (queueVisualState && queueVisualState.prompts.length > 0) {
      const queuedPrompt = String(queueActivePrompt || '').trim();
      if (queuedPrompt) return queuedPrompt;
    }
    return String(outputPrompt || '').trim();
  }, [queueVisualState, queueActivePrompt, outputPrompt]);
  const activePromptBlocks = useMemo(
    () => buildPowerPrompterActivePromptBlocks(document.cards, activePromptSource, {
      setId: queueVisualState?.activeSetId ?? activeQueueSet,
    }),
    [document.cards, activePromptSource, queueVisualState?.activeSetId, activeQueueSet]
  );
  const visibleActivePromptBlocks = useMemo(() => {
    if (!activePromptSource) return [];
    return activePromptBlocks.map((block) => ({ ...block, visibleText: block.promptText }));
  }, [activePromptBlocks, activePromptSource]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const loraInfoView = useMemo(() => {
    if (!loraInfoModal) return null;
    const civitaiRoot = loraInfoModal.civitai && typeof loraInfoModal.civitai === 'object'
      ? loraInfoModal.civitai
      : {};
    const civitaiRecord = civitaiRoot as Record<string, unknown>;
    const civitaiModel = civitaiRecord.model;
    const civitaiStats = civitaiRecord.stats;
    const modelRecord = civitaiModel && typeof civitaiModel === 'object'
      ? civitaiModel as Record<string, unknown>
      : {};
    const statsRecord = civitaiStats && typeof civitaiStats === 'object'
      ? civitaiStats as Record<string, unknown>
      : {};
    const thumbnailUrls = extractCivitaiImageUrls(loraInfoModal).slice(0, 8);
    const civitaiUrl = buildCivitaiUrlFromPayload(loraInfoModal);
    const { descriptionHtml, descriptionText } = buildSanitizedLoraDescription(loraInfoModal);
    return {
      modelName: String(modelRecord.name || 'Unavailable'),
      versionName: String(civitaiRecord.name || 'Unavailable'),
      downloadCount: String(statsRecord.downloadCount ?? 'n/a'),
      civitaiUrl: normalizeHttpUrl(civitaiUrl),
      thumbnailUrls,
      descriptionHtml,
      descriptionText,
    };
  }, [loraInfoModal]);
  const hasLoraDescription = Boolean(String(loraInfoView?.descriptionHtml || '').trim());
  const shouldShowLoraDescriptionToggle = (loraInfoView?.descriptionText?.length || 0) > 420;
  const modelInfoView = useMemo(() => {
    if (!modelInfoModal) return null;
    const civitaiRoot = modelInfoModal.civitai && typeof modelInfoModal.civitai === 'object'
      ? modelInfoModal.civitai
      : {};
    const civitaiRecord = civitaiRoot as Record<string, unknown>;
    const civitaiModel = civitaiRecord.model;
    const civitaiStats = civitaiRecord.stats;
    const modelRecord = civitaiModel && typeof civitaiModel === 'object'
      ? civitaiModel as Record<string, unknown>
      : {};
    const statsRecord = civitaiStats && typeof civitaiStats === 'object'
      ? civitaiStats as Record<string, unknown>
      : {};
    const mappedPayload = {
      loraName: modelInfoModal.modelName,
      metadata: modelInfoModal.metadata,
      civitai: modelInfoModal.civitai,
      trainedTags: modelInfoModal.trainedTags,
      descriptionHtml: modelInfoModal.descriptionHtml,
      descriptionText: modelInfoModal.descriptionText,
    } as PowerPrompterLoraInfoPayload;
    const thumbnailUrls = extractCivitaiImageUrls(mappedPayload).slice(0, 8);
    const civitaiUrl = buildCivitaiUrlFromPayload(mappedPayload);
    const { descriptionHtml, descriptionText } = buildSanitizedLoraDescription(mappedPayload);
    return {
      modelName: String(modelRecord.name || 'Unavailable'),
      versionName: String(civitaiRecord.name || 'Unavailable'),
      downloadCount: String(statsRecord.downloadCount ?? 'n/a'),
      civitaiUrl: normalizeHttpUrl(civitaiUrl),
      thumbnailUrls,
      descriptionHtml,
      descriptionText,
    };
  }, [modelInfoModal]);
  const hasModelDescription = Boolean(String(modelInfoView?.descriptionHtml || '').trim());
  const shouldShowModelDescriptionToggle = (modelInfoView?.descriptionText?.length || 0) > 420;

  const activeSlot = useMemo(() => slots.find((slot) => slot.slotId === activeSlotId) || slots[0] || null, [slots, activeSlotId]);
  const activeVariant = useMemo(() => {
    if (!activeSlot) return null;
    return activeSlot.variants.find((variant) => variant.id === activeVariantId) || activeSlot.variants[0] || null;
  }, [activeSlot, activeVariantId]);
  useLayoutEffect(() => {
    if (!activeSlotId) return;
    scrollCardNavButtonIntoView(activeSlotId, 'smooth');
  }, [activeSlotId, scrollCardNavButtonIntoView]);
  const deletedCardGroups = useMemo(
    () => normalizeDeletedCardGroups((document as any).deletedCardGroups),
    [document]
  );

  const emitSlots = useCallback((
    nextSlots: ChainSlot[],
    nextActiveQueueSet = activeQueueSet,
    nextDeletedCardGroups: Record<string, PowerPrompterDeletedCardGroup> = deletedCardGroups,
  ) => {
    const groupedSlots = coalesceSlotsByGrouping(nextSlots);
    onChange({
      ...document,
      activeQueueSet: clampQueueSetId(nextActiveQueueSet),
      updatedAt: getNowIso(),
      cards: flattenSlots(groupedSlots),
      deletedCardGroups: normalizeDeletedCardGroups(nextDeletedCardGroups),
    });
  }, [document, onChange, activeQueueSet, deletedCardGroups]);

  const postGalleryOpenPath = useCallback((rawDetail: PendingGalleryOpenPathPayload) => {
    const path = String(rawDetail.path || rawDetail.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
    if (!path) return;
    const imagePath = String(rawDetail.imagePath || '').replace(/\\/g, '/').trim();
    const detail: PendingGalleryOpenPathPayload = {
      path,
      folderPath: path,
      ...(imagePath ? { imagePath } : {}),
      ...(String(rawDetail.source || '').trim() ? { source: String(rawDetail.source || '').trim() } : {}),
    };

    const windowWithPending = window as typeof window & { __umbraPendingGalleryOpenPath?: PendingGalleryOpenPathPayload | null };
    windowWithPending.__umbraPendingGalleryOpenPath = detail;

    const emitOpenPath = () => {
      window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', { detail }));
    };

    emitOpenPath();
  }, []);

  const postGalleryRevealPath = useCallback((rawDetail: PendingGalleryOpenPathPayload) => {
    const path = String(rawDetail.path || rawDetail.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
    if (!path) return;
    const imagePath = String(rawDetail.imagePath || '').replace(/\\/g, '/').trim();
    const detail: PendingGalleryOpenPathPayload = {
      path,
      folderPath: path,
      ...(imagePath ? { imagePath } : {}),
      ...(String(rawDetail.source || '').trim() ? { source: String(rawDetail.source || '').trim() } : {}),
    };

    const windowWithPending = window as typeof window & { __umbraPendingGalleryRevealPath?: PendingGalleryOpenPathPayload | null };
    windowWithPending.__umbraPendingGalleryRevealPath = detail;

    const emitRevealPath = () => {
      window.dispatchEvent(new CustomEvent('umbra:gallery-reveal-path', { detail }));
    };

    emitRevealPath();
  }, []);

  const openOutputInLibrary = useCallback((item: OutputPreviewItem) => {
    const normalizedFilePath = String(item.path || '').replace(/\\/g, '/').trim();
    const folderPath = getParentFolderPath(normalizedFilePath);
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }

    const detail = {
      path: folderPath,
      folderPath,
      imagePath: normalizedFilePath,
      source: 'powerprompter-recent-output',
    };

    setActiveWorkspace('library');
    postGalleryOpenPath(detail);

    showToast(`Opened in Gallery: ${item.name}`, 'success');
  }, [postGalleryOpenPath, setActiveWorkspace, showToast]);

  const revealOutputInLibrary = useCallback((item: OutputPreviewItem) => {
    const normalizedFilePath = String(item.path || '').replace(/\\/g, '/').trim();
    const folderPath = getParentFolderPath(normalizedFilePath);
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }

    const detail = {
      path: folderPath,
      folderPath,
      imagePath: normalizedFilePath,
      source: 'powerprompter-recent-output',
    };

    setActiveWorkspace('library');
    postGalleryRevealPath(detail);
    showToast(`Revealed in Gallery: ${item.name}`, 'success');
  }, [postGalleryRevealPath, setActiveWorkspace, showToast]);

  const openOutputInExplorer = useCallback(async (item: OutputPreviewItem) => {
    if (isUmbraRemoteClient()) {
      showToast('Opening File Explorer is only available from the host PC.', 'error');
      return;
    }
    const normalizedFilePath = String(item.path || '').replace(/\\/g, '/').trim();
    const folderPath = getParentFolderPath(normalizedFilePath);
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }

    try {
      const response = await fetch('/api/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(String(payload?.error || 'Failed to open folder in file explorer'));
      }
      showToast(`Opened in Explorer: ${folderPath}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to open folder in file explorer'), 'error');
    }
  }, [showToast]);

  const pinOutputFolder = useCallback((item: OutputPreviewItem) => {
    const normalizedFilePath = normalizeLoraCatalogPath(String(item.path || ''));
    const folderPath = normalizeLoraCatalogPath(getParentFolderPath(normalizedFilePath));
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }

    const pinnedRaw = Array.isArray(pinnedFoldersSetting)
      ? pinnedFoldersSetting
      : [];
    const pinned = Array.from(new Set(
      pinnedRaw
        .map((entry) => normalizeLoraCatalogPath(String(entry || '')))
        .filter(Boolean),
    ));

    if (pinned.includes(folderPath)) {
      showToast('Folder already pinned in Gallery + Filmstrip', 'success');
      return;
    }

    const nextPinned = [...pinned, folderPath];
    setAppSetting('library.pinnedFolders', nextPinned);
    window.dispatchEvent(new CustomEvent('umbra:gallery-pin-folder', {
      detail: {
        path: folderPath,
        pinned: true,
        source: 'powerprompter-recent-output-pin',
      },
    }));
    void pushAppSettingsToBackend(loadAppSettings()).catch(() => undefined);
    showToast(`Pinned folder: ${folderPath}`, 'success');
  }, [pinnedFoldersSetting, setAppSetting, showToast]);

  const sendOutputToWorkspace = useCallback((item: OutputPreviewItem, workspace: 'waifudiffusion' | 'scanner') => {
    const normalizedPath = String(item.path || '').replace(/\\/g, '/').trim();
    if (!normalizedPath) {
      showToast('Invalid output path', 'error');
      return;
    }
    addScannedImport([normalizedPath]);
    if (workspace === 'scanner' || workspace === 'waifudiffusion') {
      useStore.getState().setUI('imageInspectorTab', workspace === 'scanner' ? 'scanner' : 'waifu');
      setActiveWorkspace('imageinspector');
    } else {
      setActiveWorkspace(workspace);
    }
    showToast(
      workspace === 'waifudiffusion'
        ? `Sent to Waifu Diffusion: ${item.name}`
        : `Sent to Metadata Scanner: ${item.name}`,
      'success'
    );
  }, [addScannedImport, setActiveWorkspace, showToast]);

  const sendOutputToTrash = useCallback(async (item: OutputPreviewItem) => {
    const normalizedPath = String(item.path || '').replace(/\\/g, '/').trim();
    if (!normalizedPath) {
      showToast('Invalid output path', 'error');
      return;
    }
    try {
      const appSettings = loadAppSettings();
      const result = await deletePathsWithSettings([normalizedPath], appSettings);
      setOutputPreviewItems((prev) => prev.filter((entry) => entry.id !== item.id));
      const deletedPaths = Array.from(new Set(
        (result.deletedPaths || [])
          .map((entry) => String(entry || '').replace(/\\/g, '/').trim())
          .filter(Boolean),
      ));
      if (typeof window !== 'undefined' && deletedPaths.length > 0) {
        window.dispatchEvent(new CustomEvent('umbra:gallery-remove-paths', {
          detail: {
            paths: deletedPaths,
            source: 'powerprompter-recent-output',
          },
        }));
      }
      window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
        detail: { source: 'powerprompter-recent-output' },
      }));
      const undoItem = (result.trashItems || []).find((entry) =>
        String(entry?.originalPath || '').replace(/\\/g, '/').trim() === normalizedPath);
      addToast({
        type: 'success',
        message: `Moved to Trash: ${item.name}`,
        ...(undoItem
          ? {
            action: {
              label: 'Undo',
              onClick: async () => {
                try {
                  const restoreResponse = await fetch('/api/trash/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      items: [{ trashPath: undoItem.trashPath, originalPath: undoItem.originalPath }],
                    }),
                  });
                  const restorePayload = await restoreResponse.json().catch(() => ({} as Record<string, unknown>));
                  if (!restoreResponse.ok) {
                    throw new Error(String(restorePayload?.error || 'Failed to restore from trash'));
                  }
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
                      detail: {
                        paths: [normalizedPath],
                        source: 'powerprompter-recent-output',
                      },
                    }));
                    window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
                      detail: { source: 'powerprompter-recent-output-restore' },
                    }));
                  }
                  setOutputPreviewItems((prev) => {
                    if (prev.some((entry) => entry.id === item.id)) return prev;
                    return [item, ...prev];
                  });
                  addToast({
                    type: 'success',
                    message: `Restored ${item.name}`,
                  });
                } catch (error: any) {
                  addToast({
                    type: 'error',
                    message: String(error?.message || 'Failed to restore from trash'),
                  });
                }
              },
            },
          }
          : {}),
      });
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to move output to Trash'), 'error');
    }
  }, [addToast, showToast]);
  const revealPathInFileExplorer = useCallback(async (targetPath: string, missingMessage: string) => {
    if (isUmbraRemoteClient()) {
      showToast('Opening File Explorer is only available from the host PC.', 'error');
      return;
    }
    const normalized = normalizeLoraCatalogPath(targetPath);
    if (!normalized) {
      showToast(missingMessage, 'error');
      return;
    }
    try {
      const response = await fetch('/api/fs/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: normalized }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(String(payload?.error || 'Failed to open folder in file explorer'));
      }
      showToast(`Opened in file explorer: ${normalized}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to open folder in file explorer'), 'error');
    }
  }, [showToast]);

  const emitSlotsPreserveLaneScroll = useCallback((
    nextSlots: ChainSlot[],
    nextActiveQueueSet = activeQueueSet,
    nextDeletedCardGroups: Record<string, PowerPrompterDeletedCardGroup> = deletedCardGroups,
  ) => {
    const lane = laneScrollRef.current;
    const left = lane ? lane.scrollLeft : 0;
    pendingLaneRestoreLeftRef.current = left;
    emitSlots(nextSlots, nextActiveQueueSet, nextDeletedCardGroups);
  }, [emitSlots, activeQueueSet, deletedCardGroups]);

  const toggleStyleSeedMode = useCallback(() => {
    const currentMode = String((document as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same';
    onChange({
      ...document,
      styleSeedMode: currentMode === 'same' ? 'different' : 'same',
      updatedAt: getNowIso(),
    } as PowerPrompterCardDocument);
  }, [document, onChange]);

  const updateGeneration = useCallback((patch: Partial<PowerPrompterGenerationControls>) => {
    const nextGeneration = normalizePowerPrompterGenerationControls({
      ...generation,
      ...patch,
    });
    onChange({
      ...document,
      generation: nextGeneration,
      updatedAt: getNowIso(),
    });
  }, [document, generation, onChange]);

  const applyGenerationParamsFromMetadata = useCallback((metadata: ImageMetadata | null, sourceLabel: string) => {
    if (!metadata) {
      showToast('No metadata found for selected output', 'error');
      return;
    }
    const extracted = extractGenerationParams(metadata);
    const patch: Partial<PowerPrompterGenerationControls> = {};
    let appliedCount = 0;

    if (Number.isFinite(Number(extracted.seed))) {
      patch.seed = Math.max(0, Math.floor(Number(extracted.seed)));
      appliedCount += 1;
    }
    if (Number.isFinite(Number(extracted.steps))) {
      patch.steps = Math.max(1, Math.floor(Number(extracted.steps)));
      appliedCount += 1;
    }
    if (Number.isFinite(Number(extracted.cfg))) {
      patch.cfg = Math.max(0, Number(extracted.cfg));
      appliedCount += 1;
    }
    if (Number.isFinite(Number(extracted.width)) && Number(extracted.width) > 0) {
      patch.width = Math.floor(Number(extracted.width));
      appliedCount += 1;
    }
    if (Number.isFinite(Number(extracted.height)) && Number(extracted.height) > 0) {
      patch.height = Math.floor(Number(extracted.height));
      appliedCount += 1;
    }

    const mappedSampler = mapMetadataSamplerToPrompter(extracted.sampler);
    if (mappedSampler) {
      patch.samplerName = mappedSampler;
      appliedCount += 1;
    }
    const mappedScheduler = mapMetadataSchedulerToPrompter(extracted.scheduler);
    if (mappedScheduler) {
      patch.scheduler = mappedScheduler;
      appliedCount += 1;
    }

    if (!isForgeMode) {
      const checkpointCatalog = Array.isArray(modelCatalog)
        ? modelCatalog
          .map((entry) => parseModelCatalogEntry(entry))
          .filter((entry): entry is LoraBrowserFileEntry => Boolean(entry))
          .filter((entry) => (entry.modelType || 'checkpoint') === 'checkpoint')
          .map((entry) => entry.path)
        : [];
      const checkpointName = resolveCheckpointNameFromMetadata(extracted.model, checkpointCatalog);
      if (checkpointName) {
        patch.modelType = 'checkpoint';
        patch.checkpointName = checkpointName;
        appliedCount += 1;
      }
    }

    if (appliedCount <= 0) {
      showToast('No usable generation parameters found on selected output', 'error');
      return;
    }

    updateGeneration(patch);
    showToast(`Applied ${appliedCount} generation setting${appliedCount === 1 ? '' : 's'} from ${sourceLabel}`, 'success');
  }, [isForgeMode, modelCatalog, showToast, updateGeneration]);

  const applyGenerationParamsFromFile = useCallback(async (file: File) => {
    if (!file) return;
    setForgeMetadataApplying(true);
    try {
      const metadata = await extractMetadataFromFile(file);
      setForgeMetadataSourceName(String(file.name || '').trim());
      applyGenerationParamsFromMetadata(metadata, 'uploaded image');
    } catch {
      showToast('Failed to read metadata from uploaded image', 'error');
    } finally {
      setForgeMetadataApplying(false);
    }
  }, [applyGenerationParamsFromMetadata, showToast]);

  const loraEntries = useMemo(
    () => (Array.isArray(generation.loras) ? generation.loras : []),
    [generation.loras]
  );
  const loraChipSetColorByName = useMemo(() => {
    const colorByName: Record<string, string> = {};
    for (const entry of loraEntries) {
      const normalizedName = normalizeLoraSyntaxName(entry.name).toLowerCase();
      if (!normalizedName) continue;
      const setIds = normalizeQueueSetIds(entry.queueSetIds, true);
      const preferredSet = setIds.includes(activeQueueSet)
        ? activeQueueSet
        : (setIds[0] || activeQueueSet);
      colorByName[normalizedName] = getSetColor(preferredSet);
    }
    return colorByName;
  }, [loraEntries, activeQueueSet]);
  const promptChipConfig = useMemo<PowerPrompterPromptChipConfig>(() => {
    const trainedTags = Array.from(new Set(
      Object.values(loraTagBank)
        .flat()
        .map((tag) => String(tag || '').trim())
        .filter((tag) => tag.length > 0)
    ));
    return {
      loraColorByName: loraChipSetColorByName,
      trainedTags,
    };
  }, [loraChipSetColorByName, loraTagBank]);
  const loraCatalogSafetensors = useMemo(() => {
    if (isForgeMode) return [];
    const normalized = Array.isArray(loraCatalog)
      ? loraCatalog
        .map((entry) => normalizeLoraCatalogPath(entry))
        .filter((entry) => entry.length > 0)
        .filter((entry) => /\.safetensors$/i.test(entry))
      : [];
    return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [isForgeMode, loraCatalog]);
  const loraBrowserAllFiles = useMemo<LoraBrowserFileEntry[]>(
    () => mergeBrowserFileEntries(
      loraCatalogSafetensors.map((loraPath) => ({
        path: loraPath,
        folder: getLoraCatalogFolder(loraPath),
        name: getLoraCatalogName(loraPath),
      })),
      [],
    ),
    [loraCatalogSafetensors]
  );
  const loraBrowserFolders = useMemo<LoraBrowserFolderEntry[]>(() => {
    const fileFolders = expandCatalogFolderPaths(loraBrowserAllFiles.map((entry) => entry.folder));
    const merged = new Set<string>([
      ...fileFolders,
      '',
    ]);
    return Array.from(merged)
      .sort((a, b) => {
        if (!a) return -1;
        if (!b) return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      })
      .map((folder) => {
        const label = folder ? folder.split('/').filter((part) => part.length > 0).slice(-1)[0] || folder : 'All LoRAs';
        const depth = folder ? folder.split('/').filter((part) => part.length > 0).length - 1 : 0;
        const fileCount = folder
          ? loraBrowserAllFiles.filter((file) => file.folder === folder || file.path.startsWith(`${folder}/`)).length
          : loraBrowserAllFiles.length;
        return {
          path: folder,
          label,
          depth: Math.max(0, depth),
          fileCount,
        };
      })
      .filter((folder) => folder.path === '' || folder.fileCount > 0);
  }, [loraBrowserAllFiles]);
  const loraBrowserExpandedFolderSet = useMemo(
    () => new Set(loraBrowserExpandedFolders.map((entry) => normalizeLoraCatalogPath(entry)).filter((entry) => entry.length > 0 || entry === '')),
    [loraBrowserExpandedFolders]
  );
  const loraBrowserFolderRows = useMemo(
    () => loraBrowserFolders,
    [loraBrowserFolders]
  );
  const loraBrowserVisibleFiles = useMemo<LoraBrowserFileEntry[]>(() => {
    const fsBacked = loraBrowserFsFiles.length > 0 ? loraBrowserFsFiles : loraBrowserAllFiles;
    const folderFiltered = loraBrowserFolder
      ? fsBacked.filter((entry) => isCatalogPathInsideFolder(entry.path, loraBrowserFolder))
      : fsBacked;
    const query = String(loraBrowserSearch || '').trim().toLowerCase();
    const filtered = query
      ? folderFiltered.filter((entry) => {
        const fileName = String(entry.name || '').toLowerCase();
        const filePath = String(entry.path || '').toLowerCase();
        return fileName.includes(query) || filePath.includes(query);
      })
      : folderFiltered;
    return filtered;
  }, [loraBrowserFsFiles, loraBrowserAllFiles, loraBrowserFolder, loraBrowserSearch]);
  const loraBrowserSelectedFile = useMemo(
    () => loraBrowserVisibleFiles.find((entry) => entry.path === loraBrowserSelectedPath) || null,
    [loraBrowserVisibleFiles, loraBrowserSelectedPath]
  );
  const thumbnailOverrides = useMemo(() => {
    if (!generation.thumbnailOverrides || typeof generation.thumbnailOverrides !== 'object') return {};
    const normalized: Record<string, string[]> = {};
    for (const [rawKey, rawValue] of Object.entries(generation.thumbnailOverrides as Record<string, unknown>)) {
      const key = normalizeLoraCatalogPath(rawKey).toLowerCase();
      if (!key) continue;
      const values = normalizeThumbnailOverrideSources(rawValue);
      if (values.length === 0) continue;
      normalized[key] = values;
    }
    return normalized;
  }, [generation.thumbnailOverrides]);
  useEffect(() => {
    let disposed = false;
    void readUserConfig<Record<string, unknown>>('powerprompter-thumbnail-overrides', {})
      .then((parsed) => {
        if (disposed) return;
      const normalized: Record<string, string[]> = {};
      for (const [rawKey, rawValue] of Object.entries(parsed || {})) {
        const key = normalizeLoraCatalogPath(rawKey).toLowerCase();
        if (!key) continue;
        const values = normalizeThumbnailOverrideSources(rawValue);
        if (values.length === 0) continue;
        normalized[key] = values;
      }
      setGlobalThumbnailOverrides(normalized);
      globalThumbnailOverridesHydratedRef.current = true;
      })
      .catch(() => {
        if (!disposed) {
          setGlobalThumbnailOverrides({});
          globalThumbnailOverridesHydratedRef.current = true;
        }
      });
    try { window.localStorage.removeItem(GLOBAL_THUMBNAIL_OVERRIDES_STORAGE_KEY); } catch {}
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    try {
      window.localStorage.removeItem(GLOBAL_THUMBNAIL_OVERRIDES_STORAGE_KEY);
      if (!globalThumbnailOverridesHydratedRef.current) return;
      if (Object.keys(globalThumbnailOverrides).length === 0) {
        void deleteUserConfig('powerprompter-thumbnail-overrides').catch(() => undefined);
        return;
      }
      void writeUserConfig('powerprompter-thumbnail-overrides', globalThumbnailOverrides).catch((error) => {
        console.warn('[PowerPrompterCardChainEditor] Failed to persist thumbnail overrides:', error);
      });
    } catch {
      // ignore cleanup errors
    }
  }, [globalThumbnailOverrides]);
  const mergedThumbnailOverrides = useMemo(() => ({
    ...globalThumbnailOverrides,
    ...thumbnailOverrides,
  }), [globalThumbnailOverrides, thumbnailOverrides]);
  const applyThumbnailOverridePatch = useCallback((keys: string[], dataUrls: string[]) => {
    const normalizedKeys = Array.from(new Set(
      keys
        .map((entry) => normalizeLoraCatalogPath(entry).toLowerCase())
        .filter((entry) => entry.length > 0)
    ));
    if (normalizedKeys.length === 0) return;
    const nextValues = normalizeThumbnailOverrideSources(dataUrls);

    const patchMap = (source: Record<string, string[]>): Record<string, string[]> => {
      const next = { ...source };
      if (nextValues.length > 0) {
        for (const key of normalizedKeys) {
          next[key] = nextValues;
        }
      } else {
        for (const key of normalizedKeys) {
          delete next[key];
        }
      }
      return next;
    };

    const nextDocOverrides = patchMap(thumbnailOverrides);
    const nextGlobalOverrides = patchMap(globalThumbnailOverrides);
    if (JSON.stringify(nextGlobalOverrides) !== JSON.stringify(globalThumbnailOverrides)) {
      setGlobalThumbnailOverrides(nextGlobalOverrides);
    }
    if (JSON.stringify(nextDocOverrides) !== JSON.stringify(thumbnailOverrides)) {
      updateGeneration({ thumbnailOverrides: nextDocOverrides });
    }
  }, [thumbnailOverrides, globalThumbnailOverrides, updateGeneration]);
  const getThumbnailOverrides = useCallback((rawPath: string) => {
    const key = normalizeLoraCatalogPath(rawPath).toLowerCase();
    if (!key) return [] as string[];
    return mergedThumbnailOverrides[key] || [];
  }, [mergedThumbnailOverrides]);
  const getThumbnailOverride = useCallback((rawPath: string) => {
    const values = getThumbnailOverrides(rawPath);
    return values.length > 0 ? values[0] : '';
  }, [getThumbnailOverrides]);
  const setThumbnailOverrides = useCallback((rawPath: string, dataUrls: string[]) => {
    const key = normalizeLoraCatalogPath(rawPath).toLowerCase();
    if (!key) return;
    applyThumbnailOverridePatch([key], dataUrls);
  }, [applyThumbnailOverridePatch]);

  const getModelThumbnailOverrides = useCallback((rawPath: string) => {
    const normalized = normalizeLoraCatalogPath(rawPath).toLowerCase();
    if (!normalized) return [] as string[];

    const exact = mergedThumbnailOverrides[normalized];
    if (Array.isArray(exact) && exact.length > 0) return exact;

    const fileName = getLoraCatalogName(normalized).toLowerCase();
    if (!fileName) return [] as string[];

    const byName = mergedThumbnailOverrides[fileName];
    if (Array.isArray(byName) && byName.length > 0) return byName;

    const match = Object.entries(mergedThumbnailOverrides)
      .filter(([entryKey, values]) => (
        Array.isArray(values)
        && values.length > 0
        && getLoraCatalogName(entryKey).toLowerCase() === fileName
      ))
      .sort(([a], [b]) => a.length - b.length)[0];

    return match ? match[1] : [];
  }, [mergedThumbnailOverrides]);

  const setModelThumbnailOverrides = useCallback((rawPath: string, dataUrls: string[]) => {
    const normalized = normalizeLoraCatalogPath(rawPath).toLowerCase();
    if (!normalized) return;

    const fileName = getLoraCatalogName(normalized).toLowerCase();
    const matchingKeys = fileName
      ? Object.keys(mergedThumbnailOverrides).filter((entryKey) => getLoraCatalogName(entryKey).toLowerCase() === fileName)
      : [];
    const keys = Array.from(new Set([normalized, fileName, ...matchingKeys].filter((entry) => entry.length > 0)));
    applyThumbnailOverridePatch(keys, dataUrls);
  }, [mergedThumbnailOverrides, applyThumbnailOverridePatch]);

  const modelCatalogEntries = useMemo<LoraBrowserFileEntry[]>(() => {
    const entries = Array.isArray(modelCatalog)
      ? modelCatalog
        .map((entry) => parseModelCatalogEntry(entry))
        .filter((entry): entry is LoraBrowserFileEntry => Boolean(entry))
      : [];
    const merged = new Map<string, LoraBrowserFileEntry>();
    for (const entry of entries) {
      merged.set(`${entry.modelType || 'checkpoint'}|${entry.path.toLowerCase()}`, entry);
    }
    return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  }, [modelCatalog]);
  const modelCatalogFiles = useMemo(
    () => modelCatalogEntries
      .filter((entry) => (entry.modelType || 'checkpoint') === 'checkpoint')
      .map((entry) => entry.path),
    [modelCatalogEntries]
  );
  const modelBrowserTypeCounts = useMemo(() => {
    const counts: Record<PowerPrompterModelType, number> = {
      checkpoint: 0,
      diffusers: 0,
      diffusion_model: 0,
      unet: 0,
      gguf: 0,
    };
    for (const entry of modelCatalogEntries) {
      counts[entry.modelType || 'checkpoint'] += 1;
    }
    return counts;
  }, [modelCatalogEntries]);
  const modelBrowserAllFiles = useMemo<LoraBrowserFileEntry[]>(
    () => mergeBrowserFileEntries(
      modelCatalogEntries.filter((entry) => (entry.modelType || 'checkpoint') === modelBrowserType),
      [],
    ),
    [modelCatalogEntries, modelBrowserType]
  );
  const modelBrowserFolders = useMemo<LoraBrowserFolderEntry[]>(() => {
    const folderCountFiles = modelBrowserFsFiles.length > 0 ? modelBrowserFsFiles : modelBrowserAllFiles;
    const fileFolders = expandCatalogFolderPaths(folderCountFiles.map((entry) => entry.folder));
    const fsFolders = expandCatalogFolderPaths(modelBrowserFsFolders);
    const merged = new Set<string>([
      ...fileFolders,
      ...fsFolders,
      '',
    ]);
    return Array.from(merged)
      .sort((a, b) => {
        if (!a) return -1;
        if (!b) return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      })
      .map((folder) => {
        const label = folder ? folder.split('/').filter((part) => part.length > 0).slice(-1)[0] || folder : 'All Models';
        const depth = folder ? folder.split('/').filter((part) => part.length > 0).length - 1 : 0;
        const fileCount = folder
          ? folderCountFiles.filter((file) => file.folder === folder || file.path.startsWith(`${folder}/`)).length
          : folderCountFiles.length;
        return {
          path: folder,
          label,
          depth: Math.max(0, depth),
          fileCount,
        };
      })
      .filter((folder) => folder.path === '' || folder.fileCount > 0 || fsFolders.includes(folder.path));
  }, [modelBrowserAllFiles, modelBrowserFsFiles, modelBrowserFsFolders]);
  const modelBrowserExpandedFolderSet = useMemo(
    () => new Set(modelBrowserExpandedFolders.map((entry) => normalizeLoraCatalogPath(entry)).filter((entry) => entry.length > 0 || entry === '')),
    [modelBrowserExpandedFolders]
  );
  const modelBrowserFolderRows = useMemo(
    () => modelBrowserFolders,
    [modelBrowserFolders]
  );
  const modelBrowserVisibleFiles = useMemo<LoraBrowserFileEntry[]>(() => {
    const query = String(modelBrowserSearch || '').trim().toLowerCase();
    const fsBacked = modelBrowserFsFiles.length > 0 ? modelBrowserFsFiles : modelBrowserAllFiles;
    const folderFiltered = modelBrowserFolder
      ? fsBacked.filter((entry) => isCatalogPathInsideFolder(entry.path, modelBrowserFolder))
      : fsBacked;
    const filtered = query
      ? folderFiltered.filter((entry) => {
        const fileName = String(entry.name || '').toLowerCase();
        const filePath = String(entry.path || '').toLowerCase();
        return fileName.includes(query) || filePath.includes(query);
      })
      : folderFiltered;
    return filtered;
  }, [modelBrowserFsFiles, modelBrowserAllFiles, modelBrowserFolder, modelBrowserSearch]);
  const modelBrowserSelectedFile = useMemo(
    () => {
      const selected = normalizeLoraCatalogPath(modelBrowserSelectedPath);
      if (!selected) return null;
      const selectedAliases = new Set(getCatalogAliasKeys(selected));
      return modelBrowserVisibleFiles.find((entry) => {
        if (entry.path === selected) return true;
        return getCatalogAliasKeys(entry.path).some((key) => selectedAliases.has(key));
      }) || null;
    },
    [modelBrowserVisibleFiles, modelBrowserSelectedPath]
  );

  const cacheLoraCardMeta = useCallback((info: PowerPrompterLoraInfoPayload | null, aliasInputs: unknown[] = []) => {
    if (!info) return;
    const aliasKeys = Array.from(new Set([
      ...getCatalogAliasKeys(info.loraName),
      ...aliasInputs.flatMap((entry) => getCatalogAliasKeys(entry)),
    ]));
    if (aliasKeys.length === 0) return;
    const nextMeta = buildLoraCardMeta(info);
    setLoraCardMetaByName((prev) => {
      const current = aliasKeys.map((key) => prev[key]).find(Boolean);
      const currentThumbs = Array.isArray(current?.thumbnailUrls) ? current.thumbnailUrls : (current?.thumbnailUrl ? [current.thumbnailUrl] : []);
      const nextThumbs = Array.isArray(nextMeta.thumbnailUrls) ? nextMeta.thumbnailUrls : (nextMeta.thumbnailUrl ? [nextMeta.thumbnailUrl] : []);
      const thumbsEqual = currentThumbs.length === nextThumbs.length && currentThumbs.every((url, idx) => url === nextThumbs[idx]);
      const nextEntries = Object.fromEntries(aliasKeys.map((key) => [key, nextMeta]));
      const everyAliasCurrent = aliasKeys.every((key) => {
        const aliasCurrent = prev[key];
        return aliasCurrent
          && aliasCurrent.civitaiUrl === nextMeta.civitaiUrl
          && aliasCurrent.thumbnailUrl === nextMeta.thumbnailUrl
          && (Array.isArray(aliasCurrent.thumbnailUrls) ? aliasCurrent.thumbnailUrls : (aliasCurrent.thumbnailUrl ? [aliasCurrent.thumbnailUrl] : [])).length === nextThumbs.length
          && (Array.isArray(aliasCurrent.thumbnailUrls) ? aliasCurrent.thumbnailUrls : (aliasCurrent.thumbnailUrl ? [aliasCurrent.thumbnailUrl] : [])).every((url, idx) => url === nextThumbs[idx]);
      });
      if (current && current.civitaiUrl === nextMeta.civitaiUrl && current.thumbnailUrl === nextMeta.thumbnailUrl && thumbsEqual && everyAliasCurrent) {
        return prev;
      }
      return { ...prev, ...nextEntries };
    });
  }, []);

  const cacheModelCardMeta = useCallback((info: PowerPrompterModelInfoPayload | null, aliasInputs: unknown[] = []) => {
    if (!info) return;
    const aliasKeys = Array.from(new Set([
      ...getCatalogAliasKeys(info.modelName),
      ...aliasInputs.flatMap((entry) => getCatalogAliasKeys(entry)),
    ]));
    if (aliasKeys.length === 0) return;
    const mapped = {
      loraName: info.modelName,
      metadata: info.metadata,
      civitai: info.civitai,
      trainedTags: info.trainedTags,
      descriptionHtml: info.descriptionHtml,
      descriptionText: info.descriptionText,
    } as PowerPrompterLoraInfoPayload;
    const nextMeta = buildLoraCardMeta(mapped);
    setModelCardMetaByName((prev) => {
      const current = aliasKeys.map((key) => prev[key]).find(Boolean);
      const currentThumbs = Array.isArray(current?.thumbnailUrls) ? current.thumbnailUrls : (current?.thumbnailUrl ? [current.thumbnailUrl] : []);
      const nextThumbs = Array.isArray(nextMeta.thumbnailUrls) ? nextMeta.thumbnailUrls : (nextMeta.thumbnailUrl ? [nextMeta.thumbnailUrl] : []);
      const thumbsEqual = currentThumbs.length === nextThumbs.length && currentThumbs.every((url, idx) => url === nextThumbs[idx]);
      const nextEntries = Object.fromEntries(aliasKeys.map((key) => [key, nextMeta]));
      const everyAliasCurrent = aliasKeys.every((key) => {
        const aliasCurrent = prev[key];
        return aliasCurrent
          && aliasCurrent.civitaiUrl === nextMeta.civitaiUrl
          && aliasCurrent.thumbnailUrl === nextMeta.thumbnailUrl
          && (Array.isArray(aliasCurrent.thumbnailUrls) ? aliasCurrent.thumbnailUrls : (aliasCurrent.thumbnailUrl ? [aliasCurrent.thumbnailUrl] : [])).length === nextThumbs.length
          && (Array.isArray(aliasCurrent.thumbnailUrls) ? aliasCurrent.thumbnailUrls : (aliasCurrent.thumbnailUrl ? [aliasCurrent.thumbnailUrl] : [])).every((url, idx) => url === nextThumbs[idx]);
      });
      if (current && current.civitaiUrl === nextMeta.civitaiUrl && current.thumbnailUrl === nextMeta.thumbnailUrl && thumbsEqual && everyAliasCurrent) {
        return prev;
      }
      return { ...prev, ...nextEntries };
    });
  }, []);

  const patchVariant = useCallback((slotId: string, variantId: string, patch: Partial<PowerPrompterCardNode>) => {
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      return {
        ...slot,
        variants: slot.variants.map((variant) => {
          if (variant.id !== variantId) return variant;
          const merged = {
            ...variant,
            ...patch,
            variantName: patch.variantName !== undefined
              ? normalizeVariantName(patch.variantName)
              : normalizeVariantName(variant.variantName),
            variantTags: patch.variantTags !== undefined
              ? normalizeVariantTags(patch.variantTags)
              : normalizeVariantTags((variant as any).variantTags),
            updatedAt: getNowIso(),
          };
          const queueSetIds = normalizeQueueSetIds(merged.queueSetIds, false);
          const queueCycleWeights = normalizeQueueCycleWeights((merged as any).queueCycleWeights, queueSetIds);
          const chainLinks = normalizeChainLinks((merged as any).chainLinks, variantId);
          return { ...merged, queueSetIds, queueCycleWeights, queueEnabled: queueSetIds.length > 0, chainLinks };
        }),
      };
    });
    emitSlots(next);
  }, [slots, emitSlots]);

  const beginChainLinkEdit = useCallback((slotId: string, variant: PowerPrompterCardNode, mode: 'link' | 'block' = 'link') => {
    const anchorVariantId = String(variant.id || '').trim();
    if (!anchorVariantId) return;
    const draftVariantIds = mode === 'block'
      ? normalizeBlockLinks((variant as any).blockLinks, anchorVariantId)
      : normalizeChainLinks((variant as any).chainLinks, anchorVariantId);
    setActiveSlotId(slotId);
    setActiveVariantId(anchorVariantId);
    setEditingVariantId('');
    setEditingPromptChip(null);
    setCardMenu(null);
    setCardRandomMenu(null);
    setChainLinkEditor({
      mode,
      anchorSlotId: slotId,
      anchorVariantId,
      draftVariantIds,
      savedVariantIds: draftVariantIds,
    });
    onChainLinkFeedback?.('anchor');
  }, [onChainLinkFeedback]);

  const toggleChainLinkTarget = useCallback((slotId: string, variant: PowerPrompterCardNode) => {
    const targetVariantId = String(variant.id || '').trim();
    if (!chainLinkEditor || !targetVariantId) return false;
    if (targetVariantId === chainLinkEditor.anchorVariantId || slotId === chainLinkEditor.anchorSlotId) return true;
    setChainLinkEditor((prev) => {
      if (!prev || prev.anchorVariantId !== chainLinkEditor.anchorVariantId) return prev;
      const existing = new Set(prev.draftVariantIds);
      if (existing.has(targetVariantId)) {
        existing.delete(targetVariantId);
      } else {
        existing.add(targetVariantId);
      }
      return {
        ...prev,
        draftVariantIds: prev.mode === 'block'
          ? normalizeBlockLinks(Array.from(existing), prev.anchorVariantId)
          : normalizeChainLinks(Array.from(existing), prev.anchorVariantId),
      };
    });
    onChainLinkFeedback?.('toggle');
    return true;
  }, [chainLinkEditor, onChainLinkFeedback]);

  const saveChainLinks = useCallback(() => {
    if (!chainLinkEditor) return;
    const mode = chainLinkEditor.mode === 'block' ? 'block' : 'link';
    const targetIds = mode === 'block'
      ? normalizeBlockLinks(chainLinkEditor.draftVariantIds, chainLinkEditor.anchorVariantId)
      : normalizeChainLinks(chainLinkEditor.draftVariantIds, chainLinkEditor.anchorVariantId);
    patchVariant(
      chainLinkEditor.anchorSlotId,
      chainLinkEditor.anchorVariantId,
      (mode === 'block' ? { blockLinks: targetIds } : { chainLinks: targetIds }) as Partial<PowerPrompterCardNode>
    );
    setChainLinkEditor((prev) => prev && prev.anchorVariantId === chainLinkEditor.anchorVariantId
      ? { ...prev, draftVariantIds: targetIds, savedVariantIds: targetIds }
      : prev);
    const label = mode === 'block' ? 'Block' : 'Chain Link';
    showToast(targetIds.length > 0 ? `Saved ${targetIds.length} ${label}${targetIds.length === 1 ? '' : 's'}` : `Cleared ${label}s`, 'success');
    onChainLinkFeedback?.('save');
  }, [chainLinkEditor, onChainLinkFeedback, patchVariant, showToast]);

  const clearChainLinkDraft = useCallback(() => {
    if (!chainLinkEditor) return;
    setChainLinkEditor((prev) => prev && prev.anchorVariantId === chainLinkEditor.anchorVariantId
      ? { ...prev, draftVariantIds: [] }
      : prev);
    onChainLinkFeedback?.('clear');
  }, [chainLinkEditor, onChainLinkFeedback]);

  const closeChainLinkEditor = useCallback(() => {
    setChainLinkEditor(null);
    onChainLinkFeedback?.('done');
  }, [onChainLinkFeedback]);

  const startEditingVariantText = useCallback((slotId: string, variant: PowerPrompterCardNode) => {
    if (mobileSelectionMode) return;
    const currentText = String(variant.text || '');
    setActiveSlotId(slotId);
    setActiveVariantId(variant.id);
    setEditingVariantId(variant.id);
    setEditingPromptChip(null);
    setVariantTextDrafts((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, variant.id)) {
        return prev;
      }
      return { ...prev, [variant.id]: currentText };
    });
  }, [mobileSelectionMode]);

  const commitVariantTextEdit = useCallback((slotId: string, variant: PowerPrompterCardNode, rawValue?: string) => {
    if (mobileSelectionMode) {
      const variantId = String(variant.id || '').trim();
      setEditingPromptChip(null);
      setEditingVariantId((prev) => (prev === variantId ? '' : prev));
      setVariantTextDrafts((prev) => {
        if (!(variantId in prev)) return prev;
        const next = { ...prev };
        delete next[variantId];
        return next;
      });
      return;
    }
    const variantId = String(variant.id || '').trim();
    if (!variantId) return;
    const source = rawValue !== undefined
      ? String(rawValue || '')
      : (Object.prototype.hasOwnProperty.call(variantTextDrafts, variantId)
        ? String(variantTextDrafts[variantId] || '')
        : String(variant.text || ''));
    const normalizedText = source.replace(/\r\n/g, '\n');
    patchVariant(slotId, variantId, {
      text: normalizedText,
    });
    setEditingPromptChip(null);
    setEditingVariantId((prev) => (prev === variantId ? '' : prev));
    setVariantTextDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, [mobileSelectionMode, patchVariant, variantTextDrafts]);

  const cancelVariantTextEdit = useCallback((variantId: string) => {
    setEditingPromptChip(null);
    setEditingVariantId((prev) => (prev === variantId ? '' : prev));
    setVariantTextDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, []);

  const openExpandedVariantEditor = useCallback((
    slotId: string,
    variant: PowerPrompterCardNode,
    slotIndex?: number,
    variantIndex?: number,
  ) => {
    const slotLabel = String(
      (Number.isInteger(slotIndex) ? slots[Number(slotIndex)]?.label : '')
      || slots.find((slot) => slot.slotId === slotId)?.label
      || ''
    ).trim();
    const variantId = String(variant.id || '').trim();
    const hasInlineDraft = Object.prototype.hasOwnProperty.call(variantTextDrafts, variantId);
    const initialDraft = hasInlineDraft
      ? String(variantTextDrafts[variantId] || '')
      : String(variant.text || '');
    setExpandedVariantEditor((prev) => {
      if (
        prev
        && String(prev.slotId || '').trim() === slotId
        && String(prev.variantId || '').trim() === variantId
      ) {
        return {
          ...prev,
          slotLabel,
          variantName: normalizeVariantName(prev.variantName || variant.variantName),
          queueSetIds: normalizeQueueSetIds(prev.queueSetIds, false),
          slotIndex,
          variantIndex,
        };
      }
      return {
        slotId,
        variantId,
        slotLabel,
        variantName: normalizeVariantName(variant.variantName),
        draft: initialDraft,
        queueSetIds: normalizeQueueSetIds(variant.queueSetIds, false),
        slotIndex,
        variantIndex,
        dirty: false,
      };
    });
    setEditingVariantId((prev) => (prev === variantId ? '' : prev));
    setVariantTextDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    const nextCaret = initialDraft.length;
    setExpandedVariantCsvSourceIds(normalizeCsvSourceIds(enabledCSVs));
    setExpandedVariantEditorCaret({ start: nextCaret, end: nextCaret });
    setExpandedVariantSuggestions([]);
    setExpandedVariantSuggestionOpen(false);
    setExpandedVariantSuggestionIndex(0);
  }, [enabledCSVs, slots, variantTextDrafts]);

  const syncExpandedVariantEditorCaret = useCallback((target: HTMLTextAreaElement | null) => {
    if (!target) return;
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    setExpandedVariantEditorCaret((prev) => (
      prev.start === start && prev.end === end
        ? prev
        : { start, end }
    ));
  }, []);

  const setExpandedVariantTextareaNode = useCallback((node: HTMLTextAreaElement | null) => {
    expandedVariantTextareaRef.current = node;
  }, []);

  const updateExpandedVariantDraftFromTextarea = useCallback((target: HTMLTextAreaElement) => {
    const nextValue = String(target.value || '');
    setExpandedVariantEditor((prev) => {
      if (!prev) return prev;
      if (prev.draft === nextValue && prev.dirty) return prev;
      return { ...prev, draft: nextValue, dirty: true };
    });
    syncExpandedVariantEditorCaret(target);
    setExpandedVariantSuggestionOpen(true);
  }, [syncExpandedVariantEditorCaret]);

  const applyDraftTokenToVariant = useCallback((
    slotId: string,
    variant: PowerPrompterCardNode,
    rawToken: string,
    options?: { appendComma?: boolean; preferExpanded?: boolean; }
  ) => {
    const token = buildPromptInsertionToken(rawToken, false);
    if (!token) return;
    const variantId = String(variant.id || '').trim();
    if (!variantId) return;
    const currentDraft = Object.prototype.hasOwnProperty.call(variantTextDrafts, variantId)
      ? String(variantTextDrafts[variantId] || '')
      : String(variant.text || '');
    const expandedTarget = expandedVariantEditor?.variantId === variantId ? expandedVariantTextareaRef.current : null;
    const inlineTarget = inlineVariantTextareaRefs.current[variantId] || null;
    const target = options?.preferExpanded && expandedTarget
      ? expandedTarget
      : (expandedTarget && typeof window !== 'undefined' && window.document.activeElement === expandedTarget)
        ? expandedTarget
        : (inlineTarget && typeof window !== 'undefined' && window.document.activeElement === inlineTarget)
          ? inlineTarget
          : expandedTarget || inlineTarget;
    const start = target && typeof target.selectionStart === 'number' ? target.selectionStart : currentDraft.length;
    const end = target && typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    const nextText = insertPromptTokenIntoDraftAtCursor(currentDraft, token, start, end, options?.appendComma === true);
    setActiveSlotId(slotId);
    setActiveVariantId(variantId);
    setEditingVariantId(variantId);
    setVariantTextDrafts((prev) => ({ ...prev, [variantId]: nextText }));
    window.requestAnimationFrame(() => {
      const resolvedTarget = options?.preferExpanded && expandedVariantTextareaRef.current
        ? expandedVariantTextareaRef.current
        : ((expandedVariantEditor?.variantId === variantId ? expandedVariantTextareaRef.current : null)
          || inlineVariantTextareaRefs.current[variantId]
          || null);
      if (!resolvedTarget) return;
      resolvedTarget.focus();
      const nextCaret = nextText.length;
      try {
        resolvedTarget.setSelectionRange(nextCaret, nextCaret);
      } catch {
        // ignore selection restore failures
      }
      if (resolvedTarget === expandedVariantTextareaRef.current) {
        setExpandedVariantEditorCaret({ start: nextCaret, end: nextCaret });
      }
    });
  }, [expandedVariantEditor, variantTextDrafts]);

  const applyDraftTokenToExpandedVariantEditor = useCallback((
    rawToken: string,
    options?: { appendComma?: boolean; }
  ) => {
    setExpandedVariantEditor((prev) => {
      if (!prev) return prev;
      const token = buildPromptInsertionToken(rawToken, false);
      if (!token) return prev;
      const target = expandedVariantTextareaRef.current;
      const start = target && typeof target.selectionStart === 'number' ? target.selectionStart : prev.draft.length;
      const end = target && typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
      const nextDraft = insertPromptTokenIntoDraftAtCursor(prev.draft, token, start, end, options?.appendComma === true);
      const nextCaret = nextDraft.length;
      window.requestAnimationFrame(() => {
        const textarea = expandedVariantTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        try {
          textarea.setSelectionRange(nextCaret, nextCaret);
        } catch {
          // ignore selection restore failures
        }
      });
      setExpandedVariantEditorCaret({ start: nextCaret, end: nextCaret });
      return { ...prev, draft: nextDraft, dirty: true };
    });
  }, []);

  const commitExpandedVariantEditor = useCallback(() => {
    if (!expandedVariantEditor) return;
    const target = resolveExpandedVariantEditorTarget(expandedVariantEditor, slots);
    if (!target) {
      showToast('Unable to save because this variant no longer exists', 'error');
      return;
    }
    const normalizedText = String(expandedVariantEditor.draft || '').replace(/\r\n/g, '\n');
    const nextQueueSetIds = normalizeQueueSetIds(expandedVariantEditor.queueSetIds, false);
    patchVariant(target.slot.slotId, target.variant.id, {
      text: normalizedText,
      variantName: normalizeVariantName(expandedVariantEditor.variantName),
      queueSetIds: nextQueueSetIds,
      queueEnabled: nextQueueSetIds.length > 0,
    });
    setEditingVariantId((prev) => (prev === target.variant.id ? '' : prev));
    setVariantTextDrafts((prev) => {
      if (!(target.variant.id in prev)) return prev;
      const next = { ...prev };
      delete next[target.variant.id];
      return next;
    });
    setExpandedVariantEditor(null);
    setExpandedVariantSuggestions([]);
    setExpandedVariantSuggestionOpen(false);
    setExpandedVariantSuggestionIndex(0);
  }, [expandedVariantEditor, patchVariant, showToast, slots]);

  useEffect(() => {
    if (!expandedVariantEditor) return;
    const focusKey = `${String(expandedVariantEditor.slotId || '').trim()}::${String(expandedVariantEditor.variantId || '').trim()}`;
    if (!focusKey || expandedVariantFocusKeyRef.current === focusKey) return;
    expandedVariantFocusKeyRef.current = focusKey;
    const textarea = expandedVariantTextareaRef.current;
    if (!textarea) return;
    syncExpandedVariantEditorCaret(textarea);
    const rafId = window.requestAnimationFrame(() => {
      const current = expandedVariantTextareaRef.current;
      if (!current) return;
      current.focus();
      const nextCaret = String(expandedVariantEditor.draft || '').length;
      try {
        current.setSelectionRange(nextCaret, nextCaret);
      } catch {
        // ignore selection restore failures
      }
      setExpandedVariantEditorCaret((prev) => (
        prev.start === nextCaret && prev.end === nextCaret
          ? prev
          : { start: nextCaret, end: nextCaret }
      ));
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [expandedVariantEditor?.slotId, expandedVariantEditor?.variantId, syncExpandedVariantEditorCaret]);

  useEffect(() => {
    if (expandedVariantEditor) return;
    expandedVariantFocusKeyRef.current = '';
  }, [expandedVariantEditor]);

  const startEditingVariantName = useCallback((slotId: string, variant: PowerPrompterCardNode) => {
    setActiveSlotId(slotId);
    setActiveVariantId(variant.id);
    setEditingVariantNameId(variant.id);
    setVariantNameDrafts((prev) => ({
      ...prev,
      [variant.id]: String(variant.variantName || ''),
    }));
  }, []);

  const cancelEditingVariantName = useCallback((variantId: string) => {
    setEditingVariantNameId((prev) => (prev === variantId ? '' : prev));
    setVariantNameDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, []);

  const commitVariantName = useCallback((slotId: string, variant: PowerPrompterCardNode) => {
    const variantId = String(variant.id || '').trim();
    if (!variantId) return;
    const draft = Object.prototype.hasOwnProperty.call(variantNameDrafts, variantId)
      ? String(variantNameDrafts[variantId] || '')
      : String(variant.variantName || '');
    patchVariant(slotId, variantId, { variantName: draft });
    setEditingVariantNameId((prev) => (prev === variantId ? '' : prev));
    setVariantNameDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, [patchVariant, variantNameDrafts]);

  const startEditingVariantTag = useCallback((slotId: string, variantId: string) => {
    setActiveSlotId(slotId);
    setActiveVariantId(variantId);
    setEditingVariantTagId(variantId);
    setVariantTagDrafts((prev) => ({
      ...prev,
      [variantId]: '',
    }));
  }, []);

  const cancelEditingVariantTag = useCallback((variantId: string) => {
    setEditingVariantTagId((prev) => (prev === variantId ? '' : prev));
    setVariantTagDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }, []);

  const commitVariantTag = useCallback((slotId: string, variant: PowerPrompterCardNode) => {
    const variantId = String(variant.id || '').trim();
    if (!variantId) return;
    const draft = Object.prototype.hasOwnProperty.call(variantTagDrafts, variantId)
      ? String(variantTagDrafts[variantId] || '')
      : '';
    const parsedDraftTags = splitVariantTagDraft(draft);
    setEditingVariantTagId((prev) => (prev === variantId ? '' : prev));
    setVariantTagDrafts((prev) => {
      if (!(variantId in prev)) return prev;
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    if (parsedDraftTags.length === 0) return;
    const existingTags = normalizeVariantTags((variant as any).variantTags);
    const seen = new Set(existingTags.map((tag) => tag.toLowerCase()));
    const nextTags = [...existingTags];
    for (const tag of parsedDraftTags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      nextTags.push(tag);
      if (nextTags.length >= 16) break;
    }
    if (nextTags.length === existingTags.length) return;
    patchVariant(slotId, variantId, { variantTags: nextTags });
  }, [patchVariant, variantTagDrafts]);

  const removeVariantTag = useCallback((slotId: string, variant: PowerPrompterCardNode, rawTag: string) => {
    const tagToRemove = normalizeVariantTag(rawTag);
    if (!tagToRemove) return;
    const existingTags = normalizeVariantTags((variant as any).variantTags);
    const nextTags = existingTags.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase());
    if (nextTags.length === existingTags.length) return;
    patchVariant(slotId, variant.id, { variantTags: nextTags });
  }, [patchVariant]);

  const setPromptTokenDragData = useCallback((event: React.DragEvent, token: string) => {
    const value = String(token || '').trim();
    if (!value) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(DRAG_PROMPT_TOKEN_MIME, value);
    event.dataTransfer.setData('text/plain', value);
    const sourceNode = event.currentTarget as HTMLElement | null;
    if (sourceNode) {
      const rect = sourceNode.getBoundingClientRect();
      const offsetX = Math.max(8, Math.min(rect.width - 8, rect.width / 2));
      const offsetY = Math.max(8, Math.min(rect.height - 8, rect.height / 2));
      event.dataTransfer.setDragImage(sourceNode, offsetX, offsetY);
    }
  }, []);

  const applyDroppedTokenToVariant = useCallback((
    event: React.DragEvent<HTMLElement | HTMLTextAreaElement | HTMLInputElement>,
    slotId: string,
    variant: PowerPrompterCardNode | null | undefined,
  ) => {
    if (!variant) return;
    const variantId = String(variant.id || '').trim();
    if (!variantId) return;
    const token = readDraggedPromptToken(event);
    if (!token) return;
    event.preventDefault();
    event.stopPropagation();
    suppressedVariantDragIdRef.current = '';
    const eventTarget = event.target;
    const directSelectionTarget = eventTarget instanceof HTMLTextAreaElement || eventTarget instanceof HTMLInputElement
      ? eventTarget
      : null;
    const selectionTarget = directSelectionTarget || inlineVariantTextareaRefs.current[variantId] || null;
    const hasSelection = !!selectionTarget && typeof selectionTarget.selectionStart === 'number';
    const isDrafting = editingVariantId === variantId || Object.prototype.hasOwnProperty.call(variantTextDrafts, variantId);
    const sourceText = isDrafting
      ? String(variantTextDrafts[variantId] ?? variant.text ?? '')
      : String(variant.text || '');
    const start = hasSelection ? Number(selectionTarget.selectionStart) : sourceText.length;
    const end = hasSelection && typeof selectionTarget.selectionEnd === 'number' ? Number(selectionTarget.selectionEnd) : start;
    const nextText = insertPromptTokenAtCursor(sourceText, token, start, end);
    const nextCaret = Math.min(nextText.length, start + token.length + 2);
    setVariantPromptDropId(null);
    setActiveSlotId(slotId);
    setActiveVariantId(variantId);
    setEditingPromptChip(null);
    setEditingVariantId(variantId);
    setVariantTextDrafts((prev) => ({ ...prev, [variantId]: nextText }));
    window.requestAnimationFrame(() => {
      const textarea = inlineVariantTextareaRefs.current[variantId] || selectionTarget;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      try {
        textarea.setSelectionRange(nextCaret, nextCaret);
      } catch {
        // ignore selection restore failures
      }
      if (textarea instanceof HTMLTextAreaElement) {
        resetVariantTextareaHeight(textarea);
      }
    });
  }, [editingVariantId, variantTextDrafts]);

  const patchLoraEntry = useCallback((entryId: string, patch: Partial<PowerPrompterLoraEntry>) => {
    const nextLoras = loraEntries.map((entry) => {
      if (entry.id !== entryId) return entry;
      const nextQueueSetIds = normalizeQueueSetIds(
        patch.queueSetIds ?? entry.queueSetIds,
        patch.queueEnabled ?? entry.queueEnabled
      );
      return {
        ...entry,
        ...patch,
        name: String((patch.name ?? entry.name) || '').trim(),
        queueSetIds: nextQueueSetIds,
        queueEnabled: nextQueueSetIds.length > 0,
      };
    });
    updateGeneration({ loras: nextLoras });
  }, [loraEntries, updateGeneration]);

  const removeLoraEntry = useCallback((entryId: string) => {
    updateGeneration({ loras: loraEntries.filter((entry) => entry.id !== entryId) });
  }, [loraEntries, updateGeneration]);
  const toggleLoraCollapsed = useCallback((entryId: string) => {
    setLoraCollapsedIds((prev) => (
      prev.includes(entryId)
        ? prev.filter((id) => id !== entryId)
        : [...prev, entryId]
    ));
  }, []);

  const addLoraEntry = useCallback((selectedName?: string) => {
    if (loraEntries.length >= 24) {
      showToast('LoRA limit reached', 'error');
      return;
    }
    const requested = normalizeLoraCatalogPath(selectedName);
    const firstCatalog = loraCatalogSafetensors.length > 0 ? loraCatalogSafetensors[0] : '';
    const next: PowerPrompterLoraEntry = {
      id: createId('lora'),
      name: requested || firstCatalog,
      strengthModel: 1.0,
      strengthClip: 1.0,
      enabled: true,
      queueEnabled: true,
      queueSetIds: [...ALL_QUEUE_SET_IDS],
    };
    updateGeneration({ loras: [...loraEntries, next] });
  }, [loraEntries, loraCatalogSafetensors, updateGeneration, showToast]);

  const openLoraBrowser = useCallback(() => {
    if (loraEntries.length >= 24) {
      showToast('LoRA limit reached', 'error');
      return;
    }
    clearLoraBrowserInfoClickTimer();
    setIsLoraBrowserOpen(true);
    setLoraBrowserSearch('');
    setLoraBrowserRootPath('');
    setLoraBrowserFolder('');
    setLoraBrowserSelectedPath('');
    setLoraBrowserAvailableRoots([]);
    setLoraBrowserFsFolders([]);
    loraBrowserFilesLoadSeqRef.current += 1;
    setLoraBrowserFsFiles([]);
    setLoraBrowserExpandedFolders(['']);
    setLoraBrowserFileMenu(null);
    setLoraBrowserFolderMenu(null);
    setLoraBrowserDropFolderPath(null);
    if (!isForgeMode && loraCatalogSafetensors.length === 0) {
      void onRefreshLoraCatalog?.(false);
    }
  }, [isForgeMode, loraEntries.length, loraCatalogSafetensors.length, onRefreshLoraCatalog, showToast, clearLoraBrowserInfoClickTimer]);

  const confirmLoraBrowserSelection = useCallback(() => {
    const selected = normalizeLoraCatalogPath(loraBrowserSelectedPath);
    if (!selected) {
      showToast('Select a LoRA file first', 'error');
      return;
    }
    clearLoraBrowserInfoClickTimer();
    addLoraEntry(selected);
    setIsLoraBrowserOpen(false);
  }, [addLoraEntry, loraBrowserSelectedPath, showToast, clearLoraBrowserInfoClickTimer]);

  const listLoraBrowserFolders = useCallback(async (rootPath: string): Promise<string[]> => {
    const normalizedRoot = String(rootPath || '').trim();
    if (!normalizedRoot) return [];
    const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(normalizedRoot)}&maxDepth=8`, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) return [];
    const folders = Array.isArray(payload?.folders) ? payload.folders : [];
    const flattened = new Set<string>();
    const walk = (nodes: unknown[]) => {
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const record = node as Record<string, unknown>;
        const relativePath = stripPathPrefix(String(record.relativePath || record.path || ''), normalizedRoot);
        const normalized = normalizeLoraCatalogPath(relativePath);
        if (normalized) flattened.add(normalized);
        if (Array.isArray(record.children)) {
          walk(record.children);
        }
      }
    };
    walk(folders);
    return expandCatalogFolderPaths(Array.from(flattened));
  }, []);

  const listLoraBrowserFiles = useCallback(async (
    rootPath: string,
    _folderPath: string,
    _folderCandidates?: string[],
  ): Promise<LoraBrowserFileEntry[]> => {
    const normalizedRoot = normalizeLoraCatalogPath(rootPath);
    if (!normalizedRoot) return [];
    const merged = new Map<string, LoraBrowserFileEntry>();
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(normalizedRoot)}&filter=all&recursive=true`, { cache: 'no-store' });
      if (!response.ok) return [];
      const payload = await response.json().catch(() => ({}));
      if (payload?.error) return [];
      const files = Array.isArray(payload?.files) ? payload.files : [];
      for (const entry of files) {
        const rawPath = String((entry as any)?.path || '').trim();
        const rawName = String((entry as any)?.name || '').trim();
        if (!rawName || !LORA_BROWSER_FILE_PATTERN.test(rawName.toLowerCase())) continue;
        const normalizedPath = normalizeLoraCatalogPath(rawPath || joinClientPath(normalizedRoot, rawName));
        if (!normalizedPath) continue;
        let relative = normalizeLoraCatalogPath(stripPathPrefix(normalizedPath, normalizedRoot));
        if (!relative) {
          const marker = '/models/loras/';
          const markerIdx = normalizedPath.toLowerCase().indexOf(marker);
          if (markerIdx >= 0) {
            relative = normalizeLoraCatalogPath(normalizedPath.slice(markerIdx + marker.length));
          }
        }
        if (!relative) continue;
        const key = relative.toLowerCase();
        if (!merged.has(key)) {
          merged.set(key, {
            path: relative,
            folder: getLoraCatalogFolder(relative),
            name: getLoraCatalogName(relative),
          });
        }
      }
    } catch {
      return [];
    }
    return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  }, []);

  const refreshLoraBrowserFiles = useCallback(async (
    rootOverride?: string,
    folderOverride?: string,
    folderCandidates?: string[],
  ) => {
    const targetRoot = normalizeLoraCatalogPath(rootOverride || '');
    if (!targetRoot) {
      setLoraBrowserFsFiles([]);
      return;
    }
    const targetFolder = normalizeLoraCatalogPath(folderOverride ?? '');
    const loadSeq = loraBrowserFilesLoadSeqRef.current + 1;
    loraBrowserFilesLoadSeqRef.current = loadSeq;
    const files = await listLoraBrowserFiles(targetRoot, targetFolder, folderCandidates);
    if (loraBrowserFilesLoadSeqRef.current !== loadSeq) return;
    setLoraBrowserFsFiles(files);
  }, [listLoraBrowserFiles]);

  const refreshLoraBrowserRoots = useCallback(async () => {
    setIsLoraBrowserFsBusy(true);
    try {
      const currentRoot = normalizeLoraCatalogPath(loraBrowserRootPathRef.current);
      const currentFolder = normalizeLoraCatalogPath(loraBrowserFolderRef.current);
      const dynamicRoots: string[] = [];
      try {
        const settings = await fetchAppSettingsFromBackend();
        const configuredComfyPath = String(settings?.['comfyui.path'] || '').trim();
        if (configuredComfyPath) {
          dynamicRoots.push(...buildLoraRootCandidatesFromComfyPath(configuredComfyPath));
        }
      } catch {
        // Ignore settings read failures and continue with fallback candidates.
      }
      try {
        const response = await fetch('/api/tools/detect', { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const detectedComfyPath = String(payload?.comfyui?.path || '').trim();
          if (detectedComfyPath) {
            dynamicRoots.push(...buildLoraRootCandidatesFromComfyPath(detectedComfyPath));
          }
        }
      } catch {
        // Ignore detect failures and continue with fallback candidates.
      }
      const staticRoots = LORA_BROWSER_ROOT_CANDIDATES;
      const probeRoots = Array.from(new Set([
        ...dynamicRoots,
        ...staticRoots,
        String(currentRoot || '').trim(),
      ].filter((entry) => entry.length > 0)));
      const available: string[] = [];
      for (const root of probeRoots) {
        try {
          const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(root)}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const payload = await response.json().catch(() => ({}));
          if (payload?.error) continue;
          available.push(root);
        } catch {
          // Ignore probe failures and continue scanning.
        }
      }
      const uniqueAvailable = Array.from(new Set(available));
      setLoraBrowserAvailableRoots(uniqueAvailable);
      const nextRoot = uniqueAvailable.includes(currentRoot)
        ? currentRoot
        : (uniqueAvailable[0] || '');
      if (nextRoot !== currentRoot) {
        loraBrowserRootPathRef.current = nextRoot;
        setLoraBrowserRootPath(nextRoot);
      }
      if (nextRoot) {
        const folders = await listLoraBrowserFolders(nextRoot);
        setLoraBrowserFsFolders(folders);
        setLoraBrowserExpandedFolders([''].concat(folders));
        const effectiveFolder = currentFolder && folders.includes(currentFolder) ? currentFolder : '';
        if (effectiveFolder !== currentFolder) {
          loraBrowserFolderRef.current = '';
          setLoraBrowserFolder('');
        }
        await refreshLoraBrowserFiles(nextRoot, effectiveFolder, folders);
      } else {
        setLoraBrowserFsFolders([]);
        setLoraBrowserFsFiles([]);
      }
    } finally {
      setIsLoraBrowserFsBusy(false);
    }
  }, [isForgeMode, listLoraBrowserFolders, refreshLoraBrowserFiles]);

  const refreshLoraBrowserFolderTree = useCallback(async (rootOverride?: string) => {
    const targetRoot = String(rootOverride || loraBrowserRootPath || '').trim();
    if (!targetRoot) {
      setLoraBrowserFsFolders([]);
      setLoraBrowserFsFiles([]);
      return;
    }
    setIsLoraBrowserFsBusy(true);
    try {
      const folders = await listLoraBrowserFolders(targetRoot);
      setLoraBrowserFsFolders(folders);
      setLoraBrowserExpandedFolders([''].concat(folders));
      const currentFolder = normalizeLoraCatalogPath(loraBrowserFolder);
      const effectiveFolder = currentFolder && folders.includes(currentFolder) ? currentFolder : '';
      if (effectiveFolder !== currentFolder) {
        setLoraBrowserFolder('');
      }
      await refreshLoraBrowserFiles(targetRoot, effectiveFolder, folders);
    } finally {
      setIsLoraBrowserFsBusy(false);
    }
  }, [loraBrowserRootPath, loraBrowserFolder, listLoraBrowserFolders, refreshLoraBrowserFiles]);

  const createLoraFolderAt = useCallback(async (parentFolderPath?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const name = String(window.prompt('New folder name', '') || '').trim();
    if (!name) return;
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      showToast('Invalid folder name', 'error');
      return;
    }
    const baseFolder = normalizeLoraCatalogPath(parentFolderPath ?? loraBrowserFolder);
    const nextRelative = normalizeLoraCatalogPath(joinClientPath(baseFolder, name));
    const targetPath = joinClientPath(loraBrowserRootPath, nextRelative);
    try {
      const response = await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to create folder'));
      }
      setLoraBrowserFolder(nextRelative);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
      setLoraBrowserFolderMenu(null);
      showToast(`Created folder: ${name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to create folder'), 'error');
    }
  }, [loraBrowserRootPath, loraBrowserFolder, refreshLoraBrowserFolderTree, showToast]);

  const createLoraFolder = useCallback(async () => {
    await createLoraFolderAt(loraBrowserFolder);
  }, [createLoraFolderAt, loraBrowserFolder]);

  const trashSelectedLoraFile = useCallback(async (pathOverride?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const selected = normalizeLoraCatalogPath(pathOverride ?? loraBrowserSelectedPath);
    if (!selected) {
      showToast('Select a LoRA file first', 'error');
      return;
    }
    const targetPath = joinClientPath(loraBrowserRootPath, selected);
    try {
      const appSettings = await fetchAppSettingsFromBackend().catch(() => loadAppSettings());
      await deletePathsWithSettings([targetPath], appSettings as unknown as Record<string, unknown>);
      showToast(`Moved to Trash: ${getLoraCatalogName(selected)}`, 'success');
      if (selected === normalizeLoraCatalogPath(loraBrowserSelectedPath)) {
        setLoraBrowserSelectedPath('');
      }
      setLoraBrowserFileMenu(null);
      await onRefreshLoraCatalog?.(false);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to move LoRA file to Trash'), 'error');
    }
  }, [loraBrowserRootPath, loraBrowserSelectedPath, onRefreshLoraCatalog, refreshLoraBrowserFolderTree, showToast]);

  const trashCurrentLoraFolder = useCallback(async (folderOverride?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const currentFolder = normalizeLoraCatalogPath(folderOverride ?? loraBrowserFolder);
    if (!currentFolder) {
      showToast('Select a folder first', 'error');
      return;
    }
    const confirmed = window.confirm(`Send folder "${currentFolder}" to Trash?`);
    if (!confirmed) return;
    const targetPath = joinClientPath(loraBrowserRootPath, currentFolder);
    try {
      const appSettings = await fetchAppSettingsFromBackend().catch(() => loadAppSettings());
      await deletePathsWithSettings([targetPath], appSettings as unknown as Record<string, unknown>);
      const parentFolder = getLoraCatalogFolder(currentFolder);
      setLoraBrowserFolder(parentFolder);
      setLoraBrowserSelectedPath('');
      setLoraBrowserFolderMenu(null);
      await onRefreshLoraCatalog?.(false);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
      showToast(`Moved folder to Trash: ${currentFolder}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to move folder to Trash'), 'error');
    }
  }, [loraBrowserRootPath, loraBrowserFolder, onRefreshLoraCatalog, refreshLoraBrowserFolderTree, showToast]);

  const renameLoraBrowserFile = useCallback(async (pathOverride?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const selected = normalizeLoraCatalogPath(pathOverride ?? loraBrowserSelectedPath);
    if (!selected) {
      showToast('Select a LoRA file first', 'error');
      return;
    }
    const currentName = getLoraCatalogName(selected);
    const nextName = String(window.prompt('Rename file', currentName) || '').trim();
    if (!nextName || nextName === currentName) return;
    if (nextName.includes('/') || nextName.includes('\\') || nextName === '.' || nextName === '..') {
      showToast('Invalid file name', 'error');
      return;
    }
    try {
      const sourcePath = joinClientPath(loraBrowserRootPath, selected);
      const response = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sourcePath, newName: nextName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to rename file'));
      }
      const nextRelative = normalizeLoraCatalogPath(stripPathPrefix(String(payload?.newPath || ''), loraBrowserRootPath))
        || normalizeLoraCatalogPath(joinClientPath(getLoraCatalogFolder(selected), nextName));
      setLoraBrowserSelectedPath(nextRelative);
      setLoraBrowserFileMenu(null);
      await onRefreshLoraCatalog?.(false);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
      showToast(`Renamed: ${currentName} -> ${nextName}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to rename file'), 'error');
    }
  }, [loraBrowserRootPath, loraBrowserSelectedPath, onRefreshLoraCatalog, refreshLoraBrowserFolderTree, showToast]);

  const renameLoraBrowserFolder = useCallback(async (folderOverride?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const folderPath = normalizeLoraCatalogPath(folderOverride ?? loraBrowserFolder);
    if (!folderPath) {
      showToast('Select a folder first', 'error');
      return;
    }
    const currentName = getLoraCatalogName(folderPath);
    const nextName = String(window.prompt('Rename folder', currentName) || '').trim();
    if (!nextName || nextName === currentName) return;
    if (nextName.includes('/') || nextName.includes('\\') || nextName === '.' || nextName === '..') {
      showToast('Invalid folder name', 'error');
      return;
    }
    try {
      const sourcePath = joinClientPath(loraBrowserRootPath, folderPath);
      const response = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sourcePath, newName: nextName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Failed to rename folder'));
      }
      const nextRelative = normalizeLoraCatalogPath(stripPathPrefix(String(payload?.newPath || ''), loraBrowserRootPath))
        || normalizeLoraCatalogPath(joinClientPath(getLoraCatalogFolder(folderPath), nextName));
      setLoraBrowserFolder(nextRelative);
      setLoraBrowserFolderMenu(null);
      await onRefreshLoraCatalog?.(false);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
      showToast(`Renamed folder: ${currentName} -> ${nextName}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to rename folder'), 'error');
    }
  }, [loraBrowserRootPath, loraBrowserFolder, onRefreshLoraCatalog, refreshLoraBrowserFolderTree, showToast]);

  const moveLoraBrowserFileToFolder = useCallback(async (sourcePath: string, destinationFolder: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const source = normalizeLoraCatalogPath(sourcePath);
    const destination = normalizeLoraCatalogPath(destinationFolder);
    if (!source) return;
    if (getLoraCatalogFolder(source) === destination) return;
    setIsLoraBrowserFsBusy(true);
    try {
      const response = await fetch('/api/fs/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: [joinClientPath(loraBrowserRootPath, source)],
          destination: joinClientPath(loraBrowserRootPath, destination),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'Failed to move LoRA file'));
      }
      const movedName = getLoraCatalogName(source);
      const movedPath = normalizeLoraCatalogPath(joinClientPath(destination, movedName));
      setLoraBrowserSelectedPath(movedPath);
      setLoraBrowserFolder(destination);
      await onRefreshLoraCatalog?.(false);
      await refreshLoraBrowserFolderTree(loraBrowserRootPath);
      showToast(`Moved ${movedName}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to move LoRA file'), 'error');
    } finally {
      setIsLoraBrowserFsBusy(false);
      setLoraBrowserDropFolderPath(null);
    }
  }, [loraBrowserRootPath, onRefreshLoraCatalog, refreshLoraBrowserFolderTree, showToast]);

  useEffect(() => {
    const validIds = new Set(loraEntries.map((entry) => entry.id));
    setLoraCollapsedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [loraEntries]);

  useEffect(() => {
    loraBrowserRootPathRef.current = normalizeLoraCatalogPath(loraBrowserRootPath);
  }, [loraBrowserRootPath]);

  useEffect(() => {
    loraBrowserFolderRef.current = normalizeLoraCatalogPath(loraBrowserFolder);
  }, [loraBrowserFolder]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    if (!isForgeMode && loraCatalogSafetensors.length === 0) {
      void onRefreshLoraCatalog?.(false);
    }
  }, [isLoraBrowserOpen, isForgeMode, loraCatalogSafetensors.length, onRefreshLoraCatalog]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    setLoraBrowserFolder((prev) => {
      const normalizedPrev = normalizeLoraCatalogPath(prev);
      if (!normalizedPrev) return '';
      const hasFolder = loraBrowserFolders.some((entry) => entry.path === normalizedPrev);
      return hasFolder ? normalizedPrev : '';
    });
  }, [isLoraBrowserOpen, loraBrowserFolders]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    if (loraBrowserFolders.length === 0) return;
    const hasFolder = loraBrowserFolders.some((entry) => entry.path === loraBrowserFolder);
    if (!hasFolder) {
      setLoraBrowserFolder('');
    }
  }, [isLoraBrowserOpen, loraBrowserFolders, loraBrowserFolder]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    const target = normalizeLoraCatalogPath(loraBrowserFolder);
    if (!target) return;
    const ancestors = getFolderAncestorPaths(target);
    if (ancestors.length === 0) return;
    setLoraBrowserExpandedFolders((prev) => {
      const merged = new Set<string>(['']);
      for (const entry of prev) {
        const normalized = normalizeLoraCatalogPath(entry);
        if (normalized || normalized === '') merged.add(normalized);
      }
      for (const ancestor of ancestors) merged.add(ancestor);
      return Array.from(merged);
    });
  }, [isLoraBrowserOpen, loraBrowserFolder]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    const hasSelection = loraBrowserVisibleFiles.some((entry) => entry.path === loraBrowserSelectedPath);
    if (hasSelection) return;
    if (loraBrowserVisibleFiles.length > 0) {
      setLoraBrowserSelectedPath(loraBrowserVisibleFiles[0].path);
      return;
    }
    setLoraBrowserSelectedPath('');
  }, [isLoraBrowserOpen, loraBrowserVisibleFiles, loraBrowserSelectedPath]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    const timer = setInterval(() => {
      setLoraBrowserThumbTick((prev) => prev + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, [isLoraBrowserOpen]);

  useEffect(() => {
    if (!isLoraBrowserOpen) return;
    if (!onRequestLoraInfo) return;
    const targets = Array.from(new Set(
      [
        ...loraBrowserVisibleFiles.slice(0, 20).map((entry) => entry.path),
        loraBrowserSelectedPath,
      ]
        .map((entry) => normalizeLoraCatalogPath(entry))
        .filter((entry) => entry.length > 0)
    ));
    if (targets.length === 0) return;

    let cancelled = false;
    const hydrate = async () => {
      for (const name of targets) {
        if (cancelled) return;
        const key = name.toLowerCase();
        if (loraCardMetaByName[key]) continue;
        if (loraCardMetaPendingRef.current.has(key)) continue;
        loraCardMetaPendingRef.current.add(key);
        try {
          const info = await onRequestLoraInfo(name, { previewOnly: true });
          if (cancelled) return;
          cacheLoraCardMeta(info, [name]);
        } catch {
          // Silent for browser hydration.
        } finally {
          loraCardMetaPendingRef.current.delete(key);
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isLoraBrowserOpen, onRequestLoraInfo, loraBrowserVisibleFiles, loraBrowserSelectedPath, loraCardMetaByName, cacheLoraCardMeta]);

  const openLoraInfo = useCallback(async (loraName: string) => {
    const normalizedName = String(loraName || '').trim();
    if (!normalizedName) {
      showToast('Select a LoRA first', 'error');
      return;
    }
    if (!onRequestLoraInfo) {
      showToast('LoRA info is unavailable right now', 'error');
      return;
    }
    setIsLoadingLoraInfo(true);
    setLoraInfoError(null);
    setIsLoraDescriptionExpanded(false);
    try {
      const info = await onRequestLoraInfo(normalizedName);
      cacheLoraCardMeta(info, [normalizedName]);
      if (Array.isArray(info.trainedTags) && info.trainedTags.length > 0) {
        const key = normalizedName.toLowerCase();
        setLoraTagBank((prev) => ({ ...prev, [key]: info.trainedTags }));
      }
      setLoraInfoModal(info);
    } catch (error: any) {
      setLoraInfoError(String(error?.message || 'Failed to load LoRA info'));
    } finally {
      setIsLoadingLoraInfo(false);
    }
  }, [onRequestLoraInfo, showToast, cacheLoraCardMeta]);

  const handleLoraBrowserFileClick = useCallback((filePath: string) => {
    const normalized = normalizeLoraCatalogPath(filePath);
    setLoraBrowserSelectedPath(normalized);
    setLoraBrowserFileMenu(null);
    setLoraBrowserFolderMenu(null);
    clearLoraBrowserInfoClickTimer();
  }, [clearLoraBrowserInfoClickTimer]);

  const handleLoraBrowserFileDoubleClick = useCallback((filePath: string) => {
    clearLoraBrowserInfoClickTimer();
    const normalized = normalizeLoraCatalogPath(filePath);
    setLoraBrowserSelectedPath(normalized);
    void openLoraInfo(normalized);
  }, [clearLoraBrowserInfoClickTimer, openLoraInfo]);

  const openLoraBrowserFileContextMenu = useCallback((event: React.MouseEvent, filePath: string) => {
    event.preventDefault();
    const normalized = normalizeLoraCatalogPath(filePath);
    setLoraBrowserSelectedPath(normalized);
    setLoraBrowserFolderMenu(null);
    setLoraBrowserFileMenu({ path: normalized, x: event.clientX, y: event.clientY });
  }, []);

  const openLoraBrowserFolderContextMenu = useCallback((event: React.MouseEvent, folderPath: string) => {
    event.preventDefault();
    const normalized = normalizeLoraCatalogPath(folderPath);
    setLoraBrowserFolder(normalized);
    setLoraBrowserFileMenu(null);
    setLoraBrowserFolderMenu({ path: normalized, x: event.clientX, y: event.clientY });
  }, []);

  const toggleLoraFolderExpanded = useCallback((folderPath: string) => {
    const normalized = normalizeLoraCatalogPath(folderPath);
    if (!normalized) return;
    setLoraBrowserExpandedFolders((prev) => {
      const set = new Set(prev.map((entry) => normalizeLoraCatalogPath(entry)).filter((entry) => entry.length > 0));
      if (set.has(normalized)) set.delete(normalized);
      else set.add(normalized);
      return [''].concat(Array.from(set));
    });
  }, []);

  const openLoraFolderInExplorer = useCallback(async (folderPath?: string) => {
    if (!loraBrowserRootPath) {
      showToast('LoRA folder root is unavailable', 'error');
      return;
    }
    const folder = normalizeLoraCatalogPath(folderPath ?? loraBrowserFolder);
    const target = folder ? joinClientPath(loraBrowserRootPath, folder) : loraBrowserRootPath;
    await revealPathInFileExplorer(target, 'Select a LoRA folder first');
  }, [loraBrowserRootPath, loraBrowserFolder, revealPathInFileExplorer, showToast]);

  const openModelBrowser = useCallback(() => {
    clearModelBrowserInfoClickTimer();
    setIsModelBrowserOpen(true);
    setModelBrowserType(normalizePowerPrompterModelType(generation.modelType));
    setModelBrowserSearch('');
    setModelBrowserRootPath('');
    setModelBrowserFolder('');
    setModelBrowserSelectedPath(generation.checkpointName || '');
    setModelBrowserAvailableRoots([]);
    setModelBrowserFsFolders([]);
    setModelBrowserExpandedFolders(['']);
    modelBrowserFilesLoadSeqRef.current += 1;
    setModelBrowserFsFiles([]);
    if (modelCatalogEntries.length === 0) {
      void onRefreshModelCatalog?.(false);
    }
  }, [clearModelBrowserInfoClickTimer, generation.checkpointName, generation.modelType, modelCatalogEntries.length, onRefreshModelCatalog]);

  const toggleModelFolderExpanded = useCallback((folderPath: string) => {
    const normalized = normalizeLoraCatalogPath(folderPath);
    if (!normalized) return;
    setModelBrowserExpandedFolders((prev) => {
      const set = new Set(prev.map((entry) => normalizeLoraCatalogPath(entry)).filter((entry) => entry.length > 0));
      if (set.has(normalized)) set.delete(normalized);
      else set.add(normalized);
      return [''].concat(Array.from(set));
    });
  }, []);

  const handleModelBrowserTypeChange = useCallback((type: PowerPrompterModelType) => {
    setModelBrowserType(type);
    setModelBrowserFolder('');
    setModelBrowserSelectedPath('');
    setModelBrowserFsFiles([]);
    modelBrowserFilesLoadSeqRef.current += 1;
  }, []);

  const openModelFolderInExplorer = useCallback(async (folderPath?: string) => {
    if (!modelBrowserRootPath) {
      showToast('Model root folder is unavailable', 'error');
      return;
    }
    const folder = normalizeLoraCatalogPath(folderPath ?? modelBrowserFolder);
    const target = folder ? joinClientPath(modelBrowserRootPath, folder) : modelBrowserRootPath;
    await revealPathInFileExplorer(target, 'Select a model folder first');
  }, [modelBrowserRootPath, modelBrowserFolder, revealPathInFileExplorer, showToast]);

  const listModelBrowserFolders = useCallback(async (rootPath: string): Promise<string[]> => {
    const normalizedRoot = String(rootPath || '').trim();
    if (!normalizedRoot) return [];
    const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(normalizedRoot)}&maxDepth=8`, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) return [];
    const folders = Array.isArray(payload?.folders) ? payload.folders : [];
    const flattened = new Set<string>();
    const walk = (nodes: unknown[]) => {
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const record = node as Record<string, unknown>;
        const rawPath = String(record.relativePath || record.path || '');
        let relativePath = stripPathPrefix(rawPath, normalizedRoot);
        let normalized = normalizeLoraCatalogPath(relativePath);
        if (normalized) {
          const lowerNormalized = normalized.toLowerCase();
          const lowerRoot = normalizeLoraCatalogPath(normalizedRoot).toLowerCase();
          if (lowerRoot && lowerNormalized.startsWith(lowerRoot)) {
            const trimmed = normalizeLoraCatalogPath(stripPathPrefix(normalized, normalizedRoot));
            if (trimmed) normalized = trimmed;
          }
        } else {
          const normalizedRaw = normalizeLoraCatalogPath(rawPath);
          const marker = '/models/';
          const markerIdx = normalizedRaw.toLowerCase().indexOf(marker);
          if (markerIdx >= 0) {
            normalized = normalizeLoraCatalogPath(normalizedRaw.slice(markerIdx + marker.length));
          }
        }
        normalized = qualifyModelBrowserRelativePath(normalized, normalizedRoot);
        if (normalized) flattened.add(normalized);
        if (Array.isArray(record.children)) {
          walk(record.children);
        }
      }
    };
    walk(folders);
    return expandCatalogFolderPaths(Array.from(flattened));
  }, []);

  const listModelBrowserFiles = useCallback(async (
    rootPath: string,
    _folderPath: string,
    _folderCandidates?: string[],
  ): Promise<LoraBrowserFileEntry[]> => {
    const normalizedRoot = normalizeLoraCatalogPath(rootPath);
    if (!normalizedRoot) return [];
    const lowerRoot = normalizedRoot.toLowerCase();
    const merged = new Map<string, LoraBrowserFileEntry>();
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(normalizedRoot)}&filter=all&recursive=true`, { cache: 'no-store' });
      if (!response.ok) return [];
      const payload = await response.json().catch(() => ({}));
      if (payload?.error) return [];
      const files = Array.isArray(payload?.files) ? payload.files : [];
      const mapped = files
        .map((entry: unknown) => {
          const rawPath = String((entry as any)?.path || '').trim();
          const rawName = String((entry as any)?.name || '').trim();
          if (!rawName || MODEL_BROWSER_IGNORE_FILE_PATTERN.test(rawName.toLowerCase())) return null;
          const normalizedPath = normalizeLoraCatalogPath(rawPath || joinClientPath(normalizedRoot, rawName));
          if (!normalizedPath) return null;
          let relative = normalizeLoraCatalogPath(stripPathPrefix(normalizedPath, normalizedRoot));
          if (!relative || relative.toLowerCase().startsWith(lowerRoot)) {
            const marker = '/models/';
            const markerIdx = normalizedPath.toLowerCase().indexOf(marker);
            if (markerIdx >= 0) {
              relative = normalizeLoraCatalogPath(normalizedPath.slice(markerIdx + marker.length));
            }
          }
          relative = qualifyModelBrowserRelativePath(relative, normalizedRoot);
          if (!relative || !isModelBrowserFileCandidate(relative)) return null;
          const modelType = inferModelTypeFromCatalogPath(relative);
          if (modelType !== modelBrowserType) return null;
          return {
            path: relative,
            folder: getLoraCatalogFolder(relative),
            name: getLoraCatalogName(relative),
            modelType,
          } as LoraBrowserFileEntry;
        })
        .filter((entry: LoraBrowserFileEntry | null): entry is LoraBrowserFileEntry => Boolean(entry));
      for (const entry of mapped) {
        merged.set(entry.path.toLowerCase(), entry);
      }
    } catch {
      return [];
    }
    return Array.from(merged.values())
      .sort((a: LoraBrowserFileEntry, b: LoraBrowserFileEntry) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  }, [modelBrowserType]);

  const refreshModelBrowserFiles = useCallback(async (
    rootOverride?: string,
    folderOverride?: string,
    folderCandidates?: string[],
  ) => {
    const targetRoot = normalizeLoraCatalogPath(rootOverride || '');
    if (!targetRoot) {
      setModelBrowserFsFiles([]);
      return;
    }
    const targetFolder = normalizeLoraCatalogPath(folderOverride ?? '');
    const loadSeq = modelBrowserFilesLoadSeqRef.current + 1;
    modelBrowserFilesLoadSeqRef.current = loadSeq;
    const files = await listModelBrowserFiles(targetRoot, targetFolder, folderCandidates);
    if (modelBrowserFilesLoadSeqRef.current !== loadSeq) return;
    setModelBrowserFsFiles(files);
  }, [listModelBrowserFiles]);

  const refreshModelBrowserFolderTree = useCallback(async (rootOverride?: string) => {
    const targetRoot = String(rootOverride || modelBrowserRootPath || '').trim();
    if (!targetRoot) {
      setModelBrowserFsFolders([]);
      return;
    }
    setIsModelBrowserFsBusy(true);
    try {
      const folders = await listModelBrowserFolders(targetRoot);
      setModelBrowserFsFolders(folders);
      setModelBrowserExpandedFolders([''].concat(folders));
      const currentFolder = normalizeLoraCatalogPath(modelBrowserFolder);
      const effectiveFolder = currentFolder && folders.includes(currentFolder) ? currentFolder : '';
      if (effectiveFolder !== currentFolder) {
        setModelBrowserFolder('');
      }
      await refreshModelBrowserFiles(targetRoot, effectiveFolder, folders);
    } finally {
      setIsModelBrowserFsBusy(false);
    }
  }, [modelBrowserRootPath, modelBrowserFolder, listModelBrowserFolders, refreshModelBrowserFiles]);

  const refreshModelBrowserRoots = useCallback(async () => {
    setIsModelBrowserFsBusy(true);
    try {
      const dynamicRoots: string[] = [];
      try {
        const settings = await fetchAppSettingsFromBackend();
        const configuredComfyPath = String(settings?.['comfyui.path'] || '').trim();
        if (configuredComfyPath) {
          dynamicRoots.push(...buildModelRootCandidatesFromComfyPath(configuredComfyPath));
        }
      } catch {
        // ignore
      }
      try {
        const response = await fetch('/api/tools/detect', { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const detectedComfyPath = String(payload?.comfyui?.path || '').trim();
          if (detectedComfyPath) {
            dynamicRoots.push(...buildModelRootCandidatesFromComfyPath(detectedComfyPath));
          }
        }
      } catch {
        // ignore
      }
      const probeRoots = Array.from(new Set([
        ...dynamicRoots,
        ...MODEL_BROWSER_ROOT_CANDIDATES,
        String(modelBrowserRootPath || '').trim(),
      ].filter((entry) => entry.length > 0)));
      const available: string[] = [];
      for (const root of probeRoots) {
        try {
          const response = await fetch(`/api/fs/tree?path=${encodeURIComponent(root)}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const payload = await response.json().catch(() => ({}));
          if (payload?.error) continue;
          available.push(root);
        } catch {
          // ignore
        }
      }
      const uniqueAvailable = Array.from(new Set(available));
      setModelBrowserAvailableRoots(uniqueAvailable);
      const nextRoot = uniqueAvailable.includes(modelBrowserRootPath)
        ? modelBrowserRootPath
        : (uniqueAvailable[0] || '');
      if (nextRoot !== modelBrowserRootPath) {
        setModelBrowserRootPath(nextRoot);
      }
      if (nextRoot) {
        const folders = await listModelBrowserFolders(nextRoot);
        setModelBrowserFsFolders(folders);
        setModelBrowserExpandedFolders([''].concat(folders));
        await refreshModelBrowserFiles(nextRoot, '', folders);
      } else {
        setModelBrowserFsFolders([]);
        setModelBrowserFsFiles([]);
      }
    } finally {
      setIsModelBrowserFsBusy(false);
    }
  }, [modelBrowserRootPath, listModelBrowserFolders, refreshModelBrowserFiles]);

  const openModelInfo = useCallback(async (modelName: string) => {
    const normalizedName = String(modelName || '').trim();
    if (!normalizedName) {
      showToast('Select a model first', 'error');
      return;
    }
    if (!onRequestModelInfo) {
      showToast('Model info is unavailable right now', 'error');
      return;
    }
    setIsLoadingModelInfo(true);
    setModelInfoError(null);
    setIsModelDescriptionExpanded(false);
    try {
      const info = await onRequestModelInfo(normalizedName);
      cacheModelCardMeta(info, [normalizedName]);
      setModelInfoModal(info);
    } catch (error: any) {
      setModelInfoError(String(error?.message || 'Failed to load model info'));
    } finally {
      setIsLoadingModelInfo(false);
    }
  }, [onRequestModelInfo, showToast, cacheModelCardMeta]);

  const handleModelBrowserFileClick = useCallback((filePath: string) => {
    const normalized = normalizeLoraCatalogPath(filePath);
    setModelBrowserSelectedPath(normalized);
    clearModelBrowserInfoClickTimer();
  }, [clearModelBrowserInfoClickTimer]);

  const handleModelBrowserFileDoubleClick = useCallback((filePath: string) => {
    clearModelBrowserInfoClickTimer();
    const normalized = normalizeLoraCatalogPath(filePath);
    setModelBrowserSelectedPath(normalized);
    if (modelBrowserType !== 'checkpoint') return;
    void openModelInfo(normalized);
  }, [clearModelBrowserInfoClickTimer, modelBrowserType, openModelInfo]);

  const resolveCatalogPathByName = useCallback((rawPath: string, catalogPaths: string[]): string => {
    const normalized = normalizeLoraCatalogPath(rawPath);
    if (!normalized) return '';
    if (normalized.includes('/')) return normalized;
    const targetName = getLoraCatalogName(normalized).toLowerCase();
    const exact = catalogPaths.find((entry) => getLoraCatalogName(entry).toLowerCase() === targetName);
    return exact ? normalizeLoraCatalogPath(exact) : normalized;
  }, []);

  const resolveModelSelection = useCallback((rawPath: string, routeType: PowerPrompterModelType = modelBrowserType): string => {
    const normalized = normalizeLoraCatalogPath(rawPath);
    if (!normalized) return '';
    const normalizedRouteType = normalizePowerPrompterModelType(routeType);
    const normalizeForRoute = (pathValue: string) => stripModelFolderPrefixForType(pathValue, normalizedRouteType);
    const catalog = modelCatalogEntries
      .filter((entry) => (entry.modelType || 'checkpoint') === normalizedRouteType)
      .map((entry) => entry.path);
    const normalizedLower = normalized.toLowerCase();
    const exact = catalog.find((entry) => entry.toLowerCase() === normalizedLower);
    if (exact) return normalizeForRoute(exact);

    const withoutRootPrefix = normalized.replace(/^(checkpoints|diffusers|diffusion_models|unet)\//i, '');
    if (withoutRootPrefix && withoutRootPrefix !== normalized) {
      const prefixMatch = catalog.find((entry) => entry.toLowerCase() === withoutRootPrefix.toLowerCase());
      if (prefixMatch) return normalizeForRoute(prefixMatch);
    }

    const baseName = getLoraCatalogName(normalized).toLowerCase();
    if (baseName) {
      const byName = catalog.find((entry) => getLoraCatalogName(entry).toLowerCase() === baseName);
      if (byName) return normalizeForRoute(byName);
    }

    return normalizeForRoute(normalized);
  }, [modelBrowserType, modelCatalogEntries]);

  const requestLoraThumbnailPick = useCallback((loraPath: string) => {
    const normalized = resolveCatalogPathByName(loraPath, loraCatalogSafetensors);
    if (!normalized) return;
    pendingLoraThumbnailPathRef.current = normalized;
    loraThumbnailPickerRef.current?.click();
  }, [loraCatalogSafetensors, resolveCatalogPathByName]);

  const readImageFileAsThumbnailDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const width = Math.max(1, Number(image.naturalWidth) || 1);
          const height = Math.max(1, Number(image.naturalHeight) || 1);
          const longEdge = Math.max(width, height);
          const scale = longEdge > 768 ? (768 / longEdge) : 1;
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));
          const canvas = window.document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context unavailable');
          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
          resolve(canvas.toDataURL('image/webp', 0.9));
        } catch (error) {
          reject(new Error('Failed to render image thumbnail'));
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Failed to decode image thumbnail'));
      };
      image.src = blobUrl;
    });
  }, []);

  const readVideoFileAsThumbnailDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(file);
      const video = window.document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
        video.src = '';
      };
      video.onloadedmetadata = () => {
        const seekTo = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.2, video.duration / 2) : 0;
        if (seekTo > 0) {
          try {
            video.currentTime = seekTo;
            return;
          } catch {
            // fall through and capture current frame
          }
        }
        video.onseeked?.(new Event('seeked'));
      };
      video.onseeked = () => {
        try {
          const width = Math.max(1, Number(video.videoWidth) || 1);
          const height = Math.max(1, Number(video.videoHeight) || 1);
          const longEdge = Math.max(width, height);
          const scale = longEdge > 768 ? (768 / longEdge) : 1;
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));
          const canvas = window.document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context unavailable');
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const frame = canvas.toDataURL('image/webp', 0.88);
          cleanup();
          resolve(frame);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to decode video'));
      };
      video.src = blobUrl;
    });
  }, []);

  const getNextThumbnailSequence = useCallback(async (folderPath: string, stem: string): Promise<number> => {
    const normalizedFolder = normalizeLoraCatalogPath(folderPath) || '.';
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(normalizedFolder)}`, { cache: 'no-store' });
      if (!response.ok) return 1;
      const payload = await response.json().catch(() => ({}));
      const files = Array.isArray(payload?.files) ? payload.files : [];
      const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escaped}${LOCAL_THUMBNAIL_SUFFIX}(\\d+)\\.webp$`, 'i');
      let maxSeq = 0;
      for (const entry of files) {
        const name = String((entry as any)?.name || '').trim();
        const match = name.match(pattern);
        if (!match) continue;
        const seq = Number.parseInt(match[1] || '', 10);
        if (Number.isFinite(seq)) {
          maxSeq = Math.max(maxSeq, seq);
        }
      }
      return maxSeq + 1;
    } catch {
      return 1;
    }
  }, []);

  const writeLocalWebpThumbnails = useCallback(async (targetCatalogPath: string, dataUrls: string[]): Promise<string[]> => {
    const normalizedTarget = normalizeLoraCatalogPath(targetCatalogPath);
    if (!normalizedTarget) return [];
    const folder = getLoraCatalogFolder(normalizedTarget);
    const stem = sanitizeThumbnailStem(getLoraCatalogName(normalizedTarget));
    let sequence = await getNextThumbnailSequence(folder, stem);
    const written: string[] = [];

    for (const dataUrl of dataUrls) {
      const normalizedData = String(dataUrl || '').trim();
      if (!normalizedData.startsWith('data:image/webp;base64,')) continue;
      const base64 = normalizedData.slice('data:image/webp;base64,'.length);
      if (!base64) continue;
      const fileName = `${stem}${LOCAL_THUMBNAIL_SUFFIX}${String(sequence).padStart(3, '0')}.webp`;
      sequence += 1;
      const relativePath = normalizeLoraCatalogPath(joinClientPath(folder, fileName));
      if (!relativePath) continue;
      const writeResponse = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: relativePath,
          content: base64,
          encoding: 'base64',
        }),
      });
      if (!writeResponse.ok) {
        const payload = await writeResponse.json().catch(() => ({}));
        throw new Error(String(payload?.error || 'Failed to save local thumbnail'));
      }
      written.push(`/api/fs/read?path=${encodeURIComponent(relativePath)}&rev=${Date.now()}-${sequence}`);
    }

    return written;
  }, [getNextThumbnailSequence]);

  const readMediaFilesAsThumbnailDataUrls = useCallback(async (files: FileList | null): Promise<string[]> => {
    if (!files || files.length === 0) return [];
    const selected = Array.from(files).slice(0, THUMBNAIL_PICK_MAX_FILES);
    const results: string[] = [];
    for (const file of selected) {
      const mimeType = String(file.type || '').toLowerCase();
      const fileName = String(file.name || '').toLowerCase();
      const isImage = mimeType.startsWith('image/') || (!mimeType && IMAGE_PREVIEW_EXT_PATTERN.test(fileName));
      const isVideo = mimeType.startsWith('video/') || (!mimeType && VIDEO_PREVIEW_EXT_PATTERN.test(fileName));
      try {
        if (isImage) {
          const dataUrl = await readImageFileAsThumbnailDataUrl(file);
          if (dataUrl) results.push(dataUrl);
          continue;
        }
        if (isVideo) {
          const dataUrl = await readVideoFileAsThumbnailDataUrl(file);
          if (dataUrl) results.push(dataUrl);
          continue;
        }
        // Unsupported media type - skip.
      } catch {
        // skip invalid file and continue with remaining selections
      }
    }
    return normalizeThumbnailOverrideSources(results);
  }, [readImageFileAsThumbnailDataUrl, readVideoFileAsThumbnailDataUrl]);

  const handleLoraThumbnailPickerChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const targetPath = normalizeLoraCatalogPath(pendingLoraThumbnailPathRef.current);
    event.target.value = '';
    if (!files || files.length === 0 || !targetPath) return;
    const rawSources = await readMediaFilesAsThumbnailDataUrls(files);
    const nextSources = await writeLocalWebpThumbnails(targetPath, rawSources);
    if (nextSources.length === 0) {
      showToast('Select image/video files to set thumbnails', 'error');
      return;
    }
    setThumbnailOverrides(targetPath, nextSources);
    showToast(
      `Set ${nextSources.length} thumbnail${nextSources.length === 1 ? '' : 's'} for ${getLoraCatalogName(targetPath)}`,
      'success'
    );
  }, [readMediaFilesAsThumbnailDataUrls, setThumbnailOverrides, showToast, writeLocalWebpThumbnails]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    if (modelCatalogEntries.length === 0) {
      void onRefreshModelCatalog?.(false);
    }
  }, [isModelBrowserOpen, modelCatalogEntries.length, onRefreshModelCatalog]);

  useEffect(() => {
    if (!isModelBrowserOpen) {
      modelBrowserRootRefreshKeyRef.current = '';
      return;
    }
    const refreshKey = modelBrowserType;
    if (modelBrowserRootRefreshKeyRef.current === refreshKey) return;
    modelBrowserRootRefreshKeyRef.current = refreshKey;
    void refreshModelBrowserRoots();
  }, [isModelBrowserOpen, modelBrowserType, refreshModelBrowserRoots]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    setModelBrowserFolder('');
    setModelBrowserSelectedPath('');
    setModelBrowserFsFiles([]);
    modelBrowserFilesLoadSeqRef.current += 1;
  }, [isModelBrowserOpen, modelBrowserType]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    setModelBrowserFolder((prev) => {
      const normalizedPrev = normalizeLoraCatalogPath(prev);
      if (!normalizedPrev) return '';
      const hasFolder = modelBrowserFolders.some((entry) => entry.path === normalizedPrev);
      return hasFolder ? normalizedPrev : '';
    });
  }, [isModelBrowserOpen, modelBrowserFolders]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    if (modelBrowserFolders.length === 0) return;
    const hasFolder = modelBrowserFolders.some((entry) => entry.path === modelBrowserFolder);
    if (!hasFolder) {
      setModelBrowserFolder('');
    }
  }, [isModelBrowserOpen, modelBrowserFolders, modelBrowserFolder]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    const target = normalizeLoraCatalogPath(modelBrowserFolder);
    if (!target) return;
    const ancestors = getFolderAncestorPaths(target);
    if (ancestors.length === 0) return;
    setModelBrowserExpandedFolders((prev) => {
      const merged = new Set<string>(['']);
      for (const entry of prev) {
        const normalized = normalizeLoraCatalogPath(entry);
        if (normalized || normalized === '') merged.add(normalized);
      }
      for (const ancestor of ancestors) merged.add(ancestor);
      return Array.from(merged);
    });
  }, [isModelBrowserOpen, modelBrowserFolder]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    const hasSelection = modelBrowserVisibleFiles.some((entry) => entry.path === modelBrowserSelectedPath);
    if (hasSelection) return;
    const preferred = normalizePowerPrompterModelType(generation.modelType) === modelBrowserType
      ? normalizeLoraCatalogPath(generation.checkpointName)
      : '';
    if (preferred) {
      const preferredAliases = new Set(getCatalogAliasKeys(preferred));
      const preferredMatch = modelBrowserVisibleFiles.find((entry) => (
        getCatalogAliasKeys(entry.path).some((key) => preferredAliases.has(key))
      ));
      if (preferredMatch) {
        setModelBrowserSelectedPath(preferredMatch.path);
        return;
      }
    }
    if (modelBrowserVisibleFiles.length > 0) {
      setModelBrowserSelectedPath(modelBrowserVisibleFiles[0].path);
      return;
    }
    setModelBrowserSelectedPath('');
  }, [isModelBrowserOpen, modelBrowserVisibleFiles, modelBrowserSelectedPath, generation.checkpointName, generation.modelType, modelBrowserType]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    const timer = setInterval(() => {
      setModelBrowserThumbTick((prev) => prev + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, [isModelBrowserOpen]);

  useEffect(() => {
    if (!isModelBrowserOpen) return;
    if (!onRequestModelInfo) return;
    if (modelBrowserType !== 'checkpoint') return;
    const targets = Array.from(new Set(
      [
        ...modelBrowserVisibleFiles.slice(0, 20).map((entry) => entry.path),
        modelBrowserSelectedPath,
      ]
        .map((entry) => normalizeLoraCatalogPath(entry))
        .filter((entry) => entry.length > 0)
    ));
    if (targets.length === 0) return;

    let cancelled = false;
    const hydrate = async () => {
      for (const name of targets) {
        if (cancelled) return;
        const key = name.toLowerCase();
        if (modelCardMetaByName[key]) continue;
        if (modelCardMetaPendingRef.current.has(key)) continue;
        modelCardMetaPendingRef.current.add(key);
        try {
          const info = await onRequestModelInfo(name, { previewOnly: true });
          if (cancelled) return;
          cacheModelCardMeta(info, [name]);
        } catch {
          // silent preload
        } finally {
          modelCardMetaPendingRef.current.delete(key);
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isModelBrowserOpen, onRequestModelInfo, modelBrowserType, modelBrowserVisibleFiles, modelBrowserSelectedPath, modelCardMetaByName, cacheModelCardMeta]);

  useEffect(() => {
    const checkpointNameRaw = String(generation.checkpointName || '').trim();
    const checkpointKey = checkpointNameRaw.toLowerCase();
    if (normalizePowerPrompterModelType(generation.modelType) !== 'checkpoint') return;
    if (!checkpointNameRaw || !onRequestModelInfo) return;
    if (modelCardMetaByName[checkpointKey]) return;
    if (modelCardMetaPendingRef.current.has(checkpointKey)) return;
    let cancelled = false;
    modelCardMetaPendingRef.current.add(checkpointKey);
    void onRequestModelInfo(checkpointNameRaw)
      .then((info) => {
        if (cancelled) return;
        cacheModelCardMeta(info, [checkpointNameRaw]);
      })
      .catch(() => {
        // silent
      })
      .finally(() => {
        modelCardMetaPendingRef.current.delete(checkpointKey);
      });
    return () => {
      cancelled = true;
    };
  }, [generation.checkpointName, generation.modelType, onRequestModelInfo, modelCardMetaByName, cacheModelCardMeta]);

  const loadLoraTags = useCallback(async (loraName: string) => {
    const normalizedName = String(loraName || '').trim();
    if (!normalizedName) {
      showToast('Select a LoRA first', 'error');
      return;
    }
    if (!onRequestLoraInfo) {
      showToast('LoRA tags are unavailable right now', 'error');
      return;
    }
    try {
      const info = await onRequestLoraInfo(normalizedName);
      cacheLoraCardMeta(info, [normalizedName]);
      const tags = Array.isArray(info.trainedTags)
        ? info.trainedTags.map((tag) => String(tag || '').trim()).filter((tag) => tag.length > 0)
        : [];
      setLoraTagBank((prev) => ({ ...prev, [normalizedName.toLowerCase()]: tags }));
      if (tags.length > 0) {
        showToast(`Loaded ${tags.length} tags`, 'success');
      } else {
        showToast('No trained tags found for this LoRA', 'error');
      }
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load LoRA tags'), 'error');
    }
  }, [onRequestLoraInfo, showToast, cacheLoraCardMeta]);

  useEffect(() => {
    if (!onRequestLoraInfo) return;
    const targetNames = Array.from(new Set(
      loraEntries
        .map((entry) => String(entry.name || '').trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    ));
    if (targetNames.length === 0) return;

    let cancelled = false;
    const loadMissing = async () => {
      for (const name of targetNames) {
        if (cancelled) return;
        if (loraCardMetaByName[name]) continue;
        if (loraCardMetaPendingRef.current.has(name)) continue;
        loraCardMetaPendingRef.current.add(name);
        try {
          const info = await onRequestLoraInfo(name);
          if (cancelled) return;
          cacheLoraCardMeta(info, [name]);
          if (Array.isArray(info.trainedTags) && info.trainedTags.length > 0) {
            setLoraTagBank((prev) => {
              if (prev[name] && prev[name].length > 0) return prev;
              return { ...prev, [name]: info.trainedTags };
            });
          }
        } catch {
          // ignore fetch errors for card preview hydration
        } finally {
          loraCardMetaPendingRef.current.delete(name);
        }
      }
    };

    void loadMissing();
    return () => {
      cancelled = true;
    };
  }, [loraEntries, loraCardMetaByName, onRequestLoraInfo, cacheLoraCardMeta]);

  useEffect(() => {
    const slot = slots.find((entry) => entry.slotId === activeSlotId) || slots[0];
    if (!slot) return;
    if (slot.slotId !== activeSlotId) setActiveSlotId(slot.slotId);
    const variant = slot.variants.find((entry) => entry.id === activeVariantId) || slot.variants[0];
    if (variant && variant.id !== activeVariantId) setActiveVariantId(variant.id);
  }, [slots, activeSlotId, activeVariantId]);

  useEffect(() => {
    const validVariantIds = new Set(
      slots.flatMap((slot) => slot.variants.map((variant) => String(variant.id || '').trim()).filter((id) => id.length > 0))
    );
    setEditingVariantId((prev) => (prev && !validVariantIds.has(prev) ? '' : prev));
    setVariantTextDrafts((prev) => {
      const nextEntries = Object.entries(prev).filter(([id]) => validVariantIds.has(id));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
    setEditingPromptChip((prev) => {
      if (!prev) return prev;
      if (!validVariantIds.has(prev.variantId)) return null;
      return prev;
    });
    setEditingVariantNameId((prev) => (prev && !validVariantIds.has(prev) ? '' : prev));
    setVariantNameDrafts((prev) => {
      const nextEntries = Object.entries(prev).filter(([id]) => validVariantIds.has(id));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
    setEditingVariantTagId((prev) => (prev && !validVariantIds.has(prev) ? '' : prev));
    setVariantTagDrafts((prev) => {
      const nextEntries = Object.entries(prev).filter(([id]) => validVariantIds.has(id));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
  }, [slots]);

  const setVariantSets = useCallback((slotId: string, variantId: string, setIds: number[]) => {
    const normalized = normalizeQueueSetIds(setIds, false);
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      const styleUtilitySlot = isStyleUtilitySlot(slot);
      return {
        ...slot,
        variants: slot.variants.map((variant) => {
          if (variant.id !== variantId) return variant;
          const previousSetIds = normalizeQueueSetIds(variant.queueSetIds, false);
          const addedSetIds = normalized.filter((setId) => !previousSetIds.includes(setId));
          const nextWeights = normalizeQueueCycleWeights((variant as any).queueCycleWeights, normalized);
          if (styleUtilitySlot) {
            for (const setId of addedSetIds) {
              const matchedWeight = slot.variants.reduce((maxWeight, otherVariant) => {
                if (otherVariant.id === variantId) return maxWeight;
                const otherSetIds = normalizeQueueSetIds(otherVariant.queueSetIds, false);
                if (!otherSetIds.includes(setId)) return maxWeight;
                return Math.max(maxWeight, getQueueCycleWeightForSet((otherVariant as any).queueCycleWeights, setId));
              }, 1);
              if (matchedWeight <= 1) delete nextWeights[String(setId)];
              else nextWeights[String(setId)] = matchedWeight;
            }
          }
          return {
            ...variant,
            queueSetIds: [...normalized],
            queueCycleWeights: nextWeights,
            queueEnabled: normalized.length > 0,
            updatedAt: getNowIso(),
          };
        }),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const adjustVariantQueueCycleWeight = useCallback((slotId: string, variantId: string, setIdRaw: number, delta: number) => {
    const setId = clampQueueSetId(setIdRaw);
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId || isStyleUtilitySlot(slot)) return slot;
      return {
        ...slot,
        variants: slot.variants.map((variant) => {
          if (variant.id !== variantId) return variant;
          const queueSetIds = normalizeQueueSetIds(variant.queueSetIds, false);
          if (!queueSetIds.includes(setId)) return variant;
          const currentWeight = getQueueCycleWeightForSet((variant as any).queueCycleWeights, setId);
          const nextWeight = Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, currentWeight + delta));
          const queueCycleWeights = normalizeQueueCycleWeights((variant as any).queueCycleWeights, queueSetIds);
          if (nextWeight <= 1) delete queueCycleWeights[String(setId)];
          else queueCycleWeights[String(setId)] = nextWeight;
          return {
            ...variant,
            queueCycleWeights,
            updatedAt: getNowIso(),
          };
        }),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const cycleSlotQueueTraversalRole = useCallback((slotId: string) => {
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      const nextRole = getNextQueueTraversalRole(getSlotQueueTraversalRole(slot));
      return {
        ...slot,
        variants: slot.variants.map((variant) => ({
          ...variant,
          queueTraversalRole: nextRole,
          updatedAt: getNowIso(),
        })),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const applySlotNameRandom = useCallback((
    slotId: string,
    setIdRaw: number,
    selectedNamesRaw: string[],
    maxVariantsRaw: number
  ) => {
    const targetSetId = clampQueueSetId(setIdRaw);
    const selectedNames = normalizeVariantNameList(selectedNamesRaw);
    const selectedKeys = new Set(selectedNames.map((name) => name.toLowerCase()));
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      const prepared = slot.variants.map((variant) => {
        const existingSetIds = normalizeQueueSetIds(variant.queueSetIds, false);
        const keptSetIds = existingSetIds.filter((setId) => setId !== targetSetId);
        return {
          ...variant,
          queueSetIds: keptSetIds,
          queueEnabled: keptSetIds.length > 0,
          updatedAt: getNowIso(),
        };
      });
      if (prepared.length === 0) {
        return slot;
      }
      const nonEmptyIndices = prepared
        .map((variant, idx) => ({ idx, text: String(variant.text || '').trim() }))
        .filter((entry) => entry.text.length > 0)
        .map((entry) => entry.idx);
      const nameFilteredIndices = nonEmptyIndices.filter((idx) => {
        if (selectedKeys.size === 0) return true;
        const variant = prepared[idx];
        const variantNameKey = normalizeVariantName(variant.variantName).toLowerCase();
        if (!variantNameKey) return false;
        return selectedKeys.has(variantNameKey);
      });
      const sourcePool = nameFilteredIndices.length > 0
        ? nameFilteredIndices
        : (nonEmptyIndices.length > 0 ? nonEmptyIndices : prepared.map((_, idx) => idx));
      const maxSelectable = Math.max(1, Math.min(sourcePool.length, Math.floor(Number(maxVariantsRaw) || 1)));
      const targetCount = maxSelectable;
      const shuffled = [...sourcePool];
      for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
        const swapIdx = Math.floor(Math.random() * (idx + 1));
        const current = shuffled[idx];
        shuffled[idx] = shuffled[swapIdx];
        shuffled[swapIdx] = current;
      }
      const picked = new Set(shuffled.slice(0, targetCount));
      const randomSetIds = [targetSetId];
      return {
        ...slot,
        variants: prepared.map((variant, idx) => {
          const mergedSetIds = picked.has(idx)
            ? Array.from(new Set([...variant.queueSetIds, targetSetId])).sort((a, b) => a - b)
            : [...variant.queueSetIds];
          return {
            ...variant,
            queueSetIds: mergedSetIds,
            queueEnabled: mergedSetIds.length > 0,
            randomEnabled: true,
            randomSetIds,
            updatedAt: getNowIso(),
          };
        }),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const clearSlotVariantSets = useCallback((slotId: string, targetSetIdRaw?: number) => {
    const targetSetId = Number.isFinite(Number(targetSetIdRaw))
      ? clampQueueSetId(Number(targetSetIdRaw))
      : null;
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      if (isStyleUtilitySlot(slot)) return slot;
      return {
        ...slot,
        variants: slot.variants.map((variant) => {
          const existingSetIds = normalizeQueueSetIds(variant.queueSetIds, false);
          const nextSetIds = targetSetId === null
            ? []
            : existingSetIds.filter((setId) => setId !== targetSetId);
          const nextRandomSetIds = targetSetId === null
            ? []
            : normalizeRandomSetIds(variant.randomSetIds).filter((setId) => setId !== targetSetId);
          return {
            ...variant,
            randomEnabled: nextRandomSetIds.length > 0,
            randomSetIds: nextRandomSetIds,
            queueSetIds: nextSetIds,
            queueEnabled: nextSetIds.length > 0,
            updatedAt: getNowIso(),
          };
        }),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const disableSlotRandom = useCallback((slotId: string) => {
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      return {
        ...slot,
        variants: slot.variants.map((variant) => ({
          ...variant,
          randomEnabled: false,
          randomSetIds: [],
          updatedAt: getNowIso(),
        })),
      };
    });
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const addVariant = useCallback((slotId: string) => {
    const next = cloneSlots(slots);
    const slot = next.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    const slotSetIds = getSlotQueueSetIds(slot);
    const slotRandomSetIds = getSlotRandomSetIds(slot);
    const createdSetIds = slotSetIds.length > 0 ? slotSetIds : [activeQueueSet];
    const created = {
      ...createCard(
        slot.type,
        slot.label,
        slot.slotId,
        0,
        createdSetIds[0],
        isSlotRandomEnabled(slot),
        slotRandomSetIds
      ),
      queueSetIds: createdSetIds,
      queueEnabled: createdSetIds.length > 0,
      queueTraversalRole: getSlotQueueTraversalRole(slot),
    };
    slot.variants = [created, ...slot.variants].map((variant, idx) => ({ ...variant, order: idx }));
    setActiveSlotId(slot.slotId);
    setActiveVariantId(created.id);
    emitSlots(next);
  }, [activeQueueSet, slots, emitSlots]);

  const shuffleSlotVariants = useCallback((slotId: string) => {
    const next = cloneSlots(slots);
    const slot = next.find((entry) => entry.slotId === slotId);
    if (!slot || slot.variants.length <= 1) return;
    slot.variants = shuffleItemsRandomly(slot.variants)
      .map((variant, idx) => ({
        ...variant,
        order: idx,
        updatedAt: getNowIso(),
      }));
    emitSlotsPreserveLaneScroll(next);
  }, [slots, emitSlotsPreserveLaneScroll]);

  const removeVariant = useCallback((slotId: string, variantId: string) => {
    const next = cloneSlots(slots);
    const slot = next.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    if (slot.variants.length <= 1) {
      showToast('Each card needs at least one variant', 'error');
      return;
    }
    const targetVariant = slot.variants.find((variant) => variant.id === variantId);
    const outgoingLinkCount = targetVariant
      ? normalizeChainLinks((targetVariant as any).chainLinks, targetVariant.id).length
      : 0;
    const outgoingBlockCount = targetVariant
      ? normalizeBlockLinks((targetVariant as any).blockLinks, targetVariant.id).length
      : 0;
    const incomingLinkCount = next.reduce((count, cleanupSlot) => (
      count + cleanupSlot.variants.reduce((variantCount, variant) => {
        if (variant.id === variantId) return variantCount;
        return normalizeChainLinks((variant as any).chainLinks, variant.id).includes(variantId)
          ? variantCount + 1
          : variantCount;
      }, 0)
    ), 0);
    const incomingBlockCount = next.reduce((count, cleanupSlot) => (
      count + cleanupSlot.variants.reduce((variantCount, variant) => {
        if (variant.id === variantId) return variantCount;
        return normalizeBlockLinks((variant as any).blockLinks, variant.id).includes(variantId)
          ? variantCount + 1
          : variantCount;
      }, 0)
    ), 0);
    if (outgoingLinkCount > 0 || incomingLinkCount > 0 || outgoingBlockCount > 0 || incomingBlockCount > 0) {
      const outgoingLabel = `${outgoingLinkCount} outgoing Chain Link${outgoingLinkCount === 1 ? '' : 's'}`;
      const incomingLabel = `${incomingLinkCount} incoming Chain Link${incomingLinkCount === 1 ? '' : 's'}`;
      const outgoingBlockLabel = `${outgoingBlockCount} outgoing Block${outgoingBlockCount === 1 ? '' : 's'}`;
      const incomingBlockLabel = `${incomingBlockCount} incoming Block${incomingBlockCount === 1 ? '' : 's'}`;
      const confirmed = window.confirm(
        `This variant has ${outgoingLabel}, ${incomingLabel}, ${outgoingBlockLabel}, and ${incomingBlockLabel}.\n\nDeleting it will remove those relationships. Continue?`
      );
      if (!confirmed) return;
    }
    slot.variants = slot.variants.filter((variant) => variant.id !== variantId).map((variant, idx) => ({ ...variant, order: idx }));
    for (const cleanupSlot of next) {
      cleanupSlot.variants = cleanupSlot.variants.map((variant) => ({
        ...variant,
        chainLinks: normalizeChainLinks((variant as any).chainLinks, variant.id).filter((linkedId) => linkedId !== variantId),
        blockLinks: normalizeBlockLinks((variant as any).blockLinks, variant.id).filter((blockedId) => blockedId !== variantId),
      }));
    }
    setChainLinkEditor((prev) => {
      if (!prev) return prev;
      if (prev.anchorVariantId === variantId) return null;
      return {
        ...prev,
        draftVariantIds: prev.draftVariantIds.filter((linkedId) => linkedId !== variantId),
        savedVariantIds: prev.savedVariantIds.filter((linkedId) => linkedId !== variantId),
      };
    });
    emitSlots(next);
  }, [slots, emitSlots, showToast]);

  const addSlot = useCallback(() => {
    const next = cloneSlots(slots);
    const used = new Set(next.map((slot) => slot.label.toLowerCase()));
    let idx = 1;
    let label = `Card ${idx}`;
    while (used.has(label.toLowerCase())) { idx += 1; label = `Card ${idx}`; }
    const slotId = createSlotId('custom', label);
    const groupKey = getSlotGroupKeyForTypeLabel('custom', label);
    const nextDeletedGroups = { ...deletedCardGroups };
    const backup = nextDeletedGroups[groupKey];
    const restoredVariants = backup && Array.isArray(backup.cards) && backup.cards.length > 0
      ? sortCards(backup.cards).map((card, cardIdx) => {
        const queueSetIds = normalizeCardQueueSetIds(card, activeQueueSet);
        return {
            ...card,
            id: String(card.id || createId('custom')),
            slotId,
            type: 'custom' as const,
            label,
            variantName: normalizeVariantName(card.variantName),
            variantTags: normalizeVariantTags((card as any).variantTags),
            skipVariant: (card as any).skipVariant === true,
            text: String(card.text || ''),
          randomEnabled: card.randomEnabled === true,
          randomSetIds: normalizeRandomSetIds(card.randomSetIds),
          queueEnabled: queueSetIds.length > 0,
          queueSetIds,
          chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
          blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
          order: cardIdx,
          createdAt: String(card.createdAt || getNowIso()),
          updatedAt: String(card.updatedAt || getNowIso()),
        } as PowerPrompterCardNode;
      })
      : [];
    if (backup) {
      delete nextDeletedGroups[groupKey];
    }
    const created = createCard('custom', label, slotId, 0, activeQueueSet, false);
    next.push({
      slotId,
      type: 'custom',
      label,
      variants: restoredVariants.length > 0 ? restoredVariants : [created],
    });
    setActiveSlotId(slotId);
    setActiveVariantId((restoredVariants[0] || created).id);
    emitSlots(next, activeQueueSet, nextDeletedGroups);
  }, [slots, activeQueueSet, deletedCardGroups, emitSlots]);

  const removeSlot = useCallback((slotId: string) => {
    if (slots.length <= 1) {
      showToast('Keep at least one card in the chain', 'error');
      return;
    }
    const nextSlots = cloneSlots(slots);
    const slot = nextSlots.find((entry) => entry.slotId === slotId);
    const filtered = nextSlots.filter((entry) => entry.slotId !== slotId);
    const nextDeletedGroups = { ...deletedCardGroups };
    if (slot) {
      const groupKey = getSlotGroupKey(slot);
      nextDeletedGroups[groupKey] = {
        key: groupKey,
        type: slot.type,
        label: String(slot.label || '').trim() || cardTypeLabel(slot.type),
        deletedAt: getNowIso(),
        cards: sortCards(slot.variants).map((variant, idx) => ({
          ...variant,
          slotId: '',
          type: slot.type,
          label: String(slot.label || '').trim() || cardTypeLabel(slot.type),
          variantName: normalizeVariantName(variant.variantName),
          variantTags: normalizeVariantTags((variant as any).variantTags),
          skipVariant: (variant as any).skipVariant === true,
          text: String(variant.text || ''),
          order: idx,
          createdAt: String(variant.createdAt || getNowIso()),
          updatedAt: String(variant.updatedAt || getNowIso()),
        })),
      };
    }
    emitSlots(filtered, activeQueueSet, nextDeletedGroups);
  }, [slots, activeQueueSet, deletedCardGroups, emitSlots, showToast]);

  const requestRemoveSlot = useCallback((slotId: string) => {
    const slot = slots.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    if (slots.length <= 1) {
      showToast('Keep at least one card in the chain', 'error');
      return;
    }
    setPendingSlotDelete({
      slotId,
      label: String(slot.label || '').trim() || cardTypeLabel(slot.type),
      variants: slot.variants.length,
    });
  }, [slots, showToast]);

  const confirmRemoveSlot = useCallback(() => {
    if (!pendingSlotDelete) return;
    removeSlot(pendingSlotDelete.slotId);
    setPendingSlotDelete(null);
    setCardMenu(null);
  }, [pendingSlotDelete, removeSlot]);

  const updateSlotLabel = useCallback((slotId: string, rawLabel: string) => {
    const targetSlot = slots.find((slot) => slot.slotId === slotId);
    if (targetSlot && !isStyleUtilitySlot(targetSlot) && isReservedStyleLabel(rawLabel)) {
      showToast('Style is reserved for the utility card', 'error');
      return;
    }
    const nextDeletedGroups = { ...deletedCardGroups };
    const next = cloneSlots(slots).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      const label = String(rawLabel || '').replace(/\s+/g, ' ').slice(0, 80);
      const groupKey = getSlotGroupKeyForTypeLabel(slot.type, label);
      const backup = nextDeletedGroups[groupKey];
      const isPlaceholder = slot.variants.length === 1
        && String(slot.variants[0]?.text || '').trim().length === 0
        && normalizeVariantName(slot.variants[0]?.variantName).length === 0;
      if (backup && isPlaceholder) {
        delete nextDeletedGroups[groupKey];
        const restored = sortCards(backup.cards).map((variant, idx) => ({
          ...variant,
          slotId: slot.slotId,
          type: slot.type,
          label,
          variantName: normalizeVariantName(variant.variantName),
          variantTags: normalizeVariantTags((variant as any).variantTags),
          skipVariant: (variant as any).skipVariant === true,
          text: String(variant.text || ''),
          order: idx,
          updatedAt: getNowIso(),
        }));
        return { ...slot, label, variants: restored };
      }
      return {
        ...slot,
        label,
        variants: slot.variants.map((variant) => ({
          ...variant,
          label,
          variantName: normalizeVariantName(variant.variantName),
          variantTags: normalizeVariantTags((variant as any).variantTags),
          skipVariant: (variant as any).skipVariant === true,
          updatedAt: getNowIso(),
        })),
      };
    });
    emitSlots(next, activeQueueSet, nextDeletedGroups);
  }, [slots, activeQueueSet, deletedCardGroups, emitSlots, showToast]);

  const openCardLabelModal = useCallback((slotId: string) => {
    const slot = slots.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    variantDragRef.current = null;
    suppressedVariantDragIdRef.current = '';
    setVariantDropSlotId(null);
    setSlotChipDragId('');
    setSlotChipDropId('');
    setCardRandomMenu(null);
    setCardLabelModal({
      slotId,
      draftLabel: String(slot.label || '').trim() || cardTypeLabel(slot.type),
    });
    setCardMenu(null);
  }, [slots]);

  const openCardRandomMenu = useCallback((
    slotId: string,
    rawX: number,
    rawY: number,
    options?: { preferAbove?: boolean }
  ) => {
    const slot = slots.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    const x = Number.isFinite(rawX) ? Math.max(0, Math.floor(rawX)) : 0;
    const y = Number.isFinite(rawY) ? Math.max(0, Math.floor(rawY)) : 0;
    const nonEmptyCount = slot.variants.filter((entry) => String(entry.text || '').trim().length > 0).length;
    const defaultMaxVariants = Math.max(1, nonEmptyCount || slot.variants.length || 1);
    setCardMenu(null);
    setCardRandomMenu((prev) => (
      prev && prev.slotId === slotId
        ? null
        : {
          slotId,
          x,
          y,
          preferAbove: options?.preferAbove === true,
          selectedNames: [],
          nameQuery: '',
          maxVariants: defaultMaxVariants,
          targetSetId: activeQueueSet,
        }
    ));
  }, [slots, activeQueueSet]);

  const openCardContextMenu = useCallback((slotId: string, rawX: number, rawY: number, preferAbove = false) => {
    const x = Number.isFinite(rawX) ? Math.max(0, Math.floor(rawX)) : 0;
    const y = Number.isFinite(rawY) ? Math.max(0, Math.floor(rawY)) : 0;
    setCardRandomMenu(null);
    setCardMenu({ slotId, x, y, preferAbove });
  }, []);

  const commitCardLabelModal = useCallback(() => {
    if (!cardLabelModal) return;
    const nextLabel = String(cardLabelModal.draftLabel || '').replace(/\s+/g, ' ').trim();
    if (!nextLabel) {
      showToast('Enter a card name first', 'error');
      return;
    }
    const targetSlot = slots.find((slot) => slot.slotId === cardLabelModal.slotId);
    if (targetSlot && !isStyleUtilitySlot(targetSlot) && isReservedStyleLabel(nextLabel)) {
      showToast('Style is reserved for the utility card', 'error');
      return;
    }
    updateSlotLabel(cardLabelModal.slotId, nextLabel);
    setCardLabelModal(null);
  }, [cardLabelModal, slots, showToast, updateSlotLabel]);

  const moveSlot = useCallback((slotId: string, rawIndex: number) => {
    const next = cloneSlots(slots);
    const from = next.findIndex((slot) => slot.slotId === slotId);
    if (from < 0) return;
    const [moved] = next.splice(from, 1);
    const target = Math.max(0, Math.min(next.length, rawIndex));
    next.splice(target, 0, moved);
    emitSlots(next);
  }, [slots, emitSlots]);

  const moveSlotByDelta = useCallback((slotId: string, delta: number) => {
    const currentIndex = slots.findIndex((slot) => slot.slotId === slotId);
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(slots.length - 1, currentIndex + Math.floor(delta)));
    if (targetIndex === currentIndex) return;
    moveSlot(slotId, targetIndex);
  }, [slots, moveSlot]);

  const moveSlotByChipDrag = useCallback((dragSlotId: string, dropSlotId: string) => {
    const fromIndex = slots.findIndex((slot) => slot.slotId === dragSlotId);
    const dropIndex = slots.findIndex((slot) => slot.slotId === dropSlotId);
    if (fromIndex < 0 || dropIndex < 0 || fromIndex === dropIndex) return;
    const targetIndex = fromIndex < dropIndex ? Math.max(0, dropIndex - 1) : dropIndex;
    moveSlot(dragSlotId, targetIndex);
  }, [slots, moveSlot]);

  const moveVariantWithinSlot = useCallback((slotId: string, variantId: string, rawIndex: number) => {
    if (!slotId) return;
    const next = cloneSlots(slots);
    const slot = next.find((entry) => entry.slotId === slotId);
    if (!slot || slot.variants.length <= 1) return;
    const fromIndex = slot.variants.findIndex((variant) => variant.id === variantId);
    if (fromIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(slot.variants.length - 1, Math.floor(rawIndex)));
    if (fromIndex === targetIndex) return;

    const list = [...slot.variants];
    const [moving] = list.splice(fromIndex, 1);
    list.splice(targetIndex, 0, { ...moving, updatedAt: getNowIso() });
    slot.variants = list.map((variant, idx) => ({ ...variant, order: idx }));

    setActiveSlotId(slot.slotId);
    setActiveVariantId(moving.id);
    emitSlots(next);
  }, [slots, emitSlots]);

  const moveVariantToSlot = useCallback((sourceSlotId: string, variantId: string, targetSlotId: string, rawTargetIndex?: number) => {
    if (!sourceSlotId || !targetSlotId) return;
    if (sourceSlotId === targetSlotId) {
      if (Number.isFinite(rawTargetIndex)) {
        moveVariantWithinSlot(sourceSlotId, variantId, Number(rawTargetIndex));
      }
      return;
    }
    const next = cloneSlots(slots);
    const sourceSlot = next.find((slot) => slot.slotId === sourceSlotId);
    const targetSlot = next.find((slot) => slot.slotId === targetSlotId);
    if (!sourceSlot || !targetSlot) return;

    const sourceIndex = sourceSlot.variants.findIndex((variant) => variant.id === variantId);
    if (sourceIndex < 0) return;

    const moving = sourceSlot.variants[sourceIndex];
    const sourceRandomEnabled = isSlotRandomEnabled(sourceSlot);
    const targetRandomEnabled = isSlotRandomEnabled(targetSlot);
    const sourceRandomSetIds = getSlotRandomSetIds(sourceSlot);
    const targetRandomSetIds = getSlotRandomSetIds(targetSlot);
    const sourceSlotSetIds = getSlotQueueSetIds(sourceSlot);
    const targetSlotSetIds = getSlotQueueSetIds(targetSlot);
    const movingSetIds = normalizeQueueSetIds(moving.queueSetIds, false);
    const movedSetIds = movingSetIds.length > 0
      ? movingSetIds
      : (targetSlotSetIds.length > 0 ? targetSlotSetIds : [activeQueueSet]);
    const remaining = sourceSlot.variants.filter((variant) => variant.id !== variantId);
    if (remaining.length === 0) {
      const placeholder = createCard(
        sourceSlot.type,
        sourceSlot.label,
        sourceSlot.slotId,
        0,
        sourceSlotSetIds[0] || 1,
        sourceRandomEnabled,
        sourceRandomSetIds
      );
      placeholder.queueSetIds = [...sourceSlotSetIds];
      placeholder.queueEnabled = placeholder.queueSetIds.length > 0;
      sourceSlot.variants = [placeholder];
    } else {
      sourceSlot.variants = remaining;
    }
    sourceSlot.variants = sourceSlot.variants.map((variant, idx) => ({ ...variant, order: idx }));

    const movedVariant: PowerPrompterCardNode = {
      ...moving,
      slotId: targetSlot.slotId,
      type: targetSlot.type,
      label: targetSlot.label,
      randomEnabled: targetRandomEnabled,
      randomSetIds: targetRandomSetIds,
      queueSetIds: [...movedSetIds],
      queueEnabled: movedSetIds.length > 0,
      updatedAt: getNowIso(),
      order: targetSlot.variants.length,
    };
    const targetIndex = Number.isFinite(rawTargetIndex)
      ? Math.max(0, Math.min(targetSlot.variants.length, Math.floor(Number(rawTargetIndex))))
      : targetSlot.variants.length;
    const targetVariants = [...targetSlot.variants];
    targetVariants.splice(targetIndex, 0, movedVariant);
    targetSlot.variants = targetVariants.map((variant, idx) => ({
      ...variant,
      randomEnabled: targetRandomEnabled,
      randomSetIds: targetRandomSetIds,
      order: idx,
    }));

    setActiveSlotId(targetSlot.slotId);
    setActiveVariantId(movedVariant.id);
    emitSlots(next);
  }, [activeQueueSet, slots, emitSlots, moveVariantWithinSlot]);

  useEffect(() => () => { clearTokenRevealTimer(); }, [clearTokenRevealTimer]);
  useEffect(() => () => { clearLoraBrowserInfoClickTimer(); }, [clearLoraBrowserInfoClickTimer]);
  useEffect(() => () => { clearModelBrowserInfoClickTimer(); }, [clearModelBrowserInfoClickTimer]);

  const emitGalleryOutputSync = useCallback((
    folderPaths: string[],
    source = 'powerprompter',
    reason = 'generation',
  ) => {
    if (typeof window === 'undefined') return;
    const normalizedPaths = Array.from(new Set(
      (folderPaths || [])
        .map((entry) => normalizeLoraCatalogPath(String(entry || '')))
        .filter(Boolean),
    )).slice(0, 48);

    window.dispatchEvent(new CustomEvent('umbra:gallery-generation-complete', {
      detail: {
        source,
        folderPaths: normalizedPaths,
      },
    }));

    for (const folderPath of normalizedPaths) {
      window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
        detail: {
          path: folderPath,
          folderPath,
          source,
          reason,
        },
      }));
    }
  }, []);

  const collectOutputPreviewFolderPaths = useCallback((items: OutputPreviewItem[]): string[] => {
    const folderPaths: string[] = [];
    const seen = new Set<string>();
    for (const item of items || []) {
      const parent = normalizeLoraCatalogPath(getParentFolderPath(String(item?.path || '')));
      if (!parent || seen.has(parent)) continue;
      seen.add(parent);
      folderPaths.push(parent);
      if (folderPaths.length >= 48) break;
    }
    return folderPaths;
  }, []);

  const emitGalleryRefreshPulse = useCallback(async (
    source = 'powerprompter-recent-output',
    previewItems: OutputPreviewItem[] = [],
  ) => {
    let folderPaths = collectOutputPreviewFolderPaths(previewItems);
    if (folderPaths.length <= 0) {
      const roots = await resolveOutputPreviewRoots().catch(() => [] as string[]);
      folderPaths = roots
        .map((entry) => normalizeLoraCatalogPath(String(entry || '')))
        .filter(Boolean)
        .slice(0, 48);
    }
    emitGalleryOutputSync(folderPaths, source, 'generation');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
        detail: {
          source,
          reason: 'generation',
        },
      }));
    }
  }, [collectOutputPreviewFolderPaths, emitGalleryOutputSync]);

  const refreshOutputPreview = useCallback(async (options?: { silent?: boolean; notifyOnError?: boolean; emitGallerySidebarRefresh?: boolean }) => {
    const silent = options?.silent === true;
    const notifyOnError = options?.notifyOnError === true;
    const emitGallerySidebarRefresh = options?.emitGallerySidebarRefresh === true;
    if (!outputPreviewActive) return;
    if (silent && typeof window !== 'undefined' && window.document.visibilityState !== 'visible') {
      return;
    }
    const seq = ++outputPreviewLoadSeqRef.current;

    if (!silent) setIsLoadingOutputPreview(true);
    try {
      if (!String(path || '').trim()) {
        if (seq !== outputPreviewLoadSeqRef.current) return;
        directOutputPreviewItemsRef.current = new Map();
        outputPreviewItemsRef.current = [];
        setOutputPreviewItems((prev) => (prev.length === 0 ? prev : []));
        setOutputPreviewError(null);
        return;
      }
      const images = await fetchPowerPrompterOutputPreviewItems(String(path || '').trim(), OUTPUT_PREVIEW_SNAPSHOT_LIMIT);
      if (seq !== outputPreviewLoadSeqRef.current) return;
      const outputRoots = await resolveOutputPreviewRoots().catch(() => [...OUTPUT_PREVIEW_DEFAULT_ROOTS]);
      const mergedMap = mergeOutputPreviewItemMaps(
        filterOutputPreviewItemMapToRoots(directOutputPreviewItemsRef.current, outputRoots),
        images.slice(0, OUTPUT_PREVIEW_SNAPSHOT_LIMIT),
        OUTPUT_PREVIEW_SNAPSHOT_LIMIT,
      );
      directOutputPreviewItemsRef.current = mergedMap;
      const nextItems = Array.from(mergedMap.values());
      outputPreviewItemsRef.current = nextItems;
      setOutputPreviewItems((prev) => (areOutputPreviewItemsSame(prev, nextItems) ? prev : nextItems));
      setOutputPreviewError(null);
      if (emitGallerySidebarRefresh) {
        await emitGalleryRefreshPulse('powerprompter-recent-output', nextItems);
      }
    } catch (error: any) {
      if (seq !== outputPreviewLoadSeqRef.current) return;
      const message = String(error?.message || 'Failed to load output preview');
      setOutputPreviewError(message);
      if (notifyOnError) showToast(message, 'error');
    } finally {
      if (seq === outputPreviewLoadSeqRef.current) setIsLoadingOutputPreview(false);
    }
  }, [emitGalleryRefreshPulse, outputPreviewActive, path, showToast]);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      if (expandedVariantEditor) {
        applyDraftTokenToExpandedVariantEditor(text, { appendComma: true });
        return;
      }
      if (!activeSlot || !activeVariant) return;
      applyDraftTokenToVariant(activeSlot.slotId, activeVariant, text, {
        appendComma: true,
        preferExpanded: false,
      });
    },
    refreshOutputPreview: () => {
      void refreshOutputPreview({ notifyOnError: true, emitGallerySidebarRefresh: true });
    },
  }), [activeSlot, activeVariant, applyDraftTokenToExpandedVariantEditor, applyDraftTokenToVariant, expandedVariantEditor, refreshOutputPreview]);

  useEffect(() => {
    onOutputPreviewSnapshotChange?.({
      items: outputPreviewItems,
      isLoading: isLoadingOutputPreview,
      error: outputPreviewError,
    });
  }, [isLoadingOutputPreview, onOutputPreviewSnapshotChange, outputPreviewError, outputPreviewItems]);

  useEffect(() => {
    outputPreviewItemsRef.current = outputPreviewItems;
  }, [outputPreviewItems]);

  useEffect(() => {
    if (!outputPreviewActive) return;
    outputPreviewLoadSeqRef.current += 1;
    setOutputPreviewError(null);
    if (!String(path || '').trim()) {
      directOutputPreviewItemsRef.current = new Map();
      outputPreviewItemsRef.current = [];
      setOutputPreviewItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (typeof window === 'undefined') {
      void refreshOutputPreview();
      return;
    }

    let disposed = false;
    let hasRun = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const domDocument = typeof window !== 'undefined' ? window.document : null;

    const runRefresh = () => {
      if (disposed || hasRun) return;
      if (domDocument && domDocument.visibilityState !== 'visible') return;
      hasRun = true;
      void refreshOutputPreview();
    };

    const onVisibilityChange = () => {
      if (domDocument && domDocument.visibilityState === 'visible') {
        runRefresh();
      }
    };

    if (domDocument) {
      domDocument.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof (window as any).requestIdleCallback === 'function') {
      idleId = (window as any).requestIdleCallback(runRefresh, { timeout: 800 });
    } else {
      timeoutId = window.setTimeout(runRefresh, 220);
    }

    return () => {
      disposed = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(idleId);
      }
      if (domDocument) {
        domDocument.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [outputPreviewActive, path, refreshOutputPreview]);

  useEffect(() => {
    directOutputPreviewItemsRef.current = new Map();
  }, [path]);

  useEffect(() => {
    if (!outputPreviewActive) return;
    if (!String(path || '').trim()) return;
    const domDocument = typeof window !== 'undefined' ? window.document : null;
    const tick = () => {
      if (domDocument && domDocument.visibilityState !== 'visible') return;
      void refreshOutputPreview({ silent: true });
    };
    const timer = setInterval(tick, OUTPUT_PREVIEW_REFRESH_MS);
    const onVisibilityChange = () => {
      if (domDocument && domDocument.visibilityState === 'visible') {
        void refreshOutputPreview({ silent: true });
      }
    };
    if (domDocument) {
      domDocument.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      clearInterval(timer);
      if (domDocument) {
        domDocument.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [outputPreviewActive, path, refreshOutputPreview]);

  useEffect(() => {
    if (!queueCompletionTick) return;
    if (!outputPreviewActive) return;
    if (!String(path || '').trim()) return;
    if (outputPreviewCompletionRefreshTimerRef.current) {
      clearTimeout(outputPreviewCompletionRefreshTimerRef.current);
      outputPreviewCompletionRefreshTimerRef.current = null;
    }
    outputPreviewCompletionRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    outputPreviewCompletionRetryTimersRef.current.clear();
    outputPreviewCompletionRefreshTimerRef.current = setTimeout(() => {
      outputPreviewCompletionRefreshTimerRef.current = null;
      void emitGalleryRefreshPulse('powerprompter-queue-complete', outputPreviewItemsRef.current);
      void refreshOutputPreview({ silent: true, emitGallerySidebarRefresh: true });
      const retryDelays = [2600, 5600];
      retryDelays.forEach((delay) => {
        const timer = setTimeout(() => {
          outputPreviewCompletionRetryTimersRef.current.delete(timer);
          void refreshOutputPreview({ silent: true, emitGallerySidebarRefresh: false });
        }, delay);
        outputPreviewCompletionRetryTimersRef.current.add(timer);
      });
    }, OUTPUT_PREVIEW_COMPLETION_REFRESH_DEBOUNCE_MS);
  }, [queueCompletionTick, outputPreviewActive, path, emitGalleryRefreshPulse, refreshOutputPreview]);

  useEffect(() => () => {
    if (outputPreviewCompletionRefreshTimerRef.current) {
      clearTimeout(outputPreviewCompletionRefreshTimerRef.current);
      outputPreviewCompletionRefreshTimerRef.current = null;
    }
    outputPreviewCompletionRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
    outputPreviewCompletionRetryTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!outputPreviewActive || typeof window === 'undefined') return;
    const currentSourceKey = normalizeOutputPreviewSourceFileKey(path);
    if (!currentSourceKey) return;
    const handleDirectOutputSaved = (event: Event) => {
      void (async () => {
        const detail = (event as CustomEvent<any>)?.detail;
        const eventSourceKey = normalizeOutputPreviewSourceFileKey(
          detail?.sourceFile ?? detail?.source_file ?? detail?.file ?? ''
        );
        if (!eventSourceKey || eventSourceKey !== currentSourceKey) return;
        const outputs = Array.isArray(detail?.outputs) ? detail.outputs : [];
        const outputRoots = await resolveOutputPreviewRoots().catch(() => [...OUTPUT_PREVIEW_DEFAULT_ROOTS]);
        const directItems = outputs
          .map((entry: unknown) => normalizeDirectOutputPreviewItem(entry as DirectOutputPreviewDescriptor, outputRoots))
          .filter((entry: OutputPreviewItem | null): entry is OutputPreviewItem =>
            Boolean(entry) && isOutputPreviewPathWithinRoots(entry.path, outputRoots)
          );
        if (directItems.length <= 0) return;
        outputPreviewLoadSeqRef.current += 1;
        directOutputPreviewItemsRef.current = mergeOutputPreviewItemMaps(
          directOutputPreviewItemsRef.current,
          directItems,
          OUTPUT_PREVIEW_SNAPSHOT_LIMIT,
        );
        setIsLoadingOutputPreview(false);
        setOutputPreviewError(null);
        const nextItems = Array.from(directOutputPreviewItemsRef.current.values());
        outputPreviewItemsRef.current = nextItems;
        setOutputPreviewItems((prev) => (areOutputPreviewItemsSame(prev, nextItems) ? prev : nextItems));
        void emitGalleryRefreshPulse('powerprompter-output-saved', directItems);
      })();
    };
    window.addEventListener('umbra:powerprompter-output-saved', handleDirectOutputSaved as EventListener);
    return () => {
      window.removeEventListener('umbra:powerprompter-output-saved', handleDirectOutputSaved as EventListener);
    };
  }, [emitGalleryRefreshPulse, outputPreviewActive, path]);

  const queuePreviewPromptTokens = useMemo(
    () => (Array.isArray(queuePreviewPrompts) ? queuePreviewPrompts : [])
      .map((prompt) => tokenizePromptForMatch(String(prompt || ''))),
    [queuePreviewPrompts]
  );
  const queueCyclePreviewPromptTokens = useMemo(
    () => (Array.isArray(queueCyclePreviewPrompts) ? queueCyclePreviewPrompts : [])
      .map((prompt) => tokenizePromptForMatch(String(prompt || ''))),
    [queueCyclePreviewPrompts]
  );
  const effectivePreviewPromptTokens = useMemo(
    () => (queuePreviewPromptTokens.length > 0 ? queuePreviewPromptTokens : queueCyclePreviewPromptTokens),
    [queuePreviewPromptTokens, queueCyclePreviewPromptTokens]
  );
  const hasEffectivePreviewQueue = effectivePreviewPromptTokens.length > 0;

  const activeQueueVariantIds = useMemo(() => {
    const activeVariantIds = new Set<string>();
    if (queueVisualState && Array.isArray(queueVisualState.promptEntries)) {
      const totalEntries = queueVisualState.promptEntries.length;
      const activeIdx = Math.max(0, Math.min(totalEntries - 1, Math.floor(queueVisualState.activeIndex || 0)));
      const activeEntry = queueVisualState.promptEntries[activeIdx];
      const tokens = Array.isArray(activeEntry?.tokens) ? activeEntry.tokens : [];
      for (const token of tokens) {
        const variantId = String(token?.variantId || '').trim();
        if (variantId) activeVariantIds.add(variantId);
      }
    }
    return activeVariantIds;
  }, [queueVisualState]);

  const getQueueVariantState = useCallback((variant: PowerPrompterCardNode): QueueVariantState => {
    if (!queueVisualState || queueVisualState.prompts.length === 0) {
      const previewSetId = Math.max(1, Math.floor(Number(queuePreviewSetId) || 1));
      const setIds = normalizeQueueSetIds(variant.queueSetIds, false);
      const participates = setIds.includes(previewSetId);
      return {
        status: participates ? 'Queue' : 'Disabled',
        position: null,
        cycleCount: participates ? getQueueCycleWeightForSet((variant as any).queueCycleWeights, previewSetId) : 0,
        futureCycleCount: 0,
      };
    }

    const setIds = normalizeQueueSetIds(variant.queueSetIds, false);
    const participates = queueVisualState.mode === 'selected'
      ? setIds.includes(queueVisualState.activeSetId)
      : setIds.length > 0;
    if (!participates) {
      return { status: 'Disabled', position: null, cycleCount: 0 };
    }

    const activeMatch = activeQueueVariantIds.has(variant.id);
    const setId = queueVisualState.mode === 'selected'
      ? clampQueueSetId(queueVisualState.activeSetId)
      : (setIds[0] || activeQueueSet);
    return {
      status: activeMatch ? 'Active' : 'Queue',
      position: null,
      cycleCount: getQueueCycleWeightForSet((variant as any).queueCycleWeights, setId),
      futureCycleCount: 0,
    };
  }, [activeQueueSet, activeQueueVariantIds, queuePreviewSetId, queueVisualState]);

  const expandedVariantEditorTarget = useMemo(
    () => resolveExpandedVariantEditorTarget(expandedVariantEditor, slots),
    [expandedVariantEditor, slots]
  );
  const enabledCsvSourceIds = useMemo(() => normalizeCsvSourceIds(enabledCSVs), [enabledCSVs]);
  const effectiveExpandedVariantCsvSourceIds = useMemo(() => {
    const allowed = new Set(enabledCsvSourceIds);
    return normalizeCsvSourceIds(expandedVariantCsvSourceIds).filter((sourceId) => allowed.has(sourceId));
  }, [enabledCsvSourceIds, expandedVariantCsvSourceIds]);
  const expandedVariantEditorDraft = String(expandedVariantEditor?.draft || '');
  useEffect(() => {
    if (!expandedVariantEditor) return;
    setExpandedVariantCsvSourceIds((prev) => {
      const allowed = new Set(enabledCsvSourceIds);
      const next = normalizeCsvSourceIds(prev).filter((sourceId) => allowed.has(sourceId));
      if (next.length === prev.length && next.every((sourceId, index) => sourceId === prev[index])) return prev;
      return next;
    });
  }, [enabledCsvSourceIds, expandedVariantEditor]);
  useEffect(() => {
    if (!expandedVariantEditor) {
      setExpandedVariantSuggestions([]);
      setExpandedVariantSuggestionOpen(false);
      setExpandedVariantSuggestionIndex(0);
      setExpandedVariantSuggestionLoading(false);
      if (expandedVariantSuggestionAbortRef.current) {
        expandedVariantSuggestionAbortRef.current.abort();
        expandedVariantSuggestionAbortRef.current = null;
      }
      return;
    }
    const query = getExpandedVariantSuggestionQuery(expandedVariantEditorDraft, expandedVariantEditorCaret.start);
    if (!query) {
      setExpandedVariantSuggestions([]);
      setExpandedVariantSuggestionOpen(false);
      setExpandedVariantSuggestionIndex(0);
      setExpandedVariantSuggestionLoading(false);
      if (expandedVariantSuggestionAbortRef.current) {
        expandedVariantSuggestionAbortRef.current.abort();
        expandedVariantSuggestionAbortRef.current = null;
      }
      return;
    }
    if (effectiveExpandedVariantCsvSourceIds.length === 0) {
      setExpandedVariantSuggestions([]);
      setExpandedVariantSuggestionOpen(false);
      setExpandedVariantSuggestionIndex(0);
      setExpandedVariantSuggestionLoading(false);
      if (expandedVariantSuggestionAbortRef.current) {
        expandedVariantSuggestionAbortRef.current.abort();
        expandedVariantSuggestionAbortRef.current = null;
      }
      return;
    }

    let disposed = false;
    const seq = ++expandedVariantSuggestionSeqRef.current;
    const timeoutId = window.setTimeout(async () => {
      if (expandedVariantSuggestionAbortRef.current) {
        expandedVariantSuggestionAbortRef.current.abort();
      }
      const controller = new AbortController();
      expandedVariantSuggestionAbortRef.current = controller;
      setExpandedVariantSuggestionLoading(true);
      try {
        const csvQuery = effectiveExpandedVariantCsvSourceIds.join(',');
        const response = await fetch(
          `/api/powerprompter/search?q=${encodeURIComponent(query)}&limit=200&fast=1&csvs=${encodeURIComponent(csvQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`Failed to load suggestions (${response.status})`);
        const payload = await response.json();
        if (disposed || seq !== expandedVariantSuggestionSeqRef.current) return;
        const rawResults = Array.isArray(payload?.results) ? payload.results : [];
        const seen = new Set<string>();
        const nextSuggestions = rawResults
          .map((entry: any) => ({
            tag: String(entry?.tag || '').trim(),
            category: Number(entry?.category || 0),
            extra: typeof entry?.extra === 'string' ? entry.extra : undefined,
            source: typeof entry?.source === 'string' ? entry.source : undefined,
            type: entry?.type === 'character' ? 'character' : 'tag',
          }) as ExpandedVariantSuggestionEntry)
          .filter((entry: ExpandedVariantSuggestionEntry) => {
            const key = buildSuggestionInsertionText(entry).toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        setExpandedVariantSuggestions(nextSuggestions);
        setExpandedVariantSuggestionIndex(0);
        setExpandedVariantSuggestionOpen(nextSuggestions.length > 0);
      } catch (error: any) {
        if (error?.name !== 'AbortError' && !disposed && seq === expandedVariantSuggestionSeqRef.current) {
          setExpandedVariantSuggestions([]);
          setExpandedVariantSuggestionOpen(false);
        }
      } finally {
        if (!disposed && seq === expandedVariantSuggestionSeqRef.current) {
          setExpandedVariantSuggestionLoading(false);
        }
      }
    }, 160);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [effectiveExpandedVariantCsvSourceIds, expandedVariantEditor, expandedVariantEditorCaret.start, expandedVariantEditorDraft]);

  const applyExpandedVariantSuggestion = useCallback((entry: ExpandedVariantSuggestionEntry) => {
    const insertionText = buildSuggestionInsertionText(entry);
    if (!insertionText) return;
    applyDraftTokenToExpandedVariantEditor(insertionText, { appendComma: true });
    setExpandedVariantSuggestionOpen(false);
  }, [applyDraftTokenToExpandedVariantEditor]);
  const menuCardSlot = useMemo(() => {
    if (!cardMenu) return null;
    return slots.find((slot) => slot.slotId === cardMenu.slotId) || null;
  }, [cardMenu, slots]);
  const randomMenuSlot = useMemo(() => {
    if (!cardRandomMenu) return null;
    return slots.find((slot) => slot.slotId === cardRandomMenu.slotId) || null;
  }, [cardRandomMenu, slots]);

  const randomMenuAvailableNames = useMemo(() => {
    if (!randomMenuSlot) return [];
    const byKey = new Map<string, string>();
    for (const variant of randomMenuSlot.variants) {
      const name = normalizeVariantName(variant.variantName);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, name);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [randomMenuSlot]);
  const randomMenuSelectedNames = useMemo(
    () => normalizeVariantNameList(cardRandomMenu?.selectedNames || []),
    [cardRandomMenu]
  );
  const randomMenuFilteredNames = useMemo(() => {
    const query = String(cardRandomMenu?.nameQuery || '').trim().toLowerCase();
    if (!query) return randomMenuAvailableNames;
    return randomMenuAvailableNames.filter((name) => name.toLowerCase().includes(query));
  }, [randomMenuAvailableNames, cardRandomMenu]);
  const randomMenuEligibleVariantCount = useMemo(() => {
    if (!randomMenuSlot) return 1;
    const selected = randomMenuSelectedNames;
    const selectedKeys = new Set(selected.map((name) => name.toLowerCase()));
    const nonEmpty = randomMenuSlot.variants.filter((variant) => String(variant.text || '').trim().length > 0);
    if (selectedKeys.size === 0) return Math.max(1, nonEmpty.length || randomMenuSlot.variants.length || 1);
    const named = nonEmpty.filter((variant) => {
      const nameKey = normalizeVariantName(variant.variantName).toLowerCase();
      if (!nameKey) return false;
      return selectedKeys.has(nameKey);
    });
    if (named.length > 0) return Math.max(1, named.length);
    return Math.max(1, nonEmpty.length || randomMenuSlot.variants.length || 1);
  }, [randomMenuSlot, randomMenuSelectedNames]);
  const clampedRandomMenuMaxVariants = useMemo(
    () => Math.max(1, Math.min(randomMenuEligibleVariantCount, Math.floor(cardRandomMenu?.maxVariants || 1))),
    [cardRandomMenu?.maxVariants, randomMenuEligibleVariantCount]
  );
  const loraBrowserMenuFile = useMemo(
    () => (loraBrowserFileMenu ? loraBrowserVisibleFiles.find((entry) => entry.path === loraBrowserFileMenu.path) || null : null),
    [loraBrowserFileMenu, loraBrowserVisibleFiles]
  );
  const loraBrowserMenuFolder = useMemo(
    () => (loraBrowserFolderMenu ? loraBrowserFolders.find((entry) => entry.path === loraBrowserFolderMenu.path) || null : null),
    [loraBrowserFolderMenu, loraBrowserFolders]
  );
  const viewerRect = (() => {
    if (typeof window === 'undefined') {
      return { left: 0, top: 0, right: 1400, bottom: 900 };
    }
    const rect = editorRootRef.current?.getBoundingClientRect();
    if (!rect) {
      return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    }
    return rect;
  })();
  const clampMenuToViewer = (
    rawX: number,
    rawY: number,
    width: number,
    height: number,
    options?: { preferAbove?: boolean; avoidBottomPx?: number }
  ) => {
    const leftBound = viewerRect.left + MENU_VIEWPORT_MARGIN_PX;
    const rightBound = viewerRect.right - MENU_VIEWPORT_MARGIN_PX - width;
    const topBound = viewerRect.top + MENU_VIEWPORT_MARGIN_PX;
    const effectiveAvoidBottomPx = options?.preferAbove ? 0 : (options?.avoidBottomPx || 0);
    const bottomBoundRaw = viewerRect.bottom - MENU_VIEWPORT_MARGIN_PX - effectiveAvoidBottomPx - height;
    const bottomBound = Math.max(topBound, bottomBoundRaw);

    const normalizedX = Number.isFinite(rawX) ? rawX : leftBound;
    const normalizedY = Number.isFinite(rawY) ? rawY : topBound;
    const x = Math.max(leftBound, Math.min(normalizedX, Math.max(leftBound, rightBound)));

    let yCandidate = normalizedY;
    if (options?.preferAbove) {
      yCandidate = normalizedY - height - 6;
      if (yCandidate < topBound) {
        yCandidate = normalizedY;
      }
    }
    const y = Math.max(topBound, Math.min(yCandidate, bottomBound));
    return { left: x, top: y };
  };
  const cardMenuPoint = clampMenuToViewer(
    Number(cardMenu?.x || 0),
    Number(cardMenu?.y || 0),
    CARD_MENU_WIDTH_PX,
    CARD_MENU_HEIGHT_PX,
    {
      preferAbove: cardMenu?.preferAbove === true,
      avoidBottomPx: Math.max(CARD_NAV_BAR_HEIGHT_PX, CARD_MENU_BOTTOM_SAFE_PX),
    }
  );
  const cardMenuLeft = cardMenuPoint.left;
  const cardMenuTop = cardMenuPoint.top;
  const randomMenuPoint = clampMenuToViewer(
    Number(cardRandomMenu?.x || 0),
    Number(cardRandomMenu?.y || 0),
    CARD_RANDOM_MENU_WIDTH_PX,
    CARD_RANDOM_MENU_HEIGHT_PX,
    {
      preferAbove: cardRandomMenu?.preferAbove === true,
      avoidBottomPx: Math.max(CARD_NAV_BAR_HEIGHT_PX, CARD_MENU_BOTTOM_SAFE_PX),
    }
  );
  const randomMenuLeft = randomMenuPoint.left;
  const randomMenuTop = randomMenuPoint.top;
  const loraBrowserFileMenuLeft = Math.max(8, Math.min(loraBrowserFileMenu?.x || 0, (typeof window !== 'undefined' ? window.innerWidth : 1400) - 310));
  const loraBrowserFileMenuTop = Math.max(8, Math.min(loraBrowserFileMenu?.y || 0, (typeof window !== 'undefined' ? window.innerHeight : 900) - 280));
  const loraBrowserFolderMenuLeft = Math.max(8, Math.min(loraBrowserFolderMenu?.x || 0, (typeof window !== 'undefined' ? window.innerWidth : 1400) - 310));
  const loraBrowserFolderMenuTop = Math.max(8, Math.min(loraBrowserFolderMenu?.y || 0, (typeof window !== 'undefined' ? window.innerHeight : 900) - 260));
  const laneHasOverflow = laneMetrics.scrollWidth > laneMetrics.clientWidth + 2;

  useEffect(() => {
    if (!cardRandomMenu || !randomMenuSlot) return;
    const normalizedNames = normalizeVariantNameList(cardRandomMenu.selectedNames);
    const namePool = new Set(randomMenuAvailableNames.map((name) => name.toLowerCase()));
    const nextNames = normalizedNames.filter((name) => namePool.has(name.toLowerCase()));
    const nextMax = Math.max(1, Math.min(randomMenuEligibleVariantCount, Math.floor(cardRandomMenu.maxVariants || 1)));
    const nextSetId = clampQueueSetId(cardRandomMenu.targetSetId);
    const nextQuery = String(cardRandomMenu.nameQuery || '').slice(0, 48);
    const namesChanged = nextNames.length !== normalizedNames.length
      || nextNames.some((name, idx) => name !== normalizedNames[idx]);
    if (!namesChanged && nextMax === cardRandomMenu.maxVariants && nextSetId === cardRandomMenu.targetSetId && nextQuery === String(cardRandomMenu.nameQuery || '')) return;
    setCardRandomMenu((prev) => {
      if (!prev || prev.slotId !== randomMenuSlot.slotId) return prev;
      return {
        ...prev,
        selectedNames: nextNames,
        nameQuery: nextQuery,
        maxVariants: nextMax,
        targetSetId: nextSetId,
      };
    });
  }, [cardRandomMenu, randomMenuSlot, randomMenuAvailableNames, randomMenuEligibleVariantCount]);

  const setLaneMetricsIfChanged = useCallback((next: { clientWidth: number; scrollWidth: number; scrollLeft: number }) => {
    setLaneMetrics((prev) => {
      if (
        Math.abs(prev.clientWidth - next.clientWidth) < 1
        && Math.abs(prev.scrollWidth - next.scrollWidth) < 1
        && Math.abs(prev.scrollLeft - next.scrollLeft) < 1
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const readLaneMetrics = useCallback(() => {
    const lane = laneScrollRef.current;
    if (!lane) return;
    const maxLeft = Math.max(0, lane.scrollWidth - lane.clientWidth);
    const clampedLeft = Math.max(0, Math.min(maxLeft, lane.scrollLeft));
    if (Math.abs(lane.scrollLeft - clampedLeft) > 1) {
      lane.scrollLeft = clampedLeft;
    }
    const bottom = laneBottomScrollRef.current;
    if (bottom && Math.abs(bottom.scrollLeft - clampedLeft) > 1) {
      bottom.scrollLeft = clampedLeft;
    }
    setLaneMetricsIfChanged({
      clientWidth: lane.clientWidth,
      scrollWidth: lane.scrollWidth,
      scrollLeft: clampedLeft,
    });
  }, [setLaneMetricsIfChanged]);

  const scheduleLaneMetricsRead = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (laneMetricsRafRef.current !== null) return;
    laneMetricsRafRef.current = window.requestAnimationFrame(() => {
      laneMetricsRafRef.current = null;
      readLaneMetrics();
    });
  }, [readLaneMetrics]);

  const handleLaneScroll = useCallback(() => {
    const lane = laneScrollRef.current;
    if (!lane) return;
    const left = lane.scrollLeft;
    pendingLaneRestoreLeftRef.current = left;
    const bottom = laneBottomScrollRef.current;
    if (bottom && Math.abs(bottom.scrollLeft - left) > 1) {
      bottom.scrollLeft = left;
    }
    scheduleLaneMetricsRead();
  }, [scheduleLaneMetricsRead]);

  const handleBottomScroll = useCallback(() => {
    const bottom = laneBottomScrollRef.current;
    const lane = laneScrollRef.current;
    if (!bottom || !lane) return;
    pendingLaneRestoreLeftRef.current = bottom.scrollLeft;
    if (Math.abs(lane.scrollLeft - bottom.scrollLeft) > 1) {
      lane.scrollLeft = bottom.scrollLeft;
    }
    scheduleLaneMetricsRead();
  }, [scheduleLaneMetricsRead]);

  const handleLaneWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const lane = laneScrollRef.current;
    if (!lane) return;
    if (event.ctrlKey) return;
    if (!event.shiftKey) return;
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!Number.isFinite(dominantDelta) || Math.abs(dominantDelta) < 0.1) return;
    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? lane.clientWidth : 1;
    const scaledDelta = dominantDelta * deltaUnit * 1.2;
    const maxLeft = Math.max(0, lane.scrollWidth - lane.clientWidth);
    const nextLeft = Math.max(0, Math.min(maxLeft, lane.scrollLeft + scaledDelta));
    if (Math.abs(nextLeft - lane.scrollLeft) < 0.5) return;
    lane.scrollLeft = nextLeft;
    pendingLaneRestoreLeftRef.current = nextLeft;
    const bottom = laneBottomScrollRef.current;
    if (bottom && Math.abs(bottom.scrollLeft - nextLeft) > 1) {
      bottom.scrollLeft = nextLeft;
    }
    scheduleLaneMetricsRead();
    event.preventDefault();
  }, [scheduleLaneMetricsRead]);

  const beginTouchHorizontalPan = useCallback((
    event: React.PointerEvent<HTMLElement>,
    options: { syncLaneBottom?: boolean } = {},
  ) => {
    if (!touchRemoteMode || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
    if (event.button !== 0) return;
    const node = event.currentTarget;
    if (node.scrollWidth <= node.clientWidth + 1) return;
    touchHorizontalPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: node.scrollLeft,
      dragging: false,
      node,
      syncLaneBottom: options.syncLaneBottom === true,
    };
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser already handed the pointer to native scrolling.
    }
  }, [touchRemoteMode]);

  const updateTouchHorizontalPan = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const pan = touchHorizontalPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!pan.dragging) {
      if (absX < 8 || absX < absY * 1.2) return;
      pan.dragging = true;
      suppressTouchPanClickUntilRef.current = Date.now() + 450;
      const active = document.activeElement;
      if (active instanceof HTMLElement && pan.node.contains(active) && active.matches('textarea, input')) {
        active.blur();
      }
    }
    const maxLeft = Math.max(0, pan.node.scrollWidth - pan.node.clientWidth);
    const nextLeft = Math.max(0, Math.min(maxLeft, pan.startScrollLeft - deltaX));
    if (Math.abs(nextLeft - pan.node.scrollLeft) >= 0.5) {
      pan.node.scrollLeft = nextLeft;
      if (pan.syncLaneBottom) {
        pendingLaneRestoreLeftRef.current = nextLeft;
        const bottom = laneBottomScrollRef.current;
        if (bottom && Math.abs(bottom.scrollLeft - nextLeft) > 1) {
          bottom.scrollLeft = nextLeft;
        }
        scheduleLaneMetricsRead();
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }, [scheduleLaneMetricsRead]);

  const finishTouchHorizontalPan = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const pan = touchHorizontalPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    try {
      pan.node.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release failures for already-cancelled pointers.
    }
    if (pan.dragging) {
      suppressTouchPanClickUntilRef.current = Date.now() + 450;
      event.preventDefault();
      event.stopPropagation();
    }
    touchHorizontalPanRef.current = null;
  }, []);

  const suppressTouchHorizontalPanClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (Date.now() > suppressTouchPanClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    readLaneMetrics();
    const lane = laneScrollRef.current;
    const content = laneContentRef.current;
    if (!lane) return;
    const onResize = () => {
      readLaneMetrics();
    };
    window.addEventListener('resize', onResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        readLaneMetrics();
      });
      resizeObserver.observe(lane);
      if (content) resizeObserver.observe(content);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
    };
  }, [readLaneMetrics, slots.length, outputPreviewItems.length]);

  useEffect(() => {
    readCardNavMetrics();
    const nav = cardNavScrollRef.current;
    if (!nav) return;
    const onResize = () => {
      readCardNavMetrics();
    };
    window.addEventListener('resize', onResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        readCardNavMetrics();
      });
      resizeObserver.observe(nav);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
    };
  }, [readCardNavMetrics, slots.length]);

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return;
    readLaneMetrics();
    const rafA = window.requestAnimationFrame(() => {
      readLaneMetrics();
      window.requestAnimationFrame(() => {
        readLaneMetrics();
      });
    });
    const timeoutId = window.setTimeout(() => {
      readLaneMetrics();
    }, 200);
    return () => {
      window.cancelAnimationFrame(rafA);
      window.clearTimeout(timeoutId);
    };
  }, [isActive, readLaneMetrics]);

  useEffect(() => {
    const bottom = laneBottomScrollRef.current;
    if (!bottom) return;
    if (Math.abs(bottom.scrollLeft - laneMetrics.scrollLeft) > 1) {
      bottom.scrollLeft = laneMetrics.scrollLeft;
    }
  }, [laneMetrics.scrollLeft, laneHasOverflow]);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    if (laneMetricsRafRef.current === null) return;
    window.cancelAnimationFrame(laneMetricsRafRef.current);
    laneMetricsRafRef.current = null;
  }, []);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    if (cardNavMetricsRafRef.current === null) return;
    window.cancelAnimationFrame(cardNavMetricsRafRef.current);
    cardNavMetricsRafRef.current = null;
  }, []);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    if (variantViewportMetricsRafRef.current === null) return;
    window.cancelAnimationFrame(variantViewportMetricsRafRef.current);
    variantViewportMetricsRafRef.current = null;
  }, []);

  useEffect(() => {
    if (!cardMenu) return;
    const dismiss = () => setCardMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCardMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [cardMenu]);

  useEffect(() => {
    if (!cardRandomMenu) return;
    const dismiss = () => setCardRandomMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCardRandomMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [cardRandomMenu]);

  useEffect(() => {
    if (!cardLabelModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCardLabelModal(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [cardLabelModal]);

  useEffect(() => {
    if (!loraBrowserFileMenu) return;
    const dismiss = () => setLoraBrowserFileMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLoraBrowserFileMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [loraBrowserFileMenu]);

  useEffect(() => {
    if (!loraBrowserFolderMenu) return;
    const dismiss = () => setLoraBrowserFolderMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLoraBrowserFolderMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [loraBrowserFolderMenu]);

  useEffect(() => {
    if (isLoraBrowserOpen) return;
    clearLoraBrowserInfoClickTimer();
    setLoraBrowserFileMenu(null);
    setLoraBrowserFolderMenu(null);
    setLoraBrowserDropFolderPath(null);
  }, [isLoraBrowserOpen, clearLoraBrowserInfoClickTimer]);

  useEffect(() => {
    if (isModelBrowserOpen) return;
    clearModelBrowserInfoClickTimer();
  }, [isModelBrowserOpen, clearModelBrowserInfoClickTimer]);

  useEffect(() => {
    const clearSuppressedDrag = () => {
      suppressedVariantDragIdRef.current = '';
    };
    window.addEventListener('pointerup', clearSuppressedDrag);
    window.addEventListener('pointercancel', clearSuppressedDrag);
    window.addEventListener('mouseup', clearSuppressedDrag);
    window.addEventListener('dragend', clearSuppressedDrag);
    window.addEventListener('drop', clearSuppressedDrag);
    window.addEventListener('blur', clearSuppressedDrag);
    return () => {
      window.removeEventListener('pointerup', clearSuppressedDrag);
      window.removeEventListener('pointercancel', clearSuppressedDrag);
      window.removeEventListener('mouseup', clearSuppressedDrag);
      window.removeEventListener('dragend', clearSuppressedDrag);
      window.removeEventListener('drop', clearSuppressedDrag);
      window.removeEventListener('blur', clearSuppressedDrag);
    };
  }, []);

  useEffect(() => {
    if (!editorResetTick) return;
    variantDragRef.current = null;
    suppressedVariantDragIdRef.current = '';
    setVariantDropSlotId(null);
    setExpandedVariantEditor(null);
    setExpandedVariantSuggestions([]);
    setExpandedVariantSuggestionOpen(false);
    setExpandedVariantSuggestionIndex(0);
    setExpandedVariantSuggestionLoading(false);
    setEditingVariantId('');
    setEditingVariantNameId('');
    setEditingVariantTagId('');
    setEditingPromptChip(null);
    setVariantTextDrafts({});
    setVariantNameDrafts({});
    setVariantTagDrafts({});
    setChainLinkEditor(null);
  }, [editorResetTick]);

  const copySlotToClipboard = useCallback((slotId: string, mode: 'copy' | 'cut') => {
    const slot = slots.find((entry) => entry.slotId === slotId);
    if (!slot) return;
    const payload = {
      version: 1 as const,
      mode,
      sourceFile: path || null,
      createdAt: getNowIso(),
      slot: {
        slotId: slot.slotId,
        type: slot.type,
        label: slot.label,
        variants: slot.variants.map((variant) => ({
          ...variant,
          queueSetIds: normalizeQueueSetIds(variant.queueSetIds, false),
        })),
      },
    };
    writePowerPrompterCardClipboard(payload);
    setCardMenu(null);
    showToast(mode === 'copy' ? 'Card copied. Right-click a file and paste card.' : 'Card cut. Right-click a file and paste card to move.', 'success');
  }, [slots, path, showToast]);

  const selectedCheckpointName = String(generation.checkpointName || '').trim();
  const selectedGenerationModelType = normalizePowerPrompterModelType(generation.modelType);
  const pipelineSelection = useMemo(() => normalizeUmbraUiPipelineSelection(document.pipeline, {
    feature: 'txt2img',
    modelFamily: document.modelType,
    modelSource: selectedGenerationModelType,
  }), [document.modelType, document.pipeline, selectedGenerationModelType]);
  const imagePipelines = useMemo(
    () => pipelines.filter((entry) => entry.feature === 'txt2img'),
    [pipelines],
  );
  const pipelineFamilies = useMemo(() => Array.from(new Map(
    imagePipelines.map((entry) => [entry.modelFamilyKey, entry.modelFamily] as const),
  ).entries()).map(([key, label]) => ({ key, label })), [imagePipelines]);
  const selectedFamilyPipelines = useMemo(
    () => imagePipelines.filter((entry) => entry.modelFamilyKey === pipelineSelection.modelFamilyKey),
    [imagePipelines, pipelineSelection.modelFamilyKey],
  );
  const supportedPipelineSources = useMemo(() => Array.from(new Set(
    selectedFamilyPipelines.flatMap((entry) => entry.modelSources),
  )), [selectedFamilyPipelines]);
  const selectedPipeline = useMemo(() => selectedFamilyPipelines
    .filter((entry) => entry.modelSources.includes(pipelineSelection.modelSource))
    .sort((left, right) => right.priority - left.priority)[0] || null,
  [pipelineSelection.modelSource, selectedFamilyPipelines]);
  const imageCapabilities = useMemo(
    () => normalizeUmbraUiPipelineCapabilities(selectedPipeline?.capabilities, selectedPipeline?.modelSources),
    [selectedPipeline],
  );
  const hasDeclaredPipelineCapabilities = Boolean(selectedPipeline?.capabilities);
  const showHiresFix = !hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.support === 'adjustable';
  const showDetailerPipeline = !hasDeclaredPipelineCapabilities || imageCapabilities.detailerStages.support === 'adjustable';
  const showOutputUpscale = !hasDeclaredPipelineCapabilities || imageCapabilities.finalModelUpscale.support === 'adjustable';
  const showClipSkip = !hasDeclaredPipelineCapabilities || imageCapabilities.clipSkip.support === 'adjustable';
  const { catalog: stageModelCatalog } = usePowerPrompterStageCatalog(
    isActive && Boolean(selectedPipeline) && (showHiresFix || showDetailerPipeline || showOutputUpscale),
  );
  const hiresFix = generation.hiresFix || DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.hiresFix!;
  const detailerPipeline = generation.detailerPipeline || DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.detailerPipeline!;
  const outputUpscale = generation.outputUpscale || DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.outputUpscale!;
  const updatePipelineSelection = useCallback((modelFamilyKey: string, modelSourceInput?: UmbraUiPipelineModelSource) => {
    const familyEntries = imagePipelines.filter((entry) => entry.modelFamilyKey === modelFamilyKey);
    const family = familyEntries[0];
    if (!family) return;
    const acceptedSources = Array.from(new Set(familyEntries.flatMap((entry) => entry.modelSources)));
    const modelSource = modelSourceInput && acceptedSources.includes(modelSourceInput)
      ? modelSourceInput
      : acceptedSources.includes(selectedGenerationModelType)
        ? selectedGenerationModelType
        : acceptedSources[0] || 'checkpoint';
    const nextPipeline = normalizeUmbraUiPipelineSelection({
      feature: 'txt2img',
      modelFamily: family.modelFamily,
      modelFamilyKey: family.modelFamilyKey,
      modelSource,
    });
    onChange({
      ...document,
      modelType: nextPipeline.modelFamily,
      pipeline: nextPipeline,
      generation: normalizePowerPrompterGenerationControls({
        ...generation,
        modelType: modelSource,
      }),
      updatedAt: getNowIso(),
    });
  }, [document, generation, imagePipelines, onChange, selectedGenerationModelType]);
  const selectedCheckpointKey = selectedCheckpointName.toLowerCase();
  const selectedModelMeta = selectedCheckpointKey ? modelCardMetaByName[selectedCheckpointKey] : undefined;
  const modelPreviewUrls = useMemo(
    () => (Array.isArray(selectedModelMeta?.thumbnailUrls) ? selectedModelMeta?.thumbnailUrls.slice(0, 4) : []),
    [selectedModelMeta]
  );
  const modelThumbnailOverrides = getModelThumbnailOverrides(selectedCheckpointName);
  const combinedModelPreviewUrls = useMemo(
    () => Array.from(new Set([...modelThumbnailOverrides, ...modelPreviewUrls])),
    [modelThumbnailOverrides, modelPreviewUrls]
  );
  const activeModelPreview = combinedModelPreviewUrls.length > 0
    ? combinedModelPreviewUrls[modelBrowserThumbTick % combinedModelPreviewUrls.length]
    : '';
  const renderedSlots = useMemo(
    () => slots.map((slot, slotIndex) => ({ slot, slotIndex })),
    [slots]
  );
  const cardStageDesignWidth = useMemo(() => {
    const visibleSlotCount = Math.max(1, renderedSlots.length);
    const slotConnectors = Math.max(0, visibleSlotCount - 1);
    const slotLaneWidth =
      (visibleSlotCount * POWER_PROMPTER_SLOT_CARD_WIDTH)
      + (slotConnectors * POWER_PROMPTER_CARD_CONNECTOR_WIDTH)
      + (Math.max(0, (visibleSlotCount * 2) - 2) * POWER_PROMPTER_CARD_STAGE_GAP);
    return (
      POWER_PROMPTER_CONTROL_CARD_WIDTH
      + POWER_PROMPTER_CARD_CONNECTOR_WIDTH
      + slotLaneWidth
      + (POWER_PROMPTER_CARD_STAGE_GAP * 2)
    );
  }, [renderedSlots.length]);
  const cardStageScale = useMemo(() => {
    const viewportWidth = Math.max(0, laneMetrics.clientWidth - POWER_PROMPTER_CARD_STAGE_PADDING_X);
    if (!Number.isFinite(cardStageDesignWidth) || cardStageDesignWidth <= 0) return 1;
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
    return Math.max(POWER_PROMPTER_MIN_STAGE_SCALE, Math.min(1, viewportWidth / cardStageDesignWidth));
  }, [cardStageDesignWidth, laneMetrics.clientWidth]);
  const effectiveCardStageScale = Math.max(POWER_PROMPTER_MIN_STAGE_SCALE, cardStageScale);
  const renderedCardStageWidth = useMemo(
    () => Math.max(1, Math.round(cardStageDesignWidth * effectiveCardStageScale)),
    [cardStageDesignWidth, effectiveCardStageScale]
  );
  const laneContentWidth = useMemo(
    () => Math.max(Math.max(0, laneMetrics.clientWidth - POWER_PROMPTER_CARD_STAGE_PADDING_X), renderedCardStageWidth) + POWER_PROMPTER_CARD_STAGE_PADDING_X,
    [laneMetrics.clientWidth, renderedCardStageWidth]
  );
  const cardStageStyle = useMemo<React.CSSProperties>(() => ({
    width: `${cardStageDesignWidth}px`,
    height: `calc(100% - ${POWER_PROMPTER_CARD_STAGE_OFFSET_Y + POWER_PROMPTER_CARD_STAGE_BOTTOM_GAP}px)`,
    marginTop: `${POWER_PROMPTER_CARD_STAGE_OFFSET_Y}px`,
    transform: `scaleX(${effectiveCardStageScale})`,
    transformOrigin: 'top left',
    willChange: 'transform',
  }), [cardStageDesignWidth, effectiveCardStageScale]);
  const virtualSlotWindow = useMemo(() => {
    const slotCount = renderedSlots.length;
    if (slotCount <= 0) {
      return { startIndex: 0, endIndex: -1, beforeWidth: 0, afterWidth: 0 };
    }
    if (laneMetrics.clientWidth <= 0) {
      const endIndex = Math.min(slotCount - 1, POWER_PROMPTER_SLOT_INITIAL_RENDER_COUNT - 1);
      const skippedAfter = Math.max(0, slotCount - endIndex - 1);
      const afterWidth = skippedAfter > 0
        ? Math.max(0, (skippedAfter * POWER_PROMPTER_SLOT_CARD_STRIDE) - POWER_PROMPTER_CARD_STAGE_GAP)
        : 0;
      return { startIndex: 0, endIndex, beforeWidth: 0, afterWidth };
    }

    const scale = Math.max(POWER_PROMPTER_MIN_STAGE_SCALE, Number(effectiveCardStageScale) || 1);
    const scrollLeftDesign = Math.max(0, laneMetrics.scrollLeft / scale);
    const viewportWidthDesign = Math.max(1, laneMetrics.clientWidth / scale);
    const visibleStart = scrollLeftDesign - POWER_PROMPTER_SLOT_LANE_DESIGN_OFFSET;
    const visibleEnd = visibleStart + viewportWidthDesign;
    const rawStart = Math.floor(visibleStart / POWER_PROMPTER_SLOT_CARD_STRIDE) - POWER_PROMPTER_SLOT_VIRTUAL_OVERSCAN;
    const rawEnd = Math.ceil(visibleEnd / POWER_PROMPTER_SLOT_CARD_STRIDE) + POWER_PROMPTER_SLOT_VIRTUAL_OVERSCAN;
    const startIndex = Math.max(0, Math.min(slotCount - 1, rawStart));
    const endIndex = Math.max(startIndex, Math.min(slotCount - 1, rawEnd));
    const beforeWidth = startIndex > 0
      ? Math.max(0, (startIndex * POWER_PROMPTER_SLOT_CARD_STRIDE) - POWER_PROMPTER_CARD_STAGE_GAP)
      : 0;
    const skippedAfter = Math.max(0, slotCount - endIndex - 1);
    const afterWidth = skippedAfter > 0
      ? Math.max(0, (skippedAfter * POWER_PROMPTER_SLOT_CARD_STRIDE) - POWER_PROMPTER_CARD_STAGE_GAP)
      : 0;
    return { startIndex, endIndex, beforeWidth, afterWidth };
  }, [effectiveCardStageScale, laneMetrics.clientWidth, laneMetrics.scrollLeft, renderedSlots.length]);
  const visibleRenderedSlots = useMemo(
    () => virtualSlotWindow.endIndex >= virtualSlotWindow.startIndex
      ? renderedSlots.slice(virtualSlotWindow.startIndex, virtualSlotWindow.endIndex + 1)
      : [],
    [renderedSlots, virtualSlotWindow.endIndex, virtualSlotWindow.startIndex]
  );
  const scrollSlotIndexIntoView = useCallback((rawSlotIndex: number, behavior: ScrollBehavior = 'smooth') => {
    const laneNode = laneScrollRef.current;
    if (!laneNode) return;
    if (renderedSlots.length <= 0) return;
    const slotIndex = Math.max(0, Math.min(renderedSlots.length - 1, Math.floor(Number(rawSlotIndex) || 0)));
    if (!Number.isFinite(slotIndex)) return;
    const scale = Math.max(POWER_PROMPTER_MIN_STAGE_SCALE, Number(effectiveCardStageScale) || 1);
    const viewportWidthDesign = Math.max(1, laneNode.clientWidth / scale);
    const slotLeftDesign = POWER_PROMPTER_SLOT_LANE_DESIGN_OFFSET + (slotIndex * POWER_PROMPTER_SLOT_CARD_STRIDE);
    const targetLeftDesign = Math.max(0, slotLeftDesign - Math.max(0, (viewportWidthDesign - POWER_PROMPTER_SLOT_CARD_WIDTH) / 2));
    laneNode.scrollTo({ left: targetLeftDesign * scale, behavior });
  }, [effectiveCardStageScale, renderedSlots.length]);
  const getSlotActivePromptCount = useCallback((slot: ChainSlot) => {
    let count = 0;
    for (const variant of slot.variants) {
      const text = String(variant.text || '').trim();
      if (!text) continue;
      const setIds = normalizeQueueSetIds(variant.queueSetIds, false);
      if (setIds.includes(activeQueueSet)) count += 1;
    }
    return count;
  }, [activeQueueSet]);
  const cardNavVirtualWidth = useMemo(
    () => slots.length > 0
      ? (slots.length * CARD_NAV_CHIP_WIDTH) + (Math.max(0, slots.length - 1) * CARD_NAV_CHIP_GAP)
      : 0,
    [slots.length]
  );
  const cardNavWindow = useMemo(() => {
    const slotCount = slots.length;
    if (slotCount <= 0) return { startIndex: 0, endIndex: -1 };
    if (cardNavMetrics.clientWidth <= 0 || slotCount <= 8) {
      return { startIndex: 0, endIndex: slotCount - 1 };
    }
    const rawStart = Math.floor(cardNavMetrics.scrollLeft / CARD_NAV_CHIP_STRIDE) - CARD_NAV_CHIP_OVERSCAN;
    const rawEnd = Math.ceil((cardNavMetrics.scrollLeft + cardNavMetrics.clientWidth) / CARD_NAV_CHIP_STRIDE) + CARD_NAV_CHIP_OVERSCAN;
    const startIndex = Math.max(0, Math.min(slotCount - 1, rawStart));
    const endIndex = Math.max(startIndex, Math.min(slotCount - 1, rawEnd));
    return { startIndex, endIndex };
  }, [cardNavMetrics.clientWidth, cardNavMetrics.scrollLeft, slots.length]);
  const visibleCardNavSlots = useMemo(
    () => cardNavWindow.endIndex >= cardNavWindow.startIndex
      ? slots.slice(cardNavWindow.startIndex, cardNavWindow.endIndex + 1).map((slot, index) => ({
        slot,
        slotIndex: cardNavWindow.startIndex + index,
      }))
      : [],
    [cardNavWindow.endIndex, cardNavWindow.startIndex, slots]
  );
  return (
    <div
      ref={editorRootRef}
      data-umbra-card-chain-editor=""
      data-umbra-mobile-selection-mode={mobileSelectionMode ? '1' : '0'}
      className={`flex flex-col h-full ${overlayMode ? 'bg-[rgba(5,5,8,0.92)]' : 'bg-[#050508]'}`}
    >
      <div className={`${promptFieldsMinimized ? 'px-4 py-1' : 'px-4 pt-1.5 pb-2'} border-b border-white/5`}>
        {promptFieldsMinimized ? (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setPromptFieldsMinimized(false)}
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-100"
              title="Show active prompt"
            >
              <Maximize2 size={10} />
              Show
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-4 min-h-[74px] max-h-[120px] overflow-y-auto rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-zinc-300 custom-scrollbar">
              {visibleActivePromptBlocks.length > 0 ? (
                <PowerPrompterActivePromptInline
                  blocks={visibleActivePromptBlocks}
                  fallbackText={activePromptSource || (queueVisualState ? 'Waiting for queued prompt...' : 'Fill your cards to compose a prompt...')}
                  chipConfig={promptChipConfig}
                />
              ) : (
                <PowerPrompterPromptChips
                  text={activePromptSource}
                  config={promptChipConfig}
                  emptyText={queueVisualState ? 'Waiting for queued prompt...' : 'Fill your cards to compose a prompt...'}
                />
              )}
            </div>
            <div className="col-span-1 min-w-0">
              <div className="flex items-center gap-2 px-1">
                <label className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-widest text-zinc-500">Negative Prompt</label>
                <button
                  type="button"
                  onClick={() => setPromptFieldsMinimized(true)}
                  className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                  title="Minimize active prompt"
                >
                  <Minimize2 size={10} />
                  Min
                </button>
              </div>
              <div className="relative mt-1">
                <textarea
                  value={negativePromptValue}
                  readOnly={mobileSelectionMode}
                  onChange={(event) => {
                    if (mobileSelectionMode) return;
                    updateGeneration({ negativePrompt: String(event.target.value || '') });
                  }}
                  placeholder="Type negative prompt..."
                  rows={4}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/5 py-2 pl-2.5 pr-7 text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/45 min-h-[74px] max-h-[120px] overflow-y-auto custom-scrollbar"
                />
                <Pencil size={11} className="pointer-events-none absolute right-2 top-2 text-zinc-500" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-white/5 bg-black/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="shrink-0 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Cards
          </div>
          <div
            ref={cardNavScrollRef}
            data-umbra-card-nav-strip=""
            onPointerDownCapture={(event) => beginTouchHorizontalPan(event)}
            onPointerMoveCapture={updateTouchHorizontalPan}
            onPointerUpCapture={finishTouchHorizontalPan}
            onPointerCancelCapture={finishTouchHorizontalPan}
            onScroll={handleCardNavScroll}
            onClickCapture={suppressTouchHorizontalPanClick}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-2"
            title="Shift+Scroll to move along the card nav bar"
          >
            <div
              className="relative h-10 whitespace-nowrap"
              style={{ width: `${cardNavVirtualWidth}px`, minWidth: `${cardNavVirtualWidth}px` }}
            >
              {visibleCardNavSlots.map(({ slot, slotIndex }) => {
                const isActiveSlot = activeSlot?.slotId === slot.slotId;
                const activePromptCount = getSlotActivePromptCount(slot);
                const hasActivePrompt = activePromptCount > 0;
                const isDropTarget = !!slotChipDragId && slotChipDropId === slot.slotId && slotChipDragId !== slot.slotId;
                const label = String(slot.label || `Card ${slotIndex + 1}`).trim() || `Card ${slotIndex + 1}`;
                return (
                  <button
                    key={`slot-top-chip-${slot.slotId}`}
                    ref={(node) => setCardNavButtonRef(slot.slotId, node)}
                    data-umbra-card-nav-button={slot.slotId}
                    draggable={!mobileSelectionMode && !touchRemoteMode}
                    onClick={() => {
                      setActiveSlotId(slot.slotId);
                      const top = slot.variants[0];
                      if (top?.id) setActiveVariantId(top.id);
                      window.requestAnimationFrame(() => {
                        scrollCardNavButtonIntoView(slot.slotId);
                        scrollSlotIndexIntoView(slotIndex, 'smooth');
                      });
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setSlotChipDragId(slot.slotId);
                      setSlotChipDropId(slot.slotId);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', `slot-chip:${slot.slotId}`);
                    }}
                    onDragOver={(event) => {
                      if (!slotChipDragId || slotChipDragId === slot.slotId) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      setSlotChipDropId(slot.slotId);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const raw = String(event.dataTransfer.getData('text/plain') || '');
                      const parsed = raw.startsWith('slot-chip:') ? raw.slice('slot-chip:'.length).trim() : '';
                      const dragId = slotChipDragId || parsed;
                      if (dragId && dragId !== slot.slotId) {
                        moveSlotByChipDrag(dragId, slot.slotId);
                      }
                      setSlotChipDragId('');
                      setSlotChipDropId('');
                    }}
                    onDragEnd={() => {
                      setSlotChipDragId('');
                      setSlotChipDropId('');
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (mobileSelectionMode) return;
                      setActiveSlotId(slot.slotId);
                      scrollCardNavButtonIntoView(slot.slotId);
                      const top = slot.variants[0];
                      if (top?.id) setActiveVariantId(top.id);
                      const anchor = getElementContextMenuPoint(event, 'below');
                      openCardContextMenu(slot.slotId, anchor.x, anchor.y);
                    }}
                    className={`absolute top-0 h-10 w-[148px] rounded-md border px-3.5 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                      isActiveSlot
                        ? 'border-emerald-400/60 bg-emerald-500/16 text-emerald-100'
                        : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:text-zinc-100 hover:border-white/30'
                    } ${isDropTarget ? 'border-emerald-300/80 bg-emerald-500/14 text-emerald-100' : ''}`}
                    style={{
                      left: `${slotIndex * CARD_NAV_CHIP_STRIDE}px`,
                      ...(hasActivePrompt ? {
                        boxShadow: `0 0 0 1px ${hexToRgba(activeSetAccentColor, 0.32)}, 0 0 12px ${hexToRgba(activeSetAccentColor, 0.32)}`,
                        borderColor: isActiveSlot ? undefined : hexToRgba(activeSetAccentColor, 0.44),
                      } : {}),
                    }}
                    title={`${label} - Drag to reorder`}
                  >
                      <span className="flex items-center justify-between gap-2.5">
                        <span className="truncate">{label}</span>
                        <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black leading-none ${
                          hasActivePrompt
                            ? ''
                            : 'border-white/10 bg-white/[0.04] text-zinc-500'
                        }`}
                        style={hasActivePrompt ? {
                          color: activeSetAccentColor,
                          borderColor: hexToRgba(activeSetAccentColor, 0.5),
                          backgroundColor: hexToRgba(activeSetAccentColor, 0.16),
                        } : undefined}
                        title={`${activePromptCount} prompt${activePromptCount === 1 ? '' : 's'} enabled for Set ${activeQueueSet}`}
                      >
                        {activePromptCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="hidden shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 xl:block">
            {laneHasOverflow ? 'Shift+Wheel Cards' : `${slots.length} Card${slots.length === 1 ? '' : 's'}`}
          </div>
          <button
            onClick={addSlot}
            className="shrink-0 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-emerald-400/45 bg-emerald-500/14 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-200 hover:text-emerald-100 hover:border-emerald-300/70"
            title="Add card"
          >
            <Plus size={13} />
            Add
          </button>
        </div>
      </div>

      <div
        ref={laneScrollRef}
        data-umbra-card-lane=""
        onScroll={handleLaneScroll}
        onWheel={handleLaneWheel}
        onPointerDownCapture={(event) => beginTouchHorizontalPan(event, { syncLaneBottom: true })}
        onPointerMoveCapture={updateTouchHorizontalPan}
        onPointerUpCapture={finishTouchHorizontalPan}
        onPointerCancelCapture={finishTouchHorizontalPan}
        onClickCapture={suppressTouchHorizontalPanClick}
        style={{ overflowAnchor: 'none' }}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden overscroll-contain hide-native-scrollbar"
      >
        <div
          ref={laneContentRef}
          data-umbra-card-lane-content=""
          style={{ overflowAnchor: 'none', width: `${laneContentWidth}px`, minWidth: `${laneContentWidth}px` }}
          className="relative h-full min-h-0 min-w-full overflow-y-hidden px-3 py-3"
        >
          <div className="relative h-full min-h-0 overflow-y-hidden" style={{ width: `${renderedCardStageWidth}px` }}>
            <div className="relative z-10 flex h-full min-h-0 items-stretch gap-3 overflow-y-hidden" style={cardStageStyle}>
          <div
            ref={generationControlsSurfaceRef}
            data-card-surface="true"
            data-umbra-generation-controls-card=""
            style={{ transform: `translateX(${POWER_PROMPTER_SIDE_CARD_BREATHING_ROOM}px)` }}
            className="h-full max-h-full min-h-0 w-[412px] rounded-xl border border-cyan-400/35 bg-cyan-500/[0.06] shadow-lg shadow-cyan-900/20 flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-cyan-400/30 flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">
                Generation Controls
              </span>
              <span className="text-[10px] uppercase tracking-widest text-cyan-300/80 px-1.5 py-1 rounded-md border border-cyan-400/30 bg-cyan-500/10">
                Node Sync
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
              <div className="rounded-md border border-cyan-400/25 bg-cyan-500/[0.07] p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Pipeline</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedPipeline?.compatible
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/35 bg-amber-500/10 text-amber-200'
                  }`}>
                    {selectedPipeline?.compatible ? 'Ready' : pipelineSelection.modelFamily ? 'Unavailable' : 'Choose Family'}
                  </span>
                </div>
                <label className="block text-[10px] uppercase tracking-widest text-zinc-400">
                  Model Family
                  <div className="relative mt-1">
                    <select
                      value={pipelineSelection.modelFamilyKey}
                      onChange={(event) => updatePipelineSelection(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      className={`w-full appearance-none rounded border border-white/20 bg-black/45 px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:border-cyan-300 focus:outline-none ${UMBRA_THEMED_SELECT_CLASS}`}
                    >
                      <option value="">Choose pipeline...</option>
                      {pipelineFamilies.map((family) => (
                        <option key={`pipeline-family-${family.key}`} value={family.key}>{family.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </label>
                <label className="block text-[10px] uppercase tracking-widest text-zinc-400">
                  Model Source
                  <div className="relative mt-1">
                    <select
                      value={pipelineSelection.modelSource}
                      disabled={!pipelineSelection.modelFamilyKey || supportedPipelineSources.length <= 0}
                      onChange={(event) => updatePipelineSelection(
                        pipelineSelection.modelFamilyKey,
                        event.target.value as UmbraUiPipelineModelSource,
                      )}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      className={`w-full appearance-none rounded border border-white/20 bg-black/45 px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:border-cyan-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${UMBRA_THEMED_SELECT_CLASS}`}
                    >
                      {supportedPipelineSources.map((source) => (
                        <option key={`pipeline-source-${source}`} value={source}>{POWER_PROMPTER_MODEL_BROWSER_LABELS[source]}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                  </div>
                </label>
                {selectedPipeline && !selectedPipeline.compatible && selectedPipeline.missing.length > 0 ? (
                  <div className="text-[10px] leading-relaxed text-amber-200/85">
                    Missing: {selectedPipeline.missing.join(', ')}
                  </div>
                ) : null}
              </div>
              <div className="rounded-md border border-white/10 bg-black/30 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Model</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void onRefreshModelCatalog?.(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                        title="Refresh model catalog"
                      >
                        <RefreshCw size={10} />
                        Refresh
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openModelBrowser();
                        }}
                        className="px-2 py-1 rounded-md border border-cyan-400/35 bg-cyan-500/10 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/20"
                      >
                        Choose
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200">
                      {POWER_PROMPTER_MODEL_BROWSER_LABELS[selectedGenerationModelType]}
                    </span>
                    <div className="min-w-0 flex-1 text-[11px] text-zinc-200 truncate">
                      {selectedCheckpointName || 'No model selected'}
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/35 p-1">
                    {activeModelPreview ? (
                      renderPreviewMedia(
                        activeModelPreview,
                        selectedCheckpointName ? `${selectedCheckpointName} preview` : 'Model preview',
                        'w-full h-24 object-cover rounded',
                        { autoPlay: false, loop: true, muted: true }
                      )
                    ) : (
                      <div className="w-full h-24 rounded flex items-center justify-center text-[10px] uppercase tracking-wider text-zinc-500">
                        No Preview
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {combinedModelPreviewUrls.slice(0, 4).map((url, idx) => (
                      <div key={`checkpoint-preview-${idx}-${url}`} className="w-full h-12 rounded border border-white/10 overflow-hidden bg-black/45">
                        {renderPreviewMedia(
                          url,
                          `Checkpoint preview ${idx + 1}`,
                          'w-full h-full object-cover',
                          { autoPlay: false, loop: true, muted: true }
                        )}
                      </div>
                    ))}
                    {combinedModelPreviewUrls.length === 0 && (
                      <>
                        <div className="h-12 rounded border border-white/10 bg-white/[0.03]" />
                        <div className="h-12 rounded border border-white/10 bg-white/[0.03]" />
                        <div className="h-12 rounded border border-white/10 bg-white/[0.03]" />
                        <div className="h-12 rounded border border-white/10 bg-white/[0.03]" />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!selectedCheckpointName || selectedGenerationModelType !== 'checkpoint') return;
                        void openModelInfo(selectedCheckpointName);
                      }}
                      disabled={!selectedCheckpointName || selectedGenerationModelType !== 'checkpoint'}
                      className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wider font-semibold ${
                        selectedCheckpointName && selectedGenerationModelType === 'checkpoint'
                          ? 'border-white/20 bg-white/[0.05] text-zinc-200 hover:border-white/35'
                          : 'border-white/10 bg-white/[0.03] text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      Info
                    </button>
                    {selectedModelMeta?.civitaiUrl ? (
                      <a
                        href={selectedModelMeta.civitaiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="px-2 py-1 rounded border border-cyan-400/35 bg-cyan-500/10 text-[10px] uppercase tracking-wider font-semibold text-cyan-200 hover:border-cyan-300/55"
                      >
                        Civitai
                      </a>
                    ) : null}
                  </div>
                </div>

              <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Seed
                      <input
                        type="number"
                        value={queueActiveSeed ?? generation.seed}
                        onChange={(event) => updateGeneration({ seed: parseIntegerInput(event.target.value, generation.seed) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Mode
                      <div className="relative mt-1">
                        <select
                          value={generation.controlAfterGenerate}
                          onChange={(event) => updateGeneration({ controlAfterGenerate: event.target.value as PowerPrompterGenerationControls['controlAfterGenerate'] })}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={`w-full appearance-none bg-black/45 border border-white/20 rounded px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300 ${UMBRA_THEMED_SELECT_CLASS}`}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="increment">Increment</option>
                          <option value="decrement">Decrement</option>
                          <option value="randomize">Randomize</option>
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                      </div>
                    </label>
                  </div>

                  {showClipSkip ? (
                    <label className="block text-[10px] uppercase tracking-widest text-zinc-400">
                      Clip Skip
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={generation.clipSkip}
                        onChange={(event) => updateGeneration({ clipSkip: parseIntegerInput(event.target.value, generation.clipSkip) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-zinc-200 focus:border-cyan-300 focus:outline-none"
                      />
                    </label>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Steps
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={generation.steps}
                        onChange={(event) => updateGeneration({ steps: parseIntegerInput(event.target.value, generation.steps) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      CFG
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={generation.cfg}
                        onChange={(event) => updateGeneration({ cfg: parseFloatInput(event.target.value, generation.cfg) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Sampler
                      <div className="relative mt-1">
                        <select
                          value={generation.samplerName}
                          onChange={(event) => updateGeneration({ samplerName: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={`w-full appearance-none bg-black/45 border border-white/20 rounded px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300 ${UMBRA_THEMED_SELECT_CLASS}`}
                        >
                          {POWER_PROMPTER_SAMPLER_OPTIONS.map((option) => (
                            <option key={`generation-sampler-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                      </div>
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Scheduler
                      <div className="relative mt-1">
                        <select
                          value={generation.scheduler}
                          onChange={(event) => updateGeneration({ scheduler: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={`w-full appearance-none bg-black/45 border border-white/20 rounded px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300 ${UMBRA_THEMED_SELECT_CLASS}`}
                        >
                          {POWER_PROMPTER_SCHEDULER_OPTIONS.map((option) => (
                            <option key={`generation-scheduler-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Batch
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={generation.batchSize}
                        onChange={(event) => updateGeneration({ batchSize: parseIntegerInput(event.target.value, generation.batchSize) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                  </div>

                  <label className="block text-[10px] uppercase tracking-widest text-zinc-400">
                    Aspect Ratio
                    <div className="relative mt-1">
                      <select
                        value={generation.aspectRatio}
                        onChange={(event) => {
                          const aspectRatio = event.target.value;
                          const dimensions = getDimensionsFromAspectRatioOption(aspectRatio);
                          updateGeneration(dimensions ? { aspectRatio, ...dimensions } : { aspectRatio });
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        className={`w-full appearance-none bg-black/45 border border-white/20 rounded px-2 py-1.5 pr-7 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300 ${UMBRA_THEMED_SELECT_CLASS}`}
                      >
                        {POWER_PROMPTER_ASPECT_RATIO_OPTIONS.map((option) => (
                          <option key={`generation-aspect-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                    </div>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Width
                      <input
                        type="number"
                        min={64}
                        max={8192}
                        step={8}
                        value={generation.width}
                        onChange={(event) => updateGeneration({ width: parseIntegerInput(event.target.value, generation.width) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-400">
                      Height
                      <input
                        type="number"
                        min={64}
                        max={8192}
                        step={8}
                        value={generation.height}
                        onChange={(event) => updateGeneration({ height: parseIntegerInput(event.target.value, generation.height) })}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                      />
                    </label>
                  </div>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      updateGeneration({ swapDimensions: !generation.swapDimensions });
                    }}
                    className={`w-full px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
                      generation.swapDimensions
                        ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                        : 'border-white/15 bg-white/[0.05] text-zinc-300 hover:text-zinc-100'
                    }`}
                    title="Swap width and height in node output"
                  >
                    Swap Dimensions: {generation.swapDimensions ? 'On' : 'Off'}
                  </button>

                  {showHiresFix ? (
                    <UmbraHiresFixControls
                      enabled={hiresFix.enabled}
                      onEnabledChange={(enabled) => updateGeneration({ hiresFix: { ...hiresFix, enabled } })}
                      upscaler={hiresFix.upscaler}
                      onUpscalerChange={(upscaler) => updateGeneration({ hiresFix: { ...hiresFix, upscaler } })}
                      upscaleModels={stageModelCatalog.upscaleModels}
                      resizeMode={hiresFix.resizeMode}
                      onResizeModeChange={(resizeMode) => updateGeneration({ hiresFix: { ...hiresFix, resizeMode } })}
                      scaleBy={hiresFix.scaleBy}
                      onScaleByChange={(scaleBy) => updateGeneration({ hiresFix: { ...hiresFix, scaleBy } })}
                      targetWidth={hiresFix.targetWidth > 0 ? String(hiresFix.targetWidth) : ''}
                      onTargetWidthChange={(targetWidth) => updateGeneration({ hiresFix: { ...hiresFix, targetWidth: Number(targetWidth) || 0 } })}
                      targetHeight={hiresFix.targetHeight > 0 ? String(hiresFix.targetHeight) : ''}
                      onTargetHeightChange={(targetHeight) => updateGeneration({ hiresFix: { ...hiresFix, targetHeight: Number(targetHeight) || 0 } })}
                      baseWidth={generation.width}
                      baseHeight={generation.height}
                      steps={String(hiresFix.steps)}
                      onStepsChange={(steps) => updateGeneration({ hiresFix: { ...hiresFix, steps: Number(steps) || 0 } })}
                      denoise={hiresFix.denoise}
                      onDenoiseChange={(denoise) => updateGeneration({ hiresFix: { ...hiresFix, denoise } })}
                      cfg={String(hiresFix.cfg)}
                      onCfgChange={(cfg) => updateGeneration({ hiresFix: { ...hiresFix, cfg: Number(cfg) || 0 } })}
                      samplerName={hiresFix.samplerName}
                      onSamplerNameChange={(samplerName) => updateGeneration({ hiresFix: { ...hiresFix, samplerName } })}
                      scheduler={hiresFix.scheduler}
                      onSchedulerChange={(scheduler) => updateGeneration({ hiresFix: { ...hiresFix, scheduler } })}
                      samplerOptions={[...POWER_PROMPTER_SAMPLER_OPTIONS]}
                      schedulerOptions={[...POWER_PROMPTER_SCHEDULER_OPTIONS]}
                      resizeModes={hasDeclaredPipelineCapabilities ? imageCapabilities.hiresFix.resizeModes : ['scale', 'dimensions']}
                      showUpscaler={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.upscaler}
                      showSteps={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.steps}
                      showDenoise={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.denoise}
                      showCfg={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.cfg}
                      showSampler={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.sampler}
                      showScheduler={!hasDeclaredPipelineCapabilities || imageCapabilities.hiresFix.controls.scheduler}
                    />
                  ) : null}

                  {showDetailerPipeline || showOutputUpscale ? (
                    <UmbraDetailerPipelineControls
                      stages={detailerPipeline}
                      onStagesChange={(stages) => updateGeneration({ detailerPipeline: stages })}
                      detectorModels={stageModelCatalog.detectorModels}
                      samModels={stageModelCatalog.samModels}
                      samplerOptions={[...POWER_PROMPTER_SAMPLER_OPTIONS]}
                      schedulerOptions={[...POWER_PROMPTER_SCHEDULER_OPTIONS]}
                      upscaleModels={stageModelCatalog.upscaleModels}
                      outputUpscale={outputUpscale}
                      onOutputUpscaleChange={(settings) => updateGeneration({ outputUpscale: settings })}
                      showDetailer={showDetailerPipeline}
                      showOutputUpscale={showOutputUpscale}
                      allowCustomStages={!hasDeclaredPipelineCapabilities || imageCapabilities.detailerStages.customStages}
                      showStageControls={!hasDeclaredPipelineCapabilities || imageCapabilities.detailerStages.customStages}
                      showOutputModelSelection={!hasDeclaredPipelineCapabilities || imageCapabilities.finalModelUpscale.modelSelection}
                      showOutputMaxDimension={!hasDeclaredPipelineCapabilities || imageCapabilities.finalModelUpscale.maxDimension}
                    />
                  ) : null}

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      updateGeneration(DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS);
                    }}
                    className="w-full px-2 py-1.5 rounded-md border border-white/15 bg-white/[0.05] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                  >
                    Reset Controls
                  </button>
              </>

              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-200">LoRAs</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isForgeMode) {
                        void onRefreshLoraCatalog?.(true);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                    title="Refresh LoRA catalog"
                  >
                    <RefreshCw size={10} />
                    Refresh
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {loraEntries.length === 0 && (
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      No LoRAs selected
                    </div>
                  )}

                  {loraEntries.map((entry) => {
                    const syntaxToken = formatLoraSyntaxToken(entry);
                    const normalizedEntryName = String(entry.name || '').trim().toLowerCase();
                    const trainedTags = loraTagBank[normalizedEntryName] || [];
                    const loraCardMeta = loraCardMetaByName[normalizedEntryName];
                    const loraThumbOverrides = getThumbnailOverrides(entry.name);
                    const autoPreviewUrls = Array.isArray(loraCardMeta?.thumbnailUrls) && loraCardMeta.thumbnailUrls.length > 0
                      ? loraCardMeta.thumbnailUrls.slice(0, 4)
                      : (loraCardMeta?.thumbnailUrl ? [loraCardMeta.thumbnailUrl] : []);
                    const previewUrls = Array.from(new Set([
                      ...loraThumbOverrides,
                      ...autoPreviewUrls,
                    ])).slice(0, 4);
                    const isCollapsed = loraCollapsedIds.includes(entry.id);
                    const displayName = String(entry.name || '').trim() || 'Unselected LoRA';
                    return (
                      <div
                        key={entry.id}
                        className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1.5"
                        title={entry.name ? `LoRA: ${entry.name}` : 'LoRA entry'}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleLoraCollapsed(entry.id);
                            }}
                            className="px-1.5 py-0.5 rounded border border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                            title={isCollapsed ? 'Expand LoRA card' : 'Minimize LoRA card'}
                          >
                            {isCollapsed ? 'Open' : 'Min'}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-zinc-200 truncate">
                              {displayName}
                            </div>
                          </div>
                          {loraCardMeta?.civitaiUrl ? (
                            <a
                              href={loraCardMeta.civitaiUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="px-1.5 py-1 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300/60 text-[10px] uppercase tracking-wider"
                              title="Open this LoRA on Civitai"
                            >
                              Link
                            </a>
                          ) : null}
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void openLoraInfo(entry.name);
                            }}
                            className="p-1 rounded border border-white/15 text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                            title="View LoRA info"
                          >
                            <Info size={12} />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              removeLoraEntry(entry.id);
                            }}
                            className="p-1 rounded border border-red-400/30 text-red-300 hover:text-red-200 hover:border-red-400/50"
                            title="Remove LoRA"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {!isCollapsed && (
                          <>
                            <div className="rounded-md border border-white/15 bg-black/45 px-2 py-1 text-[11px] text-zinc-200 break-all">
                              {String(entry.name || '').trim() || 'No LoRA selected. Use Add LoRA browser.'}
                            </div>
                        {previewUrls.length > 0 ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void openLoraInfo(entry.name);
                            }}
                            className="w-full rounded-md border border-white/10 overflow-hidden bg-black/35 hover:border-cyan-400/45 transition-colors"
                            title="Open LoRA info"
                          >
                            <div className="grid grid-cols-4 gap-1 p-1.5">
                              {previewUrls.map((url, idx) => (
                                <div key={`${entry.id}-preview-${idx}-${url}`} className="w-full h-16 rounded bg-black/55 overflow-hidden">
                                  {renderPreviewMedia(
                                    url,
                                    `${entry.name || 'LoRA'} preview ${idx + 1}`,
                                    'w-full h-full object-cover',
                                    { autoPlay: false, loop: true, muted: true }
                                  )}
                                </div>
                              ))}
                              {previewUrls.length === 1 && (
                                <>
                                  <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                                  <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                                  <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                                </>
                              )}
                              {previewUrls.length === 2 && (
                                <>
                                  <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                                  <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                                </>
                              )}
                              {previewUrls.length === 3 && (
                                <div className="h-16 rounded bg-white/[0.03] border border-white/10" />
                              )}
                            </div>
                          </button>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                            Model
                            <input
                              type="number"
                              step={0.05}
                              min={-10}
                              max={10}
                              value={entry.strengthModel}
                              onChange={(event) => patchLoraEntry(entry.id, { strengthModel: parseFloatInput(event.target.value, entry.strengthModel) })}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                            />
                          </label>
                          <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                            Clip
                            <input
                              type="number"
                              step={0.05}
                              min={-10}
                              max={10}
                              value={entry.strengthClip}
                              onChange={(event) => patchLoraEntry(entry.id, { strengthClip: parseFloatInput(event.target.value, entry.strengthClip) })}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 w-full bg-black/40 border border-white/15 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                            />
                          </label>
                        </div>
                        <div className="pt-1 border-t border-white/10 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500">LoRA Variant Tokens</span>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void loadLoraTags(entry.name);
                              }}
                              className="px-2 py-0.5 rounded border border-white/15 text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                              title="Load trained tags for drag/click reveal"
                            >
                              Load Tags
                            </button>
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Drag tokens to variants, or click to reveal where they are used.
                          </div>
                          {syntaxToken && (
                            <span
                              draggable
                              onDragStart={(event) => setPromptTokenDragData(event, syntaxToken)}
                              onClick={(event) => {
                                event.stopPropagation();
                                revealVariantForToken(syntaxToken);
                              }}
                              className="inline-flex items-center px-1.5 py-0.5 rounded border border-purple-400/45 bg-purple-500/15 text-purple-200 text-[10px] font-semibold cursor-grab active:cursor-grabbing hover:border-purple-300/70"
                              title="Drag token to a variant, or click to reveal its variant card"
                            >
                              {syntaxToken}
                            </span>
                          )}
                          {trainedTags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {trainedTags.slice(0, 28).map((tag) => (
                                <span
                                  key={`${entry.id}-drag-tag-${tag}`}
                                  draggable
                                  onDragStart={(event) => setPromptTokenDragData(event, tag)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    revealVariantForToken(tag);
                                  }}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-200 text-[10px] cursor-grab active:cursor-grabbing hover:border-cyan-300/60"
                                  title="Drag trained tag to a variant, or click to reveal where it is used"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openLoraBrowser();
                    }}
                    className="w-full px-2 py-1.5 rounded-md border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Add LoRA
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-full min-h-0 flex items-center justify-center px-1"><ArrowRight size={14} className="text-zinc-600" /></div>

            <div className="relative min-w-0 flex h-full min-h-0 flex-1 items-stretch overflow-y-hidden">
              <div className="relative min-w-0 flex-1 h-full overflow-hidden">
              <div
                className="absolute inset-0 z-10 flex h-full min-w-0 w-full items-stretch gap-3"
              >
                {virtualSlotWindow.beforeWidth > 0 && (
                  <div
                    aria-hidden="true"
                    className="h-full min-h-0 shrink-0"
                    style={{ width: `${virtualSlotWindow.beforeWidth}px` }}
                  />
                )}
                {visibleRenderedSlots.map(({ slot, slotIndex }) => {
                  const topVariant = slot.variants[0];
                  const slotRandomEnabled = isSlotRandomEnabled(slot);
                  const chainLinkModeActive = Boolean(chainLinkEditor);
                  const styleUtilitySlot = isStyleUtilitySlot(slot);
                  const slotHasEditingVariant = slot.variants.some((variant) => variant.id === editingVariantId);
                  const slotQueueTraversalRole = getSlotQueueTraversalRole(slot);
                  return (
                    <div
                      key={slot.slotId}
                      className="h-full min-h-0 flex items-stretch"
                    >
                <div
                  ref={(node) => setSlotSurfaceRef(slot.slotId, node)}
                  data-card-surface="true"
                  data-umbra-prompt-card=""
                  style={{
                    ...(slotSurfaceStyle || {}),
                    ...(slotHasEditingVariant ? { contain: 'none' as const, isolation: 'isolate' as const } : {}),
                  }}
                  onDrop={(event) => {
                    if (chainLinkModeActive) return;
                    if (variantDragRef.current) {
                      event.preventDefault();
                      const dragging = variantDragRef.current;
                      variantDragRef.current = null;
                      setVariantDropSlotId(null);
                      if (dragging.slotId !== slot.slotId) {
                        moveVariantToSlot(dragging.slotId, dragging.variantId, slot.slotId);
                      }
                      return;
                    }
                  }}
                  onClick={() => {
                    setActiveSlotId(slot.slotId);
                    if (topVariant) setActiveVariantId(topVariant.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (chainLinkModeActive || mobileSelectionMode) return;
                    const anchor = getElementContextMenuPoint(event);
                    openCardContextMenu(slot.slotId, anchor.x, anchor.y);
                  }}
                  className={`relative h-full max-h-full min-h-0 w-[448px] overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow,opacity,transform] duration-200 flex flex-col ${
                    variantDropSlotId === slot.slotId
                      ? 'border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-500/20'
                      : styleUtilitySlot
                        ? activeSlot?.slotId === slot.slotId
                          ? 'border-emerald-300/80 bg-emerald-500/12 shadow-lg shadow-emerald-500/20'
                          : 'border-emerald-400/35 bg-emerald-500/8 hover:border-emerald-300/60'
                        : activeSlot?.slotId === slot.slotId
                          ? 'border-[var(--umbra-accent)] bg-white/10 shadow-lg shadow-[var(--umbra-accent-glow)]'
                          : 'border-white/10 bg-white/[0.04] hover:border-white/20'
                  }`}
                >
                  <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (chainLinkModeActive || mobileSelectionMode) return;
                        moveSlotByDelta(slot.slotId, -1);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-black/30 text-zinc-300 hover:text-white hover:border-white/25 disabled:opacity-45 disabled:cursor-not-allowed"
                      title="Move card left"
                      disabled={chainLinkModeActive || mobileSelectionMode || slotIndex <= 0}
                    >
                      <ChevronRight size={12} className="rotate-180" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (chainLinkModeActive || mobileSelectionMode) return;
                        moveSlotByDelta(slot.slotId, 1);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-black/30 text-zinc-300 hover:text-white hover:border-white/25 disabled:opacity-45 disabled:cursor-not-allowed"
                      title="Move card right"
                      disabled={chainLinkModeActive || mobileSelectionMode || slotIndex >= slots.length - 1}
                    >
                      <ChevronRight size={12} />
                    </button>
                    {styleUtilitySlot ? (
                      <div className="relative min-w-[190px] flex-1">
                        <div
                          className="flex h-8 w-full items-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200"
                          title="Multiple quality prompts enabled in the same set generate multiple style passes."
                        >
                          <span className="min-w-0 flex-1 truncate">Style Utility</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (chainLinkModeActive) return;
                              toggleStyleSeedMode();
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            disabled={chainLinkModeActive}
                            title={styleSeedMode === 'same'
                              ? 'Style passes share the same seed per base prompt. Click to use different seeds per style.'
                              : 'Style passes use different seed groups while respecting generation seed controls. Click to share the same seed.'}
                            className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              styleSeedMode === 'same'
                                ? 'border-emerald-300/35 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/60'
                                : 'border-amber-300/40 bg-amber-500/12 text-amber-100 hover:border-amber-200/65'
                            }`}
                          >
                            <Info size={10} />
                            {styleSeedMode === 'same' ? 'Same Seed' : 'Diff Seed'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (chainLinkModeActive || mobileSelectionMode) return;
                              openCardLabelModal(slot.slotId);
                            }}
                            disabled={chainLinkModeActive || mobileSelectionMode}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:text-emerald-100 hover:border-emerald-300/65 disabled:opacity-45 disabled:cursor-not-allowed"
                          title="Edit card name"
                        >
                          <Pencil size={12} />
                        </button>
                        <div className="relative min-w-[190px] flex-1">
                          {(() => {
                            const slotNameValue = String(slot.label || '').trim() || cardTypeLabel(slot.type);
                            const cardNameOptionsForSlot = cardNameSelectOptions.filter((entry) => !isReservedStyleLabel(entry));
                            const hasExactOption = cardNameOptionsForSlot.some((entry) => normalizeCustomGroupName(entry) === normalizeCustomGroupName(slotNameValue));
                            return (
                          <select
                            value={slotNameValue}
                            onChange={(event) => {
                              if (chainLinkModeActive || mobileSelectionMode) return;
                              const nextLabel = String(event.target.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
                              if (!nextLabel) return;
                              if (isReservedStyleLabel(nextLabel)) {
                                showToast('Style is reserved for the utility card', 'error');
                                return;
                              }
                              updateSlotLabel(slot.slotId, nextLabel);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            disabled={chainLinkModeActive || mobileSelectionMode}
                            className={`w-full h-8 appearance-none bg-black/45 border border-white/20 rounded-md px-2.5 pr-7 text-[11px] font-semibold text-zinc-200 focus:outline-none focus:border-[var(--umbra-accent)] ${UMBRA_THEMED_SELECT_CLASS}`}
                            title="Card name"
                          >
                            {!hasExactOption && (
                              <option value={slotNameValue}>{slotNameValue}</option>
                            )}
                            {cardNameOptionsForSlot.map((optionLabel) => (
                              <option key={`slot-name-option-${slot.slotId}-${optionLabel}`} value={optionLabel}>
                                {optionLabel}
                              </option>
                            ))}
                          </select>
                            );
                          })()}
                          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
                        </div>
                        <button
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (chainLinkModeActive || mobileSelectionMode) return;
                            event.currentTarget.blur();
                            const rect = event.currentTarget.getBoundingClientRect();
                            const clickX = Number.isFinite(event.clientX) && event.clientX > 0
                              ? event.clientX
                              : Math.round(rect.left + rect.width / 2);
                            const clickY = Number.isFinite(event.clientY) && event.clientY > 0
                              ? event.clientY
                              : Math.round(rect.bottom + 6);
                            openCardRandomMenu(slot.slotId, clickX, clickY);
                          }}
                          className={`inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 rounded-md border text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                            slotRandomEnabled
                              ? 'border-cyan-400/45 bg-cyan-500/12 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300/65'
                              : 'border-white/15 bg-white/[0.06] text-zinc-300 hover:text-zinc-100 hover:border-white/25'
                          }`}
                          disabled={chainLinkModeActive || mobileSelectionMode}
                          title="Card controls"
                        >
                          <Sparkles size={11} />
                          Cntrl
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            if (chainLinkModeActive || mobileSelectionMode) return;
                            shuffleSlotVariants(slot.slotId);
                          }}
                          disabled={chainLinkModeActive || mobileSelectionMode || slot.variants.length <= 1}
                          className={`inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 rounded-md border text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                            chainLinkModeActive || slot.variants.length <= 1
                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                              : 'border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-200 hover:text-fuchsia-100 hover:border-fuchsia-300/65'
                          }`}
                          title={hasLiveQueue
                            ? 'Shuffle variants in this card for the next queue. The running queue stays unchanged.'
                            : 'Shuffle variants in this card only'}
                        >
                          <Shuffle size={11} />
                          Shuffle Card
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (chainLinkModeActive || mobileSelectionMode) return;
                        cycleSlotQueueTraversalRole(slot.slotId);
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      disabled={chainLinkModeActive || mobileSelectionMode}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-black uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        slotQueueTraversalRole === 'hold'
                          ? 'border-amber-300/45 bg-amber-500/12 text-amber-100 hover:border-amber-200/70'
                          : slotQueueTraversalRole === 'fast'
                            ? 'border-fuchsia-300/45 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-200/70'
                            : 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-200/65'
                      }`}
                      title={getQueueTraversalRoleTitle(slotQueueTraversalRole)}
                    >
                      {slotQueueTraversalRole === 'hold'
                        ? <Info size={11} />
                        : slotQueueTraversalRole === 'fast'
                          ? <Zap size={11} />
                          : <RotateCw size={11} />}
                      {getQueueTraversalRoleLabel(slotQueueTraversalRole)}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (chainLinkModeActive || mobileSelectionMode) return;
                        addVariant(slot.slotId);
                      }}
                      disabled={chainLinkModeActive || mobileSelectionMode}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 rounded-md border border-emerald-400/45 bg-emerald-500/12 text-emerald-200 hover:text-emerald-100 hover:border-emerald-300/70 text-[10px] font-black uppercase tracking-widest disabled:opacity-45 disabled:cursor-not-allowed"
                      title="Add variant"
                    >
                      <Plus size={12} />
                      Add
                    </button>
                    <div className="min-w-4 flex-1" />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (chainLinkModeActive || mobileSelectionMode) return;
                        requestRemoveSlot(slot.slotId);
                      }}
                      disabled={chainLinkModeActive || mobileSelectionMode}
                      className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/20 bg-red-500/[0.04] text-zinc-500 hover:border-red-400/45 hover:bg-red-500/12 hover:text-red-300 disabled:opacity-45 disabled:cursor-not-allowed"
                      title="Remove card"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 p-2">
                    <div
                      ref={(node) => setSlotVariantViewportRef(slot.slotId, node)}
                      onScroll={(event) => handleVariantViewportScroll(slot.slotId, event)}
                      className="h-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar rounded-lg border border-white/5 bg-black/20 p-1.5 pr-1"
                    >
                      {(() => {
                        const displayVariants = getSlotDisplayVariants(slot, slotIndex);
                        const viewportMetrics = variantViewportMetricsBySlotId[slot.slotId];
                        const shouldVirtualizeVariants = !chainLinkModeActive
                          && !slotHasEditingVariant
                          && displayVariants.length > 6
                          && (viewportMetrics?.clientHeight || 0) > 0;
                        const variantWindow = (() => {
                          if (!shouldVirtualizeVariants || !viewportMetrics) {
                            return {
                              startIndex: 0,
                              endIndex: displayVariants.length - 1,
                              beforeHeight: 0,
                              afterHeight: 0,
                            };
                          }
                          const rawStart = Math.floor(viewportMetrics.scrollTop / POWER_PROMPTER_VARIANT_CARD_STRIDE) - POWER_PROMPTER_VARIANT_VIRTUAL_OVERSCAN;
                          const visibleCount = Math.ceil(viewportMetrics.clientHeight / POWER_PROMPTER_VARIANT_CARD_STRIDE);
                          const rawEnd = rawStart + visibleCount + (POWER_PROMPTER_VARIANT_VIRTUAL_OVERSCAN * 2);
                          const startIndex = Math.max(0, Math.min(displayVariants.length - 1, rawStart));
                          const endIndex = Math.max(startIndex, Math.min(displayVariants.length - 1, rawEnd));
                          const beforeHeight = startIndex > 0
                            ? Math.max(0, (startIndex * POWER_PROMPTER_VARIANT_CARD_STRIDE) - POWER_PROMPTER_VARIANT_CARD_GAP)
                            : 0;
                          const remainingAfter = Math.max(0, displayVariants.length - endIndex - 1);
                          const afterHeight = remainingAfter > 0
                            ? Math.max(0, (remainingAfter * POWER_PROMPTER_VARIANT_CARD_STRIDE) - POWER_PROMPTER_VARIANT_CARD_GAP)
                            : 0;
                          return { startIndex, endIndex, beforeHeight, afterHeight };
                        })();
                        const visibleDisplayVariants = variantWindow.endIndex >= variantWindow.startIndex
                          ? displayVariants.slice(variantWindow.startIndex, variantWindow.endIndex + 1)
                          : [];
                        return (
                          <div className="flex min-h-full flex-col gap-1.5">
                              {variantWindow.beforeHeight > 0 && (
                                <div
                                  aria-hidden="true"
                                  className="shrink-0"
                                  style={{ height: `${variantWindow.beforeHeight}px` }}
                                />
                              )}
                              {visibleDisplayVariants.map(({ variant, actualIndex: variantIdx }) => {
                        const isEditing = editingVariantId === variant.id;
                        const isRevealed = revealedVariantIds.includes(variant.id);
                        const variantTitle = normalizeVariantName(variant.variantName);
                        const isEditingVariantName = editingVariantNameId === variant.id;
                        const variantDraftName = Object.prototype.hasOwnProperty.call(variantNameDrafts, variant.id)
                          ? String(variantNameDrafts[variant.id] || '')
                          : String(variant.variantName || '');
                        const plainEditDraft = Object.prototype.hasOwnProperty.call(variantTextDrafts, variant.id)
                          ? String(variantTextDrafts[variant.id] || '')
                          : String(variant.text || '');
                        const isSkipVariant = (variant as any).skipVariant === true;
                        const isGlobalSearchMatch = globalSearchMatchByVariantId.get(variant.id) === true;
                        const queueVariantState = getQueueVariantState(variant);
                        const status = queueVariantState.status;
                        const setIds = normalizeQueueSetIds(variant.queueSetIds, false);
                        const activeSetIdForVariant = setIds.includes(activeQueueSet)
                          ? activeQueueSet
                          : (setIds[0] || activeQueueSet);
                        const activeSetColor = getSetColor(activeSetIdForVariant);
                        const hasMultipleSets = setIds.length > 1;
                        const setBandGradient = hasMultipleSets
                          ? buildSetBandGradient(setIds, status === 'Active' ? 0.22 : status === 'Queue' ? 0.14 : 0.09)
                          : '';
                        const baseSetCardStyle = undefined;
                        const statusClass = status === 'Active'
                          ? ''
                          : status === 'Queue'
                            ? 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10'
                            : 'text-zinc-500 border-white/10 bg-white/[0.04]';
                        const statusStyle = status === 'Active'
                          ? hasMultipleSets
                            ? {
                              color: '#ecfeff',
                              borderColor: hexToRgba(activeSetColor, 0.58),
                              backgroundColor: hexToRgba(activeSetColor, 0.1),
                              backgroundImage: buildSetBandGradient(setIds, 0.34),
                            }
                            : {
                            color: activeSetColor,
                            borderColor: hexToRgba(activeSetColor, 0.52),
                            backgroundColor: hexToRgba(activeSetColor, 0.16),
                          }
                          : undefined;
                        const activeCardStyle = undefined;
                        const chainLinkModeActive = Boolean(chainLinkEditor);
                        const hasPreviewQueue = hasEffectivePreviewQueue;
                        const cycleControlSetId = hasPreviewQueue
                          ? clampQueueSetId(queuePreviewSetId ?? activeQueueSet)
                          : hasLiveQueue && queueVisualState?.mode === 'selected'
                            ? clampQueueSetId(queueVisualState.activeSetId)
                            : clampQueueSetId(queuePreviewSetId ?? activeQueueSet);
                        const queueCycleCount = Math.max(0, Number(queueVariantState.cycleCount || 0));
                        const displayQueueCycleCount = styleUtilitySlot
                          ? (hasPreviewQueue
                            ? effectivePreviewPromptTokens.length
                            : queueVisualState?.mode === 'selected'
                              ? queueVisualState.prompts.length
                              : queueCycleCount)
                          : queueCycleCount;
                        const queueImageCount = displayQueueCycleCount * estimatedBatchSize;
                        const queueCycleWeight = getQueueCycleWeightForSet((variant as any).queueCycleWeights, cycleControlSetId);
                        const canAdjustQueueCycleWeight = !styleUtilitySlot && !chainLinkModeActive && setIds.includes(cycleControlSetId);
                        const showCycleCounter = Boolean(setIds.length > 0 && (hasLiveQueue || hasPreviewQueue));
                        const savedChainLinks = normalizeChainLinks((variant as any).chainLinks, variant.id);
                        const savedBlockLinks = normalizeBlockLinks((variant as any).blockLinks, variant.id);
                        const isBlockLinkMode = chainLinkEditor?.mode === 'block';
                        const isChainAnchor = chainLinkEditor?.anchorVariantId === variant.id;
                        const isChainLinkedDraft = chainLinkEditor?.draftVariantIds.includes(variant.id) === true;
                        const hasSavedChainLinks = savedChainLinks.length > 0;
                        const hasSavedBlockLinks = savedBlockLinks.length > 0;
                        const chainLinkCount = isChainAnchor ? (chainLinkEditor?.draftVariantIds.length || 0) : savedChainLinks.length;
                        const blockLinkCount = isChainAnchor ? (chainLinkEditor?.draftVariantIds.length || 0) : savedBlockLinks.length;
                        const isRelationshipAnchor = isChainAnchor;
                        const isRelationshipDraftTarget = isChainLinkedDraft;
                        return (
                          <React.Fragment key={variant.id}>
                          <div
                            ref={(node) => setVariantSurfaceRef(variant.id, node)}
                            style={{
                              ...(variantSurfaceStyle || {}),
                              ...(baseSetCardStyle || {}),
                              ...(activeCardStyle || {}),
                              ...(isEditing ? { contain: 'none' as const } : {}),
                            }}
                            draggable={!isEditing && !chainLinkEditor && !touchRemoteMode}
                            onDragStart={(event) => {
                              if (suppressedVariantDragIdRef.current === variant.id || isEditing || chainLinkEditor) {
                                event.preventDefault();
                                return;
                              }
                              const origin = event.target as HTMLElement | null;
                              if (
                                origin?.closest?.('[data-no-variant-drag="true"]')
                                || origin?.tagName === 'INPUT'
                                || origin?.tagName === 'TEXTAREA'
                                || Boolean(origin && (origin as HTMLElement).isContentEditable)
                              ) {
                                event.preventDefault();
                                return;
                              }
                              event.stopPropagation();
                              variantDragRef.current = { slotId: slot.slotId, variantId: variant.id };
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', `variant:${slot.slotId}:${variant.id}`);
                            }}
                            onDragOver={(event) => {
                              if (hasDraggedPromptTokenType(event)) return;
                              const dragging = variantDragRef.current;
                              if (!dragging) return;
                              if (dragging.variantId === variant.id && dragging.slotId === slot.slotId) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              setVariantDropSlotId(slot.slotId);
                            }}
                            onDrop={(event) => {
                              if (hasDraggedPromptTokenType(event)) return;
                              const dragging = variantDragRef.current;
                              if (!dragging) return;
                              event.preventDefault();
                              event.stopPropagation();
                              variantDragRef.current = null;
                              setVariantDropSlotId(null);
                              if (dragging.slotId === slot.slotId) {
                                moveVariantWithinSlot(slot.slotId, dragging.variantId, variantIdx);
                              } else {
                                moveVariantToSlot(dragging.slotId, dragging.variantId, slot.slotId, variantIdx);
                              }
                            }}
                            onDragEnd={(event) => {
                              event.stopPropagation();
                              variantDragRef.current = null;
                              setVariantDropSlotId(null);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (chainLinkEditor && toggleChainLinkTarget(slot.slotId, variant)) {
                                return;
                              }
                              setActiveSlotId(slot.slotId);
                              setActiveVariantId(variant.id);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (chainLinkModeActive) return;
                              setActiveSlotId(slot.slotId);
                              setActiveVariantId(variant.id);
                              const anchor = getElementContextMenuPoint(event);
                              openCardContextMenu(slot.slotId, anchor.x, anchor.y);
                            }}
                            className={`h-[148px] min-h-[148px] overflow-visible rounded-md border px-2 py-1.5 text-[11px] ${isEditing ? 'cursor-text' : chainLinkEditor ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} transition-colors ${
                              isRelationshipAnchor
                                ? isBlockLinkMode
                                  ? 'border-red-300/80 bg-red-500/14 text-zinc-100 shadow-[0_0_0_1px_rgba(248,113,113,0.24)]'
                                  : 'border-emerald-300/80 bg-emerald-500/14 text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.26)]'
                                : isRelationshipDraftTarget
                                  ? isBlockLinkMode
                                    ? 'border-red-300/80 bg-red-500/16 text-zinc-100 shadow-[0_0_0_1px_rgba(248,113,113,0.24)]'
                                    : 'border-emerald-300/80 bg-emerald-500/16 text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.24)]'
                                  : isRevealed
                                    ? 'border-cyan-300/75 bg-cyan-500/18 text-zinc-100 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
                                    : isEditing
                                      ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/15 text-zinc-100'
                                      : isSkipVariant
                                        ? 'border-sky-300/50 bg-sky-500/10 text-sky-100'
                                      : status === 'Active'
                                        ? 'text-zinc-100'
                                        : isGlobalSearchMatch
                                          ? 'border-amber-300/70 bg-amber-500/14 text-zinc-100 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]'
                                        : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`uppercase tracking-widest ${isEditing ? 'text-[10px] text-emerald-300' : 'text-[10px] text-zinc-500'}`}>
                                {isEditing ? 'Editing' : formatVariantPositionLabel(variantIdx)}
                              </span>
                              <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${statusClass}`} style={statusStyle}>{status}</span>
                              {isSkipVariant && (
                                <span className="rounded border border-sky-300/35 bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-100">
                                  Skip
                                </span>
                              )}
                              {slot.variants.length > 1 && (
                                <div className="ml-auto flex items-center gap-1">
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || isBlockLinkMode))) return;
                                      beginChainLinkEdit(slot.slotId, variant, 'link');
                                    }}
                                    disabled={mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || isBlockLinkMode))}
                                    className={`p-0.5 rounded border ${
                                      isChainAnchor && !isBlockLinkMode
                                        ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-200'
                                        : hasSavedChainLinks
                                          ? 'border-emerald-300/45 bg-emerald-500/12 text-emerald-200'
                                          : 'border-white/10 text-zinc-500 hover:text-emerald-200 hover:border-emerald-300/45'
                                    }`}
                                    title={hasSavedChainLinks ? `Edit ${savedChainLinks.length} Chain Link${savedChainLinks.length === 1 ? '' : 's'}` : 'Create Chain Links'}
                                  >
                                    <Link2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || !isBlockLinkMode))) return;
                                      beginChainLinkEdit(slot.slotId, variant, 'block');
                                    }}
                                    disabled={mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || !isBlockLinkMode))}
                                    className={`p-0.5 rounded border ${
                                      isChainAnchor && isBlockLinkMode
                                        ? 'border-red-300/60 bg-red-500/15 text-red-200'
                                        : hasSavedBlockLinks
                                          ? 'border-red-300/45 bg-red-500/12 text-red-200'
                                          : 'border-white/10 text-zinc-500 hover:text-red-200 hover:border-red-300/45'
                                    }`}
                                    title={hasSavedBlockLinks ? `Edit ${savedBlockLinks.length} Block${savedBlockLinks.length === 1 ? '' : 's'}` : 'Create Blocks'}
                                  >
                                    <Ban size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (chainLinkModeActive || mobileSelectionMode) return;
                                      openExpandedVariantEditor(slot.slotId, variant, slotIndex, variantIdx);
                                    }}
                                    disabled={chainLinkModeActive || mobileSelectionMode}
                                    className="p-0.5 rounded border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Open larger prompt editor"
                                  >
                                    <Maximize2 size={12} />
                                  </button>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (chainLinkModeActive || mobileSelectionMode) return;
                                      moveVariantWithinSlot(slot.slotId, variant.id, variantIdx - 1);
                                    }}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    disabled={chainLinkModeActive || mobileSelectionMode || variantIdx <= 0}
                                    className="p-0.5 rounded border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Move variant up"
                                  >
                                    <ChevronUp size={12} />
                                  </button>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (chainLinkModeActive || mobileSelectionMode) return;
                                      moveVariantWithinSlot(slot.slotId, variant.id, variantIdx + 1);
                                    }}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    disabled={chainLinkModeActive || mobileSelectionMode || variantIdx >= slot.variants.length - 1}
                                    className="p-0.5 rounded border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Move variant down"
                                  >
                                    <ChevronDown size={12} />
                                  </button>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (chainLinkModeActive || mobileSelectionMode) return;
                                      removeVariant(slot.slotId, variant.id);
                                    }}
                                    disabled={chainLinkModeActive || mobileSelectionMode}
                                    className="text-zinc-500 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Remove variant"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                              {slot.variants.length <= 1 && (
                                <div className="ml-auto flex items-center gap-1">
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || isBlockLinkMode))) return;
                                      beginChainLinkEdit(slot.slotId, variant, 'link');
                                    }}
                                    disabled={mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || isBlockLinkMode))}
                                    className={`p-0.5 rounded border ${
                                      isChainAnchor && !isBlockLinkMode
                                        ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-200'
                                        : hasSavedChainLinks
                                          ? 'border-emerald-300/45 bg-emerald-500/12 text-emerald-200'
                                          : 'border-white/10 text-zinc-500 hover:text-emerald-200 hover:border-emerald-300/45'
                                    }`}
                                    title={hasSavedChainLinks ? `Edit ${savedChainLinks.length} Chain Link${savedChainLinks.length === 1 ? '' : 's'}` : 'Create Chain Links'}
                                  >
                                    <Link2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || !isBlockLinkMode))) return;
                                      beginChainLinkEdit(slot.slotId, variant, 'block');
                                    }}
                                    disabled={mobileSelectionMode || (chainLinkModeActive && (!isChainAnchor || !isBlockLinkMode))}
                                    className={`p-0.5 rounded border ${
                                      isChainAnchor && isBlockLinkMode
                                        ? 'border-red-300/60 bg-red-500/15 text-red-200'
                                        : hasSavedBlockLinks
                                          ? 'border-red-300/45 bg-red-500/12 text-red-200'
                                          : 'border-white/10 text-zinc-500 hover:text-red-200 hover:border-red-300/45'
                                    }`}
                                    title={hasSavedBlockLinks ? `Edit ${savedBlockLinks.length} Block${savedBlockLinks.length === 1 ? '' : 's'}` : 'Create Blocks'}
                                  >
                                    <Ban size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    draggable={false}
                                    data-no-variant-drag="true"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (chainLinkModeActive || mobileSelectionMode) return;
                                      openExpandedVariantEditor(slot.slotId, variant, slotIndex, variantIdx);
                                    }}
                                    disabled={chainLinkModeActive || mobileSelectionMode}
                                    className="p-0.5 rounded border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Open larger prompt editor"
                                  >
                                    <Maximize2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                            {isEditingVariantName ? (
                              <input
                                value={variantDraftName}
                                onChange={(event) => {
                                  const nextValue = String(event.target.value || '');
                                  setVariantNameDrafts((prev) => ({ ...prev, [variant.id]: nextValue }));
                                }}
                                onClick={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                                onFocus={(event) => {
                                  event.stopPropagation();
                                  setActiveSlotId(slot.slotId);
                                  setActiveVariantId(variant.id);
                                }}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                    return;
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelEditingVariantName(variant.id);
                                    event.currentTarget.blur();
                                  }
                                }}
                                onBlur={() => {
                                  commitVariantName(slot.slotId, variant);
                                }}
                                className="mt-1 w-full bg-black/30 border border-emerald-400/45 rounded px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-300"
                                placeholder={`${formatVariantPositionLabel(variantIdx)} name...`}
                                autoFocus
                              />
                            ) : (
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  {variantTitle ? (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (chainLinkModeActive || mobileSelectionMode) return;
                                        startEditingVariantName(slot.slotId, variant);
                                      }}
                                      onMouseDown={(event) => event.stopPropagation()}
                                      disabled={chainLinkModeActive || mobileSelectionMode}
                                      className="inline-flex items-center max-w-full rounded-full border border-emerald-400/45 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 hover:border-emerald-300/70 hover:text-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Click to edit variant name"
                                    >
                                      <Pencil size={10} className="mr-1 shrink-0" />
                                      <span className="truncate">{variantTitle}</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (chainLinkModeActive || mobileSelectionMode) return;
                                        startEditingVariantName(slot.slotId, variant);
                                      }}
                                      onMouseDown={(event) => event.stopPropagation()}
                                      disabled={chainLinkModeActive || mobileSelectionMode}
                                      className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:border-emerald-300/70 hover:text-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Name this variant"
                                    >
                                      <Pencil size={10} className="mr-1" />
                                      Name
                                    </button>
                                  )}
                                </div>
                                {showCycleCounter && styleUtilitySlot && (
                                  <div className="shrink-0 inline-flex items-center">
                                    <span
                                      className="shrink-0 inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200"
                                      title={`${displayQueueCycleCount} style pass${displayQueueCycleCount === 1 ? '' : 'es'} x batch ${estimatedBatchSize} for Set ${cycleControlSetId}`}
                                    >
                                      {queueImageCount} Img
                                    </span>
                                  </div>
                                )}
                                {showCycleCounter && !styleUtilitySlot && (
                                  <div className="shrink-0 inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        adjustVariantQueueCycleWeight(slot.slotId, variant.id, cycleControlSetId, -1);
                                      }}
                                      onMouseDown={(event) => event.stopPropagation()}
                                      disabled={!canAdjustQueueCycleWeight || queueCycleWeight <= 1}
                                      title={`Decrease how often this variant is cycled for Set ${cycleControlSetId}`}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-500/18 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      <ChevronDown size={11} />
                                    </button>
                                    <span
                                      title={`How many times this enabled variant appears in the queued set. Weight ${queueCycleWeight} for Set ${cycleControlSetId}.`}
                                      className="shrink-0 inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200"
                                    >
                                      {queueCycleWeight} Cycle{queueCycleWeight === 1 ? '' : 's'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        adjustVariantQueueCycleWeight(slot.slotId, variant.id, cycleControlSetId, 1);
                                      }}
                                      onMouseDown={(event) => event.stopPropagation()}
                                      disabled={!canAdjustQueueCycleWeight || queueCycleWeight >= POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT}
                                      title={`Increase how often this variant is cycled for Set ${cycleControlSetId}`}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-500/18 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      <ChevronUp size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <div
                              ref={(node) => setVariantPromptFieldRef(variant.id, node)}
                              data-no-variant-drag="true"
                              draggable={false}
                              className={`relative z-30 mt-1 w-full min-w-0 rounded border px-2 py-1 h-[50px] max-h-[50px] flex flex-wrap items-start gap-1 overflow-hidden transition-colors ${chainLinkModeActive ? 'cursor-pointer' : 'cursor-text'} ${
                                variantPromptDropId === variant.id
                                  ? 'border-cyan-300/70 bg-cyan-950/95'
                                  : 'border-white/10 bg-black'
                              }`}
                              onPointerDownCapture={(event) => {
                                event.stopPropagation();
                                suppressedVariantDragIdRef.current = variant.id;
                              }}
                              onMouseDownCapture={(event) => {
                                event.stopPropagation();
                                suppressedVariantDragIdRef.current = variant.id;
                              }}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                suppressedVariantDragIdRef.current = variant.id;
                              }}
                              onWheel={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (chainLinkEditor && toggleChainLinkTarget(slot.slotId, variant)) {
                                  return;
                                }
                                if (isEditing) {
                                  setActiveSlotId(slot.slotId);
                                  setActiveVariantId(variant.id);
                                  return;
                                }
                                if (!chainLinkModeActive) {
                                  startEditingVariantText(slot.slotId, variant);
                                }
                              }}
                              onDragStartCapture={(event) => {
                                if (hasDraggedPromptTokenType(event)) return;
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDragStart={(event) => {
                                if (hasDraggedPromptTokenType(event)) return;
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onDragOver={(event) => {
                                if (mobileSelectionMode || chainLinkModeActive) return;
                                if (!hasDraggedPromptTokenType(event)) return;
                                event.preventDefault();
                                event.stopPropagation();
                                event.dataTransfer.dropEffect = 'copy';
                                setVariantPromptDropId(variant.id);
                              }}
                              onDragLeave={(event) => {
                                const nextTarget = event.relatedTarget as Node | null;
                                if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                                setVariantPromptDropId((prev) => (prev === variant.id ? null : prev));
                              }}
                              onDrop={(event) => {
                                if (mobileSelectionMode || chainLinkModeActive) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                applyDroppedTokenToVariant(event as React.DragEvent<HTMLElement | HTMLTextAreaElement | HTMLInputElement>, slot.slotId, variant);
                              }}
                            >
                              <textarea
                                ref={(node) => {
                                  inlineVariantTextareaRefs.current[variant.id] = node;
                                  if (!node) return;
                                  resetVariantTextareaHeight(node);
                                }}
                                data-chip-draft="true"
                                data-variant-plain-edit="true"
                                data-no-variant-drag="true"
                                draggable={false}
                                readOnly={mobileSelectionMode || chainLinkModeActive || isSkipVariant}
                                value={plainEditDraft}
                                onChange={(event) => {
                                  if (mobileSelectionMode || chainLinkModeActive) return;
                                  const rawDraft = String(event.target.value || '');
                                  setEditingVariantId(variant.id);
                                  setVariantTextDrafts((prev) => ({ ...prev, [variant.id]: rawDraft }));
                                }}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (mobileSelectionMode || chainLinkModeActive) return;
                                  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                                    const weighted = applyPromptWeightShortcutToTextarea(
                                      event.currentTarget,
                                      event.key === 'ArrowUp' ? 0.1 : -0.1
                                    );
                                    if (weighted) {
                                      event.preventDefault();
                                      setVariantTextDrafts((prev) => ({ ...prev, [variant.id]: weighted.nextValue }));
                                      window.requestAnimationFrame(() => {
                                        const target = inlineVariantTextareaRefs.current[variant.id];
                                        if (!target) return;
                                        target.focus({ preventScroll: true });
                                        try {
                                          target.setSelectionRange(weighted.selectionStart, weighted.selectionEnd);
                                        } catch {
                                          // ignore selection restore failures
                                        }
                                        resetVariantTextareaHeight(target);
                                      });
                                    }
                                    return;
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    commitVariantTextEdit(slot.slotId, variant, event.currentTarget.value);
                                    resetVariantTextareaHeight(event.currentTarget);
                                    event.currentTarget.blur();
                                    return;
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelVariantTextEdit(variant.id);
                                    resetVariantTextareaHeight(event.currentTarget);
                                    event.currentTarget.blur();
                                  }
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (chainLinkEditor && toggleChainLinkTarget(slot.slotId, variant)) {
                                    event.currentTarget.blur();
                                    return;
                                  }
                                }}
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  suppressedVariantDragIdRef.current = variant.id;
                                }}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  suppressedVariantDragIdRef.current = variant.id;
                                }}
                                onDragStart={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  suppressedVariantDragIdRef.current = variant.id;
                                }}
                                onWheel={(event) => event.stopPropagation()}
                                onFocus={(event) => {
                                  event.stopPropagation();
                                  setActiveSlotId(slot.slotId);
                                  setActiveVariantId(variant.id);
                                  setEditingPromptChip(null);
                                  if (!mobileSelectionMode && !chainLinkModeActive && !isEditing) {
                                    startEditingVariantText(slot.slotId, variant);
                                  }
                                }}
                                onBlur={(event) => {
                                  suppressedVariantDragIdRef.current = '';
                                  if (!mobileSelectionMode && !chainLinkModeActive) {
                                    commitVariantTextEdit(slot.slotId, variant, event.currentTarget.value);
                                  }
                                  resetVariantTextareaHeight(event.currentTarget);
                                }}
                                onDragOver={(event) => {
                                  if (mobileSelectionMode || chainLinkModeActive) return;
                                  if (!hasDraggedPromptTokenType(event)) return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  event.dataTransfer.dropEffect = 'copy';
                                  setVariantPromptDropId(variant.id);
                                }}
                                onDrop={(event) => {
                                  if (mobileSelectionMode || chainLinkModeActive) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    return;
                                  }
                                  suppressedVariantDragIdRef.current = '';
                                  applyDroppedTokenToVariant(event, slot.slotId, variant);
                                }}
                                rows={2}
                                aria-label="Variant prompt text"
                                className="absolute inset-px z-[90] block h-[calc(100%-2px)] max-h-[calc(100%-2px)] min-h-0 w-[calc(100%-2px)] min-w-0 cursor-text select-text resize-none overflow-y-auto overscroll-contain custom-scrollbar whitespace-pre-wrap break-words rounded-sm border-0 bg-black px-2 py-1 outline-none text-[11px] leading-5 text-zinc-100 caret-white placeholder:text-zinc-600 selection:bg-[var(--umbra-accent)]/35 focus:bg-black focus:ring-0 read-only:cursor-pointer"
                                style={{
                                  caretColor: '#ffffff',
                                  color: '#f4f4f5',
                                  WebkitTextFillColor: '#f4f4f5',
                                  WebkitUserSelect: 'text',
                                  userSelect: 'text',
                                }}
                                placeholder={isSkipVariant ? 'Skip variant - no prompt text' : 'Variant text...'}
                              />
                            </div>
                            <div className="mt-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1">
                                {ALL_QUEUE_SET_IDS.map((setId) => {
                                  const active = setIds.includes(setId);
                                  const setColor = getSetColor(setId);
                                  return (
                                    <button
                                      key={`${variant.id}-set-btn-${setId}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (chainLinkModeActive) return;
                                        const nextSetIds = active
                                          ? setIds.filter((entry) => entry !== setId)
                                          : [...setIds, setId].sort((a, b) => a - b);
                                        setVariantSets(slot.slotId, variant.id, nextSetIds);
                                      }}
                                      onMouseDown={(event) => event.stopPropagation()}
                                      disabled={chainLinkModeActive}
                                      className="px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                                      style={{
                                        color: active ? setColor : '#9ca3af',
                                        borderColor: active ? hexToRgba(setColor, 0.52) : 'rgba(255,255,255,0.16)',
                                        backgroundColor: active ? hexToRgba(setColor, 0.18) : 'rgba(255,255,255,0.03)',
                                      }}
                                      title={`Toggle Set ${setId}`}
                                    >
                                      S{setId}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          {isChainAnchor && (
                            <div
                              data-no-variant-drag="true"
                              className={`overflow-hidden rounded border px-1.5 py-1 ${
                                isBlockLinkMode
                                  ? 'border-red-400/30 bg-red-500/8'
                                  : 'border-emerald-400/30 bg-emerald-500/8'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`mr-auto inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${
                                  isBlockLinkMode ? 'text-red-200' : 'text-emerald-200'
                                }`}>
                                  {isBlockLinkMode ? <Ban size={10} className="shrink-0" /> : <Link2 size={10} className="shrink-0" />}
                                  <span className="truncate">{isBlockLinkMode ? blockLinkCount : chainLinkCount} {isBlockLinkMode ? 'Blocked' : 'Linked'}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    saveChainLinks();
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                    isBlockLinkMode
                                      ? 'border-red-300/40 bg-red-500/12 text-red-200 hover:border-red-300/70 hover:text-red-100'
                                      : 'border-emerald-300/40 bg-emerald-500/12 text-emerald-200 hover:border-emerald-300/70 hover:text-emerald-100'
                                  }`}
                                  title={isBlockLinkMode ? 'Save Blocks' : 'Save Chain Links'}
                                >
                                  <Check size={10} />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    clearChainLinkDraft();
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                                  title={isBlockLinkMode ? 'Clear draft Blocks' : 'Clear draft Chain Links'}
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    closeChainLinkEditor();
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                                  title={isBlockLinkMode ? 'Done editing Blocks' : 'Done editing Chain Links'}
                                >
                                  <X size={10} />
                                  Done
                                </button>
                              </div>
                            </div>
                          )}
                          </React.Fragment>
                        );
                              })}
                              {variantWindow.afterHeight > 0 && (
                                <div
                                  aria-hidden="true"
                                  className="shrink-0"
                                  style={{ height: `${variantWindow.afterHeight}px` }}
                                />
                              )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                      <div className="h-full flex items-center justify-center px-1"><ArrowRight size={14} className="text-zinc-600" /></div>
                    </div>
                  );
                })}
                {virtualSlotWindow.afterWidth > 0 && (
                  <div
                    aria-hidden="true"
                    className="h-full min-h-0 shrink-0"
                    style={{ width: `${virtualSlotWindow.afterWidth}px` }}
                  />
                )}
              </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {cardRandomMenu && randomMenuSlot && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="fixed z-[120] w-[380px] rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/70"
          style={{ left: `${randomMenuLeft}px`, top: `${randomMenuTop}px` }}
          onMouseDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-zinc-200 truncate">Card Controls</div>
              <div className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">
                <Sparkles size={10} />
                Cntrl
              </div>
            </div>
            <div className="mt-1 text-[10px] text-zinc-500 truncate">{randomMenuSlot.label} Card</div>
          </div>

          <div className="px-3 py-2 border-b border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Max Variants</span>
              <span className="text-[10px] font-semibold text-zinc-300">
                {clampedRandomMenuMaxVariants}
                {' / '}
                {Math.max(1, randomMenuEligibleVariantCount)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(1, randomMenuEligibleVariantCount)}
              value={clampedRandomMenuMaxVariants}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const nextMax = Math.max(1, Math.min(randomMenuEligibleVariantCount, Math.floor(Number(event.target.value) || 1)));
                setCardRandomMenu((prev) => (
                  prev && prev.slotId === randomMenuSlot.slotId
                    ? { ...prev, maxVariants: nextMax }
                    : prev
                ));
              }}
              className="w-full accent-sky-400"
            />
            <div className="text-[10px] text-zinc-500">
              Randomly picks exactly the selected count from this card.
            </div>
          </div>

          <div className="px-3 py-2 flex items-center gap-1 flex-wrap">
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => {
                applySlotNameRandom(
                  randomMenuSlot.slotId,
                  cardRandomMenu.targetSetId,
                  normalizeVariantNameList(cardRandomMenu.selectedNames),
                  clampedRandomMenuMaxVariants
                );
              }}
              className="px-2 py-1 rounded border text-[10px] font-semibold transition-colors"
              style={{
                color: getSetColor(cardRandomMenu.targetSetId),
                borderColor: hexToRgba(getSetColor(cardRandomMenu.targetSetId), 0.48),
                backgroundColor: hexToRgba(getSetColor(cardRandomMenu.targetSetId), 0.14),
              }}
            >
              Randomize
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => disableSlotRandom(randomMenuSlot.slotId)}
              className="px-2 py-1 rounded border border-white/10 text-[10px] font-semibold text-zinc-300 hover:text-red-300 hover:border-red-400/40"
            >
              Random Off
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => clearSlotVariantSets(randomMenuSlot.slotId, cardRandomMenu.targetSetId)}
              className="px-2 py-1 rounded border border-white/10 text-[10px] font-semibold text-zinc-300 hover:text-red-300 hover:border-red-400/40"
            >
              Clear Set
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => clearSlotVariantSets(randomMenuSlot.slotId)}
              className="px-2 py-1 rounded border border-white/10 text-[10px] font-semibold text-zinc-300 hover:text-red-300 hover:border-red-400/40"
              title="Clear all set assignments for every variant in this card"
            >
              Clear All Sets
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => setCardRandomMenu(null)}
              className="px-2 py-1 rounded border border-white/10 text-[10px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/20"
            >
              Close
            </button>
          </div>
        </div>,
        window.document.body
      )}

      {expandedVariantEditor && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 top-20 z-[12028] flex justify-center px-4"
        >
          <div
            className="pointer-events-auto w-[min(860px,calc(100vw-380px))] max-w-[calc(100vw-32px)] min-w-[420px] overflow-hidden rounded-2xl border border-white/15 bg-[#07080c]/98 shadow-2xl shadow-black/70"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onInput={(event) => {
              event.stopPropagation();
            }}
            onChange={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">Expanded Variant Editor</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                    {expandedVariantEditorTarget?.slot.label || expandedVariantEditor.slotLabel || 'Card'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                    {normalizeVariantName(expandedVariantEditorTarget?.variant.variantName || expandedVariantEditor.variantName) || 'Unnamed Variant'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setExpandedVariantEditor(null);
                  setExpandedVariantSuggestions([]);
                  setExpandedVariantSuggestionOpen(false);
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.05] text-zinc-300 hover:text-zinc-100 hover:border-white/25"
                title="Close expanded editor"
              >
                <X size={14} />
              </button>
            </div>
            <div className="border-b border-white/8 px-4 py-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Variant Name</div>
                  <input
                    value={String(expandedVariantEditor.variantName || '')}
                    onChange={(event) => {
                      const nextValue = String(event.target.value || '');
                      setExpandedVariantEditor((prev) => (prev ? { ...prev, variantName: nextValue } : prev));
                    }}
                    className="w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-300/55"
                    placeholder="Name this variant..."
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Queue Sets</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ALL_QUEUE_SET_IDS.map((setId) => {
                      const active = expandedVariantEditor.queueSetIds.includes(setId);
                      const setColor = getSetColor(setId);
                      return (
                        <button
                          key={`expanded-variant-set-${setId}`}
                          type="button"
                          onClick={() => {
                            setExpandedVariantEditor((prev) => {
                              if (!prev) return prev;
                              const currentSetIds = normalizeQueueSetIds(prev.queueSetIds, false);
                              const nextSetIds = currentSetIds.includes(setId)
                                ? currentSetIds.filter((entry) => entry !== setId)
                                : [...currentSetIds, setId].sort((a, b) => a - b);
                              return { ...prev, queueSetIds: nextSetIds };
                            });
                          }}
                          className="rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                          style={{
                            color: active ? setColor : '#9ca3af',
                            borderColor: active ? hexToRgba(setColor, 0.5) : 'rgba(255,255,255,0.10)',
                            backgroundColor: active ? hexToRgba(setColor, 0.16) : 'rgba(255,255,255,0.04)',
                          }}
                          title={`${active ? 'Remove from' : 'Add to'} Set ${setId}`}
                        >
                          Set {setId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <textarea
                  ref={setExpandedVariantTextareaNode}
                  value={expandedVariantEditorDraft}
                  onChange={(event) => {
                    event.stopPropagation();
                    updateExpandedVariantDraftFromTextarea(event.currentTarget);
                  }}
                  onBeforeInput={(event) => {
                    event.stopPropagation();
                  }}
                  onInput={(event) => {
                    event.stopPropagation();
                    updateExpandedVariantDraftFromTextarea(event.currentTarget);
                  }}
                  onPaste={(event) => {
                    event.stopPropagation();
                  }}
                  onCompositionEnd={(event) => {
                    event.stopPropagation();
                    updateExpandedVariantDraftFromTextarea(event.currentTarget);
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                      const weighted = applyPromptWeightShortcutToTextarea(
                        event.currentTarget,
                        event.key === 'ArrowUp' ? 0.1 : -0.1
                      );
                      if (weighted) {
                        event.preventDefault();
                        setExpandedVariantEditor((prev) => (prev ? { ...prev, draft: weighted.nextValue, dirty: true } : prev));
                        setExpandedVariantEditorCaret({ start: weighted.selectionStart, end: weighted.selectionEnd });
                        setExpandedVariantSuggestionOpen(false);
                        window.requestAnimationFrame(() => {
                          const textarea = expandedVariantTextareaRef.current;
                          if (!textarea) return;
                          textarea.focus({ preventScroll: true });
                          try {
                            textarea.setSelectionRange(weighted.selectionStart, weighted.selectionEnd);
                          } catch {
                            // ignore selection restore failures
                          }
                        });
                      }
                      return;
                    }
                    if (expandedVariantSuggestionOpen && expandedVariantSuggestions.length > 0) {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setExpandedVariantSuggestionIndex((prev) => Math.min(expandedVariantSuggestions.length - 1, prev + 1));
                        return;
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setExpandedVariantSuggestionIndex((prev) => Math.max(0, prev - 1));
                        return;
                      }
                      if (event.key === 'Tab' || event.key === 'Enter') {
                        const selected = expandedVariantSuggestions[expandedVariantSuggestionIndex] || expandedVariantSuggestions[0];
                        if (selected) {
                          event.preventDefault();
                          applyExpandedVariantSuggestion(selected);
                          return;
                        }
                      }
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      commitExpandedVariantEditor();
                      return;
                    }
                    if (event.key === 'Escape') {
                      if (expandedVariantSuggestionOpen) {
                        event.preventDefault();
                        setExpandedVariantSuggestionOpen(false);
                        return;
                      }
                      event.preventDefault();
                      setExpandedVariantEditor(null);
                      setExpandedVariantSuggestions([]);
                      setExpandedVariantSuggestionOpen(false);
                    }
                  }}
                  onClick={(event) => {
                    syncExpandedVariantEditorCaret(event.currentTarget);
                  }}
                  onKeyUp={(event) => {
                    syncExpandedVariantEditorCaret(event.currentTarget);
                  }}
                  onSelect={(event) => {
                    syncExpandedVariantEditorCaret(event.currentTarget);
                  }}
                  className="min-h-[260px] max-h-[42vh] w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-[13px] leading-6 text-zinc-100 outline-none focus:border-cyan-300/60"
                  placeholder="Variant text..."
                />
              </div>
              <div className="min-w-0 space-y-3">
                <div className="rounded-xl border border-white/12 bg-[#090b11]/96 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Suggestion CSVs</div>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = effectiveExpandedVariantCsvSourceIds.length === enabledCsvSourceIds.length && enabledCsvSourceIds.length > 0;
                        setExpandedVariantCsvSourceIds(allSelected ? [] : enabledCsvSourceIds);
                        setExpandedVariantSuggestions([]);
                        setExpandedVariantSuggestionOpen(false);
                      }}
                      className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-cyan-100"
                    >
                      {effectiveExpandedVariantCsvSourceIds.length === enabledCsvSourceIds.length && enabledCsvSourceIds.length > 0 ? 'None' : 'All'}
                    </button>
                  </div>
                  <div className="max-h-28 overflow-y-auto p-2 custom-scrollbar">
                    {enabledCsvSourceIds.length === 0 ? (
                      <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">
                        Enable CSVs in the Tag Browser library first.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {enabledCsvSourceIds.map((sourceId) => {
                          const active = effectiveExpandedVariantCsvSourceIds.includes(sourceId);
                          const typeLabel = getCsvSourceTypeLabel(sourceId);
                          return (
                            <button
                              key={`expanded-variant-csv-${sourceId}`}
                              type="button"
                              onClick={() => {
                                setExpandedVariantCsvSourceIds((prev) => {
                                  const current = normalizeCsvSourceIds(prev);
                                  return current.includes(sourceId)
                                    ? current.filter((entry) => entry !== sourceId)
                                    : [...current, sourceId];
                                });
                                setExpandedVariantSuggestions([]);
                                setExpandedVariantSuggestionOpen(false);
                              }}
                              className={`max-w-full rounded-md border px-2 py-1 text-left text-[10px] transition-colors ${
                                active
                                  ? 'border-cyan-300/35 bg-cyan-400/12 text-cyan-50'
                                  : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                              }`}
                              title={`${active ? 'Disable' : 'Enable'} ${sourceId} for this editor`}
                            >
                              <span className="mr-1 font-black uppercase tracking-wider opacity-70">{typeLabel}</span>
                              <span className="font-semibold">{getCsvSourceDisplayName(sourceId)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-white/12 bg-[#090b11]/96 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Inline Suggestions</div>
                    <div className="text-[10px] text-zinc-600">{effectiveExpandedVariantCsvSourceIds.length} CSV{effectiveExpandedVariantCsvSourceIds.length === 1 ? '' : 's'}</div>
                  </div>
                  <div
                    className="max-h-[42vh] min-h-[260px] overflow-y-auto overscroll-contain custom-scrollbar"
                    onWheel={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {expandedVariantSuggestionLoading && expandedVariantSuggestions.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-zinc-400">
                        <Loader2 size={12} className="animate-spin" />
                        Searching tags...
                      </div>
                    ) : expandedVariantSuggestions.length > 0 ? (
                      expandedVariantSuggestions.map((entry, index) => {
                        const active = index === expandedVariantSuggestionIndex;
                        const primary = cleanPowerPrompterSearchToken(entry.tag);
                        const secondary = entry.extra
                          ? cleanPowerPrompterSearchToken(entry.extra)
                          : '';
                        return (
                          <button
                            key={`expanded-variant-suggestion-${primary}-${index}`}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              applyExpandedVariantSuggestion(entry);
                            }}
                            className={`group w-full border-b border-white/5 px-3 py-2 text-left last:border-b-0 ${
                              active ? 'bg-cyan-500/16 text-cyan-100' : 'text-zinc-200 hover:bg-white/[0.05]'
                            }`}
                            title={`Insert ${buildSuggestionInsertionText(entry)}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="block min-w-0 flex-1 truncate text-[11px] font-semibold">
                                {primary}
                              </span>
                              <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-zinc-600 transition-opacity group-hover:opacity-100">
                                {entry.type === 'character' ? 'Char' : 'Tag'}
                              </span>
                            </div>
                            {secondary ? (
                              <div className="mt-1 border-l border-white/5 pl-2 text-[10px] leading-[1.35] text-zinc-500 whitespace-normal break-words">
                                {secondary}
                              </div>
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-3 text-[11px] text-zinc-500">
                        Suggestions show up here while you type, and you can keep using the tag browser while this editor is open.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 mt-1 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
                <span>Tag browser and inline suggestions append a trailing comma here, but prompt export stays unchanged.</span>
                <span>Press Ctrl+Enter to save</span>
              </div>
              {!expandedVariantEditorTarget ? (
                <div className="lg:col-span-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  This variant changed while the editor was open. The draft is still here, but save is disabled until the target resolves again.
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                onClick={() => {
                  setExpandedVariantEditor(null);
                  setExpandedVariantSuggestions([]);
                  setExpandedVariantSuggestionOpen(false);
                }}
                className="px-3 py-1.5 rounded-md border border-white/15 bg-white/[0.05] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/25"
              >
                Cancel
              </button>
              <button
                onClick={commitExpandedVariantEditor}
                disabled={!expandedVariantEditorTarget}
                className="px-3 py-1.5 rounded-md border border-cyan-400/40 bg-cyan-500/14 text-[11px] font-semibold text-cyan-100 hover:border-cyan-300/65 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save Prompt
              </button>
            </div>
          </div>
        </div>,
        window.document.body
      )}

      {cardMenu && menuCardSlot && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="fixed z-[120] w-[320px] overflow-hidden rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/70"
          style={{ left: `${cardMenuLeft}px`, top: `${cardMenuTop}px` }}
          onMouseDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="border-b border-white/10 px-4 py-3">
            <div className="truncate text-[12px] font-bold text-zinc-100">{menuCardSlot.label} Card</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-zinc-500">{menuCardSlot.variants.length} position{menuCardSlot.variants.length === 1 ? '' : 's'}</div>
          </div>
          <div className="py-2">
            {!isStyleUtilitySlot(menuCardSlot) && (
              <>
                <button
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    const triggerRect = event.currentTarget.getBoundingClientRect();
                    openCardRandomMenu(
                      menuCardSlot.slotId,
                      Math.round(triggerRect.left + 8),
                      Math.round(triggerRect.bottom + 4),
                      { preferAbove: cardMenu?.preferAbove === true }
                    );
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-cyan-200 hover:bg-cyan-500/10"
                >
                  <Sparkles size={15} />
                  Control Menu
                </button>
                <button
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    shuffleSlotVariants(menuCardSlot.slotId);
                    setCardMenu(null);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-fuchsia-200 hover:bg-fuchsia-500/10"
                  title={hasLiveQueue
                    ? 'Shuffle variants in this card for the next queue. The running queue stays unchanged.'
                    : 'Shuffle variants in this card only'}
                >
                  <Shuffle size={15} />
                  Shuffle Card Variants
                </button>
              </>
            )}
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => {
                addVariant(menuCardSlot.slotId);
                setCardMenu(null);
              }}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              <Plus size={15} />
              Add Variant Prompt
            </button>
            {!isStyleUtilitySlot(menuCardSlot) && (
              <button
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => openCardLabelModal(menuCardSlot.slotId)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-zinc-200 hover:bg-white/5"
              >
                <Pencil size={15} />
                Rename Card
              </button>
            )}
            <div className="mx-4 my-2 h-px bg-white/10" />
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => copySlotToClipboard(menuCardSlot.slotId, 'copy')}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-zinc-200 hover:bg-white/5"
            >
              <Copy size={15} />
              Copy Card
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => copySlotToClipboard(menuCardSlot.slotId, 'cut')}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-zinc-200 hover:bg-white/5"
            >
              <Scissors size={15} />
              Cut Card (Move)
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => requestRemoveSlot(menuCardSlot.slotId)}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-[12px] font-semibold text-red-300 hover:bg-red-500/10"
            >
              <Trash2 size={15} />
              Delete Card
            </button>
          </div>
        </div>,
        window.document.body
      )}

      {cardLabelModal && typeof window !== 'undefined' && window.document?.body && createPortal(
        <div
          className="fixed inset-0 z-[12028] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCardLabelModal(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-zinc-100">Edit Card Name</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  Rename this card or choose an existing group name.
                </div>
              </div>
              <button
                onClick={() => setCardLabelModal(null)}
                className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-zinc-100 hover:border-white/25"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Card Name</div>
                <input
                  autoFocus
                  value={cardLabelModal.draftLabel}
                  onChange={(event) => {
                    const nextValue = String(event.target.value || '').replace(/\s+/g, ' ').slice(0, 80);
                    setCardLabelModal((prev) => (prev ? { ...prev, draftLabel: nextValue } : prev));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitCardLabelModal();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setCardLabelModal(null);
                    }
                  }}
                  className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-300/55"
                  placeholder="Name this card..."
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Existing Names</div>
                  <div className="text-[10px] text-zinc-600">{cardGroupNameOptions.length} available</div>
                </div>
                <div className="max-h-[220px] overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-black/20 p-2">
                  {cardGroupNameOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {cardGroupNameOptions.map((groupLabel) => {
                        const active = normalizeCustomGroupName(groupLabel) === normalizeCustomGroupName(cardLabelModal.draftLabel);
                        return (
                          <button
                            key={`card-label-option-${groupLabel}`}
                            onClick={() => {
                              setCardLabelModal((prev) => (prev ? { ...prev, draftLabel: groupLabel } : prev));
                            }}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              active
                                ? 'border-emerald-400/55 bg-emerald-500/12 text-emerald-200'
                                : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'
                            }`}
                          >
                            {groupLabel}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500">No existing custom group names yet.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setCardLabelModal(null)}
                className="px-3 py-1.5 rounded border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
              >
                Cancel
              </button>
              <button
                onClick={commitCardLabelModal}
                className="px-3 py-1.5 rounded border border-cyan-400/35 bg-cyan-500/12 text-[11px] font-semibold text-cyan-100 hover:border-cyan-300/55 hover:text-cyan-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>,
        window.document.body
      )}

      {pendingSlotDelete && (
        <div className="fixed inset-0 z-[12030] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <div className="text-sm font-bold text-zinc-100">Delete Card?</div>
              <div className="text-[11px] text-zinc-400 mt-1">
                {pendingSlotDelete.label} � {pendingSlotDelete.variants} variant{pendingSlotDelete.variants === 1 ? '' : 's'}
              </div>
            </div>
            <div className="px-4 py-3 text-[12px] text-zinc-300">
              This will remove the card from the chain. You can still restore grouped variants later from matching group recovery.
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingSlotDelete(null)}
                className="px-3 py-1.5 rounded border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveSlot}
                className="px-3 py-1.5 rounded border border-red-400/45 bg-red-500/14 text-[11px] font-semibold text-red-200 hover:text-red-100 hover:border-red-300/70"
              >
                Delete Card
              </button>
            </div>
          </div>
        </div>
      )}

      {loraBrowserFileMenu && loraBrowserMenuFile && (
        <div
          className="fixed z-[12021] w-[300px] rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/70"
          style={{ left: `${loraBrowserFileMenuLeft}px`, top: `${loraBrowserFileMenuTop}px` }}
          onMouseDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="text-[11px] font-bold text-zinc-200 truncate">{loraBrowserMenuFile.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">{loraBrowserMenuFile.path}</div>
          </div>
          <div className="py-1.5">
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => {
                void openLoraInfo(loraBrowserMenuFile.path);
                setLoraBrowserFileMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-zinc-200 hover:bg-white/5"
            >
              View LoRA Info
            </button>
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => {
                addLoraEntry(loraBrowserMenuFile.path);
                setLoraBrowserFileMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10"
            >
              Add LoRA
            </button>
          </div>
        </div>
      )}

      {loraBrowserFolderMenu && loraBrowserMenuFolder && (
        <div
          className="fixed z-[12021] w-[300px] rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/70"
          style={{ left: `${loraBrowserFolderMenuLeft}px`, top: `${loraBrowserFolderMenuTop}px` }}
          onMouseDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="text-[11px] font-bold text-zinc-200 truncate">{loraBrowserMenuFolder.label}</div>
            <div className="text-[10px] text-zinc-500 truncate">{loraBrowserMenuFolder.path || 'Root'}</div>
          </div>
          <div className="py-1.5">
            <button
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={() => {
                setLoraBrowserFolder(loraBrowserMenuFolder.path);
                setLoraBrowserFolderMenu(null);
              }}
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10"
            >
              Select Folder
            </button>
            {!isUmbraRemoteClient() ? (
              <button
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => {
                  void openLoraFolderInExplorer(loraBrowserMenuFolder.path);
                  setLoraBrowserFolderMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-[11px] font-semibold text-zinc-200 hover:bg-white/5"
              >
                Show in File Explorer
              </button>
            ) : null}
          </div>
        </div>
      )}

      {isLoraBrowserOpen && (
        <div className="fixed inset-0 z-[12010] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl h-[72vh] max-h-[calc(100vh-180px)] min-h-[560px] rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-100 uppercase tracking-widest">LoRA Browser</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Safetensors only - {loraBrowserAllFiles.length} file{loraBrowserAllFiles.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!isForgeMode) {
                      await onRefreshLoraCatalog?.(true);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                  title="Refresh LoRA catalog"
                >
                  <RefreshCw size={11} />
                  Refresh
                </button>
                <button
                  onClick={() => setIsLoraBrowserOpen(false)}
                  className="p-1 rounded border border-white/15 text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="px-4 py-2 border-b border-white/10">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-2">
                <input
                  value={loraBrowserSearch}
                  onChange={(event) => setLoraBrowserSearch(event.target.value)}
                  placeholder="Search file name or folder..."
                  className="w-full bg-black/40 border border-white/15 rounded px-2.5 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="min-w-[280px] px-2.5 py-1.5 rounded border border-white/15 bg-black/35 text-[10px] uppercase tracking-wider text-zinc-400 truncate"
                    title="LoRA paths are provided by the active ComfyUI catalog"
                  >
                    Source: ComfyUI LoRA catalog
                  </div>
                </div>
              </div>
            </div>
              <div className="flex-1 min-h-0 flex">
              <div className="w-[280px] border-r border-white/10 p-2 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 pb-1">Folders</div>
                <div className="space-y-1">
                  {loraBrowserFolderRows.map((folderEntry) => {
                    const active = folderEntry.path === loraBrowserFolder;
                    const pathLabel = folderEntry.path || 'All LoRAs';
                    return (
                      <div
                        key={`lora-folder-${folderEntry.path || 'all'}`}
                        onContextMenu={(event) => event.preventDefault()}
                        className={`w-full rounded border transition-colors ${
                          active
                            ? 'border-cyan-400/45 bg-cyan-500/14 text-cyan-100'
                            : 'border-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                        title={folderEntry.path ? folderEntry.path : 'Root folder'}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-zinc-600">
                            {folderEntry.path ? <span className="h-px w-2 bg-current" /> : <span className="w-3 h-3" />}
                          </span>
                          <span className="inline-flex shrink-0 items-center justify-center text-zinc-400">
                            <FolderOpen size={12} />
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setLoraBrowserFolder(folderEntry.path);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[11px] font-semibold">{pathLabel}</span>
                              <span className="shrink-0 rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                                {folderEntry.fileCount}
                              </span>
                            </div>
                            {folderEntry.path.includes('/') && (
                              <div className="truncate text-[9px] text-zinc-600">{folderEntry.label}</div>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 min-h-0 p-3 overflow-y-auto custom-scrollbar">
                {loraBrowserVisibleFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[12px] text-zinc-500">
                    No safetensors found for this folder/search.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {loraBrowserVisibleFiles.map((fileEntry) => {
                      const active = fileEntry.path === loraBrowserSelectedPath;
                      const meta = loraCardMetaByName[fileEntry.path.toLowerCase()];
                      const thumbnailOverride = getModelThumbnailOverrides(fileEntry.path);
                      const thumbnailUrls = Array.isArray(meta?.thumbnailUrls)
                        ? meta.thumbnailUrls.filter((entry) => String(entry || '').trim().length > 0)
                        : (meta?.thumbnailUrl ? [meta.thumbnailUrl] : []);
                      const resolvedThumbs = Array.from(new Set([
                        ...thumbnailOverride,
                        ...thumbnailUrls,
                      ]));
                      const activeThumbnail = resolvedThumbs.length > 0
                        ? resolvedThumbs[loraBrowserThumbTick % resolvedThumbs.length]
                        : '';
                      return (
                        <button
                          key={`lora-browser-file-${fileEntry.path}`}
                          onClick={() => handleLoraBrowserFileClick(fileEntry.path)}
                          onDoubleClick={() => handleLoraBrowserFileDoubleClick(fileEntry.path)}
                          onContextMenu={(event) => openLoraBrowserFileContextMenu(event, fileEntry.path)}
                          className={`rounded-lg border overflow-hidden text-left transition-colors ${
                            active
                              ? 'border-cyan-400/55 bg-cyan-500/12'
                              : 'border-white/10 bg-black/25 hover:border-white/25'
                          }`}
                          title={`${fileEntry.path} (left click: select, double click: info, right click: options)`}
                        >
                          <div className="h-36 bg-black/45 border-b border-white/10 flex items-center justify-center overflow-hidden">
                            {activeThumbnail ? (
                              renderPreviewMedia(
                                activeThumbnail,
                                `${fileEntry.name} preview`,
                                'w-full h-full object-contain',
                                { autoPlay: false, loop: true, muted: true }
                              )
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1 text-zinc-500">
                                <ImageIcon size={18} />
                                <span className="text-[10px] uppercase tracking-wider">No Preview</span>
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-[11px] font-semibold text-zinc-100 truncate">{fileEntry.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{fileEntry.folder || 'Root'}</div>
                            <div className="mt-1 flex items-center gap-1">
                              {resolvedThumbs.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-[10px] text-cyan-200">
                                  {resolvedThumbs.length} previews
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                                .safetensors
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="text-[11px] text-zinc-400 truncate">
                  {loraBrowserSelectedFile
                    ? `Selected: ${loraBrowserSelectedFile.path}`
                    : 'Select a LoRA file from the ComfyUI catalog'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLoraBrowserOpen(false)}
                  className="px-3 py-1.5 rounded-md border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLoraBrowserSelection}
                  disabled={!loraBrowserSelectedFile}
                  className={`px-3 py-1.5 rounded-md border text-[11px] font-semibold ${
                    loraBrowserSelectedFile
                      ? 'border-cyan-400/45 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/20'
                      : 'border-white/10 bg-white/[0.03] text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModelBrowserOpen && (
        <div className="fixed inset-0 z-[12010] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl h-[72vh] max-h-[calc(100vh-180px)] min-h-[560px] rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Model Browser</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {POWER_PROMPTER_MODEL_BROWSER_LABELS[modelBrowserType]} - {modelBrowserAllFiles.length} item{modelBrowserAllFiles.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    void onRefreshModelCatalog?.(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                  title="Refresh model catalog"
                >
                  <RefreshCw size={11} />
                  Refresh
                </button>
                <button
                  onClick={() => setIsModelBrowserOpen(false)}
                  className="p-1 rounded border border-white/15 text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="px-4 py-2 border-b border-white/10">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-2">
                <input
                  value={modelBrowserSearch}
                  onChange={(event) => setModelBrowserSearch(event.target.value)}
                  placeholder="Search file name or folder..."
                  className="w-full bg-black/40 border border-white/15 rounded px-2.5 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center rounded-md border border-white/15 bg-black/35 p-0.5">
                    {POWER_PROMPTER_MODEL_BROWSER_TYPES.map((type) => (
                      <button
                        key={`model-browser-type-${type}`}
                        type="button"
                        onClick={() => handleModelBrowserTypeChange(type)}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          modelBrowserType === type
                            ? 'bg-cyan-500/18 text-cyan-100'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                        }`}
                        title={`Show ${POWER_PROMPTER_MODEL_BROWSER_LABELS[type]}`}
                      >
                        {POWER_PROMPTER_MODEL_BROWSER_LABELS[type]} ({modelBrowserTypeCounts[type]})
                      </button>
                    ))}
                  </div>
                  <div
                    className="min-w-[280px] px-2.5 py-1.5 rounded border border-white/15 bg-black/35 text-[10px] uppercase tracking-wider text-zinc-400 truncate"
                    title="Use Selected applies this route to the custom checkpoint loader"
                  >
                    Route: {POWER_PROMPTER_MODEL_BROWSER_LABELS[modelBrowserType]} via ComfyUI catalog
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex">
              <div className="w-[280px] border-r border-white/10 p-2 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 pb-1">Folders</div>
                <div className="space-y-1">
                  {modelBrowserFolderRows.map((folderEntry) => {
                    const active = folderEntry.path === modelBrowserFolder;
                    const pathLabel = folderEntry.path || 'All Models';
                    return (
                      <div
                        key={`model-folder-${folderEntry.path || 'all'}`}
                        className={`w-full rounded border transition-colors ${
                          active
                            ? 'border-cyan-400/45 bg-cyan-500/14 text-cyan-100'
                            : 'border-transparent text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                        title={folderEntry.path ? folderEntry.path : 'Root folder'}
                      >
                        <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-zinc-600">
                            {folderEntry.path ? <span className="h-px w-2 bg-current" /> : <span className="w-3 h-3" />}
                          </span>
                          <span className="inline-flex shrink-0 items-center justify-center text-zinc-400">
                            <FolderOpen size={12} />
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setModelBrowserFolder(folderEntry.path);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[11px] font-semibold">{pathLabel}</span>
                              <span className="shrink-0 rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                                {folderEntry.fileCount}
                              </span>
                            </div>
                            {folderEntry.path.includes('/') && (
                              <div className="truncate text-[9px] text-zinc-600">{folderEntry.label}</div>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 min-h-0 p-3 overflow-y-auto custom-scrollbar">
                {modelBrowserVisibleFiles.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[12px] text-zinc-500">
                    No model files found for this folder/search.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {modelBrowserVisibleFiles.map((fileEntry) => {
                      const active = fileEntry.path === modelBrowserSelectedPath;
                      const meta = modelCardMetaByName[fileEntry.path.toLowerCase()];
                      const thumbnailOverride = getModelThumbnailOverrides(fileEntry.path);
                      const thumbnailUrls = Array.isArray(meta?.thumbnailUrls)
                        ? meta.thumbnailUrls.filter((entry) => String(entry || '').trim().length > 0)
                        : (meta?.thumbnailUrl ? [meta.thumbnailUrl] : []);
                      const resolvedThumbs = Array.from(new Set([
                        ...thumbnailOverride,
                        ...thumbnailUrls,
                      ]));
                      const activeThumbnail = resolvedThumbs.length > 0
                        ? resolvedThumbs[modelBrowserThumbTick % resolvedThumbs.length]
                        : '';
                      return (
                        <button
                          key={`model-browser-file-${fileEntry.modelType || 'checkpoint'}-${fileEntry.path}`}
                          onClick={() => handleModelBrowserFileClick(fileEntry.path)}
                          onDoubleClick={() => handleModelBrowserFileDoubleClick(fileEntry.path)}
                          className={`rounded-lg border overflow-hidden text-left transition-colors ${
                            active
                              ? 'border-cyan-400/55 bg-cyan-500/12'
                              : 'border-white/10 bg-black/25 hover:border-white/25'
                          }`}
                          title={`${fileEntry.path} (single click: select${modelBrowserType === 'checkpoint' ? ', double click: info' : ''}, Use Selected: apply)`}
                        >
                          <div className="h-36 bg-black/45 border-b border-white/10 flex items-center justify-center overflow-hidden">
                            {activeThumbnail ? (
                              renderPreviewMedia(
                                activeThumbnail,
                                `${fileEntry.name} preview`,
                                'w-full h-full object-contain',
                                { autoPlay: false, loop: true, muted: true }
                              )
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1 text-zinc-500">
                                <ImageIcon size={18} />
                                <span className="text-[10px] uppercase tracking-wider">No Preview</span>
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-[11px] font-semibold text-zinc-100 truncate">{fileEntry.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{fileEntry.folder || 'Root'}</div>
                            <div className="mt-1 flex items-center gap-1">
                              {resolvedThumbs.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-[10px] text-cyan-200">
                                  {resolvedThumbs.length} previews
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                                {POWER_PROMPTER_MODEL_BROWSER_LABELS[fileEntry.modelType || 'checkpoint']}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="text-[11px] text-zinc-400 truncate">
                  {modelBrowserSelectedFile
                    ? `Selected ${POWER_PROMPTER_MODEL_BROWSER_LABELS[modelBrowserSelectedFile.modelType || modelBrowserType]}: ${modelBrowserSelectedFile.path}`
                    : `Select a ${POWER_PROMPTER_MODEL_BROWSER_LABELS[modelBrowserType].toLowerCase()} item from the ComfyUI catalog`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsModelBrowserOpen(false)}
                  className="px-3 py-1.5 rounded-md border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!modelBrowserSelectedFile?.path) return;
                    const selectedModelType = normalizePowerPrompterModelType(modelBrowserSelectedFile.modelType || modelBrowserType);
                    const resolvedModel = resolveModelSelection(modelBrowserSelectedFile.path, selectedModelType);
                    updateGeneration({
                      modelType: selectedModelType,
                      checkpointName: resolvedModel || modelBrowserSelectedFile.path,
                    });
                    setIsModelBrowserOpen(false);
                  }}
                  disabled={!modelBrowserSelectedFile}
                  className={`px-3 py-1.5 rounded-md border text-[11px] font-semibold ${
                    modelBrowserSelectedFile
                      ? 'border-cyan-400/45 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/20'
                      : 'border-white/10 bg-white/[0.03] text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  Use Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(isLoadingLoraInfo || loraInfoError || loraInfoModal) && (
        <div className="fixed inset-0 z-[12030] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-zinc-100 uppercase tracking-widest">LoRA Info</div>
              <button
                onClick={() => {
                  setLoraInfoModal(null);
                  setLoraInfoError(null);
                  setIsLoraDescriptionExpanded(false);
                }}
                className="p-1 rounded border border-white/15 text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-3">
              {isLoadingLoraInfo && (
                <div className="text-[12px] text-zinc-300 uppercase tracking-wider">Loading LoRA info...</div>
              )}
              {!isLoadingLoraInfo && loraInfoError && (
                <div className="text-[12px] text-red-300">{loraInfoError}</div>
              )}
              {!isLoadingLoraInfo && !loraInfoError && loraInfoModal && (
                <>
                  <div className="text-sm text-zinc-100 font-semibold">{loraInfoModal.loraName}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Trained Tags</div>
                      {loraInfoModal.trainedTags.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {loraInfoModal.trainedTags.map((tag) => (
                              <span
                                key={`${loraInfoModal.loraName}-${tag}`}
                                draggable
                                onDragStart={(event) => setPromptTokenDragData(event, tag)}
                                className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-200 text-[10px] cursor-grab active:cursor-grabbing"
                                title="Drag trained tag to a prompt card"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(loraInfoModal.trainedTags.join(', '));
                                showToast('Trained tags copied', 'success');
                              } catch {
                                showToast('Failed to copy tags', 'error');
                              }
                            }}
                            className="mt-2 px-2 py-1 rounded border border-white/15 text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                          >
                            Copy Tags
                          </button>
                        </>
                      ) : (
                        <div className="text-zinc-500">No trained tags available for this LoRA.</div>
                      )}
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Civitai</div>
                      {Array.isArray(loraInfoView?.thumbnailUrls) && loraInfoView.thumbnailUrls.length > 0 && (
                        <a
                          href={String(loraInfoView.thumbnailUrls[0] || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded border border-white/10 overflow-hidden bg-black/30 hover:border-cyan-400/45 mb-1"
                          title="Open primary preview"
                        >
                          {renderPreviewMedia(
                            String(loraInfoView.thumbnailUrls[0] || ''),
                            'LoRA primary preview',
                            'w-full h-36 object-contain bg-black/55',
                            { autoPlay: false, loop: true, muted: true }
                          )}
                        </a>
                      )}
                      <div className="text-zinc-300">
                        Model: {loraInfoView?.modelName || 'Unavailable'}
                      </div>
                      <div className="text-zinc-300">
                        Version: {loraInfoView?.versionName || 'Unavailable'}
                      </div>
                      <div className="text-zinc-300">
                        Downloads: {loraInfoView?.downloadCount || 'n/a'}
                      </div>
                      {String(loraInfoView?.civitaiUrl || '').trim() ? (
                        <a
                          href={String(loraInfoView?.civitaiUrl || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex mt-1 px-2 py-1 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-200 text-[10px] uppercase tracking-wider hover:border-cyan-300/60 hover:text-cyan-100"
                        >
                          Open Civitai
                        </a>
                      ) : (
                        <div className="text-zinc-500 text-[11px]">Civitai link unavailable.</div>
                      )}
                      {Array.isArray(loraInfoView?.thumbnailUrls) && loraInfoView.thumbnailUrls.length > 0 && (
                        <div className="pt-1">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Thumbnails</div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {loraInfoView.thumbnailUrls.map((url) => (
                              <a
                                key={`${loraInfoModal.loraName}-${url}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded border border-white/10 overflow-hidden bg-black/30 hover:border-cyan-400/45"
                                title="Open full image"
                              >
                                {renderPreviewMedia(
                                  url,
                                  'LoRA preview',
                                  'w-full h-16 object-contain bg-black/55',
                                  { autoPlay: false, loop: true, muted: true }
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Description</div>
                    {hasLoraDescription ? (
                      <>
                        <div
                          className="text-[12px] text-zinc-200 leading-relaxed pr-1 overflow-y-auto custom-scrollbar"
                          style={{
                            maxHeight: isLoraDescriptionExpanded ? 'none' : '220px',
                            overflowY: isLoraDescriptionExpanded ? 'visible' : 'auto',
                          }}
                          dangerouslySetInnerHTML={{ __html: String(loraInfoView?.descriptionHtml || '') }}
                        />
                        {shouldShowLoraDescriptionToggle && (
                          <button
                            onClick={() => setIsLoraDescriptionExpanded((prev) => !prev)}
                            className="px-2 py-1 rounded border border-white/15 text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                          >
                            {isLoraDescriptionExpanded ? 'Show Less' : 'Show More'}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-zinc-500">No description available for this LoRA.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {(isLoadingModelInfo || modelInfoError || modelInfoModal) && (
        <div className="fixed inset-0 z-[12030] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Model Info</div>
              <button
                onClick={() => {
                  setModelInfoModal(null);
                  setModelInfoError(null);
                  setIsModelDescriptionExpanded(false);
                }}
                className="p-1 rounded border border-white/15 text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-3">
              {isLoadingModelInfo && (
                <div className="text-[12px] text-zinc-300 uppercase tracking-wider">Loading model info...</div>
              )}
              {!isLoadingModelInfo && modelInfoError && (
                <div className="text-[12px] text-red-300">{modelInfoError}</div>
              )}
              {!isLoadingModelInfo && !modelInfoError && modelInfoModal && (
                <>
                  <div className="text-sm text-zinc-100 font-semibold">{modelInfoModal.modelName}</div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1.5 text-[12px]">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Civitai</div>
                    {Array.isArray(modelInfoView?.thumbnailUrls) && modelInfoView.thumbnailUrls.length > 0 && (
                      <a
                        href={String(modelInfoView.thumbnailUrls[0] || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded border border-white/10 overflow-hidden bg-black/30 hover:border-cyan-400/45 mb-1"
                        title="Open primary preview"
                      >
                        {renderPreviewMedia(
                          String(modelInfoView.thumbnailUrls[0] || ''),
                          'Model primary preview',
                          'w-full h-40 object-contain bg-black/55',
                          { autoPlay: false, loop: true, muted: true }
                        )}
                      </a>
                    )}
                    <div className="text-zinc-300">Model: {modelInfoView?.modelName || 'Unavailable'}</div>
                    <div className="text-zinc-300">Version: {modelInfoView?.versionName || 'Unavailable'}</div>
                    <div className="text-zinc-300">Downloads: {modelInfoView?.downloadCount || 'n/a'}</div>
                    {String(modelInfoView?.civitaiUrl || '').trim() ? (
                      <a
                        href={String(modelInfoView?.civitaiUrl || '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex mt-1 px-2 py-1 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-200 text-[10px] uppercase tracking-wider hover:border-cyan-300/60 hover:text-cyan-100"
                      >
                        Open Civitai
                      </a>
                    ) : (
                      <div className="text-zinc-500 text-[11px]">Civitai link unavailable.</div>
                    )}
                    {Array.isArray(modelInfoView?.thumbnailUrls) && modelInfoView.thumbnailUrls.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Thumbnails</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {modelInfoView.thumbnailUrls.map((url) => (
                            <a
                              key={`${modelInfoModal.modelName}-${url}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded border border-white/10 overflow-hidden bg-black/30 hover:border-cyan-400/45"
                              title="Open full image"
                            >
                              {renderPreviewMedia(
                                url,
                                'Model preview',
                                'w-full h-16 object-contain bg-black/55',
                                { autoPlay: false, loop: true, muted: true }
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Description</div>
                    {hasModelDescription ? (
                      <>
                        <div
                          className="text-[12px] text-zinc-200 leading-relaxed pr-1 overflow-y-auto custom-scrollbar"
                          style={{
                            maxHeight: isModelDescriptionExpanded ? 'none' : '220px',
                            overflowY: isModelDescriptionExpanded ? 'visible' : 'auto',
                          }}
                          dangerouslySetInnerHTML={{ __html: String(modelInfoView?.descriptionHtml || '') }}
                        />
                        {shouldShowModelDescriptionToggle && (
                          <button
                            onClick={() => setIsModelDescriptionExpanded((prev) => !prev)}
                            className="px-2 py-1 rounded border border-white/15 text-[10px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                          >
                            {isModelDescriptionExpanded ? 'Show Less' : 'Show More'}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-zinc-500">No description available for this model.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}));

PowerPrompterCardChainEditor.displayName = 'PowerPrompterCardChainEditor';





