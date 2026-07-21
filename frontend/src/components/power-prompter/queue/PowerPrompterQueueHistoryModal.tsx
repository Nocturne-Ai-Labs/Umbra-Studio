import React from 'react';
import { ImageIcon, Loader2, Pencil, Play, RefreshCw, Trash2, XCircle } from 'lucide-react';
import type { PowerPrompterQueueHistorySummary } from './queueCore';
import type { PowerPrompterQueueHistoryGroup } from './queueHistoryModel';

function buildQueueHistoryPreviewThumbnailUrl(path: string, revision?: unknown): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const base = `/api/gallery-bridge/fs/thumbnail?path=${encodedPath}&size=small&q=82&fit=contain&lane=powerprompter`;
  const rev = String(revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}

function buildQueueHistoryPreviewImageUrl(path: string, revision?: unknown): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const base = `/api/gallery-bridge/fs/image?path=${encodedPath}&lane=powerprompter`;
  const rev = String(revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}

type PowerPrompterQueueHistoryModalProps = {
  queueHistoryOpen: boolean;
  queueHistoryItems: PowerPrompterQueueHistorySummary[];
  queueHistoryGroups: PowerPrompterQueueHistoryGroup[];
  selectedQueueHistoryId: string;
  queueHistoryBusy: 'list' | 'load' | 'requeue' | 'delete' | null;
  queueHistoryEditorRestoreEnabled?: boolean;
  queueHistoryReplayEnabled?: boolean;
  refreshQueueHistory: () => Promise<PowerPrompterQueueHistorySummary[]>;
  setQueueHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedQueueHistoryId: React.Dispatch<React.SetStateAction<string>>;
  handleLoadQueueHistoryForEdit: (id?: string) => void | Promise<void>;
  handleRequeueQueueHistory: (id?: string, options?: { resumeRemaining?: boolean }) => void | Promise<void>;
  handleDeleteQueueHistory: (id?: string) => void | Promise<void>;
};

export function PowerPrompterQueueHistoryModal({
  queueHistoryOpen,
  queueHistoryItems,
  queueHistoryGroups,
  selectedQueueHistoryId,
  queueHistoryBusy,
  queueHistoryEditorRestoreEnabled = true,
  queueHistoryReplayEnabled = false,
  refreshQueueHistory,
  setQueueHistoryOpen,
  setSelectedQueueHistoryId,
  handleLoadQueueHistoryForEdit,
  handleRequeueQueueHistory,
  handleDeleteQueueHistory,
}: PowerPrompterQueueHistoryModalProps) {
  if (!queueHistoryOpen) return null;
  const replayTitle = queueHistoryReplayEnabled
    ? ''
    : 'Queue history replay is parked while Queue Manager follows the live queue only';
  const restoreParkedTitle = queueHistoryEditorRestoreEnabled
    ? ''
    : 'Queue history editor restore is unavailable';

  return (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-[1px]">
            <div className="flex h-[min(720px,88vh)] w-[min(980px,94vw)] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#090b11]/95 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.22em] text-cyan-100">Queue History</div>
                  <div className="mt-1 text-[11px] font-semibold text-zinc-500">{queueHistoryItems.length} saved run{queueHistoryItems.length === 1 ? '' : 's'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void refreshQueueHistory(); }}
                    disabled={queueHistoryBusy === 'list'}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      queueHistoryBusy === 'list'
                        ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                        : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/30 hover:text-zinc-100'
                    }`}
                  >
                    {queueHistoryBusy === 'list' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueHistoryOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-zinc-400 transition-colors hover:border-white/30 hover:text-zinc-100"
                    title="Close queue history"
                  >
                    <XCircle size={15} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pr-2 custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                {queueHistoryItems.length <= 0 ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 text-xs font-semibold text-zinc-500">
                    No queue history yet
                  </div>
                ) : (
                  <div className="space-y-3 pb-2">
                    {queueHistoryGroups.map((group) => (
                      <div key={`queue-history-group-${group.key}`} className="space-y-2.5">
                        <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border border-white/10 bg-[#090b11]/95 px-2 py-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.28)] backdrop-blur">
                          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{group.label}</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{group.items.length} run{group.items.length === 1 ? '' : 's'}</span>
                        </div>
                        {group.items.map((item) => {
                          const active = item.id === selectedQueueHistoryId;
                          const completedCount = Math.max(0, Math.min(item.promptCount, item.completed + item.failed + item.canceled));
                          const progressLabel = `${completedCount}/${item.promptCount}`;
                          const previewImages = item.previewImages.slice(0, 5);
                          const dateLabel = item.updatedAt
                            ? new Date(item.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : 'Unknown time';
                          const restoreDisabled = !queueHistoryEditorRestoreEnabled || !item.hasEditorSnapshot || !!queueHistoryBusy;
                          const restoreTitle = restoreParkedTitle
                            || (item.hasEditorSnapshot ? 'Restore the exact editor snapshot captured for this run' : 'No editor snapshot available for this history entry');
                          const canResumeRemaining = completedCount > 0 && completedCount < item.promptCount;
                          return (
                            <div
                              key={`queue-history-${item.id}`}
                              className={`rounded-lg border p-3.5 transition-colors ${
                                active
                                  ? 'border-cyan-300/35 bg-cyan-500/10'
                                  : 'border-white/10 bg-white/[0.025] hover:border-white/20'
                              }`}
                              onClick={() => setSelectedQueueHistoryId(item.id)}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-bold text-zinc-100">{item.name}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                                    <span>{item.status}</span>
                                    <span>{progressLabel}</span>
                                    <span>Set {item.activeSetId}</span>
                                    <span>{item.mode}</span>
                                    <span>{dateLabel}</span>
                                  </div>
                                  {item.outputFolders.length > 0 && (
                                    <div className="mt-2 truncate text-[11px] font-semibold text-zinc-500">
                                      {item.outputFolders.slice(0, 3).join(' / ')}
                                    </div>
                                  )}
                                  {previewImages.length > 0 && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      {previewImages.map((preview) => (
                                        <a
                                          key={`${item.id}-preview-${preview.id}-${preview.path}`}
                                          href={buildQueueHistoryPreviewImageUrl(preview.path, preview.modified)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="group relative h-14 w-14 overflow-hidden rounded-md border border-white/10 bg-black/35 shadow-inner transition-colors hover:border-cyan-300/45"
                                          title={preview.name || preview.path}
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          <img
                                            src={buildQueueHistoryPreviewThumbnailUrl(preview.path, preview.modified)}
                                            alt={preview.name || 'Queue history preview'}
                                            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                                            loading="lazy"
                                            onError={(event) => {
                                              const image = event.currentTarget;
                                              if (image.dataset.fallback === 'image') return;
                                              image.dataset.fallback = 'image';
                                              image.src = buildQueueHistoryPreviewImageUrl(preview.path, preview.modified);
                                            }}
                                          />
                                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white/0 transition-colors group-hover:bg-black/30 group-hover:text-white/80">
                                            <ImageIcon size={14} />
                                          </div>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleLoadQueueHistoryForEdit(item.id);
                                    }}
                                    disabled={restoreDisabled}
                                    title={restoreTitle}
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100 transition-colors hover:border-emerald-300/55 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                                  >
                                    <Pencil size={11} />
                                    Restore Editor
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleRequeueQueueHistory(item.id);
                                    }}
                                    disabled={!queueHistoryReplayEnabled || !!queueHistoryBusy}
                                    title={replayTitle || 'Requeue all prompts from this historical run'}
                                    className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100 transition-colors hover:border-cyan-300/55 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                                  >
                                    <Play size={11} />
                                    Requeue
                                  </button>
                                  {canResumeRemaining ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleRequeueQueueHistory(item.id, { resumeRemaining: true });
                                      }}
                                      disabled={!queueHistoryReplayEnabled || !!queueHistoryBusy}
                                      title={replayTitle || `Resume from prompt ${completedCount + 1}`}
                                      className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-100 transition-colors hover:border-amber-300/55 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                                    >
                                      <Play size={11} />
                                      Resume
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteQueueHistory(item.id);
                                    }}
                                    disabled={!!queueHistoryBusy}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-100 transition-colors hover:border-red-300/55 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                                  >
                                    <Trash2 size={11} />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
  );
}
