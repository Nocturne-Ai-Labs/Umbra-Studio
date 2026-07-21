import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { applyThemeSettingsSnapshot, getThemeSettingsSnapshot, useThemeStore } from '@/store/useThemeStore';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useThemeStore();
  const hasHydrated = useThemeStore((state) => state.hasHydrated);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const lastSavedThemeSnapshotRef = useRef('');

  useEffect(() => {
    const syncFromBackend = () => {
      fetch('/api/settings/bundle', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          applyThemeSettingsSnapshot(payload?.bundle?.themeSettings ?? null);
          lastSavedThemeSnapshotRef.current = JSON.stringify(getThemeSettingsSnapshot());
          useThemeStore.getState().setHasHydrated(true);
        })
        .catch(() => {
          useThemeStore.getState().setHasHydrated(true);
        });
    };

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('umbra-theme-sync');
      syncChannelRef.current = channel;
      channel.onmessage = () => syncFromBackend();
    }
    syncFromBackend();

    return () => {
      if (syncChannelRef.current) {
        syncChannelRef.current.close();
        syncChannelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    const snapshot = JSON.stringify(getThemeSettingsSnapshot());
    if (snapshot === lastSavedThemeSnapshotRef.current) return;

    const timer = window.setTimeout(() => {
      fetch('/api/settings/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle: {
            schemaVersion: 1,
            themeSettings: JSON.parse(snapshot),
          },
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Theme save failed (${response.status})`);
          lastSavedThemeSnapshotRef.current = snapshot;
          syncChannelRef.current?.postMessage({ type: 'theme-updated' });
        })
        .catch((error) => {
          console.warn('[ThemeProvider] Failed to save theme settings:', error);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [hasHydrated, theme]);

  // Use useLayoutEffect to apply CSS variables synchronously before paint
  // This ensures the boot screen has correct theme values immediately
  useLayoutEffect(() => {
    const root = document.documentElement;

    // Toggle cursor class
    if (theme.cursorEffects) {
      document.body.classList.add('custom-cursor-enabled');
    } else {
      document.body.classList.remove('custom-cursor-enabled');
    }

    const accentBlendRatio = Math.max(0, Math.min(100, Number(theme.accentBlendRatio ?? 50)));
    const accentSecondary = theme.colors.accentSecondary || theme.colors.accent;
    const accentPrimary = theme.colors.accent;
    const accentMixed = `color-mix(in srgb, ${accentPrimary} ${accentBlendRatio}%, ${accentSecondary} ${100 - accentBlendRatio}%)`;
    const blendFeather = 10;
    const blendStart = Math.max(0, accentBlendRatio - blendFeather);
    const blendEnd = Math.min(100, accentBlendRatio + blendFeather);
    const accentRatioSplit = `${accentBlendRatio}%`;
    const accentGradientSoft = `linear-gradient(120deg, ${accentPrimary} 0%, ${accentPrimary} ${blendStart}%, ${accentSecondary} ${blendEnd}%, ${accentSecondary} 100%)`;

    // Inject Color Variables
    root.style.setProperty('--umbra-accent-primary', accentPrimary);
    root.style.setProperty('--umbra-accent', accentMixed);
    root.style.setProperty('--umbra-accent-secondary', accentSecondary);
    root.style.setProperty('--umbra-accent-ratio', accentRatioSplit);
    root.style.setProperty('--umbra-accent-gradient', accentGradientSoft);
    root.style.setProperty('--umbra-accent-gradient-soft', accentGradientSoft);
    root.style.setProperty(
      '--umbra-border-gradient',
      `linear-gradient(120deg, color-mix(in srgb, ${accentPrimary} 44%, transparent) 0%, color-mix(in srgb, ${accentPrimary} 44%, transparent) ${blendStart}%, color-mix(in srgb, ${accentSecondary} 44%, transparent) ${blendEnd}%, color-mix(in srgb, ${accentSecondary} 44%, transparent) 100%)`,
    );
    root.style.setProperty('--umbra-bg', theme.colors.bg);
    root.style.setProperty('--umbra-panel', theme.colors.panel);
    root.style.setProperty('--umbra-text', theme.colors.text);
    root.style.setProperty('--umbra-border', theme.colors.border);
    root.style.setProperty('--umbra-accent-glow', `color-mix(in srgb, ${accentMixed} 45%, transparent)`);
    root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 34%, rgba(255, 255, 255, 0.24))');

    // Blur & Transparency
    root.style.setProperty('--umbra-blur', `${theme.blurIntensity}px`);
    root.style.setProperty('--umbra-transparency', `${theme.transparency / 100}`);
    root.style.setProperty('--umbra-frost-intensity', `${theme.blurIntensity}px`);
    root.style.setProperty('--umbra-liquid-refraction', `${theme.liquidRefraction / 100}`);
    root.style.setProperty('--umbra-liquid-specular', `${theme.liquidSpecular / 100}`);
    root.style.setProperty('--umbra-metalness', `${theme.metalness / 100}`);
    root.style.setProperty('--umbra-metal-flow', `${theme.metalFlow / 100}`);

    // DNA-specific styling - DRAMATICALLY DIFFERENT STYLES
    // Reset to defaults first, then apply DNA-specific overrides
    root.style.setProperty('--umbra-border-width', '1px');
    root.style.setProperty('--umbra-border-style', 'solid');
    root.style.setProperty('--umbra-inset-shadow', '0 0 0 transparent');
    root.style.setProperty('--umbra-outline', 'none');
    root.style.setProperty('--umbra-transform', 'none');

    switch (theme.dna) {
      case 'glass':
        // Classic glassmorphism - frosted glass with strong blur
        root.style.setProperty('--umbra-radius', '16px');
        root.style.setProperty('--umbra-shadow', '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset');
        root.style.setProperty('--umbra-panel-bg', `rgba(255, 255, 255, ${0.05 * theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', `${theme.blurIntensity}px`);
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.2)');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 1px 0 rgba(255, 255, 255, 0.15)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 26%, rgba(255, 255, 255, 0.36))');
        break;

      case 'liquid-glass':
        // Apple-inspired liquid glass with stronger refractive and specular behavior
        root.style.setProperty('--umbra-radius', '22px');
        root.style.setProperty(
          '--umbra-shadow',
          '0 20px 44px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255,255,255,0.25) inset, 0 -8px 20px rgba(255,255,255,0.06) inset'
        );
        root.style.setProperty('--umbra-panel-bg', `rgba(255, 255, 255, ${0.06 * theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', `${theme.blurIntensity + (theme.liquidRefraction * 0.18)}px`);
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.28)');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 1px 0 rgba(255, 255, 255, 0.3)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 30%, rgba(255, 255, 255, 0.42))');
        break;

      case 'liquid-metal': {
        // Distinct reflective liquid metal with flowing highlights
        const metalTint = Math.round(theme.metalness * 0.9 + 80);
        root.style.setProperty('--umbra-radius', '20px');
        root.style.setProperty(
          '--umbra-shadow',
          '0 16px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.35)'
        );
        root.style.setProperty('--umbra-panel-bg', `rgba(${metalTint}, ${metalTint}, ${metalTint + 6}, ${0.17 * theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', `${Math.max(theme.blurIntensity * 0.5, 6)}px`);
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.3)');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 10px 30px rgba(255,255,255,0.06)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 24%, rgba(255, 255, 255, 0.48))');
        break;
      }

      case 'material':
        // Google Material Design - elevated cards with distinct shadows
        root.style.setProperty('--umbra-radius', '4px');
        root.style.setProperty('--umbra-shadow', '0 2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.2)');
        root.style.setProperty('--umbra-panel-bg', `rgba(33, 33, 33, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', 'none');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 32%, rgba(255, 255, 255, 0.28))');
        break;

      case 'neumorphic':
        // Soft UI / Neumorphism - extruded 3D effect
        root.style.setProperty('--umbra-radius', '24px');
        root.style.setProperty('--umbra-shadow', '8px 8px 16px rgba(0, 0, 0, 0.5), -8px -8px 16px rgba(60, 60, 80, 0.15)');
        root.style.setProperty('--umbra-panel-bg', `rgba(30, 30, 40, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', 'none');
        root.style.setProperty('--umbra-inset-shadow', 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(80, 80, 100, 0.1)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 20%, rgba(255, 255, 255, 0.34))');
        break;

      case 'flat':
        // Ultra minimal - no shadows, no borders, pure color blocks
        root.style.setProperty('--umbra-radius', '0px');
        root.style.setProperty('--umbra-shadow', 'none');
        root.style.setProperty('--umbra-panel-bg', `rgba(24, 24, 27, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', 'none');
        root.style.setProperty('--umbra-library-tree-line', 'rgba(255, 255, 255, 0.3)');
        break;

      case 'brutalist':
        // Raw, bold, unapologetic - thick borders, hard shadows
        root.style.setProperty('--umbra-radius', '0px');
        root.style.setProperty('--umbra-shadow', '8px 8px 0px var(--umbra-accent)');
        root.style.setProperty('--umbra-panel-bg', `rgba(0, 0, 0, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', '4px solid var(--umbra-accent)');
        root.style.setProperty('--umbra-border-width', '4px');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 62%, white)');
        break;

      case 'bulma':
        // Classic solid UI framework style
        root.style.setProperty('--umbra-radius', '6px');
        root.style.setProperty('--umbra-shadow', '0 2px 0 rgba(0, 0, 0, 0.1)');
        root.style.setProperty('--umbra-panel-bg', `rgba(36, 36, 45, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.1)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 30%, rgba(255, 255, 255, 0.26))');
        break;

      case 'cards':
        // Sharp, elevated cards with subtle lift
        root.style.setProperty('--umbra-radius', '12px');
        root.style.setProperty('--umbra-shadow', '0 4px 6px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)');
        root.style.setProperty('--umbra-panel-bg', `rgba(28, 28, 35, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.08)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 28%, rgba(255, 255, 255, 0.28))');
        break;

      case 'retro':
        // 80s/90s aesthetic - pixelated feel, neon accents
        root.style.setProperty('--umbra-radius', '0px');
        root.style.setProperty(
          '--umbra-shadow',
          '6px 6px 0px rgba(0, 0, 0, 0.8), 12px 12px 0px color-mix(in srgb, var(--umbra-accent) 40%, transparent)'
        );
        root.style.setProperty('--umbra-panel-bg', `rgba(20, 0, 40, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', '3px solid var(--umbra-accent)');
        root.style.setProperty('--umbra-border-width', '3px');
        root.style.setProperty('--umbra-outline', `2px solid rgba(0, 0, 0, 0.5)`);
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 70%, white)');
        break;

      case 'cyber':
        // Cyberpunk - asymmetric cuts, neon glow, high tech
        root.style.setProperty('--umbra-radius', '0px 24px 0px 24px');
        root.style.setProperty(
          '--umbra-shadow',
          '0 0 30px color-mix(in srgb, var(--umbra-accent) 60%, transparent), 0 0 60px color-mix(in srgb, var(--umbra-accent) 30%, transparent), inset 0 0 20px color-mix(in srgb, var(--umbra-accent) 20%, transparent)'
        );
        root.style.setProperty('--umbra-panel-bg', `rgba(5, 5, 15, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '4px');
        root.style.setProperty('--umbra-border', '2px solid var(--umbra-accent)');
        root.style.setProperty('--umbra-border-width', '2px');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 0 30px color-mix(in srgb, var(--umbra-accent) 15%, transparent)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 74%, rgba(255, 255, 255, 0.34))');
        break;

      case 'organic':
        // Natural, flowing shapes - asymmetric, earthy
        root.style.setProperty('--umbra-radius', '40px 16px 40px 16px');
        root.style.setProperty('--umbra-shadow', '0 12px 40px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.2)');
        root.style.setProperty('--umbra-panel-bg', `rgba(20, 30, 25, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', `${Math.max(theme.blurIntensity, 16)}px`);
        root.style.setProperty('--umbra-border', '1px solid rgba(255, 255, 255, 0.15)');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 1px 2px rgba(255, 255, 255, 0.1)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 34%, rgba(255, 255, 255, 0.3))');
        break;

      case 'terminal':
        // Hacker mode - monochrome, CRT feel, scanlines aesthetic
        root.style.setProperty('--umbra-radius', '0px');
        root.style.setProperty('--umbra-shadow', '0 0 10px color-mix(in srgb, var(--umbra-accent) 40%, transparent), inset 0 0 100px rgba(0, 0, 0, 0.5)');
        root.style.setProperty('--umbra-panel-bg', `rgba(0, 5, 0, ${theme.transparency / 100})`);
        root.style.setProperty('--umbra-blur', '0px');
        root.style.setProperty('--umbra-border', '1px solid color-mix(in srgb, var(--umbra-accent) 80%, transparent)');
        root.style.setProperty('--umbra-inset-shadow', 'inset 0 0 50px color-mix(in srgb, var(--umbra-accent) 10%, transparent)');
        root.style.setProperty('--umbra-library-tree-line', 'color-mix(in srgb, var(--umbra-accent) 68%, rgba(255, 255, 255, 0.24))');
        break;
    }

    // Apply body class for DNA-specific global styles
    document.body.setAttribute('data-dna', theme.dna);

    // Dynamic Font Variable
    const fontVar = theme.typography === 'retro' ? 'var(--font-retro)' :
                   theme.typography === 'serif' ? 'var(--font-serif)' :
                   theme.typography === 'mono' ? 'var(--font-mono-clean)' :
                   theme.typography === 'display' ? 'var(--font-display)' :
                   'var(--font-mono-clean)';

    // Font metrics differ by family; normalize perceived size/spacing across styles.
    const typographyMetrics = {
      system: { scale: 1.0, letterSpacing: '0em', lineHeight: '1.5', sizeAdjust: '0.52' },
      serif: { scale: 0.99, letterSpacing: '0.002em', lineHeight: '1.55', sizeAdjust: '0.5' },
      retro: { scale: 0.95, letterSpacing: '0.008em', lineHeight: '1.45', sizeAdjust: '0.49' },
      mono: { scale: 0.98, letterSpacing: '0.003em', lineHeight: '1.48', sizeAdjust: '0.54' },
      display: { scale: 0.96, letterSpacing: '0.006em', lineHeight: '1.46', sizeAdjust: '0.52' },
    } as const;
    const metrics = typographyMetrics[theme.typography] ?? typographyMetrics.system;

    root.style.setProperty('--font-family', fontVar);
    root.style.setProperty('--font-size-normalize', `${metrics.scale}`);
    root.style.setProperty('--font-letter-spacing', metrics.letterSpacing);
    root.style.setProperty('--font-line-height', metrics.lineHeight);
    root.style.setProperty('--font-size-adjust', metrics.sizeAdjust);
    root.style.setProperty('--ui-scale', '1');
    root.style.setProperty('--text-scale', '1');
    document.body.setAttribute('data-typography', theme.typography);

  }, [theme]);

  return <>{children}</>;
};
