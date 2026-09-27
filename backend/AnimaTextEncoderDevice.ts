import type { Anima38TextEncoderDevice } from '../shared/umbra-ui/animaTextEncoderDevice';

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
