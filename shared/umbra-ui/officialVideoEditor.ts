import { isOfficialVideoWorkflowId, type OfficialVideoWorkflowId } from './officialVideoWorkflow';
import { readComfyInputChoices } from './comfyInputChoices';

export interface OfficialVideoEditorDraft {
  prompt: string;
  mode: string;
  width: number;
  height: number;
  durationSeconds: number;
  frameRate: number;
  seed: string;
  values: Record<string, string | number | boolean>;
  references: Array<{
    id: string;
    kind: 'image' | 'video' | 'audio';
    filename: string;
    prompt: string;
    startSeconds: number;
    durationSeconds: number;
  }>;
}

export interface OfficialVideoEditorField {
  key: string;
  label: string;
  group: 'director' | 'generation';
  type: 'text' | 'number' | 'boolean' | 'select';
  value: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

// LTX has no mode widget: these are constraints on its normal, native timeline,
// not new graph routes. Retake, motion/IC-LoRA and audio lanes are not adapted.
export const OFFICIAL_VIDEO_EDITOR_MODES = {
  'h3-26': ['T2VA', 'I2VA', 'FL2VA', 'L2VA', 'REF2VA'],
  'ltx23-50': ['T2V', 'I2V', 'FLF2V', 'V2V'],
} as const;

type Ui = Record<string, any>;
type Scalar = string | number | boolean;
type Binding = { node: Ui; name: string };
type Setting = Binding & { key: string; label: string; group: 'director' | 'generation'; targets: Binding[]; inputType: string };
export type OfficialVideoEditorWorkflow = Ui & { nodes: Ui[]; links: unknown[] };
const MAX_SEED = BigInt('18446744073709551615');
const TOP_FIELDS: Record<string, string[]> = {
  MiniMaxH3Director: ['ref_image_size'],
  LTXDirector: ['epsilon', 'display_mode', 'resize_method', 'img_compression'],
  CLIPTextEncode: ['text'],
  DaSiWa_LTX2LoraLoader: ['use_cache'],
  ModelPreviewOverrideKJ: ['max_resolution', 'jpeg_quality', 'suppress_default_preview', 'preview_frames', 'preview_fps', 'tiny_vae'],
  DaSiWa_EnhancedVideoCombine: ['codec', 'container', 'bit_depth', 'quality', 'log_level', 'pingpong', 'save_metadata', 'pass_frames', 'crop_to_audio', 'audio_codec', 'audio_bitrate', 'save_first_frame', 'save_last_frame'],
};
const VAE_FIELDS: Record<string, string[]> = {
  VAELoader: ['vae_name'],
  VAELoaderKJ: ['vae_name', 'device', 'weight_dtype'],
};
const record = (value: unknown): value is Ui => !!value && typeof value === 'object' && !Array.isArray(value);
const scalar = (value: unknown): value is Scalar => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const fail = (message: string): never => { throw new Error(`Official video editor: ${message}`); };

function workflow(source: unknown, id: OfficialVideoWorkflowId): OfficialVideoEditorWorkflow {
  if (!isOfficialVideoWorkflowId(id)) fail('unknown pinned workflow.');
  const value = typeof source === 'string' ? JSON.parse(source.replace(/^\uFEFF/, '')) : source;
  if (!record(value) || !Array.isArray(value.nodes) || !Array.isArray(value.links)
    || !Array.isArray(value.definitions?.subgraphs)) fail('expected the pinned native UI JSON with subgraph definitions.');
  const directorId = id === 'h3-26' ? 2730 : 3678;
  const directorType = id === 'h3-26' ? 'MiniMaxH3Director' : 'LTXDirector';
  if (value.nodes.find((node: Ui) => node.id === directorId)?.type !== directorType) fail('the source does not match this pinned workflow.');
  return value as OfficialVideoEditorWorkflow;
}

function allNodes(graph: Ui): Ui[] {
  return [...graph.nodes, ...(graph.definitions?.subgraphs || []).flatMap(allNodes)];
}

function nodeById(graph: Ui, id: number, type?: string): Ui {
  const matches = allNodes(graph).filter(node => node.id === id);
  if (matches.length !== 1 || (type && matches[0].type !== type)) fail(`pinned node ${id} is missing or incompatible.`);
  return matches[0];
}

function widgetIndex(node: Ui, name: string): number {
  if (!record(node.widgets_values_named) || !Array.isArray(node.widgets_values)) fail(`node ${node.id} has no pinned named widget schema.`);
  // These pinned exports include the native widget order, including DOM widgets
  // and linked widgets. Input-slot order alone is NOT the serialization order.
  const names = Object.keys(node.widgets_values_named);
  const index = names.indexOf(name);
  if (index < 0 || names.length !== node.widgets_values.length) fail(`unknown native widget ${node.id}.${name}.`);
  return index;
}

function readWidget(node: Ui, name: string): Scalar {
  const index = widgetIndex(node, name);
  const value = node.type === 'LTXDirector' && node.properties?.has_serialized_properties
    && Object.hasOwn(node.properties, name) ? node.properties[name] : node.widgets_values_named[name];
  if (!scalar(value) || (typeof value === 'number' && !Number.isSafeInteger(value) && Number.isInteger(value))) fail(`unsafe native value ${node.id}.${name}.`);
  if (node.widgets_values[index] === undefined) fail(`missing native widget ${node.id}.${name}.`);
  return value;
}

function writeWidget(node: Ui, name: string, value: Scalar): void {
  node.widgets_values[widgetIndex(node, name)] = value;
  node.widgets_values_named[name] = value;
  if (Object.hasOwn(node.properties || {}, name) || ['LTXDirector', 'DaSiWa_SeedControl'].includes(node.type)) {
    node.properties = { ...node.properties, [name]: value };
  }
}

function jsonWidget(node: Ui, name: string): Ui {
  const raw = readWidget(node, name);
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { fail(`invalid native ${name}.`); }
  if (!record(value)) fail(`invalid native ${name}.`);
  return structuredClone(value);
}

function settings(graph: Ui): Setting[] {
  const definitions = new Map<string, Ui>((graph.definitions?.subgraphs || []).map((item: Ui) => [item.id, item]));
  const rootNodes = new Set<Ui>(graph.nodes);
  const result: Setting[] = [];
  for (const node of allNodes(graph)) {
    const isRoot = rootNodes.has(node);
    const definition = isRoot ? definitions.get(node.type) : undefined;
    // Only VAE resources have direct nested controls. Linked leaf widgets stay
    // owned by their promoted boundary, never by a second independent field.
    const names = VAE_FIELDS[node.type] || (isRoot ? TOP_FIELDS[node.type] || [] : []);
    for (const name of definition ? Object.keys(node.widgets_values_named || {}) : names) {
      const input = node.inputs?.find((port: Ui) => port.widget?.name === name);
      const type = input?.type || (node.type === 'LTXDirector' ? ({ epsilon: 'FLOAT', display_mode: 'COMBO', resize_method: 'COMBO', img_compression: 'INT' } as Ui)[name] : undefined);
      if (!type || (input && input.link != null) || !['STRING', 'INT', 'FLOAT', 'BOOLEAN', 'COMBO'].includes(type)) continue;
      // Canvas sizing owns these linked calculator controls. Exposing them as
      // independent settings would imply an effect that configure overrides.
      if (definition && ['resolution_preset', 'swap_aspect_when_not_image'].includes(name)) continue;
      let targets: Binding[] = [];
      const boundary = definition?.inputs?.find((port: Ui) => port.name === name);
      if (definition) {
        if (!boundary || !Array.isArray(boundary.linkIds) || !boundary.linkIds.length) fail(`promoted widget ${node.id}.${name} has no native destination.`);
        targets = boundary.linkIds.map((id: unknown) => {
          const link = definition.links.find((entry: Ui) => entry.id === id);
          const target = definition.nodes.find((entry: Ui) => entry.id === link?.target_id);
          const port = target?.inputs?.[link?.target_slot];
          if (!target || !port?.widget || port.widget.name !== port.name || port.link !== id) fail(`promoted widget ${node.id}.${name} has an unsupported destination.`);
          widgetIndex(target, port.name);
          return { node: target, name: port.name };
        });
      } else targets = [{ node, name }];
      const value = readWidget(node, name);
      if (!scalar(value)) continue;
      result.push({ node, name, targets, inputType: type, key: `${node.id}.${name}`,
        label: `${node.title || definition?.name || node.type}: ${input?.label || boundary?.label || name}`,
        group: ['MiniMaxH3Director', 'LTXDirector'].includes(node.type) ? 'director' : 'generation' });
    }
  }
  return result;
}

/** Fields require an installed object_info schema; absent/incompatible fields
 * are omitted, never guessed. Keys are exact pinned node/widget names; nested
 * controls are limited to unlinked native VAE resource inputs. */
export function getOfficialVideoEditorFields(source: unknown, id: OfficialVideoWorkflowId, objectInfo: unknown): OfficialVideoEditorField[] {
  const graph = workflow(source, id);
  if (!record(objectInfo)) return [];
  return settings(graph).flatMap(setting => {
    const descriptors = setting.targets.map(target => {
      const input = objectInfo[target.node.type]?.input;
      return input?.required?.[target.name] || input?.optional?.[target.name];
    });
    if (descriptors.some(entry => !Array.isArray(entry) || entry[1]?.hidden || entry[1]?.forceInput)) return [];
    const choices = descriptors.map(readComfyInputChoices);
    const first = descriptors[0];
    const type = choices.every(Boolean) ? 'select' : first[0] === 'STRING' ? 'text'
      : first[0] === 'BOOLEAN' ? 'boolean' : ['INT', 'FLOAT'].includes(first[0]) ? 'number' : null;
    if (!type || (type !== 'select' && descriptors.some(entry => entry[0] !== first[0]))
      || (type === 'select' && setting.inputType !== 'COMBO')
      || (type !== 'select' && first[0] !== setting.inputType)) return [];
    const field: OfficialVideoEditorField = { key: setting.key, label: setting.label, group: setting.group, type, value: readWidget(setting.node, setting.name) };
    if (type === 'select') {
      const options = choices[0]!.filter((value): value is string => typeof value === 'string' && choices.every(list => list!.includes(value)));
      if (!options.length) return [];
      field.options = options;
    }
    if (type === 'number') {
      const mins = descriptors.map(entry => entry[1]?.min).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const maxs = descriptors.map(entry => entry[1]?.max).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const steps = descriptors.map(entry => entry[1]?.step).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (mins.length) field.min = Math.max(...mins);
      if (maxs.length) field.max = Math.min(...maxs);
      if (steps.length && steps.every(value => value === steps[0])) field.step = steps[0];
      else if (first[0] === 'INT') field.step = 1;
    }
    return [field];
  });
}

const LTX_MP: Record<string, number> = {
  '144p': 0.0352, '240p': 0.0977, '360p': 0.22, '480p': 0.391, '540p': 0.494, '576p': 0.396, '720p': 0.879, '900p': 1.373, '1024p': 1, '1080p': 1.978, '1152p': 2.25, '1440p': 3.516, '2160p': 7.91, '2K': 3.906, '4K': 7.91,
  '0.26 MP - Preview': 0.26, '0.36 MP - Small': 0.36, '0.52 MP - SD': 0.52, '0.65 MP - Balanced': 0.65, '0.83 MP - HD': 0.83, '1.00 MP - 1024p': 1, '1.05 MP - HD+': 1.05, '1.20 MP - HD++': 1.2, '1.35 MP - 2K lite': 1.35, '1.55 MP - 2K': 1.55, '1.65 MP - 2K+': 1.65, '1.75 MP - QHD': 1.75, '2.10 MP - FHD': 2.1, '3.30 MP - QHD+': 3.3, '4.75 MP - 2K Pro': 4.75, '6.50 MP - Production': 6.5, '8.30 MP - UHD': 8.3,
};

function ltxDimensions(graph: Ui): [number, number] {
  const calculator = nodeById(graph, 3600, 'DaSiWa_ResolutionScaleCalculator');
  const loader = nodeById(graph, 3319, '1680c02f-86b1-4db6-8d55-35f78dce9a59');
  if (readWidget(calculator, 'scale_from_image')) fail('source-image-derived LTX dimensions cannot be read without media inspection.');
  const aspect = String(readWidget(calculator, 'aspect_preset_when_not_image'));
  let [w, h] = aspect === 'CUSTOM'
    ? [Number(readWidget(calculator, 'custom_aspect_width')), Number(readWidget(calculator, 'custom_aspect_height'))]
    : aspect.split(' - ')[0].split(':').map(Number);
  if (readWidget(loader, 'swap_aspect_when_not_image')) [w, h] = [h, w];
  if (readWidget(calculator, 'no_scale')) return [w, h];
  const pixels = LTX_MP[String(readWidget(loader, 'resolution_preset'))] * 1024 * 1024;
  const mode = readWidget(calculator, 'mode');
  const divisor = mode === 'WAN/LTX (Div32)' ? 32 : mode === 'LTX 2-Stage (Div64)' ? 64 : mode === 'CUSTOM' ? Number(readWidget(calculator, 'custom_divisor')) : 1;
  if (![w, h, pixels, divisor].every(value => Number.isFinite(value) && value > 0)) fail('unrecognized pinned LTX resolution settings.');
  return [Math.max(divisor, Math.round(Math.sqrt(pixels * w / h) / divisor) * divisor), Math.max(divisor, Math.round(Math.sqrt(pixels * h / w) / divisor) * divisor)];
}

/** Read a fresh draft from the original JSON, never mutate it. -1 requests a
 * fresh safe uint32 at configuration time; decimal strings select Fixed mode. */
export function createOfficialVideoEditorDraft(id: OfficialVideoWorkflowId, source: unknown): OfficialVideoEditorDraft {
  const graph = workflow(source, id);
  const director = nodeById(graph, id === 'h3-26' ? 2730 : 3678);
  const state = jsonWidget(director, 'timeline_data');
  const seed = jsonWidget(nodeById(graph, id === 'h3-26' ? 2739 : 3720, 'DaSiWa_SeedControl'), 'seed_control_state');
  const isH3 = id === 'h3-26';
  if (isH3 && !(OFFICIAL_VIDEO_EDITOR_MODES['h3-26'] as readonly string[]).includes(String(readWidget(director, 'mode')))) fail('Image Inpaint remains disabled; unsupported H3 mode.');
  if (state.continuity?.operation === 'continue' || state.refmods?.some((row: Ui) => row.enabled !== false && row.name)) fail('continuity and saved RefMods require the native editor.');
  if (state.retakeMode || state.motionSegments?.length || state.audioSegments?.length) fail('retake, motion and LTX audio lanes require the native editor.');
  const fps = Number(readWidget(director, 'frame_rate'));
  const references = isH3 ? (state.items || []).map((item: Ui) => {
    if (item.enabled === false || (item.type === 'video' && item.media_mode && item.media_mode !== 'video')) fail('disabled or embedded-audio references require the native editor.');
    return { id: item.id, kind: item.type, filename: item.value, prompt: item.prompt || '', startSeconds: item.type === 'image' ? 0 : item.trim_start || 0,
      durationSeconds: item.type === 'image' ? 1 : item.trim_end == null ? item.duration : item.trim_end - (item.trim_start || 0) };
  }) : (state.segments || []).map((item: Ui) => ({ id: item.id, kind: item.type, filename: item.imageFile, prompt: item.prompt || '', startSeconds: item.start / fps, durationSeconds: item.length / fps }));
  const [width, height] = isH3 ? [Number(readWidget(director, 'width')), Number(readWidget(director, 'height'))] : ltxDimensions(graph);
  return { prompt: isH3 ? String(readWidget(director, 'prompt')) : state.global_prompt || '',
    mode: isH3 ? String(readWidget(director, 'mode'))
      : references.some((item: Ui) => item.kind === 'video') ? 'V2V' : references.length ? references.some((item: Ui) => state.segments.find((seg: Ui) => seg.id === item.id)?.isEndFrame) ? 'FLF2V' : 'I2V' : 'T2V',
    width, height, durationSeconds: Number(readWidget(director, isH3 ? 'duration' : 'duration_seconds')), frameRate: fps,
    seed: seed.mode === 'fixed' ? checkedSeed(seed.last_seed) : '-1',
    values: Object.fromEntries(settings(graph).map(setting => [setting.key, readWidget(setting.node, setting.name)])), references };
}

function checkedSeed(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || BigInt(value) > MAX_SEED) return fail('seed must be -1 (Random) or an unsigned decimal uint64 string.');
  return BigInt(value).toString();
}

function finite(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(`${label} must be between ${min} and ${max}.`);
  return value;
}

function frames(seconds: number, fps: number, label: string): number {
  const value = seconds * fps;
  if (!Number.isSafeInteger(Math.round(value)) || Math.abs(value - Math.round(value)) > 1e-7) fail(`${label} must align to the ${fps} fps timeline grid.`);
  return Math.round(value);
}

function validateReferences(draft: OfficialVideoEditorDraft): void {
  if (!Array.isArray(draft.references)) fail('references must be an array.');
  const ids = new Set<string>();
  for (const ref of draft.references) {
    if (!record(ref) || typeof ref.id !== 'string' || !ref.id || ids.has(ref.id)) fail('reference IDs must be nonempty and unique.');
    ids.add(ref.id);
    if (!['image', 'video', 'audio'].includes(ref.kind)) fail('unsupported reference kind.');
    if (typeof ref.filename !== 'string' || !ref.filename || /[\x00-\x1f:]|^[\\/]|(^|[\\/])\.\.?([\\/]|$)/.test(ref.filename)) fail('references require staged relative ComfyUI input filenames, not paths or URLs.');
    if (typeof ref.prompt !== 'string') fail('reference prompts must be strings.');
    finite(ref.startSeconds, 0, 1000, 'reference startSeconds');
    finite(ref.durationSeconds, Number.EPSILON, 1000, 'reference durationSeconds');
  }
}

function configureH3(graph: Ui, draft: OfficialVideoEditorDraft): void {
  const refs = draft.references;
  const images = refs.filter(ref => ref.kind === 'image');
  if (draft.mode !== 'REF2VA' && refs.some(ref => ref.kind !== 'image')) fail(`${draft.mode} supports image references only.`);
  if (draft.mode === 'T2VA' && refs.length) fail('T2VA does not accept references.');
  if (['I2VA', 'L2VA'].includes(draft.mode) && images.length !== 1) fail(`${draft.mode} requires exactly one image.`);
  if (draft.mode === 'FL2VA' && images.length !== 2) fail('this FL2VA adapter requires first and last images; use T2VA for text-only generation.');
  if (images.some(ref => ref.startSeconds !== 0 || ref.durationSeconds !== 1)) fail('H3 images are ordered REF/endpoint tiles, not timed segments: use startSeconds=0 and durationSeconds=1.');
  if (draft.mode === 'REF2VA') {
    const videos = refs.filter(ref => ref.kind === 'video'), audios = refs.filter(ref => ref.kind === 'audio');
    if (images.length > 9 || videos.length > 3 || audios.length > 3 || refs.length > 12 || !refs.length) fail('REF2VA requires 1-12 files, at most 9 images, 3 videos and 3 audio clips.');
    if (audios.length && !images.length && !videos.length) fail('REF2VA audio requires a visual reference.');
    for (const lane of [videos, audios]) {
      if (lane.some(ref => ref.durationSeconds < 2 || ref.durationSeconds > 15) || lane.reduce((sum, ref) => sum + ref.durationSeconds, 0) > 15) fail('each H3 video/audio crop must be 2-15 seconds; each lane totals at most 15 seconds.');
    }
  }
  const counts = { image: 0, video: 0, audio: 0 };
  const items = refs.map((ref, order) => {
    const slot = draft.mode === 'L2VA' ? 1 : counts[ref.kind]++;
    return { id: ref.id, type: ref.kind, value: ref.filename, prompt: ref.prompt, enabled: true, order, slot, start: slot,
      duration: ref.durationSeconds, ...(ref.kind === 'image' ? {} : { trim_start: ref.startSeconds, trim_end: ref.startSeconds + ref.durationSeconds }),
      ...(ref.kind === 'video' ? { media_mode: 'video' } : {}) };
  });
  const notes = items.filter(item => item.prompt.trim()).map(item => ({ id: `attached-${item.id}`, text: `<${item.type === 'image' ? 'Picture' : item.type === 'video' ? 'Video' : 'Audio'} ${draft.mode === 'L2VA' ? 1 : item.slot + 1}>: ${item.prompt}`, enabled: true, start: item.start, duration: item.duration, order: item.order }));
  const resolved = [draft.prompt, ...notes.map(note => note.text)].filter(Boolean).join('\n\n');
  const director = nodeById(graph, 2730, 'MiniMaxH3Director');
  const state = jsonWidget(director, 'timeline_data');
  const builder = { ...jsonWidget(director, 'builder_state'), mode: draft.mode, duration: draft.durationSeconds,
    prompt_mode: 'simple', simple_prompt: resolved, imd: resolved, soundscape: '', music: '' };
  Object.assign(state, { items, prompt_blocks: notes, builder_state: builder, resolved_prompt: resolved, refmods: [],
    resolution: { ...state.resolution, aspect: 'custom', resolution: 'custom', custom_mode: 'fixed', custom_width: draft.width, custom_height: draft.height, input_scaling: 'Off' },
    continuity: { ...state.continuity, operation: 'new', capture: false } });
  for (const [name, value] of Object.entries({ mode: draft.mode, prompt: resolved, width: draft.width, height: draft.height,
    duration: draft.durationSeconds, frame_rate: draft.frameRate, timeline_data: JSON.stringify(state), builder_state: JSON.stringify(builder) })) writeWidget(director, name, value);
}

function configureLtx(graph: Ui, draft: OfficialVideoEditorDraft): void {
  if (draft.references.some(ref => ref.kind === 'audio')) fail('LTX audio references are not supported by this bounded adapter; use the native audio lane.');
  if (draft.mode === 'T2V' && draft.references.length) fail('T2V does not accept references.');
  if (draft.mode !== 'T2V' && !draft.references.length) fail(`${draft.mode} requires references.`);
  if (['I2V', 'FLF2V'].includes(draft.mode) && draft.references.some(ref => ref.kind !== 'image')) fail(`${draft.mode} requires image references.`);
  if (draft.mode === 'V2V' && draft.references.some(ref => ref.kind !== 'video')) fail('V2V requires video references (normal visual guide lane, not IC-LoRA/retake).');
  const duration = frames(draft.durationSeconds, draft.frameRate, 'durationSeconds');
  const segments = draft.references.map(ref => ({ id: ref.id, type: ref.kind, imageFile: ref.filename, fileName: ref.filename.split(/[\\/]/).pop(),
    prompt: ref.prompt, start: frames(ref.startSeconds, draft.frameRate, 'reference startSeconds'), length: frames(ref.durationSeconds, draft.frameRate, 'reference durationSeconds'),
    trimStart: 0, isEndFrame: false, guideStrength: 1 })).sort((a, b) => a.start - b.start);
  if (segments.some(seg => seg.length < 1 || seg.start + seg.length > duration)) fail('LTX segments must fit entirely inside the generation timeline.');
  if (segments.some((seg, i) => i > 0 && seg.start < segments[i - 1].start + segments[i - 1].length)) fail('overlapping LTX local-prompt segments are not supported.');
  if (segments.some(seg => seg.prompt.includes('|'))) fail('LTX local prompts cannot contain | (the native relay delimiter).');
  if (draft.mode === 'FLF2V') {
    if (segments.length !== 2 || segments[0].start !== 0 || segments[0].length !== 1 || segments[1].start !== duration - 1 || segments[1].length !== 1) fail('FLF2V requires one-frame images at the first and last target frames.');
    segments[1].isEndFrame = true;
  }
  // Match native commitChanges: leading gaps join the first prompt; later gaps
  // and the trailing tail join the previous prompt. Nothing invents a shot.
  const lengths: number[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const gap = segment.start - cursor;
    if (lengths.length) lengths[lengths.length - 1] += gap;
    lengths.push(segment.length + (lengths.length ? 0 : gap));
    cursor = segment.start + segment.length;
  }
  if (lengths.length) lengths[lengths.length - 1] += duration - cursor;
  const director = nodeById(graph, 3678, 'LTXDirector');
  const state = jsonWidget(director, 'timeline_data');
  Object.assign(state, { global_prompt: draft.prompt, retakeMode: false, retakeVideo: null, normalStartFrame: 0, normalDurationFrames: duration,
    segments, motionSegments: [], audioSegments: [], mainTrackEnabled: true, motionTrackEnabled: false, audioTrackEnabled: true, overrideAudio: false });
  const values = { start_second: 0, end_second: draft.durationSeconds, duration_seconds: draft.durationSeconds,
    start_frame: 0, end_frame: duration, duration_frames: duration, frame_rate: draft.frameRate,
    custom_width: draft.width, custom_height: draft.height, timeline_data: JSON.stringify(state),
    local_prompts: segments.map(seg => seg.prompt).join(' | '), segment_lengths: lengths.join(','), guide_strength: segments.map(() => '1.00').join(','),
    use_custom_audio: false, use_custom_motion: false, override_audio: false };
  for (const [name, value] of Object.entries(values)) writeWidget(director, name, value);
  Object.assign(director.properties, { global_prompt: draft.prompt, has_serialized_properties: true, retakeMode: false,
    mainTrackEnabled: true, motionTrackEnabled: false, audioTrackEnabled: true, overrideAudio: false, audioTrackWasEnabledBeforeOverride: false });
  const calculator = nodeById(graph, 3600, 'DaSiWa_ResolutionScaleCalculator');
  for (const [name, value] of Object.entries({ no_scale: true, scale_from_image: false, aspect_preset_when_not_image: 'CUSTOM', custom_aspect_width: draft.width, custom_aspect_height: draft.height })) writeWidget(calculator, name, value);
  const loader = nodeById(graph, 3319, '1680c02f-86b1-4db6-8d55-35f78dce9a59');
  writeWidget(loader, 'swap_aspect_when_not_image', false);
  writeWidget(calculator, 'swap_aspect_when_not_image', false);
}

/** Configure only existing widgets/properties on a structured clone. No API
 * graph is built here: SHA verification and native graphToPrompt remain in the
 * iframe bridge. Installed catalog choices/ranges still need runtime validation. */
export function configureOfficialVideoEditor(source: unknown, id: OfficialVideoWorkflowId, draft: OfficialVideoEditorDraft): OfficialVideoEditorWorkflow {
  const original = workflow(source, id);
  if (!record(draft) || typeof draft.prompt !== 'string' || !record(draft.values)) fail('invalid draft.');
  if (!(OFFICIAL_VIDEO_EDITOR_MODES[id] as readonly string[]).includes(draft.mode)) fail(`unsupported mode ${draft.mode}; Image Inpaint remains disabled.`);
  const grid = id === 'h3-26' ? 32 : 64;
  for (const [label, value] of [['width', draft.width], ['height', draft.height]] as const) {
    finite(value, grid, 8192, label);
    if (!Number.isInteger(value) || value % grid) fail(`${label} must be a multiple of ${grid} pixels for this pinned workflow.`);
  }
  finite(draft.durationSeconds, id === 'h3-26' ? 0.1 : 1 / draft.frameRate, 1000, 'durationSeconds');
  finite(draft.frameRate, id === 'h3-26' ? 0.1 : 1, 240, 'frameRate');
  if (id === 'ltx23-50' && !Number.isInteger(draft.frameRate)) fail('LTX frameRate must be an integer.');
  validateReferences(draft);
  const graph = structuredClone(original);
  const available = new Map(settings(graph).map(setting => [setting.key, setting]));
  for (const [key, value] of Object.entries(draft.values)) {
    const setting = available.get(key);
    if (!setting || !scalar(value) || typeof value !== typeof readWidget(setting.node, setting.name)
      || (setting.inputType === 'INT' && !Number.isSafeInteger(value))) return fail(`unknown or invalid setting ${key}.`);
    writeWidget(setting.node, setting.name, value);
    for (const target of setting.targets) writeWidget(target.node, target.name, value);
  }
  if (id === 'h3-26') configureH3(graph, draft);
  else configureLtx(graph, draft);
  const seedNode = nodeById(graph, id === 'h3-26' ? 2739 : 3720, 'DaSiWa_SeedControl');
  const state = jsonWidget(seedNode, 'seed_control_state');
  // The native INT widget can coerce uint64 strings to lossy numbers. For the
  // editor's random mode, sample a safe exact uint32 and prevent the upstream
  // queue hook from replacing it with an unsafe uint64 roll during capture.
  if (draft.seed === '-1' && !globalThis.crypto?.getRandomValues) return fail('cryptographic random seed generation is unavailable.');
  const seed = draft.seed === '-1'
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString()
    : checkedSeed(draft.seed);
  Object.assign(state, { mode: 'fixed', last_seed: seed,
    recent: [seed, ...(Array.isArray(state.recent) ? state.recent.filter((value: unknown) => typeof value === 'string' && /^\d+$/.test(value) && value !== seed) : [])].slice(0, 10) });
  writeWidget(seedNode, 'seed_value', seed);
  writeWidget(seedNode, 'seed_control_state', JSON.stringify(state));
  return graph;
}
