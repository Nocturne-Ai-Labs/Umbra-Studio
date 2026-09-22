export type MiniMaxH3TurboPreset = 'none' | 'fl2va-v4-8step' | 'ref2va-4step';

export interface MiniMaxH3TurboControls {
  turboPreset: MiniMaxH3TurboPreset;
  turboLora: string;
  turboStrength: number;
}

// Upstream starting points, not a claim of end-to-end Umbra qualification.
// Normalization must never apply these sampling values to restored jobs.
export const MINIMAX_H3_TURBO_PRESETS = {
  'fl2va-v4-8step': {
    label: 'FL2VA v4 — 8 steps (experimental)',
    mode: 'fl2va',
    lora: 'minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors',
    model: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    setupProfile: 'minimax-h3-turbo-fl2va',
    steps: 8, samplerName: 'euler', scheduler: 'beta', shiftVideo: 12, shiftAudio: 5,
  },
  'ref2va-4step': {
    label: 'Ref2VA — 4 steps (experimental)',
    mode: 'ref2va',
    lora: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',
    model: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    setupProfile: 'minimax-h3-turbo-reference',
    steps: 4, samplerName: 'res_multistep', scheduler: 'simple', shiftVideo: 10, shiftAudio: 5,
  },
} as const;

export function normalizeMiniMaxH3Turbo(raw: Record<string, unknown>): MiniMaxH3TurboControls {
  const turboPreset = Object.hasOwn(MINIMAX_H3_TURBO_PRESETS, String(raw.turboPreset))
    ? raw.turboPreset as Exclude<MiniMaxH3TurboPreset, 'none'> : 'none';
  const strength = Number(raw.turboStrength ?? 1);
  return {
    turboPreset,
    turboLora: typeof raw.turboLora === 'string' ? raw.turboLora.trim().replace(/\\/g, '/') : '',
    turboStrength: Number.isFinite(strength) ? Math.min(2, Math.max(0, strength)) : 1,
  };
}

export function miniMaxH3TurboIssue(
  controls: MiniMaxH3TurboControls & { model?: string },
  referenceMode: boolean,
): string {
  if (controls.turboPreset === 'none') return '';
  const preset = MINIMAX_H3_TURBO_PRESETS[controls.turboPreset];
  if (!preset) return 'Choose a known MiniMax H3 Turbo adapter or disable Turbo.';
  if ((preset.mode === 'ref2va') !== referenceMode) {
    return `This Turbo adapter requires ${preset.mode === 'ref2va' ? 'Reference to Video' : 'Text to Video or Image to Video'}. Choose the matching adapter or disable Turbo.`;
  }
  const basename = (value: string) => value.replace(/\\/g, '/').split('/').pop();
  if (basename(controls.model || '') !== preset.model) {
    return `This Turbo preset requires ${preset.model}. Other model variants have not been qualified.`;
  }
  if (!controls.turboLora || basename(controls.turboLora) !== preset.lora) {
    return `Select ${preset.lora} from the matching Umbra Setup Turbo pack.`;
  }
  if (!(controls.turboStrength > 0) || controls.turboStrength > 2) {
    return 'Turbo LoRA strength must be greater than 0 and no greater than 2, or disable Turbo.';
  }
  return '';
}

export function miniMaxH3TurboSamplingPreset(presetId: MiniMaxH3TurboPreset) {
  const preset = presetId === 'none' ? null : MINIMAX_H3_TURBO_PRESETS[presetId];
  return preset
    ? { steps: preset.steps, samplerName: preset.samplerName, scheduler: preset.scheduler, shiftVideo: preset.shiftVideo, shiftAudio: preset.shiftAudio, turboStrength: 1 }
    : { steps: 20, samplerName: 'res_multistep', scheduler: 'simple', shiftVideo: 10, shiftAudio: 5 };
}
