import { isDiagnosticLoggingEnabled } from '@/lib/diagnostics';

export function postPowerPrompterDiagnosticPayload(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (!isDiagnosticLoggingEnabled()) return;
  try {
    const body = JSON.stringify(payload);
    const nav = window.navigator as Navigator & { sendBeacon?: (url: string, data?: BodyInit | null) => boolean };
    if (typeof nav.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (nav.sendBeacon('/api/powerprompter/diagnostics-log', blob)) return;
    }
    void fetch('/api/powerprompter/diagnostics-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never disturb Power Prompter state.
  }
}

export function isPowerPrompterDiagnosticEnabled(): boolean {
  return isDiagnosticLoggingEnabled();
}

export function isImportantPowerPrompterDiagnosticEvent(event: string): boolean {
  return (
    event.includes(':error') ||
    event.includes(':slow') ||
    event.includes('httpFailed') ||
    event.includes('sendFailed') ||
    event.includes('requestTimeout') ||
    event.includes('stallDetected')
  );
}
