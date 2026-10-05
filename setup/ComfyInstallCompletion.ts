import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface BeginRecord { kind: 'begin'; token: string; full: boolean; legacyHash: string | null; requirementsHash: string | null }
interface CompleteRecord { kind: 'complete'; token: string; hash: string }
type CompletionRecord = BeginRecord | CompleteRecord | { kind: 'invalid' };
export interface ComfyInstallAttempt { path: string; token: string; canComplete: boolean }

// Keep ownership outside the source tree: version switching deletes that tree.
// One append is one record. A completion names its attempt; it never replaces
// another attempt's pending state, even across independent installer processes.
export const comfyCompletionJournalPath = (toolDir: string) => `${toolDir}.umbra-install-completion`;

function records(toolDir: string): CompletionRecord[] {
  const path = comfyCompletionJournalPath(toolDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => {
    try {
      const record = JSON.parse(line);
      const tokenValid = typeof record?.token === 'string' && record.token.length > 0;
      const beginValid = record?.kind === 'begin' && typeof record.full === 'boolean' &&
        (record.legacyHash === null || typeof record.legacyHash === 'string') &&
        (record.requirementsHash === null || typeof record.requirementsHash === 'string');
      const completeValid = record?.kind === 'complete' && typeof record.hash === 'string';
      if (tokenValid && (beginValid || completeValid)) return record as CompletionRecord;
    } catch { /* A torn append is incomplete proof. A subsequent full repair may recover. */ }
    return { kind: 'invalid' };
  });
}

function state(entries: CompletionRecord[], stopAt?: string) {
  let token: string | null = null;
  let hash: string | null = null;
  let canComplete = false;
  for (const record of entries) {
    if (record.kind === 'invalid') {
      token = '';
      hash = null;
      canComplete = false;
    } else if (record.kind === 'begin') {
      canComplete = record.full || (token === null ? record.legacyHash !== null : hash !== null && hash === record.requirementsHash);
      token = record.token;
      hash = null;
      if (token === stopAt) break;
    } else if (record.token === token && canComplete) {
      hash = record.hash;
    }
  }
  return { token, hash, canComplete };
}

export function beginComfyCompletion(toolDir: string, full = true): ComfyInstallAttempt {
  let legacyHash: string | null = null;
  let requirementsHash: string | null = null;
  if (!full) {
    try {
      const hash = Bun.hash(readFileSync(join(toolDir, 'requirements.txt'), 'utf8')).toString();
      requirementsHash = hash;
      if (readFileSync(join(toolDir, '.umbra-install-complete'), 'utf8').trim() === `v1:${hash}`) legacyHash = hash;
    } catch { /* Missing legacy proof cannot promote a partial repair. */ }
  }
  const token = crypto.randomUUID();
  if (!existsSync(dirname(toolDir))) mkdirSync(dirname(toolDir), { recursive: true });
  appendFileSync(comfyCompletionJournalPath(toolDir), '\n' + JSON.stringify({ kind: 'begin', token, full, legacyHash, requirementsHash }) + '\n');
  // Legacy markers are only invalidated. New completion authority is the journal.
  const legacyMarker = join(toolDir, '.umbra-install-complete');
  if (existsSync(legacyMarker)) writeFileSync(legacyMarker, `pending:${token}`);
  const current = state(records(toolDir), token);
  return { path: toolDir, token, canComplete: current.canComplete };
}

export function completeComfyCompletion(attempt: ComfyInstallAttempt): void {
  const { path, token, canComplete } = attempt;
  if (!canComplete) return;
  const hash = Bun.hash(readFileSync(join(path, 'requirements.txt'), 'utf8')).toString();
  if (readFileSync(join(path, '.requirements_installed'), 'utf8').trim() !== hash ||
    state(records(path)).token !== token) {
    throw new Error('ComfyUI final setup evidence changed; installation completion was not recorded.');
  }
  appendFileSync(comfyCompletionJournalPath(path), '\n' + JSON.stringify({ kind: 'complete', token, hash }) + '\n');
  if (state(records(path)).token !== token) {
    throw new Error('A newer ComfyUI setup attempt superseded this installation.');
  }
}

export function hasComfyCompletion(toolDir: string, hash: string): boolean {
  try {
    if (existsSync(comfyCompletionJournalPath(toolDir))) return state(records(toolDir)).hash === hash;
    return readFileSync(join(toolDir, '.umbra-install-complete'), 'utf8').trim() === `v1:${hash}`;
  } catch { return false; }
}
