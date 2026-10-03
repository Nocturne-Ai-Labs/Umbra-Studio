'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Film, FolderOpen, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { H3_SESSION_NAME, h3ContinuitySessionUrl, normalizeH3Checkpoints, normalizeH3Sessions, type H3ContinuityCheckpoint, type H3ContinuitySelection, type H3ContinuitySessionSummary } from '@/lib/h3ContinuitySessions';

interface Props {
  currentSession: string;
  currentSourceId?: string;
  comfyConnected: boolean;
  onSelect: (selection: H3ContinuitySelection) => void;
  onClose: () => void;
}

const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-200 hover:border-[var(--umbra-accent)] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

function completedTime(nanoseconds: number): string {
  if (!nanoseconds) return '';
  const date = new Date(nanoseconds / 1e6);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function CheckpointThumbnail({ clip }: { clip: H3ContinuityCheckpoint }) {
  const [failedSource, setFailedSource] = React.useState('');
  return <span className="relative flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/40 sm:w-28">
    {clip.thumbnailUrl && failedSource !== clip.thumbnailUrl
      ? <img src={clip.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailedSource(clip.thumbnailUrl)} />
      : <Film size={20} className="text-zinc-600" />}
  </span>;
}

export function UmbraH3ContinuitySessionModal({ currentSession, currentSourceId = '', comfyConnected, onSelect, onClose }: Props) {
  const [sessions, setSessions] = React.useState<H3ContinuitySessionSummary[]>([]);
  const [browsedSession, setBrowsedSession] = React.useState(currentSession);
  const [checkpointList, setCheckpointList] = React.useState<{ session: string; clips: H3ContinuityCheckpoint[] }>({ session: '', clips: [] });
  const [selectedId, setSelectedId] = React.useState(currentSourceId);
  const [loading, setLoading] = React.useState(comfyConnected);
  const [clipsLoading, setClipsLoading] = React.useState(comfyConnected && !!currentSession);
  const [sessionError, setSessionError] = React.useState('');
  const [checkpointError, setCheckpointError] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [refresh, setRefresh] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!comfyConnected) { setLoading(false); setSessions([]); setSessionError(''); return; }
    const abort = new AbortController();
    setLoading(true);
    setSessionError('');
    fetch('/comfy/df_h3_continuity/sessions', { signal: abort.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.sessions)) throw new Error(data.error || 'Could not load H3 sessions.');
        if (abort.signal.aborted) return;
        const next = normalizeH3Sessions(data.sessions);
        setSessions(next);
        setBrowsedSession(previous => previous && (next.some(item => item.session === previous) || previous === currentSession) ? previous : next[0]?.session || currentSession);
      })
      .catch(cause => { if (!abort.signal.aborted) setSessionError(cause instanceof Error ? cause.message : 'Could not load H3 sessions.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [comfyConnected, currentSession, refresh]);

  React.useEffect(() => {
    setCheckpointError('');
    if (!comfyConnected || !H3_SESSION_NAME.test(browsedSession)) { setClipsLoading(false); setCheckpointList({ session: '', clips: [] }); return; }
    const abort = new AbortController();
    setClipsLoading(true);
    fetch(h3ContinuitySessionUrl(browsedSession, browsedSession === currentSession ? currentSourceId : ''), { signal: abort.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.clips)) throw new Error(data.error || 'Could not load H3 checkpoints.');
        if (abort.signal.aborted) return;
        const clips = normalizeH3Checkpoints(data.clips);
        setCheckpointList({ session: browsedSession, clips });
        setSelectedId(previous => clips.some(clip => clip.clip_id === previous) ? previous : clips.find(clip => browsedSession === currentSession && clip.clip_id === currentSourceId)?.clip_id || clips[0]?.clip_id || '');
      })
      .catch(cause => { if (!abort.signal.aborted) { setCheckpointList({ session: browsedSession, clips: [] }); setCheckpointError(cause instanceof Error ? cause.message : 'Could not load H3 checkpoints.'); } })
      .finally(() => { if (!abort.signal.aborted) setClipsLoading(false); });
    return () => abort.abort();
  }, [comfyConnected, browsedSession, currentSession, currentSourceId, refresh]);

  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  const choose = (session: string, clipId: string | null) => { onSelect({ session, clipId }); onClose(); };
  const create = () => {
    const session = newName.trim();
    if (!H3_SESSION_NAME.test(session) || session === '_imports') { setNameError('Use 1-80 letters, numbers, underscores or hyphens.'); return; }
    if (sessions.some(item => item.session === session)) { setNameError('That session already exists. Select it from the list.'); return; }
    choose(session, null);
  };
  const visible = sessions.filter(item => item.session.toLowerCase().includes(search.trim().toLowerCase()));
  const clips = checkpointList.session === browsedSession ? checkpointList.clips : [];
  const selected = clips.find(clip => clip.clip_id === selectedId);

  return createPortal(
    <div data-umbra-modal-root="" className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-3" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="H3 continuity sessions" tabIndex={-1}
        className="flex h-[min(90dvh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/20 bg-[#101114] text-zinc-200 shadow-2xl outline-none"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          const outside = !dialogRef.current?.contains(document.activeElement);
          if (event.shiftKey && (outside || document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (outside || document.activeElement === last)) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 p-3">
          <FolderOpen size={16} className="text-[var(--umbra-accent)]" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">Continuity sessions</h2>
          <button type="button" className={buttonClass} title="Refresh sessions and checkpoints" aria-label="Refresh sessions and checkpoints" disabled={!comfyConnected || loading || clipsLoading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} /></button>
          <button type="button" className={buttonClass} title="Close sessions" aria-label="Close sessions" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(120px,0.4fr)_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="flex min-h-0 min-w-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
            <div className="m-3 flex shrink-0 items-center gap-2 rounded border border-white/15 bg-black/30 px-2">
              <Search size={14} className="shrink-0 text-zinc-500" />
              <input aria-label="Search continuity sessions" className="min-h-10 min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search sessions" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {loading ? <p role="status" className="flex items-center gap-2 py-4 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" />Loading sessions</p> : null}
              {!comfyConnected ? <p className="py-4 text-xs text-zinc-500">Start ComfyUI to browse saved sessions.</p> : null}
              {comfyConnected && !loading && !sessionError && visible.length === 0 ? <p className="py-4 text-xs text-zinc-500">No matching sessions</p> : null}
              {!loading ? <ul aria-label="Continuity session list" className="space-y-1">{visible.map(item => <li key={item.session}>
                <button type="button" aria-label={`Browse session ${item.session}`} aria-pressed={item.session === browsedSession} onClick={() => setBrowsedSession(item.session)}
                  className="flex min-h-14 w-full min-w-0 items-center gap-2 rounded border border-transparent px-2 py-2 text-left hover:bg-white/5 aria-pressed:border-[var(--umbra-accent)] aria-pressed:bg-white/5">
                  <FolderOpen size={15} className="shrink-0 text-[var(--umbra-accent)]" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs" title={item.session}>{item.session}</span><span className="block text-[10px] text-zinc-500">{item.ready_count} checkpoints</span></span>
                  {item.session === currentSession ? <Check size={13} className="shrink-0 text-zinc-400" aria-label="Current session" /> : null}
                </button>
              </li>)}</ul> : null}
              {sessionError ? <p role="alert" className="py-2 text-xs text-amber-300">{sessionError}</p> : null}
            </div>
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col" aria-label="Session checkpoints">
            <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
              <h3 className="min-w-0 truncate text-xs font-semibold" title={browsedSession}>{browsedSession || 'Checkpoints'}</h3>
              <span className="shrink-0 text-[10px] text-zinc-500">{clips.length} checkpoints</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {clipsLoading ? <p role="status" className="flex items-center gap-2 py-4 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" />Loading checkpoints</p> : null}
              {!clipsLoading && comfyConnected && !checkpointError && clips.length === 0 ? <p className="py-4 text-xs text-zinc-500">{browsedSession ? 'No saved checkpoints' : 'Choose a session'}</p> : null}
              {!clipsLoading ? <ul aria-label="Checkpoint list" className="space-y-2">{clips.map(clip => <li key={clip.clip_id}>
                <button type="button" aria-label={`Select checkpoint ${clip.clip_id}`} aria-pressed={clip.clip_id === selectedId} onClick={() => setSelectedId(clip.clip_id)}
                  className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded border border-white/10 p-2 text-left hover:bg-white/5 aria-pressed:border-[var(--umbra-accent)] aria-pressed:bg-white/5">
                  <CheckpointThumbnail clip={clip} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs text-zinc-100" title={clip.filename || clip.clip_id}>{clip.filename || clip.clip_id}</span><span className="mt-1 block text-[11px] text-zinc-400">{clip.seconds.toFixed(1)}s</span><span className="mt-1 block text-[10px] text-zinc-500">{completedTime(clip.completed_ns)}</span></span>
                  {clip.clip_id === selectedId ? <Check size={15} className="shrink-0 text-[var(--umbra-accent)]" /> : null}
                </button>
              </li>)}</ul> : null}
              {checkpointError ? <p role="alert" className="py-2 text-xs text-amber-300">{checkpointError}</p> : null}
            </div>
            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 p-3">
              <button type="button" className={buttonClass} disabled={!H3_SESSION_NAME.test(browsedSession) || loading || clipsLoading} onClick={() => choose(browsedSession, null)}><Plus size={14} />New take</button>
              <button type="button" className={`${buttonClass} border-[var(--umbra-accent)]`} disabled={!comfyConnected || clipsLoading || !selected} onClick={() => { if (selected) choose(browsedSession, selected.clip_id); }}><Film size={14} />Continue from checkpoint</button>
            </footer>
          </section>
        </div>
        <form className="shrink-0 border-t border-white/10 p-3" onSubmit={event => { event.preventDefault(); create(); }}>
          <label className="mb-2 block text-xs text-zinc-400" htmlFor="h3-new-continuity-session">New session</label>
          <div className="flex gap-2">
            <input id="h3-new-continuity-session" className="min-h-10 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 text-xs text-zinc-100 outline-none focus:border-[var(--umbra-accent)]" maxLength={80} value={newName} onChange={event => { setNewName(event.target.value); setNameError(''); }} placeholder="scene_name" />
            <button type="submit" className={buttonClass} disabled={!newName.trim() || loading} title="Save this session with the next exported checkpoint"><Plus size={14} />Use session</button>
          </div>
          {nameError ? <p role="alert" className="mt-2 text-xs text-amber-300">{nameError}</p> : null}
        </form>
      </div>
    </div>, document.body,
  );
}
