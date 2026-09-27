'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';

interface SessionSummary {
  session: string;
  ready_count: number;
  latest_completed_ns: number;
}

interface Props {
  currentSession: string;
  comfyConnected: boolean;
  onSelect: (session: string) => void;
  onClose: () => void;
}

const SESSION_NAME = /^[a-zA-Z0-9_-]{1,80}$/;
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-200 hover:border-fuchsia-300/40 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

export function UmbraH3ContinuitySessionModal({ currentSession, comfyConnected, onSelect, onClose }: Props) {
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loading, setLoading] = React.useState(comfyConnected);
  const [error, setError] = React.useState('');
  const [refresh, setRefresh] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!comfyConnected) { setLoading(false); setSessions([]); return; }
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetch('/comfy/df_h3_continuity/sessions', { signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.sessions)) throw new Error(data.error || 'Could not load H3 sessions.');
        setSessions(data.sessions.filter((item: SessionSummary) => item && SESSION_NAME.test(item.session)));
      })
      .catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load H3 sessions.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [comfyConnected, refresh]);

  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const choose = (session: string) => { onSelect(session); onClose(); };
  const create = () => {
    const session = newName.trim();
    if (!SESSION_NAME.test(session) || session === '_imports') { setError('Use 1-80 letters, numbers, underscores or hyphens.'); return; }
    if (sessions.some((item) => item.session === session)) { setError('That session already exists. Select it from the list.'); return; }
    choose(session);
  };
  const visible = sessions.filter((item) => item.session.toLowerCase().includes(search.trim().toLowerCase()));

  return createPortal(
    <div data-umbra-modal-root="" className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="H3 continuity sessions" tabIndex={-1}
        className="flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-fuchsia-300/35 bg-[#101114] text-zinc-200 shadow-2xl outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-center gap-2 border-b border-white/10 p-3">
          <FolderOpen size={16} className="text-fuchsia-300" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">Continuity sessions</h2>
          <button type="button" className={buttonClass} title="Close sessions" aria-label="Close sessions" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-white/15 bg-black/30 px-2">
              <Search size={14} className="shrink-0 text-zinc-500" />
              <input aria-label="Search continuity sessions" className="min-h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search sessions" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <button type="button" className={buttonClass} title="Refresh sessions" aria-label="Refresh sessions" disabled={!comfyConnected || loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} /></button>
          </div>
          <div className="min-h-24 space-y-1">
            {loading ? <p role="status" className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" /> Loading sessions</p> : null}
            {!comfyConnected ? <p className="px-2 py-4 text-xs text-zinc-500">Start ComfyUI to browse saved sessions.</p> : null}
            {comfyConnected && !loading && !error && visible.length === 0 ? <p className="px-2 py-4 text-xs text-zinc-500">No matching sessions</p> : null}
            {!loading && visible.map((item) => <button type="button" key={item.session} aria-current={item.session === currentSession ? 'true' : undefined} onClick={() => choose(item.session)}
              className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded border border-white/10 px-3 text-left hover:border-fuchsia-300/40 hover:bg-white/5 aria-current:border-fuchsia-300/50">
              <FolderOpen size={15} className="shrink-0 text-fuchsia-300" />
              <span className="min-w-0 flex-1 truncate text-xs" title={item.session}>{item.session}</span>
              <span className="shrink-0 text-[10px] text-zinc-500">{item.ready_count} clips</span>
            </button>)}
          </div>
          {error ? <p role="alert" className="text-xs text-amber-300">{error}</p> : null}
          <form className="border-t border-white/10 pt-3" onSubmit={(event) => { event.preventDefault(); create(); }}>
            <label className="mb-2 block text-xs text-zinc-400" htmlFor="h3-new-continuity-session">New session</label>
            <div className="flex gap-2">
              <input id="h3-new-continuity-session" className="min-h-9 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/50" maxLength={80} value={newName} onChange={(event) => { setNewName(event.target.value); setError(''); }} placeholder="scene_name" />
              <button type="submit" className={buttonClass} disabled={!newName.trim()} title="Save this session with the next exported checkpoint"><Plus size={14} /> Use session</button>
            </div>
          </form>
        </div>
      </div>
    </div>, document.body,
  );
}
