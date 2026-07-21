import { assertUmbraHostOnlyAction } from './hostOnly';

export interface RevealResult {
  success: boolean;
  highlighted?: boolean;
  fullPath?: string;
}

export async function showInFileExplorer(path: string): Promise<RevealResult> {
  assertUmbraHostOnlyAction('Opening File Explorer');
  const response = await fetch('/api/fs/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // No JSON body; fall through to generic error handling.
  }

  if (!response.ok) {
    throw new Error(data?.error || `Failed to open file explorer (${response.status})`);
  }

  return data as RevealResult;
}
