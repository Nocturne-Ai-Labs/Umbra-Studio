import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildForm,
  type QualificationCase,
  type QualificationManifest,
} from './qualify-umbra-ui-inpaint';
import {
  formatUmbraUiInpaintPreflightIssue,
  preflightUmbraUiInpaintQualification,
} from './umbra-ui-inpaint-preflight';
import {
  assessUmbraUiCancelIsolation,
  assessUmbraUiRestartRecovery,
  assessUmbraUiSharedQueueIsolation,
  isUmbraUiRuntimeJobTerminal,
  type UmbraUiPowerPrompterRuntimeRequest,
  type UmbraUiRestartRuntimeEvidence,
  type UmbraUiRuntimeAssessment,
  type UmbraUiRuntimeJob,
  type UmbraUiRuntimeOutputCheck,
  type UmbraUiUnmanagedComfyRuntimePrompt,
} from './umbra-ui-inpaint-runtime-drills';

type RuntimeDrill = 'cancel-isolation' | 'partial-failure' | 'shared-queue-isolation' | 'restart-prepare' | 'restart-resume';

export interface UmbraUiPartialFailureRuntimeEvidence {
  initialJob: UmbraUiRuntimeJob;
  observedRunningPromptIds: string[];
  observedQueuedPromptIds: string[];
  deleteRequestedPromptIds: string[];
  deleteResponseStatus: number;
  postDeleteRunningPromptIds: string[];
  postDeleteQueuedPromptIds: string[];
  deletedPromptHistoryPresent: boolean;
  removalConfirmations: number;
}

interface RuntimeDrillState {
  schemaVersion: 2;
  drill: 'restart';
  restartPoint: 'active' | 'terminal';
  manifestPath: string;
  caseId: string;
  baseUrl: string;
  jobId: string;
  workflowId: string;
  preparedAt: string;
  preparedServerStartedAt: number;
  preparedServerUptimeMs: number;
  observedRunningPromptIds: string[];
  observedQueuedPromptIds: string[];
  initialJob: UmbraUiRuntimeJob;
  timings: {
    submitMs: number;
    submittedToRestartPointMs: number;
  };
}

interface PowerPrompterBackendDebug {
  queuedWork?: Array<{ requestId?: string }>;
  activeTasks?: Array<{ requestId?: string }>;
  controller?: {
    requests?: UmbraUiPowerPrompterRuntimeRequest[];
  };
}

interface SharedQueueWorkflowGraphNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

type SharedQueueWorkflowGraph = Record<string, SharedQueueWorkflowGraphNode>;

interface ComfyHistoryEntry {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
  outputs?: Record<string, {
    images?: Array<{ filename?: string; subfolder?: string; type?: string; fullpath?: string }>;
    gifs?: Array<{ filename?: string; subfolder?: string; type?: string; fullpath?: string }>;
  }>;
}

const DEFAULT_SHARED_QUEUE_WORKFLOW_ID = '[Umbra UI] Illustrious XL Image Pipeline';
const DEFAULT_SHARED_QUEUE_WORKFLOW_PATH = 'defaults/PowerPrompter/API Workflows/[Umbra UI] Illustrious XL Image Pipeline.json';

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'canceled']);

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]');
  } catch {
    return false;
  }
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `${response.status} ${response.statusText}`));
  }
  return payload;
}

function queuePromptIds(payload: any, key: 'queue_running' | 'queue_pending'): Set<string> {
  const ids = new Set<string>();
  const entries = Array.isArray(payload?.[key]) ? payload[key] : [];
  for (const entry of entries) {
    const promptId = String(Array.isArray(entry) ? entry[1] : entry?.prompt_id || entry?.promptId || '').trim();
    if (promptId) ids.add(promptId);
  }
  return ids;
}

function powerPrompterRequestFromDebug(payload: PowerPrompterBackendDebug, requestId: string): UmbraUiPowerPrompterRuntimeRequest | null {
  const requests = Array.isArray(payload?.controller?.requests) ? payload.controller.requests : [];
  return requests.find((request) => String(request.requestId || '').trim() === requestId) || null;
}

function powerPrompterPromptIds(request: UmbraUiPowerPrompterRuntimeRequest | null | undefined): string[] {
  return (Array.isArray(request?.prompts) ? request.prompts : [])
    .map((prompt) => String(prompt.promptId || '').trim())
    .filter(Boolean);
}

function terminalPowerPrompterStatus(value: unknown): boolean {
  return ['completed', 'failed', 'canceled', 'interrupted'].includes(String(value || '').trim().toLowerCase());
}

function normalizedStringList(values: unknown): string[] {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function duplicateStringValues(values: string[]): string[] {
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

function runtimeJobItems(job: UmbraUiRuntimeJob | null | undefined): NonNullable<UmbraUiRuntimeJob['items']> {
  return Array.isArray(job?.items) ? job.items : [];
}

function partialFailurePromptIdentityIssues(
  expectedJobId: string,
  initialJob: UmbraUiRuntimeJob,
  observedJob: UmbraUiRuntimeJob,
): string[] {
  const issues: string[] = [];
  const expectedId = String(expectedJobId || '').trim();
  const initialJobId = String(initialJob?.id || '').trim();
  const observedJobId = String(observedJob?.id || '').trim();
  if (!expectedId || initialJobId !== expectedId) {
    issues.push(`Initial partial-failure job id ${initialJobId || '(missing)'} did not match ${expectedId || '(missing)'}.`);
  }
  if (!expectedId || observedJobId !== expectedId) {
    issues.push(`Observed partial-failure job id ${observedJobId || '(missing)'} did not match ${expectedId || '(missing)'}.`);
  }

  const initialItems = runtimeJobItems(initialJob);
  const observedItems = runtimeJobItems(observedJob);
  if (initialItems.length !== 2) issues.push(`The initial partial-failure job reported ${initialItems.length} item(s) instead of 2.`);
  if (observedItems.length !== 2) issues.push(`The observed partial-failure job reported ${observedItems.length} item(s) instead of 2.`);

  const initialItemIds = normalizedStringList(initialItems.map((item) => item.id));
  const observedItemIds = normalizedStringList(observedItems.map((item) => item.id));
  const initialPromptIds = normalizedStringList(initialItems.map((item) => item.promptId));
  const observedPromptIds = normalizedStringList(observedItems.map((item) => item.promptId));
  if (initialItemIds.length !== initialItems.length) issues.push('The initial partial-failure job did not expose every item id.');
  if (observedItemIds.length !== observedItems.length) issues.push('The observed partial-failure job did not expose every item id.');
  if (initialPromptIds.length !== initialItems.length) issues.push('The initial partial-failure job did not expose every Comfy prompt id.');
  if (observedPromptIds.length !== observedItems.length) issues.push('The observed partial-failure job did not expose every Comfy prompt id.');

  const initialDuplicateItemIds = duplicateStringValues(initialItemIds);
  const observedDuplicateItemIds = duplicateStringValues(observedItemIds);
  const initialDuplicatePromptIds = duplicateStringValues(initialPromptIds);
  const observedDuplicatePromptIds = duplicateStringValues(observedPromptIds);
  if (initialDuplicateItemIds.length > 0) issues.push(`The initial partial-failure job reused item id(s): ${initialDuplicateItemIds.join(', ')}.`);
  if (observedDuplicateItemIds.length > 0) issues.push(`The observed partial-failure job reused item id(s): ${observedDuplicateItemIds.join(', ')}.`);
  if (initialDuplicatePromptIds.length > 0) issues.push(`The initial partial-failure job reused Comfy prompt id(s): ${initialDuplicatePromptIds.join(', ')}.`);
  if (observedDuplicatePromptIds.length > 0) issues.push(`The observed partial-failure job reused Comfy prompt id(s): ${observedDuplicatePromptIds.join(', ')}.`);

  if (!sameStringMultiset(initialItemIds, observedItemIds)) {
    issues.push('Partial-failure item ids changed while the job was active.');
  }
  if (!sameStringMultiset(initialPromptIds, observedPromptIds)) {
    issues.push('Partial-failure Comfy prompt ids changed; a sample may have been resubmitted or substituted.');
  }
  if (
    initialItemIds.length === initialItems.length
    && observedItemIds.length === observedItems.length
    && initialDuplicateItemIds.length === 0
    && observedDuplicateItemIds.length === 0
  ) {
    const observedByItemId = new Map(observedItems.map((item) => [String(item.id || '').trim(), item]));
    for (const initialItem of initialItems) {
      const itemId = String(initialItem.id || '').trim();
      const observedItem = observedByItemId.get(itemId);
      if (!observedItem) continue;
      const initialPromptId = String(initialItem.promptId || '').trim();
      const observedPromptId = String(observedItem.promptId || '').trim();
      if (initialPromptId !== observedPromptId) {
        issues.push(`Partial-failure item ${itemId} changed Comfy prompt id from ${initialPromptId || '(missing)'} to ${observedPromptId || '(missing)'}.`);
      }
    }
  }
  return issues;
}

export function assessUmbraUiPartialFailure(
  expectedJobId: string,
  terminalJob: UmbraUiRuntimeJob,
  outputChecks: UmbraUiRuntimeOutputCheck[],
  evidence: UmbraUiPartialFailureRuntimeEvidence,
): UmbraUiRuntimeAssessment {
  const evidenceValue = (evidence || {}) as UmbraUiPartialFailureRuntimeEvidence;
  const initialJob = evidenceValue.initialJob || {};
  const issues = partialFailurePromptIdentityIssues(expectedJobId, initialJob, terminalJob);
  const initialItems = runtimeJobItems(initialJob);
  const terminalItems = runtimeJobItems(terminalJob);

  if (Number(initialJob.total) !== 2) {
    issues.push(`The initial partial-failure job reported total=${String(initialJob.total ?? '(missing)')} instead of 2.`);
  }
  const initialStatus = String(initialJob.status || '').trim().toLowerCase();
  if (isUmbraUiRuntimeJobTerminal(initialJob)) {
    issues.push(`The partial-failure job reached terminal status ${initialStatus || '(missing)'} before queue ownership was captured.`);
  }

  const terminalStatus = String(terminalJob?.status || '').trim().toLowerCase();
  if (terminalStatus !== 'partial') {
    issues.push(`The partial-failure job ended as ${terminalStatus || '(missing)'} instead of partial.`);
  }
  if (Number(terminalJob?.total) !== 2) {
    issues.push(`The partial-failure job reported total=${String(terminalJob?.total ?? '(missing)')} instead of 2.`);
  }
  if (Number(terminalJob?.completed) !== 1) {
    issues.push(`The partial-failure job reported completed=${String(terminalJob?.completed ?? '(missing)')} instead of 1.`);
  }
  if (Number(terminalJob?.failed) !== 1) {
    issues.push(`The partial-failure job reported failed=${String(terminalJob?.failed ?? '(missing)')} instead of 1.`);
  }

  const rawEvidence = evidenceValue as any;
  const hasRunningEvidence = Array.isArray(rawEvidence.observedRunningPromptIds);
  const hasQueuedEvidence = Array.isArray(rawEvidence.observedQueuedPromptIds);
  const runningPromptIds = normalizedStringList(evidenceValue.observedRunningPromptIds);
  const queuedPromptIds = normalizedStringList(evidenceValue.observedQueuedPromptIds);
  if (!hasRunningEvidence || runningPromptIds.length !== 1) {
    issues.push(`Queue ownership evidence reported ${runningPromptIds.length} owned running prompt id(s) instead of 1.`);
  }
  if (!hasQueuedEvidence || queuedPromptIds.length !== 1) {
    issues.push(`Queue ownership evidence reported ${queuedPromptIds.length} owned queued prompt id(s) instead of 1.`);
  }
  const duplicateObservedPromptIds = duplicateStringValues([...runningPromptIds, ...queuedPromptIds]);
  if (duplicateObservedPromptIds.length > 0) {
    issues.push(`Queue ownership evidence reused prompt id(s): ${duplicateObservedPromptIds.join(', ')}.`);
  }
  const initialPromptIds = normalizedStringList(initialItems.map((item) => item.promptId));
  if (!sameStringMultiset([...runningPromptIds, ...queuedPromptIds], initialPromptIds)) {
    issues.push('Running and queued ownership evidence did not exactly cover the initial job prompt ids.');
  }

  const hasDeleteEvidence = Array.isArray(rawEvidence.deleteRequestedPromptIds);
  const deleteRequestedPromptIds = normalizedStringList(evidenceValue.deleteRequestedPromptIds);
  if (!hasDeleteEvidence || deleteRequestedPromptIds.length !== 1) {
    issues.push(`The Comfy queue delete requested ${deleteRequestedPromptIds.length} prompt id(s) instead of exactly 1.`);
  }
  if (queuedPromptIds.length === 1 && deleteRequestedPromptIds[0] !== queuedPromptIds[0]) {
    issues.push('The Comfy queue delete did not target the exact owned queued prompt id.');
  }
  if (!Number.isInteger(evidenceValue.deleteResponseStatus) || evidenceValue.deleteResponseStatus < 200 || evidenceValue.deleteResponseStatus >= 300) {
    issues.push(`The Comfy queue delete did not return a successful proxy status (${String(evidenceValue.deleteResponseStatus ?? '(missing)')}).`);
  }

  const hasPostDeleteRunningEvidence = Array.isArray(rawEvidence.postDeleteRunningPromptIds);
  const hasPostDeleteQueuedEvidence = Array.isArray(rawEvidence.postDeleteQueuedPromptIds);
  const postDeleteRunningPromptIds = normalizedStringList(evidenceValue.postDeleteRunningPromptIds);
  const postDeleteQueuedPromptIds = normalizedStringList(evidenceValue.postDeleteQueuedPromptIds);
  if (!hasPostDeleteRunningEvidence || !hasPostDeleteQueuedEvidence) {
    issues.push('Post-delete Comfy queue evidence is missing.');
  }
  const deletedPromptId = deleteRequestedPromptIds.length === 1 ? deleteRequestedPromptIds[0] : '';
  if (deletedPromptId && [...postDeleteRunningPromptIds, ...postDeleteQueuedPromptIds].includes(deletedPromptId)) {
    issues.push(`Deleted prompt ${deletedPromptId} remained in Comfy's active queue.`);
  }
  if (evidenceValue.deletedPromptHistoryPresent !== false) {
    issues.push('The deleted queued prompt appeared in Comfy history instead of remaining unexecuted.');
  }
  if (!Number.isInteger(evidenceValue.removalConfirmations) || evidenceValue.removalConfirmations < 2) {
    issues.push('The queued prompt removal was not confirmed by repeated queue and history reads.');
  }

  const completedItems = terminalItems.filter((item) => String(item.status || '').trim().toLowerCase() === 'completed');
  const failedItems = terminalItems.filter((item) => String(item.status || '').trim().toLowerCase() === 'failed');
  if (completedItems.length !== 1) issues.push(`The terminal job contained ${completedItems.length} completed item(s) instead of 1.`);
  if (failedItems.length !== 1) issues.push(`The terminal job contained ${failedItems.length} failed item(s) instead of 1.`);
  if (completedItems.length + failedItems.length !== terminalItems.length) {
    issues.push('The terminal partial-failure job retained a non-completed/non-failed item.');
  }

  const runningPromptId = runningPromptIds.length === 1 ? runningPromptIds[0] : '';
  const queuedPromptId = queuedPromptIds.length === 1 ? queuedPromptIds[0] : '';
  const terminalByPromptId = new Map(terminalItems.map((item) => [String(item.promptId || '').trim(), item]));
  const successfulItem = runningPromptId ? terminalByPromptId.get(runningPromptId) : undefined;
  const deliberatelyFailedItem = queuedPromptId ? terminalByPromptId.get(queuedPromptId) : undefined;
  if (runningPromptId && String(successfulItem?.status || '').trim().toLowerCase() !== 'completed') {
    issues.push('The sample observed running before deletion did not become the one completed item.');
  }
  if (queuedPromptId && String(deliberatelyFailedItem?.status || '').trim().toLowerCase() !== 'failed') {
    issues.push('The exact sample deleted while queued did not become the one failed item.');
  }
  if (queuedPromptId && !String(deliberatelyFailedItem?.error || '').includes(queuedPromptId)) {
    issues.push('The failed item error did not retain the exact deleted Comfy prompt id.');
  }
  if (deliberatelyFailedItem && (Array.isArray(deliberatelyFailedItem.outputs) ? deliberatelyFailedItem.outputs.length : 0) > 0) {
    issues.push('The deliberately deleted queued item unexpectedly reported an output.');
  }

  const successfulOutputs = successfulItem && Array.isArray(successfulItem.outputs) ? successfulItem.outputs : [];
  if (successfulOutputs.length <= 0) issues.push('The completed partial-failure item did not report an output.');
  const checks = Array.isArray(outputChecks) ? outputChecks : [];
  if (checks.length !== successfulOutputs.length) {
    issues.push(`Verified ${checks.length} successful output(s), but the completed item reported ${successfulOutputs.length}.`);
  }
  const expectedOutputPaths = successfulOutputs.map((output) => outputPath(output));
  const checkedOutputPaths = checks.map((check) => String(check.path || '').trim()).filter(Boolean);
  if (!sameStringMultiset(checkedOutputPaths, expectedOutputPaths)) {
    issues.push('Reloaded output paths did not exactly match the completed item outputs.');
  }
  const duplicateOutputPaths = duplicateStringValues(checkedOutputPaths);
  if (duplicateOutputPaths.length > 0) issues.push(`Reload evidence reused output path(s): ${duplicateOutputPaths.join(', ')}.`);
  for (const check of checks) {
    if (!String(check.path || '').trim()) issues.push('A successful output reload check did not identify its path.');
    if (!check.mediaReachable) issues.push(`Successful media could not be reloaded through Umbra: ${check.path || '(missing path)'}.`);
    if (!check.metadataReachable) issues.push(`Successful metadata could not be reloaded through Umbra: ${check.path || '(missing path)'}.`);
  }

  return { ok: issues.length === 0, issues: Array.from(new Set(issues)) };
}

export function resolveSharedQueueComfyOutputPath(output: { filename?: string; subfolder?: string; fullpath?: string }): string {
  const fullpath = String(output?.fullpath || '').trim();
  if (fullpath) return fullpath;
  return ['Tools/ComfyUI/output', String(output?.subfolder || '').trim(), String(output?.filename || '').trim()]
    .filter(Boolean)
    .join('/');
}

export function prepareSharedQueueWorkflowGraph(
  graphInput: SharedQueueWorkflowGraph,
  options: { prompt: string; negativePrompt: string; width: number; height: number; steps: number; seed: number; outputPrefix: string },
): SharedQueueWorkflowGraph {
  const graph = structuredClone(graphInput || {});
  const width = Math.max(64, Math.floor(Number(options.width) || 512));
  const height = Math.max(64, Math.floor(Number(options.height) || 512));
  const steps = Math.max(1, Math.floor(Number(options.steps) || 6));
  const seed = Math.max(0, Math.floor(Number(options.seed) || 1));
  for (const node of Object.values(graph)) {
    const classType = String(node?.class_type || '').trim();
    if (!node.inputs || typeof node.inputs !== 'object') node.inputs = {};
    const inputs = node.inputs;
    if (classType === 'UmbraPowerPrompterReader') {
      inputs.prompt_text = options.prompt;
      inputs.negative_prompt = options.negativePrompt;
      inputs.seed = seed;
      inputs.control_after_generate = 'fixed';
      inputs.width = width;
      inputs.height = height;
      inputs.batch_size = 1;
    }
    if (classType === 'EmptyLatentImage') {
      if (!Array.isArray(inputs.width)) inputs.width = width;
      if (!Array.isArray(inputs.height)) inputs.height = height;
      if (!Array.isArray(inputs.batch_size)) inputs.batch_size = 1;
    }
    if (classType.includes('KSampler')) {
      if (typeof inputs.steps === 'number') inputs.steps = steps;
      if (typeof inputs.hires_steps === 'number') inputs.hires_steps = 0;
      if (typeof inputs.enabled === 'boolean' && classType === 'UmbraKSamplerHiResFix') inputs.enabled = false;
    }
    if (classType === 'UmbraImageDetailer') {
      inputs.pipeline_json = '';
      inputs.person_detail = false;
      inputs.face_detail = false;
      inputs.eye_detail = false;
      inputs.hand_detail = false;
    }
    if (classType === 'UmbraImageUpscale') inputs.enabled = false;
    if (classType === 'UmbraLabSaveImage') {
      inputs.filename_prefix = options.outputPrefix;
      inputs.output_folder = 'Umbra UI/Qualification/shared-queue';
      inputs.save_to_yyyy_mm_dd_folder = false;
      inputs.save_to_set_subfolder = false;
      inputs.steps = steps;
    }
  }
  return graph;
}

interface PowerPrompterDrillClient {
  send: (value: unknown) => void;
  waitFor: (predicate: (value: any) => boolean, timeoutMs: number, label: string) => Promise<any>;
  close: () => void;
}

async function openPowerPrompterDrillClient(baseUrl: string): Promise<PowerPrompterDrillClient> {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/prompter';
  url.search = '';
  const socket = new WebSocket(url.toString());
  const inbox: any[] = [];
  const waiters: Array<{
    predicate: (value: any) => boolean;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  socket.addEventListener('message', (event) => {
    let value: any;
    try {
      value = JSON.parse(String(event.data || ''));
    } catch {
      return;
    }
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(value));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
      return;
    }
    inbox.push(value);
    if (inbox.length > 500) inbox.shift();
  });
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error('Timed out connecting to Umbra Power Prompter websocket.')), 10_000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolveOpen();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      rejectOpen(new Error('Failed to connect to Umbra Power Prompter websocket.'));
    }, { once: true });
  });
  const client: PowerPrompterDrillClient = {
    send(value) {
      socket.send(JSON.stringify(value));
    },
    waitFor(predicate, timeoutMs, label) {
      const existingIndex = inbox.findIndex(predicate);
      if (existingIndex >= 0) return Promise.resolve(inbox.splice(existingIndex, 1)[0]);
      return new Promise((resolveWaiter, rejectWaiter) => {
        const waiter = {
          predicate,
          resolve: resolveWaiter,
          reject: rejectWaiter,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            rejectWaiter(new Error(`Timed out waiting for ${label}.`));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
    close() {
      try {
        socket.close();
      } catch { /* already closed */ }
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Power Prompter websocket closed.'));
      }
    },
  };
  client.send({ type: 'register', role: 'powerprompter', source: 'umbra-ui-runtime-drill' });
  await client.waitFor((value) => value?.type === 'registered' && value?.role === 'powerprompter', 10_000, 'Power Prompter registration');
  return client;
}

async function writeJsonAtomic(pathInput: string, value: unknown): Promise<string> {
  const path = resolve(pathInput);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
  return path;
}

function safeName(value: string): string {
  return String(value || 'case').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'case';
}

function jobPromptIds(job: UmbraUiRuntimeJob): Set<string> {
  return new Set((Array.isArray(job.items) ? job.items : [])
    .map((item) => String(item.promptId || '').trim())
    .filter(Boolean));
}

function queueRunningPromptIds(payload: any): Set<string> {
  const ids = new Set<string>();
  const entries = Array.isArray(payload?.queue_running) ? payload.queue_running : [];
  for (const entry of entries) {
    const promptId = String(Array.isArray(entry) ? entry[1] : entry?.prompt_id || entry?.promptId || '').trim();
    if (promptId) ids.add(promptId);
  }
  return ids;
}

function outputPath(output: any): string {
  const fullpath = String(output?.fullpath || '').trim();
  if (fullpath) return fullpath;
  return ['Tools/ComfyUI/output', String(output?.subfolder || '').trim(), String(output?.filename || '').trim()]
    .filter(Boolean)
    .join('/');
}

function collectOutputs(job: UmbraUiRuntimeJob): any[] {
  return (Array.isArray(job.items) ? job.items : []).flatMap((item) => Array.isArray(item.outputs) ? item.outputs : []);
}

async function checkReloadedOutputs(baseUrl: string, job: UmbraUiRuntimeJob): Promise<UmbraUiRuntimeOutputCheck[]> {
  return Promise.all(collectOutputs(job).map(async (output) => {
    const path = outputPath(output);
    let mediaReachable = false;
    let metadataReachable = false;
    try {
      const response = await fetch(apiUrl(baseUrl, `/api/fs/image?${new URLSearchParams({ path })}`), {
        headers: { Range: 'bytes=0-0' },
      });
      mediaReachable = response.ok;
      await response.body?.cancel();
    } catch { /* reflected in the result */ }
    try {
      const response = await fetch(apiUrl(baseUrl, `/api/fs/metadata?${new URLSearchParams({ path })}`), { cache: 'no-store' });
      metadataReachable = response.ok;
      await response.body?.cancel();
    } catch { /* reflected in the result */ }
    return { path, mediaReachable, metadataReachable };
  }));
}

async function readHealth(baseUrl: string): Promise<{ now: number; uptimeMs: number; serverStartedAt: number }> {
  const payload = await fetchJson(apiUrl(baseUrl, '/api/healthz'), { cache: 'no-store' });
  const now = Number(payload?.now);
  const uptimeMs = Number(payload?.uptimeMs);
  if (!Number.isFinite(now) || !Number.isFinite(uptimeMs) || uptimeMs < 0) {
    throw new Error('Umbra health did not report a valid clock and uptime.');
  }
  return { now, uptimeMs, serverStartedAt: Math.round(now - uptimeMs) };
}

async function getJob(baseUrl: string, jobId: string): Promise<UmbraUiRuntimeJob> {
  const payload = await fetchJson(apiUrl(baseUrl, `/api/umbra-ui/inpaint/jobs/${encodeURIComponent(jobId)}`), { cache: 'no-store' });
  if (!payload?.job) throw new Error(`Umbra did not return inpaint job ${jobId}.`);
  return payload.job as UmbraUiRuntimeJob;
}

async function cancelJob(baseUrl: string, jobId: string): Promise<UmbraUiRuntimeJob> {
  const payload = await fetchJson(apiUrl(baseUrl, `/api/umbra-ui/inpaint/jobs/${encodeURIComponent(jobId)}/cancel`), { method: 'POST' });
  if (!payload?.job) throw new Error(`Umbra did not return canceled inpaint job ${jobId}.`);
  return payload.job as UmbraUiRuntimeJob;
}

async function submitJob(baseUrl: string, manifest: QualificationManifest, item: QualificationCase): Promise<UmbraUiRuntimeJob> {
  const payload = await fetchJson(apiUrl(baseUrl, '/api/umbra-ui/inpaint'), {
    method: 'POST',
    body: await buildForm(manifest, item),
  });
  if (!payload?.job?.id) throw new Error('Umbra accepted the drill request without returning a job id.');
  return payload.job as UmbraUiRuntimeJob;
}

async function waitForTerminal(baseUrl: string, jobId: string, timeoutMs: number): Promise<UmbraUiRuntimeJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, jobId);
    if (isUmbraUiRuntimeJobTerminal(job)) return job;
    await Bun.sleep(500);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for job ${jobId}.`);
}

async function waitForOwnedRunningPrompt(
  baseUrl: string,
  jobId: string,
  timeoutMs: number,
): Promise<{ job: UmbraUiRuntimeJob; promptId: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, jobId);
    if (TERMINAL_STATUSES.has(String(job.status || '').toLowerCase())) {
      throw new Error(`Job ${jobId} reached ${job.status} before an owned running Comfy prompt was observed.`);
    }
    const ownedPromptIds = jobPromptIds(job);
    const queue = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
    const runningPromptIds = queueRunningPromptIds(queue);
    const promptId = Array.from(ownedPromptIds).find((candidate) => runningPromptIds.has(candidate));
    if (promptId) return { job, promptId };
    await Bun.sleep(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for job ${jobId} to own Comfy's running prompt.`);
}

async function waitForOwnedRestartQueueEvidence(
  baseUrl: string,
  jobId: string,
  timeoutMs: number,
): Promise<{ job: UmbraUiRuntimeJob; runningPromptIds: string[]; queuedPromptIds: string[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, jobId);
    if (TERMINAL_STATUSES.has(String(job.status || '').toLowerCase())) {
      throw new Error(`Job ${jobId} reached ${job.status} before owned running and queued Comfy prompts were observed together.`);
    }
    const ownedPromptIds = jobPromptIds(job);
    const queue = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
    const runningPromptIds = Array.from(queuePromptIds(queue, 'queue_running'))
      .filter((promptId) => ownedPromptIds.has(promptId));
    const queuedPromptIds = Array.from(queuePromptIds(queue, 'queue_pending'))
      .filter((promptId) => ownedPromptIds.has(promptId));
    const expectedTotal = Math.max(0, Math.round(Number(job.total) || (Array.isArray(job.items) ? job.items.length : 0)));
    if (
      runningPromptIds.length > 0
      && queuedPromptIds.length > 0
      && expectedTotal > 0
      && ownedPromptIds.size === expectedTotal
    ) {
      return { job, runningPromptIds, queuedPromptIds };
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for job ${jobId} to own both running and queued Comfy prompts.`);
}

interface PartialFailureQueueOwnership {
  job: UmbraUiRuntimeJob;
  runningPromptId: string;
  queuedPromptId: string;
  queueSnapshot: any;
}

interface PartialFailureDeleteReceipt {
  requestedPromptIds: string[];
  queueBeforeDelete: any;
  responseStatus: number;
  responsePayload: unknown;
}

interface PartialFailureRemovalConfirmation {
  queueSnapshot: any;
  historySnapshot: any;
  runningPromptIds: string[];
  queuedPromptIds: string[];
  historyPresent: boolean;
  confirmations: number;
}

async function waitForOwnedPartialFailureQueueEvidence(
  baseUrl: string,
  jobId: string,
  timeoutMs: number,
): Promise<PartialFailureQueueOwnership> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, jobId);
    if (TERMINAL_STATUSES.has(String(job.status || '').trim().toLowerCase())) {
      throw new Error(`Job ${jobId} reached ${job.status} before one owned running and one exact owned queued prompt were observed.`);
    }
    if (Number(job.total) !== 2 || runtimeJobItems(job).length !== 2) {
      throw new Error(`Partial-failure drill requires exactly two backend items; job ${jobId} reported total=${String(job.total ?? '(missing)')} and ${runtimeJobItems(job).length} item(s).`);
    }

    const itemIds = normalizedStringList(runtimeJobItems(job).map((item) => item.id));
    const duplicateItemIds = duplicateStringValues(itemIds);
    if (itemIds.length !== 2 || duplicateItemIds.length > 0) {
      throw new Error(duplicateItemIds.length > 0
        ? `Partial-failure job reused item id(s): ${duplicateItemIds.join(', ')}.`
        : 'Partial-failure job did not expose both item ids.');
    }
    const promptIds = normalizedStringList(runtimeJobItems(job).map((item) => item.promptId));
    const duplicatePromptIds = duplicateStringValues(promptIds);
    if (duplicatePromptIds.length > 0) {
      throw new Error(`Partial-failure job reused Comfy prompt id(s): ${duplicatePromptIds.join(', ')}.`);
    }
    if (promptIds.length !== 2) {
      await Bun.sleep(250);
      continue;
    }

    const ownedPromptIds = new Set(promptIds);
    const queue = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
    const runningPromptIds = Array.from(queuePromptIds(queue, 'queue_running'))
      .filter((promptId) => ownedPromptIds.has(promptId));
    const queuedPromptIds = Array.from(queuePromptIds(queue, 'queue_pending'))
      .filter((promptId) => ownedPromptIds.has(promptId));
    const duplicateObservedIds = duplicateStringValues([...runningPromptIds, ...queuedPromptIds]);
    if (duplicateObservedIds.length > 0) {
      throw new Error(`Comfy reported owned prompt id(s) in multiple queue states: ${duplicateObservedIds.join(', ')}.`);
    }
    if (
      runningPromptIds.length === 1
      && queuedPromptIds.length === 1
      && sameStringMultiset([...runningPromptIds, ...queuedPromptIds], promptIds)
    ) {
      return {
        job,
        runningPromptId: runningPromptIds[0],
        queuedPromptId: queuedPromptIds[0],
        queueSnapshot: queue,
      };
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for job ${jobId} to own exactly one running and one queued Comfy prompt.`);
}

async function deleteExactOwnedQueuedPrompt(
  baseUrl: string,
  runningPromptId: string,
  queuedPromptId: string,
): Promise<PartialFailureDeleteReceipt> {
  const queueBeforeDelete = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
  const runningPromptIds = queuePromptIds(queueBeforeDelete, 'queue_running');
  const queuedPromptIds = queuePromptIds(queueBeforeDelete, 'queue_pending');
  if (!runningPromptIds.has(runningPromptId) || !queuedPromptIds.has(queuedPromptId)) {
    throw new Error('Owned running/queued membership changed before the exact queued prompt could be deleted.');
  }
  if (runningPromptIds.has(queuedPromptId) || queuedPromptIds.has(runningPromptId)) {
    throw new Error('Owned prompt queue states overlapped before deletion.');
  }

  const requestedPromptIds = [queuedPromptId];
  const response = await fetch(apiUrl(baseUrl, '/comfy/queue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: requestedPromptIds }),
  });
  const responseText = await response.text().catch(() => '');
  let responsePayload: any = {};
  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = { body: responseText };
    }
  }
  if (!response.ok || responsePayload?.success === false) {
    throw new Error(String(responsePayload?.error || `Comfy queue delete failed (${response.status} ${response.statusText})`));
  }
  return {
    requestedPromptIds,
    queueBeforeDelete,
    responseStatus: response.status,
    responsePayload,
  };
}

function comfyHistoryContainsPrompt(payload: any, promptId: string): boolean {
  return !!(payload?.[promptId] || payload?.history?.[promptId] || payload?.data?.[promptId]);
}

async function confirmExactQueuedPromptRemoved(
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
): Promise<PartialFailureRemovalConfirmation> {
  const deadline = Date.now() + Math.min(timeoutMs, 10_000);
  let confirmations = 0;
  let lastQueue: any = null;
  let lastHistory: any = null;
  while (Date.now() < deadline) {
    const [queue, history] = await Promise.all([
      fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' }),
      fetchJson(apiUrl(baseUrl, `/comfy/history/${encodeURIComponent(promptId)}`), { cache: 'no-store' }),
    ]);
    lastQueue = queue;
    lastHistory = history;
    const runningPromptIds = queuePromptIds(queue, 'queue_running');
    const queuedPromptIds = queuePromptIds(queue, 'queue_pending');
    const historyPresent = comfyHistoryContainsPrompt(history, promptId);
    if (runningPromptIds.has(promptId)) {
      throw new Error(`The queued deletion target ${promptId} started running instead of being removed.`);
    }
    if (historyPresent) {
      throw new Error(`The queued deletion target ${promptId} appeared in Comfy history instead of remaining unexecuted.`);
    }
    if (queuedPromptIds.has(promptId)) {
      confirmations = 0;
    } else {
      confirmations += 1;
      if (confirmations >= 3) {
        return {
          queueSnapshot: queue,
          historySnapshot: history,
          runningPromptIds: Array.from(runningPromptIds),
          queuedPromptIds: Array.from(queuedPromptIds),
          historyPresent,
          confirmations,
        };
      }
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out confirming that exact queued prompt ${promptId} was removed (confirmations=${confirmations}, queue=${lastQueue ? 'read' : 'missing'}, history=${lastHistory ? 'read' : 'missing'}).`);
}

async function waitForPartialFailureTerminalWithoutSubstitution(
  baseUrl: string,
  jobId: string,
  initialJob: UmbraUiRuntimeJob,
  timeoutMs: number,
): Promise<{ job: UmbraUiRuntimeJob; pollCount: number }> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, jobId);
    pollCount += 1;
    const identityIssues = partialFailurePromptIdentityIssues(jobId, initialJob, job);
    if (identityIssues.length > 0) {
      throw new Error(`Partial-failure prompt identity changed while waiting for terminal state: ${identityIssues.join(' ')}`);
    }
    if (isUmbraUiRuntimeJobTerminal(job)) return { job, pollCount };
    await Bun.sleep(500);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for partial-failure job ${jobId}.`);
}

async function assertSharedQueueIdle(baseUrl: string, drillLabel = 'Shared-queue drill'): Promise<void> {
  const [queue, powerPrompter] = await Promise.all([
    fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' }),
    fetchJson(apiUrl(baseUrl, '/api/powerprompter/backend-queue-debug'), { cache: 'no-store' }) as Promise<PowerPrompterBackendDebug>,
  ]);
  const running = queuePromptIds(queue, 'queue_running').size;
  const pending = queuePromptIds(queue, 'queue_pending').size;
  const queuedWork = Array.isArray(powerPrompter.queuedWork) ? powerPrompter.queuedWork.length : 0;
  const activeTasks = Array.isArray(powerPrompter.activeTasks) ? powerPrompter.activeTasks.length : 0;
  const activeRequests = (Array.isArray(powerPrompter.controller?.requests) ? powerPrompter.controller?.requests : [])
    .filter((request) => !terminalPowerPrompterStatus(request.status)).length;
  if (running + pending + queuedWork + activeTasks + activeRequests > 0) {
    throw new Error(`${drillLabel} requires an idle queue (Comfy running=${running}, pending=${pending}; Power Prompter queued=${queuedWork}, active=${activeTasks}, requests=${activeRequests}).`);
  }
}

async function validatePowerPrompterWorkflow(baseUrl: string, workflowId: string): Promise<void> {
  const payload = await fetchJson(apiUrl(baseUrl, '/api/powerprompter/api-workflows'), { cache: 'no-store' });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const item = items.find((candidate: any) => String(candidate?.id || '').trim() === workflowId);
  if (!item) throw new Error(`Power Prompter workflow was not found: ${workflowId}`);
  if (item.compatible !== true) {
    const missing = Array.isArray(item.missing) ? item.missing.map((value: unknown) => String(value)).filter(Boolean) : [];
    throw new Error(`Power Prompter workflow is not compatible: ${workflowId}${missing.length > 0 ? ` (missing ${missing.join(', ')})` : ''}`);
  }
}

async function enqueuePowerPrompterSurvivor(
  client: PowerPrompterDrillClient,
  options: {
    workflowId: string;
    requestId: string;
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    steps: number;
    seed: number;
    checkpointName: string;
  },
): Promise<any> {
  const batchRequestId = `shared-queue-batch-${crypto.randomUUID()}`;
  client.send({
    type: 'queue_batch_request',
    requestId: batchRequestId,
    apiWorkflowId: options.workflowId,
    queueTargetType: 'api_workflow',
    groups: [{
      requestId: options.requestId,
      mode: 'prompt',
      prompts: [options.prompt],
      state: {
        activeQueueSet: 1,
        activeSetId: 1,
        apiWorkflowId: options.workflowId,
        promptSetIds: [1],
        promptStyleNames: ['Runtime shared-queue survivor'],
        promptOutputSubfolders: ['Qualification/shared-queue'],
        generation: {
          modelType: 'checkpoint',
          checkpointName: options.checkpointName,
          seed: options.seed,
          controlAfterGenerate: 'fixed',
          controlIncrement: 1,
          width: options.width,
          height: options.height,
          batchSize: 1,
          steps: options.steps,
          cfg: 5.5,
          samplerName: 'euler_ancestral',
          scheduler: 'normal',
          clipSkip: 2,
          negativePrompt: options.negativePrompt,
          loras: [],
          hiresFix: { enabled: false },
          detailerPipeline: [],
          outputUpscale: { enabled: false },
        },
      },
    }],
  });
  const forwarded = await client.waitFor(
    (value) => value?.type === 'queue_batch_forwarded' && value?.requestId === batchRequestId,
    30_000,
    'Power Prompter queue acceptance',
  );
  if (forwarded?.success !== true || !Array.isArray(forwarded.acceptedRequestIds) || !forwarded.acceptedRequestIds.includes(options.requestId)) {
    throw new Error(String(forwarded?.error || 'Power Prompter did not accept the shared-queue survivor.'));
  }
  return forwarded;
}

async function waitForPowerPrompterQueuedBehindTarget(
  baseUrl: string,
  requestId: string,
  targetPromptId: string,
  timeoutMs: number,
): Promise<{ request: UmbraUiPowerPrompterRuntimeRequest; queue: any; promptId: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [queue, debug] = await Promise.all([
      fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' }),
      fetchJson(apiUrl(baseUrl, '/api/powerprompter/backend-queue-debug'), { cache: 'no-store' }) as Promise<PowerPrompterBackendDebug>,
    ]);
    const request = powerPrompterRequestFromDebug(debug, requestId);
    if (request && terminalPowerPrompterStatus(request.status)) {
      throw new Error(`Power Prompter survivor reached ${String(request.status || '(missing)')} before it was observed behind the Canvas target.`);
    }
    const promptId = powerPrompterPromptIds(request)[0] || '';
    const running = queuePromptIds(queue, 'queue_running');
    const pending = queuePromptIds(queue, 'queue_pending');
    if (!running.has(targetPromptId)) {
      throw new Error('Canvas target stopped running before the Power Prompter survivor was observed behind it.');
    }
    if (request && promptId && pending.has(promptId)) return { request, queue, promptId };
    await Bun.sleep(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for the Power Prompter survivor to queue behind Canvas.`);
}

async function waitForPowerPrompterTerminal(
  baseUrl: string,
  requestId: string,
  timeoutMs: number,
): Promise<UmbraUiPowerPrompterRuntimeRequest> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const debug = await fetchJson(apiUrl(baseUrl, '/api/powerprompter/backend-queue-debug'), { cache: 'no-store' }) as PowerPrompterBackendDebug;
    const request = powerPrompterRequestFromDebug(debug, requestId);
    if (request && terminalPowerPrompterStatus(request.status)) return request;
    await Bun.sleep(500);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for Power Prompter request ${requestId}.`);
}

async function submitUnmanagedComfyPrompt(baseUrl: string, graph: SharedQueueWorkflowGraph, clientId: string): Promise<string> {
  const payload = await fetchJson(apiUrl(baseUrl, '/comfy/prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  const promptId = String(payload?.prompt_id || payload?.promptId || '').trim();
  if (!promptId) throw new Error('ComfyUI accepted the unmanaged workflow without returning a prompt id.');
  return promptId;
}

async function waitForUnmanagedQueuedBehindTarget(
  baseUrl: string,
  promptId: string,
  targetPromptId: string,
  timeoutMs: number,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const queue = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
    const running = queuePromptIds(queue, 'queue_running');
    const pending = queuePromptIds(queue, 'queue_pending');
    if (!running.has(targetPromptId)) {
      throw new Error('Canvas target stopped running before the unmanaged survivor was observed behind it.');
    }
    if (pending.has(promptId)) return queue;
    await Bun.sleep(250);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for the unmanaged Comfy prompt to queue behind Canvas.`);
}

async function waitForUnmanagedTerminal(baseUrl: string, promptId: string, timeoutMs: number): Promise<ComfyHistoryEntry> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await fetchJson(apiUrl(baseUrl, `/comfy/history/${encodeURIComponent(promptId)}`), { cache: 'no-store' });
    const entry = payload?.[promptId] as ComfyHistoryEntry | undefined;
    if (entry?.status?.completed === true) return entry;
    await Bun.sleep(500);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for unmanaged Comfy prompt ${promptId}.`);
}

function unmanagedOutputs(entry: ComfyHistoryEntry): Array<{ filename?: string; subfolder?: string; type?: string; fullpath?: string }> {
  return Object.values(entry?.outputs || {}).flatMap((output) => [
    ...(Array.isArray(output?.images) ? output.images : []),
    ...(Array.isArray(output?.gifs) ? output.gifs : []),
  ]).filter((output) => String(output?.filename || '').trim().length > 0);
}

async function checkUnmanagedOutputs(baseUrl: string, entry: ComfyHistoryEntry): Promise<UmbraUiRuntimeOutputCheck[]> {
  return Promise.all(unmanagedOutputs(entry).map(async (output) => {
    const path = resolveSharedQueueComfyOutputPath(output);
    let mediaReachable = false;
    try {
      const response = await fetch(apiUrl(baseUrl, `/api/fs/image?${new URLSearchParams({ path })}`), {
        headers: { Range: 'bytes=0-0' },
      });
      mediaReachable = response.ok;
      await response.body?.cancel();
    } catch { /* reflected in the result */ }
    return { path, mediaReachable, metadataReachable: true };
  }));
}

async function cancelUnmanagedIfActive(baseUrl: string, promptId: string): Promise<void> {
  if (!promptId) return;
  try {
    const queue = await fetchJson(apiUrl(baseUrl, '/comfy/queue'), { cache: 'no-store' });
    if (queuePromptIds(queue, 'queue_pending').has(promptId)) {
      await fetch(apiUrl(baseUrl, '/comfy/queue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
      return;
    }
    if (queuePromptIds(queue, 'queue_running').has(promptId)) {
      await fetch(apiUrl(baseUrl, '/comfy/interrupt'), { method: 'POST' });
    }
  } catch { /* best-effort cleanup */ }
}

async function validatePipeline(baseUrl: string, item: QualificationCase): Promise<string> {
  await fetchJson(apiUrl(baseUrl, '/api/umbra-ui/pipelines'), { cache: 'no-store' });
  const resolved = await fetchJson(apiUrl(baseUrl, `/api/umbra-ui/pipelines/resolve?${new URLSearchParams({
    feature: 'inpainting',
    modelFamily: item.modelFamily,
    modelSource: item.modelSource,
  })}`), { cache: 'no-store' });
  const workflowId = String(resolved?.item?.id || '').trim();
  if (!workflowId) throw new Error('Umbra did not resolve a locked inpaint pipeline for the drill case.');
  if (item.expectedWorkflowId && workflowId !== item.expectedWorkflowId) {
    throw new Error(`Resolved ${workflowId} instead of expected workflow ${item.expectedWorkflowId}.`);
  }
  if (item.expectedAdapter && String(resolved?.pipeline?.inpaintAdapter || '') !== item.expectedAdapter) {
    throw new Error(`Resolved ${String(resolved?.pipeline?.inpaintAdapter || '(none)')} instead of expected adapter ${item.expectedAdapter}.`);
  }
  if (resolved?.pipeline?.readiness?.graph?.status === 'invalid') {
    throw new Error('The resolved inpaint graph is invalid.');
  }
  return workflowId;
}

async function cancelIfActive(baseUrl: string, jobId: string): Promise<void> {
  if (!jobId) return;
  try {
    const job = await getJob(baseUrl, jobId);
    if (!isUmbraUiRuntimeJobTerminal(job)) await cancelJob(baseUrl, jobId);
  } catch { /* best-effort cleanup */ }
}

async function runPartialFailure(
  manifest: QualificationManifest,
  item: QualificationCase,
  baseUrl: string,
  workflowId: string,
  timeoutMs: number,
  reportPath: string,
): Promise<void> {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  let jobId = '';
  let ownership: PartialFailureQueueOwnership | null = null;
  let deleteReceipt: PartialFailureDeleteReceipt | null = null;
  let removal: PartialFailureRemovalConfirmation | null = null;
  let terminalJob: UmbraUiRuntimeJob | null = null;
  let outputChecks: UmbraUiRuntimeOutputCheck[] = [];
  let reportWritten = false;
  try {
    const idleCheckStartedAt = Date.now();
    await assertSharedQueueIdle(baseUrl, 'Partial-failure drill');
    const idleCheckedAt = Date.now();

    const submitStartedAt = Date.now();
    const submitted = await submitJob(baseUrl, manifest, { ...item, id: `${item.id}-partial-failure`, samples: 2 });
    const submittedAt = Date.now();
    jobId = String(submitted.id || '').trim();

    ownership = await waitForOwnedPartialFailureQueueEvidence(baseUrl, jobId, Math.min(timeoutMs, 120_000));
    const ownershipObservedAt = Date.now();
    deleteReceipt = await deleteExactOwnedQueuedPrompt(
      baseUrl,
      ownership.runningPromptId,
      ownership.queuedPromptId,
    );
    const deleteAcceptedAt = Date.now();
    removal = await confirmExactQueuedPromptRemoved(baseUrl, ownership.queuedPromptId, timeoutMs);
    const removalConfirmedAt = Date.now();

    const terminalObservation = await waitForPartialFailureTerminalWithoutSubstitution(
      baseUrl,
      jobId,
      ownership.job,
      timeoutMs,
    );
    terminalJob = terminalObservation.job;
    const terminalObservedAt = Date.now();
    const outputReloadStartedAt = Date.now();
    outputChecks = await checkReloadedOutputs(baseUrl, terminalJob);
    const outputReloadFinishedAt = Date.now();

    const evidence: UmbraUiPartialFailureRuntimeEvidence = {
      initialJob: ownership.job,
      observedRunningPromptIds: [ownership.runningPromptId],
      observedQueuedPromptIds: [ownership.queuedPromptId],
      deleteRequestedPromptIds: deleteReceipt.requestedPromptIds,
      deleteResponseStatus: deleteReceipt.responseStatus,
      postDeleteRunningPromptIds: removal.runningPromptIds,
      postDeleteQueuedPromptIds: removal.queuedPromptIds,
      deletedPromptHistoryPresent: removal.historyPresent,
      removalConfirmations: removal.confirmations,
    };
    const assessment = assessUmbraUiPartialFailure(jobId, terminalJob, outputChecks, evidence);
    const report = {
      schemaVersion: 1,
      drill: 'partial-failure',
      caseId: item.id,
      workflowId,
      baseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      timings: {
        idleCheckMs: idleCheckedAt - idleCheckStartedAt,
        submitMs: submittedAt - submitStartedAt,
        submittedToOwnedQueueMs: ownershipObservedAt - submittedAt,
        deleteRequestMs: deleteAcceptedAt - ownershipObservedAt,
        removalConfirmationMs: removalConfirmedAt - deleteAcceptedAt,
        removalToTerminalMs: terminalObservedAt - removalConfirmedAt,
        outputReloadMs: outputReloadFinishedAt - outputReloadStartedAt,
        totalMs: outputReloadFinishedAt - startedAtMs,
      },
      jobId,
      successfulPromptId: ownership.runningPromptId,
      deliberatelyRemovedPromptId: ownership.queuedPromptId,
      ownershipQueueSnapshot: ownership.queueSnapshot,
      initialJob: ownership.job,
      deletion: {
        proxyPath: '/comfy/queue',
        requestBody: { delete: deleteReceipt.requestedPromptIds },
        queueBeforeDelete: deleteReceipt.queueBeforeDelete,
        responseStatus: deleteReceipt.responseStatus,
        responsePayload: deleteReceipt.responsePayload,
      },
      removalConfirmation: {
        queueSnapshot: removal.queueSnapshot,
        historySnapshot: removal.historySnapshot,
        confirmations: removal.confirmations,
      },
      terminalPollCount: terminalObservation.pollCount,
      terminalJob,
      outputChecks,
      evidence,
      assessment,
    };
    const written = await writeJsonAtomic(reportPath, report);
    reportWritten = true;
    process.stdout.write(`${assessment.ok ? 'PASSED' : 'FAILED'} partial failure: ${written}\n`);
    if (!assessment.ok) throw new Error(assessment.issues.join(' '));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latestJob = jobId ? await getJob(baseUrl, jobId).catch(() => null) : null;
    if (!reportWritten) {
      const written = await writeJsonAtomic(reportPath, {
        schemaVersion: 1,
        drill: 'partial-failure',
        caseId: item.id,
        workflowId,
        baseUrl,
        startedAt,
        finishedAt: new Date().toISOString(),
        jobId,
        ownership,
        deletion: deleteReceipt && {
          proxyPath: '/comfy/queue',
          requestBody: { delete: deleteReceipt.requestedPromptIds },
          ...deleteReceipt,
        },
        removalConfirmation: removal,
        terminalJob,
        latestJob,
        outputChecks,
        assessment: { ok: false, issues: [message] },
      });
      process.stderr.write(`FAILED partial failure: ${written}\n`);
    }
    await cancelIfActive(baseUrl, jobId);
    throw error;
  }
}

async function runCancelIsolation(
  manifest: QualificationManifest,
  item: QualificationCase,
  baseUrl: string,
  workflowId: string,
  timeoutMs: number,
  reportPath: string,
): Promise<void> {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  let targetId = '';
  let survivorId = '';
  let report: Record<string, unknown> | null = null;
  try {
    const targetSubmitStartedAt = Date.now();
    const target = await submitJob(baseUrl, manifest, { ...item, id: `${item.id}-cancel-target`, samples: 2 });
    const targetSubmittedAt = Date.now();
    targetId = String(target.id || '');
    const firstRunning = await waitForOwnedRunningPrompt(baseUrl, targetId, Math.min(timeoutMs, 120_000));
    const targetRunningObservedAt = Date.now();
    const survivorSubmitStartedAt = Date.now();
    const survivor = await submitJob(baseUrl, manifest, { ...item, id: `${item.id}-cancel-survivor`, samples: 1 });
    const survivorSubmittedAt = Date.now();
    survivorId = String(survivor.id || '');
    const targetBeforeCancel = await waitForOwnedRunningPrompt(baseUrl, targetId, Math.min(timeoutMs, 30_000));
    const cancelStartedAt = Date.now();
    const canceled = await cancelJob(baseUrl, targetId);
    const canceledAt = Date.now();
    const survivorAfterCancel = await waitForTerminal(baseUrl, survivorId, timeoutMs);
    const survivorFinishedAt = Date.now();
    const targetAfterCancel = await getJob(baseUrl, targetId);
    const outputReloadStartedAt = Date.now();
    const outputChecks = await checkReloadedOutputs(baseUrl, survivorAfterCancel);
    const outputReloadFinishedAt = Date.now();
    const assessment = assessUmbraUiCancelIsolation(targetBeforeCancel.job, targetAfterCancel, survivorAfterCancel);
    for (const check of outputChecks) {
      if (!check.mediaReachable) assessment.issues.push(`Survivor media could not be reloaded: ${check.path || '(missing path)'}.`);
      if (!check.metadataReachable) assessment.issues.push(`Survivor metadata could not be reloaded: ${check.path || '(missing path)'}.`);
    }
    assessment.ok = assessment.issues.length === 0;
    report = {
      schemaVersion: 1,
      drill: 'cancel-isolation',
      caseId: item.id,
      workflowId,
      baseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      timings: {
        targetSubmitMs: targetSubmittedAt - targetSubmitStartedAt,
        targetToOwnedRunningMs: targetRunningObservedAt - targetSubmittedAt,
        survivorSubmitMs: survivorSubmittedAt - survivorSubmitStartedAt,
        cancelRequestMs: canceledAt - cancelStartedAt,
        survivorAfterCancelMs: survivorFinishedAt - canceledAt,
        outputReloadMs: outputReloadFinishedAt - outputReloadStartedAt,
        totalMs: outputReloadFinishedAt - startedAtMs,
      },
      observedRunningPromptId: firstRunning.promptId,
      canceledResponse: canceled,
      targetBeforeCancel: targetBeforeCancel.job,
      targetAfterCancel,
      survivorAfterCancel,
      outputChecks,
      assessment,
    };
    const written = await writeJsonAtomic(reportPath, report);
    process.stdout.write(`${assessment.ok ? 'PASSED' : 'FAILED'} cancel isolation: ${written}\n`);
    if (!assessment.ok) throw new Error(assessment.issues.join(' '));
  } catch (error) {
    await Promise.all([cancelIfActive(baseUrl, targetId), cancelIfActive(baseUrl, survivorId)]);
    const message = error instanceof Error ? error.message : String(error);
    if (!report) {
      const written = await writeJsonAtomic(reportPath, {
        schemaVersion: 1,
        drill: 'cancel-isolation',
        caseId: item.id,
        workflowId,
        baseUrl,
        startedAt,
        finishedAt: new Date().toISOString(),
        targetId,
        survivorId,
        assessment: { ok: false, issues: [message] },
      });
      process.stderr.write(`FAILED cancel isolation: ${written}\n`);
    }
    throw error;
  }
}

async function runSharedQueueIsolation(
  manifest: QualificationManifest,
  item: QualificationCase,
  baseUrl: string,
  workflowId: string,
  powerPrompterWorkflowId: string,
  unmanagedWorkflowPath: string,
  timeoutMs: number,
  reportPath: string,
): Promise<void> {
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const canvasRequestId = `${item.id}-shared-queue-canvas`;
  const powerPrompterRequestId = `shared-queue-pp-${crypto.randomUUID()}`;
  const unmanagedClientId = `umbra-shared-queue-${crypto.randomUUID()}`;
  const sharedWidth = Math.max(256, Math.min(512, Math.round(Number(item.width) || 512)));
  const sharedHeight = Math.max(256, Math.min(512, Math.round(Number(item.height) || 512)));
  const sharedSteps = Math.max(1, Math.min(6, Math.round(Number(item.steps) || 6)));
  const seed = 1784070001;
  const prompt = 'runtime queue ownership test, simple geometric studio object, clean background';
  const negativePrompt = 'text, watermark, malformed';
  let canvasJobId = '';
  let unmanagedPromptId = '';
  let client: PowerPrompterDrillClient | null = null;
  let reportWritten = false;
  try {
    await assertSharedQueueIdle(baseUrl);
    await validatePowerPrompterWorkflow(baseUrl, powerPrompterWorkflowId);
    const rawGraph = JSON.parse(await readFile(resolve(unmanagedWorkflowPath), 'utf8')) as SharedQueueWorkflowGraph;
    if (!rawGraph || typeof rawGraph !== 'object' || Array.isArray(rawGraph) || Object.keys(rawGraph).length <= 0) {
      throw new Error('The unmanaged shared-queue workflow graph is empty or invalid.');
    }
    const unmanagedGraph = prepareSharedQueueWorkflowGraph(rawGraph, {
      prompt,
      negativePrompt,
      width: sharedWidth,
      height: sharedHeight,
      steps: sharedSteps,
      seed: seed + 1,
      outputPrefix: 'UmbraUI_shared_queue_unmanaged',
    });
    client = await openPowerPrompterDrillClient(baseUrl);

    const canvasSubmitStartedAt = Date.now();
    const target = await submitJob(baseUrl, manifest, { ...item, id: canvasRequestId, samples: 2 });
    canvasJobId = String(target.id || '');
    const canvasSubmittedAt = Date.now();
    const targetRunning = await waitForOwnedRunningPrompt(baseUrl, canvasJobId, Math.min(timeoutMs, 120_000));
    const canvasRunningAt = Date.now();

    const powerPrompterSubmitStartedAt = Date.now();
    const powerPrompterForwarded = await enqueuePowerPrompterSurvivor(client, {
      workflowId: powerPrompterWorkflowId,
      requestId: powerPrompterRequestId,
      prompt,
      negativePrompt,
      width: sharedWidth,
      height: sharedHeight,
      steps: sharedSteps,
      seed,
      checkpointName: String(item.checkpointName || 'Illustrious-XL-v2.0.safetensors'),
    });
    const powerPrompterAcceptedAt = Date.now();
    const powerPrompterQueued = await waitForPowerPrompterQueuedBehindTarget(
      baseUrl,
      powerPrompterRequestId,
      targetRunning.promptId,
      Math.min(timeoutMs, 60_000),
    );
    const powerPrompterQueuedAt = Date.now();

    const unmanagedSubmitStartedAt = Date.now();
    unmanagedPromptId = await submitUnmanagedComfyPrompt(baseUrl, unmanagedGraph, unmanagedClientId);
    const unmanagedSubmittedAt = Date.now();
    const queueWithBothSurvivors = await waitForUnmanagedQueuedBehindTarget(
      baseUrl,
      unmanagedPromptId,
      targetRunning.promptId,
      Math.min(timeoutMs, 60_000),
    );
    const unmanagedQueuedAt = Date.now();

    const cancelStartedAt = Date.now();
    await cancelJob(baseUrl, canvasJobId);
    const targetAfterCancel = await waitForTerminal(baseUrl, canvasJobId, Math.min(timeoutMs, 120_000));
    const canceledAt = Date.now();
    const powerPrompterAfterCancel = await waitForPowerPrompterTerminal(baseUrl, powerPrompterRequestId, timeoutMs);
    const powerPrompterFinishedAt = Date.now();
    const unmanagedHistory = await waitForUnmanagedTerminal(baseUrl, unmanagedPromptId, timeoutMs);
    const unmanagedFinishedAt = Date.now();
    const unmanagedMediaChecks = await checkUnmanagedOutputs(baseUrl, unmanagedHistory);
    const unmanagedOutputsList = unmanagedOutputs(unmanagedHistory);
    const unmanagedEvidence: UmbraUiUnmanagedComfyRuntimePrompt = {
      promptId: unmanagedPromptId,
      status: String(unmanagedHistory?.status?.status_str || (unmanagedHistory?.status?.completed ? 'success' : '')).trim(),
      outputCount: unmanagedOutputsList.length,
      mediaChecks: unmanagedMediaChecks,
    };
    const assessment = assessUmbraUiSharedQueueIsolation(targetRunning.job, targetAfterCancel, {
      powerPrompterObservedBehindTarget: true,
      unmanagedObservedBehindTarget: true,
      powerPrompter: powerPrompterAfterCancel,
      unmanaged: unmanagedEvidence,
    });
    const report = {
      schemaVersion: 1,
      drill: 'shared-queue-isolation',
      caseId: item.id,
      workflowId,
      powerPrompterWorkflowId,
      unmanagedWorkflowPath: resolve(unmanagedWorkflowPath),
      baseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      timings: {
        canvasSubmitMs: canvasSubmittedAt - canvasSubmitStartedAt,
        canvasToOwnedRunningMs: canvasRunningAt - canvasSubmittedAt,
        powerPrompterForwardMs: powerPrompterAcceptedAt - powerPrompterSubmitStartedAt,
        powerPrompterAcceptedToQueuedMs: powerPrompterQueuedAt - powerPrompterAcceptedAt,
        unmanagedSubmitMs: unmanagedSubmittedAt - unmanagedSubmitStartedAt,
        unmanagedAcceptedToQueuedMs: unmanagedQueuedAt - unmanagedSubmittedAt,
        canvasCancelToTerminalMs: canceledAt - cancelStartedAt,
        powerPrompterAfterCancelMs: powerPrompterFinishedAt - canceledAt,
        unmanagedAfterPowerPrompterMs: unmanagedFinishedAt - powerPrompterFinishedAt,
        totalMs: Date.now() - startedAtMs,
      },
      sharedSurvivorControls: {
        width: sharedWidth,
        height: sharedHeight,
        steps: sharedSteps,
        seed,
      },
      canvasTargetBeforeCancel: targetRunning.job,
      canvasTargetAfterCancel: targetAfterCancel,
      powerPrompterForwarded,
      powerPrompterQueuedRequest: powerPrompterQueued.request,
      powerPrompterQueuedPromptId: powerPrompterQueued.promptId,
      powerPrompterAfterCancel,
      unmanagedPromptId,
      unmanagedHistory,
      unmanagedMediaChecks,
      queueWithBothSurvivors,
      assessment,
    };
    const written = await writeJsonAtomic(reportPath, report);
    reportWritten = true;
    process.stdout.write(`${assessment.ok ? 'PASSED' : 'FAILED'} shared queue isolation: ${written}\n`);
    if (!assessment.ok) throw new Error(assessment.issues.join(' '));
  } catch (error) {
    if (client && powerPrompterRequestId) {
      client.send({
        type: 'queue_interrupt_active',
        requestId: `cleanup-interrupt-${crypto.randomUUID()}`,
        requestIds: [powerPrompterRequestId],
        targetBridgeId: `api-workflow:${powerPrompterWorkflowId}`,
        queueTargetType: 'api_workflow',
      });
      client.send({
        type: 'queue_cancel',
        requestId: `cleanup-cancel-${crypto.randomUUID()}`,
        requestIds: [powerPrompterRequestId],
        targetBridgeId: `api-workflow:${powerPrompterWorkflowId}`,
        queueTargetType: 'api_workflow',
      });
    }
    await Promise.all([
      cancelIfActive(baseUrl, canvasJobId),
      cancelUnmanagedIfActive(baseUrl, unmanagedPromptId),
    ]);
    const message = error instanceof Error ? error.message : String(error);
    if (!reportWritten) {
      const written = await writeJsonAtomic(reportPath, {
        schemaVersion: 1,
        drill: 'shared-queue-isolation',
        caseId: item.id,
        workflowId,
        powerPrompterWorkflowId,
        unmanagedWorkflowPath: resolve(unmanagedWorkflowPath),
        baseUrl,
        startedAt,
        finishedAt: new Date().toISOString(),
        canvasJobId,
        powerPrompterRequestId,
        unmanagedPromptId,
        assessment: { ok: false, issues: [message] },
      });
      process.stderr.write(`FAILED shared queue isolation: ${written}\n`);
    }
    throw error;
  } finally {
    client?.close();
  }
}

async function prepareRestart(
  manifest: QualificationManifest,
  manifestPath: string,
  item: QualificationCase,
  baseUrl: string,
  workflowId: string,
  timeoutMs: number,
  statePath: string,
  restartPoint: 'active' | 'terminal',
): Promise<void> {
  const health = await readHealth(baseUrl);
  const submitStartedAt = Date.now();
  const job = await submitJob(baseUrl, manifest, { ...item, id: `${item.id}-restart`, samples: 2 });
  const submittedAt = Date.now();
  const jobId = String(job.id || '');
  try {
    const queueEvidence = restartPoint === 'active'
      ? await waitForOwnedRestartQueueEvidence(baseUrl, jobId, Math.min(timeoutMs, 120_000))
      : {
          job: await waitForTerminal(baseUrl, jobId, timeoutMs),
          runningPromptIds: [] as string[],
          queuedPromptIds: [] as string[],
        };
    if (restartPoint === 'terminal' && String(queueEvidence.job.status || '').toLowerCase() !== 'completed') {
      throw new Error(`Terminal restart preparation requires a completed job; ${jobId} ended as ${queueEvidence.job.status || '(missing)'}.`);
    }
    const state: RuntimeDrillState = {
      schemaVersion: 2,
      drill: 'restart',
      restartPoint,
      manifestPath,
      caseId: item.id,
      baseUrl,
      jobId,
      workflowId,
      preparedAt: new Date().toISOString(),
      preparedServerStartedAt: health.serverStartedAt,
      preparedServerUptimeMs: health.uptimeMs,
      observedRunningPromptIds: queueEvidence.runningPromptIds,
      observedQueuedPromptIds: queueEvidence.queuedPromptIds,
      initialJob: queueEvidence.job,
      timings: {
        submitMs: submittedAt - submitStartedAt,
        submittedToRestartPointMs: Date.now() - submittedAt,
      },
    };
    const written = await writeJsonAtomic(statePath, state);
    process.stdout.write(`PREPARED ${restartPoint} restart recovery: ${written}\n`);
    process.stdout.write('Restart Umbra through the normal user flow while portable ComfyUI keeps working, then run the restart-resume drill with the same manifest, case, and state path.\n');
  } catch (error) {
    await cancelIfActive(baseUrl, jobId);
    throw error;
  }
}

async function resumeRestart(
  state: RuntimeDrillState,
  baseUrl: string,
  timeoutMs: number,
  reportPath: string,
): Promise<void> {
  const resumedAtMs = Date.now();
  const health = await readHealth(baseUrl);
  const issues: string[] = [];
  if (health.serverStartedAt <= state.preparedServerStartedAt + 1000) {
    issues.push('Umbra server uptime shows that the server instance did not restart after the drill was prepared.');
  }
  let recoveredJob: UmbraUiRuntimeJob;
  const recoveryPollStartedAt = Date.now();
  try {
    recoveredJob = await waitForTerminal(baseUrl, state.jobId, timeoutMs);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    recoveredJob = await getJob(baseUrl, state.jobId).catch(() => ({ id: state.jobId, status: 'failed', items: [] }));
  }
  const recoveryPollFinishedAt = Date.now();
  const outputReloadStartedAt = Date.now();
  const outputChecks = await checkReloadedOutputs(baseUrl, recoveredJob);
  const outputReloadFinishedAt = Date.now();
  const restartEvidence: UmbraUiRestartRuntimeEvidence = {
    restartPoint: state.restartPoint,
    initialJob: state.initialJob,
    observedRunningPromptIds: state.observedRunningPromptIds,
    observedQueuedPromptIds: state.observedQueuedPromptIds,
  };
  const assessment = assessUmbraUiRestartRecovery(state.jobId, recoveredJob, outputChecks, restartEvidence);
  assessment.issues.unshift(...issues);
  assessment.issues = Array.from(new Set(assessment.issues));
  assessment.ok = assessment.issues.length === 0;
  const written = await writeJsonAtomic(reportPath, {
    schemaVersion: 1,
    drill: 'restart-recovery',
    caseId: state.caseId,
    workflowId: state.workflowId,
    baseUrl,
    preparedAt: state.preparedAt,
    restartPoint: state.restartPoint,
    resumedAt: new Date().toISOString(),
    timings: {
      recoveryPollMs: recoveryPollFinishedAt - recoveryPollStartedAt,
      outputReloadMs: outputReloadFinishedAt - outputReloadStartedAt,
      totalResumeMs: outputReloadFinishedAt - resumedAtMs,
    },
    preparedServerStartedAt: state.preparedServerStartedAt,
    resumedServerStartedAt: health.serverStartedAt,
    initialJob: state.initialJob,
    restartEvidence,
    recoveredJob,
    outputChecks,
    assessment,
  });
  process.stdout.write(`${assessment.ok ? 'PASSED' : 'FAILED'} restart recovery: ${written}\n`);
  if (!assessment.ok) throw new Error(assessment.issues.join(' '));
}

export async function runUmbraUiInpaintRuntimeDrill(): Promise<void> {
  if (!process.argv.includes('--confirm-live-drill')) {
    throw new Error('Live drills submit real generations. Pass --confirm-live-drill explicitly after launching Umbra and portable ComfyUI yourself.');
  }
  if (process.argv.includes('--all')) throw new Error('Runtime drills accept exactly one --case and never support --all.');
  const drill = readArg('--drill') as RuntimeDrill;
  if (!['cancel-isolation', 'partial-failure', 'shared-queue-isolation', 'restart-prepare', 'restart-resume'].includes(drill)) {
    throw new Error('Choose --drill cancel-isolation, partial-failure, shared-queue-isolation, restart-prepare, or restart-resume.');
  }
  const manifestArgument = readArg('--manifest');
  const caseId = readArg('--case');
  if (!manifestArgument || !caseId) {
    throw new Error('Usage: bun run drill:umbra-ui-inpaint -- --manifest <qualification.json> --case <id> --drill <mode> --confirm-live-drill');
  }
  const manifestPath = resolve(manifestArgument);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as QualificationManifest;
  const baseUrl = String(manifest.baseUrl || 'http://127.0.0.1:8212').replace(/\/+$/, '');
  if (!isLoopbackUrl(baseUrl)) throw new Error('The runtime drill only connects to a loopback Umbra server.');
  const item = manifest.cases.find((candidate) => candidate.enabled !== false && candidate.id === caseId);
  if (!item) throw new Error(`Enabled qualification case was not found: ${caseId}`);

  const preflight = await preflightUmbraUiInpaintQualification(manifest, { projectRoot: process.cwd(), caseIds: [caseId] });
  for (const issue of preflight.issues) process.stderr.write(`${formatUmbraUiInpaintPreflightIssue(issue)}\n`);
  if (!preflight.ok) throw new Error(`Offline qualification preflight failed with ${preflight.issues.length} issue(s).`);
  process.stdout.write(`Preflight: ${preflight.checks.length} fixture/model checks passed for ${caseId}.\n`);

  const workflowId = await validatePipeline(baseUrl, item);
  const timeoutMs = Math.max(10_000, Math.round(Number(readArg('--timeout-ms')) || manifest.timeoutMs || 30 * 60_000));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const statePath = resolve(readArg('--state') || `User/UmbraUI/QualificationReports/restart-state-${safeName(caseId)}.json`);
  const reportPath = resolve(readArg('--report') || `User/UmbraUI/QualificationReports/runtime-${safeName(drill)}-${safeName(caseId)}-${timestamp}.json`);

  if (drill === 'cancel-isolation') {
    await runCancelIsolation(manifest, item, baseUrl, workflowId, timeoutMs, reportPath);
    return;
  }
  if (drill === 'partial-failure') {
    await runPartialFailure(manifest, item, baseUrl, workflowId, timeoutMs, reportPath);
    return;
  }
  if (drill === 'shared-queue-isolation') {
    const powerPrompterWorkflowId = readArg('--power-prompter-workflow-id') || DEFAULT_SHARED_QUEUE_WORKFLOW_ID;
    const unmanagedWorkflowPath = readArg('--unmanaged-workflow') || DEFAULT_SHARED_QUEUE_WORKFLOW_PATH;
    await runSharedQueueIsolation(
      manifest,
      item,
      baseUrl,
      workflowId,
      powerPrompterWorkflowId,
      unmanagedWorkflowPath,
      timeoutMs,
      reportPath,
    );
    return;
  }
  if (drill === 'restart-prepare') {
    const restartPoint = (readArg('--restart-point') || 'active') as 'active' | 'terminal';
    if (!['active', 'terminal'].includes(restartPoint)) {
      throw new Error('Choose --restart-point active or terminal.');
    }
    await prepareRestart(manifest, manifestPath, item, baseUrl, workflowId, timeoutMs, statePath, restartPoint);
    return;
  }
  const state = JSON.parse(await readFile(statePath, 'utf8')) as RuntimeDrillState;
  if (state.schemaVersion !== 2 || state.drill !== 'restart' || !['active', 'terminal'].includes(state.restartPoint)) {
    throw new Error('The restart drill state is invalid or unsupported. Prepare a fresh restart drill with this build.');
  }
  if (resolve(state.manifestPath) !== manifestPath || state.caseId !== caseId || state.baseUrl !== baseUrl) {
    throw new Error('The restart drill state does not match the selected manifest, case, and Umbra URL.');
  }
  await resumeRestart(state, baseUrl, timeoutMs, reportPath);
}

if (import.meta.main) await runUmbraUiInpaintRuntimeDrill();
