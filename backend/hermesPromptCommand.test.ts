import { describe, expect, test } from 'bun:test';
import {
  buildHermesPromptCommand,
  isMissingHermesPromptSession,
  parseHermesPromptSessionId,
} from './hermesPromptCommand';

describe('Hermes prompt command', () => {
  test('uses Hermes defaults when no override is selected', () => {
    expect(buildHermesPromptCommand('hermes', {}, 'make a prompt')).toEqual([
      'hermes',
      'chat',
      '--ignore-rules',
      '--source',
      'tool',
      '--no-restore-cwd',
      '--quiet',
      '--query',
      'make a prompt',
    ]);
  });

  test('applies provider, model, and the Umbra session only to this invocation', () => {
    expect(buildHermesPromptCommand('hermes', {
      hermesProvider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.6',
    }, 'make a prompt', '20260729_120000_umbra')).toEqual([
      'hermes',
      'chat',
      '--provider',
      'openrouter',
      '--model',
      'anthropic/claude-sonnet-4.6',
      '--ignore-rules',
      '--source',
      'tool',
      '--no-restore-cwd',
      '--quiet',
      '--resume',
      '20260729_120000_umbra',
      '--query',
      'make a prompt',
    ]);
  });

  test('reads the machine-readable session id without mixing it into the prompt', () => {
    expect(parseHermesPromptSessionId('\nsession_id: 20260729_120000_umbra\n')).toBe('20260729_120000_umbra');
    expect(parseHermesPromptSessionId('provider warning')).toBe('');
  });

  test('only treats missing resume targets as recoverable session failures', () => {
    expect(isMissingHermesPromptSession("Session 'old-id' not found.")).toBe(true);
    expect(isMissingHermesPromptSession('No session found matching Umbra.')).toBe(true);
    expect(isMissingHermesPromptSession('Provider authentication failed.')).toBe(false);
  });
});
