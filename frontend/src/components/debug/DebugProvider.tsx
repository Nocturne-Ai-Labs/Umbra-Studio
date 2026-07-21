'use client';

import React, { useEffect } from 'react';
import { useDebugStore } from '@/store/useDebugStore';
import { useDebugTracking } from '@/hooks/useDebugTracking';
import { initializeApiDebugger } from '@/lib/debug';
import { loadAppSettings, subscribeToAppSettings } from '@/lib/appSettings';

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const debugStore = useDebugStore();

  useEffect(() => {
    const applyDiagnosticSetting = () => {
      const enabled = loadAppSettings()['advanced.diagnosticLogging'] === true;
      debugStore.updateConfig({ enabled });
      if (enabled && !useDebugStore.getState().isRecording) {
        useDebugStore.getState().startSession();
      } else if (!enabled && useDebugStore.getState().isRecording) {
        useDebugStore.getState().endSession();
      }
    };
    applyDiagnosticSetting();
    const unsubscribe = subscribeToAppSettings(applyDiagnosticSetting);

    // Initialize API debugger
    initializeApiDebugger(debugStore);

    // Expose store to window for debugging
    (window as any).useDebugStore = useDebugStore;

    // End session on unmount
    return () => {
      unsubscribe();
      debugStore.endSession();
    };
  }, []);

  // Enable input tracking
  useDebugTracking();

  return <>{children}</>;
}
