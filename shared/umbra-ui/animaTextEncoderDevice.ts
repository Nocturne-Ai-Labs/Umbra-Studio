export const ANIMA38_TEXT_ENCODER_DEVICE_RESOURCE = 'anima38.textEncoderDevice';

export type Anima38TextEncoderDevice = 'default' | 'cpu';

export function normalizeAnima38TextEncoderDevice(value: unknown): Anima38TextEncoderDevice {
  return String(value || '').trim().toLowerCase() === 'cpu' ? 'cpu' : 'default';
}
