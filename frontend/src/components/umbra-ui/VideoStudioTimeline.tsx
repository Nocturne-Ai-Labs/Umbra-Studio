import React from 'react';
import { VideoStudioShotInputs } from './VideoStudioShotInputs';
import { ArrowLeft, ArrowRight, Copy, Check, Loader2, Film, Music2, Plus, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { applyOfficialVideoMediaHandoff, readOfficialVideoReferenceDimensions } from '@/lib/umbraOfficialVideoMediaHandoff';
import { readOfficialH3DirectorSettings } from '../../../../shared/umbra-ui/officialH3Director';
import { videoModeLabel, setVideoShotFrame, resizeVideoShot, videoShotStarts, type VideoStudioProject, type VideoStudioMedia, type VideoStudioShot } from '../../../../shared/umbra-ui/videoStudioProject';

const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/15 px-2 text-xs hover:bg-white/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]';
const input = 'min-h-9 min-w-0 rounded border border-white/15 bg-black/25 px-2 text-xs text-[var(--umbra-text)]';
const MEDIA = 'application/x-umbra-video-project-media';
const SHOT = 'application/x-umbra-video-project-shot';

function ShotDurationInput({ shot, disabled, onChange }: {
  shot: VideoStudioShot; disabled: boolean; onChange: (seconds: number) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = (value: string) => {
    const seconds = Number(value);
    if (value.trim() && Number.isFinite(seconds) && seconds > 0) onChange(seconds);
  };
  return <input aria-label="Selected shot duration" className={input + ' w-24'}
    inputMode="decimal" value={draft ?? String(Number(shot.draft.durationSeconds.toFixed(6)))} disabled={disabled}
    onChange={event => { setDraft(event.target.value); commit(event.target.value); }}
    onBlur={() => { if (draft !== null) commit(draft); setDraft(null); }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

export function VideoStudioTimeline({ project, onChange, disabled, comfyConnected, onBusy }: {
  project: VideoStudioProject; onChange: (project: VideoStudioProject) => void;
  disabled: boolean; comfyConnected: boolean; onBusy: (busy: boolean) => void;
}) {
  const [zoom, setZoom] = React.useState(32);
  const [role, setRole] = React.useState('reference');
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [importProgress, setImportProgress] = React.useState('');
  React.useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer); }, [notice]);
  const [uploading, setUploading] = React.useState(false);
  const [resizePreview, setResizePreview] = React.useState<{ id: string; duration: number } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef(project); latest.current = project;
  const cleanup = React.useRef<(() => void) | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { cleanup.current?.(); abort.current?.abort(); }, []);
  const active = project.shots.find(s => s.id === project.activeShotId)!;
  const starts = videoShotStarts(project);
  const total = project.shots.reduce((sum, s) => sum + s.draft.durationSeconds, 0);
  const mutateShot = (id: string, update: (shot: VideoStudioShot) => VideoStudioShot) => {
    const p = latest.current;
    onChange({ ...p, shots: p.shots.map(s => s.id === id ? update(s) : s) });
  };
  const move = (id: string, target: number) => {
    const p = latest.current, index = p.shots.findIndex(s => s.id === id);
    if (index < 0 || target < 0 || target >= p.shots.length || index === target) return;
    const shots = [...p.shots], [shot] = shots.splice(index, 1); shots.splice(target, 0, shot);
    onChange({ ...p, shots }); setNotice(shot.name + ' moved to position ' + (target + 1) + '.');
  };
  const addShot = (duplicate: boolean) => {
    const draft = structuredClone(active.draft);
    if (!duplicate) { draft.prompt = ''; draft.references = []; draft.mode = active.workflowId === 'h3-26' ? 'T2VA' : 'T2V'; }
    if (draft.h3) draft.h3.continuity = { ...draft.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' };
    const shot = { id: crypto.randomUUID(), name: 'Shot ' + (project.shots.length + 1), workflowId: active.workflowId, draft };
    onChange({ ...project, activeShotId: shot.id, shots: [...project.shots, shot] });
  };
  const continueLatest = async () => {
    onBusy(true); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch('/comfy/df_h3_continuity/session/' + project.id, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.clips)) throw new Error(data.error || 'Could not load project continuity.');
      const latestClip = [...data.clips].sort((a, b) => Number(b.completed_ns) - Number(a.completed_ns))[0];
      if (!latestClip?.clip_id) throw new Error('Generate a shot with continuity capture first.');
      const h3 = active.draft.h3 || readOfficialH3DirectorSettings({});
      const check = await fetch('/comfy/df_h3_continuity/preflight', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: project.id, source_kind: 'checkpoint',
          source_id: latestClip.clip_id, mode: active.draft.mode, width: active.draft.width, height: active.draft.height,
          frame_rate: 24, duration: active.draft.durationSeconds, overlap_frames: h3.continuity.overlapFrames }) });
      const info = await check.json();
      if (!check.ok || !info.source?.width || !info.source?.height) throw new Error(info.error || 'Continuity source dimensions are unavailable.');
      mutateShot(active.id, shot => ({ ...shot, draft: { ...shot.draft, width: info.source.width, height: info.source.height,
        frameRate: 24, resolution: { mode: 'fixed' },
        mode: info.source.mode_family === 'ref2va' ? 'REF2VA' : shot.draft.mode === 'REF2VA' ? 'I2VA' : shot.draft.mode,
        h3: { ...h3, continuity: { ...h3.continuity, session: project.id, sourceKind: 'checkpoint', sourceId: latestClip.clip_id,
          sourceVideoId: '', capture: true, nextPrompt: shot.draft.prompt } } } }));
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not continue shot.'); }
    finally { if (!controller.signal.aborted) onBusy(false); abort.current = null; }
  };
  const place = (mediaId: string, shotId?: string) => {
    if (disabled) return;
    try {
      const p = latest.current, media = p.media.find(m => m.id === mediaId);
      if (!media) return;
      const source = p.shots.find(s => s.id === p.activeShotId)!;
      const fresh = structuredClone(source.draft);
      fresh.references = []; fresh.prompt = ''; fresh.mode = source.workflowId === 'h3-26' ? 'T2VA' : 'T2V';
      if (fresh.h3) fresh.h3.continuity = { ...fresh.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' };
      const shot = shotId ? p.shots.find(s => s.id === shotId) : {
        id: crypto.randomUUID(), name: 'Shot ' + (p.shots.length + 1), workflowId: source.workflowId, draft: fresh,
      };
      if (!shot) return;
      let draft = shot.draft;
      const placement = shotId && ['REF2VA', 'V2V'].includes(draft.mode) ? 'reference' : role;
      if (shotId && ['T2VA', 'T2V'].includes(draft.mode)) throw new Error('Choose an image or reference shot type below before placing media.');
      if (shotId && ['I2VA', 'L2VA', 'I2V', 'FL2VA', 'FLF2V'].includes(draft.mode)) {
        const index = ['FL2VA', 'FLF2V'].includes(draft.mode) && (placement === 'last' || draft.references.length === 1) ? 1 : 0;
        const updated = setVideoShotFrame(shot, media, index);
        onChange({ ...p, activeShotId: shot.id, shots: p.shots.map(s => s.id === shot.id ? updated : s) });
        setNotice(media.name + ' placed in ' + shot.name + '.'); setError(''); return;
      }
      if (shotId && draft.mode === 'V2V' && media.kind !== 'video') throw new Error('This shot needs a video source.');
      if (media.kind === 'audio') {
        if (shot.workflowId !== 'h3-26' || placement !== 'reference') throw new Error('Audio is supported as an H3 reference.');
        draft = { ...draft, mode: 'REF2VA', references: [...draft.references, { ...media, id: crypto.randomUUID() }] };
      } else {
        if (placement !== 'reference' && media.kind !== 'image') throw new Error('Frame positions require an image.');
        const h3DirectorRole = shot.workflowId === 'h3-26' && placement === 'reference' ? media.kind === 'video' ? 'motion_video' : 'reference_image' : undefined;
        draft = applyOfficialVideoMediaHandoff(draft, shot.workflowId, {
          mode: 'video', path: media.filename, originalSourcePath: media.filename, imageUrl: '', name: media.name, source: 'video-project', createdAt: Date.now(),
          videoFrameRole: placement === 'last' ? 'last' : media.kind === 'video' ? 'source_video' : 'first',
          ...(h3DirectorRole ? { h3DirectorRole } : {}),
        }, media.filename, media);
        draft.references = draft.references.map(r => r.filename === media.filename ? { ...r, prompt: media.prompt } : r);
      }
      onChange({ ...p, activeShotId: shot.id, shots: shotId ? p.shots.map(s => s.id === shotId ? { ...s, draft } : s) : [...p.shots, { ...shot, draft }] }); setDropTarget(null); setError(''); setNotice(media.name + ' added to ' + shot.name + '.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not place media.'); }
  };
  const importFiles = async (files: File[]) => {
    const target = latest.current.id;
    const controller = new AbortController(); abort.current = controller;
    setUploading(true); onBusy(true); setError('');
    try {
      for (const [index, file] of files.entries()) {
        setImportProgress((index + 1) + ' / ' + files.length + ' · ' + file.name);
        const kind = file.type.split('/')[0];
        if (kind !== 'image' && kind !== 'video' && kind !== 'audio') throw new Error('Choose image, video, or audio files.');
        const response = await fetch('/api/comfy/upload-media', { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': file.type, 'x-umbra-media-kind': kind, 'x-umbra-file-name': encodeURIComponent(file.name) }, body: file });
        const result = await response.json();
        if (!response.ok || !result.filename) throw new Error(result.error || 'Media import failed.');
        const dimensions = await readOfficialVideoReferenceDimensions(result.sourcePath, kind, controller.signal);
        if (latest.current.id !== target) throw new Error('Project changed while importing.');
        const media: VideoStudioMedia = { id: crypto.randomUUID(), kind, name: file.name, filename: result.filename, prompt: '', startSeconds: 0, durationSeconds: kind === 'image' ? 1 : 2, ...dimensions };
        const next = { ...latest.current, media: [...latest.current.media, media] };
        latest.current = next; onChange(next);
        setNotice((index + 1) + ' media imported. Drag to a shot or click to place.');
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Media import failed.'); }
    finally { if (!controller.signal.aborted) { setUploading(false); onBusy(false); } abort.current = null; if (fileInput.current) fileInput.current.value = ''; }
  };
  const resize = (event: React.PointerEvent, shot: VideoStudioShot) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const x = event.clientX, original = shot.draft.durationSeconds;
    let seconds = original;
    const update = (e: PointerEvent) => {
      seconds = Math.max(1 / shot.draft.frameRate, Math.round((original + (e.clientX - x) / zoom) * shot.draft.frameRate) / shot.draft.frameRate);
      setResizePreview({ id: shot.id, duration: seconds });
    };
    const stop = () => { window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel); setResizePreview(null); cleanup.current = null; };
    const finish = () => { stop(); mutateShot(shot.id, s => ({ ...s, draft: resizeVideoShot(s.draft, seconds) })); };
    const cancel = () => stop();
    cleanup.current = stop;
    window.addEventListener('pointermove', update); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', cancel);
  };
  return <div className="min-w-0 space-y-3" data-video-project-timeline="">
    <section aria-label="Project media" style={{ borderColor: 'color-mix(in srgb, var(--umbra-text) 10%, transparent)' }} className="umbra-surface-soft min-w-0 border-y border-white/10 py-2">
      <div className="flex flex-wrap items-center gap-2 px-2">
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-wider">Project media</h3>
        <label className="flex items-center gap-2 text-xs text-zinc-400">New shot
          <UmbraSelectControl aria-label="Media placement" value={role} onChange={event => setRole(event.target.value)} className={input}>
            <option value="reference">Reference</option><option value="first">First frame</option><option value="last">Last frame</option>
          </UmbraSelectControl>
        </label>
        <button className={button} disabled={disabled || uploading || !comfyConnected} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{uploading ? 'Importing…' : 'Import media'}</button>
        <input ref={fileInput} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={event => void importFiles(Array.from(event.target.files || []))} />
      </div>
      <div className="flex min-h-24 gap-2 overflow-x-auto p-2 custom-scrollbar" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
        onDrop={event => { if (event.dataTransfer.files.length && !disabled && comfyConnected) { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); } }}>
        {project.media.map(media => <div key={media.id} className="relative w-28 shrink-0 rounded border border-white/10 bg-black/20">
          <button draggable={!disabled} disabled={disabled} aria-label={'Place ' + media.name + ' in selected shot'} title={'Drag to a shot, or click to add to ' + active.name}
            onDragEnd={() => setDropTarget(null)} onDragStart={event => { event.dataTransfer.setData(MEDIA, media.id); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => place(media.id, active.id)}
            className="flex h-20 w-full flex-col items-center justify-center overflow-hidden">
            {media.kind === 'image' ? <img draggable={false} src={'/comfy/view?type=input&filename=' + encodeURIComponent(media.filename)} alt="" className="h-14 w-full object-contain" /> : media.kind === 'video' ? <Film size={24} /> : <Music2 size={24} />}
            <span className="w-full truncate px-1 text-[10px]">{media.name}</span>
          </button>
          <button title="Remove from tray only; existing shots and original files are kept" className="absolute right-0 top-0 rounded bg-black/80 p-1" disabled={disabled} aria-label={'Remove ' + media.name + ' from project tray'}
            onClick={() => onChange({ ...project, media: project.media.filter(m => m.id !== media.id) })}><XIcon /></button>
        </div>)}
        {!project.media.length ? <p className="self-center text-xs text-zinc-500">Import images, video or audio, then drag them onto a shot below. You can also send media here from Gallery.</p> : null}
      </div>
      {project.media.length ? <p className="px-2 text-[10px] text-zinc-400">Drag media onto a shot, or click to add to <strong className="text-[var(--umbra-text)]">{active.name}</strong>.</p> : null}
    </section>
    <section aria-label="Shot timeline" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-wider">Timeline <span className="font-normal text-zinc-400">{project.shots.length} {project.shots.length === 1 ? 'shot' : 'shots'} · {total.toFixed(2)}s</span></h3>
        <button className={button} disabled={disabled} onClick={() => addShot(false)}><Plus size={14} />Add shot</button>
        <button className={button} disabled={disabled} title="Duplicate selected shot" aria-label="Duplicate selected shot" onClick={() => addShot(true)}><Copy size={14} /></button>
        <button className={button} title="Zoom timeline out" aria-label="Zoom timeline out" onClick={() => setZoom(v => Math.max(8, v / 1.25))}><ZoomOut size={14} /></button>
        <button className={button} title="Zoom timeline in" aria-label="Zoom timeline in" onClick={() => setZoom(v => Math.min(160, v * 1.25))}><ZoomIn size={14} /></button>
      </div>
      <div className="overflow-x-auto border-y border-white/10 bg-black/20 p-2 custom-scrollbar">
        <div className="flex min-w-full items-stretch gap-1" style={{ width: Math.max(400, project.shots.reduce((sum, shot) => sum + Math.max(72, shot.draft.durationSeconds * zoom) + 4, 0) + 180) }}>
          {project.shots.map((shot, index) => {
            const duration = resizePreview?.id === shot.id ? resizePreview.duration : shot.draft.durationSeconds;
            return <div key={shot.id} className={"relative shrink-0 rounded " + (dropTarget === shot.id ? "ring-2 ring-[var(--umbra-accent)]" : "")} style={{ width: Math.max(72, duration * zoom) }}
              onDragOver={event => { if (!disabled && (event.dataTransfer.types.includes(MEDIA) || event.dataTransfer.types.includes(SHOT))) { event.preventDefault(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(MEDIA) ? 'copy' : 'move'; setDropTarget(shot.id); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}
              onDrop={event => { event.preventDefault(); event.stopPropagation(); setDropTarget(null); if (disabled) return; const mediaId = event.dataTransfer.getData(MEDIA), shotId = event.dataTransfer.getData(SHOT); if (mediaId) place(mediaId, shot.id); else if (shotId) move(shotId, index); }}>
              <span className="text-[10px] tabular-nums text-zinc-500">{starts[index].toFixed(2)}s</span>
              <button draggable={!disabled} disabled={disabled} aria-pressed={active.id === shot.id} aria-label={'Select ' + shot.name}
                onDragStart={event => { event.dataTransfer.setData(SHOT, shot.id); event.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => onChange({ ...project, activeShotId: shot.id })}
                className={'flex h-28 w-full flex-col items-start justify-center overflow-hidden rounded border px-2 text-left ' + (active.id === shot.id ? 'border-[var(--umbra-accent)] bg-[color-mix(in_srgb,var(--umbra-accent)_12%,transparent)]' : 'border-white/15 bg-white/5')}>
                <span className="pointer-events-none mb-1 flex h-10 w-full gap-1 overflow-hidden">
                  {shot.draft.references.filter(ref => ref.enabled !== false).map(ref => <span key={ref.id} className="flex h-10 min-w-10 items-center justify-center overflow-hidden rounded bg-black/40" title={ref.filename}>
                    {ref.kind === 'image' ? <img draggable={false} alt="" src={'/comfy/view?type=input&filename=' + encodeURIComponent(ref.filename)} className="h-10 w-14 object-cover" /> : ref.kind === 'video' ? <Film size={20} /> : <Music2 size={20} />}
                  </span>)}
                  {!shot.draft.references.length ? <span className="self-center text-[10px] text-zinc-500">{['T2VA', 'T2V'].includes(shot.draft.mode) ? 'Prompt-only shot' : 'Drop media here'}</span> : null}
                </span>
                <span className="flex max-w-full items-center gap-1 truncate text-xs font-semibold">{active.id === shot.id ? <Check size={12} className="shrink-0 text-[var(--umbra-accent)]" /> : null}{shot.name}</span><span className="text-[10px] text-zinc-400">{duration.toFixed(2)}s · {videoModeLabel(shot.draft.mode)}</span>
                <span className="max-w-full truncate text-[10px] text-zinc-500">{shot.draft.prompt || 'Add a prompt'}</span>
              </button>
              <div role="slider" aria-label={'Resize ' + shot.name} aria-valuenow={duration} aria-valuetext={duration.toFixed(2) + ' seconds'} title="Drag to change duration; arrow keys adjust one frame" aria-valuemin={1 / shot.draft.frameRate} tabIndex={disabled ? -1 : 0}
                className="absolute bottom-0 right-0 h-28 w-3 cursor-ew-resize touch-none rounded-r border-r-2 border-[var(--umbra-accent)] hover:bg-white/15"
                onPointerDown={event => resize(event, shot)} onKeyDown={event => { if (disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); mutateShot(shot.id, s => ({ ...s, draft: resizeVideoShot(s.draft, s.draft.durationSeconds + (event.key === 'ArrowRight' ? 1 : -1) / s.draft.frameRate) })); }} />
            </div>;
          })}
          <div aria-label="Drop media to create a new shot" className={'mt-4 flex min-h-28 min-w-40 flex-1 items-center justify-center rounded border border-dashed px-3 text-center text-xs ' + (dropTarget === 'new' ? 'border-[var(--umbra-accent)] bg-white/10' : 'border-white/15 text-zinc-500')}
            onDragOver={event => { if (!disabled && event.dataTransfer.types.includes(MEDIA)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropTarget('new'); } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}
            onDrop={event => { event.preventDefault(); event.stopPropagation(); setDropTarget(null); const id = event.dataTransfer.getData(MEDIA); if (id && !disabled) place(id); }}>
            <span className="pointer-events-none">Drop media to add a shot</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="text-xs text-[var(--umbra-accent)]">Editing shot {project.shots.indexOf(active) + 1} of {project.shots.length}</span><input aria-label="Shot name" className={input + ' w-40'} value={active.name} disabled={disabled} onChange={event => mutateShot(active.id, s => ({ ...s, name: event.target.value }))} maxLength={200} />
        <label className="flex items-center gap-2 text-xs text-zinc-400">Duration<ShotDurationInput key={active.id} shot={active} disabled={disabled}
          onChange={seconds => mutateShot(active.id, s => ({ ...s, draft: resizeVideoShot(s.draft, seconds) }))} />s</label>
        <button className={button} title="Move shot earlier" aria-label="Move shot earlier" disabled={disabled || active.id === project.shots[0].id} onClick={() => move(active.id, project.shots.indexOf(active) - 1)}><ArrowLeft size={14} /></button>
        <button className={button} title="Move shot later" aria-label="Move shot later" disabled={disabled || active.id === project.shots.at(-1)?.id} onClick={() => move(active.id, project.shots.indexOf(active) + 1)}><ArrowRight size={14} /></button>
        <button className={button} title="Remove selected shot" aria-label="Remove selected shot" disabled={disabled || project.shots.length === 1} onClick={() => onChange({ ...project, activeShotId: project.shots.find(s => s.id !== active.id)!.id, shots: project.shots.filter(s => s.id !== active.id) })}><Trash2 size={14} /></button>
        {active.workflowId === 'h3-26' ? <button className={button} title="Continue from the most recently generated clip in this project" disabled={disabled || !comfyConnected} onClick={() => void continueLatest()}>Continue latest clip</button> : null}

      </div>
    </section>
    <VideoStudioShotInputs key={active.id} project={project} disabled={disabled} onChange={onChange} />
    <div role="status" aria-live="polite" className="text-xs text-zinc-400">
      {uploading ? 'Importing ' + importProgress : notice}
    </div>
    {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
  </div>;
}
function XIcon() { return <Trash2 size={12} />; }
