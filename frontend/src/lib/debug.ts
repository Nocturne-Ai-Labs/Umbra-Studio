/**
 * Consolidated Debug Logger
 * Provides logging utilities for file operations, canvas operations, and UmbraBridge
 */

import { useDebugStore } from '@/store/useDebugStore';
import { isDiagnosticLoggingEnabled, logDiagnostic } from '@/lib/diagnostics';

type FileOperation = 'import' | 'export' | 'upload' | 'delete' | 'save' | 'copy' | 'move' | 'rename';
type Backend = 'comfyui';

/**
 * Log file operations (import, export, upload, delete, etc.)
 */
export function logFileOperation(
  operation: FileOperation,
  file: { name: string; size?: number; type?: string; path?: string },
  result: 'success' | 'error',
  duration?: number
) {
  const debugStore = useDebugStore.getState();
  if (!debugStore.config.enabled || !debugStore.isRecording) return;

  debugStore.logEvent({
    category: 'network',
    type: 'file-operation',
    data: { operation, fileName: file.name, fileSize: file.size, fileType: file.type, filePath: file.path, result, duration },
  });
}

/**
 * Log canvas operations (draw, erase, fill, etc.)
 */
export function logCanvasOperation(operation: string, tool?: string, data?: any) {
  const debugStore = useDebugStore.getState();
  if (!debugStore.config.enabled || !debugStore.isRecording) return;

  debugStore.logEvent({
    category: 'render',
    type: 'canvas-operation',
    data: { operation, tool, ...data },
  });
}

/**
 * Log UmbraBridge operations (ComfyUI communication)
 */
export function logUmbraBridgeOperation(operation: string, backend: Backend, data: any) {
  const debugStore = useDebugStore.getState();
  if (!debugStore.config.enabled || !debugStore.isRecording) return;

  debugStore.logEvent({
    category: 'network',
    type: 'umbrabridge',
    data: { operation, backend, ...data },
  });
}

// API Debugger - intercepts fetch calls
let debugStore: any = null;

if (typeof window !== 'undefined' && isDiagnosticLoggingEnabled()) {
  const originalFetch = window.fetch;
  window.fetch = (async (...args: [RequestInfo | URL, RequestInit?]) => {
    const startTime = Date.now();
    const input = args[0];
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else if ('url' in input) url = input.url;
    const method = args[1]?.method || 'GET';

    try {
      const response = await originalFetch(...args);
      const duration = Date.now() - startTime;

      if (debugStore?.config.trackNetwork && debugStore?.isRecording) {
        debugStore.logEvent({
          category: 'network',
          type: 'fetch',
          data: { method, url, status: response.status, duration },
        });
      }
      return response;
    } catch (error) {
      if (debugStore?.config.trackNetwork && debugStore?.isRecording) {
        debugStore.logEvent({
          category: 'network',
          type: 'fetch-error',
          data: { method, url, error: (error as Error).message, duration: Date.now() - startTime },
        });
      }
      throw error;
    }
  }) as any;
}

export function initializeApiDebugger(store: any) {
  debugStore = store;
  logDiagnostic('[Debug] API debugger initialized', undefined, 'log');
}
