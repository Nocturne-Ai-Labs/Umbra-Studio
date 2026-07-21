'use client';

import { useEffect, useRef, useState } from 'react';
import { AppSettings, loadAppSettings, subscribeToAppSettings } from '@/lib/appSettings';

interface OLEDModeSettings {
  enabled: boolean;
  idleTime: number; // seconds
}

function getOLEDSettings(settings: AppSettings = loadAppSettings()): OLEDModeSettings {
  return {
    enabled: settings['oledMode.enabled'] ?? false,
    idleTime: settings['oledMode.idleTime'] ?? 120,
  };
}

export function OLEDMode() {
  const [isGreyscale, setIsGreyscale] = useState(false);
  const [settings, setSettings] = useState<OLEDModeSettings>({ enabled: false, idleTime: 120 });
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isWindowFocusedRef = useRef<boolean>(true);

  // Load settings on mount and listen for changes
  useEffect(() => {
    const loadSettings = () => {
      setSettings(getOLEDSettings());
    };

    loadSettings();
    const unsubscribe = subscribeToAppSettings((next) => {
      setSettings(getOLEDSettings(next));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Handle idle detection and greyscale activation
  useEffect(() => {
    if (!settings.enabled) {
      setIsGreyscale(false);
      return;
    }

    const checkIdleAndFocus = () => {
      const now = Date.now();
      const idleMs = settings.idleTime * 1000;
      const isIdle = now - lastActivityRef.current > idleMs;
      const shouldGreyscale = isIdle && !isWindowFocusedRef.current;

      setIsGreyscale(shouldGreyscale);
    };

    // Activity handlers - reset idle timer
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      setIsGreyscale(false);
    };

    // Focus handlers
    const handleFocus = () => {
      isWindowFocusedRef.current = true;
      setIsGreyscale(false);
    };

    const handleBlur = () => {
      isWindowFocusedRef.current = false;
      // Start checking for greyscale after blur
      checkIdleAndFocus();
    };

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isWindowFocusedRef.current = false;
      } else {
        isWindowFocusedRef.current = true;
        setIsGreyscale(false);
      }
    };

    // Add event listeners
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity, true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check idle state periodically
    idleTimerRef.current = setInterval(checkIdleAndFocus, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity, true);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
      }
    };
  }, [settings.enabled, settings.idleTime]);

  // Apply greyscale filter to root element
  useEffect(() => {
    const root = document.documentElement;

    if (isGreyscale) {
      root.style.filter = 'grayscale(100%)';
      root.style.transition = 'filter 1s ease-in-out';
    } else {
      root.style.filter = '';
      root.style.transition = 'filter 0.3s ease-out';
    }

    return () => {
      root.style.filter = '';
      root.style.transition = '';
    };
  }, [isGreyscale]);

  // This component doesn't render anything visible
  return null;
}
