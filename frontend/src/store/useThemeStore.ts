import { create } from 'zustand';
import { debugMiddleware } from './debugMiddleware';

export type DNAStyle = 'glass' | 'liquid-glass' | 'liquid-metal' | 'bulma' | 'material' | 'neumorphic' | 'flat' | 'brutalist' | 'cards' | 'retro' | 'cyber' | 'organic' | 'terminal';
export type TypographyStyle = 'system' | 'serif' | 'retro' | 'mono' | 'display';
export type CursorStyle = 'default' | 'neon' | 'minimal' | 'galaxy' | 'flame' | 'bubble' | 'electric' | 'retro';
export type BootAnimation = 'none' | 'matrix' | 'hex' | 'image' | 'ascii' | 'glitch' | 'fade' | 'comfy';
export type BootRainContent = 'kanji' | 'prompts' | 'danbooru';
export type BootLogoStyle = 'banner' | 'ascii';
export type BootTextVariant = 'bloody' | 'poison' | 'whismy' | 'blocky-dots';

const normalizeDNA = (_value: unknown): DNAStyle => 'terminal';

const TYPOGRAPHY_STYLES: TypographyStyle[] = [
  'system',
  'serif',
  'retro',
  'mono',
  'display',
];

const normalizeTypography = (value: unknown): TypographyStyle => {
  if (typeof value !== 'string') return 'mono';
  const raw = value.toLowerCase();
  const legacyMap: Record<string, TypographyStyle> = {
    modern: 'system',
    classic: 'serif',
    audiowide: 'display',
    quantico: 'display',
    micro5: 'mono',
    retro: 'retro',
    system: 'system',
    serif: 'serif',
    mono: 'mono',
    display: 'display',
  };
  const mapped = legacyMap[raw];
  if (!mapped) return 'mono';
  return TYPOGRAPHY_STYLES.includes(mapped) ? mapped : 'mono';
};

const ACTIVE_BOOT_ANIMATIONS = new Set<BootAnimation>(['none', 'matrix', 'hex', 'image', 'fade', 'comfy']);
const normalizeBootAnimation = (value: unknown): BootAnimation => {
  if (typeof value !== 'string') return 'matrix';
  const raw = value as BootAnimation;
  if (raw === 'comfy') return 'matrix';
  if (raw === 'ascii' || raw === 'glitch') return 'matrix';
  if (!ACTIVE_BOOT_ANIMATIONS.has(raw)) return 'matrix';
  return raw;
};

const BOOT_TEXT_VARIANTS: BootTextVariant[] = ['bloody', 'poison', 'whismy', 'blocky-dots'];
const BOOT_RAIN_CONTENT_OPTIONS: BootRainContent[] = ['kanji', 'prompts', 'danbooru'];
const BOOT_LOGO_STYLES: BootLogoStyle[] = ['banner', 'ascii'];

const normalizeBootRainContent = (value: unknown): BootRainContent => {
  if (typeof value !== 'string') return 'kanji';
  const content = value as BootRainContent;
  return BOOT_RAIN_CONTENT_OPTIONS.includes(content) ? content : 'kanji';
};

const normalizeBootTextVariant = (value: unknown): BootTextVariant => {
  if (typeof value !== 'string') return 'bloody';
  const style = value as BootTextVariant;
  if (!BOOT_TEXT_VARIANTS.includes(style)) return 'bloody';
  return style;
};

const normalizeBootLogoStyle = (value: unknown): BootLogoStyle => {
  if (typeof value !== 'string') return 'banner';
  const style = value as BootLogoStyle;
  return BOOT_LOGO_STYLES.includes(style) ? style : 'banner';
};

interface TrailSettings {
  enabled: boolean;
  count: number; // 0-20
  length: number; // 10-100 (lifetime in ms * 10)
  spacing: number; // 5-50 (distance between particles)
  size: number; // 2-20
  opacity: number; // 0-100
  blur: number; // 0-20
}

interface RingSettings {
  enabled: boolean;
  size: number; // 20-100
  thickness: number; // 1-10
  opacity: number; // 0-100
  blur: number; // 0-20
  pulse: boolean; // Pulsing animation
  rotate: boolean; // Rotation animation
}

interface RippleSettings {
  enabled: boolean;
  maxSize: number; // 100-600
  duration: number; // 300-2000 (ms)
  count: number; // 1-5 (ripples per click)
  opacity: number; // 0-100
  thickness: number; // 1-10
  blur: number; // 0-30
}

interface DotSettings {
  enabled: boolean;
  size: number; // 4-40
  opacity: number; // 0-100
  blur: number; // 0-10
  glow: boolean; // Glow effect
}

interface CursorSettings {
  style: CursorStyle;
  dot: DotSettings;
  ring: RingSettings;
  trail: TrailSettings;
  ripple: RippleSettings;
  magneticStrength: number; // 0-100 (for magnetic elements)
  smoothing: number; // 0-100 (cursor lag/smoothing)
}

interface ThemeState {
  hasHydrated: boolean;
  dna: DNAStyle;
  typography: TypographyStyle;
  bootAnimation: BootAnimation;
  bootGraphEnabled: boolean;
  bootRainContent: BootRainContent;
  bootDepth: number; // 10-100 (effect intensity/density)
  bootImageBackgroundId: string;
  bootLogoStyle: BootLogoStyle;
  bootAsciiAnimated: boolean; // Typewriter effect on ASCII logo
  bootTextVariant: BootTextVariant;
  accentBlendRatio: number; // 0 to 100 (split position where primary changes to secondary)
  blurIntensity: number; // Frost intensity in px (0 to 60)
  transparency: number; // 0 to 100 (percentage)
  liquidRefraction: number; // 0 to 100
  liquidSpecular: number; // 0 to 100
  metalness: number; // 0 to 100
  metalFlow: number; // 0 to 100
  cursorEffects: boolean; // Enable/disable cursor effects
  cursorSettings: CursorSettings;
  focusBlur: boolean; // Cinematic focus blur effect
  focusBlurDelay: number; // Delay before clearing blur in ms

  // Hex Colors
  colors: {
    accent: string;
    accentSecondary: string;
    bg: string;
    panel: string;
    text: string;
    border: string;
  };

  // Actions
  setHasHydrated: (hydrated: boolean) => void;
  setDNA: (dna: DNAStyle) => void;
  setTypography: (typography: TypographyStyle) => void;
  setBootAnimation: (animation: BootAnimation) => void;
  setBootGraphEnabled: (enabled: boolean) => void;
  setBootRainContent: (content: BootRainContent) => void;
  setBootDepth: (depth: number) => void;
  setBootImageBackgroundId: (id: string) => void;
  setBootLogoStyle: (style: BootLogoStyle) => void;
  setBootAsciiAnimated: (animated: boolean) => void;
  setBootTextVariant: (variant: BootTextVariant) => void;
  setAccentBlendRatio: (ratio: number) => void;
  setBlur: (blur: number) => void;
  setTransparency: (transparency: number) => void;
  setLiquidRefraction: (value: number) => void;
  setLiquidSpecular: (value: number) => void;
  setMetalness: (value: number) => void;
  setMetalFlow: (value: number) => void;
  setCursorEffects: (enabled: boolean) => void;
  setFocusBlur: (enabled: boolean) => void;
  setFocusBlurDelay: (delay: number) => void;
  updateCursorSettings: (settings: Partial<CursorSettings>) => void;
  setCursorStyle: (style: CursorStyle) => void;
  setColor: (key: keyof ThemeState['colors'], hex: string) => void;
  resetTheme: () => void;
  applyPreset: (preset: 'minokai' | 'arctic' | 'amethyst' | 'sunset' | 'neon' | 'forest' | 'golden' | 'ocean' | 'sakura') => void;
}

const defaultColors = {
  accent: '#ff3860',
  accentSecondary: '#ff6b6b',
  bg: '#09090b',
  panel: '#141417',
  text: '#fafafa',
  border: 'rgba(255, 255, 255, 0.1)',
};

const defaultCursorSettings: CursorSettings = {
  style: 'default',
  dot: {
    enabled: true,
    size: 16,
    opacity: 100,
    blur: 0,
    glow: true,
  },
  ring: {
    enabled: true,
    size: 40,
    thickness: 2,
    opacity: 60,
    blur: 0,
    pulse: false,
    rotate: false,
  },
  trail: {
    enabled: true,
    count: 5,
    length: 50, // 500ms lifetime
    spacing: 20,
    size: 8,
    opacity: 60,
    blur: 4,
  },
  ripple: {
    enabled: true,
    maxSize: 200,
    duration: 800,
    count: 3,
    opacity: 40,
    thickness: 2,
    blur: 10,
  },
  magneticStrength: 50,
  smoothing: 25,
};

const createDefaultThemeValues = () => ({
  dna: 'terminal' as DNAStyle,
  typography: 'mono' as TypographyStyle,
  bootAnimation: 'matrix' as BootAnimation,
  bootGraphEnabled: false,
  bootRainContent: 'kanji' as BootRainContent,
  bootDepth: 50,
  bootImageBackgroundId: 'random',
  bootLogoStyle: 'banner' as BootLogoStyle,
  bootAsciiAnimated: true,
  bootTextVariant: 'bloody' as BootTextVariant,
  accentBlendRatio: 50,
  blurIntensity: 16,
  transparency: 92,
  liquidRefraction: 55,
  liquidSpecular: 65,
  metalness: 72,
  metalFlow: 50,
  cursorEffects: false,
  focusBlur: true,
  focusBlurDelay: 0,
  cursorSettings: { ...defaultCursorSettings },
  colors: { ...defaultColors },
});

export const useThemeStore = create<ThemeState>()(
  debugMiddleware(
    (set) => ({
      ...createDefaultThemeValues(),
      hasHydrated: false,

        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
        setDNA: () => set({ dna: 'terminal' }),
        setTypography: (typography) => set({ typography: normalizeTypography(typography) }),
        setBootAnimation: (bootAnimation) => set(() => {
          const normalized = normalizeBootAnimation(bootAnimation);
          return normalized === 'image'
            ? { bootAnimation: normalized, bootGraphEnabled: false }
            : { bootAnimation: normalized };
        }),
        setBootGraphEnabled: (bootGraphEnabled) => set({ bootGraphEnabled }),
        setBootRainContent: (bootRainContent) => set({ bootRainContent: normalizeBootRainContent(bootRainContent) }),
        setBootDepth: (bootDepth) => set({ bootDepth }),
        setBootImageBackgroundId: (bootImageBackgroundId) => set({ bootImageBackgroundId }),
        setBootLogoStyle: (bootLogoStyle) => set({ bootLogoStyle: normalizeBootLogoStyle(bootLogoStyle) }),
        setBootAsciiAnimated: (bootAsciiAnimated) => set({ bootAsciiAnimated }),
        setBootTextVariant: (bootTextVariant) => set({ bootTextVariant: normalizeBootTextVariant(bootTextVariant) }),
        setAccentBlendRatio: (ratio) => set({ accentBlendRatio: Math.max(0, Math.min(100, Math.round(ratio))) }),
        setBlur: (blur) => set({ blurIntensity: blur }),
        setTransparency: (transparency) => set({ transparency }),
        setLiquidRefraction: (value) => set({ liquidRefraction: value }),
        setLiquidSpecular: (value) => set({ liquidSpecular: value }),
        setMetalness: (value) => set({ metalness: value }),
        setMetalFlow: (value) => set({ metalFlow: value }),
        setCursorEffects: (enabled) => set({ cursorEffects: enabled }),
        setFocusBlur: (enabled) => set({ focusBlur: enabled }),
        setFocusBlurDelay: (delay) => set({ focusBlurDelay: delay }),
        updateCursorSettings: (newSettings) => set((state) => ({
          cursorSettings: { ...state.cursorSettings, ...newSettings }
        })),
        setCursorStyle: (style) => set((state) => {
          // Apply cursor style presets
          const presets: Record<CursorStyle, Partial<CursorSettings>> = {
            default: {
              dot: { ...state.cursorSettings.dot, size: 16, glow: true, blur: 0 },
              ring: { ...state.cursorSettings.ring, size: 40, thickness: 2, pulse: false, rotate: false },
              trail: { ...state.cursorSettings.trail, count: 5, size: 8, blur: 4 },
              ripple: { ...state.cursorSettings.ripple, count: 3, blur: 10 },
              smoothing: 20,
            },
            neon: {
              dot: { ...state.cursorSettings.dot, size: 8, glow: true, blur: 4 },
              ring: { ...state.cursorSettings.ring, size: 60, thickness: 1, pulse: true, rotate: true, blur: 10 },
              trail: { ...state.cursorSettings.trail, count: 12, size: 4, blur: 8, opacity: 90 },
              ripple: { ...state.cursorSettings.ripple, count: 5, blur: 20, maxSize: 400 },
              smoothing: 10,
            },
            minimal: {
              dot: { ...state.cursorSettings.dot, size: 6, glow: false, blur: 0, opacity: 100 },
              ring: { ...state.cursorSettings.ring, enabled: false },
              trail: { ...state.cursorSettings.trail, enabled: false },
              ripple: { ...state.cursorSettings.ripple, enabled: true, count: 1, maxSize: 100, opacity: 30 },
              smoothing: 0,
            },
            galaxy: {
              dot: { ...state.cursorSettings.dot, size: 20, glow: true, blur: 12, opacity: 80 },
              ring: { ...state.cursorSettings.ring, size: 80, thickness: 1, pulse: true, rotate: true, blur: 20, opacity: 30 },
              trail: { ...state.cursorSettings.trail, count: 20, size: 15, blur: 15, opacity: 50, spacing: 10 },
              ripple: { ...state.cursorSettings.ripple, count: 4, blur: 30, maxSize: 500 },
              smoothing: 40,
            },
            flame: {
              dot: { ...state.cursorSettings.dot, size: 12, glow: true, blur: 2 },
              ring: { ...state.cursorSettings.ring, enabled: true, size: 30, thickness: 3, pulse: true },
              trail: { ...state.cursorSettings.trail, count: 15, size: 20, blur: 5, opacity: 80, length: 20, spacing: 5 },
              ripple: { ...state.cursorSettings.ripple, count: 2, blur: 10 },
              smoothing: 15,
            },
            bubble: {
              dot: { ...state.cursorSettings.dot, size: 30, glow: false, blur: 5, opacity: 40 },
              ring: { ...state.cursorSettings.ring, size: 100, thickness: 10, opacity: 10, blur: 10 },
              trail: { ...state.cursorSettings.trail, count: 8, size: 25, blur: 15, opacity: 20 },
              ripple: { ...state.cursorSettings.ripple, count: 6, blur: 25, maxSize: 300, duration: 1500 },
              smoothing: 60,
            },
            electric: {
              dot: { ...state.cursorSettings.dot, size: 4, glow: true, blur: 0, opacity: 100 },
              ring: { ...state.cursorSettings.ring, size: 40, thickness: 1, pulse: false, rotate: true, blur: 5 },
              trail: { ...state.cursorSettings.trail, count: 10, size: 2, blur: 0, opacity: 100, spacing: 40 },
              ripple: { ...state.cursorSettings.ripple, count: 8, blur: 5, maxSize: 200, duration: 400 },
              smoothing: 5,
            },
            retro: {
              dot: { ...state.cursorSettings.dot, size: 12, glow: false, blur: 0, opacity: 100 },
              ring: { ...state.cursorSettings.ring, size: 32, thickness: 4, pulse: false, blur: 0, opacity: 100 },
              trail: { ...state.cursorSettings.trail, count: 4, size: 12, blur: 0, opacity: 100, spacing: 20 },
              ripple: { ...state.cursorSettings.ripple, enabled: false },
              smoothing: 0,
            },
          };

          return {
            cursorSettings: {
              ...state.cursorSettings,
              style,
              ...presets[style],
            },
          };
        }),
        setColor: (key, hex) => set((state) => ({
          colors: { ...state.colors, [key]: hex }
        })),

        resetTheme: () => set({ ...createDefaultThemeValues() }),

      applyPreset: (preset) => {
        const presets = {
            minokai: {
              colors: { ...defaultColors, accent: '#ff3860', accentSecondary: '#ff6b6b' },
              accentBlendRatio: 52,
              blurIntensity: 20,
              transparency: 92,
            },
            arctic: {
              colors: {
                accent: '#00f2ea',
                accentSecondary: '#0ea5e9',
                bg: '#050a0f',
                panel: 'rgba(255, 255, 255, 0.05)',
                text: '#e0f2f1',
                border: 'rgba(0, 242, 234, 0.2)'
              },
              accentBlendRatio: 46,
              blurIntensity: 25,
              transparency: 92,
            },
            amethyst: {
              colors: {
                accent: '#a855f7',
                accentSecondary: '#7c3aed',
                bg: '#0c0a1a',
                panel: 'rgba(168, 85, 247, 0.05)',
                text: '#f3e8ff',
                border: 'rgba(168, 85, 247, 0.2)'
              },
              accentBlendRatio: 50,
              blurIntensity: 30,
              transparency: 92,
            },
            sunset: {
              colors: {
                accent: '#ff6b35',
                accentSecondary: '#f7931e',
                bg: '#1a0f0a',
                panel: 'rgba(255, 107, 53, 0.05)',
                text: '#ffe4d6',
                border: 'rgba(255, 107, 53, 0.2)'
              },
              accentBlendRatio: 58,
              blurIntensity: 18,
              transparency: 92,
            },
            neon: {
              colors: {
                accent: '#ff2d95',
                accentSecondary: '#00ffff',
                bg: '#0a0a14',
                panel: 'rgba(255, 45, 149, 0.08)',
                text: '#ffe0f0',
                border: 'rgba(0, 255, 255, 0.3)'
              },
              accentBlendRatio: 35,
              blurIntensity: 28,
              transparency: 92,
            },
            forest: {
              colors: {
                accent: '#22c55e',
                accentSecondary: '#16a34a',
                bg: '#0a120a',
                panel: 'rgba(34, 197, 94, 0.05)',
                text: '#d1fae5',
                border: 'rgba(34, 197, 94, 0.2)'
              },
              accentBlendRatio: 62,
              blurIntensity: 16,
              transparency: 92,
            },
            golden: {
              colors: {
                accent: '#fbbf24',
                accentSecondary: '#f59e0b',
                bg: '#1a1410',
                panel: 'rgba(251, 191, 36, 0.05)',
                text: '#fef3c7',
                border: 'rgba(251, 191, 36, 0.25)'
              },
              accentBlendRatio: 54,
              blurIntensity: 22,
              transparency: 92,
            },
            ocean: {
              colors: {
                accent: '#0ea5e9',
                accentSecondary: '#0284c7',
                bg: '#020617',
                panel: 'rgba(14, 165, 233, 0.05)',
                text: '#e0f2fe',
                border: 'rgba(14, 165, 233, 0.2)'
              },
              accentBlendRatio: 42,
              blurIntensity: 24,
              transparency: 92,
            },
            sakura: {
              colors: {
                accent: '#f472b6',
                accentSecondary: '#ec4899',
                bg: '#1a0a14',
                panel: 'rgba(244, 114, 182, 0.05)',
                text: '#fce7f3',
                border: 'rgba(244, 114, 182, 0.2)'
              },
              accentBlendRatio: 50,
              blurIntensity: 20,
              transparency: 92,
            },
        } as const;
        const next = presets[preset];
        if (!next) return;
        set(() => ({
          colors: { ...next.colors },
          accentBlendRatio: next.accentBlendRatio,
          blurIntensity: next.blurIntensity,
          transparency: next.transparency,
        }));
      }
    }),
    'useThemeStore'
  )
);

const THEME_PERSIST_STORAGE_KEY = 'umbra-studio-theme';
const THEME_LIVE_STORAGE_KEY = 'umbra-studio-theme-live';
const THEME_PERSIST_VERSION = 15;

type ThemePersistedValues = ReturnType<typeof createDefaultThemeValues>;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sanitizeThemeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeThemeSettingsPayload(raw: unknown): ThemePersistedValues {
  const envelope = toRecord(raw);
  const payload = toRecord(envelope.state || envelope);
  const defaults = createDefaultThemeValues();
  const rawColors = toRecord(payload.colors);
  const rawCursorSettings = toRecord(payload.cursorSettings);

  return {
    ...defaults,
    dna: normalizeDNA(payload.dna),
    typography: normalizeTypography(payload.typography),
    bootAnimation: normalizeBootAnimation(payload.bootAnimation),
    bootGraphEnabled: normalizeBootAnimation(payload.bootAnimation) === 'image'
      ? false
      : payload.bootGraphEnabled === true || payload.bootAnimation === 'comfy',
    bootRainContent: normalizeBootRainContent(payload.bootRainContent),
    bootDepth: sanitizeThemeNumber(payload.bootDepth, defaults.bootDepth, 10, 100),
    bootImageBackgroundId: typeof payload.bootImageBackgroundId === 'string' ? payload.bootImageBackgroundId : defaults.bootImageBackgroundId,
    bootLogoStyle: normalizeBootLogoStyle(payload.bootLogoStyle),
    bootAsciiAnimated: payload.bootAsciiAnimated !== false,
    bootTextVariant: normalizeBootTextVariant(payload.bootTextVariant),
    accentBlendRatio: sanitizeThemeNumber(payload.accentBlendRatio, defaults.accentBlendRatio, 0, 100),
    blurIntensity: sanitizeThemeNumber(payload.blurIntensity, defaults.blurIntensity, 0, 60),
    transparency: sanitizeThemeNumber(payload.transparency, defaults.transparency, 0, 100),
    liquidRefraction: sanitizeThemeNumber(payload.liquidRefraction, defaults.liquidRefraction, 0, 100),
    liquidSpecular: sanitizeThemeNumber(payload.liquidSpecular, defaults.liquidSpecular, 0, 100),
    metalness: sanitizeThemeNumber(payload.metalness, defaults.metalness, 0, 100),
    metalFlow: sanitizeThemeNumber(payload.metalFlow, defaults.metalFlow, 0, 100),
    cursorEffects: payload.cursorEffects === true,
    focusBlur: payload.focusBlur !== false,
    focusBlurDelay: sanitizeThemeNumber(payload.focusBlurDelay, defaults.focusBlurDelay, 0, 10000),
    cursorSettings: {
      ...defaults.cursorSettings,
      ...rawCursorSettings,
    },
    colors: {
      ...defaults.colors,
      ...rawColors,
    },
  };
}

export function getThemeSettingsSnapshot(): Record<string, unknown> {
  const state = useThemeStore.getState();
  const snapshot: ThemePersistedValues = {
    dna: 'terminal',
    typography: state.typography,
    bootAnimation: state.bootAnimation,
    bootGraphEnabled: state.bootGraphEnabled,
    bootRainContent: state.bootRainContent,
    bootDepth: state.bootDepth,
    bootImageBackgroundId: state.bootImageBackgroundId,
    bootLogoStyle: state.bootLogoStyle,
    bootAsciiAnimated: state.bootAsciiAnimated,
    bootTextVariant: state.bootTextVariant,
    accentBlendRatio: state.accentBlendRatio,
    blurIntensity: state.blurIntensity,
    transparency: state.transparency,
    liquidRefraction: state.liquidRefraction,
    liquidSpecular: state.liquidSpecular,
    metalness: state.metalness,
    metalFlow: state.metalFlow,
    cursorEffects: state.cursorEffects,
    focusBlur: state.focusBlur,
    focusBlurDelay: state.focusBlurDelay,
    cursorSettings: state.cursorSettings,
    colors: state.colors,
  };

  return {
    state: snapshot,
    version: THEME_PERSIST_VERSION,
  };
}

export function applyThemeSettingsSnapshot(raw: unknown | null) {
  if (!raw) {
    useThemeStore.getState().resetTheme();
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(THEME_PERSIST_STORAGE_KEY);
      window.localStorage.removeItem(THEME_LIVE_STORAGE_KEY);
    } catch {
      // Browser storage is best-effort; the in-memory theme is already reset.
    }
    return;
  }

  const normalized = normalizeThemeSettingsPayload(raw);
  useThemeStore.setState(normalized);
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(THEME_PERSIST_STORAGE_KEY);
    window.localStorage.removeItem(THEME_LIVE_STORAGE_KEY);
  } catch {
    // Legacy browser storage cleanup is best-effort.
  }
}
