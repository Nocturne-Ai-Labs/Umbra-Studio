import React from 'react';
import { Loader2 } from 'lucide-react';

type PowerPrompterLoadingOverlaysProps = {
  loadingPromptFileName: string | null;
};

export function PowerPrompterLoadingOverlays({
  loadingPromptFileName,
}: PowerPrompterLoadingOverlaysProps) {
  return (
    <>
      {loadingPromptFileName && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(5,5,8,0.58)] backdrop-blur-[3px]">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-cyan-400/20 bg-black/75 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
                <Loader2 size={20} className="animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
                  Loading File
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-zinc-100">
                  {loadingPromptFileName}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  Building card chain and syncing prompt state...
                </div>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full border border-white/8 bg-white/[0.05]">
              <div className="h-full w-1/3 animate-[pulse_1.15s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400/80 via-sky-400/85 to-emerald-400/75" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
