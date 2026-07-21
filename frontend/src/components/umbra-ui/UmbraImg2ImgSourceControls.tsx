'use client';

import React from 'react';
import { Image as ImageIcon, Loader2, Maximize2, RefreshCw, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UmbraImg2ImgSourceValue {
  path: string;
  originalPath: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
}

interface UmbraImg2ImgSourceControlsProps {
  source: UmbraImg2ImgSourceValue;
  denoise: number;
  replaceSourceOnComplete: boolean;
  onSourceChange: (source: UmbraImg2ImgSourceValue) => void;
  onDenoiseChange: (denoise: number) => void;
  onReplaceSourceOnCompleteChange: (enabled: boolean) => void;
  onUseSourceSize: (width: number, height: number) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/45';

function clampDenoise(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0.01, Math.min(1, numeric)) : 0.3;
}

function denoiseBand(denoise: number): { label: string; className: string; description: string } {
  if (denoise <= 0.2) {
    return {
      label: 'Preserve',
      className: 'border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-100',
      description: 'Subtle surface and texture changes',
    };
  }
  if (denoise <= 0.45) {
    return {
      label: 'Adjust',
      className: 'border-cyan-300/25 bg-cyan-500/[0.08] text-cyan-100',
      description: 'Visible changes with composition retained',
    };
  }
  return {
    label: 'Redraw',
    className: 'border-amber-300/25 bg-amber-500/[0.08] text-amber-100',
    description: 'Strong reinterpretation of the source',
  };
}

export function UmbraImg2ImgSourceControls({
  source,
  denoise,
  replaceSourceOnComplete,
  onSourceChange,
  onDenoiseChange,
  onReplaceSourceOnCompleteChange,
  onUseSourceSize,
  showToast,
}: UmbraImg2ImgSourceControlsProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const previewUrl = source.imageUrl || (source.path
    ? `/api/fs/image?${new URLSearchParams({ path: source.path }).toString()}`
    : '');
  const band = denoiseBand(denoise);

  const upload = React.useCallback(async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      const response = await fetch('/api/comfy/upload-media', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-umbra-media-kind': 'image',
          'x-umbra-file-name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false || !payload?.sourcePath || !payload?.filename) {
        throw new Error(String(payload?.error || 'Failed to upload the IMG2IMG source.'));
      }
      const path = String(payload.sourcePath).replace(/\\/g, '/');
      onSourceChange({ path, originalPath: path, name: String(payload.filename), imageUrl: '', width: 0, height: 0 });
      showToast('IMG2IMG source loaded.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to upload the IMG2IMG source.', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onSourceChange, showToast, uploading]);

  return (
    <section className="border border-cyan-300/20 bg-cyan-500/[0.035] p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <ImageIcon size={13} className="text-cyan-300" />
        <h3 className="text-[11px] font-black uppercase tracking-[0.13em] text-zinc-200">Source Image</h3>
        {source.width > 0 && source.height > 0 ? (
          <span className="ml-auto font-mono text-[10px] text-zinc-500">{source.width} x {source.height}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
        <div className="flex h-28 items-center justify-center overflow-hidden border border-white/10 bg-black/45">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="IMG2IMG source"
              className="h-full w-full object-contain"
              onLoad={(event) => {
                const nextWidth = event.currentTarget.naturalWidth;
                const nextHeight = event.currentTarget.naturalHeight;
                if (nextWidth === source.width && nextHeight === source.height) return;
                onSourceChange({ ...source, width: nextWidth, height: nextHeight });
              }}
            />
          ) : <ImageIcon size={22} className="text-zinc-700" />}
        </div>

        <div className="min-w-0 space-y-2">
          <input
            value={source.path}
            onChange={(event) => onSourceChange({
              path: event.target.value,
              originalPath: event.target.value,
              name: '',
              imageUrl: '',
              width: 0,
              height: 0,
            })}
            placeholder="Paste a local image path or choose a file"
            className={inputClass}
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.avif,.bmp,.jpeg,.jpg,.png,.tif,.tiff,.webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-cyan-300/20 bg-cyan-500/[0.06] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-500/[0.11] disabled:opacity-40"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Choose
            </button>
            <button
              type="button"
              onClick={() => onUseSourceSize(source.width, source.height)}
              disabled={source.width <= 0 || source.height <= 0}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-white/10 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400 hover:border-white/20 hover:text-zinc-200 disabled:opacity-30"
              title="Use the source image dimensions as the working resolution"
            >
              <Maximize2 size={11} /> Size
            </button>
            <button
              type="button"
              onClick={() => onSourceChange({ path: '', originalPath: '', name: '', imageUrl: '', width: 0, height: 0 })}
              disabled={!source.path && !source.name}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-red-300/25 hover:text-red-300 disabled:opacity-30"
              title="Clear IMG2IMG source"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>

      <label
        className={cn(
          'mt-3 flex min-h-9 items-center gap-2 border bg-black/20 px-2.5 transition-colors',
          replaceSourceOnComplete ? 'border-amber-300/30 bg-amber-500/[0.06]' : 'border-white/10',
          source.path || source.name ? 'cursor-pointer hover:border-amber-300/30' : 'cursor-not-allowed opacity-40',
        )}
        title="After a successful IMG2IMG job, overwrite the original Gallery image. Umbra saves a recovery copy first."
      >
        <input
          type="checkbox"
          checked={replaceSourceOnComplete}
          disabled={!source.path && !source.name}
          onChange={(event) => onReplaceSourceOnCompleteChange(event.target.checked)}
          className="accent-amber-300"
        />
        <RefreshCw size={11} className="text-amber-300/80" />
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300">Replace original file on completion</span>
        <span className={cn('ml-auto font-mono text-[9px] uppercase', replaceSourceOnComplete ? 'text-amber-200' : 'text-zinc-600')}>
          {replaceSourceOnComplete ? 'Backup on' : 'Off'}
        </span>
      </label>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-300">Denoise</span>
          <span className={cn('rounded-sm border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]', band.className)}>
            {band.label}
          </span>
          <span className="ml-auto text-[10px] text-zinc-500">{band.description}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_68px] items-center gap-2">
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={denoise}
            onChange={(event) => onDenoiseChange(clampDenoise(event.target.value))}
            className="w-full accent-cyan-300"
          />
          <input
            value={denoise.toFixed(2)}
            onChange={(event) => onDenoiseChange(clampDenoise(event.target.value))}
            inputMode="decimal"
            className={`${inputClass} text-center font-mono`}
          />
        </div>
      </div>
    </section>
  );
}
