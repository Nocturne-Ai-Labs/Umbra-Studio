import React from 'react';
import { ArrowLeft, ChevronDown, FolderOpen, History, ListOrdered, Pause, Play, Power, Search, Trash2, X, XCircle } from 'lucide-react';

interface QueueManagerToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  startDisabled: boolean;
  pauseDisabled: boolean;
  paused: boolean;
  staged: boolean;
  destructiveDisabled: boolean;
  clearDisabled: boolean;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onClear: () => void;
  onEmergency: () => void;
  onHistory: () => void;
  onSavedQueues: () => void;
  onBack?: () => void;
}

const controlClassName = 'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs font-semibold text-[var(--umbra-text)] hover:border-[var(--umbra-accent)] disabled:cursor-not-allowed disabled:opacity-40';

export function QueueManagerToolbar(props: QueueManagerToolbarProps) {
  const [controlsOpen, setControlsOpen] = React.useState(false);
  const controlsRef = React.useRef<HTMLDivElement>(null);
  const controlsButtonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!controlsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setControlsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setControlsOpen(false);
      controlsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [controlsOpen]);

  return (
    <div data-umbra-queue-workspace-toolbar="" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black/20 px-3 py-2">
      {props.onBack ? (
        <button type="button" className={controlClassName} onClick={props.onBack} title="Power Prompter" aria-label="Power Prompter">
          <ArrowLeft size={15} />
        </button>
      ) : null}
      <h2 className="flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--umbra-text)]">
        <ListOrdered size={16} className="text-[var(--umbra-accent)]" /> Queue Manager
      </h2>
      <div data-umbra-queue-workspace-search="" className="relative min-w-32 flex-1">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={props.searchQuery}
          onChange={(event) => props.onSearchChange(event.currentTarget.value)}
          aria-label="Search queue prompts"
          placeholder="Search queue prompts..."
          className="h-10 w-full rounded-md border border-white/15 bg-black/25 pl-8 pr-9 text-xs text-[var(--umbra-text)] outline-none focus:border-[var(--umbra-accent)]"
        />
        {props.searchQuery ? (
          <button type="button" onClick={() => props.onSearchChange('')} aria-label="Clear Queue Manager search" title="Clear Queue Manager search" className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-zinc-400">
            <X size={14} />
          </button>
        ) : null}
      </div>
      <div data-umbra-queue-workspace-actions="" className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" className={controlClassName} onClick={props.onStart} disabled={props.startDisabled}>
          <Play size={14} /> {props.paused && !props.staged ? 'Resume' : 'Start'}
        </button>
        <button type="button" className={controlClassName} onClick={props.onPause} disabled={props.pauseDisabled || props.paused} title="Pause after the current prompt finishes">
          <Pause size={14} /> Pause
        </button>
        <button type="button" className={controlClassName} onClick={props.onHistory}>
          <History size={14} /> History
        </button>
        <button type="button" className={controlClassName} onClick={props.onSavedQueues}>
          <FolderOpen size={14} /> Saved Queues
        </button>
        <div ref={controlsRef} className="relative">
          <button type="button" ref={controlsButtonRef} className={controlClassName} onClick={() => setControlsOpen((current) => !current)} aria-expanded={controlsOpen}>
            Controls <ChevronDown size={13} />
          </button>
          {controlsOpen ? (
            <div className="absolute right-0 top-full z-[90] mt-2 grid w-64 max-w-[90vw] gap-2 rounded-md border border-white/15 bg-[var(--umbra-bg)] p-2 shadow-xl">
              <button type="button" className={controlClassName} disabled={props.destructiveDisabled} onClick={() => { setControlsOpen(false); props.onCancel(); }}>
                <XCircle size={14} /> Cancel Current Job
              </button>
              <button type="button" className={controlClassName} disabled={props.clearDisabled} onClick={() => { setControlsOpen(false); props.onClear(); }}>
                <Trash2 size={14} /> Clear Pending Queue
              </button>
              <button type="button" className={controlClassName} disabled={props.destructiveDisabled} onClick={() => { setControlsOpen(false); props.onEmergency(); }} title="Hard-stop ComfyUI and restart it immediately">
                <Power size={14} /> Emergency
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
