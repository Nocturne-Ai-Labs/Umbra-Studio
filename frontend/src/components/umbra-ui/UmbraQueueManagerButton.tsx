import React from 'react';
import { ListOrdered } from 'lucide-react';
import { countUnfinishedQueueItems, usePowerPrompterStagedCount, useUmbraQueueActivities } from '@/lib/umbraQueueActivity';
import { cn } from '@/lib/utils';

export function UmbraQueueManagerButton({ remaining, active, onClick }: { remaining: number; active: boolean; onClick: () => void }) {
  const activities = useUmbraQueueActivities();
  const staged = usePowerPrompterStagedCount();
  const count = countUnfinishedQueueItems(remaining, staged, activities);
  const descriptionId = React.useId();
  return <button
    type="button" data-umbra-ui-queue-manager-button="" onClick={onClick}
    aria-label="Queue Manager" aria-describedby={descriptionId} aria-pressed={active}
    title={`Queue Manager - ${count} unfinished item${count === 1 ? '' : 's'}`}
    className={cn(
      'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-[10px] font-black uppercase transition-colors',
      active ? 'border-[var(--umbra-accent)] bg-[var(--umbra-panel-bg)] text-[var(--umbra-accent)]'
        : 'border-white/15 bg-black/20 text-[var(--umbra-text)] hover:border-[var(--umbra-accent)]',
    )}>
    <ListOrdered size={15} className="shrink-0" />
    <span data-umbra-ui-queue-manager-label="">Queue Manager</span>
    <span data-umbra-ui-queue-manager-count="" aria-hidden="true" className="min-w-[4ch] rounded border border-white/15 bg-black/20 px-1 py-0.5 text-center font-mono tabular-nums text-[var(--umbra-accent)]">{count}</span>
    <span id={descriptionId} className="sr-only">{count} unfinished items</span>
  </button>;
}
