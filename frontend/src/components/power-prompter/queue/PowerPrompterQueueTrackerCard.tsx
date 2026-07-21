import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ChevronDown, ChevronRight, ListChecks, ListOrdered, Loader2, Pause, Play, Power, Trash2, XCircle } from 'lucide-react';
import { QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE } from './queueCore';
import type { GenerationPreviewState, QueueRequestGroup, QueueSetGroup, QueueStackItem, QueueVisualState } from './queueCore';

type QueueControlBusy = 'start' | 'cancel' | 'clear' | 'emergency' | null;
type ActiveQueuePosition = { position: number; total: number; remaining: number } | null;

const TRACKER_PROMPT_VIRTUALIZE_THRESHOLD = 18;
const TRACKER_PROMPT_ROW_ESTIMATE = 62;

type PowerPrompterQueueTrackerCardProps = {
  queueStackItems: QueueStackItem[];
  queueTrackerPreviewUrl: string;
  activeQueuePosition: ActiveQueuePosition;
  queueRequestGroups: QueueRequestGroup[];
  queueStartDisabled: boolean;
  queueControlBusy: QueueControlBusy;
  queuePaused: boolean;
  hasStagedQueue: boolean;
  queueDestructiveActionBusy: boolean;
  hasCancelableQueueWork: boolean;
  hasClearableQueueWork: boolean;
  queueSetGroups: QueueSetGroup[];
  expandedQueueSets: Record<string, boolean>;
  expandedQueueGroups: Record<string, boolean>;
  generationPreview: GenerationPreviewState | null;
  queueVisualState: QueueVisualState | null;
  onStartQueue: () => void | Promise<void>;
  onToggleQueuePause: () => void | Promise<void>;
  onCancelActiveQueue: () => void | Promise<void>;
  onClearQueue: () => void | Promise<void>;
  onEmergencyShutdown: () => void | Promise<void>;
  onOpenQueueHistory: () => void;
  onToggleSetExpanded: (setGroupId: string) => void;
  onCancelSetGroup: (setId: number) => void | Promise<void>;
  onToggleGroupExpanded: (requestId: string) => void;
  onCancelRequestGroup: (requestId: string) => void | Promise<void>;
};

export const PowerPrompterQueueTrackerCard = React.memo(function PowerPrompterQueueTrackerCard({
  queueStackItems,
  queueTrackerPreviewUrl,
  activeQueuePosition,
  queueRequestGroups,
  queueStartDisabled,
  queueControlBusy,
  queuePaused,
  hasStagedQueue,
  queueDestructiveActionBusy,
  hasCancelableQueueWork,
  hasClearableQueueWork,
  queueSetGroups,
  expandedQueueSets,
  expandedQueueGroups,
  generationPreview,
  queueVisualState,
  onStartQueue,
  onToggleQueuePause,
  onCancelActiveQueue,
  onClearQueue,
  onEmergencyShutdown,
  onOpenQueueHistory,
  onToggleSetExpanded,
  onCancelSetGroup,
  onToggleGroupExpanded,
  onCancelRequestGroup,
}: PowerPrompterQueueTrackerCardProps) {
  const hasQueueItems = queueStackItems.length > 0;

  return (
    <div
      data-card-surface="true"
      className="w-[448px] h-full rounded-xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 flex flex-col overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {queueTrackerPreviewUrl ? (
              <img
                src={queueTrackerPreviewUrl}
                alt="Active queue preview"
                className="umbra-power-prompter-generation-preview h-8 w-8 shrink-0 rounded-md border border-white/10 object-cover"
                loading="eager"
              />
            ) : (
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400">
                <ListChecks size={14} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest font-black text-zinc-500">
                Queue Tracker
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-300">
                <span>
                  {activeQueuePosition
                    ? `Position ${activeQueuePosition.position} of ${activeQueuePosition.total}`
                    : hasQueueItems
                      ? `${queueRequestGroups.length} group${queueRequestGroups.length === 1 ? '' : 's'}`
                      : 'Ready for staged prompts'}
                </span>
                {activeQueuePosition && (
                  <span className="text-zinc-500">
                    {activeQueuePosition.remaining} left
                  </span>
                )}
              </div>
            </div>
          </div>
          {activeQueuePosition && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full border border-white/8 bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400/85 via-sky-400/85 to-emerald-400/85 transition-all duration-300"
                style={{ width: `${Math.max(6, Math.min(100, (activeQueuePosition.position / Math.max(1, activeQueuePosition.total)) * 100))}%` }}
              />
            </div>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 px-3 pb-2">
        <button
          onClick={() => { void onStartQueue(); }}
          disabled={queueStartDisabled}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
          onClick={() => { void onToggleQueuePause(); }}
          disabled={!!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
          onClick={() => { void onCancelActiveQueue(); }}
          disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
          onClick={() => { void onClearQueue(); }}
          disabled={queueDestructiveActionBusy || !hasClearableQueueWork}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
          onClick={() => { void onEmergencyShutdown(); }}
          disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
          onClick={onOpenQueueHistory}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100 transition-colors hover:border-cyan-300/55"
          title="Open queue history. Replay and remix are parked while Queue Manager follows the live queue only."
        >
          <ListOrdered size={11} />
          Queue History
        </button>
      </div>
      <div className="flex-1 min-h-0 px-3 pb-3">
        <div className="h-full overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1">
          {queueSetGroups.length > 0 ? queueSetGroups.map((setGroup) => {
            const setKey = String(setGroup.id || setGroup.setId);
            const setExpanded = expandedQueueSets[setKey] ?? false;
              const setCanCancel = setGroup.pending > 0 || setGroup.running > 0 || (setGroup.completed + setGroup.failed < setGroup.total);
            const setProgressPercent = Math.max(0, Math.min(100, setGroup.progressRatio * 100));
            const setProgressWidth = `${setProgressPercent > 0 ? Math.max(4, setProgressPercent) : 0}%`;
            const activeGroupIdx = setGroup.groups.findIndex((candidate) => candidate.running > 0 || candidate.pending > 0);
            const setGroupPosition = setGroup.groups.length <= 0
              ? 0
              : activeGroupIdx >= 0
                ? activeGroupIdx + 1
                : setGroup.statusLabel === 'Done'
                  ? setGroup.groups.length
                  : 1;
            return (
              <div key={`queue-set-${setKey}`} className="rounded-lg border border-white/12 bg-white/[0.04]">
                <div className="px-1.5 pt-1.5 pb-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onToggleSetExpanded(setKey)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-200 transition-colors hover:border-cyan-300/40 hover:text-cyan-100"
                      title={setExpanded ? 'Collapse set' : 'Expand set'}
                    >
                      {setExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      Set {setGroup.setId}
                    </button>
                    <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                      {setGroup.position}/{setGroup.total}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      {setGroup.statusLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                      Set {setGroup.setId} Group {setGroupPosition}/{setGroup.groups.length}
                    </span>
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-500">
                      {setGroup.groups.length} group{setGroup.groups.length === 1 ? '' : 's'}
                    </span>
                    <button
                      onClick={() => { void onCancelSetGroup(setGroup.setId); }}
                      disabled={queueDestructiveActionBusy || !setCanCancel}
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                        queueDestructiveActionBusy || !setCanCancel
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                      }`}
                      title="Cancel every active group in this set"
                    >
                      {queueControlBusy === 'cancel' ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                      Clear Set
                    </button>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-white/8 bg-black/20">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400/85 via-sky-400/85 to-emerald-400/85 transition-all duration-300"
                      style={{ width: setProgressWidth }}
                    />
                  </div>
                </div>
                {setExpanded && (
                  <div className="mx-1.5 mb-1.5 ml-3 flex flex-col gap-1 border-l border-white/10 pl-2">
                    {setGroup.groups.map((group) => {
                      const groupExpanded = expandedQueueGroups[group.requestId] ?? false;
                      const groupCanCancel = group.pending > 0 || group.running > 0 || (group.completed + group.failed < group.total);
                      const groupProgressPercent = Math.max(0, Math.min(100, group.progressRatio * 100));
                      const groupProgressWidth = `${groupProgressPercent > 0 ? Math.max(4, groupProgressPercent) : 0}%`;
                      return (
                        <div
                          key={`queue-group-${group.requestId}`}
                          className="rounded-md border border-white/10 bg-black/20 px-1.5 py-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onToggleGroupExpanded(group.requestId)}
                              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-100"
                              title={groupExpanded ? 'Collapse group' : 'Expand group'}
                            >
                              {groupExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              Group
                            </button>
                            <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                              {group.position}/{group.total}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                              {group.statusLabel}
                            </span>
                            <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-500">
                              {group.mode}
                            </span>
                            <button
                              onClick={() => { void onCancelRequestGroup(group.requestId); }}
                              disabled={queueDestructiveActionBusy || !groupCanCancel}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                                queueDestructiveActionBusy || !groupCanCancel
                                  ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                                  : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                              }`}
                              title="Cancel this queued group"
                            >
                              {queueControlBusy === 'cancel' ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                              Clear Group
                            </button>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-white/8 bg-black/20">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-400/80 via-cyan-400/85 to-emerald-400/80 transition-all duration-300"
                              style={{ width: groupProgressWidth }}
                            />
                          </div>
                          {groupExpanded && (
                            <QueueTrackerPromptRows
                              group={group}
                              generationPreview={generationPreview}
                              queuePaused={queuePaused}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 px-4 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400">
                <ListChecks size={16} />
              </span>
              <div className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                Queue Tracker Ready
              </div>
              <div className="mt-1 text-[11px] font-semibold text-zinc-500">
                No staged prompts
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function QueueTrackerPromptRows({
  group,
  generationPreview,
  queuePaused,
}: {
  group: QueueRequestGroup;
  generationPreview: GenerationPreviewState | null;
  queuePaused: boolean;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const items = Array.isArray(group.items) ? group.items : [];
  const shouldVirtualize = items.length > TRACKER_PROMPT_VIRTUALIZE_THRESHOLD;
  const livePositionByKey = React.useMemo(() => {
    const next = new Map<string, number>();
    let position = 0;
    for (const item of items) {
      if (item.exiting) continue;
      position += 1;
      next.set(`${item.requestId}:${item.promptIndex}`, position);
    }
    return next;
  }, [items]);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRACKER_PROMPT_ROW_ESTIMATE,
    getItemKey: (index) => String(items[index]?.id ?? `${items[index]?.requestId || 'prompt'}-${items[index]?.promptIndex ?? index}`),
    overscan: 4,
  });

  React.useEffect(() => {
    if (!shouldVirtualize) return;
    rowVirtualizer.measure();
  }, [items.length, rowVirtualizer, shouldVirtualize]);

  const renderItem = React.useCallback((item: QueueStackItem) => {
    const itemPreviewUrl = String(generationPreview?.imageDataUrl || '').trim()
      && generationPreview?.requestId === item.requestId
      && generationPreview?.promptIndex === item.promptIndex
      ? String(generationPreview.imageDataUrl || '')
      : '';
    const itemQueuePosition = livePositionByKey.get(`${item.requestId}:${item.promptIndex}`)
      || Math.max(1, Math.min(group.total, item.promptIndex + 1));
    return (
      <div
        key={item.id}
        style={QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE}
        className={`border rounded-lg px-2 py-1.5 text-xs transition-colors duration-150 ${
          item.status === 'failed'
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : item.status === 'running'
              ? 'border-amber-500/45 bg-amber-500/12 text-amber-200'
              : item.status === 'queued'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-white/5 text-zinc-300'
        } ${item.exiting ? 'opacity-0 max-h-0 overflow-hidden py-0' : 'opacity-100 max-h-[78px]'}`}
      >
        <div className="flex items-start gap-2">
          {itemPreviewUrl ? (
            <img
              src={itemPreviewUrl}
              alt="Live queue item preview"
              className="umbra-power-prompter-generation-preview mt-0.5 h-8 w-8 shrink-0 rounded-md border border-white/10 object-cover"
              loading="eager"
            />
          ) : (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-current/75">
              {item.status === 'failed'
                ? <XCircle size={12} />
                : item.status === 'queued'
                  ? <CheckCircle2 size={12} />
                  : item.status === 'running'
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Play size={11} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
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
            </div>
            <div className="truncate mt-0.5 text-[11px] text-current/90">
              {item.prompt}
            </div>
          </div>
        </div>
      </div>
    );
  }, [generationPreview, group.total, livePositionByKey, queuePaused]);

  if (!shouldVirtualize) {
    return (
      <div className="mt-1 flex flex-col gap-1">
        {items.map((item) => renderItem(item))}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div
        ref={scrollRef}
        className="max-h-[320px] min-h-[120px] overflow-y-auto overscroll-contain pr-1 custom-scrollbar"
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
                className="absolute left-0 top-0 w-full pb-1"
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
