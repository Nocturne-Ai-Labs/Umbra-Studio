export type MiniMaxH3DirectorMediaKind = 'image' | 'video' | 'audio';
export type MiniMaxH3DirectorVideoStream = 'video' | 'audio' | 'video_audio';

export interface MiniMaxH3DirectorItem {
  id: string;
  kind: MiniMaxH3DirectorMediaKind;
  sourcePath: string;
  sourceName: string;
  enabled: boolean;
  note: string;
  trimStart: number;
  trimEnd: number | null;
  mediaMode: MiniMaxH3DirectorVideoStream;
  role: 'subject' | 'style' | 'keyframe';
}

export interface MiniMaxH3DirectorControls {
  enabled: boolean;
  items: MiniMaxH3DirectorItem[];
  inputScaling: 'Off' | 'Auto';
}

export const DEFAULT_MINIMAX_H3_DIRECTOR: MiniMaxH3DirectorControls = {
  enabled: false,
  items: [],
  inputScaling: 'Auto',
};

export function normalizeMiniMaxH3Director(raw: unknown): MiniMaxH3DirectorControls {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    enabled: value.enabled === true,
    inputScaling: value.inputScaling === 'Off' ? 'Off' : 'Auto',
    items: items.slice(0, 12).map((rawItem, index) => {
      const item = rawItem && typeof rawItem === 'object' ? rawItem as Record<string, unknown> : {};
      const kind = item.kind === 'video' || item.kind === 'audio' ? item.kind : 'image';
      const mediaMode = item.mediaMode === 'audio' || item.mediaMode === 'video_audio' ? item.mediaMode : 'video';
      const role = item.role === 'style' || item.role === 'keyframe' ? item.role : 'subject';
      const trimStart = Math.max(0, Number.isFinite(Number(item.trimStart)) ? Number(item.trimStart) : 0);
      const rawEnd = item.trimEnd === null || item.trimEnd === '' ? null : Number(item.trimEnd);
      return {
        id: String(item.id || `director-media-${index + 1}`).slice(0, 160),
        kind,
        sourcePath: String(item.sourcePath || '').trim(),
        sourceName: String(item.sourceName || '').trim(),
        enabled: item.enabled !== false,
        note: String(item.note || '').trim().slice(0, 1000),
        trimStart,
        trimEnd: rawEnd !== null && Number.isFinite(rawEnd) && rawEnd > trimStart ? rawEnd : null,
        mediaMode,
        role,
      };
    }),
  };
}

export function miniMaxH3DirectorMode(mode: string, frameGuideMode: string): 'T2VA' | 'I2VA' | 'FL2VA' | 'REF2VA' {
  if (mode === 'reference_to_video') return 'REF2VA';
  if (mode === 'image_to_video') return frameGuideMode === 'first_last' ? 'FL2VA' : 'I2VA';
  return 'T2VA';
}

export function selectedMiniMaxH3DirectorItems(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): MiniMaxH3DirectorItem[] {
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode);
  const enabled = controls.items.filter((item) => item.enabled);
  if (directorMode === 'T2VA') return [];
  if (directorMode === 'I2VA') return enabled.filter((item) => item.kind === 'image').slice(0, 1);
  if (directorMode === 'FL2VA') return enabled.filter((item) => item.kind === 'image').slice(0, 2);
  return enabled;
}

export function miniMaxH3DirectorModelIssue(model: string, directorMode: string): string {
  const name = model.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
  if (directorMode === 'REF2VA' && name.includes('fl2va') && !name.includes('hybrid')) {
    return 'Reference Director mode needs a REF2VA or hybrid H3 model. Select one under MiniMax H3 Model.';
  }
  if (directorMode !== 'REF2VA' && name.includes('ref2va') && !name.includes('hybrid')) {
    return 'This Director mode needs a FL2VA or hybrid H3 model. Select one under MiniMax H3 Model.';
  }
  return '';
}

export function miniMaxH3DirectorIssue(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): string {
  if (!controls.enabled) return '';
  if (mode === 'image_to_video' && frameGuideMode === 'first_middle_last') {
    return 'H3 Director supports a first frame or first + last frames, not a middle frame. Switch the frame guide mode.';
  }
  const items = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode);
  if (items.some((item) => !item.sourcePath && !item.sourceName)) return 'Choose a file for every enabled Director media slot.';
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode);
  if (directorMode === 'I2VA' && (items.length !== 1 || items[0].kind !== 'image')) return 'Image-to-video Director mode needs one first-frame image.';
  if (directorMode === 'FL2VA' && (items.length !== 2 || items.some((item) => item.kind !== 'image'))) return 'First + Last Director mode needs two images.';
  if (directorMode === 'REF2VA') {
    const images = items.filter((item) => item.kind === 'image').length;
    const videos = items.filter((item) => item.kind === 'video' && item.mediaMode !== 'audio').length;
    const audios = items.filter((item) => item.kind === 'audio' || (item.kind === 'video' && item.mediaMode !== 'video')).length;
    if (images + videos < 1) return 'Reference Director mode needs at least one image or video.';
    if (images > 9 || videos > 3 || audios > 3) return 'Director supports up to 9 images, 3 videos and 3 audio clips.';
    if (items.some((item) => item.kind !== 'image' && item.trimEnd !== null && (item.trimEnd - item.trimStart < 2 || item.trimEnd - item.trimStart > 15))) {
      return 'Director video and audio trims must be between 2 and 15 seconds.';
    }
  }
  return '';
}

export function buildMiniMaxH3DirectorTimeline(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): string {
  const issue = miniMaxH3DirectorIssue(controls, mode, frameGuideMode);
  if (issue) throw new Error(issue);
  const slots = { image: 0, video: 0, audio: 0 };
  const items = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode).map((item, order) => {
    if (!item.sourceName) throw new Error(`Director media ${order + 1} was not staged in ComfyUI.`);
    const lane = item.kind === 'video' && item.mediaMode === 'audio' ? 'audio' : item.kind;
    const slot = slots[lane]++;
    const audioSlot = item.kind === 'video' && item.mediaMode === 'video_audio' ? slots.audio++ : undefined;
    return {
      id: item.id,
      type: item.kind,
      value: item.sourceName,
      order,
      slot,
      ...(audioSlot === undefined ? {} : { audioSlot }),
      enabled: true,
      media_mode: item.mediaMode,
      trim_start: item.trimStart,
      ...(item.trimEnd === null ? {} : { trim_end: item.trimEnd }),
    };
  });
  return JSON.stringify({ version: 1, items, prompt_blocks: [], resolution: { input_scaling: controls.inputScaling } });
}
