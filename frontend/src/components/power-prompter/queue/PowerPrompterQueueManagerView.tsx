import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bell, CheckCircle2, ChevronDown, ChevronRight, Film, FolderOpen, GripVertical, Image as ImageIcon, ListChecks, ListOrdered, Loader2, LockKeyhole, Paintbrush, Pause, Pencil, Play, Power, RefreshCw, Save, Search, Sparkles, Trash2, Volume2, VolumeX, XCircle } from 'lucide-react';
import { PowerPrompterActivePromptInline } from '@/components/layout/PowerPrompterActivePromptInline';
import { PowerPrompterQueueManagerSidePane } from './PowerPrompterQueueManagerSidePane';
import { QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS, formatQueueEtaDuration, getSetColor, hexToRgba } from './queueCore';
import { POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME } from '@/lib/powerPrompter';
import {
  POWER_PROMPTER_SOUND_STYLE_GLASS_TICK,
  POWER_PROMPTER_SOUND_STYLE_OPTIONS,
  clampCompletionSoundVolume,
} from '@/components/power-prompter/powerPrompterAudio';
import {
  getUmbraQueueActivityFeatureLabel,
  isUmbraQueueActivityTerminal,
  type UmbraQueueActivity,
} from '@/lib/umbraQueueActivity';
import { classifyUmbraPrompt } from '@/lib/nsfwPrivacy';

type PowerPrompterQueueManagerViewProps = Record<string, any>;
type QueueManagerPromptRowsProps = {
  items: any[];
  emptyContent?: React.ReactNode;
  layoutKey: string;
  renderItem: (item: any) => React.ReactNode;
};

const QUEUE_MANAGER_PROMPT_VIRTUALIZE_THRESHOLD = 12;
const QUEUE_MANAGER_PROMPT_ROW_ESTIMATE = 86;
const QUEUE_MANAGER_GROUP_PROGRESS_CHIP_LIMIT = 8;
const QUEUE_MANAGER_GROUP_PROGRESS_SCAN_LIMIT = 1200;
const QUEUE_MANAGER_REORDER_ENABLED = false;
const QUEUE_MANAGER_EDITOR_ENABLED = true;

const UMBRA_QUEUE_ACTIVITY_TONES: Record<UmbraQueueActivity['feature'], string> = {
  txt2img: 'border-cyan-300/25 bg-cyan-500/[0.055] text-cyan-100',
  img2img: 'border-sky-300/25 bg-sky-500/[0.055] text-sky-100',
  inpaint: 'border-rose-300/25 bg-rose-500/[0.055] text-rose-100',
  canvas: 'border-fuchsia-300/25 bg-fuchsia-500/[0.055] text-fuchsia-100',
  video: 'border-violet-300/25 bg-violet-500/[0.055] text-violet-100',
  upscale: 'border-emerald-300/25 bg-emerald-500/[0.055] text-emerald-100',
  watermark: 'border-teal-300/25 bg-teal-500/[0.055] text-teal-100',
  'video-watermark': 'border-amber-300/25 bg-amber-500/[0.055] text-amber-100',
  censor: 'border-pink-300/25 bg-pink-500/[0.055] text-pink-100',
  gif: 'border-orange-300/25 bg-orange-500/[0.055] text-orange-100',
  extras: 'border-zinc-300/20 bg-white/[0.045] text-zinc-100',
};

function UmbraQueueActivityIcon({ feature }: { feature: UmbraQueueActivity['feature'] }) {
  if (feature === 'video' || feature === 'video-watermark' || feature === 'gif') return <Film size={14} />;
  if (feature === 'inpaint' || feature === 'canvas') return <Paintbrush size={14} />;
  if (feature === 'extras') return <Sparkles size={14} />;
  return <ImageIcon size={14} />;
}

function getUmbraQueuePlacementLabel(placement: UmbraQueueActivity['placement']): string {
  if (placement === 'interrupt') return 'Interrupt';
  if (placement === 'next') return 'Run Next';
  if (placement === 'parallel') return 'Parallel';
  return 'After Queue';
}

function UmbraQueueActivityCard({ activity }: { activity: UmbraQueueActivity }) {
  const resolved = Math.min(activity.total, activity.completed + activity.failed);
  const progress = activity.total > 0 ? Math.max(0, Math.min(100, (resolved / activity.total) * 100)) : 0;
  const tone = UMBRA_QUEUE_ACTIVITY_TONES[activity.feature] || UMBRA_QUEUE_ACTIVITY_TONES.extras;
  return (
    <div
      data-umbra-queue-readonly-job=""
      data-umbra-queue-job-feature={activity.feature}
      data-umbra-queue-job-status={activity.status}
      className={`overflow-hidden rounded-lg border ${tone}`}
    >
      <div className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current/20 bg-black/25">
          <UmbraQueueActivityIcon feature={activity.feature} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.14em]">
              {activity.label || getUmbraQueueActivityFeatureLabel(activity.feature)}
            </span>
            <span className="rounded-full border border-current/20 bg-black/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em]">
              {activity.status}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-zinc-400">
              {getUmbraQueuePlacementLabel(activity.placement)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-zinc-500">
              <LockKeyhole size={8} /> Read Only
            </span>
          </div>
          {activity.detail ? (
            <div className="mt-1 line-clamp-2 break-words font-mono text-[10px] leading-relaxed text-current/65" title={activity.detail}>
              {activity.detail}
            </div>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full bg-current/70 transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[9px] text-current/70">
              {resolved}/{activity.total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UmbraQueueActivityLane({
  title,
  note,
  activities,
}: {
  title: string;
  note: string;
  activities: UmbraQueueActivity[];
}) {
  if (activities.length <= 0) return null;
  return (
    <section data-umbra-queue-readonly-lane="" className="space-y-2 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-300">{title}</span>
        <span className="text-[9px] leading-relaxed text-zinc-600">{note}</span>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => <UmbraQueueActivityCard key={activity.id} activity={activity} />)}
      </div>
    </section>
  );
}

function QueueManagerGroupVariantProgress({
  group,
  setId,
  getQueuePromptBlocksForItem,
}: {
  group: any;
  setId: number;
  getQueuePromptBlocksForItem: (item: any, setId?: number) => any[];
}) {
  const chips = React.useMemo(() => {
    const getBlocksForItem = (item: any) => getQueuePromptBlocksForItem(item, setId);
    const items = Array.isArray(group?.items) ? group.items.filter((item: any) => item && item.exiting !== true) : [];
    if (items.length <= 0) return [];
    const activeItem = items.find((item: any) => item.status === 'running')
      || items.find((item: any) => item.status === 'pending')
      || items[items.length - 1];
    const activeBlocks = getBlocksForItem(activeItem);
    if (!Array.isArray(activeBlocks) || activeBlocks.length <= 0) return [];
    const variantsBySlot = new Map<string, {
      cardLabel: string;
      order: string[];
      labels: Map<string, string>;
    }>();

    const scannedItems = items.length > QUEUE_MANAGER_GROUP_PROGRESS_SCAN_LIMIT
      ? items.slice(0, QUEUE_MANAGER_GROUP_PROGRESS_SCAN_LIMIT)
      : items;
    const includesActiveItem = scannedItems.some((item: any) => item?.id === activeItem?.id);
    if (!includesActiveItem && activeItem) scannedItems.push(activeItem);

    for (const item of scannedItems) {
      const blocks = getBlocksForItem(item);
      if (!Array.isArray(blocks)) continue;
      for (const block of blocks) {
        const slotId = String(block?.slotId || '').trim();
        const variantId = String(block?.variantId || '').trim();
        if (!slotId || !variantId) continue;
        let entry = variantsBySlot.get(slotId);
        if (!entry) {
          entry = {
            cardLabel: String(block?.cardLabel || 'Card').trim() || 'Card',
            order: [],
            labels: new Map<string, string>(),
          };
          variantsBySlot.set(slotId, entry);
        }
        if (!entry.labels.has(variantId)) {
          entry.order.push(variantId);
          entry.labels.set(variantId, String(block?.variantLabel || block?.promptText || '').trim());
        }
      }
    }

    return activeBlocks
      .map((block: any) => {
        const slotId = String(block?.slotId || '').trim();
        const variantId = String(block?.variantId || '').trim();
        const entry = variantsBySlot.get(slotId);
        if (!entry || !variantId || entry.order.length <= 1) return null;
        const index = Math.max(0, entry.order.indexOf(variantId));
        return {
          slotId,
          label: entry.cardLabel,
          position: index + 1,
          total: entry.order.length,
          sampled: items.length > scannedItems.length,
          title: String(block?.variantLabel || block?.promptText || '').trim(),
        };
      })
      .filter(Boolean)
      .slice(0, QUEUE_MANAGER_GROUP_PROGRESS_CHIP_LIMIT);
  }, [group, getQueuePromptBlocksForItem, setId]);

  if (chips.length <= 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip: any) => (
        <span
          key={`queue-group-progress-${group.requestId}-${chip.slotId}`}
          className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300"
          title={chip.title ? `${chip.label}: ${chip.title}` : `${chip.label} progress`}
        >
          {chip.label} {chip.position}/{chip.total}{chip.sampled ? '+' : ''}
        </span>
      ))}
    </div>
  );
}

export const PowerPrompterQueueManagerView = React.memo(function PowerPrompterQueueManagerView(props: PowerPrompterQueueManagerViewProps) {
  const {
    activeQueuePosition,
    queueRequestGroups,
    queueSetGroups,
    queueTotalPromptCount,
    queueTrackerSummary,
    queueSummaryCounts,
    queueManagerStyleOptions,
    setQueueManagerStyleFilter,
    queueManagerStyleFilter,
    queueStartActionRef,
    queueStartDisabled,
    queueControlBusy,
    queuePauseActionRef,
    queueStackItems,
    hasStagedQueue,
    queuePaused,
    queueCancelActionRef,
    queueDestructiveActionBusy,
    hasCancelableQueueWork,
    hasClearableQueueWork = hasCancelableQueueWork,
    queueClearActionRef,
    queueEmergencyActionRef,
    queueToggleSetExpandedRef,
    queueToggleGroupExpandedRef,
    queueCancelSetGroupRef,
    queueCancelRequestGroupRef,
    openQueueHistoryPanel,
    queueDispatchDelayMs,
    handleQueueDispatchDelayChange,
    setQueuePromptExpandedMode,
    queuePromptExpandedMode,
    queueManagerSearchQuery,
    setQueueManagerSearchQuery,
    savedQueueSnapshotsEnabled = false,
    savedQueues,
    selectedSavedQueueId,
    setSelectedSavedQueueId,
    savedQueueBusy,
    selectedSavedQueue,
    handleSaveCurrentQueueSnapshot,
    handleLoadSavedQueueSnapshot,
    handleDeleteSavedQueueSnapshot,
    refreshSavedQueues,
    queueManagerDragState,
    setQueueManagerDragState,
    clearQueueManagerDragState,
    handleQueueManagerSetDrop,
    expandedQueueSets,
    expandedQueueGroups,
    handleQueueManagerGroupDrop,
    handleQueueManagerSelectedPromptRemove,
    selectedQueuePromptCount,
    selectedQueuePromptKeys,
    generationPreview,
    queueVisualState,
    lockedQueueRequestId,
    lockedQueuePromptIndex,
    getQueuePromptSelectionKey,
    getQueuePromptBlocksForItem,
    handleQueuePromptSelectionClick,
    expandedQueuePromptRows,
    setExpandedQueuePromptRows,
    handleQueueManagerPromptRemove,
    renderPromptBlockList,
    renderHighlightedQueuePromptText,
    handleQueueManagerPromptDrop,
    handleOpenQueueGroupEditor,
    queueManagerSearchKey,
    queueManagerRightPaneRef,
    queueManagerPreviewSplit,
    beginQueueManagerPaneResize,
    hasActiveGenerationPreview,
    generationPreviewStatusLabel,
    generationPreviewStepLabel,
    isLoadingOutputPreview,
    queueManagerMediaItems,
    outputPreviewError,
    queueManagerOutputBuckets,
    handleRefreshQueueManagerOutputs,
    openQueueManagerOutputInViewer,
    openQueueManagerOutputInLibrary,
    pinQueueManagerOutputFolder,
    openQueueManagerOutputInExplorer,
    sendQueueManagerOutputToTrash,
    sendQueueManagerOutputToWorkspace,
    queueOutputMenu,
    setQueueOutputMenu,
    umbraQueueActivities = [],
    completionSoundSettings,
    handleToggleCompletionSound,
    handleSetCompletionSoundStyle,
    handleSetCompletionSoundVolume,
    playCompletionSound,
  } = props;
  const [soundControlsOpen, setSoundControlsOpen] = React.useState(false);
  const soundControlsRef = React.useRef<HTMLDivElement | null>(null);
  const completionSoundEnabled = completionSoundSettings?.generationCompleteSoundEnabled !== false;
  const completionSoundStyle = completionSoundSettings?.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK;
  const completionSoundVolume = clampCompletionSoundVolume(completionSoundSettings?.generationCompleteSoundVolume);
  const activeUmbraActivities = React.useMemo(
    () => (umbraQueueActivities as UmbraQueueActivity[]).filter((activity) => !isUmbraQueueActivityTerminal(activity.status)),
    [umbraQueueActivities],
  );
  const recentUmbraActivities = React.useMemo(
    () => (umbraQueueActivities as UmbraQueueActivity[]).filter((activity) => isUmbraQueueActivityTerminal(activity.status)),
    [umbraQueueActivities],
  );
  const priorityUmbraActivities = React.useMemo(
    () => activeUmbraActivities.filter((activity) => activity.placement === 'next' || activity.placement === 'interrupt'),
    [activeUmbraActivities],
  );
  const parallelUmbraActivities = React.useMemo(
    () => activeUmbraActivities.filter((activity) => activity.placement === 'parallel'),
    [activeUmbraActivities],
  );
  const trailingUmbraActivities = React.useMemo(
    () => activeUmbraActivities.filter((activity) => activity.placement === 'end'),
    [activeUmbraActivities],
  );
  const hasQueueTimelineItems = queueSetGroups.length > 0 || umbraQueueActivities.length > 0;

  React.useEffect(() => {
    if (!soundControlsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!soundControlsRef.current?.contains(event.target as Node)) setSoundControlsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSoundControlsOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [soundControlsOpen]);
  const savedQueueSnapshotsParked = savedQueueSnapshotsEnabled !== true;
  const savedQueueSnapshotsTitle = savedQueueSnapshotsParked
    ? 'Saved queue snapshots are parked while Queue Manager follows the live queue only'
    : '';
  return (
    <div data-umbra-queue-manager="" className="h-full min-h-0 px-3 pb-3">
      <div
        data-umbra-queue-manager-layout=""
        className="grid h-full min-h-0 grid-cols-[minmax(0,1.25fr)_minmax(380px,0.95fr)] gap-3"
      >
        <div
          data-umbra-queue-manager-list=""
          className="min-h-0 rounded-xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 flex flex-col overflow-hidden"
        >
          <div
            data-umbra-queue-manager-header=""
            className="px-4 py-3 border-b border-white/10 flex items-start justify-between gap-3"
          >
            <div data-umbra-queue-manager-summary="" className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-black text-zinc-500">Queue Manager</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {activeQueuePosition
                  ? `Running position ${activeQueuePosition.position} of ${activeQueuePosition.total}`
                  : queueRequestGroups.length > 0
                    ? `${queueRequestGroups.length} queued group${queueRequestGroups.length === 1 ? '' : 's'}`
                    : activeUmbraActivities.length > 0
                      ? `${activeUmbraActivities.length} Umbra UI job${activeUmbraActivities.length === 1 ? '' : 's'} active`
                    : 'Waiting for queue activity'}
              </div>
              <div
                data-umbra-queue-manager-stats=""
                className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400"
              >
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueSetGroups.length} sets</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueRequestGroups.length} groups</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueTotalPromptCount} total</span>
                {umbraQueueActivities.length > 0 ? (
                  <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-violet-100">
                    {activeUmbraActivities.length} Umbra UI active
                  </span>
                ) : null}
                {queueTrackerSummary.totalLabel && (
                  <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">
                    {queueTrackerSummary.totalLabel}
                  </span>
                )}
                {queueTrackerSummary.nextLabel && (
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">
                    {queueTrackerSummary.nextLabel}
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueSummaryCounts.pending} pending</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueSummaryCounts.running} running</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueSummaryCounts.queued} done</span>
                {queueSummaryCounts.failed > 0 && (
                  <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-red-200">{queueSummaryCounts.failed} failed</span>
                )}
              </div>
              {queueManagerStyleOptions.length > 0 && (
                <div data-umbra-queue-manager-style-filters="" className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQueueManagerStyleFilter('')}
                    className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                      !queueManagerStyleFilter
                        ? 'border-emerald-300/45 bg-emerald-500/12 text-emerald-100'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                    }`}
                    title="Show every queued style"
                  >
                    All Styles
                  </button>
                  {queueManagerStyleOptions.map((styleOption) => {
                    const active = queueManagerStyleFilter.toLowerCase() === styleOption.name.toLowerCase();
                    return (
                      <button
                        key={`queue-style-filter-${styleOption.name}`}
                        type="button"
                        onClick={() => setQueueManagerStyleFilter(active ? '' : styleOption.name)}
                        className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                          active
                            ? 'border-amber-300/55 bg-amber-500/14 text-amber-100'
                            : 'border-amber-400/20 bg-amber-500/8 text-amber-200/85 hover:border-amber-300/45 hover:text-amber-100'
                        }`}
                        title={`${styleOption.count} queued prompt${styleOption.count === 1 ? '' : 's'} for ${styleOption.name}`}
                      >
                        {styleOption.name} · {styleOption.count}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div data-umbra-queue-manager-controls="" className="flex shrink-0 flex-col items-end gap-2">
              <div data-umbra-queue-manager-control-row="" className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setQueuePromptExpandedMode((prev) => !prev)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    queuePromptExpandedMode
                      ? 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100'
                      : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/25 hover:text-zinc-100'
                  }`}
                  title={queuePromptExpandedMode ? 'Use compact single-line prompt rows' : 'Expand queued prompts into card/variant segments'}
                >
                  <ListChecks size={12} />
                  {queuePromptExpandedMode ? 'Expanded' : 'Compact'}
                </button>
                <div ref={soundControlsRef} className="relative">
                  <button
                    type="button"
                    data-umbra-queue-alert-controls=""
                    onClick={() => setSoundControlsOpen((current) => !current)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      completionSoundEnabled
                        ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                        : 'border-white/10 bg-black/25 text-zinc-500 hover:border-white/25 hover:text-zinc-200'
                    }`}
                    title="Configure submitted and completed job alerts"
                    aria-expanded={soundControlsOpen}
                  >
                    {completionSoundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    Alerts
                  </button>
                  {soundControlsOpen ? (
                    <div
                      data-umbra-queue-alert-popover=""
                      className="absolute right-0 top-9 z-40 w-[270px] rounded-lg border border-white/15 bg-[#090a0d]/98 p-3 text-left shadow-2xl shadow-black/70 backdrop-blur-xl"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Bell size={12} className="text-emerald-300" />
                        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-300">Queue Alerts</span>
                        <button
                          type="button"
                          onClick={() => { void handleToggleCompletionSound?.(); }}
                          className={`ml-auto inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[8px] font-black uppercase tracking-[0.1em] ${
                            completionSoundEnabled
                              ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100'
                              : 'border-white/10 bg-black/20 text-zinc-500'
                          }`}
                        >
                          {completionSoundEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
                          {completionSoundEnabled ? 'On' : 'Off'}
                        </button>
                      </div>
                      <div className="mb-2 text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-600">
                        Job submitted and prompt completed
                      </div>
                      <label className="block space-y-1.5">
                        <span className="text-[8px] font-black uppercase tracking-[0.14em] text-zinc-500">Sound</span>
                        <UmbraSelectControl
                          value={completionSoundStyle}
                          onChange={(event) => { void handleSetCompletionSoundStyle?.(event.currentTarget.value); }}
                          className="h-8 w-full rounded-md border border-white/10 bg-black/40 px-2 text-[10px] font-bold text-zinc-100 outline-none focus:border-emerald-300/45 umbra-themed-select"
                          title="Choose the queue alert sound"
                        >
                          {POWER_PROMPTER_SOUND_STYLE_OPTIONS.map((option) => (
                            <option key={`queue-alert-style-${option.id}`} value={option.id}>{option.label}</option>
                          ))}
                        </UmbraSelectControl>
                      </label>
                      <label className="mt-3 block space-y-1.5">
                        <span className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          <span>Volume</span>
                          <span className="font-mono text-emerald-200">
                            {Math.round((completionSoundVolume / Math.max(0.001, POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME)) * 100)}%
                          </span>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME}
                          step={0.01}
                          value={completionSoundVolume}
                          onChange={(event) => { void handleSetCompletionSoundVolume?.(Number(event.currentTarget.value)); }}
                          className="w-full accent-emerald-300"
                          aria-label="Queue alert volume"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => playCompletionSound?.()}
                        disabled={!completionSoundEnabled || completionSoundVolume <= 0}
                        className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] text-[8px] font-black uppercase tracking-[0.14em] text-zinc-300 hover:border-emerald-300/30 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Volume2 size={10} /> Test Alert
                      </button>
                    </div>
                  ) : null}
                </div>
                <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span className="whitespace-nowrap">Delay</span>
                  <UmbraSelectControl
                    value={queueDispatchDelayMs}
                    onChange={(event) => handleQueueDispatchDelayChange(Number(event.currentTarget.value) || 0)}
                    className="h-5 min-w-[82px] rounded border border-white/10 bg-black/40 px-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-100 outline-none transition-colors focus:border-cyan-300/50 umbra-themed-select"
                    title="Set delay before the next prompt is sent to ComfyUI"
                  >
                    {QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS.map((option) => (
                      <option
                        key={`queue-header-delay-${option.value}`}
                        value={option.value}
                        style={{ color: '#e4e4e7', backgroundColor: '#0a0a0e' }}
                      >
                        {option.label}
                      </option>
                    ))}
                  </UmbraSelectControl>
                </label>
              </div>
              <div data-umbra-queue-manager-control-note="" className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                Applies before the next dispatch
              </div>
            </div>
            <div className="hidden">
              <button
                onClick={() => { void queueStartActionRef.current?.(); }}
                disabled={queueStartDisabled}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  queueStartDisabled
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                }`}
                title="Start sending staged queue prompts to ComfyUI"
              >
                {queueControlBusy === 'start' ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                Start Queue
              </button>
              <button
                onClick={() => { void queuePauseActionRef.current?.(); }}
                disabled={!!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  !!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : queuePaused
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                      : 'border-sky-400/35 bg-sky-500/10 text-sky-200 hover:border-sky-300/55'
                }`}
                title={hasStagedQueue ? 'Use Start Queue to begin dispatching staged prompts' : queuePaused ? 'Resume queued prompt submissions' : 'Pause after the current prompt finishes'}
              >
                {queuePaused ? <Play size={11} /> : <Pause size={11} />}
                {queuePaused ? 'Resume Queue' : 'Pause Queue'}
              </button>
              <button
                onClick={() => { void queueCancelActionRef.current?.(); }}
                disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  queueDestructiveActionBusy || !hasCancelableQueueWork
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-amber-400/35 bg-amber-500/10 text-amber-200 hover:border-amber-300/55'
                }`}
                title="Cancel the currently running ComfyUI job"
              >
                {queueControlBusy === 'cancel' ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                Cancel Job
              </button>
              <button
                onClick={() => { void queueClearActionRef.current?.(); }}
                disabled={queueDestructiveActionBusy || !hasClearableQueueWork}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  queueDestructiveActionBusy || !hasClearableQueueWork
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                }`}
                title="Clear pending prompts in ComfyUI queue"
              >
                {queueControlBusy === 'clear' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Clear Queue
              </button>
              <button
                onClick={() => { void queueEmergencyActionRef.current?.(); }}
                disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  queueDestructiveActionBusy || !hasCancelableQueueWork
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-rose-400/35 bg-rose-500/10 text-rose-200 hover:border-rose-300/55'
                }`}
                title="Hard-stop ComfyUI and restart it immediately"
              >
                {queueControlBusy === 'emergency' ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
                Emergency Shutdown
              </button>
              <button
                onClick={openQueueHistoryPanel}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100 transition-colors hover:border-cyan-300/55"
                title="Open queue history. Replay and remix are parked while Queue Manager follows the live queue only."
              >
                <ListOrdered size={11} />
                Queue History
              </button>
            </div>
          </div>
          <div className="hidden">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Dispatch Delay</span>
              {QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS.map((option) => {
                const active = queueDispatchDelayMs === option.value;
                return (
                  <button
                    key={`queue-delay-${option.value}`}
                    type="button"
                    onClick={() => handleQueueDispatchDelayChange(option.value)}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      active
                        ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                    }`}
                    title={`Set delay before the next prompt is sent to ComfyUI: ${option.label}`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">
                Applied live to the next prompt dispatch
              </span>
              <button
                type="button"
                onClick={() => setQueuePromptExpandedMode((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  queuePromptExpandedMode
                    ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                    : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                }`}
                title={queuePromptExpandedMode ? 'Use compact single-line prompt rows' : 'Expand queued prompts into card/variant segments'}
              >
                <ListChecks size={11} />
                {queuePromptExpandedMode ? 'Expanded Prompts' : 'Compact Prompts'}
              </button>
              <label className="relative ml-auto min-w-[240px] max-w-[360px] flex-1">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  value={queueManagerSearchQuery}
                  onChange={(event) => setQueueManagerSearchQuery(String(event.currentTarget.value || ''))}
                  placeholder="Highlight queued prompts..."
                  className="h-7 w-full rounded-md border border-white/10 bg-black/30 pl-7 pr-8 text-[11px] font-semibold text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/50"
                  title="Search inside Queue Manager prompts without changing Editor search"
                />
                {queueManagerSearchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setQueueManagerSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                    title="Clear Queue Manager search"
                  >
                    <XCircle size={11} />
                  </button>
                )}
              </label>
            </div>
          </div>
          <div className="hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Saved Queues</span>
              <div className="relative min-w-[260px] flex-1">
                <UmbraSelectControl
                  value={selectedSavedQueueId}
                  onChange={(event) => setSelectedSavedQueueId(String(event.currentTarget.value || '').trim())}
                  disabled={savedQueueSnapshotsParked || savedQueueBusy === 'list' || savedQueues.length <= 0}
                  className={`h-8 w-full appearance-none rounded-md border bg-black/35 px-2.5 pr-7 text-[11px] font-semibold outline-none transition-colors umbra-themed-select ${
                    savedQueueSnapshotsParked || savedQueueBusy === 'list' || savedQueues.length <= 0
                      ? 'border-white/10 text-zinc-600 cursor-not-allowed'
                      : 'border-white/15 text-zinc-200 hover:border-white/30 focus:border-emerald-400/55'
                  }`}
                  title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Choose a saved queue to load into Queue Manager'}
                >
                  {savedQueues.length <= 0 ? (
                    <option value="" style={{ color: '#71717a', backgroundColor: '#0a0a0e' }}>
                      No saved queues
                    </option>
                  ) : savedQueues.map((queue) => (
                    <option
                      key={`saved-queue-${queue.id}`}
                      value={queue.id}
                      style={{ color: '#d4d4d8', backgroundColor: '#0a0a0e' }}
                    >
                      {`${queue.name} · ${queue.promptCount} prompts · Set ${queue.activeSetId}`}
                    </option>
                  ))}
                </UmbraSelectControl>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
              {selectedSavedQueue && (
                <span className="max-w-[220px] truncate rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  {new Date(selectedSavedQueue.savedAt || 0).toLocaleString()}
                </span>
              )}
              <button
                type="button"
                onClick={() => { void handleSaveCurrentQueueSnapshot(); }}
                disabled={savedQueueSnapshotsParked || !!savedQueueBusy || !hasCancelableQueueWork}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  savedQueueSnapshotsParked || !!savedQueueBusy || !hasCancelableQueueWork
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                }`}
                title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Save the active and pending queue prompts as a named queue file'}
              >
                {savedQueueBusy === 'save' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => { void handleLoadSavedQueueSnapshot(); }}
                disabled={savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/55'
                }`}
                title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Load the selected saved queue as a paused queue'}
              >
                {savedQueueBusy === 'load' ? <Loader2 size={11} className="animate-spin" /> : <FolderOpen size={11} />}
                Load
              </button>
              <button
                type="button"
                onClick={() => { void handleDeleteSavedQueueSnapshot(); }}
                disabled={savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-red-400/30 bg-red-500/8 text-red-200 hover:border-red-300/50'
                }`}
                title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Delete the selected saved queue file'}
              >
                {savedQueueBusy === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Delete
              </button>
              <button
                type="button"
                onClick={() => { void refreshSavedQueues(); }}
                disabled={savedQueueSnapshotsParked || !!savedQueueBusy}
                className={`inline-flex h-8 items-center justify-center rounded-md border px-2 transition-colors ${
                  savedQueueSnapshotsParked || !!savedQueueBusy
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-white/12 bg-white/[0.04] text-zinc-400 hover:border-white/25 hover:text-zinc-100'
                }`}
                title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Refresh saved queue files'}
              >
                <RefreshCw size={11} className={savedQueueBusy === 'list' ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {activeQueuePosition && (
            <div className="px-4 py-2 border-b border-white/10 bg-black/15">
              <div className="h-2 overflow-hidden rounded-full border border-white/8 bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400/85 via-sky-400/85 to-emerald-400/85 transition-all duration-300"
                  style={{ width: `${Math.max(6, Math.min(100, (activeQueuePosition.position / Math.max(1, activeQueuePosition.total)) * 100))}%` }}
                />
              </div>
            </div>
          )}
          <div
            data-umbra-queue-manager-scroll=""
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3"
          >
            {!hasQueueTimelineItems ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-6 text-center">
                <ListChecks size={26} className="text-zinc-500" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">Queue Idle</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    Stage a queue from the Editor panel to show the live backend queue here.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <UmbraQueueActivityLane
                  title={queueSetGroups.length > 0 ? 'Umbra UI Cut-In' : 'Umbra UI Jobs'}
                  note={queueSetGroups.length > 0
                    ? 'Runs ahead of the remaining Power Prompter work. Display only; queue editing stays isolated.'
                    : 'Live Umbra UI work. Display only; its original controls remain authoritative.'}
                  activities={priorityUmbraActivities}
                />
                <UmbraQueueActivityLane
                  title="Parallel Extras"
                  note="Runs independently while the generation queue continues."
                  activities={parallelUmbraActivities}
                />
                {queueSetGroups.map((setGroup) => {
                  const setKey = String(setGroup.id || setGroup.setId);
                  const setExpansionKey = String(setGroup.setId);
                  const setExpanded = expandedQueueSets[setExpansionKey] ?? expandedQueueSets[setKey] ?? false;
                  const setCanCancel = setGroup.pending > 0 || setGroup.running > 0 || (setGroup.completed + setGroup.failed < setGroup.total);
                  const setLocked = lockedQueueRequestId.length > 0
                    && setGroup.groups.some((group) => group.requestId === lockedQueueRequestId);
                  const setProgressPercent = Math.max(0, Math.min(100, setGroup.progressRatio * 100));
                  const setProgressWidth = `${setProgressPercent > 0 ? Math.max(4, setProgressPercent) : 0}%`;
                  const queueManagerSearchKey = String(queueManagerSearchQuery || '').trim().toLowerCase();
                  const setSearchMatchCount = queueManagerSearchKey
                    ? setGroup.groups.reduce((count, group) => (
                      count + group.items.filter((item) => String(item.prompt || '').toLowerCase().includes(queueManagerSearchKey)).length
                    ), 0)
                    : 0;
                  const activeGroupIdx = setGroup.groups.findIndex((candidate) => candidate.running > 0 || candidate.pending > 0);
                  const setGroupPosition = setGroup.groups.length <= 0
                    ? 0
                    : activeGroupIdx >= 0
                      ? activeGroupIdx + 1
                      : setGroup.statusLabel === 'Done'
                        ? setGroup.groups.length
                      : 1;
                  const setColor = getSetColor(setGroup.setId);
                  const setCardStyle = {
                    borderColor: queueManagerDragState?.kind === 'set' && queueManagerDragState?.setGroupId === setKey
                      ? hexToRgba(setColor, 0.75)
                      : hexToRgba(setColor, 0.28),
                    background: `linear-gradient(180deg, ${hexToRgba(setColor, setLocked ? 0.16 : 0.1)}, rgba(0,0,0,0.22))`,
                    boxShadow: setLocked
                      ? `0 0 0 1px ${hexToRgba(setColor, 0.16)}, 0 0 22px ${hexToRgba(setColor, 0.12)}`
                      : `inset 0 1px 0 ${hexToRgba(setColor, 0.1)}`,
                  };
                  return (
                    <div
                      key={`queue-manager-set-${setKey}`}
                      data-umbra-queue-set=""
                      className={`rounded-xl border bg-black/20 overflow-hidden transition-colors ${
                        queueManagerDragState?.kind === 'set' && queueManagerDragState?.setGroupId === setKey
                          ? 'border-cyan-300/45'
                          : 'border-white/12'
                      }`}
                      style={setCardStyle}
                      onDragOver={(event) => {
                        if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                        if (queueManagerDragState?.kind !== 'set' || setLocked) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                        if (queueManagerDragState?.kind !== 'set' || setLocked || queueManagerDragState.setGroupId === setKey) return;
                        event.preventDefault();
                        handleQueueManagerSetDrop(String(queueManagerDragState.setGroupId || ''), setKey);
                        clearQueueManagerDragState();
                      }}
                    >
                      <div
                        data-umbra-queue-set-header=""
                        className="px-3 py-2.5 border-b border-white/10"
                        style={{
                          borderBottomColor: hexToRgba(setColor, 0.18),
                          background: `linear-gradient(90deg, ${hexToRgba(setColor, 0.13)}, rgba(0,0,0,0.08))`,
                        }}
                      >
                        <div data-umbra-queue-set-header-row="" className="flex items-center gap-2">
                          <button
                            type="button"
                            data-umbra-queue-drag-handle=""
                            draggable={QUEUE_MANAGER_REORDER_ENABLED && !setLocked}
                            onDragStart={() => {
                              if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                              setQueueManagerDragState({ kind: 'set', setGroupId: setKey, setId: setGroup.setId });
                            }}
                            onDragEnd={QUEUE_MANAGER_REORDER_ENABLED ? clearQueueManagerDragState : undefined}
                            disabled={setLocked || !QUEUE_MANAGER_REORDER_ENABLED}
                            className={`inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${
                              setLocked || !QUEUE_MANAGER_REORDER_ENABLED
                                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200 cursor-grab active:cursor-grabbing'
                            }`}
                            title={!QUEUE_MANAGER_REORDER_ENABLED ? 'Queue reordering is parked while the manager uses backend order only' : setLocked ? 'Active set is locked while a prompt is running' : 'Drag to reorder sets'}
                          >
                            <GripVertical size={12} />
                          </button>
                          <button
                            data-umbra-queue-set-toggle=""
                            onClick={() => queueToggleSetExpandedRef.current?.(setExpansionKey)}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 hover:border-cyan-300/55"
                            style={{
                              borderColor: hexToRgba(setColor, 0.45),
                              background: hexToRgba(setColor, 0.16),
                              color: setColor,
                            }}
                            title={setExpanded ? 'Collapse set' : 'Expand set'}
                          >
                            {setExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Set {setGroup.setId}
                          </button>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                            {setGroup.position}/{setGroup.total}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            {setGroup.statusLabel}
                          </span>
                          {setLocked && (
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                              Active Lock
                            </span>
                          )}
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Set {setGroup.setId} Group {setGroupPosition}/{setGroup.groups.length}
                          </span>
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">
                            {setGroup.groups.length} group{setGroup.groups.length === 1 ? '' : 's'}
                          </span>
                          {setSearchMatchCount > 0 && (
                            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100">
                              {setSearchMatchCount} match{setSearchMatchCount === 1 ? '' : 'es'}
                            </span>
                          )}
                          <button
                            data-umbra-queue-set-clear=""
                            onClick={() => { void queueCancelSetGroupRef.current?.(setGroup.setId); }}
                            disabled={queueDestructiveActionBusy || !setCanCancel}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              queueDestructiveActionBusy || !setCanCancel
                                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                            }`}
                            title="Cancel every active group in this set"
                          >
                            {queueControlBusy === 'cancel' ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                            Clear Set
                          </button>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/8 bg-black/20">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: setProgressWidth,
                              background: `linear-gradient(90deg, ${hexToRgba(setColor, 0.95)}, ${hexToRgba(setColor, 0.58)})`,
                              boxShadow: `0 0 14px ${hexToRgba(setColor, 0.28)}`,
                            }}
                          />
                        </div>
                      </div>
                      {setExpanded && (
                        <div data-umbra-queue-set-groups="" className="p-3 pt-2">
                          <div data-umbra-queue-set-group-list="" className="ml-2 flex flex-col gap-2 border-l border-white/10 pl-3">
                            {setGroup.groups.map((group) => {
                              const groupExpanded = expandedQueueGroups[group.requestId] ?? false;
                              const groupCanCancel = group.pending > 0 || group.running > 0 || (group.completed + group.failed < group.total);
                              const groupLocked = group.requestId === lockedQueueRequestId;
                              const groupProgressPercent = Math.max(0, Math.min(100, group.progressRatio * 100));
                              const groupProgressWidth = `${groupProgressPercent > 0 ? Math.max(4, groupProgressPercent) : 0}%`;
                              const groupEtaLabel = group.estimatedMsRemaining !== null
                                ? formatQueueEtaDuration(group.estimatedMsRemaining)
                                : '';
                              const activeStyleFilter = String(queueManagerStyleFilter || '').trim().toLowerCase();
                              const filteredGroupItems = activeStyleFilter
                                ? group.items.filter((item) => String(item.styleName || item.styleFolderName || '').trim().toLowerCase() === activeStyleFilter)
                                : group.items;
                              const visibleGroupItems = filteredGroupItems;
                              const liveGroupPromptPositionByKey = new Map<string, number>();
                              if (groupExpanded) {
                                let liveGroupPosition = 0;
                                for (const entry of group.items) {
                                  if (entry.exiting) continue;
                                  liveGroupPosition += 1;
                                  liveGroupPromptPositionByKey.set(`${entry.requestId}:${entry.promptIndex}`, liveGroupPosition);
                                }
                              }
                              const groupSearchMatchCount = queueManagerSearchKey
                                ? group.items.filter((item) => String(item.prompt || '').toLowerCase().includes(queueManagerSearchKey)).length
                                : 0;
                              const selectedGroupPromptCount = selectedQueuePromptCount > 0
                                ? group.items.filter((item) =>
                                  selectedQueuePromptKeys[getQueuePromptSelectionKey(group.requestId, item.promptIndex)] === true
                                ).length
                                : 0;
                              return (
                                <div
                                  key={`queue-manager-group-${group.requestId}`}
                                  data-umbra-queue-group=""
                                  className={`rounded-lg border bg-white/[0.04] overflow-hidden transition-colors ${
                                    queueManagerDragState?.kind === 'group' && queueManagerDragState?.requestId === group.requestId
                                      ? 'border-cyan-300/45'
                                      : 'border-white/10'
                                  }`}
                                  style={{
                                    borderColor: queueManagerDragState?.kind === 'group' && queueManagerDragState?.requestId === group.requestId
                                      ? hexToRgba(setColor, 0.62)
                                      : hexToRgba(setColor, 0.16),
                                    background: `linear-gradient(180deg, ${hexToRgba(setColor, 0.06)}, rgba(255,255,255,0.035))`,
                                  }}
                                  onDragOver={(event) => {
                                    if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                    if (queueManagerDragState?.kind !== 'group' || groupLocked || queueManagerDragState.setGroupId !== setKey) return;
                                    event.preventDefault();
                                  }}
                                  onDrop={(event) => {
                                    if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                    if (queueManagerDragState?.kind !== 'group' || groupLocked || queueManagerDragState.setGroupId !== setKey || queueManagerDragState.requestId === group.requestId) return;
                                    event.preventDefault();
                                    handleQueueManagerGroupDrop(setKey, String(queueManagerDragState.requestId || ''), group.requestId);
                                    clearQueueManagerDragState();
                                  }}
                                >
                                  <div data-umbra-queue-group-header="" className="px-3 py-2 border-b border-white/10">
                                    <div data-umbra-queue-group-header-row="" className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        data-umbra-queue-drag-handle=""
                                        draggable={QUEUE_MANAGER_REORDER_ENABLED && !groupLocked}
                                        onDragStart={() => {
                                          if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                          setQueueManagerDragState({ kind: 'group', setGroupId: setKey, setId: setGroup.setId, requestId: group.requestId });
                                        }}
                                        onDragEnd={QUEUE_MANAGER_REORDER_ENABLED ? clearQueueManagerDragState : undefined}
                                        disabled={groupLocked || !QUEUE_MANAGER_REORDER_ENABLED}
                                        className={`inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${
                                          groupLocked || !QUEUE_MANAGER_REORDER_ENABLED
                                            ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                            : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200 cursor-grab active:cursor-grabbing'
                                        }`}
                                        title={!QUEUE_MANAGER_REORDER_ENABLED ? 'Queue reordering is parked while the manager uses backend order only' : groupLocked ? 'Active group is locked while a prompt is running' : 'Drag to reorder groups within this set'}
                                      >
                                        <GripVertical size={11} />
                                      </button>
                                      <button
                                        data-umbra-queue-group-toggle=""
                                        onClick={() => queueToggleGroupExpandedRef.current?.(group.requestId)}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:border-white/20"
                                        title={groupExpanded ? 'Collapse group' : 'Expand group'}
                                      >
                                        {groupExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                        Group
                                      </button>
                                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                                        {group.position}/{group.total}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                        {group.statusLabel}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                        {group.mode}
                                      </span>
                                      {groupEtaLabel && group.statusLabel !== 'Done' && (
                                        <span
                                          className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100"
                                          title={`Estimated time remaining for this group, based on final media completions: ${formatQueueEtaDuration(group.firstPromptMs)} per item plus dispatch delay`}
                                        >
                                          ETA {groupEtaLabel}
                                        </span>
                                      )}
                                      {groupLocked && (
                                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                                          Active Lock
                                        </span>
                                      )}
                                      {groupSearchMatchCount > 0 && (
                                        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100">
                                          {groupSearchMatchCount} match{groupSearchMatchCount === 1 ? '' : 'es'}
                                        </span>
                                      )}
                                      <span data-umbra-queue-group-count="" className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500">
                                        {queueManagerStyleFilter
                                          ? `${filteredGroupItems.length}/${group.items.length} generation${group.items.length === 1 ? '' : 's'}`
                                          : `${group.items.length} generation${group.items.length === 1 ? '' : 's'}`}
                                      </span>
                                      {selectedGroupPromptCount > 0 && (
                                        <button
                                          type="button"
                                          data-umbra-queue-group-clear-selected=""
                                          onClick={() => handleQueueManagerSelectedPromptRemove(group.requestId)}
                                          disabled={!!queueControlBusy}
                                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                            queueControlBusy
                                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                              : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                                          }`}
                                          title="Remove selected pending prompts in this group"
                                        >
                                          <Trash2 size={11} />
                                          Clear Selected ({selectedGroupPromptCount})
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        data-umbra-queue-group-edit=""
                                        onClick={() => handleOpenQueueGroupEditor(group)}
                                        disabled={!!queueControlBusy || !QUEUE_MANAGER_EDITOR_ENABLED}
                                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                          !!queueControlBusy || !QUEUE_MANAGER_EDITOR_ENABLED
                                            ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                            : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/55'
                                        }`}
                                        title={QUEUE_MANAGER_EDITOR_ENABLED ? 'Pause and edit this queued group card setup' : 'Queue group editing is parked while the manager uses the live queue only'}
                                      >
                                        <Pencil size={11} />
                                        Edit
                                      </button>
                                      <button
                                        data-umbra-queue-group-clear=""
                                        onClick={() => { void queueCancelRequestGroupRef.current?.(group.requestId); }}
                                        disabled={queueDestructiveActionBusy || !groupCanCancel}
                                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                          queueDestructiveActionBusy || !groupCanCancel
                                            ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                            : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                                        }`}
                                        title="Cancel this queued group"
                                      >
                                        {queueControlBusy === 'cancel' ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                                        Clear Group
                                      </button>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/8 bg-black/20">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{
                                          width: groupProgressWidth,
                                          background: `linear-gradient(90deg, ${hexToRgba(setColor, 0.82)}, ${hexToRgba(setColor, 0.48)})`,
                                        }}
                                      />
                                    </div>
                                    <QueueManagerGroupVariantProgress
                                      group={group}
                                      setId={group.setId}
                                      getQueuePromptBlocksForItem={getQueuePromptBlocksForItem}
                                    />
                                  </div>
                                  {groupExpanded && (
                                    <QueueManagerPromptRows
                                      items={visibleGroupItems}
                                      layoutKey={[
                                        queuePromptExpandedMode ? 'expanded' : 'compact',
                                        queueManagerStyleFilter,
                                        visibleGroupItems.length,
                                        visibleGroupItems[0]?.id || '',
                                        visibleGroupItems[visibleGroupItems.length - 1]?.id || '',
                                        queuePromptExpandedMode
                                          ? 'all'
                                          : visibleGroupItems
                                            .filter((entry) => expandedQueuePromptRows[String(entry.id || '').trim()] === true)
                                            .map((entry) => String(entry.id || '').trim())
                                            .join(','),
                                      ].join('|')}
                                      emptyContent={filteredGroupItems.length <= 0 ? (
                                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                          No prompts for {queueManagerStyleFilter} in this group
                                        </div>
                                      ) : null}
                                      renderItem={(item) => {
                                        const itemPreviewUrl = String(generationPreview?.imageDataUrl || '').trim()
                                          && generationPreview?.requestId === item.requestId
                                          && generationPreview?.promptIndex === item.promptIndex
                                          ? String(generationPreview.imageDataUrl || '')
                                          : '';
                                        const itemLocked = item.requestId === lockedQueueRequestId && item.promptIndex === lockedQueuePromptIndex;
                                        const itemRemovable = item.status === 'pending' && !itemLocked;
                                        const compactItemPosition = liveGroupPromptPositionByKey.get(`${item.requestId}:${item.promptIndex}`) || 0;
                                        const itemQueuePosition = compactItemPosition > 0
                                          ? compactItemPosition
                                          : Math.max(1, Math.min(group.total, item.promptIndex + 1));
                                        const itemSelectionKey = getQueuePromptSelectionKey(group.requestId, item.promptIndex);
                                        const itemExpansionKey = String(item.id || '').trim() || itemSelectionKey;
                                        const itemSelected = selectedQueuePromptKeys[itemSelectionKey] === true;
                                        const itemExpanded = queuePromptExpandedMode || expandedQueuePromptRows[itemExpansionKey] === true;
                                        const itemPromptBlocks = itemExpanded ? getQueuePromptBlocksForItem(item, group.setId) : [];
                                        const itemSearchMatches = queueManagerSearchKey.length > 0
                                          && String(item.prompt || '').toLowerCase().includes(queueManagerSearchKey);
                                        return (
                                          <div
                                            key={item.id}
                                            data-umbra-queue-prompt-row=""
                                            onDragOver={(event) => {
                                              if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                              if (queueManagerDragState?.kind !== 'prompt' || itemLocked || queueManagerDragState.requestId !== group.requestId) return;
                                              event.preventDefault();
                                            }}
                                            onDrop={(event) => {
                                              if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                              if (queueManagerDragState?.kind !== 'prompt' || itemLocked || queueManagerDragState.requestId !== group.requestId || queueManagerDragState.promptIndex === item.promptIndex) return;
                                              event.preventDefault();
                                              handleQueueManagerPromptDrop(group.requestId, Number(queueManagerDragState.promptIndex), item.promptIndex);
                                              clearQueueManagerDragState();
                                            }}
                                            className={`border rounded-xl px-3 py-2 text-xs transition-colors duration-150 ${
                                              item.status === 'failed'
                                                ? 'border-red-500/40 bg-red-500/10 text-red-200'
                                                : item.status === 'running'
                                                  ? 'border-amber-500/45 bg-amber-500/12 text-amber-200'
                                                  : item.status === 'queued'
                                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                                    : 'border-white/10 bg-white/5 text-zinc-300'
                                            } ${queueManagerDragState?.kind === 'prompt' && queueManagerDragState?.requestId === group.requestId && queueManagerDragState?.promptIndex === item.promptIndex ? 'border-cyan-300/45' : ''} ${
                                              itemSelected ? 'ring-1 ring-cyan-300/35 shadow-[0_0_18px_rgba(34,211,238,0.08)]' : ''
                                            } ${
                                              itemSearchMatches ? 'ring-1 ring-cyan-300/45 shadow-[0_0_20px_rgba(34,211,238,0.10)]' : ''
                                            } ${
                                              itemLocked ? 'cursor-not-allowed' : 'cursor-default'
                                            } ${item.exiting ? 'opacity-0 max-h-0 overflow-hidden py-0' : `opacity-100 ${itemExpanded ? 'max-h-none overflow-visible' : 'max-h-[220px]'}`}`}
                                          >
                                            <div className="flex items-start gap-3">
                                              <button
                                                type="button"
                                                data-umbra-queue-prompt-select=""
                                                onClick={(event) => handleQueuePromptSelectionClick(event, group, item)}
                                                disabled={!itemRemovable}
                                                className={`inline-flex h-12 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                                  itemSelected
                                                    ? 'border-cyan-300/55 bg-cyan-500/16 text-cyan-100'
                                                    : itemRemovable
                                                      ? 'border-white/10 bg-black/20 text-zinc-500 hover:border-cyan-300/45 hover:text-cyan-100'
                                                      : 'border-white/10 bg-white/[0.03] text-zinc-700 cursor-not-allowed'
                                                }`}
                                                title={itemRemovable ? 'Select prompt. Shift-click selects a range; Ctrl-click toggles.' : 'Only pending prompts can be selected for removal'}
                                              >
                                                {itemSelected ? <CheckCircle2 size={11} /> : <span className="h-2.5 w-2.5 rounded-[3px] border border-current/70" />}
                                              </button>
                                              <span
                                                data-umbra-queue-drag-handle=""
                                                draggable={QUEUE_MANAGER_REORDER_ENABLED && !itemLocked}
                                                onDragStart={() => {
                                                  if (!QUEUE_MANAGER_REORDER_ENABLED) return;
                                                  setQueueManagerDragState({ kind: 'prompt', requestId: group.requestId, promptIndex: item.promptIndex });
                                                }}
                                                onDragEnd={QUEUE_MANAGER_REORDER_ENABLED ? clearQueueManagerDragState : undefined}
                                                className={`inline-flex h-12 w-5 shrink-0 items-center justify-center rounded-md border ${
                                                itemLocked || !QUEUE_MANAGER_REORDER_ENABLED
                                                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                                    : 'border-white/10 bg-black/20 text-current/70 cursor-grab active:cursor-grabbing'
                                                }`}
                                                title={!QUEUE_MANAGER_REORDER_ENABLED ? 'Queue reordering is parked while the manager uses backend order only' : itemLocked ? 'Active prompt cannot be reordered' : 'Drag to reorder this prompt'}
                                              >
                                                <GripVertical size={11} />
                                              </span>
                                              {itemPreviewUrl ? (
                                                <img
                                                  data-umbra-nsfw-media={classifyUmbraPrompt(item.prompt) === 'nsfw' ? '' : undefined}
                                                  src={itemPreviewUrl}
                                                  alt="Live queue item preview"
                                                  className="umbra-power-prompter-generation-preview h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover"
                                                  loading="eager"
                                                />
                                              ) : (
                                                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-current/75">
                                                  {item.status === 'failed'
                                                    ? <XCircle size={14} />
                                                    : item.status === 'queued'
                                                      ? <CheckCircle2 size={14} />
                                                      : item.status === 'running'
                                                        ? <Loader2 size={13} className="animate-spin" />
                                                        : <Play size={13} />}
                                                </span>
                                              )}
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                                                    {item.status === 'failed'
                                                      ? 'Failed'
                                                      : item.status === 'queued'
                                                        ? 'Queued'
                                                        : item.status === 'running'
                                                          ? (queuePaused ? 'Pausing' : 'Running')
                                                          : (queuePaused ? 'Paused' : 'Waiting')}
                                                  </span>
                                                  <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-current/80">
                                                    {itemQueuePosition}/{group.total}
                                                  </span>
                                                  {String(item.styleName || item.styleFolderName || '').trim() && (
                                                    <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-100">
                                                      {String(item.styleName || item.styleFolderName || '').trim()}
                                                    </span>
                                                  )}
                                                  {itemLocked && (
                                                    <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                                                      Active Lock
                                                    </span>
                                                  )}
                                                  {itemSearchMatches && (
                                                    <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-100">
                                                      Search Match
                                                    </span>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={(event) => {
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      setExpandedQueuePromptRows((prev) => ({
                                                        ...prev,
                                                        [itemExpansionKey]: !(prev[itemExpansionKey] === true),
                                                      }));
                                                    }}
                                                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                                      itemExpanded
                                                        ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                                                        : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                                                    }`}
                                                    title={itemExpanded ? 'Collapse this prompt row' : 'Expand this prompt into card/variant segments'}
                                                  >
                                                    {itemExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                                    Prompt
                                                  </button>
                                                  {itemRemovable && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleQueueManagerPromptRemove(group.requestId, item.promptIndex)}
                                                      disabled={!!queueControlBusy}
                                                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                                        queueControlBusy
                                                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                                          : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                                                      }`}
                                                      title="Remove this queued prompt"
                                                    >
                                                      <Trash2 size={10} />
                                                      Delete
                                                    </button>
                                                  )}
                                                </div>
                                                {itemExpanded ? (
                                                  <div
                                                    data-umbra-queue-expanded-prompt=""
                                                    className="mt-2 min-w-0 max-w-full overflow-visible rounded-md border border-cyan-400/10 bg-black/25 px-2.5 py-2 break-words"
                                                  >
                                                    {renderPromptBlockList(itemPromptBlocks, item.prompt)}
                                                  </div>
                                                ) : (
                                                  <div
                                                    className="mt-1 min-w-0 max-w-full truncate rounded-md border border-white/5 bg-black/25 px-2 py-1 font-mono text-[11px] leading-relaxed text-current/90"
                                                    title={String(item.prompt || '')}
                                                  >
                                                      {renderHighlightedQueuePromptText(item.prompt, queueManagerSearchQuery)}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <UmbraQueueActivityLane
                  title="After Power Prompter"
                  note="Waiting behind the remaining Power Prompter queue."
                  activities={trailingUmbraActivities}
                />
                <UmbraQueueActivityLane
                  title="Recent Umbra UI"
                  note="Latest completed or failed jobs, kept read-only for quick confirmation."
                  activities={recentUmbraActivities}
                />
              </div>
            )}
          </div>
        </div>
        <PowerPrompterQueueManagerSidePane
          queueManagerRightPaneRef={queueManagerRightPaneRef}
          queueManagerPreviewSplit={queueManagerPreviewSplit}
          beginQueueManagerPaneResize={beginQueueManagerPaneResize}
          hasActiveGenerationPreview={hasActiveGenerationPreview}
          generationPreview={generationPreview}
          generationPreviewStatusLabel={generationPreviewStatusLabel}
          generationPreviewStepLabel={generationPreviewStepLabel}
          isLoadingOutputPreview={isLoadingOutputPreview}
          queueManagerMediaItems={queueManagerMediaItems}
          outputPreviewError={outputPreviewError}
          queueManagerOutputBuckets={queueManagerOutputBuckets}
          queueManagerStyleFilter={queueManagerStyleFilter}
          setQueueManagerStyleFilter={setQueueManagerStyleFilter}
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
      </div>
    </div>
  );
});

function QueueManagerPromptRows({ items, emptyContent = null, layoutKey, renderItem }: QueueManagerPromptRowsProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = items.length > QUEUE_MANAGER_PROMPT_VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => QUEUE_MANAGER_PROMPT_ROW_ESTIMATE,
    getItemKey: (index) => String(items[index]?.id ?? `${items[index]?.requestId || 'prompt'}-${items[index]?.promptIndex ?? index}`),
    overscan: 4,
  });

  React.useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    rowVirtualizer.measure();
    const frame = window.requestAnimationFrame(() => {
      const rows = scrollRef.current?.querySelectorAll<HTMLElement>('[data-umbra-queue-virtual-row]');
      rows?.forEach((row) => rowVirtualizer.measureElement(row));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items.length, layoutKey, rowVirtualizer, shouldVirtualize]);

  if (!shouldVirtualize) {
    return (
      <div className="p-3 space-y-2">
        {emptyContent}
        {items.map((item) => renderItem(item))}
      </div>
    );
  }

  return (
    <div className="p-3">
      {emptyContent}
      <div
        ref={scrollRef}
        className="max-h-[min(64vh,720px)] min-h-[220px] overflow-y-auto overscroll-contain pr-1 custom-scrollbar"
      >
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            const key = String(item.id ?? `${item.requestId || 'prompt'}-${item.promptIndex ?? virtualRow.index}`);
            return (
              <div
                key={key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                data-umbra-queue-virtual-row=""
                className="absolute left-0 top-0 w-full pb-2"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderItem(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
