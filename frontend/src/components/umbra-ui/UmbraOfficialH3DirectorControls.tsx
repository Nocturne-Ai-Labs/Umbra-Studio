'use client';

import React from 'react';
import { Film, FolderOpen, FolderUp, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { UmbraH3ContinuitySessionModal } from './UmbraH3ContinuitySessionModal';
import { h3ContinuitySelectionPatch } from '@/lib/h3ContinuitySessions';
import { hasOfficialH3Continuity, type OfficialH3DirectorSettings } from '../../../../shared/umbra-ui/officialH3Director';

interface Props {
  settings: OfficialH3DirectorSettings;
  onChange: (settings: OfficialH3DirectorSettings) => void;
  disabled: boolean;
  comfyConnected: boolean;
  mode: string;
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  onMediaBusyChange: (busy: boolean) => void;
  onMatchSource: (source: { width: number; height: number; mode: string }) => void;
}
interface Checkpoint { clip_id: string; seconds: number; completed_ns: number }
interface RefMod { name: string; kind: string }
const fieldClass = 'min-h-9 w-full min-w-0 rounded border border-white/15 bg-black/25 px-2 py-1.5 text-xs outline-none focus:border-[var(--umbra-accent)] disabled:opacity-40';
const buttonClass = 'inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded border border-white/15 px-2 text-xs hover:bg-white/5 disabled:opacity-40';

export function UmbraOfficialH3DirectorControls({ settings, onChange, disabled, comfyConnected, mode, width, height, frameRate, durationSeconds, onMediaBusyChange, onMatchSource }: Props) {
  const [sessionOpen, setSessionOpen] = React.useState(false);
  const [continuityOpen, setContinuityOpen] = React.useState(false);
  const [refModsOpen, setRefModsOpen] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const [clips, setClips] = React.useState<Checkpoint[]>([]);
  const [library, setLibrary] = React.useState<RefMod[]>([]);
  const [error, setError] = React.useState('');
  const [refError, setRefError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [check, setCheck] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef(settings);
  const mounted = React.useRef(true);
  const operation = React.useRef<AbortController | null>(null);
  latest.current = settings;
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (operation.current) { operation.current.abort(); onMediaBusyChange(false); } };
  }, [onMediaBusyChange]);
  const c = settings.continuity;
  const sourceId = c.sourceKind === 'video' ? c.sourceVideoId : c.sourceId;
  const active = hasOfficialH3Continuity(settings);
  const update = (patch: Partial<typeof c>) => onChange({ ...latest.current, continuity: { ...latest.current.continuity, ...patch } });
  React.useEffect(() => {
    setClips([]); setError('');
    if (!comfyConnected || !continuityOpen) return;
    const abort = new AbortController();
    fetch(`/comfy/df_h3_continuity/session/${encodeURIComponent(c.session)}${c.sourceId ? `?selected=${encodeURIComponent(c.sourceId)}` : ''}`, { signal: abort.signal })
      .then(async response => { const data = await response.json(); if (!response.ok || !Array.isArray(data.clips)) throw new Error(data.error || 'Update DaSiWa nodes to load continuity checkpoints.'); if (!abort.signal.aborted) setClips(data.clips); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load checkpoints.'); });
    return () => abort.abort();
  }, [comfyConnected, continuityOpen, c.session, c.sourceId, refresh]);
  React.useEffect(() => {
    if (!comfyConnected || !refModsOpen || mode !== 'REF2VA') return;
    const abort = new AbortController();
    fetch('/comfy/dasiwa/refmods', { signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'Could not load RefMods.');
      if (!abort.signal.aborted) { setLibrary(data); setRefError(''); }
    }).catch(cause => { if (!abort.signal.aborted) setRefError(cause instanceof Error ? cause.message : 'Could not load RefMods.'); });
    return () => abort.abort();
  }, [comfyConnected, refModsOpen, mode, refresh]);
  React.useEffect(() => { setCheck(''); }, [sourceId, c.session, c.sourceKind, c.overlapFrames, mode, width, height, frameRate, durationSeconds]);
  const upload = async (file: File) => {
    const before = latest.current.continuity;
    const abort = new AbortController(); operation.current = abort;
    setBusy(true); setError(''); onMediaBusyChange(true);
    try {
      const uploaded = await fetch('/api/comfy/upload-media', { signal: abort.signal, method: 'POST', headers: { 'Content-Type': file.type || 'video/mp4', 'x-umbra-media-kind': 'video', 'x-umbra-file-name': encodeURIComponent(file.name) }, body: file });
      const media = await uploaded.json(); if (!uploaded.ok || !media.filename) throw new Error(media.error || 'Video upload failed.');
      const response = await fetch('/comfy/df_h3_continuity/video', { signal: abort.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: media.filename }) });
      const data = await response.json(); if (!response.ok || !data.clip_id) throw new Error(data.error || 'Could not prepare continuity source.');
      if (latest.current.continuity.session !== before.session) throw new Error('Session changed during upload. Upload the source into the current session.');
      if (mounted.current && !abort.signal.aborted) update({ sourceKind: 'video', sourceVideoId: data.clip_id, capture: true });
    } catch (cause) { if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Source upload failed.'); }
    finally { if (operation.current === abort) operation.current = null; if (mounted.current) { setBusy(false); onMediaBusyChange(false); if (input.current) input.current.value = ''; } }
  };
  const inspect = async (match = false) => {
    const abort = new AbortController(); operation.current = abort;
    setBusy(true); setError(''); onMediaBusyChange(true);
    try {
      const response = await fetch('/comfy/df_h3_continuity/preflight', { signal: abort.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: c.session, source_kind: c.sourceKind, source_id: sourceId, mode, width, height, frame_rate: frameRate, duration: durationSeconds, overlap_frames: c.overlapFrames }) });
      const data = await response.json();
      if (!mounted.current || abort.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || 'Source check failed.');
      if (match && c.sourceKind === 'checkpoint' && data.source?.width && data.source?.height) {
        onMatchSource({ width: data.source.width, height: data.source.height, mode: data.source.mode_family === 'ref2va' ? 'REF2VA' : mode === 'REF2VA' ? 'I2VA' : mode });
        setCheck('Source settings restored. Check source to verify the updated settings.');
        if (!data.ok && Array.isArray(data.issues)) setError(data.issues.join(' '));
      } else {
        if (!response.ok || !data.ok) throw new Error(Array.isArray(data.issues) ? data.issues.join(' ') : data.error || 'Source check failed.');
        setCheck(`${Number(data.total_seconds || 0).toFixed(2)}s total${data.notes?.length ? ` · ${data.notes.join(' ')}` : ''}`);
      }
    } catch (cause) { if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Source check failed.'); }
    finally { if (operation.current === abort) operation.current = null; if (mounted.current) { setBusy(false); onMediaBusyChange(false); } }
  };
  return <div className="min-w-0 space-y-2 border-t border-white/10 pt-2">
    <details open={continuityOpen} onToggle={event => setContinuityOpen(event.currentTarget.open)} className="min-w-0">
      <summary className="cursor-pointer py-2 text-xs font-semibold">Continuity{active ? ' · Active' : ''}</summary>
      <div className="grid min-w-0 grid-cols-2 gap-3 pb-3 text-[11px] text-zinc-400">
        <label className="min-w-0 space-y-1">Session<button type="button" disabled={disabled || busy} className={`${fieldClass} flex items-center gap-2 text-left`} onClick={() => setSessionOpen(true)}><FolderOpen size={14} /><span className="truncate">{c.session}</span></button></label>
        <label className="min-w-0 space-y-1">Source<UmbraSelectControl aria-label="Continuity source kind" value={c.sourceKind} disabled={disabled || busy} className={fieldClass} onChange={event => update({ sourceKind: event.target.value as typeof c.sourceKind })}><option value="checkpoint">Checkpoint</option><option value="video">Uploaded video</option></UmbraSelectControl></label>
        {c.sourceKind === 'checkpoint' ? <div className="col-span-2 min-w-0 space-y-1"><label htmlFor="official-h3-continuity-checkpoint">Continue from</label><div className="flex min-w-0 gap-2"><UmbraSelectControl id="official-h3-continuity-checkpoint" aria-label="Continuity checkpoint" className={fieldClass} disabled={disabled || busy || !comfyConnected} value={c.sourceId} onChange={event => update({ sourceId: event.target.value })}><option value="">New take</option>{c.sourceId && !clips.some(clip => clip.clip_id === c.sourceId) ? <option value={c.sourceId}>{c.sourceId}</option> : null}{clips.map(clip => <option key={clip.clip_id} value={clip.clip_id}>{Number(clip.seconds).toFixed(1)}s · {clip.clip_id.slice(0, 12)}</option>)}</UmbraSelectControl><button type="button" className={buttonClass} disabled={disabled || busy} title="Browse checkpoint previews" aria-label="Browse checkpoint previews" onClick={() => setSessionOpen(true)}><Film size={14} /></button></div></div> : <div className="col-span-2 flex min-w-0 items-center gap-2"><button type="button" disabled={disabled || busy || !comfyConnected} className={buttonClass} onClick={() => input.current?.click()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FolderUp size={14} />}Upload source video</button><span className="min-w-0 truncate" title={sourceId}>{sourceId}</span><input ref={input} type="file" accept="video/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>}
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={c.capture || active} disabled={disabled || active || busy} onChange={event => update({ capture: event.target.checked })} />Save new takes as checkpoints</label>
        {active ? <><label className="min-w-0 space-y-1">Context frames<UmbraSelectControl aria-label="Continuity context frames" value={String(c.overlapFrames)} disabled={disabled || busy} className={fieldClass} onChange={event => update({ overlapFrames: Number(event.target.value) as typeof c.overlapFrames })}>{[5, 22, 39, 56, 73].map(value => <option key={value} value={value}>{value}</option>)}</UmbraSelectControl></label><label className="flex items-center gap-2"><input type="checkbox" checked={c.useReferences} disabled={disabled || busy || mode !== 'REF2VA'} onChange={event => update({ useReferences: event.target.checked })} />Keep REF2VA references</label><div className="col-span-2 flex flex-wrap gap-2"><button type="button" disabled={disabled || busy || !comfyConnected} className={buttonClass} onClick={() => void inspect()}>Check source</button>{c.sourceKind === 'checkpoint' ? <button type="button" disabled={disabled || busy || !comfyConnected} className={buttonClass} onClick={() => void inspect(true)}>Match source settings</button> : null}<button type="button" disabled={disabled || busy} className={buttonClass} title="Clear continuity source" aria-label="Clear continuity source" onClick={() => update({ sourceId: '', sourceVideoId: '' })}><X size={14} /></button></div></> : null}
        <button type="button" disabled={disabled || busy || !comfyConnected} className={buttonClass} title="Refresh checkpoints" aria-label="Refresh checkpoints" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /></button>
        {check ? <p role="status" className="col-span-2">{check}</p> : null}{error ? <p role="alert" className="col-span-2 text-amber-300">{error}</p> : null}
      </div>
    </details>
    {mode === 'REF2VA' ? <details open={refModsOpen} onToggle={event => setRefModsOpen(event.currentTarget.open)} className="min-w-0 border-t border-white/10">
      <summary className="cursor-pointer py-2 text-xs font-semibold">RefMods · {settings.refMods.filter(row => row.enabled && row.name).length}</summary>
      <div className="space-y-2 pb-3">
        {settings.refMods.map(row => <div key={row.slot} className="grid min-w-0 grid-cols-2 gap-2 rounded border border-white/10 p-2 text-[11px] text-zinc-400">
          <label className="flex items-center gap-2"><input type="checkbox" checked={row.enabled} disabled={disabled} onChange={event => onChange({ ...latest.current, refMods: latest.current.refMods.map(item => item.slot === row.slot ? { ...item, enabled: event.target.checked } : item) })} />RefMod {row.slot}</label>
          <button type="button" className={`${buttonClass} justify-self-end`} aria-label={`Remove RefMod ${row.slot}`} title="Remove RefMod" disabled={disabled} onClick={() => onChange({ ...latest.current, refMods: latest.current.refMods.filter(item => item.slot !== row.slot) })}><Trash2 size={14} /></button>
          <UmbraSelectControl aria-label={`RefMod ${row.slot} file`} className={`${fieldClass} col-span-2`} value={row.name} disabled={disabled || !comfyConnected} onChange={event => onChange({ ...latest.current, refMods: latest.current.refMods.map(item => item.slot === row.slot ? { ...item, name: event.target.value } : item) })}><option value="">Select RefMod</option>{row.name && !library.some(item => item.name === row.name) ? <option value={row.name}>{row.name} (unavailable)</option> : null}{library.map(item => <option data-i18n-skip="" key={item.name} value={item.name}>{item.name} ({item.kind})</option>)}</UmbraSelectControl>
          <label className="space-y-1">Strength<input aria-label={`RefMod ${row.slot} strength`} type="number" min={0} max={1} step={0.05} value={row.strength} disabled={disabled} className={fieldClass} onChange={event => onChange({ ...latest.current, refMods: latest.current.refMods.map(item => item.slot === row.slot ? { ...item, strength: Number(event.target.value) } : item) })} /></label>
          <label className="col-span-2 space-y-1">Description<textarea aria-label={`RefMod ${row.slot} description`} value={row.description} disabled={disabled} className={`${fieldClass} min-h-16`} onChange={event => onChange({ ...latest.current, refMods: latest.current.refMods.map(item => item.slot === row.slot ? { ...item, description: event.target.value } : item) })} /></label>
        </div>)}
        <button type="button" disabled={disabled || settings.refMods.length >= 8} aria-label="Add RefMod" title="Add RefMod" className={buttonClass} onClick={() => { const slot = [1, 2, 3, 4, 5, 6, 7, 8].find(value => !latest.current.refMods.some(row => row.slot === value)); if (slot) onChange({ ...latest.current, refMods: [...latest.current.refMods, { slot, name: '', enabled: false, strength: 1, description: '' }] }); }}><Plus size={14} /></button>
        {refError ? <p role="alert" className="text-xs text-amber-300">{refError}</p> : null}
      </div>
    </details> : null}
    {sessionOpen ? <UmbraH3ContinuitySessionModal currentSession={c.session} currentSourceId={c.sourceKind === 'checkpoint' ? c.sourceId : ''} comfyConnected={comfyConnected} onClose={() => setSessionOpen(false)} onSelect={selection => update({ ...h3ContinuitySelectionPatch(selection), nextPrompt: '' })} /> : null}
  </div>;
}
