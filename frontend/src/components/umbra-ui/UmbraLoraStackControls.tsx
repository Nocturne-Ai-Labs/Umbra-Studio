'use client';

import React from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Library,
  Plus,
  Tags,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildUmbraUiLoraSyntax,
  type UmbraUiLoraEntry,
} from '@/lib/umbraUiModels';

interface UmbraLoraStackControlsProps {
  loras: UmbraUiLoraEntry[];
  availableCount: number;
  onChange: (loras: UmbraUiLoraEntry[]) => void;
  onOpenPicker: () => void;
  onAddPromptToken: (token: string) => void;
}

const labelClass = 'text-[9px] font-black uppercase tracking-[0.11em] text-zinc-500';

function clampStrength(value: string, fallback: number): number {
  if (value.trim() === '' || value.trim() === '-' || value.trim() === '.') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(-10, Math.min(10, numeric)) : fallback;
}

export function UmbraLoraStackControls({
  loras,
  availableCount,
  onChange,
  onOpenPicker,
  onAddPromptToken,
}: UmbraLoraStackControlsProps) {
  const [expanded, setExpanded] = React.useState(false);
  const enabledLoras = loras.filter((lora) => lora.enabled);

  const updateLora = React.useCallback((id: string, patch: Partial<UmbraUiLoraEntry>) => {
    onChange(loras.map((lora) => lora.id === id ? { ...lora, ...patch } : lora));
  }, [loras, onChange]);

  const removeLora = React.useCallback((id: string) => {
    onChange(loras.filter((lora) => lora.id !== id));
  }, [loras, onChange]);

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02]">
      <div className="flex min-h-10 items-center gap-2 px-2.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <Library size={13} className="shrink-0 text-emerald-300" />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">LoRA Stack</span>
          <span className="rounded-sm border border-emerald-300/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-emerald-100">
            {enabledLoras.length} enabled
          </span>
          {!expanded && enabledLoras.length > 0 ? (
            <div className="ml-1 flex min-w-0 flex-1 gap-1 overflow-hidden">
              {enabledLoras.slice(0, 2).map((lora) => (
                <span key={lora.id} className="max-w-36 truncate rounded-sm border border-cyan-300/15 bg-cyan-500/[0.045] px-1.5 py-0.5 font-mono text-[9px] text-cyan-100/80">
                  {buildUmbraUiLoraSyntax(lora)}
                </span>
              ))}
              {enabledLoras.length > 2 ? <span className="font-mono text-[9px] text-zinc-500">+{enabledLoras.length - 2}</span> : null}
            </div>
          ) : null}
          <ChevronDown size={11} className={cn('ml-auto shrink-0 text-zinc-600 transition-transform', expanded && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-emerald-300/20 bg-emerald-500/[0.06] px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100 hover:bg-emerald-500/[0.11]"
          title={`Browse ${availableCount} available LoRAs`}
        >
          <Plus size={11} /> Add
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2 border-t border-white/10 p-2.5">
          {loras.length <= 0 ? (
            <button
              type="button"
              onClick={onOpenPicker}
              className="flex min-h-16 w-full items-center justify-center border border-dashed border-white/10 bg-black/15 text-[10px] font-black uppercase tracking-[0.11em] text-zinc-500 hover:border-emerald-300/25 hover:text-emerald-100"
            >
              Choose a LoRA from the ComfyUI catalog
            </button>
          ) : loras.map((lora) => {
            const syntax = buildUmbraUiLoraSyntax(lora);
            return (
              <div key={lora.id} className={cn('rounded-md border border-white/10 bg-black/25 p-2', !lora.enabled && 'opacity-55')}>
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateLora(lora.id, { enabled: !lora.enabled })}
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border',
                      lora.enabled
                        ? 'border-emerald-300/35 bg-emerald-500/[0.12] text-emerald-100'
                        : 'border-white/10 text-zinc-700',
                    )}
                    title={lora.enabled ? 'Disable LoRA' : 'Enable LoRA'}
                  >
                    {lora.enabled ? <Check size={12} /> : null}
                  </button>
                  <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-100" title={lora.name}>{lora.name}</div>
                  <button
                    type="button"
                    onClick={() => removeLora(lora.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-red-300/15 text-red-200/65 hover:border-red-300/35 hover:text-red-100"
                    title="Remove LoRA"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_62px_62px] gap-1.5">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(syntax)}
                    className="flex min-w-0 items-center gap-1.5 rounded-sm border border-cyan-300/18 bg-cyan-500/[0.05] px-2 text-left font-mono text-[9px] text-cyan-100/90 hover:border-cyan-300/35"
                    title="Copy LoRA syntax"
                  >
                    <Copy size={10} className="shrink-0" />
                    <span className="truncate">{syntax}</span>
                  </button>
                  <label className="space-y-1">
                    <span className={labelClass}>Model</span>
                    <input
                      value={lora.strengthModel}
                      onChange={(event) => updateLora(lora.id, { strengthModel: clampStrength(event.target.value, lora.strengthModel) })}
                      inputMode="decimal"
                      className="h-8 w-full rounded-sm border border-white/10 bg-black/35 px-1.5 text-center font-mono text-[10px] text-zinc-100 outline-none focus:border-emerald-300/35"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className={labelClass}>CLIP</span>
                    <input
                      value={lora.strengthClip}
                      onChange={(event) => updateLora(lora.id, { strengthClip: clampStrength(event.target.value, lora.strengthClip) })}
                      inputMode="decimal"
                      className="h-8 w-full rounded-sm border border-white/10 bg-black/35 px-1.5 text-center font-mono text-[10px] text-zinc-100 outline-none focus:border-emerald-300/35"
                    />
                  </label>
                </div>

                {lora.trainedTags.length > 0 ? (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">
                      <Tags size={10} /> Trained Tokens
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto custom-scrollbar">
                      {lora.trainedTags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => onAddPromptToken(tag)}
                          className="max-w-full truncate rounded-sm border border-emerald-300/18 bg-emerald-500/[0.055] px-2 py-1.5 font-mono text-[9px] text-emerald-100/90 hover:border-emerald-300/40 hover:bg-emerald-500/[0.1]"
                          title={`Add "${tag}" to the prompt`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
