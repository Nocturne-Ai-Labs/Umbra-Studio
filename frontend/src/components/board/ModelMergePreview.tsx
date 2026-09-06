import { useEffect, useMemo, useState } from 'react';
import { Image, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { useUmbraPowerPrompterBridge } from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import { NsfwPrivacyShield } from '@/components/privacy/NsfwPrivacyProvider';
import { classifyUmbraPrompt } from '@/lib/nsfwPrivacy';
import { listUmbraUiPipelineFamilies, resolveUmbraUiPipeline } from '@/lib/umbraUiPipelines';
import { normalizePowerPrompterGenerationControls } from '@/lib/powerPrompter';
import { normalizeUmbraUiPipelineCapabilities, type UmbraUiPipelineModelSource } from '../../../../shared/umbra-ui/pipelineTypes';
import { mergeButtonClass as buttonClass, mergeInputClass as inputClass } from './ModelMergeControls';
import { normalizeMergePreviewDraft, type MergePreviewDraft as Draft } from '@/lib/modelMergeDraft';

type TestModel = { id: string; family: string };
const storageKey = 'umbra:model-merge-preview';
const done = new Set(['completed', 'failed', 'canceled', 'interrupted', 'partial']);

function readDraft(): Draft {
  try { return normalizeMergePreviewDraft(JSON.parse(sessionStorage.getItem(storageKey) || '{}')); }
  catch { return normalizeMergePreviewDraft(null); }
}

export function ModelMergePreview({ a, b, merged, mergeBusy, onBusyChange }: { a?: TestModel; b?: TestModel; merged?: TestModel; mergeBusy: boolean; onBusyChange: (busy: boolean) => void }) {
  const comfyConnected = useStore(state => state.connections.comfyui === 'connected');
  const bridge = useUmbraPowerPrompterBridge(comfyConnected);
  const [draft, setDraft] = useState(readDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<{ id: string; prompt: string; model: string; seed: number } | null>(null);
  const [saved, setSaved] = useState<{ url: string; name: string } | null>(null);
  const activity = bridge.queueActivities.find(item => item.requestId === request?.id);
  const busy = submitting || !!request && !saved && (!activity || !done.has(activity.status));
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const families = listUmbraUiPipelineFamilies(bridge.workflows, 'txt2img');
  const familyPipelines = bridge.workflows.flatMap(workflow => workflow.umbraUiPipelines || []).filter(pipeline => pipeline.feature === 'txt2img' && pipeline.modelFamily === draft.family);
  const sources = Array.from(new Set(familyPipelines.flatMap(pipeline => pipeline.modelSources)));
  const match = resolveUmbraUiPipeline(bridge.workflows, 'txt2img', draft.family, draft.source);
  const capabilities = normalizeUmbraUiPipelineCapabilities(match.pipeline?.capabilities, match.pipeline?.modelSources);
  const catalog = bridge.modelCatalog;
  const primaryModels = draft.source === 'checkpoint' ? catalog.checkpoints : draft.source === 'diffusers' ? catalog.diffusersModels : draft.source === 'gguf' ? catalog.ggufModels : draft.source === 'unet' ? [...new Set([...catalog.unetModels, ...catalog.diffusionModels])] : catalog.diffusionModels;
  const resources = match.workflow?.resources || [];
  const effectiveResources = Object.fromEntries(resources.map(resource => [resource.id, draft.resources[resource.id] ?? resource.defaultValue]));
  const missingResources = resources.filter(resource => resource.required && !effectiveResources[resource.id]);
  const preview = bridge.generationPreview?.requestId === request?.id ? bridge.generationPreview : null;
  const previewUrl = saved?.url || preview?.imageDataUrl;
  const protectedMedia = classifyUmbraPrompt(request?.prompt || '') === 'nsfw';
  const ready = !!match.pipeline && !!draft.model && primaryModels.includes(draft.model) && !missingResources.length;
  const patch = (update: Partial<Draft>) => setDraft(current => ({ ...current, ...update }));
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Optional local draft. */ } }, [draft]);
  useEffect(() => {
    const image = bridge.latestSavedImage;
    if (image && image.requestId === request?.id) setSaved({ url: image.comfyViewUrl || image.imageUrl, name: image.name });
  }, [bridge.latestSavedImage, request?.id]);
  const shortcuts = useMemo(() => [{ label: 'Model A', model: a }, { label: 'Model B', model: b }, { label: 'Saved merge', model: merged }], [a, b, merged]);
  const chooseTestModel = (model: TestModel) => {
    const [folder, ...parts] = model.id.replace(/\\/g, '/').split('/');
    const source: UmbraUiPipelineModelSource = folder === 'checkpoints' ? 'checkpoint' : folder === 'unet' ? 'unet' : 'diffusion_model';
    const family = families.find(value => value.toLowerCase() === model.family.toLowerCase());
    patch({ family: family || '', source, model: parts.join('/'), resources: family === draft.family ? draft.resources : {} });
    setError(family ? '' : 'Select the matching test pipeline for this model before generating.');
    bridge.refreshModelCatalog();
  };
  const generate = async () => {
    if (busy || mergeBusy) return;
    setSubmitting(true); setError('');
    try {
      const base = normalizePowerPrompterGenerationControls({});
      if (!base.hiresFix || !base.outputUpscale || !base.tiledVae) throw new Error('Image generation defaults are unavailable.');
      const number = (key: 'steps' | 'seed' | 'clipSkip' | 'guidance', fallback: number) => capabilities[key].support !== 'adjustable' && typeof capabilities[key].value === 'number' ? capabilities[key].value as number : fallback;
      const text = (key: 'sampler' | 'scheduler', fallback: string) => capabilities[key].support !== 'adjustable' && typeof capabilities[key].value === 'string' ? capabilities[key].value as string : fallback;
      const seed = number('seed', draft.seed);
      const id = await bridge.queueImage({
        prompt: draft.prompt, negativePrompt: capabilities.negativePrompt.support === 'adjustable' ? draft.negative : '',
        modelFamily: draft.family, modelType: draft.source, checkpointName: draft.model, workflowResources: effectiveResources,
        seed, seedMode: 'fixed', seedIncrement: 1, steps: number('steps', draft.steps), cfg: number('guidance', draft.cfg), clipSkip: number('clipSkip', 1),
        samplerName: text('sampler', draft.sampler), scheduler: text('scheduler', draft.scheduler),
        width: capabilities.resolution.support === 'adjustable' ? draft.width : capabilities.resolution.defaultWidth || draft.width,
        height: capabilities.resolution.support === 'adjustable' ? draft.height : capabilities.resolution.defaultHeight || draft.height,
        batchSize: 1, outputMode: 'txt2img', outputFolder: '', styleName: 'Model Merge Test', queuePlacement: 'end',
        hiresFix: { ...base.hiresFix, enabled: false }, detailerPipeline: [], outputUpscale: { ...base.outputUpscale, enabled: false }, tiledVae: base.tiledVae, loras: [],
      });
      setRequest({ id, prompt: draft.prompt, model: draft.model, seed }); setSaved(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSubmitting(false); }
  };
  const numberField = (label: string, key: 'seed' | 'steps' | 'cfg' | 'width' | 'height', min: number, max: number, step = 1, disabled = false) => {
    const fixed = key === 'width' ? capabilities.resolution.defaultWidth : key === 'height' ? capabilities.resolution.defaultHeight : capabilities[key === 'cfg' ? 'guidance' : key].value;
    return <label className="min-w-0 space-y-2 text-xs">{label}<input aria-label={`Test ${label}`} className={inputClass} type="number" min={min} max={max} step={step} disabled={busy || disabled} value={disabled && typeof fixed === 'number' ? fixed : draft[key]} onChange={event => patch({ [key]: Math.max(min, Math.min(max, Number(event.target.value) || min)) })} /></label>;
  };
  return <aside aria-label="Model test generation" data-model-merge-preview className="min-w-0 space-y-4 border-l border-[var(--umbra-border)] p-4 md:p-6">
    <header className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-semibold"><Image size={18} />Test generation</h2><button className={buttonClass} title="Refresh test models and pipelines" aria-label="Refresh test models and pipelines" onClick={bridge.refreshModelCatalog} disabled={busy}><RefreshCw size={16} /></button></header>
    <div className="relative flex min-h-64 items-center justify-center overflow-hidden border border-[var(--umbra-border)] bg-black/20" style={{ aspectRatio: '1 / 1', maxHeight: '42dvh' }}>
      {previewUrl ? <img src={previewUrl} alt={saved ? 'Saved model test' : 'Live model test preview'} onError={() => setError('Could not load the test image preview. The output may still be available in Gallery.')} data-umbra-nsfw-media={protectedMedia ? '' : undefined} className="absolute inset-0 h-full w-full object-contain" /> : <Image size={36} className="text-[var(--umbra-text-muted)]" />}
      {previewUrl && <NsfwPrivacyShield protectedMedia={protectedMedia} />}
    </div>
    {request && <div role="status" className="space-y-1 break-words text-xs"><p>{saved ? 'Completed' : activity?.status || 'Queued'}{preview && !saved ? ` - ${preview.step} / ${preview.maxStep}` : ''}</p><p className="text-[var(--umbra-text-muted)]">{request.model} | Seed {request.seed}</p>{activity?.detail && <p>{activity.detail}</p>}{saved && <a href={saved.url} download={saved.name} className="text-[var(--umbra-accent)] underline">Download image</a>}</div>}
    <div className="flex flex-wrap gap-2">{shortcuts.map(item => <button key={item.label} className={buttonClass} disabled={busy || !item.model} onClick={() => item.model && chooseTestModel(item.model)}>{item.label}</button>)}</div>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 space-y-2 text-xs">Pipeline<UmbraSelect ariaLabel="Test model family" value={draft.family} options={families.map(value => ({ value, label: value }))} disabled={busy} onValueChange={family => {
        const first = bridge.workflows.flatMap(workflow => workflow.umbraUiPipelines || []).find(pipeline => pipeline.feature === 'txt2img' && pipeline.modelFamily === family);
        patch({ family, source: first?.modelSources[0] || 'checkpoint', model: '', resources: {} });
      }} buttonClassName="!min-h-11" /></label>
      <label className="min-w-0 space-y-2 text-xs">Model source<UmbraSelect ariaLabel="Test model source" value={draft.source} options={sources.map(value => ({ value, label: value.replace(/_/g, ' ') }))} disabled={busy} onValueChange={source => patch({ source: source as UmbraUiPipelineModelSource, model: '', resources: {} })} buttonClassName="!min-h-11" /></label>
    </div>
    <label className="block space-y-2 text-xs">Model<UmbraSelect ariaLabel="Test model" placeholder="Choose model" value={draft.model} options={primaryModels.map(value => ({ value, label: value }))} disabled={busy} onValueChange={model => patch({ model })} buttonClassName="!min-h-11 !h-auto" /></label>
    {resources.map(resource => <label key={resource.id} className="block space-y-2 text-xs">{resource.label}{resource.required ? ' *' : ''}<UmbraSelect ariaLabel={`Test ${resource.label}`} value={effectiveResources[resource.id] || ''} options={resource.options.map(value => ({ value, label: value }))} placeholder="Choose resource" disabled={busy} onValueChange={value => patch({ resources: { ...draft.resources, [resource.id]: value } })} buttonClassName="!min-h-11" /></label>)}
    <label className="block space-y-2 text-xs">Prompt<textarea aria-label="Test prompt" className={`${inputClass} min-h-32 py-3`} value={draft.prompt} onChange={event => patch({ prompt: event.target.value })} disabled={busy} /></label>
    {capabilities.negativePrompt.support === 'adjustable' && <label className="block space-y-2 text-xs">Negative prompt<textarea aria-label="Test negative prompt" className={`${inputClass} min-h-20 py-3`} value={draft.negative} onChange={event => patch({ negative: event.target.value })} disabled={busy} /></label>}
    <div className="grid grid-cols-2 gap-3">{numberField('Seed', 'seed', 0, Number.MAX_SAFE_INTEGER, 1, capabilities.seed.support !== 'adjustable')}{numberField('Steps', 'steps', 1, 1000, 1, capabilities.steps.support !== 'adjustable')}{numberField(capabilities.guidance.label, 'cfg', 0, 100, 0.1, capabilities.guidance.support !== 'adjustable')}{numberField('Width', 'width', capabilities.resolution.minimumWidth || 64, capabilities.resolution.maximumWidth || 8192, capabilities.resolution.step || 8, capabilities.resolution.support !== 'adjustable')}{numberField('Height', 'height', capabilities.resolution.minimumHeight || 64, capabilities.resolution.maximumHeight || 8192, capabilities.resolution.step || 8, capabilities.resolution.support !== 'adjustable')}</div>
    <div className="grid grid-cols-2 gap-3">{(['sampler', 'scheduler'] as const).map(key => <label key={key} className="min-w-0 space-y-2 text-xs capitalize">{key}<UmbraSelect ariaLabel={`Test ${key}`} value={capabilities[key].support !== 'adjustable' && typeof capabilities[key].value === 'string' ? capabilities[key].value as string : draft[key]} options={(key === 'sampler' ? catalog.samplers : catalog.schedulers).map(value => ({ value, label: value }))} disabled={busy || capabilities[key].support !== 'adjustable'} onValueChange={value => patch({ [key]: value })} buttonClassName="!min-h-11" /></label>)}</div>
    {(error || match.error || catalog.error) && <p role="alert" className="break-words text-sm text-red-400">{error || match.error || catalog.error}</p>}
    {request && activity?.status === 'failed' && bridge.queueErrors[request.id] && <p role="alert" className="break-words whitespace-pre-wrap text-sm text-red-400">{bridge.queueErrors[request.id]}</p>}
    {!comfyConnected && <p className="text-xs text-amber-300">ComfyUI offline</p>}
    {mergeBusy && <p className="text-xs text-amber-300">Waiting for merge to finish</p>}
    <div className="flex flex-wrap gap-2"><button className={`${buttonClass} grow text-[var(--umbra-accent)]`} disabled={busy || mergeBusy || !ready || !draft.prompt.trim() || !comfyConnected || !bridge.connected} onClick={() => void generate()}>{submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}Generate test</button>{busy && request && <button className={buttonClass} title="Cancel test generation" aria-label="Cancel test generation" onClick={() => void bridge.cancelOwnedImage(request.id).catch(reason => setError(reason.message))}><Square size={16} /></button>}</div>
  </aside>;
}
