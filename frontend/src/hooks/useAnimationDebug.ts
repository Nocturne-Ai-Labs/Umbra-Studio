'use client';

import { useDebugStore } from '@/store/useDebugStore';

export function useAnimationDebug(componentName: string) {
  const { config, isRecording, logEvent } = useDebugStore();

  return {
    onAnimationStart: (name: string, element?: string) => {
      if (!config.enabled || !isRecording || !config.trackAnimations) return;

      logEvent({
        category: 'animation',
        type: 'animation',
        component: componentName,
        data: {
          name,
          phase: 'start',
          element,
        },
      });
    },

    onAnimationComplete: (name: string, duration?: number) => {
      if (!config.enabled || !isRecording || !config.trackAnimations) return;

      logEvent({
        category: 'animation',
        type: 'animation',
        component: componentName,
        data: {
          name,
          phase: 'complete',
          duration,
        },
      });
    },
  };
}
