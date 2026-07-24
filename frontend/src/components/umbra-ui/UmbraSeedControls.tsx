'use client';

import React from 'react';
import { Dices } from 'lucide-react';
import type {
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
} from '@/types/powerPrompter';
import {
  createUmbraUiRandomSeed,
  UMBRA_UI_SEED_INCREMENT_OPTIONS,
} from '@/lib/umbraUiSeed';
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
  increment: PowerPrompterSeedIncrement;
  onSeedChange: (seed: string) => void;
  onModeChange: (mode: PowerPrompterSeedControlMode) => void;
  onIncrementChange: (increment: PowerPrompterSeedIncrement) => void;
  disabled?: boolean;
  disabledReason?: string;
  accent?: 'cyan' | 'fuchsia';
}

export function UmbraSeedControls({
  seed,
  mode,
  increment,
  onSeedChange,
  onModeChange,
  onIncrementChange,
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
      {mode === 'increment' ? (
        <div className="col-span-full space-y-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">Increment By</span>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/20 p-1">
            {UMBRA_UI_SEED_INCREMENT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => onIncrementChange(option)}
                className={cn(
                  'h-8 rounded border text-[10px] font-black transition-colors disabled:cursor-not-allowed disabled:text-zinc-700',
                  increment === option
                    ? accent === 'fuchsia'
                      ? 'border-fuchsia-300/35 bg-fuchsia-500/15 text-fuchsia-100'
                      : 'border-cyan-300/35 bg-cyan-500/15 text-cyan-100'
                    : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-200',
                )}
              >
                +{option.toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UmbraSeedControls;
