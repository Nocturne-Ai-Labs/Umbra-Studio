import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

export type UmbraQueueActivityFeature =
  | 'txt2img'
  | 'img2img'
  | 'inpaint'
  | 'canvas'
  | 'video'
  | 'upscale'
  | 'watermark'
  | 'video-watermark'
  | 'censor'
  | 'gif'
  | 'extras';

export type UmbraQueueActivityStatus =
  | 'staging'
  | 'pending'
  | 'queued'
  | 'submitting'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'canceled'
  | 'interrupted';

export type UmbraQueueActivityPlacement = 'interrupt' | 'next' | 'end' | 'parallel';

export interface UmbraQueueActivity {
  id: string;
  owner: string;
  feature: UmbraQueueActivityFeature;
  label: string;
  detail?: string;
  status: UmbraQueueActivityStatus;
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  placement: UmbraQueueActivityPlacement;
  queueIndex?: number;
  requestId?: string;
  readonly: true;
}

const activitiesByOwner = new Map<string, UmbraQueueActivity[]>();
const activityListeners = new Set<() => void>();
let activitySnapshot: UmbraQueueActivity[] = [];

function clampCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeStatus(value: unknown): UmbraQueueActivityStatus {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'cancelled') return 'canceled';
  if (
    status === 'staging'
    || status === 'pending'
    || status === 'queued'
    || status === 'submitting'
    || status === 'running'
    || status === 'completed'
    || status === 'partial'
    || status === 'failed'
    || status === 'canceled'
    || status === 'interrupted'
  ) return status;
  return 'pending';
}

function normalizePlacement(value: unknown): UmbraQueueActivityPlacement {
  const placement = String(value || '').trim().toLowerCase();
  if (placement === 'interrupt' || placement === 'next' || placement === 'parallel') return placement;
  return 'end';
}

function normalizeActivity(owner: string, activity: UmbraQueueActivity): UmbraQueueActivity | null {
  const normalizedOwner = String(owner || activity.owner || '').trim();
  const id = String(activity.id || '').trim();
  if (!normalizedOwner || !id) return null;
  const total = clampCount(activity.total);
  return {
    ...activity,
    id,
    owner: normalizedOwner,
    label: String(activity.label || 'Umbra UI Job').trim() || 'Umbra UI Job',
    detail: String(activity.detail || '').trim() || undefined,
    status: normalizeStatus(activity.status),
    total,
    completed: Math.min(total, clampCount(activity.completed)),
    failed: Math.min(total, clampCount(activity.failed)),
    createdAt: Math.max(0, Math.floor(Number(activity.createdAt) || Date.now())),
    updatedAt: Math.max(0, Math.floor(Number(activity.updatedAt) || Date.now())),
    placement: normalizePlacement(activity.placement),
    queueIndex: Number.isFinite(Number(activity.queueIndex))
      ? Math.max(0, Math.floor(Number(activity.queueIndex)))
      : undefined,
    requestId: String(activity.requestId || '').trim() || undefined,
    readonly: true,
  };
}

function activitySignature(activities: UmbraQueueActivity[]): string {
  return JSON.stringify(activities.map((activity) => ({
    id: activity.id,
    owner: activity.owner,
    feature: activity.feature,
    label: activity.label,
    detail: activity.detail || '',
    status: activity.status,
    total: activity.total,
    completed: activity.completed,
    failed: activity.failed,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    placement: activity.placement,
    queueIndex: activity.queueIndex ?? -1,
    requestId: activity.requestId || '',
  })));
}

export function areUmbraQueueActivitiesEquivalent(
  left: UmbraQueueActivity[],
  right: UmbraQueueActivity[],
): boolean {
  return left === right || activitySignature(left) === activitySignature(right);
}

function rebuildActivitySnapshot() {
  const next = Array.from(activitiesByOwner.values()).flat();
  next.sort((left, right) => {
    const leftIndex = left.queueIndex;
    const rightIndex = right.queueIndex;
    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
  });
  if (activitySignature(next) === activitySignature(activitySnapshot)) return;
  activitySnapshot = next;
  for (const listener of activityListeners) listener();
}

export function replaceUmbraQueueActivities(owner: string, activities: UmbraQueueActivity[]) {
  const normalizedOwner = String(owner || '').trim();
  if (!normalizedOwner) return;
  const next = activities.flatMap((activity) => {
    const normalized = normalizeActivity(normalizedOwner, activity);
    return normalized ? [normalized] : [];
  });
  const current = activitiesByOwner.get(normalizedOwner) || [];
  if (activitySignature(current) === activitySignature(next)) return;
  if (next.length > 0) activitiesByOwner.set(normalizedOwner, next);
  else activitiesByOwner.delete(normalizedOwner);
  rebuildActivitySnapshot();
}

export function clearUmbraQueueActivities(owner: string) {
  const normalizedOwner = String(owner || '').trim();
  if (!normalizedOwner || !activitiesByOwner.delete(normalizedOwner)) return;
  rebuildActivitySnapshot();
}

export function useUmbraQueueActivities(): UmbraQueueActivity[] {
  return useSyncExternalStore(
    (listener) => {
      activityListeners.add(listener);
      return () => activityListeners.delete(listener);
    },
    () => activitySnapshot,
    () => activitySnapshot,
  );
}

export function usePublishUmbraQueueActivity(owner: string, activity: UmbraQueueActivity | null) {
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const signature = useMemo(() => activity ? activitySignature([activity]) : '', [activity]);

  useEffect(() => {
    replaceUmbraQueueActivities(owner, activityRef.current ? [activityRef.current] : []);
  }, [owner, signature]);

  useEffect(() => () => clearUmbraQueueActivities(owner), [owner]);
}

export function isUmbraQueueActivityTerminal(status: UmbraQueueActivityStatus): boolean {
  return status === 'completed'
    || status === 'partial'
    || status === 'failed'
    || status === 'canceled'
    || status === 'interrupted';
}

export function getUmbraQueueActivityFeatureLabel(feature: UmbraQueueActivityFeature): string {
  if (feature === 'txt2img') return 'TXT2IMG';
  if (feature === 'img2img') return 'IMG2IMG';
  if (feature === 'inpaint') return 'Inpaint';
  if (feature === 'canvas') return 'Canvas';
  if (feature === 'video') return 'Video';
  if (feature === 'upscale') return 'Upscale';
  if (feature === 'watermark') return 'Image Watermark';
  if (feature === 'video-watermark') return 'Video Watermark';
  if (feature === 'censor') return 'Image Censor';
  if (feature === 'gif') return 'Video to GIF';
  return 'Extras';
}

function resolveControllerFeature(value: unknown): UmbraQueueActivityFeature {
  const feature = String(value || '').trim().toLowerCase();
  if (feature === 'txt2img') return 'txt2img';
  if (feature === 'img2img') return 'img2img';
  if (feature === 'inpainting') return 'inpaint';
  if (feature === 'upscale') return 'upscale';
  if (feature === 'txt2vid' || feature === 'img2vid' || feature === 'ref2vid' || feature === 'vid2vid') return 'video';
  return 'extras';
}

function resolveControllerStatus(request: any): UmbraQueueActivityStatus {
  const requestStatus = normalizeStatus(request?.status);
  if (requestStatus !== 'pending') return requestStatus;
  const promptStatuses: UmbraQueueActivityStatus[] = (Array.isArray(request?.prompts) ? request.prompts : [])
    .map((prompt: any) => normalizeStatus(prompt?.status));
  if (promptStatuses.some((status) => status === 'running' || status === 'submitting')) return 'running';
  if (promptStatuses.length > 0 && promptStatuses.every((status) => status === 'completed')) return 'completed';
  if (promptStatuses.some((status) => status === 'queued')) return 'queued';
  return 'pending';
}

export function buildUmbraQueueActivitiesFromControllerSnapshot(snapshot: any): UmbraQueueActivity[] {
  const rawRequests = Array.isArray(snapshot?.requests) ? snapshot.requests : [];
  return rawRequests.flatMap((request: any, queueIndex: number) => {
    if (String(request?.origin || '').trim().toLowerCase() !== 'umbra_ui') return [];
    const requestId = String(request?.requestId || '').trim();
    if (!requestId) return [];
    const prompts = Array.isArray(request?.prompts) ? request.prompts : [];
    const pipelineFeature = String(request?.pipeline?.feature || '').trim();
    const feature = resolveControllerFeature(pipelineFeature);
    const featureLabel = pipelineFeature
      ? pipelineFeature.replace('inpainting', 'inpaint').toUpperCase()
      : getUmbraQueueActivityFeatureLabel(feature);
    const modelLabel = String(request?.pipeline?.modelFamily || request?.pipelineName || '').trim();
    const total = Math.max(clampCount(request?.total), prompts.length);
    const completed = Math.max(
      clampCount(request?.completed),
      prompts.filter((prompt: any) => normalizeStatus(prompt?.status) === 'completed').length,
    );
    const failed = Math.max(
      clampCount(request?.failed) + clampCount(request?.canceled),
      prompts.filter((prompt: any) => {
        const status = normalizeStatus(prompt?.status);
        return status === 'failed' || status === 'canceled' || status === 'interrupted';
      }).length,
    );
    const firstLivePrompt = prompts.find((prompt: any) => {
      const status = normalizeStatus(prompt?.status);
      return status === 'running' || status === 'submitting' || status === 'pending' || status === 'queued';
    }) || prompts[0];
    return [{
      id: `umbra-controller:${requestId}`,
      owner: 'umbra-ui-controller',
      feature,
      label: modelLabel ? `${featureLabel} - ${modelLabel}` : featureLabel,
      detail: String(firstLivePrompt?.prompt || '').trim() || undefined,
      status: resolveControllerStatus(request),
      total,
      completed,
      failed,
      createdAt: Math.max(0, Math.floor(Number(request?.createdAt) || Date.now())),
      updatedAt: Math.max(0, Math.floor(Number(request?.updatedAt) || Date.now())),
      placement: normalizePlacement(request?.queuePlacement),
      queueIndex,
      requestId,
      readonly: true as const,
    }];
  });
}
