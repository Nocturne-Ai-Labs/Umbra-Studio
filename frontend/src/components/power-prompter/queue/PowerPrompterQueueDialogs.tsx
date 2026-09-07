import React from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Loader2, RefreshCw, Save, Trash2, X } from 'lucide-react';
import type { SavedPowerPrompterQueueSummary } from './queueCore';

export type PowerPrompterQueueConfirmAction = 'cancel' | 'clear' | 'emergency';

type PowerPrompterSaveQueueModalProps = {
  open: boolean;
  nameDraft: string;
  busy: 'list' | 'save' | 'load' | 'delete' | null;
  availability: { canSave: boolean; canLoad: boolean; remaining: number; reason: string };
  queues: SavedPowerPrompterQueueSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onLoad: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onRefresh: () => unknown;
  onCancel: () => void;
};

const savedQueueButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-[var(--umbra-text)] hover:border-[var(--umbra-accent)] disabled:cursor-not-allowed disabled:opacity-40';

export function PowerPrompterSaveQueueModal(props: PowerPrompterSaveQueueModalProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [deleteId, setDeleteId] = React.useState('');
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (props.open) dialog?.showModal();
    else { dialog?.close(); setDeleteId(''); }
  }, [props.open]);
  React.useEffect(() => { setDeleteId(''); }, [props.selectedId]);
  const selected = props.queues.find((queue) => queue.id === props.selectedId);
  const busy = !!props.busy;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="saved-pp-queues-title"
      className="m-auto w-[600px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-lg border border-white/20 bg-[var(--umbra-bg)] p-0 text-[var(--umbra-text)] shadow-2xl backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); if (!busy) props.onCancel(); }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 id="saved-pp-queues-title" className="text-sm font-semibold">Saved Power Prompter Queues</h2>
        <button type="button" className={savedQueueButtonClass} aria-label="Close saved queues" title="Close saved queues" disabled={busy} onClick={props.onCancel}><X size={16} /></button>
      </header>
      <form className="space-y-3 border-b border-white/10 p-4" onSubmit={(event) => { event.preventDefault(); if (props.availability.canSave && !busy) void props.onSubmit(); }}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <h3 className="font-semibold">Save Paused Queue</h3>
          <span className="text-zinc-400">{props.availability.remaining.toLocaleString()} prompts remaining</span>
        </div>
        <label className="block text-xs">Queue Name
          <input autoFocus value={props.nameDraft} onChange={(event) => props.onNameChange(event.currentTarget.value)} disabled={busy} maxLength={120}
            className="mt-2 min-h-11 w-full rounded-md border border-white/20 bg-black/20 px-3 text-sm outline-none focus:border-[var(--umbra-accent)]" />
        </label>
        <p role="status" className="text-xs text-zinc-400">{props.availability.reason || 'Paused. Current image finished.'}</p>
        <button type="submit" className={savedQueueButtonClass} disabled={busy || !props.availability.canSave || !props.nameDraft.trim()} title={props.availability.reason || 'Save remaining Power Prompter prompts'}>
          {props.busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save Queue
        </button>
      </form>
      <section className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Saved Queues</h3>
          <button type="button" className={savedQueueButtonClass} title="Refresh saved queues" aria-label="Refresh saved queues" disabled={busy} onClick={() => { void props.onRefresh(); }}>
            <RefreshCw size={15} className={props.busy === 'list' ? 'animate-spin' : ''} />
          </button>
        </div>
        <div role="radiogroup" aria-label="Saved queues" className="max-h-60 overflow-y-auto divide-y divide-white/10 border-y border-white/10">
          {!props.queues.length ? <p className="py-4 text-xs text-zinc-400">{props.busy === 'list' ? 'Loading saved queues...' : 'No saved queues'}</p> : props.queues.map((queue) => (
            <label key={queue.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-2 py-3 hover:bg-white/5">
              <input type="radio" name="saved-pp-queue" value={queue.id} checked={queue.id === props.selectedId} disabled={busy}
                onChange={() => props.onSelect(queue.id)} className="h-4 w-4 shrink-0 accent-[var(--umbra-accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm">{queue.name}</span>
                <span className="mt-1 block text-xs text-zinc-400">{queue.promptCount.toLocaleString()} prompts &middot; {new Date(queue.savedAt).toLocaleString()}</span>
              </span>
            </label>
          ))}
        </div>
        {!props.availability.canLoad && selected ? <p className="text-xs text-zinc-400">Finish or clear the current queue before loading a saved queue.</p> : null}
        {deleteId && selected ? (
          <div className="space-y-2" role="alert">
            <p className="break-words text-sm">Delete saved queue &quot;{selected.name}&quot;?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={savedQueueButtonClass} disabled={busy} onClick={() => { void props.onDelete(); setDeleteId(''); }}>Delete Saved Queue</button>
              <button type="button" className={savedQueueButtonClass} disabled={busy} onClick={() => setDeleteId('')}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={savedQueueButtonClass} disabled={busy || !selected || !props.availability.canLoad} onClick={() => { void props.onLoad(); }}>
              {props.busy === 'load' ? <Loader2 size={15} className="animate-spin" /> : <FolderOpen size={15} />} Load Paused
            </button>
            <button type="button" className={savedQueueButtonClass} title="Delete saved queue" aria-label="Delete saved queue" disabled={busy || !selected} onClick={() => setDeleteId(props.selectedId)}><Trash2 size={15} /></button>
          </div>
        )}
      </section>
    </dialog>, document.body,
  );
}

type PowerPrompterQueueConfirmModalProps = {
  action: PowerPrompterQueueConfirmAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (action: PowerPrompterQueueConfirmAction) => void;
};

export function PowerPrompterQueueConfirmModal({
  action,
  busy,
  onCancel,
  onConfirm,
}: PowerPrompterQueueConfirmModalProps) {
  if (!action) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
      <div className="w-[440px] max-w-[92vw] rounded-xl border border-white/15 bg-[#090b11]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="text-sm font-semibold text-zinc-100">
          {action === 'clear'
            ? 'Clear Future Queue?'
            : action === 'emergency'
              ? 'Emergency Shutdown And Restart ComfyUI?'
              : 'Cancel Active Job?'}
        </div>
        <div className="mt-2 text-xs text-zinc-400">
          {action === 'emergency'
            ? 'This hard-stops ComfyUI immediately, then restarts it. Active and queued jobs will be lost.'
            : action === 'clear'
              ? 'This clears every queued job after the current render. The image already rendering will be allowed to finish.'
              : 'This interrupts only the current generation. The remaining queued prompts stay in place.'}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              busy
                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                : 'border-white/20 bg-white/[0.04] text-zinc-300 hover:border-white/35 hover:text-zinc-100'
            }`}
          >
            Keep Running
          </button>
          <button
            onClick={() => onConfirm(action)}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              busy
                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                : action === 'clear'
                  ? 'border-red-400/40 bg-red-500/14 text-red-200 hover:border-red-300/60 hover:text-red-100'
                  : action === 'emergency'
                    ? 'border-rose-400/40 bg-rose-500/14 text-rose-200 hover:border-rose-300/60 hover:text-rose-100'
                    : 'border-amber-400/40 bg-amber-500/14 text-amber-200 hover:border-amber-300/60 hover:text-amber-100'
            }`}
          >
            {action === 'clear'
              ? 'Clear Future Jobs'
              : action === 'emergency'
                ? 'Emergency Shutdown'
                : 'Cancel Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
