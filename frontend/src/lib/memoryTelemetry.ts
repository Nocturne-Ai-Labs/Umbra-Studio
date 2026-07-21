const MEMORY_HISTORY_LIMIT = 180;

type ChromiumPerformanceMemory = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

function bytesToMb(value: number | undefined): number {
  if (!Number.isFinite(value || 0) || !value || value <= 0) return 0;
  return value / (1024 * 1024);
}

function roundMb(value: number | undefined | null): number {
  if (!Number.isFinite(value || 0) || !value) return 0;
  return Math.round(value * 10) / 10;
}

export function formatMemoryMb(value: number | undefined | null): string {
  if (!Number.isFinite(value || 0) || !value) return '0MB';
  if (value >= 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)}GB`;
  return `${Math.round(value)}MB`;
}

export function sampleRendererMemory(activeWorkspace: string): UmbraRendererMemorySample {
  const perfMemory = (performance as Performance & { memory?: ChromiumPerformanceMemory }).memory;
  const usedMb = bytesToMb(perfMemory?.usedJSHeapSize);
  const totalMb = bytesToMb(perfMemory?.totalJSHeapSize);
  const limitMb = bytesToMb(perfMemory?.jsHeapSizeLimit);
  const images = Array.from(document.images || []);

  return {
    timestamp: new Date().toISOString(),
    url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    activeWorkspace,
    visibilityState: document.visibilityState,
    heap: perfMemory
      ? {
          usedMb: roundMb(usedMb),
          totalMb: roundMb(totalMb),
          limitMb: roundMb(limitMb),
          usedPercent: limitMb > 0 ? Math.round((usedMb / limitMb) * 1000) / 10 : 0,
        }
      : undefined,
    dom: {
      nodes: document.querySelectorAll('*').length,
      elements: document.getElementsByTagName('*').length,
      images: images.length,
      loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      videos: document.querySelectorAll('video').length,
      canvases: document.querySelectorAll('canvas').length,
      iframes: document.querySelectorAll('iframe').length,
    },
  };
}

function installTelemetryDebugGlobal() {
  if (!window.__UMBRA_MEMORY_TELEMETRY__) {
    window.__UMBRA_MEMORY_TELEMETRY__ = {
      latest: null,
      history: [],
      logPath: null,
    };
  }
  return window.__UMBRA_MEMORY_TELEMETRY__;
}

export async function collectMemoryTelemetry(activeWorkspace: string): Promise<UmbraMemoryTelemetry | null> {
  const rendererSample = sampleRendererMemory(activeWorkspace);
  const bridge = window.umbraDesktop?.collectMemoryTelemetry;
  const telemetry = bridge
    ? await bridge(rendererSample)
    : {
        timestamp: rendererSample.timestamp,
        renderer: rendererSample,
        logPath: null,
      };

  if (!telemetry) return null;

  const debugGlobal = installTelemetryDebugGlobal();
  debugGlobal.latest = telemetry;
  debugGlobal.logPath = telemetry.logPath || debugGlobal.logPath || null;
  debugGlobal.history.push(telemetry);
  if (debugGlobal.history.length > MEMORY_HISTORY_LIMIT) {
    debugGlobal.history.splice(0, debugGlobal.history.length - MEMORY_HISTORY_LIMIT);
  }

  try { localStorage.removeItem('umbra.memoryTelemetry.trace'); } catch {}
  const traceEnabled = false;
  if (traceEnabled) {
    console.info('[UmbraMemoryTelemetry]', telemetry);
  }

  return telemetry;
}
