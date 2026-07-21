import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FolderOpen, GripVertical, ImageIcon, ListChecks, ListOrdered, Loader2, Pause, Pencil, Play, Plus, Power, RefreshCw, Save, Search, Shuffle, Trash2, Volume2, VolumeX, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { PowerPrompterSidebar } from './PowerPrompterSidebar';
import { PowerPrompterActivePromptInline } from './PowerPrompterActivePromptInline';
import type { PowerPrompterPromptChipConfig } from './PowerPrompterPromptChips';
import {
  fetchPowerPrompterOutputPreviewItems,
  PowerPrompterCardChainEditor,
  PowerPrompterCardChainEditorRef,
  PowerPrompterOutputPreviewItem,
  PowerPrompterOutputPreviewSnapshot,
} from './PowerPrompterCardChainEditor';
import { PowerPrompterSearchPanel } from './PowerPrompterSearchPanel';
import { PowerPrompterCommandBar } from '@/components/power-prompter/PowerPrompterCommandBar';
import { PowerPrompterLoadingOverlays } from '@/components/power-prompter/PowerPrompterLoadingOverlays';
import { PowerPrompterPresetBar } from '@/components/power-prompter/PowerPrompterPresetBar';
import { PowerPrompterWorkspacePanels } from '@/components/power-prompter/PowerPrompterWorkspacePanels';
import { usePowerPrompterAudioControls } from '@/components/power-prompter/usePowerPrompterAudioControls';
import { usePowerPrompterGlobalSearch } from '@/components/power-prompter/usePowerPrompterGlobalSearch';
import { usePowerPrompterPipelines } from '@/components/power-prompter/pipelines/usePowerPrompterPipelines';
import { PowerPrompterQueueManagerSidePane } from '@/components/power-prompter/queue/PowerPrompterQueueManagerSidePane';
import { PowerPrompterQueueManagerView } from '@/components/power-prompter/queue/PowerPrompterQueueManagerView';
import { PowerPrompterQueueTrackerCard } from '@/components/power-prompter/queue/PowerPrompterQueueTrackerCard';
import { PowerPrompterQueueHistoryModal } from '@/components/power-prompter/queue/PowerPrompterQueueHistoryModal';
import { PowerPrompterQueueConfirmModal, PowerPrompterSaveQueueModal } from '@/components/power-prompter/queue/PowerPrompterQueueDialogs';
import { PowerPrompterSettingsModal } from '@/components/modals/PowerPrompterSettingsModal';
import { useStore } from '@/store/useStore';
import { useToastStore } from '@/store/useToastStore';
import type {
  PowerPrompterCardDocument,
  PowerPrompterQueueTraversalMode,
  PowerPrompterSettings,
} from '@/types/powerPrompter';
import {
  createDefaultPowerPrompterCardDocument,
  DEFAULT_POWER_PROMPTER_SETTINGS,
  getQueueCycleWeightForSet,
  importLegacyPromptToCardDocument,
  normalizePowerPrompterPromptText,
  normalizePowerPrompterCardDocument,
  normalizePowerPrompterGenerationControls,
  normalizePowerPrompterSettings,
  POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME,
  POWER_PROMPTER_MAX_QUEUE_SETS,
  sortPowerPrompterCards,
} from '@/lib/powerPrompter';
import { buildPowerPrompterActivePromptBlocks } from '@/lib/powerPrompterActivePrompt';
import { governorShouldRun, governorTryAcquire } from '@/lib/loadGovernor';
import { loadAppSettings, pushAppSettingsToBackend } from '@/lib/appSettings';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { subscribeUiSession } from '@/lib/uiSessionSocket';
import { deletePathsWithSettings } from '@/utils/trashActions';
import { extractGenerationParams, extractMetadataFromPath } from '@/utils/metadata';
import type { ImageMetadata } from '@/utils/metadata';
import {
  DEFAULT_QUEUE_MANAGER_PREVIEW_SPLIT,
  QUEUE_DIVERSITY_MAX,
  QUEUE_DIVERSITY_MIN,
  QUEUE_DIVERSITY_STEP,
  QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS,
  QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE,
  applyQueueStackRunningState,
  buildQueueSubmissionSignature,
  clampQueueSetId,
  createQueueShuffleSeed,
  createRequestId,
  createStagedQueueRequestId,
  formatQueueDiversityPercent,
  formatQueueEtaDuration,
  getQueueDiversityFromTargetCount,
  getQueueDiversityLabel,
  getQueueDiversityTargetCount,
  getSetColor,
  hexToRgba,
  isLocalStagedQueueRequestId,
  moveArrayEntry,
  normalizeQueueCycleWeights,
  normalizeQueueDiversity,
  normalizeQueueManagerPreviewSplit,
  normalizeQueuePromptLimit,
  normalizeQueueSetIds,
  normalizeQueueTargetType,
  normalizeQueueTraversalMode,
  powerPrompterQueueSession,
  resolveQueueTraversalMode,
  stableShuffleQueueTokens,
} from '@/components/power-prompter/queue/queueCore';
import type {
  GenerationPreviewState,
  PersistedPausedQueueSnapshot,
  PersistedQueueEditorSnapshot,
  PersistedQueueGroupSnapshot,
  PowerPrompterPanelMode,
  PowerPrompterQueueHistoryDocument,
  PowerPrompterQueueHistoryPreviewImage,
  PowerPrompterQueueHistoryStatus,
  PowerPrompterQueueHistorySummary,
  PowerPrompterQueueMode,
  PowerPrompterQueueTargetType,
  QueueEditorBuildSettings,
  QueueEditorDraft,
  QueueManagerDragState,
  QueueManagerOutputMenuState,
  QueueManagerSequenceMode,
  QueuePromptBlock,
  QueuePromptBuildEntry,
  QueuePromptPreviewEntry,
  QueuePromptPreviewToken,
  QueuePromptStyleMeta,
  QueuePromptToken,
  QueueRequestGroup,
  QueueRequestMeta,
  QueueStackItem,
  QueueVisualState,
  SavedPowerPrompterQueueDocument,
  SavedPowerPrompterQueueSummary,
} from '@/components/power-prompter/queue/queueCore';
import {
  findRunningPromptIndex,
  getQueuePromptEventKey,
  normalizeBridgeQueueState,
  normalizeGenerationPreviewEvent,
  normalizeJobProgressEvent,
  normalizeQueueEventPromptIndex as normalizeQueueEventPromptIndexCore,
  normalizeQueueProgressEvent,
  normalizeQueueResultEvent,
  normalizeRequestId,
  normalizeRequestIdList,
} from '@/components/power-prompter/queue/queueProgression';
import {
  buildPausedQueueSnapshotFromVisualState,
  createQueueEditorSnapshot,
  normalizePersistedPausedQueueSnapshot,
  normalizePowerPrompterQueueHistoryPreviewImages,
  normalizeQueueEditorBuildSettings,
  normalizeQueueEditorSnapshot,
  readPersistedPausedQueueSnapshot,
  writePersistedPausedQueueSnapshot,
} from '@/components/power-prompter/queue/queuePersistence';
import {
  applyQueueHistorySummaryPatch,
  buildOptimisticQueueHistorySummary,
  buildQueueHistoryGroups,
  buildQueueHistorySnapshotForRequest as buildQueueHistorySnapshotModel,
  findStaleQueueHistoryEntries,
} from '@/components/power-prompter/queue/queueHistoryModel';
import {
  createPowerPrompterQueueHistory,
  deletePowerPrompterQueueHistory,
  deleteSavedPowerPrompterQueue,
  listPowerPrompterQueueHistory,
  listSavedPowerPrompterQueues,
  loadPowerPrompterQueueHistory,
  loadSavedPowerPrompterQueue,
  patchPowerPrompterQueueHistory,
  savePowerPrompterQueueSnapshot,
} from '@/components/power-prompter/queue/queueStorageApi';
import {
  buildPowerPrompterQueueEditorEstimateOnWorker,
  buildPowerPrompterQueueEstimateOnWorker,
  buildQueuePromptsOnWorker,
  buildQueueSnapshotSignatureOnWorker,
  cleanupQueueSnapshotWorker,
} from '@/components/power-prompter/queue/queueSnapshotWorker';
import type { QueueSnapshotWorkerPending } from '@/components/power-prompter/queue/queueSnapshotWorker';
import {
  buildActiveQueuePosition,
  buildQueueManagerOutputBuckets,
  buildQueueManagerStyleOptions,
  buildQueueRequestGroups,
  buildQueueSetGroups,
  buildQueueSummaryCounts,
  buildQueueTrackerSummary,
  getStaleBackendDrivenRequestIds,
  getQueueManagerActivePromptText,
  hasBackendQueueSnapshotMismatch,
} from '@/components/power-prompter/queue/queueManagerModel';
import {
  composeActivePromptFromCards,
  resolveSeedForQueuePromptGroup,
} from '@/components/power-prompter/queue/queuePromptBuilder';
import {
  createEmptyPowerPrompterQueueEstimate,
} from '@/components/power-prompter/queue/queueEstimates';
import type { PowerPrompterQueueEstimate } from '@/components/power-prompter/queue/queueEstimates';
import {
  normalizeChainCards,
} from '@/lib/powerPrompterChain';
import {
  buildDefaultPendingPromptOrderForGroup,
  buildQueuePromptBlocksForItem,
  buildSequencedPendingPromptOrderForGroup,
  captureDefaultPromptItemOrder,
  mergePendingPromptOrderIntoGroupOrder,
} from '@/components/power-prompter/queue/queueSequencing';
import {
  POWER_PROMPTER_IMPORT_API_WORKFLOW_OPTION,
  createApiWorkflowTargetId,
  createPrompterWsUrl,
  getDefaultApiWorkflowTargetId,
  getPrompterCatalogAliasKeys,
  getPrompterParentFolderPath,
  mapMetadataSamplerToPrompter,
  mapMetadataSchedulerToPrompter,
  normalizeBridgeTarget,
  normalizePrompterMediaPath,
  parseApiWorkflowTargetId,
  resolveCheckpointNameFromMetadata,
  stripLegacySelectionMarkers,
} from '@/components/power-prompter/powerPrompterSupport';
import { getCardDocSignature } from '@/components/power-prompter/powerPrompterDocuments';
import {
  loadPowerPrompterDocumentSession,
  normalizePowerPrompterDocumentSessionEnvelope,
  openPowerPrompterDocumentSession,
  updatePowerPrompterDocumentSession,
  type PowerPrompterDocumentSession,
} from '@/components/power-prompter/powerPrompterSessionApi';
import {
  filterLorasForSet,
  normalizeLoraChipToken,
  normalizeLoraQueueSetIds,
  normalizeLoraSyntaxName,
  normalizeSearchChip,
  parsePromptChipsFromText,
} from '@/components/power-prompter/powerPrompterPromptChips';
import {
  isImportantPowerPrompterDiagnosticEvent,
  isPowerPrompterDiagnosticEnabled,
  postPowerPrompterDiagnosticPayload,
} from '@/components/power-prompter/powerPrompterDiagnostics';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { stageUmbraUiPowerPrompterHandoff } from '@/lib/umbraUiPowerPrompterHandoff';
import {
  UMBRA_UI_AUTO_PIPELINE_ID,
  createUmbraUiPipelineTargetId,
  normalizeUmbraUiPipelineSelection,
} from '../../../../shared/umbra-ui/pipelineTypes';
import type {
  PendingGalleryOpenPathPayload,
  PowerPrompterBridgeTarget,
  PowerPrompterInfoRequestOptions,
  PowerPrompterLoraInfoPayload,
  PowerPrompterModelInfoPayload,
} from '@/components/power-prompter/powerPrompterSupport';

const AUTOSAVE_IDLE_MS = 4000;
const PROMPTER_WS_RETRY_MS = 2500;
const PROMPTER_QUEUE_TIMEOUT_MS = 600000;
const PROMPTER_ACTIVE_PROMPT_STALL_MS = 300000;
const PROMPTER_ACTIVE_PROMPT_STALL_CHECK_MS = 15000;
const PROMPTER_LORA_TIMEOUT_MS = 20000;
const QUEUE_ITEM_EXIT_MS = 260;
const QUEUE_PREVIEW_PROMPT_LIMIT = 160;
const QUEUE_STACK_VISIBLE_LIMIT = 3;
const PREVIEW_CARD_HIDE_DELAY_MS = 120000;
const QUEUE_COMPLETION_SNAPSHOT_PERSIST_DELAY_MS = 2500;
const QUEUE_ACTIVE_SNAPSHOT_MIN_INTERVAL_MS = 5000;
const POWER_PROMPTER_LEFT_PANEL_STORAGE_KEY = 'umbra.powerPrompter.leftPanelCollapsed';

function downloadTextThroughBrowser(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const POWER_PROMPTER_RIGHT_PANEL_STORAGE_KEY = 'umbra.powerPrompter.rightPanelCollapsed';
const POWER_PROMPTER_QUEUE_MANAGER_SPLIT_STORAGE_KEY = 'umbra.powerPrompter.queueManagerRightPaneSplit';
const POWER_PROMPTER_SETTINGS_SYNC_CHANNEL = 'umbra-powerprompter-settings-sync';
const QUEUE_PROGRESS_REACT_COMMIT_MS = 0;
const QUEUE_PROGRESS_REACT_COMMIT_STEP = 0;
const GENERATION_PREVIEW_REACT_COMMIT_MS = 0;
const waitForNextUiPaint = (timeoutMs = 250): Promise<void> => new Promise((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(finish, 0);
    return;
  }
  const fallback = window.setTimeout(finish, Math.max(50, timeoutMs));
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      window.clearTimeout(fallback);
      finish();
    }, 0);
  });
});

function areQueueStackItemsEquivalent(a: QueueStackItem[], b: QueueStackItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id
      || left.requestId !== right.requestId
      || left.promptIndex !== right.promptIndex
      || left.prompt !== right.prompt
      || left.styleName !== right.styleName
      || left.styleFolderName !== right.styleFolderName
      || left.status !== right.status
      || left.createdAt !== right.createdAt
      || left.exiting !== right.exiting
    ) {
      return false;
    }
  }
  return true;
}

function areStringArraysEquivalent(a?: string[], b?: string[]): boolean {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function areNumberArraysEquivalent(a?: number[], b?: number[]): boolean {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function areQueueVisualStatesEquivalent(a: QueueVisualState | null, b: QueueVisualState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.requestId === b.requestId
    && a.mode === b.mode
    && a.activeSetId === b.activeSetId
    && a.activeIndex === b.activeIndex
    && a.jobProgress === b.jobProgress
    && areStringArraysEquivalent(a.prompts, b.prompts)
    && areStringArraysEquivalent(a.promptIds, b.promptIds)
    && areNumberArraysEquivalent(a.promptSeeds, b.promptSeeds);
}

function areGenerationPreviewStatesEquivalent(a: GenerationPreviewState | null, b: GenerationPreviewState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.requestId === b.requestId
    && a.promptId === b.promptId
    && a.promptIndex === b.promptIndex
    && a.prompt === b.prompt
    && a.imageDataUrl === b.imageDataUrl
    && a.step === b.step
    && a.maxStep === b.maxStep
    && a.status === b.status;
}

function buildBackendQueueSnapshotSignature(snapshot: any): string {
  const rawRequests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
  return JSON.stringify({
    paused: snapshot?.paused === true,
    activeRequestId: String(snapshot?.activeRequestId || ''),
    activePromptIndex: Math.max(0, Math.floor(Number(snapshot?.activePromptIndex) || 0)),
    requests: rawRequests.map((request: any) => ({
      requestId: normalizeRequestId(request?.requestId),
      status: String(request?.status || '').trim().toLowerCase(),
      activeIndex: Math.max(0, Math.floor(Number(request?.activeIndex) || 0)),
      activeSetId: clampQueueSetId(request?.activeSetId ?? 1),
      createdAt: Math.max(0, Math.floor(Number(request?.createdAt) || 0)),
      prompts: (Array.isArray(request?.prompts) ? request.prompts : []).map((prompt: any) => ({
        promptIndex: Math.max(0, Math.floor(Number(prompt?.promptIndex) || 0)),
        status: String(prompt?.status || 'pending').trim().toLowerCase(),
        promptId: String(prompt?.promptId || '').trim(),
        seed: Number.isFinite(Number(prompt?.seed)) ? Math.max(0, Math.floor(Number(prompt.seed))) : 0,
        generation: prompt?.generation && typeof prompt.generation === 'object' ? prompt.generation : null,
        setId: clampQueueSetId(prompt?.setId ?? request?.activeSetId ?? 1),
        styleName: String(prompt?.styleName || '').trim(),
        outputSubfolder: String(prompt?.outputSubfolder || '').trim(),
      })),
    })),
  });
}

const POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED = false;
const POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED = false;
const POWER_PROMPTER_QUEUE_EDITOR_ENABLED = true;
const POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED = false;

function normalizeQueueSavedOutputPreviewImages(payload: any): PowerPrompterQueueHistoryPreviewImage[] {
  const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
  if (outputs.length <= 0) return [];
  return normalizePowerPrompterQueueHistoryPreviewImages(outputs.map((output: any) => ({
    ...output,
    promptIndex: output?.promptIndex ?? payload?.promptIndex,
    promptId: output?.promptId ?? payload?.promptId,
    setId: output?.setId ?? output?.promptSetId ?? payload?.promptSetId,
    mediaKind: output?.mediaKind ?? output?.type,
    modified: output?.modified ?? output?.updatedAt ?? payload?.updatedAt,
  })));
}

function resolveQueueHistoryEditorSnapshot(document: PowerPrompterQueueHistoryDocument): {
  groupSnapshot: PersistedQueueGroupSnapshot;
  editorSnapshot: PersistedQueueEditorSnapshot;
} | null {
  const groupSnapshots = Array.isArray(document.snapshot?.groupSnapshots)
    ? document.snapshot.groupSnapshots
    : [];
  for (const groupSnapshot of groupSnapshots) {
    const editorSnapshot = normalizeQueueEditorSnapshot(groupSnapshot.editorSnapshot);
    if (editorSnapshot) return { groupSnapshot, editorSnapshot };
  }
  return null;
}

type PrompterEditorRef = PowerPrompterCardChainEditorRef;

interface PowerPrompterProps {
  overlayMode?: boolean;
  isActive?: boolean;
}

type PowerPrompterUiPreferences = {
  selectedBridgeId?: string;
  queueManagerPreviewSplit?: unknown;
  activeQueueSet?: number;
  queueManagerSearchQuery?: string;
  queueManagerStyleFilter?: string;
  queueManagerSequenceMode?: QueueManagerSequenceMode;
  queuePromptExpandedMode?: boolean;
  generationPreviewHoldMs?: number | null;
  globalSearchQuery?: string;
  leftPanelCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
  currentFile?: string | null;
  panelMode?: PowerPrompterPanelMode;
  uiClientId?: string;
  updatedAt?: number;
};

type PowerPrompterPresetDocument = {
  id: string;
  name: string;
  sourceFilePath?: string;
  sourceFileKey?: string;
  document: PowerPrompterPromptPresetDocument;
  createdAt: number;
  updatedAt: number;
};

type PowerPrompterPromptPresetDocument = {
  version: 1;
  activeQueueSet: number;
  cards: PowerPrompterCardDocument['cards'];
  deletedCardGroups?: PowerPrompterCardDocument['deletedCardGroups'];
};

type PowerPrompterPresetStore = {
  version: 1;
  selectedPresetId?: string;
  selectedPresetIdByFile?: Record<string, string>;
  presets: PowerPrompterPresetDocument[];
};

type PowerPrompterPresetSession = {
  presetId: string;
  presetName: string;
  sourceFile: string;
  baseDocument: PowerPrompterCardDocument;
  baseContent: string;
  baseHadPendingChanges: boolean;
  loadedAt: number;
};

function getPowerPrompterUiPreferenceUpdatedAt(preferences: PowerPrompterUiPreferences | null | undefined): number {
  return Math.max(0, Math.floor(Number(preferences?.updatedAt) || 0));
}

function normalizeQueueManagerSequencePreference(value: unknown): QueueManagerSequenceMode {
  if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) return 'default';
  return value === 'similar' || value === 'balanced' || value === 'unique' ? value : 'default';
}

function normalizePowerPrompterUiSearchValue(value: unknown): string {
  return String(value || '').slice(0, 240);
}

function normalizePowerPrompterPresetName(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
}

function createPowerPrompterPresetId(): string {
  return `pppreset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePowerPrompterPresetSourceFilePath(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

function normalizePowerPrompterPresetSourceFileKey(value: unknown): string {
  const normalized = normalizePowerPrompterPresetSourceFilePath(value)
    .replace(/\/+$/, '')
    .toLowerCase();
  return normalized;
}

function getPowerPrompterPresetFileLabel(value: unknown): string {
  const normalized = normalizePowerPrompterPresetSourceFilePath(value);
  return normalized
    .split('/')
    .pop()
    ?.replace(/\.ppcards\.json$/i, '')
    .replace(/\.txt$/i, '')
    || 'Current file';
}

function normalizePowerPrompterPresetDocument(
  rawDocument: unknown,
): PowerPrompterPromptPresetDocument {
  const normalizedBase = normalizePowerPrompterCardDocument(rawDocument, null);
  return {
    version: 1,
    activeQueueSet: clampQueueSetId(normalizedBase.activeQueueSet),
    cards: normalizeChainCards(normalizedBase.cards),
    deletedCardGroups: normalizedBase.deletedCardGroups || {},
  };
}

function normalizePowerPrompterPresetStore(
  rawValue: unknown,
  options?: { activeFilePath?: string | null; assignLegacyToActiveFile?: boolean },
): PowerPrompterPresetStore {
  const raw = rawValue as Partial<PowerPrompterPresetStore> | null | undefined;
  const sourcePresets = Array.isArray(raw?.presets) ? raw.presets : [];
  const activeFilePath = normalizePowerPrompterPresetSourceFilePath(options?.activeFilePath || '');
  const activeFileKey = normalizePowerPrompterPresetSourceFileKey(activeFilePath);
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const presets: PowerPrompterPresetDocument[] = [];

  for (const entry of sourcePresets) {
    const rawPreset = entry as Partial<PowerPrompterPresetDocument> | null | undefined;
    const name = normalizePowerPrompterPresetName(rawPreset?.name);
    if (!name) continue;
    const nameKey = name.toLowerCase();
    let sourceFilePath = normalizePowerPrompterPresetSourceFilePath(rawPreset?.sourceFilePath || '');
    let sourceFileKey = normalizePowerPrompterPresetSourceFileKey(rawPreset?.sourceFileKey || sourceFilePath);
    if (!sourceFileKey && activeFileKey && options?.assignLegacyToActiveFile) {
      sourceFilePath = activeFilePath;
      sourceFileKey = activeFileKey;
    }
    const scopedNameKey = `${sourceFileKey || '__legacy__'}::${nameKey}`;
    if (seenNames.has(scopedNameKey)) continue;
    const idBase = String(rawPreset?.id || '').trim() || createPowerPrompterPresetId();
    let id = idBase;
    while (seenIds.has(id)) {
      id = createPowerPrompterPresetId();
    }
    seenIds.add(id);
    seenNames.add(scopedNameKey);
    const createdAt = Math.max(0, Math.floor(Number(rawPreset?.createdAt) || Date.now()));
    const updatedAt = Math.max(createdAt, Math.floor(Number(rawPreset?.updatedAt) || createdAt));
    presets.push({
      id,
      name,
      sourceFilePath,
      sourceFileKey,
      document: normalizePowerPrompterPresetDocument(rawPreset?.document),
      createdAt,
      updatedAt,
    });
  }

  presets.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  const rawSelectedByFile = raw?.selectedPresetIdByFile && typeof raw.selectedPresetIdByFile === 'object'
    ? raw.selectedPresetIdByFile
    : {};
  const selectedPresetIdByFile: Record<string, string> = {};
  for (const [fileKey, presetIdRaw] of Object.entries(rawSelectedByFile)) {
    const normalizedFileKey = normalizePowerPrompterPresetSourceFileKey(fileKey);
    const presetId = String(presetIdRaw || '').trim();
    if (!normalizedFileKey || !presetId) continue;
    if (presets.some((preset) => preset.id === presetId && preset.sourceFileKey === normalizedFileKey)) {
      selectedPresetIdByFile[normalizedFileKey] = presetId;
    }
  }
  const globalSelectedPresetId = String(raw?.selectedPresetId || '').trim();
  const selectedPresetId = activeFileKey
    ? (
      selectedPresetIdByFile[activeFileKey]
      || (presets.some((preset) => preset.id === globalSelectedPresetId && preset.sourceFileKey === activeFileKey)
        ? globalSelectedPresetId
        : '')
      || presets.find((preset) => preset.sourceFileKey === activeFileKey)?.id
      || ''
    )
    : (presets.some((preset) => preset.id === globalSelectedPresetId) ? globalSelectedPresetId : '');
  return {
    version: 1,
    selectedPresetId,
    selectedPresetIdByFile,
    presets,
  };
}

export const PowerPrompter = ({ overlayMode = false, isActive = true }: PowerPrompterProps) => {
  const normalizePrompterSourceFilePath = (value: unknown): string | null => {
    const normalized = String(value || '').trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .replace(/\.ppcards\.json$/i, '');
    return normalized || null;
  };

  const [remoteMode, setRemoteMode] = useState<string>(() => {
    if (typeof document === 'undefined') return 'desktop';
    return document.documentElement.dataset.umbraRemoteMode || 'desktop';
  });
  const isPhoneRemote = remoteMode === 'phone';
  const isTabletRemote = remoteMode === 'tablet';
  const isTouchRemote = isPhoneRemote || isTabletRemote;
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [cardDocument, setCardDocument] = useState<PowerPrompterCardDocument>(
    createDefaultPowerPrompterCardDocument(null)
  );
  const [enabledCSVs, setEnabledCSVs] = useState<string[]>([]);
  const editorRef = useRef<PrompterEditorRef>(null);
  const pendingEditorInsertsRef = useRef<string[]>([]);
  const [pendingEditorInsertTick, setPendingEditorInsertTick] = useState(0);
  const currentFileRef = useRef<string | null>(null);
  const contentRef = useRef('');
  const cardDocumentRef = useRef<PowerPrompterCardDocument>(cardDocument);
  const [activePowerPrompterPresetSession, setActivePowerPrompterPresetSession] = useState<PowerPrompterPresetSession | null>(null);
  const activePowerPrompterPresetSessionRef = useRef<PowerPrompterPresetSession | null>(null);
  const powerPrompterSessionRevisionRef = useRef(0);
  const powerPrompterSessionApplyingRef = useRef(false);
  const powerPrompterSessionUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuePauseActionRef = useRef<() => void | Promise<void>>(() => {});
  const queueStartActionRef = useRef<() => void | Promise<void>>(() => {});
  const queueCancelActionRef = useRef<() => void | Promise<void>>(() => {});
  const queueClearActionRef = useRef<() => void | Promise<void>>(() => {});
  const queueEmergencyActionRef = useRef<() => void | Promise<void>>(() => {});
  const queueToggleSetExpandedRef = useRef<(setGroupId: string) => void>(() => {});
  const queueToggleGroupExpandedRef = useRef<(requestId: string) => void>(() => {});
  const queueCancelSetGroupRef = useRef<(setId: number) => void | Promise<void>>(() => {});
  const queueCancelRequestGroupRef = useRef<(requestId: string) => void | Promise<void>>(() => {});
  const prompterWsRef = useRef<WebSocket | null>(null);
  const prompterWsRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prompterWsReadyRef = useRef(false);
  const queueDebugLastEmittedAtRef = useRef(new Map<string, number>());
  const pendingQueueRequestsRef = useRef(new Map<string, {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const pendingLoraCatalogRequestsRef = useRef(new Map<string, {
    resolve: (value: string[]) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const pendingLoraInfoRequestsRef = useRef(new Map<string, {
    resolve: (value: PowerPrompterLoraInfoPayload) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    previewOnly: boolean;
  }>());
  const pendingModelCatalogRequestsRef = useRef(new Map<string, {
    resolve: (value: string[]) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }>());
  const pendingModelInfoRequestsRef = useRef(new Map<string, {
    resolve: (value: PowerPrompterModelInfoPayload) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    previewOnly: boolean;
  }>());
  const intentionallyCanceledQueueRequestIdsRef = useRef(new Set<string>());
  const fileLoadRequestSeqRef = useRef(0);
  const queueRequestMetaRef = useRef(powerPrompterQueueSession.queueRequestMeta);
  const queueBridgeDispatchedRequestIdsRef = useRef(powerPrompterQueueSession.queueBridgeDispatchedRequestIds);
  const queueSequentialDispatchInFlightRef = useRef(false);
  const restoredPausedQueueRef = useRef<PersistedPausedQueueSnapshot | null>(powerPrompterQueueSession.restoredPausedQueue);
  const didRestorePausedQueueRef = useRef(false);
  const pendingQueueCancelScopeRef = useRef<string[]>([]);
  const pendingQueueClearFutureScopeRef = useRef<string[]>([]);
  const pendingQueuePromptRemovalOpsRef = useRef(new Map<string, Array<{ requestId: string; promptIndices: number[] }>>());
  const pendingQueuePromptRemovalKeysRef = useRef(new Set<string>());
  const syncSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef('');
  const lastSavedCardSignatureRef = useRef('');
  const hasPendingChangesRef = useRef(false);
  const lastEditAtRef = useRef(0);
  const autosaveErrorShownRef = useRef(false);
  const autosaveInFlightRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerPrompterUiHydratedRef = useRef(false);
  const powerPrompterUiPendingFileRef = useRef<string | null>(null);
  const powerPrompterUiFileRestoredRef = useRef(false);
  const powerPrompterUiSessionUpdatedAtRef = useRef(0);
  const powerPrompterUiSuppressPersistUntilRef = useRef(0);
  const [, setPowerPrompterUiHydrationTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PowerPrompterSettings>(DEFAULT_POWER_PROMPTER_SETTINGS);
  const [queueDiversityDraft, setQueueDiversityDraft] = useState<number>(() =>
    normalizeQueueDiversity(DEFAULT_POWER_PROMPTER_SETTINGS.queueDiversity, DEFAULT_POWER_PROMPTER_SETTINGS.queueTraversalMode)
  );
  const [queuePromptLimitDraft, setQueuePromptLimitDraft] = useState<string>(() =>
    DEFAULT_POWER_PROMPTER_SETTINGS.queuePromptLimit === null
      ? ''
      : String(DEFAULT_POWER_PROMPTER_SETTINGS.queuePromptLimit)
  );
  const queuePromptLimitEditingRef = useRef(false);
  const [queueDiversityPickerOpen, setQueueDiversityPickerOpen] = useState(false);
  const [queueManagerSearchQuery, setQueueManagerSearchQuery] = useState('');
  const queueManagerSearchKey = useMemo(
    () => String(queueManagerSearchQuery || '').trim().toLowerCase(),
    [queueManagerSearchQuery]
  );
  const {
    globalSearchBoxRef,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchSuggestionOpen,
    setGlobalSearchSuggestionOpen,
    globalSearchSuggestionIndex,
    setGlobalSearchSuggestionIndex,
    globalSearchFocusValue,
    globalSearchFocusNonce,
    filteredGlobalSearchSuggestions,
    applyGlobalSearchSelection,
  } = usePowerPrompterGlobalSearch(cardDocument);
  const [queueSetTarget, setQueueSetTarget] = useState<number>(1);
  const [bridgeTargets, setBridgeTargets] = useState<PowerPrompterBridgeTarget[]>([]);
  const [selectedBridgeId, setSelectedBridgeId] = useState<string>('');
  const [queueingMode, setQueueingMode] = useState<PowerPrompterQueueMode | null>(null);
  const [queueStackItems, setQueueStackItemsState] = useState<QueueStackItem[]>(() => (
    powerPrompterQueueSession.queueStackItems.filter((item) => (
      !item.exiting && (item.status === 'pending' || item.status === 'running')
    ))
  ));
  const [queueVisualState, setQueueVisualStateState] = useState<QueueVisualState | null>(() => powerPrompterQueueSession.queueVisualState);
  const [queueCompletionTick, setQueueCompletionTick] = useState(0);
  const [generationPreview, setGenerationPreviewState] = useState<GenerationPreviewState | null>(() => powerPrompterQueueSession.generationPreview);
  const generationPreviewRef = useRef<GenerationPreviewState | null>(powerPrompterQueueSession.generationPreview);
  const [prompterPanelMode, setPrompterPanelMode] = useState<PowerPrompterPanelMode>('editor');
  const powerPrompterUiClientIdRef = useRef(`powerprompter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const localPanelModeChangeRef = useRef<{ mode: PowerPrompterPanelMode; at: number } | null>(null);
  const handlePrompterPanelModeChange = useCallback((mode: PowerPrompterPanelMode) => {
    localPanelModeChangeRef.current = { mode, at: Date.now() };
    setPrompterPanelMode(mode);
  }, []);
  const shouldIgnoreIncomingPanelMode = useCallback((mode: PowerPrompterPanelMode, preferences?: PowerPrompterUiPreferences | null) => {
    const sourceClientId = String(preferences?.uiClientId || '');
    if (sourceClientId && sourceClientId === powerPrompterUiClientIdRef.current) return true;
    const localChange = localPanelModeChangeRef.current;
    return !!localChange && localChange.mode !== mode && Date.now() - localChange.at < 2500;
  }, []);
  const [queueEditorDocument, setQueueEditorDocument] = useState<PowerPrompterCardDocument>(
    createDefaultPowerPrompterCardDocument(null)
  );
  const [queueEditorDraft, setQueueEditorDraft] = useState<QueueEditorDraft | null>(null);
  const [queueEditorSaving, setQueueEditorSaving] = useState(false);
  const queueEditorDocumentRef = useRef<PowerPrompterCardDocument>(queueEditorDocument);
  const [outputPreviewSnapshot, setOutputPreviewSnapshot] = useState<PowerPrompterOutputPreviewSnapshot>({
    items: [],
    isLoading: false,
    error: null,
  });
  const queueManagerOutputPreviewSeqRef = useRef(0);
  const queueManagerOutputPreviewItemCountRef = useRef(0);
  const [powerPrompterPresets, setPowerPrompterPresets] = useState<PowerPrompterPresetDocument[]>([]);
  const [selectedPowerPrompterPresetId, setSelectedPowerPrompterPresetId] = useState('');
  const [powerPrompterPresetNameDraft, setPowerPrompterPresetNameDraft] = useState('');
  const [powerPrompterPresetBusy, setPowerPrompterPresetBusy] = useState<'refresh' | 'save' | 'load' | 'delete' | null>(null);
  const [queueManagerDragState, setQueueManagerDragState] = useState<QueueManagerDragState | null>(null);
  const [queueManagerStyleFilter, setQueueManagerStyleFilter] = useState('');
  const [queueOutputMenu, setQueueOutputMenu] = useState<QueueManagerOutputMenuState | null>(null);
  const [savedQueues, setSavedQueues] = useState<SavedPowerPrompterQueueSummary[]>([]);
  const [selectedSavedQueueId, setSelectedSavedQueueId] = useState('');
  const [savedQueueBusy, setSavedQueueBusy] = useState<'list' | 'save' | 'load' | 'delete' | null>(null);
  const [saveQueueNameDraft, setSaveQueueNameDraft] = useState('');
  const [saveQueueModalOpen, setSaveQueueModalOpen] = useState(false);
  const savedQueuesRef = useRef<SavedPowerPrompterQueueSummary[]>([]);
  const selectedSavedQueueIdRef = useRef('');
  const pendingSavedQueueSnapshotRef = useRef<PersistedPausedQueueSnapshot | null>(null);
  const [queueHistoryOpen, setQueueHistoryOpen] = useState(false);
  const [queueHistoryItems, setQueueHistoryItems] = useState<PowerPrompterQueueHistorySummary[]>([]);
  const [selectedQueueHistoryId, setSelectedQueueHistoryId] = useState('');
  const [queueHistoryBusy, setQueueHistoryBusy] = useState<'list' | 'load' | 'requeue' | 'delete' | null>(null);
  const queueHistoryItemsRef = useRef<PowerPrompterQueueHistorySummary[]>([]);
  const selectedQueueHistoryIdRef = useRef('');
  const queueHistoryByRequestIdRef = useRef(new Map<string, string>());
  const queueHistoryPendingPatchByRequestIdRef = useRef(new Map<string, Partial<PowerPrompterQueueHistorySummary>>());
  const queueDiversityPickerRef = useRef<HTMLDivElement | null>(null);
  const queueDiversityPickerPopoverRef = useRef<HTMLDivElement | null>(null);
  const queueDiversityHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueDiversityHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueDiversityHoldDirtyRef = useRef(false);
  const [generationPreviewHoldMs, setGenerationPreviewHoldMs] = useState<number | null>(PREVIEW_CARD_HIDE_DELAY_MS);
  const [queueManagerPreviewSplit, setQueueManagerPreviewSplit] = useState<number>(DEFAULT_QUEUE_MANAGER_PREVIEW_SPLIT);
  const [loadingPromptFileName, setLoadingPromptFileName] = useState<string | null>(null);
  const [loraCatalog, setLoraCatalog] = useState<string[]>([]);
  const [loraInfoCache, setLoraInfoCache] = useState<Record<string, PowerPrompterLoraInfoPayload>>({});
  const [modelCatalog, setModelCatalog] = useState<string[]>([]);
  const [modelInfoCache, setModelInfoCache] = useState<Record<string, PowerPrompterModelInfoPayload>>({});
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [expandedQueueSets, setExpandedQueueSets] = useState<Record<string, boolean>>({});
  const [expandedQueueGroups, setExpandedQueueGroups] = useState<Record<string, boolean>>({});
  const [expandedQueuePromptRows, setExpandedQueuePromptRows] = useState<Record<string, boolean>>({});
  const [queuePromptExpandedMode, setQueuePromptExpandedMode] = useState(false);
  const [queueManagerSequenceMode, setQueueManagerSequenceMode] = useState<QueueManagerSequenceMode>('default');
  const [selectedQueuePromptKeys, setSelectedQueuePromptKeys] = useState<Record<string, boolean>>({});
  const selectedQueuePromptCount = useMemo(
    () => Object.values(selectedQueuePromptKeys).filter(Boolean).length,
    [selectedQueuePromptKeys]
  );
  const [queuePromptSelectionAnchor, setQueuePromptSelectionAnchor] = useState<{ requestId: string; promptIndex: number } | null>(null);
  const [queuePaused, setQueuePausedState] = useState(() => powerPrompterQueueSession.queuePaused);
  const queuePausedRef = useRef(powerPrompterQueueSession.queuePaused);
  const [queueDispatchDelayMs, setQueueDispatchDelayMs] = useState(0);
  const [queueControlBusy, setQueueControlBusy] = useState<'start' | 'cancel' | 'clear' | 'emergency' | null>(null);
  const [queueConfirmAction, setQueueConfirmAction] = useState<'cancel' | 'clear' | 'emergency' | null>(null);
  const [editorInteractionResetTick, setEditorInteractionResetTick] = useState(0);
  const [editorRemountTick, setEditorRemountTick] = useState(0);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(true);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(true);
  const queueStackRemoveTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const generationPreviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueManagerRightPaneRef = useRef<HTMLDivElement | null>(null);
  const queueManagerResizeCleanupRef = useRef<(() => void) | null>(null);
  const soundMenuRef = useRef<HTMLDivElement | null>(null);
  const [queueTimingRevision, setQueueTimingRevision] = useState(0);
  const completedPromptIndicesRef = useRef(powerPrompterQueueSession.completedPromptIndices);
  const queuePromptStartedAtRef = useRef(powerPrompterQueueSession.queuePromptStartedAt);
  const queueRequestFirstPromptMsRef = useRef(powerPrompterQueueSession.queueRequestFirstPromptMs);
  const queuePromptLastActivityAtRef = useRef(powerPrompterQueueSession.queuePromptLastActivityAt);
  const stalledQueuePromptKeysRef = useRef(powerPrompterQueueSession.stalledQueuePromptKeys);
  const queueDebugSeqRef = useRef(0);
  const powerPrompterDebugSeqRef = useRef(0);
  const lastLocalQueueInterruptHandledAtRef = useRef(0);
  const lastQueueEstimateDiagnosticsSignatureRef = useRef('');
  const lastGenerationPreviewDiagnosticsSignatureRef = useRef('');
  const lastGenerationPreviewBroadcastSignatureRef = useRef('');
  const clearedQueueRequestIdsRef = useRef(powerPrompterQueueSession.clearedQueueRequestIds);
  const resumeQueueInFlightRef = useRef(false);
  const bridgeQueueStateRef = useRef(powerPrompterQueueSession.bridgeQueueState);
  const staleQueueRequestIdsRef = useRef(powerPrompterQueueSession.staleQueueRequestIds);
  const staleQueuePromptKeysRef = useRef(powerPrompterQueueSession.staleQueuePromptKeys);
  const staleQueueEventTimersRef = useRef(powerPrompterQueueSession.staleQueueEventTimers);
  const queueVisualStateRef = useRef<QueueVisualState | null>(powerPrompterQueueSession.queueVisualState);
  const queueDefaultPromptItemOrderRef = useRef<Map<string, string[]>>(new Map());
  const queueStackItemsRef = useRef<QueueStackItem[]>(
    powerPrompterQueueSession.queueStackItems.filter((item) => (
      !item.exiting && (item.status === 'pending' || item.status === 'running')
    ))
  );
  const backendQueueSnapshotRequestIdsRef = useRef<Set<string>>(new Set());
  const backendQueueSnapshotActiveUntilRef = useRef(0);
  const backendQueuePauseRequestedRef = useRef(false);
  const backendQueueSnapshotSignatureRef = useRef('');
  const lastJobProgressCommitRef = useRef<{
    key: string;
    progress: number;
    activeIndex: number;
    committedAt: number;
  }>({ key: '', progress: -1, activeIndex: -1, committedAt: 0 });
  const lastGenerationPreviewCommitRef = useRef<{
    key: string;
    committedAt: number;
  }>({ key: '', committedAt: 0 });
  const updateQueueStackItemsSynced = useCallback((
    updater: QueueStackItem[] | ((prev: QueueStackItem[]) => QueueStackItem[])
  ) => {
    setQueueStackItemsState((prev) => {
      const candidate = typeof updater === 'function'
        ? (updater as (previous: QueueStackItem[]) => QueueStackItem[])(prev)
        : updater;
      const liveCandidate = (Array.isArray(candidate) ? candidate : []).filter((item) => (
        !item.exiting && (item.status === 'pending' || item.status === 'running')
      ));
      const next = applyQueueStackRunningState(liveCandidate);
      if (areQueueStackItemsEquivalent(prev, next)) {
        queueStackItemsRef.current = prev;
        powerPrompterQueueSession.queueStackItems = prev;
        return prev;
      }
      queueStackItemsRef.current = next;
      powerPrompterQueueSession.queueStackItems = next;
      return next;
    });
  }, []);

  const getQueueRequestOrderFromStackItems = useCallback((items: QueueStackItem[]) => {
    const firstCreatedAtByRequest = new Map<string, number>();
    for (const item of items) {
      const requestId = String(item.requestId || '').trim();
      if (!requestId) continue;
      const createdAt = Math.max(0, Math.floor(Number(item.createdAt) || 0));
      const existing = firstCreatedAtByRequest.get(requestId);
      if (existing === undefined || createdAt < existing) {
        firstCreatedAtByRequest.set(requestId, createdAt);
      }
    }
    return Array.from(firstCreatedAtByRequest.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([requestId]) => requestId);
  }, []);

  const applyQueueRequestOrderToStackItems = useCallback((items: QueueStackItem[], requestOrder: string[]) => {
    const normalizedOrder = Array.from(new Set(
      requestOrder.map((entry) => String(entry || '').trim()).filter(Boolean)
    ));
    if (normalizedOrder.length <= 0 || items.length <= 0) return items;
    const requestBaseById = new Map<string, number>();
    normalizedOrder.forEach((requestId, index) => {
      requestBaseById.set(requestId, (index + 1) * 100000);
    });
    return items.map((item) => {
      const requestId = String(item.requestId || '').trim();
      const base = requestBaseById.get(requestId);
      if (base === undefined) return item;
      const nextCreatedAt = base + Math.max(0, Math.floor(Number(item.promptIndex) || 0));
      return nextCreatedAt === item.createdAt ? item : { ...item, createdAt: nextCreatedAt };
    });
  }, []);
  const setQueueVisualState = useCallback((updater: React.SetStateAction<QueueVisualState | null>) => {
    setQueueVisualStateState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (previous: QueueVisualState | null) => QueueVisualState | null)(prev)
        : updater;
      if (areQueueVisualStatesEquivalent(prev, next)) {
        queueVisualStateRef.current = prev;
        powerPrompterQueueSession.queueVisualState = prev;
        return prev;
      }
      queueVisualStateRef.current = next;
      powerPrompterQueueSession.queueVisualState = next;
      return next;
    });
  }, []);
  const setGenerationPreview = useCallback((updater: React.SetStateAction<GenerationPreviewState | null>) => {
    setGenerationPreviewState((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (previous: GenerationPreviewState | null) => GenerationPreviewState | null)(prev)
        : updater;
      if (areGenerationPreviewStatesEquivalent(prev, next)) {
        generationPreviewRef.current = prev;
        powerPrompterQueueSession.generationPreview = prev;
        return prev;
      }
      generationPreviewRef.current = next;
      powerPrompterQueueSession.generationPreview = next;
      return next;
    });
  }, []);
  const setQueuePaused = useCallback((updater: React.SetStateAction<boolean>) => {
    const next = typeof updater === 'function'
      ? (updater as (previous: boolean) => boolean)(queuePausedRef.current)
      : updater;
    if (queuePausedRef.current === next) return;
    queuePausedRef.current = next;
    powerPrompterQueueSession.queuePaused = next;
    setQueuePausedState(next);
  }, []);
  const queueSnapshotPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSnapshotPersistDueAtRef = useRef(0);
  const lastQueueSnapshotPersistStartedAtRef = useRef(0);
  const queueSnapshotPersistRevisionRef = useRef(0);
  const queueWorkerRef = useRef<Worker | null>(null);
  const queueWorkerRequestSeqRef = useRef(0);
  const queueWorkerPendingSignatureRef = useRef<Map<number, QueueSnapshotWorkerPending>>(new Map());
  const queueEstimateSeqRef = useRef(0);
  const queueEditorEstimateSeqRef = useRef(0);
  const lastPersistedQueueSnapshotSignatureRef = useRef('');
  const queueSubmissionInFlightRef = useRef(false);
  const recentQueueSubmissionSignaturesRef = useRef<Map<string, number>>(new Map());
  const queueDispatchDelayMsRef = useRef(0);
  const selectedQueueTargetTypeRef = useRef<PowerPrompterQueueTargetType>('pipeline');
  const effectiveQueueTargetBridgeIdRef = useRef('');
  const effectiveQueueTargetSelectionIdRef = useRef('');
  const generationPreviewHoldMsRef = useRef<number | null>(PREVIEW_CARD_HIDE_DELAY_MS);
  const { showToast, setActiveWorkspace, addScannedImport, setAppSetting, appSettings } = useStore();
  const syncUiAcrossDevices = appSettings['remote.syncUiAcrossDevices'] !== false;
  const { pipelines: powerPrompterPipelines } = usePowerPrompterPipelines(showToast);
  const apiWorkflowItems = useMemo(() => [{
    id: UMBRA_UI_AUTO_PIPELINE_ID,
    fileName: '',
    name: 'Umbra UI Pipeline',
    compatible: powerPrompterPipelines.some((entry) => entry.compatible),
    missing: powerPrompterPipelines.length > 0 ? [] : ['No locked text-to-image pipelines are installed'],
    virtual: true,
    umbraUiAuto: true,
    umbraUiPipelines: powerPrompterPipelines,
    updatedAt: Math.max(0, ...powerPrompterPipelines.map((entry) => entry.updatedAt)),
  }], [powerPrompterPipelines]);
  const [umbraUiHandoffBusy, setUmbraUiHandoffBusy] = useState(false);
  const showToastRef = useRef(showToast);
  const addToast = useToastStore((state) => state.addToast);

  const buildQueueDebugSnapshot = () => {
    const stackItems = queueStackItemsRef.current || [];
    const visual = queueVisualStateRef.current;
    const stackSummary = stackItems.reduce<Record<string, number>>((acc, item) => {
      const key = `${item.status}${item.exiting ? ':exiting' : ''}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const stackByRequest = Array.from(stackItems.reduce<Map<string, {
      total: number;
      pending: number;
      running: number;
      queued: number;
      failed: number;
      exiting: number;
      indices: number[];
    }>>((acc, item) => {
      const requestId = String(item.requestId || '').trim() || '(blank)';
      const entry = acc.get(requestId) || {
        total: 0,
        pending: 0,
        running: 0,
        queued: 0,
        failed: 0,
        exiting: 0,
        indices: [],
      };
      entry.total += 1;
      if (item.exiting) entry.exiting += 1;
      if (item.status === 'pending') entry.pending += 1;
      if (item.status === 'running') entry.running += 1;
      if (item.status === 'queued') entry.queued += 1;
      if (item.status === 'failed') entry.failed += 1;
      entry.indices.push(Math.max(0, Math.floor(Number(item.promptIndex) || 0)));
      acc.set(requestId, entry);
      return acc;
    }, new Map()).entries()).map(([requestId, entry]) => ({
      requestId,
      ...entry,
      indices: entry.indices.sort((a, b) => a - b).slice(0, 24),
    }));
    return {
      paused: queuePausedRef.current,
      controlBusy: queueControlBusy,
      queueingMode,
      visual: visual ? {
        requestId: visual.requestId,
        mode: visual.mode,
        activeSetId: visual.activeSetId,
        activeIndex: visual.activeIndex,
        total: visual.prompts.length,
        progress: visual.jobProgress,
        activePromptId: visual.promptIds?.[Math.max(0, Math.floor(Number(visual.activeIndex) || 0))] || '',
      } : null,
      generationPreview: generationPreview ? {
        requestId: generationPreview.requestId,
        promptIndex: generationPreview.promptIndex,
        promptId: generationPreview.promptId,
        status: generationPreview.status,
        step: generationPreview.step,
        maxStep: generationPreview.maxStep,
      } : null,
      stackSummary,
      stackByRequest,
      metaIds: Array.from(queueRequestMetaRef.current.keys()),
      bridgeDispatchedRequestIds: Array.from(queueBridgeDispatchedRequestIdsRef.current.keys()),
      pendingQueueRequestIds: Array.from(pendingQueueRequestsRef.current.keys()),
      completedByRequest: Array.from(completedPromptIndicesRef.current.entries()).map(([requestId, indices]) => ({
        requestId,
        indices: Array.from(indices).sort((a, b) => a - b),
      })),
      pendingCancelScope: [...pendingQueueCancelScopeRef.current],
      pendingClearFutureScope: [...pendingQueueClearFutureScopeRef.current],
      pendingPromptRemovalOps: Array.from(pendingQueuePromptRemovalOpsRef.current.entries()).map(([requestId, removals]) => ({
        requestId,
        removals,
      })),
      intentionallyCanceledIds: Array.from(intentionallyCanceledQueueRequestIdsRef.current),
      clearedIds: Array.from(clearedQueueRequestIdsRef.current),
      staleRequestIds: Array.from(staleQueueRequestIdsRef.current),
      stalePromptKeys: Array.from(staleQueuePromptKeysRef.current),
    };
  };

  const buildPowerPrompterDebugSnapshot = () => {
    const document = normalizePowerPrompterCardDocument(cardDocumentRef.current, currentFileRef.current || null);
    const cards = normalizeChainCards(document.cards);
    const byType = cards.reduce<Record<string, number>>((acc, card) => {
      const key = String(card.type || 'prompt');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const variantsBySet = cards.reduce<Record<string, number>>((acc, card) => {
      for (const setId of normalizeQueueSetIds(card.queueSetIds, false)) {
        const key = `S${setId}`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});
    const randomEnabledCount = cards.filter((card) => card.randomEnabled === true).length;
    const cycleWeightedCount = cards.filter((card) => {
      const weights = (card as any).queueCycleWeights;
      return weights && typeof weights === 'object' && Object.values(weights).some((value) => Math.max(1, Math.floor(Number(value) || 1)) > 1);
    }).length;
    const activePromptLength = composeActivePromptFromCards(cards, document.activeQueueSet).length;
    return {
      file: currentFileRef.current || restoredPausedQueueRef.current?.file || null,
      panelMode: prompterPanelMode,
      editorMode: settings.editorMode || 'cards',
      activeQueueSet: clampQueueSetId(document.activeQueueSet),
      cardCount: cards.length,
      byType,
      variantsBySet,
      disabledCount: cards.filter((card) => card.disabled === true).length,
      randomEnabledCount,
      cycleWeightedCount,
      activePromptLength,
      queueSettings: {
        targetSet: clampQueueSetId(queueSetTarget),
        traversalMode: queueTraversalMode,
        diversity: normalizeQueueDiversity(queueDiversity, queueTraversalMode),
        promptLimit: queuePromptLimit,
        shuffleEnabled: queueShuffleEnabled,
        shuffleSeed: settings.queueShuffleSeed,
        dispatchDelayMs: queueDispatchDelayMsRef.current,
      },
      generation: {
        model: document.generation?.model || '',
        sampler: document.generation?.sampler || '',
        scheduler: document.generation?.scheduler || '',
        steps: document.generation?.steps,
        cfg: document.generation?.cfg,
        width: document.generation?.width,
        height: document.generation?.height,
        seedMode: document.generation?.controlAfterGenerate || '',
      },
      csv: {
        enabledCount: enabledCSVs.length,
        selectedCount: enabledCSVs.length,
        searchQueryLength: globalSearchQuery.length,
      },
      queue: {
        paused: queuePausedRef.current,
        stackCount: queueStackItemsRef.current.length,
        metaCount: queueRequestMetaRef.current.size,
        pendingRequestCount: pendingQueueRequestsRef.current.size,
        bridgePendingCount: bridgeQueueStateRef.current.pendingCount,
      },
    };
  };

  const buildPowerPrompterDebugSummary = () => ({
    file: currentFileRef.current || null,
    panelMode: prompterPanelMode,
    editorMode: settings.editorMode || 'cards',
    activeQueueSet: clampQueueSetId(cardDocumentRef.current?.activeQueueSet),
    queue: {
      paused: queuePausedRef.current,
      stackCount: queueStackItemsRef.current.length,
      metaCount: queueRequestMetaRef.current.size,
      pendingRequestCount: pendingQueueRequestsRef.current.size,
      bridgePendingCount: bridgeQueueStateRef.current.pendingCount,
    },
  });

  const logPowerPrompterDebug = (event: string, detail?: Record<string, unknown>, options?: { includeQueue?: boolean }) => {
    const diagnosticsEnabled = isPowerPrompterDiagnosticEnabled();
    const importantEvent = isImportantPowerPrompterDiagnosticEvent(event);
    if (!diagnosticsEnabled && !importantEvent) return;

    const seq = ++powerPrompterDebugSeqRef.current;
    const includeFullSnapshot = diagnosticsEnabled;
    const payload = {
      seq,
      event,
      at: new Date().toISOString(),
      detail: detail || {},
      ...(includeFullSnapshot
        ? {
            snapshot: {
              ...buildPowerPrompterDebugSnapshot(),
              ...(options?.includeQueue === true ? { queueDebug: buildQueueDebugSnapshot() } : {}),
            },
          }
        : { summary: buildPowerPrompterDebugSummary() }),
    };
    if (diagnosticsEnabled) {
      try {
        console.groupCollapsed(`[Umbra][PowerPrompter] #${seq} ${event}`);
        console.log(payload);
        console.groupEnd();
      } catch {
        console.log('[Umbra][PowerPrompter]', payload);
      }
    }
    postPowerPrompterDiagnosticPayload(payload);
    if (diagnosticsEnabled && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('umbra:powerprompter-debug', { detail: payload }));
    }
  };

  const logQueueDebug = (event: string, detail?: Record<string, unknown>) => {
    if (!isPowerPrompterDiagnosticEnabled()) return;
    const noisyEvent = event === 'ws:queue_snapshot:ignored_duplicate'
      || event.startsWith('ws:job_progress:')
      || event.startsWith('ws:queue_progress:');
    if (noisyEvent) {
      const requestId = String(
        detail?.requestId
        || detail?.activeRequestId
        || (detail?.payload && typeof detail.payload === 'object' ? (detail.payload as any).requestId : '')
        || ''
      ).trim();
      const progress = Number(
        detail?.progress
        ?? detail?.jobProgress
        ?? (detail?.payload && typeof detail.payload === 'object' ? (detail.payload as any).progress : Number.NaN)
      );
      const terminalProgress = Number.isFinite(progress) && progress >= 0.999;
      const key = `${event}:${requestId || 'global'}`;
      const now = Date.now();
      const last = queueDebugLastEmittedAtRef.current.get(key) || 0;
      if (!terminalProgress && now - last < 1000) return;
      queueDebugLastEmittedAtRef.current.set(key, now);
    }
    const seq = ++queueDebugSeqRef.current;
    const payload = {
      seq,
      event,
      at: new Date().toISOString(),
      detail: detail || {},
      snapshot: buildQueueDebugSnapshot(),
    };
    try {
      console.groupCollapsed(`[Umbra][PowerPrompterQueue] #${seq} ${event}`);
      console.log(payload);
      console.groupEnd();
    } catch {
      console.log('[Umbra][PowerPrompterQueue]', payload);
    }
    postPowerPrompterDiagnosticPayload({
      ...payload,
      event: `queue:${event}`,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('umbra:powerprompter-queue-debug', { detail: payload }));
    }
  };
  const bumpQueueTimingRevision = () => {
    setQueueTimingRevision((prev) => (prev + 1) % 1000000);
  };
  const markQueuePromptStarted = (requestIdInput: unknown, promptIndexInput: unknown) => {
    const key = getQueuePromptEventKey(requestIdInput, promptIndexInput);
    if (!key) return;
    const now = Date.now();
    if (!queuePromptStartedAtRef.current.has(key)) {
      queuePromptStartedAtRef.current.set(key, now);
    }
    queuePromptLastActivityAtRef.current.set(key, now);
    stalledQueuePromptKeysRef.current.delete(key);
  };
  const markQueuePromptActivity = (requestIdInput: unknown, promptIndexInput: unknown) => {
    const key = getQueuePromptEventKey(requestIdInput, promptIndexInput);
    if (!key) return;
    queuePromptLastActivityAtRef.current.set(key, Date.now());
    stalledQueuePromptKeysRef.current.delete(key);
  };
  const recordQueuePromptCompletionTiming = (requestIdInput: unknown, promptIndexInput: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    const key = getQueuePromptEventKey(requestId, promptIndexInput);
    if (!requestId || !key || queueRequestFirstPromptMsRef.current.has(requestId)) return;
    const completedAt = Date.now();
    const stackItem = queueStackItemsRef.current.find((item) =>
      String(item.requestId || '').trim() === requestId
      && item.promptIndex === Math.max(0, Math.floor(Number(promptIndexInput) || 0))
    );
    const startedAt = Number(queuePromptStartedAtRef.current.get(key)) || Number(stackItem?.createdAt) || completedAt;
    const elapsedMs = Math.max(1000, completedAt - startedAt);
    queueRequestFirstPromptMsRef.current.set(requestId, elapsedMs);
    bumpQueueTimingRevision();
  };
  const clearQueueTimingState = (requestIds?: string[]) => {
    const ids = Array.isArray(requestIds)
      ? new Set(requestIds.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0))
      : null;
    if (ids && ids.size <= 0) return;
    if (!ids) {
      queuePromptStartedAtRef.current.clear();
      queueRequestFirstPromptMsRef.current.clear();
      queuePromptLastActivityAtRef.current.clear();
      stalledQueuePromptKeysRef.current.clear();
      bumpQueueTimingRevision();
      return;
    }
    for (const requestId of ids) {
      queueRequestFirstPromptMsRef.current.delete(requestId);
      for (const key of Array.from(queuePromptStartedAtRef.current.keys())) {
        if (key.startsWith(`${requestId}:`)) queuePromptStartedAtRef.current.delete(key);
      }
      for (const key of Array.from(queuePromptLastActivityAtRef.current.keys())) {
        if (key.startsWith(`${requestId}:`)) queuePromptLastActivityAtRef.current.delete(key);
      }
      for (const key of Array.from(stalledQueuePromptKeysRef.current.keys())) {
        if (key.startsWith(`${requestId}:`)) stalledQueuePromptKeysRef.current.delete(key);
      }
    }
    bumpQueueTimingRevision();
  };
  const markStaleQueueEventKey = (kind: 'request' | 'prompt', key: string, ttlMs = 60000) => {
    if (!key) return;
    const timerKey = `${kind}:${key}`;
    const existingTimer = staleQueueEventTimersRef.current.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    if (kind === 'request') {
      staleQueueRequestIdsRef.current.add(key);
    } else {
      staleQueuePromptKeysRef.current.add(key);
    }
    const timer = setTimeout(() => {
      staleQueueEventTimersRef.current.delete(timerKey);
      if (kind === 'request') {
        staleQueueRequestIdsRef.current.delete(key);
      } else {
        staleQueuePromptKeysRef.current.delete(key);
      }
    }, ttlMs);
    staleQueueEventTimersRef.current.set(timerKey, timer);
  };
  const markQueueRequestEventsStale = (requestIdInput: unknown, ttlMs?: number) => {
    const requestId = String(requestIdInput || '').trim();
    if (requestId) markStaleQueueEventKey('request', requestId, ttlMs);
  };
  const markQueuePromptEventsStale = (requestIdInput: unknown, promptIndexInput: unknown, ttlMs?: number) => {
    const promptKey = getQueuePromptEventKey(requestIdInput, promptIndexInput);
    if (promptKey) markStaleQueueEventKey('prompt', promptKey, ttlMs);
  };
  const isStaleQueueEvent = (requestIdInput: unknown, promptIndexInput?: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return false;
    if (staleQueueRequestIdsRef.current.has(requestId)) return true;
    if (promptIndexInput === undefined) return false;
    const promptKey = getQueuePromptEventKey(requestId, promptIndexInput);
    return !!promptKey && staleQueuePromptKeysRef.current.has(promptKey);
  };
  const normalizeQueueEventPromptIndex = (requestIdInput: unknown, promptIndexInput: unknown) => {
    const requestId = normalizeRequestId(requestIdInput);
    const meta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
    return normalizeQueueEventPromptIndexCore(requestId, promptIndexInput, {
      promptCount: Math.max(0, Math.floor(Number(meta?.prompts?.length) || 0)),
      runningPromptIndex: findRunningPromptIndex(queueStackItemsRef.current, requestId),
    });
  };
  const markQueueStackPromptRunning = (requestIdInput: unknown, promptIndexInput: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    const promptIndex = Math.max(0, Math.floor(Number(promptIndexInput) || 0));
    if (!requestId) return;
    const currentItems = queueStackItemsRef.current;
    const alreadyRunning = currentItems.some((item) =>
      String(item.requestId || '').trim() === requestId
      && item.promptIndex === promptIndex
      && !item.exiting
      && item.status === 'running'
    );
    const hasOtherRunningInRequest = currentItems.some((item) =>
      String(item.requestId || '').trim() === requestId
      && item.promptIndex !== promptIndex
      && !item.exiting
      && item.status === 'running'
    );
    if (alreadyRunning && !hasOtherRunningInRequest) return;
    updateQueueStackItemsSynced((prev) =>
      prev.map((item) => {
        if (String(item.requestId || '').trim() !== requestId || item.exiting) return item;
        if (item.promptIndex === promptIndex) {
          return item.status === 'running' ? item : { ...item, status: 'running' };
        }
        if (item.status === 'running') {
          return { ...item, status: 'pending' };
        }
        return item;
      })
    );
  };
  const isPowerPrompterPopout = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('umbraPopout') === 'powerprompter';
  const queueSetColor = getSetColor(queueSetTarget);
  const queueDiversity = normalizeQueueDiversity(queueDiversityDraft, settings.queueTraversalMode);
  const rawQueuePromptLimit = normalizeQueuePromptLimit(queuePromptLimitDraft);
  const queuePromptLimitMinimum = useMemo(() => {
    const activeSetId = clampQueueSetId(queueSetTarget);
    const normalizedCards = normalizeChainCards(cardDocument.cards);
    const enabledStyleVariantIds = new Set(
      normalizedCards
      .filter((card) => card.type === 'style')
      .filter((card) => String(card.text || '').trim().length > 0)
      .filter((card) => normalizeQueueSetIds(card.queueSetIds, false).includes(activeSetId))
      .map((card) => String(card.id || '').trim())
      .filter(Boolean)
    );
    return Math.max(1, enabledStyleVariantIds.size);
  }, [cardDocument, queueSetTarget]);
  const queuePromptLimitStep = Math.max(1, queuePromptLimitMinimum);
  const queuePromptLimit = rawQueuePromptLimit === null
    ? null
    : Math.max(queuePromptLimitMinimum, rawQueuePromptLimit);
  const queueDiversityDraftRef = useRef(queueDiversityDraft);
  const queueTraversalMode = resolveQueueTraversalMode(settings.queueTraversalMode, queueDiversity);
  const queueDiversityLabel = getQueueDiversityLabel(queueDiversity);
  const queueDiversityPickerPosition = (() => {
    if (typeof window === 'undefined' || !queueDiversityPickerOpen) {
      return { left: 8, top: 8 };
    }
    const rect = queueDiversityPickerRef.current?.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = 460;
    if (!rect) {
      return {
        left: Math.max(8, window.innerWidth - popoverWidth - 8),
        top: 8,
      };
    }
    return {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8)),
      top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - popoverHeight - 8)),
    };
  })();
  const queueShuffleEnabled = settings.queueShuffleEnabled === true;
  const queueHistoryGroups = useMemo(() => buildQueueHistoryGroups(queueHistoryItems), [queueHistoryItems]);
  const apiWorkflowTargets = useMemo<PowerPrompterBridgeTarget[]>(
    () => apiWorkflowItems.map((item) => ({
      bridgeId: createApiWorkflowTargetId(item.id),
      workflowId: item.id,
      workflowName: item.name,
      compatible: item.compatible === true,
      missing: Array.isArray(item.missing) ? item.missing : [],
      source: 'api_workflow',
      connectedAt: item.updatedAt,
      updatedAt: item.updatedAt,
    })),
    [apiWorkflowItems]
  );
  const workflowTargets = useMemo<PowerPrompterBridgeTarget[]>(
    () => [...apiWorkflowTargets],
    [apiWorkflowTargets]
  );
  const effectiveQueueTargetBridgeId = useMemo(() => {
    if (bridgeTargets.length <= 0) return '';
    return bridgeTargets[0]?.bridgeId || '';
  }, [bridgeTargets]);
  const connectedCatalogBridgeTargetId = useMemo(() => {
    const connectedTarget = bridgeTargets.find((entry) => (
      !parseApiWorkflowTargetId(entry.bridgeId)
    ));
    return String(connectedTarget?.bridgeId || '').trim();
  }, [bridgeTargets]);
  const effectiveQueueTargetSelectionId = useMemo(() => {
    const defaultWorkflowTargetId = getDefaultApiWorkflowTargetId(apiWorkflowItems);
    if (workflowTargets.length <= 0) return '';
    if (selectedBridgeId && workflowTargets.some((entry) => entry.bridgeId === selectedBridgeId)) {
      return selectedBridgeId;
    }
    if (defaultWorkflowTargetId && workflowTargets.some((entry) => entry.bridgeId === defaultWorkflowTargetId)) {
      return defaultWorkflowTargetId;
    }
    return workflowTargets[0]?.bridgeId || '';
  }, [workflowTargets, selectedBridgeId, apiWorkflowItems]);
  const handleSendActivePromptToUmbraUi = useCallback(async () => {
    if (umbraUiHandoffBusy) return;
    const document = normalizePowerPrompterCardDocument(
      cardDocumentRef.current,
      currentFileRef.current || null,
    );
    const modelFamily = String(document.modelType || '').trim();
    if (!modelFamily) {
      showToast('Tag this PPCard file with a model family before sending it to Umbra UI.', 'error');
      return;
    }
    const prompt = composeActivePromptFromCards(document.cards, document.activeQueueSet).trim();
    if (!prompt) {
      showToast(`Set ${document.activeQueueSet} does not have an active prompt to send.`, 'error');
      return;
    }

    setUmbraUiHandoffBusy(true);
    try {
      const generation = normalizePowerPrompterGenerationControls(document.generation);
      const params = new URLSearchParams({
        feature: 'txt2img',
        modelFamily,
        modelSource: generation.modelType,
      });
      const response = await fetch(`/api/umbra-ui/pipelines/resolve?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'No compatible Umbra UI image pipeline is installed.'));
      }

      const targetId = createApiWorkflowTargetId(UMBRA_UI_AUTO_PIPELINE_ID);
      setSelectedBridgeId(targetId);
      stageUmbraUiPowerPrompterHandoff({
        prompt,
        modelFamily,
        generation: generation as unknown as Record<string, unknown>,
        sourceFile: String(currentFileRef.current || document.file || '').trim(),
      });
      setActiveWorkspace('umbraui');
      showToast(`Sent Set ${document.activeQueueSet} to Umbra UI for review.`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to send the active prompt to Umbra UI.'), 'error');
    } finally {
      setUmbraUiHandoffBusy(false);
    }
  }, [setActiveWorkspace, showToast, umbraUiHandoffBusy]);
  const selectedQueueTargetType: PowerPrompterQueueTargetType = 'pipeline';
  const resolveKnownApiWorkflowTargetId = (...candidates: unknown[]): string => {
    const knownTargets = new Set(workflowTargets.map((entry) => String(entry.bridgeId || '').trim()).filter(Boolean));
    const knownWorkflowIds = new Set(apiWorkflowItems.map((entry) => String(entry.id || '').trim()).filter(Boolean));
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (!normalized) continue;
      const parsedTargetId = parseApiWorkflowTargetId(normalized);
      if (parsedTargetId && knownTargets.has(normalized)) return normalized;
      if (parsedTargetId && knownWorkflowIds.has(parsedTargetId)) return createApiWorkflowTargetId(parsedTargetId);
      if (!parsedTargetId && knownWorkflowIds.has(normalized)) return createApiWorkflowTargetId(normalized);
    }
    return '';
  };
  const estimatedBatchSize = Math.max(1, Math.floor(Number(cardDocument.generation?.batchSize) || 1));
  const hasQueueStackCancelableWork = queueStackItems.some((item) => !item.exiting && (item.status === 'pending' || item.status === 'running'));
  const runningQueueItem = useMemo(
    () => queueStackItems.find((item) => !item.exiting && item.status === 'running') || null,
    [queueStackItems]
  );
  const activeQueueItem = useMemo(
    () => runningQueueItem || queueStackItems.find((item) => !item.exiting && item.status === 'pending') || null,
    [queueStackItems, runningQueueItem]
  );
  const queueRequestGroups = useMemo(() => buildQueueRequestGroups({
    queueStackItems,
    queueRequestMeta: queueRequestMetaRef.current,
    queueVisualState,
    clearedQueueRequestIds: clearedQueueRequestIdsRef.current,
    completedPromptIndices: completedPromptIndicesRef.current,
    queuePromptStartedAt: queuePromptStartedAtRef.current,
    queueRequestFirstPromptMs: queueRequestFirstPromptMsRef.current,
    queueDispatchDelayMs,
    queuePaused,
  }), [queueDispatchDelayMs, queuePaused, queueStackItems, queueTimingRevision, queueVisualState]);
  const queueSetGroups = useMemo(
    () => buildQueueSetGroups(queueRequestGroups, queuePaused),
    [queuePaused, queueRequestGroups]
  );
  const queueTotalPromptCount = useMemo(
    () => queueRequestGroups.reduce((total, group) => total + Math.max(0, Math.floor(Number(group.total) || 0)), 0),
    [queueRequestGroups]
  );
  const queueManagerStyleOptions = useMemo(
    () => buildQueueManagerStyleOptions(queueStackItems),
    [queueStackItems]
  );
  useEffect(() => {
    if (!queueManagerStyleFilter) return;
    const filterKey = queueManagerStyleFilter.toLowerCase();
    if (queueManagerStyleOptions.some((entry) => entry.name.toLowerCase() === filterKey)) return;
    setQueueManagerStyleFilter('');
  }, [queueManagerStyleFilter, queueManagerStyleOptions]);
  useEffect(() => {
    const liveKeys = new Set(
      queueStackItems
        .filter((item) => !item.exiting && item.status === 'pending')
        .map((item) => `${String(item.requestId || '').trim()}:${Math.max(0, Math.floor(Number(item.promptIndex) || 0))}`)
    );
    setSelectedQueuePromptKeys((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        if (prev[key] && liveKeys.has(key)) {
          next[key] = true;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setQueuePromptSelectionAnchor((prev) => {
      if (!prev) return prev;
      return liveKeys.has(`${prev.requestId}:${prev.promptIndex}`) ? prev : null;
    });
  }, [queueStackItems]);
  useEffect(() => {
    setExpandedQueueSets((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      const seen = new Set<string>();
      for (const setGroup of queueSetGroups) {
        const key = String(setGroup.id || setGroup.setId);
        seen.add(key);
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          next[key] = prev[key];
        } else {
          next[key] = false;
          changed = true;
        }
      }
      for (const key of Object.keys(prev)) {
        if (!seen.has(key)) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      return next;
    });
  }, [queueSetGroups]);
  useEffect(() => {
    setExpandedQueueGroups((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      const seen = new Set<string>();
      for (const group of queueRequestGroups) {
        const key = String(group.requestId || '').trim();
        if (!key) continue;
        seen.add(key);
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          next[key] = prev[key];
        } else {
          next[key] = false;
          changed = true;
        }
      }
      for (const key of Object.keys(prev)) {
        if (!seen.has(key)) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      return next;
      });
  }, [queueRequestGroups]);
  const hasCancelableQueueWork = useMemo(() => {
    if (hasQueueStackCancelableWork) return true;
    if (queueRequestGroups.some((group) => group.pending > 0 || group.running > 0)) return true;
    if (queueRequestGroups.some((group) => group.completed + group.failed < group.total)) return true;
    const visualRequestId = String(queueVisualState?.requestId || '').trim();
    return visualRequestId.length > 0;
  }, [hasQueueStackCancelableWork, queueRequestGroups, queueVisualState]);
  const hasClearableQueueWork = useMemo(() => (
    hasCancelableQueueWork
    || queueStackItems.some((item) => !item.exiting)
    || queueRequestGroups.length > 0
    || !!restoredPausedQueueRef.current
  ), [hasCancelableQueueWork, queueRequestGroups, queueStackItems]);
  const hasStagedQueue = useMemo(() => {
    const visualRequestId = String(queueVisualState?.requestId || '').trim();
    if (queuePaused && !!restoredPausedQueueRef.current) return true;
    if (queuePaused && queueRequestGroups.some((group) => group.pending > 0 || group.running > 0)) return true;
    return isLocalStagedQueueRequestId(visualRequestId) || queueRequestGroups.some((group) =>
      isLocalStagedQueueRequestId(group.requestId)
    );
  }, [queuePaused, queueRequestGroups, queueVisualState]);
  const hasStartableQueuedDispatch = useMemo(() => {
    if (queueStackItems.length <= 0) return false;
    if (queuePaused && !!restoredPausedQueueRef.current) return true;
    if (queuePaused && queueRequestGroups.some((group) => (
      (group.pending > 0 || group.running > 0)
      && queueRequestMetaRef.current.has(String(group.requestId || '').trim())
    ))) return true;
    return queueRequestGroups.some((group) =>
      isLocalStagedQueueRequestId(group.requestId) && (group.pending > 0 || group.running > 0)
    );
  }, [queuePaused, queueRequestGroups, queueStackItems]);
  const queueStartDisabled = !!queueControlBusy || !hasStartableQueuedDispatch;
  const queueDestructiveActionBusy = queueControlBusy === 'cancel' || queueControlBusy === 'clear' || queueControlBusy === 'emergency';
  const activeQueuePosition = useMemo(() => {
    const activeRequestId = String(activeQueueItem?.requestId || queueVisualState?.requestId || '').trim();
    const activeGroup = (
      activeRequestId
        ? queueRequestGroups.find((group) => group.requestId === activeRequestId)
        : null
    ) || queueRequestGroups.find((group) => group.running > 0 || group.pending > 0) || null;
    if (activeGroup) {
      const total = Math.max(1, Math.floor(Number(activeGroup.total) || 0));
      const position = Math.max(1, Math.min(total, Math.floor(Number(activeGroup.position) || 1)));
      return {
        position,
        total,
        remaining: Math.max(0, total - position),
      };
    }
    return buildActiveQueuePosition(queueVisualState);
  }, [activeQueueItem, queueRequestGroups, queueVisualState]);
  const selectedSavedQueue = useMemo(
    () => savedQueues.find((entry) => entry.id === selectedSavedQueueId) || null,
    [savedQueues, selectedSavedQueueId]
  );
  const hasLiveQueue = Boolean(queueVisualState && queueVisualState.prompts.length > 0);
  const queueTrackerPreviewUrl = useMemo(() => {
    const imageDataUrl = String(generationPreview?.imageDataUrl || '').trim();
    return imageDataUrl;
  }, [generationPreview]);
  const outputPreviewItems = outputPreviewSnapshot.items;
  const isLoadingOutputPreview = outputPreviewSnapshot.isLoading;
  const outputPreviewError = outputPreviewSnapshot.error;
  useEffect(() => {
    queueManagerOutputPreviewItemCountRef.current = outputPreviewItems.length;
  }, [outputPreviewItems.length]);
  const queueManagerActivePromptText = useMemo(
    () => getQueueManagerActivePromptText(activeQueueItem, queueVisualState),
    [activeQueueItem, queueVisualState]
  );
  const queueManagerActivePromptBlocks = useMemo(
    () => buildPowerPrompterActivePromptBlocks(cardDocument.cards, queueManagerActivePromptText, {
      setId: queueVisualState?.activeSetId ?? queueSetTarget,
    }),
    [cardDocument.cards, queueManagerActivePromptText, queueVisualState?.activeSetId, queueSetTarget]
  );
  const queueManagerPromptChipConfig = useMemo<PowerPrompterPromptChipConfig>(() => {
    const activeSetId = queueVisualState?.activeSetId ?? queueSetTarget;
    const generation = normalizePowerPrompterGenerationControls(cardDocument.generation);
    const loraColorByName: Record<string, string> = {};
    for (const entry of generation.loras || []) {
      const normalizedName = normalizeLoraSyntaxName(entry.name).toLowerCase();
      if (!normalizedName) continue;
      const setIds = normalizeLoraQueueSetIds(entry.queueSetIds, entry.queueEnabled !== false);
      const preferredSet = setIds.includes(activeSetId)
        ? activeSetId
        : (setIds[0] || activeSetId);
      loraColorByName[normalizedName] = getSetColor(preferredSet);
    }
    const trainedTags = Array.from(new Set(
      Object.values(loraInfoCache)
        .flatMap((info) => Array.isArray(info.trainedTags) ? info.trainedTags : [])
        .map((tag) => String(tag || '').trim())
        .filter((tag) => tag.length > 0)
    ));
    return { loraColorByName, trainedTags };
  }, [cardDocument.generation, loraInfoCache, queueVisualState?.activeSetId, queueSetTarget]);
  const hasActiveGenerationPreview = Boolean(generationPreview);
  const generationPreviewStatusLabel = generationPreview
    ? (generationPreview.status === 'running' ? 'Streaming' : 'Completed')
    : '';
  const generationPreviewStepLabel = generationPreview
    ? (generationPreview.maxStep > 0
      ? `Step ${Math.max(0, generationPreview.step)}/${Math.max(1, generationPreview.maxStep)}`
      : (generationPreview.step > 0 ? `Step ${Math.max(0, generationPreview.step)}` : 'Waiting for TAESD frame'))
    : '';
  const queueManagerAvailable = queueStackItems.length > 0
    || queueRequestGroups.length > 0
    || Boolean(queueVisualState?.requestId)
    || hasActiveGenerationPreview
    || outputPreviewItems.length > 0
    || isLoadingOutputPreview;
  const queueManagerMediaItems = useMemo(
    () => outputPreviewItems.slice(0, 300),
    [outputPreviewItems]
  );
  const queueManagerOutputBuckets = useMemo(
    () => buildQueueManagerOutputBuckets(queueManagerMediaItems),
    [queueManagerMediaItems]
  );
  const queueSummaryCounts = useMemo(
    () => buildQueueSummaryCounts(queueStackItems),
    [queueStackItems]
  );
  useEffect(() => {
    try {
      window.localStorage.removeItem(POWER_PROMPTER_QUEUE_MANAGER_SPLIT_STORAGE_KEY);
    } catch {
      // Legacy cleanup only.
    }
  }, []);
  const queueTrackerSummary = useMemo(
    () => buildQueueTrackerSummary(queueSetGroups, queueRequestGroups),
    [queueRequestGroups, queueSetGroups]
  );
  const powerPrompterQueueStatusDetail = useMemo(() => {
    const total = Math.max(0, Math.floor(Number(queueTotalPromptCount) || 0));
    const running = Math.max(0, Math.floor(Number(queueSummaryCounts.running) || 0));
    const pending = Math.max(0, Math.floor(Number(queueSummaryCounts.pending) || 0));
    const completed = Math.max(0, Math.floor(Number(queueSummaryCounts.queued) || 0));
    const failed = Math.max(0, Math.floor(Number(queueSummaryCounts.failed) || 0));
    const liveRemaining = Math.max(0, running + pending);
    const activePrompt = String(activeQueueItem?.prompt || '').trim();
    const nextPrompt = String(
      queueStackItems.find((item) => !item.exiting && item.status === 'pending')?.prompt || '',
    ).trim();
    const estimatedMsRemainingValues = queueRequestGroups
      .filter((group) => group.running > 0 || group.pending > 0)
      .map((group) => group.estimatedMsRemaining)
      .filter((value): value is number => Number.isFinite(Number(value)));
    const estimatedMsRemaining = estimatedMsRemainingValues.length > 0
      ? estimatedMsRemainingValues.reduce((sum, value) => sum + Math.max(0, Math.floor(value)), 0)
      : null;
    const statusLabel = activeQueuePosition
      ? `Running ${activeQueuePosition.position}/${activeQueuePosition.total}`
      : queueTrackerSummary.totalLabel;

    return {
      total,
      running,
      pending,
      completed,
      failed,
      position: Math.max(0, Math.floor(Number(activeQueuePosition?.position) || completed + running)),
      remaining: liveRemaining,
      activePrompt,
      nextPrompt,
      statusLabel,
      previewImageDataUrl: queueTrackerPreviewUrl,
      previewStepLabel: generationPreviewStepLabel,
      estimatedMsRemaining,
    };
  }, [
    activeQueueItem,
    activeQueuePosition,
    generationPreviewStepLabel,
    queueStackItems,
    queueRequestGroups,
    queueSummaryCounts,
    queueTotalPromptCount,
    queueTrackerPreviewUrl,
    queueTrackerSummary,
  ]);

  const emitPowerPrompterQueueStatus = useCallback((updatedAt = Date.now()) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('umbra:powerprompter-queue-status', {
      detail: {
        ...powerPrompterQueueStatusDetail,
        updatedAt,
      },
    }));
  }, [powerPrompterQueueStatusDetail]);

  useEffect(() => {
    emitPowerPrompterQueueStatus();
  }, [emitPowerPrompterQueueStatus]);

  useEffect(() => {
    if (powerPrompterQueueStatusDetail.total <= 0) return;
    if (
      powerPrompterQueueStatusDetail.running <= 0
      && powerPrompterQueueStatusDetail.pending <= 0
      && powerPrompterQueueStatusDetail.remaining <= 0
    ) return;
    const timer = window.setInterval(() => {
      emitPowerPrompterQueueStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [
    emitPowerPrompterQueueStatus,
    powerPrompterQueueStatusDetail.pending,
    powerPrompterQueueStatusDetail.remaining,
    powerPrompterQueueStatusDetail.running,
    powerPrompterQueueStatusDetail.total,
  ]);
  const lockedQueueRequestId = useMemo(() => {
    const runningRequestId = String(runningQueueItem?.requestId || '').trim();
    if (runningRequestId) return runningRequestId;
    const runningGroup = queueRequestGroups.find((group) => group.running > 0);
    return String(runningGroup?.requestId || '').trim();
  }, [queueRequestGroups, runningQueueItem]);
  const lockedQueuePromptIndex = useMemo(() => {
    if (!lockedQueueRequestId) return -1;
    if (runningQueueItem && String(runningQueueItem.requestId || '').trim() === lockedQueueRequestId) {
      return Math.max(0, Math.floor(Number(runningQueueItem.promptIndex) || 0));
    }
    const runningGroup = queueRequestGroups.find((group) => String(group.requestId || '').trim() === lockedQueueRequestId);
    const runningItem = runningGroup?.items.find((item) => !item.exiting && item.status === 'running');
    if (runningItem) {
      return Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0));
    }
    return -1;
  }, [lockedQueueRequestId, queueRequestGroups, runningQueueItem]);
  const promoteQueueVisualStateToRequest = useCallback((requestIdInput: string, promptIndexInput?: number) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return;
    const meta = queueRequestMetaRef.current.get(requestId);
    if (!meta || !Array.isArray(meta.prompts) || meta.prompts.length <= 0) return;
    const requestedPromptIndex = Number(promptIndexInput);
    const nextActiveIndex = Number.isFinite(requestedPromptIndex)
      ? Math.max(0, Math.min(meta.prompts.length - 1, Math.floor(requestedPromptIndex)))
      : 0;
    logQueueDebug('queue:promoteVisual:start', { requestId, promptIndex: nextActiveIndex, total: meta.prompts.length });
    if (generationPreviewHideTimerRef.current) {
      clearTimeout(generationPreviewHideTimerRef.current);
      generationPreviewHideTimerRef.current = null;
    }
    setQueueVisualState((prev) => {
      const previousForSameRequest = prev && String(prev.requestId || '').trim() === requestId ? prev : null;
      const nextPromptIds = meta.prompts.map((_, index) => String(previousForSameRequest?.promptIds?.[index] || ''));
      const nextPromptSeeds = meta.prompts.map((_, index) => {
        const numeric = Number(previousForSameRequest?.promptSeeds?.[index]);
        return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
      });
      return {
        requestId,
        mode: meta.mode,
        activeSetId: clampQueueSetId(meta.promptSetIds[nextActiveIndex] ?? meta.setId),
        prompts: [...meta.prompts],
        promptEntries: meta.promptEntries ? [...meta.promptEntries] : undefined,
        promptIds: nextPromptIds,
        promptSeeds: nextPromptSeeds,
        activeIndex: nextActiveIndex,
        jobProgress: previousForSameRequest?.jobProgress ?? 0,
        updatedAt: Date.now(),
      };
    });
    setGenerationPreview((prev) => {
      if (!prev) return prev;
      if (String(prev.requestId || '').trim() !== requestId) return prev;
      if (Math.max(0, Math.floor(Number(prev.promptIndex) || 0)) !== nextActiveIndex) return prev;
      return { ...prev, status: 'running', updatedAt: Date.now() };
    });
    logQueueDebug('queue:promoteVisual:end', { requestId, promptIndex: nextActiveIndex, total: meta.prompts.length });
  }, []);
  const promoteNextTrackedQueueRequest = useCallback((excludeRequestIdInput?: string) => {
    const excludeRequestId = String(excludeRequestIdInput || '').trim();
    const candidates = queueStackItemsRef.current
      .filter((item) => {
        if (item.exiting) return false;
        if (item.status !== 'running' && item.status !== 'pending') return false;
        const requestId = String(item.requestId || '').trim();
        return !!requestId && requestId !== excludeRequestId && queueRequestMetaRef.current.has(requestId);
      })
      .sort((left, right) => {
        const leftRunningRank = left.status === 'running' ? 0 : 1;
        const rightRunningRank = right.status === 'running' ? 0 : 1;
        if (leftRunningRank !== rightRunningRank) return leftRunningRank - rightRunningRank;
        if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
        return left.promptIndex - right.promptIndex;
      });
    const nextItem = candidates[0] || null;
    if (!nextItem) {
      logQueueDebug('queue:promoteNext:none', { excludeRequestId });
      return false;
    }
    logQueueDebug('queue:promoteNext:selected', {
      excludeRequestId,
      requestId: nextItem.requestId,
      promptIndex: nextItem.promptIndex,
      status: nextItem.status,
      candidateCount: candidates.length,
    });
    promoteQueueVisualStateToRequest(nextItem.requestId, nextItem.promptIndex);
    return true;
  }, [promoteQueueVisualStateToRequest]);
  const retireInterruptedQueuePromptLocally = useCallback((requestIdInput: unknown, promptIndexInput: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    const promptIndexRaw = Number(promptIndexInput);
    if (!requestId || !Number.isFinite(promptIndexRaw)) return false;
    const promptIndex = Math.max(0, Math.floor(promptIndexRaw));
    logQueueDebug('queue:retireInterrupted:start', { requestId, promptIndex });
    const stackBefore = queueStackItemsRef.current;
    const targetItem = stackBefore.find((item) =>
      String(item.requestId || '').trim() === requestId
      && item.promptIndex === promptIndex
      && !item.exiting
    );
    const meta = queueRequestMetaRef.current.get(requestId);
    const visual = queueVisualStateRef.current;
    const visualMatchesPrompt = visual
      && String(visual.requestId || '').trim() === requestId
      && Math.max(0, Math.floor(Number(visual.activeIndex) || 0)) === promptIndex;
    if (!targetItem && !visualMatchesPrompt) {
      logQueueDebug('queue:retireInterrupted:ignored', { requestId, promptIndex, visualMatchesPrompt });
      return false;
    }

    markQueuePromptEventsStale(requestId, promptIndex);
    let requestCompletions = completedPromptIndicesRef.current.get(requestId);
    if (!requestCompletions) {
      requestCompletions = new Set<number>();
      completedPromptIndicesRef.current.set(requestId, requestCompletions);
    }
    requestCompletions.add(promptIndex);

    const nextStack = applyQueueStackRunningState(
      stackBefore.map((item) => {
        if (String(item.requestId || '').trim() !== requestId || item.promptIndex !== promptIndex || item.exiting) {
          return item;
        }
        return { ...item, status: item.status === 'failed' ? 'failed' : 'queued', exiting: false };
      })
    );
    updateQueueStackItemsSynced(nextStack);

    const nextRunningItem = nextStack.find((item) =>
      String(item.requestId || '').trim() === requestId
      && !item.exiting
      && item.status === 'running'
    ) || null;

    if (meta && nextRunningItem) {
      promoteQueueVisualStateToRequest(requestId, nextRunningItem.promptIndex);
    } else {
      setQueueVisualState((prev) => {
        if (!prev || String(prev.requestId || '').trim() !== requestId) return prev;
        return null;
      });
      setGenerationPreview((prev) => {
        if (!prev || String(prev.requestId || '').trim() !== requestId) return prev;
        return { ...prev, status: 'idle', updatedAt: Date.now() };
      });
      scheduleGenerationPreviewHide();
      setTimeout(() => {
        promoteNextTrackedQueueRequest(requestId);
      }, 0);
    }

    scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 500 });
    logQueueDebug('queue:retireInterrupted:end', { requestId, promptIndex });
    return true;
  }, [promoteNextTrackedQueueRequest, promoteQueueVisualStateToRequest]);
  useEffect(() => {
    const runningRequestId = String(runningQueueItem?.requestId || '').trim();
    if (!runningRequestId) return;
    const visualRequestId = String(queueVisualState?.requestId || '').trim();
    const hasTrackedMeta = queueRequestMetaRef.current.has(runningRequestId);
    if (!hasTrackedMeta) return;
    if (visualRequestId === runningRequestId) return;
    promoteQueueVisualStateToRequest(runningRequestId, runningQueueItem?.promptIndex);
  }, [promoteQueueVisualStateToRequest, queueVisualState, runningQueueItem]);
  const handleQueueManagerSetDrop = useCallback((sourceSetGroupId: string, targetSetGroupId: string) => {
    if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) {
      showToast('Queue reordering is parked while Queue Manager follows backend order only.', 'error');
      return;
    }
    const setOrder = queueSetGroups.map((group) => String(group.id || group.setId));
    const sourceIndex = setOrder.indexOf(sourceSetGroupId);
    const targetIndex = setOrder.indexOf(targetSetGroupId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const nextSetOrder = moveArrayEntry(setOrder, sourceIndex, targetIndex);
    const requestOrder = nextSetOrder.flatMap((setGroupId) => {
      const setGroup = queueSetGroups.find((entry) => String(entry.id || entry.setId) === setGroupId);
      return setGroup ? setGroup.groups.map((group) => group.requestId) : [];
    });
    if (!requestQueueReorderThroughWebSocket({ requestOrder }, effectiveQueueTargetBridgeId, selectedQueueTargetType)) {
      showToast('Power Prompter queue tracker is not connected. Unable to reorder sets.', 'error');
      return;
    }
    applyLocalRequestOrder(requestOrder);
  }, [queueSetGroups, effectiveQueueTargetBridgeId, selectedQueueTargetType, showToast, applyLocalRequestOrder]);
  const handleQueueManagerGroupDrop = useCallback((setGroupId: string, sourceRequestId: string, targetRequestId: string) => {
    if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) {
      showToast('Queue reordering is parked while Queue Manager follows backend order only.', 'error');
      return;
    }
    const setGroup = queueSetGroups.find((entry) => String(entry.id || entry.setId) === setGroupId);
    if (!setGroup) return;
    const groupOrder = setGroup.groups.map((group) => group.requestId);
    const sourceIndex = groupOrder.indexOf(sourceRequestId);
    const targetIndex = groupOrder.indexOf(targetRequestId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const nextGroupOrder = moveArrayEntry(groupOrder, sourceIndex, targetIndex);
    const requestOrder = queueSetGroups.flatMap((entry) =>
      String(entry.id || entry.setId) === setGroupId
        ? nextGroupOrder
        : entry.groups.map((group) => group.requestId)
    );
    if (!requestQueueReorderThroughWebSocket({ requestOrder }, effectiveQueueTargetBridgeId, selectedQueueTargetType)) {
      showToast('Power Prompter queue tracker is not connected. Unable to reorder groups.', 'error');
      return;
    }
    applyLocalRequestOrder(requestOrder);
  }, [queueSetGroups, effectiveQueueTargetBridgeId, selectedQueueTargetType, showToast, applyLocalRequestOrder]);
  const handleQueueManagerPromptDrop = useCallback((requestId: string, sourcePromptIndex: number, targetPromptIndex: number) => {
    if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) {
      showToast('Queue reordering is parked while Queue Manager follows backend order only.', 'error');
      return;
    }
    const group = queueRequestGroups.find((entry) => entry.requestId === requestId);
    if (!group) return;
    const promptOrder = group.items
      .map((item) => Math.max(0, Math.floor(Number(item.promptIndex) || 0)))
      .sort((a, b) => a - b);
    const sourceIndex = promptOrder.indexOf(sourcePromptIndex);
    const targetIndex = promptOrder.indexOf(targetPromptIndex);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const nextPromptOrder = moveArrayEntry(promptOrder, sourceIndex, targetIndex);
    if (!requestQueueReorderThroughWebSocket({
      promptOrders: [{ requestId, promptOrder: nextPromptOrder }],
    }, effectiveQueueTargetBridgeId, selectedQueueTargetType)) {
      showToast('Power Prompter queue tracker is not connected. Unable to reorder prompts.', 'error');
      return;
    }
    applyLocalPromptOrder(requestId, nextPromptOrder);
  }, [queueRequestGroups, effectiveQueueTargetBridgeId, selectedQueueTargetType, showToast, applyLocalPromptOrder]);
  const persistQueuePromptRemovalMutation = useCallback(async (
    promptRemovals: Array<{ requestId: string; promptIndices: number[] }>,
  ) => {
    const normalizedPromptRemovals = Array.isArray(promptRemovals)
      ? promptRemovals
        .map((entry) => ({
          requestId: String(entry?.requestId || '').trim(),
          promptIndices: Array.isArray(entry?.promptIndices)
            ? Array.from(new Set(
              entry.promptIndices
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
                .map((value) => Math.max(0, Math.floor(value)))
            )).sort((a, b) => a - b)
            : [],
        }))
        .filter((entry) => entry.requestId && entry.promptIndices.length > 0)
      : [];
    if (normalizedPromptRemovals.length <= 0) return null;
    try {
      const response = await fetch('/api/powerprompter/queue/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          op: 'remove_prompts',
          promptRemovals: normalizedPromptRemovals,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'Failed to persist queue prompt removal.'));
      }
      logQueueDebug('queue:mutation:removePrompts:persisted', {
        removedRequestIds: payload?.removedRequestIds || [],
        promptRemovals: payload?.promptRemovals || normalizedPromptRemovals,
        hasSnapshot: Boolean(payload?.snapshot),
      });
      return payload;
    } catch (error: any) {
      logQueueDebug('queue:mutation:removePrompts:error', {
        promptRemovals: normalizedPromptRemovals,
        error: String(error?.message || error || ''),
      });
      return null;
    }
  }, [logQueueDebug]);
  const handleQueueManagerPromptRemove = useCallback((requestIdInput: string, promptIndexInput: number) => {
    const requestId = String(requestIdInput || '').trim();
    const promptIndex = Math.max(0, Math.floor(Number(promptIndexInput) || 0));
    if (!requestId) return;
    const group = queueRequestGroups.find((entry) => entry.requestId === requestId);
    if (!group) return;
    const item = group.items.find((entry) => entry.promptIndex === promptIndex && !entry.exiting);
    if (!item || item.status !== 'pending') return;
    const runningItem = group.items.find((entry) => !entry.exiting && entry.status === 'running') || null;
    const removablePendingItems = group.items.filter((entry) => !entry.exiting && entry.status === 'pending');
    if (!runningItem && removablePendingItems.length <= 1) {
      void queueCancelRequestGroupRef.current?.(requestId);
      return;
    }
    if (isLocalStagedQueueRequestId(requestId)) {
      if (applyLocalPromptRemoval(requestId, [promptIndex])) {
        setQueuePaused(true);
        scheduleRecoverableQueueSnapshotPersist({ paused: true, clearWhenEmpty: true, delayMs: 50 });
        showToast('Removed queued prompt', 'success');
      }
      return;
    }
    const removalRequestId = requestQueuePromptRemoveThroughWebSocket(
      [{ requestId, promptIndices: [promptIndex] }],
      queueRequestMetaRef.current.get(requestId)?.targetBridgeId || effectiveQueueTargetBridgeId,
      queueRequestMetaRef.current.get(requestId)?.queueTargetType || selectedQueueTargetType,
    );
    if (!removalRequestId) {
      showToast('Power Prompter queue tracker is not connected. Unable to remove queued prompt.', 'error');
      return;
    }
    applyLocalPromptRemoval(requestId, [promptIndex]);
    void persistQueuePromptRemovalMutation([{ requestId, promptIndices: [promptIndex] }]);
    scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
    showToast('Removed queued prompt', 'success');
  }, [queueRequestGroups, effectiveQueueTargetBridgeId, persistQueuePromptRemovalMutation, selectedQueueTargetType, showToast]);
  const getQueuePromptSelectionKey = useCallback((requestIdInput: unknown, promptIndexInput: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    const promptIndex = Math.max(0, Math.floor(Number(promptIndexInput) || 0));
    return requestId ? `${requestId}:${promptIndex}` : '';
  }, []);
  const getQueuePromptBlocksForItem = useCallback((item: QueueStackItem, setIdInput?: number): QueuePromptBlock[] => {
    const requestId = String(item.requestId || '').trim();
    const meta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
    const cards = meta?.editorSnapshot?.document?.cards || cardDocumentRef.current.cards;
    return buildQueuePromptBlocksForItem(item, cards, meta, setIdInput);
  }, []);

  const handleQueueManagerSequenceModeChange = useCallback((mode: QueueManagerSequenceMode) => {
    if (mode === queueManagerSequenceMode) return;
    if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) {
      showToast('Queue sequencing is parked while Queue Manager follows backend order only.', 'error');
      return;
    }
    const promptOrders: Array<{ requestId: string; promptOrder: number[] }> = [];
    for (const group of queueRequestGroups) {
      const pendingItems = group.items.filter((item) => !item.exiting && item.status === 'pending');
      if (pendingItems.length <= 1) continue;
      const requestId = String(group.requestId || '').trim();
      if (!requestId) continue;
      if (!queueDefaultPromptItemOrderRef.current.has(requestId)) {
        queueDefaultPromptItemOrderRef.current.set(requestId, captureDefaultPromptItemOrder(group));
      }
      const pendingPromptOrder = mode === 'default'
        ? buildDefaultPendingPromptOrderForGroup(group, queueDefaultPromptItemOrderRef.current.get(requestId) || [])
        : buildSequencedPendingPromptOrderForGroup(group, mode, getQueuePromptBlocksForItem);
      const promptOrder = mergePendingPromptOrderIntoGroupOrder(group, pendingPromptOrder);
      if (promptOrder.length > 1) {
        promptOrders.push({ requestId, promptOrder });
      }
    }
    setQueueManagerSequenceMode(mode);
    if (promptOrders.length <= 0) return;
    const sent = requestQueueReorderThroughWebSocket({ promptOrders }, effectiveQueueTargetBridgeId, selectedQueueTargetType);
    if (!sent) {
      showToast('Power Prompter queue tracker is not connected. Reordered the visible queue only.', 'error');
    }
    for (const entry of promptOrders) {
      applyLocalPromptOrder(entry.requestId, entry.promptOrder);
    }
  }, [
    applyLocalPromptOrder,
    effectiveQueueTargetBridgeId,
    getQueuePromptBlocksForItem,
    queueManagerSequenceMode,
    queueRequestGroups,
    selectedQueueTargetType,
    showToast,
  ]);
  const handleQueuePromptSelectionClick = useCallback((
    event: React.MouseEvent<HTMLButtonElement>,
    group: QueueRequestGroup,
    item: QueueStackItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (item.status !== 'pending' || item.exiting) return;
    const requestId = String(group.requestId || item.requestId || '').trim();
    const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
    const key = getQueuePromptSelectionKey(requestId, promptIndex);
    if (!key) return;
    const pendingItems = group.items
      .filter((entry) => !entry.exiting && entry.status === 'pending')
      .slice()
      .sort((left, right) => left.promptIndex - right.promptIndex);
    const selectedRangeKeys = (): string[] => {
      if (!event.shiftKey || !queuePromptSelectionAnchor || queuePromptSelectionAnchor.requestId !== requestId) {
        return [key];
      }
      const anchorPosition = pendingItems.findIndex((entry) => entry.promptIndex === queuePromptSelectionAnchor.promptIndex);
      const targetPosition = pendingItems.findIndex((entry) => entry.promptIndex === promptIndex);
      if (anchorPosition < 0 || targetPosition < 0) return [key];
      const start = Math.min(anchorPosition, targetPosition);
      const end = Math.max(anchorPosition, targetPosition);
      return pendingItems
        .slice(start, end + 1)
        .map((entry) => getQueuePromptSelectionKey(requestId, entry.promptIndex))
        .filter(Boolean);
    };
    const rangeKeys = selectedRangeKeys();
    setSelectedQueuePromptKeys((prev) => {
      const targetWasSelected = prev[key] === true;
      const next = (event.shiftKey || event.ctrlKey || event.metaKey || targetWasSelected)
        ? { ...prev }
        : {};
      for (const rangeKey of rangeKeys) {
        if ((event.ctrlKey || event.metaKey) || (!event.shiftKey && targetWasSelected)) {
          next[rangeKey] = !prev[rangeKey];
        } else {
          next[rangeKey] = true;
        }
      }
      return next;
    });
    setQueuePromptSelectionAnchor({ requestId, promptIndex });
  }, [getQueuePromptSelectionKey, queuePromptSelectionAnchor]);
  const handleQueueManagerSelectedPromptRemove = useCallback((requestIdInput?: string) => {
    const scopedRequestId = String(requestIdInput || '').trim();
    const selectedByRequest = new Map<string, number[]>();
    for (const key of Object.keys(selectedQueuePromptKeys)) {
      if (!selectedQueuePromptKeys[key]) continue;
      const separatorIndex = key.lastIndexOf(':');
      if (separatorIndex <= 0) continue;
      const requestId = key.slice(0, separatorIndex);
      if (scopedRequestId && requestId !== scopedRequestId) continue;
      const promptIndex = Number(key.slice(separatorIndex + 1));
      if (!Number.isFinite(promptIndex)) continue;
      const group = queueRequestGroups.find((entry) => entry.requestId === requestId);
      const item = group?.items.find((entry) => entry.promptIndex === Math.max(0, Math.floor(promptIndex)) && !entry.exiting);
      if (!item || item.status !== 'pending') continue;
      const existing = selectedByRequest.get(requestId) || [];
      existing.push(Math.max(0, Math.floor(promptIndex)));
      selectedByRequest.set(requestId, existing);
    }
    if (selectedByRequest.size <= 0) return;
    let removedCount = 0;
    for (const [requestId, promptIndices] of selectedByRequest.entries()) {
      const group = queueRequestGroups.find((entry) => entry.requestId === requestId);
      if (!group) continue;
      const runningItem = group.items.find((entry) => !entry.exiting && entry.status === 'running') || null;
      const removablePendingItems = group.items.filter((entry) => !entry.exiting && entry.status === 'pending');
      const normalizedPromptIndices = Array.from(new Set(promptIndices)).sort((a, b) => a - b);
      if (!runningItem && normalizedPromptIndices.length >= removablePendingItems.length) {
        void queueCancelRequestGroupRef.current?.(requestId);
        removedCount += removablePendingItems.length;
        continue;
      }
      if (isLocalStagedQueueRequestId(requestId)) {
        if (applyLocalPromptRemoval(requestId, normalizedPromptIndices)) {
          removedCount += normalizedPromptIndices.length;
        }
        continue;
      }
      const removalRequestId = requestQueuePromptRemoveThroughWebSocket(
        [{ requestId, promptIndices: normalizedPromptIndices }],
        queueRequestMetaRef.current.get(requestId)?.targetBridgeId || effectiveQueueTargetBridgeId,
        queueRequestMetaRef.current.get(requestId)?.queueTargetType || selectedQueueTargetType,
      );
      if (!removalRequestId) {
        showToast('Power Prompter queue tracker is not connected. Unable to remove selected prompts.', 'error');
        return;
      }
      applyLocalPromptRemoval(requestId, normalizedPromptIndices);
      void persistQueuePromptRemovalMutation([{ requestId, promptIndices: normalizedPromptIndices }]);
      removedCount += normalizedPromptIndices.length;
    }
    if (removedCount > 0) {
      setSelectedQueuePromptKeys((prev) => {
        const next = { ...prev };
        for (const [requestId, promptIndices] of selectedByRequest.entries()) {
          for (const promptIndex of promptIndices) {
            delete next[getQueuePromptSelectionKey(requestId, promptIndex)];
          }
        }
        return next;
      });
      setQueuePromptSelectionAnchor(null);
      if (Array.from(selectedByRequest.keys()).some((requestId) => isLocalStagedQueueRequestId(requestId))) {
        setQueuePaused(true);
        scheduleRecoverableQueueSnapshotPersist({ paused: true, clearWhenEmpty: true, delayMs: 50 });
      } else {
        scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
      }
      showToast(`Removed ${removedCount} queued prompt${removedCount === 1 ? '' : 's'}`, 'success');
    }
  }, [
    effectiveQueueTargetBridgeId,
    getQueuePromptSelectionKey,
    persistQueuePromptRemovalMutation,
    queueRequestGroups,
    selectedQueuePromptKeys,
    selectedQueueTargetType,
    showToast,
  ]);
  useEffect(() => {
    if (POWER_PROMPTER_QUEUE_EDITOR_ENABLED || prompterPanelMode !== 'queue-editor') return;
    setPrompterPanelMode('queue-manager');
  }, [prompterPanelMode]);
  const clearQueueManagerDragState = useCallback(() => {
    setQueueManagerDragState(null);
  }, []);
  const handleQueueDispatchDelayChange = useCallback((nextDelayMs: number) => {
    const normalizedDelay = Math.max(0, Math.floor(Number(nextDelayMs) || 0));
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
    const sent = requestQueueDispatchDelayUpdateThroughWebSocket(
      normalizedDelay,
      activeMeta?.targetBridgeId || effectiveQueueTargetBridgeId,
      activeMeta?.queueTargetType || selectedQueueTargetType
    );
    if (!sent) {
      showToast('Power Prompter queue tracker is not connected. Unable to change dispatch delay.', 'error');
      return;
    }
    setQueueDispatchDelayMs(normalizedDelay);
    const optionLabel = QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS.find((entry) => entry.value === normalizedDelay)?.label || `${Math.floor(normalizedDelay / 1000)}s`;
    showToast(`Queue dispatch delay set to ${optionLabel}`, 'success');
  }, [effectiveQueueTargetBridgeId, selectedQueueTargetType, showToast]);

  useEffect(() => {
    return () => {
      queueManagerResizeCleanupRef.current?.();
      queueManagerResizeCleanupRef.current = null;
    };
  }, []);

  const beginQueueManagerPaneResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (typeof window === 'undefined') return;
    event.preventDefault();
    queueManagerResizeCleanupRef.current?.();
    queueManagerResizeCleanupRef.current = null;
    const pane = queueManagerRightPaneRef.current;
    if (!pane) return;

    const updateSplitFromPointer = (clientY: number) => {
      const rect = pane.getBoundingClientRect();
      if (rect.height <= 0) return;
      const nextRatio = normalizeQueueManagerPreviewSplit((clientY - rect.top) / rect.height);
      setQueueManagerPreviewSplit(nextRatio);
    };

    updateSplitFromPointer(event.clientY);
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSplitFromPointer(moveEvent.clientY);
    };
    const finishResize = () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('blur', finishResize);
      queueManagerResizeCleanupRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize, { once: true });
    window.addEventListener('pointercancel', finishResize, { once: true });
    window.addEventListener('blur', finishResize, { once: true });
    queueManagerResizeCleanupRef.current = finishResize;
  }, []);
  const renderPromptBlockList = useCallback((
    blocks: Array<{ slotId: string; variantId: string; cardLabel: string; variantLabel: string; promptText: string }>,
    fallbackText: string
  ) => {
    return (
      <PowerPrompterActivePromptInline
        blocks={blocks}
        fallbackText={fallbackText}
        chipConfig={queueManagerPromptChipConfig}
      />
    );
  }, [queueManagerPromptChipConfig]);
  const renderHighlightedQueuePromptText = useCallback((textInput: unknown, queryInput: unknown): React.ReactNode => {
    const text = String(textInput || '');
    const query = String(queryInput || '').trim();
    if (!text || !query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    let matchIndex = lowerText.indexOf(lowerQuery, cursor);
    let segmentIndex = 0;
    while (matchIndex >= 0) {
      if (matchIndex > cursor) {
        nodes.push(
          <span key={`plain-${segmentIndex}`}>
            {text.slice(cursor, matchIndex)}
          </span>
        );
        segmentIndex += 1;
      }
      nodes.push(
        <mark
          key={`match-${segmentIndex}`}
          className="rounded-sm bg-cyan-300/20 px-0.5 text-cyan-50"
        >
          {text.slice(matchIndex, matchIndex + query.length)}
        </mark>
      );
      segmentIndex += 1;
      cursor = matchIndex + query.length;
      matchIndex = lowerText.indexOf(lowerQuery, cursor);
    }
    if (cursor < text.length) {
      nodes.push(
        <span key={`plain-${segmentIndex}`}>
          {text.slice(cursor)}
        </span>
      );
    }
    return nodes;
  }, []);
  const postQueueManagerGalleryOpenPath = useCallback((rawDetail: PendingGalleryOpenPathPayload) => {
    const path = String(rawDetail.path || rawDetail.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
    if (!path) return;
    const imagePath = String(rawDetail.imagePath || '').replace(/\\/g, '/').trim();
    const detail: PendingGalleryOpenPathPayload = {
      path,
      folderPath: path,
      ...(imagePath ? { imagePath } : {}),
      ...(String(rawDetail.source || '').trim() ? { source: String(rawDetail.source || '').trim() } : {}),
    };

    if (typeof window === 'undefined') return;
    const windowWithPending = window as typeof window & { __umbraPendingGalleryOpenPath?: PendingGalleryOpenPathPayload | null };
    windowWithPending.__umbraPendingGalleryOpenPath = detail;

    const emitOpenPath = () => {
      window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', { detail }));
    };

    emitOpenPath();
  }, []);
  const postQueueManagerGalleryRevealPath = useCallback((rawDetail: PendingGalleryOpenPathPayload) => {
    const path = String(rawDetail.path || rawDetail.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
    if (!path) return;
    const imagePath = String(rawDetail.imagePath || '').replace(/\\/g, '/').trim();
    const detail: PendingGalleryOpenPathPayload = {
      path,
      folderPath: path,
      ...(imagePath ? { imagePath } : {}),
      ...(String(rawDetail.source || '').trim() ? { source: String(rawDetail.source || '').trim() } : {}),
    };

    if (typeof window === 'undefined') return;
    const windowWithPending = window as typeof window & { __umbraPendingGalleryRevealPath?: PendingGalleryOpenPathPayload | null };
    windowWithPending.__umbraPendingGalleryRevealPath = detail;

    const emitRevealPath = () => {
      window.dispatchEvent(new CustomEvent('umbra:gallery-reveal-path', { detail }));
    };

    emitRevealPath();
  }, []);
  const openQueueManagerOutputInLibrary = useCallback((item: PowerPrompterOutputPreviewItem) => {
    const normalizedFilePath = normalizePrompterMediaPath(item.path);
    const folderPath = getPrompterParentFolderPath(normalizedFilePath);
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }
    const detail = {
      path: folderPath,
      folderPath,
      imagePath: normalizedFilePath,
      source: 'powerprompter-queue-manager',
    };
    setActiveWorkspace('library');
    postQueueManagerGalleryOpenPath(detail);
    showToast(`Opened in Gallery: ${item.name}`, 'success');
  }, [postQueueManagerGalleryOpenPath, setActiveWorkspace, showToast]);
  const revealQueueManagerOutputInLibrary = useCallback((item: PowerPrompterOutputPreviewItem) => {
    const normalizedFilePath = normalizePrompterMediaPath(item.path);
    const folderPath = getPrompterParentFolderPath(normalizedFilePath);
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }
    const detail = {
      path: folderPath,
      folderPath,
      imagePath: normalizedFilePath,
      source: 'powerprompter-queue-manager',
    };
    setActiveWorkspace('library');
    postQueueManagerGalleryRevealPath(detail);
    showToast(`Revealed in Gallery: ${item.name}`, 'success');
  }, [postQueueManagerGalleryRevealPath, setActiveWorkspace, showToast]);
  const openQueueManagerOutputInViewer = useCallback((item: PowerPrompterOutputPreviewItem) => {
    const normalizedFilePath = normalizePrompterMediaPath(item.path);
    if (!normalizedFilePath) {
      showToast('Unable to open output preview', 'error');
      return;
    }
    openQueueManagerOutputInLibrary(item);
  }, [openQueueManagerOutputInLibrary, showToast]);
  const openQueueManagerOutputInExplorer = useCallback(async (item: PowerPrompterOutputPreviewItem) => {
    if (isUmbraRemoteClient()) {
      showToast('Opening File Explorer is only available from the host PC.', 'error');
      return;
    }
    const normalizedFilePath = normalizePrompterMediaPath(item.path);
    const folderPath = getPrompterParentFolderPath(normalizedFilePath);
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
  const pinQueueManagerOutputFolder = useCallback((item: PowerPrompterOutputPreviewItem) => {
    const normalizedFilePath = normalizePrompterMediaPath(item.path);
    const folderPath = normalizePrompterMediaPath(getPrompterParentFolderPath(normalizedFilePath));
    if (!folderPath) {
      showToast('Unable to locate output folder', 'error');
      return;
    }
    const pinnedRaw = Array.isArray(appSettings['library.pinnedFolders'])
      ? appSettings['library.pinnedFolders']
      : [];
    const pinned = Array.from(new Set(
      pinnedRaw
        .map((entry) => normalizePrompterMediaPath(String(entry || '')))
        .filter(Boolean),
    ));
    if (pinned.includes(folderPath)) {
      showToast('Folder already pinned in Gallery + Filmstrip', 'success');
      return;
    }
    const nextPinned = [...pinned, folderPath];
    setAppSetting('library.pinnedFolders', nextPinned);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('umbra:gallery-pin-folder', {
        detail: {
          path: folderPath,
          pinned: true,
          source: 'powerprompter-queue-manager-pin',
        },
      }));
    }
    void pushAppSettingsToBackend(loadAppSettings()).catch(() => undefined);
    showToast(`Pinned folder: ${folderPath}`, 'success');
  }, [appSettings, setAppSetting, showToast]);
  const sendQueueManagerOutputToWorkspace = useCallback((item: PowerPrompterOutputPreviewItem, workspace: 'waifudiffusion' | 'scanner') => {
    const normalizedPath = normalizePrompterMediaPath(item.path);
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
      'success',
    );
  }, [addScannedImport, setActiveWorkspace, showToast]);
  const sendQueueManagerOutputToTrash = useCallback(async (item: PowerPrompterOutputPreviewItem) => {
    const normalizedPath = normalizePrompterMediaPath(item.path);
    if (!normalizedPath) {
      showToast('Invalid output path', 'error');
      return;
    }
    try {
      const currentSettings = loadAppSettings();
      const result = await deletePathsWithSettings([normalizedPath], currentSettings);
      setOutputPreviewSnapshot((prev) => ({
        ...prev,
        items: prev.items.filter((entry) => entry.id !== item.id),
      }));
      const deletedPaths = Array.from(new Set(
        (result.deletedPaths || [])
          .map((entry) => normalizePrompterMediaPath(entry))
          .filter(Boolean),
      ));
      if (typeof window !== 'undefined' && deletedPaths.length > 0) {
        window.dispatchEvent(new CustomEvent('umbra:gallery-remove-paths', {
          detail: {
            paths: deletedPaths,
            source: 'powerprompter-queue-output',
          },
        }));
        window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
          detail: { source: 'powerprompter-queue-output' },
        }));
      }
      const undoItem = (result.trashItems || []).find((entry) =>
        normalizePrompterMediaPath(entry?.originalPath) === normalizedPath);
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
                  setOutputPreviewSnapshot((prev) => {
                    const exists = prev.items.some((entry) => entry.id === item.id);
                    if (exists) return prev;
                    return {
                      ...prev,
                      items: [item, ...prev.items].sort((a, b) => b.modified - a.modified),
                    };
                  });
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
                      detail: {
                        paths: [normalizedPath],
                        source: 'powerprompter-queue-output',
                      },
                    }));
                    window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
                      detail: { source: 'powerprompter-queue-output-restore' },
                    }));
                  }
                  showToast(`Restored: ${item.name}`, 'success');
                } catch (error: any) {
                  showToast(String(error?.message || 'Failed to restore item'), 'error');
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
  const refreshQueueManagerOutputPreview = useCallback(async (options?: { silent?: boolean; notifyOnError?: boolean }) => {
    const sourcePath = String(currentFileRef.current || '').trim();
    const seq = ++queueManagerOutputPreviewSeqRef.current;
    if (!sourcePath) {
      setOutputPreviewSnapshot({
        items: [],
        isLoading: false,
        error: null,
      });
      return;
    }

    const silent = options?.silent === true;
    if (!silent) {
      setOutputPreviewSnapshot((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));
    }

    try {
      const items = await fetchPowerPrompterOutputPreviewItems(sourcePath);
      if (seq !== queueManagerOutputPreviewSeqRef.current) return;
      setOutputPreviewSnapshot({
        items,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      if (seq !== queueManagerOutputPreviewSeqRef.current) return;
      const message = String(error?.message || 'Failed to load output preview');
      setOutputPreviewSnapshot((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      if (options?.notifyOnError) showToast(message, 'error');
    }
  }, [showToast]);

  const handleRefreshQueueManagerOutputs = useCallback(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.refreshOutputPreview();
      return;
    }
    void refreshQueueManagerOutputPreview({ notifyOnError: true });
  }, [refreshQueueManagerOutputPreview]);
  useEffect(() => {
    if (!queueOutputMenu) return;
    const dismiss = (event: MouseEvent) => {
      if (event.button !== 0) return;
      setQueueOutputMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQueueOutputMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [queueOutputMenu]);
  useEffect(() => {
    if (currentFile) return;
    queueManagerOutputPreviewSeqRef.current += 1;
    setOutputPreviewSnapshot({
      items: [],
      isLoading: false,
      error: null,
    });
  }, [currentFile]);
  useEffect(() => {
    if (prompterPanelMode !== 'queue-manager') return;
    if (!currentFile) return;
    void refreshQueueManagerOutputPreview({ silent: queueManagerOutputPreviewItemCountRef.current > 0 });
  }, [prompterPanelMode, currentFile, refreshQueueManagerOutputPreview]);
  useEffect(() => {
    if (!queueCompletionTick) return;
    if (prompterPanelMode !== 'queue-manager') return;
    if (!currentFile) return;
    const timer = window.setTimeout(() => {
      void refreshQueueManagerOutputPreview({ silent: true });
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [currentFile, prompterPanelMode, queueCompletionTick, refreshQueueManagerOutputPreview]);
  useEffect(() => {
    if (prompterPanelMode !== 'queue-manager') return;
    if (!currentFile || typeof window === 'undefined') return;
    const handleOutputSaved = () => {
      void refreshQueueManagerOutputPreview({ silent: true });
    };
    window.addEventListener('umbra:powerprompter-output-saved', handleOutputSaved);
    return () => {
      window.removeEventListener('umbra:powerprompter-output-saved', handleOutputSaved);
    };
  }, [currentFile, prompterPanelMode, refreshQueueManagerOutputPreview]);
  const renderQueueTrackerCard = () => (
    <PowerPrompterQueueTrackerCard
      queueStackItems={queueStackItems}
      queueTrackerPreviewUrl={queueTrackerPreviewUrl}
      activeQueuePosition={activeQueuePosition}
      queueRequestGroups={queueRequestGroups}
      queueStartDisabled={queueStartDisabled}
      queueControlBusy={queueControlBusy}
      queuePaused={queuePaused}
      hasStagedQueue={hasStagedQueue}
      queueDestructiveActionBusy={queueDestructiveActionBusy}
      hasCancelableQueueWork={hasCancelableQueueWork}
      hasClearableQueueWork={hasClearableQueueWork}
      queueSetGroups={queueSetGroups}
      expandedQueueSets={expandedQueueSets}
      expandedQueueGroups={expandedQueueGroups}
      generationPreview={generationPreview}
      queueVisualState={queueVisualState}
      onStartQueue={() => { void queueStartActionRef.current?.(); }}
      onToggleQueuePause={() => { void queuePauseActionRef.current?.(); }}
      onCancelActiveQueue={() => { void queueCancelActionRef.current?.(); }}
      onClearQueue={() => { void queueClearActionRef.current?.(); }}
      onEmergencyShutdown={() => { void queueEmergencyActionRef.current?.(); }}
      onOpenQueueHistory={openQueueHistoryPanel}
      onToggleSetExpanded={(setId) => queueToggleSetExpandedRef.current?.(setId)}
      onCancelSetGroup={(setId) => { void queueCancelSetGroupRef.current?.(setId); }}
      onToggleGroupExpanded={(requestId) => queueToggleGroupExpandedRef.current?.(requestId)}
      onCancelRequestGroup={(requestId) => { void queueCancelRequestGroupRef.current?.(requestId); }}
    />
  );
  const renderQueueManagerView = () => (
    <PowerPrompterQueueManagerView
      activeQueuePosition={activeQueuePosition}
      queueRequestGroups={queueRequestGroups}
      queueSetGroups={queueSetGroups}
      queueTotalPromptCount={queueTotalPromptCount}
      queueTrackerSummary={queueTrackerSummary}
      queueSummaryCounts={queueSummaryCounts}
      queueManagerStyleOptions={queueManagerStyleOptions}
      setQueueManagerStyleFilter={setQueueManagerStyleFilter}
      queueManagerStyleFilter={queueManagerStyleFilter}
      queueStartActionRef={queueStartActionRef}
      queueStartDisabled={queueStartDisabled}
      queueControlBusy={queueControlBusy}
      queuePauseActionRef={queuePauseActionRef}
      queueStackItems={queueStackItems}
      hasStagedQueue={hasStagedQueue}
      queuePaused={queuePaused}
      queueCancelActionRef={queueCancelActionRef}
      queueDestructiveActionBusy={queueDestructiveActionBusy}
      hasCancelableQueueWork={hasCancelableQueueWork}
      hasClearableQueueWork={hasClearableQueueWork}
      queueClearActionRef={queueClearActionRef}
      queueEmergencyActionRef={queueEmergencyActionRef}
      queueToggleSetExpandedRef={queueToggleSetExpandedRef}
      queueToggleGroupExpandedRef={queueToggleGroupExpandedRef}
      queueCancelSetGroupRef={queueCancelSetGroupRef}
      queueCancelRequestGroupRef={queueCancelRequestGroupRef}
      openQueueHistoryPanel={openQueueHistoryPanel}
      queueDispatchDelayMs={queueDispatchDelayMs}
      handleQueueDispatchDelayChange={handleQueueDispatchDelayChange}
      queueManagerSequenceMode={queueManagerSequenceMode}
      handleQueueManagerSequenceModeChange={handleQueueManagerSequenceModeChange}
      setQueuePromptExpandedMode={setQueuePromptExpandedMode}
      queuePromptExpandedMode={queuePromptExpandedMode}
      queueManagerSearchQuery={queueManagerSearchQuery}
      setQueueManagerSearchQuery={setQueueManagerSearchQuery}
      savedQueueSnapshotsEnabled={POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED}
      savedQueues={savedQueues}
      selectedSavedQueueId={selectedSavedQueueId}
      setSelectedSavedQueueId={setSelectedSavedQueueId}
      savedQueueBusy={savedQueueBusy}
      selectedSavedQueue={selectedSavedQueue}
      handleSaveCurrentQueueSnapshot={handleSaveCurrentQueueSnapshot}
      handleLoadSavedQueueSnapshot={handleLoadSavedQueueSnapshot}
      handleDeleteSavedQueueSnapshot={handleDeleteSavedQueueSnapshot}
      refreshSavedQueues={refreshSavedQueues}
      queueManagerDragState={queueManagerDragState}
      setQueueManagerDragState={setQueueManagerDragState}
      clearQueueManagerDragState={clearQueueManagerDragState}
      handleQueueManagerSetDrop={handleQueueManagerSetDrop}
      expandedQueueSets={expandedQueueSets}
      expandedQueueGroups={expandedQueueGroups}
      handleQueueManagerGroupDrop={handleQueueManagerGroupDrop}
      handleQueueManagerSelectedPromptRemove={handleQueueManagerSelectedPromptRemove}
      selectedQueuePromptCount={selectedQueuePromptCount}
      selectedQueuePromptKeys={selectedQueuePromptKeys}
      generationPreview={generationPreview}
      queueVisualState={queueVisualState}
      lockedQueueRequestId={lockedQueueRequestId}
      lockedQueuePromptIndex={lockedQueuePromptIndex}
      getQueuePromptSelectionKey={getQueuePromptSelectionKey}
      getQueuePromptBlocksForItem={getQueuePromptBlocksForItem}
      handleQueuePromptSelectionClick={handleQueuePromptSelectionClick}
      expandedQueuePromptRows={expandedQueuePromptRows}
      setExpandedQueuePromptRows={setExpandedQueuePromptRows}
      handleQueueManagerPromptRemove={handleQueueManagerPromptRemove}
      renderPromptBlockList={renderPromptBlockList}
      renderHighlightedQueuePromptText={renderHighlightedQueuePromptText}
      handleQueueManagerPromptDrop={handleQueueManagerPromptDrop}
      handleOpenQueueGroupEditor={handleOpenQueueGroupEditor}
      queueManagerSearchKey={queueManagerSearchKey}
      queueManagerRightPaneRef={queueManagerRightPaneRef}
      queueManagerPreviewSplit={queueManagerPreviewSplit}
      beginQueueManagerPaneResize={beginQueueManagerPaneResize}
      hasActiveGenerationPreview={hasActiveGenerationPreview}
      generationPreviewStatusLabel={generationPreviewStatusLabel}
      generationPreviewStepLabel={generationPreviewStepLabel}
      isLoadingOutputPreview={isLoadingOutputPreview}
      queueManagerMediaItems={queueManagerMediaItems}
      outputPreviewError={outputPreviewError}
      queueManagerOutputBuckets={queueManagerOutputBuckets}
      handleRefreshQueueManagerOutputs={handleRefreshQueueManagerOutputs}
      openQueueManagerOutputInViewer={openQueueManagerOutputInViewer}
      openQueueManagerOutputInLibrary={openQueueManagerOutputInLibrary}
      pinQueueManagerOutputFolder={pinQueueManagerOutputFolder}
      openQueueManagerOutputInExplorer={openQueueManagerOutputInExplorer}
      sendQueueManagerOutputToTrash={sendQueueManagerOutputToTrash}
      sendQueueManagerOutputToWorkspace={sendQueueManagerOutputToWorkspace}
      queueOutputMenu={queueOutputMenu}
      setQueueOutputMenu={setQueueOutputMenu}
    />
  );
  const alertFeaturesEnabled = settings.generationCompleteSoundEnabled !== false;
  const [queueEstimate, setQueueEstimate] = useState<PowerPrompterQueueEstimate>(() =>
    createEmptyPowerPrompterQueueEstimate(queuePromptLimit, estimatedBatchSize)
  );
  const [queueEditorEstimate, setQueueEditorEstimate] = useState<PowerPrompterQueueEstimate>(() =>
    createEmptyPowerPrompterQueueEstimate(queuePromptLimit, estimatedBatchSize)
  );
  useEffect(() => {
    const requestSeq = queueEstimateSeqRef.current + 1;
    queueEstimateSeqRef.current = requestSeq;
    const startedAt = performance.now();
    void buildPowerPrompterQueueEstimateOnWorker({
      cardDocument,
      queueSetTarget,
      queueTraversalMode,
      queueDiversity,
      queuePromptLimit,
      queueShuffleEnabled,
      queueShuffleSeed: settings.queueShuffleSeed,
      estimatedBatchSize,
      workerRef: queueWorkerRef,
      requestSeqRef: queueWorkerRequestSeqRef,
      pendingSignatureRef: queueWorkerPendingSignatureRef,
    })
      .then((nextEstimate) => {
        if (queueEstimateSeqRef.current !== requestSeq) return;
        const elapsedMs = Math.round(performance.now() - startedAt);
        setQueueEstimate(nextEstimate);
        logPowerPrompterDebug('promptBuild:estimate:worker:end', {
          setPromptCount: nextEstimate.setPromptCount,
          allPromptCount: nextEstimate.allPromptCount,
          elapsedMs,
        });
        if (elapsedMs >= 500) {
          logPowerPrompterDebug('promptBuild:estimate:slow', {
            setPromptCount: nextEstimate.setPromptCount,
            allPromptCount: nextEstimate.allPromptCount,
            elapsedMs,
          });
        }
      })
      .catch((error: any) => {
        if (queueEstimateSeqRef.current !== requestSeq) return;
        logPowerPrompterDebug('promptBuild:estimate:worker:error', {
          message: String(error?.message || error || 'Unknown error'),
        });
      });
  }, [cardDocument, queueSetTarget, queueTraversalMode, queueDiversity, queuePromptLimit, queueShuffleEnabled, settings.queueShuffleSeed, estimatedBatchSize]);

  useEffect(() => {
    const requestSeq = queueEditorEstimateSeqRef.current + 1;
    queueEditorEstimateSeqRef.current = requestSeq;
    const startedAt = performance.now();
    void buildPowerPrompterQueueEditorEstimateOnWorker({
      queueEditorDocument,
      queueEditorDraft,
      queueSetTarget,
      estimatedBatchSize,
      workerRef: queueWorkerRef,
      requestSeqRef: queueWorkerRequestSeqRef,
      pendingSignatureRef: queueWorkerPendingSignatureRef,
    })
      .then((nextEstimate) => {
        if (queueEditorEstimateSeqRef.current !== requestSeq) return;
        const elapsedMs = Math.round(performance.now() - startedAt);
        setQueueEditorEstimate(nextEstimate);
        logPowerPrompterDebug('promptBuild:editorEstimate:worker:end', {
          setPromptCount: nextEstimate.setPromptCount,
          allPromptCount: nextEstimate.allPromptCount,
          elapsedMs,
        });
        if (elapsedMs >= 500) {
          logPowerPrompterDebug('promptBuild:editorEstimate:slow', {
            setPromptCount: nextEstimate.setPromptCount,
            allPromptCount: nextEstimate.allPromptCount,
            elapsedMs,
          });
        }
      })
      .catch((error: any) => {
        if (queueEditorEstimateSeqRef.current !== requestSeq) return;
        logPowerPrompterDebug('promptBuild:editorEstimate:worker:error', {
          message: String(error?.message || error || 'Unknown error'),
        });
      });
  }, [estimatedBatchSize, queueEditorDocument, queueEditorDraft, queueSetTarget]);
  const activePanelQueueEstimate = POWER_PROMPTER_QUEUE_EDITOR_ENABLED && prompterPanelMode === 'queue-editor' && queueEditorDraft
    ? queueEditorEstimate
    : queueEstimate;

  useEffect(() => {
    const signature = JSON.stringify({
      file: currentFileRef.current || '',
      activeSet: cardDocument.activeQueueSet,
      targetSet: queueSetTarget,
      traversalMode: queueTraversalMode,
      diversity: normalizeQueueDiversity(queueDiversity, queueTraversalMode),
      promptLimit: queuePromptLimit,
      shuffleEnabled: queueShuffleEnabled,
      shuffleSeed: settings.queueShuffleSeed,
      setPromptCount: queueEstimate.setPromptCount,
      setAvailablePromptCount: queueEstimate.setAvailablePromptCount,
      setCyclePromptCount: queueEstimate.setCyclePromptCount,
      allPromptCount: queueEstimate.allPromptCount,
      setTruncated: queueEstimate.setTruncated,
      allTruncated: queueEstimate.allTruncated,
    });
    if (lastQueueEstimateDiagnosticsSignatureRef.current === signature) return;
    lastQueueEstimateDiagnosticsSignatureRef.current = signature;
    logPowerPrompterDebug('cycle:estimate:updated', {
      targetSet: queueSetTarget,
      traversalMode: queueTraversalMode,
      diversity: normalizeQueueDiversity(queueDiversity, queueTraversalMode),
      promptLimit: queuePromptLimit,
      shuffleEnabled: queueShuffleEnabled,
      shuffleSeed: settings.queueShuffleSeed,
      setPromptCount: queueEstimate.setPromptCount,
      setAvailablePromptCount: queueEstimate.setAvailablePromptCount,
      setCyclePromptCount: queueEstimate.setCyclePromptCount,
      allPromptCount: queueEstimate.allPromptCount,
      setTruncated: queueEstimate.setTruncated,
      allTruncated: queueEstimate.allTruncated,
    });
  }, [
    cardDocument.activeQueueSet,
    queueDiversity,
    queueEstimate.allPromptCount,
    queueEstimate.allTruncated,
    queueEstimate.setAvailablePromptCount,
    queueEstimate.setCyclePromptCount,
    queueEstimate.setPromptCount,
    queueEstimate.setTruncated,
    queuePromptLimit,
    queueSetTarget,
    queueShuffleEnabled,
    queueTraversalMode,
    settings.queueShuffleSeed,
  ]);

  useEffect(() => {
    if (prompterPanelMode !== 'queue-editor' || !queueEditorDraft) return;
    logPowerPrompterDebug('queueEditor:estimate:updated', {
      requestId: queueEditorDraft.requestId,
      activeSetId: queueEditorDraft.activeSetId,
      traversalMode: queueEditorDraft.queueBuildSettings.traversalMode,
      diversity: queueEditorDraft.queueBuildSettings.diversity,
      promptLimit: queueEditorEstimate.appliedPromptLimit,
      shuffleEnabled: queueEditorDraft.queueBuildSettings.shuffleEnabled,
      shuffleSeed: queueEditorDraft.queueBuildSettings.shuffleSeed,
      setPromptCount: queueEditorEstimate.setPromptCount,
      setAvailablePromptCount: queueEditorEstimate.setAvailablePromptCount,
      setCyclePromptCount: queueEditorEstimate.setCyclePromptCount,
      allPromptCount: queueEditorEstimate.allPromptCount,
      setTruncated: queueEditorEstimate.setTruncated,
      allTruncated: queueEditorEstimate.allTruncated,
    });
  }, [
    prompterPanelMode,
    queueEditorDraft,
    queueEditorEstimate.allPromptCount,
    queueEditorEstimate.allTruncated,
    queueEditorEstimate.appliedPromptLimit,
    queueEditorEstimate.setAvailablePromptCount,
    queueEditorEstimate.setCyclePromptCount,
    queueEditorEstimate.setPromptCount,
    queueEditorEstimate.setTruncated,
  ]);

  useEffect(() => {
    const stepBucket = generationPreview
      ? Math.floor(Math.max(0, Number(generationPreview.step) || 0) / 5) * 5
      : -1;
    const signature = generationPreview
      ? `${generationPreview.requestId}|${generationPreview.promptIndex}|${generationPreview.promptId}|${generationPreview.status}|${stepBucket}|${generationPreview.maxStep || 0}`
      : 'none';
    if (lastGenerationPreviewDiagnosticsSignatureRef.current === signature) return;
    lastGenerationPreviewDiagnosticsSignatureRef.current = signature;
    logPowerPrompterDebug('preview:generation:stateChanged', {
      requestId: generationPreview?.requestId || '',
      promptIndex: generationPreview?.promptIndex ?? null,
      promptId: generationPreview?.promptId || '',
      status: generationPreview?.status || 'none',
      step: generationPreview?.step ?? null,
      maxStep: generationPreview?.maxStep ?? null,
      hasImage: Boolean(generationPreview?.imageDataUrl),
    }, { includeQueue: true });
  }, [
    generationPreview?.imageDataUrl,
    generationPreview?.maxStep,
    generationPreview?.promptId,
    generationPreview?.promptIndex,
    generationPreview?.requestId,
    generationPreview?.status,
    generationPreview?.step,
  ]);

  useEffect(() => {
    const imageDataUrl = String(generationPreview?.imageDataUrl || '').trim();
    if (!generationPreview || !imageDataUrl) return;
    const signature = [
      generationPreview.requestId,
      generationPreview.promptIndex,
      generationPreview.promptId,
      generationPreview.prompt,
      generationPreview.status,
      generationPreview.step,
      generationPreview.maxStep,
      generationPreview.updatedAt,
      imageDataUrl.length,
    ].join('|');
    if (lastGenerationPreviewBroadcastSignatureRef.current === signature) return;
    lastGenerationPreviewBroadcastSignatureRef.current = signature;
    window.dispatchEvent(new CustomEvent('umbra:powerprompter-generation-preview', {
      detail: {
        requestId: generationPreview.requestId,
        promptIndex: generationPreview.promptIndex,
        promptId: generationPreview.promptId,
        prompt: generationPreview.prompt || '',
        status: generationPreview.status,
        step: generationPreview.step,
        maxStep: generationPreview.maxStep,
        updatedAt: generationPreview.updatedAt || Date.now(),
        imageDataUrl,
      },
    }));
  }, [
    generationPreview?.imageDataUrl,
    generationPreview?.maxStep,
    generationPreview?.promptId,
    generationPreview?.promptIndex,
    generationPreview?.prompt,
    generationPreview?.requestId,
    generationPreview?.status,
    generationPreview?.step,
    generationPreview?.updatedAt,
  ]);

  useEffect(() => {
    setQueueDiversityDraft(normalizeQueueDiversity(settings.queueDiversity, settings.queueTraversalMode));
  }, [settings.queueDiversity, settings.queueTraversalMode]);

  useEffect(() => {
    if (queuePromptLimitEditingRef.current) return;
    setQueuePromptLimitDraft(settings.queuePromptLimit === null ? '' : String(settings.queuePromptLimit));
  }, [settings.queuePromptLimit]);

  useEffect(() => {
    queueDiversityDraftRef.current = queueDiversityDraft;
  }, [queueDiversityDraft]);

  useEffect(() => {
    if (!queueDiversityPickerOpen) return;
    const dismiss = (event: MouseEvent) => {
      const target = event.target;
      if (queueDiversityPickerRef.current && target instanceof Node && queueDiversityPickerRef.current.contains(target)) {
        return;
      }
      if (queueDiversityPickerPopoverRef.current && target instanceof Node && queueDiversityPickerPopoverRef.current.contains(target)) {
        return;
      }
      setQueueDiversityPickerOpen(false);
    };
    const onResize = () => setQueueDiversityPickerOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQueueDiversityPickerOpen(false);
    };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    window.addEventListener('keydown', onKey);
    return () => {
      stopQueueDiversityHold();
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [queueDiversityPickerOpen, stopQueueDiversityHold]);

  useEffect(() => {
    const release = () => stopQueueDiversityHold();
    window.addEventListener('mouseup', release);
    window.addEventListener('touchend', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('blur', release);
      stopQueueDiversityHold();
    };
  }, [stopQueueDiversityHold]);

  const broadcastSettingsSync = (nextSettings: PowerPrompterSettings) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem('umbra.powerPrompter.settingsSync');
      const channel = new BroadcastChannel(POWER_PROMPTER_SETTINGS_SYNC_CHANNEL);
      channel.postMessage({ settings: nextSettings });
      channel.close();
    } catch {
      // ignore cross-tab sync failures
    }
  };

  const persistSettings = async (
    nextSettings: PowerPrompterSettings,
    options?: { silent?: boolean; broadcast?: boolean; }
  ): Promise<boolean> => {
    try {
      await fetch('/api/powerprompter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      });
      setSettings(nextSettings);
      if (options?.broadcast !== false) {
        broadcastSettingsSync(nextSettings);
      }
      return true;
    } catch {
      if (!options?.silent) {
        showToast('Failed to save settings', 'error');
      }
      return false;
    }
  };

  useEffect(() => {
    const currentPromptLimit = normalizeQueuePromptLimit(settings.queuePromptLimit);
    if (currentPromptLimit === null || currentPromptLimit >= queuePromptLimitMinimum) return;
    if (queuePromptLimitEditingRef.current) return;
    const nextPromptLimit = queuePromptLimitMinimum;
    setQueuePromptLimitDraft(String(nextPromptLimit));
    const nextSettings = normalizePowerPrompterSettings({
      ...settings,
      queuePromptLimit: nextPromptLimit,
    });
    setSettings(nextSettings);
    void persistSettings(nextSettings, { silent: true });
  }, [persistSettings, queuePromptLimitMinimum, settings]);

  const {
    playCompletionSound,
    handleActivePromptTypeProgress,
    handleChainLinkFeedback,
    handleToggleCompletionSound,
    handleSetCompletionSoundStyle,
    handleSetCompletionSoundVolume,
  } = usePowerPrompterAudioControls({
    settings,
    setSettings,
    persistSettings,
    showToast,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const readRemoteMode = () => setRemoteMode(document.documentElement.dataset.umbraRemoteMode || 'desktop');
    readRemoteMode();
    window.addEventListener('umbra:remote-mode-change', readRemoteMode);
    return () => window.removeEventListener('umbra:remote-mode-change', readRemoteMode);
  }, []);

  useEffect(() => {
    if (!isPhoneRemote) return;
    setLeftPanelCollapsed(true);
    setRightPanelCollapsed(true);
  }, [isPhoneRemote, shouldIgnoreIncomingPanelMode]);

  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);

  useEffect(() => {
    activePowerPrompterPresetSessionRef.current = activePowerPrompterPresetSession;
  }, [activePowerPrompterPresetSession]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    cardDocumentRef.current = cardDocument;
  }, [cardDocument]);

  useEffect(() => {
    queueEditorDocumentRef.current = queueEditorDocument;
  }, [queueEditorDocument]);

  useEffect(() => {
    queueVisualStateRef.current = queueVisualState;
    powerPrompterQueueSession.queueVisualState = queueVisualState;
  }, [queueVisualState]);

  useEffect(() => {
    queueStackItemsRef.current = queueStackItems;
    powerPrompterQueueSession.queueStackItems = queueStackItems;
  }, [queueStackItems]);

  useEffect(() => () => {
    // Queue events can arrive while the Power Prompter workspace remounts.
    // Keep stale-event guards in the app-global queue session until their own TTL expires.
  }, []);

  useEffect(() => {
    queuePausedRef.current = queuePaused;
    powerPrompterQueueSession.queuePaused = queuePaused;
  }, [queuePaused]);

  useEffect(() => {
    savedQueuesRef.current = savedQueues;
  }, [savedQueues]);

  useEffect(() => {
    selectedSavedQueueIdRef.current = selectedSavedQueueId;
  }, [selectedSavedQueueId]);

  useEffect(() => {
    queueHistoryItemsRef.current = queueHistoryItems;
  }, [queueHistoryItems]);

  useEffect(() => {
    generationPreviewRef.current = generationPreview;
    powerPrompterQueueSession.generationPreview = generationPreview;
  }, [generationPreview]);

  useEffect(() => {
    selectedQueueHistoryIdRef.current = selectedQueueHistoryId;
  }, [selectedQueueHistoryId]);

  useEffect(() => {
    queueDispatchDelayMsRef.current = queueDispatchDelayMs;
  }, [queueDispatchDelayMs]);

  useEffect(() => {
    selectedQueueTargetTypeRef.current = selectedQueueTargetType;
  }, [selectedQueueTargetType]);

  useEffect(() => {
    effectiveQueueTargetBridgeIdRef.current = String(effectiveQueueTargetBridgeId || '').trim();
  }, [effectiveQueueTargetBridgeId]);

  useEffect(() => {
    effectiveQueueTargetSelectionIdRef.current = String(effectiveQueueTargetSelectionId || '').trim();
  }, [effectiveQueueTargetSelectionId]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    if (didRestorePausedQueueRef.current) return;
    didRestorePausedQueueRef.current = true;
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      if (queueSnapshotPersistTimerRef.current) {
        clearTimeout(queueSnapshotPersistTimerRef.current);
        queueSnapshotPersistTimerRef.current = null;
      }
      queueSnapshotPersistDueAtRef.current = 0;
      queueSnapshotPersistRevisionRef.current += 1;
      lastPersistedQueueSnapshotSignatureRef.current = 'disabled';
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      void writePersistedPausedQueueSnapshot(null);
      logPowerPrompterDebug('queue:snapshotRecovery:disabled', {}, { includeQueue: true });
      return;
    }
    void (async () => {
      const snapshot = await readPersistedPausedQueueSnapshot();
      if (!snapshot) {
        if (queueSnapshotPersistTimerRef.current) {
          clearTimeout(queueSnapshotPersistTimerRef.current);
          queueSnapshotPersistTimerRef.current = null;
        }
        queueSnapshotPersistDueAtRef.current = 0;
        queueSnapshotPersistRevisionRef.current += 1;
        lastPersistedQueueSnapshotSignatureRef.current = 'null';
        restoredPausedQueueRef.current = null;
        powerPrompterQueueSession.restoredPausedQueue = null;
        queueRequestMetaRef.current.clear();
        completedPromptIndicesRef.current.clear();
        intentionallyCanceledQueueRequestIdsRef.current.clear();
        clearedQueueRequestIdsRef.current.clear();
        pendingQueueCancelScopeRef.current = [];
        pendingQueueClearFutureScopeRef.current = [];
        pendingQueuePromptRemovalOpsRef.current.clear();
        pendingQueuePromptRemovalKeysRef.current.clear();
        queueVisualStateRef.current = null;
        queueStackItemsRef.current = [];
        queuePausedRef.current = false;
        powerPrompterQueueSession.queueVisualState = null;
        powerPrompterQueueSession.queueStackItems = [];
        powerPrompterQueueSession.queuePaused = false;
        setQueueVisualState(null);
        updateQueueStackItemsSynced([]);
        setQueuePaused(false);
        return;
      }
      restoreRecoverableQueueAsPausedSnapshot(snapshot, 'startup queue recovery');
    })();
  }, []);

  const buildRecoverablePausedQueueSnapshotFromCurrentState = useCallback((options?: { paused?: boolean }) => {
    const recoverableItems = queueStackItemsRef.current.filter((item) =>
      !item.exiting && (item.status === 'pending' || item.status === 'running')
    );
    if (recoverableItems.length <= 0) return null;

    const visual = queueVisualStateRef.current;
    const fallbackSetId = clampQueueSetId(cardDocumentRef.current.activeQueueSet, 1);
    const fallbackGeneration = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
      const requestIds: string[] = [];
      const prompts: string[] = [];
      const promptEntries: QueuePromptPreviewEntry[] = [];
      const promptSetIds: number[] = [];
      const promptOutputSubfolders: string[] = [];
      const promptStyleNames: string[] = [];
      const promptSeedGroupIds: string[] = [];
      const generationByPrompt: ReturnType<typeof normalizePowerPrompterGenerationControls>[] = [];
      const groupSnapshotIndex = new Map<string, {
        meta: QueueRequestMeta | null;
        promptIndices: number[];
      }>();
    let snapshotMode: PowerPrompterQueueMode = visual?.mode || 'prompt';
    let snapshotSetId = clampQueueSetId(visual?.activeSetId ?? fallbackSetId, fallbackSetId);
    let snapshotTargetType: PowerPrompterQueueTargetType = normalizeQueueTargetType(selectedQueueTargetTypeRef.current);
    let snapshotTargetBridgeId = String(effectiveQueueTargetSelectionIdRef.current || effectiveQueueTargetBridgeIdRef.current || '').trim();
    let snapshotRandomApplied = false;
    let primarySnapshotAssigned = false;

    recoverableItems.forEach((item) => {
      const requestId = String(item.requestId || '').trim();
      const requestMeta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
      const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
      const prompt = normalizePowerPrompterPromptText(
        String(
          requestMeta?.prompts?.[promptIndex]
          ?? item.prompt
          ?? (visual && String(visual.requestId || '').trim() === requestId ? visual.prompts?.[promptIndex] : '')
          ?? ''
        ).trim()
      );
      if (!prompt) return;
      const promptSetId = clampQueueSetId(
        requestMeta?.promptSetIds?.[promptIndex]
        ?? requestMeta?.setId
        ?? (visual && String(visual.requestId || '').trim() === requestId ? visual.activeSetId : fallbackSetId)
        ?? fallbackSetId,
        fallbackSetId
      );
      const generation = normalizePowerPrompterGenerationControls(
        requestMeta?.generationByPrompt?.[promptIndex]
        ?? fallbackGeneration
        );
        const outputSubfolder = String(requestMeta?.promptOutputSubfolders?.[promptIndex] || '').trim();
        const styleName = String(requestMeta?.promptStyleNames?.[promptIndex] || item.styleName || '').trim();
        const seedGroupId = String(requestMeta?.promptSeedGroupIds?.[promptIndex] || `${promptSetId}:${prompts.length}`).trim();
        const promptEntry = requestMeta?.promptEntries?.[promptIndex];
        if (!primarySnapshotAssigned) {
        snapshotMode = requestMeta?.mode || visual?.mode || 'prompt';
        snapshotSetId = promptSetId;
        snapshotTargetType = normalizeQueueTargetType(requestMeta?.queueTargetType || selectedQueueTargetTypeRef.current);
        const requestTargetBridgeId = String(requestMeta?.targetBridgeId || '').trim();
        snapshotTargetBridgeId = snapshotTargetType === 'pipeline' && !requestTargetBridgeId.startsWith('pipeline:')
          ? String(effectiveQueueTargetSelectionIdRef.current || requestTargetBridgeId || effectiveQueueTargetBridgeIdRef.current || '').trim()
          : String(requestTargetBridgeId || effectiveQueueTargetSelectionIdRef.current || effectiveQueueTargetBridgeIdRef.current || '').trim();
        snapshotRandomApplied = requestMeta?.randomApplied === true;
        primarySnapshotAssigned = true;
      }
        const nextPromptIndex = prompts.length;
        prompts.push(prompt);
        if (promptEntry) {
          promptEntries.push(promptEntry);
        }
        promptSetIds.push(promptSetId);
        promptOutputSubfolders.push(outputSubfolder);
        promptStyleNames.push(styleName);
        promptSeedGroupIds.push(seedGroupId);
        generationByPrompt.push(generation);
        requestIds.push(requestId || `paused-${Date.now()}`);
        const normalizedRequestId = requestId || requestIds[requestIds.length - 1] || `paused-${Date.now()}`;
        const existingGroupSnapshot = groupSnapshotIndex.get(normalizedRequestId);
        if (existingGroupSnapshot) {
          existingGroupSnapshot.promptIndices.push(nextPromptIndex);
        } else {
          groupSnapshotIndex.set(normalizedRequestId, {
            meta: requestMeta,
            promptIndices: [nextPromptIndex],
          });
        }
    });

    if (prompts.length <= 0) return null;
    const groupSnapshots = Array.from(groupSnapshotIndex.entries())
      .map(([requestId, entry]): PersistedQueueGroupSnapshot | null => {
        if (!entry.meta?.editorSnapshot || entry.promptIndices.length <= 0) return null;
        const firstIndex = entry.promptIndices[0] ?? 0;
        return {
          id: requestId,
          requestId,
          label: `Set ${clampQueueSetId(entry.meta.setId)}`,
          mode: entry.meta.mode,
          activeSetId: clampQueueSetId(entry.meta.setId),
          promptStartIndex: firstIndex,
          promptCount: entry.promptIndices.length,
          promptIndices: entry.promptIndices,
          editorSnapshot: entry.meta.editorSnapshot,
        };
      })
      .filter((entry: PersistedQueueGroupSnapshot | null): entry is PersistedQueueGroupSnapshot => !!entry);
    return normalizePersistedPausedQueueSnapshot({
      version: 1,
      ...(groupSnapshots.length > 0 ? { snapshotSchemaVersion: 2, groupSnapshots } : {}),
      savedAt: Date.now(),
      file: currentFileRef.current || restoredPausedQueueRef.current?.file || null,
      mode: snapshotMode,
      activeSetId: snapshotSetId,
      queueTargetType: snapshotTargetType,
      targetBridgeId: snapshotTargetBridgeId,
      requestIds,
        prompts,
        ...(promptEntries.length === prompts.length ? { promptEntries } : {}),
        promptSetIds,
      promptOutputSubfolders,
      promptStyleNames,
      promptSeedGroupIds,
      generation: generationByPrompt[0] ?? fallbackGeneration,
      generationByPrompt,
      randomApplied: snapshotRandomApplied,
      paused: options?.paused === true,
      dispatchDelayMs: queueDispatchDelayMsRef.current,
    });
  }, []);

  const persistRecoverableQueueSnapshotNow = useCallback((options?: { paused?: boolean; clearWhenEmpty?: boolean }) => {
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      queueSnapshotPersistRevisionRef.current += 1;
      if (queueSnapshotPersistTimerRef.current) {
        clearTimeout(queueSnapshotPersistTimerRef.current);
        queueSnapshotPersistTimerRef.current = null;
      }
      queueSnapshotPersistDueAtRef.current = 0;
      lastPersistedQueueSnapshotSignatureRef.current = 'disabled';
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      return;
    }
    const snapshot = buildRecoverablePausedQueueSnapshotFromCurrentState({
      paused: options?.paused === true || queuePausedRef.current,
    });

    if (!snapshot) {
      queueSnapshotPersistRevisionRef.current += 1;
      if (options?.clearWhenEmpty === false) return;
      if (lastPersistedQueueSnapshotSignatureRef.current === 'null') return;
      lastPersistedQueueSnapshotSignatureRef.current = 'null';
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      logPowerPrompterDebug('recovery:snapshot:persistCleared', {
        paused: options?.paused === true || queuePausedRef.current,
        clearWhenEmpty: options?.clearWhenEmpty !== false,
      }, { includeQueue: true });
      void writePersistedPausedQueueSnapshot(null);
      return;
    }

    const persistRevision = queueSnapshotPersistRevisionRef.current + 1;
    queueSnapshotPersistRevisionRef.current = persistRevision;
    logPowerPrompterDebug('recovery:snapshot:persistQueued', {
      revision: persistRevision,
      promptCount: snapshot.prompts.length,
      requestCount: Array.from(new Set(snapshot.requestIds)).length,
      groupCount: snapshot.groupSnapshots?.length || 0,
      paused: snapshot.paused,
      mode: snapshot.mode,
      activeSetId: snapshot.activeSetId,
    }, { includeQueue: true });
    void buildQueueSnapshotSignatureOnWorker({
      snapshot,
      workerRef: queueWorkerRef,
      requestSeqRef: queueWorkerRequestSeqRef,
      pendingSignatureRef: queueWorkerPendingSignatureRef,
    })
      .then((signature) => {
        if (persistRevision !== queueSnapshotPersistRevisionRef.current) return;
        if (signature === lastPersistedQueueSnapshotSignatureRef.current) return;
        lastPersistedQueueSnapshotSignatureRef.current = signature;
        restoredPausedQueueRef.current = snapshot;
        powerPrompterQueueSession.restoredPausedQueue = snapshot;
        logPowerPrompterDebug('recovery:snapshot:persistWrite', {
          revision: persistRevision,
          promptCount: snapshot.prompts.length,
          requestCount: Array.from(new Set(snapshot.requestIds)).length,
          groupCount: snapshot.groupSnapshots?.length || 0,
          signatureLength: signature.length,
        }, { includeQueue: true });
        void writePersistedPausedQueueSnapshot(snapshot);
      })
      .catch(() => {
        if (persistRevision !== queueSnapshotPersistRevisionRef.current) return;
        restoredPausedQueueRef.current = snapshot;
        powerPrompterQueueSession.restoredPausedQueue = snapshot;
        logPowerPrompterDebug('recovery:snapshot:persistWorkerFallback', {
          revision: persistRevision,
          promptCount: snapshot.prompts.length,
          requestCount: Array.from(new Set(snapshot.requestIds)).length,
          groupCount: snapshot.groupSnapshots?.length || 0,
        }, { includeQueue: true });
        void writePersistedPausedQueueSnapshot(snapshot);
      });
  }, [buildRecoverablePausedQueueSnapshotFromCurrentState]);

  const scheduleRecoverableQueueSnapshotPersist = useCallback((options?: {
    paused?: boolean;
    clearWhenEmpty?: boolean;
    delayMs?: number;
  }) => {
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      if (queueSnapshotPersistTimerRef.current) {
        clearTimeout(queueSnapshotPersistTimerRef.current);
        queueSnapshotPersistTimerRef.current = null;
      }
      queueSnapshotPersistDueAtRef.current = 0;
      if (options?.clearWhenEmpty !== false) {
        restoredPausedQueueRef.current = null;
        powerPrompterQueueSession.restoredPausedQueue = null;
      }
      return;
    }
    const now = Date.now();
    const hasActiveRecoverableQueue = queuePausedRef.current || queueStackItemsRef.current.some((item) =>
      !item.exiting && (item.status === 'pending' || item.status === 'running')
    );
    const requestedDelayMs = Math.max(0, Math.floor(Number(options?.delayMs) || 0));
    const minIntervalDelayMs = hasActiveRecoverableQueue && options?.paused !== true
      ? Math.max(0, QUEUE_ACTIVE_SNAPSHOT_MIN_INTERVAL_MS - (now - lastQueueSnapshotPersistStartedAtRef.current))
      : 0;
    const delayMs = Math.max(requestedDelayMs, minIntervalDelayMs);
    const dueAt = now + delayMs;

    if (queueSnapshotPersistTimerRef.current && queueSnapshotPersistDueAtRef.current > 0) {
      if (queueSnapshotPersistDueAtRef.current <= dueAt) return;
    }

    if (queueSnapshotPersistTimerRef.current) {
      clearTimeout(queueSnapshotPersistTimerRef.current);
      queueSnapshotPersistTimerRef.current = null;
    }
    queueSnapshotPersistDueAtRef.current = dueAt;
    queueSnapshotPersistTimerRef.current = setTimeout(() => {
      queueSnapshotPersistTimerRef.current = null;
      queueSnapshotPersistDueAtRef.current = 0;
      lastQueueSnapshotPersistStartedAtRef.current = Date.now();
      persistRecoverableQueueSnapshotNow(options);
    }, delayMs);
  }, [persistRecoverableQueueSnapshotNow]);

  useEffect(() => () => {
    if (queueSnapshotPersistTimerRef.current) {
      clearTimeout(queueSnapshotPersistTimerRef.current);
      queueSnapshotPersistTimerRef.current = null;
    }
    queueSnapshotPersistDueAtRef.current = 0;
    cleanupQueueSnapshotWorker(queueWorkerRef, queueWorkerPendingSignatureRef);
  }, []);

  const pickNewestQueueSnapshot = useCallback((
    ...candidates: Array<PersistedPausedQueueSnapshot | null | undefined>
  ): PersistedPausedQueueSnapshot | null => {
    return candidates
      .map((candidate) => normalizePersistedPausedQueueSnapshot(candidate))
      .filter((candidate): candidate is PersistedPausedQueueSnapshot => !!candidate)
      .reduce<PersistedPausedQueueSnapshot | null>((best, candidate) => {
        if (!best) return candidate;
        if ((Number(candidate.savedAt) || 0) > (Number(best.savedAt) || 0)) return candidate;
        return best;
      }, null);
  }, []);

  const restoreRecoverableQueueAsPausedSnapshot = useCallback((snapshot: PersistedPausedQueueSnapshot, reason?: string) => {
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      void writePersistedPausedQueueSnapshot(null);
      logPowerPrompterDebug('recovery:snapshot:restoreSkippedDisabled', {
        reason: reason || '',
        promptCount: Array.isArray(snapshot?.prompts) ? snapshot.prompts.length : 0,
      }, { includeQueue: true });
      return false;
    }
    const prompts = snapshot.prompts
      .map((entry) => normalizePowerPrompterPromptText(String(entry || '').trim()))
      .filter(Boolean);
    if (prompts.length <= 0) {
      logPowerPrompterDebug('recovery:snapshot:restoreSkippedEmpty', {
        rawPromptCount: snapshot.prompts?.length || 0,
        mode: snapshot.mode,
        activeSetId: snapshot.activeSetId,
      }, { includeQueue: true });
      return false;
    }
    const promptRequestIds = prompts.map((_, index) =>
      String(snapshot.requestIds?.[index] || '').trim() || `paused-${snapshot.savedAt}`
    );
    const groupedPromptIndices = new Map<string, number[]>();
    promptRequestIds.forEach((requestId, promptIndex) => {
      const normalizedRequestId = String(requestId || '').trim() || `paused-${snapshot.savedAt}`;
      const existing = groupedPromptIndices.get(normalizedRequestId);
      if (existing) existing.push(promptIndex);
      else groupedPromptIndices.set(normalizedRequestId, [promptIndex]);
    });
    const groupSnapshotByRequestId = new Map(
      (snapshot.groupSnapshots || []).map((entry) => [String(entry.requestId || '').trim(), entry] as const)
    );
    const primaryPausedRequestId = promptRequestIds[0] || `paused-${snapshot.savedAt}`;
    logPowerPrompterDebug('recovery:snapshot:restoreStart', {
      reason: reason || '',
      promptCount: prompts.length,
      requestCount: groupedPromptIndices.size,
      groupCount: snapshot.groupSnapshots?.length || 0,
      primaryRequestId: primaryPausedRequestId,
      mode: snapshot.mode,
      activeSetId: snapshot.activeSetId,
      paused: snapshot.paused,
    }, { includeQueue: true });
    const livePreviewRequestIds = new Set<string>();
    for (const item of queueStackItemsRef.current) {
      const itemRequestId = String(item.requestId || '').trim();
      if (!itemRequestId || item.exiting || item.status !== 'running') continue;
      if (isLocalStagedQueueRequestId(itemRequestId) || itemRequestId.startsWith('paused-')) continue;
      livePreviewRequestIds.add(itemRequestId);
    }
    for (const bridgeRequestId of bridgeQueueStateRef.current.activeRequestIds) {
      const normalizedBridgeRequestId = String(bridgeRequestId || '').trim();
      if (normalizedBridgeRequestId) livePreviewRequestIds.add(normalizedBridgeRequestId);
    }
    const currentVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    if (
      currentVisualRequestId
      && !isLocalStagedQueueRequestId(currentVisualRequestId)
      && !currentVisualRequestId.startsWith('paused-')
    ) {
      livePreviewRequestIds.add(currentVisualRequestId);
    }
    restoredPausedQueueRef.current = POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED ? snapshot : null;
    powerPrompterQueueSession.restoredPausedQueue = restoredPausedQueueRef.current;
    for (const requestId of groupedPromptIndices.keys()) {
      queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
      pendingQueueRequestsRef.current.delete(requestId);
      backendQueueSnapshotRequestIdsRef.current.delete(requestId);
      intentionallyCanceledQueueRequestIdsRef.current.delete(requestId);
      clearedQueueRequestIdsRef.current.delete(requestId);
    }
    backendQueueSnapshotActiveUntilRef.current = 0;
    backendQueueSnapshotSignatureRef.current = '';
    backendQueuePauseRequestedRef.current = false;
    queueSequentialDispatchInFlightRef.current = false;
    bridgeQueueStateRef.current = {
      paused: true,
      pendingCount: 0,
      activeRequestIds: [],
      pendingRequestIds: [],
    };
    powerPrompterQueueSession.bridgeQueueState = bridgeQueueStateRef.current;
    queueRequestMetaRef.current.clear();
    completedPromptIndicesRef.current.clear();
    clearQueueTimingState();
    intentionallyCanceledQueueRequestIdsRef.current.clear();
    clearedQueueRequestIdsRef.current.clear();
    pendingQueueCancelScopeRef.current = [];
    pendingQueueClearFutureScopeRef.current = [];
    pendingQueuePromptRemovalOpsRef.current.clear();
    pendingQueuePromptRemovalKeysRef.current.clear();
    setQueuePaused(true);
    setQueueControlBusy(null);
    setQueueConfirmAction(null);
    setQueueingMode(null);
    setQueueDispatchDelayMs(Math.max(0, Math.floor(Number(snapshot.dispatchDelayMs) || 0)));
    for (const [requestId, sourceIndices] of groupedPromptIndices.entries()) {
      const groupPromptSetIds = sourceIndices.map((sourceIndex) => clampQueueSetId(snapshot.promptSetIds?.[sourceIndex] ?? snapshot.activeSetId));
      queueRequestMetaRef.current.set(requestId, {
        mode: snapshot.mode,
        setId: clampQueueSetId(groupPromptSetIds[0] ?? snapshot.activeSetId),
        randomApplied: snapshot.randomApplied === true,
        queueTargetType: normalizeQueueTargetType(snapshot.queueTargetType),
        targetBridgeId: String(snapshot.targetBridgeId || '').trim(),
        dispatchDelayMs: Math.max(0, Math.floor(Number(snapshot.dispatchDelayMs) || 0)),
        prompts: sourceIndices.map((sourceIndex) => prompts[sourceIndex] || ''),
        promptEntries: snapshot.promptEntries
          ? sourceIndices.map((sourceIndex) => snapshot.promptEntries?.[sourceIndex] || { prompt: prompts[sourceIndex] || '', tokens: [] })
          : undefined,
        promptSetIds: groupPromptSetIds,
        promptOutputSubfolders: sourceIndices.map((sourceIndex) => String(snapshot.promptOutputSubfolders?.[sourceIndex] || '').trim()),
        promptStyleNames: sourceIndices.map((sourceIndex) => String(snapshot.promptStyleNames?.[sourceIndex] || '').trim()),
        promptSeedGroupIds: sourceIndices.map((sourceIndex, groupIndex) =>
          String(snapshot.promptSeedGroupIds?.[sourceIndex] || `${groupPromptSetIds[groupIndex] ?? snapshot.activeSetId}:${groupIndex}`).trim()
        ),
        generationByPrompt: sourceIndices.map((sourceIndex) =>
          normalizePowerPrompterGenerationControls(snapshot.generationByPrompt?.[sourceIndex])
        ),
        editorSnapshot: normalizeQueueEditorSnapshot(groupSnapshotByRequestId.get(requestId)?.editorSnapshot),
      });
    }
    setQueueVisualState({
      requestId: primaryPausedRequestId,
      mode: snapshot.mode,
      activeSetId: snapshot.activeSetId,
      prompts: groupedPromptIndices.get(primaryPausedRequestId)?.map((sourceIndex) => prompts[sourceIndex] || '') || prompts,
      promptEntries: snapshot.promptEntries
        ? (groupedPromptIndices.get(primaryPausedRequestId)?.map((sourceIndex) => snapshot.promptEntries?.[sourceIndex] || { prompt: prompts[sourceIndex] || '', tokens: [] }) || [...snapshot.promptEntries])
        : undefined,
      promptIds: (groupedPromptIndices.get(primaryPausedRequestId) || prompts.map((_, index) => index)).map(() => ''),
      promptSeeds: (groupedPromptIndices.get(primaryPausedRequestId) || prompts.map((_, index) => index)).map(() => 0),
      activeIndex: 0,
      jobProgress: 0,
      updatedAt: Date.now(),
    });
    updateQueueStackItemsSynced(
      Array.from(groupedPromptIndices.entries()).flatMap(([requestId, sourceIndices], groupIndex) =>
        sourceIndices.map((sourceIndex, promptIndex) => {
          const prompt = prompts[sourceIndex] || '';
          return {
            id: `${requestId}-${promptIndex}-${prompt.slice(0, 24)}`,
            requestId,
            promptIndex,
            prompt,
            styleName: String(snapshot.promptStyleNames?.[sourceIndex] || '').trim(),
            styleFolderName: String(snapshot.promptOutputSubfolders?.[sourceIndex] || '').trim(),
            status: 'pending' as const,
            createdAt: snapshot.savedAt + (groupIndex * 100000) + promptIndex,
            exiting: false,
          };
        })
      )
    );
    if (generationPreviewHideTimerRef.current) {
      clearTimeout(generationPreviewHideTimerRef.current);
      generationPreviewHideTimerRef.current = null;
    }
    setGenerationPreview((prev) => {
      if (!prev) return prev;
      const previewRequestId = String(prev.requestId || '').trim();
      return previewRequestId && livePreviewRequestIds.has(previewRequestId)
        ? prev
        : { ...prev, status: 'idle', updatedAt: Date.now() };
    });
    const shouldSchedulePreviewHide = !generationPreviewRef.current
      || !livePreviewRequestIds.has(String(generationPreviewRef.current.requestId || '').trim());
    const holdMs = generationPreviewHoldMsRef.current;
    if (shouldSchedulePreviewHide && holdMs !== null) {
      generationPreviewHideTimerRef.current = setTimeout(() => {
        generationPreviewHideTimerRef.current = null;
        setGenerationPreview((prev) => (prev?.status === 'running' ? prev : null));
      }, holdMs);
    }
    if (POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      void writePersistedPausedQueueSnapshot(snapshot);
    }
    if (reason) {
      showToastRef.current(reason, 'error');
    }
    logPowerPrompterDebug('recovery:snapshot:restoreEnd', {
      promptCount: prompts.length,
      requestCount: groupedPromptIndices.size,
      groupCount: snapshot.groupSnapshots?.length || 0,
      primaryRequestId: primaryPausedRequestId,
    }, { includeQueue: true });
    return true;
  }, []);

  useEffect(() => {
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      return;
    }
    const backendQueueSnapshotIsAuthoritative =
      backendQueueSnapshotRequestIdsRef.current.size > 0
      || Date.now() < backendQueueSnapshotActiveUntilRef.current
      || backendQueuePauseRequestedRef.current;
    if (backendQueueSnapshotIsAuthoritative) {
      return;
    }
    const visualRequestId = String(queueVisualState?.requestId || '').trim();
    const showingRestoredPausedVisual = visualRequestId.startsWith('paused-');
    const shouldPersistQueueSnapshot = queuePaused || showingRestoredPausedVisual || queueStackItems.some((item) =>
      !item.exiting && (item.status === 'pending' || item.status === 'running')
    );
    if (shouldPersistQueueSnapshot) {
      scheduleRecoverableQueueSnapshotPersist({
        paused: queuePaused || showingRestoredPausedVisual,
        clearWhenEmpty: true,
        delayMs: 25,
      });
      return;
    }

    const existingSnapshot = normalizePersistedPausedQueueSnapshot(restoredPausedQueueRef.current);
    if (existingSnapshot && shouldPersistQueueSnapshot) {
      const snapshot = {
        ...existingSnapshot,
        savedAt: Date.now(),
        paused: queuePaused || existingSnapshot.paused,
        dispatchDelayMs: Math.max(0, Math.floor(Number(queueDispatchDelayMs) || 0)),
      };
      restoredPausedQueueRef.current = snapshot;
      powerPrompterQueueSession.restoredPausedQueue = snapshot;
      void writePersistedPausedQueueSnapshot(snapshot);
      return;
    }

    persistRecoverableQueueSnapshotNow({ clearWhenEmpty: true });
  }, [
    queuePaused,
    queueVisualState,
    queueStackItems,
    queueDispatchDelayMs,
    selectedQueueTargetType,
    effectiveQueueTargetBridgeId,
    scheduleRecoverableQueueSnapshotPersist,
    persistRecoverableQueueSnapshotNow,
  ]);

  useEffect(() => {
    // Intentionally disabled. A missing bridge target is often a temporary iframe
    // reconnect and should not pause or rewrite the active queue.
  }, [bridgeTargets, queuePaused, queueStackItems, queueVisualState]);

  const refreshSavedQueues = useCallback(async (): Promise<SavedPowerPrompterQueueSummary[]> => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) {
      setSavedQueues([]);
      setSelectedSavedQueueId('');
      return [];
    }
    setSavedQueueBusy((prev) => prev || 'list');
    try {
      const items = await listSavedPowerPrompterQueues();
      setSavedQueues(items);
      setSelectedSavedQueueId((prev) => {
        if (prev && items.some((entry) => entry.id === prev)) return prev;
        return items[0]?.id || '';
      });
      return items;
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load saved queues'), 'error');
      return [];
    } finally {
      setSavedQueueBusy((prev) => (prev === 'list' ? null : prev));
    }
  }, [showToast]);

  useEffect(() => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) return;
    if (prompterPanelMode !== 'queue-manager') return;
    void refreshSavedQueues();
  }, [prompterPanelMode, refreshSavedQueues]);

  const handleSaveCurrentQueueSnapshot = useCallback(async () => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) {
      showToast('Saved queue snapshots are parked while Queue Manager follows the live queue only.', 'error');
      return;
    }
    if (savedQueueBusy) return;
    const snapshot = buildRecoverablePausedQueueSnapshotFromCurrentState({ paused: true })
      || normalizePersistedPausedQueueSnapshot(restoredPausedQueueRef.current);
    if (!snapshot) {
      showToast('No active or pending queue prompts to save', 'error');
      return;
    }
    const defaultName = currentFileRef.current
      ? `${String(currentFileRef.current).split(/[\\/]/).pop()?.replace(/\.ppcards\.json$/i, '') || 'Power Prompter'} Queue`
      : 'Power Prompter Queue';
    pendingSavedQueueSnapshotRef.current = snapshot;
    setSaveQueueNameDraft(defaultName);
    setSaveQueueModalOpen(true);
  }, [buildRecoverablePausedQueueSnapshotFromCurrentState, savedQueueBusy, showToast]);

  const handleConfirmSaveCurrentQueueSnapshot = useCallback(async () => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) {
      pendingSavedQueueSnapshotRef.current = null;
      setSaveQueueModalOpen(false);
      showToast('Saved queue snapshots are parked while Queue Manager follows the live queue only.', 'error');
      return;
    }
    if (savedQueueBusy) return;
    const snapshot = normalizePersistedPausedQueueSnapshot(pendingSavedQueueSnapshotRef.current);
    if (!snapshot) {
      setSaveQueueModalOpen(false);
      showToast('No active or pending queue prompts to save', 'error');
      return;
    }
    const trimmedName = String(saveQueueNameDraft || '').trim();
    if (!trimmedName) {
      showToast('Saved queue needs a name', 'error');
      return;
    }
    setSavedQueueBusy('save');
    try {
      const document = await savePowerPrompterQueueSnapshot(trimmedName, snapshot);
      await refreshSavedQueues();
      if (document?.id) setSelectedSavedQueueId(document.id);
      showToast(`Saved queue: ${document?.name || trimmedName}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to save queue'), 'error');
    } finally {
      setSavedQueueBusy(null);
      pendingSavedQueueSnapshotRef.current = null;
      setSaveQueueModalOpen(false);
    }
  }, [refreshSavedQueues, saveQueueNameDraft, savedQueueBusy, showToast]);

  const handleLoadSavedQueueSnapshot = useCallback(async () => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) {
      showToast('Saved queue snapshots are parked while Queue Manager follows the live queue only.', 'error');
      return;
    }
    let id = String(selectedSavedQueueIdRef.current || savedQueuesRef.current[0]?.id || '').trim();
    if (!id && !savedQueueBusy) {
      const items = await refreshSavedQueues();
      id = String(selectedSavedQueueIdRef.current || items[0]?.id || '').trim();
    }
    if (!id || savedQueueBusy) return;
    setSavedQueueBusy('load');
    try {
      const document = await loadSavedPowerPrompterQueue(id);
      if (!document) throw new Error('Saved queue could not be read.');
      restoreRecoverableQueueAsPausedSnapshot(document.snapshot, 'saved queue load');
      setSelectedSavedQueueId(document.id);
      showToast(`Loaded saved queue: ${document.name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load saved queue'), 'error');
    } finally {
      setSavedQueueBusy(null);
    }
  }, [refreshSavedQueues, restoreRecoverableQueueAsPausedSnapshot, savedQueueBusy, showToast]);

  const handleDeleteSavedQueueSnapshot = useCallback(async () => {
    if (!POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED) {
      showToast('Saved queue snapshots are parked while Queue Manager follows the live queue only.', 'error');
      return;
    }
    let id = String(selectedSavedQueueIdRef.current || savedQueuesRef.current[0]?.id || '').trim();
    if (!id && !savedQueueBusy) {
      const items = await refreshSavedQueues();
      id = String(selectedSavedQueueIdRef.current || items[0]?.id || '').trim();
    }
    if (!id || savedQueueBusy) return;
    const selected = savedQueuesRef.current.find((entry) => entry.id === id) || null;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete saved queue "${selected?.name || id}"?`);
    if (!confirmed) return;
    setSavedQueueBusy('delete');
    try {
      const deleted = await deleteSavedPowerPrompterQueue(id);
      if (!deleted) {
        throw new Error('Saved queue file was not found on disk.');
      }
      await refreshSavedQueues();
      showToast(`Deleted saved queue: ${selected?.name || id}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to delete saved queue'), 'error');
    } finally {
      setSavedQueueBusy(null);
    }
  }, [refreshSavedQueues, savedQueueBusy, showToast]);

  const buildQueueHistorySnapshotForRequest = useCallback((requestId: string): PersistedPausedQueueSnapshot | null => {
    const normalizedRequestId = String(requestId || '').trim();
    const meta = normalizedRequestId ? queueRequestMetaRef.current.get(normalizedRequestId) : null;
    const { snapshot, failure } = buildQueueHistorySnapshotModel({
      requestId: normalizedRequestId,
      meta,
      cardDocument: cardDocumentRef.current,
      currentFile: currentFileRef.current || null,
      queueBuildSettings: {
        traversalMode: queueTraversalMode,
        diversity: queueDiversity,
        promptLimit: queuePromptLimit,
        shuffleEnabled: queueShuffleEnabled,
        shuffleSeed: settings.queueShuffleSeed,
      },
    });
    if (failure?.reason === 'missingMeta') {
      logPowerPrompterDebug('history:snapshot:missingMeta', {
        requestId: failure.requestId,
        hasMeta: failure.hasMeta,
        promptCount: failure.promptCount,
      }, { includeQueue: true });
      return null;
    }
    if (failure?.reason === 'noPrompts') {
      logPowerPrompterDebug('history:snapshot:noPrompts', {
        requestId: failure.requestId,
        rawPromptCount: failure.rawPromptCount,
      }, { includeQueue: true });
      return null;
    }
    return snapshot;
  }, [queueDiversity, queuePromptLimit, queueShuffleEnabled, queueTraversalMode, settings.queueShuffleSeed]);

  const refreshQueueHistory = useCallback(async (): Promise<PowerPrompterQueueHistorySummary[]> => {
    setQueueHistoryBusy((prev) => prev || 'list');
    try {
      const items = await listPowerPrompterQueueHistory();
      setQueueHistoryItems(items);
      setSelectedQueueHistoryId((prev) => {
        if (prev && items.some((entry) => entry.id === prev)) return prev;
        return items[0]?.id || '';
      });
      return items;
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load queue history'), 'error');
      return [];
    } finally {
      setQueueHistoryBusy((prev) => (prev === 'list' ? null : prev));
    }
  }, [showToast]);

  const interruptStaleQueueHistoryForDocument = useCallback(async (document: PowerPrompterQueueHistoryDocument) => {
    if (!document?.id) return;
    let items = queueHistoryItemsRef.current;
    if (items.length <= 0) {
      try {
        items = await listPowerPrompterQueueHistory();
      } catch {
        items = queueHistoryItemsRef.current;
      }
    }
    const activeHistoryIds = new Set(
      Array.from(queueHistoryByRequestIdRef.current.values())
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    );
    activeHistoryIds.add(document.id);
    const staleEntries = findStaleQueueHistoryEntries(document, items, activeHistoryIds);
    if (staleEntries.length <= 0) return;
    const staleIds = new Set(staleEntries.map((entry) => entry.id));
    const updatedAt = Date.now();
    setQueueHistoryItems((prev) => prev.map((entry) => {
      if (!staleIds.has(entry.id)) return entry;
      const remaining = Math.max(0, entry.promptCount - entry.completed - entry.failed - entry.canceled);
      return {
        ...entry,
        status: 'interrupted',
        canceled: Math.max(0, entry.canceled + remaining),
        updatedAt,
      };
    }));
    logPowerPrompterDebug('history:staleInterrupted', {
      historyId: document.id,
      staleIds: staleEntries.map((entry) => entry.id),
      activeSetId: document.activeSetId,
      mode: document.mode,
      file: document.file || '',
    }, { includeQueue: true });
    await Promise.allSettled(staleEntries.map((entry) => {
      const remaining = Math.max(0, entry.promptCount - entry.completed - entry.failed - entry.canceled);
      return patchPowerPrompterQueueHistory(entry.id, {
        status: 'interrupted',
        canceled: Math.max(0, entry.canceled + remaining),
      });
    }));
  }, []);

  const createQueueHistoryEntryForRequest = useCallback(async (requestId: string) => {
    const normalizedRequestId = String(requestId || '').trim();
    const snapshot = buildQueueHistorySnapshotForRequest(normalizedRequestId);
    if (!normalizedRequestId || !snapshot) {
      logPowerPrompterDebug('history:create:skipped', {
        requestId: normalizedRequestId,
        hasSnapshot: Boolean(snapshot),
      }, { includeQueue: true });
      return null;
    }
    const existingHistoryId = queueHistoryByRequestIdRef.current.get(normalizedRequestId);
    if (existingHistoryId) {
      logPowerPrompterDebug('history:create:deduped', {
        requestId: normalizedRequestId,
        existingHistoryId,
      }, { includeQueue: true });
      return null;
    }
    const baseName = currentFileRef.current
      ? String(currentFileRef.current).split(/[\\/]/).pop()?.replace(/\.ppcards\.json$/i, '') || 'Power Prompter'
      : 'Power Prompter';
    const optimisticId = `pending-${normalizedRequestId}`;
    const optimisticSummary = buildOptimisticQueueHistorySummary({ optimisticId, baseName, snapshot });
    queueHistoryByRequestIdRef.current.set(normalizedRequestId, optimisticId);
    setQueueHistoryItems((prev) => [optimisticSummary, ...prev.filter((entry) => entry.id !== optimisticId)]);
    setSelectedQueueHistoryId((prev) => prev || optimisticId);
    logPowerPrompterDebug('history:create:start', {
      requestId: normalizedRequestId,
      optimisticId,
      promptCount: snapshot.prompts.length,
      groupCount: snapshot.groupSnapshots?.length || 0,
      activeSetId: snapshot.activeSetId,
      mode: snapshot.mode,
    }, { includeQueue: true });
    try {
      const document = await createPowerPrompterQueueHistory({
        name: `${baseName} - Set ${snapshot.activeSetId}`,
        status: 'running',
        snapshot,
      });
      if (document?.id) {
        queueHistoryByRequestIdRef.current.set(normalizedRequestId, document.id);
        const pendingPatch = queueHistoryPendingPatchByRequestIdRef.current.get(normalizedRequestId);
        queueHistoryPendingPatchByRequestIdRef.current.delete(normalizedRequestId);
        const nextDocument = pendingPatch ? applyQueueHistorySummaryPatch(document, pendingPatch) : document;
        setQueueHistoryItems((prev) => [nextDocument, ...prev.filter((entry) => entry.id !== document.id && entry.id !== optimisticId)]);
        setSelectedQueueHistoryId((prev) => prev === optimisticId || !prev ? document.id : prev);
        if (pendingPatch) {
          logPowerPrompterDebug('history:create:flushPendingPatch', {
            requestId: normalizedRequestId,
            historyId: document.id,
            patchKeys: Object.keys(pendingPatch),
          }, { includeQueue: true });
          void patchPowerPrompterQueueHistory(document.id, {
            ...pendingPatch,
            snapshot: buildQueueHistorySnapshotForRequest(normalizedRequestId) || snapshot,
          }).catch(() => undefined);
        }
      }
      if (document?.id) {
        void interruptStaleQueueHistoryForDocument(document);
      }
      logPowerPrompterDebug('history:create:success', {
        requestId: normalizedRequestId,
        historyId: document?.id || '',
        promptCount: document?.promptCount ?? snapshot.prompts.length,
        status: document?.status || '',
      }, { includeQueue: true });
      return document;
    } catch (error: any) {
      logPowerPrompterDebug('history:create:error', {
        requestId: normalizedRequestId,
        optimisticId,
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      queueHistoryByRequestIdRef.current.delete(normalizedRequestId);
      setQueueHistoryItems((prev) =>
        prev.map((entry) =>
          entry.id === optimisticId
            ? { ...entry, status: 'failed', updatedAt: Date.now() }
            : entry
        )
      );
      return null;
    }
  }, [buildQueueHistorySnapshotForRequest, interruptStaleQueueHistoryForDocument]);

  const updateQueueHistoryForRequest = useCallback((requestId: string, patch: Partial<PowerPrompterQueueHistorySummary>) => {
    const normalizedRequestId = String(requestId || '').trim();
    const historyId = normalizedRequestId ? queueHistoryByRequestIdRef.current.get(normalizedRequestId) : '';
    if (!historyId) {
      if (normalizedRequestId && queueRequestMetaRef.current.has(normalizedRequestId)) {
        logPowerPrompterDebug('history:update:bufferedNoHistoryId', {
          requestId: normalizedRequestId,
          patchKeys: Object.keys(patch),
        }, { includeQueue: true });
        const existingPatch = queueHistoryPendingPatchByRequestIdRef.current.get(normalizedRequestId) || {};
        queueHistoryPendingPatchByRequestIdRef.current.set(normalizedRequestId, { ...existingPatch, ...patch });
        void createQueueHistoryEntryForRequest(normalizedRequestId);
      }
      return;
    }
    if (historyId.startsWith('pending-')) {
      logPowerPrompterDebug('history:update:bufferedPendingId', {
        requestId: normalizedRequestId,
        historyId,
        patchKeys: Object.keys(patch),
      }, { includeQueue: true });
      const existingPatch = queueHistoryPendingPatchByRequestIdRef.current.get(normalizedRequestId) || {};
      const pendingPatch = { ...existingPatch, ...patch };
      queueHistoryPendingPatchByRequestIdRef.current.set(normalizedRequestId, pendingPatch);
      setQueueHistoryItems((prev) => prev.map((entry) => {
        if (entry.id !== historyId) return entry;
        return applyQueueHistorySummaryPatch(entry, pendingPatch);
      }));
      return;
    }
    const snapshot = buildQueueHistorySnapshotForRequest(normalizedRequestId);
    logPowerPrompterDebug('history:update:patchStart', {
      requestId: normalizedRequestId,
      historyId,
      patchKeys: Object.keys(patch),
      hasSnapshot: Boolean(snapshot),
    }, { includeQueue: true });
    void patchPowerPrompterQueueHistory(historyId, {
      ...patch,
      ...(snapshot ? { snapshot } : {}),
    })
      .then((document) => {
        if (!document) return;
        logPowerPrompterDebug('history:update:success', {
          requestId: normalizedRequestId,
          historyId: document.id,
          status: document.status,
          completed: document.completed,
          failed: document.failed,
          canceled: document.canceled,
        }, { includeQueue: true });
        setQueueHistoryItems((prev) => [document, ...prev.filter((entry) => entry.id !== document.id)]);
      })
      .catch((error: any) => {
        logPowerPrompterDebug('history:update:error', {
          requestId: normalizedRequestId,
          historyId,
          message: String(error?.message || error || 'Unknown error'),
        }, { includeQueue: true });
      });
  }, [buildQueueHistorySnapshotForRequest]);

  const mergeQueueHistoryPreviewImagesForRequest = useCallback((
    requestId: string,
    incomingImages: PowerPrompterQueueHistoryPreviewImage[]
  ): PowerPrompterQueueHistoryPreviewImage[] => {
    const normalizedRequestId = String(requestId || '').trim();
    const historyId = normalizedRequestId ? queueHistoryByRequestIdRef.current.get(normalizedRequestId) : '';
    const existingSummary = historyId
      ? queueHistoryItemsRef.current.find((entry) => entry.id === historyId)
      : null;
    const pendingPatch = normalizedRequestId
      ? queueHistoryPendingPatchByRequestIdRef.current.get(normalizedRequestId)
      : null;
    return normalizePowerPrompterQueueHistoryPreviewImages([
      ...(existingSummary?.previewImages || []),
      ...(pendingPatch?.previewImages || []),
      ...incomingImages,
    ]);
  }, []);

  const openQueueHistoryPanel = useCallback(() => {
    setQueueHistoryOpen(true);
    void refreshQueueHistory();
  }, [refreshQueueHistory]);

  const loadQueueHistoryDocument = useCallback(async (idInput?: string): Promise<PowerPrompterQueueHistoryDocument | null> => {
    let id = String(idInput || selectedQueueHistoryIdRef.current || queueHistoryItemsRef.current[0]?.id || '').trim();
    if (!id && !queueHistoryBusy) {
      const items = await refreshQueueHistory();
      id = String(selectedQueueHistoryIdRef.current || items[0]?.id || '').trim();
    }
    if (!id) return null;
    const document = await loadPowerPrompterQueueHistory(id);
    if (!document) throw new Error('Queue history item could not be read.');
    setSelectedQueueHistoryId(document.id);
    return document;
  }, [queueHistoryBusy, refreshQueueHistory]);

  const handleLoadQueueHistoryForEdit = useCallback(async (idInput?: string) => {
    if (!POWER_PROMPTER_QUEUE_EDITOR_ENABLED) {
      showToast('Queue history editor restore is unavailable.', 'error');
      return;
    }
    if (queueHistoryBusy) return;
    setQueueHistoryBusy('load');
    try {
      const document = await loadQueueHistoryDocument(idInput);
      if (!document) return;
      const resolved = resolveQueueHistoryEditorSnapshot(document);
      if (!resolved) throw new Error('No editor snapshot available for this history entry.');
      const { groupSnapshot, editorSnapshot } = resolved;
      const normalizedDocument = normalizePowerPrompterCardDocument(editorSnapshot.document, editorSnapshot.sourceFile);
      const chainCards = normalizeChainCards(normalizedDocument.cards);
      const nextDocument = {
        ...normalizedDocument,
        cards: chainCards,
      };
      setQueueEditorDocument(nextDocument);
      queueEditorDocumentRef.current = nextDocument;
      setQueueEditorDraft({
        requestId: `history-${document.id}-${groupSnapshot.requestId || groupSnapshot.id}`,
        label: `History Draft: ${document.name}`,
        mode: groupSnapshot.mode || document.mode || 'selected',
        activeSetId: clampQueueSetId(groupSnapshot.activeSetId ?? document.activeSetId),
        sourceFile: editorSnapshot.sourceFile,
        originalPromptCount: Math.max(0, Math.floor(Number(groupSnapshot.promptCount || document.promptCount) || 0)),
        queueBuildSettings: normalizeQueueEditorBuildSettings(editorSnapshot.queueBuildSettings),
        sourceKind: 'history',
        historyDocumentId: document.id,
      });
      setPrompterPanelMode('queue-editor');
      setQueueHistoryOpen(false);
      showToast(`Restored historical editor draft: ${document.name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load queue history'), 'error');
    } finally {
      setQueueHistoryBusy(null);
    }
  }, [loadQueueHistoryDocument, queueHistoryBusy, showToast]);

  const handleDeleteQueueHistory = useCallback(async (idInput?: string) => {
    if (queueHistoryBusy) return;
    const id = String(idInput || selectedQueueHistoryIdRef.current || queueHistoryItemsRef.current[0]?.id || '').trim();
    if (!id) return;
    const selected = queueHistoryItemsRef.current.find((entry) => entry.id === id) || null;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete queue history "${selected?.name || id}"?`);
    if (!confirmed) return;
    setQueueHistoryBusy('delete');
    try {
      await deletePowerPrompterQueueHistory(id);
      setQueueHistoryItems((prev) => prev.filter((entry) => entry.id !== id));
      setSelectedQueueHistoryId((prev) => {
        if (prev !== id) return prev;
        const next = queueHistoryItemsRef.current.find((entry) => entry.id !== id);
        return next?.id || '';
      });
      showToast(`Deleted queue history: ${selected?.name || id}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to delete queue history'), 'error');
    } finally {
      setQueueHistoryBusy(null);
    }
  }, [queueHistoryBusy, showToast]);

  useEffect(() => {
    generationPreviewHoldMsRef.current = generationPreviewHoldMs;
  }, [generationPreviewHoldMs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      window.localStorage.removeItem('umbra.powerPrompter.settingsSync');
      channel = new BroadcastChannel(POWER_PROMPTER_SETTINGS_SYNC_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
      try {
        const payload = event.data as { settings?: unknown };
        const normalized = { ...normalizePowerPrompterSettings(payload?.settings), editorMode: 'cards' as const };
        setSettings(normalized);
        setEnabledCSVs(Array.isArray(normalized.enabledCSVs) ? normalized.enabledCSVs : []);
      } catch {
        // ignore malformed setting sync payloads
      }
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, []);

  useEffect(() => {
    if (!soundMenuOpen || typeof window === 'undefined') return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (soundMenuRef.current?.contains(target)) return;
      setSoundMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [soundMenuOpen]);

  useEffect(() => {
    try {
      window.localStorage.removeItem(POWER_PROMPTER_LEFT_PANEL_STORAGE_KEY);
    } catch {
      // Legacy cleanup only.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem(POWER_PROMPTER_RIGHT_PANEL_STORAGE_KEY);
    } catch {
      // Legacy cleanup only.
    }
  }, []);

  const clearAutosaveTimer = () => {
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  };

  const scheduleAutosaveAfterIdle = (delayOverrideMs?: number) => {
    clearAutosaveTimer();
    const idleForMs = Date.now() - lastEditAtRef.current;
    const remainingIdleMs = lastEditAtRef.current > 0
      ? Math.max(0, AUTOSAVE_IDLE_MS - idleForMs)
      : AUTOSAVE_IDLE_MS;
    const delayMs = Number.isFinite(delayOverrideMs)
      ? Math.max(0, Number(delayOverrideMs))
      : remainingIdleMs;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosaveIfNeeded();
    }, delayMs);
  };

  const markPendingChange = () => {
    lastEditAtRef.current = Date.now();
    hasPendingChangesRef.current = !!currentFileRef.current;
    if (hasPendingChangesRef.current) {
      scheduleAutosaveAfterIdle(AUTOSAVE_IDLE_MS);
    }
  };

  const applyPowerPrompterDocumentSession = useCallback((
    session: PowerPrompterDocumentSession,
    options?: { fromRemote?: boolean }
  ) => {
    if (!session.document || !session.file) return;
    const sourceClientId = String(session.sourceClientId || '').trim();
    if (options?.fromRemote && sourceClientId && sourceClientId === powerPrompterUiClientIdRef.current) return;
    if (session.revision > 0 && session.revision < powerPrompterSessionRevisionRef.current) return;

    const normalizedBase = normalizePowerPrompterCardDocument(session.document, session.file);
    const normalized = {
      ...normalizedBase,
      cards: normalizeChainCards(normalizedBase.cards),
    };
    const composed = session.composedPrompt || composeActivePromptFromCards(normalized.cards, normalized.activeQueueSet);
    const signature = getCardDocSignature(normalized);

    powerPrompterSessionApplyingRef.current = true;
    powerPrompterSessionRevisionRef.current = Math.max(powerPrompterSessionRevisionRef.current, session.revision);
    setCurrentFile(session.file);
    setContent(composed);
    setCardDocument(normalized);
    setQueueSetTarget(clampQueueSetId(normalized.activeQueueSet));
    currentFileRef.current = session.file;
    contentRef.current = composed;
    cardDocumentRef.current = normalized;
    lastSavedContentRef.current = session.dirty ? lastSavedContentRef.current : composed;
    lastSavedCardSignatureRef.current = session.dirty ? lastSavedCardSignatureRef.current : signature;
    hasPendingChangesRef.current = session.dirty;
    lastEditAtRef.current = session.dirty ? Date.now() : 0;
    powerPrompterSessionApplyingRef.current = false;
  }, []);

  const schedulePowerPrompterDocumentSessionUpdate = useCallback((documentOverride?: PowerPrompterCardDocument) => {
    if (powerPrompterSessionUpdateTimerRef.current) {
      clearTimeout(powerPrompterSessionUpdateTimerRef.current);
      powerPrompterSessionUpdateTimerRef.current = null;
    }
    const file = currentFileRef.current;
    const document = documentOverride || cardDocumentRef.current;
    if (!file || !document) return;
    powerPrompterSessionUpdateTimerRef.current = setTimeout(() => {
      powerPrompterSessionUpdateTimerRef.current = null;
      void updatePowerPrompterDocumentSession({
        file,
        document,
        clientId: powerPrompterUiClientIdRef.current,
        save: false,
        intent: 'session-update',
      }).then((payload) => {
        if (payload.session) {
          powerPrompterSessionRevisionRef.current = Math.max(powerPrompterSessionRevisionRef.current, payload.session.revision);
        }
      }).catch(() => {
        // Autosave still owns durable persistence feedback.
      });
    }, 500);
  }, []);

  const clearPrompterRetryTimer = () => {
    if (!prompterWsRetryRef.current) return;
    clearTimeout(prompterWsRetryRef.current);
    prompterWsRetryRef.current = null;
  };

  const clearSyncSendTimer = () => {
    if (!syncSendTimerRef.current) return;
    clearTimeout(syncSendTimerRef.current);
    syncSendTimerRef.current = null;
  };

  const clearQueueStackTimers = () => {
    for (const timer of queueStackRemoveTimersRef.current) {
      clearTimeout(timer);
    }
    queueStackRemoveTimersRef.current.clear();
  };

  const clearGenerationPreviewHideTimer = () => {
    if (!generationPreviewHideTimerRef.current) return;
    clearTimeout(generationPreviewHideTimerRef.current);
    generationPreviewHideTimerRef.current = null;
  };

  const scheduleGenerationPreviewHide = () => {
    clearGenerationPreviewHideTimer();
    const holdMs = generationPreviewHoldMsRef.current;
    if (holdMs === null) return;
    generationPreviewHideTimerRef.current = setTimeout(() => {
      generationPreviewHideTimerRef.current = null;
      setGenerationPreview((prev) => (prev?.status === 'running' ? prev : null));
    }, holdMs);
  };

  const handleSetGenerationPreviewHoldMs = (nextMs: number | null) => {
    const normalized = nextMs === null
      ? null
      : Math.max(1000, Math.floor(Number(nextMs)));
    setGenerationPreviewHoldMs(normalized);
    generationPreviewHoldMsRef.current = normalized;
    if (!generationPreview) return;
    if (generationPreview.status === 'running') return;
    if (normalized === null) {
      clearGenerationPreviewHideTimer();
      return;
    }
    scheduleGenerationPreviewHide();
  };

  const scheduleQueueItemRemoval = (requestId: string, promptIndex: number, delayMs: number) => {
    const timer = setTimeout(() => {
      queueStackRemoveTimersRef.current.delete(timer);
      updateQueueStackItemsSynced((prev) =>
        prev.filter((item) => !(item.requestId === requestId && item.promptIndex === promptIndex))
      );
    }, delayMs);
    queueStackRemoveTimersRef.current.add(timer);
  };

  const collectBridgeTrackedQueueRequestIds = (): Set<string> => {
    return new Set([
      ...bridgeQueueStateRef.current.activeRequestIds,
      ...bridgeQueueStateRef.current.pendingRequestIds,
    ].map((entry) => String(entry || '').trim()).filter(Boolean));
  };

  const pruneBridgeQueueStateRequestIds = (requestIds: string[]) => {
    const ids = new Set(
      requestIds
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0)
    );
    if (ids.size <= 0) return;
    const previous = bridgeQueueStateRef.current;
    const activeRequestIds = previous.activeRequestIds.filter((requestId) => !ids.has(String(requestId || '').trim()));
    const pendingRequestIds = previous.pendingRequestIds.filter((requestId) => !ids.has(String(requestId || '').trim()));
    if (
      activeRequestIds.length === previous.activeRequestIds.length
      && pendingRequestIds.length === previous.pendingRequestIds.length
    ) {
      return;
    }
    bridgeQueueStateRef.current = {
      ...previous,
      activeRequestIds,
      pendingRequestIds,
      pendingCount: Math.max(0, Math.min(previous.pendingCount, activeRequestIds.length + pendingRequestIds.length)),
    };
    powerPrompterQueueSession.bridgeQueueState = bridgeQueueStateRef.current;
    logQueueDebug('bridgeQueueState:prunedRequestIds', {
      requestIds: Array.from(ids),
      activeRequestIds,
      pendingRequestIds,
      pendingCount: bridgeQueueStateRef.current.pendingCount,
    });
  };

  const snapshotHasBridgeTrackedQueueWork = (snapshotInput: PersistedPausedQueueSnapshot | null | undefined): boolean => {
    const snapshot = normalizePersistedPausedQueueSnapshot(snapshotInput);
    if (!snapshot) return false;
    const bridgeRequestIds = collectBridgeTrackedQueueRequestIds();
    if (bridgeRequestIds.size <= 0) return false;
    return snapshot.requestIds.some((requestId) => bridgeRequestIds.has(String(requestId || '').trim()));
  };

  const bridgeHasOpaqueQueueBacklog = (): boolean => {
    const bridgeState = bridgeQueueStateRef.current;
    return bridgeState.pendingCount > 0
      && bridgeState.activeRequestIds.length <= 0
      && bridgeState.pendingRequestIds.length <= 0;
  };

  const rejectPendingQueueRequestById = (requestId: string, reason: string) => {
    const key = String(requestId || '').trim();
    if (!key) return;
    const pending = pendingQueueRequestsRef.current.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingQueueRequestsRef.current.delete(key);
    pending.reject(new Error(reason));
  };

  const rejectPendingQueueRequestsByIds = (requestIds: string[], reason: string) => {
    for (const requestId of requestIds) {
      rejectPendingQueueRequestById(requestId, reason);
    }
  };

  const rejectAllPendingQueueRequests = (reason: string) => {
    for (const [requestId, pending] of Array.from(pendingQueueRequestsRef.current.entries())) {
      clearTimeout(pending.timer);
      pendingQueueRequestsRef.current.delete(requestId);
      pending.reject(new Error(reason));
    }
  };

  const dropTrackedQueueRequestState = (
    requestIds: string[],
    status: PowerPrompterQueueHistorySummary['status'] = 'interrupted'
  ) => {
    const ids = new Set(
      requestIds
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0)
    );
    if (ids.size <= 0) return;
    logQueueDebug('dropTrackedQueueRequestState:start', { requestIds: Array.from(ids) });
    clearMatchingLocalPausedSnapshotRequestIds(Array.from(ids));
    for (const requestId of ids) {
      markQueueRequestEventsStale(requestId);
      updateQueueHistoryForRequest(requestId, { status });
      backendQueueSnapshotRequestIdsRef.current.delete(requestId);
      queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
      queueRequestMetaRef.current.delete(requestId);
      completedPromptIndicesRef.current.delete(requestId);
      intentionallyCanceledQueueRequestIdsRef.current.delete(requestId);
      clearedQueueRequestIdsRef.current.delete(requestId);
    }
    if (backendQueueSnapshotRequestIdsRef.current.size <= 0) {
      backendQueueSnapshotActiveUntilRef.current = 0;
      backendQueuePauseRequestedRef.current = false;
    }
    pruneBridgeQueueStateRequestIds(Array.from(ids));
    clearQueueTimingState(Array.from(ids));
    updateQueueStackItemsSynced((prev) =>
      prev.filter((item) => !ids.has(String(item.requestId || '').trim()))
    );
    setQueueVisualState((prev) => {
      if (!prev) return prev;
      const requestId = String(prev.requestId || '').trim();
      return ids.has(requestId) ? null : prev;
    });
    setGenerationPreview((prev) => {
      if (!prev) return prev;
      const requestId = String(prev.requestId || '').trim();
      return ids.has(requestId) ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev;
    });
    scheduleGenerationPreviewHide();
    logQueueDebug('dropTrackedQueueRequestState:end', { requestIds: Array.from(ids) });
  };

  const rebuildLocalPausedSnapshotWithPromptKeepIndices = (
    snapshotInput: PersistedPausedQueueSnapshot | null,
    keepIndicesInput: number[],
  ): PersistedPausedQueueSnapshot | null => {
    const snapshot = normalizePersistedPausedQueueSnapshot(snapshotInput);
    if (!snapshot) return null;
    const keepIndices = Array.from(new Set(
      keepIndicesInput
        .map((entry) => Math.max(0, Math.floor(Number(entry))))
        .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry < snapshot.prompts.length)
    )).sort((a, b) => a - b);
    if (keepIndices.length <= 0) return null;

    const newIndexByOldIndex = new Map<number, number>();
    keepIndices.forEach((oldIndex, newIndex) => {
      newIndexByOldIndex.set(oldIndex, newIndex);
    });

    const nextGroupSnapshots = (snapshot.groupSnapshots || [])
      .map((entry): PersistedQueueGroupSnapshot | null => {
        const requestId = String(entry.requestId || '').trim();
        if (!requestId) return null;
        const sourceIndices = (Array.isArray(entry.promptIndices) && entry.promptIndices.length > 0
          ? entry.promptIndices
          : snapshot.requestIds
            .map((candidate, index) => (String(candidate || '').trim() === requestId ? index : -1))
            .filter((index) => index >= 0)
        )
          .map((index) => Math.max(0, Math.floor(Number(index))))
          .filter((index) => Number.isFinite(index));
        const promptIndices = sourceIndices
          .map((oldIndex) => newIndexByOldIndex.get(oldIndex))
          .filter((index): index is number => index !== undefined);
        if (promptIndices.length <= 0) return null;
        const promptStartIndex = promptIndices[0] ?? 0;
        return {
          ...entry,
          requestId,
          promptStartIndex,
          promptCount: promptIndices.length,
          promptIndices,
        };
      })
      .filter((entry): entry is PersistedQueueGroupSnapshot => !!entry);

    return normalizePersistedPausedQueueSnapshot({
      ...snapshot,
      snapshotSchemaVersion: nextGroupSnapshots.length > 0 ? 2 : snapshot.snapshotSchemaVersion,
      savedAt: Date.now(),
      requestIds: keepIndices.map((index) => snapshot.requestIds[index]),
      prompts: keepIndices.map((index) => snapshot.prompts[index]),
      promptEntries: snapshot.promptEntries
        ? keepIndices.map((index) => snapshot.promptEntries?.[index] || { prompt: snapshot.prompts[index] || '', tokens: [] })
        : undefined,
      promptSetIds: keepIndices.map((index) => snapshot.promptSetIds[index]),
      promptOutputSubfolders: keepIndices.map((index) => snapshot.promptOutputSubfolders[index]),
      promptStyleNames: keepIndices.map((index) => snapshot.promptStyleNames[index]),
      promptSeedGroupIds: keepIndices.map((index) => snapshot.promptSeedGroupIds[index]),
      generation: snapshot.generationByPrompt[keepIndices[0] ?? 0] ?? snapshot.generation,
      generationByPrompt: keepIndices.map((index) => snapshot.generationByPrompt[index]),
      paused: true,
      ...(nextGroupSnapshots.length > 0 ? { groupSnapshots: nextGroupSnapshots } : { groupSnapshots: undefined }),
    });
  };

  const replaceLocalPausedQueueSnapshot = (snapshot: PersistedPausedQueueSnapshot | null) => {
    if (!POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED) {
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      lastPersistedQueueSnapshotSignatureRef.current = 'disabled';
      void writePersistedPausedQueueSnapshot(null);
      return;
    }
    const normalized = normalizePersistedPausedQueueSnapshot(snapshot);
    restoredPausedQueueRef.current = normalized;
    powerPrompterQueueSession.restoredPausedQueue = normalized;
    lastPersistedQueueSnapshotSignatureRef.current = normalized
      ? JSON.stringify({
        paused: normalized.paused === true,
        mode: normalized.mode,
        activeSetId: normalized.activeSetId,
        queueTargetType: normalized.queueTargetType,
        targetBridgeId: normalized.targetBridgeId,
        dispatchDelayMs: normalized.dispatchDelayMs,
        requestIds: normalized.requestIds,
        prompts: normalized.prompts,
        promptSetIds: normalized.promptSetIds,
        promptOutputSubfolders: normalized.promptOutputSubfolders,
        promptStyleNames: normalized.promptStyleNames,
        promptSeedGroupIds: normalized.promptSeedGroupIds,
        generationByPrompt: normalized.generationByPrompt,
        groupSnapshots: normalized.groupSnapshots || [],
      })
      : 'null';
    void writePersistedPausedQueueSnapshot(normalized);
  };

  const clearQueueManagerLiveDisplay = (reason: string) => {
    logQueueDebug('queue:liveDisplay:clear', { reason });
    queueVisualStateRef.current = null;
    queueStackItemsRef.current = [];
    powerPrompterQueueSession.queueVisualState = null;
    powerPrompterQueueSession.queueStackItems = [];
    restoredPausedQueueRef.current = null;
    powerPrompterQueueSession.restoredPausedQueue = null;
    backendQueueSnapshotRequestIdsRef.current = new Set();
    backendQueueSnapshotActiveUntilRef.current = 0;
    backendQueueSnapshotSignatureRef.current = '';
    backendQueuePauseRequestedRef.current = false;
    queueBridgeDispatchedRequestIdsRef.current.clear();
    queueSequentialDispatchInFlightRef.current = false;
    bridgeQueueStateRef.current = {
      paused: false,
      pendingCount: 0,
      activeRequestIds: [],
      pendingRequestIds: [],
    };
    powerPrompterQueueSession.bridgeQueueState = bridgeQueueStateRef.current;
    queueRequestMetaRef.current.clear();
    completedPromptIndicesRef.current.clear();
    intentionallyCanceledQueueRequestIdsRef.current.clear();
    clearedQueueRequestIdsRef.current.clear();
    pendingQueueCancelScopeRef.current = [];
    pendingQueueClearFutureScopeRef.current = [];
    pendingQueuePromptRemovalOpsRef.current.clear();
    pendingQueuePromptRemovalKeysRef.current.clear();
    clearQueueTimingState();
    setQueueVisualState(null);
    updateQueueStackItemsSynced([]);
  };

  const clearMatchingLocalPausedSnapshotRequestIds = (requestIds: string[]) => {
    const ids = new Set(
      requestIds
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0)
    );
    if (ids.size <= 0) return;
    const snapshot = normalizePersistedPausedQueueSnapshot(restoredPausedQueueRef.current);
    if (!snapshot) return;
    const hasMatch = snapshot.requestIds.some((requestId) => ids.has(String(requestId || '').trim()));
    if (!hasMatch) return;
    const keepIndices = snapshot.requestIds
      .map((requestId, index) => ({ requestId: String(requestId || '').trim(), index }))
      .filter((entry) => !ids.has(entry.requestId))
      .map((entry) => entry.index);
    const nextSnapshot = rebuildLocalPausedSnapshotWithPromptKeepIndices(snapshot, keepIndices);
    replaceLocalPausedQueueSnapshot(nextSnapshot);
    logQueueDebug('queue:snapshot:clearRequestIds', {
      requestIds: Array.from(ids),
      remainingPrompts: nextSnapshot?.prompts.length || 0,
      remainingGroups: nextSnapshot?.groupSnapshots?.length || 0,
    });
  };

  const removeLocalPausedSnapshotPromptIndices = (requestIdInput: string, promptIndicesInput: number[]) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return;
    const snapshot = normalizePersistedPausedQueueSnapshot(restoredPausedQueueRef.current);
    if (!snapshot) return;
    const removalSet = new Set(
      promptIndicesInput
        .map((entry) => Math.max(0, Math.floor(Number(entry))))
        .filter((entry) => Number.isFinite(entry))
    );
    if (removalSet.size <= 0) return;
    const requestLocalIndexBySnapshotIndex = new Map<number, number>();
    let localIndex = 0;
    snapshot.requestIds.forEach((entry, index) => {
      if (String(entry || '').trim() !== requestId) return;
      requestLocalIndexBySnapshotIndex.set(index, localIndex);
      localIndex += 1;
    });
    const hasMatch = Array.from(requestLocalIndexBySnapshotIndex.values()).some((entry) => removalSet.has(entry));
    if (!hasMatch) return;
    const keepIndices = snapshot.requestIds
      .map((entry, index) => ({ requestId: String(entry || '').trim(), index }))
      .filter((entry) => {
        if (entry.requestId !== requestId) return true;
        const requestLocalIndex = requestLocalIndexBySnapshotIndex.get(entry.index);
        return requestLocalIndex === undefined || !removalSet.has(requestLocalIndex);
      })
      .map((entry) => entry.index);
    const nextSnapshot = rebuildLocalPausedSnapshotWithPromptKeepIndices(snapshot, keepIndices);
    replaceLocalPausedQueueSnapshot(nextSnapshot);
    logQueueDebug('queue:snapshot:removePromptIndices', {
      requestId,
      promptIndices: Array.from(removalSet),
      remainingPrompts: nextSnapshot?.prompts.length || 0,
      remainingGroups: nextSnapshot?.groupSnapshots?.length || 0,
    });
  };

  const failTrackedQueueRequest = (requestId: string, reason: string, pending?: { reject: (reason?: unknown) => void; timer: ReturnType<typeof setTimeout> } | null) => {
    const key = String(requestId || '').trim();
    if (!key) return;
    logQueueDebug('failTrackedQueueRequest:start', { requestId: key, reason });
    if (pending) {
      clearTimeout(pending.timer);
      pendingQueueRequestsRef.current.delete(key);
    }
    updateQueueHistoryForRequest(key, { status: 'failed' });
    pruneBridgeQueueStateRequestIds([key]);
    queueBridgeDispatchedRequestIdsRef.current.delete(key);
    queueRequestMetaRef.current.delete(key);
    completedPromptIndicesRef.current.delete(key);
    intentionallyCanceledQueueRequestIdsRef.current.delete(key);
    clearedQueueRequestIdsRef.current.delete(key);
    clearMatchingLocalPausedSnapshotRequestIds([key]);
    setQueuePaused(true);
    setQueueVisualState((prev) => (prev && prev.requestId === key ? null : prev));
    updateQueueStackItemsSynced((prev) =>
      prev.map((item) => {
        if (item.requestId !== key || item.exiting) return item;
        return { ...item, status: 'failed', exiting: true };
      })
    );
    const timer = setTimeout(() => {
      queueStackRemoveTimersRef.current.delete(timer);
      updateQueueStackItemsSynced((prev) =>
        prev.filter((item) => item.requestId !== key)
      );
    }, 1000);
    queueStackRemoveTimersRef.current.add(timer);
    setGenerationPreview((prev) => {
      if (!prev) return prev;
      if (prev.requestId && prev.requestId !== key) return prev;
      return { ...prev, status: 'idle', updatedAt: Date.now() };
    });
    scheduleGenerationPreviewHide();
    pending?.reject(new Error(reason));
    scheduleRecoverableQueueSnapshotPersist({ paused: true, clearWhenEmpty: true, delayMs: 50 });
    logQueueDebug('failTrackedQueueRequest:end', { requestId: key, reason });
  };

  const isBackendOwnedCancellationPayload = (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.canceled === true) return true;
    const reason = String(payload.reason || '').trim().toLowerCase();
    const error = String(payload.error || '').trim().toLowerCase();
    return reason === 'cancel'
      || reason === 'interrupt'
      || reason === 'clear_future'
      || reason === 'queue_canceled'
      || reason === 'backend_queue_stopped_after_current'
      || error.includes('backend power prompter queue canceled');
  };

  const cancelTrackedQueueRequest = (
    requestId: string,
    reason: string,
    pending?: { reject: (reason?: unknown) => void; timer: ReturnType<typeof setTimeout> } | null,
    status: PowerPrompterQueueHistorySummary['status'] = 'canceled'
  ) => {
    const key = String(requestId || '').trim();
    if (!key) return;
    logQueueDebug('cancelTrackedQueueRequest:start', { requestId: key, reason, status });
    if (pending) {
      clearTimeout(pending.timer);
      pendingQueueRequestsRef.current.delete(key);
      pending.reject(new Error(reason || 'Queue canceled.'));
    }
    dropTrackedQueueRequestState([key], status);
    intentionallyCanceledQueueRequestIdsRef.current.delete(key);
    clearedQueueRequestIdsRef.current.delete(key);
    setQueuePaused(false);
    scheduleRecoverableQueueSnapshotPersist({ paused: false, clearWhenEmpty: true, delayMs: 50 });
    logQueueDebug('cancelTrackedQueueRequest:end', { requestId: key, reason, status });
  };

  const applyBackendQueueSnapshot = (snapshotInput: any) => {
    const snapshot = snapshotInput && typeof snapshotInput === 'object'
      ? (snapshotInput.snapshot && typeof snapshotInput.snapshot === 'object' ? snapshotInput.snapshot : snapshotInput)
      : null;
    const rawRequests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
    const snapshotSignature = buildBackendQueueSnapshotSignature(snapshot);
    if (snapshotSignature && backendQueueSnapshotSignatureRef.current === snapshotSignature) {
      const rawRequestIds = rawRequests
          .map((request: any) => normalizeRequestId(request?.requestId))
          .filter(Boolean);
      const localSnapshotMismatch = hasBackendQueueSnapshotMismatch({
        backendRequestIds: rawRequestIds,
        localStackItems: queueStackItemsRef.current,
        visualRequestId: queueVisualStateRef.current?.requestId || '',
      });
      logQueueDebug(localSnapshotMismatch ? 'ws:queue_snapshot:duplicate_reapply_mismatch' : 'ws:queue_snapshot:ignored_duplicate', {
        version: snapshot?.version,
        reason: snapshot?.reason,
        requestCount: rawRequests.length,
        localSnapshotMismatch,
      });
      // Even an identical backend snapshot is allowed to repair local UI state.
      // Generation-control edits, iframe reconnects, and local staging can all
      // mutate queueStackItems/queueRequestMeta without changing the backend
      // snapshot signature. The backend snapshot is the queue manager source of
      // truth, so continue and let the synced setters no-op when nothing drifted.
    }
    backendQueueSnapshotSignatureRef.current = snapshotSignature;
    const now = Date.now();
    const activeBackendIds = new Set<string>();
    const terminalBackendIds = new Set<string>();
    const backendStackItems: QueueStackItem[] = [];
    let nextVisual: QueueVisualState | null = null;

    for (const rawRequest of rawRequests) {
      const requestId = normalizeRequestId(rawRequest?.requestId);
      if (!requestId) continue;
      const requestStatus = String(rawRequest?.status || '').trim().toLowerCase();
      const rawPrompts = Array.isArray(rawRequest?.prompts) ? rawRequest.prompts : [];
      const activePrompts = rawPrompts.filter((entry: any) => {
        const status = String(entry?.status || 'pending').trim().toLowerCase();
        return status === 'pending' || status === 'submitting' || status === 'running';
      });
      const hasLiveWork = rawPrompts.some((entry: any) => {
        const status = String(entry?.status || 'pending').trim().toLowerCase();
        return status === 'pending' || status === 'submitting' || status === 'running';
      });
      const isTerminalRequest = !hasLiveWork
        && (
          requestStatus === 'completed'
          || requestStatus === 'canceled'
          || requestStatus === 'cancelled'
          || requestStatus === 'interrupted'
          || requestStatus === 'failed'
        );

      if (isTerminalRequest) {
        terminalBackendIds.add(requestId);
      } else {
        activeBackendIds.add(requestId);
      }

      const prompts = rawPrompts.map((entry: any) => String(entry?.prompt || '').trim());
      const promptSetIds = rawPrompts.map((entry: any) => clampQueueSetId(entry?.setId ?? rawRequest?.activeSetId ?? 1));
      const promptOutputSubfolders = rawPrompts.map((entry: any) => String(entry?.outputSubfolder || '').trim());
      const promptStyleNames = rawPrompts.map((entry: any) => String(entry?.styleName || '').trim());
      for (const entry of rawPrompts) {
        const status = String(entry?.status || 'pending').trim().toLowerCase();
        if (status !== 'submitting' && status !== 'running') continue;
        const promptIndex = Math.max(0, Math.floor(Number(entry?.promptIndex) || 0));
        markQueuePromptStarted(requestId, promptIndex);
        markQueuePromptActivity(requestId, promptIndex);
      }
      const generationBase = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
      const generationByPrompt = rawPrompts.map((entry: any) => {
        const snapshotGeneration = entry?.generation && typeof entry.generation === 'object'
          ? entry.generation
          : null;
        return normalizePowerPrompterGenerationControls({
          ...generationBase,
          ...(snapshotGeneration || {}),
          seed: Number.isFinite(Number(entry?.seed))
            ? Math.max(0, Math.floor(Number(entry.seed)))
            : (snapshotGeneration ? Number((snapshotGeneration as any).seed) : generationBase.seed),
        });
      });
      const visibleBackendPrompts = isTerminalRequest ? [] : activePrompts;
      if (activeBackendIds.has(requestId) || visibleBackendPrompts.length > 0) {
        const existingMeta = queueRequestMetaRef.current.get(requestId);
        const snapshotPipeline = normalizeUmbraUiPipelineSelection(rawRequest?.pipeline, {
          feature: 'txt2img',
          modelFamily: String(cardDocumentRef.current.pipeline?.modelFamily || cardDocumentRef.current.modelType || ''),
          modelSource: generationByPrompt[0]?.modelType,
        });
        const rawPipelineTargetId = String(rawRequest?.pipelineId || '').trim()
          || createUmbraUiPipelineTargetId(snapshotPipeline);
        const meta: QueueRequestMeta = {
          mode: String(rawRequest?.mode || existingMeta?.mode || 'selected') as PowerPrompterQueueMode,
          setId: clampQueueSetId(rawRequest?.activeSetId ?? promptSetIds[0] ?? existingMeta?.setId ?? 1),
          randomApplied: existingMeta?.randomApplied === true,
          queueTargetType: 'pipeline',
          targetBridgeId: rawPipelineTargetId || existingMeta?.targetBridgeId || createUmbraUiPipelineTargetId(snapshotPipeline),
          dispatchDelayMs: existingMeta?.dispatchDelayMs ?? queueDispatchDelayMsRef.current,
          prompts,
          promptSetIds,
          promptOutputSubfolders,
          promptStyleNames,
          promptSeedGroupIds: existingMeta?.promptSeedGroupIds?.length === rawPrompts.length
            ? (existingMeta?.promptSeedGroupIds || [])
            : rawPrompts.map(() => ''),
          generationByPrompt,
          editorSnapshot: existingMeta?.editorSnapshot,
        };
        queueRequestMetaRef.current.set(requestId, meta);
        updateQueueHistoryForRequest(requestId, {
          total: prompts.length,
          completed: rawPrompts.filter((entry: any) => String(entry?.status || '').trim().toLowerCase() === 'completed').length,
          status: hasLiveWork
            ? 'running'
            : (
              requestStatus === 'failed'
                ? 'failed'
                : (requestStatus === 'interrupted' ? 'interrupted' : (requestStatus === 'canceled' || requestStatus === 'cancelled' ? 'canceled' : 'completed'))
            ),
        });
      } else {
        queueRequestMetaRef.current.delete(requestId);
      }

      const completed = new Set<number>();
      for (const entry of rawPrompts) {
        if (String(entry?.status || '').trim().toLowerCase() === 'completed') {
          const completedIndex = Math.max(0, Math.floor(Number(entry?.promptIndex) || 0));
          completed.add(completedIndex);
        }
      }
      if (completed.size > 0) completedPromptIndicesRef.current.set(requestId, completed);
      else if (terminalBackendIds.has(requestId)) completedPromptIndicesRef.current.delete(requestId);
      if (terminalBackendIds.has(requestId) && requestStatus === 'completed' && prompts.length > 0) {
        completedPromptIndicesRef.current.set(requestId, new Set(prompts.map((_, index) => index)));
      }

      for (const entry of visibleBackendPrompts) {
        const promptIndex = Math.max(0, Math.floor(Number(entry?.promptIndex) || 0));
        const status = String(entry?.status || 'pending').trim().toLowerCase();
        const localStatus: QueueStackItem['status'] = status === 'running' || status === 'submitting'
          ? 'running'
          : 'pending';
        backendStackItems.push({
          id: `${requestId}:${promptIndex}`,
          requestId,
          promptIndex,
          prompt: String(entry?.prompt || ''),
          styleName: String(entry?.styleName || '').trim() || undefined,
          styleFolderName: String(entry?.outputSubfolder || '').trim() || undefined,
          status: localStatus,
          createdAt: Math.max(0, Math.floor(Number(rawRequest?.createdAt) || now)),
          exiting: false,
        });
      }

      if (!nextVisual && activeBackendIds.has(requestId) && prompts.length > 0) {
        const activeIndexRaw = Number(rawRequest?.activeIndex ?? snapshot?.activePromptIndex ?? 0);
        const activeIndex = Math.max(0, Math.min(prompts.length - 1, Math.floor(Number.isFinite(activeIndexRaw) ? activeIndexRaw : 0)));
        nextVisual = {
          requestId,
          mode: String(rawRequest?.mode || 'selected') as PowerPrompterQueueMode,
          activeSetId: clampQueueSetId(promptSetIds[activeIndex] ?? rawRequest?.activeSetId ?? 1),
          prompts,
          promptIds: rawPrompts.map((entry: any) => String(entry?.promptId || '').trim()),
          promptSeeds: rawPrompts.map((entry: any) => Math.max(0, Math.floor(Number(entry?.seed) || 0))),
          activeIndex,
          jobProgress: 0,
          updatedAt: now,
        };
      }
    }

    if (terminalBackendIds.size > 0) {
      for (const requestId of terminalBackendIds) {
        queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
        pruneBridgeQueueStateRequestIds([requestId]);
      }
    }

    backendQueueSnapshotRequestIdsRef.current = activeBackendIds;
    const hasLiveBackendSnapshotWork = activeBackendIds.size > 0 || backendStackItems.length > 0;
    backendQueueSnapshotActiveUntilRef.current = hasLiveBackendSnapshotWork
      ? Date.now() + 60000
      : 0;
    const hasPendingBackendPrompt = rawRequests.some((request: any) =>
      (Array.isArray(request?.prompts) ? request.prompts : []).some((entry: any) =>
        String(entry?.status || 'pending').trim().toLowerCase() === 'pending'
      )
    );
    const hasRunningBackendPrompt = rawRequests.some((request: any) =>
      (Array.isArray(request?.prompts) ? request.prompts : []).some((entry: any) => {
        const status = String(entry?.status || 'pending').trim().toLowerCase();
        return status === 'submitting' || status === 'running';
      })
    );
    const backendQueueIsWaitingBetweenPrompts = activeBackendIds.size > 0
      && hasPendingBackendPrompt
      && !hasRunningBackendPrompt;
    if (!hasPendingBackendPrompt && activeBackendIds.size <= 0) {
      backendQueuePauseRequestedRef.current = false;
    }
    const backendRequestOrder = rawRequests
      .map((request: any) => normalizeRequestId(request?.requestId))
      .filter(Boolean);
    const staleBackendDrivenRequestIds = getStaleBackendDrivenRequestIds({
      backendRequestIds: backendRequestOrder,
      localStackItems: queueStackItemsRef.current,
      visualRequestId: queueVisualStateRef.current?.requestId || '',
      isStagedRequestId: isLocalStagedQueueRequestId,
    });
    const staleInvisibleBackendRequestIds = !hasLiveBackendSnapshotWork && rawRequests.length <= 0
      ? Array.from(new Set([
        ...Array.from(queueRequestMetaRef.current.keys()),
        ...Array.from(completedPromptIndicesRef.current.keys()),
        ...Array.from(queueBridgeDispatchedRequestIdsRef.current),
      ]))
        .map((requestId) => normalizeRequestId(requestId))
        .filter((requestId) => (
          !!requestId
          && !isLocalStagedQueueRequestId(requestId)
          && !pendingQueueRequestsRef.current.has(requestId)
        ))
      : [];
    const staleLocalMetadataRequestIds = rawRequests.length > 0
      ? Array.from(new Set([
        ...Array.from(queueRequestMetaRef.current.keys()),
        ...Array.from(completedPromptIndicesRef.current.keys()),
        ...Array.from(queueBridgeDispatchedRequestIdsRef.current),
      ]))
        .map((requestId) => normalizeRequestId(requestId))
        .filter((requestId) => (
          !!requestId
          && !backendRequestOrder.includes(requestId)
          && !pendingQueueRequestsRef.current.has(requestId)
        ))
      : [];
    const prunedBackendRequestIds = Array.from(new Set([
      ...staleBackendDrivenRequestIds,
      ...staleInvisibleBackendRequestIds,
      ...staleLocalMetadataRequestIds,
    ]));
    if (prunedBackendRequestIds.length > 0) {
      for (const requestId of prunedBackendRequestIds) {
        queueRequestMetaRef.current.delete(requestId);
        completedPromptIndicesRef.current.delete(requestId);
        queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
        intentionallyCanceledQueueRequestIdsRef.current.delete(requestId);
        clearedQueueRequestIdsRef.current.delete(requestId);
      }
      pruneBridgeQueueStateRequestIds(prunedBackendRequestIds);
    }
    const nextQueueStackItems = applyQueueStackRunningState(
      applyQueueRequestOrderToStackItems(backendStackItems, backendRequestOrder)
    );
    const nextQueuePaused = snapshot?.paused === true
      || (backendQueuePauseRequestedRef.current && hasPendingBackendPrompt)
      || backendQueueIsWaitingBetweenPrompts;
    updateQueueStackItemsSynced(nextQueueStackItems);
    setQueuePaused(nextQueuePaused);
    setQueueVisualState(nextVisual);
    logQueueDebug('ws:queue_snapshot:applied', {
      activeRequestIds: Array.from(activeBackendIds),
      terminalRequestIds: Array.from(terminalBackendIds),
      stackItems: backendStackItems.length,
      requestOrder: backendRequestOrder,
      staleRequestIdsPruned: prunedBackendRequestIds,
      version: snapshot?.version,
      reason: snapshot?.reason,
      authoritative: hasLiveBackendSnapshotWork || backendQueuePauseRequestedRef.current,
    });
  };

  const sendPrompterWsMessage = (payload: unknown): boolean => {
    const ws = prompterWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  const buildPrompterSyncState = () => {
    const file = currentFileRef.current;
    const joinedPrompt = composeActivePromptFromCards(
      cardDocumentRef.current.cards,
      cardDocumentRef.current.activeQueueSet
    ).trim();
    const generation = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
    const pipeline = normalizeUmbraUiPipelineSelection(cardDocumentRef.current.pipeline, {
      feature: 'txt2img',
      modelFamily: cardDocumentRef.current.modelType,
      modelSource: generation.modelType,
    });
    return {
      file,
      sourceFile: normalizePrompterSourceFilePath(file),
      prompts: joinedPrompt ? [joinedPrompt] : [],
      activePrompt: joinedPrompt,
      joinedPrompt,
      activeQueueSet: clampQueueSetId(cardDocumentRef.current.activeQueueSet),
      generation,
      styleSeedMode: String((cardDocumentRef.current as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same',
      editorMode: 'cards',
      pipeline,
      modelFamily: pipeline.modelFamily,
      umbraUiFeature: pipeline.feature,
    };
  };

  const sendPrompterSync = () => {
    if (!prompterWsReadyRef.current) return;
    const state = buildPrompterSyncState();
    sendPrompterWsMessage({
      type: 'prompter_sync',
      state,
    });
  };

  const schedulePrompterSync = () => {
    clearSyncSendTimer();
    syncSendTimerRef.current = setTimeout(() => {
      syncSendTimerRef.current = null;
      sendPrompterSync();
    }, 120);
  };

  const requestQueueThroughWebSocket = async (
    mode: PowerPrompterQueueMode,
    prompts: string[],
    stateOverride?: Partial<ReturnType<typeof buildPrompterSyncState>> & {
      generationByPrompt?: unknown[];
      promptSetIds?: unknown[];
      promptOutputSubfolders?: unknown[];
      promptStyleNames?: unknown[];
      promptSeedGroupIds?: unknown[];
      styleSeedMode?: unknown;
    },
    requestIdOverride?: string,
    targetBridgeIdOverride?: string,
    queueTargetTypeOverride?: PowerPrompterQueueTargetType
  ): Promise<any> => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Power Prompter websocket is not connected yet.'));
    }

    const cleanedPrompts = prompts.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0);
    if (cleanedPrompts.length === 0) {
      return Promise.reject(new Error('No prompts are available to queue.'));
    }
    const queueTargetType = normalizeQueueTargetType(queueTargetTypeOverride || 'pipeline');

    const requestId = String(requestIdOverride || createRequestId());
    const fallbackSetId = clampQueueSetId(
      stateOverride?.activeQueueSet
      ?? (stateOverride as any)?.activeSetId
      ?? cardDocumentRef.current.activeQueueSet
    );
    const normalizedGeneration = normalizePowerPrompterGenerationControls(
      (stateOverride as any)?.generation ?? cardDocumentRef.current.generation
    );
    const pipeline = normalizeUmbraUiPipelineSelection(
      (stateOverride as any)?.pipeline ?? cardDocumentRef.current.pipeline,
      {
        feature: 'txt2img',
        modelFamily: (stateOverride as any)?.modelFamily ?? cardDocumentRef.current.modelType,
        modelSource: normalizedGeneration.modelType,
      },
    );
    const targetBridgeId = createUmbraUiPipelineTargetId(pipeline);
    if (!targetBridgeId) {
      return Promise.reject(new Error('Choose a model family pipeline before queueing.'));
    }
    const rawGenerationByPrompt = Array.isArray(stateOverride?.generationByPrompt)
      ? stateOverride.generationByPrompt
      : [];
    const normalizedGenerationByPrompt = cleanedPrompts.map((_, index) =>
      normalizePowerPrompterGenerationControls(rawGenerationByPrompt[index] ?? normalizedGeneration)
    );
    const rawPromptSetIds = Array.isArray(stateOverride?.promptSetIds)
      ? stateOverride.promptSetIds
      : [];
    const normalizedPromptSetIds = cleanedPrompts.map((_, index) =>
      clampQueueSetId(rawPromptSetIds[index] ?? fallbackSetId)
    );
    const rawPromptOutputSubfolders = Array.isArray(stateOverride?.promptOutputSubfolders)
      ? stateOverride.promptOutputSubfolders
      : [];
    const normalizedPromptOutputSubfolders = cleanedPrompts.map((_, index) =>
      String(rawPromptOutputSubfolders[index] || '').trim()
    );
    const rawPromptStyleNames = Array.isArray(stateOverride?.promptStyleNames)
      ? stateOverride.promptStyleNames
      : [];
    const normalizedPromptStyleNames = cleanedPrompts.map((_, index) =>
      String(rawPromptStyleNames[index] || '').trim()
    );
    const rawPromptSeedGroupIds = Array.isArray(stateOverride?.promptSeedGroupIds)
      ? stateOverride.promptSeedGroupIds
      : [];
    const normalizedPromptSeedGroupIds = cleanedPrompts.map((_, index) =>
      String(rawPromptSeedGroupIds[index] || `${normalizedPromptSetIds[index]}:${index}`).trim()
    );
    const normalizedStyleSeedMode = String(
      (stateOverride as any)?.styleSeedMode
      ?? (cardDocumentRef.current as any).styleSeedMode
      ?? 'same'
    ) === 'different' ? 'different' : 'same';
    const state = {
      ...buildPrompterSyncState(),
      ...(stateOverride || {}),
      sourceFile: normalizePrompterSourceFilePath(stateOverride?.sourceFile || currentFileRef.current || ''),
      activePrompt: normalizePowerPrompterPromptText(String(stateOverride?.activePrompt || cleanedPrompts[0] || '')),
      prompts: cleanedPrompts,
      joinedPrompt: normalizePowerPrompterPromptText(String(stateOverride?.joinedPrompt || cleanedPrompts.join(', '))),
      activeQueueSet: fallbackSetId,
      activeSetId: fallbackSetId,
      generation: normalizedGeneration,
      pipeline,
      modelFamily: pipeline.modelFamily,
      umbraUiFeature: pipeline.feature,
      generationByPrompt: normalizedGenerationByPrompt,
      promptSetIds: normalizedPromptSetIds,
      promptOutputSubfolders: normalizedPromptOutputSubfolders,
      promptStyleNames: normalizedPromptStyleNames,
      promptSeedGroupIds: normalizedPromptSeedGroupIds,
      styleSeedMode: normalizedStyleSeedMode,
    };
    logPowerPrompterDebug('queue:websocket:requestPrepared', {
      requestId,
      mode,
      promptCount: cleanedPrompts.length,
      targetBridgeId,
      queueTargetType,
      pipeline,
      activeSetId: fallbackSetId,
      setIds: Array.from(new Set(normalizedPromptSetIds)).sort((a, b) => a - b),
      outputFolderCount: Array.from(new Set(normalizedPromptOutputSubfolders.filter(Boolean))).length,
      styleNameCount: Array.from(new Set(normalizedPromptStyleNames.filter(Boolean))).length,
      seedGroupCount: Array.from(new Set(normalizedPromptSeedGroupIds.filter(Boolean))).length,
      generationCount: normalizedGenerationByPrompt.length,
      firstSeed: normalizedGenerationByPrompt[0]?.seed ?? null,
      lastSeed: normalizedGenerationByPrompt[normalizedGenerationByPrompt.length - 1]?.seed ?? null,
    }, { includeQueue: true });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        logPowerPrompterDebug('queue:websocket:requestTimeout', {
          requestId,
          mode,
          promptCount: cleanedPrompts.length,
          targetBridgeId,
          queueTargetType,
          pipeline,
        }, { includeQueue: true });
        const pending = pendingQueueRequestsRef.current.get(requestId);
        if (pending) {
          failTrackedQueueRequest(requestId, 'Queue request timed out.', pending);
        } else {
          reject(new Error('Queue request timed out.'));
        }
      }, PROMPTER_QUEUE_TIMEOUT_MS);

      pendingQueueRequestsRef.current.set(requestId, { resolve, reject, timer });
      const sent = sendPrompterWsMessage({
        type: 'queue_request',
        requestId,
        targetBridgeId,
        queueTargetType,
        mode,
        prompts: cleanedPrompts,
        state,
      });
      logPowerPrompterDebug(sent ? 'queue:websocket:sent' : 'queue:websocket:sendFailed', {
        requestId,
        mode,
        promptCount: cleanedPrompts.length,
        targetBridgeId,
        queueTargetType,
        pipeline,
      }, { includeQueue: true });
      if (!sent) {
        clearTimeout(timer);
        pendingQueueRequestsRef.current.delete(requestId);
        reject(new Error('Failed to submit queue request.'));
      }
    });
  };

  const buildQueueWebSocketStateFromMeta = (meta: QueueRequestMeta) => {
    const cleanedPrompts = meta.prompts.map((entry) => String(entry || '').trim()).filter(Boolean);
    const groupGeneration = normalizePowerPrompterGenerationControls(meta.generationByPrompt[0] ?? cardDocumentRef.current.generation);
    const sourceDocument = meta.editorSnapshot?.document || cardDocumentRef.current;
    const pipeline = normalizeUmbraUiPipelineSelection(sourceDocument.pipeline, {
      feature: 'txt2img',
      modelFamily: sourceDocument.modelType,
      modelSource: groupGeneration.modelType,
    });
    return {
      activePrompt: normalizePowerPrompterPromptText(cleanedPrompts[0] || ''),
      sourceFile: normalizePrompterSourceFilePath(meta.editorSnapshot?.sourceFile || currentFileRef.current || ''),
      prompts: cleanedPrompts,
      joinedPrompt: normalizePowerPrompterPromptText(cleanedPrompts.join(', ')),
      activeQueueSet: clampQueueSetId(meta.promptSetIds[0] ?? meta.setId),
      activeSetId: clampQueueSetId(meta.promptSetIds[0] ?? meta.setId),
      generation: groupGeneration,
      generationByPrompt: cleanedPrompts.map((_, index) =>
        normalizePowerPrompterGenerationControls(meta.generationByPrompt[index] ?? groupGeneration)
      ),
      promptSetIds: cleanedPrompts.map((_, index) => clampQueueSetId(meta.promptSetIds[index] ?? meta.setId)),
      promptOutputSubfolders: cleanedPrompts.map((_, index) => String(meta.promptOutputSubfolders[index] || '').trim()),
      promptStyleNames: cleanedPrompts.map((_, index) => String(meta.promptStyleNames[index] || '').trim()),
      promptSeedGroupIds: cleanedPrompts.map((_, index) => String(meta.promptSeedGroupIds[index] || `${meta.setId}:${index}`).trim()),
      styleSeedMode: String((cardDocumentRef.current as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same',
      pipeline,
      modelFamily: pipeline.modelFamily,
      umbraUiFeature: 'txt2img' as const,
    };
  };

  const requestQueueBatchThroughWebSocket = async (requestIdsInput: unknown[]): Promise<any> => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Power Prompter websocket is not connected yet.'));
    }
    const requestIds = requestIdsInput
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (requestIds.length <= 0) {
      return Promise.reject(new Error('No queue groups are available to start.'));
    }

    const firstMeta = queueRequestMetaRef.current.get(requestIds[0]);
    if (!firstMeta) {
      return Promise.reject(new Error('The queued groups are missing queue metadata.'));
    }
    const queueTargetType = normalizeQueueTargetType(firstMeta.queueTargetType || 'pipeline');
    const firstState = buildQueueWebSocketStateFromMeta(firstMeta);
    const targetBridgeId = createUmbraUiPipelineTargetId(firstState.pipeline);
    if (!targetBridgeId) {
      return Promise.reject(new Error('Choose a model family pipeline before queueing.'));
    }

    const groups = requestIds.map((requestId) => {
      const meta = queueRequestMetaRef.current.get(requestId);
      if (!meta) return null;
      const prompts = meta.prompts.map((entry) => String(entry || '').trim()).filter(Boolean);
      if (prompts.length <= 0) return null;
      return {
        requestId,
        mode: meta.mode,
        prompts,
        state: buildQueueWebSocketStateFromMeta(meta),
      };
    }).filter(Boolean);
    if (groups.length <= 0) {
      return Promise.reject(new Error('No queue groups are available to start.'));
    }

    const batchRequestId = createRequestId();
    logPowerPrompterDebug('queue:websocket:batchPrepared', {
      requestId: batchRequestId,
      groupCount: groups.length,
      promptCount: groups.reduce((total, group: any) => total + group.prompts.length, 0),
      targetBridgeId,
      queueTargetType,
      pipeline: firstState.pipeline,
    }, { includeQueue: true });

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        logPowerPrompterDebug('queue:websocket:batchTimeout', {
          requestId: batchRequestId,
          groupCount: groups.length,
        }, { includeQueue: true });
        const pending = pendingQueueRequestsRef.current.get(batchRequestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingQueueRequestsRef.current.delete(batchRequestId);
          pending.reject(new Error('Queue batch request timed out.'));
        } else {
          reject(new Error('Queue batch request timed out.'));
        }
      }, PROMPTER_QUEUE_TIMEOUT_MS);

      pendingQueueRequestsRef.current.set(batchRequestId, { resolve, reject, timer });
      const sent = sendPrompterWsMessage({
        type: 'queue_batch_request',
        requestId: batchRequestId,
        targetBridgeId,
        queueTargetType,
        groups,
      });
      logPowerPrompterDebug(sent ? 'queue:websocket:batchSent' : 'queue:websocket:batchSendFailed', {
        requestId: batchRequestId,
        groupCount: groups.length,
        targetBridgeId,
        queueTargetType,
        pipeline: firstState.pipeline,
      }, { includeQueue: true });
      if (!sent) {
        clearTimeout(timer);
        pendingQueueRequestsRef.current.delete(batchRequestId);
        reject(new Error('Failed to submit queue batch request.'));
      }
    });
  };

  const hasActiveQueueBridgeDispatch = (exceptRequestIdInput?: unknown) => {
    const exceptRequestId = String(exceptRequestIdInput || '').trim();
    for (const requestId of queueBridgeDispatchedRequestIdsRef.current) {
      const normalizedRequestId = String(requestId || '').trim();
      if (!normalizedRequestId || normalizedRequestId === exceptRequestId) continue;
      if (queueRequestMetaRef.current.has(normalizedRequestId)) return true;
    }
    for (const requestId of pendingQueueRequestsRef.current.keys()) {
      const normalizedRequestId = String(requestId || '').trim();
      if (!normalizedRequestId || normalizedRequestId === exceptRequestId) continue;
      if (queueRequestMetaRef.current.has(normalizedRequestId)) return true;
    }
    const bridgeRequestIds = [
      ...bridgeQueueStateRef.current.activeRequestIds,
      ...bridgeQueueStateRef.current.pendingRequestIds,
    ];
    return bridgeRequestIds.some((requestId) => {
      const normalizedRequestId = String(requestId || '').trim();
      return !!normalizedRequestId
        && normalizedRequestId !== exceptRequestId
        && queueRequestMetaRef.current.has(normalizedRequestId);
    });
  };

  const isQueueGroupSubmittedToBridge = (requestIdInput: unknown) => {
    const requestId = String(requestIdInput || '').trim();
    return !!requestId
      && (
        queueBridgeDispatchedRequestIdsRef.current.has(requestId)
        || pendingQueueRequestsRef.current.has(requestId)
      );
  };

  const dispatchTrackedQueueGroupToBridge = async (
    requestIdInput: unknown,
    reason?: string,
    options?: {
      allowBridgeBacklog?: boolean;
    }
  ) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return false;
    const meta = queueRequestMetaRef.current.get(requestId);
    if (!meta || !Array.isArray(meta.prompts) || meta.prompts.length <= 0) {
      logPowerPrompterDebug('queue:dispatchGroup:skippedMissingMeta', { requestId, reason: reason || '' }, { includeQueue: true });
      return false;
    }
    if (queueBridgeDispatchedRequestIdsRef.current.has(requestId) || pendingQueueRequestsRef.current.has(requestId)) {
      logPowerPrompterDebug('queue:dispatchGroup:skippedAlreadyDispatched', { requestId, reason: reason || '' }, { includeQueue: true });
      return false;
    }
    if (options?.allowBridgeBacklog !== true && hasActiveQueueBridgeDispatch(requestId)) {
      logPowerPrompterDebug('queue:dispatchGroup:blockedActiveBridgeDispatch', { requestId, reason: reason || '' }, { includeQueue: true });
      return false;
    }

    queueBridgeDispatchedRequestIdsRef.current.add(requestId);
    const groupGeneration = normalizePowerPrompterGenerationControls(meta.generationByPrompt[0] ?? cardDocumentRef.current.generation);
    logPowerPrompterDebug('queue:dispatchGroup:start', {
      requestId,
      reason: reason || '',
      allowBridgeBacklog: options?.allowBridgeBacklog === true,
      promptCount: meta.prompts.length,
      setIds: Array.from(new Set(meta.promptSetIds)).sort((a, b) => a - b),
      seedGroupCount: Array.from(new Set(meta.promptSeedGroupIds)).length,
      firstSeed: meta.generationByPrompt[0]?.seed ?? null,
      lastSeed: meta.generationByPrompt[meta.generationByPrompt.length - 1]?.seed ?? null,
    }, { includeQueue: true });
    try {
      await createQueueHistoryEntryForRequest(requestId);
      const result = await requestQueueThroughWebSocket(meta.mode, meta.prompts, {
        activePrompt: normalizePowerPrompterPromptText(meta.prompts[0] || ''),
        sourceFile: normalizePrompterSourceFilePath(meta.editorSnapshot?.sourceFile || currentFileRef.current || ''),
        prompts: meta.prompts,
        joinedPrompt: normalizePowerPrompterPromptText(meta.prompts.join(', ')),
        generation: groupGeneration,
        generationByPrompt: meta.generationByPrompt,
        promptSetIds: meta.promptSetIds,
        promptOutputSubfolders: meta.promptOutputSubfolders,
        promptStyleNames: meta.promptStyleNames,
        promptSeedGroupIds: meta.promptSeedGroupIds,
      }, requestId, meta.targetBridgeId, meta.queueTargetType);
      logPowerPrompterDebug('queue:dispatchGroup:accepted', {
        requestId,
        queued: Number(result?.queued ?? meta.prompts.length),
        total: Number(result?.total ?? meta.prompts.length),
      }, { includeQueue: true });
      return true;
    } catch (error: any) {
      queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
      logPowerPrompterDebug('queue:dispatchGroup:error', {
        requestId,
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      throw error;
    }
  };

  const handleRequeueQueueHistory = useCallback(async (idInput?: string, options?: { resumeRemaining?: boolean }) => {
    if (queueHistoryBusy) return;
    setQueueHistoryBusy('requeue');
    try {
      const document = await loadQueueHistoryDocument(idInput);
      if (!document) return;
      const snapshot = document.snapshot;
      const prompts = Array.isArray(snapshot.prompts)
        ? snapshot.prompts.map((entry) => normalizePowerPrompterPromptText(String(entry || '').trim())).filter(Boolean)
        : [];
      if (prompts.length <= 0) throw new Error('Queue history has no prompts to requeue.');

      const terminalCount = Math.max(0, Math.min(
        prompts.length,
        Math.floor(Number(document.completed || 0))
          + Math.floor(Number(document.failed || 0))
          + Math.floor(Number(document.canceled || 0))
      ));
      const shouldResumeRemaining = options?.resumeRemaining === true
        || (document.status !== 'completed' && terminalCount > 0 && terminalCount < prompts.length);
      const startIndex = shouldResumeRemaining ? terminalCount : 0;
      const remainingPrompts = prompts.slice(startIndex);
      if (remainingPrompts.length <= 0) {
        throw new Error('This history entry has no remaining prompts. Use Requeue All to run it again.');
      }

      const requestId = createRequestId();
      const activeSetId = clampQueueSetId(snapshot.promptSetIds?.[startIndex] ?? snapshot.activeSetId ?? document.activeSetId);
      const resolvedQueueTarget = resolveQueueControlTarget(snapshot.targetBridgeId, snapshot.queueTargetType);
      const groupGeneration = normalizePowerPrompterGenerationControls(
        snapshot.generationByPrompt?.[startIndex] ?? snapshot.generation
      );
      const promptSetIds = remainingPrompts.map((_, index) =>
        clampQueueSetId(snapshot.promptSetIds?.[startIndex + index] ?? activeSetId)
      );
      const promptOutputSubfolders = remainingPrompts.map((_, index) =>
        String(snapshot.promptOutputSubfolders?.[startIndex + index] || '').trim()
      );
      const promptStyleNames = remainingPrompts.map((_, index) =>
        String(snapshot.promptStyleNames?.[startIndex + index] || '').trim()
      );
      const promptSeedGroupIds = remainingPrompts.map((_, index) =>
        String(snapshot.promptSeedGroupIds?.[startIndex + index] || `${promptSetIds[index]}:${index}`).trim()
      );
      const generationByPrompt = remainingPrompts.map((_, index) =>
        normalizePowerPrompterGenerationControls(snapshot.generationByPrompt?.[startIndex + index] ?? groupGeneration)
      );
      const promptEntries = snapshot.promptEntries
        ? remainingPrompts.map((prompt, index) => snapshot.promptEntries?.[startIndex + index] || { prompt, tokens: [] })
        : undefined;
      const editorSnapshot = resolveQueueHistoryEditorSnapshot(document)?.editorSnapshot;

      queueRequestMetaRef.current.set(requestId, {
        mode: snapshot.mode || document.mode || 'selected',
        setId: activeSetId,
        randomApplied: snapshot.randomApplied === true,
        queueTargetType: resolvedQueueTarget.queueTargetType,
        targetBridgeId: resolvedQueueTarget.targetBridgeId,
        dispatchDelayMs: snapshot.dispatchDelayMs ?? queueDispatchDelayMsRef.current,
        prompts: remainingPrompts,
        ...(promptEntries ? { promptEntries } : {}),
        promptSetIds,
        promptOutputSubfolders,
        promptStyleNames,
        promptSeedGroupIds,
        generationByPrompt,
        editorSnapshot,
      });
      const createdAt = Date.now();
      const stackItems = remainingPrompts.map((prompt, promptIndex) => ({
        id: `${requestId}-${promptIndex}-${prompt.slice(0, 24)}`,
        requestId,
        promptIndex,
        prompt,
        styleName: promptStyleNames[promptIndex],
        styleFolderName: promptOutputSubfolders[promptIndex],
        status: 'pending' as const,
        createdAt: createdAt + promptIndex,
        exiting: false,
      }));
      updateQueueStackItemsSynced(applyQueueStackRunningState([
        ...queueStackItemsRef.current,
        ...stackItems,
      ]));
      setQueuePaused(false);
      setQueueVisualState((prev) => prev || {
        requestId,
        mode: snapshot.mode || document.mode || 'selected',
        activeSetId,
        prompts: remainingPrompts,
        ...(promptEntries ? { promptEntries } : {}),
        promptIds: remainingPrompts.map(() => ''),
        promptSeeds: generationByPrompt.map((entry) => Math.max(0, Math.floor(Number(entry.seed) || 0))),
        activeIndex: 0,
        jobProgress: 0,
        updatedAt: Date.now(),
      });

      await dispatchTrackedQueueGroupToBridge(requestId, shouldResumeRemaining ? 'queue history resume remaining' : 'queue history requeue all', {
        allowBridgeBacklog: true,
      });
      setQueueHistoryOpen(false);
      showToast(
        shouldResumeRemaining
          ? `Resumed ${remainingPrompts.length} remaining prompt${remainingPrompts.length === 1 ? '' : 's'} from history`
          : `Requeued ${remainingPrompts.length} prompt${remainingPrompts.length === 1 ? '' : 's'} from history`,
        'success'
      );
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to requeue history'), 'error');
    } finally {
      setQueueHistoryBusy(null);
    }
  }, [
    dispatchTrackedQueueGroupToBridge,
    loadQueueHistoryDocument,
    queueHistoryBusy,
    showToast,
    updateQueueStackItemsSynced,
  ]);

  const dispatchNextStagedQueueGroupIfReady = async (reason: string) => {
    if (queueSequentialDispatchInFlightRef.current) return false;
    if (queuePausedRef.current) {
      logPowerPrompterDebug('queue:dispatchNext:blockedPaused', { reason }, { includeQueue: true });
      return false;
    }
    if (hasActiveQueueBridgeDispatch()) {
      logPowerPrompterDebug('queue:dispatchNext:blockedActiveBridgeDispatch', { reason }, { includeQueue: true });
      return false;
    }
    const orderedPendingRequestIds = queueStackItemsRef.current
      .filter((item) =>
        !item.exiting
        && item.status === 'pending'
        && queueRequestMetaRef.current.has(String(item.requestId || '').trim())
      )
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
        if (a.requestId !== b.requestId) return a.requestId.localeCompare(b.requestId);
        return a.promptIndex - b.promptIndex;
      })
      .map((item) => String(item.requestId || '').trim())
      .filter(Boolean);
    const nextRequestId = orderedPendingRequestIds.find((requestId, index, all) =>
      all.indexOf(requestId) === index
      && !queueBridgeDispatchedRequestIdsRef.current.has(requestId)
      && !pendingQueueRequestsRef.current.has(requestId)
      && !clearedQueueRequestIdsRef.current.has(requestId)
      && !intentionallyCanceledQueueRequestIdsRef.current.has(requestId)
    ) || '';
    if (!nextRequestId) {
      logPowerPrompterDebug('queue:dispatchNext:none', { reason }, { includeQueue: true });
      return false;
    }

    queueSequentialDispatchInFlightRef.current = true;
    try {
      const dispatched = await dispatchTrackedQueueGroupToBridge(nextRequestId, reason);
      logPowerPrompterDebug('queue:dispatchNext:done', { reason, nextRequestId, dispatched }, { includeQueue: true });
      return dispatched;
    } finally {
      queueSequentialDispatchInFlightRef.current = false;
    }
  };

  const requestLoraCatalogThroughWebSocket = (): Promise<string[]> => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Comfy bridge is not connected yet. Open ComfyUI first.'));
    }

    const requestId = createRequestId();
    const targetBridgeId = String(connectedCatalogBridgeTargetId || '').trim();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingLoraCatalogRequestsRef.current.delete(requestId);
        reject(new Error('LoRA catalog request timed out.'));
      }, PROMPTER_LORA_TIMEOUT_MS);

      pendingLoraCatalogRequestsRef.current.set(requestId, { resolve, reject, timer });
      const sent = sendPrompterWsMessage({
        type: 'lora_catalog_request',
        requestId,
        targetBridgeId: targetBridgeId || undefined,
      });
      if (!sent) {
        clearTimeout(timer);
        pendingLoraCatalogRequestsRef.current.delete(requestId);
        reject(new Error('Failed to request LoRA catalog.'));
      }
    });
  };

  const requestLoraInfoThroughWebSocket = (loraName: string, options?: PowerPrompterInfoRequestOptions): Promise<PowerPrompterLoraInfoPayload> => {
    const normalizedName = String(loraName || '').trim();
    const previewOnly = options?.previewOnly === true;
    if (!normalizedName) {
      return Promise.reject(new Error('LoRA name is required.'));
    }
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Comfy bridge is not connected yet. Open ComfyUI first.'));
    }

    const cached = getPrompterCatalogAliasKeys(normalizedName)
      .map((key) => loraInfoCache[key])
      .find(Boolean);
    if (cached) {
      return Promise.resolve(cached);
    }

    const requestId = createRequestId();
    const targetBridgeId = String(connectedCatalogBridgeTargetId || '').trim();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingLoraInfoRequestsRef.current.delete(requestId);
        reject(new Error('LoRA info request timed out.'));
      }, PROMPTER_LORA_TIMEOUT_MS);

      pendingLoraInfoRequestsRef.current.set(requestId, { resolve, reject, timer, previewOnly });
      const sent = sendPrompterWsMessage({
        type: 'lora_info_request',
        requestId,
        loraName: normalizedName,
        previewOnly,
        targetBridgeId: targetBridgeId || undefined,
      });
      if (!sent) {
        clearTimeout(timer);
        pendingLoraInfoRequestsRef.current.delete(requestId);
        reject(new Error('Failed to request LoRA info.'));
      }
    });
  };

  const refreshLoraCatalog = async (showFeedback = false) => {
    try {
      const items = await requestLoraCatalogThroughWebSocket();
      setLoraCatalog(items);
      if (showFeedback) {
        showToast(`Loaded ${items.length} LoRA${items.length === 1 ? '' : 's'}`, 'success');
      }
    } catch (error: any) {
      if (showFeedback) {
        showToast(String(error?.message || 'Failed to load LoRA catalog'), 'error');
      }
    }
  };

  const requestModelCatalogThroughWebSocket = (): Promise<string[]> => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Comfy bridge is not connected yet. Open ComfyUI first.'));
    }

    const requestId = createRequestId();
    const targetBridgeId = String(connectedCatalogBridgeTargetId || '').trim();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingModelCatalogRequestsRef.current.delete(requestId);
        reject(new Error('Model catalog request timed out.'));
      }, PROMPTER_LORA_TIMEOUT_MS);

      pendingModelCatalogRequestsRef.current.set(requestId, { resolve, reject, timer });
      const sent = sendPrompterWsMessage({
        type: 'model_catalog_request',
        requestId,
        targetBridgeId: targetBridgeId || undefined,
      });
      if (!sent) {
        clearTimeout(timer);
        pendingModelCatalogRequestsRef.current.delete(requestId);
        reject(new Error('Failed to request model catalog.'));
      }
    });
  };

  const requestModelInfoThroughWebSocket = (modelName: string, options?: PowerPrompterInfoRequestOptions): Promise<PowerPrompterModelInfoPayload> => {
    const normalizedName = String(modelName || '').trim();
    const previewOnly = options?.previewOnly === true;
    if (!normalizedName) {
      return Promise.reject(new Error('Model name is required.'));
    }
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Comfy bridge is not connected yet. Open ComfyUI first.'));
    }

    const cached = getPrompterCatalogAliasKeys(normalizedName)
      .map((key) => modelInfoCache[key])
      .find(Boolean);
    if (cached) {
      return Promise.resolve(cached);
    }

    const requestId = createRequestId();
    const targetBridgeId = String(connectedCatalogBridgeTargetId || '').trim();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingModelInfoRequestsRef.current.delete(requestId);
        reject(new Error('Model info request timed out.'));
      }, PROMPTER_LORA_TIMEOUT_MS);

      pendingModelInfoRequestsRef.current.set(requestId, { resolve, reject, timer, previewOnly });
      const sent = sendPrompterWsMessage({
        type: 'model_info_request',
        requestId,
        modelName: normalizedName,
        previewOnly,
        targetBridgeId: targetBridgeId || undefined,
      });
      if (!sent) {
        clearTimeout(timer);
        pendingModelInfoRequestsRef.current.delete(requestId);
        reject(new Error('Failed to request model info.'));
      }
    });
  };

  const refreshModelCatalog = async (showFeedback = false) => {
    try {
      const items = await requestModelCatalogThroughWebSocket();
      setModelCatalog(items);
      if (showFeedback) {
        showToast(`Loaded ${items.length} model${items.length === 1 ? '' : 's'}`, 'success');
      }
    } catch (error: any) {
      if (showFeedback) {
        showToast(String(error?.message || 'Failed to load model catalog'), 'error');
      }
    }
  };

  const saveSettings = async (newSettings: PowerPrompterSettings) => {
    const merged: PowerPrompterSettings = {
      ...DEFAULT_POWER_PROMPTER_SETTINGS,
      ...newSettings,
      enabledCSVs: enabledCSVs,
      editorMode: 'cards',
    };
    await persistSettings(merged);
  };

  const savePromptFile = async (
    pathToSave: string | null,
    contentToSave: string,
    options?: { source?: 'manual' | 'autosave'; cardDocumentOverride?: PowerPrompterCardDocument | null }
  ): Promise<boolean> => {
    if (!pathToSave) return false;
    const activePresetSession = activePowerPrompterPresetSessionRef.current;
    if (activePresetSession && pathToSave === currentFileRef.current) {
      if ((options?.source || 'manual') === 'manual') {
        showToast('Unload the preset before saving the card file. Preset sessions are temporary.', 'error');
      }
      return false;
    }
    if (autosaveInFlightRef.current) {
      if (options?.source === 'autosave' && currentFileRef.current) {
        hasPendingChangesRef.current = true;
        scheduleAutosaveAfterIdle(250);
      }
      return false;
    }

    const source = options?.source || 'manual';
    const isJsonDoc = String(pathToSave || '').toLowerCase().endsWith('.ppcards.json');
    const cleanContent = stripLegacySelectionMarkers(contentToSave);
    const sourceDoc = options?.cardDocumentOverride ?? cardDocumentRef.current;
    const normalizedDocBase = normalizePowerPrompterCardDocument(
      sourceDoc || importLegacyPromptToCardDocument(cleanContent, pathToSave),
      pathToSave
    );
    const normalizedDoc = {
      ...normalizedDocBase,
      cards: normalizeChainCards(normalizedDocBase.cards),
      updatedAt: new Date().toISOString(),
    };
    const strictPromptText = composeActivePromptFromCards(normalizedDoc.cards, normalizedDoc.activeQueueSet);

    autosaveInFlightRef.current = true;
    try {
      if (!isJsonDoc) {
        const textRes = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathToSave, content: strictPromptText }),
        });
        if (!textRes.ok) {
          throw new Error(`Prompt save failed (${textRes.status})`);
        }
      }

      const sessionPayload = await updatePowerPrompterDocumentSession({
        file: pathToSave,
        document: normalizedDoc,
        clientId: powerPrompterUiClientIdRef.current,
        save: true,
        intent: source === 'autosave' ? 'session-autosave' : 'session-save',
      });
      const savedSession = sessionPayload.session;
      if (!savedSession?.document) {
        throw new Error('Card doc save failed');
      }
      powerPrompterSessionRevisionRef.current = Math.max(powerPrompterSessionRevisionRef.current, savedSession.revision);

      if (pathToSave === currentFileRef.current) {
        const savedDocument = savedSession.document;
        const savedContent = savedSession.composedPrompt || composeActivePromptFromCards(savedDocument.cards, savedDocument.activeQueueSet);
        const signature = getCardDocSignature(savedDocument);
        lastSavedContentRef.current = savedContent;
        lastSavedCardSignatureRef.current = signature;
        const liveDocBase = normalizePowerPrompterCardDocument(cardDocumentRef.current || savedDocument, pathToSave);
        const liveDoc = {
          ...liveDocBase,
          cards: normalizeChainCards(liveDocBase.cards),
        };
        const liveContent = composeActivePromptFromCards(liveDoc.cards, liveDoc.activeQueueSet);
        const liveSignature = getCardDocSignature(liveDoc);
        const liveMatchesSaved = liveContent === savedContent && liveSignature === signature;
        if (liveMatchesSaved) {
          setCardDocument(savedDocument);
          setContent(savedContent);
          cardDocumentRef.current = savedDocument;
          contentRef.current = savedContent;
          hasPendingChangesRef.current = false;
        } else {
          hasPendingChangesRef.current = true;
          scheduleAutosaveAfterIdle();
        }
      }

      autosaveErrorShownRef.current = false;
      if (source === 'manual') {
        showToast('Saved', 'success');
      }
      return true;
    } catch {
      if (source === 'manual') {
        showToast('Failed to save', 'error');
      } else if (!autosaveErrorShownRef.current) {
        autosaveErrorShownRef.current = true;
        showToast('Autosave failed', 'error');
      }
      return false;
    } finally {
      autosaveInFlightRef.current = false;
    }
  };

  const runAutosaveIfNeeded = async () => {
    const file = currentFileRef.current;
    if (!file || !hasPendingChangesRef.current) return;

    const idleForMs = Date.now() - lastEditAtRef.current;
    if (lastEditAtRef.current > 0 && idleForMs < AUTOSAVE_IDLE_MS) {
      clearAutosaveTimer();
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void runAutosaveIfNeeded();
      }, AUTOSAVE_IDLE_MS - idleForMs);
      return;
    }

    await savePromptFile(file, contentRef.current, { source: 'autosave' });
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/powerprompter/settings');
        if (!res.ok) return;
        const rawSettings = await res.json();
        const normalized = { ...normalizePowerPrompterSettings(rawSettings), editorMode: 'cards' as const };
        setSettings(normalized);
        setEnabledCSVs(Array.isArray(rawSettings?.enabledCSVs) ? rawSettings.enabledCSVs : normalized.enabledCSVs);

        if (
          normalized.editorMode !== rawSettings?.editorMode
          || normalized.queueTraversalMode !== rawSettings?.queueTraversalMode
          || normalized.queueDiversity !== rawSettings?.queueDiversity
          || normalized.queuePromptLimit !== rawSettings?.queuePromptLimit
          || normalized.generationCompleteSoundEnabled !== rawSettings?.generationCompleteSoundEnabled
          || normalized.generationCompleteSoundStyle !== rawSettings?.generationCompleteSoundStyle
        ) {
          void persistSettings(normalized, { silent: true, broadcast: false });
        }
      } catch (error) {
        console.error('Failed to load power prompter settings', error);
      }
    };
    void loadSettings();
  }, []);

  const loadPowerPrompterPresets = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) setPowerPrompterPresetBusy('refresh');
    try {
      const activeFilePath = normalizePowerPrompterPresetSourceFilePath(currentFileRef.current || '');
      const activeFileKey = normalizePowerPrompterPresetSourceFileKey(activeFilePath);
      const rawStore = await readUserConfig<PowerPrompterPresetStore>('powerprompter-presets', {
        version: 1,
        selectedPresetId: '',
        selectedPresetIdByFile: {},
        presets: [],
      });
      const hadLegacyPresets = activeFileKey
        && Array.isArray(rawStore?.presets)
        && rawStore.presets.some((preset) => {
          const entry = preset as Partial<PowerPrompterPresetDocument> | null | undefined;
          return !normalizePowerPrompterPresetSourceFileKey(entry?.sourceFileKey || entry?.sourceFilePath || '');
        });
      const store = normalizePowerPrompterPresetStore(rawStore, {
        activeFilePath,
        assignLegacyToActiveFile: Boolean(activeFileKey),
      });
      if (hadLegacyPresets) {
        await writeUserConfig('powerprompter-presets', store);
      }
      const scopedPresets = activeFileKey
        ? store.presets.filter((preset) => preset.sourceFileKey === activeFileKey)
        : [];
      const selectedId = scopedPresets.some((preset) => preset.id === store.selectedPresetId)
        ? store.selectedPresetId || ''
        : (scopedPresets[0]?.id || '');
      setPowerPrompterPresets(scopedPresets);
      setSelectedPowerPrompterPresetId(selectedId);
      const selected = scopedPresets.find((preset) => preset.id === selectedId) || scopedPresets[0] || null;
      if (selected) {
        setPowerPrompterPresetNameDraft(selected.name);
      } else {
        setPowerPrompterPresetNameDraft('');
      }
    } catch (error) {
      console.error('Failed to load Power Prompter presets', error);
      if (!options?.quiet) showToast('Failed to load presets', 'error');
    } finally {
      if (!options?.quiet) setPowerPrompterPresetBusy(null);
    }
  }, [showToast]);

  const persistPowerPrompterPresets = useCallback(async (
    nextPresets: PowerPrompterPresetDocument[],
    nextSelectedPresetId: string,
  ) => {
    const activeFilePath = normalizePowerPrompterPresetSourceFilePath(currentFileRef.current || '');
    const activeFileKey = normalizePowerPrompterPresetSourceFileKey(activeFilePath);
    if (!activeFileKey) {
      throw new Error('Open or create a card file before saving presets');
    }
    const existingRawStore = await readUserConfig<PowerPrompterPresetStore>('powerprompter-presets', {
      version: 1,
      selectedPresetId: '',
      selectedPresetIdByFile: {},
      presets: [],
    });
    const existingStore = normalizePowerPrompterPresetStore(existingRawStore, {
      activeFilePath,
      assignLegacyToActiveFile: false,
    });
    const scopedPresets = nextPresets.map((preset) => ({
      ...preset,
      sourceFilePath: activeFilePath,
      sourceFileKey: activeFileKey,
    }));
    const normalizedStore = normalizePowerPrompterPresetStore({
      version: 1,
      selectedPresetId: nextSelectedPresetId,
      selectedPresetIdByFile: {
        ...(existingStore.selectedPresetIdByFile || {}),
        [activeFileKey]: nextSelectedPresetId,
      },
      presets: [
        ...scopedPresets,
        ...existingStore.presets.filter((preset) => preset.sourceFileKey !== activeFileKey),
      ],
    }, { activeFilePath });
    const normalizedScopedPresets = normalizedStore.presets.filter((preset) => preset.sourceFileKey === activeFileKey);
    const selectedId = normalizedScopedPresets.some((preset) => preset.id === normalizedStore.selectedPresetId)
      ? normalizedStore.selectedPresetId || ''
      : (normalizedScopedPresets[0]?.id || '');
    setPowerPrompterPresets(normalizedScopedPresets);
    setSelectedPowerPrompterPresetId(selectedId);
    await writeUserConfig('powerprompter-presets', normalizedStore);
  }, []);

  useEffect(() => {
    void loadPowerPrompterPresets({ quiet: true });
  }, [currentFile, loadPowerPrompterPresets]);

  useEffect(() => {
    void readUserConfig<PowerPrompterUiPreferences>('powerprompter-ui', {})
      .then((preferences) => {
        powerPrompterUiSessionUpdatedAtRef.current = getPowerPrompterUiPreferenceUpdatedAt(preferences);
        powerPrompterUiSuppressPersistUntilRef.current = Date.now() + 1000;
        const next = String(preferences?.selectedBridgeId || '').trim();
        if (parseApiWorkflowTargetId(next)) setSelectedBridgeId(next);
        setQueueManagerPreviewSplit(normalizeQueueManagerPreviewSplit(preferences?.queueManagerPreviewSplit));
        setLeftPanelCollapsed(isPhoneRemote ? preferences?.leftPanelCollapsed !== false : true);
        setRightPanelCollapsed(isPhoneRemote ? preferences?.rightPanelCollapsed !== false : true);
        if (Number.isFinite(Number(preferences?.activeQueueSet))) {
          setQueueSetTarget(clampQueueSetId(preferences?.activeQueueSet));
        }
        setQueueManagerSearchQuery(normalizePowerPrompterUiSearchValue(preferences?.queueManagerSearchQuery));
        setQueueManagerStyleFilter(normalizePowerPrompterUiSearchValue(preferences?.queueManagerStyleFilter));
        setQueueManagerSequenceMode(normalizeQueueManagerSequencePreference(preferences?.queueManagerSequenceMode));
        setQueuePromptExpandedMode(preferences?.queuePromptExpandedMode === true);
        if (preferences?.generationPreviewHoldMs !== undefined) {
          const nextHoldMs = preferences.generationPreviewHoldMs === null
            ? null
            : Math.max(0, Math.min(60000, Math.floor(Number(preferences.generationPreviewHoldMs) || PREVIEW_CARD_HIDE_DELAY_MS)));
          generationPreviewHoldMsRef.current = nextHoldMs;
          setGenerationPreviewHoldMs(nextHoldMs);
        }
        setGlobalSearchQuery(normalizePowerPrompterUiSearchValue(preferences?.globalSearchQuery));
        const nextPanelMode = preferences?.panelMode;
        if (
          (nextPanelMode === 'editor' || nextPanelMode === 'queue-manager' || nextPanelMode === 'queue-editor')
          && !shouldIgnoreIncomingPanelMode(nextPanelMode, preferences)
        ) {
          setPrompterPanelMode(nextPanelMode);
        }
        powerPrompterUiPendingFileRef.current = String(preferences?.currentFile || '').trim().replace(/\\/g, '/') || null;
        powerPrompterUiHydratedRef.current = true;
        setPowerPrompterUiHydrationTick((value) => value + 1);
      })
      .catch(() => {
        powerPrompterUiHydratedRef.current = true;
        setPowerPrompterUiHydrationTick((value) => value + 1);
      });
  }, [isPhoneRemote, setGlobalSearchQuery, shouldIgnoreIncomingPanelMode]);

  useEffect(() => {
    try {
      window.localStorage.removeItem('umbra.powerPrompter.selectedBridgeId');
    } catch {
      // Legacy cleanup only.
    }
    if (!powerPrompterUiHydratedRef.current || !syncUiAcrossDevices) return;
    if (Date.now() < powerPrompterUiSuppressPersistUntilRef.current) return;
    const updatedAt = Date.now();
    powerPrompterUiSessionUpdatedAtRef.current = updatedAt;
    void writeUserConfig('powerprompter-ui', {
      selectedBridgeId,
      queueManagerPreviewSplit,
      activeQueueSet: queueSetTarget,
      queueManagerSearchQuery,
      queueManagerStyleFilter,
      queueManagerSequenceMode,
      queuePromptExpandedMode,
      generationPreviewHoldMs,
      globalSearchQuery,
      leftPanelCollapsed,
      rightPanelCollapsed,
      currentFile,
      panelMode: prompterPanelMode,
      uiClientId: powerPrompterUiClientIdRef.current,
      updatedAt,
    } satisfies PowerPrompterUiPreferences).catch((error) => {
      console.warn('[PowerPrompter] Failed to persist selected bridge:', error);
    });
  }, [
    currentFile,
    generationPreviewHoldMs,
    globalSearchQuery,
    leftPanelCollapsed,
    prompterPanelMode,
    queueManagerPreviewSplit,
    queueManagerSearchQuery,
    queueManagerSequenceMode,
    queueManagerStyleFilter,
    queuePromptExpandedMode,
    queueSetTarget,
    rightPanelCollapsed,
    selectedBridgeId,
    syncUiAcrossDevices,
  ]);

  useEffect(() => {
    let closedByEffectCleanup = false;

    const connect = () => {
      if (closedByEffectCleanup) return;
      const existing = prompterWsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const ws = new WebSocket(createPrompterWsUrl());
      prompterWsRef.current = ws;
      prompterWsReadyRef.current = false;

      ws.onopen = () => {
        if (prompterWsRef.current !== ws) return;
        prompterWsReadyRef.current = true;
        sendPrompterWsMessage({
          type: 'register',
          role: 'powerprompter',
          source: 'umbra-ui',
        });
        const restoredSnapshot = POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED
          ? restoredPausedQueueRef.current
          : null;
        if (restoredSnapshot) {
          const targetBridgeId = String(restoredSnapshot.targetBridgeId || '').trim();
          const queueTargetType = normalizeQueueTargetType(restoredSnapshot.queueTargetType || selectedQueueTargetType);
          const requestIds = Array.isArray(restoredSnapshot.requestIds)
            ? restoredSnapshot.requestIds
              .map((entry) => String(entry || '').trim())
              .filter((entry) => entry.length > 0)
            : [];
          if (requestIds.length > 0) {
            sendPrompterWsMessage({
              type: 'queue_cancel',
              requestId: createRequestId(),
              requestIds,
              targetBridgeId: targetBridgeId || undefined,
              queueTargetType,
            });
          } else {
            sendPrompterWsMessage({
              type: 'queue_pause',
              requestId: createRequestId(),
              targetBridgeId: targetBridgeId || undefined,
              queueTargetType,
            });
          }
        }
        sendPrompterWsMessage({ type: 'bridge_catalog_request' });
        sendPrompterSync();
        void refreshLoraCatalog(false);
        void refreshModelCatalog(false);
      };

      ws.onmessage = (event) => {
        let payload: any = null;
        try {
          payload = JSON.parse(String(event?.data || '{}'));
        } catch {
          return;
        }
        if (!payload || typeof payload !== 'object') return;
        const messageType = String(payload.type || '');

        if (messageType === 'document_state') {
          const envelope = normalizePowerPrompterDocumentSessionEnvelope(payload);
          if (envelope?.session) {
            applyPowerPrompterDocumentSession(envelope.session, { fromRemote: true });
          }
          return;
        }

        if (messageType === 'bridge_catalog') {
          const items = Array.isArray(payload.items)
            ? payload.items
              .map((entry: unknown) => normalizeBridgeTarget(entry))
              .filter((entry: PowerPrompterBridgeTarget | null): entry is PowerPrompterBridgeTarget => !!entry)
            : [];
          setBridgeTargets(items);
          setSelectedBridgeId((prev) => {
            const current = String(prev || '').trim();
            if (parseApiWorkflowTargetId(current)) {
              return current;
            }
            return '';
          });
          return;
        }

        if (messageType === 'lora_catalog_result') {
          const requestId = String(payload.requestId || '');
          const pending = requestId ? pendingLoraCatalogRequestsRef.current.get(requestId) : null;
          if (pending) {
            clearTimeout(pending.timer);
            pendingLoraCatalogRequestsRef.current.delete(requestId);
            if (payload.success === false) {
              pending.reject(new Error(String(payload.error || 'Failed to load LoRA catalog.')));
            } else {
              const items = Array.isArray(payload.items)
                ? payload.items.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
                : [];
              setLoraCatalog(items);
              pending.resolve(items);
            }
            return;
          }
          if (payload.success !== false) {
            const items = Array.isArray(payload.items)
              ? payload.items.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
              : [];
            setLoraCatalog(items);
          }
          return;
        }

        if (messageType === 'lora_info_result') {
          const requestId = String(payload.requestId || '');
          const pending = requestId ? pendingLoraInfoRequestsRef.current.get(requestId) : null;
          const loraName = String(payload.loraName || '').trim();
          if (pending) {
            clearTimeout(pending.timer);
            pendingLoraInfoRequestsRef.current.delete(requestId);
            if (payload.success === false) {
              pending.reject(new Error(String(payload.error || 'Failed to load LoRA info.')));
            } else {
              const info: PowerPrompterLoraInfoPayload = {
                loraName,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {},
                civitai: payload.civitai && typeof payload.civitai === 'object' ? payload.civitai as Record<string, unknown> : null,
                trainedTags: Array.isArray(payload.trainedTags)
                  ? payload.trainedTags.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
                  : [],
                descriptionHtml: String(payload.descriptionHtml || '').trim(),
                descriptionText: String(payload.descriptionText || '').trim(),
              };
              if (info.loraName && !pending.previewOnly) {
                const aliasEntries = Object.fromEntries(
                  Array.from(new Set([
                    ...getPrompterCatalogAliasKeys(info.loraName),
                  ])).map((key) => [key, info])
                );
                setLoraInfoCache((prev) => ({ ...prev, ...aliasEntries }));
              }
              pending.resolve(info);
            }
            return;
          }
          return;
        }

        if (messageType === 'model_catalog_result') {
          const requestId = String(payload.requestId || '');
          const pending = requestId ? pendingModelCatalogRequestsRef.current.get(requestId) : null;
          if (pending) {
            clearTimeout(pending.timer);
            pendingModelCatalogRequestsRef.current.delete(requestId);
            if (payload.success === false) {
              pending.reject(new Error(String(payload.error || 'Failed to load model catalog.')));
            } else {
              const items = Array.isArray(payload.items)
                ? payload.items.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
                : [];
              setModelCatalog(items);
              pending.resolve(items);
            }
            return;
          }
          if (payload.success !== false) {
            const items = Array.isArray(payload.items)
              ? payload.items.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
              : [];
            setModelCatalog(items);
          }
          return;
        }

        if (messageType === 'model_info_result') {
          const requestId = String(payload.requestId || '');
          const pending = requestId ? pendingModelInfoRequestsRef.current.get(requestId) : null;
          const modelName = String(payload.modelName || '').trim();
          if (pending) {
            clearTimeout(pending.timer);
            pendingModelInfoRequestsRef.current.delete(requestId);
            if (payload.success === false) {
              pending.reject(new Error(String(payload.error || 'Failed to load model info.')));
            } else {
              const info: PowerPrompterModelInfoPayload = {
                modelName,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {},
                civitai: payload.civitai && typeof payload.civitai === 'object' ? payload.civitai as Record<string, unknown> : null,
                trainedTags: Array.isArray(payload.trainedTags)
                  ? payload.trainedTags.map((entry: unknown) => String(entry || '').trim()).filter((entry: string) => entry.length > 0)
                  : [],
                descriptionHtml: String(payload.descriptionHtml || '').trim(),
                descriptionText: String(payload.descriptionText || '').trim(),
              };
              if (info.modelName && !pending.previewOnly) {
                const aliasEntries = Object.fromEntries(
                  Array.from(new Set([
                    ...getPrompterCatalogAliasKeys(info.modelName),
                  ])).map((key) => [key, info])
                );
                setModelInfoCache((prev) => ({ ...prev, ...aliasEntries }));
              }
              pending.resolve(info);
            }
            return;
          }
          return;
        }

        if (messageType === 'generation_preview') {
          const requestId = normalizeRequestId(payload.requestId);
          const promptIndex = normalizeQueueEventPromptIndex(requestId, payload.promptIndex);
          const event = normalizeGenerationPreviewEvent(payload, promptIndex);
          if (!event) return;
          if (requestId && isStaleQueueEvent(requestId, promptIndex)) return;
          const requestMeta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
          clearGenerationPreviewHideTimer();
          if (requestId) {
            markQueuePromptStarted(requestId, promptIndex);
          }
          if (requestId && requestMeta) {
            const visualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
            if (visualRequestId !== requestId) {
              promoteQueueVisualStateToRequest(requestId, promptIndex);
            }
            markQueueStackPromptRunning(requestId, promptIndex);
          }
          const previewCommitKey = `${requestId}:${event.promptIndex}:${event.promptId}`;
          const previewCommitNow = Date.now();
          const lastPreviewCommit = lastGenerationPreviewCommitRef.current;
          if (
            lastPreviewCommit.key === previewCommitKey
            && previewCommitNow - lastPreviewCommit.committedAt < GENERATION_PREVIEW_REACT_COMMIT_MS
            && event.step < event.maxStep
          ) {
            return;
          }
          lastGenerationPreviewCommitRef.current = {
            key: previewCommitKey,
            committedAt: previewCommitNow,
          };
          setGenerationPreview({
            requestId: event.requestId,
            promptId: event.promptId,
            promptIndex: event.promptIndex,
            prompt: normalizePowerPrompterPromptText(String(requestMeta?.prompts?.[event.promptIndex] || '')),
            imageDataUrl: event.imageDataUrl,
            step: event.step,
            maxStep: event.maxStep,
            status: 'running',
            updatedAt: Date.now(),
          });
          return;
        }

        if (messageType === 'queue_pause_state') {
          const locallyRetiredRequestIds = new Set<string>([
            ...Array.from(clearedQueueRequestIdsRef.current),
            ...Array.from(intentionallyCanceledQueueRequestIdsRef.current),
            ...Array.from(staleQueueRequestIdsRef.current),
          ].map((entry) => String(entry || '').trim()).filter(Boolean));
          for (const staleKey of staleQueuePromptKeysRef.current) {
            const requestId = String(staleKey || '').split(':')[0]?.trim();
            if (requestId) locallyRetiredRequestIds.add(requestId);
          }
          bridgeQueueStateRef.current = normalizeBridgeQueueState(payload, locallyRetiredRequestIds);
          powerPrompterQueueSession.bridgeQueueState = bridgeQueueStateRef.current;
          const hasRestoredPausedQueue = !!restoredPausedQueueRef.current
            && !!queueVisualStateRef.current
            && !queueRequestMetaRef.current.has(String(queueVisualStateRef.current.requestId || ''));
          if (hasRestoredPausedQueue && payload.paused !== true) {
            return;
          }
          const hasBackendOwnedQueue = backendQueueSnapshotRequestIdsRef.current.size > 0
            || Date.now() < backendQueueSnapshotActiveUntilRef.current
            || backendQueuePauseRequestedRef.current
            || queueStackItemsRef.current.some((item) => {
              if (item.exiting || (item.status !== 'pending' && item.status !== 'running')) return false;
              const meta = queueRequestMetaRef.current.get(String(item.requestId || '').trim());
              return meta?.queueTargetType === 'pipeline';
            });
          if (!hasBackendOwnedQueue) {
            setQueuePaused(bridgeQueueStateRef.current.paused);
          }
          if (Number.isFinite(Number(payload.dispatchDelayMs))) {
            setQueueDispatchDelayMs(Math.max(0, Math.floor(Number(payload.dispatchDelayMs) || 0)));
          }
          return;
        }

        if (messageType === 'queue_snapshot') {
          applyBackendQueueSnapshot(payload);
          return;
        }

        if (messageType === 'queue_state_update') {
          restoredPausedQueueRef.current = null;
          powerPrompterQueueSession.restoredPausedQueue = null;
          lastPersistedQueueSnapshotSignatureRef.current = 'removed';
          logQueueDebug('ws:queue_state_update:ignored_snapshot_removed', {
            deleted: payload?.deleted === true,
            revision: payload?.revision,
          });
          return;
        }

        if (messageType === 'queue_pause_result') {
          if (payload.success === false) {
            setQueuePaused((prev) => (payload.paused === true ? false : prev));
            showToast(String(payload.error || 'Queue pause change failed.'), 'error');
            return;
          }
          if (typeof payload.paused === 'boolean') {
            if (payload.backendHandled === true) {
              backendQueuePauseRequestedRef.current = payload.paused === true;
            }
            setQueuePaused(payload.paused === true);
          }
          return;
        }

        if (messageType === 'queue_batch_forwarded') {
          const requestId = String(payload.requestId || '');
          if (!requestId) return;
          const pending = pendingQueueRequestsRef.current.get(requestId);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingQueueRequestsRef.current.delete(requestId);
          if (payload.success === false) {
            pending.reject(new Error(String(payload.error || 'Failed to forward queue batch request.')));
            return;
          }
          const acceptedRequestIds = normalizeRequestIdList(payload.acceptedRequestIds);
          for (const acceptedRequestId of acceptedRequestIds) {
            queueBridgeDispatchedRequestIdsRef.current.add(acceptedRequestId);
          }
          logQueueDebug('ws:queue_batch_forwarded:acknowledged', {
            requestId,
            acceptedRequestIds,
            groupCount: Number(payload.groupCount ?? acceptedRequestIds.length),
          });
          pending.resolve(payload);
          return;
        }

        if (messageType === 'queue_forwarded') {
          const requestId = String(payload.requestId || '');
          if (!requestId) return;
          const pending = pendingQueueRequestsRef.current.get(requestId);
          if (!pending) return;
          if (payload.success === false) {
            failTrackedQueueRequest(requestId, String(payload.error || 'Failed to forward queue request.'), pending);
            return;
          }
          logQueueDebug('ws:queue_forwarded:acknowledged', {
            requestId,
            duplicate: payload.duplicate === true,
          });
          if (payload.targetRole === 'backend_pipeline') {
            clearTimeout(pending.timer);
            pendingQueueRequestsRef.current.delete(requestId);
            pending.resolve(payload);
          }
          return;
        }

        if (messageType === 'queue_interrupt_result') {
          logQueueDebug('ws:queue_interrupt_result:received', { payload });
          if (payload.success === false) {
            const recentlyHandledLocally = Date.now() - lastLocalQueueInterruptHandledAtRef.current < 5000;
            if (recentlyHandledLocally) {
              logQueueDebug('ws:queue_interrupt_result:ignored_after_local_cancel', { payload });
              return;
            }
            showToast(String(payload.error || 'Failed to advance queue after cancel.'), 'error');
          } else {
            const requestId = String(payload.requestId || '').trim();
            const promptIndexRaw = Number(payload.promptIndex);
            if (requestId && Number.isFinite(promptIndexRaw)) {
              retireInterruptedQueuePromptLocally(requestId, normalizeQueueEventPromptIndex(requestId, promptIndexRaw));
            }
          }
          return;
        }

        if (messageType === 'queue_cancel_result') {
          logQueueDebug('ws:queue_cancel_result:received', { payload });
          if (payload.success === false) {
            pendingQueueCancelScopeRef.current = [];
            showToast(String(payload.error || 'Queue cancel failed.'), 'error');
            return;
          }

          const pendingCancelScope = pendingQueueCancelScopeRef.current
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
          const pendingCancelScopeSet = new Set(pendingCancelScope);
          const canceledRequestIds = normalizeRequestIdList(payload.requestIds);
          const effectiveCanceledRequestIds = pendingCancelScope.length > 0
            ? (
              canceledRequestIds.length > 0
                ? canceledRequestIds.filter((requestId) => pendingCancelScopeSet.has(requestId))
                : pendingCancelScope
            )
            : canceledRequestIds;
          pendingQueueCancelScopeRef.current = [];
          if (effectiveCanceledRequestIds.length > 0) {
            rejectPendingQueueRequestsByIds(effectiveCanceledRequestIds, 'Queue canceled by user.');
            dropTrackedQueueRequestState(effectiveCanceledRequestIds, 'canceled');
          }
          setQueuePaused(false);
          logQueueDebug('ws:queue_cancel_result:applied', { canceledRequestIds, pendingCancelScope, effectiveCanceledRequestIds });
          return;
        }

        if (messageType === 'queue_clear_future_result') {
          logQueueDebug('ws:queue_clear_future_result:received', { payload });
          if (payload.success === false) {
            pendingQueueClearFutureScopeRef.current = [];
            showToast(String(payload.error || 'Failed to clear future queue jobs.'), 'error');
            return;
          }
          const clearedRequestIds = normalizeRequestIdList(payload.clearedRequestIds);
          const effectiveClearedRequestIds = Array.from(new Set([
            ...pendingQueueClearFutureScopeRef.current,
            ...clearedRequestIds,
          ].map((entry) => String(entry || '').trim()).filter(Boolean)));
          pendingQueueClearFutureScopeRef.current = [];
          if (effectiveClearedRequestIds.length > 0) {
            rejectPendingQueueRequestsByIds(effectiveClearedRequestIds, 'Queue cleared by user.');
            dropTrackedQueueRequestState(effectiveClearedRequestIds);
          }
          logQueueDebug('ws:queue_clear_future_result:applied', { effectiveClearedRequestIds });
          return;
        }

        if (messageType === 'queue_reorder_result') {
          if (payload.success === false) {
            showToast(String(payload.error || 'Queue reorder failed.'), 'error');
          }
          return;
        }

        if (messageType === 'queue_prompt_remove_result') {
          logQueueDebug('ws:queue_prompt_remove_result:received', { payload });
          const controlRequestId = String(payload.requestId || '').trim();
          const pendingRemovals = controlRequestId
            ? (pendingQueuePromptRemovalOpsRef.current.get(controlRequestId) || [])
            : [];
          if (controlRequestId) {
            pendingQueuePromptRemovalOpsRef.current.delete(controlRequestId);
          }
          for (const entry of pendingRemovals) {
            const removalRequestId = String(entry?.requestId || '').trim();
            for (const promptIndex of entry?.promptIndices || []) {
              pendingQueuePromptRemovalKeysRef.current.delete(`${removalRequestId}:${Math.max(0, Math.floor(Number(promptIndex) || 0))}`);
            }
          }
          if (payload.success === false) {
            sendPrompterWsMessage({ type: 'bridge_catalog_request' });
            logQueueDebug('ws:queue_prompt_remove_result:failed_refresh_requested', {
              controlRequestId,
              error: payload.error || '',
              pendingRemovals,
            });
            showToast(String(payload.error || 'Failed to remove queued prompt.'), 'error');
            return;
          }
          if (payload.applied !== true) {
            showToast('Queued prompt update did not apply. Queue state may have changed.', 'error');
            return;
          }
          const pendingRemovalRequestIds = new Set(
            pendingRemovals
              .map((entry) => String(entry?.requestId || '').trim())
              .filter(Boolean)
          );
          const removedRequestIds = normalizeRequestIdList(payload.removedRequestIds);
          const effectiveRemovedRequestIds = pendingRemovalRequestIds.size > 0
            ? removedRequestIds.filter((requestId) => pendingRemovalRequestIds.has(requestId))
            : removedRequestIds;
          if (effectiveRemovedRequestIds.length > 0) {
            dropTrackedQueueRequestState(effectiveRemovedRequestIds);
          }
          logQueueDebug('ws:queue_prompt_remove_result:applied', { controlRequestId, removedRequestIds, effectiveRemovedRequestIds, pendingRemovals });
          return;
        }

        if (messageType === 'queue_delay_result') {
          if (payload.success === false) {
            showToast(String(payload.error || 'Queue dispatch delay update failed.'), 'error');
            return;
          }
          if (Number.isFinite(Number(payload.dispatchDelayMs))) {
            setQueueDispatchDelayMs(Math.max(0, Math.floor(Number(payload.dispatchDelayMs) || 0)));
          }
          return;
        }

        if (messageType === 'queue_saved_outputs') {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('umbra:powerprompter-output-saved', { detail: payload }));
          }
          const requestId = normalizeRequestId(payload.requestId);
          const incomingPreviewImages = normalizeQueueSavedOutputPreviewImages(payload);
          if (requestId && incomingPreviewImages.length > 0) {
            updateQueueHistoryForRequest(requestId, {
              previewImages: mergeQueueHistoryPreviewImagesForRequest(requestId, incomingPreviewImages),
            });
          }
          return;
        }

        if (messageType === 'queue_progress') {
          const requestId = normalizeRequestId(payload.requestId);
          const promptIndexRaw = Number(payload.promptIndex);
          const promptIndex = Number.isFinite(promptIndexRaw) ? normalizeQueueEventPromptIndex(requestId, promptIndexRaw) : -1;
          const event = normalizeQueueProgressEvent(payload, promptIndex);
          if (!event) return;
          const { promptId, hasPromptSeed, promptSeed } = event;
          logQueueDebug('ws:queue_progress:received', { requestId, promptIndex, promptId, hasPromptSeed, promptSeed });
          markQueuePromptActivity(requestId, promptIndex);
          const requestMeta = queueRequestMetaRef.current.get(requestId);
          const trackedVisualRequestId = String(queueVisualStateRef.current?.requestId || '');
          if (!requestMeta && trackedVisualRequestId !== requestId) {
            logQueueDebug('ws:queue_progress:ignored_untracked', { requestId, promptIndex, trackedVisualRequestId });
            return;
          }
          if (requestMeta && trackedVisualRequestId !== requestId) {
            promoteQueueVisualStateToRequest(requestId, promptIndex);
          }
          if (requestMeta) {
            markQueueStackPromptRunning(requestId, promptIndex);
          }
          recordQueuePromptCompletionTiming(requestId, promptIndex);
          let requestCompletions = completedPromptIndicesRef.current.get(requestId);
          if (!requestCompletions) {
            requestCompletions = new Set<number>();
            completedPromptIndicesRef.current.set(requestId, requestCompletions);
          }
          const shouldPlayCompletionSound = !requestCompletions.has(promptIndex);
          requestCompletions.add(promptIndex);
          if (requestMeta) {
            updateQueueHistoryForRequest(requestId, {
              completed: requestCompletions.size,
              status: requestCompletions.size >= requestMeta.prompts.length ? 'completed' : 'running',
            });
          }
          if (shouldPlayCompletionSound) {
            playCompletionSound();
            setQueueCompletionTick((prev) => prev + 1);
          }

          const completedStackItems = applyQueueStackRunningState(
            queueStackItemsRef.current.map((item) => {
              if (item.requestId !== requestId || item.promptIndex !== promptIndex) return item;
              if (item.exiting) return item;
              return { ...item, status: 'queued', exiting: false };
            })
          );
          updateQueueStackItemsSynced(completedStackItems);
          setQueueVisualState((prev) => {
            if (!prev || prev.requestId !== requestId) return prev;
            const nextActiveIndex = Math.min(prev.prompts.length - 1, Math.max(0, promptIndex + 1));
            const nextPromptIds = Array.isArray(prev.promptIds)
              ? [...prev.promptIds]
              : prev.prompts.map(() => '');
            const nextPromptSeeds = Array.isArray(prev.promptSeeds)
              ? [...prev.promptSeeds]
              : prev.prompts.map(() => 0);
            if (promptId && promptIndex >= 0 && promptIndex < nextPromptIds.length) {
              nextPromptIds[promptIndex] = promptId;
            }
            if (hasPromptSeed && promptIndex >= 0 && promptIndex < nextPromptSeeds.length) {
              nextPromptSeeds[promptIndex] = promptSeed;
            }
            return { ...prev, activeIndex: nextActiveIndex, promptIds: nextPromptIds, promptSeeds: nextPromptSeeds, jobProgress: 0, updatedAt: Date.now() };
          });
          if (requestMeta && promptIndex >= Math.max(0, requestMeta.prompts.length - 1)) {
            setTimeout(() => {
              promoteNextTrackedQueueRequest(requestId);
            }, 0);
          }

          if (requestMeta && hasPromptSeed) {
            setCardDocument((prev) => {
              const nextDoc = {
                ...prev,
                updatedAt: new Date().toISOString(),
                generation: normalizePowerPrompterGenerationControls({
                  ...prev.generation,
                  seed: promptSeed,
                }),
              };
              cardDocumentRef.current = nextDoc;
              return nextDoc;
            });
          }
          scheduleRecoverableQueueSnapshotPersist({
            clearWhenEmpty: true,
            delayMs: 50,
          });
          logQueueDebug('ws:queue_progress:applied', { requestId, promptIndex, nextActiveIndex: Math.max(0, promptIndex + 1) });
          return;
        }

        if (messageType === 'job_progress') {
          const requestId = normalizeRequestId(payload.requestId);
          const promptIndexRaw = Number(payload.promptIndex);
          const nextActiveIndex = Number.isFinite(promptIndexRaw)
            ? normalizeQueueEventPromptIndex(requestId, promptIndexRaw)
            : 0;
          const event = normalizeJobProgressEvent(payload, nextActiveIndex);
          if (!event) return;
          const { progressRaw, progressMaxRaw, progress: nextProgress } = event;
          logQueueDebug('ws:job_progress:received', { requestId, promptIndex: nextActiveIndex, progressRaw, progressMaxRaw, nextProgress });
          if (requestId && isStaleQueueEvent(requestId, nextActiveIndex)) return;
          if (requestId) {
            markQueuePromptStarted(requestId, nextActiveIndex);
            markQueuePromptActivity(requestId, nextActiveIndex);
          }
          const requestMeta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
          if (requestId && requestMeta) {
            markQueueStackPromptRunning(requestId, nextActiveIndex);
          }
          const progressCommitKey = `${requestId}:${nextActiveIndex}`;
          const progressCommitNow = Date.now();
          const lastProgressCommit = lastJobProgressCommitRef.current;
          const progressDelta = Math.abs(nextProgress - lastProgressCommit.progress);
          const shouldCommitProgressToReact =
            lastProgressCommit.key !== progressCommitKey
            || nextProgress <= 0
            || nextProgress >= 1
            || (
              progressCommitNow - lastProgressCommit.committedAt >= QUEUE_PROGRESS_REACT_COMMIT_MS
              && progressDelta >= QUEUE_PROGRESS_REACT_COMMIT_STEP
            )
            || progressCommitNow - lastProgressCommit.committedAt >= 500;
          if (!shouldCommitProgressToReact) {
            return;
          }
          lastJobProgressCommitRef.current = {
            key: progressCommitKey,
            progress: nextProgress,
            activeIndex: nextActiveIndex,
            committedAt: progressCommitNow,
          };
          setQueueVisualState((prev) => {
            if ((!prev || prev.requestId !== requestId) && requestId && requestMeta) {
              const clampedActiveIndex = Math.min(requestMeta.prompts.length - 1, nextActiveIndex);
              return {
                requestId,
                mode: requestMeta.mode,
                activeSetId: clampQueueSetId(requestMeta.promptSetIds[clampedActiveIndex] ?? requestMeta.setId),
                prompts: [...requestMeta.prompts],
                promptEntries: requestMeta.promptEntries ? [...requestMeta.promptEntries] : undefined,
                promptIds: requestMeta.prompts.map(() => ''),
                promptSeeds: requestMeta.prompts.map(() => 0),
                activeIndex: clampedActiveIndex,
                jobProgress: nextProgress,
                updatedAt: Date.now(),
              };
            }
            if (!prev) return prev;
            if (requestId && prev.requestId !== requestId) return prev;
            const clampedActiveIndex = Math.min(prev.prompts.length - 1, nextActiveIndex);
            return {
              ...prev,
              activeIndex: clampedActiveIndex,
              jobProgress: nextProgress,
              updatedAt: Date.now(),
            };
          });
          if (requestId && requestMeta) {
            clearGenerationPreviewHideTimer();
            setGenerationPreview((prev) => {
              const clampedIndex = Math.min(requestMeta.prompts.length - 1, nextActiveIndex);
              if (!prev || !String(prev.imageDataUrl || '').trim()) return prev;
              if (String(prev.requestId || '').trim() === requestId && Math.max(0, Math.floor(Number(prev.promptIndex) || 0)) === clampedIndex) {
                return {
                  ...prev,
                  step: Number.isFinite(progressRaw) ? Math.max(0, Math.floor(progressRaw)) : prev.step,
                  maxStep: Number.isFinite(progressMaxRaw) ? Math.max(0, Math.floor(progressMaxRaw)) : prev.maxStep,
                  status: 'running',
                  updatedAt: Date.now(),
                };
              }
              return prev;
            });
          }
          scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: false, delayMs: 750 });
          logQueueDebug('ws:job_progress:applied', { requestId, promptIndex: nextActiveIndex, progress: nextProgress });
          return;
        }

        if (messageType === 'job_idle') {
          const requestId = String(payload.requestId || '');
          if (!requestId) return;
          logQueueDebug('ws:job_idle:received', { requestId, payload });
          queueBridgeDispatchedRequestIdsRef.current.delete(requestId);
          pruneBridgeQueueStateRequestIds([requestId]);
          const requestMeta = queueRequestMetaRef.current.get(requestId);
          const completedIndices = completedPromptIndicesRef.current.get(requestId);
          const activeRequestRows = queueStackItemsRef.current.filter((item) =>
            String(item.requestId || '').trim() === requestId
            && !item.exiting
          );
          const trackedVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
          if (!requestMeta && activeRequestRows.length <= 0 && trackedVisualRequestId !== requestId) {
            logQueueDebug('ws:job_idle:ignored_untracked', { requestId, trackedVisualRequestId });
            return;
          }
          if (payload.success === false || String(payload.reason || '').trim() === 'queue_failed') {
            if (isBackendOwnedCancellationPayload(payload)) {
              const reason = String(payload.error || payload.reason || 'Queue canceled.');
              const pending = pendingQueueRequestsRef.current.get(requestId) || null;
              cancelTrackedQueueRequest(
                requestId,
                reason,
                pending,
                String(payload.reason || '').trim().toLowerCase() === 'interrupt' ? 'interrupted' : 'canceled'
              );
              logQueueDebug('ws:job_idle:applied_canceled', { requestId, reason: payload.reason || '', error: payload.error || '' });
              return;
            }
            const errorMessage = String(payload.error || 'Queue failed before completion.');
            const pending = pendingQueueRequestsRef.current.get(requestId) || null;
            failTrackedQueueRequest(requestId, errorMessage, pending);
            showToast(errorMessage, 'error');
            logQueueDebug('ws:job_idle:applied_failure', { requestId, errorMessage });
            return;
          }
          const payloadCompleted = Math.max(0, Math.floor(Number(payload.completed) || 0));
          const payloadTotal = Math.max(0, Math.floor(Number(payload.total) || 0));
          const expectedTotal = Math.max(
            0,
            Math.floor(
              payloadTotal
              || payloadCompleted
              || Number(requestMeta?.prompts?.length)
              || Number(queueVisualStateRef.current?.requestId === requestId ? queueVisualStateRef.current.prompts.length : 0)
              || activeRequestRows.length
              || 0
            )
          );
          const hasRemainingTrackedPrompts = activeRequestRows.some((item) =>
            item.status !== 'queued'
            && item.status !== 'failed'
          );
          const backendOwnsNextDispatch = String(payload.source || '').trim() === 'backend_pipeline';
          const completedCount = completedIndices?.size ?? 0;
          if (hasRemainingTrackedPrompts || (expectedTotal > 0 && completedCount < expectedTotal)) {
            if (payload.success === true && payloadTotal > 0 && payloadCompleted >= payloadTotal) {
              completedPromptIndicesRef.current.set(requestId, new Set(Array.from({ length: payloadTotal }, (_, index) => index)));
              updateQueueStackItemsSynced((prev) =>
                prev.map((item) => {
                  if (item.requestId !== requestId || item.exiting) return item;
                  return { ...item, status: item.status === 'failed' ? 'failed' : 'queued', exiting: false };
                })
              );
            } else {
              logQueueDebug('ws:job_idle:kept_active', { requestId, hasRemainingTrackedPrompts, expectedTotal, completedCount });
              if (!backendOwnsNextDispatch) {
                setQueuePaused(false);
              }
              scheduleRecoverableQueueSnapshotPersist({
                clearWhenEmpty: true,
                delayMs: QUEUE_COMPLETION_SNAPSHOT_PERSIST_DELAY_MS,
              });
              return;
            }
          }
          updateQueueStackItemsSynced((prev) =>
            prev.map((item) => {
              if (item.requestId !== requestId || item.exiting) return item;
              return { ...item, status: item.status === 'failed' ? 'failed' : 'queued', exiting: false };
            })
          );
          setQueueVisualState((prev) => {
            if (!prev) return prev;
            if (requestId && prev.requestId !== requestId) return prev;
            return null;
          });
          setGenerationPreview((prev) => {
            if (!prev) return prev;
            if (requestId && prev.requestId && prev.requestId !== requestId) return prev;
            return {
              ...prev,
              status: 'idle',
              updatedAt: Date.now(),
            };
          });
          scheduleGenerationPreviewHide();
          if (!backendOwnsNextDispatch) {
            setQueuePaused(false);
          }
          scheduleRecoverableQueueSnapshotPersist({
            clearWhenEmpty: true,
            delayMs: QUEUE_COMPLETION_SNAPSHOT_PERSIST_DELAY_MS,
          });
          logQueueDebug('ws:job_idle:applied_idle', { requestId, expectedTotal, completedCount, backendOwnsNextDispatch });
          if (!backendOwnsNextDispatch) {
            void dispatchNextStagedQueueGroupIfReady(`job idle ${requestId}`).catch((error: any) => {
              showToastRef.current(String(error?.message || 'Failed to dispatch the next queued group'), 'error');
            });
          }
          return;
        }

        if (messageType !== 'queue_result') return;

        const queueResultEvent = normalizeQueueResultEvent(payload);
        if (!queueResultEvent) return;
        const { requestId } = queueResultEvent;
        logQueueDebug('ws:queue_result:received', { requestId, payload });
        const pending = pendingQueueRequestsRef.current.get(requestId);
        if (!pending) {
          if (payload.success === false && intentionallyCanceledQueueRequestIdsRef.current.has(requestId)) {
            intentionallyCanceledQueueRequestIdsRef.current.delete(requestId);
            return;
          }
          const trackedVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
          const hasTrackedStackItem = queueStackItemsRef.current.some((item) =>
            String(item.requestId || '').trim() === requestId
          );
          if (!queueRequestMetaRef.current.has(requestId) && trackedVisualRequestId !== requestId && !hasTrackedStackItem) {
            logQueueDebug('ws:queue_result:ignored_untracked', { requestId, success: payload.success });
            return;
          }
          if (!queueResultEvent.success) {
            if (isBackendOwnedCancellationPayload(payload)) {
              cancelTrackedQueueRequest(
                requestId,
                String(payload.error || queueResultEvent.errorMessage || 'Queue canceled.'),
                null,
                String(payload.reason || '').trim().toLowerCase() === 'interrupt' ? 'interrupted' : 'canceled'
              );
              logQueueDebug('ws:queue_result:applied_canceled_untracked', { requestId, payload });
              return;
            }
            const errorMessage = String(payload.error || 'Queue failed.');
            failTrackedQueueRequest(requestId, errorMessage, null);
            showToast(errorMessage, 'error');
          }
          return;
        }

        clearTimeout(pending.timer);
        pendingQueueRequestsRef.current.delete(requestId);
        if (!queueResultEvent.success) {
          if (isBackendOwnedCancellationPayload(payload)) {
            cancelTrackedQueueRequest(
              requestId,
              String(queueResultEvent.errorMessage || payload.error || 'Queue canceled.'),
              null,
              String(payload.reason || '').trim().toLowerCase() === 'interrupt' ? 'interrupted' : 'canceled'
            );
            return;
          }
          if (intentionallyCanceledQueueRequestIdsRef.current.has(requestId)) {
            intentionallyCanceledQueueRequestIdsRef.current.delete(requestId);
            pending.reject(new Error(String(queueResultEvent.errorMessage || 'Queue canceled.')));
            return;
          }
          failTrackedQueueRequest(requestId, String(queueResultEvent.errorMessage || 'Queue failed.'), pending);
          return;
        }
        const requestMeta = queueRequestMetaRef.current.get(requestId);
        const visualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
        if (requestMeta && visualRequestId !== requestId) {
          const hasDifferentRunningRequest = queueStackItemsRef.current.some((item) =>
            !item.exiting
            && item.status === 'running'
            && String(item.requestId || '').trim() !== requestId
          );
          if (!hasDifferentRunningRequest) {
            promoteQueueVisualStateToRequest(requestId, 0);
          }
        }
        markQueuePromptStarted(requestId, 0);
        markQueuePromptActivity(requestId, 0);
        const promptIds = queueResultEvent.promptIds;
        const promptSeeds = queueResultEvent.promptSeeds;
        if (promptIds.length > 0 || promptSeeds.length > 0) {
          setQueueVisualState((prev) => {
            if (!prev || prev.requestId !== requestId) return prev;
            const nextPromptIds = prev.prompts.map((_, idx) => {
              const incomingId = String(promptIds[idx] || '').trim();
              if (incomingId) return incomingId;
              return String(prev.promptIds?.[idx] || '');
            });
            const nextPromptSeeds = prev.prompts.map((_, idx) => {
              const numeric = Number(promptSeeds[idx]);
              if (Number.isFinite(numeric)) return Math.max(0, Math.floor(numeric));
              const prior = Number(prev.promptSeeds?.[idx]);
              return Number.isFinite(prior) ? Math.max(0, Math.floor(prior)) : 0;
            });
            return { ...prev, promptIds: nextPromptIds, promptSeeds: nextPromptSeeds };
          });
        }
        scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 100 });
        pending.resolve(payload);
      };

      ws.onclose = () => {
        logQueueDebug('ws:closed', { closedByEffectCleanup });
        if (prompterWsRef.current === ws) {
          prompterWsRef.current = null;
        }
        prompterWsReadyRef.current = false;
        rejectAllPendingQueueRequests('Power Prompter websocket disconnected.');
        setQueueControlBusy(null);
        setQueueConfirmAction(null);
        setQueueingMode(null);
        if (closedByEffectCleanup) return;
        const hadLiveQueue = queueStackItemsRef.current.some((item) =>
          !item.exiting && (item.status === 'running' || item.status === 'pending')
        );
        if (hadLiveQueue) {
          logQueueDebug('ws:closed:liveQueuePaused', { hadLiveQueue });
          setQueuePaused(true);
          updateQueueStackItemsSynced((prev) =>
            prev.map((item) => {
              if (item.exiting || (item.status !== 'running' && item.status !== 'pending')) return item;
              return { ...item, status: 'pending', exiting: false };
            })
          );
          setGenerationPreview((prev) => {
            if (!prev || prev.status !== 'running') return prev;
            return {
              ...prev,
              status: 'idle',
              imageDataUrl: String(prev.imageDataUrl || '').trim() ? prev.imageDataUrl : '',
              step: 0,
              maxStep: 0,
              updatedAt: Date.now(),
            };
          });
          scheduleRecoverableQueueSnapshotPersist({ paused: true, clearWhenEmpty: true, delayMs: 50 });
        }
        clearPrompterRetryTimer();
        prompterWsRetryRef.current = setTimeout(() => {
          prompterWsRetryRef.current = null;
          connect();
        }, PROMPTER_WS_RETRY_MS);
      };

      ws.onerror = () => {
        logQueueDebug('ws:error');
        try {
          ws.close();
        } catch {
          // no-op
        }
      };
    };

    connect();

    return () => {
      closedByEffectCleanup = true;
      clearPrompterRetryTimer();
      clearSyncSendTimer();
      clearQueueStackTimers();
      clearGenerationPreviewHideTimer();
      if (powerPrompterSessionUpdateTimerRef.current) {
        clearTimeout(powerPrompterSessionUpdateTimerRef.current);
        powerPrompterSessionUpdateTimerRef.current = null;
      }
      prompterWsReadyRef.current = false;

      rejectAllPendingQueueRequests('Power Prompter websocket disconnected.');
      for (const pending of Array.from(pendingLoraCatalogRequestsRef.current.values())) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Power Prompter websocket disconnected.'));
      }
      pendingLoraCatalogRequestsRef.current.clear();
      for (const pending of Array.from(pendingLoraInfoRequestsRef.current.values())) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Power Prompter websocket disconnected.'));
      }
      pendingLoraInfoRequestsRef.current.clear();
      for (const pending of Array.from(pendingModelCatalogRequestsRef.current.values())) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Power Prompter websocket disconnected.'));
      }
      pendingModelCatalogRequestsRef.current.clear();
      for (const pending of Array.from(pendingModelInfoRequestsRef.current.values())) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Power Prompter websocket disconnected.'));
      }
      pendingModelInfoRequestsRef.current.clear();

      const ws = prompterWsRef.current;
      prompterWsRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          // no-op
        }
      }
    };
  }, []);

  useEffect(() => {
    schedulePrompterSync();
  }, [content, cardDocument, currentFile]);

  const handleSelectFile = (path: string, fileContent: string) => {
    void (async () => {
      const loadSeq = fileLoadRequestSeqRef.current + 1;
      fileLoadRequestSeqRef.current = loadSeq;
      const fileName = String(path || '').replace(/\\/g, '/').split('/').pop() || 'prompt file';
      setLoadingPromptFileName(fileName);
      await waitForNextUiPaint();
      try {
        const previousFile = currentFileRef.current;
        if (
          previousFile &&
          hasPendingChangesRef.current
        ) {
          await savePromptFile(previousFile, contentRef.current, { source: 'autosave' });
        }

        clearAutosaveTimer();
        setActivePowerPrompterPresetSession(null);
        activePowerPrompterPresetSessionRef.current = null;
        const sessionPayload = await openPowerPrompterDocumentSession(path, powerPrompterUiClientIdRef.current);
        const session = sessionPayload.session;
        if (!session?.document || !session.file) {
          throw new Error('Power Prompter session did not return a document');
        }
        if (fileLoadRequestSeqRef.current !== loadSeq) return;
        const syncedContent = session.composedPrompt || composeActivePromptFromCards(session.document.cards, session.document.activeQueueSet);
        const signature = getCardDocSignature(session.document);
        const shouldMarkPending = session.dirty === true;

        powerPrompterSessionRevisionRef.current = Math.max(powerPrompterSessionRevisionRef.current, session.revision);
        setCurrentFile(session.file);
        setContent(syncedContent);
        setCardDocument(session.document);
        setQueueSetTarget(clampQueueSetId(session.document.activeQueueSet));
        currentFileRef.current = session.file;
        contentRef.current = syncedContent;
        cardDocumentRef.current = session.document;
        lastSavedContentRef.current = syncedContent;
        lastSavedCardSignatureRef.current = signature;
        hasPendingChangesRef.current = shouldMarkPending;
        lastEditAtRef.current = shouldMarkPending ? Date.now() : 0;
        autosaveErrorShownRef.current = false;

        if (shouldMarkPending) {
          markPendingChange();
        }
      } catch (error: any) {
        if (fileLoadRequestSeqRef.current !== loadSeq) return;
        showToast(String(error?.message || 'Failed to load prompt file'), 'error');
      } finally {
        if (fileLoadRequestSeqRef.current === loadSeq) {
          setLoadingPromptFileName(null);
        }
      }
    })();
  };

  useEffect(() => {
    if (powerPrompterUiFileRestoredRef.current || !powerPrompterUiHydratedRef.current) return;
    powerPrompterUiFileRestoredRef.current = true;
    const path = powerPrompterUiPendingFileRef.current;
    if (currentFileRef.current) return;
    if (path) {
      handleSelectFile(path, '');
      return;
    }
    void loadPowerPrompterDocumentSession()
      .then((payload) => {
        if (!currentFileRef.current && payload.session?.document) {
          applyPowerPrompterDocumentSession(payload.session);
        }
      })
      .catch(() => undefined);
  });

  useEffect(() => subscribeUiSession((event) => {
    if (!syncUiAcrossDevices) return;
    const preferences = event.type === 'ui_session_state'
      ? event.sessions?.['powerprompter-ui'] as PowerPrompterUiPreferences | null | undefined
      : event.key === 'powerprompter-ui'
        ? event.value as PowerPrompterUiPreferences | null | undefined
        : null;
    if (!preferences || typeof preferences !== 'object') return;
    const sourceClientId = String(preferences.uiClientId || '').trim();
    if (sourceClientId && sourceClientId === powerPrompterUiClientIdRef.current) return;
    const updatedAt = getPowerPrompterUiPreferenceUpdatedAt(preferences);
    if (updatedAt > 0 && updatedAt <= powerPrompterUiSessionUpdatedAtRef.current) return;
    if (updatedAt > 0) powerPrompterUiSessionUpdatedAtRef.current = updatedAt;
    powerPrompterUiSuppressPersistUntilRef.current = Date.now() + 1000;
    const nextBridgeId = String(preferences.selectedBridgeId || '').trim();
    if (parseApiWorkflowTargetId(nextBridgeId)) {
      setSelectedBridgeId(nextBridgeId);
    }
    if (preferences.queueManagerPreviewSplit !== undefined) {
      setQueueManagerPreviewSplit(normalizeQueueManagerPreviewSplit(preferences.queueManagerPreviewSplit));
    }
    if (preferences.leftPanelCollapsed !== undefined) {
      setLeftPanelCollapsed(preferences.leftPanelCollapsed === true);
    }
    if (preferences.rightPanelCollapsed !== undefined) {
      setRightPanelCollapsed(preferences.rightPanelCollapsed === true);
    }
    if (Number.isFinite(Number(preferences.activeQueueSet))) {
      setQueueSetTarget(clampQueueSetId(preferences.activeQueueSet));
    }
    if (preferences.queueManagerSearchQuery !== undefined) {
      setQueueManagerSearchQuery(normalizePowerPrompterUiSearchValue(preferences.queueManagerSearchQuery));
    }
    if (preferences.queueManagerStyleFilter !== undefined) {
      setQueueManagerStyleFilter(normalizePowerPrompterUiSearchValue(preferences.queueManagerStyleFilter));
    }
    if (preferences.queueManagerSequenceMode !== undefined) {
      setQueueManagerSequenceMode(normalizeQueueManagerSequencePreference(preferences.queueManagerSequenceMode));
    }
    if (preferences.queuePromptExpandedMode !== undefined) {
      setQueuePromptExpandedMode(preferences.queuePromptExpandedMode === true);
    }
    if (preferences.generationPreviewHoldMs !== undefined) {
      const nextHoldMs = preferences.generationPreviewHoldMs === null
        ? null
        : Math.max(0, Math.min(60000, Math.floor(Number(preferences.generationPreviewHoldMs) || PREVIEW_CARD_HIDE_DELAY_MS)));
      generationPreviewHoldMsRef.current = nextHoldMs;
      setGenerationPreviewHoldMs(nextHoldMs);
    }
    if (preferences.globalSearchQuery !== undefined) {
      setGlobalSearchQuery(normalizePowerPrompterUiSearchValue(preferences.globalSearchQuery));
    }
    const nextPanelMode = preferences.panelMode;
    if (
      (nextPanelMode === 'editor' || nextPanelMode === 'queue-manager' || nextPanelMode === 'queue-editor')
      && !shouldIgnoreIncomingPanelMode(nextPanelMode, preferences)
    ) {
      setPrompterPanelMode(nextPanelMode);
    }
    const nextFile = String(preferences.currentFile || '').trim().replace(/\\/g, '/');
    if (nextFile && nextFile !== currentFileRef.current) {
      handleSelectFile(nextFile, '');
    }
  }), [setGlobalSearchQuery, shouldIgnoreIncomingPanelMode, syncUiAcrossDevices]);

  const handleFileOpenStart = useCallback((path: string) => {
    const fileName = String(path || '').replace(/\\/g, '/').split('/').pop() || 'prompt file';
    setLoadingPromptFileName(fileName);
  }, []);

  const handleFileOpenFailed = useCallback(() => {
    setLoadingPromptFileName(null);
  }, []);

  const handleDeleteFile = (path: string) => {
    if (currentFile !== path) return;
    void fetch(`/api/powerprompter/session?clientId=${encodeURIComponent(powerPrompterUiClientIdRef.current)}`, {
      method: 'DELETE',
    }).catch(() => undefined);
    setCurrentFile(null);
    setContent('');
    setCardDocument(createDefaultPowerPrompterCardDocument(null));
    setQueueSetTarget(1);
    clearAutosaveTimer();
    setActivePowerPrompterPresetSession(null);
    activePowerPrompterPresetSessionRef.current = null;
    currentFileRef.current = null;
    contentRef.current = '';
    cardDocumentRef.current = createDefaultPowerPrompterCardDocument(null);
    lastSavedContentRef.current = '';
    lastSavedCardSignatureRef.current = '';
    hasPendingChangesRef.current = false;
    lastEditAtRef.current = 0;
  };

  const handleClassicContentChange = (nextValue: string) => {
    setContent(nextValue);
    contentRef.current = nextValue;
    markPendingChange();
  };

  const handleCardDocumentChange = (nextDocument: PowerPrompterCardDocument) => {
    if (powerPrompterSessionApplyingRef.current) return;
    const previousDocument = cardDocumentRef.current;
    const normalizedBase = normalizePowerPrompterCardDocument(nextDocument, currentFileRef.current);
    const normalized = {
      ...normalizedBase,
      cards: normalizeChainCards(normalizedBase.cards),
      updatedAt: new Date().toISOString(),
    };
    const composed = composeActivePromptFromCards(normalized.cards, normalized.activeQueueSet);
    const nextSignature = getCardDocSignature(normalized);
    const previousCards = normalizeChainCards(previousDocument.cards);
    const nextCards = normalizeChainCards(normalized.cards);
    logPowerPrompterDebug('editor:cardDocument:changed', {
      previousCardCount: previousCards.length,
      nextCardCount: nextCards.length,
      previousActiveSet: previousDocument.activeQueueSet,
      nextActiveSet: normalized.activeQueueSet,
      previousDisabledCount: previousCards.filter((card) => card.disabled === true).length,
      nextDisabledCount: nextCards.filter((card) => card.disabled === true).length,
      previousRandomEnabledCount: previousCards.filter((card) => card.randomEnabled === true).length,
      nextRandomEnabledCount: nextCards.filter((card) => card.randomEnabled === true).length,
      previousQueueAssignedCount: previousCards.filter((card) => normalizeQueueSetIds(card.queueSetIds, false).length > 0).length,
      nextQueueAssignedCount: nextCards.filter((card) => normalizeQueueSetIds(card.queueSetIds, false).length > 0).length,
      composedLength: composed.length,
      signatureChanged: nextSignature !== lastSavedCardSignatureRef.current,
    });
    setCardDocument(normalized);
    setContent(composed);
    cardDocumentRef.current = normalized;
    contentRef.current = composed;

    if (activePowerPrompterPresetSessionRef.current) {
      hasPendingChangesRef.current = false;
      return;
    }

    hasPendingChangesRef.current = !!currentFileRef.current && (
      composed !== lastSavedContentRef.current ||
      nextSignature !== lastSavedCardSignatureRef.current
    );
    if (hasPendingChangesRef.current) {
      markPendingChange();
      schedulePowerPrompterDocumentSessionUpdate(normalized);
    }
  };

  const handleQueueEditorDocumentChange = (nextDocument: PowerPrompterCardDocument) => {
    const previousDocument = queueEditorDocumentRef.current;
    const normalizedBase = normalizePowerPrompterCardDocument(nextDocument, queueEditorDraft?.sourceFile || currentFileRef.current);
    const normalized = {
      ...normalizedBase,
      cards: normalizeChainCards(normalizedBase.cards),
      updatedAt: new Date().toISOString(),
    };
    logPowerPrompterDebug('queueEditor:document:changed', {
      requestId: queueEditorDraft?.requestId || '',
      previousCardCount: normalizeChainCards(previousDocument.cards).length,
      nextCardCount: normalized.cards.length,
      previousActiveSet: previousDocument.activeQueueSet,
      nextActiveSet: normalized.activeQueueSet,
      composedLength: composeActivePromptFromCards(normalized.cards, normalized.activeQueueSet).length,
    }, { includeQueue: true });
    setQueueEditorDocument(normalized);
    queueEditorDocumentRef.current = normalized;
  };
  const handleQueueSetTargetChange = (rawSetId: unknown) => {
    const nextSetId = clampQueueSetId(rawSetId);
    setQueueSetTarget(nextSetId);
    if (clampQueueSetId(cardDocumentRef.current.activeQueueSet) === nextSetId) return;
    handleCardDocumentChange({
      ...cardDocumentRef.current,
      activeQueueSet: nextSetId,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    const selectedPreset = powerPrompterPresets.find((preset) => preset.id === selectedPowerPrompterPresetId);
    if (selectedPreset) {
      setPowerPrompterPresetNameDraft(selectedPreset.name);
    }
  }, [powerPrompterPresets, selectedPowerPrompterPresetId]);

  const handleSavePowerPrompterPreset = useCallback(async () => {
    if (!currentFileRef.current) {
      showToast('Open or create a card file before saving a preset', 'error');
      return;
    }
    const activeFilePath = normalizePowerPrompterPresetSourceFilePath(currentFileRef.current || '');
    const currentFileLabel = getPowerPrompterPresetFileLabel(activeFilePath);
    const name = normalizePowerPrompterPresetName(powerPrompterPresetNameDraft || currentFileLabel);
    if (!name) {
      showToast('Preset name is required', 'error');
      return;
    }

    setPowerPrompterPresetBusy('save');
    try {
      const now = Date.now();
      const document = {
        ...normalizePowerPrompterPresetDocument(cardDocumentRef.current),
      };
      const existing = powerPrompterPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
      const nextPreset: PowerPrompterPresetDocument = existing
        ? {
          ...existing,
          name,
          document,
          updatedAt: now,
        }
        : {
          id: createPowerPrompterPresetId(),
          name,
          document,
          sourceFilePath: activeFilePath,
          sourceFileKey: normalizePowerPrompterPresetSourceFileKey(activeFilePath),
          createdAt: now,
          updatedAt: now,
        };
      const nextPresets = existing
        ? powerPrompterPresets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
        : [nextPreset, ...powerPrompterPresets];
      await persistPowerPrompterPresets(nextPresets, nextPreset.id);
      setPowerPrompterPresetNameDraft(name);
      showToast(existing ? `Updated preset: ${name}` : `Saved preset: ${name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to save preset'), 'error');
    } finally {
      setPowerPrompterPresetBusy(null);
    }
  }, [persistPowerPrompterPresets, powerPrompterPresetNameDraft, powerPrompterPresets, showToast]);

  const handleLoadPowerPrompterPreset = useCallback(async () => {
    const selectedPreset = powerPrompterPresets.find((preset) => preset.id === selectedPowerPrompterPresetId);
    if (!selectedPreset) {
      showToast('Choose a preset to load', 'error');
      return;
    }
    if (!currentFileRef.current) {
      showToast('Open or create a card file before loading a preset', 'error');
      return;
    }
    const activeFileKey = normalizePowerPrompterPresetSourceFileKey(currentFileRef.current);
    if (selectedPreset.sourceFileKey !== activeFileKey) {
      showToast('That preset belongs to another card file', 'error');
      await loadPowerPrompterPresets({ quiet: true });
      return;
    }

    setPowerPrompterPresetBusy('load');
    try {
      const activeFile = currentFileRef.current;
      const currentDocument = normalizePowerPrompterCardDocument(cardDocumentRef.current, activeFile);
      const existingSession = activePowerPrompterPresetSessionRef.current;
      const baseDocument = existingSession?.baseDocument || currentDocument;
      const baseContent = existingSession?.baseContent || contentRef.current || composeActivePromptFromCards(currentDocument.cards, currentDocument.activeQueueSet);
      const baseHadPendingChanges = existingSession?.baseHadPendingChanges ?? hasPendingChangesRef.current;
      const presetDocument = normalizePowerPrompterPresetDocument(selectedPreset.document);
      const normalized = {
        ...currentDocument,
        activeQueueSet: presetDocument.activeQueueSet,
        cards: normalizeChainCards(presetDocument.cards),
        deletedCardGroups: presetDocument.deletedCardGroups || {},
        updatedAt: new Date().toISOString(),
      };
      clearAutosaveTimer();
      const presetSession: PowerPrompterPresetSession = {
        presetId: selectedPreset.id,
        presetName: selectedPreset.name,
        sourceFile: activeFile,
        baseDocument,
        baseContent,
        baseHadPendingChanges,
        loadedAt: Date.now(),
      };
      activePowerPrompterPresetSessionRef.current = presetSession;
      setActivePowerPrompterPresetSession(presetSession);
      handleCardDocumentChange(normalized);
      hasPendingChangesRef.current = false;
      setQueueSetTarget(clampQueueSetId(normalized.activeQueueSet));
      handlePrompterPanelModeChange('editor');
      await persistPowerPrompterPresets(powerPrompterPresets, selectedPreset.id);
      showToast(`Loaded Preset Editor: ${selectedPreset.name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to load preset'), 'error');
    } finally {
      setPowerPrompterPresetBusy(null);
    }
  }, [
    handleCardDocumentChange,
    handlePrompterPanelModeChange,
    loadPowerPrompterPresets,
    persistPowerPrompterPresets,
    powerPrompterPresets,
    selectedPowerPrompterPresetId,
    showToast,
  ]);

  const handleUnloadPowerPrompterPreset = useCallback(() => {
    const session = activePowerPrompterPresetSessionRef.current;
    if (!session) return;
    const normalized = normalizePowerPrompterCardDocument(session.baseDocument, session.sourceFile || currentFileRef.current);
    const restored = {
      ...normalized,
      cards: normalizeChainCards(normalized.cards),
      updatedAt: new Date().toISOString(),
    };
    const restoredContent = session.baseContent || composeActivePromptFromCards(restored.cards, restored.activeQueueSet);
    clearAutosaveTimer();
    activePowerPrompterPresetSessionRef.current = null;
    setActivePowerPrompterPresetSession(null);
    setCardDocument(restored);
    setContent(restoredContent);
    cardDocumentRef.current = restored;
    contentRef.current = restoredContent;
    setQueueSetTarget(clampQueueSetId(restored.activeQueueSet));
    hasPendingChangesRef.current = !!session.baseHadPendingChanges;
    if (hasPendingChangesRef.current) {
      markPendingChange();
    }
    showToast(`Unloaded preset: ${session.presetName}`, 'success');
  }, [showToast]);

  const handleDeletePowerPrompterPreset = useCallback(async () => {
    const selectedPreset = powerPrompterPresets.find((preset) => preset.id === selectedPowerPrompterPresetId);
    if (!selectedPreset) {
      showToast('Choose a preset to delete', 'error');
      return;
    }

    setPowerPrompterPresetBusy('delete');
    try {
      const nextPresets = powerPrompterPresets.filter((preset) => preset.id !== selectedPreset.id);
      const nextSelectedId = nextPresets[0]?.id || '';
      await persistPowerPrompterPresets(nextPresets, nextSelectedId);
      setPowerPrompterPresetNameDraft(nextPresets[0]?.name || '');
      showToast(`Deleted preset: ${selectedPreset.name}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to delete preset'), 'error');
    } finally {
      setPowerPrompterPresetBusy(null);
    }
  }, [persistPowerPrompterPresets, powerPrompterPresets, selectedPowerPrompterPresetId, showToast]);

  const activeQueueSetAssignmentCount = useMemo(
    () => normalizeChainCards(cardDocument.cards).filter((card) => (
      normalizeQueueSetIds(card.queueSetIds, false).includes(queueSetTarget)
    )).length,
    [cardDocument.cards, queueSetTarget]
  );
  const totalQueueSetAssignmentCount = useMemo(
    () => normalizeChainCards(cardDocument.cards).filter((card) => normalizeQueueSetIds(card.queueSetIds, false).length > 0).length,
    [cardDocument.cards]
  );
  const handleClearSelectedQueueSetAssignments = useCallback(() => {
    if (!currentFileRef.current && cardDocumentRef.current.cards.length <= 0) return;
    const targetSetId = clampQueueSetId(queueSetTarget);
    let clearedCount = 0;
    const nextDocument: PowerPrompterCardDocument = {
      ...cardDocumentRef.current,
      cards: cardDocumentRef.current.cards.map((card) => {
        const currentSetIds = Array.isArray(card.queueSetIds) ? card.queueSetIds : [];
        if (!currentSetIds.includes(targetSetId)) return card;
        const nextSetIds = currentSetIds.filter((setId) => setId !== targetSetId);
        if (nextSetIds.length === currentSetIds.length) return card;
        clearedCount += 1;
        return {
          ...card,
          queueSetIds: nextSetIds,
          queueEnabled: nextSetIds.length > 0,
          queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, nextSetIds),
          updatedAt: new Date().toISOString(),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
    if (clearedCount <= 0) {
      showToast(`No variant prompts were assigned to Set ${targetSetId}.`, 'error');
      return;
    }
    handleCardDocumentChange(nextDocument);
    showToast(
      `Cleared Set ${targetSetId} from ${clearedCount} variant prompt${clearedCount === 1 ? '' : 's'}.`,
      'success'
    );
  }, [handleCardDocumentChange, queueSetTarget, showToast]);

  const handleClearAllQueueSetAssignments = useCallback(() => {
    if (!currentFileRef.current && cardDocumentRef.current.cards.length <= 0) return;
    let clearedCount = 0;
    const nextDocument: PowerPrompterCardDocument = {
      ...cardDocumentRef.current,
      cards: cardDocumentRef.current.cards.map((card) => {
        const currentSetIds = Array.isArray(card.queueSetIds) ? card.queueSetIds : [];
        if (currentSetIds.length <= 0) return card;
        clearedCount += 1;
        return {
          ...card,
          queueSetIds: [],
          queueEnabled: false,
          queueCycleWeights: {},
          updatedAt: new Date().toISOString(),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
    if (clearedCount <= 0) {
      showToast('No variant prompts are assigned to any queue set.', 'error');
      return;
    }
    handleCardDocumentChange(nextDocument);
    showToast(
      `Cleared all queue-set assignments from ${clearedCount} variant prompt${clearedCount === 1 ? '' : 's'}.`,
      'success'
    );
  }, [handleCardDocumentChange, showToast]);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const flushPending = () => {
      if (!currentFileRef.current) return;
      if (!hasPendingChangesRef.current) return;
      void savePromptFile(currentFileRef.current, contentRef.current, { source: 'autosave' });
    };

    const handleBeforeUnload = () => {
      flushPending();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPending();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleInsert = (text: string) => {
    const value = String(text || '');
    if (!value) return;
    if (editorRef.current) {
      editorRef.current.insertAtCursor(value);
      return;
    }
    if (currentFileRef.current) {
      pendingEditorInsertsRef.current.push(value);
      setPrompterPanelMode('editor');
      setPendingEditorInsertTick((tick) => tick + 1);
      return;
    }
    const nextContent = contentRef.current + (contentRef.current.endsWith('\n') ? '' : '\n') + value;
    handleClassicContentChange(nextContent);
  };

  useEffect(() => {
    if (prompterPanelMode !== 'editor') return;
    if (pendingEditorInsertsRef.current.length <= 0) return;
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      const target = editorRef.current;
      if (!target) {
        if (typeof window === 'undefined') return;
        window.setTimeout(flush, 24);
        return;
      }
      const pending = pendingEditorInsertsRef.current.splice(0);
      for (const entry of pending) {
        target.insertAtCursor(entry);
      }
    };
    if (typeof window === 'undefined') {
      flush();
      return undefined;
    }
    const raf = window.requestAnimationFrame(flush);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [pendingEditorInsertTick, prompterPanelMode, currentFile]);

  const handleToggleCSV = async (name: string) => {
    const sourceName = String(name || '').trim();
    if (!sourceName) return;
    const legacyName = sourceName.includes(':') ? sourceName.slice(sourceName.indexOf(':') + 1).trim() : sourceName;
    const aliases = new Set([sourceName, legacyName].filter(Boolean));
    const isEnabled = enabledCSVs.some((csv) => aliases.has(csv));
    const nextEnabled = isEnabled
      ? enabledCSVs.filter((csv) => !aliases.has(csv))
      : [...enabledCSVs.filter((csv) => csv !== legacyName), sourceName];
    setEnabledCSVs(nextEnabled);
    const nextSettings: PowerPrompterSettings = {
      ...settings,
      enabledCSVs: nextEnabled,
      editorMode: 'cards',
    };
    setSettings(nextSettings);
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      console.error('Failed to save CSV settings');
    }
  };

  const collectTrackedQueueRequestIds = (): string[] => {
    const ids = new Set<string>();
    for (const item of queueStackItemsRef.current) {
      const id = String(item.requestId || '').trim();
      if (id) ids.add(id);
    }
    const visualId = String(queueVisualStateRef.current?.requestId || '').trim();
    if (visualId) ids.add(visualId);
    for (const requestId of pendingQueueRequestsRef.current.keys()) {
      const id = String(requestId || '').trim();
      if (id) ids.add(id);
    }
    for (const requestId of queueRequestMetaRef.current.keys()) {
      const id = String(requestId || '').trim();
      if (id) ids.add(id);
    }
    return Array.from(ids);
  };

  const resolveQueueTargetBridgeId = (targetBridgeId?: string): string => {
    const currentGeneration = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
    const currentPipelineTargetId = createUmbraUiPipelineTargetId(normalizeUmbraUiPipelineSelection(
      cardDocumentRef.current.pipeline,
      {
        feature: 'txt2img',
        modelFamily: cardDocumentRef.current.modelType,
        modelSource: currentGeneration.modelType,
      },
    ));
    if (currentPipelineTargetId) return currentPipelineTargetId;
    const preferredId = String(targetBridgeId || '').trim();
    const selectedWorkflowId = String(effectiveQueueTargetSelectionId || '').trim();
    const knownApiWorkflowTargetId = resolveKnownApiWorkflowTargetId(preferredId, selectedWorkflowId, getDefaultApiWorkflowTargetId(apiWorkflowItems));
    if (knownApiWorkflowTargetId) return knownApiWorkflowTargetId;
    if (preferredId && workflowTargets.some((entry) => entry.bridgeId === preferredId)) {
      return preferredId;
    }
    if (preferredId && bridgeTargets.some((entry) => entry.bridgeId === preferredId)) {
      return preferredId;
    }
    if (selectedWorkflowId && workflowTargets.some((entry) => entry.bridgeId === selectedWorkflowId)) {
      return selectedWorkflowId;
    }
    const effectiveId = String(effectiveQueueTargetBridgeId || '').trim();
    if (effectiveId && bridgeTargets.some((entry) => entry.bridgeId === effectiveId)) {
      return effectiveId;
    }
    return String(bridgeTargets[0]?.bridgeId || '').trim();
  };

  const resolveQueueControlTarget = (
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): { targetBridgeId: string; queueTargetType: PowerPrompterQueueTargetType } => {
    const preferredId = String(targetBridgeId || '').trim();
    return {
      targetBridgeId: resolveQueueTargetBridgeId(preferredId),
      queueTargetType: 'pipeline',
    };
  };

  const clearLocalPausedQueueSnapshotState = () => {
    if (queueSnapshotPersistTimerRef.current) {
      clearTimeout(queueSnapshotPersistTimerRef.current);
      queueSnapshotPersistTimerRef.current = null;
    }
    queueSnapshotPersistDueAtRef.current = 0;
    lastPersistedQueueSnapshotSignatureRef.current = '';
    restoredPausedQueueRef.current = null;
    powerPrompterQueueSession.restoredPausedQueue = null;
    void writePersistedPausedQueueSnapshot(null);
    queueRequestMetaRef.current.clear();
    completedPromptIndicesRef.current.clear();
    clearQueueTimingState();
    intentionallyCanceledQueueRequestIdsRef.current.clear();
    clearedQueueRequestIdsRef.current.clear();
    queueVisualStateRef.current = null;
    powerPrompterQueueSession.queueVisualState = null;
    queuePausedRef.current = false;
    powerPrompterQueueSession.queuePaused = false;
    setQueuePaused(false);
    setQueueVisualState(null);
    updateQueueStackItemsSynced([]);
    setGenerationPreview((prev) => prev ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev);
    scheduleGenerationPreviewHide();
  };

  const isLocalPausedQueueSnapshotActive = (): boolean => {
    const visual = queueVisualStateRef.current;
    const visualRequestId = String(visual?.requestId || '').trim();
    const hasTrackedMeta = visualRequestId ? queueRequestMetaRef.current.has(visualRequestId) : false;
    const looksLikePausedVisual = visualRequestId.startsWith('paused-');
    const looksLikeStagedVisual = visualRequestId.startsWith('staged-');
    const hasEnabledSnapshot = POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED && !!restoredPausedQueueRef.current;
    return queuePausedRef.current
      && (hasEnabledSnapshot || looksLikePausedVisual || looksLikeStagedVisual)
      && (!hasTrackedMeta || looksLikePausedVisual || looksLikeStagedVisual);
  };

  const pruneTrackedQueueRequestToActivePrompt = (requestIdInput: string) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return;
    const activeVisual = queueVisualStateRef.current;
    if (!activeVisual || String(activeVisual.requestId || '').trim() !== requestId) return;
    const activeIndex = Math.max(0, Math.floor(Number(activeVisual.activeIndex) || 0));
    const activeMeta = queueRequestMetaRef.current.get(requestId);
    if (!activeMeta) return;
    const keptPrompt = String(activeMeta.prompts[activeIndex] || '').trim();
    const keptPromptSetId = clampQueueSetId(activeMeta.promptSetIds[activeIndex] ?? activeMeta.setId);
    const keptGeneration = normalizePowerPrompterGenerationControls(activeMeta.generationByPrompt[activeIndex]);
    if (!keptPrompt) return;
    logQueueDebug('queue:pruneRequestToActivePrompt:start', { requestId, activeIndex, total: activeMeta.prompts.length });

    queueRequestMetaRef.current.set(requestId, {
      mode: activeMeta.mode,
      setId: activeMeta.setId,
      randomApplied: activeMeta.randomApplied,
      queueTargetType: activeMeta.queueTargetType,
      targetBridgeId: activeMeta.targetBridgeId || '',
      dispatchDelayMs: Math.max(0, Math.floor(Number(activeMeta.dispatchDelayMs ?? queueDispatchDelayMsRef.current) || 0)),
      prompts: [keptPrompt],
      promptEntries: activeMeta.promptEntries?.[activeIndex] ? [activeMeta.promptEntries[activeIndex]] : undefined,
      promptSetIds: [keptPromptSetId],
      promptOutputSubfolders: [String(activeMeta.promptOutputSubfolders?.[activeIndex] || '')],
      promptStyleNames: [String(activeMeta.promptStyleNames?.[activeIndex] || '')],
      promptSeedGroupIds: [String(activeMeta.promptSeedGroupIds?.[activeIndex] || `${keptPromptSetId}:0`)],
      generationByPrompt: [keptGeneration],
    });

    setQueueVisualState((prev) => (
      prev && String(prev.requestId || '').trim() === requestId
        ? {
          ...prev,
          prompts: [keptPrompt],
          promptEntries: prev.promptEntries?.[activeIndex] ? [prev.promptEntries[activeIndex]] : undefined,
          promptIds: [String(prev.promptIds?.[activeIndex] || '')],
          promptSeeds: [Number(prev.promptSeeds?.[activeIndex] || 0)],
          activeIndex: 0,
          updatedAt: Date.now(),
        }
        : prev
    ));

    updateQueueStackItemsSynced((prev) =>
      prev
        .filter((item) => item.requestId !== requestId || item.promptIndex === activeIndex)
        .map((item) => {
          if (item.requestId !== requestId) return item;
          return {
            ...item,
            promptIndex: 0,
            status: item.status === 'failed' ? 'failed' : 'running',
            exiting: false,
          };
        })
    );
    scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
    logQueueDebug('queue:pruneRequestToActivePrompt:end', { requestId, activeIndex });
  };

  const requestQueueCancelThroughWebSocket = (
    requestIds: string[],
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    const normalizedRequestIds = Array.from(new Set(
      requestIds.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0)
    ));
    pendingQueueCancelScopeRef.current = normalizedRequestIds;
    logQueueDebug('ws:queue_cancel:send:start', { requestIds: normalizedRequestIds, targetBridgeId, queueTargetType });
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      pendingQueueCancelScopeRef.current = [];
      logQueueDebug('ws:queue_cancel:send:blocked', { requestIds: normalizedRequestIds });
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    const sent = sendPrompterWsMessage({
      type: 'queue_cancel',
      requestId: createRequestId(),
      requestIds: normalizedRequestIds,
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
    });
    logQueueDebug('ws:queue_cancel:send:done', { requestIds: normalizedRequestIds, sent, resolvedTarget });
    return sent;
  };

  const requestQueueInterruptActiveThroughWebSocket = (
    activeRequestId?: string,
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    const normalizedActiveRequestId = String(activeRequestId || '').trim();
    logQueueDebug('ws:queue_interrupt_active:send:start', { activeRequestId: normalizedActiveRequestId, targetBridgeId, queueTargetType });
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      logQueueDebug('ws:queue_interrupt_active:send:blocked');
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    const sent = sendPrompterWsMessage({
      type: 'queue_interrupt_active',
      requestId: createRequestId(),
      ...(normalizedActiveRequestId ? { activeRequestId: normalizedActiveRequestId } : {}),
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
    });
    logQueueDebug('ws:queue_interrupt_active:send:done', { activeRequestId: normalizedActiveRequestId, sent, resolvedTarget });
    return sent;
  };

  const requestQueueClearFutureThroughWebSocket = (
    activeRequestId: string,
    requestIds: string[],
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    const activeId = String(activeRequestId || '').trim();
    const normalizedRequestIds = Array.from(new Set(
      requestIds
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0 && entry !== activeId)
    ));
    pendingQueueClearFutureScopeRef.current = normalizedRequestIds;
    logQueueDebug('ws:queue_clear_future:send:start', { activeRequestId: activeId, requestIds: normalizedRequestIds, targetBridgeId, queueTargetType });
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      pendingQueueClearFutureScopeRef.current = [];
      logQueueDebug('ws:queue_clear_future:send:blocked', { activeRequestId: activeId, requestIds: normalizedRequestIds });
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    const sent = sendPrompterWsMessage({
      type: 'queue_clear_future',
      requestId: createRequestId(),
      activeRequestId,
      requestIds: normalizedRequestIds,
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
    });
    logQueueDebug('ws:queue_clear_future:send:done', { activeRequestId: activeId, requestIds: normalizedRequestIds, sent, resolvedTarget });
    return sent;
  };

  const resumePersistedPausedQueue = async (
    snapshot: PersistedPausedQueueSnapshot,
    options?: {
      appendToLiveQueue?: boolean;
    }
  ) => {
    if (queueingMode) return false;
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('Power Prompter websocket is not connected yet.');
    }
    const prompts = snapshot.prompts.map((entry) => normalizePowerPrompterPromptText(String(entry || '').trim())).filter(Boolean);
    if (prompts.length <= 0) {
      throw new Error('No paused prompts were available to resume.');
    }
    const promptSetIds = prompts.map((_, index) => clampQueueSetId(snapshot.promptSetIds[index] ?? snapshot.activeSetId));
    const generationByPrompt = prompts.map((_, index) =>
      normalizePowerPrompterGenerationControls(snapshot.generationByPrompt[index])
    );
    const sourceGroupSnapshots = snapshot.groupSnapshots || [];
    const sourceGroups = sourceGroupSnapshots.length > 0
      ? sourceGroupSnapshots
        .map((groupSnapshot) => {
          const sourceRequestId = String(groupSnapshot.requestId || groupSnapshot.id || '').trim();
          const rawIndices = groupSnapshot.promptIndices?.length
            ? groupSnapshot.promptIndices
            : Array.from(
              { length: Math.max(0, Math.floor(Number(groupSnapshot.promptCount) || 0)) },
              (_, index) => Math.max(0, Math.floor(Number(groupSnapshot.promptStartIndex) || 0)) + index
            );
          const sourceIndices = Array.from(new Set(
            rawIndices
              .map((entry) => Math.max(0, Math.floor(Number(entry) || 0)))
              .filter((entry) => entry >= 0 && entry < prompts.length)
          )).sort((a, b) => a - b);
          return sourceRequestId && sourceIndices.length > 0
            ? { sourceRequestId, sourceIndices, groupSnapshot }
            : null;
        })
        .filter((entry): entry is { sourceRequestId: string; sourceIndices: number[]; groupSnapshot: PersistedQueueGroupSnapshot } => !!entry)
      : [];
    if (sourceGroups.length <= 0) {
      const promptRequestIds = prompts.map((_, index) =>
        String(snapshot.requestIds?.[index] || '').trim() || `paused-${snapshot.savedAt}`
      );
      const groupedPromptIndices = new Map<string, number[]>();
      promptRequestIds.forEach((requestId, promptIndex) => {
        const normalizedRequestId = String(requestId || '').trim() || `paused-${snapshot.savedAt}`;
        const existing = groupedPromptIndices.get(normalizedRequestId);
        if (existing) existing.push(promptIndex);
        else groupedPromptIndices.set(normalizedRequestId, [promptIndex]);
      });
      for (const [sourceRequestId, sourceIndices] of groupedPromptIndices.entries()) {
        sourceGroups.push({
          sourceRequestId,
          sourceIndices,
          groupSnapshot: sourceGroupSnapshots.find((entry) => String(entry.requestId || '').trim() === sourceRequestId) as PersistedQueueGroupSnapshot,
        });
      }
    }
    const liveRequestIds: string[] = [];
    const resumedQueueTargetType = normalizeQueueTargetType(snapshot.queueTargetType || selectedQueueTargetType);
    const resumedDispatchDelayMs = Math.max(0, Math.floor(Number(snapshot.dispatchDelayMs) || 0));
    const resolvedQueueTarget = resolveQueueControlTarget(
      String(snapshot.targetBridgeId || '').trim() || effectiveQueueTargetBridgeId,
      resumedQueueTargetType
    );
    const appendToLiveQueue = options?.appendToLiveQueue === true;
    logPowerPrompterDebug('queue:resume:start', {
      promptCount: prompts.length,
      requestCount: sourceGroups.length,
      groupCount: snapshot.groupSnapshots?.length || 0,
      mode: snapshot.mode,
      activeSetId: snapshot.activeSetId,
      appendToLiveQueue,
      targetBridgeId: resolvedQueueTarget.targetBridgeId,
      queueTargetType: resolvedQueueTarget.queueTargetType,
      dispatchDelayMs: resumedDispatchDelayMs,
    }, { includeQueue: true });
    setQueueDispatchDelayMs(resumedDispatchDelayMs);
    try {
      if (!appendToLiveQueue) {
        queueRequestMetaRef.current.clear();
        completedPromptIndicesRef.current.clear();
        clearQueueTimingState();
      }
      const liveGroups = sourceGroups.map(({ sourceRequestId, sourceIndices, groupSnapshot: sourceGroupSnapshot }) => {
        const requestId = createRequestId();
        liveRequestIds.push(requestId);
        const groupPromptSetIds = sourceIndices.map((sourceIndex) => promptSetIds[sourceIndex] ?? snapshot.activeSetId);
        const groupPrompts = sourceIndices.map((sourceIndex) => prompts[sourceIndex] || '');
        const groupPromptEntries = snapshot.promptEntries
          ? sourceIndices.map((sourceIndex) => snapshot.promptEntries?.[sourceIndex] || { prompt: prompts[sourceIndex] || '', tokens: [] })
          : undefined;
        const groupGenerationByPrompt = sourceIndices.map((sourceIndex) => generationByPrompt[sourceIndex]);
        const groupOutputSubfolders = sourceIndices.map((sourceIndex) => String(snapshot.promptOutputSubfolders?.[sourceIndex] || '').trim());
        const groupStyleNames = sourceIndices.map((sourceIndex) => String(snapshot.promptStyleNames?.[sourceIndex] || '').trim());
        const groupSeedGroupIds = sourceIndices.map((sourceIndex, groupIndex) =>
          String(snapshot.promptSeedGroupIds?.[sourceIndex] || `${groupPromptSetIds[groupIndex] ?? snapshot.activeSetId}:${groupIndex}`).trim()
        );
        queueRequestMetaRef.current.set(requestId, {
          mode: snapshot.mode,
          setId: clampQueueSetId(groupPromptSetIds[0] ?? snapshot.activeSetId),
          randomApplied: snapshot.randomApplied === true,
          queueTargetType: resolvedQueueTarget.queueTargetType,
          targetBridgeId: resolvedQueueTarget.targetBridgeId,
          dispatchDelayMs: resumedDispatchDelayMs,
          prompts: groupPrompts,
          promptEntries: groupPromptEntries,
          promptSetIds: groupPromptSetIds,
          promptOutputSubfolders: groupOutputSubfolders,
          promptStyleNames: groupStyleNames,
          promptSeedGroupIds: groupSeedGroupIds,
          generationByPrompt: groupGenerationByPrompt,
          editorSnapshot: normalizeQueueEditorSnapshot(sourceGroupSnapshot?.editorSnapshot),
        });
        return {
          sourceRequestId,
          sourceIndices,
          requestId,
          prompts: groupPrompts,
          promptEntries: groupPromptEntries,
          promptSetIds: groupPromptSetIds,
          promptOutputSubfolders: groupOutputSubfolders,
          promptStyleNames: groupStyleNames,
          promptSeedGroupIds: groupSeedGroupIds,
          generationByPrompt: groupGenerationByPrompt,
        };
      });
      const primaryGroup = liveGroups[0];
      if (!primaryGroup) throw new Error('No paused prompts were available to resume.');
      logPowerPrompterDebug('queue:resume:liveGroupsBuilt', {
        groupCount: liveGroups.length,
        liveRequestIds,
        promptCounts: liveGroups.map((group) => group.prompts.length),
        sourceRequestIds: liveGroups.map((group) => group.sourceRequestId),
      }, { includeQueue: true });
      console.info('[PowerPrompterQueue] start groups', {
        groupCount: liveGroups.length,
        promptCounts: liveGroups.map((group) => group.prompts.length),
        sourceRequestIds: liveGroups.map((group) => group.sourceRequestId),
        liveRequestIds,
      });
      setQueuePaused(false);
      const nextStackItems = liveGroups.flatMap((group, groupIndex) =>
        group.prompts.map((prompt, promptIndex) => ({
          id: `${group.requestId}-${promptIndex}-${prompt.slice(0, 24)}`,
          requestId: group.requestId,
          promptIndex,
          prompt,
          styleName: String(group.promptStyleNames?.[promptIndex] || '').trim(),
          styleFolderName: String(group.promptOutputSubfolders?.[promptIndex] || '').trim(),
          status: 'pending' as const,
          createdAt: Date.now() + (groupIndex * 100000) + promptIndex,
          exiting: false,
        }))
      );
      if (appendToLiveQueue) {
        const appendedStackItems = applyQueueStackRunningState([
          ...queueStackItemsRef.current,
          ...nextStackItems,
        ]);
        queueStackItemsRef.current = appendedStackItems;
        powerPrompterQueueSession.queueStackItems = appendedStackItems;
        setQueueStackItemsState(appendedStackItems);
      } else {
        setQueueVisualState({
          requestId: primaryGroup.requestId,
          mode: snapshot.mode,
          activeSetId: snapshot.activeSetId,
          prompts: primaryGroup.prompts,
          promptEntries: primaryGroup.promptEntries,
          promptIds: primaryGroup.prompts.map(() => ''),
          promptSeeds: primaryGroup.prompts.map(() => 0),
          activeIndex: 0,
          jobProgress: 0,
        });
        updateQueueStackItemsSynced(nextStackItems);
        clearGenerationPreviewHideTimer();
        restoredPausedQueueRef.current = null;
        powerPrompterQueueSession.restoredPausedQueue = restoredPausedQueueRef.current;
        lastPersistedQueueSnapshotSignatureRef.current = '';
      }
      sendPrompterSync();
      requestQueueDispatchDelayUpdateThroughWebSocket(
        resumedDispatchDelayMs,
        resolvedQueueTarget.targetBridgeId,
        resolvedQueueTarget.queueTargetType
      );
      const dispatchedRequestIds: string[] = [];
      for (const [groupIndex, group] of liveGroups.entries()) {
        console.info('[PowerPrompterQueue] dispatch group', {
          groupIndex: groupIndex + 1,
          groupCount: liveGroups.length,
          requestId: group.requestId,
          promptCount: group.prompts.length,
        });
        const dispatched = await dispatchTrackedQueueGroupToBridge(
          group.requestId,
          appendToLiveQueue ? 'append backend queue group' : 'start backend queue group',
          { allowBridgeBacklog: true }
        );
        if (!dispatched) {
          if (!isQueueGroupSubmittedToBridge(group.requestId)) {
            throw new Error(`Failed to dispatch queued group ${dispatchedRequestIds.length + 1}.`);
          }
          logPowerPrompterDebug('queue:resume:alreadySubmitted', {
            requestId: group.requestId,
            groupIndex: groupIndex + 1,
          }, { includeQueue: true });
        }
        dispatchedRequestIds.push(group.requestId);
      }
      const queuedCount = liveGroups.reduce((count, group) => count + group.prompts.length, 0);
      if (appendToLiveQueue) {
        clearMatchingLocalPausedSnapshotRequestIds(snapshot.requestIds);
      } else {
        replaceLocalPausedQueueSnapshot(null);
        void writePersistedPausedQueueSnapshot(null);
      }
      logPowerPrompterDebug('queue:resume:success', {
        queuedCount,
        liveRequestIds,
        appendToLiveQueue,
        dispatchedRequestIds,
        bridgeQueuedRequestIds: dispatchedRequestIds,
      }, { includeQueue: true });
      showToast(
        appendToLiveQueue
          ? `Staged ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} behind the active queue`
          : `Started queue with ${liveGroups.length} group${liveGroups.length === 1 ? '' : 's'} staged`,
        'success'
      );
      return true;
    } catch (error: any) {
      logPowerPrompterDebug('queue:resume:error', {
        message: String(error?.message || error || 'Unknown error'),
        liveRequestIds,
        appendToLiveQueue,
      }, { includeQueue: true });
      for (const requestId of liveRequestIds) {
        queueRequestMetaRef.current.delete(requestId);
      }
      if (appendToLiveQueue) {
        updateQueueStackItemsSynced((prev) =>
          prev.filter((item) => !liveRequestIds.includes(String(item.requestId || '').trim()))
        );
        throw error;
      }
      restoredPausedQueueRef.current = snapshot;
      powerPrompterQueueSession.restoredPausedQueue = snapshot;
      setQueueDispatchDelayMs(resumedDispatchDelayMs);
      void writePersistedPausedQueueSnapshot(snapshot);
      restoreRecoverableQueueAsPausedSnapshot(snapshot, 'resume failed; restored paused queue');
      setGenerationPreview((prev) => prev ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev);
      scheduleGenerationPreviewHide();
      throw error;
    } finally {
      if (queueingMode) setQueueingMode(null);
    }
  };

  const requestQueuePauseToggleThroughWebSocket = (
    paused: boolean,
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    return sendPrompterWsMessage({
      type: paused ? 'queue_pause' : 'queue_resume',
      requestId: createRequestId(),
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
    });
  };

  const requestQueueDispatchDelayUpdateThroughWebSocket = (
    dispatchDelayMs: number,
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    return sendPrompterWsMessage({
      type: 'queue_delay_update',
      requestId: createRequestId(),
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
      dispatchDelayMs: Math.max(0, Math.floor(Number(dispatchDelayMs) || 0)),
    });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (!governorShouldRun('powerprompter:stall-check', PROMPTER_ACTIVE_PROMPT_STALL_CHECK_MS)) return;
      const release = governorTryAcquire('background');
      if (!release) return;
      try {
      if (queuePausedRef.current) return;
      const visual = queueVisualStateRef.current;
      const visualRequestId = String(visual?.requestId || '').trim();
      const visualPromptIndex = Math.max(0, Math.floor(Number(visual?.activeIndex) || 0));
      const visualRunningItem = visualRequestId
        ? queueStackItemsRef.current.find((item) =>
          !item.exiting
          && item.status === 'running'
          && String(item.requestId || '').trim() === visualRequestId
          && Math.max(0, Math.floor(Number(item.promptIndex) || 0)) === visualPromptIndex
          && queueRequestMetaRef.current.has(visualRequestId)
        ) || null
        : null;
      if (visualRequestId && !visualRunningItem && queueRequestMetaRef.current.has(visualRequestId)) {
        const visualKey = getQueuePromptEventKey(visualRequestId, visualPromptIndex);
        const visualLastActivityAt = Number(visualKey ? queuePromptLastActivityAtRef.current.get(visualKey) : 0) || 0;
        logPowerPrompterDebug('queue:stallCheck:skippedNoVisualRunningItem', {
          requestId: visualRequestId,
          visualPromptIndex,
          visualIdleMs: visualLastActivityAt > 0 ? Date.now() - visualLastActivityAt : null,
        }, { includeQueue: true });
        return;
      }
      const runningItem = visualRunningItem;
      if (!runningItem) return;
      const requestId = String(runningItem.requestId || '').trim();
      const promptIndex = Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0));
      if (visualRequestId === requestId && visualPromptIndex !== promptIndex) {
        const visualKey = getQueuePromptEventKey(visualRequestId, visualPromptIndex);
        const visualLastActivityAt = Number(visualKey ? queuePromptLastActivityAtRef.current.get(visualKey) : 0) || 0;
        if (visualLastActivityAt > 0 && Date.now() - visualLastActivityAt < PROMPTER_ACTIVE_PROMPT_STALL_MS) {
          markQueueStackPromptRunning(visualRequestId, visualPromptIndex);
          logPowerPrompterDebug('queue:stallCheck:realignedRunningPrompt', {
            requestId,
            stalePromptIndex: promptIndex,
            visualPromptIndex,
            visualIdleMs: Date.now() - visualLastActivityAt,
          }, { includeQueue: true });
          return;
        }
      }
      const key = getQueuePromptEventKey(requestId, promptIndex);
      if (!key || stalledQueuePromptKeysRef.current.has(key)) return;
      const startedAt = Number(queuePromptStartedAtRef.current.get(key)) || Number(runningItem.createdAt) || Date.now();
      const lastActivityAt = Number(queuePromptLastActivityAtRef.current.get(key)) || startedAt;
      const idleMs = Date.now() - lastActivityAt;
      if (idleMs < PROMPTER_ACTIVE_PROMPT_STALL_MS) return;

      stalledQueuePromptKeysRef.current.add(key);
      scheduleRecoverableQueueSnapshotPersist({ paused: false, clearWhenEmpty: true, delayMs: 50 });
      logPowerPrompterDebug('queue:stallDetected:warnOnly', {
        requestId,
        promptIndex,
        idleMs,
        thresholdMs: PROMPTER_ACTIVE_PROMPT_STALL_MS,
      }, { includeQueue: true });
      showToastRef.current(
        POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED
          ? 'ComfyUI progress looks stale. Recovery snapshot saved; queue was not paused.'
          : 'ComfyUI progress looks stale. Queue was not paused.',
        'error'
      );
      } finally {
        release();
      }
    }, PROMPTER_ACTIVE_PROMPT_STALL_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const requestQueueReorderThroughWebSocket = (
    payload: {
      requestOrder?: string[];
      promptOrders?: Array<{ requestId: string; promptOrder: number[] }>;
    },
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): boolean => {
    if (!POWER_PROMPTER_QUEUE_MANAGER_REORDER_ENABLED) {
      logQueueDebug('ws:queue_reorder:disabled', { payload, targetBridgeId, queueTargetType });
      return false;
    }
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    const requestOrder = Array.isArray(payload.requestOrder)
      ? payload.requestOrder.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0)
      : [];
    const promptOrders = Array.isArray(payload.promptOrders)
      ? payload.promptOrders
        .map((entry) => ({
          requestId: String(entry?.requestId || '').trim(),
          promptOrder: Array.isArray(entry?.promptOrder)
            ? entry.promptOrder
              .map((index) => Number(index))
              .filter((index) => Number.isFinite(index))
              .map((index) => Math.max(0, Math.floor(index)))
            : [],
        }))
        .filter((entry) => entry.requestId.length > 0 && entry.promptOrder.length > 0)
      : [];
    if (requestOrder.length <= 0 && promptOrders.length <= 0) {
      return false;
    }
    return sendPrompterWsMessage({
      type: 'queue_reorder',
      requestId: createRequestId(),
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
      requestOrder,
      promptOrders,
    });
  };

  const requestQueuePromptRemoveThroughWebSocket = (
    promptRemovals: Array<{ requestId: string; promptIndices: number[] }>,
    targetBridgeId?: string,
    queueTargetType?: PowerPrompterQueueTargetType
  ): string | null => {
    logQueueDebug('ws:queue_prompt_remove:send:start', { promptRemovals, targetBridgeId, queueTargetType });
    if (!prompterWsReadyRef.current || !prompterWsRef.current || prompterWsRef.current.readyState !== WebSocket.OPEN) {
      logQueueDebug('ws:queue_prompt_remove:send:blocked', { promptRemovals });
      return null;
    }
    const resolvedTarget = resolveQueueControlTarget(targetBridgeId, queueTargetType);
    const normalizedPromptRemovals = Array.isArray(promptRemovals)
      ? promptRemovals
        .map((entry) => ({
          requestId: String(entry?.requestId || '').trim(),
          promptIndices: Array.isArray(entry?.promptIndices)
            ? Array.from(new Set(
              entry.promptIndices
                .map((index) => Number(index))
                .filter((index) => Number.isFinite(index))
                .map((index) => Math.max(0, Math.floor(index)))
            ))
            : [],
        }))
        .filter((entry) => entry.requestId.length > 0 && entry.promptIndices.length > 0)
      : [];
    const dedupedPromptRemovals = normalizedPromptRemovals
      .map((entry) => ({
        ...entry,
        promptIndices: entry.promptIndices.filter((promptIndex) =>
          !pendingQueuePromptRemovalKeysRef.current.has(`${entry.requestId}:${promptIndex}`)
        ),
      }))
      .filter((entry) => entry.promptIndices.length > 0);
    if (dedupedPromptRemovals.length <= 0) {
      logQueueDebug('ws:queue_prompt_remove:send:empty', { promptRemovals });
      return normalizedPromptRemovals.length > 0 ? 'deduped' : null;
    }
    const requestId = createRequestId();
    const sent = sendPrompterWsMessage({
      type: 'queue_prompt_remove',
      requestId,
      targetBridgeId: resolvedTarget.targetBridgeId || undefined,
      queueTargetType: resolvedTarget.queueTargetType,
      promptRemovals: dedupedPromptRemovals,
    });
    if (!sent) {
      logQueueDebug('ws:queue_prompt_remove:send:failed', { requestId, normalizedPromptRemovals: dedupedPromptRemovals, resolvedTarget });
      return null;
    }
    for (const entry of dedupedPromptRemovals) {
      for (const promptIndex of entry.promptIndices) {
        pendingQueuePromptRemovalKeysRef.current.add(`${entry.requestId}:${promptIndex}`);
      }
    }
    pendingQueuePromptRemovalOpsRef.current.set(requestId, dedupedPromptRemovals);
    logQueueDebug('ws:queue_prompt_remove:send:done', { requestId, normalizedPromptRemovals: dedupedPromptRemovals, resolvedTarget });
    return requestId;
  };

  function applyLocalRequestOrder(requestOrder: string[]) {
    const normalizedOrder = requestOrder.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0);
    if (normalizedOrder.length <= 0) return false;
    let changed = false;
    updateQueueStackItemsSynced((prev) => {
      const presentRequestIds = Array.from(new Set(prev.map((item) => String(item.requestId || '').trim()).filter(Boolean)));
      if (presentRequestIds.length <= 1) return prev;
      const finalOrder = [
        ...normalizedOrder.filter((requestId) => presentRequestIds.includes(requestId)),
        ...presentRequestIds.filter((requestId) => !normalizedOrder.includes(requestId)),
      ];
      const requestBaseById = new Map<string, number>();
      finalOrder.forEach((requestId, index) => {
        requestBaseById.set(requestId, (index + 1) * 100000);
      });
      const next = prev.map((item) => {
        const requestId = String(item.requestId || '').trim();
        const base = requestBaseById.get(requestId);
        if (base === undefined) return item;
        const nextCreatedAt = base + Math.max(0, Math.floor(Number(item.promptIndex) || 0));
        if (nextCreatedAt !== item.createdAt) {
          changed = true;
          return { ...item, createdAt: nextCreatedAt };
        }
        return item;
      });
      return changed ? next : prev;
    });
    return changed;
  }

  function applyLocalPromptOrder(requestId: string, promptOrder: number[]) {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return false;
    const normalizedPromptOrder = Array.from(new Set(
      promptOrder
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.max(0, Math.floor(entry)))
    ));
    if (normalizedPromptOrder.length <= 0) return false;

    const activeVisual = queueVisualStateRef.current;
    const runningItem = queueStackItemsRef.current.find((item) =>
      !item.exiting
      && item.status === 'running'
      && String(item.requestId || '').trim() === normalizedRequestId
    ) || null;
    const lockedIndex = runningItem
      ? Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0))
      : -1;

    const requestMeta = queueRequestMetaRef.current.get(normalizedRequestId);
    const visualState = activeVisual && String(activeVisual.requestId || '').trim() === normalizedRequestId
      ? activeVisual
      : null;
    const sourceLength = Math.max(
      Number(requestMeta?.prompts?.length || 0),
      Number(visualState?.prompts?.length || 0),
      normalizedPromptOrder.length,
    );
    if (sourceLength <= 0) return false;

    const allIndices = Array.from({ length: sourceLength }, (_, index) => index);
    const immutablePrefix = lockedIndex >= 0 ? allIndices.filter((index) => index < lockedIndex) : [];
    const lockedSegment = lockedIndex >= 0 ? [lockedIndex] : [];
    const movableIndices = allIndices.filter((index) => index > lockedIndex);
    const desiredMovable = normalizedPromptOrder.filter((index) => movableIndices.includes(index));
    const finalOrder = [
      ...immutablePrefix,
      ...lockedSegment,
      ...desiredMovable,
      ...movableIndices.filter((index) => !desiredMovable.includes(index)),
    ];
    if (finalOrder.length !== sourceLength) return false;
    if (finalOrder.every((index, position) => index === position)) return false;

    const reorderValues = <T,>(values: T[], fallbackFactory: (index: number) => T): T[] =>
      finalOrder.map((sourceIndex, targetIndex) => values[sourceIndex] ?? fallbackFactory(targetIndex));

    if (requestMeta) {
      queueRequestMetaRef.current.set(normalizedRequestId, {
          ...requestMeta,
          prompts: reorderValues(requestMeta.prompts || [], () => ''),
          promptEntries: reorderValues(requestMeta.promptEntries || [], () => ({ prompt: '', tokens: [] })),
          promptSetIds: reorderValues(requestMeta.promptSetIds || [], () => requestMeta.setId),
          promptOutputSubfolders: reorderValues(requestMeta.promptOutputSubfolders || [], () => ''),
          promptStyleNames: reorderValues(requestMeta.promptStyleNames || [], () => ''),
          promptSeedGroupIds: reorderValues(requestMeta.promptSeedGroupIds || [], (index) => `${requestMeta.setId}:${index}`),
          generationByPrompt: reorderValues(requestMeta.generationByPrompt || [], () =>
            normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation)
          ),
      });
    }

    if (visualState) {
      setQueueVisualState((prev) => {
        if (!prev || String(prev.requestId || '').trim() !== normalizedRequestId) return prev;
        return {
          ...prev,
          prompts: reorderValues(prev.prompts || [], () => ''),
          promptEntries: reorderValues(prev.promptEntries || [], () => ({ prompt: '', tokens: [] })),
          promptIds: reorderValues(prev.promptIds || [], () => ''),
          promptSeeds: reorderValues(prev.promptSeeds || [], () => 0),
          activeIndex: lockedIndex >= 0 ? lockedIndex : Math.max(0, Math.floor(Number(prev.activeIndex) || 0)),
          updatedAt: Date.now(),
        };
      });
    }

    const newIndexByOldIndex = new Map<number, number>();
    finalOrder.forEach((sourceIndex, nextIndex) => {
      newIndexByOldIndex.set(sourceIndex, nextIndex);
    });

    let changed = false;
    updateQueueStackItemsSynced((prev) => {
      const next = prev.map((item) => {
        if (String(item.requestId || '').trim() !== normalizedRequestId) return item;
        const nextPromptIndex = newIndexByOldIndex.get(Math.max(0, Math.floor(Number(item.promptIndex) || 0)));
        if (nextPromptIndex === undefined) return item;
        const nextCreatedAt = Math.floor(Number(item.createdAt) || Date.now()) - Math.max(0, Math.floor(Number(item.promptIndex) || 0)) + nextPromptIndex;
        if (nextPromptIndex !== item.promptIndex || nextCreatedAt !== item.createdAt) {
          changed = true;
          return {
            ...item,
            promptIndex: nextPromptIndex,
            createdAt: nextCreatedAt,
          };
        }
        return item;
      });
      return changed ? next : prev;
    });
    return changed;
  }

  function applyLocalPromptRemoval(requestId: string, promptIndices: number[]) {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return false;
    const normalizedPromptIndices = Array.from(new Set(
      promptIndices
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.max(0, Math.floor(entry)))
    ));
    if (normalizedPromptIndices.length <= 0) return false;
    logQueueDebug('queue:applyLocalPromptRemoval:start', { requestId: normalizedRequestId, promptIndices: normalizedPromptIndices });

    const activeVisual = queueVisualStateRef.current;
    const runningItem = queueStackItemsRef.current.find((item) =>
      !item.exiting
      && item.status === 'running'
      && String(item.requestId || '').trim() === normalizedRequestId
    ) || null;
    const lockedIndex = runningItem
      ? Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0))
      : -1;
    const removableIndices = normalizedPromptIndices.filter((index) => lockedIndex < 0 || index > lockedIndex);
    if (removableIndices.length <= 0) {
      logQueueDebug('queue:applyLocalPromptRemoval:blockedByRunningPrompt', { requestId: normalizedRequestId, promptIndices: normalizedPromptIndices, lockedIndex });
      return false;
    }

    const requestMeta = queueRequestMetaRef.current.get(normalizedRequestId);
    const visualState = activeVisual && String(activeVisual.requestId || '').trim() === normalizedRequestId
      ? activeVisual
      : null;
    const sourceLength = Math.max(
      Number(requestMeta?.prompts?.length || 0),
      Number(visualState?.prompts?.length || 0),
      Math.max(-1, ...removableIndices) + 1,
    );
    if (sourceLength <= 0) return false;

    const removalSet = new Set(removableIndices.filter((index) => index < sourceLength));
    if (removalSet.size <= 0) {
      logQueueDebug('queue:applyLocalPromptRemoval:nothingInRange', { requestId: normalizedRequestId, removableIndices, sourceLength });
      return false;
    }
    const keepIndices = Array.from({ length: sourceLength }, (_, index) => index).filter((index) => !removalSet.has(index));
    if (keepIndices.length <= 0) {
      logQueueDebug('queue:applyLocalPromptRemoval:droppingRequest', { requestId: normalizedRequestId, removableIndices, sourceLength });
      dropTrackedQueueRequestState([normalizedRequestId]);
      return true;
    }
    removeLocalPausedSnapshotPromptIndices(normalizedRequestId, Array.from(removalSet));

    const keepValues = <T,>(values: T[], fallbackFactory: (index: number) => T): T[] =>
      keepIndices.map((sourceIndex, targetIndex) => values[sourceIndex] ?? fallbackFactory(targetIndex));

    if (requestMeta) {
      queueRequestMetaRef.current.set(normalizedRequestId, {
          ...requestMeta,
          prompts: keepValues(requestMeta.prompts || [], () => ''),
          promptEntries: keepValues(requestMeta.promptEntries || [], () => ({ prompt: '', tokens: [] })),
          promptSetIds: keepValues(requestMeta.promptSetIds || [], () => requestMeta.setId),
          promptOutputSubfolders: keepValues(requestMeta.promptOutputSubfolders || [], () => ''),
          promptStyleNames: keepValues(requestMeta.promptStyleNames || [], () => ''),
          promptSeedGroupIds: keepValues(requestMeta.promptSeedGroupIds || [], (index) => `${requestMeta.setId}:${index}`),
          generationByPrompt: keepValues(requestMeta.generationByPrompt || [], () =>
            normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation)
          ),
      });
    }

    const indexShiftBefore = (index: number) => removableIndices.filter((entry) => entry < index).length;
    if (visualState) {
      setQueueVisualState((prev) => {
        if (!prev || String(prev.requestId || '').trim() !== normalizedRequestId) return prev;
        const prevActiveIndex = Math.max(0, Math.floor(Number(prev.activeIndex) || 0));
        const nextActiveIndex = removalSet.has(prevActiveIndex)
          ? Math.max(0, Math.min(keepIndices.length - 1, keepIndices.findIndex((entry) => entry > prevActiveIndex)))
          : Math.max(0, prevActiveIndex - indexShiftBefore(prevActiveIndex));
        return {
          ...prev,
          prompts: keepValues(prev.prompts || [], () => ''),
          promptEntries: keepValues(prev.promptEntries || [], () => ({ prompt: '', tokens: [] })),
          promptIds: keepValues(prev.promptIds || [], () => ''),
          promptSeeds: keepValues(prev.promptSeeds || [], () => 0),
          activeIndex: Number.isFinite(nextActiveIndex) && nextActiveIndex >= 0 ? nextActiveIndex : 0,
          updatedAt: Date.now(),
        };
      });
    }

    const newIndexByOldIndex = new Map<number, number>();
    keepIndices.forEach((sourceIndex, nextIndex) => {
      newIndexByOldIndex.set(sourceIndex, nextIndex);
    });

    let changed = false;
    updateQueueStackItemsSynced((prev) => {
      const next = prev
        .filter((item) => {
          if (String(item.requestId || '').trim() !== normalizedRequestId) return true;
          const itemIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
          return !removalSet.has(itemIndex);
        })
        .map((item) => {
          if (String(item.requestId || '').trim() !== normalizedRequestId) return item;
          const itemIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
          const nextPromptIndex = newIndexByOldIndex.get(itemIndex);
          if (nextPromptIndex === undefined) return item;
          const nextCreatedAt = Math.floor(Number(item.createdAt) || Date.now()) - itemIndex + nextPromptIndex;
          if (nextPromptIndex !== item.promptIndex || nextCreatedAt !== item.createdAt) {
            changed = true;
            return {
              ...item,
              promptIndex: nextPromptIndex,
              createdAt: nextCreatedAt,
            };
          }
          return item;
        });
      return next;
    });
    logQueueDebug('queue:applyLocalPromptRemoval:end', { requestId: normalizedRequestId, removableIndices, keepCount: keepIndices.length });
    scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
    return true;
  }

  const shouldPreserveExistingLiveQueueVisualState = useCallback((nextRequestIdInput: string, replaceRequestIdInput?: string) => {
    const nextRequestId = String(nextRequestIdInput || '').trim();
    if (!nextRequestId) return false;
    const replaceRequestId = String(replaceRequestIdInput || '').trim();
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const liveRequestIds = new Set(
      queueStackItems
        .filter((item) => !item.exiting && (item.status === 'running' || item.status === 'pending'))
        .map((item) => String(item.requestId || '').trim())
        .filter((requestId) => requestId.length > 0 && requestId !== nextRequestId && requestId !== replaceRequestId)
    );
    if (liveRequestIds.size <= 0) return false;
    if (activeVisualRequestId && activeVisualRequestId.startsWith('paused-')) return true;
    if (activeVisualRequestId && liveRequestIds.has(activeVisualRequestId)) return true;
    return true;
  }, [queueStackItems]);

  const submitTrackedQueueRequest = async ({
    mode,
    setId,
    randomApplied,
    targetBridgeId,
    prompts,
    promptEntries,
    promptSetIds,
    promptOutputSubfolders,
    promptStyleNames,
    promptSeedGroupIds,
    generationByPrompt,
    successToast,
    replaceRequestId,
  }: {
    mode: PowerPrompterQueueMode;
    setId: number;
    randomApplied: boolean;
    targetBridgeId?: string;
    prompts: string[];
    promptEntries?: QueuePromptPreviewEntry[];
    promptSetIds: number[];
    promptOutputSubfolders?: string[];
    promptStyleNames?: string[];
    promptSeedGroupIds?: string[];
    generationByPrompt: ReturnType<typeof normalizePowerPrompterGenerationControls>[];
    successToast?: string;
    replaceRequestId?: string;
  }) => {
    const cleanedPrompts = prompts
      .map((entry) => normalizePowerPrompterPromptText(String(entry || '').trim()))
      .filter(Boolean);
    if (cleanedPrompts.length <= 0) {
      return null;
    }

    const requestId = createRequestId();
    const resolvedQueueTarget = resolveQueueControlTarget(
      String(targetBridgeId || '').trim() || effectiveQueueTargetBridgeId,
      selectedQueueTargetType
    );
    queueRequestMetaRef.current.set(requestId, {
      mode,
      setId,
      randomApplied,
      queueTargetType: resolvedQueueTarget.queueTargetType,
      targetBridgeId: resolvedQueueTarget.targetBridgeId,
      dispatchDelayMs: Math.max(0, Math.floor(Number(queueDispatchDelayMsRef.current) || 0)),
      prompts: [...cleanedPrompts],
      promptEntries: promptEntries?.slice(0, cleanedPrompts.length) || [],
      promptSetIds: cleanedPrompts.map((_, index) => clampQueueSetId(promptSetIds[index] ?? setId)),
      promptOutputSubfolders: cleanedPrompts.map((_, index) => String(promptOutputSubfolders?.[index] || '').trim()),
      promptStyleNames: cleanedPrompts.map((_, index) => String(promptStyleNames?.[index] || '').trim()),
      promptSeedGroupIds: cleanedPrompts.map((_, index) => String(promptSeedGroupIds?.[index] || `${setId}:${index}`).trim()),
      generationByPrompt: cleanedPrompts.map((_, index) =>
        normalizePowerPrompterGenerationControls(generationByPrompt[index])
      ),
    });
    void createQueueHistoryEntryForRequest(requestId);

    setQueuePaused(false);
    if (!shouldPreserveExistingLiveQueueVisualState(requestId, replaceRequestId)) {
      setQueueVisualState({
        requestId,
        mode,
        activeSetId: setId,
        prompts: cleanedPrompts,
        promptEntries: promptEntries?.slice(0, cleanedPrompts.length) || [],
        promptIds: cleanedPrompts.map(() => ''),
        promptSeeds: cleanedPrompts.map(() => 0),
        activeIndex: 0,
        jobProgress: 0,
        updatedAt: Date.now(),
      });
    }
    updateQueueStackItemsSynced((prev) =>
      [
        ...prev.filter((item) => item.requestId !== replaceRequestId),
        ...cleanedPrompts.map((prompt, promptIndex) => ({
          id: `${requestId}-${promptIndex}-${prompt.slice(0, 24)}`,
          requestId,
          promptIndex,
          prompt,
          styleName: String(promptStyleNames?.[promptIndex] || '').trim(),
          styleFolderName: String(promptOutputSubfolders?.[promptIndex] || '').trim(),
          status: 'pending' as const,
          createdAt: Date.now() + promptIndex,
          exiting: false,
        })),
      ]
    );
    clearGenerationPreviewHideTimer();

    scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
    sendPrompterSync();
    const result = await requestQueueThroughWebSocket(mode, cleanedPrompts, {
      activePrompt: normalizePowerPrompterPromptText(cleanedPrompts[0] || ''),
      prompts: cleanedPrompts,
      joinedPrompt: normalizePowerPrompterPromptText(cleanedPrompts.join(', ')),
      generation: normalizePowerPrompterGenerationControls(generationByPrompt[0] ?? cardDocumentRef.current.generation),
      generationByPrompt,
      promptSetIds,
      promptOutputSubfolders,
      promptSeedGroupIds,
    }, requestId, resolvedQueueTarget.targetBridgeId, resolvedQueueTarget.queueTargetType);
    if (successToast) {
      showToast(successToast, 'success');
    }
    return result;
  };

  const handleToggleQueuePause = async () => {
    if (queueControlBusy || queueStackItems.length <= 0) return;
    if (POWER_PROMPTER_QUEUE_SNAPSHOT_RECOVERY_ENABLED && queuePaused) {
      const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
      const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
      const restoredSnapshot = !activeMeta
        ? (
          restoredPausedQueueRef.current
          || buildPausedQueueSnapshotFromVisualState(
            queueVisualStateRef.current,
            queueStackItems,
            cardDocumentRef.current.activeQueueSet,
            queueVisualStateRef.current?.mode || 'prompt',
            selectedQueueTargetType,
            effectiveQueueTargetBridgeId,
            cardDocumentRef.current.generation,
            {
              paused: true,
              dispatchDelayMs: queueDispatchDelayMs,
              file: currentFileRef.current || null,
            }
          )
        )
        : null;
      if (restoredSnapshot && !activeMeta) {
        try {
          await resumePersistedPausedQueue(restoredSnapshot);
        } catch (error: any) {
          showToast(String(error?.message || 'Failed to resume paused queue'), 'error');
        }
        return;
      }
    }
    const targetPaused = !queuePaused;
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
    const sent = requestQueuePauseToggleThroughWebSocket(
      targetPaused,
      activeMeta?.targetBridgeId || effectiveQueueTargetBridgeId,
      activeMeta?.queueTargetType || selectedQueueTargetType
    );
    if (!sent) {
      showToast(`Failed to ${targetPaused ? 'pause' : 'resume'} queue`, 'error');
      return;
    }
    if ((activeMeta?.queueTargetType || selectedQueueTargetType) === 'pipeline') {
      backendQueuePauseRequestedRef.current = targetPaused;
    }
    setQueuePaused(targetPaused);
    showToast(targetPaused ? 'Queue paused after current prompt' : 'Queue resumed', 'success');
  };

  const pauseQueueForQueueEditor = useCallback((
    fallbackMeta?: QueueRequestMeta | null,
    options?: { silentIfAlreadyPaused?: boolean }
  ) => {
    if (queuePausedRef.current) {
      if (options?.silentIfAlreadyPaused !== true) {
        showToast('Queue is paused for editing.', 'success');
      }
      return true;
    }
    if (queueStackItemsRef.current.length <= 0) return true;
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
    const queueTargetType = activeMeta?.queueTargetType || fallbackMeta?.queueTargetType || selectedQueueTargetTypeRef.current;
    const targetBridgeId = activeMeta?.targetBridgeId || fallbackMeta?.targetBridgeId || effectiveQueueTargetBridgeIdRef.current;
    const sent = requestQueuePauseToggleThroughWebSocket(
      true,
      targetBridgeId,
      queueTargetType
    );
    if (!sent) {
      showToast('Queue editor opened, but Umbra could not send a pause command to the queue tracker.', 'error');
      return false;
    }
    if (queueTargetType === 'pipeline') {
      backendQueuePauseRequestedRef.current = true;
    }
    setQueuePaused(true);
    scheduleRecoverableQueueSnapshotPersist({ paused: true, clearWhenEmpty: false, delayMs: 50 });
    showToast('Queue paused for editing. The current prompt can finish, then edited groups apply safely.', 'success');
    return true;
  }, [
    scheduleRecoverableQueueSnapshotPersist,
    showToast,
  ]);

  const handleOpenQueueGroupEditor = useCallback((group: QueueRequestGroup) => {
    if (!POWER_PROMPTER_QUEUE_EDITOR_ENABLED) {
      showToast('Queue group editing is parked while Queue Manager uses the live queue only.', 'error');
      return;
    }
    const requestId = String(group.requestId || '').trim();
    if (!requestId) return;
    const meta = queueRequestMetaRef.current.get(requestId) || null;
    const persistedGroupSnapshot = restoredPausedQueueRef.current?.groupSnapshots
      ?.find((entry) => String(entry.requestId || '').trim() === requestId);
    const editorSnapshot = normalizeQueueEditorSnapshot(meta?.editorSnapshot || persistedGroupSnapshot?.editorSnapshot)
      || createQueueEditorSnapshot(cardDocumentRef.current, currentFileRef.current || null, {
        traversalMode: queueTraversalMode,
        diversity: queueDiversity,
        promptLimit: queuePromptLimit,
        shuffleEnabled: queueShuffleEnabled,
        shuffleSeed: settings.queueShuffleSeed,
      });
    if (!meta?.editorSnapshot && !persistedGroupSnapshot?.editorSnapshot) {
      showToast('This group did not have an editor snapshot yet, so Umbra opened the current card state as a starting point.', 'error');
    }
    pauseQueueForQueueEditor(meta);
    const normalizedDocument = normalizePowerPrompterCardDocument(editorSnapshot.document, editorSnapshot.sourceFile);
    setQueueEditorDocument({
      ...normalizedDocument,
      cards: normalizeChainCards(normalizedDocument.cards),
    });
    queueEditorDocumentRef.current = {
      ...normalizedDocument,
      cards: normalizeChainCards(normalizedDocument.cards),
    };
    setQueueEditorDraft({
      requestId,
      label: `Set ${group.setId} Group`,
      mode: meta?.mode || persistedGroupSnapshot?.mode || group.mode || 'selected',
      activeSetId: clampQueueSetId(meta?.setId ?? persistedGroupSnapshot?.activeSetId ?? group.setId),
      sourceFile: editorSnapshot.sourceFile,
      originalPromptCount: Math.max(0, Math.floor(Number(group.total) || 0)),
      queueBuildSettings: normalizeQueueEditorBuildSettings(editorSnapshot.queueBuildSettings),
    });
    setPrompterPanelMode('queue-editor');
  }, [
    pauseQueueForQueueEditor,
    queueDiversity,
    queuePromptLimit,
    queueShuffleEnabled,
    queueTraversalMode,
    settings.queueShuffleSeed,
    showToast,
  ]);

  const handleCloseQueueEditor = useCallback(() => {
    setQueueEditorDraft(null);
    setPrompterPanelMode('queue-manager');
  }, []);

  const buildQueueEditorDraftPrompts = useCallback(async () => {
    if (!queueEditorDraft) return null;
    const startedAt = performance.now();
    const editorDocument = queueEditorDocumentRef.current;
    const buildSettings = normalizeQueueEditorBuildSettings(queueEditorDraft.queueBuildSettings);
    const safePromptLimit = buildSettings.promptLimit ?? Math.max(1, Math.floor(Number(queueEditorDraft.originalPromptCount) || 1));
    const built = await buildQueuePromptsOnWorker({
      document: editorDocument,
      mode: queueEditorDraft.mode,
      workerRef: queueWorkerRef,
      requestSeqRef: queueWorkerRequestSeqRef,
      pendingSignatureRef: queueWorkerPendingSignatureRef,
      options: {
      setIdOverride: queueEditorDraft.activeSetId,
      includeAllSets: queueEditorDraft.mode === 'variants',
      traversalMode: buildSettings.traversalMode,
      diversity: buildSettings.diversity,
      promptLimit: safePromptLimit,
      shuffleEnabled: buildSettings.shuffleEnabled,
      shuffleSeed: buildSettings.shuffleSeed,
      },
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs >= 500) {
      logPowerPrompterDebug('promptBuild:queueEditorDraft:slow', {
        mode: queueEditorDraft.mode,
        activeSetId: queueEditorDraft.activeSetId,
        promptCount: built.prompts.length,
        elapsedMs,
      });
    }
    const normalizedGeneration = normalizePowerPrompterGenerationControls(editorDocument.generation);
    const queueSeedSalt = normalizedGeneration.controlAfterGenerate === 'randomize'
      ? createQueueShuffleSeed()
      : buildSettings.shuffleSeed;
    const seedGroupIndexById = new Map<string, number>();
    const generationByPrompt = built.prompts.map((_, promptIndex) => {
      const promptSetId = clampQueueSetId(built.promptSetIds[promptIndex] ?? queueEditorDraft.activeSetId);
      const seedGroupId = String(built.promptSeedGroupIds[promptIndex] || `${promptSetId}:${promptIndex}`).trim();
      if (!seedGroupIndexById.has(seedGroupId)) seedGroupIndexById.set(seedGroupId, seedGroupIndexById.size);
      return normalizePowerPrompterGenerationControls({
        ...normalizedGeneration,
        seed: resolveSeedForQueuePromptGroup(normalizedGeneration, seedGroupIndexById.get(seedGroupId) ?? promptIndex, queueSeedSalt),
        controlAfterGenerate: 'fixed',
        loras: [],
      });
    });
    return {
      editorDocument,
      buildSettings,
      built,
      normalizedGeneration,
      generationByPrompt,
      editorSnapshot: createQueueEditorSnapshot(editorDocument, queueEditorDraft.sourceFile, buildSettings),
    };
  }, [queueEditorDraft]);

  const handleSaveQueueEditorDraft = useCallback(async () => {
    if (!POWER_PROMPTER_QUEUE_EDITOR_ENABLED) {
      showToast('Queue group editing is parked while Queue Manager uses the live queue only.', 'error');
      return;
    }
    if (!queueEditorDraft || queueEditorSaving) return;
    setQueueEditorSaving(true);
    logPowerPrompterDebug('queueEditor:save:start', {
      requestId: queueEditorDraft.requestId,
      label: queueEditorDraft.label,
      mode: queueEditorDraft.mode,
      activeSetId: queueEditorDraft.activeSetId,
      originalPromptCount: queueEditorDraft.originalPromptCount,
      buildSettings: queueEditorDraft.queueBuildSettings,
    }, { includeQueue: true });
    const editMeta = queueRequestMetaRef.current.get(queueEditorDraft.requestId) || null;
    if (!pauseQueueForQueueEditor(editMeta, { silentIfAlreadyPaused: true })) {
      setQueueEditorSaving(false);
      return;
    }
    await waitForNextUiPaint();
    try {
    const artifacts = await buildQueueEditorDraftPrompts();
    if (!artifacts) {
      setQueueEditorSaving(false);
      showToast('Queue editor draft was not available.', 'error');
      return;
    }
    const {
      editorDocument,
      buildSettings,
      built,
      normalizedGeneration,
      generationByPrompt,
      editorSnapshot,
    } = artifacts;
    logPowerPrompterDebug('queueEditor:save:promptsBuilt', {
      requestId: queueEditorDraft.requestId,
      promptCount: built.prompts.length,
      promptEntryCount: built.promptEntries.length,
      setIds: Array.from(new Set(built.promptSetIds)).sort((a, b) => a - b),
      truncated: built.truncated,
      warningCount: built.warnings.length,
      randomApplied: built.randomApplied,
      generation: {
        modelType: normalizedGeneration.modelType,
        checkpointName: normalizedGeneration.checkpointName,
        aspectRatio: normalizedGeneration.aspectRatio,
        width: normalizedGeneration.width,
        height: normalizedGeneration.height,
        batchSize: normalizedGeneration.batchSize,
        steps: normalizedGeneration.steps,
        cfg: normalizedGeneration.cfg,
      },
      buildSettings,
    }, { includeQueue: true });
    if (built.prompts.length <= 0) {
      setQueueEditorSaving(false);
      showToast('The edited group has no queueable prompts.', 'error');
      return;
    }
    await waitForNextUiPaint();
    const targetRequestId = queueEditorDraft.requestId;
    const replacementRequestId = targetRequestId || createStagedQueueRequestId();
    const response = await fetch('/api/powerprompter/queue/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'replace_group',
        requestId: targetRequestId,
        replacement: {
          requestId: replacementRequestId,
          pipeline: normalizeUmbraUiPipelineSelection(editorSnapshot.document.pipeline, {
            feature: 'txt2img',
            modelFamily: String(editorSnapshot.document.modelType || '').trim(),
            modelSource: normalizedGeneration.modelType,
          }),
          prompts: built.prompts,
          promptEntries: built.promptEntries,
          promptSetIds: built.promptSetIds,
          promptOutputSubfolders: built.promptOutputSubfolders,
          promptStyleNames: built.promptStyleNames,
          promptSeedGroupIds: built.promptSeedGroupIds,
          generation: normalizedGeneration,
          generationByPrompt,
          groupSnapshot: {
            id: replacementRequestId,
            requestId: replacementRequestId,
            label: queueEditorDraft.label,
            mode: queueEditorDraft.mode,
            activeSetId: queueEditorDraft.activeSetId,
            editorSnapshot,
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) {
      throw new Error(String(payload?.error || 'Failed to save the edited queue group.'));
    }
    const nextSnapshot = normalizePersistedPausedQueueSnapshot(payload.snapshot);
    if (!nextSnapshot) {
      if (payload?.runtimeUpdated === true) {
        const existingMeta = queueRequestMetaRef.current.get(targetRequestId);
        const nowForRows = Date.now();
        const backendRequest = payload?.request && typeof payload.request === 'object' ? payload.request as Record<string, any> : null;
        const backendRawPrompts = Array.isArray(backendRequest?.prompts) ? backendRequest.prompts : [];
        const backendPrompts = backendRawPrompts.map((entry: any) => String(entry?.prompt || '').trim());
        const backendPromptSetIds = backendRawPrompts.map((entry: any) => clampQueueSetId(entry?.setId ?? queueEditorDraft.activeSetId));
        const backendPromptOutputSubfolders = backendRawPrompts.map((entry: any) => String(entry?.outputSubfolder || '').trim());
        const backendPromptStyleNames = backendRawPrompts.map((entry: any) => String(entry?.styleName || '').trim());
        const backendPromptSeeds = backendRawPrompts.map((entry: any) => Math.max(0, Math.floor(Number(entry?.seed) || 0)));
        const backendLockedPromptCount = Math.max(0, Math.floor(Number(payload?.lockedPromptCount) || 0));
        const hasBackendRequestPrompts = backendPrompts.length > 0;
        const fullPrompts = hasBackendRequestPrompts ? backendPrompts : built.prompts;
        const fullPromptSetIds = hasBackendRequestPrompts ? backendPromptSetIds : built.promptSetIds;
        const fullPromptOutputSubfolders = hasBackendRequestPrompts ? backendPromptOutputSubfolders : built.promptOutputSubfolders;
        const fullPromptStyleNames = hasBackendRequestPrompts ? backendPromptStyleNames : built.promptStyleNames;
        const fullPromptSeeds = hasBackendRequestPrompts
          ? backendPromptSeeds
          : generationByPrompt.map((generation) => Math.max(0, Math.floor(Number(generation.seed) || 0)));
        const fullGenerationByPrompt = fullPrompts.map((_, index) => {
          const replacementIndex = index - backendLockedPromptCount;
          if (replacementIndex >= 0 && replacementIndex < generationByPrompt.length) {
            return normalizePowerPrompterGenerationControls(generationByPrompt[replacementIndex]);
          }
          return normalizePowerPrompterGenerationControls(existingMeta?.generationByPrompt?.[index] ?? normalizedGeneration);
        });
        const existingTargetRows = queueStackItemsRef.current.filter((item) => String(item.requestId || '').trim() === targetRequestId);
        const firstExistingCreatedAt = existingTargetRows.reduce(
          (lowest, item) => Math.min(lowest, Math.floor(Number(item.createdAt) || lowest)),
          nowForRows
        );
        const visibleBackendRows = hasBackendRequestPrompts
          ? backendRawPrompts.filter((entry: any) => {
              const status = String(entry?.status || 'pending').trim().toLowerCase();
              return status === 'pending' || status === 'submitting' || status === 'running';
            })
          : [];
        const lockedPromptCount = hasBackendRequestPrompts
          ? backendLockedPromptCount
          : existingTargetRows.filter((item) => item.status !== 'pending' && !item.exiting).length;
        const replacementRows = (hasBackendRequestPrompts ? visibleBackendRows : built.prompts).map((entry: any, promptIndex) => {
          const backendPromptIndex = hasBackendRequestPrompts
            ? Math.max(0, Math.floor(Number(entry?.promptIndex) || 0))
            : promptIndex;
          const prompt = hasBackendRequestPrompts ? String(entry?.prompt || '').trim() : String(entry || '').trim();
          const status = hasBackendRequestPrompts
            ? (String(entry?.status || 'pending').trim().toLowerCase() === 'running' || String(entry?.status || 'pending').trim().toLowerCase() === 'submitting' ? 'running' as const : 'pending' as const)
            : 'pending' as const;
          return {
          id: `${targetRequestId}-${backendPromptIndex}-${prompt.slice(0, 24)}`,
          requestId: targetRequestId,
          promptIndex: backendPromptIndex,
          prompt,
          styleName: hasBackendRequestPrompts ? String(entry?.styleName || '').trim() : String(built.promptStyleNames[promptIndex] || '').trim(),
          styleFolderName: hasBackendRequestPrompts ? String(entry?.outputSubfolder || '').trim() : String(built.promptOutputSubfolders[promptIndex] || '').trim(),
          status,
          createdAt: nowForRows + promptIndex,
          exiting: false,
          };
        });
        updateQueueStackItemsSynced((prev) => {
          const targetRows = prev.filter((item) => String(item.requestId || '').trim() === targetRequestId);
          const lockedRows = hasBackendRequestPrompts ? [] : targetRows
            .filter((item) => item.status !== 'pending' && !item.exiting)
            .sort((a, b) => (Math.floor(Number(a.promptIndex) || 0) - Math.floor(Number(b.promptIndex) || 0)))
            .map((item, index) => ({
              ...item,
              promptIndex: index,
              createdAt: firstExistingCreatedAt + index,
            }));
          const nextRows = replacementRows.map((item, index) => ({
            ...item,
            promptIndex: hasBackendRequestPrompts ? item.promptIndex : lockedRows.length + index,
            createdAt: firstExistingCreatedAt + lockedRows.length + index,
          }));
          const replacementStartIndex = targetRows.length > 0
            ? prev.findIndex((item) => String(item.requestId || '').trim() === targetRequestId)
            : prev.length;
          const withoutTarget = prev.filter((item) => String(item.requestId || '').trim() !== targetRequestId);
          const boundedInsertIndex = Math.max(0, Math.min(withoutTarget.length, replacementStartIndex));
          return [
            ...withoutTarget.slice(0, boundedInsertIndex),
            ...lockedRows,
            ...nextRows,
            ...withoutTarget.slice(boundedInsertIndex),
          ];
        });
        queueRequestMetaRef.current.set(targetRequestId, {
          mode: queueEditorDraft.mode,
          setId: queueEditorDraft.activeSetId,
          randomApplied: built.randomApplied === true || existingMeta?.randomApplied === true,
          queueTargetType: existingMeta?.queueTargetType || selectedQueueTargetTypeRef.current,
          targetBridgeId: existingMeta?.targetBridgeId || effectiveQueueTargetBridgeIdRef.current,
          dispatchDelayMs: existingMeta?.dispatchDelayMs ?? queueDispatchDelayMsRef.current,
          prompts: fullPrompts,
          promptSetIds: fullPromptSetIds,
          promptOutputSubfolders: fullPromptOutputSubfolders,
          promptStyleNames: fullPromptStyleNames,
          promptSeedGroupIds: fullPrompts.map((_, index) => existingMeta?.promptSeedGroupIds?.[index] || built.promptSeedGroupIds[index - backendLockedPromptCount] || ''),
          generationByPrompt: fullGenerationByPrompt,
          editorSnapshot,
        });
        setQueueVisualState((prev) => {
          if (!prev || String(prev.requestId || '').trim() !== targetRequestId) return prev;
          const lockedPrompts = (prev.prompts || []).slice(0, lockedPromptCount);
          const lockedEntries = (prev.promptEntries || []).slice(0, lockedPromptCount);
          const lockedIds = (prev.promptIds || []).slice(0, lockedPromptCount);
          const lockedSeeds = (prev.promptSeeds || []).slice(0, lockedPromptCount);
          return {
            ...prev,
            mode: queueEditorDraft.mode,
            activeSetId: queueEditorDraft.activeSetId,
            prompts: hasBackendRequestPrompts ? fullPrompts : [...lockedPrompts, ...built.prompts],
            promptEntries: hasBackendRequestPrompts ? undefined : [...lockedEntries, ...built.promptEntries],
            promptIds: hasBackendRequestPrompts ? backendRawPrompts.map((entry: any) => String(entry?.promptId || '').trim()) : [...lockedIds, ...built.prompts.map(() => '')],
            promptSeeds: hasBackendRequestPrompts ? fullPromptSeeds : [...lockedSeeds, ...generationByPrompt.map((generation) => Math.max(0, Math.floor(Number(generation.seed) || 0)))],
            activeIndex: hasBackendRequestPrompts
              ? Math.max(0, Math.min(fullPrompts.length - 1, Math.floor(Number(backendRequest?.activeIndex) || 0)))
              : Math.min(
                  Math.max(0, Math.floor(Number(prev.activeIndex) || 0)),
                  Math.max(0, lockedPromptCount + built.prompts.length - 1)
                ),
            updatedAt: Date.now(),
          };
        });
        logPowerPrompterDebug('queueEditor:save:successWithoutPersistedSnapshot', {
          requestId: queueEditorDraft.requestId,
          builtPromptCount: built.prompts.length,
          lockedPromptCount,
        }, { includeQueue: true });
        await waitForNextUiPaint();
        setQueueEditorDraft(null);
        setQueueEditorSaving(false);
        setPrompterPanelMode('queue-manager');
        showToast(
          `Updated live queue group with ${built.prompts.length} prompt${built.prompts.length === 1 ? '' : 's'}.`,
          'success'
        );
        return;
      }
      logPowerPrompterDebug('queueEditor:save:snapshotFailed', {
        requestId: queueEditorDraft.requestId,
        builtPromptCount: built.prompts.length,
      }, { includeQueue: true });
      setQueueEditorSaving(false);
      showToast('Failed to save the edited queue group.', 'error');
      return;
    }
    await waitForNextUiPaint();
    restoreRecoverableQueueAsPausedSnapshot(nextSnapshot);
    logPowerPrompterDebug('queueEditor:save:success', {
      requestId: queueEditorDraft.requestId,
      replacementRequestId: String(payload?.replacementRequestId || replacementRequestId),
      runtimeUpdated: payload?.runtimeUpdated === true,
      nextPromptCount: nextSnapshot.prompts.length,
      nextGroupCount: nextSnapshot.groupSnapshots?.length || 0,
      editedPromptCount: built.prompts.length,
      replacementPromptCount: built.prompts.length,
      editedGeneration: {
        aspectRatio: normalizedGeneration.aspectRatio,
        width: normalizedGeneration.width,
        height: normalizedGeneration.height,
        batchSize: normalizedGeneration.batchSize,
      },
    }, { includeQueue: true });
    setQueueEditorDraft(null);
    setQueueEditorSaving(false);
    setPrompterPanelMode('queue-manager');
    showToast(
      `Updated queue group with ${built.prompts.length} prompt${built.prompts.length === 1 ? '' : 's'}${buildSettings.promptLimit === null ? ' using the original group cap' : ''}.`,
      'success'
    );
    } catch (error: any) {
      logPowerPrompterDebug('queueEditor:save:error', {
        requestId: queueEditorDraft?.requestId || '',
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      showToast(String(error?.message || 'Failed to save edited queue group'), 'error');
    } finally {
      setQueueEditorSaving(false);
    }
  }, [
    buildQueueEditorDraftPrompts,
    pauseQueueForQueueEditor,
    queueEditorDraft,
    queueEditorSaving,
    restoreRecoverableQueueAsPausedSnapshot,
    showToast,
  ]);

  const handleAddQueueEditorDraftAsNewGroup = useCallback(async () => {
    if (!POWER_PROMPTER_QUEUE_EDITOR_ENABLED) {
      showToast('Queue group editing is parked while Queue Manager uses the live queue only.', 'error');
      return;
    }
    if (!queueEditorDraft || queueEditorSaving) return;
    setQueueEditorSaving(true);
    logPowerPrompterDebug('queueEditor:addGroup:start', {
      sourceRequestId: queueEditorDraft.requestId,
      label: queueEditorDraft.label,
      mode: queueEditorDraft.mode,
      activeSetId: queueEditorDraft.activeSetId,
      buildSettings: queueEditorDraft.queueBuildSettings,
    }, { includeQueue: true });
    const editMeta = queueRequestMetaRef.current.get(queueEditorDraft.requestId) || null;
    if (!pauseQueueForQueueEditor(editMeta, { silentIfAlreadyPaused: true })) {
      setQueueEditorSaving(false);
      return;
    }
    await waitForNextUiPaint();
    try {
      const artifacts = await buildQueueEditorDraftPrompts();
      if (!artifacts) {
        setQueueEditorSaving(false);
        showToast('Queue editor draft was not available.', 'error');
        return;
      }
      const {
        buildSettings,
        built,
        normalizedGeneration,
        generationByPrompt,
        editorSnapshot,
      } = artifacts;
      logPowerPrompterDebug('queueEditor:addGroup:promptsBuilt', {
        sourceRequestId: queueEditorDraft.requestId,
        promptCount: built.prompts.length,
        promptEntryCount: built.promptEntries.length,
        setIds: Array.from(new Set(built.promptSetIds)).sort((a, b) => a - b),
        truncated: built.truncated,
        warningCount: built.warnings.length,
        randomApplied: built.randomApplied,
        buildSettings,
      }, { includeQueue: true });
      if (built.prompts.length <= 0) {
        setQueueEditorSaving(false);
        showToast('The edited group has no queueable prompts.', 'error');
        return;
      }

      const sourceMeta = queueRequestMetaRef.current.get(queueEditorDraft.requestId) || null;
      const resolvedQueueTarget = resolveQueueControlTarget(
        sourceMeta?.targetBridgeId || effectiveQueueTargetBridgeIdRef.current,
        sourceMeta?.queueTargetType || selectedQueueTargetTypeRef.current
      );
      const requestId = createRequestId();
      const promptSetIds = built.prompts.map((_, promptIndex) => clampQueueSetId(built.promptSetIds[promptIndex] ?? queueEditorDraft.activeSetId));
      const promptOutputSubfolders = built.prompts.map((_, promptIndex) => String(built.promptOutputSubfolders[promptIndex] || '').trim());
      const promptStyleNames = built.prompts.map((_, promptIndex) => String(built.promptStyleNames[promptIndex] || '').trim());
      const promptSeedGroupIds = built.prompts.map((_, promptIndex) =>
        String(built.promptSeedGroupIds[promptIndex] || `${promptSetIds[promptIndex] ?? queueEditorDraft.activeSetId}:${promptIndex}`).trim()
      );
      const response = await fetch('/api/powerprompter/queue/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'add_group',
          requestId: queueEditorDraft.requestId,
          group: {
            requestId,
            mode: queueEditorDraft.mode,
            activeSetId: queueEditorDraft.activeSetId,
            prompts: built.prompts,
            state: {
              mode: queueEditorDraft.mode,
              activeSetId: queueEditorDraft.activeSetId,
              activeQueueSet: queueEditorDraft.activeSetId,
              activePrompt: normalizePowerPrompterPromptText(built.prompts[0] || ''),
              prompts: built.prompts,
              joinedPrompt: normalizePowerPrompterPromptText(built.prompts.join(', ')),
              generation: normalizedGeneration,
              generationByPrompt,
              promptSetIds,
              promptOutputSubfolders,
              promptStyleNames,
              promptSeedGroupIds,
              sourceFile: normalizePrompterSourceFilePath(queueEditorDraft.sourceFile || currentFileRef.current || ''),
              pipeline: normalizeUmbraUiPipelineSelection(editorSnapshot.document.pipeline, {
                feature: 'txt2img',
                modelFamily: String(editorSnapshot.document.modelType || '').trim(),
                modelSource: normalizedGeneration.modelType,
              }),
              modelFamily: String(editorSnapshot.document.pipeline?.modelFamily || editorSnapshot.document.modelType || '').trim(),
              umbraUiFeature: editorSnapshot.document.pipeline?.feature || 'txt2img',
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || 'Failed to add edited queue group.'));
      }
      const backendRequest = payload?.request && typeof payload.request === 'object' ? payload.request as Record<string, any> : null;
      const rawBackendPrompts = Array.isArray(backendRequest?.prompts) ? backendRequest.prompts : [];
      const finalRequestId = String(payload?.requestId || backendRequest?.requestId || requestId).trim();
      queueBridgeDispatchedRequestIdsRef.current.add(finalRequestId);
      backendQueueSnapshotRequestIdsRef.current.add(finalRequestId);
      queueRequestMetaRef.current.set(finalRequestId, {
        mode: queueEditorDraft.mode,
        setId: queueEditorDraft.activeSetId,
        randomApplied: built.randomApplied === true,
        queueTargetType: resolvedQueueTarget.queueTargetType,
        targetBridgeId: resolvedQueueTarget.targetBridgeId,
        dispatchDelayMs: queueDispatchDelayMsRef.current,
        prompts: rawBackendPrompts.length > 0 ? rawBackendPrompts.map((entry: any) => String(entry?.prompt || '').trim()) : built.prompts,
        promptEntries: built.promptEntries,
        promptSetIds: rawBackendPrompts.length > 0 ? rawBackendPrompts.map((entry: any) => clampQueueSetId(entry?.setId ?? queueEditorDraft.activeSetId)) : promptSetIds,
        promptOutputSubfolders: rawBackendPrompts.length > 0 ? rawBackendPrompts.map((entry: any) => String(entry?.outputSubfolder || '').trim()) : promptOutputSubfolders,
        promptStyleNames: rawBackendPrompts.length > 0 ? rawBackendPrompts.map((entry: any) => String(entry?.styleName || '').trim()) : promptStyleNames,
        promptSeedGroupIds,
        generationByPrompt,
        editorSnapshot,
      });
      const sourceCleanup = payload?.sourceCleanup && typeof payload.sourceCleanup === 'object'
        ? payload.sourceCleanup as Record<string, any>
        : null;
      const sourcePromptRemovals = Array.isArray(sourceCleanup?.promptRemovals)
        ? sourceCleanup.promptRemovals
        : [];
      const removedSourceRequestIds = new Set(
        (Array.isArray(sourceCleanup?.removedRequestIds) ? sourceCleanup.removedRequestIds : [])
          .map((value: unknown) => String(value || '').trim())
          .filter(Boolean)
      );
      const sourceRemoval = sourcePromptRemovals.find((entry: any) =>
        String(entry?.requestId || '').trim() === queueEditorDraft.requestId
      );
      const removedSourcePromptIndices = new Set(
        Array.isArray(sourceRemoval?.promptIndices)
          ? sourceRemoval.promptIndices
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isFinite(value))
            .map((value: number) => Math.max(0, Math.floor(value)))
          : []
      );
      const sourceRequestRemoved = removedSourceRequestIds.has(queueEditorDraft.requestId);
      if (sourceRequestRemoved) {
        updateQueueStackItemsSynced((prev) => prev.filter((item) =>
          String(item.requestId || '').trim() !== queueEditorDraft.requestId
        ));
        queueRequestMetaRef.current.delete(queueEditorDraft.requestId);
        clearQueueTimingState([queueEditorDraft.requestId]);
        clearedQueueRequestIdsRef.current.add(queueEditorDraft.requestId);
      } else if (removedSourcePromptIndices.size > 0) {
        updateQueueStackItemsSynced((prev) => prev.filter((item) => {
          if (String(item.requestId || '').trim() !== queueEditorDraft.requestId) return true;
          return !removedSourcePromptIndices.has(Math.max(0, Math.floor(Number(item.promptIndex) || 0)));
        }));
        const sourceMeta = queueRequestMetaRef.current.get(queueEditorDraft.requestId);
        if (sourceMeta) {
          const keepIndices = (sourceMeta.prompts || [])
            .map((_, index) => index)
            .filter((index) => !removedSourcePromptIndices.has(index));
          if (keepIndices.length > 0) {
            queueRequestMetaRef.current.set(queueEditorDraft.requestId, {
              ...sourceMeta,
              prompts: keepIndices.map((index) => sourceMeta.prompts[index]).filter(Boolean),
              promptEntries: sourceMeta.promptEntries ? keepIndices.map((index) => sourceMeta.promptEntries?.[index]).filter(Boolean) as any : undefined,
              promptSetIds: keepIndices.map((index) => sourceMeta.promptSetIds?.[index] ?? sourceMeta.setId),
              promptOutputSubfolders: keepIndices.map((index) => sourceMeta.promptOutputSubfolders?.[index] || ''),
              promptStyleNames: keepIndices.map((index) => sourceMeta.promptStyleNames?.[index] || ''),
              promptSeedGroupIds: keepIndices.map((index) => sourceMeta.promptSeedGroupIds?.[index] || ''),
              generationByPrompt: keepIndices.map((index) => normalizePowerPrompterGenerationControls(sourceMeta.generationByPrompt?.[index])),
            });
          } else {
            queueRequestMetaRef.current.delete(queueEditorDraft.requestId);
          }
        }
      }
      logPowerPrompterDebug('queueEditor:addGroup:success', {
        sourceRequestId: queueEditorDraft.requestId,
        requestId: finalRequestId,
        addedPromptCount: built.prompts.length,
        removedSourcePromptCount: removedSourcePromptIndices.size,
        sourceRequestRemoved,
      }, { includeQueue: true });
      setQueueEditorDraft(null);
      setQueueEditorSaving(false);
      setPrompterPanelMode('queue-manager');
      showToast(
        removedSourcePromptIndices.size > 0
          ? `Added edited group and cleared ${sourceRequestRemoved ? 'the old group' : `${removedSourcePromptIndices.size} old queued prompt${removedSourcePromptIndices.size === 1 ? '' : 's'}`}.`
          : `Added edited group with ${built.prompts.length} prompt${built.prompts.length === 1 ? '' : 's'} behind the source group.`,
        'success'
      );
    } catch (error: any) {
      logPowerPrompterDebug('queueEditor:addGroup:error', {
        sourceRequestId: queueEditorDraft?.requestId || '',
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      showToast(String(error?.message || 'Failed to add edited queue group'), 'error');
    } finally {
      setQueueEditorSaving(false);
    }
  }, [
    buildQueueEditorDraftPrompts,
    pauseQueueForQueueEditor,
    queueEditorDraft,
    queueEditorSaving,
    showToast,
  ]);

  const handleStartQueuedDispatch = async () => {
    if (queueControlBusy || resumeQueueInFlightRef.current || queueStackItems.length <= 0) {
      logPowerPrompterDebug('queue:start:blocked', {
        queueControlBusy,
        resumeInFlight: resumeQueueInFlightRef.current,
        stackCount: queueStackItems.length,
      }, { includeQueue: true });
      return;
    }
    const effectiveQueuePaused = queuePausedRef.current;
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
    const activeVisualIsLocalStage = isLocalStagedQueueRequestId(activeVisualRequestId);
    const activeVisualHasLiveDispatch = !!activeVisualRequestId
      && !activeVisualIsLocalStage
      && (
        queueBridgeDispatchedRequestIdsRef.current.has(activeVisualRequestId)
        || pendingQueueRequestsRef.current.has(activeVisualRequestId)
        || backendQueueSnapshotRequestIdsRef.current.has(activeVisualRequestId)
        || bridgeQueueStateRef.current.activeRequestIds.some((requestId) => String(requestId || '').trim() === activeVisualRequestId)
        || bridgeQueueStateRef.current.pendingRequestIds.some((requestId) => String(requestId || '').trim() === activeVisualRequestId)
        || queueStackItemsRef.current.some((item) =>
          !item.exiting
          && item.status === 'running'
          && String(item.requestId || '').trim() === activeVisualRequestId
        )
      );
    if (activeMeta && !effectiveQueuePaused && activeVisualHasLiveDispatch) {
      logPowerPrompterDebug('queue:start:alreadyDispatchingActiveMeta', {
        activeVisualRequestId,
        queuePaused: effectiveQueuePaused,
        activeVisualHasLiveDispatch,
      }, { includeQueue: true });
      showToast('Queue is already dispatching.', 'success');
      return;
    }
    const orderedStagedRequestIds = getQueueRequestOrderFromStackItems(queueStackItemsRef.current)
      .filter((requestId, index, all) => all.indexOf(requestId) === index)
      .filter((requestId) => {
        const normalizedRequestId = String(requestId || '').trim();
        if (!normalizedRequestId || !queueRequestMetaRef.current.has(normalizedRequestId)) return false;
        const hasVisibleQueuedWork = queueStackItemsRef.current.some((item) =>
          !item.exiting
          && String(item.requestId || '').trim() === normalizedRequestId
          && (item.status === 'pending' || item.status === 'running')
        );
        if (!hasVisibleQueuedWork) return false;
        if (effectiveQueuePaused) return true;
        if (queueBridgeDispatchedRequestIdsRef.current.has(normalizedRequestId)) return false;
        if (pendingQueueRequestsRef.current.has(normalizedRequestId)) return false;
        if (backendQueueSnapshotRequestIdsRef.current.has(normalizedRequestId)) return false;
        return true;
      });
    const hasLocalStagedQueueWork = orderedStagedRequestIds.length > 0;
    if (!hasLocalStagedQueueWork && !effectiveQueuePaused) {
      logPowerPrompterDebug('queue:start:alreadyDispatchingNoLocalStage', {
        hasLocalStagedQueueWork,
        queuePaused: effectiveQueuePaused,
        activeVisualRequestId,
        activeVisualHasLiveDispatch,
      }, { includeQueue: true });
      showToast(activeVisualHasLiveDispatch ? 'Queue is already dispatching.' : 'No staged queue is ready to start.', activeVisualHasLiveDispatch ? 'success' : 'error');
      return;
    }
    logPowerPrompterDebug('queue:start:liveStateSelected', {
      hasLocalStagedQueueWork,
      effectiveQueuePaused,
      activeVisualRequestId,
      stackPromptCount: queueStackItemsRef.current.filter((item) => !item.exiting).length,
      stackGroupCount: orderedStagedRequestIds.length,
    }, { includeQueue: true });
    if (orderedStagedRequestIds.length <= 0) {
      logPowerPrompterDebug('queue:start:noLiveStagedQueue', {
        queuePaused: effectiveQueuePaused,
        hasLocalStagedQueueWork,
        activeVisualRequestId,
      }, { includeQueue: true });
      showToast('No staged queue is ready to start.', 'error');
      return;
    }
    logPowerPrompterDebug('queue:start:liveStateResolved', {
      promptCount: queueStackItemsRef.current.filter((item) => !item.exiting && orderedStagedRequestIds.includes(String(item.requestId || '').trim())).length,
      requestCount: orderedStagedRequestIds.length,
      groupCount: orderedStagedRequestIds.length,
      paused: effectiveQueuePaused,
      bridgePendingCount: bridgeQueueStateRef.current.pendingCount,
      bridgeActiveRequestIds: bridgeQueueStateRef.current.activeRequestIds,
      bridgePendingRequestIds: bridgeQueueStateRef.current.pendingRequestIds,
    }, { includeQueue: true });
    if (bridgeHasOpaqueQueueBacklog()) {
      logPowerPrompterDebug('queue:start:blockedOpaqueBridgeBacklog', {
        bridgePendingCount: bridgeQueueStateRef.current.pendingCount,
        bridgeActiveRequestIds: bridgeQueueStateRef.current.activeRequestIds,
        bridgePendingRequestIds: bridgeQueueStateRef.current.pendingRequestIds,
      }, { includeQueue: true });
      showToast('ComfyUI already has queued Power Prompter work. Clear or finish that queue before resubmitting recovered prompts.', 'error');
      return;
    }
    resumeQueueInFlightRef.current = true;
    setQueueControlBusy('start');
    try {
      const requestIdMap = new Map<string, string>();
      for (const sourceRequestId of orderedStagedRequestIds) {
        requestIdMap.set(sourceRequestId, createRequestId());
      }
      for (const [sourceRequestId, liveRequestId] of requestIdMap.entries()) {
        const meta = queueRequestMetaRef.current.get(sourceRequestId);
        if (!meta) continue;
        queueRequestMetaRef.current.delete(sourceRequestId);
        queueRequestMetaRef.current.set(liveRequestId, meta);
      }
      const nextStackItems = queueStackItemsRef.current.map((item) => {
        const sourceRequestId = String(item.requestId || '').trim();
        const liveRequestId = requestIdMap.get(sourceRequestId);
        if (!liveRequestId) return item;
        return {
          ...item,
          id: `${liveRequestId}-${item.promptIndex}-${String(item.prompt || '').slice(0, 24)}`,
          requestId: liveRequestId,
          status: item.status === 'running' ? 'pending' : item.status,
          exiting: false,
        };
      });
      updateQueueStackItemsSynced(applyQueueStackRunningState(nextStackItems));
      const liveRequestIds = orderedStagedRequestIds
        .map((sourceRequestId) => requestIdMap.get(sourceRequestId) || '')
        .filter(Boolean);
      const firstLiveRequestId = liveRequestIds[0] || '';
      const firstMeta = firstLiveRequestId ? queueRequestMetaRef.current.get(firstLiveRequestId) : null;
      if (firstLiveRequestId && firstMeta) {
        setQueueVisualState({
          requestId: firstLiveRequestId,
          mode: firstMeta.mode,
          activeSetId: clampQueueSetId(firstMeta.promptSetIds[0] ?? firstMeta.setId),
          prompts: [...firstMeta.prompts],
          promptEntries: firstMeta.promptEntries ? [...firstMeta.promptEntries] : undefined,
          promptIds: firstMeta.prompts.map(() => ''),
          promptSeeds: firstMeta.prompts.map(() => 0),
          activeIndex: 0,
          jobProgress: 0,
          updatedAt: Date.now(),
        });
      }
      setQueuePaused(false);
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      for (const liveRequestId of liveRequestIds) {
        await createQueueHistoryEntryForRequest(liveRequestId);
      }
      const batchResult = await requestQueueBatchThroughWebSocket(liveRequestIds);
      const acceptedRequestIds = normalizeRequestIdList(batchResult?.acceptedRequestIds);
      if (acceptedRequestIds.length !== liveRequestIds.length) {
        throw new Error(`Backend accepted ${acceptedRequestIds.length} of ${liveRequestIds.length} queued groups.`);
      }
      logPowerPrompterDebug('queue:start:batchAccepted', {
        requestIds: acceptedRequestIds,
        groupCount: acceptedRequestIds.length,
      }, { includeQueue: true });
      replaceLocalPausedQueueSnapshot(null);
      void writePersistedPausedQueueSnapshot(null);
    } catch (error: any) {
      setQueuePaused(true);
      logPowerPrompterDebug('queue:start:error', {
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      showToast(String(error?.message || 'Failed to start staged queue'), 'error');
    } finally {
      resumeQueueInFlightRef.current = false;
      setQueueControlBusy(null);
    }
  };

  const executeHardStopComfyQueue = async (action: 'cancel' | 'clear') => {
    if (queueDestructiveActionBusy) return;
    setQueueControlBusy(action);
    logQueueDebug('action:hardStop:start', { action });
    try {
      if (isLocalPausedQueueSnapshotActive()) {
        logQueueDebug('action:hardStop:localPaused', { action });
        clearLocalPausedQueueSnapshotState();
        showToast(action === 'clear' ? 'Cleared paused queue.' : 'Canceled paused queue.', 'success');
        return;
      }

      const requestIds = collectTrackedQueueRequestIds();
      const activeVisual = queueVisualStateRef.current;
      const activeRequestId = String(activeVisual?.requestId || '').trim();
      const activeIndex = Math.max(0, Math.floor(Number(activeVisual?.activeIndex) || 0));
      const activeRequestMeta = activeRequestId ? queueRequestMetaRef.current.get(activeRequestId) : null;
      const activeQueueTargetType = normalizeQueueTargetType(activeRequestMeta?.queueTargetType || selectedQueueTargetType);
      const activeQueueTargetBridgeId = activeRequestMeta?.targetBridgeId || effectiveQueueTargetBridgeId;
      const activeRequestIsLive = !!activeRequestId && (
        queueBridgeDispatchedRequestIdsRef.current.has(activeRequestId)
        || pendingQueueRequestsRef.current.has(activeRequestId)
        || backendQueueSnapshotRequestIdsRef.current.has(activeRequestId)
        || bridgeQueueStateRef.current.activeRequestIds.some((requestId) => String(requestId || '').trim() === activeRequestId)
      );
      const effectiveActiveRequestId = activeRequestIsLive ? activeRequestId : '';
      logQueueDebug('action:hardStop:resolved', {
        action,
        requestIds,
        activeRequestId,
        activeRequestIsLive,
        effectiveActiveRequestId,
        activeIndex,
        activeQueueTargetBridgeId,
        activeQueueTargetType,
      });

      if (action === 'clear') {
        intentionallyCanceledQueueRequestIdsRef.current.clear();
        for (const requestId of requestIds) {
          if (requestId && requestId !== effectiveActiveRequestId) {
            intentionallyCanceledQueueRequestIdsRef.current.add(requestId);
          }
        }
        const clearFutureSent = requestQueueClearFutureThroughWebSocket(
          effectiveActiveRequestId,
          requestIds,
          activeQueueTargetBridgeId,
          activeQueueTargetType
        );
        if (!clearFutureSent && (requestIds.length > 0 || effectiveActiveRequestId)) {
          throw new Error('Power Prompter queue tracker is not connected. Unable to clear queued groups safely.');
        }

        const clearResponse = await fetch('/api/umbrabridge/comfyui/queue/clear', { method: 'POST' });
        const clearPayload = await clearResponse.json().catch(() => ({}));
        if (!clearResponse.ok || clearPayload?.success === false) {
          throw new Error(String(clearPayload?.error || 'Failed to clear ComfyUI queue.'));
        }

        if (effectiveActiveRequestId) {
          logQueueDebug('action:clearFuture:keepActive:start', { activeRequestId: effectiveActiveRequestId, activeIndex, requestIds });
          clearQueueTimingState(requestIds.filter((requestId) => requestId !== effectiveActiveRequestId));
          const activeMeta = queueRequestMetaRef.current.get(effectiveActiveRequestId);
          if (activeMeta) {
            const keptPrompt = String(activeMeta.prompts[activeIndex] || '').trim();
            const keptPromptSetId = clampQueueSetId(activeMeta.promptSetIds[activeIndex] ?? activeMeta.setId);
            const keptGeneration = normalizePowerPrompterGenerationControls(activeMeta.generationByPrompt[activeIndex]);
            if (keptPrompt) {
              const previousTimingKey = getQueuePromptEventKey(effectiveActiveRequestId, activeIndex);
              const nextTimingKey = getQueuePromptEventKey(effectiveActiveRequestId, 0);
              const previousStartedAt = previousTimingKey ? queuePromptStartedAtRef.current.get(previousTimingKey) : undefined;
              if (previousTimingKey && nextTimingKey && previousTimingKey !== nextTimingKey) {
                queuePromptStartedAtRef.current.delete(previousTimingKey);
                if (previousStartedAt) queuePromptStartedAtRef.current.set(nextTimingKey, previousStartedAt);
              }
              queueRequestMetaRef.current.clear();
              queueRequestMetaRef.current.set(effectiveActiveRequestId, {
                mode: activeMeta.mode,
                setId: activeMeta.setId,
                randomApplied: activeMeta.randomApplied,
                queueTargetType: activeMeta.queueTargetType,
                targetBridgeId: activeMeta.targetBridgeId || '',
                dispatchDelayMs: Math.max(0, Math.floor(Number(activeMeta.dispatchDelayMs ?? queueDispatchDelayMsRef.current) || 0)),
                prompts: [keptPrompt],
                promptEntries: activeMeta.promptEntries?.[activeIndex] ? [activeMeta.promptEntries[activeIndex]] : undefined,
                promptSetIds: [keptPromptSetId],
                promptOutputSubfolders: [String(activeMeta.promptOutputSubfolders?.[activeIndex] || '')],
                promptStyleNames: [String(activeMeta.promptStyleNames?.[activeIndex] || '')],
                promptSeedGroupIds: [String(activeMeta.promptSeedGroupIds?.[activeIndex] || `${keptPromptSetId}:0`)],
                generationByPrompt: [keptGeneration],
              });
              setQueueVisualState((prev) => (
                prev && prev.requestId === effectiveActiveRequestId
                  ? {
                    ...prev,
                    prompts: [keptPrompt],
                    promptEntries: prev.promptEntries?.[activeIndex] ? [prev.promptEntries[activeIndex]] : undefined,
                    promptIds: [String(prev.promptIds?.[activeIndex] || '')],
                    promptSeeds: [Number(prev.promptSeeds?.[activeIndex] || 0)],
                    activeIndex: 0,
                    jobProgress: prev.jobProgress,
                    updatedAt: Date.now(),
                  }
                  : prev
              ));
              updateQueueStackItemsSynced((prev) =>
                prev.filter((item) => item.requestId === effectiveActiveRequestId && item.promptIndex === activeIndex)
                  .map((item) => ({
                    ...item,
                    promptIndex: 0,
                    status: item.status === 'failed' ? 'failed' : 'running',
                    exiting: false,
                  }))
              );
              scheduleRecoverableQueueSnapshotPersist({ clearWhenEmpty: true, delayMs: 50 });
              logQueueDebug('action:clearFuture:keepActive:applied', { activeRequestId: effectiveActiveRequestId, activeIndex });
            }
          }
        } else {
          rejectAllPendingQueueRequests('Queue cleared by user.');
          clearQueueManagerLiveDisplay('hard stop clear completed');
          setGenerationPreview((prev) => prev ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev);
          scheduleGenerationPreviewHide();
        }
        setQueuePaused(false);
        logQueueDebug('action:hardStop:clear:end', { activeRequestId: effectiveActiveRequestId, requestIds });
        showToast(effectiveActiveRequestId ? 'Cleared future queued jobs. Current render will finish.' : 'Cleared queue.', 'success');
      } else {
        const cancelSent = requestQueueCancelThroughWebSocket(
          requestIds,
          activeQueueTargetBridgeId,
          activeQueueTargetType
        );
        if (!cancelSent && requestIds.length > 0) {
          throw new Error('Power Prompter queue tracker is not connected. Unable to cancel queued groups safely.');
        }
        const clearResponse = await fetch('/api/umbrabridge/comfyui/queue/clear', { method: 'POST' });
        const clearPayload = await clearResponse.json().catch(() => ({}));
        if (!clearResponse.ok || clearPayload?.success === false) {
          throw new Error(String(clearPayload?.error || 'Failed to clear ComfyUI queue.'));
        }

        const interruptResponse = await fetch('/api/umbrabridge/comfyui/interrupt', { method: 'POST' });
        const interruptPayload = await interruptResponse.json().catch(() => ({}));
        const interruptSucceeded = interruptResponse.ok && interruptPayload?.success !== false;
        const interruptError = interruptSucceeded
          ? ''
          : String(interruptPayload?.error || `ComfyUI interrupt failed (${interruptResponse.status})`);

        rejectAllPendingQueueRequests('Queue canceled by user.');
        clearQueueManagerLiveDisplay('hard stop cancel completed');
        setQueuePaused(false);
        setGenerationPreview((prev) => prev ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev);
        scheduleGenerationPreviewHide();

        if (interruptSucceeded) {
          logQueueDebug('action:hardStop:cancel:end', { requestIds, interruptSucceeded });
          showToast('Canceled queue and active generation', 'success');
        } else {
          logQueueDebug('action:hardStop:cancel:end_with_interrupt_error', { requestIds, interruptError });
          showToast(`Queue cleared, but active cancel failed: ${interruptError}`, 'error');
        }
      }
    } catch (error: any) {
      logQueueDebug('action:hardStop:error', { action, error: String(error?.message || error || '') });
      showToast(String(error?.message || 'Failed to stop ComfyUI queue.'), 'error');
    } finally {
      setQueueConfirmAction(null);
      setQueueControlBusy(null);
      setQueueingMode(null);
      setEditorInteractionResetTick((prev) => prev + 1);
      setEditorRemountTick((prev) => prev + 1);
    }
  };

  const executeCancelActiveComfyJob = async () => {
    if (queueDestructiveActionBusy) return;
    setQueueControlBusy('cancel');
    logQueueDebug('action:cancelActive:start');
    try {
      const activeVisual = queueVisualStateRef.current;
      const activeRunningItem = queueStackItemsRef.current.find((item) => !item.exiting && item.status === 'running') || null;
      const activeRequestId = String(activeRunningItem?.requestId || activeVisual?.requestId || '').trim();
      const hasBridgeActiveWork = bridgeQueueStateRef.current.activeRequestIds.length > 0;
      const hasLiveActiveWork = Boolean(
        activeRunningItem
        || hasBridgeActiveWork
        || (
          activeRequestId
          && !isLocalStagedQueueRequestId(activeRequestId)
          && !activeRequestId.startsWith('paused-')
        )
      );
      if (isLocalPausedQueueSnapshotActive() && !hasLiveActiveWork) {
        logQueueDebug('action:cancelActive:localPaused');
        clearLocalPausedQueueSnapshotState();
        showToast('Canceled paused queue', 'success');
        return;
      }
      const activePromptIndex = activeRunningItem
        ? Math.max(0, Math.floor(Number(activeRunningItem.promptIndex) || 0))
        : Math.max(0, Math.floor(Number(activeVisual?.activeIndex) || 0));
      const activeRequestMeta = activeRequestId ? queueRequestMetaRef.current.get(activeRequestId) : null;
      const resolvedTargetBridgeId = activeRequestMeta?.targetBridgeId || effectiveQueueTargetBridgeId;
      const resolvedQueueTargetType = normalizeQueueTargetType(activeRequestMeta?.queueTargetType || selectedQueueTargetType);
      logQueueDebug('action:cancelActive:resolved', { activeRequestId, activePromptIndex, resolvedTargetBridgeId, resolvedQueueTargetType });
      lastLocalQueueInterruptHandledAtRef.current = Date.now();
      const bridgeInterruptSent = requestQueueInterruptActiveThroughWebSocket(activeRequestId, resolvedTargetBridgeId, resolvedQueueTargetType);

      const interruptResponse = await fetch('/api/umbrabridge/comfyui/interrupt', { method: 'POST' });
      const interruptPayload = await interruptResponse.json().catch(() => ({}));
      if (!interruptResponse.ok || interruptPayload?.success === false) {
        throw new Error(String(interruptPayload?.error || `ComfyUI interrupt failed (${interruptResponse.status})`));
      }

      retireInterruptedQueuePromptLocally(activeRequestId, activePromptIndex);
      lastLocalQueueInterruptHandledAtRef.current = Date.now();
      logQueueDebug('action:cancelActive:end', { activeRequestId, activePromptIndex, bridgeInterruptSent });
      if (!bridgeInterruptSent) {
        showToast('Canceled active job. Bridge sync unavailable; queue advancement may be delayed.', 'error');
      } else {
        showToast('Canceled active job and moved to next prompt', 'success');
      }
    } catch (error: any) {
      logQueueDebug('action:cancelActive:error', { error: String(error?.message || error || '') });
      showToast(String(error?.message || 'Failed to cancel active generation.'), 'error');
    } finally {
      setQueueConfirmAction(null);
      setQueueControlBusy(null);
    }
  };

  useEffect(() => {
    const handleSidebarSkipActiveJob = (event: Event) => {
      if (queueDestructiveActionBusy || !hasCancelableQueueWork) return;
      event.preventDefault();
      void executeCancelActiveComfyJob();
    };

    window.addEventListener('umbra:powerprompter-skip-active-job', handleSidebarSkipActiveJob);
    return () => {
      window.removeEventListener('umbra:powerprompter-skip-active-job', handleSidebarSkipActiveJob);
    };
  }, [executeCancelActiveComfyJob, hasCancelableQueueWork, queueDestructiveActionBusy]);

  const executeClearComfyQueue = async () => {
    await executeHardStopComfyQueue('clear');
  };

  const executeEmergencyComfyRestart = async () => {
    if (queueDestructiveActionBusy) return;
    setQueueControlBusy('emergency');
    logQueueDebug('action:emergency:start');
    try {
      const requestIds = collectTrackedQueueRequestIds();
      const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
      const activeMeta = activeVisualRequestId ? queueRequestMetaRef.current.get(activeVisualRequestId) : null;
      logQueueDebug('action:emergency:resolved', { requestIds, activeVisualRequestId });
      requestQueueCancelThroughWebSocket(
        requestIds,
        activeMeta?.targetBridgeId || effectiveQueueTargetBridgeId,
        activeMeta?.queueTargetType || selectedQueueTargetType
      );

      await fetch('/api/umbrabridge/comfyui/queue/clear', { method: 'POST' }).catch(() => null);
      await fetch('/api/umbrabridge/comfyui/interrupt', { method: 'POST' }).catch(() => null);

      const stopResponse = await fetch('/api/umbrabridge/backend/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'comfyui' }),
      });
      const stopPayload = await stopResponse.json().catch(() => ({}));
      if (!stopResponse.ok || stopPayload?.success === false) {
        throw new Error(String(stopPayload?.error || 'Failed to stop ComfyUI.'));
      }

      const startResponse = await fetch('/api/umbrabridge/backend/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'comfyui' }),
      });
      const startPayload = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || startPayload?.success === false) {
        throw new Error(String(startPayload?.error || 'ComfyUI stopped, but restart failed.'));
      }

      const waitReadyResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'comfyui', timeout: 90000 }),
      });
      const waitReadyPayload = await waitReadyResponse.json().catch(() => ({}));
      if (!waitReadyResponse.ok || waitReadyPayload?.ready !== true) {
        throw new Error(String(waitReadyPayload?.error || 'ComfyUI restart timed out.'));
      }

      queueRequestMetaRef.current.clear();
      completedPromptIndicesRef.current.clear();
      clearQueueTimingState();
      setQueuePaused(false);
      setQueueVisualState(null);
      updateQueueStackItemsSynced([]);
      setGenerationPreview((prev) => prev ? { ...prev, status: 'idle', updatedAt: Date.now() } : prev);
      scheduleGenerationPreviewHide();
      logQueueDebug('action:emergency:end', { requestIds });
      showToast('Emergency shutdown complete. ComfyUI restarted.', 'success');
    } catch (error: any) {
      logQueueDebug('action:emergency:error', { error: String(error?.message || error || '') });
      showToast(String(error?.message || 'Emergency shutdown failed.'), 'error');
    } finally {
      setQueueConfirmAction(null);
      setQueueControlBusy(null);
      setQueueingMode(null);
      setEditorInteractionResetTick((prev) => prev + 1);
      setEditorRemountTick((prev) => prev + 1);
    }
  };

  const toggleQueueSetExpanded = useCallback((setGroupIdInput: string) => {
    const setId = String(setGroupIdInput || '').trim();
    if (!setId) return;
    setExpandedQueueSets((prev) => ({
      ...prev,
      [setId]: !(prev[setId] ?? false),
    }));
  }, []);

  const toggleQueueGroupExpanded = useCallback((requestIdInput: string) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId) return;
    setExpandedQueueGroups((prev) => ({
      ...prev,
      [requestId]: !(prev[requestId] ?? false),
    }));
  }, []);

  const cancelQueueSetGroup = async (setIdInput: number) => {
    const setId = clampQueueSetId(setIdInput);
    if (queueDestructiveActionBusy) return;
    logQueueDebug('action:cancelQueueSetGroup:start', { setId });
    const removalsByRequest = new Map<string, number[]>();
    for (const item of queueStackItemsRef.current) {
      if (item.exiting || item.status !== 'pending') continue;
      const requestId = String(item.requestId || '').trim();
      if (!requestId) continue;
      const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
      const meta = queueRequestMetaRef.current.get(requestId);
      const promptSetId = clampQueueSetId(meta?.promptSetIds?.[promptIndex] ?? meta?.setId ?? 1);
      if (promptSetId !== setId) continue;
      const existing = removalsByRequest.get(requestId) || [];
      existing.push(promptIndex);
      removalsByRequest.set(requestId, existing);
    }
    const requestIds = Array.from(removalsByRequest.keys());
    if (requestIds.length <= 0) {
      logQueueDebug('action:cancelQueueSetGroup:noPendingMatches', { setId });
      const hasRunningMatch = queueStackItemsRef.current.some((item) => {
        if (item.exiting || item.status !== 'running') return false;
        const requestId = String(item.requestId || '').trim();
        const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
        const meta = requestId ? queueRequestMetaRef.current.get(requestId) : null;
        const promptSetId = clampQueueSetId(meta?.promptSetIds?.[promptIndex] ?? meta?.setId ?? 1);
        return promptSetId === setId;
      });
      if (hasRunningMatch) {
        showToast(`Set ${setId} has no future prompts to clear. Current render will finish.`, 'success');
      }
      return;
    }
    setQueueControlBusy('cancel');
    try {
      const promptRemovals = Array.from(removalsByRequest.entries()).map(([requestId, promptIndices]) => ({
        requestId,
        promptIndices: Array.from(new Set(promptIndices)).sort((a, b) => a - b),
      }));
      const removalIndexByRequestId = new Map(
        promptRemovals.map((entry) => [entry.requestId, new Set(entry.promptIndices)] as const)
      );
      const hasRemainingLocalStagedQueueWork = queueStackItemsRef.current.some((item) => {
        if (item.exiting || (item.status !== 'pending' && item.status !== 'running')) return false;
        const itemRequestId = String(item.requestId || '').trim();
        if (!isLocalStagedQueueRequestId(itemRequestId)) return false;
        const removalSet = removalIndexByRequestId.get(itemRequestId);
        if (!removalSet) return true;
        const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
        return !removalSet.has(promptIndex);
      });
      const localPromptRemovals = promptRemovals.filter((entry) => isLocalStagedQueueRequestId(entry.requestId));
      const livePromptRemovals = promptRemovals.filter((entry) => !isLocalStagedQueueRequestId(entry.requestId));
      const firstMeta = queueRequestMetaRef.current.get(livePromptRemovals[0]?.requestId || promptRemovals[0]?.requestId || '');
      const removalRequestId = livePromptRemovals.length > 0
        ? requestQueuePromptRemoveThroughWebSocket(
        livePromptRemovals,
        firstMeta?.targetBridgeId || effectiveQueueTargetBridgeId,
        firstMeta?.queueTargetType || selectedQueueTargetType,
      )
        : null;
      if (livePromptRemovals.length > 0 && !removalRequestId) {
        pendingQueuePromptRemovalOpsRef.current.clear();
        pendingQueuePromptRemovalKeysRef.current.clear();
        throw new Error('Power Prompter queue tracker is not connected. Unable to clear queued set prompts safely.');
      }
      const activeRequestId = String(lockedQueueRequestId || '').trim();
      for (const entry of promptRemovals) {
        if (String(entry.requestId || '').trim() === activeRequestId) {
          pruneTrackedQueueRequestToActivePrompt(entry.requestId);
        } else {
          applyLocalPromptRemoval(entry.requestId, entry.promptIndices);
        }
        clearedQueueRequestIdsRef.current.add(entry.requestId);
      }
      if (livePromptRemovals.length > 0) {
        void persistQueuePromptRemovalMutation(livePromptRemovals);
      }
      setQueuePaused(hasRemainingLocalStagedQueueWork);
      const removedPromptCount = promptRemovals.reduce((total, entry) => total + entry.promptIndices.length, 0);
      logQueueDebug('action:cancelQueueSetGroup:end', {
        setId,
        requestIds,
        activeRequestId,
        removedPromptCount,
        localRemovalCount: localPromptRemovals.length,
        liveRemovalCount: livePromptRemovals.length,
        hasRemainingLocalStagedQueueWork,
        removalRequestId,
      });
      showToast(
        removalRequestId
          ? `Cleared ${removedPromptCount} future prompt${removedPromptCount === 1 ? '' : 's'} from Set ${setId}`
          : `Cleared ${removedPromptCount} staged prompt${removedPromptCount === 1 ? '' : 's'} from Set ${setId} locally`,
        'success',
      );
    } catch (error: any) {
      logQueueDebug('action:cancelQueueSetGroup:error', { setId, error: String(error?.message || error || '') });
      showToast(String(error?.message || 'Failed to cancel queue set'), 'error');
    } finally {
      setQueueControlBusy(null);
    }
  };

  const cancelQueueRequestGroup = async (requestIdInput: string) => {
    const requestId = String(requestIdInput || '').trim();
    if (!requestId || queueDestructiveActionBusy) return;
    logQueueDebug('action:cancelQueueRequestGroup:start', { requestId });
    const meta = queueRequestMetaRef.current.get(requestId);
    const activeRequestId = String(lockedQueueRequestId || '').trim();
    const isActiveRequest = activeRequestId === requestId;
    const isLocalStagedRequest = isLocalStagedQueueRequestId(requestId);
    setQueueControlBusy('cancel');
    try {
      if (isActiveRequest) {
        const group = queueRequestGroups.find((entry) => entry.requestId === requestId) || null;
        const pendingPromptIndices = group
          ? group.items
            .filter((entry) => !entry.exiting && entry.status === 'pending')
            .map((entry) => Math.max(0, Math.floor(Number(entry.promptIndex) || 0)))
          : [];
        if (pendingPromptIndices.length <= 0) {
          clearedQueueRequestIdsRef.current.add(requestId);
          pruneTrackedQueueRequestToActivePrompt(requestId);
          if (isLocalStagedRequest) {
            clearMatchingLocalPausedSnapshotRequestIds([requestId]);
          }
          setQueuePaused(false);
          logQueueDebug('action:cancelQueueRequestGroup:activeNoPending', { requestId });
          showToast('Cleared group from the manager. Current render will finish.', 'success');
          return;
        }
        const removalRequestId = isLocalStagedRequest
          ? null
          : requestQueuePromptRemoveThroughWebSocket(
          [{ requestId, promptIndices: pendingPromptIndices }],
          meta?.targetBridgeId || effectiveQueueTargetBridgeId,
          meta?.queueTargetType || selectedQueueTargetType,
        );
        if (!isLocalStagedRequest && !removalRequestId) {
          pendingQueuePromptRemovalOpsRef.current.clear();
          pendingQueuePromptRemovalKeysRef.current.clear();
          throw new Error('Power Prompter queue tracker is not connected. Unable to clear queued group prompts safely.');
        }
        pruneTrackedQueueRequestToActivePrompt(requestId);
        if (isLocalStagedRequest) {
          removeLocalPausedSnapshotPromptIndices(requestId, pendingPromptIndices);
        } else {
          void persistQueuePromptRemovalMutation([{ requestId, promptIndices: pendingPromptIndices }]);
        }
        clearedQueueRequestIdsRef.current.add(requestId);
        setQueuePaused(false);
        logQueueDebug('action:cancelQueueRequestGroup:activePruned', { requestId, pendingPromptIndices, removalRequestId });
        showToast(
          removalRequestId
            ? `Cleared ${pendingPromptIndices.length} future prompt${pendingPromptIndices.length === 1 ? '' : 's'} from Set ${clampQueueSetId(meta?.setId ?? 1)} group. Current render will finish.`
            : `Cleared ${pendingPromptIndices.length} staged prompt${pendingPromptIndices.length === 1 ? '' : 's'} from Set ${clampQueueSetId(meta?.setId ?? 1)} group locally.`,
          'success',
        );
        return;
      }

      intentionallyCanceledQueueRequestIdsRef.current.add(requestId);
      const sent = isLocalStagedRequest
        ? false
        : requestQueueCancelThroughWebSocket(
        [requestId],
        meta?.targetBridgeId || effectiveQueueTargetBridgeId,
        meta?.queueTargetType || selectedQueueTargetType,
      );
      if (!isLocalStagedRequest && !sent) {
        pendingQueueCancelScopeRef.current = [];
        throw new Error('Power Prompter queue tracker is not connected. Unable to cancel queued group safely.');
      }
      const hasRemainingLocalStagedQueueWork = queueStackItemsRef.current.some((item) =>
        !item.exiting
        && (item.status === 'pending' || item.status === 'running')
        && String(item.requestId || '').trim() !== requestId
        && isLocalStagedQueueRequestId(item.requestId)
      );
      rejectPendingQueueRequestById(requestId, 'Queue canceled by user.');
      dropTrackedQueueRequestState([requestId]);
      setQueuePaused(isLocalStagedRequest && hasRemainingLocalStagedQueueWork);
      logQueueDebug('action:cancelQueueRequestGroup:inactiveDropped', { requestId, sent, isLocalStagedRequest, hasRemainingLocalStagedQueueWork });
      showToast(
        sent
          ? `Canceled Set ${clampQueueSetId(meta?.setId ?? 1)} group`
          : `Cleared Set ${clampQueueSetId(meta?.setId ?? 1)} group from the staged list locally`,
        'success',
      );
    } catch (error: any) {
      logQueueDebug('action:cancelQueueRequestGroup:error', { requestId, error: String(error?.message || error || '') });
      showToast(String(error?.message || 'Failed to cancel queue group'), 'error');
    } finally {
      setQueueControlBusy(null);
    }
  };

  const handleCancelActiveComfyJob = () => {
    if (queueDestructiveActionBusy || !hasCancelableQueueWork) return;
    setQueueConfirmAction('cancel');
  };

  const handleClearComfyQueue = () => {
    if (queueDestructiveActionBusy || !hasClearableQueueWork) return;
    setQueueConfirmAction('clear');
  };

  const handleEmergencyComfyRestart = () => {
    if (queueDestructiveActionBusy || !hasCancelableQueueWork) return;
    setQueueConfirmAction('emergency');
  };

  queuePauseActionRef.current = handleToggleQueuePause;
  queueStartActionRef.current = handleStartQueuedDispatch;
  queueCancelActionRef.current = handleCancelActiveComfyJob;
  queueClearActionRef.current = handleClearComfyQueue;
  queueEmergencyActionRef.current = handleEmergencyComfyRestart;
  queueToggleSetExpandedRef.current = toggleQueueSetExpanded;
  queueToggleGroupExpandedRef.current = toggleQueueGroupExpanded;
  queueCancelSetGroupRef.current = cancelQueueSetGroup;
  queueCancelRequestGroupRef.current = cancelQueueRequestGroup;

  async function commitQueueDiversity(rawValue: unknown) {
    const nextDiversity = normalizeQueueDiversity(rawValue, settings.queueTraversalMode);
    const currentDiversity = normalizeQueueDiversity(settings.queueDiversity, settings.queueTraversalMode);
    if (nextDiversity === currentDiversity) return true;
    logPowerPrompterDebug('cycle:diversity:commit', {
      previous: currentDiversity,
      next: nextDiversity,
      traversalMode: settings.queueTraversalMode,
    });
    const nextSettings = normalizePowerPrompterSettings({
      ...settings,
      queueDiversity: nextDiversity,
      queueTraversalMode: resolveQueueTraversalMode(settings.queueTraversalMode, nextDiversity),
    });
    return persistSettings(nextSettings, { silent: true });
  }

  const handleQueuePromptLimitFocus = useCallback(() => {
    queuePromptLimitEditingRef.current = true;
  }, []);

  const handleQueuePromptLimitDraftChange = useCallback((rawValue: unknown) => {
    queuePromptLimitEditingRef.current = true;
    const nextValue = String(rawValue ?? '').replace(/[^\d]/g, '');
    setQueuePromptLimitDraft(nextValue);
  }, []);

  async function commitQueuePromptLimit(rawValue: unknown) {
    queuePromptLimitEditingRef.current = false;
    const normalizedPromptLimit = normalizeQueuePromptLimit(rawValue);
    const nextPromptLimit = normalizedPromptLimit === null
      ? null
      : Math.max(queuePromptLimitMinimum, normalizedPromptLimit);
    const currentPromptLimit = normalizeQueuePromptLimit(settings.queuePromptLimit);
    setQueuePromptLimitDraft(nextPromptLimit === null ? '' : String(nextPromptLimit));
    if (nextPromptLimit === currentPromptLimit) return true;
    logPowerPrompterDebug('cycle:promptLimit:commit', {
      previous: currentPromptLimit,
      next: nextPromptLimit,
      minimum: queuePromptLimitMinimum,
    });
    const nextSettings = normalizePowerPrompterSettings({
      ...settings,
      queuePromptLimit: nextPromptLimit,
    });
    setSettings(nextSettings);
    return persistSettings(nextSettings, { silent: true });
  }

  async function commitQueueTraversalMode(nextModeRaw: unknown) {
    const nextMode = normalizeQueueTraversalMode(nextModeRaw);
    const currentMode = normalizeQueueTraversalMode(settings.queueTraversalMode);
    if (nextMode === currentMode) return true;
    const nextDiversity = nextMode === 'exhaustive'
      ? QUEUE_DIVERSITY_MAX
      : QUEUE_DIVERSITY_MIN;
    logPowerPrompterDebug('cycle:traversalMode:commit', {
      previous: currentMode,
      next: nextMode,
      nextDiversity,
    });
    const nextSettings = normalizePowerPrompterSettings({
      ...settings,
      queueTraversalMode: nextMode,
      queueDiversity: nextDiversity,
    });
    setQueueDiversityDraft(nextDiversity);
    setSettings(nextSettings);
    return persistSettings(nextSettings, { silent: true });
  }

  function applyQueueDiversityDelta(delta: number) {
    let changed = false;
    setQueueDiversityDraft((prev) => {
      const next = normalizeQueueDiversity(Number(prev) + delta, settings.queueTraversalMode);
      changed = next !== prev;
      return next;
    });
    if (changed) {
      queueDiversityHoldDirtyRef.current = true;
    }
  }

  function stopQueueDiversityHold() {
    if (queueDiversityHoldTimeoutRef.current) {
      clearTimeout(queueDiversityHoldTimeoutRef.current);
      queueDiversityHoldTimeoutRef.current = null;
    }
    if (queueDiversityHoldIntervalRef.current) {
      clearInterval(queueDiversityHoldIntervalRef.current);
      queueDiversityHoldIntervalRef.current = null;
    }
    if (queueDiversityHoldDirtyRef.current) {
      queueDiversityHoldDirtyRef.current = false;
      void commitQueueDiversity(queueDiversityDraftRef.current);
    }
  }

  function startQueueDiversityHold(delta: number) {
    stopQueueDiversityHold();
    applyQueueDiversityDelta(delta);
    queueDiversityHoldTimeoutRef.current = setTimeout(() => {
      queueDiversityHoldIntervalRef.current = setInterval(() => {
        applyQueueDiversityDelta(delta);
      }, 60);
    }, 220);
  }

  const handleToggleQueueShuffle = async () => {
    const nextShuffleEnabled = settings.queueShuffleEnabled !== true;
    const nextSettings = normalizePowerPrompterSettings({
      ...settings,
      queueShuffleEnabled: nextShuffleEnabled,
      queueShuffleSeed: nextShuffleEnabled ? createQueueShuffleSeed() : settings.queueShuffleSeed,
    });
    logPowerPrompterDebug('randomization:queueShuffle:toggled', {
      previousEnabled: settings.queueShuffleEnabled === true,
      nextEnabled: nextShuffleEnabled,
      previousSeed: settings.queueShuffleSeed,
      nextSeed: nextSettings.queueShuffleSeed,
    });
    setSettings(nextSettings);
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      showToast('Failed to update queue shuffle setting', 'error');
    }
  };

  const resolveQueuePrompts = async (
    mode: PowerPrompterQueueMode,
    options?: {
      setId?: number;
      includeAllSets?: boolean;
      traversalMode?: PowerPrompterQueueTraversalMode;
      diversity?: number;
      promptLimit?: number | null;
      shuffleEnabled?: boolean;
      shuffleSeed?: number;
    }
  ): Promise<{
    prompts: string[];
    promptEntries: QueuePromptPreviewEntry[];
    promptSetIds: number[];
    promptOutputSubfolders: string[];
    promptStyleNames: string[];
    promptSeedGroupIds: string[];
    truncated: boolean;
    warnings: string[];
    randomApplied: boolean;
  }> => {
    const startedAt = performance.now();
    const diagnosticOptions = {
      setId: options?.setId,
      includeAllSets: options?.includeAllSets === true,
      traversalMode: normalizeQueueTraversalMode(options?.traversalMode),
      diversity: normalizeQueueDiversity(options?.diversity, normalizeQueueTraversalMode(options?.traversalMode)),
      promptLimit: options?.promptLimit ?? queuePromptLimit,
      shuffleEnabled: options?.shuffleEnabled === true,
      shuffleSeed: options?.shuffleSeed ?? settings.queueShuffleSeed,
    };
    logPowerPrompterDebug('promptBuild:resolve:start', {
      mode,
      ...diagnosticOptions,
    });
    const built = await buildQueuePromptsOnWorker({
      document: cardDocumentRef.current,
      mode,
      workerRef: queueWorkerRef,
      requestSeqRef: queueWorkerRequestSeqRef,
      pendingSignatureRef: queueWorkerPendingSignatureRef,
      options: {
        setIdOverride: options?.setId,
        includeAllSets: options?.includeAllSets === true,
        traversalMode: options?.traversalMode,
        diversity: options?.diversity,
        promptLimit: options?.promptLimit ?? queuePromptLimit,
        shuffleEnabled: options?.shuffleEnabled,
        shuffleSeed: options?.shuffleSeed ?? settings.queueShuffleSeed,
      },
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    logPowerPrompterDebug('promptBuild:resolve:end', {
      mode,
      ...diagnosticOptions,
      promptCount: built.prompts.length,
      promptEntryCount: built.promptEntries.length,
      setIds: Array.from(new Set(built.promptSetIds)).sort((a, b) => a - b),
      outputFolderCount: Array.from(new Set(built.promptOutputSubfolders.filter(Boolean))).length,
      styleNameCount: Array.from(new Set(built.promptStyleNames.filter(Boolean))).length,
      seedGroupCount: Array.from(new Set(built.promptSeedGroupIds.filter(Boolean))).length,
      truncated: built.truncated,
      warningCount: built.warnings.length,
      randomApplied: built.randomApplied,
      elapsedMs,
    });
    if (elapsedMs >= 500) {
      logPowerPrompterDebug('promptBuild:resolve:slow', {
        mode,
        ...diagnosticOptions,
        promptCount: built.prompts.length,
        truncated: built.truncated,
        warningCount: built.warnings.length,
        elapsedMs,
      });
    }
    return built;
  };

  const handleExportSetAsTxt = useCallback(async () => {
    const targetSetId = clampQueueSetId(queueSetTarget);
    const traversalMode = normalizeQueueTraversalMode(queueTraversalMode);
    const diversity = normalizeQueueDiversity(queueDiversity, traversalMode);
    const promptLimit = queuePromptLimit;
    const shuffleEnabled = queueShuffleEnabled;
    try {
      const { prompts, truncated } = await resolveQueuePrompts('selected', {
        setId: targetSetId,
        traversalMode,
        diversity,
        promptLimit,
        shuffleEnabled,
      });
      if (prompts.length <= 0) {
        showToast('No prompts available to export', 'error');
        return;
      }

      const docName = String(currentFileRef.current || '')
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.ppcards\.json$/i, '')
        || 'power-prompter-set';
      const safeDocName = docName
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64) || 'power-prompter-set';
      const fileName = `${safeDocName}-set-${targetSetId}.txt`;
      const exportText = `${prompts
        .map((prompt) => String(prompt || '').replace(/\r?\n+/g, ' ').trim())
        .join('\n')}\n`;

      downloadTextThroughBrowser(exportText, fileName);
      showToast(
        `Exported ${prompts.length} prompt${prompts.length === 1 ? '' : 's'}${truncated ? ' (capped)' : ''}`,
        'success'
      );
    } catch (error: any) {
      if (String(error?.name || '').toLowerCase() === 'aborterror') return;
      showToast(String(error?.message || 'Failed to export set as .txt'), 'error');
    }
  }, [
    queueSetTarget,
    queueTraversalMode,
    queueDiversity,
    queuePromptLimit,
    queueShuffleEnabled,
    resolveQueuePrompts,
    queueDiversityLabel,
    showToast,
  ]);

  const handleQueuePrompts = async (
    mode: PowerPrompterQueueMode,
    options?: {
      setId?: number;
      includeAllSets?: boolean;
      traversalMode?: PowerPrompterQueueTraversalMode;
      diversity?: number;
      promptLimit?: number | null;
      shuffleEnabled?: boolean;
      shuffleSeed?: number;
    }
  ) => {
    if (queueingMode || queueSubmissionInFlightRef.current) {
      logQueueDebug('queue:submit:blockedInFlight', { mode, requestedSetId: options?.setId ?? cardDocumentRef.current.activeQueueSet });
      return;
    }
    queueSubmissionInFlightRef.current = true;
    const activeVisualRequestId = String(queueVisualStateRef.current?.requestId || '').trim();
    const hasTrackedDispatchQueue = queueStackItemsRef.current.some((item) =>
      !item.exiting &&
      (item.status === 'pending' || item.status === 'running') &&
      queueRequestMetaRef.current.has(String(item.requestId || '').trim())
    );
    const localPausedQueueActive = isLocalPausedQueueSnapshotActive();
    const shouldAppendToLiveQueue = hasTrackedDispatchQueue
      && !queuePausedRef.current
      && !localPausedQueueActive
      && !activeVisualRequestId.startsWith('paused-')
      && !activeVisualRequestId.startsWith('staged-');
    const generation = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
    const pipeline = normalizeUmbraUiPipelineSelection(cardDocumentRef.current.pipeline, {
      feature: 'txt2img',
      modelFamily: cardDocumentRef.current.modelType,
      modelSource: generation.modelType,
    });
    if (!pipeline.modelFamilyKey) {
      queueSubmissionInFlightRef.current = false;
      showToast('Choose a model family pipeline before queueing.', 'error');
      return;
    }
    const params = new URLSearchParams({
      feature: pipeline.feature,
      modelFamily: pipeline.modelFamily,
      modelSource: pipeline.modelSource,
    });
    try {
      const response = await fetch(`/api/umbra-ui/pipelines/resolve?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'No compatible Umbra UI pipeline is installed.'));
      }
    } catch (error: any) {
      queueSubmissionInFlightRef.current = false;
      showToast(String(error?.message || 'Failed to validate the Umbra UI pipeline.'), 'error');
      return;
    }
    setQueueingMode(mode);
    let requestIdForError: string | null = null;
    const targetSetId = clampQueueSetId(options?.setId ?? cardDocumentRef.current.activeQueueSet);
    const traversalMode = normalizeQueueTraversalMode(options?.traversalMode ?? queueTraversalMode);
    const diversity = normalizeQueueDiversity(options?.diversity ?? queueDiversity, traversalMode);
    const promptLimit = options?.promptLimit ?? queuePromptLimit;
    const shuffleEnabled = options?.shuffleEnabled ?? queueShuffleEnabled;
    const shuffleSeed = options?.shuffleSeed ?? settings.queueShuffleSeed;
    logPowerPrompterDebug('queue:stage:start', {
      mode,
      targetSetId,
      includeAllSets: options?.includeAllSets === true,
      traversalMode,
      diversity,
      promptLimit,
      shuffleEnabled,
      shuffleSeed,
      shouldAppendToLiveQueue,
      hasTrackedDispatchQueue,
      localPausedQueueActive,
      queuePaused: queuePausedRef.current,
      activeVisualRequestId,
    }, { includeQueue: true });

    try {
      await waitForNextUiPaint();
      const {
        prompts,
        promptEntries,
        promptSetIds,
        promptOutputSubfolders,
        promptStyleNames,
        promptSeedGroupIds,
        truncated,
        warnings,
        randomApplied,
      } = await resolveQueuePrompts(mode, {
        setId: targetSetId,
        includeAllSets: options?.includeAllSets === true,
        traversalMode,
        diversity,
        promptLimit,
        shuffleEnabled,
        shuffleSeed,
      });
      logPowerPrompterDebug('queue:stage:promptsBuilt', {
        mode,
        targetSetId,
        promptCount: prompts.length,
        promptEntryCount: promptEntries.length,
        setIds: Array.from(new Set(promptSetIds)).sort((a, b) => a - b),
        outputFolderCount: Array.from(new Set(promptOutputSubfolders.filter(Boolean))).length,
        styleNameCount: Array.from(new Set(promptStyleNames.filter(Boolean))).length,
        seedGroupCount: Array.from(new Set(promptSeedGroupIds.filter(Boolean))).length,
        truncated,
        warningCount: warnings.length,
        randomApplied,
      }, { includeQueue: true });
      if (prompts.length === 0) {
        logPowerPrompterDebug('queue:stage:noPrompts', { mode, targetSetId }, { includeQueue: true });
        showToast('No prompts available to queue', 'error');
        return;
      }
      if (truncated) {
        if (diversity >= 100) {
          showToast('Queue limit reached before submitting all combinations', 'success');
        } else {
          showToast(`Queue diversity limited output to ${prompts.length} prompt${prompts.length === 1 ? '' : 's'}`, 'success');
        }
      }
      if (warnings.length > 0) {
        const names = warnings.slice(0, 3).join(', ');
        const suffix = warnings.length > 3 ? ` +${warnings.length - 3} more` : '';
        showToast(
          `Random set skipped cards with no enabled variants: ${names}${suffix}.`,
          'error'
        );
      }

      const resolvedQueueTarget = resolveQueueControlTarget(effectiveQueueTargetBridgeId, selectedQueueTargetType);
      const normalizedGeneration = normalizePowerPrompterGenerationControls(cardDocumentRef.current.generation);
      const queueSeedSalt = normalizedGeneration.controlAfterGenerate === 'randomize'
        ? createQueueShuffleSeed()
        : shuffleSeed;
      const editorSnapshot = createQueueEditorSnapshot(
        cardDocumentRef.current,
        currentFileRef.current || null,
        {
          traversalMode,
          diversity,
          promptLimit,
          shuffleEnabled,
          shuffleSeed,
        }
      );
      const seedGroupIndexById = new Map<string, number>();
      const generationByPrompt = prompts.map((_, promptIndex) => {
        const promptSetId = clampQueueSetId(promptSetIds[promptIndex] ?? targetSetId);
        const seedGroupId = String(promptSeedGroupIds[promptIndex] || `${promptSetId}:${promptIndex}`).trim();
        if (!seedGroupIndexById.has(seedGroupId)) {
          seedGroupIndexById.set(seedGroupId, seedGroupIndexById.size);
        }
        const seedGroupIndex = seedGroupIndexById.get(seedGroupId) ?? promptIndex;
        return normalizePowerPrompterGenerationControls({
          ...normalizedGeneration,
          seed: resolveSeedForQueuePromptGroup(normalizedGeneration, seedGroupIndex, queueSeedSalt),
          controlAfterGenerate: 'fixed',
          // The active prompt text is the only LoRA source of truth for queued
          // style/variant runs. Explicit <lora:...> tags in that prompt are
          // parsed by Umbra LoRA syntax; UI LoRA toggles must not apply
          // LoRAs that are absent from the currently running prompt.
          loras: [],
        });
      });
      logPowerPrompterDebug('randomization:generationSeeds:resolved', {
        mode,
        targetSetId,
        promptCount: prompts.length,
        seedMode: normalizedGeneration.controlAfterGenerate,
        queueSeedSalt,
        uniqueSeedGroupCount: seedGroupIndexById.size,
        firstSeed: generationByPrompt[0]?.seed ?? null,
        lastSeed: generationByPrompt[generationByPrompt.length - 1]?.seed ?? null,
      });
      const submissionSignature = buildQueueSubmissionSignature({
        file: currentFileRef.current || null,
        mode,
        setId: targetSetId,
        traversalMode,
        diversity,
        promptLimit,
        shuffleEnabled,
        shuffleSeed,
        prompts,
        promptSetIds,
      });
      const now = Date.now();
      for (const [signature, timestamp] of Array.from(recentQueueSubmissionSignaturesRef.current.entries())) {
        if (now - timestamp > 900) {
          recentQueueSubmissionSignaturesRef.current.delete(signature);
        }
      }
      const lastSubmittedAt = recentQueueSubmissionSignaturesRef.current.get(submissionSignature) || 0;
      if (lastSubmittedAt && now - lastSubmittedAt <= 900) {
        logQueueDebug('queue:submit:duplicateSignatureBlocked', {
          mode,
          setId: targetSetId,
          promptCount: prompts.length,
          ageMs: now - lastSubmittedAt,
        });
        showToast('Ignored duplicate queue submit.', 'success');
        return;
      }
      recentQueueSubmissionSignaturesRef.current.set(submissionSignature, now);

      const stagedGroups: Array<{ requestId: string; setId: number; sourceIndices: number[] }> = [];
      for (let promptIndex = 0; promptIndex < prompts.length; promptIndex += 1) {
        const promptSetId = clampQueueSetId(promptSetIds[promptIndex] ?? targetSetId);
        const previousGroup = stagedGroups[stagedGroups.length - 1] || null;
        if (previousGroup && previousGroup.setId === promptSetId) {
          previousGroup.sourceIndices.push(promptIndex);
        } else {
          stagedGroups.push({
            requestId: shouldAppendToLiveQueue ? createRequestId() : createStagedQueueRequestId(),
            setId: promptSetId,
            sourceIndices: [promptIndex],
          });
        }
      }
      if (stagedGroups.length <= 0) {
        logPowerPrompterDebug('queue:stage:noGroups', {
          mode,
          targetSetId,
          promptCount: prompts.length,
        }, { includeQueue: true });
        showToast('No prompts available to stage', 'error');
        return;
      }

      const nowForRows = Date.now();
      const nextStackItems = stagedGroups.flatMap((group, groupIndex) => {
        const groupPrompts = group.sourceIndices.map((sourceIndex) => prompts[sourceIndex] || '');
        const groupPromptSetIds = group.sourceIndices.map((sourceIndex) => clampQueueSetId(promptSetIds[sourceIndex] ?? group.setId));
        const groupPromptEntries = promptEntries.length > 0
          ? group.sourceIndices.map((sourceIndex) => promptEntries[sourceIndex] || { prompt: prompts[sourceIndex] || '', tokens: [] })
          : undefined;
        const groupOutputSubfolders = group.sourceIndices.map((sourceIndex) => String(promptOutputSubfolders[sourceIndex] || '').trim());
        const groupStyleNames = group.sourceIndices.map((sourceIndex) => String(promptStyleNames[sourceIndex] || '').trim());
        const groupSeedGroupIds = group.sourceIndices.map((sourceIndex, groupPromptIndex) =>
          String(promptSeedGroupIds[sourceIndex] || `${groupPromptSetIds[groupPromptIndex] ?? group.setId}:${groupPromptIndex}`).trim()
        );
        const groupGenerationByPrompt = group.sourceIndices.map((sourceIndex) =>
          normalizePowerPrompterGenerationControls(generationByPrompt[sourceIndex] ?? normalizedGeneration)
        );
        queueRequestMetaRef.current.set(group.requestId, {
          mode,
          setId: group.setId,
          randomApplied,
          queueTargetType: resolvedQueueTarget.queueTargetType,
          targetBridgeId: resolvedQueueTarget.targetBridgeId,
          dispatchDelayMs: queueDispatchDelayMsRef.current,
          prompts: groupPrompts,
          promptEntries: groupPromptEntries,
          promptSetIds: groupPromptSetIds,
          promptOutputSubfolders: groupOutputSubfolders,
          promptStyleNames: groupStyleNames,
          promptSeedGroupIds: groupSeedGroupIds,
          generationByPrompt: groupGenerationByPrompt,
          editorSnapshot,
        });
        return groupPrompts.map((prompt, promptIndex) => ({
          id: `${group.requestId}-${promptIndex}-${prompt.slice(0, 24)}`,
          requestId: group.requestId,
          promptIndex,
          prompt,
          styleName: groupStyleNames[promptIndex],
          styleFolderName: groupOutputSubfolders[promptIndex],
          status: 'pending' as const,
          createdAt: nowForRows + (groupIndex * 100000) + promptIndex,
          exiting: false,
        }));
      });

      logPowerPrompterDebug('queue:stage:rowsReady', {
        mode,
        targetSetId,
        requestIds: stagedGroups.map((group) => group.requestId),
        groupSetIds: stagedGroups.map((group) => group.setId),
        promptCount: prompts.length,
        groupCount: stagedGroups.length,
        appendToLiveQueue: shouldAppendToLiveQueue,
      }, { includeQueue: true });

      if (shouldAppendToLiveQueue) {
        updateQueueStackItemsSynced(applyQueueStackRunningState([
          ...queueStackItemsRef.current,
          ...nextStackItems,
        ]));
        setQueuePaused(false);
        const dispatchedRequestIds: string[] = [];
        try {
          for (const group of stagedGroups) {
            const dispatched = await dispatchTrackedQueueGroupToBridge(
              group.requestId,
              'append visible queue group',
              { allowBridgeBacklog: true }
            );
            if (!dispatched) {
              if (!isQueueGroupSubmittedToBridge(group.requestId)) {
                throw new Error(`Failed to dispatch queued group ${dispatchedRequestIds.length + 1}.`);
              }
              logPowerPrompterDebug('queue:stage:appendAlreadySubmitted', {
                requestId: group.requestId,
                groupIndex: dispatchedRequestIds.length + 1,
              }, { includeQueue: true });
            }
            dispatchedRequestIds.push(group.requestId);
          }
        } catch (dispatchError) {
          for (const group of stagedGroups) {
            queueRequestMetaRef.current.delete(group.requestId);
          }
          updateQueueStackItemsSynced((prev) =>
            prev.filter((item) => !stagedGroups.some((group) => group.requestId === String(item.requestId || '').trim()))
          );
          throw dispatchError;
        }
        showToast(
          `Staged ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} behind the active queue`,
          'success'
        );
        return;
      }

      const hasExistingLocalStage = queuePausedRef.current && queueStackItemsRef.current.some((item) =>
        !item.exiting && isLocalStagedQueueRequestId(item.requestId)
      );
      if (!hasExistingLocalStage) {
        for (const requestId of Array.from(queueRequestMetaRef.current.keys())) {
          if (!stagedGroups.some((group) => group.requestId === requestId)) {
            queueRequestMetaRef.current.delete(requestId);
          }
        }
        completedPromptIndicesRef.current.clear();
        clearQueueTimingState();
        updateQueueStackItemsSynced(nextStackItems);
      } else {
        updateQueueStackItemsSynced([
          ...queueStackItemsRef.current,
          ...nextStackItems,
        ]);
      }
      setQueuePaused(true);
      restoredPausedQueueRef.current = null;
      powerPrompterQueueSession.restoredPausedQueue = null;
      lastPersistedQueueSnapshotSignatureRef.current = '';
      const firstGroup = stagedGroups[0];
      const firstMeta = firstGroup ? queueRequestMetaRef.current.get(firstGroup.requestId) : null;
      if (firstGroup && firstMeta) {
        setQueueVisualState((prev) => (hasExistingLocalStage && prev ? prev : {
          requestId: firstGroup.requestId,
          mode,
          activeSetId: firstGroup.setId,
          prompts: [...firstMeta.prompts],
          promptEntries: firstMeta.promptEntries ? [...firstMeta.promptEntries] : undefined,
          promptIds: firstMeta.prompts.map(() => ''),
          promptSeeds: firstMeta.prompts.map(() => 0),
          activeIndex: 0,
          jobProgress: 0,
          updatedAt: Date.now(),
        }));
      }
      logPowerPrompterDebug('queue:stage:localRowsApplied', {
        mode,
        targetSetId,
        promptCount: prompts.length,
        groupCount: stagedGroups.length,
        appendedToExistingStage: hasExistingLocalStage,
      }, { includeQueue: true });
      showToast(
        `Added ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} to staged queue. Press Start Queue to send.`,
        'success'
      );
    } catch (error: any) {
      logPowerPrompterDebug('queue:stage:error', {
        mode,
        targetSetId,
        message: String(error?.message || error || 'Unknown error'),
      }, { includeQueue: true });
      if (requestIdForError) {
        queueRequestMetaRef.current.delete(requestIdForError);
        setQueueVisualState((prev) => (prev && prev.requestId === requestIdForError ? null : prev));
        setGenerationPreview((prev) => {
          if (!prev) return prev;
          if (prev.requestId && prev.requestId !== requestIdForError) return prev;
          return {
            ...prev,
            status: 'idle',
            updatedAt: Date.now(),
          };
        });
        scheduleGenerationPreviewHide();
      }
      if (requestIdForError) {
        updateQueueStackItemsSynced((prev) =>
          prev.map((item) => {
            if (item.requestId !== requestIdForError || item.exiting) return item;
            return { ...item, status: 'failed', exiting: true };
          })
        );
        const timer = setTimeout(() => {
          queueStackRemoveTimersRef.current.delete(timer);
          updateQueueStackItemsSynced((prev) =>
            prev.filter((item) => item.requestId !== requestIdForError)
          );
        }, 1100);
        queueStackRemoveTimersRef.current.add(timer);
      }
      showToast(String(error?.message || 'Failed to queue prompts'), 'error');
    } finally {
      queueSubmissionInFlightRef.current = false;
      setQueueingMode(null);
    }
  };

  const isQueueManagerPanel = prompterPanelMode === 'queue-manager'
    || (POWER_PROMPTER_QUEUE_EDITOR_ENABLED && prompterPanelMode === 'queue-editor');
  const isEditorPanelActive = prompterPanelMode === 'editor';
  const isQueueEditorPanelActive = POWER_PROMPTER_QUEUE_EDITOR_ENABLED && prompterPanelMode === 'queue-editor';
  const floatingToolMenusEnabled = !isPhoneRemote;
  const setFileMenuCollapsed = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setLeftPanelCollapsed((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      if (!next && floatingToolMenusEnabled) setRightPanelCollapsed(true);
      return next;
    });
  }, [floatingToolMenusEnabled]);
  const setTagMenuCollapsed = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    setRightPanelCollapsed((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      if (!next && floatingToolMenusEnabled) setLeftPanelCollapsed(true);
      return next;
    });
  }, [floatingToolMenusEnabled]);

  return (
    <div
      data-umbra-powerprompter-root=""
      data-umbra-powerprompter-phone={isPhoneRemote ? '1' : '0'}
      className={overlayMode
      ? 'relative flex h-full w-full overflow-hidden bg-[rgba(5,5,8,0.76)]'
      : 'relative flex h-full w-full overflow-hidden bg-[#050508]'
    }>
      {!floatingToolMenusEnabled ? (
        leftPanelCollapsed ? (
          <div
            data-umbra-powerprompter-left-rail=""
            className="w-9 border-r border-white/5 flex-shrink-0 flex items-start justify-center pt-2"
            style={overlayMode ? { backgroundColor: 'rgba(5,5,8,0.86)' } : undefined}
          >
            <button
              onClick={() => setLeftPanelCollapsed(false)}
              className="p-1.5 rounded-md border border-white/15 bg-white/[0.04] text-zinc-300 hover:text-zinc-100 hover:border-white/30"
              title="Open file sidebar"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <PowerPrompterSidebar
            currentFile={currentFile}
            onFileOpenStart={(path) => {
              if (isPhoneRemote) {
                setLeftPanelCollapsed(true);
                setRightPanelCollapsed(true);
              }
              handleFileOpenStart(path);
            }}
            onFileOpenFailed={handleFileOpenFailed}
            onSelectFile={(path, fileContent) => {
              handleSelectFile(path, fileContent);
              if (isPhoneRemote) setLeftPanelCollapsed(true);
            }}
            onDeleteFile={handleDeleteFile}
            overlayMode={overlayMode}
          />
        )
      ) : null}

      <div data-umbra-powerprompter-main="" className="flex-1 min-w-0 h-full relative flex flex-col">
        <PowerPrompterCommandBar
          isPhoneRemote={isPhoneRemote}
          prompterPanelMode={prompterPanelMode}
          setPrompterPanelMode={handlePrompterPanelModeChange}
          queueEditorEnabled={POWER_PROMPTER_QUEUE_EDITOR_ENABLED}
          queueEditorDraft={queueEditorDraft}
          leftPanelCollapsed={leftPanelCollapsed}
          setLeftPanelCollapsed={setFileMenuCollapsed}
          rightPanelCollapsed={rightPanelCollapsed}
          setRightPanelCollapsed={setTagMenuCollapsed}
          soundMenuRef={soundMenuRef}
          soundMenuOpen={soundMenuOpen}
          setSoundMenuOpen={setSoundMenuOpen}
          alertFeaturesEnabled={alertFeaturesEnabled}
          settings={settings}
          handleToggleCompletionSound={handleToggleCompletionSound}
          handleSetCompletionSoundStyle={handleSetCompletionSoundStyle}
          handleSetCompletionSoundVolume={handleSetCompletionSoundVolume}
          handleSendActivePromptToUmbraUi={handleSendActivePromptToUmbraUi}
          umbraUiHandoffBusy={umbraUiHandoffBusy}
          queueSetTarget={queueSetTarget}
          setQueueSetTarget={handleQueueSetTargetChange}
          currentFile={currentFile}
          queueingMode={queueingMode}
          queueSetColor={queueSetColor}
          activePanelQueueEstimate={activePanelQueueEstimate}
          queueTraversalMode={queueTraversalMode}
          commitQueueTraversalMode={commitQueueTraversalMode}
          queuePromptLimitMinimum={queuePromptLimitMinimum}
          queuePromptLimitStep={queuePromptLimitStep}
          queuePromptLimitDraft={queuePromptLimitDraft}
          handleQueuePromptLimitFocus={handleQueuePromptLimitFocus}
          handleQueuePromptLimitDraftChange={handleQueuePromptLimitDraftChange}
          commitQueuePromptLimit={commitQueuePromptLimit}
          handleClearSelectedQueueSetAssignments={handleClearSelectedQueueSetAssignments}
          activeQueueSetAssignmentCount={activeQueueSetAssignmentCount}
          handleClearAllQueueSetAssignments={handleClearAllQueueSetAssignments}
          totalQueueSetAssignmentCount={totalQueueSetAssignmentCount}
          handleToggleQueueShuffle={handleToggleQueueShuffle}
          queueShuffleEnabled={queueShuffleEnabled}
          hasLiveQueue={hasLiveQueue}
          estimatedBatchSize={estimatedBatchSize}
          handleQueuePrompts={handleQueuePrompts}
          queueDiversity={queueDiversity}
          queueEstimate={queueEstimate}
          handleExportSetAsTxt={handleExportSetAsTxt}
          activeQueuePosition={activeQueuePosition}
          queueRequestGroups={queueRequestGroups}
          queueSetGroups={queueSetGroups}
          queueTotalPromptCount={queueTotalPromptCount}
          queueTrackerSummary={queueTrackerSummary}
          queueSummaryCounts={queueSummaryCounts}
          queueStartActionRef={queueStartActionRef}
          queueStartDisabled={queueStartDisabled}
          queueControlBusy={queueControlBusy}
          queuePauseActionRef={queuePauseActionRef}
          queueStackItems={queueStackItems}
          hasStagedQueue={hasStagedQueue}
          queuePaused={queuePaused}
          queueCancelActionRef={queueCancelActionRef}
          queueDestructiveActionBusy={queueDestructiveActionBusy}
          hasCancelableQueueWork={hasCancelableQueueWork}
          hasClearableQueueWork={hasClearableQueueWork}
          queueClearActionRef={queueClearActionRef}
          queueEmergencyActionRef={queueEmergencyActionRef}
          openQueueHistoryPanel={openQueueHistoryPanel}
          queueDispatchDelayMs={queueDispatchDelayMs}
          handleQueueDispatchDelayChange={handleQueueDispatchDelayChange}
          queueManagerSequenceMode={queueManagerSequenceMode}
          handleQueueManagerSequenceModeChange={handleQueueManagerSequenceModeChange}
          setQueuePromptExpandedMode={setQueuePromptExpandedMode}
          queuePromptExpandedMode={queuePromptExpandedMode}
          queueManagerSearchQuery={queueManagerSearchQuery}
          setQueueManagerSearchQuery={setQueueManagerSearchQuery}
          savedQueueSnapshotsEnabled={POWER_PROMPTER_SAVED_QUEUE_SNAPSHOTS_ENABLED}
          globalSearchBoxRef={globalSearchBoxRef}
          globalSearchQuery={globalSearchQuery}
          setGlobalSearchQuery={setGlobalSearchQuery}
          globalSearchSuggestionOpen={globalSearchSuggestionOpen}
          setGlobalSearchSuggestionOpen={setGlobalSearchSuggestionOpen}
          globalSearchSuggestionIndex={globalSearchSuggestionIndex}
          setGlobalSearchSuggestionIndex={setGlobalSearchSuggestionIndex}
          filteredGlobalSearchSuggestions={filteredGlobalSearchSuggestions}
          applyGlobalSearchSelection={applyGlobalSearchSelection}
          savedQueues={savedQueues}
          selectedSavedQueueId={selectedSavedQueueId}
          setSelectedSavedQueueId={setSelectedSavedQueueId}
          savedQueueBusy={savedQueueBusy}
          selectedSavedQueue={selectedSavedQueue}
          handleSaveCurrentQueueSnapshot={handleSaveCurrentQueueSnapshot}
          handleLoadSavedQueueSnapshot={handleLoadSavedQueueSnapshot}
          handleDeleteSavedQueueSnapshot={handleDeleteSavedQueueSnapshot}
          refreshSavedQueues={refreshSavedQueues}
        />
        <PowerPrompterPresetBar
          currentFile={currentFile}
          presets={powerPrompterPresets}
          selectedPresetId={selectedPowerPrompterPresetId}
          setSelectedPresetId={setSelectedPowerPrompterPresetId}
          presetNameDraft={powerPrompterPresetNameDraft}
          setPresetNameDraft={setPowerPrompterPresetNameDraft}
          presetBusy={powerPrompterPresetBusy}
          onSavePreset={handleSavePowerPrompterPreset}
          onLoadPreset={handleLoadPowerPrompterPreset}
          onUnloadPreset={handleUnloadPowerPrompterPreset}
          onDeletePreset={handleDeletePowerPrompterPreset}
          onRefreshPresets={() => { void loadPowerPrompterPresets(); }}
          activePresetSession={activePowerPrompterPresetSession}
          globalSearchBoxRef={globalSearchBoxRef}
          globalSearchQuery={globalSearchQuery}
          setGlobalSearchQuery={setGlobalSearchQuery}
          globalSearchSuggestionOpen={globalSearchSuggestionOpen}
          setGlobalSearchSuggestionOpen={setGlobalSearchSuggestionOpen}
          globalSearchSuggestionIndex={globalSearchSuggestionIndex}
          setGlobalSearchSuggestionIndex={setGlobalSearchSuggestionIndex}
          filteredGlobalSearchSuggestions={filteredGlobalSearchSuggestions}
          applyGlobalSearchSelection={applyGlobalSearchSelection}
        />
        {floatingToolMenusEnabled && (!leftPanelCollapsed || !rightPanelCollapsed) && (
          <div
            data-umbra-powerprompter-menu-shelf=""
            className="pointer-events-none absolute left-3 right-3 top-[7.25rem] z-[80] flex items-start gap-3"
          >
            {!leftPanelCollapsed && (
              <div className="pointer-events-auto h-[min(52vh,620px)] min-h-[300px] w-[min(92vw,560px)] overflow-hidden rounded-xl border border-cyan-300/25 bg-[#050508]/98 shadow-[0_18px_46px_rgba(0,0,0,0.65)] backdrop-blur-md">
                <PowerPrompterSidebar
                  currentFile={currentFile}
                  onFileOpenStart={handleFileOpenStart}
                  onFileOpenFailed={handleFileOpenFailed}
                  onSelectFile={(path, fileContent) => {
                    handleSelectFile(path, fileContent);
                    setLeftPanelCollapsed(true);
                  }}
                  onDeleteFile={handleDeleteFile}
                  overlayMode
                  menuMode
                />
              </div>
            )}
            {!rightPanelCollapsed && (
              <div className="pointer-events-auto h-[min(52vh,620px)] min-h-[300px] w-[min(92vw,680px)] overflow-hidden rounded-xl border border-cyan-300/25 bg-[#050508]/98 shadow-[0_18px_46px_rgba(0,0,0,0.65)] backdrop-blur-md">
                <PowerPrompterSearchPanel
                  onInsert={(text) => {
                    handleInsert(text);
                    setRightPanelCollapsed(true);
                  }}
                  enabledCSVs={enabledCSVs}
                  onToggleCSV={handleToggleCSV}
                  onOpenSettings={() => setSettingsOpen(true)}
                  overlayMode
                  menuMode
                />
              </div>
            )}
          </div>
        )}
        <PowerPrompterLoadingOverlays
          loadingPromptFileName={loadingPromptFileName}
        />
        <PowerPrompterQueueHistoryModal
          queueHistoryOpen={queueHistoryOpen}
          queueHistoryItems={queueHistoryItems}
          queueHistoryGroups={queueHistoryGroups}
          selectedQueueHistoryId={selectedQueueHistoryId}
          queueHistoryBusy={queueHistoryBusy}
          queueHistoryEditorRestoreEnabled={POWER_PROMPTER_QUEUE_EDITOR_ENABLED}
          queueHistoryReplayEnabled
          refreshQueueHistory={refreshQueueHistory}
          setQueueHistoryOpen={setQueueHistoryOpen}
          setSelectedQueueHistoryId={setSelectedQueueHistoryId}
          handleLoadQueueHistoryForEdit={handleLoadQueueHistoryForEdit}
          handleRequeueQueueHistory={handleRequeueQueueHistory}
          handleDeleteQueueHistory={handleDeleteQueueHistory}
        />
        <PowerPrompterSaveQueueModal
          open={saveQueueModalOpen}
          nameDraft={saveQueueNameDraft}
          busy={savedQueueBusy}
          onNameChange={setSaveQueueNameDraft}
          onSubmit={handleConfirmSaveCurrentQueueSnapshot}
          onCancel={() => {
            if (savedQueueBusy) return;
            pendingSavedQueueSnapshotRef.current = null;
            setSaveQueueModalOpen(false);
          }}
        />
        <PowerPrompterQueueConfirmModal
          action={queueConfirmAction}
          busy={queueDestructiveActionBusy}
          onCancel={() => setQueueConfirmAction(null)}
          onConfirm={(action) => {
            setQueueConfirmAction(null);
            if (action === 'clear') {
              void executeClearComfyQueue();
            } else if (action === 'emergency') {
              void executeEmergencyComfyRestart();
            } else {
              void executeCancelActiveComfyJob();
            }
          }}
        />
        <PowerPrompterWorkspacePanels
          currentFile={currentFile}
          editorRemountTick={editorRemountTick}
          editorRef={editorRef}
          cardDocument={cardDocument}
          pipelines={powerPrompterPipelines}
          selectedQueueTargetType={selectedQueueTargetType}
          isActive={isActive}
          isEditorPanelActive={isEditorPanelActive}
          prompterPanelMode={prompterPanelMode}
          queueVisualState={queueVisualState}
          queueEstimate={queueEstimate}
          queueShuffleEnabled={queueShuffleEnabled}
          settings={settings}
          queueTraversalMode={queueTraversalMode}
          queueSetTarget={queueSetTarget}
          queueCompletionTick={queueCompletionTick}
          generationPreview={generationPreview}
          generationPreviewHoldMs={generationPreviewHoldMs}
          handleSetGenerationPreviewHoldMs={handleSetGenerationPreviewHoldMs}
          editorInteractionResetTick={editorInteractionResetTick}
          loraCatalog={loraCatalog}
          refreshLoraCatalog={refreshLoraCatalog}
          requestLoraInfoThroughWebSocket={requestLoraInfoThroughWebSocket}
          modelCatalog={modelCatalog}
          refreshModelCatalog={refreshModelCatalog}
          requestModelInfoThroughWebSocket={requestModelInfoThroughWebSocket}
          handleCardDocumentChange={handleCardDocumentChange}
          handleActivePromptTypeProgress={handleActivePromptTypeProgress}
          handleChainLinkFeedback={handleChainLinkFeedback}
          enabledCSVs={enabledCSVs}
          globalSearchQuery={globalSearchQuery}
          globalSearchFocusValue={globalSearchFocusValue}
          globalSearchFocusNonce={globalSearchFocusNonce}
          overlayMode={overlayMode}
          renderQueueTrackerCard={renderQueueTrackerCard}
          setOutputPreviewSnapshot={setOutputPreviewSnapshot}
          renderQueueManagerView={renderQueueManagerView}
          queueEditorEnabled={POWER_PROMPTER_QUEUE_EDITOR_ENABLED}
          queueEditorDraft={queueEditorDraft}
          handleCloseQueueEditor={handleCloseQueueEditor}
          handleSaveQueueEditorDraft={handleSaveQueueEditorDraft}
          queueEditorSaving={queueEditorSaving}
          handleAddQueueEditorDraftAsNewGroup={handleAddQueueEditorDraftAsNewGroup}
          queueEditorDocument={queueEditorDocument}
          isQueueEditorPanelActive={isQueueEditorPanelActive}
          queueEditorEstimate={queueEditorEstimate}
          handleQueueEditorDocumentChange={handleQueueEditorDocumentChange}
          mobileSelectionMode={isPhoneRemote}
          touchRemoteMode={isTouchRemote}
        />
      </div>

      {!floatingToolMenusEnabled ? (
        rightPanelCollapsed ? (
          <div
            data-umbra-powerprompter-right-rail=""
            className="w-9 border-l border-white/5 flex-shrink-0 flex items-start justify-center pt-2"
            style={overlayMode ? { backgroundColor: 'rgba(5,5,8,0.86)' } : undefined}
          >
            <button
              onClick={() => setRightPanelCollapsed(false)}
              className="p-1.5 rounded-md border border-white/15 bg-white/[0.04] text-zinc-300 hover:text-zinc-100 hover:border-white/30"
              title="Open tag browser sidecar"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        ) : (
          <div data-umbra-powerprompter-search="" className="contents">
            <PowerPrompterSearchPanel
              onInsert={(text) => {
                handleInsert(text);
                if (isPhoneRemote) setRightPanelCollapsed(true);
              }}
              enabledCSVs={enabledCSVs}
              onToggleCSV={handleToggleCSV}
              onOpenSettings={() => setSettingsOpen(true)}
              overlayMode={overlayMode}
            />
          </div>
        )
      ) : null}

      <PowerPrompterSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={saveSettings}
      />

    </div>
  );
};
