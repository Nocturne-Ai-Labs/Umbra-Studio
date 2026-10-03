type NativeState = Record<string, unknown>;

export interface OfficialLtxDirectorMedia {
  filename: string;
  durationFrames: number;
  fileSize?: number;
}

export interface OfficialLtxDirectorSegment extends OfficialLtxDirectorMedia {
  id: string;
  startFrame: number;
  lengthFrames: number;
  trimStartFrame: number;
}

export interface OfficialLtxDirectorMotionSegment extends OfficialLtxDirectorSegment {
  strength: number;
  attentionStrength: number;
  resampleMode: 'nearest' | 'linear';
}

export interface OfficialLtxDirectorSettings {
  retake: {
    enabled: boolean;
    video: OfficialLtxDirectorMedia | null;
    startFrame: number;
    lengthFrames: number;
    windowStartFrame: number;
    windowLengthFrames: number;
    prompt: string;
    globalPrompt: string;
    strength: number;
  };
  motion: { enabled: boolean; segments: OfficialLtxDirectorMotionSegment[] };
  audio: {
    enabled: boolean;
    inpaint: boolean;
    overrideMotion: boolean;
    enabledBeforeOverride: boolean;
    segments: OfficialLtxDirectorSegment[];
  };
}

type NativeResult = {
  state: NativeState;
  widgets: Record<string, string | number | boolean>;
  properties: Record<string, string | number | boolean>;
};

const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav']);
const fail = (message: string): never => { throw new Error(`LTX Director: ${message}`); };
const object = (value: unknown): value is NativeState => value !== null && typeof value === 'object' && !Array.isArray(value);
const value = (raw: unknown, fallback: number): number => typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
const flag = (raw: unknown, fallback: boolean): boolean => typeof raw === 'boolean' ? raw : fallback;
const label = (raw: unknown, fallback = ''): string => typeof raw === 'string' ? raw : fallback;
const list = (raw: unknown): NativeState[] => Array.isArray(raw) ? raw.filter(object) : [];

function nativeState(input: unknown): NativeState {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { fail('invalid timeline_data JSON.'); }
  }
  if (!object(parsed)) fail('timeline_data must be an object.');
  return parsed as NativeState;
}

function media(raw: NativeState | null, key: string, durationKey: string): OfficialLtxDirectorMedia | null {
  if (!raw) return null;
  const filename = label(raw[key]);
  if (!filename) return null;
  return { filename, durationFrames: value(raw[durationKey], 0),
    ...(typeof raw.fileSize === 'number' ? { fileSize: raw.fileSize } : {}) };
}

function segment(raw: NativeState, kind: 'motion' | 'audio'): OfficialLtxDirectorSegment {
  const source = media(raw, kind === 'motion' ? 'videoFile' : 'audioFile', kind === 'motion' ? 'videoDurationFrames' : 'audioDurationFrames');
  return { id: label(raw.id), filename: source?.filename || '', durationFrames: source?.durationFrames || 0,
    ...(source?.fileSize !== undefined ? { fileSize: source.fileSize } : {}),
    startFrame: value(raw.start, 0), lengthFrames: value(raw.length, 1), trimStartFrame: value(raw.trimStart, 0) };
}

/** Read only fields supported by this sidecar. Unrelated native timeline data is retained by configure. */
export function readOfficialLtxDirectorSettings(state: unknown): OfficialLtxDirectorSettings {
  const native = nativeState(state);
  const retakeVideo = object(native.retakeVideo) ? native.retakeVideo : null;
  const normalDuration = value(native.normalDurationFrames, 120);
  return {
    retake: {
      enabled: flag(native.retakeMode, false),
      video: media(retakeVideo, 'imageFile', 'videoDurationFrames'),
      startFrame: value(native.retakeStart, 24), lengthFrames: value(native.retakeLength, 48),
      windowStartFrame: value(native.retakeWindowStartFrame, value(native.start_frame, 0)),
      windowLengthFrames: value(native.retakeWindowLengthFrames,
        value(native.duration_frames, retakeVideo ? value(retakeVideo.videoDurationFrames, normalDuration) : normalDuration)),
      prompt: label(native.retakePrompt), globalPrompt: label(native.retake_global_prompt),
      strength: value(native.retakeStrength, 1),
    },
    motion: { enabled: flag(native.motionTrackEnabled, false), segments: list(native.motionSegments).map(raw => ({
      ...segment(raw, 'motion'), strength: value(raw.videoStrength, 1),
      attentionStrength: value(raw.videoAttentionStrength, 0.65),
      resampleMode: raw.resampleMode === 'linear' ? 'linear' : 'nearest',
    })) },
    audio: {
      enabled: flag(native.audioTrackEnabled, true), inpaint: flag(native.inpaint_audio, true),
      overrideMotion: flag(native.overrideAudio, false),
      enabledBeforeOverride: flag(native.audioTrackWasEnabledBeforeOverride, false),
      segments: list(native.audioSegments).map(raw => segment(raw, 'audio')),
    },
  };
}

function integer(raw: unknown, min: number, max: number, name: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail(`${name} must be an integer from ${min} to ${max}.`);
  return raw as number;
}

function strength(raw: unknown, name: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) fail(`${name} must be between 0 and 1.`);
  return raw as number;
}

function path(raw: unknown, kind: 'video' | 'audio', name: string): string {
  if (typeof raw !== 'string' || !raw || raw.length > 512 || raw.startsWith('/') || raw.includes('\\')
    || raw.split('/').some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part))) fail(`${name} must be a staged Comfy input path.`);
  const extension = (raw as string).split('.').pop()?.toLowerCase() || '';
  if (!(kind === 'video' ? VIDEO_EXTENSIONS : new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS])).has(extension)) fail(`${name} must be a ${kind} file.`);
  return raw as string;
}

function checkedMedia(item: OfficialLtxDirectorMedia, kind: 'video' | 'audio', name: string): OfficialLtxDirectorMedia {
  if (!object(item)) fail(`${name} is required.`);
  const filename = path(item.filename, kind, name);
  const durationFrames = integer(item.durationFrames, 1, 10000, `${name} duration`);
  const isVideo = VIDEO_EXTENSIONS.has(filename.split('.').pop()?.toLowerCase() || '');
  const fileSize = item.fileSize === undefined ? undefined : integer(item.fileSize, 1, isVideo ? 4 * 1024 ** 3 : 512 * 1024 ** 2, `${name} size`);
  return { filename, durationFrames, ...(fileSize !== undefined ? { fileSize } : {}) };
}

function checkedSegments<T extends OfficialLtxDirectorSegment>(items: T[], kind: 'motion' | 'audio', timelineFrames: number): T[] {
  if (!Array.isArray(items) || items.length > 100) fail(`${kind} lane exceeds 100 clips.`);
  const ids = new Set<string>();
  const checked = items.map((item, index) => {
    if (!object(item) || typeof item.id !== 'string' || !item.id || item.id.length > 160 || ids.has(item.id)) fail(`${kind} clip ${index + 1} needs a unique ID.`);
    ids.add(item.id);
    const clip = checkedMedia(item, kind === 'motion' ? 'video' : 'audio', `${kind} clip ${index + 1}`);
    const startFrame = integer(item.startFrame, 0, timelineFrames - 1, `${kind} start`);
    const lengthFrames = integer(item.lengthFrames, 1, timelineFrames - startFrame, `${kind} length`);
    const trimStartFrame = integer(item.trimStartFrame, 0, clip.durationFrames - 1, `${kind} trim`);
    if (trimStartFrame + lengthFrames > clip.durationFrames) fail(`${kind} clip ${index + 1} extends past its source.`);
    if (kind === 'motion') {
      const motion = item as unknown as OfficialLtxDirectorMotionSegment;
      strength(motion.strength, 'motion strength'); strength(motion.attentionStrength, 'motion attention strength');
      if (!['nearest', 'linear'].includes(motion.resampleMode)) fail('unsupported motion resample mode.');
    }
    return { ...item, ...clip, startFrame, lengthFrames, trimStartFrame };
  });
  return checked.sort((a, b) => a.startFrame - b.startFrame);
}

/** Return native timeline state and literal LTXDirector widget/property values; does not edit graph topology. */
export function configureOfficialLtxDirectorSettings(
  state: unknown, settings: OfficialLtxDirectorSettings, timing: { durationFrames: number; frameRate: number },
): NativeResult {
  const original = nativeState(state);
  if (!object(settings) || !object(settings.retake) || !object(settings.motion) || !object(settings.audio)) fail('invalid settings.');
  const durationFrames = integer(timing.durationFrames, 1, 10000, 'timeline duration');
  const frameRate = integer(timing.frameRate, 1, 240, 'frame rate');
  const { retake, motion, audio } = settings;
  for (const [name, enabled] of [['retake', retake.enabled], ['motion', motion.enabled], ['audio', audio.enabled],
    ['audio inpaint', audio.inpaint], ['audio override', audio.overrideMotion], ['audio previous enable', audio.enabledBeforeOverride]] as const) {
    if (typeof enabled !== 'boolean') fail(`${name} flag must be boolean.`);
  }
  if (typeof retake.prompt !== 'string' || retake.prompt.includes('|') || typeof retake.globalPrompt !== 'string') fail('invalid retake prompt.');
  strength(retake.strength, 'retake strength');
  const video = retake.video === null ? null : checkedMedia(retake.video, 'video', 'retake video');
  if (retake.enabled && !video) fail('retake mode needs a staged base video.');
  const totalFrames = video ? video.durationFrames : durationFrames;
  const retakeStart = retake.enabled ? integer(retake.startFrame, 0, totalFrames - 1, 'retake start') : retake.startFrame;
  const retakeLength = retake.enabled ? integer(retake.lengthFrames, 1, totalFrames - retakeStart, 'retake length') : retake.lengthFrames;
  const windowStart = retake.enabled ? integer(retake.windowStartFrame, 0, totalFrames - 1, 'generation window start') : retake.windowStartFrame;
  const windowLength = retake.enabled ? integer(retake.windowLengthFrames, 1, totalFrames - windowStart, 'generation window length') : retake.windowLengthFrames;
  if (retake.enabled && windowStart > retakeStart) fail('the native retake guide miscalculates the preservation mask when Generate from frame is after Retake start. Set Generate from frame at or before Retake start.');
  if (!retake.enabled && audio.overrideMotion && (!motion.enabled || !motion.segments.length)) fail('motion audio override needs an enabled motion clip.');
  if (!retake.enabled && audio.overrideMotion && audio.enabled) fail('audio track must be disabled while motion audio override is active.');
  const laneFrames = retake.enabled ? 10000 : durationFrames;
  const motionSegments = checkedSegments(motion.segments, 'motion', laneFrames);
  const audioSegments = checkedSegments(audio.segments, 'audio', laneFrames);
  const previousMotion = list(original.motionSegments);
  const previousAudio = list(original.audioSegments);
  const keep = (previous: NativeState[], id: string) => previous.find(item => item.id === id) || {};
  const nativeMotion = motionSegments.map(item => ({ ...keep(previousMotion, item.id), id: item.id, type: 'motion_video',
    videoFile: item.filename, fileName: item.filename.split('/').pop(), fileSize: item.fileSize,
    videoDurationFrames: item.durationFrames, start: item.startFrame, length: item.lengthFrames,
    trimStart: item.trimStartFrame, videoStrength: item.strength, videoAttentionStrength: item.attentionStrength,
    resampleMode: item.resampleMode }));
  const nativeAudio = audioSegments.map(item => ({ ...keep(previousAudio, item.id), id: item.id, type: 'audio',
    audioFile: item.filename, fileName: item.filename.split('/').pop(), fileSize: item.fileSize,
    audioDurationFrames: item.durationFrames, start: item.startFrame, length: item.lengthFrames, trimStart: item.trimStartFrame }));
  const nativeVideo = video ? { ...(object(original.retakeVideo) ? original.retakeVideo : {}),
    imageFile: video.filename, fileName: video.filename.split('/').pop(), videoDurationFrames: video.durationFrames,
    ...(video.fileSize !== undefined ? { fileSize: video.fileSize } : {}) } : null;
  const next: NativeState = { ...structuredClone(original), retakeMode: retake.enabled, retakeVideo: nativeVideo,
    retakeStart, retakeLength, retakeWindowStartFrame: windowStart, retakeWindowLengthFrames: windowLength,
    retakePrompt: retake.prompt, retake_global_prompt: retake.globalPrompt,
    retakeStrength: retake.strength, motionSegments: nativeMotion, audioSegments: nativeAudio,
    motionTrackEnabled: motion.enabled, audioTrackEnabled: audio.enabled, overrideAudio: audio.overrideMotion,
    audioTrackWasEnabledBeforeOverride: audio.enabledBeforeOverride, inpaint_audio: audio.inpaint };
  const widgets: NativeResult['widgets'] = { timeline_data: '', use_custom_motion: motion.enabled,
    use_custom_audio: audio.enabled && !audio.overrideMotion, inpaint_audio: audio.inpaint,
    override_audio: audio.overrideMotion };
  if (retake.enabled) {
    const end = windowStart + windowLength;
    const parts = [
      { length: Math.max(0, Math.min(end, retakeStart) - windowStart), prompt: retake.globalPrompt || 'video', strength: '0.00' },
      { length: Math.max(0, Math.min(end, retakeStart + retakeLength) - Math.max(windowStart, retakeStart)),
        prompt: retake.prompt || 'video', strength: retake.strength.toFixed(2) },
      { length: Math.max(0, end - Math.max(windowStart, retakeStart + retakeLength)),
        prompt: retake.globalPrompt || 'video', strength: '0.00' },
    ].filter(part => part.length > 0);
    Object.assign(widgets, { start_frame: windowStart, end_frame: end, duration_frames: windowLength,
      start_second: Number((windowStart / frameRate).toFixed(3)), end_second: Number((end / frameRate).toFixed(3)),
      duration_seconds: Number((windowLength / frameRate).toFixed(3)),
      local_prompts: parts.map(part => part.prompt).join(' | '),
      segment_lengths: parts.map(part => part.length).join(','),
      guide_strength: parts.map(part => part.strength).join(',') });
  }
  widgets.timeline_data = JSON.stringify(next);
  const properties: NativeResult['properties'] = { ...widgets, has_serialized_properties: true,
    retakeMode: retake.enabled, motionTrackEnabled: motion.enabled, audioTrackEnabled: audio.enabled,
    overrideAudio: audio.overrideMotion, audioTrackWasEnabledBeforeOverride: audio.enabledBeforeOverride };
  return { state: next, widgets, properties };
}
