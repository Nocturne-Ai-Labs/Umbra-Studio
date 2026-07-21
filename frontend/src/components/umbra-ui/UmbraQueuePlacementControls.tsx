'use client';

import React from 'react';
import { ListPlus, Radio, SkipForward, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  UmbraQueuePlacement,
  UmbraQueueSummary,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';

export function useUmbraQueuePlacement(queueSummary: UmbraQueueSummary) {
  const [placement, setPlacement] = React.useState<UmbraQueuePlacement>('next');

  React.useEffect(() => {
    if (placement === 'interrupt' && queueSummary.powerPrompterRunning <= 0) {
      setPlacement('next');
    }
  }, [placement, queueSummary.powerPrompterRunning]);

  const effectivePlacement: UmbraQueuePlacement = queueSummary.powerPrompterActive
    ? placement === 'interrupt' && queueSummary.powerPrompterRunning <= 0 ? 'next' : placement
    : 'end';

  return { placement, setPlacement, effectivePlacement };
}

interface UmbraQueuePlacementControlsProps {
  queueSummary: UmbraQueueSummary;
  value: UmbraQueuePlacement;
  onChange: (placement: UmbraQueuePlacement) => void;
  subject?: string;
}

export function UmbraQueuePlacementControls({
  queueSummary,
  value,
  onChange,
  subject = 'job',
}: UmbraQueuePlacementControlsProps) {
  if (!queueSummary.powerPrompterActive) return null;

  return (
    <div className="border border-amber-300/20 bg-amber-500/[0.045] p-2">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <Radio size={11} className="text-amber-300" />
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">Power Prompter Queue Active</span>
        <span className="ml-auto font-mono text-[9px] text-amber-200/70">{queueSummary.powerPrompterRemaining} left</span>
      </div>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Power Prompter submission position">
        <button
          type="button"
          role="radio"
          aria-checked={value === 'next'}
          onClick={() => onChange('next')}
          className={cn(
            'inline-flex min-h-9 items-center justify-center gap-1 border px-1.5 text-[8px] font-black uppercase tracking-[0.08em] transition-colors',
            value === 'next'
              ? 'border-cyan-300/40 bg-cyan-500/[0.12] text-cyan-100'
              : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-200',
          )}
          title={`Finish the current Power Prompter image, then run this ${subject} next`}
        >
          <SkipForward size={10} /> Run Next
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'end'}
          onClick={() => onChange('end')}
          className={cn(
            'inline-flex min-h-9 items-center justify-center gap-1 border px-1.5 text-[8px] font-black uppercase tracking-[0.08em] transition-colors',
            value === 'end'
              ? 'border-emerald-300/40 bg-emerald-500/[0.12] text-emerald-100'
              : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-200',
          )}
          title={`Add this ${subject} after all remaining Power Prompter work`}
        >
          <ListPlus size={10} /> Add to End
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'interrupt'}
          onClick={() => onChange('interrupt')}
          disabled={queueSummary.powerPrompterRunning <= 0}
          className={cn(
            'inline-flex min-h-9 items-center justify-center gap-1 border px-1.5 text-[8px] font-black uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-700',
            value === 'interrupt'
              ? 'border-rose-300/40 bg-rose-500/[0.12] text-rose-100'
              : 'border-white/10 bg-black/20 text-zinc-500 hover:text-zinc-200',
          )}
          title={queueSummary.powerPrompterRunning > 0
            ? `Stop the current Power Prompter image and run this ${subject} immediately after it stops`
            : 'No Power Prompter image is currently running'}
        >
          <Square size={9} /> Stop & Run Now
        </button>
      </div>
    </div>
  );
}
