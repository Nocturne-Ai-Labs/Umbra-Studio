'use client';

import React from 'react';
import { Boxes, FolderSearch, X } from 'lucide-react';
import type { UmbraWorkflowResourceSelector } from '@/components/umbra-ui/useUmbraPowerPrompterBridge';

interface UmbraWorkflowResourceControlsProps {
  workflowName: string;
  modelFamily?: string;
  resources: UmbraWorkflowResourceSelector[];
  values: Record<string, string>;
  getOptions: (resource: UmbraWorkflowResourceSelector) => string[];
  onChoose: (resource: UmbraWorkflowResourceSelector) => void;
  onChange: (resourceId: string, value: string) => void;
}

function resourceKindLabel(resource: UmbraWorkflowResourceSelector): string {
  const labels: Record<UmbraWorkflowResourceSelector['kind'], string> = {
    checkpoint: 'Checkpoint',
    diffusers: 'Diffusers',
    diffusion_model: 'Diffusion',
    unet: 'UNet',
    gguf: 'GGUF',
    vae: 'VAE',
    text_encoder: 'Text Encoder',
    clip_vision: 'Vision Encoder',
    controlnet: 'ControlNet',
    upscale_model: 'Upscaler',
    model: 'Model',
  };
  return labels[resource.kind];
}

export function UmbraWorkflowResourceControls({
  workflowName,
  modelFamily,
  resources,
  values,
  getOptions,
  onChoose,
  onChange,
}: UmbraWorkflowResourceControlsProps) {
  if (resources.length <= 0) return null;

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
      <div className="flex min-h-10 items-center gap-2 border-b border-white/10 px-2.5">
        <Boxes size={13} className="text-violet-300" />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Workflow Resources</span>
        {modelFamily ? (
          <span className="rounded-sm border border-violet-300/20 bg-violet-500/[0.07] px-1.5 py-0.5 font-mono text-[9px] text-violet-100">
            {modelFamily}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[9px] text-zinc-500">{resources.length} selectors</span>
      </div>

      <div className="divide-y divide-white/[0.07]">
        {resources.map((resource) => {
          const value = String(values[resource.id] || resource.defaultValue || '').trim();
          const availableCount = getOptions(resource).length;
          return (
            <div key={resource.id} className="px-2.5 py-2">
              <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300" title={resource.label}>
                  {resource.label}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-500">{resourceKindLabel(resource)}</span>
                {resource.required ? (
                  <span className="shrink-0 rounded-sm border border-amber-300/20 px-1.5 py-0.5 font-mono text-[9px] uppercase text-amber-200/90">Required</span>
                ) : null}
              </div>
              <div className="flex min-w-0 items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => onChoose(resource)}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-violet-300/20 bg-violet-500/[0.045] px-2.5 text-left transition-colors hover:border-violet-300/40 hover:bg-violet-500/[0.08]"
                  title={value || `Choose ${resource.label}`}
                >
                  <FolderSearch size={13} className="shrink-0 text-violet-300/70" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-100">
                    {value || `Choose ${resource.label}`}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-500">{availableCount}</span>
                </button>
                {!resource.required && value ? (
                  <button
                    type="button"
                    onClick={() => onChange(resource.id, '')}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors hover:border-rose-300/30 hover:text-rose-200"
                    title={`Clear ${resource.label}`}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="truncate border-t border-white/[0.07] px-2.5 py-1.5 font-mono text-[9px] text-zinc-600" title={workflowName}>
        Defined by {workflowName}
      </div>
    </section>
  );
}
