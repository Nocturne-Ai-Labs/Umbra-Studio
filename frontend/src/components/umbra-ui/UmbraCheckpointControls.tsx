'use client';

import React from 'react';
import { Database, FolderSearch, RefreshCw } from 'lucide-react';
import type { PowerPrompterModelType } from '@/types/powerPrompter';

export interface UmbraPrimaryModelTypeOption {
  value: PowerPrompterModelType;
  label: string;
}

interface UmbraCheckpointControlsProps {
  checkpointName: string;
  availableCount: number;
  loading?: boolean;
  clipSkip: string;
  onClipSkipChange: (value: string) => void;
  onChoose: () => void;
  onRefresh?: () => void;
  error?: string;
  accent?: 'cyan' | 'rose';
  heading?: string;
  modelLabel?: string;
  emptyLabel?: string;
  modelType?: PowerPrompterModelType;
  modelTypeOptions?: UmbraPrimaryModelTypeOption[];
  onModelTypeChange?: (value: PowerPrompterModelType) => void;
  showClipSkip?: boolean;
}

const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400';

export function UmbraCheckpointControls({
  checkpointName,
  availableCount,
  loading = false,
  clipSkip,
  onClipSkipChange,
  onChoose,
  onRefresh,
  error = '',
  accent = 'cyan',
  heading = 'Checkpoint',
  modelLabel = 'Model',
  emptyLabel = 'Choose checkpoint',
  modelType,
  modelTypeOptions = [],
  onModelTypeChange,
  showClipSkip = true,
}: UmbraCheckpointControlsProps) {
  const selectionRequired = !String(checkpointName || '').trim();
  const accentClasses = accent === 'rose'
    ? 'border-rose-300/20 bg-rose-500/[0.045] hover:border-rose-300/40 hover:text-rose-100'
    : 'border-cyan-300/20 bg-cyan-500/[0.045] hover:border-cyan-300/40 hover:text-cyan-100';
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Database size={13} className={accent === 'rose' ? 'text-rose-300' : 'text-cyan-300'} />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">{heading}</span>
        <span className={selectionRequired ? 'ml-auto font-mono text-[9px] text-amber-300/90' : 'ml-auto font-mono text-[9px] text-zinc-500'}>
          {loading ? 'scanning' : selectionRequired ? 'selection required' : `${availableCount} available`}
        </span>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 transition-colors hover:border-cyan-300/30 hover:text-cyan-200 disabled:text-zinc-700"
            title="Refresh model catalog"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        ) : null}
      </div>
      <div className={modelType && onModelTypeChange
        ? showClipSkip
          ? 'grid grid-cols-[100px_minmax(0,1fr)_76px] gap-2'
          : 'grid grid-cols-[100px_minmax(0,1fr)] gap-2'
        : showClipSkip
          ? 'grid grid-cols-[minmax(0,1fr)_76px] gap-2'
          : 'grid grid-cols-1 gap-2'}>
        {modelType && onModelTypeChange ? (
          <label className="min-w-0 space-y-1.5">
            <span className={labelClass}>Source</span>
            <select
              value={modelType}
              onChange={(event) => onModelTypeChange(event.target.value as PowerPrompterModelType)}
              disabled={modelTypeOptions.length <= 1}
              title={modelTypeOptions.length <= 1 ? 'Model source is fixed by this pipeline' : 'Model source'}
              className="h-10 w-full min-w-0 rounded-md border border-white/10 bg-black/35 px-2.5 font-mono text-[10px] text-zinc-100 outline-none focus:border-cyan-300/45"
            >
              {modelTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="min-w-0 space-y-1.5">
          <span className={labelClass}>{modelLabel}</span>
          <button
            type="button"
            onClick={onChoose}
            aria-invalid={selectionRequired}
            className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 text-left text-xs text-zinc-100 transition-colors ${selectionRequired ? 'border-amber-300/35 bg-amber-500/[0.05] hover:border-amber-300/55' : accentClasses}`}
            title={checkpointName || emptyLabel}
          >
            <FolderSearch size={13} className="shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{checkpointName || emptyLabel}</span>
          </button>
        </div>
        {showClipSkip ? (
          <label className="space-y-1.5">
            <span className={labelClass}>CLIP Skip</span>
            <input
              value={clipSkip}
              onChange={(event) => onClipSkipChange(event.target.value)}
              inputMode="numeric"
              className="h-10 w-full rounded-md border border-white/10 bg-black/35 px-2 text-center text-sm text-zinc-100 outline-none focus:border-cyan-300/45"
            />
          </label>
        ) : null}
      </div>
      {error ? <div className="mt-2 truncate font-mono text-[9px] text-amber-200/80" title={error}>{error}</div> : null}
    </section>
  );
}
