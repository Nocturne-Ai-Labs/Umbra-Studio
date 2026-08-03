'use client';

import React from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  Library,
  Minus,
  Plus,
  Tags,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildUmbraUiLoraSyntax,
  type UmbraUiLoraEntry,
} from '@/lib/umbraUiModels';
import { useStore } from '@/store/useStore';

interface UmbraLoraStackControlsProps {
  loras: UmbraUiLoraEntry[];
  availableCount: number;
  onChange: (loras: UmbraUiLoraEntry[]) => void;
  onOpenPicker: () => void;
}

const labelClass = 'text-[9px] font-black uppercase tracking-[0.11em] text-zinc-500';

function clampStrength(value: string, fallback: number): number {
  if (value.trim() === '' || value.trim() === '-' || value.trim() === '.') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(-10, Math.min(10, numeric)) : fallback;
}

function roundStrengthToStep(value: number): number {
  return Math.max(-10, Math.min(10, Math.round(value / 0.05) * 0.05));
}

function formatStrength(value: number): string {
  return Number(roundStrengthToStep(value).toFixed(2)).toString();
}

export function UmbraLoraStackControls({
  loras,
  availableCount,
  onChange,
  onOpenPicker,
}: UmbraLoraStackControlsProps) {
  const showToast = useStore((state) => state.showToast);
  const [expanded, setExpanded] = React.useState(false);
  const [copiedToken, setCopiedToken] = React.useState('');
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledLoras = loras.filter((lora) => lora.enabled);

  React.useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const copyToken = React.useCallback(async (rawToken: string) => {
    const token = String(rawToken || '').trim();
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedToken((current) => current === token ? '' : current);
      }, 1400);
      showToast('LoRA token copied.', 'success');
    } catch {
      showToast('Failed to copy LoRA token.', 'error');
    }
  }, [showToast]);

  const updateLora = React.useCallback((id: string, patch: Partial<UmbraUiLoraEntry>) => {
    onChange(loras.map((lora) => lora.id === id ? { ...lora, ...patch } : lora));
  }, [loras, onChange]);

  const removeLora = React.useCallback((id: string) => {
    onChange(loras.filter((lora) => lora.id !== id));
  }, [loras, onChange]);

  const adjustStrength = React.useCallback((
    id: string,
    key: 'strengthModel' | 'strengthClip',
    delta: number,
  ) => {
    const target = loras.find((lora) => lora.id === id);
    if (!target) return;
    updateLora(id, { [key]: roundStrengthToStep(target[key] + delta) });
  }, [loras, updateLora]);

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
            const thumbnail = String(lora.thumbnailUrls?.[0] || lora.thumbnailUrl || '').trim();
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
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/45">
                    {thumbnail ? (
                      <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-700">
                        <ImageIcon size={13} />
                      </div>
                    )}
                  </div>
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

                <div className="mt-2 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => { void copyToken(syntax); }}
                    className="flex min-w-0 items-center gap-1.5 rounded-sm border border-cyan-300/18 bg-cyan-500/[0.05] px-2 text-left font-mono text-[9px] text-cyan-100/90 hover:border-cyan-300/35"
                    title="Copy LoRA syntax"
                  >
                    {copiedToken === syntax ? <Check size={10} className="shrink-0 text-emerald-300" /> : <Copy size={10} className="shrink-0" />}
                    <span className="truncate">{syntax}</span>
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ['strengthModel', 'Model'],
                      ['strengthClip', 'CLIP'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="space-y-1">
                        <span className={labelClass}>{label}</span>
                        <div className="flex h-8 overflow-hidden rounded-sm border border-white/10 bg-black/35 focus-within:border-emerald-300/35">
                          <button
                            type="button"
                            onClick={() => adjustStrength(lora.id, key, -0.05)}
                            className="flex w-7 shrink-0 items-center justify-center border-r border-white/10 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                            title={`Decrease ${label} strength by 0.05`}
                            aria-label={`Decrease ${label} strength by 0.05`}
                          >
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            min={-10}
                            max={10}
                            step={0.05}
                            value={formatStrength(lora[key])}
                            onChange={(event) => updateLora(lora.id, { [key]: clampStrength(event.target.value, lora[key]) })}
                            onBlur={(event) => updateLora(lora.id, { [key]: roundStrengthToStep(clampStrength(event.target.value, lora[key])) })}
                            inputMode="decimal"
                            className="min-w-0 flex-1 bg-transparent px-1 text-center font-mono text-[10px] text-zinc-100 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => adjustStrength(lora.id, key, 0.05)}
                            className="flex w-7 shrink-0 items-center justify-center border-l border-white/10 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                            title={`Increase ${label} strength by 0.05`}
                            aria-label={`Increase ${label} strength by 0.05`}
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {lora.trainedTags.length > 0 ? (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">
                      <Tags size={10} /> Trigger Tags
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto custom-scrollbar">
                      {lora.trainedTags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => { void copyToken(tag); }}
                          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-sm border border-emerald-300/18 bg-emerald-500/[0.055] px-2 py-1.5 font-mono text-[9px] text-emerald-100/90 hover:border-emerald-300/40 hover:bg-emerald-500/[0.1]"
                          title={`Copy "${tag}"`}
                        >
                          {copiedToken === tag ? <Check size={9} className="shrink-0" /> : <Copy size={9} className="shrink-0" />}
                          <span className="truncate">{tag}</span>
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
