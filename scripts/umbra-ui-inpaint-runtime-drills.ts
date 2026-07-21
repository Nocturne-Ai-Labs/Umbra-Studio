export type UmbraUiRuntimeJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'canceled';
export type UmbraUiRuntimeItemStatus = UmbraUiRuntimeJobStatus;

export interface UmbraUiRuntimeJobItem {
  id?: string;
  status?: UmbraUiRuntimeItemStatus | string;
  promptId?: string;
  outputs?: unknown[];
  error?: string;
}

export interface UmbraUiRuntimeJob {
  id?: string;
  status?: UmbraUiRuntimeJobStatus | string;
  total?: number;
  completed?: number;
  failed?: number;
  createdAt?: number;
  updatedAt?: number;
  items?: UmbraUiRuntimeJobItem[];
}

export interface UmbraUiRuntimeAssessment {
  ok: boolean;
  issues: string[];
}

export interface UmbraUiRuntimeOutputCheck {
  path: string;
  mediaReachable: boolean;
  metadataReachable: boolean;
}

export interface UmbraUiRestartRuntimeEvidence {
  restartPoint?: 'active' | 'terminal';
  initialJob: UmbraUiRuntimeJob;
  observedRunningPromptIds: string[];
  observedQueuedPromptIds: string[];
}

export interface UmbraUiPowerPrompterRuntimePrompt {
  promptIndex?: number;
  status?: string;
  promptId?: string;
}

export interface UmbraUiPowerPrompterRuntimeRequest {
  requestId?: string;
  status?: string;
  total?: number;
  completed?: number;
  failed?: number;
  canceled?: number;
  prompts?: UmbraUiPowerPrompterRuntimePrompt[];
}

export interface UmbraUiUnmanagedComfyRuntimePrompt {
  promptId?: string;
  status?: string;
  outputCount?: number;
  mediaChecks?: UmbraUiRuntimeOutputCheck[];
}

export interface UmbraUiSharedQueueRuntimeEvidence {
  powerPrompterObservedBehindTarget: boolean;
  unmanagedObservedBehindTarget: boolean;
  powerPrompter: UmbraUiPowerPrompterRuntimeRequest;
  unmanaged: UmbraUiUnmanagedComfyRuntimePrompt;
}

const TERMINAL_JOB_STATUSES = new Set(['completed', 'partial', 'failed', 'canceled']);
const ACTIVE_ITEM_STATUSES = new Set(['staging', 'queued', 'running']);

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function itemsOf(job: UmbraUiRuntimeJob | null | undefined): UmbraUiRuntimeJobItem[] {
  return Array.isArray(job?.items) ? job.items : [];
}

function promptIdsOf(job: UmbraUiRuntimeJob | null | undefined): Set<string> {
  return new Set(itemsOf(job).map((item) => String(item.promptId || '').trim()).filter(Boolean));
}

function promptIdListOf(job: UmbraUiRuntimeJob | null | undefined): string[] {
  return itemsOf(job).map((item) => String(item.promptId || '').trim()).filter(Boolean);
}

function normalizedPromptIdList(values: unknown): string[] {
  return (Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean);
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates).sort();
}

function sameStringMultiset(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function assessCancellationTarget(
  targetBeforeCancel: UmbraUiRuntimeJob,
  targetAfterCancel: UmbraUiRuntimeJob,
): string[] {
  const issues: string[] = [];
  const targetBeforeStatus = normalizeStatus(targetBeforeCancel.status);
  if (isUmbraUiRuntimeJobTerminal(targetBeforeCancel)) {
    issues.push(`The cancellation target reached terminal status ${targetBeforeStatus || '(missing)'} before cancellation.`);
  }
  if (targetBeforeStatus !== 'running' && !itemsOf(targetBeforeCancel).some((item) => normalizeStatus(item.status) === 'running')) {
    issues.push('The cancellation target was not observed running, so interrupt ownership was not physically exercised.');
  }
  if (normalizeStatus(targetAfterCancel.status) !== 'canceled') {
    issues.push(`The cancellation target ended as ${normalizeStatus(targetAfterCancel.status) || '(missing)'} instead of canceled.`);
  }
  const activeTargetItems = itemsOf(targetAfterCancel).filter((item) => ACTIVE_ITEM_STATUSES.has(normalizeStatus(item.status)));
  if (activeTargetItems.length > 0) {
    issues.push(`${activeTargetItems.length} cancellation-target item(s) remained active after cancellation.`);
  }
  if (promptIdsOf(targetBeforeCancel).size <= 0) {
    issues.push('The cancellation target did not expose a Comfy prompt id.');
  }
  return issues;
}

export function isUmbraUiRuntimeJobTerminal(job: UmbraUiRuntimeJob | null | undefined): boolean {
  return TERMINAL_JOB_STATUSES.has(normalizeStatus(job?.status));
}

export function countUmbraUiRuntimeOutputs(job: UmbraUiRuntimeJob | null | undefined): number {
  return itemsOf(job).reduce((total, item) => total + (Array.isArray(item.outputs) ? item.outputs.length : 0), 0);
}

export function assessUmbraUiCancelIsolation(
  targetBeforeCancel: UmbraUiRuntimeJob,
  targetAfterCancel: UmbraUiRuntimeJob,
  survivorAfterCancel: UmbraUiRuntimeJob,
): UmbraUiRuntimeAssessment {
  const issues = assessCancellationTarget(targetBeforeCancel, targetAfterCancel);

  const survivorStatus = normalizeStatus(survivorAfterCancel.status);
  if (survivorStatus !== 'completed') {
    issues.push(`The survivor job ended as ${survivorStatus || '(missing)'} instead of completed.`);
  }
  const survivorTotal = Math.max(0, Math.round(Number(survivorAfterCancel.total) || itemsOf(survivorAfterCancel).length));
  const survivorCompleted = Math.max(0, Math.round(Number(survivorAfterCancel.completed) || 0));
  const survivorFailed = Math.max(0, Math.round(Number(survivorAfterCancel.failed) || 0));
  if (survivorTotal <= 0) issues.push('The survivor job did not report any items.');
  if (survivorCompleted !== survivorTotal) {
    issues.push(`The survivor completed ${survivorCompleted} of ${survivorTotal} item(s).`);
  }
  if (survivorFailed > 0) issues.push(`The survivor reported ${survivorFailed} failed item(s).`);
  const survivorOutputs = countUmbraUiRuntimeOutputs(survivorAfterCancel);
  if (survivorTotal > 0 && survivorOutputs < survivorTotal) {
    issues.push(`The survivor reported ${survivorOutputs} output(s) for ${survivorTotal} item(s).`);
  }

  const targetPromptIds = promptIdsOf(targetBeforeCancel);
  const survivorPromptIds = promptIdsOf(survivorAfterCancel);
  if (survivorPromptIds.size <= 0) issues.push('The survivor did not expose a Comfy prompt id.');
  const sharedPromptIds = Array.from(targetPromptIds).filter((promptId) => survivorPromptIds.has(promptId));
  if (sharedPromptIds.length > 0) issues.push('The target and survivor unexpectedly shared a Comfy prompt id.');

  return { ok: issues.length === 0, issues };
}

export function assessUmbraUiSharedQueueIsolation(
  targetBeforeCancel: UmbraUiRuntimeJob,
  targetAfterCancel: UmbraUiRuntimeJob,
  evidence: UmbraUiSharedQueueRuntimeEvidence,
): UmbraUiRuntimeAssessment {
  const issues = assessCancellationTarget(targetBeforeCancel, targetAfterCancel);
  if (!evidence.powerPrompterObservedBehindTarget) {
    issues.push('The Power Prompter prompt was not observed queued behind the running Canvas target.');
  }
  if (!evidence.unmanagedObservedBehindTarget) {
    issues.push('The unmanaged Comfy prompt was not observed queued behind the running Canvas target.');
  }

  const powerPrompter = evidence.powerPrompter || {};
  const powerPrompterStatus = normalizeStatus(powerPrompter.status);
  if (powerPrompterStatus !== 'completed') {
    issues.push(`The Power Prompter survivor ended as ${powerPrompterStatus || '(missing)'} instead of completed.`);
  }
  const powerPrompterPrompts = Array.isArray(powerPrompter.prompts) ? powerPrompter.prompts : [];
  const powerPrompterTotal = Math.max(0, Math.round(Number(powerPrompter.total) || powerPrompterPrompts.length));
  const powerPrompterCompleted = Math.max(0, Math.round(Number(powerPrompter.completed) || 0));
  const powerPrompterFailed = Math.max(0, Math.round(Number(powerPrompter.failed) || 0));
  const powerPrompterCanceled = Math.max(0, Math.round(Number(powerPrompter.canceled) || 0));
  if (powerPrompterTotal <= 0) issues.push('The Power Prompter survivor did not report any prompts.');
  if (powerPrompterCompleted !== powerPrompterTotal) {
    issues.push(`The Power Prompter survivor completed ${powerPrompterCompleted} of ${powerPrompterTotal} prompt(s).`);
  }
  if (powerPrompterFailed > 0) issues.push(`The Power Prompter survivor reported ${powerPrompterFailed} failed prompt(s).`);
  if (powerPrompterCanceled > 0) issues.push(`The Power Prompter survivor reported ${powerPrompterCanceled} canceled prompt(s).`);
  const powerPrompterPromptIds = new Set(powerPrompterPrompts
    .map((prompt) => String(prompt.promptId || '').trim())
    .filter(Boolean));
  if (powerPrompterPromptIds.size <= 0) issues.push('The Power Prompter survivor did not expose a Comfy prompt id.');

  const unmanaged = evidence.unmanaged || {};
  const unmanagedPromptId = String(unmanaged.promptId || '').trim();
  const unmanagedStatus = normalizeStatus(unmanaged.status);
  if (!['completed', 'success'].includes(unmanagedStatus)) {
    issues.push(`The unmanaged Comfy survivor ended as ${unmanagedStatus || '(missing)'} instead of success.`);
  }
  const unmanagedOutputCount = Math.max(0, Math.round(Number(unmanaged.outputCount) || 0));
  if (!unmanagedPromptId) issues.push('The unmanaged Comfy survivor did not expose a prompt id.');
  if (unmanagedOutputCount <= 0) issues.push('The unmanaged Comfy survivor did not report an output.');
  const unmanagedMediaChecks = Array.isArray(unmanaged.mediaChecks) ? unmanaged.mediaChecks : [];
  if (unmanagedMediaChecks.length !== unmanagedOutputCount) {
    issues.push(`Verified ${unmanagedMediaChecks.length} unmanaged output(s), but Comfy reported ${unmanagedOutputCount}.`);
  }
  for (const check of unmanagedMediaChecks) {
    if (!check.mediaReachable) issues.push(`Unmanaged survivor media could not be reloaded: ${check.path || '(missing path)'}.`);
  }

  const targetPromptIds = promptIdsOf(targetBeforeCancel);
  const sharedWithPowerPrompter = Array.from(targetPromptIds).filter((promptId) => powerPrompterPromptIds.has(promptId));
  if (sharedWithPowerPrompter.length > 0) issues.push('The Canvas target and Power Prompter survivor unexpectedly shared a Comfy prompt id.');
  if (unmanagedPromptId && targetPromptIds.has(unmanagedPromptId)) {
    issues.push('The Canvas target and unmanaged survivor unexpectedly shared a Comfy prompt id.');
  }
  if (unmanagedPromptId && powerPrompterPromptIds.has(unmanagedPromptId)) {
    issues.push('The Power Prompter and unmanaged survivors unexpectedly shared a Comfy prompt id.');
  }

  return { ok: issues.length === 0, issues: Array.from(new Set(issues)) };
}

export function assessUmbraUiRestartRecovery(
  expectedJobId: string,
  recoveredJob: UmbraUiRuntimeJob,
  outputChecks: UmbraUiRuntimeOutputCheck[],
  evidence?: UmbraUiRestartRuntimeEvidence,
): UmbraUiRuntimeAssessment {
  const issues: string[] = [];
  const actualJobId = String(recoveredJob.id || '').trim();
  if (!actualJobId || actualJobId !== String(expectedJobId || '').trim()) {
    issues.push(`Recovered job id ${actualJobId || '(missing)'} did not match ${expectedJobId || '(missing)'}.`);
  }
  const status = normalizeStatus(recoveredJob.status);
  if (status !== 'completed') issues.push(`The recovered job ended as ${status || '(missing)'} instead of completed.`);
  const total = Math.max(0, Math.round(Number(recoveredJob.total) || itemsOf(recoveredJob).length));
  const completed = Math.max(0, Math.round(Number(recoveredJob.completed) || 0));
  const failed = Math.max(0, Math.round(Number(recoveredJob.failed) || 0));
  if (total <= 0) issues.push('The recovered job did not report any items.');
  if (completed !== total) issues.push(`The recovered job completed ${completed} of ${total} item(s).`);
  if (failed > 0) issues.push(`The recovered job reported ${failed} failed item(s).`);
  const outputs = countUmbraUiRuntimeOutputs(recoveredJob);
  if (total > 0 && outputs < total) issues.push(`The recovered job reported ${outputs} output(s) for ${total} item(s).`);
  if (outputChecks.length !== outputs) {
    issues.push(`Verified ${outputChecks.length} reloaded output(s), but the recovered job reported ${outputs}.`);
  }
  for (const check of outputChecks) {
    if (!check.mediaReachable) issues.push(`Recovered media could not be reloaded: ${check.path || '(missing path)'}.`);
    if (!check.metadataReachable) issues.push(`Recovered metadata could not be reloaded: ${check.path || '(missing path)'}.`);
  }

  if (evidence) {
    const restartPoint = evidence.restartPoint || 'active';
    const initialJobId = String(evidence.initialJob?.id || '').trim();
    if (initialJobId !== String(expectedJobId || '').trim()) {
      issues.push(`Initial job id ${initialJobId || '(missing)'} did not match ${expectedJobId || '(missing)'}.`);
    }
    if (restartPoint === 'active' && isUmbraUiRuntimeJobTerminal(evidence.initialJob)) {
      issues.push('The restart was not prepared while the initial job was active.');
    }
    if (restartPoint === 'terminal' && normalizeStatus(evidence.initialJob.status) !== 'completed') {
      issues.push(`The terminal restart point was prepared from a ${normalizeStatus(evidence.initialJob.status) || '(missing)'} job instead of a completed job.`);
    }

    const initialPromptIds = promptIdListOf(evidence.initialJob);
    const recoveredPromptIds = promptIdListOf(recoveredJob);
    const runningPromptIds = normalizedPromptIdList(evidence.observedRunningPromptIds);
    const queuedPromptIds = normalizedPromptIdList(evidence.observedQueuedPromptIds);
    const initialDuplicates = duplicateValues(initialPromptIds);
    const recoveredDuplicates = duplicateValues(recoveredPromptIds);
    if (initialDuplicates.length > 0) {
      issues.push(`The initial job reused Comfy prompt id(s): ${initialDuplicates.join(', ')}.`);
    }
    if (recoveredDuplicates.length > 0) {
      issues.push(`The recovered job reused Comfy prompt id(s): ${recoveredDuplicates.join(', ')}.`);
    }
    if (restartPoint === 'active') {
      if (runningPromptIds.length <= 0) {
        issues.push('No owned running Comfy prompt was captured before restart.');
      }
      if (queuedPromptIds.length <= 0) {
        issues.push('No owned queued Comfy prompt was captured before restart.');
      }
      const observedOverlap = runningPromptIds.filter((promptId) => queuedPromptIds.includes(promptId));
      if (observedOverlap.length > 0) {
        issues.push(`Prompt id(s) were reported as both running and queued before restart: ${Array.from(new Set(observedOverlap)).join(', ')}.`);
      }
      const initialPromptIdSet = new Set(initialPromptIds);
      const unknownObservedIds = [...runningPromptIds, ...queuedPromptIds]
        .filter((promptId) => !initialPromptIdSet.has(promptId));
      if (unknownObservedIds.length > 0) {
        issues.push(`Observed queue prompt id(s) were not owned by the initial job: ${Array.from(new Set(unknownObservedIds)).join(', ')}.`);
      }
    }
    if (!sameStringMultiset(initialPromptIds, recoveredPromptIds)) {
      issues.push('Recovered Comfy prompt ids did not exactly match the initial job; a prompt may have been lost or resubmitted.');
    }
  }
  return { ok: issues.length === 0, issues: Array.from(new Set(issues)) };
}
