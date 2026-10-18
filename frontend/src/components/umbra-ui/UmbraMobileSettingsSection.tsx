'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep controls mounted when folded so drafts and picker state survive. */
export function UmbraMobileSettingsSection({
  enabled,
  title,
  summary,
  children,
}: {
  enabled: boolean;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (!enabled) return <>{children}</>;
  return (
    <section data-umbra-mobile-settings-section="" className="min-w-0 border-b border-white/10">
      <button
        type="button"
        id={`${id}-toggle`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center gap-3 py-2 text-left text-zinc-200"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">{title}</span>
          {summary ? <span className="mt-1 block truncate text-[11px] text-zinc-500">{summary}</span> : null}
        </span>
        <ChevronDown size={16} className={open ? 'shrink-0 rotate-180' : 'shrink-0'} aria-hidden="true" />
      </button>
      <div id={id} role="region" aria-labelledby={`${id}-toggle`} hidden={!open}>
        <div className="space-y-3 pb-4">{children}</div>
      </div>
    </section>
  );
}
