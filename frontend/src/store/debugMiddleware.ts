import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import type { TelemetryEvent } from '@/types/debug';
import { logDiagnostic } from '@/lib/diagnostics';

type DebugMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name: string
) => StateCreator<T, Mps, Mcs>;

type DebugMiddlewareImpl = <T>(
  f: StateCreator<T, [], []>,
  name: string
) => StateCreator<T, [], []>;

// Event queue to batch state changes and prevent infinite loops
let eventQueue: TelemetryEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function queueEvent(event: TelemetryEvent) {
  eventQueue.push(event);

  // Flush queue after a short delay to batch events
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    if (eventQueue.length === 0) return;

    const eventsToFlush = [...eventQueue];
    eventQueue = [];

    // Use setTimeout to break out of the current call stack
    // This prevents "Maximum update depth exceeded" errors
    setTimeout(() => {
      if (typeof window !== 'undefined' && (window as any).useDebugStore) {
        const debugStore = (window as any).useDebugStore.getState();
        // Directly add to events array without triggering middleware
        eventsToFlush.forEach(event => {
          debugStore.events.push(event);
        });
        // Trim to maxEvents
        if (debugStore.events.length > debugStore.config.maxEvents) {
          debugStore.events = debugStore.events.slice(-debugStore.config.maxEvents);
        }
      }
    }, 0);
  }, 50); // Batch events every 50ms
}

const debugMiddlewareImpl: DebugMiddlewareImpl = (f, name) => (set, get, store) => {
  const debugSet: typeof set = (partial, replace) => {
    // CRITICAL: Never track the debug store itself to prevent infinite loops
    // Check this FIRST before doing anything else
    if (name === 'useDebugStore') {
      set(partial, replace as any);
      return;
    }

    const prevState = get();
    set(partial, replace as any);
    const nextState = get();

    // Queue state change event instead of logging immediately
    if (typeof window !== 'undefined' && (window as any).useDebugStore) {
      const debugStore = (window as any).useDebugStore.getState();
      if (debugStore.config.trackState && debugStore.isRecording) {
        queueEvent({
          category: 'state' as const,
          type: 'mutation',
          data: {
            store: name,
            action: typeof partial === 'function' ? 'function' : 'object',
            before: prevState,
            after: nextState,
            diff: calculateDiff(prevState, nextState),
          },
          id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        });
      }
    }
  };

  const result = f(debugSet, get, store);

  // Log store initialization
  logDiagnostic(`[Debug] Store initialized: ${name}`);

  return result;
};

function calculateDiff(before: any, after: any): Record<string, any> {
  const diff: Record<string, any> = {};

  for (const key in after) {
    if (before[key] !== after[key]) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }

  return diff;
}

export const debugMiddleware = debugMiddlewareImpl as unknown as DebugMiddleware;
