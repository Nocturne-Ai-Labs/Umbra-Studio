'use client';

import React from 'react';
import { Loader2, OctagonX, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UmbraQueueSummary } from '@/components/umbra-ui/useUmbraPowerPrompterBridge';

interface UmbraQueueEmergencyControlsProps {
  queueSummary: UmbraQueueSummary;
  busyAction: 'skip' | 'stop' | '';
  onSkip: () => void;
  onStopAll: () => void;
  mobileOnly?: boolean;
}

export function UmbraQueueEmergencyControls({
  queueSummary,
  busyAction,
  onSkip,
  onStopAll,
  mobileOnly = false,
}: UmbraQueueEmergencyControlsProps) {
  const skipDisabled = busyAction !== '' || !queueSummary.umbraUiActive;
  const stopDisabled = busyAction !== '' || queueSummary.umbraUiRemaining <= 0;

  return (
    <div
      data-umbra-ui-queue-emergency-controls=""
      data-mobile-only={mobileOnly ? '1' : '0'}
      className={cn(
        'items-center gap-1.5',
        mobileOnly ? 'hidden' : 'flex',
      )}
      aria-label="Umbra UI generation controls"
    >
      <button
        type="button"
        onClick={onSkip}
        disabled={skipDisabled}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-500/[0.07] px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100 transition-colors hover:bg-amber-500/[0.13] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-700"
        title={queueSummary.umbraUiActive
          ? 'Skip the currently generating Umbra UI item'
          : 'No Umbra UI generation is currently running'}
      >
        {busyAction === 'skip' ? <Loader2 size={12} className="animate-spin" /> : <SkipForward size={12} />}
        Skip
      </button>
      <button
        type="button"
        onClick={onStopAll}
        disabled={stopDisabled}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-red-300/25 bg-red-500/[0.07] px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-red-100 transition-colors hover:bg-red-500/[0.13] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-700"
        title={queueSummary.umbraUiRemaining > 0
          ? `Stop ${queueSummary.umbraUiRemaining} running or queued Umbra UI item${queueSummary.umbraUiRemaining === 1 ? '' : 's'}`
          : 'No Umbra UI generations are running or queued'}
      >
        {busyAction === 'stop' ? <Loader2 size={12} className="animate-spin" /> : <OctagonX size={12} />}
        Stop All
      </button>
    </div>
  );
}
