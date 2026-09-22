import { miniMaxH3TurboIssue, normalizeMiniMaxH3Turbo, type MiniMaxH3TurboControls } from '../shared/umbra-ui/minimaxH3Turbo';

type PromptNode = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type PromptGraph = Record<string, unknown>;

export interface MiniMaxH3AccelerationControls extends Partial<MiniMaxH3TurboControls> {
  model?: string;
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
  return true;
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
