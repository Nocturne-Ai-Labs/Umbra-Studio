import React from 'react';
import { ArrowLeftRight, ImagePlus, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { OFFICIAL_VIDEO_EDITOR_MODES } from '../../../../shared/umbra-ui/officialVideoEditor';
import { hasOfficialH3Continuity } from '../../../../shared/umbra-ui/officialH3Director';
import { videoShotInputIssue, setVideoShotFrame, switchVideoProjectMode, videoModeLabel, type VideoStudioProject } from '../../../../shared/umbra-ui/videoStudioProject';

const control = 'min-h-9 min-w-0 rounded border border-white/15 bg-black/25 px-2 text-xs';
export function VideoStudioShotInputs({ project, disabled, onChange }: { project: VideoStudioProject; disabled: boolean; onChange: (p: VideoStudioProject) => void }) {
  const shot = project.shots.find(s => s.id === project.activeShotId)!;
  const [error, setError] = React.useState('');
  const [hover, setHover] = React.useState<number | null>(null);
  const mode = shot.draft.mode;
  const paired = ['FL2VA', 'FLF2V'].includes(mode);
  const imageMode = paired || ['I2VA', 'L2VA', 'I2V'].includes(mode);
  const refs = shot.draft.references.filter(r => r.enabled !== false);
  const continuing = hasOfficialH3Continuity(shot.draft.h3);
  const update = (next: typeof shot) => onChange({ ...project, shots: project.shots.map(s => s.id === shot.id ? next : s) });
  const place = (id: string, index: number) => {
    if (disabled) return;
    try {
      const media = project.media.find(m => m.id === id);
      if (!media) return;
      update(setVideoShotFrame(shot, media, index)); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not set frame.'); }
  };
  return <section aria-label="Shot input mode" className="space-y-2 rounded border border-white/10 bg-black/20 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs">Shot type
        <UmbraSelectControl aria-label="Shot type" title="Unused media stays in the project tray when changing type. Undo restores the previous settings." className={control} value={mode} disabled={disabled} onChange={e => { setError(''); onChange(switchVideoProjectMode(project, shot.id, e.target.value)); }}>
          {OFFICIAL_VIDEO_EDITOR_MODES[shot.workflowId].map(m => <option key={m} value={m}>{videoModeLabel(m)}</option>)}
        </UmbraSelectControl>
      </label>
      {paired ? <button className={control + ' inline-flex items-center gap-2'} disabled={disabled || refs.length !== 2} onClick={() => {
        const a = { ...refs[0], name: refs[0].filename }, b = { ...refs[1], name: refs[1].filename };
        update(setVideoShotFrame(setVideoShotFrame(shot, b, 0), a, 1));
      }}><ArrowLeftRight size={14} />Swap frames</button> : null}
    </div>
    {continuing ? <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--umbra-accent)]">
      <span className="min-w-0 break-all">Continuing from {shot.draft.h3?.continuity.sourceKind === 'video' ? shot.draft.h3.continuity.sourceVideoId : shot.draft.h3?.continuity.sourceId}</span>
      <button className={control} disabled={disabled} onClick={() => { if (shot.draft.h3) update({ ...shot, draft: { ...shot.draft, h3: { ...shot.draft.h3, continuity: { ...shot.draft.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' } } } }); }}><X size={14} className="inline" /> Start independently</button>
      <p className="w-full text-zinc-400">The continuation source drives this shot. Replacing a frame starts a new independent shot.</p>
    </div> : null}
    {['T2VA', 'T2V'].includes(mode) ? <p className="text-xs text-zinc-400">Prompt-only shot. Describe the scene below; no media is required. Project media stays in the tray.</p> :
      imageMode ? <div className="grid gap-3 sm:grid-cols-2">
        {(paired ? ['First frame', 'Last frame'] : [mode === 'L2VA' ? 'Last frame' : 'Starting image']).map((label, index) => {
          const ref = refs[index], unavailable = disabled || (index === 1 && !refs[0]);
          return <div key={label} aria-label={label + ' slot'} className={'rounded border border-dashed p-2 ' + (hover === index ? 'border-[var(--umbra-accent)] bg-white/5' : 'border-white/15')}
            onDragOver={e => { if (!unavailable && e.dataTransfer.types.includes('application/x-umbra-video-project-media')) { e.preventDefault(); setHover(index); } }}
            onDragLeave={() => setHover(null)} onDrop={e => { e.preventDefault(); setHover(null); if (!unavailable) place(e.dataTransfer.getData('application/x-umbra-video-project-media'), index); }}>
            <p className="mb-2 text-xs font-semibold">{label}</p>
            {ref ? <img alt={label} src={'/comfy/view?type=input&filename=' + encodeURIComponent(ref.filename)} className="h-20 w-full object-contain" /> : <div className="flex h-20 items-center justify-center gap-2 text-xs text-zinc-500"><ImagePlus size={18} />{index === 1 && !refs[0] ? 'Set the first frame first' : 'Drop an image here'}</div>}
            <UmbraSelectControl aria-label={'Choose ' + label.toLowerCase()} className={control + ' mt-2 w-full'} disabled={unavailable} value={project.media.find(m => m.filename === ref?.filename)?.id || ''} onChange={e => place(e.target.value, index)}>
              <option value="">{ref ? ref.filename : 'Choose from project media'}</option>
              {project.media.filter(m => m.kind === 'image').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </UmbraSelectControl>
          </div>;
        })}
      </div> : <p className="text-xs text-zinc-400">{mode === 'V2V' ? 'Drop a video onto this shot to use it as the source.' : 'Add images, video or audio from the tray. Reference details and continuity remain available below.'}</p>}
    {videoShotInputIssue(shot) ? <p role="status" className="text-xs text-amber-200">{videoShotInputIssue(shot)}</p> : null}
    {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
  </section>;
}
