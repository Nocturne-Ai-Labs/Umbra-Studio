import { loadAppSettings } from '@/lib/appSettings';

export function isDiagnosticLoggingEnabled(): boolean {
  try {
    return loadAppSettings()['advanced.diagnosticLogging'] === true;
  } catch {
    return false;
  }
}

export function logDiagnostic(
  label: string,
  payload?: unknown,
  level: 'debug' | 'info' | 'log' | 'warn' | 'error' = 'debug',
): void {
  if (!isDiagnosticLoggingEnabled()) return;
  try {
    if (payload === undefined) {
      console[level](label);
    } else {
      console[level](label, payload);
    }
  } catch {
    // Diagnostics must never affect app behavior.
  }
}
