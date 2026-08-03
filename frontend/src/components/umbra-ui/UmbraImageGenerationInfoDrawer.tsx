'use client';

import React from 'react';
import { Info, X } from 'lucide-react';
import type { UmbraImageQueueOptions } from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import { cn } from '@/lib/utils';

export interface UmbraImageGenerationInfo {
  workflowName: string;
  options: UmbraImageQueueOptions;
}

interface UmbraImageGenerationInfoDrawerProps {
  open: boolean;
  info: UmbraImageGenerationInfo | null;
  onClose: () => void;
}

const labelClass = 'text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 border-b border-white/[0.06] py-2 last:border-b-0">
      <span className="w-28 shrink-0 text-[9px] font-black uppercase tracking-[0.11em] text-zinc-600">{label}</span>
      <span className="min-w-0 flex-1 break-words text-right font-mono text-[10px] leading-relaxed text-zinc-300">{value}</span>
    </div>
  );
}

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <div className="max-h-44 overflow-y-auto rounded-md border border-white/10 bg-black/35 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 custom-scrollbar">
        {value.trim() || <span className="text-zinc-700">None</span>}
      </div>
    </section>
  );
}

export function UmbraImageGenerationInfoDrawer({
  open,
  info,
  onClose,
}: UmbraImageGenerationInfoDrawerProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const options = info?.options;
  const enabledLoras = options?.loras.filter((entry) => entry.enabled) || [];
  const enabledDetailers = options?.detailerPipeline.filter((stage) => stage.enabled) || [];
  const seedMode = options
    ? options.seedMode === 'increment' || options.seedMode === 'decrement'
      ? `${options.seedMode} ${options.seedMode === 'decrement' ? '-' : '+'}${options.seedIncrement.toLocaleString('en-US')}`
      : options.seedMode
    : '';

  return (
    <div
      className={cn(
        'fixed inset-0 z-[170] transition-colors duration-200',
        open ? 'pointer-events-auto bg-black/65' : 'pointer-events-none bg-black/0',
      )}
      onPointerDown={onClose}
      aria-hidden={!open}
    >
      <aside
        data-umbra-ui-generation-info-drawer=""
        className={cn(
          'absolute inset-y-0 right-0 flex w-[min(620px,calc(100vw-12px))] flex-col border-l border-cyan-300/25 bg-[#07090a]/94 shadow-2xl shadow-black/80 backdrop-blur-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 items-center gap-3 border-b border-white/10 bg-cyan-500/[0.035] px-4">
          <Info size={15} className="text-cyan-300" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-100">Generation Information</h2>
            <div className="truncate font-mono text-[9px] text-zinc-600">{info?.workflowName || 'No queued image selected'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
            title="Close generation information"
          >
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          {options ? (
            <div className="space-y-5">
              <PromptBlock label="Positive Prompt" value={options.prompt} />
              <PromptBlock label="Negative Prompt" value={options.negativePrompt} />

              <section>
                <h3 className={labelClass}>Generation</h3>
                <div className="mt-1.5 border-y border-white/[0.08]">
                  <DetailRow label="Pipeline" value={info?.workflowName || options.modelFamily} />
                  <DetailRow label="Model Family" value={options.modelFamily} />
                  <DetailRow label="Model Source" value={options.modelType} />
                  <DetailRow label="Model" value={options.checkpointName || 'Not selected'} />
                  <DetailRow label="Resolution" value={`${options.width} x ${options.height}`} />
                  <DetailRow label="Batch Count" value={options.batchSize} />
                  <DetailRow label="Seed" value={options.seed.toLocaleString('en-US')} />
                  <DetailRow label="After Generation" value={seedMode} />
                  <DetailRow label="Steps" value={options.steps} />
                  <DetailRow label="CFG / Guidance" value={options.cfg} />
                  <DetailRow label="Sampler" value={options.samplerName} />
                  <DetailRow label="Scheduler" value={options.scheduler} />
                  <DetailRow label="Clip Skip" value={options.clipSkip} />
                  {options.outputMode === 'img2img' ? <DetailRow label="Denoise" value={options.denoise?.toFixed(3) || '0'} /> : null}
                  {options.outputFolder ? <DetailRow label="Output Folder" value={options.outputFolder} /> : null}
                </div>
              </section>

              {Object.keys(options.workflowResources).length > 0 ? (
                <section>
                  <h3 className={labelClass}>Workflow Resources</h3>
                  <div className="mt-1.5 border-y border-white/[0.08]">
                    {Object.entries(options.workflowResources).map(([name, value]) => (
                      <DetailRow key={name} label={name} value={value || 'Not selected'} />
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className={labelClass}>LoRA Stack</h3>
                <div className="mt-1.5 space-y-1.5">
                  {enabledLoras.length > 0 ? enabledLoras.map((lora) => (
                    <div key={lora.id} className="flex items-center gap-2 rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.035] px-2.5 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-fuchsia-100">{lora.name}</span>
                      <span className="shrink-0 font-mono text-[9px] text-zinc-500">UNet {lora.strengthModel.toFixed(2)}</span>
                      <span className="shrink-0 font-mono text-[9px] text-zinc-500">CLIP {lora.strengthClip.toFixed(2)}</span>
                    </div>
                  )) : <div className="text-[10px] text-zinc-700">No enabled LoRAs</div>}
                </div>
              </section>

              <section>
                <h3 className={labelClass}>Pipeline Stages</h3>
                <div className="mt-1.5 border-y border-white/[0.08]">
                  <DetailRow label="Hires Fix" value={options.hiresFix.enabled
                    ? `${options.hiresFix.upscaler} / ${options.hiresFix.denoise.toFixed(2)} denoise`
                    : 'Disabled'} />
                  <DetailRow label="Tiled VAE" value={options.tiledVae.enabled
                    ? `${options.tiledVae.tileSize}px / ${options.tiledVae.overlap}px overlap`
                    : 'Disabled'} />
                  <DetailRow label="Detailers" value={enabledDetailers.length > 0
                    ? enabledDetailers.map((stage) => stage.label || stage.id).join(', ')
                    : 'Disabled'} />
                  <DetailRow label="Final Upscale" value={options.outputUpscale.enabled
                    ? `${options.outputUpscale.modelName} / max ${options.outputUpscale.maxDimension}px`
                    : 'Disabled'} />
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[10px] font-black uppercase tracking-[0.13em] text-zinc-700">
              Queue an image to capture its generation information.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default UmbraImageGenerationInfoDrawer;
