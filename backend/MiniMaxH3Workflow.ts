type PromptNode = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type PromptGraph = Record<string, unknown>;

export interface MiniMaxH3AccelerationControls {
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
