'use client';

import React from 'react';
import { Clapperboard, PanelLeft, PanelRight, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UmbraVideoWorkspaceProps {
  title: string;
  directorKey: string | null;
  previewRevision: number;
  settings: React.ReactNode;
  references: React.ReactNode;
  prompt: React.ReactNode;
  actions: React.ReactNode;
  preview: React.ReactNode;
  director: React.ReactNode;
  review: React.ReactNode;
}

const toolbarButton = 'inline-flex h-8 items-center justify-center gap-2 rounded border border-white/15 px-2.5 text-[10px] font-bold text-zinc-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300';

// Slots keep the generation editor and queue as their existing state owners.
// Collapsing a panel only hides it, so drafts, uploads and editor history survive.
export function UmbraVideoWorkspace({ title, directorKey, previewRevision, settings, references, prompt, actions, preview, director, review }: UmbraVideoWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = React.useState(() => window.innerWidth >= 1440);
  const [reviewOpen, setReviewOpen] = React.useState(() => window.innerWidth >= 900);
  const [trayHeight, setTrayHeight] = React.useState(280);
  const [reviewWidth, setReviewWidth] = React.useState(320);
  const [showDirector, setShowDirector] = React.useState(!!directorKey);
  const dragCleanup = React.useRef<(() => void) | null>(null);
  const settingsId = React.useId();
  const reviewId = React.useId();

  React.useEffect(() => () => dragCleanup.current?.(), []);
  React.useEffect(() => setShowDirector(!!directorKey), [directorKey]);
  React.useEffect(() => { if (previewRevision > 0) setShowDirector(false); }, [previewRevision]);

  const startResize = (event: React.PointerEvent, kind: 'tray' | 'review') => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragCleanup.current?.();
    const start = kind === 'tray' ? event.clientY : event.clientX;
    const initial = kind === 'tray' ? trayHeight : reviewWidth;
    const onMove = (move: PointerEvent) => {
      const delta = start - (kind === 'tray' ? move.clientY : move.clientX);
      if (kind === 'tray') setTrayHeight(Math.max(180, Math.min(520, initial + delta)));
      else setReviewWidth(Math.max(280, Math.min(480, initial + delta)));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      dragCleanup.current = null;
    };
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  return (
    <section
      data-umbra-video-workspace=""
      data-settings-open={settingsOpen ? '1' : '0'}
      data-review-open={reviewOpen ? '1' : '0'}
      style={{ '--video-tray-height': `${trayHeight}px`, '--video-review-width': `${reviewWidth}px` } as React.CSSProperties}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--umbra-panel-bg)] text-zinc-200"
    >
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <Clapperboard size={16} className="text-fuchsia-300" />
        <h2 className="text-[11px] font-black uppercase tracking-[0.13em]">Video Studio</h2>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">{title}</span>
        <button type="button" className={toolbarButton} aria-controls={settingsId} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
          <SlidersHorizontal size={14} /> Settings
        </button>
        <button type="button" className={toolbarButton} aria-controls={reviewId} aria-expanded={reviewOpen} onClick={() => setReviewOpen(!reviewOpen)}>
          <PanelRight size={14} /> Queue / Results
        </button>
      </header>
      <div data-video-workspace-body="">
        <div data-video-workspace-editor="">
          <div data-video-workspace-stage="">
            <aside id={settingsId} data-video-workspace-settings="" aria-label="Video generation settings" hidden={!settingsOpen}>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3">
                <PanelLeft size={13} className="text-fuchsia-300" />
                <span className="flex-1 text-[10px] font-bold uppercase tracking-wider">Generation settings</span>
                <button type="button" title="Close generation settings" onClick={() => setSettingsOpen(false)} className={cn(toolbarButton, 'h-7 w-7 px-0')}><X size={13} /></button>
              </div>
              {settings}
            </aside>
            <div data-video-workspace-viewer="" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto custom-scrollbar">
              {directorKey ? <div className="flex h-10 shrink-0 gap-2 border-b border-white/10 px-3 py-1" aria-label="Video workspace view" role="group">
                <button type="button" className={toolbarButton} aria-pressed={!showDirector} onClick={() => setShowDirector(false)}>Preview</button>
                <button type="button" className={toolbarButton} aria-pressed={showDirector} onClick={() => setShowDirector(true)}>{directorKey}</button>
              </div> : null}
              <div className={directorKey && showDirector ? 'hidden' : 'min-h-0 flex-1'}>{preview}</div>
              <div className={directorKey && showDirector ? 'min-h-0 flex-1 overflow-auto custom-scrollbar' : 'hidden'}>{director}</div>
            </div>
          </div>
          <div
            data-video-tray-resize=""
            role="separator" tabIndex={0} aria-label="Resize prompt and reference tray" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={520} aria-valuenow={trayHeight}
            onPointerDown={(event) => startResize(event, 'tray')}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              setTrayHeight((height) => Math.max(180, Math.min(520, height + (event.key === 'ArrowUp' ? 20 : -20))));
            }}
          ><span /></div>
          <div data-video-workspace-tray="">
            <section data-video-workspace-prompt="" aria-label="Video prompt" className="min-w-0 overflow-y-auto p-3 custom-scrollbar">{prompt}</section>
            <section data-video-workspace-references="" aria-label="Video references" className="min-w-0 space-y-3 overflow-y-auto border-l border-white/10 p-3 custom-scrollbar">
              <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">Reference media</h3>
              {references}
            </section>
          </div>
          <footer data-video-workspace-actions="" className="shrink-0 border-t border-white/10 bg-black/20 p-2.5">{actions}</footer>
        </div>
        <div
          data-video-review-resize="" hidden={!reviewOpen}
          role="separator" tabIndex={0} aria-label="Resize queue and results panel" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={480} aria-valuenow={reviewWidth}
          onPointerDown={(event) => startResize(event, 'review')}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            setReviewWidth((width) => Math.max(280, Math.min(480, width + (event.key === 'ArrowLeft' ? 20 : -20))));
          }}
        ><span /></div>
        <aside id={reviewId} data-video-workspace-review="" aria-label="Video queue and results" hidden={!reviewOpen}>{review}</aside>
      </div>
    </section>
  );
}
