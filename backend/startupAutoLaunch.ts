export interface StartupAutoLaunchTarget {
  key: string;
  label: string;
  launch: () => Promise<unknown>;
}

export interface StartupAutoLaunchResult {
  key: string;
  label: string;
  status: 'started' | 'failed';
  message: string;
}

function readLaunchResult(value: unknown): { success: boolean; message: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: true, message: 'Launch request completed.' };
  }
  const result = value as Record<string, unknown>;
  return {
    success: result.success !== false,
    message: String(result.error || result.message || '').trim(),
  };
}

export async function runConfiguredStartupAutoLaunches(
  appSettings: Record<string, unknown>,
  targets: StartupAutoLaunchTarget[],
): Promise<StartupAutoLaunchResult[]> {
  const results: StartupAutoLaunchResult[] = [];
  for (const target of targets) {
    if (appSettings[target.key] !== true) continue;
    try {
      const launchResult = readLaunchResult(await target.launch());
      results.push({
        key: target.key,
        label: target.label,
        status: launchResult.success ? 'started' : 'failed',
        message: launchResult.message || (launchResult.success ? 'Launch request accepted.' : 'Launch request failed.'),
      });
    } catch (error) {
      results.push({
        key: target.key,
        label: target.label,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
