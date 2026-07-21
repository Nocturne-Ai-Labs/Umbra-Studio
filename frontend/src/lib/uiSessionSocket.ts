import type { UserConfigKey } from './userConfig';

export type UiSessionSocketKey = Extract<
  UserConfigKey,
  'remote-ui-session' | 'gallery-ui-session' | 'powerprompter-ui'
>;

export type UiSessionSocketEvent =
  | {
      type: 'ui_session_state';
      sessions?: Partial<Record<UiSessionSocketKey, unknown>>;
      updatedAt?: number;
    }
  | {
      type: 'ui_session_update';
      key?: UiSessionSocketKey;
      value?: unknown;
      updatedAt?: number;
    };

type UiSessionSocketListener = (event: UiSessionSocketEvent) => void;

const listeners = new Set<UiSessionSocketListener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;

function getUiSessionSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/ui-session`;
}

function emitUiSessionEvent(event: UiSessionSocketEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('[uiSessionSocket] Listener failed:', error);
    }
  }
}

function scheduleReconnect() {
  if (typeof window === 'undefined' || reconnectTimer !== null || listeners.size === 0) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectUiSessionSocket();
  }, 3000);
}

function connectUiSessionSocket() {
  if (typeof window === 'undefined') return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  try {
    socket = new WebSocket(getUiSessionSocketUrl());
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        if (payload?.type === 'ui_session_state' || payload?.type === 'ui_session_update') {
          emitUiSessionEvent(payload as UiSessionSocketEvent);
        }
      } catch {
        // Ignore malformed session payloads.
      }
    };
    socket.onclose = () => {
      socket = null;
      scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        socket = null;
        scheduleReconnect();
      }
    };
  } catch {
    socket = null;
    scheduleReconnect();
  }
}

export function subscribeUiSession(listener: UiSessionSocketListener): () => void {
  if (typeof window === 'undefined') return () => undefined;
  listeners.add(listener);
  connectUiSessionSocket();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && socket) {
      try {
        socket.close();
      } catch {
        // no-op
      }
      socket = null;
    }
  };
}
