import React from 'react';
import { Loader2, Play } from 'lucide-react';
import { UmbraPinnedOutputControl } from './UmbraPinnedOutputControl';

export function UmbraGenerationActionBar({ task, onGenerate, disabled, busy, title, label = 'Generate', folder, onFolderChange, children }: {
  task: string;
  onGenerate: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  label?: string;
  folder: string;
  onFolderChange: (value: string) => void;
  children?: React.ReactNode;
}) {
  const barRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    const parent = bar?.parentElement;
    if (!bar || !parent) return;
    const update = () => parent.style.setProperty('--umbra-generation-actions-height', `${bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => { observer.disconnect(); parent.style.removeProperty('--umbra-generation-actions-height'); };
  }, []);
  return <div ref={barRef} data-umbra-generation-action-bar={task} role="group" aria-label={`${task} generation actions`}
    className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[#080c0b] px-3 py-2">
    <button type="button" onClick={onGenerate} disabled={disabled} title={title} aria-label={`Generate ${task}`}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-3 text-[10px] font-black uppercase text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-500">
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}{label}
    </button>
    <div className="min-w-0 max-w-full"><UmbraPinnedOutputControl task={task} value={folder} onChange={onFolderChange} /></div>
    {children}
  </div>;
}
