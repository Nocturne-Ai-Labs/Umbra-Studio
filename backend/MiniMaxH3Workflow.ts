import { miniMaxH3TurboIssue, normalizeMiniMaxH3Turbo, type MiniMaxH3TurboControls } from '../shared/umbra-ui/minimaxH3Turbo';
import { miniMaxH3GuideIssue, normalizeMiniMaxH3Guides, type MiniMaxH3Guide } from '../shared/umbra-ui/minimaxH3Guides';

type PromptNode = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type PromptGraph = Record<string, unknown>;

export interface MiniMaxH3AccelerationControls extends Partial<MiniMaxH3TurboControls> {
  model?: string;
  guides?: MiniMaxH3Guide[];
  guideFrameCount?: number;
  sageAttention?: 'auto' | 'disabled';
  allowCompile?: boolean;
  easyCacheEnabled?: boolean;
  easyCacheReuseThreshold?: number;
  easyCacheStartPercent?: number;
  easyCacheEndPercent?: number;
  shiftVideo?: number;
  shiftAudio?: number;
}

// Apply this both to submission graphs and readiness checks. Optional nodes must
// be absent when disabled: ComfyUI validates even disconnected node classes.
export function applyMiniMaxH3Acceleration(
  graph: PromptGraph,
  controls: MiniMaxH3AccelerationControls = {},
): boolean {
  const roles = new Map(Object.entries(graph).map(([id, raw]) => {
    const node = raw as PromptNode;
    return [String(node?._meta?.umbra_role || ''), { id, node }] as const;
  }));
  const source = roles.get('minimax_h3_model');
  if (!source) return false;
  const shift = roles.get('minimax_h3_sigma_shift');
  const guider = roles.get('minimax_h3_guider');
  const scheduler = roles.get('minimax_h3_scheduler');
  if (!shift || !guider || !scheduler) {
    throw new Error('The MiniMax H3 pipeline is missing its sigma shift, guider, or scheduler. Restore the bundled workflow.');
  }
  let model: [string, number] = [source.id, 0];
  const optional = (role: string, classType: string, enabled: boolean, inputs: Record<string, unknown>) => {
    const existing = roles.get(role);
    if (!enabled) {
      if (existing) delete graph[existing.id];
      return;
    }
    let id = existing?.id || role;
    if (!existing) while (Object.hasOwn(graph, id)) id += '_';
    graph[id] = {
      class_type: classType,
      inputs: { model, ...inputs },
      _meta: { ...existing?.node._meta, umbra_role: role },
    };
    model = [id, 0];
  };
  const turbo = normalizeMiniMaxH3Turbo({ ...controls });
  const turboIssue = miniMaxH3TurboIssue(
    { ...turbo, model: controls.model ?? String(source.node.inputs.unet_name || '') },
    roles.get('minimax_h3_conditioning')?.node.class_type === 'MiniMaxH3ReferenceToVideo',
  );
  if (turboIssue) throw new Error(turboIssue);
  optional('minimax_h3_turbo_lora', 'LoraLoaderModelOnly', turbo.turboPreset !== 'none', {
    lora_name: turbo.turboLora, strength_model: turbo.turboStrength,
  });
  optional('minimax_h3_sage_attention', 'PathchSageAttentionKJ', controls.sageAttention === 'auto', {
    sage_attention: 'auto', allow_compile: controls.allowCompile === true,
  });
  shift.node.inputs.model = model;
  if (controls.shiftVideo !== undefined) shift.node.inputs.shift_video = controls.shiftVideo;
  if (controls.shiftAudio !== undefined) shift.node.inputs.shift_audio = controls.shiftAudio;
  model = [shift.id, 0];
  if (controls.easyCacheEnabled && (controls.easyCacheStartPercent ?? 0.15) >= (controls.easyCacheEndPercent ?? 0.95)) {
    throw new Error('MiniMax H3 EasyCache Start must be less than End. Adjust the cache interval or disable EasyCache.');
  }
  optional('minimax_h3_easycache', 'EasyCache', controls.easyCacheEnabled === true, {
    reuse_threshold: controls.easyCacheReuseThreshold ?? 0.2,
    start_percent: controls.easyCacheStartPercent ?? 0.15,
    end_percent: controls.easyCacheEndPercent ?? 0.95,
    verbose: false,
  });
  guider.node.inputs.model = model;
  scheduler.node.inputs.model = model;
  applyMiniMaxH3Guides(graph, controls);
  return true;
}

function applyMiniMaxH3Guides(graph: PromptGraph, controls: MiniMaxH3AccelerationControls): void {
  const entries = Object.entries(graph) as [string, PromptNode][];
  const role = (name: string) => entries.find(([, node]) => node._meta?.umbra_role === name);
  const conditioning = role('minimax_h3_conditioning');
  const guider = role('minimax_h3_guider');
  const guides = normalizeMiniMaxH3Guides(controls.guides);
  if (!conditioning || !guider) {
    if (guides.length) throw new Error('The MiniMax H3 pipeline is missing timed-guide conditioning. Restore the bundled workflow.');
    return;
  }
  const frames = controls.guideFrameCount ?? Number(conditioning[1].inputs.length);
  const issue = miniMaxH3GuideIssue(guides, frames, conditioning[1].class_type === 'MiniMaxH3ReferenceToVideo');
  if (issue) throw new Error(issue);
  for (const [id, node] of entries) if (node._meta?.umbra_h3_timed_guide === true) delete graph[id];
  let positive: [string, number] = [conditioning[0], 0];
  const add = (base: string, class_type: string, inputs: Record<string, unknown>) => {
    let id = base;
    while (Object.hasOwn(graph, id)) id += '_';
    graph[id] = { class_type, inputs, _meta: { umbra_h3_timed_guide: true } };
    return id;
  };
  for (const [index, guide] of guides.entries()) {
    if (!guide.sourceName) throw new Error(`Timed guide ${index + 1} must be staged in the managed ComfyUI input folder.`);
    const vae = role(guide.kind === 'audio' ? 'minimax_h3_audio_vae' : 'minimax_h3_video_vae');
    if (!vae) throw new Error(`The MiniMax H3 pipeline is missing the ${guide.kind} guide VAE.`);
    const source = add(`minimax_h3_guide_source_${index}`, guide.kind === 'audio' ? 'LoadAudio' : 'LoadImage', {
      [guide.kind]: guide.sourceName,
    });
    const anchor = add(`minimax_h3_guide_${index}`, 'MiniMaxH3AddGuide', {
      positive, latent: [conditioning[0], 1], frame_idx: guide.frameIndex,
      [guide.kind]: [source, 0], [guide.kind === 'audio' ? 'audio_vae' : 'vae']: [vae[0], 0],
    });
    positive = [anchor, 0];
  }
  guider[1].inputs.conditioning = positive;
}

export function assertMiniMaxH3TurboInstalled(
  controls: MiniMaxH3AccelerationControls,
  objectInfo: Record<string, unknown> | null,
): void {
  const turbo = normalizeMiniMaxH3Turbo({ ...controls });
  if (turbo.turboPreset === 'none') return;
  const node = objectInfo?.LoraLoaderModelOnly as { input?: { required?: { lora_name?: unknown } } } | undefined;
  const descriptor = node?.input?.required?.lora_name;
  const options = Array.isArray(descriptor) && Array.isArray(descriptor[0]) ? descriptor[0] : null;
  if (!options) throw new Error('MiniMax H3 Turbo LoRA availability could not be verified. Start or update the managed ComfyUI server and refresh its catalog.');
  if (!options.some((name) => typeof name === 'string' && name.replace(/\\/g, '/') === turbo.turboLora)) {
    throw new Error(`MiniMax H3 Turbo LoRA "${turbo.turboLora}" is not installed. Install the matching Turbo pack in Umbra Setup > Models, then select its exact relative path.`);
  }
}

export function assertMiniMaxH3GuidesInstalled(
  controls: MiniMaxH3AccelerationControls,
  objectInfo: Record<string, unknown> | null,
): void {
  for (const [index, guide] of normalizeMiniMaxH3Guides(controls.guides).entries()) {
    const node = objectInfo?.[guide.kind === 'audio' ? 'LoadAudio' : 'LoadImage'] as {
      input?: { required?: Record<string, unknown> };
    } | undefined;
    const descriptor = node?.input?.required?.[guide.kind];
    const options = Array.isArray(descriptor)
      ? Array.isArray(descriptor[0]) ? descriptor[0] : descriptor[1]?.options
      : null;
    if (!Array.isArray(options)) throw new Error(`Timed guide ${index + 1} availability could not be verified. Refresh the managed ComfyUI catalog.`);
    if (!options.some((name) => typeof name === 'string' && name.replace(/\\/g, '/') === guide.sourceName)) {
      throw new Error(`Timed guide ${index + 1} is missing from the managed ComfyUI input folder. Choose its source again to restage it.`);
    }
  }
}
