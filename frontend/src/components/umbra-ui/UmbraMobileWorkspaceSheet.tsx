'use client';

import React from 'react';
import { ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UmbraMobileWorkspaceSheetTone = 'cyan' | 'rose' | 'fuchsia' | 'amber';

interface UmbraMobileWorkspaceSheetProps {
  active?: boolean;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  thumbnailUrl?: string;
  tone?: UmbraMobileWorkspaceSheetTone;
  children: React.ReactNode;
  className?: string;
}

export function UmbraMobileWorkspaceSheet({
  active = true,
  title,
  subtitle,
  badge,
  icon,
  thumbnailUrl,
  tone = 'cyan',
  children,
  className,
}: UmbraMobileWorkspaceSheetProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div
      data-umbra-mobile-workspace-sheet=""
      data-open={open ? '1' : '0'}
      data-tone={tone}
      className={cn('contents', className)}
    >
      <button
        type="button"
        data-umbra-mobile-workspace-sheet-trigger=""
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="hidden"
      >
        {thumbnailUrl ? (
          <span data-umbra-mobile-workspace-sheet-thumbnail="">
            <img src={thumbnailUrl} alt="" />
          </span>
        ) : (
          <span data-umbra-mobile-workspace-sheet-icon="">{icon}</span>
        )}
        <span data-umbra-mobile-workspace-sheet-copy="">
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        {badge ? <span data-umbra-mobile-workspace-sheet-badge="">{badge}</span> : null}
        <ChevronUp size={17} />
      </button>

      {open ? (
        <button
          type="button"
          data-umbra-mobile-workspace-sheet-backdrop=""
          onClick={() => setOpen(false)}
          aria-label={`Close ${title}`}
          className="hidden"
        />
      ) : null}

      <section
        data-umbra-mobile-workspace-sheet-panel=""
        data-open={open ? '1' : '0'}
        className="contents"
      >
        <header data-umbra-mobile-workspace-sheet-header="" className="hidden">
          <span data-umbra-mobile-workspace-sheet-handle="" aria-hidden="true" />
          <span data-umbra-mobile-workspace-sheet-icon="">{icon}</span>
          <span data-umbra-mobile-workspace-sheet-copy="">
            <strong>{title}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
          {badge ? <span data-umbra-mobile-workspace-sheet-badge="">{badge}</span> : null}
          <button type="button" onClick={() => setOpen(false)} aria-label={`Close ${title}`}>
            <X size={16} />
          </button>
        </header>
        <div data-umbra-mobile-workspace-sheet-content="" className="contents">
          {children}
        </div>
      </section>
    </div>
  );
}

export default UmbraMobileWorkspaceSheet;
