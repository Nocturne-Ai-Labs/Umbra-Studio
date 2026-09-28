import type { Anima38TextEncoderDevice } from '../shared/umbra-ui/animaTextEncoderDevice';

const RETAINED_PROMPT_NODE = 'UmbraAnima38BV2RetainedPrompt';

export function applyAnima38TextEncoderDevice(
  graph: Record<string, any>,
  device: Anima38TextEncoderDevice,
): void {
  if (device !== 'cpu') return;

  const native = Object.values(graph).find((node) => node?.class_type === 'CLIPLoader'
    && node?._meta?.title === 'Anima Native Qwen3 0.6B Encoder');
  const semantic = Object.values(graph).find((node) => node?.class_type === 'AnimaQwen35Loader');
  if (!native || !semantic) {
    throw new Error('The selected Anima pipeline does not support CPU text encoding. Update its workflow and try again.');
  }

  native.inputs.device = 'cpu';
  semantic.class_type = 'UmbraAnimaQwen35CpuLoader';
}

export function applyAnima38TextEncoderRetention(
  graph: Record<string, any>,
  enabled: boolean,
): void {
  if (!enabled) return;
  for (const node of Object.values(graph)) {
    if (node?.class_type === 'Anima38BV2Prompt') {
      node.class_type = RETAINED_PROMPT_NODE;
    }
  }
}

export function assertAnima38TextEncoderRetentionAvailable(
  graph: Record<string, any>,
  objectInfo: Record<string, unknown> | null,
): void {
  if (!Object.values(graph).some((node) => node?.class_type === RETAINED_PROMPT_NODE)) return;
  if (!objectInfo?.[RETAINED_PROMPT_NODE]) {
    throw new Error('Anima 3.8B text encoder retention needs updated Umbra custom nodes. Restart Umbra-managed ComfyUI, or update its custom nodes through Umbra Setup, then try again.');
  }
}
