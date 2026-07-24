'use client';

import React from 'react';
import {
  createPrompterWsUrl,
  type PowerPrompterInfoRequestOptions,
  type PowerPrompterLoraInfoPayload,
  type PowerPrompterModelInfoPayload,
} from '@/components/power-prompter/powerPrompterSupport';
import {
  composeUmbraUiPromptWithLoras,
  type UmbraUiLoraEntry,
} from '@/lib/umbraUiModels';
import { readUmbraObjectInfoRequiredInputs } from '@/lib/umbraUiObjectInfo';
import { resolveUmbraUiPipeline } from '@/lib/umbraUiPipelines';
import {
  createUmbraUiPipelineTargetId,
  filterUmbraUiDetailerStages,
  matchUmbraUiResourceCatalog,
  normalizeUmbraUiPipelineCapabilities,
  normalizeUmbraUiPipelineReadiness,
  resolveUmbraUiHiresResizeMode,
  type UmbraUiPipelineDescriptor,
  type UmbraUiPipelineFeature,
} from '../../../../shared/umbra-ui/pipelineTypes';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterGenerationControls,
  PowerPrompterHiresFixControls,
  PowerPrompterModelType,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
  PowerPrompterVideoControls,
} from '@/types/powerPrompter';
import { resolveUmbraVideoTargetDimensions } from '../../../../shared/umbra-ui/videoSizing';

const RECONNECT_DELAY_MS = 1500;
const QUEUE_ACK_TIMEOUT_MS = 15000;
const CATALOG_REQUEST_TIMEOUT_MS = 30000;

type QueuePromptStatus = 'pending' | 'submitting' | 'running' | 'completed' | 'canceled' | 'interrupted' | 'failed';
export type UmbraQueuePlacement = 'next' | 'end' | 'interrupt';

interface QueuePrompt {
  requestId: string;
  promptIndex: number;
  prompt: string;
  status: QueuePromptStatus;
  updatedAt: number;
}

interface QueueRequest {
  requestId: string;
  origin: 'power_prompter' | 'umbra_ui';
  apiWorkflowName: string;
  total: number;
  completed: number;
  failed: number;
  canceled: number;
  status: string;
  activeIndex: number;
  prompts: QueuePrompt[];
}

interface QueueSnapshot {
  paused: boolean;
  activeRequestId: string;
  activePromptIndex: number;
  requests: QueueRequest[];
  updatedAt: number;
}

export interface ApiWorkflowItem {
  id: string;
  name: string;
  compatible: boolean;
  missing?: string[];
  mediaType?: 'image' | 'video';
  modelFamily?: string;
  umbraUiPipelines?: UmbraUiPipelineDescriptor[];
  resources?: UmbraWorkflowResourceSelector[];
  videoFamily?: 'wan22' | 'ltx23';
  videoMode?: 'text_to_video' | 'image_to_video' | 'video_to_video';
}

export type UmbraWorkflowResourceKind =
  | 'checkpoint'
  | 'diffusers'
  | 'diffusion_model'
  | 'unet'
  | 'gguf'
  | 'vae'
  | 'text_encoder'
  | 'clip_vision'
  | 'controlnet'
  | 'upscale_model'
  | 'model';

export interface UmbraWorkflowResourceSelector {
  id: string;
  label: string;
  kind: UmbraWorkflowResourceKind;
  nodeId: string;
  inputName: string;
  required: boolean;
  defaultValue: string;
  options: string[];
  order: number;
}

export interface UmbraModelCatalog {
  checkpoints: string[];
  diffusersModels: string[];
  diffusionModels: string[];
  unetModels: string[];
  ggufModels: string[];
  textEncoders: string[];
  vaes: string[];
  clipVision: string[];
  styleModels: string[];
  controlnets: string[];
  animaLlliteModels: string[];
  animaLlliteAvailable: boolean;
  modelPatches: string[];
  ipAdapterModels: string[];
  controlPreprocessors: string[];
  upscaleModels: string[];
  detectorModels: string[];
  samModels: string[];
  samplers: string[];
  schedulers: string[];
  loading: boolean;
  error: string;
}

function getUmbraModelCatalogValues(
  catalog: UmbraModelCatalog,
  kind: UmbraWorkflowResourceKind,
): string[] {
  if (kind === 'checkpoint') return catalog.checkpoints;
  if (kind === 'diffusers') return catalog.diffusersModels;
  if (kind === 'diffusion_model') return catalog.diffusionModels;
  if (kind === 'unet') return Array.from(new Set([...catalog.unetModels, ...catalog.diffusionModels]));
  if (kind === 'gguf') return catalog.ggufModels;
  if (kind === 'text_encoder') return catalog.textEncoders;
  if (kind === 'vae') return catalog.vaes;
  if (kind === 'clip_vision') return catalog.clipVision;
  if (kind === 'controlnet') return catalog.controlnets;
  if (kind === 'model') return catalog.modelPatches;
  if (kind === 'upscale_model') return catalog.upscaleModels;
  return [];
}

export interface UmbraVideoModelCatalog {
  diffusionModels: string[];
  checkpoints: string[];
  loras: string[];
  textEncoders: string[];
  vaes: string[];
  clipVision: string[];
  latentUpscaleModels: string[];
  frameInterpolationModels: string[];
  upscaleModels: string[];
  rtxAvailable: boolean;
  samplers: string[];
  schedulers: string[];
  loading: boolean;
  error: string;
}

export interface UmbraQueueSummary {
  groups: number;
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  canceled: number;
  remaining: number;
  progress: number;
  paused: boolean;
  activePrompt: string;
  activePosition: number;
  activeTotal: number;
  activeWorkflowName: string;
  powerPrompterActive: boolean;
  powerPrompterRunning: number;
  powerPrompterRemaining: number;
}

export interface UmbraGenerationPreview {
  requestId: string;
  promptIndex: number;
  promptId: string;
  imageDataUrl: string;
  step: number;
  maxStep: number;
  updatedAt: number;
}

export interface UmbraSavedImage {
  requestId: string;
  promptIndex: number;
  promptId: string;
  name: string;
  path: string;
  imageUrl: string;
  updatedAt: number;
}

export interface UmbraVideoReviewOutput {
  id: string;
  name: string;
  path: string;
  mediaKind: string;
  type: 'image' | 'video' | 'audio' | 'file';
}

export interface UmbraVideoReviewJob {
  version: 1;
  id: string;
  requestId: string;
  promptIndex: number;
  promptId: string;
  prompt: string;
  negativePrompt: string;
  status: QueuePromptStatus;
  error: string;
  apiWorkflowId: string;
  apiWorkflowName: string;
  generation: PowerPrompterGenerationControls;
  outputs: UmbraVideoReviewOutput[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface UmbraImageQueueOptions {
  prompt: string;
  negativePrompt: string;
  modelFamily: string;
  modelType: PowerPrompterModelType;
  checkpointName: string;
  workflowResources: Record<string, string>;
  clipSkip: number;
  seed: number;
  seedMode: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  width: number;
  height: number;
  hiresFix: PowerPrompterHiresFixControls;
  detailerPipeline: PowerPrompterDetailerStage[];
  outputUpscale: PowerPrompterOutputUpscaleControls;
  loras: UmbraUiLoraEntry[];
  outputMode?: 'txt2img' | 'img2img';
  sourceImagePath?: string;
  sourceImageName?: string;
  denoise?: number;
  styleName?: string;
  queuePlacement?: UmbraQueuePlacement;
}

export interface UmbraVideoQueueOptions {
  prompt: string;
  negativePrompt: string;
  video: PowerPrompterVideoControls;
  queuePlacement?: UmbraQueuePlacement;
}

interface PendingQueueAck {
  resolve: (requestId: string) => void;
  reject: (error: Error) => void;
  timer: number;
}

interface PendingCatalogRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: number;
}

const EMPTY_QUEUE_SUMMARY: UmbraQueueSummary = {
  groups: 0,
  total: 0,
  running: 0,
  pending: 0,
  completed: 0,
  failed: 0,
  canceled: 0,
  remaining: 0,
  progress: 0,
  paused: false,
  activePrompt: '',
  activePosition: 0,
  activeTotal: 0,
  activeWorkflowName: '',
  powerPrompterActive: false,
  powerPrompterRunning: 0,
  powerPrompterRemaining: 0,
};

const EMPTY_MODEL_CATALOG: UmbraModelCatalog = {
  checkpoints: [],
  diffusersModels: [],
  diffusionModels: [],
  unetModels: [],
  ggufModels: [],
  textEncoders: [],
  vaes: [],
  clipVision: [],
  styleModels: [],
  controlnets: [],
  animaLlliteModels: [],
  animaLlliteAvailable: false,
  modelPatches: [],
  ipAdapterModels: [],
  controlPreprocessors: [],
  upscaleModels: [],
  detectorModels: [],
  samModels: [],
  samplers: [],
  schedulers: [],
  loading: true,
  error: '',
};

const EMPTY_VIDEO_MODEL_CATALOG: UmbraVideoModelCatalog = {
  diffusionModels: [],
  checkpoints: [],
  loras: [],
  textEncoders: [],
  vaes: [],
  clipVision: [],
  latentUpscaleModels: [],
  frameInterpolationModels: [],
  upscaleModels: [],
  rtxAvailable: false,
  samplers: [],
  schedulers: [],
  loading: true,
  error: '',
};

function readObjectInfoChoices(requiredInputs: Record<string, unknown>, inputName: string): string[] {
  const descriptor = requiredInputs[inputName];
  if (!Array.isArray(descriptor)) return [];
  const directChoices = Array.isArray(descriptor[0]) ? descriptor[0] : [];
  const comboOptions = descriptor[0] === 'COMBO'
    && descriptor[1]
    && typeof descriptor[1] === 'object'
    && Array.isArray((descriptor[1] as Record<string, unknown>).options)
    ? (descriptor[1] as Record<string, unknown>).options as unknown[]
    : [];
  return Array.from(new Set(
    [...directChoices, ...comboOptions]
      .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
      .filter((entry) => entry.length > 0 && !['[none]', 'none'].includes(entry.toLowerCase())),
  ));
}

async function fetchNodeRequiredInputs(nodeType: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/object_info/${encodeURIComponent(nodeType)}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${nodeType} catalog returned ${response.status}.`);
  return readUmbraObjectInfoRequiredInputs(payload, nodeType);
}

async function fetchNodeAvailable(nodeType: string): Promise<boolean> {
  const response = await fetch(`/object_info/${encodeURIComponent(nodeType)}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  return response.ok
    && Boolean(payload)
    && typeof payload === 'object'
    && Object.prototype.hasOwnProperty.call(payload, nodeType);
}

async function fetchUmbraUiCatalog(kind: 'checkpoint' | 'lora'): Promise<string[]> {
  const response = await fetch(`/api/umbra-ui/catalog?${new URLSearchParams({ kind }).toString()}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `${kind} catalog returned ${response.status}.`));
  }
  return Array.isArray(payload?.items)
    ? Array.from(new Set(payload.items
      .map((entry: unknown) => String(entry || '').trim().replace(/\\/g, '/'))
      .filter((entry: string) => entry.length > 0 && !['[none]', 'none'].includes(entry.toLowerCase()))))
    : [];
}

async function fetchUmbraUiCatalogInfo(
  kind: 'checkpoint' | 'lora',
  name: string,
): Promise<PowerPrompterLoraInfoPayload | PowerPrompterModelInfoPayload> {
  const response = await fetch(`/api/umbra-ui/catalog/info?${new URLSearchParams({ kind, name }).toString()}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !payload?.info) {
    throw new Error(String(payload?.error || `${kind} metadata returned ${response.status}.`));
  }
  return payload.info as PowerPrompterLoraInfoPayload | PowerPrompterModelInfoPayload;
}

function toFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function toFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeVideoReviewOutput(value: unknown): UmbraVideoReviewOutput | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const path = String(source.path || '').trim().replace(/\\/g, '/');
  const name = String(source.name || path.split('/').pop() || '').trim();
  const type = String(source.type || '').trim().toLowerCase();
  if (!path || !name || !['image', 'video', 'audio', 'file'].includes(type)) return null;
  return {
    id: String(source.id || `${path}:${name}`).trim() || `${path}:${name}`,
    name,
    path,
    mediaKind: String(source.mediaKind || type).trim() || type,
    type: type as UmbraVideoReviewOutput['type'],
  };
}

function normalizeVideoReviewJob(value: unknown): UmbraVideoReviewJob | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const generation = source.generation && typeof source.generation === 'object'
    ? source.generation as PowerPrompterGenerationControls
    : null;
  if (!generation?.video || generation.mediaType !== 'video') return null;
  const requestId = String(source.requestId || '').trim();
  const id = String(source.id || '').trim();
  if (!requestId || !id) return null;
  const rawStatus = String(source.status || 'pending').trim() as QueuePromptStatus;
  const status: QueuePromptStatus = ['pending', 'submitting', 'running', 'completed', 'canceled', 'interrupted', 'failed'].includes(rawStatus)
    ? rawStatus
    : 'pending';
  const createdAt = toFiniteInteger(source.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER);
  return {
    version: 1,
    id,
    requestId,
    promptIndex: toFiniteInteger(source.promptIndex, 0, 0, Number.MAX_SAFE_INTEGER),
    promptId: String(source.promptId || '').trim(),
    prompt: String(source.prompt || ''),
    negativePrompt: String(source.negativePrompt || generation.negativePrompt || ''),
    status,
    error: String(source.error || ''),
    apiWorkflowId: String(source.apiWorkflowId || '').trim(),
    apiWorkflowName: String(source.apiWorkflowName || '').trim(),
    generation,
    outputs: (Array.isArray(source.outputs) ? source.outputs : [])
      .map(normalizeVideoReviewOutput)
      .filter((entry): entry is UmbraVideoReviewOutput => !!entry),
    createdAt,
    updatedAt: toFiniteInteger(source.updatedAt, createdAt, 0, Number.MAX_SAFE_INTEGER),
    ...(Number(source.startedAt) > 0 ? { startedAt: toFiniteInteger(source.startedAt, 0, 0, Number.MAX_SAFE_INTEGER) } : {}),
    ...(Number(source.completedAt) > 0 ? { completedAt: toFiniteInteger(source.completedAt, 0, 0, Number.MAX_SAFE_INTEGER) } : {}),
  };
}

async function fetchVideoReviewJobs(): Promise<UmbraVideoReviewJob[]> {
  const response = await fetch('/api/umbra-ui/video-jobs?limit=200', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || 'Failed to load video review queue.'));
  }
  return (Array.isArray(payload?.jobs) ? payload.jobs : [])
    .map(normalizeVideoReviewJob)
    .filter((entry: UmbraVideoReviewJob | null): entry is UmbraVideoReviewJob => !!entry);
}

function normalizeQueueSnapshot(value: unknown): QueueSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const requests = Array.isArray(source.requests)
    ? source.requests
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((entry) => ({
        requestId: String(entry.requestId || '').trim(),
        origin: String(entry.origin || '').trim() === 'umbra_ui' ? 'umbra_ui' as const : 'power_prompter' as const,
        apiWorkflowName: String(entry.apiWorkflowName || '').trim(),
        total: toFiniteInteger(entry.total, 0, 0, Number.MAX_SAFE_INTEGER),
        completed: toFiniteInteger(entry.completed, 0, 0, Number.MAX_SAFE_INTEGER),
        failed: toFiniteInteger(entry.failed, 0, 0, Number.MAX_SAFE_INTEGER),
        canceled: toFiniteInteger(entry.canceled, 0, 0, Number.MAX_SAFE_INTEGER),
        status: String(entry.status || 'pending').trim(),
        activeIndex: toFiniteInteger(entry.activeIndex, 0, 0, Number.MAX_SAFE_INTEGER),
        prompts: Array.isArray(entry.prompts)
          ? entry.prompts
            .filter((prompt): prompt is Record<string, unknown> => !!prompt && typeof prompt === 'object')
            .map((prompt) => ({
              requestId: String(prompt.requestId || entry.requestId || '').trim(),
              promptIndex: toFiniteInteger(prompt.promptIndex, 0, 0, Number.MAX_SAFE_INTEGER),
              prompt: String(prompt.prompt || '').trim(),
              status: String(prompt.status || 'pending').trim() as QueuePromptStatus,
              updatedAt: toFiniteInteger(prompt.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
            }))
          : [],
      }))
      .filter((entry) => entry.requestId.length > 0)
    : [];

  return {
    paused: source.paused === true,
    activeRequestId: String(source.activeRequestId || '').trim(),
    activePromptIndex: toFiniteInteger(source.activePromptIndex, 0, 0, Number.MAX_SAFE_INTEGER),
    requests,
    updatedAt: toFiniteInteger(source.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

function summarizeQueue(snapshot: QueueSnapshot | null): UmbraQueueSummary {
  if (!snapshot || snapshot.requests.length <= 0) return EMPTY_QUEUE_SUMMARY;
  const prompts = snapshot.requests.flatMap((request) => request.prompts);
  const count = (status: QueuePromptStatus) => prompts.filter((prompt) => prompt.status === status).length;
  const running = count('running') + count('submitting');
  const pending = count('pending');
  const completed = count('completed');
  const failed = count('failed');
  const canceled = count('canceled') + count('interrupted');
  const total = prompts.length || snapshot.requests.reduce((sum, request) => sum + request.total, 0);
  const terminal = completed + failed + canceled;
  const activeRequest = snapshot.requests.find((request) => request.requestId === snapshot.activeRequestId)
    || snapshot.requests.find((request) => request.prompts.some((prompt) => prompt.status === 'running' || prompt.status === 'submitting'))
    || snapshot.requests.find((request) => request.prompts.some((prompt) => prompt.status === 'pending'))
    || null;
  const activePrompt = activeRequest?.prompts.find((prompt) => prompt.status === 'running' || prompt.status === 'submitting')
    || activeRequest?.prompts.find((prompt) => prompt.status === 'pending')
    || null;
  const powerPrompterPrompts = snapshot.requests
    .filter((request) => request.origin === 'power_prompter')
    .flatMap((request) => request.prompts);
  const powerPrompterRunning = powerPrompterPrompts.filter((prompt) => (
    prompt.status === 'running' || prompt.status === 'submitting'
  )).length;
  const powerPrompterPending = powerPrompterPrompts.filter((prompt) => prompt.status === 'pending').length;
  const powerPrompterRemaining = powerPrompterRunning + powerPrompterPending;

  return {
    groups: snapshot.requests.filter((request) => request.prompts.some((prompt) => (
      prompt.status === 'pending' || prompt.status === 'submitting' || prompt.status === 'running'
    ))).length,
    total,
    running,
    pending,
    completed,
    failed,
    canceled,
    remaining: running + pending,
    progress: total > 0 ? Math.max(0, Math.min(1, terminal / total)) : 0,
    paused: snapshot.paused,
    activePrompt: activePrompt?.prompt || '',
    activePosition: activePrompt ? activePrompt.promptIndex + 1 : 0,
    activeTotal: activeRequest?.total || activeRequest?.prompts.length || 0,
    activeWorkflowName: activeRequest?.apiWorkflowName || '',
    powerPrompterActive: powerPrompterRemaining > 0 && !snapshot.paused,
    powerPrompterRunning,
    powerPrompterRemaining,
  };
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `umbra-ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useUmbraPowerPrompterBridge(comfyUiConnected = false) {
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimerRef = React.useRef<number | null>(null);
  const pendingQueueAcksRef = React.useRef(new Map<string, PendingQueueAck>());
  const pendingLoraCatalogRef = React.useRef(new Map<string, PendingCatalogRequest<string[]>>());
  const pendingLoraInfoRef = React.useRef(new Map<string, PendingCatalogRequest<PowerPrompterLoraInfoPayload>>());
  const pendingModelInfoRef = React.useRef(new Map<string, PendingCatalogRequest<PowerPrompterModelInfoPayload>>());
  const ownedRequestIdsRef = React.useRef(new Set<string>());
  const [connected, setConnected] = React.useState(false);
  const [queueSnapshot, setQueueSnapshot] = React.useState<QueueSnapshot | null>(null);
  const [generationPreview, setGenerationPreview] = React.useState<UmbraGenerationPreview | null>(null);
  const [latestSavedImage, setLatestSavedImage] = React.useState<UmbraSavedImage | null>(null);
  const [videoJobs, setVideoJobs] = React.useState<UmbraVideoReviewJob[]>([]);
  const [videoJobsLoading, setVideoJobsLoading] = React.useState(true);
  const [videoJobsError, setVideoJobsError] = React.useState('');
  const [workflows, setWorkflows] = React.useState<ApiWorkflowItem[]>([]);
  const [inheritedGeneration, setInheritedGeneration] = React.useState<Record<string, unknown> | null>(null);
  const [modelCatalog, setModelCatalog] = React.useState<UmbraModelCatalog>(EMPTY_MODEL_CATALOG);
  const [videoModelCatalog, setVideoModelCatalog] = React.useState<UmbraVideoModelCatalog>(EMPTY_VIDEO_MODEL_CATALOG);
  const [modelCatalogRevision, setModelCatalogRevision] = React.useState(0);
  const [pipelineCatalogRevision, setPipelineCatalogRevision] = React.useState(0);
  const [loraCatalog, setLoraCatalog] = React.useState<string[]>([]);
  const [loraCatalogLoading, setLoraCatalogLoading] = React.useState(false);
  const loraInfoCacheRef = React.useRef(new Map<string, PowerPrompterLoraInfoPayload>());
  const modelInfoCacheRef = React.useRef(new Map<string, PowerPrompterModelInfoPayload>());

  const refreshVideoJobs = React.useCallback(async () => {
    try {
      const jobs = await fetchVideoReviewJobs();
      setVideoJobs(jobs);
      setVideoJobsError('');
      return jobs;
    } catch (error) {
      setVideoJobsError(error instanceof Error ? error.message : 'Failed to load video review queue.');
      return [];
    } finally {
      setVideoJobsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshVideoJobs();
    const interval = window.setInterval(() => void refreshVideoJobs(), 2500);
    return () => window.clearInterval(interval);
  }, [refreshVideoJobs]);

  React.useEffect(() => {
    let canceled = false;
    void Promise.all([
      fetch('/api/powerprompter/api-workflows', { cache: 'no-store' }),
      fetch('/api/umbra-ui/pipelines', { cache: 'no-store' }),
    ])
      .then(async ([workflowResponse, pipelineResponse]) => {
        const [workflowPayload, pipelinePayload] = await Promise.all([
          workflowResponse.json().catch(() => ({})),
          pipelineResponse.json().catch(() => ({})),
        ]);
        if (!workflowResponse.ok || workflowPayload?.success === false) {
          throw new Error(workflowPayload?.error || 'Failed to load API workflows.');
        }
        if (!pipelineResponse.ok || pipelinePayload?.success === false) {
          throw new Error(pipelinePayload?.error || 'Failed to load Umbra UI pipelines.');
        }
        const items = Array.isArray(workflowPayload?.items) ? workflowPayload.items as ApiWorkflowItem[] : [];
        const pipelines = Array.isArray(pipelinePayload?.pipelines)
          ? pipelinePayload.pipelines as Array<UmbraUiPipelineDescriptor & { workflowId?: string }>
          : [];
        const pipelinesByWorkflow = new Map<string, UmbraUiPipelineDescriptor[]>();
        for (const pipeline of pipelines) {
          const workflowId = String(pipeline.workflowId || '').trim();
          if (!workflowId) continue;
          const current = pipelinesByWorkflow.get(workflowId) || [];
          const capabilities = normalizeUmbraUiPipelineCapabilities(pipeline.capabilities, pipeline.modelSources);
          const readiness = normalizeUmbraUiPipelineReadiness(
            pipeline.readiness,
            capabilities,
            pipeline.modelSources,
          );
          current.push({
            feature: pipeline.feature,
            modelFamily: pipeline.modelFamily,
            modelFamilyKey: pipeline.modelFamilyKey,
            modelSources: [...pipeline.modelSources],
            priority: pipeline.priority,
            locked: true,
            ...(pipeline.inpaintAdapter ? { inpaintAdapter: pipeline.inpaintAdapter } : {}),
            ...(pipeline.defaults ? { defaults: { ...pipeline.defaults } } : {}),
            capabilities,
            ...(pipeline.inpaintCanvas ? { inpaintCanvas: pipeline.inpaintCanvas } : {}),
            readiness,
          });
          pipelinesByWorkflow.set(workflowId, current);
        }
        return items.map((item) => ({
          ...item,
          umbraUiPipelines: pipelinesByWorkflow.get(item.id) || item.umbraUiPipelines || [],
        }));
      })
      .then((items) => {
        if (canceled) return;
        setWorkflows(items);
      })
      .catch((error) => console.warn('[Umbra UI] Failed to load API workflows:', error));
    return () => {
      canceled = true;
    };
  }, [comfyUiConnected, pipelineCatalogRevision]);

  React.useEffect(() => {
    let canceled = false;
    setModelCatalog((current) => ({ ...current, loading: true, error: '' }));
    void Promise.all([
      fetchNodeRequiredInputs('UmbraPowerPrompter'),
      fetchNodeRequiredInputs('CLIPLoader').catch(() => ({})),
      fetchNodeRequiredInputs('CLIPLoaderGGUF').catch(() => ({})),
      fetchNodeRequiredInputs('VAELoader').catch(() => ({})),
      fetchNodeRequiredInputs('CLIPVisionLoader').catch(() => ({})),
      fetchNodeRequiredInputs('StyleModelLoader').catch(() => ({})),
      fetchNodeRequiredInputs('ControlNetLoader').catch(() => ({})),
      fetchNodeRequiredInputs('AnimaLLLiteApply').catch(() => null),
      fetchNodeRequiredInputs('ModelPatchLoader').catch(() => ({})),
      fetchNodeRequiredInputs('IPAdapterModelLoader').catch(() => ({})),
      fetchNodeRequiredInputs('UpscaleModelLoader').catch(() => ({})),
      fetchNodeRequiredInputs('UltralyticsDetectorProvider').catch(() => ({})),
      fetchNodeRequiredInputs('SAMLoader').catch(() => ({})),
      Promise.all([
        'CannyEdgePreprocessor',
        'DepthAnythingV2Preprocessor',
        'DWPreprocessor',
        'LineArtPreprocessor',
        'AnimeLineArtPreprocessor',
        'HEDPreprocessor',
        'FakeScribblePreprocessor',
        'MediaPipe-FaceMeshPreprocessor',
        'M-LSDPreprocessor',
        'MiDaS-NormalMapPreprocessor',
        'PiDiNetPreprocessor',
        'ShufflePreprocessor',
      ].map(async (nodeType) => {
        try {
          await fetchNodeRequiredInputs(nodeType);
          return nodeType;
        } catch {
          return '';
        }
      })),
    ])
      .then(([
        requiredInputs,
        clipInputs,
        ggufClipInputs,
        vaeInputs,
        clipVisionInputs,
        styleModelInputs,
        controlNetInputs,
        animaLlliteInputs,
        modelPatchInputs,
        ipAdapterInputs,
        upscaleInputs,
        detectorInputs,
        samInputs,
        controlPreprocessors,
      ]) => {
        if (canceled) return;
        setModelCatalog({
          checkpoints: readObjectInfoChoices(requiredInputs, 'checkpoint_name'),
          diffusersModels: readObjectInfoChoices(requiredInputs, 'diffusers_model'),
          diffusionModels: readObjectInfoChoices(requiredInputs, 'diffusion_model_name'),
          unetModels: readObjectInfoChoices(requiredInputs, 'unet_name'),
          ggufModels: readObjectInfoChoices(requiredInputs, 'gguf_name'),
          textEncoders: Array.from(new Set([
            ...readObjectInfoChoices(clipInputs, 'clip_name'),
            ...readObjectInfoChoices(ggufClipInputs, 'clip_name'),
          ])),
          vaes: readObjectInfoChoices(vaeInputs, 'vae_name'),
          clipVision: readObjectInfoChoices(clipVisionInputs, 'clip_name'),
          styleModels: readObjectInfoChoices(styleModelInputs, 'style_model_name'),
          controlnets: readObjectInfoChoices(controlNetInputs, 'control_net_name'),
          animaLlliteModels: readObjectInfoChoices(animaLlliteInputs || {}, 'lllite_name'),
          animaLlliteAvailable: animaLlliteInputs !== null,
          modelPatches: readObjectInfoChoices(modelPatchInputs, 'name'),
          ipAdapterModels: readObjectInfoChoices(ipAdapterInputs, 'ipadapter_file'),
          controlPreprocessors: controlPreprocessors.filter(Boolean),
          upscaleModels: readObjectInfoChoices(upscaleInputs, 'model_name'),
          detectorModels: readObjectInfoChoices(detectorInputs, 'model_name'),
          samModels: readObjectInfoChoices(samInputs, 'model_name'),
          samplers: readObjectInfoChoices(requiredInputs, 'sampler_name'),
          schedulers: readObjectInfoChoices(requiredInputs, 'scheduler'),
          loading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (canceled) return;
        setModelCatalog((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load the ComfyUI model catalog.',
        }));
      });
    return () => {
      canceled = true;
    };
  }, [modelCatalogRevision]);

  React.useEffect(() => {
    let canceled = false;
    setVideoModelCatalog((current) => ({ ...current, loading: true, error: '' }));
    void Promise.all([
      fetchNodeRequiredInputs('UNETLoader'),
      fetchNodeRequiredInputs('UnetLoaderGGUF').catch(() => ({})),
      fetchNodeRequiredInputs('CheckpointLoaderSimple'),
      fetchNodeRequiredInputs('LoraLoaderModelOnly'),
      fetchNodeRequiredInputs('CLIPLoader'),
      fetchNodeRequiredInputs('CLIPLoaderGGUF').catch(() => ({})),
      fetchNodeRequiredInputs('VAELoader'),
      fetchNodeRequiredInputs('CLIPVisionLoader'),
      fetchNodeRequiredInputs('LatentUpscaleModelLoader'),
      fetchNodeRequiredInputs('FrameInterpolationModelLoader').catch(() => ({})),
      fetchNodeRequiredInputs('UpscaleModelLoader').catch(() => ({})),
      fetchNodeAvailable('RTXVideoSuperResolution').catch(() => false),
      fetchNodeRequiredInputs('KSamplerAdvanced'),
    ]).then(([
      unetInputs,
      ggufUnetInputs,
      checkpointInputs,
      loraInputs,
      clipInputs,
      ggufClipInputs,
      vaeInputs,
      clipVisionInputs,
      latentUpscaleInputs,
      frameInterpolationInputs,
      upscaleInputs,
      rtxAvailable,
      samplerInputs,
    ]) => {
      if (canceled) return;
      setVideoModelCatalog({
        diffusionModels: Array.from(new Set([
          ...readObjectInfoChoices(unetInputs, 'unet_name'),
          ...readObjectInfoChoices(ggufUnetInputs, 'unet_name'),
        ])),
        checkpoints: readObjectInfoChoices(checkpointInputs, 'ckpt_name'),
        loras: readObjectInfoChoices(loraInputs, 'lora_name'),
        textEncoders: Array.from(new Set([
          ...readObjectInfoChoices(clipInputs, 'clip_name'),
          ...readObjectInfoChoices(ggufClipInputs, 'clip_name'),
        ])),
        vaes: readObjectInfoChoices(vaeInputs, 'vae_name'),
        clipVision: readObjectInfoChoices(clipVisionInputs, 'clip_name'),
        latentUpscaleModels: readObjectInfoChoices(latentUpscaleInputs, 'model_name'),
        frameInterpolationModels: readObjectInfoChoices(frameInterpolationInputs, 'model_name'),
        upscaleModels: readObjectInfoChoices(upscaleInputs, 'model_name'),
        rtxAvailable,
        samplers: readObjectInfoChoices(samplerInputs, 'sampler_name'),
        schedulers: readObjectInfoChoices(samplerInputs, 'scheduler'),
        loading: false,
        error: '',
      });
    }).catch((error) => {
      if (canceled) return;
      setVideoModelCatalog((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load the ComfyUI video model catalog.',
      }));
    });
    return () => {
      canceled = true;
    };
  }, [modelCatalogRevision]);

  React.useEffect(() => {
    let disposed = false;

    const rejectPendingAcks = (message: string) => {
      for (const pending of pendingQueueAcksRef.current.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      pendingQueueAcksRef.current.clear();
    };

    const rejectPendingCatalogRequests = (message: string) => {
      const maps = [pendingLoraCatalogRef.current, pendingLoraInfoRef.current, pendingModelInfoRef.current];
      for (const pendingMap of maps) {
        for (const pending of pendingMap.values()) {
          window.clearTimeout(pending.timer);
          pending.reject(new Error(message));
        }
        pendingMap.clear();
      }
    };

    const connect = () => {
      if (disposed) return;
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;

      const ws = new WebSocket(createPrompterWsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (disposed || wsRef.current !== ws) return;
        ws.send(JSON.stringify({
          type: 'register',
          role: 'powerprompter',
          source: 'umbra-ui-workspace',
        }));
      };
      ws.onmessage = (event) => {
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(String(event.data || '{}')) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(payload?.type || '').trim();
        if (type === 'registered') {
          setConnected(true);
          return;
        }
        if (type === 'queue_snapshot') {
          setQueueSnapshot(normalizeQueueSnapshot(payload?.snapshot));
          void refreshVideoJobs();
          return;
        }
        if (type === 'document_state') {
          const session = payload?.session && typeof payload.session === 'object'
            ? payload.session as Record<string, unknown>
            : null;
          const document = session?.document && typeof session.document === 'object'
            ? session.document as Record<string, unknown>
            : null;
          const generation = document?.generation && typeof document.generation === 'object'
            ? document.generation as Record<string, unknown>
            : null;
          if (generation) setInheritedGeneration(generation);
          return;
        }
        if (type === 'lora_catalog_result') {
          const requestId = String(payload?.requestId || '').trim();
          const pending = pendingLoraCatalogRef.current.get(requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingLoraCatalogRef.current.delete(requestId);
          if (payload?.success === false) {
            pending.reject(new Error(String(payload?.error || 'Failed to load the LoRA catalog.')));
            return;
          }
          const items = Array.isArray(payload?.items)
            ? Array.from(new Set(payload.items
              .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
              .filter(Boolean)))
            : [];
          setLoraCatalog(items);
          pending.resolve(items);
          return;
        }
        if (type === 'lora_info_result') {
          const requestId = String(payload?.requestId || '').trim();
          const pending = pendingLoraInfoRef.current.get(requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingLoraInfoRef.current.delete(requestId);
          if (payload?.success === false) {
            pending.reject(new Error(String(payload?.error || 'Failed to load LoRA metadata.')));
            return;
          }
          const info: PowerPrompterLoraInfoPayload = {
            loraName: String(payload?.loraName || '').trim().replace(/\\/g, '/'),
            metadata: payload?.metadata && typeof payload.metadata === 'object'
              ? payload.metadata as Record<string, unknown>
              : {},
            civitai: payload?.civitai && typeof payload.civitai === 'object'
              ? payload.civitai as Record<string, unknown>
              : null,
            trainedTags: Array.isArray(payload?.trainedTags)
              ? Array.from(new Set(payload.trainedTags.map((entry) => String(entry || '').trim()).filter(Boolean)))
              : [],
            descriptionHtml: String(payload?.descriptionHtml || '').trim(),
            descriptionText: String(payload?.descriptionText || '').trim(),
          };
          if (info.loraName) loraInfoCacheRef.current.set(info.loraName.toLowerCase(), info);
          pending.resolve(info);
          return;
        }
        if (type === 'model_info_result') {
          const requestId = String(payload?.requestId || '').trim();
          const pending = pendingModelInfoRef.current.get(requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingModelInfoRef.current.delete(requestId);
          if (payload?.success === false) {
            pending.reject(new Error(String(payload?.error || 'Failed to load checkpoint metadata.')));
            return;
          }
          const info: PowerPrompterModelInfoPayload = {
            modelName: String(payload?.modelName || '').trim().replace(/\\/g, '/'),
            metadata: payload?.metadata && typeof payload.metadata === 'object'
              ? payload.metadata as Record<string, unknown>
              : {},
            civitai: payload?.civitai && typeof payload.civitai === 'object'
              ? payload.civitai as Record<string, unknown>
              : null,
            trainedTags: Array.isArray(payload?.trainedTags)
              ? Array.from(new Set(payload.trainedTags.map((entry) => String(entry || '').trim()).filter(Boolean)))
              : [],
            descriptionHtml: String(payload?.descriptionHtml || '').trim(),
            descriptionText: String(payload?.descriptionText || '').trim(),
          };
          if (info.modelName) modelInfoCacheRef.current.set(info.modelName.toLowerCase(), info);
          pending.resolve(info);
          return;
        }
        if (type === 'generation_preview') {
          const imageDataUrl = String(payload?.imageDataUrl || '').trim();
          if (!imageDataUrl.startsWith('data:image/')) return;
          setGenerationPreview({
            requestId: String(payload?.requestId || '').trim(),
            promptIndex: toFiniteInteger(payload?.promptIndex, 0, 0, Number.MAX_SAFE_INTEGER),
            promptId: String(payload?.promptId || '').trim(),
            imageDataUrl,
            step: toFiniteInteger(payload?.step, 0, 0, Number.MAX_SAFE_INTEGER),
            maxStep: toFiniteInteger(payload?.maxStep, 0, 0, Number.MAX_SAFE_INTEGER),
            updatedAt: toFiniteInteger(payload?.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
          });
          return;
        }
        if (type === 'job_progress') {
          const requestId = String(payload?.requestId || '').trim();
          const promptIndex = toFiniteInteger(payload?.promptIndex, 0, 0, Number.MAX_SAFE_INTEGER);
          setGenerationPreview((currentPreview) => {
            if (!currentPreview || currentPreview.requestId !== requestId || currentPreview.promptIndex !== promptIndex) {
              return currentPreview;
            }
            return {
              ...currentPreview,
              step: toFiniteInteger(payload?.step ?? payload?.progress, currentPreview.step, 0, Number.MAX_SAFE_INTEGER),
              maxStep: toFiniteInteger(payload?.maxStep ?? payload?.progressMax, currentPreview.maxStep, 0, Number.MAX_SAFE_INTEGER),
              updatedAt: Date.now(),
            };
          });
          return;
        }
        if (type === 'queue_saved_outputs') {
          const requestId = String(payload?.requestId || '').trim();
          if (!ownedRequestIdsRef.current.has(requestId)) return;
          void refreshVideoJobs();
          const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
          const image = outputs.find((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const source = entry as Record<string, unknown>;
            const filename = String(source.filename || source.name || '').trim();
            const mediaKind = String(source.mediaKind || '').trim().toLowerCase();
            return /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)$/i.test(filename) || mediaKind === 'images';
          }) as Record<string, unknown> | undefined;
          if (!image) {
            window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
            return;
          }
          const path = String(image.fullpath || image.fullPath || image.path || '').trim();
          if (!path) return;
          const name = String(image.filename || image.name || path.replace(/\\/g, '/').split('/').pop() || 'Umbra UI output').trim();
          setLatestSavedImage({
            requestId,
            promptIndex: toFiniteInteger(payload?.promptIndex, 0, 0, Number.MAX_SAFE_INTEGER),
            promptId: String(payload?.promptId || '').trim(),
            name,
            path,
            imageUrl: `/api/fs/image?${new URLSearchParams({ path }).toString()}`,
            updatedAt: Date.now(),
          });
          window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
          return;
        }
        if (type === 'queue_forwarded' || type === 'queue_result') {
          const requestId = String(payload?.requestId || '').trim();
          const pending = pendingQueueAcksRef.current.get(requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingQueueAcksRef.current.delete(requestId);
          if (payload?.success === false) {
            pending.reject(new Error(String(payload?.error || 'Failed to queue generation.')));
          } else {
            pending.resolve(requestId);
          }
        }
      };
      ws.onerror = () => {
        if (wsRef.current === ws) setConnected(false);
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        rejectPendingCatalogRequests('The ComfyUI catalog bridge disconnected.');
        if (disposed) return;
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      setConnected(false);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      rejectPendingAcks('Umbra UI queue connection closed.');
      rejectPendingCatalogRequests('Umbra UI catalog connection closed.');
      const ws = wsRef.current;
      wsRef.current = null;
      try { ws?.close(); } catch { /* best effort */ }
    };
  }, [refreshVideoJobs]);

  const requestLoraCatalog = React.useCallback((): Promise<string[]> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !connected) {
      return fetchUmbraUiCatalog('lora');
    }
    const requestId = createRequestId();
    return new Promise<string[]>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingLoraCatalogRef.current.delete(requestId);
        reject(new Error('LoRA catalog request timed out.'));
      }, CATALOG_REQUEST_TIMEOUT_MS);
      pendingLoraCatalogRef.current.set(requestId, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ type: 'lora_catalog_request', requestId }));
      } catch (error) {
        window.clearTimeout(timer);
        pendingLoraCatalogRef.current.delete(requestId);
        reject(error instanceof Error ? error : new Error('Failed to request the LoRA catalog.'));
      }
    }).catch(() => fetchUmbraUiCatalog('lora'));
  }, [connected]);

  const requestLoraInfo = React.useCallback((
    loraName: string,
    options?: PowerPrompterInfoRequestOptions,
  ): Promise<PowerPrompterLoraInfoPayload> => {
    const normalizedName = String(loraName || '').trim().replace(/\\/g, '/');
    if (!normalizedName) return Promise.reject(new Error('Choose a LoRA first.'));
    const cached = loraInfoCacheRef.current.get(normalizedName.toLowerCase());
    if (cached && options?.previewOnly !== true) return Promise.resolve(cached);
    const requestThroughHttp = () => (fetchUmbraUiCatalogInfo('lora', normalizedName) as Promise<PowerPrompterLoraInfoPayload>)
      .then((info) => {
        loraInfoCacheRef.current.set(normalizedName.toLowerCase(), info);
        return info;
      });
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !connected) {
      return requestThroughHttp();
    }
    const requestId = createRequestId();
    return new Promise<PowerPrompterLoraInfoPayload>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingLoraInfoRef.current.delete(requestId);
        reject(new Error('LoRA metadata request timed out.'));
      }, CATALOG_REQUEST_TIMEOUT_MS);
      pendingLoraInfoRef.current.set(requestId, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({
          type: 'lora_info_request',
          requestId,
          loraName: normalizedName,
          previewOnly: options?.previewOnly === true,
        }));
      } catch (error) {
        window.clearTimeout(timer);
        pendingLoraInfoRef.current.delete(requestId);
        reject(error instanceof Error ? error : new Error('Failed to request LoRA metadata.'));
      }
    }).catch(requestThroughHttp);
  }, [connected]);

  const requestModelInfo = React.useCallback((
    modelName: string,
    options?: PowerPrompterInfoRequestOptions,
  ): Promise<PowerPrompterModelInfoPayload> => {
    const normalizedName = String(modelName || '').trim().replace(/\\/g, '/');
    if (!normalizedName) return Promise.reject(new Error('Choose a checkpoint first.'));
    const cached = modelInfoCacheRef.current.get(normalizedName.toLowerCase());
    if (cached && options?.previewOnly !== true) return Promise.resolve(cached);
    const requestThroughHttp = () => (fetchUmbraUiCatalogInfo('checkpoint', normalizedName) as Promise<PowerPrompterModelInfoPayload>)
      .then((info) => {
        modelInfoCacheRef.current.set(normalizedName.toLowerCase(), info);
        return info;
      });
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !connected) {
      return requestThroughHttp();
    }
    const requestId = createRequestId();
    return new Promise<PowerPrompterModelInfoPayload>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingModelInfoRef.current.delete(requestId);
        reject(new Error('Checkpoint metadata request timed out.'));
      }, CATALOG_REQUEST_TIMEOUT_MS);
      pendingModelInfoRef.current.set(requestId, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({
          type: 'model_info_request',
          requestId,
          modelName: normalizedName,
          previewOnly: options?.previewOnly === true,
        }));
      } catch (error) {
        window.clearTimeout(timer);
        pendingModelInfoRef.current.delete(requestId);
        reject(error instanceof Error ? error : new Error('Failed to request checkpoint metadata.'));
      }
    }).catch(requestThroughHttp);
  }, [connected]);

  const refreshLoraCatalog = React.useCallback(async () => {
    setLoraCatalogLoading(true);
    try {
      const items = await requestLoraCatalog();
      setLoraCatalog(items);
      return items;
    } finally {
      setLoraCatalogLoading(false);
    }
  }, [requestLoraCatalog]);

  React.useEffect(() => {
    if (!connected) return;
    void refreshLoraCatalog().catch(() => {
      if (videoModelCatalog.loras.length > 0) setLoraCatalog(videoModelCatalog.loras);
    });
  }, [connected, refreshLoraCatalog, videoModelCatalog.loras]);

  const queueSummary = React.useMemo(() => summarizeQueue(queueSnapshot), [queueSnapshot]);

  const submitQueueBatchRequest = React.useCallback((
    prompts: string[],
    generations: Record<string, unknown>[],
    styleNames: string[],
    routing: {
      feature: UmbraUiPipelineFeature;
      modelFamily: string;
    },
    queuePlacement: UmbraQueuePlacement = 'end',
  ) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !connected) {
      return Promise.reject(new Error('Umbra UI is still connecting to the queue service.'));
    }
    if (prompts.length <= 0 || generations.length !== prompts.length) {
      return Promise.reject(new Error('Umbra UI received an invalid queue batch.'));
    }
    const requestId = createRequestId();
    ownedRequestIdsRef.current.add(requestId);
    if (ownedRequestIdsRef.current.size > 100) {
      const oldest = ownedRequestIdsRef.current.values().next().value;
      if (oldest) ownedRequestIdsRef.current.delete(oldest);
    }
    const normalizedStyleNames = prompts.map((_, index) => String(styleNames[index] || `Umbra UI ${index + 1}`).trim());
    const state = {
      sourceFile: '',
      activePrompt: prompts[0],
      prompts,
      joinedPrompt: prompts.join('\n'),
      activeQueueSet: 1,
      activeSetId: 1,
      generation: generations[0],
      generationByPrompt: generations,
      promptSetIds: prompts.map(() => 1),
      promptOutputSubfolders: prompts.map(() => ''),
      promptStyleNames: normalizedStyleNames,
      promptSeedGroupIds: prompts.map((_, index) => `umbra-ui:${requestId}:${index}`),
      styleSeedMode: 'same',
      modelFamily: routing.modelFamily,
      umbraUiFeature: routing.feature,
      pipeline: {
        feature: routing.feature,
        modelFamily: routing.modelFamily,
        modelSource: String(generations[0]?.modelType || 'checkpoint'),
      },
      queueOrigin: 'umbra_ui',
      queuePlacement,
    };

    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingQueueAcksRef.current.delete(requestId);
        reject(new Error('Umbra UI queue request timed out.'));
      }, QUEUE_ACK_TIMEOUT_MS);
      pendingQueueAcksRef.current.set(requestId, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({
          type: 'queue_request',
          requestId,
          targetBridgeId: createUmbraUiPipelineTargetId(state.pipeline),
          queueTargetType: 'pipeline',
          mode: 'prompt',
          prompts,
          state,
          queueOrigin: 'umbra_ui',
          queuePlacement,
        }));
      } catch (error) {
        window.clearTimeout(timer);
        pendingQueueAcksRef.current.delete(requestId);
        reject(error instanceof Error ? error : new Error('Failed to submit Umbra UI queue request.'));
      }
    });
  }, [connected]);

  const submitQueueRequest = React.useCallback((
    prompt: string,
    generation: Record<string, unknown>,
    styleName: string,
    routing: {
      feature: UmbraUiPipelineFeature;
      modelFamily: string;
    },
    queuePlacement: UmbraQueuePlacement = 'end',
  ) => submitQueueBatchRequest(
    [prompt],
    [generation],
    [styleName],
    routing,
    queuePlacement,
  ), [submitQueueBatchRequest]);

  const prepareImageQueueRequest = React.useCallback((options: UmbraImageQueueOptions) => {
    const prompt = String(options.prompt || '').trim();
    if (!prompt) throw new Error('Enter a prompt before queueing.');
    const enabledLoras = (Array.isArray(options.loras) ? options.loras : []).filter((lora) => lora?.enabled !== false);
    const promptWithLoras = composeUmbraUiPromptWithLoras(prompt, enabledLoras);
    const modelFamily = String(options.modelFamily || '').trim();
    const feature: UmbraUiPipelineFeature = options.outputMode === 'img2img' ? 'img2img' : 'txt2img';
    const pipelineMatch = resolveUmbraUiPipeline(workflows, feature, modelFamily, options.modelType);
    if (!pipelineMatch.workflow || !pipelineMatch.pipeline) {
      throw new Error(pipelineMatch.error || 'No compatible image pipeline is available.');
    }
    const selectedWorkflow = pipelineMatch.workflow;
    const capabilities = normalizeUmbraUiPipelineCapabilities(
      pipelineMatch.pipeline.capabilities,
      pipelineMatch.pipeline.modelSources,
    );
    const readiness = normalizeUmbraUiPipelineReadiness(
      pipelineMatch.pipeline.readiness,
      capabilities,
      pipelineMatch.pipeline.modelSources,
    );
    if (readiness.runtime.nodes.status === 'missing') {
      throw new Error(`Missing ComfyUI nodes: ${readiness.runtime.nodes.missing.join(', ')}`);
    }
    if (feature === 'img2img' && capabilities.denoise.support !== 'adjustable') {
      throw new Error(capabilities.denoise.reason || 'This pipeline cannot adjust IMG2IMG denoise.');
    }
    let checkpointName = String(options.checkpointName || '').trim().replace(/\\/g, '/');
    if (!checkpointName) throw new Error('Select a model before queueing.');
    const primaryCatalog = getUmbraModelCatalogValues(modelCatalog, options.modelType);
    if (primaryCatalog.length > 0) {
      const match = matchUmbraUiResourceCatalog(checkpointName, primaryCatalog);
      if (match.status === 'ambiguous') {
        throw new Error(`The selected model basename is ambiguous. Choose an exact relative path: ${match.matches.join(', ')}.`);
      }
      if (match.status === 'missing') {
        throw new Error(`The selected model is not installed: ${checkpointName}.`);
      }
      checkpointName = match.match;
    }
    const workflowResources: Record<string, string> = Object.fromEntries(Object.entries(options.workflowResources || {})
      .map(([id, value]) => [String(id || '').trim(), String(value || '').trim().replace(/\\/g, '/')])
      .filter(([id, value]) => id.length > 0 && value.length > 0));
    for (const resource of selectedWorkflow.resources || []) {
      const selectedValue = String(workflowResources[resource.id] || resource.defaultValue || '').trim().replace(/\\/g, '/');
      if (resource.required && !selectedValue) {
        throw new Error(`Select ${resource.label} before queueing.`);
      }
      if (!selectedValue) continue;
      const resourceCatalog = getUmbraModelCatalogValues(modelCatalog, resource.kind);
      if (resourceCatalog.length <= 0) {
        workflowResources[resource.id] = selectedValue;
        continue;
      }
      const match = matchUmbraUiResourceCatalog(selectedValue, resourceCatalog);
      if (match.status === 'ambiguous') {
        throw new Error(`${resource.label} basename is ambiguous. Choose an exact relative path: ${match.matches.join(', ')}.`);
      }
      if (match.status === 'missing') {
        throw new Error(`${resource.label} is not installed: ${selectedValue}.`);
      }
      workflowResources[resource.id] = match.match;
    }
    const hiresResizeMode = resolveUmbraUiHiresResizeMode(capabilities.hiresFix, options.hiresFix.resizeMode);
    const detailerPipeline = filterUmbraUiDetailerStages(capabilities.detailerStages, options.detailerPipeline);
    const outputUpscaleModel = capabilities.finalModelUpscale.modelSelection
      ? String(options.outputUpscale.modelName || '').trim()
      : typeof capabilities.finalModelUpscale.value === 'string'
        ? capabilities.finalModelUpscale.value
        : String(options.outputUpscale.modelName || '').trim();
    const generation = {
      mediaType: 'image',
      outputOwner: 'umbra_ui',
      outputMode: feature,
      img2img: {
        sourceImagePath: String(options.sourceImagePath || '').trim().replace(/\\/g, '/'),
        sourceImageName: String(options.sourceImageName || '').trim().replace(/\\/g, '/'),
        denoise: toFiniteNumber(options.denoise, 0.3, 0.01, 1),
      },
      negativePrompt: String(options.negativePrompt || '').trim(),
      seed: toFiniteInteger(options.seed, 0, 0, Number.MAX_SAFE_INTEGER),
      controlAfterGenerate: options.seedMode,
      seedIncrement: options.seedIncrement,
      steps: toFiniteInteger(options.steps, 35, 1, 10000),
      cfg: toFiniteNumber(options.cfg, 4, 0, 100),
      clipSkip: toFiniteInteger(options.clipSkip, 1, 1, 12),
      samplerName: String(options.samplerName || 'er_sde').trim() || 'er_sde',
      scheduler: String(options.scheduler || 'simple').trim() || 'simple',
      modelType: options.modelType,
      checkpointName,
      workflowResources,
      aspectRatio: 'custom',
      swapDimensions: false,
      width: toFiniteInteger(options.width, 896, 64, 8192),
      height: toFiniteInteger(options.height, 1152, 64, 8192),
      batchSize: 1,
      loras: enabledLoras.map((lora) => ({
        id: lora.id,
        name: lora.name,
        strengthModel: lora.strengthModel,
        strengthClip: lora.strengthClip,
        enabled: true,
        queueEnabled: true,
        queueSetIds: [1],
      })),
      hiresFix: {
        enabled: capabilities.hiresFix.support === 'adjustable' && !!hiresResizeMode && options.hiresFix.enabled === true,
        upscaler: capabilities.hiresFix.controls.upscaler
          ? String(options.hiresFix.upscaler || 'Latent').trim() || 'Latent'
          : 'Latent',
        resizeMode: hiresResizeMode || 'scale',
        scaleBy: toFiniteNumber(options.hiresFix.scaleBy, 2, 1, 8),
        targetWidth: toFiniteInteger(options.hiresFix.targetWidth, 0, 0, 16384),
        targetHeight: toFiniteInteger(options.hiresFix.targetHeight, 0, 0, 16384),
        steps: capabilities.hiresFix.controls.steps
          ? toFiniteInteger(options.hiresFix.steps, 0, 0, 10000)
          : 0,
        denoise: capabilities.hiresFix.controls.denoise
          ? toFiniteNumber(options.hiresFix.denoise, 0.35, 0, 1)
          : 0.35,
        cfg: capabilities.hiresFix.controls.cfg
          ? toFiniteNumber(options.hiresFix.cfg, 0, 0, 100)
          : 0,
        samplerName: capabilities.hiresFix.controls.sampler
          ? String(options.hiresFix.samplerName || 'use_same').trim() || 'use_same'
          : 'use_same',
        scheduler: capabilities.hiresFix.controls.scheduler
          ? String(options.hiresFix.scheduler || 'use_same').trim() || 'use_same'
          : 'use_same',
      },
      detailerPipeline: detailerPipeline.map((stage) => ({ ...stage })),
      outputUpscale: {
        enabled: capabilities.finalModelUpscale.support === 'adjustable' && options.outputUpscale.enabled === true,
        modelName: outputUpscaleModel || 'RealESRGAN_x4plus.safetensors',
        maxDimension: capabilities.finalModelUpscale.maxDimension
          ? toFiniteInteger(options.outputUpscale.maxDimension, 3840, 512, 16384)
          : 3840,
      },
    };
    return {
      prompt: promptWithLoras,
      generation,
      styleName: String(options.styleName || (feature === 'img2img' ? 'Umbra UI IMG2IMG' : 'Umbra UI Image')).trim()
        || (feature === 'img2img' ? 'Umbra UI IMG2IMG' : 'Umbra UI Image'),
      modelFamily,
      feature,
    };
  }, [modelCatalog, workflows]);

  const queueImage = React.useCallback(async (options: UmbraImageQueueOptions) => {
    let preparedOptions = options;
    if (options.outputMode === 'img2img') {
      const sourceImagePath = String(options.sourceImagePath || '').trim();
      let sourceImageName = String(options.sourceImageName || '').trim();
      if (!sourceImagePath && !sourceImageName) throw new Error('Choose a source image for IMG2IMG.');
      if (!sourceImageName) {
        const response = await fetch('/api/comfy/copy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: sourceImagePath }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false || !payload?.filename) {
          throw new Error(String(payload?.error || 'Failed to stage the IMG2IMG source in ComfyUI.'));
        }
        sourceImageName = String(payload.filename);
      }
      preparedOptions = { ...options, sourceImagePath, sourceImageName };
    }
    const prepared = prepareImageQueueRequest(preparedOptions);
    return submitQueueRequest(prepared.prompt, prepared.generation, prepared.styleName, {
      feature: prepared.feature,
      modelFamily: prepared.modelFamily,
    }, preparedOptions.queuePlacement);
  }, [prepareImageQueueRequest, submitQueueRequest]);

  const queueVideo = React.useCallback(async (options: UmbraVideoQueueOptions) => {
    const prompt = String(options.prompt || '').trim();
    if (!prompt) throw new Error('Enter a video prompt before queueing.');
    const video: PowerPrompterVideoControls = {
      ...options.video,
      postprocess: { ...options.video.postprocess },
      wan: { ...options.video.wan },
      ltx: {
        ...options.video.ltx,
        keyframes: options.video.ltx.keyframes.map((keyframe) => ({ ...keyframe })),
      },
      sourceImagePath: String(options.video.sourceImagePath || '').trim(),
      sourceImageName: String(options.video.sourceImageName || '').trim(),
      middleImagePath: String(options.video.middleImagePath || '').trim(),
      middleImageName: String(options.video.middleImageName || '').trim(),
      lastImagePath: String(options.video.lastImagePath || '').trim(),
      lastImageName: String(options.video.lastImageName || '').trim(),
      sourceVideoPath: String(options.video.sourceVideoPath || '').trim(),
      sourceVideoName: String(options.video.sourceVideoName || '').trim(),
      sourceAudioPath: String(options.video.sourceAudioPath || '').trim(),
      sourceAudioName: String(options.video.sourceAudioName || '').trim(),
    };
    if (video.mode !== 'text_to_video' && (!video.sourceWidth || !video.sourceHeight)) {
      throw new Error('Umbra could not read the source media dimensions. Reload the source before queueing.');
    }
    const targetDimensions = resolveUmbraVideoTargetDimensions({
      resolutionPreset: video.resolutionPreset,
      sourceWidth: video.mode === 'text_to_video' ? 0 : video.sourceWidth,
      sourceHeight: video.mode === 'text_to_video' ? 0 : video.sourceHeight,
      fallbackAspect: video.aspectRatio,
    });
    video.width = targetDimensions.targetWidth;
    video.height = targetDimensions.targetHeight;
    const modelFamily = video.family === 'wan22' ? 'Wan 2.2' : 'LTX-2.3';
    const feature: UmbraUiPipelineFeature = video.mode === 'video_to_video'
      ? 'vid2vid'
      : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid';
    const modelSource = video.family === 'wan22' ? 'unet' : 'checkpoint';
    const pipelineMatch = resolveUmbraUiPipeline(workflows, feature, modelFamily, modelSource);
    if (!pipelineMatch.workflow) throw new Error(pipelineMatch.error || 'No compatible video pipeline is available.');

    if (video.mode === 'image_to_video') {
      if (!video.sourceImagePath) throw new Error('Choose a source image for image-to-video.');
      const stageFrame = async (label: string, path: string, name: string): Promise<string> => {
        if (name) return name;
        if (!path) throw new Error(`Choose a ${label.toLowerCase()} image.`);
        const response = await fetch('/api/comfy/copy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: path }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(String(payload?.error || `Failed to stage the ${label.toLowerCase()} image in ComfyUI.`));
        }
        return String(payload?.filename || '').trim();
      };
      video.sourceImageName = await stageFrame('first frame', video.sourceImagePath, video.sourceImageName);
      if (!video.sourceImageName) throw new Error('ComfyUI did not return a staged source image name.');
      if (video.frameGuideMode === 'first_middle_last') {
        video.middleImageName = await stageFrame('middle frame', video.middleImagePath, video.middleImageName);
      }
      if (video.frameGuideMode === 'first_last' || video.frameGuideMode === 'first_middle_last') {
        video.lastImageName = await stageFrame('last frame', video.lastImagePath, video.lastImageName);
      }
    }

    if (video.family === 'ltx23' && video.ltx.keyframes.length > 0) {
      for (const keyframe of video.ltx.keyframes) {
        keyframe.sourceImagePath = String(keyframe.sourceImagePath || '').trim();
        keyframe.sourceImageName = String(keyframe.sourceImageName || '').trim();
        if (!keyframe.sourceImagePath && !keyframe.sourceImageName) continue;
        if (!keyframe.sourceImageName) {
          const response = await fetch('/api/comfy/copy-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: keyframe.sourceImagePath }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.success === false) {
            throw new Error(String(payload?.error || `Failed to stage LTX guide at frame ${keyframe.frameIndex}.`));
          }
          keyframe.sourceImageName = String(payload?.filename || '').trim();
        }
        if (!keyframe.sourceImageName) throw new Error(`ComfyUI did not stage the LTX guide at frame ${keyframe.frameIndex}.`);
      }
    }

    const stageMedia = async (kind: 'video' | 'audio', path: string, name: string): Promise<string> => {
      if (name) return name;
      if (!path) return '';
      const response = await fetch('/api/comfy/copy-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: path, kind }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || `Failed to stage the source ${kind}.`));
      }
      return String(payload?.filename || '').trim();
    };
    if (video.mode === 'video_to_video') {
      if (!video.sourceVideoPath && !video.sourceVideoName) throw new Error('Choose a source video for VID2VID.');
      video.sourceVideoName = await stageMedia('video', video.sourceVideoPath, video.sourceVideoName);
      if (!video.sourceVideoName) throw new Error('ComfyUI did not return a staged source video name.');
    }
    video.sourceAudioName = await stageMedia('audio', video.sourceAudioPath, video.sourceAudioName);

    if (video.family === 'wan22') {
      const required = [
        ['high noise model', video.wan.highModel],
        ['low noise model', video.wan.lowModel],
        ['high noise LoRA', video.wan.highLora],
        ['low noise LoRA', video.wan.lowLora],
        ['text encoder', video.wan.textEncoder],
        ['VAE', video.wan.vae],
        ...(video.mode === 'image_to_video' ? [['vision encoder', video.wan.clipVision]] : []),
      ];
      const missing = required.find(([, value]) => !String(value || '').trim());
      if (missing) throw new Error(`Select a Wan ${missing[0]} before queueing.`);
    } else {
      const required = [
        ['checkpoint', video.ltx.checkpoint],
        ['text encoder', video.ltx.textEncoder],
        ['distilled model LoRA', video.ltx.distilledLora],
        ['prompt LoRA', video.ltx.promptLora],
        ...(video.ltx.twoStage ? [['latent upscaler', video.ltx.latentUpscaleModel]] : []),
        ...(video.ltx.audioEnabled
          && !video.sourceAudioName
          && !(video.mode === 'video_to_video' && video.preserveSourceAudio)
          ? [['audio VAE', video.ltx.audioVae]]
          : []),
      ];
      const missing = required.find(([, value]) => !String(value || '').trim());
      if (missing) throw new Error(`Select an LTX-2.3 ${missing[0]} before queueing.`);
    }

    if (video.postprocess.interpolationEnabled && !video.postprocess.interpolationModel) {
      throw new Error('Select a frame interpolation model before queueing.');
    }
    if (video.postprocess.upscaleMode === 'model' && !video.postprocess.upscaleModel) {
      throw new Error('Select a video upscale model before queueing.');
    }
    if (video.postprocess.upscaleMode === 'rtx' && !videoModelCatalog.rtxAvailable) {
      throw new Error('NVIDIA RTX Video Super Resolution is not installed in the managed ComfyUI runtime.');
    }

    const generation = {
      mediaType: 'video',
      outputOwner: 'umbra_ui',
      outputMode: video.mode === 'video_to_video'
        ? 'vid2vid'
        : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid',
      negativePrompt: String(options.negativePrompt || '').trim(),
      seed: toFiniteInteger(video.seed, 0, 0, Number.MAX_SAFE_INTEGER),
      controlAfterGenerate: video.seedMode,
      seedIncrement: video.seedIncrement,
      steps: video.family === 'wan22' ? video.wan.steps : 8,
      cfg: video.family === 'wan22' ? video.wan.cfg : video.ltx.baseCfg,
      samplerName: video.family === 'wan22' ? video.wan.highSamplerName : video.ltx.baseSamplerName,
      scheduler: video.family === 'wan22' ? video.wan.highScheduler : 'normal',
      modelType: video.family === 'wan22' ? 'unet' : 'checkpoint',
      checkpointName: video.family === 'wan22' ? video.wan.highModel : video.ltx.checkpoint,
      aspectRatio: 'custom',
      swapDimensions: false,
      width: video.width,
      height: video.height,
      batchSize: 1,
      loras: [],
      video,
    };
    const requestId = await submitQueueRequest(
      prompt,
      generation,
      video.family === 'wan22' ? 'Umbra UI Wan 2.2 Video' : 'Umbra UI LTX-2.3 Video',
      { feature, modelFamily },
      options.queuePlacement,
    );
    await refreshVideoJobs();
    return requestId;
  }, [refreshVideoJobs, submitQueueRequest, videoModelCatalog.rtxAvailable, workflows]);

  return {
    connected,
    workflows,
    modelCatalog,
    videoModelCatalog,
    refreshModelCatalog: () => {
      setModelCatalogRevision((revision) => revision + 1);
      setPipelineCatalogRevision((revision) => revision + 1);
    },
    loraCatalog: loraCatalog.length > 0 ? loraCatalog : videoModelCatalog.loras,
    loraCatalogLoading,
    refreshLoraCatalog,
    requestLoraInfo,
    requestModelInfo,
    inheritedGeneration,
    queueSummary,
    videoJobs,
    videoJobsLoading,
    videoJobsError,
    refreshVideoJobs,
    generationPreview,
    latestSavedImage,
    queueImage,
    queueVideo,
  };
}
