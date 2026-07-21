import type { PowerPrompterCompletionSoundStyle } from '@/types/powerPrompter';
import { DEFAULT_POWER_PROMPTER_SETTINGS, POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME } from '@/lib/powerPrompter';

export const POWER_PROMPTER_SOUND_STYLE_GLASS_TICK: PowerPrompterCompletionSoundStyle = 'glass_tick';
export const POWER_PROMPTER_ALERT_MAX_LINEAR_GAIN = 10 ** (-15 / 20);
export const POWER_PROMPTER_SOUND_STYLE_OPTIONS: Array<{ id: PowerPrompterCompletionSoundStyle; label: string }> = [
  { id: 'glass_tick', label: 'Glass Tick' },
  { id: 'soft_chime', label: 'Soft Chime' },
  { id: 'muted_bell', label: 'Muted Bell' },
  { id: 'mellow_ping', label: 'Mellow Ping' },
  { id: 'warm_click', label: 'Warm Click' },
  { id: 'crystal_drop', label: 'Crystal Drop' },
  { id: 'airy_pluck', label: 'Airy Pluck' },
  { id: 'soft_mallet', label: 'Soft Mallet' },
  { id: 'bamboo_tap', label: 'Bamboo Tap' },
  { id: 'quiet_blip', label: 'Quiet Blip' },
  { id: 'silver_ping', label: 'Silver Ping' },
  { id: 'velvet_tone', label: 'Velvet Tone' },
  { id: 'tiny_marimba', label: 'Tiny Marimba' },
  { id: 'hollow_knock', label: 'Hollow Knock' },
  { id: 'amber_chime', label: 'Amber Chime' },
  { id: 'misty_note', label: 'Misty Note' },
  { id: 'calm_beep', label: 'Calm Beep' },
  { id: 'soft_triangle', label: 'Soft Triangle' },
  { id: 'dusk_ting', label: 'Dusk Ting' },
  { id: 'studio_tick', label: 'Studio Tick' },
];

type CompletionSoundTone = {
  frequency: number;
  delay: number;
  duration: number;
  gain: number;
};
type CompletionSoundProfile = {
  wave: OscillatorType;
  attack: number;
  peak: number;
  release: number;
  tones: CompletionSoundTone[];
};
export const POWER_PROMPTER_SOUND_PROFILES: Record<PowerPrompterCompletionSoundStyle, CompletionSoundProfile> = {
  glass_tick: {
    wave: 'triangle',
    attack: 0.015,
    peak: 0.85,
    release: 0.24,
    tones: [
      { frequency: 980, delay: 0, duration: 0.09, gain: 0.075 },
      { frequency: 1480, delay: 0.065, duration: 0.11, gain: 0.065 },
    ],
  },
  soft_chime: {
    wave: 'triangle',
    attack: 0.02,
    peak: 0.8,
    release: 0.33,
    tones: [
      { frequency: 880, delay: 0, duration: 0.12, gain: 0.06 },
      { frequency: 1320, delay: 0.07, duration: 0.16, gain: 0.055 },
    ],
  },
  muted_bell: {
    wave: 'triangle',
    attack: 0.018,
    peak: 0.78,
    release: 0.34,
    tones: [
      { frequency: 720, delay: 0, duration: 0.14, gain: 0.058 },
      { frequency: 1080, delay: 0.03, duration: 0.18, gain: 0.05 },
    ],
  },
  mellow_ping: {
    wave: 'triangle',
    attack: 0.012,
    peak: 0.74,
    release: 0.22,
    tones: [
      { frequency: 1060, delay: 0, duration: 0.08, gain: 0.068 },
      { frequency: 980, delay: 0.045, duration: 0.09, gain: 0.046 },
    ],
  },
  warm_click: {
    wave: 'triangle',
    attack: 0.008,
    peak: 0.68,
    release: 0.12,
    tones: [
      { frequency: 620, delay: 0, duration: 0.045, gain: 0.07 },
      { frequency: 510, delay: 0.02, duration: 0.06, gain: 0.035 },
    ],
  },
  crystal_drop: {
    wave: 'sine',
    attack: 0.012,
    peak: 0.78,
    release: 0.26,
    tones: [
      { frequency: 1340, delay: 0, duration: 0.1, gain: 0.06 },
      { frequency: 980, delay: 0.07, duration: 0.11, gain: 0.048 },
    ],
  },
  airy_pluck: {
    wave: 'sine',
    attack: 0.01,
    peak: 0.72,
    release: 0.2,
    tones: [
      { frequency: 740, delay: 0, duration: 0.055, gain: 0.072 },
      { frequency: 990, delay: 0.035, duration: 0.075, gain: 0.042 },
    ],
  },
  soft_mallet: {
    wave: 'triangle',
    attack: 0.013,
    peak: 0.75,
    release: 0.24,
    tones: [
      { frequency: 560, delay: 0, duration: 0.095, gain: 0.066 },
      { frequency: 840, delay: 0.04, duration: 0.11, gain: 0.045 },
    ],
  },
  bamboo_tap: {
    wave: 'square',
    attack: 0.007,
    peak: 0.64,
    release: 0.11,
    tones: [
      { frequency: 430, delay: 0, duration: 0.036, gain: 0.066 },
      { frequency: 640, delay: 0.02, duration: 0.048, gain: 0.03 },
    ],
  },
  quiet_blip: {
    wave: 'sine',
    attack: 0.006,
    peak: 0.6,
    release: 0.1,
    tones: [
      { frequency: 990, delay: 0, duration: 0.03, gain: 0.06 },
      { frequency: 910, delay: 0.018, duration: 0.04, gain: 0.028 },
    ],
  },
  silver_ping: {
    wave: 'sine',
    attack: 0.011,
    peak: 0.8,
    release: 0.2,
    tones: [
      { frequency: 1520, delay: 0, duration: 0.08, gain: 0.058 },
      { frequency: 1920, delay: 0.04, duration: 0.085, gain: 0.04 },
    ],
  },
  velvet_tone: {
    wave: 'triangle',
    attack: 0.018,
    peak: 0.74,
    release: 0.32,
    tones: [
      { frequency: 680, delay: 0, duration: 0.14, gain: 0.055 },
      { frequency: 920, delay: 0.065, duration: 0.17, gain: 0.046 },
    ],
  },
  tiny_marimba: {
    wave: 'triangle',
    attack: 0.008,
    peak: 0.7,
    release: 0.18,
    tones: [
      { frequency: 860, delay: 0, duration: 0.05, gain: 0.07 },
      { frequency: 1280, delay: 0.028, duration: 0.06, gain: 0.038 },
    ],
  },
  hollow_knock: {
    wave: 'square',
    attack: 0.006,
    peak: 0.62,
    release: 0.15,
    tones: [
      { frequency: 320, delay: 0, duration: 0.04, gain: 0.068 },
      { frequency: 460, delay: 0.02, duration: 0.055, gain: 0.033 },
    ],
  },
  amber_chime: {
    wave: 'sine',
    attack: 0.016,
    peak: 0.79,
    release: 0.29,
    tones: [
      { frequency: 780, delay: 0, duration: 0.11, gain: 0.06 },
      { frequency: 1170, delay: 0.058, duration: 0.14, gain: 0.047 },
    ],
  },
  misty_note: {
    wave: 'sine',
    attack: 0.014,
    peak: 0.73,
    release: 0.27,
    tones: [
      { frequency: 930, delay: 0, duration: 0.095, gain: 0.057 },
      { frequency: 1230, delay: 0.05, duration: 0.12, gain: 0.04 },
    ],
  },
  calm_beep: {
    wave: 'triangle',
    attack: 0.01,
    peak: 0.65,
    release: 0.15,
    tones: [
      { frequency: 700, delay: 0, duration: 0.055, gain: 0.066 },
      { frequency: 700, delay: 0.05, duration: 0.05, gain: 0.038 },
    ],
  },
  soft_triangle: {
    wave: 'triangle',
    attack: 0.011,
    peak: 0.72,
    release: 0.21,
    tones: [
      { frequency: 990, delay: 0, duration: 0.07, gain: 0.062 },
      { frequency: 1180, delay: 0.042, duration: 0.08, gain: 0.042 },
    ],
  },
  dusk_ting: {
    wave: 'sine',
    attack: 0.013,
    peak: 0.71,
    release: 0.23,
    tones: [
      { frequency: 640, delay: 0, duration: 0.075, gain: 0.06 },
      { frequency: 960, delay: 0.05, duration: 0.1, gain: 0.041 },
    ],
  },
  studio_tick: {
    wave: 'square',
    attack: 0.006,
    peak: 0.63,
    release: 0.09,
    tones: [
      { frequency: 1220, delay: 0, duration: 0.028, gain: 0.058 },
      { frequency: 980, delay: 0.016, duration: 0.035, gain: 0.028 },
    ],
  },
};

export function getCompletionAudioContext(existing: AudioContext | null): AudioContext | null {
  if (existing) return existing;
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    return new AudioContextCtor();
  } catch {
    return null;
  }
}

export function clampCompletionSoundVolume(rawVolume: unknown): number {
  const numeric = Number(rawVolume);
  if (!Number.isFinite(numeric)) return DEFAULT_POWER_PROMPTER_SETTINGS.generationCompleteSoundVolume;
  return Math.max(0, Math.min(POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME, numeric));
}

export function clampAlertLinearGain(rawGain: unknown): number {
  const numeric = Number(rawGain);
  if (!Number.isFinite(numeric)) return 0.0001;
  return Math.max(0.0001, Math.min(POWER_PROMPTER_ALERT_MAX_LINEAR_GAIN, numeric));
}
