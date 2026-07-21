'use client';

import React from 'react';
import { getLoadGovernorSnapshot } from '@/lib/loadGovernor';
import { isDiagnosticLoggingEnabled, logDiagnostic } from '@/lib/diagnostics';

type LongTaskLike = {
  duration: number;
};

const HEARTBEAT_MS = 5000;
function isPerfTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    window.localStorage.removeItem('umbra.perfTrace');
    return isDiagnosticLoggingEnabled() || params.get('perfTrace') === '1';
  } catch {
    return false;
  }
}

function readUsedJsHeapMb(): number | null {
  const perfAny = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  const used = Number(perfAny?.memory?.usedJSHeapSize || 0);
  if (!Number.isFinite(used) || used <= 0) return null;
  return Math.round((used / (1024 * 1024)) * 10) / 10;
}

export function PerfTraceProbe() {
  const longTaskCountRef = React.useRef(0);
  const longTaskMaxMsRef = React.useRef(0);
  const lagMaxMsRef = React.useRef(0);
  const lagSumMsRef = React.useRef(0);
  const lagSamplesRef = React.useRef(0);

  React.useEffect(() => {
    if (!isPerfTraceEnabled()) return;

    let lagTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let observer: PerformanceObserver | null = null;
    let last = performance.now();

    lagTimer = window.setInterval(() => {
      const now = performance.now();
      const drift = Math.max(0, now - last - 1000);
      last = now;
      lagSamplesRef.current += 1;
      lagSumMsRef.current += drift;
      lagMaxMsRef.current = Math.max(lagMaxMsRef.current, drift);
    }, 1000);

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        observer = new PerformanceObserver((list) => {
          const entries = list.getEntries() as unknown as LongTaskLike[];
          for (const entry of entries) {
            const duration = Math.max(0, Number(entry?.duration) || 0);
            longTaskCountRef.current += 1;
            longTaskMaxMsRef.current = Math.max(longTaskMaxMsRef.current, duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        observer = null;
      }
    }

    heartbeatTimer = window.setInterval(() => {
      const samples = Math.max(1, lagSamplesRef.current);
      const avgLagMs = Math.round((lagSumMsRef.current / samples) * 10) / 10;
      const maxLagMs = Math.round(lagMaxMsRef.current * 10) / 10;
      const longTaskCount = longTaskCountRef.current;
      const longTaskMaxMs = Math.round(longTaskMaxMsRef.current * 10) / 10;
      const usedHeapMb = readUsedJsHeapMb();
      const governor = getLoadGovernorSnapshot();

      const payload = {
        avgLagMs,
        maxLagMs,
        longTaskCount,
        longTaskMaxMs,
        usedHeapMb,
        governor,
        visibility: document.visibilityState,
      };

      try {
        logDiagnostic('[UmbraPerfTrace]', payload, 'info');
      } catch {}

      try {
        const message = JSON.stringify(payload);
        const body = {
          logs: [
            {
              timestamp: Date.now(),
              level: 'info',
              session: 'perf-trace',
              message: `[UmbraPerfTrace] ${message}`,
            },
          ],
        };
        const nav = navigator as Navigator & { sendBeacon?: (url: string, data?: BodyInit | null) => boolean };
        if (typeof nav.sendBeacon === 'function') {
          const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
          nav.sendBeacon('/api/debug/log', blob);
        } else {
          void fetch('/api/debug/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}

      longTaskCountRef.current = 0;
      longTaskMaxMsRef.current = 0;
      lagMaxMsRef.current = 0;
      lagSumMsRef.current = 0;
      lagSamplesRef.current = 0;
    }, HEARTBEAT_MS);

    return () => {
      if (lagTimer != null) window.clearInterval(lagTimer);
      if (heartbeatTimer != null) window.clearInterval(heartbeatTimer);
      if (observer) observer.disconnect();
    };
  }, []);

  return null;
}
