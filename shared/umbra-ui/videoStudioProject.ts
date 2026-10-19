import type { OfficialVideoEditorDraft } from './officialVideoEditor';
import { OFFICIAL_VIDEO_EDITOR_MODES } from './officialVideoEditor';
import type { OfficialVideoWorkflowId } from './officialVideoWorkflow';
import { hasOfficialH3Continuity, readOfficialH3DirectorSettings } from './officialH3Director';

export type VideoStudioMedia = OfficialVideoEditorDraft['references'][number] & { name: string };
export interface VideoStudioShot {
  id: string;
  name: string;
  workflowId: OfficialVideoWorkflowId;
  draft: OfficialVideoEditorDraft;
  lastJobId?: string;
}
export interface VideoStudioProject {
  version: 1;
  id: string;
  name: string;
  revision: number;
  updatedAt: number;
  overallPrompt: string;
  activeShotId: string;
  media: VideoStudioMedia[];
  shots: VideoStudioShot[];
}
export type VideoStudioSummary = Pick<VideoStudioProject, 'id' | 'name' | 'revision' | 'updatedAt'> & { shotCount: number };
export const videoModeLabel = (mode: string): string => ({
  T2VA: 'Text to video', T2V: 'Text to video', I2VA: 'Image to video', I2V: 'Image to video',
  FL2VA: 'First & last frame', FLF2V: 'First & last frame', L2VA: 'Last frame to video',
  REF2VA: 'References to video', V2V: 'Video to video',
} as Record<string, string>)[mode] || mode;
export const validVideoProjectId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

// Reject malformed projects instead of silently dropping shots or references.
export function validateVideoProject(value: unknown): VideoStudioProject {
  const p = value as VideoStudioProject;
  if (!p || p.version !== 1 || !validVideoProjectId(p.id) || !text(p.name, 200) || !p.name.trim()
    || !Number.isSafeInteger(p.revision) || p.revision < 0 || !finite(p.updatedAt)
    || !text(p.overallPrompt, 50000) || !Array.isArray(p.shots) || !p.shots.length || p.shots.length > 1000
    || !Array.isArray(p.media) || p.media.length > 2000) throw new Error('Invalid Video Studio project.');
  const validateMedia = (m: OfficialVideoEditorDraft['references'][number]) => {
    if (!m || !validVideoProjectId(m.id) || !['image', 'video', 'audio'].includes(m.kind)
      || !text(m.filename, 1024) || !m.filename || /[\x00-\x1f:]|^[\\/]|(^|[\\/])\.\.?([\\/]|$)/.test(m.filename)
      || !text(m.prompt, 50000) || !finite(m.startSeconds) || m.startSeconds < 0
      || !finite(m.durationSeconds) || m.durationSeconds <= 0) throw new Error('Invalid project media.');
  };
  const ids = new Set<string>();
  for (const shot of p.shots) {
    if (!shot || !validVideoProjectId(shot.id) || ids.has(shot.id) || !text(shot.name, 200)
      || (shot.lastJobId !== undefined && (!text(shot.lastJobId, 200) || !/^[a-zA-Z0-9_-]+$/.test(shot.lastJobId)))
      || !Object.hasOwn(OFFICIAL_VIDEO_EDITOR_MODES, shot.workflowId)) throw new Error('Invalid project shot.');
    ids.add(shot.id);
    const d = shot.draft;
    if (!d || !text(d.prompt, 50000) || !text(d.seed, 40) || !text(d.mode, 40)
      || ![d.width, d.height, d.durationSeconds, d.frameRate].every(n => finite(n) && n > 0)
      || !d.values || typeof d.values !== 'object' || Array.isArray(d.values)
      || Object.values(d.values).some(v => !['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'number' && !finite(v)))
      || !Array.isArray(d.references) || d.references.length > 128) throw new Error('Invalid shot settings.');
    d.references.forEach(validateMedia);
  }
  if (!ids.has(p.activeShotId)) throw new Error('The selected shot is missing.');
  const mediaIds = new Set<string>();
  for (const m of p.media) {
    validateMedia(m);
    if (!text(m.name, 1024) || mediaIds.has(m.id)) throw new Error('Invalid project media identity.');
    mediaIds.add(m.id);
  }
  return structuredClone(p);
}

export function createVideoProject(name: string, workflowId: OfficialVideoWorkflowId, draft: OfficialVideoEditorDraft): VideoStudioProject {
  const id = crypto.randomUUID(), shotId = crypto.randomUUID();
  const initial = structuredClone(draft);
  initial.references = initial.references.map(m => ({ ...m, id: crypto.randomUUID() }));
  if (workflowId === 'h3-26') {
    const h3 = initial.h3 || readOfficialH3DirectorSettings({});
    initial.h3 = { ...h3, continuity: { ...h3.continuity, session: id, capture: true, sourceId: '', sourceVideoId: '', nextPrompt: '' } };
  }
  return { version: 1, id, name: name.trim() || 'Untitled video', revision: 0, updatedAt: Date.now(), overallPrompt: '',
    activeShotId: shotId, media: initial.references.map(m => ({ ...m, name: m.filename })),
    shots: [{ id: shotId, name: 'Shot 1', workflowId, draft: initial }] };
}

export function videoShotStarts(project: VideoStudioProject): number[] {
  let cursor = 0;
  return project.shots.map(shot => { const start = cursor; cursor += shot.draft.durationSeconds; return start; });
}

export function projectGenerationDraft(project: VideoStudioProject, shot: VideoStudioShot): OfficialVideoEditorDraft {
  const draft = structuredClone(shot.draft);
  const combine = (prompt: string) => [project.overallPrompt.trim(), prompt.trim()].filter(Boolean).join('\n\n');
  draft.prompt = combine(draft.prompt);
  if (draft.h3) draft.h3.continuity.nextPrompt = combine(draft.h3.continuity.nextPrompt || shot.draft.prompt);
  return draft;
}

export function resizeVideoShot(draft: OfficialVideoEditorDraft, seconds: number): OfficialVideoEditorDraft {
  if (!finite(seconds) || seconds <= 0) return draft;
  const durationSeconds = Math.max(1, Math.round(seconds * draft.frameRate)) / draft.frameRate;
  const references = draft.mode === 'FLF2V' ? draft.references.map((r, i) => ({
    ...r, startSeconds: i === 0 ? 0 : durationSeconds - 1 / draft.frameRate, durationSeconds: 1 / draft.frameRate,
  })) : draft.references;
  return { ...draft, durationSeconds, references };
}

// Mode switches keep unused source files in the project tray and preserve shot settings.
export function switchVideoProjectMode(project: VideoStudioProject, shotId: string, mode: string): VideoStudioProject {
  const shot = project.shots.find(s => s.id === shotId);
  if (!shot || !(OFFICIAL_VIDEO_EDITOR_MODES[shot.workflowId] as readonly string[]).includes(mode)) return project;
  const h3 = shot.workflowId === 'h3-26', frame = 1 / shot.draft.frameRate;
  const old = shot.draft.references;
  let references = old.filter(r => r.enabled !== false);
  if (['T2VA', 'T2V'].includes(mode)) references = [];
  else if (mode === 'V2V') references = references.filter(r => r.kind === 'video').slice(0, 1).map(r => ({ ...r, startSeconds: 0, durationSeconds: shot.draft.durationSeconds }));
  else if (mode !== 'REF2VA') {
    references = references.filter(r => r.kind === 'image');
    if (mode === 'L2VA' && shot.draft.mode === 'FL2VA') references = references.slice(-1);
    references = references.slice(0, ['FL2VA', 'FLF2V'].includes(mode) ? 2 : 1)
      .map((r, i) => ({ ...r, startSeconds: !h3 && i === 1 ? shot.draft.durationSeconds - frame : 0, durationSeconds: h3 ? 1 : frame }));
  }
  const draft = { ...shot.draft, mode, references };
  if (draft.h3) draft.h3 = { ...draft.h3, continuity: { ...draft.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' } };
  if (draft.ltx) draft.ltx = { ...draft.ltx, retake: { ...draft.ltx.retake, enabled: false } };
  const media = [...project.media];
  for (const ref of old) if (!media.some(m => m.filename === ref.filename)) media.push({ ...ref, id: crypto.randomUUID(), name: ref.filename });
  return { ...project, media, shots: project.shots.map(s => s.id === shotId ? { ...s, draft } : s) };
}

export function setVideoShotFrame(shot: VideoStudioShot, media: VideoStudioMedia, index: number): VideoStudioShot {
  if (media.kind !== 'image') throw new Error('Choose an image for this frame.');
  if (!['I2VA', 'L2VA', 'FL2VA', 'I2V', 'FLF2V'].includes(shot.draft.mode)) throw new Error('Select an image-based mode first.');
  const paired = ['FL2VA', 'FLF2V'].includes(shot.draft.mode);
  const references = shot.draft.references.filter(r => r.kind === 'image' && r.enabled !== false).slice(0, paired ? 2 : 1);
  if (index === 1 && !references[0]) throw new Error('Set the first frame before the last frame.');
  if (index < 0 || index > (paired ? 1 : 0)) throw new Error('Invalid frame slot.');
  const h3 = shot.workflowId === 'h3-26', frame = 1 / shot.draft.frameRate;
  references[index] = { ...media, id: crypto.randomUUID(), enabled: true, startSeconds: !h3 && index === 1 ? shot.draft.durationSeconds - frame : 0, durationSeconds: h3 ? 1 : frame };
  const draft = { ...shot.draft, references };
  if (draft.h3) draft.h3 = { ...draft.h3, continuity: { ...draft.h3.continuity, sourceId: '', sourceVideoId: '', nextPrompt: '' } };
  if (draft.ltx) draft.ltx = { ...draft.ltx, retake: { ...draft.ltx.retake, enabled: false } };
  return { ...shot, draft };
}

export function videoShotInputIssue(shot: VideoStudioShot): string {
  const d = shot.draft;
  if (hasOfficialH3Continuity(d.h3) || d.ltx?.retake.enabled) return '';
  const refs = d.references.filter(r => r.enabled !== false);
  if (['T2VA', 'T2V'].includes(d.mode)) return refs.length ? 'Text-to-video does not use references. Switch shot type to clear them into the tray.' : '';
  if (['FL2VA', 'FLF2V'].includes(d.mode)) return refs.length !== 2 || refs.some(r => r.kind !== 'image') ? 'Choose both the first and last frame before generating.' : '';
  if (['I2VA', 'L2VA', 'I2V'].includes(d.mode)) return !refs.length || refs.some(r => r.kind !== 'image') ? 'Choose an image before generating this shot.' : '';
  if (d.mode === 'V2V') return !refs.length || refs.some(r => r.kind !== 'video') ? 'Add a source video before generating this shot.' : '';
  if (d.mode === 'REF2VA' && !refs.some(r => r.kind === 'image' || (r.kind === 'video' && r.mediaMode !== 'audio')) && !d.h3?.refMods.some(r => r.enabled && r.name && r.strength > 0)) return 'Add a visual reference before generating this shot.';
  return '';
}
