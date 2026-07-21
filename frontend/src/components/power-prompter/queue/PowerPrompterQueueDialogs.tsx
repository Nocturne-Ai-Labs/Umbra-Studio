import React from 'react';
import { Loader2, Save } from 'lucide-react';

export type PowerPrompterQueueConfirmAction = 'cancel' | 'clear' | 'emergency';

type PowerPrompterSaveQueueModalProps = {
  open: boolean;
  nameDraft: string;
  busy: 'list' | 'save' | 'load' | 'delete' | null;
  onNameChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
};

export function PowerPrompterSaveQueueModal({
  open,
  nameDraft,
  busy,
  onNameChange,
  onSubmit,
  onCancel,
}: PowerPrompterSaveQueueModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
      <form
        className="w-[440px] max-w-[92vw] rounded-xl border border-white/15 bg-[#090b11]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <div className="text-sm font-semibold text-zinc-100">Save Queue</div>
        <div className="mt-2 text-xs text-zinc-400">
          Name this queue so it can be loaded from Queue Manager later.
        </div>
        <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          Queue Name
          <input
            autoFocus
            value={nameDraft}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            disabled={!!busy}
            className="mt-1.5 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-600"
            placeholder="Queue name"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={!!busy}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              busy
                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                : 'border-white/20 bg-white/[0.04] text-zinc-300 hover:border-white/35 hover:text-zinc-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!busy || !nameDraft.trim()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              !!busy || !nameDraft.trim()
                ? 'border-white/10 bg-white/[0.03] text-zinc-600 cursor-not-allowed'
                : 'border-emerald-400/40 bg-emerald-500/14 text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100'
            }`}
          >
            {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Queue
          </button>
        </div>
      </form>
    </div>
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
