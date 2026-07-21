'use client';

/**
 * StudioShell - Main application shell with drag-drop infrastructure
 *
 * Uses the centralized DragDropProvider from '@/lib/dnd' for all drag operations.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UmbraAppBar } from "@/components/layout/UmbraAppBar";
import { RemoteLongPressContextMenu } from "@/components/layout/RemoteLongPressContextMenu";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { BootScreen } from "@/components/ui/BootScreen";
import { CursorEffects } from "@/components/ui/CursorEffects";
import { OLEDMode } from "@/components/ui/OLEDMode";
import { AnimatePresence } from "framer-motion";
import { ModalProvider } from '@/contexts/ModalContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useStore } from '@/store/useStore';
import { useComponentDebug } from '@/hooks/useComponentDebug';
import { governorShouldRun, governorTryAcquire } from '@/lib/loadGovernor';
import { PerfTraceProbe } from '@/components/perf/PerfTraceProbe';
import {
  DEFAULT_APP_SETTINGS,
  fetchAppSettingsFromBackend,
  loadAppSettings,
  normalizeAppSettings,
  saveAppSettings,
  subscribeToAppSettings,
} from '@/lib/appSettings';

import {
  DragDropProvider,
} from '@/lib/dnd';

export const StudioShell = ({ children }: { children: React.ReactNode }) => {
  useComponentDebug('StudioShell');

  const { cursorEffects, bootAnimation, bootGraphEnabled, hasHydrated } = useThemeStore();
  const [isBooted, setIsBooted] = useState(false);
  const [bootMinElapsed, setBootMinElapsed] = useState(false);
  const [bootMaxElapsed, setBootMaxElapsed] = useState(false);
  const [bootStatusChecked, setBootStatusChecked] = useState(false);
  const [bootFilesystemWarmComplete, setBootFilesystemWarmComplete] = useState(false);
  const bootInitializedRef = useRef(false);
  const { appSettings, booting, fetchSystemStatus } = useStore();
  const hasBootScreen = bootAnimation !== 'none' || bootGraphEnabled;
  
  useEffect(() => {
    if (!hasHydrated || bootInitializedRef.current) return;
    setIsBooted(!hasBootScreen);
    bootInitializedRef.current = true;
  }, [hasBootScreen, hasHydrated]);

  const autoLaunchTargets = useMemo(() => {
    const targets: Array<{ key: 'comfyui' | 'gallery' | 'comfyuiVersions'; label: string }> = [];
    if (appSettings['comfyui.autoLaunch']) targets.push({ key: 'comfyui', label: 'ComfyUI' });
    targets.push({ key: 'comfyuiVersions', label: 'Workspace Config' });
    return targets;
  }, [
    appSettings['comfyui.autoLaunch'],
  ]);

  const splashMinDurationMs = useMemo(() => {
    const base = bootAnimation === 'fade'
      ? 650
      : bootGraphEnabled
        ? 2600
        : 950;
    return autoLaunchTargets.length > 0 ? base + 900 : base;
  }, [autoLaunchTargets.length, bootAnimation, bootGraphEnabled]);

  const splashMaxDurationMs = useMemo(() => splashMinDurationMs + 5000, [splashMinDurationMs]);
  const bootStatusPollTimeoutMs = 1200;

  useEffect(() => {
    if (!hasHydrated || !hasBootScreen || isBooted) return;

    setBootMinElapsed(false);
    setBootMaxElapsed(false);
    setBootStatusChecked(false);

    let cancelled = false;

    const pollStatus = async () => {
      if (!governorShouldRun('boot-status-poll', 1000)) return;
      const release = governorTryAcquire('interactive');
      if (!release) return;
      try {
        await Promise.race([
          Promise.resolve(fetchSystemStatus({ force: true })),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, bootStatusPollTimeoutMs);
          }),
        ]);
      } finally {
        release();
        if (!cancelled) setBootStatusChecked(true);
      }
    };

    void pollStatus();
    const pollTimer = window.setInterval(() => {
      void pollStatus();
    }, 800);
    const minTimer = window.setTimeout(() => {
      if (!cancelled) setBootMinElapsed(true);
    }, splashMinDurationMs);
    const maxTimer = window.setTimeout(() => {
      if (!cancelled) setBootMaxElapsed(true);
    }, splashMaxDurationMs);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [bootAnimation, bootStatusPollTimeoutMs, fetchSystemStatus, hasBootScreen, hasHydrated, isBooted, splashMaxDurationMs, splashMinDurationMs]);

  const activeAutoLaunchTargets = useMemo(
    () => autoLaunchTargets.filter((target) => Boolean(booting[target.key])),
    [autoLaunchTargets, booting],
  );
  useEffect(() => {
    if (!hasHydrated) return;
    setBootFilesystemWarmComplete(true);
  }, [hasHydrated, isBooted]);

  const bootHoldStatus = useMemo(() => {
    if (!bootStatusChecked) return 'CHECKING SERVICES';
    if (!bootFilesystemWarmComplete) return 'WARMING FILESYSTEM';
    if (activeAutoLaunchTargets.length > 0) {
      return `WARMING ${activeAutoLaunchTargets.map((target) => target.label.toUpperCase()).join(' + ')}`;
    }
    if (autoLaunchTargets.length > 0 && !bootMinElapsed) return 'WAITING FOR STARTUP SERVICES';
    return 'LOADING INTERFACES';
  }, [activeAutoLaunchTargets, autoLaunchTargets.length, bootFilesystemWarmComplete, bootMinElapsed, bootStatusChecked]);

  const shouldHoldBootScreen = !bootMaxElapsed && (
    !bootMinElapsed ||
    !bootStatusChecked ||
    !bootFilesystemWarmComplete ||
    activeAutoLaunchTargets.length > 0
  );

  useEffect(() => {
    useStore.getState().applyAppSettings({ ...DEFAULT_APP_SETTINGS });
    fetchAppSettingsFromBackend().then((remote) => {
      const merged = remote
        ? normalizeAppSettings(remote)
        : loadAppSettings();
      saveAppSettings(merged, { broadcast: false, replace: true });
      useStore.getState().applyAppSettings(merged);
    }).catch(() => {});

    const unsubscribe = subscribeToAppSettings((settings) => {
      useStore.getState().applyAppSettings(settings);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const className = 'umbra-nsfw-thumbnail-blur-enabled';
    const enabled = appSettings['ui.nsfwThumbnailBlurEnabled'] === true;
    const intensity = Math.max(0, Math.min(100, Math.round(Number(appSettings['ui.nsfwThumbnailBlurIntensity'] ?? 85))));
    const blurPx = (intensity / 100) * 20;
    document.body.classList.toggle(className, enabled);
    document.documentElement.style.setProperty('--umbra-nsfw-thumbnail-blur', `${blurPx.toFixed(2)}px`);
    return () => {
      document.body.classList.remove(className);
      document.documentElement.style.removeProperty('--umbra-nsfw-thumbnail-blur');
    };
  }, [appSettings['ui.nsfwThumbnailBlurEnabled'], appSettings['ui.nsfwThumbnailBlurIntensity']]);

  return (
    <ThemeProvider>
      <ModalProvider>
        {cursorEffects && <CursorEffects />}
        <OLEDMode />
        <PerfTraceProbe />
        <RemoteLongPressContextMenu />

        {/* Global SVG Filters */}
        <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
          <defs>
            <filter id="grain">
              <feTurbulence
                id="grain-turb"
                baseFrequency="0.8"
                numOctaves="3"
                type="fractalNoise"
                result="noise"
              />
              <feColorMatrix
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                in="noise"
                result="coloredNoise"
              />
              <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
              <feBlend mode="overlay" in="composite" in2="SourceGraphic" />
            </filter>
          </defs>
        </svg>

        <DragDropProvider>
          {/* Boot Screen */}
          <AnimatePresence>
            {hasHydrated && !isBooted && (
              <BootScreen
                key="boot"
                hold={shouldHoldBootScreen}
                holdStatus={bootHoldStatus}
                onComplete={() => setIsBooted(true)}
              />
            )}
          </AnimatePresence>

          {/* Main App - visible after boot, but mounted immediately to warm up */}
          {hasHydrated && (
            <div
              data-umbra-studio-shell=""
              className={`flex h-screen w-screen overflow-hidden bg-[var(--umbra-bg)] ${isBooted ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {/* The AppBar Pinned Left */}
              <UmbraAppBar />

              <div data-umbra-workspace-frame="" className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
                <div className="flex-1 min-h-0 flex relative overflow-hidden">
                  <main
                    data-umbra-workspace-stage=""
                    className="flex-1 min-h-0 overflow-hidden relative shadow-[0_0_100px_rgba(0,0,0,0.8)] z-10 transition-all duration-300"
                  >
                    {children}
                  </main>
                </div>
              </div>
            </div>
          )}
        </DragDropProvider>
      </ModalProvider>
    </ThemeProvider>
  );
};
