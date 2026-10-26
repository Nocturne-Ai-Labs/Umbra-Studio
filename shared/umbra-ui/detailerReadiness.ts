function enabled(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return !['false', '0', 'off', 'no', ''].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function stagesFor(inputs: Record<string, any>): Record<string, any>[] {
  if (!String(inputs.pipeline_json || '').trim()) {
    return ['person_detail', 'face_detail', 'eye_detail', 'hand_detail']
      .filter(key => enabled(inputs[key]))
      .map(() => ({ enabled: true, useSam: true, samModel: 'sam_vit_b_01ec64.pth' }));
  }
  let parsed: unknown;
  try { parsed = JSON.parse(inputs.pipeline_json); }
  catch { throw new Error('The detailer pipeline JSON is invalid. Review the detailer stages before generating.'); }
  const stages = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown> | null)?.stages;
  if (!Array.isArray(stages)) throw new Error('The detailer pipeline must contain an array of stages.');
  return stages.filter(stage => stage && typeof stage === 'object' && enabled(stage.enabled));
}

/** Wrapper nodes hide these dependencies from ComfyUI's normal graph validation. */
export function assertDetailerRuntimeAvailable(graph: Record<string, any>, objectInfo: Record<string, any> | null): void {
  const requireClass = (name: string) => {
    if (!objectInfo?.[name]) {
      throw new Error(`Detailers require ${name} from ComfyUI Impact Pack / Impact Subpack. Use Install / update custom nodes in Umbra Setup > Tools and restart ComfyUI, or turn off the affected detailer stages.`);
    }
  };
  const requireModel = (node: string, value: unknown, label: string) => {
    const descriptor = objectInfo?.[node]?.input?.required?.model_name;
    const choices = Array.isArray(descriptor?.[0]) ? descriptor[0] : descriptor?.[1]?.options;
    if (!Array.isArray(choices)) return;
    const normalized = String(value || '').replace(/\\/g, '/');
    if (!choices.some(choice => String(choice).replace(/\\/g, '/') === normalized)) {
      throw new Error(`Detailer ${label} model '${normalized}' is not installed. Choose an installed model in the detailer stage or install its support models in Umbra Setup before generating.`);
    }
  };
  for (const node of Object.values(graph)) {
    if (node?.class_type !== 'UmbraImageDetailer') continue;
    const inputs = node.inputs || {};
    const stages = stagesFor(inputs);
    if (!stages.length) continue;
    if (inputs.sampling_provider == null) requireClass('FaceDetailer');
    requireClass('UltralyticsDetectorProvider');
    for (const stage of stages) {
      // Legacy flag-only graphs use the node's own detector presets.
      if (stage.detectorModel) requireModel('UltralyticsDetectorProvider', stage.detectorModel, 'detector');
      if (enabled(stage.useSam)) {
        requireClass('SAMLoader');
        requireModel('SAMLoader', stage.samModel || 'sam_vit_b_01ec64.pth', 'SAM');
      }
    }
  }
}
