import React from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Plus, RefreshCw, X } from 'lucide-react';
import type { VideoStudioSummary } from '../../../../shared/umbra-ui/videoStudioProject';

export function VideoStudioProjectPicker({ projects, currentProjectId, transferring, onOpen, onCreate, onClose }: {
  currentProjectId?: string; projects: VideoStudioSummary[]; transferring: boolean;
  onOpen: (id: string) => Promise<void>; onCreate: (name: string) => Promise<void>; onClose: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState(currentProjectId || projects[0]?.id || '');
  const [media, setMedia] = React.useState<{ inputs: Array<{ path: string; name: string; type: string; shots: string[] }>; outputs: Array<{ path: string; name: string; type: string }> }>({ inputs: [], outputs: [] });
  const [loadingMedia, setLoadingMedia] = React.useState(false);
  const [mediaError, setMediaError] = React.useState('');
  const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => {
    if (!selectedId) return;
    const abort = new AbortController();
    setLoadingMedia(true); setMediaError('');
    fetch('/api/video/projects/' + selectedId + '/media', { signal: abort.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load project media.'); if (!abort.signal.aborted) setMedia(data); })
      .catch(e => { if (!abort.signal.aborted) setMediaError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoadingMedia(false); });
    return () => abort.abort();
  }, [selectedId, refresh]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setRefresh(v => v + 1), 15000);
    const update = () => setRefresh(v => v + 1);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const mediaCard = (item: { path: string; name: string; type: string; shots?: string[] }) => {
    const url = '/api/fs/image?path=' + encodeURIComponent(item.path);
    return <article key={item.path} className="min-w-0 rounded border border-white/10 bg-black/20 p-2">
      {item.type === 'image' ? <img src={url} alt={item.name} loading="lazy" className="h-32 w-full object-contain" /> :
       item.type === 'video' ? <video src={url} controls preload="none" className="h-32 w-full" /> :
       item.type === 'audio' ? <audio src={url} controls preload="none" className="w-full" /> : <span className="text-xs">File</span>}
      <p className="mt-2 truncate text-xs" title={item.name}>{item.name}</p>
      {item.shots ? <p className="mt-1 text-[10px] text-zinc-400">{item.shots.length ? 'Used in ' + item.shots.join(', ') : 'Available in media tray'}</p> : null}
    </article>;
  };
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const dialog = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (before?.isConnected) before.focus(); };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open project.'); }
    finally { setBusy(false); }
  };
  const button = 'flex min-h-11 items-center gap-2 rounded border border-white/15 px-3 text-sm hover:bg-white/5 disabled:opacity-40';
  return createPortal(<div data-umbra-modal-root="" className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-3">
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={transferring ? 'Send media to Video Studio project' : 'Video Studio projects'}
      className="glass-panel flex h-[90dvh] max-h-[90dvh] w-[96vw] max-w-[1800px] flex-col overflow-hidden bg-[var(--umbra-bg)] text-[var(--umbra-text)] outline-none"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="flex items-center gap-2 border-b border-white/10 p-3"><FolderOpen size={17} /><h2 className="flex-1 text-sm font-semibold">{transferring ? 'Send to video project' : 'Video projects'}</h2>
        <button aria-label="Close project picker" className={button} disabled={busy} onClick={onClose}><X size={16} /></button></header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Video projects" className="space-y-2 border-b border-white/10 p-3 md:border-b-0 md:border-r">
          {projects.map(p => <button key={p.id} disabled={busy} aria-pressed={selectedId === p.id} className={button + ' w-full text-left ' + (selectedId === p.id ? 'border-[var(--umbra-accent)] bg-white/5' : '')} onClick={() => { if (selectedId !== p.id) setMedia({ inputs: [], outputs: [] }); setSelectedId(p.id); }}>
            <FolderOpen size={16} /><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-xs text-zinc-400">{p.shotCount} shots</span>
          </button>)}
          {!projects.length ? <p className="text-sm text-zinc-400">Create your first video project.</p> : null}
        </nav>
        <section aria-label="Project media browser" className="min-w-0 space-y-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{projects.find(p => p.id === selectedId)?.name || 'Project media'}</h3>
            <button className={button} aria-label="Refresh project media" disabled={!selectedId || loadingMedia} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={15} /></button>
            <button className={button} disabled={busy || !selectedId} onClick={() => void run(() => onOpen(selectedId))}>{transferring ? 'Send here' : 'Open project'}</button>
          </div>
          {loadingMedia ? <p role="status" className="text-xs text-zinc-400">Checking project media…</p> : null}
          {mediaError ? <p role="alert" className="text-xs text-red-300">{mediaError}</p> : null}
          {<>
            <section aria-label="Generation inputs"><h4 className="mb-3 text-xs font-semibold">Generation inputs · {media.inputs.length}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{media.inputs.map(mediaCard)}</div>
              {!media.inputs.length ? <p className="text-xs text-zinc-400">No available inputs. Import media into this project to get started.</p> : null}
            </section>
            <section aria-label="Generated media"><h4 className="mb-3 text-xs font-semibold">Generated media · {media.outputs.length}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{media.outputs.map(mediaCard)}</div>
              {!media.outputs.length ? <p className="text-xs text-zinc-400">Completed generations will appear here. Deleted files are omitted.</p> : null}
            </section>
          </>}
        </section>
      </div>
      <form className="flex flex-wrap gap-2 border-t border-white/10 p-3" onSubmit={event => { event.preventDefault(); if (name.trim()) void run(() => onCreate(name)); }}>
        <input aria-label="New video project name" placeholder="Project name" value={name} disabled={busy} onChange={event => setName(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-3 text-sm" maxLength={200} />
        <button className={button} disabled={busy || !name.trim()} type="submit"><Plus size={16} />New project</button>
      </form>
      {error ? <p role="alert" className="p-3 text-sm text-red-300">{error}</p> : null}
    </div>
  </div>, document.body);
}
