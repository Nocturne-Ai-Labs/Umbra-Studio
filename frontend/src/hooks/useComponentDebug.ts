'use client';

import { useEffect, useRef } from 'react';
import { useDebugStore } from '@/store/useDebugStore';

export function useComponentDebug(componentName: string, props?: Record<string, any>) {
  const { config, isRecording, logEvent } = useDebugStore();
  const renderCount = useRef(0);
  const mountTime = useRef(0);
  const prevProps = useRef(props);

  // Log mount
  useEffect(() => {
    if (!config.enabled || !isRecording) return;

    mountTime.current = Date.now();

    logEvent({
      category: 'lifecycle',
      type: 'mount',
      component: componentName,
      data: {
        component: componentName,
        props,
        timestamp: mountTime.current,
      },
    });

    return () => {
      logEvent({
        category: 'lifecycle',
        type: 'unmount',
        component: componentName,
        data: {
          component: componentName,
          lifetime: Date.now() - mountTime.current,
          renderCount: renderCount.current,
        },
      });
    };
  }, []);

  // Just track render count locally (don't log every render to prevent loops)
  renderCount.current++;
  prevProps.current = props;

  return { renderCount: renderCount.current };
}
