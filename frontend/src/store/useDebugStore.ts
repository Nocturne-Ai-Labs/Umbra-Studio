'use client';

import { create } from 'zustand';
import type { DebugStore, DebugConfig, DebugSession, TelemetryEvent } from '@/types/debug';
import { isDiagnosticLoggingEnabled, logDiagnostic } from '@/lib/diagnostics';

const DEFAULT_CONFIG: DebugConfig = {
  enabled: false,
  verbosity: 'normal',
  trackCursor: false, // DISABLED - generates too many events (60fps)
  trackAnimations: true, // Event-driven: only on animation start/end
  trackState: true, // Event-driven: only on user actions, not internal updates
  trackNetwork: true,
  trackPerformance: true,
  showOverlay: false,
  exportOnError: true,
  maxEvents: 1000,
  cursorSampleRate: 16, // ~60fps
  fileLogging: true, // NEW: Enable live file logging
  fileLogBatchSize: 10, // NEW: Send logs in batches of 10 events
};

export const useDebugStore = create<DebugStore>()(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      session: null,
      events: [],
      isRecording: false,
      overlayVisible: false,

      startSession: () => {
        if (!isDiagnosticLoggingEnabled()) return;
        const session: DebugSession = {
          id: `session-${Date.now()}`,
          startTime: Date.now(),
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          events: [],
          errors: [],
          performance: {
            avgFps: 0,
            maxMemory: 0,
            longTasks: 0,
          },
        };

        set({ session, isRecording: true, events: [] });
        logDiagnostic('[Debug] Session started:', session.id, 'log');
      },

      endSession: () => {
        const { session } = get();
        if (session) {
          set({
            session: { ...session, endTime: Date.now() },
            isRecording: false,
          });
          logDiagnostic('[Debug] Session ended:', session.id, 'log');
        }
      },

      logEvent: (event) => {
        const { config, events, isRecording } = get();
        if (!config.enabled || !isRecording) return;

        const fullEvent: TelemetryEvent = {
          ...event,
          id: `${event.category}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };

        // Add to buffer with max size limit
        const newEvents = [...events, fullEvent].slice(-config.maxEvents);

        set({ events: newEvents });

        // Log to console based on verbosity
        if (config.verbosity === 'verbose' ||
          (config.verbosity === 'normal' && ['error', 'network', 'performance'].includes(event.category))) {
          logDiagnostic(`[Debug:${event.category}]`, fullEvent, 'log');
        }

      },

      clearEvents: () => {
        set({ events: [] });
        logDiagnostic('[Debug] Events cleared', undefined, 'log');
      },

      exportSession: () => {
        const { session, events } = get();
        const exportData = {
          ...session,
          events,
          exportedAt: Date.now(),
        };
        return JSON.stringify(exportData, null, 2);
      },

      toggleOverlay: () => {
        set((state) => ({ overlayVisible: !state.overlayVisible }));
      },

      updateConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
        }));
      },
    })
);
