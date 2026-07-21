'use client';

import React from 'react';
import { Keyboard, RotateCcw, X } from 'lucide-react';

export interface UmbraCanvasHotkeyAction {
  id: string;
  label: string;
}

export interface UmbraCanvasHotkeyEditorProps {
  open: boolean;
  actions: UmbraCanvasHotkeyAction[];
  hotkeys: Record<string, string>;
  defaults: Record<string, string>;
  onChange: (hotkeys: Record<string, string>) => void;
  onClose: () => void;
}

function normalizeHotkey(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length === 1 ? normalized : '';
}

export function UmbraCanvasHotkeyEditor({
  open,
  actions,
  hotkeys,
  defaults,
  onChange,
  onClose,
}: UmbraCanvasHotkeyEditorProps) {
  React.useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [onClose, open]);

  if (!open) return null;

  const assign = (actionId: string, key: string) => {
    const normalized = normalizeHotkey(key);
    const next = { ...hotkeys };
    for (const id of Object.keys(next)) {
      if (id !== actionId && normalized && next[id] === normalized) next[id] = '';
    }
    next[actionId] = normalized;
    onChange(next);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Canvas keyboard shortcuts" className="w-full max-w-2xl border border-cyan-300/25 bg-[#08090b] shadow-2xl shadow-black/80">
        <header className="flex h-11 items-center gap-2 border-b border-white/10 px-3">
          <Keyboard size={13} className="text-cyan-200" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">Canvas Shortcuts</h3>
          <span className="font-mono text-[8px] text-zinc-600">Click a key field, then press one character.</span>
          <button type="button" onClick={onClose} title="Close shortcut editor" className="ml-auto inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-zinc-200"><X size={11} /></button>
        </header>
        <div className="grid max-h-[60vh] grid-cols-2 gap-1.5 overflow-y-auto p-3 custom-scrollbar sm:grid-cols-3">
          {actions.map((action) => (
            <div key={action.id} className="flex h-9 items-center gap-2 border border-white/[0.08] bg-black/25 px-2">
              <span className="min-w-0 flex-1 truncate text-[8px] font-black uppercase text-zinc-500">{action.label}</span>
              <button
                type="button"
                aria-label={`${action.label} shortcut, currently ${hotkeys[action.id]?.toUpperCase() || 'unassigned'}. Press one character to assign; Backspace or Delete clears.`}
                onKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.key === 'Backspace' || event.key === 'Delete') assign(action.id, '');
                  else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) assign(action.id, event.key);
                }}
                title={`Assign the ${action.label} shortcut. Press one character to assign; Backspace or Delete clears.`}
                className="inline-flex h-6 w-10 items-center justify-center border border-cyan-300/20 bg-cyan-500/[0.04] font-mono text-[9px] font-black uppercase text-cyan-100 focus:border-cyan-200 focus:outline-none"
              >
                {hotkeys[action.id]?.toUpperCase() || '-'}
              </button>
            </div>
          ))}
        </div>
        <footer className="flex h-11 items-center border-t border-white/10 px-3">
          <button type="button" onClick={() => onChange({ ...defaults })} className="inline-flex h-7 items-center gap-1.5 border border-white/10 px-2 text-[7px] font-black uppercase text-zinc-400 hover:text-zinc-200"><RotateCcw size={9} /> Reset Defaults</button>
          <button type="button" onClick={onClose} className="ml-auto h-7 border border-cyan-300/25 px-3 text-[7px] font-black uppercase text-cyan-100">Done</button>
        </footer>
      </section>
    </div>
  );
}
