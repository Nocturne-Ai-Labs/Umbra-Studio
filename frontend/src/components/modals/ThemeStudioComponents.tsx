'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useThemeStore, TypographyStyle, BootTextVariant, BootAnimation, BootRainContent, BootLogoStyle } from '@/store/useThemeStore';
import { BOOT_IMAGE_BACKGROUND_RANDOM_ID, BOOT_IMAGE_BACKGROUNDS } from '@/lib/bootBackgrounds';
import { Palette } from 'lucide-react';

// Helper Components
const SettingGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <label className="block text-sm font-bold text-zinc-300">{label}</label>
    {children}
  </div>
);

const SettingHint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-zinc-500 mt-1">{children}</p>
);

const sliderStyle = (value: number, min: number, max: number) => {
  const ratio = ((value - min) / Math.max(1, max - min)) * 100;
  const clamped = Math.max(0, Math.min(100, ratio));
  return { ['--value' as any]: `${clamped}%` } as React.CSSProperties;
};

const BOOT_TEXT_VARIANT_OPTIONS: { key: BootTextVariant; label: string; description: string }[] = [
  { key: 'bloody', label: 'Bloody', description: 'Sharp, heavy, signature mark.' },
  { key: 'poison', label: 'Poison', description: 'Jagged toxic lettering.' },
  { key: 'whismy', label: 'Whismy', description: 'Playful, softer ASCII silhouette.' },
  { key: 'blocky-dots', label: 'Blocky Dots', description: 'Chunky dotted terminal look.' },
];

const BOOT_LOGO_STYLE_OPTIONS: { key: BootLogoStyle; label: string; description: string }[] = [
  { key: 'banner', label: 'SVG Logo', description: 'Theme-colored Umbra Studio vector mark.' },
  { key: 'ascii', label: 'ASCII Text', description: 'Terminal text mark using the selected ASCII style.' },
];

const BOOT_ANIMATION_OPTIONS: { key: BootAnimation; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'matrix', label: 'Matrix' },
  { key: 'hex', label: 'Hex' },
  { key: 'image', label: 'Image' },
  { key: 'fade', label: 'Fade' },
];

const BOOT_RAIN_CONTENT_OPTIONS: { key: BootRainContent; label: string; description: string }[] = [
  { key: 'kanji', label: 'Kanji', description: 'Classic symbol rain.' },
  { key: 'prompts', label: 'Prompts', description: 'Prompt fragment rain.' },
  { key: 'danbooru', label: 'Danbooru', description: 'Tag-style rain.' },
];

// Theme Studio Settings Component
export const ThemeStudioSettings = () => {
  const theme = useThemeStore();
  const colorPickerRef = React.useRef<HTMLInputElement>(null);
  const secondaryColorPickerRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">Theme Studio</h3>

      {/* Studio Style Lab */}
      <div className="p-4 bg-black/20 border border-white/10 rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-[var(--umbra-accent)] font-black">
          <Palette size={14} />
          <span>Studio Style Lab</span>
        </div>

        {/* Typography Selector */}
        <SettingGroup label="Typography">
          <div className="grid grid-cols-5 gap-2">
            {([
              { key: 'system', label: 'System' },
              { key: 'serif', label: 'Serif' },
              { key: 'retro', label: 'Retro' },
              { key: 'mono', label: 'Mono' },
              { key: 'display', label: 'Display' },
            ] as { key: TypographyStyle; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => theme.setTypography(key)}
                className={cn(
                  "text-xs uppercase py-2 rounded border transition-all font-bold",
                  theme.typography === key
                    ? "border-[var(--umbra-accent)] text-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10"
                    : "border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <SettingHint>Choose typography style across the entire app</SettingHint>

        </SettingGroup>

        {/* Hex Accent Editor */}
        <SettingGroup label="Hex Accent Gradient">
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-2">
            <div className="flex items-center gap-2">
              <input
                ref={colorPickerRef}
                type="color"
                value={theme.colors.accent}
                onChange={(e) => theme.setColor('accent', e.target.value)}
                className="hidden"
              />
              <div
                onClick={() => colorPickerRef.current?.click()}
                className="w-8 h-8 rounded-md shadow-inner border border-white/20 cursor-pointer hover:scale-110 transition-transform active:scale-95"
                style={{ backgroundColor: theme.colors.accent }}
                title="Pick primary accent color"
              />
              <input
                type="text"
                value={theme.colors.accent}
                onChange={(e) => theme.setColor('accent', e.target.value)}
                className="bg-transparent text-sm w-full font-mono outline-none text-zinc-200 uppercase tracking-wider"
                placeholder="#ff3860"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={secondaryColorPickerRef}
                type="color"
                value={theme.colors.accentSecondary}
                onChange={(e) => theme.setColor('accentSecondary', e.target.value)}
                className="hidden"
              />
              <div
                onClick={() => secondaryColorPickerRef.current?.click()}
                className="w-8 h-8 rounded-md shadow-inner border border-white/20 cursor-pointer hover:scale-110 transition-transform active:scale-95"
                style={{ backgroundColor: theme.colors.accentSecondary }}
                title="Pick secondary accent color"
              />
              <input
                type="text"
                value={theme.colors.accentSecondary}
                onChange={(e) => theme.setColor('accentSecondary', e.target.value)}
                className="bg-transparent text-sm w-full font-mono outline-none text-zinc-200 uppercase tracking-wider"
                placeholder="#00ffff"
              />
            </div>

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="uppercase font-bold">Gradient Mix</span>
                <span className="font-mono text-[var(--umbra-accent)]">{theme.accentBlendRatio}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={theme.accentBlendRatio}
                onInput={(e) => theme.setAccentBlendRatio(parseInt((e.target as HTMLInputElement).value))}
                onChange={(e) => theme.setAccentBlendRatio(parseInt(e.target.value))}
                style={{
                  ...sliderStyle(theme.accentBlendRatio, 0, 100),
                  background: `linear-gradient(120deg, ${theme.colors.accent} 0%, ${theme.colors.accent} ${theme.accentBlendRatio}%, ${theme.colors.accentSecondary} 100%)`,
                }}
                className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/40 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
              />
            </div>

            <div
              className="h-3 w-full rounded-md border border-white/15"
              style={{ background: `linear-gradient(120deg, ${theme.colors.accent} 0%, ${theme.colors.accent} ${theme.accentBlendRatio}%, ${theme.colors.accentSecondary} 100%)` }}
              title="Accent gradient preview"
            />
          </div>
          <SettingHint>
            Set primary + secondary hex colors and tune blend split for accent gradients.
          </SettingHint>
        </SettingGroup>

        {/* Color Presets */}
        <SettingGroup label="Quick Presets">
          <div className="grid grid-cols-3 gap-2">
            {/* Row 1 */}
            <button
              onClick={() => theme.applyPreset('minokai')}
              className="h-12 bg-gradient-to-br from-[#ff3860] to-[#ff6b6b] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(255,56,96,0.4)] border border-white/10 active:scale-95"
              title="Minokai - Signature red/pink gradient"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Minokai</span>
            </button>
            <button
              onClick={() => theme.applyPreset('arctic')}
              className="h-12 bg-gradient-to-br from-[#00f2ea] to-[#0ea5e9] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(0,242,234,0.4)] border border-white/10 active:scale-95"
              title="Arctic - Icy cyan frost"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Arctic</span>
            </button>
            <button
              onClick={() => theme.applyPreset('amethyst')}
              className="h-12 bg-gradient-to-br from-[#a855f7] to-[#7c3aed] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-white/10 active:scale-95"
              title="Amethyst - Deep purple dream"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Amethyst</span>
            </button>

            {/* Row 2 */}
            <button
              onClick={() => theme.applyPreset('sunset')}
              className="h-12 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(255,107,53,0.4)] border border-white/10 active:scale-95"
              title="Sunset - Warm orange blaze"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Sunset</span>
            </button>
            <button
              onClick={() => theme.applyPreset('neon')}
              className="h-12 bg-gradient-to-br from-[#ff2d95] to-[#00ffff] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(255,45,149,0.5)] border border-white/10 active:scale-95"
              title="Neon - Cyberpunk vibes"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Neon</span>
            </button>
            <button
              onClick={() => theme.applyPreset('forest')}
              className="h-12 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(34,197,94,0.4)] border border-white/10 active:scale-95"
              title="Forest - Earthy green mist"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Forest</span>
            </button>

            {/* Row 3 */}
            <button
              onClick={() => theme.applyPreset('golden')}
              className="h-12 bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(251,191,36,0.4)] border border-white/10 active:scale-95"
              title="Golden - Luxury amber glow"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Golden</span>
            </button>
            <button
              onClick={() => theme.applyPreset('ocean')}
              className="h-12 bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(14,165,233,0.4)] border border-white/10 active:scale-95"
              title="Ocean - Deep marine blue"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Ocean</span>
            </button>
            <button
              onClick={() => theme.applyPreset('sakura')}
              className="h-12 bg-gradient-to-br from-[#f472b6] to-[#ec4899] rounded-lg hover:scale-105 transition-transform shadow-[0_0_15px_rgba(244,114,182,0.4)] border border-white/10 active:scale-95"
              title="Sakura - Cherry blossom pink"
            >
              <span className="text-[10px] font-bold text-white drop-shadow uppercase tracking-wider">Sakura</span>
            </button>
          </div>
          <SettingHint>Choose from 9 beautiful theme presets - each with custom colors and blur</SettingHint>
        </SettingGroup>
      </div>

      {/* Boot Sequence */}
      <div className="p-4 bg-black/20 border border-white/10 rounded-lg space-y-4">
        <SettingGroup label="Boot Sequence">
          <div className="flex items-center gap-2 mb-3">
             <div className="text-sm font-bold text-[var(--umbra-accent)] uppercase tracking-wider">Startup Animation</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {BOOT_ANIMATION_OPTIONS.map(({ key: anim, label }) => (
              <button
                key={anim}
                onClick={() => theme.setBootAnimation(anim)}
                className={cn(
                  "py-2 text-[10px] uppercase font-bold tracking-wider rounded-lg border transition-all",
                  theme.bootAnimation === anim
                    ? "bg-[var(--umbra-accent)] border-[var(--umbra-accent)] text-white shadow-lg"
                    : "bg-black/20 border-white/10 text-zinc-400 hover:text-white hover:border-white/30"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <SettingHint>
            Matrix: Kanji rain | Hex: Floating hexagons | Image: Still background | Fade: Simple fade-in
          </SettingHint>
        </SettingGroup>

        {theme.bootAnimation === 'matrix' && (
          <SettingGroup label="Matrix Rain Content">
            <div className="grid grid-cols-3 gap-2">
              {BOOT_RAIN_CONTENT_OPTIONS.map(({ key, label, description }) => (
                <button
                  key={key}
                  onClick={() => theme.setBootRainContent(key)}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left transition-all",
                    theme.bootRainContent === key
                      ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
                  )}
                >
                  <div className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{description}</div>
                </button>
              ))}
            </div>
          </SettingGroup>
        )}

        {theme.bootAnimation === 'image' && (
          <SettingGroup label="Image Background">
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => theme.setBootImageBackgroundId(BOOT_IMAGE_BACKGROUND_RANDOM_ID)}
                className={cn(
                  "flex min-h-16 flex-col justify-center rounded-lg border px-3 py-3 text-left transition-all",
                  theme.bootImageBackgroundId === BOOT_IMAGE_BACKGROUND_RANDOM_ID
                    ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
                )}
              >
                <div className="text-[11px] font-black uppercase tracking-[0.18em]">Random</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">Pick one each boot.</div>
              </button>
              {BOOT_IMAGE_BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  type="button"
                  onClick={() => theme.setBootImageBackgroundId(background.id)}
                  className={cn(
                    "group overflow-hidden rounded-lg border text-left transition-all",
                    theme.bootImageBackgroundId === background.id
                      ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
                  )}
                >
                  <div
                    className="h-16 bg-cover bg-center transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundImage: `url(${background.src})` }}
                  />
                  <div className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em]">
                    {background.name}
                  </div>
                </button>
              ))}
            </div>
            <SettingHint>
              Uses a still image as the full boot screen. Logo and graph overlays are disabled in this mode.
            </SettingHint>
          </SettingGroup>
        )}

        {theme.bootAnimation !== 'image' && (
          <SettingGroup label="Boot Logo">
            <div className="grid grid-cols-2 gap-2">
              {BOOT_LOGO_STYLE_OPTIONS.map(({ key, label, description }) => (
                <button
                  key={key}
                  onClick={() => theme.setBootLogoStyle(key)}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left transition-all",
                    theme.bootLogoStyle === key
                      ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
                  )}
                >
                  <div className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{description}</div>
                </button>
              ))}
            </div>
            <SettingHint>
              Controls the foreground branding layered over the startup background animation.
            </SettingHint>
          </SettingGroup>
        )}

        {theme.bootAnimation !== 'image' && theme.bootLogoStyle === 'ascii' && (
        <SettingGroup label="ASCII Logo Style">
          <div className="grid grid-cols-2 gap-2">
            {BOOT_TEXT_VARIANT_OPTIONS.map(({ key, label, description }) => (
              <button
                key={key}
                onClick={() => theme.setBootTextVariant(key)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-all",
                  theme.bootTextVariant === key
                    ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
                )}
              >
                <div className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{description}</div>
              </button>
            ))}
          </div>
          <SettingHint>
            Controls the ASCII branding used on the boot screen and in the Umbra app bar.
          </SettingHint>
        </SettingGroup>
        )}

        {theme.bootAnimation !== 'image' && (
          <SettingGroup label="Umbra Graph Boot">
            <button
              type="button"
              onClick={() => theme.setBootGraphEnabled(!theme.bootGraphEnabled)}
              className={cn(
                "w-full rounded-lg border px-3 py-3 text-left transition-all",
                theme.bootGraphEnabled
                  ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-white shadow-lg"
                  : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/25 hover:text-white"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--umbra-accent)]">
                  {theme.bootGraphEnabled ? 'Umbra Graph Enabled' : 'Enable Umbra Graph'}
                </div>
                <div className={cn(
                  "rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                  theme.bootGraphEnabled
                    ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/20 text-[var(--umbra-accent)]"
                    : "border-white/10 bg-black/30 text-zinc-500"
                )}>
                  {theme.bootGraphEnabled ? 'On' : 'Off'}
                </div>
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Uses the service graph boot sequence with the selected startup background.
              </div>
            </button>
            <SettingHint>
              Shows Umbra Core connecting to available app services and subservices during startup.
            </SettingHint>
          </SettingGroup>
        )}
      </div>

    </div>
  );
};
