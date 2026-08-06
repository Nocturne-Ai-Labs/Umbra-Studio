export interface HermesPromptCommandSettings {
  hermesProvider?: string;
  model?: string;
  thinkingLevel?: string;
}

export function buildHermesPromptCommand(
  executable: string,
  settings: HermesPromptCommandSettings,
  agentRequest: string,
  sessionId = '',
): string[] {
  const args = [executable, 'chat'];
  const provider = String(settings.hermesProvider || '').trim();
  const model = String(settings.model || '').trim();
  const thinkingLevel = String(settings.thinkingLevel || '').trim().toLowerCase();
  if (provider) args.push('--provider', provider);
  if (model) args.push('--model', model);
  if (thinkingLevel) args.push('--reasoning', thinkingLevel);
  args.push(
    '--ignore-rules',
    '--source',
    'tool',
    '--no-restore-cwd',
    '--quiet',
  );
  const normalizedSessionId = String(sessionId || '').trim();
  if (normalizedSessionId) args.push('--resume', normalizedSessionId);
  args.push('--query', agentRequest);
  return args;
}

export function parseHermesPromptSessionId(stderr: string): string {
  return String(stderr || '')
    .match(/(?:^|\n)\s*session_id:\s*([a-z0-9._-]{4,200})\s*(?:\n|$)/i)?.[1]
    ?.trim() || '';
}

export function isMissingHermesPromptSession(stderr: string): boolean {
  return /\b(?:session\b.+\bnot found|no session found)\b/i.test(String(stderr || ''));
}
