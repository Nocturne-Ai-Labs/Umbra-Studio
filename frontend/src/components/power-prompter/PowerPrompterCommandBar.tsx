import React from 'react';
import { Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, FileText, FolderOpen, ListChecks, ListOrdered, Loader2, MoreHorizontal, PanelsTopLeft, Pause, Play, Power, RefreshCw, Save, Search, Trash2, Volume2, VolumeX, XCircle } from 'lucide-react';
import { POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME, POWER_PROMPTER_MAX_QUEUE_SETS } from '@/lib/powerPrompter';
import { PowerPrompterGlobalSearchBox } from './PowerPrompterGlobalSearchBox';
import { POWER_PROMPTER_SOUND_STYLE_GLASS_TICK, POWER_PROMPTER_SOUND_STYLE_OPTIONS, clampCompletionSoundVolume } from './powerPrompterAudio';
import { QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS, clampQueueSetId, getSetColor, hexToRgba } from './queue/queueCore';

type PowerPrompterCommandBarProps = Record<string, any>;

export function PowerPrompterCommandBar(props: PowerPrompterCommandBarProps) {
  const {
    prompterPanelMode,
    setPrompterPanelMode,
    queueEditorEnabled = false,
    queueEditorDraft,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    rightPanelCollapsed,
    setRightPanelCollapsed,
    soundMenuRef,
    soundMenuOpen,
    setSoundMenuOpen,
    alertFeaturesEnabled,
    settings,
    handleToggleCompletionSound,
    handleSetCompletionSoundStyle,
    handleSetCompletionSoundVolume,
    handleSendActivePromptToUmbraUi,
    umbraUiHandoffBusy = false,
    queueSetTarget,
    setQueueSetTarget,
    currentFile,
    queueingMode,
    queueSetColor,
    activePanelQueueEstimate,
    queueTraversalMode,
    queuePromptLimitMinimum,
    queuePromptLimitStep,
    queuePromptLimitDraft,
    handleQueuePromptLimitFocus,
    handleQueuePromptLimitDraftChange,
    commitQueuePromptLimit,
    handleClearSelectedQueueSetAssignments,
    activeQueueSetAssignmentCount,
    handleClearAllQueueSetAssignments,
    totalQueueSetAssignmentCount,
    handleToggleQueueShuffle,
    queueShuffleEnabled,
    hasLiveQueue,
    estimatedBatchSize,
    handleQueuePrompts,
    queueDiversity,
    queueEstimate,
    handleExportSetAsTxt,
    activeQueuePosition,
    queueRequestGroups = [],
    queueSetGroups = [],
    queueTotalPromptCount = 0,
    queueTrackerSummary = {},
    queueSummaryCounts = { pending: 0, running: 0, queued: 0, failed: 0 },
    queueStartActionRef,
    queueStartDisabled,
    queueControlBusy,
    queuePauseActionRef,
    queueStackItems = [],
    hasStagedQueue,
    queuePaused,
    queueCancelActionRef,
    queueDestructiveActionBusy,
    hasCancelableQueueWork,
    hasClearableQueueWork = hasCancelableQueueWork,
    queueClearActionRef,
    queueEmergencyActionRef,
    openQueueHistoryPanel,
    queueDispatchDelayMs,
    handleQueueDispatchDelayChange,
    setQueuePromptExpandedMode,
    queuePromptExpandedMode,
    queueManagerSearchQuery,
    setQueueManagerSearchQuery,
    globalSearchBoxRef,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchSuggestionOpen,
    setGlobalSearchSuggestionOpen,
    globalSearchSuggestionIndex,
    setGlobalSearchSuggestionIndex,
    filteredGlobalSearchSuggestions,
    applyGlobalSearchSelection,
    savedQueueSnapshotsEnabled = false,
    savedQueues = [],
    selectedSavedQueueId,
    setSelectedSavedQueueId,
    savedQueueBusy,
    selectedSavedQueue,
    handleSaveCurrentQueueSnapshot,
    handleLoadSavedQueueSnapshot,
    handleDeleteSavedQueueSnapshot,
    refreshSavedQueues
  } = props;
  const updatePromptLimitDraft = React.useCallback((rawValue: unknown) => {
    if (typeof handleQueuePromptLimitDraftChange === 'function') {
      handleQueuePromptLimitDraftChange(rawValue);
    }
  }, [handleQueuePromptLimitDraftChange]);
  const focusPromptLimitDraft = React.useCallback(() => {
    if (typeof handleQueuePromptLimitFocus === 'function') {
      handleQueuePromptLimitFocus();
    }
  }, [handleQueuePromptLimitFocus]);

  const isPhoneRemote = props.isPhoneRemote === true;
  const currentFileLabel = String(currentFile || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.ppcards\.json$/i, '')
    .replace(/\.txt$/i, '') || 'Choose a card file';
  const [queueSettingsMenuOpen, setQueueSettingsMenuOpen] = React.useState(false);
  const queueSettingsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [queueManagerMenuOpen, setQueueManagerMenuOpen] = React.useState(false);
  const queueManagerMenuRef = React.useRef<HTMLDivElement | null>(null);
  const savedQueueSnapshotsParked = savedQueueSnapshotsEnabled !== true;
  const savedQueueSnapshotsTitle = savedQueueSnapshotsParked
    ? 'Saved queue snapshots are parked while Queue Manager follows the live queue only'
    : '';
  const [promptSearchMenuOpen, setPromptSearchMenuOpen] = React.useState(false);
  const promptSearchMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [phoneActionsOpen, setPhoneActionsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!queueSettingsMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!queueSettingsMenuRef.current?.contains(target)) {
        setQueueSettingsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQueueSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [queueSettingsMenuOpen]);

  React.useEffect(() => {
    if (!queueManagerMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!queueManagerMenuRef.current?.contains(target)) {
        setQueueManagerMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQueueManagerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [queueManagerMenuOpen]);

  React.useEffect(() => {
    if (!promptSearchMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!promptSearchMenuRef.current?.contains(target)) {
        setPromptSearchMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPromptSearchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [promptSearchMenuOpen]);

  React.useEffect(() => {
    if (!promptSearchMenuOpen) return;
    window.requestAnimationFrame(() => {
      const input = promptSearchMenuRef.current?.querySelector('input');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }, [promptSearchMenuOpen]);

  if (isPhoneRemote) {
    const phonePauseDisabled = !!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue;
    return (
      <div
        data-umbra-powerprompter-command-bar=""
        data-umbra-powerprompter-phone-bar=""
        data-umbra-powerprompter-panel-mode={prompterPanelMode}
        className="border-b border-white/5 bg-black/45 px-2 pb-2 pt-2"
      >
        <div data-umbra-powerprompter-phone-primary="" className="flex items-center gap-1.5">
          <div className="inline-flex min-w-0 flex-1 items-center rounded-lg border border-white/10 bg-black/25 p-1">
            <button
              onClick={() => setPrompterPanelMode('editor')}
              className={`h-12 min-w-0 flex-1 rounded-md px-2 text-[10px] font-black uppercase tracking-[0.08em] transition-colors ${
                prompterPanelMode === 'editor'
                  ? 'bg-cyan-500/16 text-cyan-50'
                  : 'text-zinc-400'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setPrompterPanelMode('preset-editor')}
              className={`h-12 min-w-0 flex-1 rounded-md px-2 text-[10px] font-black uppercase tracking-[0.08em] transition-colors ${
                prompterPanelMode === 'preset-editor'
                  ? 'bg-amber-500/16 text-amber-50'
                  : 'text-zinc-400'
              }`}
            >
              Presets
            </button>
            <button
              onClick={() => setPrompterPanelMode('queue-manager')}
              className={`h-12 min-w-0 flex-1 rounded-md px-2 text-[10px] font-black uppercase tracking-[0.08em] transition-colors ${
                prompterPanelMode === 'queue-manager'
                  ? 'bg-emerald-500/16 text-emerald-50'
                  : 'text-zinc-400'
              }`}
            >
              Queue
            </button>
            {queueEditorEnabled && queueEditorDraft ? (
              <button
                onClick={() => setPrompterPanelMode('queue-editor')}
                className={`h-12 min-w-0 flex-1 rounded-md px-2 text-[10px] font-black uppercase tracking-[0.08em] transition-colors ${
                  prompterPanelMode === 'queue-editor'
                    ? 'bg-cyan-500/16 text-cyan-50'
                    : 'text-zinc-400'
                }`}
              >
                Edit
              </button>
            ) : null}
          </div>
          <button
            onClick={() => setLeftPanelCollapsed((prev) => !prev)}
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              !leftPanelCollapsed
                ? 'border-cyan-300/55 bg-cyan-400/14 text-cyan-50'
                : 'border-white/12 bg-white/[0.04] text-zinc-300'
            }`}
            title={leftPanelCollapsed ? 'Open prompt file drawer' : 'Close prompt file drawer'}
            aria-label={leftPanelCollapsed ? 'Open prompt file drawer' : 'Close prompt file drawer'}
          >
            <FileText size={18} />
          </button>
          <button
            onClick={() => setRightPanelCollapsed((prev) => !prev)}
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              !rightPanelCollapsed
                ? 'border-cyan-300/55 bg-cyan-400/14 text-cyan-50'
                : 'border-white/12 bg-white/[0.04] text-zinc-300'
            }`}
            title={rightPanelCollapsed ? 'Show tag browser sidecar' : 'Hide tag browser sidecar'}
            aria-label={rightPanelCollapsed ? 'Show tag browser sidecar' : 'Hide tag browser sidecar'}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPhoneActionsOpen(true)}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-zinc-300"
            title="More Power Prompter controls"
            aria-label="More Power Prompter controls"
          >
            <MoreHorizontal size={19} />
          </button>
        </div>

        <div data-umbra-powerprompter-phone-queue-row="" className="mt-1.5 grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)_48px] items-center gap-1.5">
          <div className="relative min-w-0">
            <select
              value={queueSetTarget}
              onChange={(event) => setQueueSetTarget(clampQueueSetId(event.target.value))}
              disabled={!currentFile || !!queueingMode}
              className="h-12 w-full appearance-none rounded-lg border bg-white/[0.04] pl-2 pr-6 text-[10px] font-black outline-none disabled:border-white/10 disabled:text-zinc-600"
              style={!currentFile || !!queueingMode
                ? undefined
                : {
                    color: queueSetColor,
                    borderColor: hexToRgba(queueSetColor, 0.54),
                    backgroundColor: hexToRgba(queueSetColor, 0.16),
                  }}
              title="Choose queue set target"
            >
              {Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, idx) => idx + 1).map((setId) => (
                <option
                  key={`queue-set-phone-option-${setId}`}
                  value={setId}
                  style={{ color: getSetColor(setId), backgroundColor: '#0a0a0e' }}
                >
                  Set {setId}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
              style={{ color: !currentFile || !!queueingMode ? '#71717a' : queueSetColor }}
            />
          </div>

          <button
            onClick={() => {
              void handleQueuePrompts('selected', {
                setId: queueSetTarget,
                traversalMode: queueTraversalMode,
                diversity: queueDiversity,
                shuffleEnabled: queueShuffleEnabled,
              });
            }}
            disabled={!currentFile || !!queueingMode}
            className="inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-400/10 px-2 text-[10px] font-black uppercase tracking-[0.06em] text-amber-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            title={`Queue selected combinations for the chosen set (${queueEstimate.setPromptCount} prompts, ${queueEstimate.setImageCount} images${queueEstimate.setTruncated ? ', capped' : ''})`}
          >
            {queueingMode === 'selected' ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
            <span>Queue</span>
            <span className="rounded bg-black/25 px-1 tabular-nums">{queueEstimate.setImageCount}</span>
          </button>

          <button
            onClick={() => {
              void handleQueuePrompts('variants', {
                includeAllSets: true,
                setId: queueSetTarget,
                traversalMode: queueTraversalMode,
                diversity: queueDiversity,
                shuffleEnabled: queueShuffleEnabled,
              });
            }}
            disabled={!currentFile || !!queueingMode}
            className="inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2 text-[10px] font-black uppercase tracking-[0.06em] text-cyan-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            title={`Queue selected combinations across all sets (${queueEstimate.allPromptCount} prompts, ${queueEstimate.allImageCount} images${queueEstimate.allTruncated ? ', capped' : ''})`}
          >
            {queueingMode === 'variants' ? <Loader2 size={14} className="animate-spin" /> : <ListOrdered size={14} />}
            <span>All</span>
            <span className="rounded bg-black/25 px-1 tabular-nums">{queueEstimate.allImageCount}</span>
          </button>

          <button
            onClick={() => {
              if (hasStagedQueue || queuePaused) {
                void queueStartActionRef?.current?.();
              } else {
                void queuePauseActionRef?.current?.();
              }
            }}
            disabled={hasStagedQueue || queuePaused ? queueStartDisabled : phonePauseDisabled}
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
              hasStagedQueue || queuePaused
                ? queueStartDisabled
                  ? 'cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-600'
                  : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                : phonePauseDisabled
                  ? 'cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-600'
                  : 'border-sky-400/35 bg-sky-500/10 text-sky-100'
            }`}
            title={hasStagedQueue ? 'Start staged queue' : queuePaused ? 'Resume queue' : 'Pause after the current prompt'}
            aria-label={hasStagedQueue ? 'Start staged queue' : queuePaused ? 'Resume queue' : 'Pause after the current prompt'}
          >
            {queueControlBusy ? <Loader2 size={16} className="animate-spin" /> : hasStagedQueue || queuePaused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>

        {phoneActionsOpen ? (
          <button
            type="button"
            data-umbra-powerprompter-phone-actions-backdrop=""
            onClick={() => setPhoneActionsOpen(false)}
            aria-label="Close Power Prompter controls"
          />
        ) : null}
        {phoneActionsOpen ? (
          <section data-umbra-powerprompter-phone-actions="" role="dialog" aria-modal="true" aria-label="Power Prompter controls">
            <div data-umbra-powerprompter-phone-actions-handle="" />
            <div data-umbra-powerprompter-phone-actions-header="">
              <div>
                <span>Power Prompter</span>
                <strong title={currentFile || ''}>{currentFileLabel}</strong>
              </div>
              <button type="button" onClick={() => setPhoneActionsOpen(false)} aria-label="Close controls">
                <XCircle size={19} />
              </button>
            </div>

            <div data-umbra-powerprompter-phone-actions-status="">
              <span>{queueSummaryCounts.pending || 0} pending</span>
              <span>{queueSummaryCounts.running || 0} running</span>
              <span>{queueSummaryCounts.queued || 0} done</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setPhoneActionsOpen(false);
                void handleSendActivePromptToUmbraUi?.();
              }}
              disabled={!currentFile || umbraUiHandoffBusy}
              className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 text-xs font-black uppercase tracking-[0.08em] text-cyan-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {umbraUiHandoffBusy ? <Loader2 size={15} className="animate-spin" /> : <PanelsTopLeft size={15} />}
              Send to Umbra UI
            </button>

            <div data-umbra-powerprompter-phone-actions-grid="">
              <button
                type="button"
                onClick={() => {
                  setPhoneActionsOpen(false);
                  void queueStartActionRef?.current?.();
                }}
                disabled={queueStartDisabled}
                className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                {queueControlBusy === 'start' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {queuePaused ? 'Resume' : 'Start'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhoneActionsOpen(false);
                  void queuePauseActionRef?.current?.();
                }}
                disabled={phonePauseDisabled}
                className="border-sky-400/30 bg-sky-500/10 text-sky-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                <Pause size={15} />
                Pause
              </button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
        <div data-umbra-powerprompter-command-bar="" className="min-h-12 border-b border-white/5 px-3 py-2 flex items-center gap-2.5 bg-black/20 relative">
          <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500 shrink-0">Card Chain</span>
          <div className="inline-flex shrink-0 items-center rounded-lg border border-white/10 bg-black/25 p-1">
            <button
              onClick={() => setPrompterPanelMode('editor')}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                prompterPanelMode === 'editor'
                  ? 'bg-cyan-500/14 text-cyan-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Open Power Prompter editor panel"
            >
              Editor
            </button>
            <button
              onClick={() => setPrompterPanelMode('preset-editor')}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                prompterPanelMode === 'preset-editor'
                  ? 'bg-amber-500/14 text-amber-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Open the non-destructive Preset Editor"
            >
              Preset Editor
            </button>
            <button
              onClick={() => setPrompterPanelMode('queue-manager')}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                prompterPanelMode === 'queue-manager'
                  ? 'bg-emerald-500/14 text-emerald-100'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Open Queue Manager panel"
            >
              Queue Manager
            </button>
            {queueEditorEnabled && queueEditorDraft && (
              <button
                onClick={() => setPrompterPanelMode('queue-editor')}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  prompterPanelMode === 'queue-editor'
                    ? 'bg-cyan-500/14 text-cyan-100'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="Open temporary queued group editor"
              >
                Queue Editor
              </button>
            )}
          </div>
          <button
            onClick={() => setLeftPanelCollapsed((prev) => !prev)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              leftPanelCollapsed
                ? 'border-white/20 bg-white/[0.06] text-zinc-200 hover:text-white hover:border-white/35'
                : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100'
            }`}
            title={leftPanelCollapsed ? 'Open prompt file menu' : 'Close prompt file menu'}
          >
            {leftPanelCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            Files
          </button>
          <button
            onClick={() => setRightPanelCollapsed((prev) => !prev)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              rightPanelCollapsed
                ? 'border-white/20 bg-white/[0.06] text-zinc-200 hover:text-white hover:border-white/35'
                : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100'
            }`}
            title={rightPanelCollapsed ? 'Open tag browser menu' : 'Close tag browser menu'}
          >
            Browser
            {rightPanelCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="hidden" ref={promptSearchMenuRef}>
            <button
              type="button"
              onClick={() => setPromptSearchMenuOpen((prev) => !prev)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                promptSearchMenuOpen || String(globalSearchQuery || '').trim()
                  ? 'border-cyan-400/40 bg-cyan-500/12 text-cyan-100 hover:border-cyan-300/60'
                  : 'border-white/20 bg-white/[0.06] text-zinc-300 hover:border-white/35 hover:text-zinc-100'
              }`}
              title="Search prompt text, tags, and LoRA chips"
            >
              <Search size={14} />
              Search
              {String(globalSearchQuery || '').trim() ? (
                <span className="ml-0.5 max-w-[7rem] truncate rounded border border-cyan-300/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-cyan-100">
                  {globalSearchQuery}
                </span>
              ) : null}
              <ChevronDown size={13} />
            </button>

            {promptSearchMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-[95] w-[min(92vw,520px)] rounded-xl border border-cyan-300/20 bg-[#07090f]/98 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Prompt Search</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      Search prompt text, card names, tags, and LoRA chips.
                    </div>
                  </div>
                  {String(globalSearchQuery || '').trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalSearchQuery?.('');
                        setGlobalSearchSuggestionOpen?.(false);
                      }}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:border-white/25 hover:text-zinc-100"
                      title="Clear prompt search"
                    >
                      <XCircle size={12} />
                      Clear
                    </button>
                  ) : null}
                </div>
                {globalSearchBoxRef && (
                  <PowerPrompterGlobalSearchBox
                    searchBoxRef={globalSearchBoxRef}
                    query={globalSearchQuery || ''}
                    suggestionsOpen={!!globalSearchSuggestionOpen}
                    suggestionIndex={globalSearchSuggestionIndex || 0}
                    suggestions={filteredGlobalSearchSuggestions || []}
                    onQueryChange={setGlobalSearchQuery}
                    onSuggestionsOpenChange={setGlobalSearchSuggestionOpen}
                    onSuggestionIndexChange={setGlobalSearchSuggestionIndex}
                    onSelect={(value) => {
                      applyGlobalSearchSelection?.(value);
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <div className="hidden" ref={soundMenuRef}>
            <button
              onClick={() => setSoundMenuOpen((prev) => !prev)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                alertFeaturesEnabled
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100'
                  : 'border-white/20 bg-white/[0.06] text-zinc-300 hover:text-zinc-100 hover:border-white/35'
              }`}
              title={alertFeaturesEnabled ? 'Alert effects enabled' : 'Alert effects disabled'}
            >
              {alertFeaturesEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              Alert
              <ChevronDown size={13} />
            </button>
            {soundMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[300px] rounded-lg border border-white/15 bg-[#090b11]/95 backdrop-blur-md p-2 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Completion Alert</div>
                      <div className="text-[10px] text-zinc-600">Plays when each queued prompt finishes</div>
                    </div>
                    <button
                      onClick={() => { void handleToggleCompletionSound(); }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        settings.generationCompleteSoundEnabled !== false
                          ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                          : 'border-white/15 bg-white/[0.03] text-zinc-300 hover:border-white/30'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {settings.generationCompleteSoundEnabled !== false ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        {settings.generationCompleteSoundEnabled !== false ? 'On' : 'Off'}
                      </span>
                    </button>
                  </div>
                  <div className="grid max-h-[132px] grid-cols-1 gap-1 overflow-y-auto pr-1 custom-scrollbar">
                    {POWER_PROMPTER_SOUND_STYLE_OPTIONS.map((option) => {
                      const selected = (settings.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK) === option.id;
                      return (
                        <button
                          key={`pp-sound-style-${option.id}`}
                          onClick={() => { void handleSetCompletionSoundStyle(option.id); }}
                          className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                            selected
                              ? 'border-cyan-400/45 bg-cyan-500/12 text-cyan-100'
                              : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      <span>Volume</span>
                      <span>{Math.round(clampCompletionSoundVolume(settings.generationCompleteSoundVolume) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.round(POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME * 100)}
                      step={1}
                      value={Math.round(clampCompletionSoundVolume(settings.generationCompleteSoundVolume) * 100)}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) {
                          void handleSetCompletionSoundVolume(next / 100);
                        }
                      }}
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex min-w-0 shrink items-center justify-end gap-1.5">
            <div className="hidden min-w-0 items-center gap-1.5 self-center xl:flex">
              <div className="hidden rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500 tabular-nums 2xl:block">
                {activePanelQueueEstimate.setAvailablePromptCount} available
              </div>
              <div className="hidden rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500 tabular-nums 2xl:block">
                Batch {estimatedBatchSize}{queueShuffleEnabled ? ' - Shuffle' : ''}
              </div>
            </div>

            <div className="hidden shrink-0 items-center gap-1.5 md:flex">
              <button
                onClick={() => { void queueStartActionRef?.current?.(); }}
                disabled={queueStartDisabled}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                  queueStartDisabled
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/55'
                }`}
                title="Start sending staged queue prompts to ComfyUI"
              >
                {queueControlBusy === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                <span className="hidden xl:inline">Start</span>
              </button>
              <button
                onClick={() => { void queuePauseActionRef?.current?.(); }}
                disabled={!!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                  !!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : queuePaused
                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/55'
                      : 'border-sky-400/35 bg-sky-500/10 text-sky-100 hover:border-sky-300/55'
                }`}
                title={hasStagedQueue ? 'Use Start to begin dispatching staged prompts' : queuePaused ? 'Resume queued prompt submissions' : 'Pause after the current prompt finishes'}
              >
                {queuePaused ? <Play size={14} /> : <Pause size={14} />}
                <span className="hidden xl:inline">{queuePaused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>

            {(prompterPanelMode === 'editor' || prompterPanelMode === 'preset-editor') && (
              <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
                <button
                  onClick={() => {
                    void handleQueuePrompts('selected', {
                      setId: queueSetTarget,
                      traversalMode: queueTraversalMode,
                      diversity: queueDiversity,
                      shuffleEnabled: queueShuffleEnabled,
                    });
                  }}
                  disabled={!currentFile || !!queueingMode}
                  className={`flex h-10 w-[178px] shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-bold transition-all ${
                    !currentFile || !!queueingMode
                      ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                      : 'bg-white/5 text-zinc-300 hover:text-amber-300'
                  }`}
                  title={`Queue selected combinations for the chosen set (${queueEstimate.setPromptCount} prompts, ${queueEstimate.setImageCount} images${queueEstimate.setTruncated ? ', capped' : ''})`}
                >
                  <span className="min-w-0 flex items-center gap-1.5">
                    {queueingMode === 'selected' ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
                    <span className="truncate">Queue Set</span>
                  </span>
                  <span className="w-[60px] shrink-0 text-right tabular-nums">{queueEstimate.setImageCount} img</span>
                </button>
                <button
                  onClick={() => {
                    void handleQueuePrompts('variants', {
                      includeAllSets: true,
                      setId: queueSetTarget,
                      traversalMode: queueTraversalMode,
                      diversity: queueDiversity,
                      shuffleEnabled: queueShuffleEnabled,
                    });
                  }}
                  disabled={!currentFile || !!queueingMode}
                  className={`flex h-10 w-[190px] shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-bold transition-all ${
                    !currentFile || !!queueingMode
                      ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                      : 'bg-white/5 text-zinc-300 hover:text-cyan-300'
                  }`}
                  title={`Queue selected combinations across all sets (${queueEstimate.allPromptCount} prompts, ${queueEstimate.allImageCount} images${queueEstimate.allTruncated ? ', capped' : ''})`}
                >
                  <span className="min-w-0 flex items-center gap-1.5">
                    {queueingMode === 'variants' ? <Loader2 size={15} className="animate-spin" /> : <ListOrdered size={15} />}
                    <span className="truncate">Queue All Sets</span>
                  </span>
                  <span className="w-[60px] shrink-0 text-right tabular-nums">{queueEstimate.allImageCount} img</span>
                </button>
              </div>
            )}

            <div className="hidden" ref={queueManagerMenuRef}>
              <button
                type="button"
                onClick={() => setQueueManagerMenuOpen((prev) => !prev)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors ${
                  queueManagerMenuOpen
                    ? 'border-emerald-300/55 bg-emerald-400/14 text-emerald-50'
                    : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/30 hover:text-white'
                }`}
                title="Open Queue Manager controls"
              >
                <ListOrdered size={15} />
                <span className="hidden lg:inline">Queue</span>
                <ChevronDown size={13} />
              </button>

              {queueManagerMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-[min(94vw,720px)] rounded-xl border border-white/15 bg-[#07090f]/98 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Queue Manager</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {activeQueuePosition
                          ? `Running position ${activeQueuePosition.position} of ${activeQueuePosition.total}`
                          : queueRequestGroups.length > 0
                            ? `${queueRequestGroups.length} queued group${queueRequestGroups.length === 1 ? '' : 's'}`
                            : 'Waiting for queue activity'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 tabular-nums">
                      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1">{queueSetGroups.length} sets</span>
                      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1">{queueRequestGroups.length} groups</span>
                      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1">{queueTotalPromptCount} total</span>
                      {queueTrackerSummary?.totalLabel && (
                        <span className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-cyan-100">{queueTrackerSummary.totalLabel}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      onClick={() => { void queueStartActionRef?.current?.(); }}
                      disabled={queueStartDisabled}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueStartDisabled
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                      }`}
                      title="Start sending staged queue prompts to ComfyUI"
                    >
                      {queueControlBusy === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      Start Queue
                    </button>
                    <button
                      onClick={() => { void queuePauseActionRef?.current?.(); }}
                      disabled={!!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                        !!queueControlBusy || queueStackItems.length <= 0 || hasStagedQueue
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : queuePaused
                            ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                            : 'border-sky-400/35 bg-sky-500/10 text-sky-200 hover:border-sky-300/55'
                      }`}
                      title={hasStagedQueue ? 'Use Start Queue to begin dispatching staged prompts' : queuePaused ? 'Resume queued prompt submissions' : 'Pause after the current prompt finishes'}
                    >
                      {queuePaused ? <Play size={14} /> : <Pause size={14} />}
                      {queuePaused ? 'Resume Queue' : 'Pause Queue'}
                    </button>
                    <button
                      onClick={openQueueHistoryPanel}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 text-[11px] font-black uppercase tracking-[0.13em] text-cyan-100 transition-colors hover:border-cyan-300/55"
                      title="Open queue history. Replay and remix are parked while Queue Manager follows the live queue only."
                    >
                      <ListOrdered size={14} />
                      History
                    </button>
                    <button
                      onClick={() => { void queueCancelActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasCancelableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-amber-400/35 bg-amber-500/10 text-amber-200 hover:border-amber-300/55'
                      }`}
                      title="Cancel the currently running ComfyUI job"
                    >
                      {queueControlBusy === 'cancel' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Cancel Job
                    </button>
                    <button
                      onClick={() => { void queueClearActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasClearableQueueWork}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasClearableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                      }`}
                      title="Clear pending prompts in ComfyUI queue"
                    >
                      {queueControlBusy === 'clear' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Clear Queue
                    </button>
                    <button
                      onClick={() => { void queueEmergencyActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasCancelableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-rose-400/35 bg-rose-500/10 text-rose-200 hover:border-rose-300/55'
                      }`}
                      title="Hard-stop ComfyUI and restart it immediately"
                    >
                      {queueControlBusy === 'emergency' ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                      Emergency
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-2.5">
                      <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Dispatch Delay</div>
                      <div className="flex flex-wrap gap-1.5">
                        {QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS.map((option) => {
                          const active = queueDispatchDelayMs === option.value;
                          return (
                            <button
                              key={`queue-menu-delay-${option.value}`}
                              type="button"
                              onClick={() => handleQueueDispatchDelayChange?.(option.value)}
                              className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
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
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <label className="relative block">
                      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Prompt Search</span>
                      <Search size={13} className="pointer-events-none absolute left-2.5 top-[34px] -translate-y-1/2 text-zinc-500" />
                      <input
                        value={queueManagerSearchQuery}
                        onChange={(event) => setQueueManagerSearchQuery?.(String(event.currentTarget.value || ''))}
                        placeholder="Highlight queued prompts..."
                        className="h-10 w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-8 text-xs font-semibold text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/50"
                        title="Search inside Queue Manager prompts without changing Editor search"
                      />
                      {String(queueManagerSearchQuery || '').trim() && (
                        <button
                          type="button"
                          onClick={() => setQueueManagerSearchQuery?.('')}
                          className="absolute right-1.5 top-[34px] -translate-y-1/2 rounded p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                          title="Clear Queue Manager search"
                        >
                          <XCircle size={12} />
                        </button>
                      )}
                    </label>

                    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Saved Queues</div>
                        {selectedSavedQueue && (
                          <span className="truncate text-[10px] font-semibold text-zinc-500">
                            {new Date(selectedSavedQueue.savedAt || 0).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
                        <div className="relative min-w-0">
                          <select
                            value={selectedSavedQueueId}
                            onChange={(event) => setSelectedSavedQueueId?.(String(event.currentTarget.value || '').trim())}
                            disabled={savedQueueSnapshotsParked || savedQueueBusy === 'list' || savedQueues.length <= 0}
                            className={`h-10 w-full appearance-none rounded-lg border bg-black/35 px-2.5 pr-7 text-xs font-semibold outline-none transition-colors umbra-themed-select ${
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
                                key={`saved-queue-menu-${queue.id}`}
                                value={queue.id}
                                style={{ color: '#d4d4d8', backgroundColor: '#0a0a0e' }}
                              >
                                {`${queue.name} - ${queue.promptCount} prompts - Set ${queue.activeSetId}`}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={12}
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { void handleSaveCurrentQueueSnapshot?.(); }}
                          disabled={savedQueueSnapshotsParked || !!savedQueueBusy || !hasCancelableQueueWork}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            savedQueueSnapshotsParked || !!savedQueueBusy || !hasCancelableQueueWork
                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                              : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                          }`}
                          title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Save the active and pending queue prompts as a named queue file'}
                        >
                          {savedQueueBusy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleLoadSavedQueueSnapshot?.(); }}
                          disabled={savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)
                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                              : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/55'
                          }`}
                          title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Load the selected saved queue as a paused queue'}
                        >
                          {savedQueueBusy === 'load' ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleDeleteSavedQueueSnapshot?.(); }}
                          disabled={savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                            savedQueueSnapshotsParked || !!savedQueueBusy || (!selectedSavedQueueId && savedQueues.length <= 0)
                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                              : 'border-red-400/30 bg-red-500/8 text-red-200 hover:border-red-300/50'
                          }`}
                          title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Delete the selected saved queue file'}
                        >
                          {savedQueueBusy === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => { void refreshSavedQueues?.(); }}
                          disabled={savedQueueSnapshotsParked || !!savedQueueBusy}
                          className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-3 transition-colors ${
                            savedQueueSnapshotsParked || !!savedQueueBusy
                              ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                              : 'border-white/12 bg-white/[0.04] text-zinc-400 hover:border-white/25 hover:text-zinc-100'
                          }`}
                          title={savedQueueSnapshotsParked ? savedQueueSnapshotsTitle : 'Refresh saved queue files'}
                        >
                          <RefreshCw size={12} className={savedQueueBusy === 'list' ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 tabular-nums">
                    <span>{queueSummaryCounts.pending} pending</span>
                    <span>{queueSummaryCounts.running} running</span>
                    <span>{queueSummaryCounts.queued} done</span>
                    {queueSummaryCounts.failed > 0 && <span className="text-red-200">{queueSummaryCounts.failed} failed</span>}
                    <button
                      type="button"
                      onClick={() => setQueuePromptExpandedMode?.((prev: boolean) => !prev)}
                      className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        queuePromptExpandedMode
                          ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                          : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                      }`}
                      title={queuePromptExpandedMode ? 'Use compact single-line prompt rows' : 'Expand queued prompts into card/variant segments'}
                    >
                      <ListChecks size={12} />
                      {queuePromptExpandedMode ? 'Expanded Prompts' : 'Compact Prompts'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative shrink-0" ref={queueSettingsMenuRef}>
              <button
                type="button"
                onClick={() => setQueueSettingsMenuOpen((prev) => !prev)}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors ${
                  queueSettingsMenuOpen
                    ? 'border-cyan-300/55 bg-cyan-400/14 text-cyan-50'
                    : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/30 hover:text-white'
                }`}
                title="Open Power Prompter controls"
              >
                <ListOrdered size={15} />
                <span className="hidden md:inline">Controls</span>
                <ChevronDown size={13} />
              </button>

              {queueSettingsMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[90] max-h-[calc(100vh-76px)] w-[min(92vw,520px)] overflow-y-auto rounded-xl border border-white/15 bg-[#07090f]/98 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md custom-scrollbar">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Controls</div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500" title={currentFile || ''}>{currentFileLabel}</div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 tabular-nums">
                      {activePanelQueueEstimate.setAvailablePromptCount} available
                    </div>
                  </div>

                  <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.025] p-2.5">
                    <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Alerts</div>
                    <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_96px]">
                      <button
                        onClick={() => { void handleToggleCompletionSound(); }}
                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                          settings.generationCompleteSoundEnabled !== false
                            ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/55'
                            : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
                        }`}
                        title="Toggle image completion alert"
                      >
                        {settings.generationCompleteSoundEnabled !== false ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        Complete
                      </button>
                      <select
                        value={settings.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK}
                        onChange={(event) => { void handleSetCompletionSoundStyle(event.currentTarget.value); }}
                        className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs font-semibold text-zinc-200 outline-none transition-colors hover:border-white/25 focus:border-emerald-400/45 umbra-themed-select"
                        title="Image completion alert sound"
                      >
                        {POWER_PROMPTER_SOUND_STYLE_OPTIONS.map((option) => (
                          <option key={`controls-completion-sound-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="range"
                        min={0}
                        max={Math.round(POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME * 100)}
                        step={1}
                        value={Math.round(clampCompletionSoundVolume(settings.generationCompleteSoundVolume) * 100)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) {
                            void handleSetCompletionSoundVolume(next / 100);
                          }
                        }}
                        className="min-h-9 w-full accent-emerald-400"
                        title="Image completion alert volume"
                      />
                    </div>
                  </div>

                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQueueSettingsMenuOpen(false);
                        void handleSendActivePromptToUmbraUi?.();
                      }}
                      disabled={!currentFile || umbraUiHandoffBusy}
                      className={`sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.13em] transition-colors ${
                        !currentFile || umbraUiHandoffBusy
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:border-cyan-200/65 hover:bg-cyan-500/15'
                      }`}
                      title="Transfer the active set prompt and generation controls to Umbra UI without queueing or starting"
                    >
                      {umbraUiHandoffBusy ? <Loader2 size={13} className="animate-spin" /> : <PanelsTopLeft size={13} />}
                      Send Active Prompt to Umbra UI
                    </button>
                    <button
                      onClick={openQueueHistoryPanel}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100 transition-colors hover:border-cyan-300/55"
                      title="Open queue history. Replay and remix are parked while Queue Manager follows the live queue only."
                    >
                      <ListOrdered size={13} />
                      History
                    </button>
                    <button
                      onClick={() => { void queueCancelActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasCancelableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-amber-400/35 bg-amber-500/10 text-amber-200 hover:border-amber-300/55'
                      }`}
                      title="Cancel the currently running ComfyUI job"
                    >
                      {queueControlBusy === 'cancel' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                      Cancel
                    </button>
                    <button
                      onClick={() => { void queueClearActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasClearableQueueWork}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasClearableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55'
                      }`}
                      title="Clear pending prompts in ComfyUI queue"
                    >
                      {queueControlBusy === 'clear' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Clear
                    </button>
                    <button
                      onClick={() => { void queueEmergencyActionRef?.current?.(); }}
                      disabled={queueDestructiveActionBusy || !hasCancelableQueueWork}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[10px] font-black uppercase tracking-[0.13em] transition-colors ${
                        queueDestructiveActionBusy || !hasCancelableQueueWork
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-rose-400/35 bg-rose-500/10 text-rose-200 hover:border-rose-300/55'
                      }`}
                      title="Hard-stop ComfyUI and restart it immediately"
                    >
                      {queueControlBusy === 'emergency' ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                      Emergency
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_132px]">
                    <label className="block">
                      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Queue Set</span>
                      <div className="relative">
                        <select
                          value={queueSetTarget}
                          onChange={(event) => setQueueSetTarget(clampQueueSetId(event.target.value))}
                          disabled={!currentFile || !!queueingMode}
                          className={`w-full appearance-none rounded-md border py-2 pl-2.5 pr-8 text-xs font-bold outline-none transition-colors ${
                            !currentFile || !!queueingMode
                              ? 'bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed'
                              : 'bg-white/5 text-zinc-300 hover:border-white/40'
                          }`}
                          style={!currentFile || !!queueingMode
                            ? undefined
                            : {
                                color: queueSetColor,
                                borderColor: hexToRgba(queueSetColor, 0.54),
                                backgroundColor: hexToRgba(queueSetColor, 0.16),
                                boxShadow: `0 0 0 1px ${hexToRgba(queueSetColor, 0.18)} inset`,
                              }}
                          title="Choose queue set target"
                        >
                          {Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, idx) => idx + 1).map((setId) => (
                            <option
                              key={`queue-set-menu-option-${setId}`}
                              value={setId}
                              style={{
                                color: getSetColor(setId),
                                backgroundColor: '#0a0a0e',
                              }}
                            >
                              Set {setId}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={13}
                          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                          style={{ color: !currentFile || !!queueingMode ? '#71717a' : queueSetColor }}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Prompt Cap</span>
                      <input
                        type="text"
                        value={queuePromptLimitDraft}
                        disabled={!currentFile || !!queueingMode}
                        autoComplete="off"
                        spellCheck={false}
                        onFocus={focusPromptLimitDraft}
                        onChange={(event) => {
                          updatePromptLimitDraft(event.currentTarget.value);
                        }}
                        onBlur={(event) => {
                          void commitQueuePromptLimit(event.currentTarget.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            const targetInput = event.currentTarget as HTMLInputElement;
                            void commitQueuePromptLimit(targetInput.value);
                            targetInput.blur();
                          }
                        }}
                        className="w-full rounded-md border border-white/15 bg-black/35 px-2.5 py-2 text-right text-xs font-semibold text-zinc-200 focus:outline-none focus:border-cyan-400/60 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
                        placeholder="No cap"
                        title={queuePromptLimitMinimum > 1
                          ? `Manual cap arrows move by ${queuePromptLimitStep} prompts to keep complete style sets.`
                          : 'Type the maximum number of prompts to send. If fewer are available, Umbra queues all it can.'}
                      />
                    </label>

                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={handleClearSelectedQueueSetAssignments}
                      disabled={!currentFile || !!queueingMode || activeQueueSetAssignmentCount <= 0}
                      className={`rounded-md border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                        !currentFile || !!queueingMode || activeQueueSetAssignmentCount <= 0
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-red-400/35 bg-red-500/10 text-red-200 hover:border-red-300/55 hover:text-red-100'
                      }`}
                      title={`Clear Set ${queueSetTarget} from all variant prompt assignments`}
                    >
                      Clear Set
                    </button>
                    <button
                      onClick={handleClearAllQueueSetAssignments}
                      disabled={!currentFile || !!queueingMode || totalQueueSetAssignmentCount <= 0}
                      className={`rounded-md border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                        !currentFile || !!queueingMode || totalQueueSetAssignmentCount <= 0
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-orange-400/35 bg-orange-500/10 text-orange-200 hover:border-orange-300/55 hover:text-orange-100'
                      }`}
                      title="Clear every queue-set assignment from all variant prompts"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => { void handleToggleQueueShuffle(); }}
                      disabled={!currentFile || !!queueingMode}
                      className={`rounded-md border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${
                        !currentFile || !!queueingMode
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : queueShuffleEnabled
                            ? 'border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-200 hover:border-fuchsia-300/60 hover:text-fuchsia-100'
                            : 'border-white/12 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'
                      }`}
                      title={hasLiveQueue
                        ? 'Shuffle enabled prompts across all cards for the next queue. The running queue stays unchanged.'
                        : 'Shuffle enabled prompts across all cards for queue generation'}
                    >
                      {queueShuffleEnabled ? 'Shuffle On' : 'Shuffle Off'}
                    </button>
                    <button
                      onClick={() => { void handleExportSetAsTxt(); }}
                      disabled={!currentFile || !!queueingMode}
                      className={`rounded-md border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-all ${
                        !currentFile || !!queueingMode
                          ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                          : 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/65 hover:text-emerald-100'
                      }`}
                      title="Export the current queue set prompts as a .txt file"
                    >
                      Export .txt
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 tabular-nums">
                    <span>Batch {estimatedBatchSize}</span>
                    <span>
                      {activePanelQueueEstimate.setPromptCount}/{
                        (() => {
                          const numericDraft = Number.parseInt(String(queuePromptLimitDraft || '').trim(), 10);
                          if (Number.isFinite(numericDraft) && numericDraft > 0) {
                            return Math.max(queuePromptLimitMinimum, numericDraft);
                          }
                          return Math.max(0, activePanelQueueEstimate.setAvailablePromptCount);
                        })()
                      } prompts
                    </span>
                    {queuePromptLimitMinimum > 1 && <span>Step {queuePromptLimitStep}</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="relative w-[92px] shrink-0">
              <select
                value={queueSetTarget}
                onChange={(event) => setQueueSetTarget(clampQueueSetId(event.target.value))}
                disabled={!currentFile || !!queueingMode}
                className={`w-full appearance-none pl-2 pr-7 py-1.5 rounded-md text-xs font-bold border outline-none transition-colors ${
                  !currentFile || !!queueingMode
                    ? 'bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed'
                    : 'bg-white/5 text-zinc-300 hover:border-white/40'
                }`}
                style={!currentFile || !!queueingMode
                  ? undefined
                  : {
                      color: queueSetColor,
                      borderColor: hexToRgba(queueSetColor, 0.54),
                      backgroundColor: hexToRgba(queueSetColor, 0.16),
                      boxShadow: `0 0 0 1px ${hexToRgba(queueSetColor, 0.18)} inset`,
                    }}
                title="Choose queue set target"
              >
                {Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, idx) => idx + 1).map((setId) => (
                  <option
                    key={`queue-set-option-${setId}`}
                    value={setId}
                    style={{
                      color: getSetColor(setId),
                      backgroundColor: '#0a0a0e',
                    }}
                  >
                    Set {setId}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black"
                style={{ color: !currentFile || !!queueingMode ? '#71717a' : queueSetColor }}
              >
                v
              </span>
            </div>
              <button
                onClick={() => { void handleExportSetAsTxt(); }}
                disabled={!currentFile || !!queueingMode}
                className={`hidden ${
                  !currentFile || !!queueingMode
                    ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                    : 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/65 hover:text-emerald-100'
                }`}
                title="Export the current queue set prompts as a .txt file"
              >
                Export Set .txt
              </button>
              <div className="hidden">
                Batch {estimatedBatchSize}{queueShuffleEnabled ? ' - Shuffle' : ''}
              </div>
          </div>
        </div>

  );
}
