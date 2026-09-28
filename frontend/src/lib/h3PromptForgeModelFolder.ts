import { assertUmbraHostOnlyAction } from '@/utils/hostOnly';

export async function openH3PromptForgeModelFolder(): Promise<void> {
  assertUmbraHostOnlyAction('Opening the Prompt Forge model folder');
  const response = await fetch('/api/umbra-ui/h3-prompt-forge/model-folder/open', { method: 'POST' });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Failed to open the Prompt Forge model folder.');
}
