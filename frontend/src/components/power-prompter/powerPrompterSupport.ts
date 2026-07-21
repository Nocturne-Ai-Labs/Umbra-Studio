import { UMBRA_UI_AUTO_PIPELINE_ID, type UmbraUiPipelineDescriptor } from '../../../../shared/umbra-ui/pipelineTypes';

const LEGACY_PREFIX_PATTERN = /^\s*\[(?:x|X| )?\]\s*/;
export const POWER_PROMPTER_API_WORKFLOW_TARGET_PREFIX = 'api-workflow:';
export const POWER_PROMPTER_IMPORT_API_WORKFLOW_OPTION = '__import_api_workflow__';

export type PendingGalleryOpenPathPayload = {
  path: string;
  folderPath?: string;
  imagePath?: string;
  source?: string;
};

export function normalizePrompterMediaPath(rawValue: unknown): string {
  return String(rawValue || '').replace(/\\/g, '/').trim();
}

export function getPrompterParentFolderPath(filePath: string): string {
  const normalized = normalizePrompterMediaPath(filePath).replace(/\/+$/, '');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  return normalized.slice(0, idx);
}

export function getPrompterPathLeaf(filePath: string): string {
  const normalized = normalizePrompterMediaPath(filePath).replace(/\/+$/, '');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function getQueueManagerOutputBucketMeta(filePath: string): { setLabel: string; setOrder: number; groupLabel: string; styleLabels: string[]; key: string } {
  const normalizedPath = normalizePrompterMediaPath(filePath);
  const folderPath = getPrompterParentFolderPath(normalizedPath);
  const folderParts = folderPath.split('/').filter(Boolean);
  const setIndex = folderParts.findIndex((part) => /^set\s+\d+$/i.test(String(part || '').trim()));
  const rawSetLabel = String(setIndex >= 0 ? folderParts[setIndex] : '').trim();
  const setMatch = rawSetLabel.match(/^set\s+(\d+)$/i);
  const parsedSetOrder = setMatch ? Number.parseInt(setMatch[1], 10) : Number.NaN;
  const setOrder = Number.isFinite(parsedSetOrder) ? Math.max(1, parsedSetOrder) : Number.MAX_SAFE_INTEGER;
  const setLabel = Number.isFinite(parsedSetOrder) ? `Set ${parsedSetOrder}` : 'Set';
  const postSetParts = setIndex >= 0 ? folderParts.slice(setIndex + 1) : [];
  const explicitGroupIndex = postSetParts.findIndex((part) => /^group\s+\d+$/i.test(String(part || '').trim()));
  const groupParts = explicitGroupIndex >= 0
    ? postSetParts.slice(explicitGroupIndex)
    : setIndex >= 0
      ? postSetParts
      : folderParts.slice(-2);
  const rawGroupLabel = groupParts.join(' / ').trim();
  const fallbackLeaf = getPrompterPathLeaf(folderPath);
  const groupLabel = rawGroupLabel
    || ((fallbackLeaf && fallbackLeaf.toLowerCase() !== setLabel.toLowerCase()) ? fallbackLeaf : '')
    || (setIndex >= 0 ? 'Group Feed' : 'Queue Output');
  const stylesIndex = postSetParts.findIndex((part) => /^styles?$/i.test(String(part || '').trim()));
  const styleLabels = stylesIndex >= 0
    ? Array.from(new Set(postSetParts
      .slice(stylesIndex + 1)
      .map((part) => String(part || '').trim())
      .filter((part) => part.length > 0 && !/^group\s+\d+$/i.test(part))
    ))
    : [];
  return {
    setLabel,
    setOrder,
    groupLabel,
    styleLabels,
    key: `${rawSetLabel || 'set'}::${groupLabel}`,
  };
}

export function normalizeLookupToken(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function mapMetadataSamplerToPrompter(rawSampler: unknown): string {
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

export function mapMetadataSchedulerToPrompter(rawScheduler: unknown): string {
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

export function stripPrompterFileExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[^/.]+$/, '');
}

export function normalizePrompterCatalogPath(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

export function getPrompterCatalogName(pathValue: string): string {
  const normalized = normalizePrompterCatalogPath(pathValue);
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function getPrompterCatalogAliasKeys(rawPath: unknown): string[] {
  const normalized = normalizePrompterCatalogPath(rawPath);
  if (!normalized) return [];
  const withoutExtension = stripPrompterFileExtension(normalized);
  const fileName = getPrompterCatalogName(normalized);
  const fileStem = stripPrompterFileExtension(fileName);
  const withoutKnownPrefix = normalized.replace(/^(checkpoints|diffusion_models|unet|loras)\//i, '');
  const withoutKnownPrefixStem = stripPrompterFileExtension(withoutKnownPrefix);
  return Array.from(new Set([
    normalized,
    withoutExtension,
    fileName,
    fileStem,
    withoutKnownPrefix,
    withoutKnownPrefixStem,
  ]
    .map((entry) => normalizePrompterCatalogPath(entry).toLowerCase())
    .filter((entry) => entry.length > 0)));
}

export function resolveCheckpointNameFromMetadata(rawModelName: unknown, catalog: string[]): string {
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
  const requestedStemLower = stripPrompterFileExtension(requestedBaseLower);
  const byBase = normalizedCatalog.find((entry) => {
    const base = (entry.split('/').pop() || entry).toLowerCase();
    return base === requestedBaseLower;
  });
  if (byBase) return byBase;
  const byStem = normalizedCatalog.find((entry) => {
    const base = stripPrompterFileExtension((entry.split('/').pop() || entry).toLowerCase());
    return base === requestedStemLower;
  });
  if (byStem) return byStem;
  return requested;
}


export interface PowerPrompterLoraInfoPayload {
  loraName: string;
  metadata: Record<string, unknown>;
  civitai: Record<string, unknown> | null;
  trainedTags: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

export interface PowerPrompterModelInfoPayload {
  modelName: string;
  metadata: Record<string, unknown>;
  civitai: Record<string, unknown> | null;
  trainedTags: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

export interface PowerPrompterInfoRequestOptions {
  previewOnly?: boolean;
}

export interface PowerPrompterBridgeTarget {
  bridgeId: string;
  workflowId: string;
  workflowName: string;
  compatible: boolean;
  missing: string[];
  source: string;
  connectedAt: number;
  updatedAt: number;
}

export interface PowerPrompterApiWorkflowItem {
  id: string;
  fileName: string;
  name: string;
  compatible: boolean;
  missing: string[];
  modelFamily?: string;
  umbraUiPipelines?: UmbraUiPipelineDescriptor[];
  virtual?: boolean;
  umbraUiAuto?: boolean;
  updatedAt: number;
}

export interface PowerPrompterProps {
  overlayMode?: boolean;
  isActive?: boolean;
}

export interface GlobalSearchSuggestionEntry {
  key: string;
  kind: 'prompt' | 'name';
  value: string;
  valueLower: string;
  count: number;
}

export function stripLegacySelectionMarkers(text: string): string {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.replace(LEGACY_PREFIX_PATTERN, ''))
    .join('\n');
}

export function createPrompterWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/prompter`;
}

export function normalizeBridgeTarget(raw: unknown): PowerPrompterBridgeTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const bridgeId = String(item.bridgeId || '').trim();
  if (!bridgeId) return null;
  return {
    bridgeId,
    workflowId: String(item.workflowId || bridgeId).trim() || bridgeId,
    workflowName: String(item.workflowName || 'Comfy Workflow').trim() || 'Comfy Workflow',
    compatible: item.compatible === true,
    missing: Array.isArray(item.missing)
      ? item.missing.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0)
      : [],
    source: String(item.source || 'comfyui').trim() || 'comfyui',
    connectedAt: Number.isFinite(Number(item.connectedAt)) ? Number(item.connectedAt) : Date.now(),
    updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : Date.now(),
  };
}

export function createApiWorkflowTargetId(id: unknown): string {
  const normalized = String(id || '').trim();
  if (!normalized) return '';
  return `${POWER_PROMPTER_API_WORKFLOW_TARGET_PREFIX}${normalized}`;
}

export function parseApiWorkflowTargetId(targetId: unknown): string {
  const normalized = String(targetId || '').trim();
  if (!normalized.startsWith(POWER_PROMPTER_API_WORKFLOW_TARGET_PREFIX)) return '';
  return normalized.slice(POWER_PROMPTER_API_WORKFLOW_TARGET_PREFIX.length).trim();
}

export function getDefaultApiWorkflowTargetId(items: PowerPrompterApiWorkflowItem[]): string {
  if (!Array.isArray(items) || items.length <= 0) return '';
  const compatibleItems = items.filter((item) => item?.compatible === true);
  const candidates = compatibleItems.length > 0 ? compatibleItems : items;
  const autoTarget = candidates.find((item) => item.umbraUiAuto === true || item.id === UMBRA_UI_AUTO_PIPELINE_ID);
  if (autoTarget) return createApiWorkflowTargetId(autoTarget.id);
  return createApiWorkflowTargetId(candidates[0]?.id || '');
}
