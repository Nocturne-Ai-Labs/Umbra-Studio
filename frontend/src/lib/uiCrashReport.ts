export const UI_CRASH_REPORT_KEY = 'umbra:last-ui-crash';

export interface UiCrashReport {
  schemaVersion: 1;
  timestamp: string;
  version: string;
  message: string;
  stack: string;
  componentStack: string;
}

function safeText(value: unknown, limit: number): string {
  try {
    return String(value || '').slice(0, limit)
      .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')
      .slice(0, limit);
  } catch { return 'Unavailable'; }
}

export function createUiCrashReport(error: Error, componentStack = '', version = ''): UiCrashReport {
  const field = (name: 'message' | 'stack') => { try { return error?.[name]; } catch { return 'Unavailable'; } };
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    version: safeText(version, 64),
    message: safeText(field('message'), 2048),
    stack: safeText(field('stack'), 16_384),
    componentStack: safeText(componentStack, 8192),
  };
}

/** One bounded record in this tab; no prompts, media, session export or upload. */
export function saveUiCrashReport(report: UiCrashReport): void {
  try { window.sessionStorage.setItem(UI_CRASH_REPORT_KEY, JSON.stringify(report)); }
  catch { /* Private browsing or a full store must never break the crash screen. */ }
}
