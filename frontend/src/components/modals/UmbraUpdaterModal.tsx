'use client';

import React from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { createPortal } from 'react-dom';

type ReleaseSummary = {
  updateCount?: number;
};

export interface UmbraUpdaterModalProps {
  open: boolean;
  onClose: () => void;
  onUpdateCountChange?: (count: number) => void;
}

export function UmbraUpdaterModal({
  open,
  onClose,
  onUpdateCountChange,
}: UmbraUpdaterModalProps) {
  const [launching, setLaunching] = React.useState(false);
  const [error, setError] = React.useState('');
  const launchAttemptRef = React.useRef(0);

  const refreshUpdateCount = React.useCallback(async () => {
    try {
      const response = await fetch('/api/app/releases', { cache: 'no-store' });
      const payload = await response.json() as ReleaseSummary & { success?: boolean };
      if (!response.ok || payload.success === false) return;
      onUpdateCountChange?.(Math.max(0, Number(payload.updateCount) || 0));
    } catch {
      // Update availability is helpful but must never interrupt normal startup.
    }
  }, [onUpdateCountChange]);

  React.useEffect(() => {
    void refreshUpdateCount();
    const timer = window.setInterval(() => void refreshUpdateCount(), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshUpdateCount]);

  const launchUpdater = React.useCallback(async () => {
    const attempt = launchAttemptRef.current + 1;
    launchAttemptRef.current = attempt;
    setLaunching(true);
    setError('');
    try {
      const response = await fetch('/api/app/updater/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success || !payload?.updaterUrl) {
        throw new Error(payload?.error || 'The standalone updater could not be launched.');
      }
      if (launchAttemptRef.current !== attempt) return;
      // The app releases its listener before spawning the updater so Windows
      // cannot inherit the Umbra server socket into the updater process tree.
      await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 2_000));
      window.location.assign(String(payload.updaterUrl));
    } catch (launchError) {
      if (launchAttemptRef.current !== attempt) return;
      setError(launchError instanceof Error ? launchError.message : 'The standalone updater could not be launched.');
      setLaunching(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      launchAttemptRef.current += 1;
      setLaunching(false);
      setError('');
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg border border-[var(--umbra-accent)]/50 bg-[#07090b] shadow-2xl">
        <header className="flex min-h-14 items-center justify-between border-b border-white/10 px-4">
          <div>
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--umbra-accent)]">
              Umbra Studio Updater
            </div>
            <div className="mt-1 text-sm font-black text-white">External maintenance service</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={launching}
            className="inline-flex h-9 w-9 items-center justify-center border border-white/10 text-zinc-400 hover:border-red-400/35 hover:text-red-300 disabled:opacity-30"
            title="Cancel updater launch"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5">
          <div className="flex items-start gap-3">
            {launching ? (
              <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-[var(--umbra-accent)]" />
            ) : error ? (
              <ExternalLink size={20} className="mt-0.5 shrink-0 text-red-300" />
            ) : (
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" />
            )}
            <div>
              <div className="text-sm font-black text-white">
                {launching
                  ? 'Starting the standalone updater'
                  : error
                    ? 'Updater launch failed'
                    : 'Open the Umbra updater?'}
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {launching
                  ? 'Umbra will open a dedicated updater page on port 8214, then close itself and its managed tools cleanly.'
                  : error || 'Umbra Studio and ComfyUI will shut down before the updater opens. Save any work in progress before continuing.'}
              </p>
              {!launching && !error ? (
                <p className="mt-3 text-xs font-semibold leading-5 text-zinc-300">
                  Are you sure you want to continue?
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/10 bg-black/25 px-4 py-3">
          {!launching ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-10 items-center justify-center border border-white/10 px-4 font-mono text-[10px] font-black uppercase text-zinc-400 hover:border-white/25 hover:text-white"
              >
                {error ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void launchUpdater()}
                className="inline-flex min-h-10 items-center justify-center gap-2 border border-[var(--umbra-accent)]/55 bg-[var(--umbra-accent)]/12 px-4 font-mono text-[10px] font-black uppercase text-white hover:bg-[var(--umbra-accent)]/20"
              >
                {error ? <RefreshCw size={14} /> : <ExternalLink size={14} />}
                {error ? 'Retry' : 'Open Updater'}
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
