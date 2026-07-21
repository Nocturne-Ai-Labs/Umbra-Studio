'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Maximize2,
  Plus,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPowerPrompterDetailerStage } from '@/lib/powerPrompter';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterOutputUpscaleControls,
} from '@/types/powerPrompter';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-emerald-300/45';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400';
const iconButtonClass = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-white/10 text-zinc-500 transition-colors hover:border-emerald-300/30 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-25';

const SAM_HINTS = ['center-1', 'horizontal-2', 'vertical-2', 'rect-4', 'diamond-4', 'mask-area', 'mask-points', 'mask-point-bbox', 'none'];

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}

function NumberField({ label, value, onChange, min, max, step = 1 }: NumberFieldProps) {
  return (
    <label className="min-w-0 space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (event.target.value === '') return;
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className={inputClass}
      />
    </label>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  color?: 'emerald' | 'cyan';
}

function Toggle({ checked, onChange, title, color = 'emerald' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked
          ? color === 'cyan' ? 'border-cyan-300/40 bg-cyan-400/25' : 'border-emerald-300/40 bg-emerald-400/25'
          : 'border-white/15 bg-black/35',
      )}
      title={title}
    >
      <span className={cn(
        'absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color]',
        checked
          ? cn('left-[18px]', color === 'cyan' ? 'bg-cyan-200' : 'bg-emerald-200')
          : 'left-0.5 bg-zinc-600',
      )} />
    </button>
  );
}

interface UmbraDetailerPipelineControlsProps {
  stages: PowerPrompterDetailerStage[];
  onStagesChange: (stages: PowerPrompterDetailerStage[]) => void;
  detectorModels: string[];
  samModels: string[];
  samplerOptions: string[];
  schedulerOptions: string[];
  upscaleModels: string[];
  outputUpscale: PowerPrompterOutputUpscaleControls;
  onOutputUpscaleChange: (settings: PowerPrompterOutputUpscaleControls) => void;
  showDetailer?: boolean;
  showOutputUpscale?: boolean;
  allowCustomStages?: boolean;
  showStageControls?: boolean;
  showOutputModelSelection?: boolean;
  showOutputMaxDimension?: boolean;
}

export function UmbraDetailerPipelineControls({
  stages,
  onStagesChange,
  detectorModels,
  samModels,
  samplerOptions,
  schedulerOptions,
  upscaleModels,
  outputUpscale,
  onOutputUpscaleChange,
  showDetailer = true,
  showOutputUpscale = true,
  allowCustomStages = true,
  showStageControls = true,
  showOutputModelSelection = true,
  showOutputMaxDimension = true,
}: UmbraDetailerPipelineControlsProps) {
  const [expandedStageId, setExpandedStageId] = React.useState<string | null>(null);
  const activeCount = stages.filter((stage) => stage.enabled).length;
  const detectorChoices = React.useMemo(() => Array.from(new Set([
    ...detectorModels,
    ...stages.map((stage) => stage.detectorModel),
  ].filter(Boolean))), [detectorModels, stages]);
  const samChoices = React.useMemo(() => Array.from(new Set([
    ...samModels,
    ...stages.map((stage) => stage.samModel),
  ].filter(Boolean))), [samModels, stages]);
  const upscaleChoices = React.useMemo(() => Array.from(new Set([
    ...upscaleModels,
    outputUpscale.modelName,
  ].filter(Boolean))), [outputUpscale.modelName, upscaleModels]);

  const updateStage = React.useCallback((id: string, patch: Partial<PowerPrompterDetailerStage>) => {
    onStagesChange(stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage));
  }, [onStagesChange, stages]);

  const moveStage = React.useCallback((index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onStagesChange(next);
  }, [onStagesChange, stages]);

  const addStage = React.useCallback(() => {
    const stage = createPowerPrompterDetailerStage({
      label: `Detailer ${stages.length + 1}`,
      detectorModel: detectorChoices[0] || 'bbox/face_yolov8m.pt',
      seedOffset: stages.length + 1,
    });
    onStagesChange([...stages, stage]);
    setExpandedStageId(stage.id);
  }, [detectorChoices, onStagesChange, stages]);

  const duplicateStage = React.useCallback((stage: PowerPrompterDetailerStage, index: number) => {
    const duplicate = createPowerPrompterDetailerStage({
      ...stage,
      label: `${stage.label} Copy`,
      seedOffset: stage.seedOffset + 1,
    });
    const next = [...stages];
    next.splice(index + 1, 0, duplicate);
    onStagesChange(next);
    setExpandedStageId(duplicate.id);
  }, [onStagesChange, stages]);

  if (!showDetailer && !showOutputUpscale) return null;

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      {showDetailer ? (
        <>
      <div className="flex items-center gap-2">
        <WandSparkles size={13} className="text-emerald-300" />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Detailer Pipeline</span>
        <span className="font-mono text-[10px] text-zinc-500">{activeCount}/{stages.length}</span>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => onStagesChange(stages.map((stage) => ({ ...stage, enabled: false })))}
            className="ml-auto inline-flex h-7 items-center rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500 transition-colors hover:border-emerald-300/25 hover:text-zinc-200"
          >
            Disable all
          </button>
        ) : stages.length > 0 ? (
          <button
            type="button"
            onClick={() => onStagesChange(stages.map((stage) => ({ ...stage, enabled: true })))}
            className="ml-auto inline-flex h-7 items-center rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500 transition-colors hover:border-emerald-300/25 hover:text-zinc-200"
          >
            Enable all
          </button>
        ) : <span className="ml-auto" />}
        {allowCustomStages ? (
          <button type="button" onClick={addStage} className={iconButtonClass} title="Add detailer stage">
            <Plus size={12} />
          </button>
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5">
        {stages.map((stage, index) => {
          const expanded = expandedStageId === stage.id;
          return (
            <article key={stage.id} className={cn(
              'overflow-hidden rounded-md border transition-colors',
              stage.enabled ? 'border-emerald-300/20 bg-emerald-500/[0.045]' : 'border-white/10 bg-black/20',
            )}>
              <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                {showStageControls ? (
                  <button
                    type="button"
                    onClick={() => setExpandedStageId(expanded ? null : stage.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-zinc-400 hover:text-zinc-100"
                    title={expanded ? 'Collapse detailer settings' : 'Expand detailer settings'}
                  >
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => showStageControls && setExpandedStageId(expanded ? null : stage.id)}
                  className="min-w-0 flex-1 text-left"
                  disabled={!showStageControls}
                >
                  <span className="block truncate text-[10px] font-black uppercase tracking-[0.1em] text-zinc-100">{stage.label}</span>
                  <span className="block truncate font-mono text-[9px] text-zinc-500">{stage.detectorModel}</span>
                </button>
                {allowCustomStages ? (
                  <>
                    <button type="button" onClick={() => moveStage(index, -1)} disabled={index === 0} className={iconButtonClass} title="Move detailer up">
                      <ArrowUp size={11} />
                    </button>
                    <button type="button" onClick={() => moveStage(index, 1)} disabled={index === stages.length - 1} className={iconButtonClass} title="Move detailer down">
                      <ArrowDown size={11} />
                    </button>
                    <button type="button" onClick={() => duplicateStage(stage, index)} className={iconButtonClass} title="Duplicate detailer">
                      <Copy size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onStagesChange(stages.filter((candidate) => candidate.id !== stage.id));
                        if (expanded) setExpandedStageId(null);
                      }}
                      className={cn(iconButtonClass, 'hover:border-red-300/30 hover:text-red-200')}
                      title="Remove detailer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                ) : null}
                <Toggle checked={stage.enabled} onChange={(enabled) => updateStage(stage.id, { enabled })} title={stage.enabled ? 'Disable detailer' : 'Enable detailer'} />
              </div>

              {expanded && showStageControls ? (
                <div className="space-y-3 border-t border-white/10 px-2.5 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 space-y-1.5">
                      <span className={labelClass}>Name</span>
                      <input value={stage.label} onChange={(event) => updateStage(stage.id, { label: event.target.value })} className={inputClass} />
                    </label>
                    <label className="min-w-0 space-y-1.5">
                      <span className={labelClass}>Detector</span>
                      <select value={stage.detectorModel} onChange={(event) => updateStage(stage.id, { detectorModel: event.target.value })} className={inputClass}>
                        {detectorChoices.map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Guide Size" value={stage.guideSize} min={64} max={16384} step={8} onChange={(guideSize) => updateStage(stage.id, { guideSize })} />
                    <NumberField label="Max Size" value={stage.maxSize} min={64} max={16384} step={8} onChange={(maxSize) => updateStage(stage.id, { maxSize })} />
                    <label className="min-w-0 space-y-1.5">
                      <span className={labelClass}>Guide Basis</span>
                      <select value={stage.guideSizeFor} onChange={(event) => updateStage(stage.id, { guideSizeFor: event.target.value === 'crop_region' ? 'crop_region' : 'bbox' })} className={inputClass}>
                        <option value="bbox">Bounding box</option>
                        <option value="crop_region">Crop region</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Steps" value={stage.steps} min={1} max={10000} onChange={(steps) => updateStage(stage.id, { steps })} />
                    <NumberField label="CFG" value={stage.cfg} min={0} max={100} step={0.1} onChange={(cfg) => updateStage(stage.id, { cfg })} />
                    <NumberField label="Denoise" value={stage.denoise} min={0.0001} max={1} step={0.01} onChange={(denoise) => updateStage(stage.id, { denoise })} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 space-y-1.5">
                      <span className={labelClass}>Sampler</span>
                      <select value={stage.samplerName} onChange={(event) => updateStage(stage.id, { samplerName: event.target.value })} className={inputClass}>
                        {Array.from(new Set([stage.samplerName, ...samplerOptions])).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0 space-y-1.5">
                      <span className={labelClass}>Scheduler</span>
                      <select value={stage.scheduler} onChange={(event) => updateStage(stage.id, { scheduler: event.target.value })} className={inputClass}>
                        {Array.from(new Set([stage.scheduler, ...schedulerOptions])).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>

                  <details className="border-t border-white/10 pt-2">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">Detection</summary>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <NumberField label="BBox Threshold" value={stage.bboxThreshold} min={0} max={1} step={0.01} onChange={(bboxThreshold) => updateStage(stage.id, { bboxThreshold })} />
                      <NumberField label="BBox Dilation" value={stage.bboxDilation} min={-512} max={512} onChange={(bboxDilation) => updateStage(stage.id, { bboxDilation })} />
                      <NumberField label="Crop Factor" value={stage.bboxCropFactor} min={1} max={10} step={0.1} onChange={(bboxCropFactor) => updateStage(stage.id, { bboxCropFactor })} />
                      <NumberField label="Drop Size" value={stage.dropSize} min={1} max={16384} onChange={(dropSize) => updateStage(stage.id, { dropSize })} />
                      <NumberField label="Feather" value={stage.feather} min={0} max={100} onChange={(feather) => updateStage(stage.id, { feather })} />
                      <NumberField label="Seed Offset" value={stage.seedOffset} min={0} max={1000000} onChange={(seedOffset) => updateStage(stage.id, { seedOffset })} />
                    </div>
                  </details>

                  <details className="border-t border-white/10 pt-2">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">SAM & Mask</summary>
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="min-w-0 space-y-1.5">
                          <span className={labelClass}>SAM Model</span>
                          <select value={stage.samModel} disabled={!stage.useSam} onChange={(event) => updateStage(stage.id, { samModel: event.target.value })} className={inputClass}>
                            {samChoices.map((model) => <option key={model} value={model}>{model}</option>)}
                          </select>
                        </label>
                        <label className="min-w-0 space-y-1.5">
                          <span className={labelClass}>SAM Device</span>
                          <select value={stage.samDeviceMode} disabled={!stage.useSam} onChange={(event) => updateStage(stage.id, { samDeviceMode: event.target.value as PowerPrompterDetailerStage['samDeviceMode'] })} className={inputClass}>
                            <option value="AUTO">Auto</option>
                            <option value="Prefer GPU">Prefer GPU</option>
                            <option value="CPU">CPU</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="min-w-0 space-y-1.5">
                          <span className={labelClass}>SAM Hint</span>
                          <select value={stage.samDetectionHint} disabled={!stage.useSam} onChange={(event) => updateStage(stage.id, { samDetectionHint: event.target.value })} className={inputClass}>
                            {SAM_HINTS.map((hint) => <option key={hint} value={hint}>{hint}</option>)}
                          </select>
                        </label>
                        <NumberField label="SAM Threshold" value={stage.samThreshold} min={0} max={1} step={0.01} onChange={(samThreshold) => updateStage(stage.id, { samThreshold })} />
                        <NumberField label="SAM Dilation" value={stage.samDilation} min={-512} max={512} onChange={(samDilation) => updateStage(stage.id, { samDilation })} />
                        <NumberField label="BBox Expansion" value={stage.samBboxExpansion} min={0} max={1000} onChange={(samBboxExpansion) => updateStage(stage.id, { samBboxExpansion })} />
                        <NumberField label="Hint Threshold" value={stage.samMaskHintThreshold} min={0} max={1} step={0.01} onChange={(samMaskHintThreshold) => updateStage(stage.id, { samMaskHintThreshold })} />
                        <label className="min-w-0 space-y-1.5">
                          <span className={labelClass}>Negative Hint</span>
                          <select value={stage.samMaskHintUseNegative} disabled={!stage.useSam} onChange={(event) => updateStage(stage.id, { samMaskHintUseNegative: event.target.value as PowerPrompterDetailerStage['samMaskHintUseNegative'] })} className={inputClass}>
                            <option value="False">Off</option>
                            <option value="Small">Small</option>
                            <option value="Outter">Outer</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-zinc-300">
                        {([
                          ['useSam', 'Use SAM'],
                          ['noiseMask', 'Noise mask'],
                          ['forceInpaint', 'Force inpaint'],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 border border-white/10 bg-black/20 px-2 py-2">
                            <input type="checkbox" checked={stage[key]} onChange={(event) => updateStage(stage.id, { [key]: event.target.checked })} className="accent-emerald-300" />
                            {label}
                          </label>
                        ))}
                        <NumberField label="Mask Feather" value={stage.noiseMaskFeather} min={0} max={100} onChange={(noiseMaskFeather) => updateStage(stage.id, { noiseMaskFeather })} />
                      </div>
                    </div>
                  </details>

                  <details className="border-t border-white/10 pt-2">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">Prompt & VAE</summary>
                    <div className="mt-2 space-y-2">
                      <label className="block space-y-1.5">
                        <span className={labelClass}>Detail Prompt</span>
                        <textarea value={stage.wildcard} onChange={(event) => updateStage(stage.id, { wildcard: event.target.value })} className={`${inputClass} min-h-16 resize-y`} />
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <NumberField label="Cycles" value={stage.cycle} min={1} max={10} onChange={(cycle) => updateStage(stage.id, { cycle })} />
                        <label className="flex items-end gap-2 pb-2 text-[10px] text-zinc-300">
                          <input type="checkbox" checked={stage.tiledEncode} onChange={(event) => updateStage(stage.id, { tiledEncode: event.target.checked })} className="accent-emerald-300" />
                          Tiled encode
                        </label>
                        <label className="flex items-end gap-2 pb-2 text-[10px] text-zinc-300">
                          <input type="checkbox" checked={stage.tiledDecode} onChange={(event) => updateStage(stage.id, { tiledDecode: event.target.checked })} className="accent-emerald-300" />
                          Tiled decode
                        </label>
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}
            </article>
          );
        })}

        {stages.length === 0 && allowCustomStages ? (
          <button type="button" onClick={addStage} className="flex h-10 w-full items-center justify-center gap-1.5 border border-dashed border-white/10 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500 hover:border-emerald-300/25 hover:text-emerald-200">
            <Plus size={12} /> Add Detailer
          </button>
        ) : null}
      </div>
        </>
      ) : null}

      {showOutputUpscale ? (
      <div className={showDetailer ? 'mt-3 border-t border-white/10 pt-3' : ''}>
        <div className="flex items-center gap-2">
          <Maximize2 size={13} className={outputUpscale.enabled ? 'text-cyan-300' : 'text-zinc-600'} />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Output Upscale</span>
          <span className="ml-auto font-mono text-[10px] text-zinc-500">{outputUpscale.enabled ? 'MODEL' : 'OFF'}</span>
          <Toggle
            checked={outputUpscale.enabled}
            onChange={(enabled) => onOutputUpscaleChange({ ...outputUpscale, enabled })}
            title={outputUpscale.enabled ? 'Disable output upscale' : 'Enable output upscale'}
            color="cyan"
          />
        </div>
        {outputUpscale.enabled && (showOutputModelSelection || showOutputMaxDimension) ? (
          <div className={cn(
            'mt-2 grid gap-2',
            showOutputModelSelection && showOutputMaxDimension
              ? 'grid-cols-[minmax(0,1fr)_100px]'
              : 'grid-cols-1',
          )}>
            {showOutputModelSelection ? (
              <label className="min-w-0 space-y-1.5">
                <span className={labelClass}>Upscale Model</span>
                <select value={outputUpscale.modelName} onChange={(event) => onOutputUpscaleChange({ ...outputUpscale, modelName: event.target.value })} className={inputClass}>
                  {upscaleChoices.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
            ) : null}
            {showOutputMaxDimension ? (
              <NumberField
                label="Max Edge"
                value={outputUpscale.maxDimension}
                min={512}
                max={16384}
                step={8}
                onChange={(maxDimension) => onOutputUpscaleChange({ ...outputUpscale, maxDimension })}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}
    </section>
  );
}
