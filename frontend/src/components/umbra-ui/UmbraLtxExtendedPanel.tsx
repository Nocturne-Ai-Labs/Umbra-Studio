'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { UmbraLtxExtendedClip } from '../../../../shared/umbra-ui/videoExtension';
import {
  UMBRA_LTX_EXTENDED_MAX_CLIPS,
  UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS,
  UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS,
  resolveUmbraLtxExtendedTotalSeconds,
} from '../../../../shared/umbra-ui/videoExtension';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500';

interface UmbraLtxExtendedPanelProps {
  clips: UmbraLtxExtendedClip[];
  onClipsChange: (clips: UmbraLtxExtendedClip[]) => void;
  onAddClip: () => void;
  onClose: () => void;
}

export function UmbraLtxExtendedPanel({
  clips,
  onClipsChange,
  onAddClip,
  onClose,
}: UmbraLtxExtendedPanelProps) {
  const totalSeconds = resolveUmbraLtxExtendedTotalSeconds({ enabled: true, clips });

  const updateClip = React.useCallback((id: string, patch: Partial<UmbraLtxExtendedClip>) => {
    onClipsChange(clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip));
  }, [clips, onClipsChange]);

  const moveClip = React.useCallback((id: string, direction: -1 | 1) => {
    const index = clips.findIndex((clip) => clip.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= clips.length) return;
    const next = [...clips];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onClipsChange(next);
  }, [clips, onClipsChange]);

  const removeClip = React.useCallback((id: string) => {
    if (clips.length <= 1) return;
    onClipsChange(clips.filter((clip) => clip.id !== id));
  }, [clips, onClipsChange]);

  return (
    <aside
      data-umbra-ltx-extended=""
      className="relative min-h-0 overflow-y-auto border-r border-cyan-300/15 bg-[#05090a] p-3 custom-scrollbar"
    >
      <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-500/[0.08] text-cyan-200">
          <Clock3 size={14} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-100">LTX Extended</h2>
          <p className="font-mono text-[9px] text-zinc-500">
            {clips.length} clips / {totalSeconds.toFixed(1)} seconds total
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-red-300/20 hover:text-red-200"
          title="Close LTX Extended"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mb-3 rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] p-2.5">
        <span className="flex items-center gap-2">
          <span className={labelClass}>Sequence Duration</span>
          <span className="ml-auto font-mono text-[11px] font-bold text-cyan-100">
            {totalSeconds.toFixed(1)} / {UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS}s
          </span>
        </span>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/55">
          <div
            className="h-full bg-cyan-300/75 transition-[width]"
            style={{ width: `${Math.min(100, totalSeconds / UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS * 100)}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[8px] leading-relaxed text-zinc-600">
          Each completed clip continues from the final frame of the clip before it.
        </p>
      </div>

      <div className="space-y-2">
        {clips.map((clip, index) => (
          <article key={clip.id} className="rounded-md border border-white/10 bg-black/25 p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-cyan-300/20 bg-cyan-500/[0.06] px-1.5 font-mono text-[9px] font-bold text-cyan-100">
                {index + 1}
              </span>
              <span className={labelClass}>Continuation Clip</span>
              <button
                type="button"
                onClick={() => moveClip(clip.id, -1)}
                disabled={index === 0}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:opacity-25"
                title="Move clip earlier"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                onClick={() => moveClip(clip.id, 1)}
                disabled={index === clips.length - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:opacity-25"
                title="Move clip later"
              >
                <ArrowDown size={11} />
              </button>
              <button
                type="button"
                onClick={() => removeClip(clip.id)}
                disabled={clips.length <= 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-300/15 text-zinc-600 hover:text-red-200 disabled:opacity-25"
                title="Remove clip"
              >
                <Trash2 size={11} />
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className={labelClass}>Clip Prompt</span>
              <textarea
                value={clip.prompt}
                onChange={(event) => updateClip(clip.id, { prompt: event.target.value.replace(/\|/g, ',') })}
                maxLength={40_000}
                placeholder={index === 0
                  ? 'Describe the opening scene and motion.'
                  : 'Describe how the action and camera continue from the previous clip.'}
                className={`${inputClass} min-h-24 resize-y leading-relaxed`}
              />
            </label>

            <label className="mt-2 block space-y-1.5">
              <span className="flex items-center gap-2">
                <span className={labelClass}>Clip Duration</span>
                <span className="ml-auto font-mono text-[9px] font-bold text-cyan-100">
                  {clip.durationSeconds.toFixed(1)}s
                </span>
              </span>
              <input
                type="range"
                min={1}
                max={UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS}
                step={0.5}
                value={clip.durationSeconds}
                onChange={(event) => updateClip(clip.id, {
                  durationSeconds: Math.max(
                    1,
                    Math.min(UMBRA_LTX_EXTENDED_MAX_CLIP_SECONDS, Number(event.target.value) || 1),
                  ),
                })}
                className="h-4 w-full cursor-pointer accent-cyan-300"
                aria-label={`Clip ${index + 1} duration in seconds`}
              />
            </label>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddClip}
        disabled={clips.length >= UMBRA_LTX_EXTENDED_MAX_CLIPS}
        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/20 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/[0.08] disabled:text-zinc-700"
      >
        <Plus size={12} /> Add Clip
      </button>
    </aside>
  );
}

export default UmbraLtxExtendedPanel;
