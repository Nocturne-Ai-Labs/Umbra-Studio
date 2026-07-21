'use client';

import React from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PowerPrompterHiresResizeMode } from '@/types/powerPrompter';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400';

const BUILTIN_UPSCALERS = [
  'Latent',
  'Latent (nearest-exact)',
  'Latent (bilinear)',
  'Latent (area)',
  'Latent (bicubic)',
  'Latent (bislerp)',
  'Nearest',
  'Bilinear',
  'Area',
  'Bicubic',
  'Lanczos',
];

interface UmbraHiresFixControlsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  upscaler: string;
  onUpscalerChange: (upscaler: string) => void;
  upscaleModels: string[];
  resizeMode: PowerPrompterHiresResizeMode;
  onResizeModeChange: (mode: PowerPrompterHiresResizeMode) => void;
  scaleBy: number;
  onScaleByChange: (scale: number) => void;
  targetWidth: string;
  onTargetWidthChange: (width: string) => void;
  targetHeight: string;
  onTargetHeightChange: (height: string) => void;
  baseWidth: number;
  baseHeight: number;
  steps: string;
  onStepsChange: (steps: string) => void;
  denoise: number;
  onDenoiseChange: (denoise: number) => void;
  cfg: string;
  onCfgChange: (cfg: string) => void;
  samplerName: string;
  onSamplerNameChange: (sampler: string) => void;
  scheduler: string;
  onSchedulerChange: (scheduler: string) => void;
  samplerOptions: string[];
  schedulerOptions: string[];
  resizeModes?: PowerPrompterHiresResizeMode[];
  showUpscaler?: boolean;
  showSteps?: boolean;
  showDenoise?: boolean;
  showCfg?: boolean;
  showSampler?: boolean;
  showScheduler?: boolean;
}

function roundToEight(value: number): number {
  return Math.max(8, Math.round(value / 8) * 8);
}

function resolveOutputSize(
  resizeMode: PowerPrompterHiresResizeMode,
  baseWidth: number,
  baseHeight: number,
  scaleBy: number,
  rawWidth: string,
  rawHeight: string,
): { width: number; height: number } {
  const safeBaseWidth = Math.max(8, Number.isFinite(baseWidth) ? baseWidth : 1024);
  const safeBaseHeight = Math.max(8, Number.isFinite(baseHeight) ? baseHeight : 1024);
  if (resizeMode === 'scale') {
    return {
      width: roundToEight(safeBaseWidth * scaleBy),
      height: roundToEight(safeBaseHeight * scaleBy),
    };
  }

  let width = Math.max(0, Number(rawWidth) || 0);
  let height = Math.max(0, Number(rawHeight) || 0);
  if (width <= 0 && height <= 0) {
    width = safeBaseWidth * scaleBy;
    height = safeBaseHeight * scaleBy;
  } else if (width <= 0) {
    width = height * safeBaseWidth / safeBaseHeight;
  } else if (height <= 0) {
    height = width * safeBaseHeight / safeBaseWidth;
  }
  return { width: roundToEight(width), height: roundToEight(height) };
}

export function UmbraHiresFixControls({
  enabled,
  onEnabledChange,
  upscaler,
  onUpscalerChange,
  upscaleModels,
  resizeMode,
  onResizeModeChange,
  scaleBy,
  onScaleByChange,
  targetWidth,
  onTargetWidthChange,
  targetHeight,
  onTargetHeightChange,
  baseWidth,
  baseHeight,
  steps,
  onStepsChange,
  denoise,
  onDenoiseChange,
  cfg,
  onCfgChange,
  samplerName,
  onSamplerNameChange,
  scheduler,
  onSchedulerChange,
  samplerOptions,
  schedulerOptions,
  resizeModes = ['scale', 'dimensions'],
  showUpscaler = true,
  showSteps = true,
  showDenoise = true,
  showCfg = true,
  showSampler = true,
  showScheduler = true,
}: UmbraHiresFixControlsProps) {
  const supportedResizeModes = React.useMemo(() => Array.from(new Set(resizeModes
    .filter((mode): mode is PowerPrompterHiresResizeMode => mode === 'scale' || mode === 'dimensions'))), [resizeModes]);
  const effectiveResizeMode = supportedResizeModes.includes(resizeMode)
    ? resizeMode
    : supportedResizeModes[0] || 'scale';
  const upscalerOptions = React.useMemo(() => Array.from(new Set([
    ...BUILTIN_UPSCALERS,
    ...upscaleModels,
    upscaler,
  ].filter(Boolean))), [upscaleModels, upscaler]);
  const outputSize = resolveOutputSize(effectiveResizeMode, baseWidth, baseHeight, scaleBy, targetWidth, targetHeight);

  React.useEffect(() => {
    if (supportedResizeModes.length <= 0) {
      if (enabled) onEnabledChange(false);
      return;
    }
    if (effectiveResizeMode !== resizeMode) onResizeModeChange(effectiveResizeMode);
  }, [effectiveResizeMode, enabled, onEnabledChange, onResizeModeChange, resizeMode, supportedResizeModes]);

  return (
    <section className={cn(
      'rounded-md border p-2.5 transition-colors',
      enabled ? 'border-cyan-300/25 bg-cyan-500/[0.045]' : 'border-white/10 bg-white/[0.02]',
    )}>
      <div className="flex items-center gap-2">
        <Maximize2 size={13} className={enabled ? 'text-cyan-300' : 'text-zinc-600'} />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Hires Fix</span>
        <span className={cn('ml-auto font-mono text-[10px]', enabled ? 'text-cyan-200' : 'text-zinc-500')}>
          {enabled ? `${outputSize.width}x${outputSize.height}` : 'OFF'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onEnabledChange(!enabled)}
          disabled={supportedResizeModes.length <= 0}
          className={cn(
            'relative h-5 w-9 rounded-full border transition-colors',
            enabled ? 'border-cyan-300/40 bg-cyan-400/25' : 'border-white/15 bg-black/35',
          )}
          title={enabled ? 'Disable Hires Fix' : 'Enable Hires Fix'}
        >
          <span className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color]',
            enabled ? 'left-[18px] bg-cyan-200' : 'left-0.5 bg-zinc-600',
          )} />
        </button>
      </div>

      {enabled ? (
        <div className="mt-3 space-y-3">
          {showUpscaler ? (
            <label className="block space-y-1.5">
              <span className={labelClass}>Upscaler</span>
              <select value={upscaler} onChange={(event) => onUpscalerChange(event.target.value)} className={inputClass}>
                {upscalerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ) : null}

          {supportedResizeModes.length > 1 ? (
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-white/10">
              {supportedResizeModes.includes('scale') ? (
                <button
                  type="button"
                  onClick={() => onResizeModeChange('scale')}
                  className={cn(
                    'h-9 text-[10px] font-black uppercase tracking-[0.1em] transition-colors',
                    effectiveResizeMode === 'scale' ? 'bg-cyan-500/[0.13] text-cyan-100' : 'bg-black/25 text-zinc-600 hover:text-zinc-300',
                  )}
                >
                  Scale By
                </button>
              ) : null}
              {supportedResizeModes.includes('dimensions') ? (
                <button
                  type="button"
                  onClick={() => onResizeModeChange('dimensions')}
                  className={cn(
                    'h-9 border-l border-white/10 text-[10px] font-black uppercase tracking-[0.1em] transition-colors',
                    effectiveResizeMode === 'dimensions' ? 'bg-cyan-500/[0.13] text-cyan-100' : 'bg-black/25 text-zinc-600 hover:text-zinc-300',
                  )}
                >
                  Resize To
                </button>
              ) : null}
            </div>
          ) : null}

          {supportedResizeModes.includes('scale') && effectiveResizeMode === 'scale' ? (
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between">
                <span className={labelClass}>Resolution Scale</span>
                <span className="font-mono text-[10px] text-cyan-200">{scaleBy.toFixed(2)}x</span>
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={scaleBy}
                onChange={(event) => onScaleByChange(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-cyan-300"
              />
            </label>
          ) : supportedResizeModes.includes('dimensions') ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5">
                <span className={labelClass}>Target Width</span>
                <input type="number" min={0} max={16384} step={8} value={targetWidth} onChange={(event) => onTargetWidthChange(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Target Height</span>
                <input type="number" min={0} max={16384} step={8} value={targetHeight} onChange={(event) => onTargetHeightChange(event.target.value)} className={inputClass} />
              </label>
            </div>
          ) : null}

          {showDenoise ? (
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between">
                <span className={labelClass}>Denoise</span>
                <span className="font-mono text-[10px] text-cyan-200">{denoise.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={denoise}
                onChange={(event) => onDenoiseChange(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-cyan-300"
              />
            </label>
          ) : null}

          {showSteps || showCfg ? (
            <div className={showSteps && showCfg ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
              {showSteps ? (
                <label className="space-y-1.5">
                  <span className={labelClass}>Hires Steps</span>
                  <input type="number" min={0} max={10000} step={1} value={steps} onChange={(event) => onStepsChange(event.target.value)} className={inputClass} />
                </label>
              ) : null}
              {showCfg ? (
                <label className="space-y-1.5">
                  <span className={labelClass}>Hires CFG</span>
                  <input type="number" min={0} max={100} step={0.1} value={cfg} onChange={(event) => onCfgChange(event.target.value)} className={inputClass} />
                </label>
              ) : null}
            </div>
          ) : null}

          {showSampler || showScheduler ? (
            <div className={showSampler && showScheduler ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
              {showSampler ? (
                <label className="min-w-0 space-y-1.5">
                  <span className={labelClass}>Hires Sampler</span>
                  <select value={samplerName} onChange={(event) => onSamplerNameChange(event.target.value)} className={inputClass}>
                    <option value="use_same">Use same</option>
                    {samplerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ) : null}
              {showScheduler ? (
                <label className="min-w-0 space-y-1.5">
                  <span className={labelClass}>Hires Scheduler</span>
                  <select value={scheduler} onChange={(event) => onSchedulerChange(event.target.value)} className={inputClass}>
                    <option value="use_same">Use same</option>
                    {schedulerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
