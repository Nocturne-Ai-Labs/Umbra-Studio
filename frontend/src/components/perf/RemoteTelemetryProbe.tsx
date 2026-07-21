'use client';

import React from 'react';
import { IS_UMBRA_DEV_MODE } from '@/utils/devMode';

type RemoteTelemetryEvent = { at?: number } & (
  | {
      type: 'ping';
      clientSentAt: number;
      serverReceivedAt?: number;
      serverSentAt?: number;
      rttMs: number;
    }
  | {
      type: 'resource';
      name: string;
      initiatorType: string;
      durationMs: number;
      transferSize: number;
      encodedBodySize: number;
      decodedBodySize: number;
    }
  | {
      type: 'interaction';
      name: string;
      inputDelayMs: number;
      frameDelayMs: number;
    }
  | {
      type: 'longtask';
      durationMs: number;
    }
);

const FLUSH_INTERVAL_MS = 5_000;
const PING_INTERVAL_MS = 4_000;
const MAX_BATCH_SIZE = 80;

function getRemoteTelemetryClientId(): string {
  const key = 'umbra.remoteTelemetry.clientId';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return `rt-volatile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getRemoteMode(): string {
  try {
    return document.documentElement.dataset.umbraRemoteMode
      || new URLSearchParams(window.location.search).get('remoteMode')
      || 'desktop';
  } catch {
    return 'desktop';
  }
}

function getClientLabel(): string {
  const ua = navigator.userAgent || '';
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows Browser';
  if (/macintosh|mac os/i.test(ua)) return 'Mac Browser';
  if (/linux/i.test(ua)) return 'Linux Browser';
  return 'Browser';
}

function isInterestingResource(entry: PerformanceResourceTiming): boolean {
  const name = entry.name || '';
  if (!name || name.includes('/api/remote/metrics')) return false;
  if (!name.startsWith(window.location.origin)) return false;
  if (entry.duration >= 250) return true;
  if ((entry.transferSize || entry.encodedBodySize || 0) >= 96 * 1024) return true;
  return /\/api\/|\/comfy\/|\/view|thumbnail|media|image|gallery|assets\//i.test(name);
}

export function RemoteTelemetryProbe() {
  const clientIdRef = React.useRef('');
  const queueRef = React.useRef<RemoteTelemetryEvent[]>([]);
  const flushingRef = React.useRef(false);

  React.useEffect(() => {
    if (!IS_UMBRA_DEV_MODE) return;
    if (typeof window === 'undefined') return;
    clientIdRef.current = getRemoteTelemetryClientId();

    const enqueue = (event: RemoteTelemetryEvent) => {
      queueRef.current.push({ ...event, at: Date.now() });
      if (queueRef.current.length > MAX_BATCH_SIZE * 2) {
        queueRef.current.splice(0, queueRef.current.length - MAX_BATCH_SIZE);
      }
    };

    const flush = async (useBeacon = false) => {
      if (flushingRef.current) return;
      const events = queueRef.current.splice(0, MAX_BATCH_SIZE);
      if (events.length === 0) return;
      const payload = {
        clientId: clientIdRef.current,
        clientLabel: getClientLabel(),
        mode: getRemoteMode(),
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
        events,
      };
      const body = JSON.stringify(payload);
      if (useBeacon && navigator.sendBeacon) {
        const ok = navigator.sendBeacon('/api/remote/metrics', new Blob([body], { type: 'application/json' }));
        if (ok) return;
      }
      flushingRef.current = true;
      try {
        await fetch('/api/remote/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: body.length < 60_000,
        });
      } catch {
        queueRef.current.unshift(...events.slice(-MAX_BATCH_SIZE));
      } finally {
        flushingRef.current = false;
      }
    };

    const ping = async () => {
      const clientSentAt = Date.now();
      const startedAt = performance.now();
      try {
        const response = await fetch(`/api/remote/metrics/ping?clientId=${encodeURIComponent(clientIdRef.current)}&sentAt=${clientSentAt}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({} as { serverReceivedAt?: number; serverSentAt?: number }));
        enqueue({
          type: 'ping',
          clientSentAt,
          serverReceivedAt: Number(payload.serverReceivedAt || 0),
          serverSentAt: Number(payload.serverSentAt || 0),
          rttMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      } catch {
        enqueue({
          type: 'ping',
          clientSentAt,
          rttMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      }
    };

    const interactionHandler = (event: Event) => {
      const inputDelayMs = Math.max(0, performance.now() - Number(event.timeStamp || performance.now()));
      const name = event.type;
      window.requestAnimationFrame(() => {
        enqueue({
          type: 'interaction',
          name,
          inputDelayMs: Math.round(inputDelayMs * 10) / 10,
          frameDelayMs: Math.max(0, Math.round((performance.now() - Number(event.timeStamp || performance.now())) * 10) / 10),
        });
      });
    };

    const resourceObserver = typeof PerformanceObserver !== 'undefined'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const resource = entry as PerformanceResourceTiming;
          if (!isInterestingResource(resource)) continue;
          enqueue({
            type: 'resource',
            name: resource.name.replace(window.location.origin, ''),
            initiatorType: resource.initiatorType || 'unknown',
            durationMs: Math.max(0, Math.round(resource.duration)),
            transferSize: Math.max(0, Math.round(resource.transferSize || 0)),
            encodedBodySize: Math.max(0, Math.round(resource.encodedBodySize || 0)),
            decodedBodySize: Math.max(0, Math.round(resource.decodedBodySize || 0)),
          });
        }
      })
      : null;

    const longTaskObserver = typeof PerformanceObserver !== 'undefined'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          enqueue({ type: 'longtask', durationMs: Math.max(0, Math.round(entry.duration)) });
        }
      })
      : null;

    try {
      resourceObserver?.observe({ type: 'resource', buffered: true });
    } catch {
      resourceObserver?.observe({ entryTypes: ['resource'] });
    }
    try {
      longTaskObserver?.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long task timing is not available in every browser.
    }

    window.addEventListener('pointerdown', interactionHandler, { passive: true, capture: true });
    window.addEventListener('click', interactionHandler, { passive: true, capture: true });
    window.addEventListener('keydown', interactionHandler, { passive: true, capture: true });
    const flushTimer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    const pingTimer = window.setInterval(() => void ping(), PING_INTERVAL_MS);
    void ping();

    const visibilityHandler = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.clearInterval(flushTimer);
      window.clearInterval(pingTimer);
      window.removeEventListener('pointerdown', interactionHandler, { capture: true });
      window.removeEventListener('click', interactionHandler, { capture: true });
      window.removeEventListener('keydown', interactionHandler, { capture: true });
      document.removeEventListener('visibilitychange', visibilityHandler);
      resourceObserver?.disconnect();
      longTaskObserver?.disconnect();
      void flush(true);
    };
  }, []);

  return null;
}

export default RemoteTelemetryProbe;
