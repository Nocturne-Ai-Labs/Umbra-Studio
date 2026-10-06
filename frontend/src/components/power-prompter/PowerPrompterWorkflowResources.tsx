import React from 'react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { useStore } from '@/store/useStore';
import type { UmbraUiPipelineResourceReadinessItem } from '../../../../shared/umbra-ui/pipelineTypes';

const providers: Record<string, [string, string]> = {
  checkpoint: ['CheckpointLoaderSimple', 'ckpt_name'],
  diffusion_model: ['UNETLoader', 'unet_name'],
  unet: ['UNETLoader', 'unet_name'],
  gguf: ['UnetLoaderGGUF', 'unet_name'],
  text_encoder: ['CLIPLoader', 'clip_name'],
  vae: ['VAELoader', 'vae_name'],
  clip_vision: ['CLIPVisionLoader', 'clip_name'],
  controlnet: ['ControlNetLoader', 'control_net_name'],
  upscale_model: ['UpscaleModelLoader', 'model_name'],
};

export function PowerPrompterWorkflowResources({ items, values, onChange }: {
  items: UmbraUiPipelineResourceReadinessItem[];
  values: Record<string, string>;
  onChange: (resourceId: string, value: string) => void;
}) {
  const [catalogs, setCatalogs] = React.useState<Record<string, string[]>>({});
  const connection = useStore(state => state.connections.comfyui);
  const [refreshKey, refreshCatalogs] = React.useReducer(value => value + 1, 0);
  const resources = items.filter(item => item.source === 'graph' && item.id !== 'final-upscale.default-model');
  const kinds = [...new Set(resources.map(item => item.kind))].sort().join(',');
  React.useEffect(() => {
    const controller = new AbortController();
    setCatalogs({});
    void Promise.all(kinds.split(',').filter(Boolean).map(async kind => {
      const provider = providers[kind];
      if (!provider) return [kind, []] as const;
      const [node, input] = provider;
      try {
        const response = await fetch(`/object_info/${encodeURIComponent(node)}`, { signal: controller.signal });
        if (!response.ok) return [kind, []] as const;
        const payload = await response.json();
        const choices = payload?.[node]?.input?.required?.[input]?.[0];
        return [kind, Array.isArray(choices) ? choices.filter((value): value is string => typeof value === 'string') : []] as const;
      } catch { return [kind, []] as const; }
    })).then(entries => { if (!controller.signal.aborted) setCatalogs(Object.fromEntries(entries)); });
    return () => controller.abort();
  }, [kinds, connection, refreshKey]);
  if (!resources.length) return null;
  return (
    <section className="space-y-2 rounded-md border border-violet-300/20 bg-violet-500/[0.035] p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-200">Workflow Resources</h3>
        <button type="button" onClick={refreshCatalogs} className="text-[10px] text-zinc-400 hover:text-zinc-200">Refresh</button>
      </div>
      {resources.map(item => {
        const value = values[item.id] || item.value || '';
        const choices = [...new Set([value, item.value, ...(catalogs[item.kind] || [])].filter(Boolean))];
        return (
          <label key={item.id} className="block min-w-0 space-y-1 text-[10px] text-zinc-400">
            <span>{item.label}</span>
            <UmbraSelect
              value={value}
              options={choices.map(name => ({ value: name, label: name, i18nSkip: true }))}
              onValueChange={next => onChange(item.id, next)}
              ariaLabel={item.label}
              menuTitle={item.label}
              placeholder="Choose model"
              size="sm"
              required={item.required}
            />
          </label>
        );
      })}
    </section>
  );
}
