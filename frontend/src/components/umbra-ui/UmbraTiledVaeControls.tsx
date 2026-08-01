'use client';

import { Grid3X3 } from 'lucide-react';
import type { PowerPrompterTiledVaeControls } from '@/types/powerPrompter';

interface UmbraTiledVaeControlsProps {
  value: PowerPrompterTiledVaeControls;
  onChange: (value: PowerPrompterTiledVaeControls) => void;
  mode: 'txt2img' | 'img2img' | 'inpaint';
}

const inputClass = 'w-full border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[10px] text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';

export function UmbraTiledVaeControls({ value, onChange, mode }: UmbraTiledVaeControlsProps) {
  const operation = mode === 'txt2img' ? 'Decode only' : 'Encode + decode';
  const update = (changes: Partial<PowerPrompterTiledVaeControls>) => onChange({ ...value, ...changes });

  return (
    <details className="border border-white/10 bg-black/15" data-umbra-tiled-vae-controls="">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300 marker:content-none">
        <Grid3X3 size={13} className="text-cyan-300" />
        <span>Tiled VAE</span>
        <span className="ml-auto font-mono text-[9px] font-semibold normal-case tracking-normal text-zinc-500">{value.enabled ? operation : 'Off'}</span>
      </summary>
      <div className="space-y-3 border-t border-white/10 p-3">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 border border-white/10 bg-white/[0.02] px-2.5">
          <input
            type="checkbox"
            role="switch"
            checked={value.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
            className="h-4 w-4 shrink-0 accent-cyan-300"
          />
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-200">Use tiled VAE</span>
          <span className="ml-auto text-[9px] text-zinc-500">{operation}</span>
        </label>
        <p className="text-[10px] leading-4 text-zinc-500">
          Lowers VAE memory spikes by processing image tiles. It changes only standard VAE encode/decode nodes and may take longer.
        </p>
        {value.enabled ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Tile size</span>
              <select value={value.tileSize} onChange={(event) => update({ tileSize: Number(event.target.value) })} className={inputClass}>
                {[256, 384, 512, 768, 1024, 1536].map((size) => <option key={size} value={size}>{size}px</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Overlap</span>
              <select value={value.overlap} onChange={(event) => update({ overlap: Number(event.target.value) })} className={inputClass}>
                {[0, 32, 64, 96, 128, 192, 256].map((size) => <option key={size} value={size}>{size}px</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </details>
  );
}
