'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NsfwPrivacyShield } from '@/components/privacy/NsfwPrivacyProvider';
import { useStore } from '@/store/useStore';

// Keep phone dock overrides local; desktop and tablet retain the contents layout.
const phoneDockStyles = `
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock] > [data-umbra-mobile-workspace-sheet-trigger] {
  position: fixed !important;
  inset: auto max(0.55rem, env(safe-area-inset-right)) calc(var(--umbra-phone-bottom-nav-height, 4.25rem) + 0.5rem) max(0.55rem, env(safe-area-inset-left)) !important;
  z-index: 195;
  width: auto !important;
  margin: 0 !important;
  border-radius: 8px;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet-spacer] {
  display: block;
  height: 5rem;
  flex: 0 0 5rem;
  pointer-events: none;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock][data-active="0"] > :is([data-umbra-mobile-workspace-sheet-trigger], [data-umbra-mobile-workspace-sheet-spacer], [data-umbra-mobile-workspace-sheet-backdrop], [data-umbra-mobile-workspace-sheet-panel]) {
  display: none !important;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock] > [data-umbra-mobile-workspace-sheet-panel] {
  inset: max(0.25rem, env(safe-area-inset-top)) max(0.25rem, env(safe-area-inset-right)) max(0.25rem, env(safe-area-inset-bottom)) max(0.25rem, env(safe-area-inset-left)) !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  border-radius: 8px;
  border-bottom-width: 1px;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock] [data-umbra-mobile-workspace-sheet-content] {
  padding-bottom: 0;
  overscroll-behavior: contain;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock] [data-umbra-mobile-workspace-sheet-copy] :is(strong, small) {
  letter-spacing: 0;
}
html[data-umbra-remote-mode="phone"] [data-umbra-mobile-workspace-sheet][data-floating-dock] [data-umbra-mobile-workspace-sheet-content] div:has(> div > [data-umbra-inpaint-minimap]) {
  display: none !important;
}
`;

export type UmbraMobileWorkspaceSheetTone = 'cyan' | 'rose' | 'fuchsia' | 'amber';

interface UmbraMobileWorkspaceSheetProps {
  active?: boolean;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  thumbnailUrl?: string;
  thumbnailProtected?: boolean;
  tone?: UmbraMobileWorkspaceSheetTone;
  kind?: 'inpaint';
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
  thumbnailProtected = false,
  tone = 'cyan',
  kind,
  children,
  className,
}: UmbraMobileWorkspaceSheetProps) {
  const [open, setOpen] = React.useState(false);
  const [phoneMode, setPhoneMode] = React.useState(() => (
    typeof document !== 'undefined' && document.documentElement.dataset.umbraRemoteMode === 'phone'
  ));
  const activeWorkspace = useStore((state) => state.activeWorkspace);
  const sheetActive = active && (!phoneMode || activeWorkspace === 'umbraui');
  const panelId = React.useId();

  React.useEffect(() => {
    const root = document.documentElement;
    const syncMode = () => setPhoneMode(root.dataset.umbraRemoteMode === 'phone');
    const observer = new MutationObserver(syncMode);
    observer.observe(root, { attributes: true, attributeFilter: ['data-umbra-remote-mode'] });
    syncMode();
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!sheetActive) setOpen(false);
  }, [sheetActive]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const sheet = (
    <div
      data-umbra-mobile-workspace-sheet=""
      data-floating-dock=""
      data-active={sheetActive ? '1' : '0'}
      data-open={open ? '1' : '0'}
      data-tone={tone}
      data-kind={kind}
      className={cn('contents', className)}
    >
      <style>{phoneDockStyles}</style>
      <button
        type="button"
        data-umbra-mobile-workspace-sheet-trigger=""
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        className="hidden"
      >
        {thumbnailUrl ? (
          <span data-umbra-mobile-workspace-sheet-thumbnail="" className="relative overflow-hidden">
            <img data-umbra-nsfw-media={thumbnailProtected ? '' : undefined} src={thumbnailUrl} alt="" />
            <NsfwPrivacyShield compact protectedMedia={thumbnailProtected} />
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
        id={panelId}
        role={phoneMode ? 'dialog' : undefined}
        aria-modal={phoneMode && open ? true : undefined}
        aria-label={phoneMode ? title : undefined}
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

  // The workspace uses transform/paint containment, so phone overlays must escape it.
  return phoneMode ? (
    <>
      {sheetActive ? <div data-umbra-mobile-workspace-sheet-spacer="" className="hidden" aria-hidden="true" /> : null}
      {createPortal(sheet, document.body)}
    </>
  ) : sheet;
}

export default UmbraMobileWorkspaceSheet;
