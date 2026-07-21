'use client';

import React from 'react';
import { Dices } from 'lucide-react';
import type { PowerPrompterSeedControlMode } from '@/types/powerPrompter';
import { createUmbraUiRandomSeed } from '@/lib/umbraUiSeed';
import { cn } from '@/lib/utils';

const SEED_MODE_OPTIONS: Array<{ value: PowerPrompterSeedControlMode; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'increment', label: 'Increment' },
  { value: 'decrement', label: 'Decrement' },
  { value: 'randomize', label: 'Random' },
];

interface UmbraSeedControlsProps {
  seed: string;
  mode: PowerPrompterSeedControlMode;
  onSeedChange: (seed: string) => void;
  onModeChange: (mode: PowerPrompterSeedControlMode) => void;
  disabled?: boolean;
  disabledReason?: string;
  accent?: 'cyan' | 'fuchsia';
}

export function UmbraSeedControls({
  seed,
  mode,
  onSeedChange,
  onModeChange,
  disabled = false,
  disabledReason = '',
  accent = 'cyan',
}: UmbraSeedControlsProps) {
  const focusClass = accent === 'fuchsia' ? 'focus:border-fuchsia-300/45' : 'focus:border-cyan-300/45';
  const buttonClass = accent === 'fuchsia'
    ? 'hover:border-fuchsia-300/35 hover:text-fuchsia-200'
    : 'hover:border-cyan-300/35 hover:text-cyan-200';
  const title = disabled ? disabledReason || 'Seed is fixed by this model pipeline.' : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,0.8fr)_34px] items-end gap-2" title={title}>
      <label className="min-w-0 space-y-1.5">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">Seed</span>
        <input
          type="text"
          inputMode="numeric"
          value={seed}
          disabled={disabled}
          onChange={(event) => onSeedChange(event.target.value.replace(/[^0-9]/g, ''))}
          className={cn(
            'h-9 w-full rounded-md border border-white/10 bg-black/35 px-2.5 text-xs text-zinc-100 outline-none transition-colors disabled:cursor-not-allowed disabled:text-zinc-600',
            focusClass,
          )}
        />
      </label>
      <label className="min-w-0 space-y-1.5">
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">After Generation</span>
        <select
          value={mode}
          disabled={disabled}
          onChange={(event) => onModeChange(event.target.value as PowerPrompterSeedControlMode)}
          className={cn(
            'h-9 w-full rounded-md border border-white/10 bg-black/35 px-2.5 text-xs text-zinc-100 outline-none transition-colors disabled:cursor-not-allowed disabled:text-zinc-600',
            focusClass,
          )}
        >
          {SEED_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSeedChange(String(createUmbraUiRandomSeed()))}
        className={cn(
          'inline-flex h-9 w-[34px] items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors disabled:cursor-not-allowed disabled:text-zinc-700',
          buttonClass,
        )}
        title={disabled ? title : 'Choose a random seed'}
      >
        <Dices size={14} />
      </button>
    </div>
  );
}

export default UmbraSeedControls;
