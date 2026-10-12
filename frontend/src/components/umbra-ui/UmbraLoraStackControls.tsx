'use client';

import React from 'react';
import {
  ChevronDown,
  FolderOpen,
  Library,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UmbraUiLoraEntry } from '@/lib/umbraUiModels';
import { UmbraLoraEntryCard } from './UmbraLoraEntryCard';
import { UmbraLoraPresetModal } from './UmbraLoraPresetModal';

interface UmbraLoraStackControlsProps {
  loras: UmbraUiLoraEntry[];
  availableCount: number;
  onChange: (loras: UmbraUiLoraEntry[]) => void;
  onOpenPicker: () => void;
  modelOnly?: boolean;
}

export function UmbraLoraStackControls({
  loras,
  availableCount,
  onChange,
  onOpenPicker,
  modelOnly = false,
}: UmbraLoraStackControlsProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const enabledLoras = loras.filter((lora) => lora.enabled);

  const updateLora = React.useCallback((id: string, patch: Partial<UmbraUiLoraEntry>) => {
    onChange(loras.map((lora) => lora.id === id ? { ...lora, ...patch } : lora));
  }, [loras, onChange]);

  const removeLora = React.useCallback((id: string) => {
    onChange(loras.filter((lora) => lora.id !== id));
  }, [loras, onChange]);


  return (
    <section data-umbra-lora-stack="" className="min-w-0 rounded-md border border-white/10 bg-white/[0.02]">
      <div data-umbra-lora-stack-header="" className="flex min-h-10 items-center gap-2 px-2.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <Library size={13} className="shrink-0 text-emerald-300" />
          <span className="min-w-0 text-[11px] font-black uppercase text-zinc-200">LoRA Stack</span>
          <span title={`${enabledLoras.length} enabled LoRAs`} className="shrink-0 rounded-sm border border-emerald-300/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-emerald-100">
            {enabledLoras.length}
          </span>
          <ChevronDown size={11} className={cn('ml-auto shrink-0 text-zinc-600 transition-transform', expanded && 'rotate-180')} />
        </button>
        <button type="button" onClick={() => setPresetsOpen(true)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-white/15 text-zinc-300 hover:bg-white/10" title="LoRA stack presets" aria-label="LoRA stack presets"><FolderOpen size={14} /></button>
        <button
          type="button"
          onClick={onOpenPicker}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-emerald-300/20 bg-emerald-500/[0.06] text-emerald-100 hover:bg-emerald-500/[0.11]"
          title={`Browse ${availableCount} available LoRAs`}
          aria-label="Add LoRA"
        >
          <Plus size={14} />
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
          ) : loras.map(lora => <UmbraLoraEntryCard key={lora.id} lora={lora} modelOnly={modelOnly}
            onChange={patch=>updateLora(lora.id,patch)} onRemove={()=>removeLora(lora.id)} />)}
        </div>
      ) : null}
      {presetsOpen && <UmbraLoraPresetModal loras={loras} onLoad={(next) => { onChange(next); setExpanded(true); }} onClose={() => setPresetsOpen(false)} />}
    </section>
  );
}
