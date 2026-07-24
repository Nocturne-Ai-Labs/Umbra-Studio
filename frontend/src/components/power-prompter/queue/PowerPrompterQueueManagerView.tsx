import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ChevronDown, ChevronRight, FolderOpen, GripVertical, ListChecks, ListOrdered, Loader2, Pause, Pencil, Play, Power, RefreshCw, Save, Search, Trash2, XCircle } from 'lucide-react';
import { PowerPrompterActivePromptInline } from '@/components/layout/PowerPrompterActivePromptInline';
import { PowerPrompterQueueManagerSidePane } from './PowerPrompterQueueManagerSidePane';
import { QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS, QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE, formatQueueEtaDuration, getSetColor, hexToRgba } from './queueCore';

type PowerPrompterQueueManagerViewProps = Record<string, any>;
type QueueManagerPromptRowsProps = {
  items: any[];
  emptyContent?: React.ReactNode;
  renderItem: (item: any) => React.ReactNode;
};

const QUEUE_MANAGER_PROMPT_VIRTUALIZE_THRESHOLD = 12;
const QUEUE_MANAGER_PROMPT_ROW_ESTIMATE = 86;
const QUEUE_MANAGER_GROUP_PROGRESS_CHIP_LIMIT = 8;
const QUEUE_MANAGER_GROUP_PROGRESS_SCAN_LIMIT = 1200;
const QUEUE_MANAGER_REORDER_ENABLED = false;
const QUEUE_MANAGER_EDITOR_ENABLED = true;

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
    setQueueOutputMenu
  } = props;
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
                    : 'Waiting for queue activity'}
              </div>
              <div
                data-umbra-queue-manager-stats=""
                className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400"
              >
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueSetGroups.length} sets</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueRequestGroups.length} groups</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{queueTotalPromptCount} total</span>
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
                <label className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span className="whitespace-nowrap">Delay</span>
                  <select
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
                  </select>
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
                <select
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
                </select>
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
            {queueSetGroups.length <= 0 ? (
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
                {queueSetGroups.map((setGroup) => {
                  const setKey = String(setGroup.id || setGroup.setId);
                  const setExpanded = expandedQueueSets[setKey] ?? false;
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
                            onClick={() => queueToggleSetExpandedRef.current?.(setKey)}
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
                                        const itemSelected = selectedQueuePromptKeys[itemSelectionKey] === true;
                                        const itemExpanded = queuePromptExpandedMode || expandedQueuePromptRows[itemSelectionKey] === true;
                                        const itemPromptBlocks = itemExpanded ? getQueuePromptBlocksForItem(item, group.setId) : [];
                                        const itemSearchMatches = queueManagerSearchKey.length > 0
                                          && String(item.prompt || '').toLowerCase().includes(queueManagerSearchKey);
                                        return (
                                          <div
                                            key={item.id}
                                            data-umbra-queue-prompt-row=""
                                            style={QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE}
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
                                            } ${item.exiting ? 'opacity-0 max-h-0 overflow-hidden py-0' : `opacity-100 ${itemExpanded ? 'max-h-[520px]' : 'max-h-[220px]'}`}`}
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
                                                        [itemSelectionKey]: !(prev[itemSelectionKey] === true),
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
                                                  <div className="mt-2 max-h-72 min-w-0 max-w-full overflow-auto overscroll-contain rounded-md border border-cyan-400/10 bg-black/25 px-2.5 py-2 custom-scrollbar">
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

function QueueManagerPromptRows({ items, emptyContent = null, renderItem }: QueueManagerPromptRowsProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const shouldVirtualize = items.length > QUEUE_MANAGER_PROMPT_VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => QUEUE_MANAGER_PROMPT_ROW_ESTIMATE,
    getItemKey: (index) => String(items[index]?.id ?? `${items[index]?.requestId || 'prompt'}-${items[index]?.promptIndex ?? index}`),
    overscan: 4,
  });

  React.useEffect(() => {
    if (!shouldVirtualize) return;
    rowVirtualizer.measure();
  }, [items.length, rowVirtualizer, shouldVirtualize]);

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
