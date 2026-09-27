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

export interface MiniMaxH3DirectorRefMod {
  slot: number;
  name: string;
  enabled: boolean;
  strength: number;
  description: string;
}

export type MiniMaxH3DirectorScaling = 'Off' | 'Auto' | 'Target' | 'Fit' | 'Fill and crop' | 'Fit and pad' | 'Long side with divisible crop';
const DIRECTOR_SCALING: MiniMaxH3DirectorScaling[] = ['Off', 'Auto', 'Target', 'Fit', 'Fill and crop', 'Fit and pad', 'Long side with divisible crop'];

export interface MiniMaxH3DirectorPromptBuilder {
  structured: boolean;
  description: string;
  soundscape: string;
  music: string;
  subjects: string;
  summary: string;
  retention: string;
}

export interface MiniMaxH3DirectorContinuity {
  capture: boolean;
  session: string;
  sourceKind: 'checkpoint' | 'video';
  sourceId: string;
  sourceVideoId: string;
  overlapFrames: 5 | 22 | 39 | 56 | 73;
  idea: string;
  useReferences: boolean;
}

export const DEFAULT_MINIMAX_H3_CONTINUITY: MiniMaxH3DirectorContinuity = {
  capture: false, session: 'umbra_h3', sourceKind: 'checkpoint', sourceId: '', sourceVideoId: '',
  overlapFrames: 22, idea: '', useReferences: false,
};

export const DEFAULT_MINIMAX_H3_PROMPT_BUILDER: MiniMaxH3DirectorPromptBuilder = {
  structured: false, description: '', soundscape: '', music: '', subjects: '', summary: '', retention: '',
};

export interface MiniMaxH3DirectorControls {
  enabled: boolean;
  imageInpaint: boolean;
  items: MiniMaxH3DirectorItem[];
  inputScaling: MiniMaxH3DirectorScaling;
  endpointMode: 'first' | 'last' | 'first_last';
  refMods: MiniMaxH3DirectorRefMod[];
  promptBuilder: MiniMaxH3DirectorPromptBuilder;
  continuity: MiniMaxH3DirectorContinuity;
}

export const DEFAULT_MINIMAX_H3_DIRECTOR: MiniMaxH3DirectorControls = {
  enabled: false,
  imageInpaint: false,
  items: [],
  inputScaling: 'Auto',
  endpointMode: 'first',
  refMods: [],
  promptBuilder: { ...DEFAULT_MINIMAX_H3_PROMPT_BUILDER },
  continuity: { ...DEFAULT_MINIMAX_H3_CONTINUITY },
};

export function normalizeMiniMaxH3Director(raw: unknown): MiniMaxH3DirectorControls {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const items = Array.isArray(value.items) ? value.items : [];
  const rawBuilder = value.promptBuilder && typeof value.promptBuilder === 'object' ? value.promptBuilder as Record<string, unknown> : {};
  const rawContinuity = value.continuity && typeof value.continuity === 'object' ? value.continuity as Record<string, unknown> : {};
  return {
    enabled: value.enabled === true,
    imageInpaint: value.imageInpaint === true,
    inputScaling: DIRECTOR_SCALING.includes(value.inputScaling as MiniMaxH3DirectorScaling) ? value.inputScaling as MiniMaxH3DirectorScaling : 'Auto',
    endpointMode: value.endpointMode === 'last' || value.endpointMode === 'first_last' ? value.endpointMode : 'first',
    refMods: (Array.isArray(value.refMods) ? value.refMods : []).slice(0, 8).map((rawRef, index) => {
      const ref = rawRef && typeof rawRef === 'object' ? rawRef as Record<string, unknown> : {};
      const strength = Number(ref.strength);
      return {
        slot: Number.isInteger(Number(ref.slot)) ? Number(ref.slot) : index + 1,
        name: String(ref.name || '').trim(),
        enabled: ref.enabled !== false,
        strength: Number.isFinite(strength) ? strength : 1,
        description: String(ref.description || '').trim().slice(0, 1000),
      };
    }),
    promptBuilder: {
      structured: rawBuilder.structured === true,
      description: String(rawBuilder.description || '').slice(0, 50000),
      soundscape: String(rawBuilder.soundscape || '').slice(0, 50000),
      music: String(rawBuilder.music || '').slice(0, 50000),
      subjects: String(rawBuilder.subjects || '').slice(0, 50000),
      summary: String(rawBuilder.summary || '').slice(0, 50000),
      retention: String(rawBuilder.retention || '').slice(0, 50000),
    },
    continuity: {
      capture: rawContinuity.capture === true,
      session: String(rawContinuity.session || DEFAULT_MINIMAX_H3_CONTINUITY.session).trim().slice(0, 80),
      sourceKind: rawContinuity.sourceKind === 'video' ? 'video' : 'checkpoint',
      sourceId: String(rawContinuity.sourceId || '').trim().slice(0, 80),
      sourceVideoId: String(rawContinuity.sourceVideoId || '').trim().slice(0, 80),
      overlapFrames: ([5, 22, 39, 56, 73].includes(Number(rawContinuity.overlapFrames))
        ? Number(rawContinuity.overlapFrames) : 22) as MiniMaxH3DirectorContinuity['overlapFrames'],
      idea: String(rawContinuity.idea || '').slice(0, 12000),
      useReferences: rawContinuity.useReferences === true,
    },
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

export function miniMaxH3DirectorMode(mode: string, frameGuideMode: string, controls?: MiniMaxH3DirectorControls): 'T2VA' | 'I2VA' | 'L2VA' | 'FL2VA' | 'REF2VA' | 'Image Inpaint' {
  if (controls?.imageInpaint) return 'Image Inpaint';
  if (mode === 'reference_to_video') return 'REF2VA';
  if (mode === 'image_to_video') {
    if (controls?.endpointMode === 'last') return 'L2VA';
    if (controls?.endpointMode === 'first_last') return 'FL2VA';
    return frameGuideMode === 'first_last' ? 'FL2VA' : 'I2VA';
  }
  return 'T2VA';
}

export function selectedMiniMaxH3DirectorItems(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): MiniMaxH3DirectorItem[] {
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode, controls);
  const enabled = controls.items.filter((item) => item.enabled);
  if (directorMode === 'T2VA') return [];
  if (directorMode === 'I2VA' || directorMode === 'Image Inpaint') return enabled.filter((item) => item.kind === 'image').slice(0, 1);
  if (directorMode === 'L2VA') return enabled.filter((item) => item.kind === 'image').slice(0, 1);
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
  const continuity = controls.continuity || DEFAULT_MINIMAX_H3_CONTINUITY;
  const source = continuity.sourceKind === 'video' ? continuity.sourceVideoId : continuity.sourceId;
  if ((continuity.capture || source) && !/^[a-zA-Z0-9_-]{1,80}$/.test(continuity.session)) {
    return 'Continuity session must be 1-80 letters, numbers, underscores or hyphens.';
  }
  if (source && !/^[a-zA-Z0-9_-]{1,80}$/.test(source)) {
    return 'Select a valid H3 continuity checkpoint.';
  }
  if (!controls.imageInpaint && mode === 'image_to_video' && frameGuideMode === 'first_middle_last') {
    return 'H3 Director supports a first frame or first + last frames, not a middle frame. Switch the frame guide mode.';
  }
  const items = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode);
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode, controls);
  const usesItems = !source || (directorMode === 'REF2VA' && continuity.useReferences);
  if (usesItems && items.some((item) => !item.sourcePath && !item.sourceName)) return 'Choose a file for every enabled Director media slot.';
  if (directorMode === 'Image Inpaint') {
    if (controls.items.some((item) => item.enabled && item.kind !== 'image') || items.length !== 1) {
      return 'H3 Image Inpaint needs exactly one image and no video or audio references.';
    }
    if (continuity.capture || continuity.sourceId || continuity.sourceVideoId) {
      return 'H3 continuity is for video. Clear the continuity source and capture option for Image Inpaint.';
    }
  }
  if (usesItems && directorMode === 'I2VA' && (items.length !== 1 || items[0].kind !== 'image')) return 'Image-to-video Director mode needs one first-frame image.';
  if (usesItems && directorMode === 'L2VA' && (items.length !== 1 || items[0].kind !== 'image')) return 'Last-frame Director mode needs one closing image.';
  if (usesItems && directorMode === 'FL2VA' && (items.length !== 2 || items.some((item) => item.kind !== 'image'))) return 'First + Last Director mode needs two images.';
  if (usesItems && directorMode === 'REF2VA') {
    const images = items.filter((item) => item.kind === 'image').length;
    const videos = items.filter((item) => item.kind === 'video' && item.mediaMode !== 'audio').length;
    const audios = items.filter((item) => item.kind === 'audio' || (item.kind === 'video' && item.mediaMode !== 'video')).length;
    if (images + videos < 1 && !controls.refMods.some((ref) => ref.enabled && ref.name && ref.strength > 0)) return 'Reference Director mode needs at least one image, video, or RefMod.';
    if (images > 9 || videos > 3 || audios > 3) return 'Director supports up to 9 images, 3 videos and 3 audio clips.';
    if (items.some((item) => item.kind !== 'image' && item.trimEnd !== null && (item.trimEnd - item.trimStart < 2 || item.trimEnd - item.trimStart > 15))) {
      return 'Director video and audio trims must be between 2 and 15 seconds.';
    }
    const visualSeconds = items.filter((item) => item.kind === 'video' && item.mediaMode !== 'audio').reduce((sum, item) => sum + (item.trimEnd === null ? 0 : item.trimEnd - item.trimStart), 0);
    const audioSeconds = items.filter((item) => item.kind === 'audio' || (item.kind === 'video' && item.mediaMode !== 'video')).reduce((sum, item) => sum + (item.trimEnd === null ? 0 : item.trimEnd - item.trimStart), 0);
    if (visualSeconds > 15 || audioSeconds > 15) return 'Director reference video and audio lanes each have a 15-second total limit.';
  }
  if (usesItems && directorMode === 'REF2VA') {
    const slots = new Set<number>();
    for (const ref of controls.refMods) {
      if (ref.slot < 1 || ref.slot > 8 || slots.has(ref.slot)) return 'RefMod slots must be unique numbers from 1 to 8.';
      slots.add(ref.slot);
      if (ref.enabled && (!ref.name || ref.strength < 0 || ref.strength > 1)) return `RefMod ${ref.slot} needs a file and strength between 0 and 1.`;
    }
  }
  return '';
}

export function buildMiniMaxH3DirectorTimeline(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): string {
  const issue = miniMaxH3DirectorIssue(controls, mode, frameGuideMode);
  if (issue) throw new Error(issue);
  const slots = { image: 0, video: 0, audio: 0 };
  const continuity = controls.continuity || DEFAULT_MINIMAX_H3_CONTINUITY;
  const source = continuity.sourceKind === 'video' ? continuity.sourceVideoId : continuity.sourceId;
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode, controls);
  const usesItems = !source || (directorMode === 'REF2VA' && continuity.useReferences);
  const selected = !usesItems
    ? [] : selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode);
  const items = selected.map((item, order) => {
    if (!item.sourceName) throw new Error(`Director media ${order + 1} was not staged in ComfyUI.`);
    const lane = item.kind === 'video' && item.mediaMode === 'audio' ? 'audio' : item.kind;
    const slot = item.kind === 'image' && miniMaxH3DirectorMode(mode, frameGuideMode, controls) === 'L2VA' ? 1 : slots[lane]++;
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
  const promptBlocks = controls.promptBuilder.structured ? [] : selected
    .filter((item) => item.note.trim())
    .map((item, order) => ({ id: `attached-${item.id}`, text: item.note.trim(), enabled: true, start: 0, order }));
  return JSON.stringify({
    version: 1, items, prompt_blocks: promptBlocks,
    refmods: usesItems && directorMode === 'REF2VA' ? controls.refMods : [],
    resolution: { input_scaling: controls.inputScaling },
    ...((continuity.capture || source) ? { continuity: {
      version: 3, source_kind: continuity.sourceKind, source_id: continuity.sourceId,
      source_video_id: continuity.sourceVideoId,
      capture: continuity.capture, session: continuity.session,
      overlap_frames: continuity.overlapFrames, idea: continuity.idea,
      use_references: continuity.useReferences,
    } } : {}),
  });
}

export function buildMiniMaxH3DirectorBuilderState(controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string): string {
  const builder = controls.promptBuilder;
  if (!builder.structured) return '';
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode, controls);
  const mediaDirections = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode)
    .filter((item) => item.note.trim())
    .map((item, index) => `${item.kind} ${index + 1}: ${item.note.trim()}`).join('\n');
  const description = [builder.description.trim(), mediaDirections].filter(Boolean).join('\n\n');
  return JSON.stringify({
    version: 2,
    mode: directorMode,
    prompt_mode: 'structured',
    imd: description,
    soundscape: builder.soundscape,
    music: builder.music,
    ref: {
      subject_definitions: builder.subjects,
      summary: builder.summary,
      retention_analysis: builder.retention,
      detailed_description: description,
      soundscape: builder.soundscape,
      music: builder.music,
    },
  });
}

export type MiniMaxH3ReferencePackScope = 'files' | 'prompt' | 'all';
export type MiniMaxH3ReferencePackMode = 'append' | 'overwrite';

export function createMiniMaxH3ReferencePack(
  controls: MiniMaxH3DirectorControls, mode: string, frameGuideMode: string, prompt: string, scope: MiniMaxH3ReferencePackScope,
): Record<string, unknown> {
  if (scope !== 'prompt' && selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode).some((item) => !item.sourceName)) {
    throw new Error('Stage every selected reference in ComfyUI before saving a file pack.');
  }
  const pack: Record<string, unknown> = {
    dasiwa_minimax_h3_reference_pack: true,
    schema_version: 1,
    saved_at: new Date().toISOString(),
    model_mode: miniMaxH3DirectorMode(mode, frameGuideMode, controls),
  };
  if (scope !== 'prompt') {
    pack.items = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode).map((item, rank) => ({
      type: item.kind,
      value: item.sourceName,
      media_mode: item.mediaMode,
      trim_start: item.trimStart,
      ...(item.trimEnd === null ? {} : { trim_end: item.trimEnd }),
      prompt: item.note,
      _rank: rank,
    }));
    pack.refmods = controls.refMods;
  }
  if (scope !== 'files') {
    pack.prompt = { prompt_mode: 'simple', simple_prompt: controls.promptBuilder.structured
      ? controls.promptBuilder.description : prompt };
  }
  return pack;
}

export function parseMiniMaxH3ReferencePack(
  raw: unknown, controls: MiniMaxH3DirectorControls, scope: MiniMaxH3ReferencePackScope, loadMode: MiniMaxH3ReferencePackMode,
): { controls: MiniMaxH3DirectorControls; mode: 'text_to_video' | 'image_to_video' | 'reference_to_video'; frameGuideMode: 'first' | 'first_last'; prompt: string | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('That file is not a MiniMax H3 reference pack.');
  const pack = raw as Record<string, unknown>;
  if (pack.dasiwa_minimax_h3_reference_pack !== true || pack.schema_version !== 1) throw new Error('Unsupported MiniMax H3 reference pack.');
  const modelMode = pack.model_mode;
  if (!['T2VA', 'I2VA', 'L2VA', 'FL2VA', 'REF2VA', 'Image Inpaint'].includes(String(modelMode))) throw new Error('This reference pack uses an unsupported Director mode.');
  const mode = modelMode === 'REF2VA' ? 'reference_to_video' : modelMode === 'T2VA' ? 'text_to_video' : 'image_to_video';
  const frameGuideMode = modelMode === 'FL2VA' ? 'first_last' : 'first';
  const endpointMode = modelMode === 'L2VA' ? 'last' : modelMode === 'FL2VA' ? 'first_last' : 'first';
  const incoming = scope !== 'prompt' && Array.isArray(pack.items) ? pack.items : [];
  if (incoming.length > 12) throw new Error('Reference pack exceeds the 12-file Director limit.');
  const items: MiniMaxH3DirectorItem[] = incoming.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object') throw new Error(`Reference ${index + 1} is invalid.`);
    const item = rawItem as Record<string, unknown>;
    const kind = item.type;
    if (kind !== 'image' && kind !== 'video' && kind !== 'audio') throw new Error(`Reference ${index + 1} has an unsupported media type.`);
    const sourceName = String(item.value || '').trim();
    if (!sourceName || sourceName.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(sourceName) || sourceName === '.' || sourceName === '..') {
      throw new Error(`Reference ${index + 1} has an invalid staged filename. Upload that file in Director instead.`);
    }
    const trimStart = Number(item.trim_start || 0);
    const trimEnd = item.trim_end === undefined ? null : Number(item.trim_end);
    if (!Number.isFinite(trimStart) || trimStart < 0 || (trimEnd !== null && (!Number.isFinite(trimEnd) || trimEnd <= trimStart))) {
      throw new Error(`Reference ${index + 1} has an invalid trim range.`);
    }
    return {
      id: `director-pack-${index}-${sourceName}`,
      kind,
      sourcePath: '',
      sourceName,
      enabled: true,
      note: String(item.prompt || '').slice(0, 1000),
      trimStart,
      trimEnd,
      mediaMode: item.media_mode === 'audio' || item.media_mode === 'video_audio' ? item.media_mode : 'video',
      role: 'subject',
    };
  });
  const mergedItems = scope === 'prompt' ? controls.items : loadMode === 'overwrite' ? items : [...controls.items, ...items];
  const imageCount = mergedItems.filter((item) => item.enabled && item.kind === 'image').length;
  const videoCount = mergedItems.filter((item) => item.enabled && item.kind === 'video' && item.mediaMode !== 'audio').length;
  const audioCount = mergedItems.filter((item) => item.enabled && (item.kind === 'audio' || item.kind === 'video' && item.mediaMode !== 'video')).length;
  if (mergedItems.length > 12 || modelMode === 'REF2VA' && (imageCount > 9 || videoCount > 3 || audioCount > 3 || imageCount + videoCount + audioCount > 12)
    || modelMode === 'T2VA' && mergedItems.length > 0 || modelMode === 'I2VA' && imageCount > 1 || modelMode === 'L2VA' && imageCount > 1 || modelMode === 'FL2VA' && imageCount > 2
    || modelMode === 'Image Inpaint' && imageCount !== 1
    || modelMode !== 'REF2VA' && mergedItems.some((item) => item.kind !== 'image')) {
    throw new Error('References exceed the target Director mode capacity. Remove files or load with Overwrite.');
  }
  const rawRefMods = scope !== 'prompt' && Array.isArray(pack.refmods) ? pack.refmods : [];
  const refMods = scope === 'prompt' ? controls.refMods : loadMode === 'overwrite' ? rawRefMods : [...controls.refMods, ...rawRefMods];
  if (refMods.length > 8) throw new Error('Reference pack exceeds the eight-RefMod limit.');
  const slots = new Set<number>();
  const remappedRefMods = refMods.map((rawRef) => {
    if (!rawRef || typeof rawRef !== 'object') throw new Error('Reference pack contains an invalid RefMod.');
    const ref = rawRef as MiniMaxH3DirectorRefMod;
    const preferred = Number(ref.slot);
    const slot = Number.isInteger(preferred) && preferred >= 1 && preferred <= 8 && !slots.has(preferred)
      ? preferred : Array.from({ length: 8 }, (_, index) => index + 1).find((value) => !slots.has(value));
    if (!slot) throw new Error('Reference pack has no free RefMod slot.');
    slots.add(slot);
    return { ...ref, slot };
  });
  const normalized = normalizeMiniMaxH3Director({ ...controls, items: mergedItems, refMods: remappedRefMods, endpointMode, imageInpaint: modelMode === 'Image Inpaint' });
  const promptValue = scope !== 'files' && pack.prompt && typeof pack.prompt === 'object'
    ? String((pack.prompt as Record<string, unknown>).simple_prompt || '').slice(0, 50000) : null;
  return { controls: normalized, mode, frameGuideMode, prompt: promptValue };
}
