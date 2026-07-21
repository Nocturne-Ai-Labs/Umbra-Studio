import { rm } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const JOB_RETENTION_MS = 6 * 60 * 60 * 1000;
const HISTORY_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;

export type UmbraUiUpscaleItemStatus = 'staging' | 'queued' | 'running' | 'completed' | 'failed';
export type UmbraUiUpscaleJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed';
export type UmbraUiUpscaleQueuePlacement = 'next' | 'end' | 'interrupt';

export interface UmbraUiUpscaleSource {
  name: string;
  sourcePath?: string;
  read: () => Promise<ArrayBuffer | Uint8Array>;
  cleanup?: () => Promise<void>;
}

export interface UmbraUiUpscaleOutput {
  filename: string;
  subfolder: string;
  type: string;
  fullpath: string;
}

export interface UmbraUiUpscaleJobItem {
  id: string;
  name: string;
  sourcePath: string;
  status: UmbraUiUpscaleItemStatus;
  promptId: string;
  outputs: UmbraUiUpscaleOutput[];
  error: string;
}

export interface UmbraUiUpscaleJob {
  id: string;
  status: UmbraUiUpscaleJobStatus;
  modelName: string;
  maxDimension: number;
  outputFolder: string;
  queuePlacement: UmbraUiUpscaleQueuePlacement;
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  items: UmbraUiUpscaleJobItem[];
}

interface UmbraUiUpscaleServiceOptions {
  getComfyBaseUrl: () => string;
  getComfyInputRoot?: () => string;
  prepareExecution?: (context: {
    jobId: string;
    queuePlacement: UmbraUiUpscaleQueuePlacement;
  }) => Promise<void | (() => void | Promise<void>)>;
}

function normalizeQueuePlacement(value: unknown): UmbraUiUpscaleQueuePlacement {
  const normalized = String(value || '').trim();
  return normalized === 'next' || normalized === 'interrupt' ? normalized : 'end';
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sanitizeFilename(rawName: unknown, fallback: string): string {
  const normalized = String(rawName || '').trim().replace(/\\/g, '/').split('/').pop() || fallback;
  const extension = extname(normalized).toLowerCase();
  const safeExtension = IMAGE_EXTENSIONS.has(extension) ? extension : '.png';
  const stem = normalized.slice(0, extension ? -extension.length : undefined)
    .replace(/[^a-z0-9._ -]+/gi, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100) || fallback;
  return `${stem}${safeExtension}`;
}

function readPromptId(payload: any): string {
  return String(payload?.prompt_id ?? payload?.promptId ?? payload?.id ?? '').trim();
}

function readHistoryRecord(payload: any, promptId: string): any | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload[promptId] || payload?.history?.[promptId] || payload?.data?.[promptId] || null;
}

function readExecutionError(record: any): string {
  const messages = Array.isArray(record?.status?.messages) ? record.status.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (!Array.isArray(entry) || String(entry[0] || '') !== 'execution_error') continue;
    const detail = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
    const nodeType = String(detail.node_type || '').trim();
    const message = String(detail.exception_message || detail.error || '').trim();
    return `${nodeType ? `${nodeType}: ` : ''}${message || 'ComfyUI upscale execution failed.'}`;
  }
  return '';
}

function collectOutputs(record: any): UmbraUiUpscaleOutput[] {
  const outputs = record?.outputs;
  if (!outputs || typeof outputs !== 'object') return [];
  const collected: UmbraUiUpscaleOutput[] = [];
  for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue;
    for (const key of ['images', 'files']) {
      const items = (nodeOutput as Record<string, unknown>)[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const source = item as Record<string, unknown>;
        const filename = String(source.filename || source.name || '').trim();
        const fullpath = String(source.fullpath || source.fullPath || source.path || '').trim();
        if (!filename && !fullpath) continue;
        collected.push({
          filename,
          subfolder: String(source.subfolder || '').trim(),
          type: String(source.type || 'output').trim() || 'output',
          fullpath,
        });
      }
    }
  }
  return collected;
}

function cloneJob(job: UmbraUiUpscaleJob): UmbraUiUpscaleJob {
  return {
    ...job,
    items: job.items.map((item) => ({
      ...item,
      outputs: item.outputs.map((output) => ({ ...output })),
    })),
  };
}

export class UmbraUiUpscaleService {
  private readonly jobs = new Map<string, UmbraUiUpscaleJob>();
  private readonly getComfyBaseUrl: () => string;
  private readonly getComfyInputRoot?: () => string;
  private readonly prepareExecution?: UmbraUiUpscaleServiceOptions['prepareExecution'];
  private executionTail: Promise<void> = Promise.resolve();

  constructor(options: UmbraUiUpscaleServiceOptions) {
    this.getComfyBaseUrl = options.getComfyBaseUrl;
    this.getComfyInputRoot = options.getComfyInputRoot;
    this.prepareExecution = options.prepareExecution;
  }

  getJob(jobId: string): UmbraUiUpscaleJob | null {
    this.prune();
    const job = this.jobs.get(String(jobId || '').trim());
    return job ? cloneJob(job) : null;
  }

  listJobs(): UmbraUiUpscaleJob[] {
    this.prune();
    return Array.from(this.jobs.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 20)
      .map(cloneJob);
  }

  async submit(
    sources: UmbraUiUpscaleSource[],
    settings: {
      modelName: string;
      maxDimension: number;
      outputFolder?: string;
      queuePlacement?: UmbraUiUpscaleQueuePlacement;
    },
  ): Promise<UmbraUiUpscaleJob> {
    this.prune();
    if (sources.length <= 0) throw new Error('Choose at least one image to upscale.');
    const modelName = String(settings.modelName || '').trim().replace(/\\/g, '/');
    if (!modelName) throw new Error('Choose an upscale model.');
    const maxDimension = Math.max(512, Math.min(16384, Math.round(Number(settings.maxDimension) || 3840)));
    const outputFolder = String(settings.outputFolder || '').trim();
    const queuePlacement = normalizeQueuePlacement(settings.queuePlacement);
    const now = Date.now();
    const job: UmbraUiUpscaleJob = {
      id: createId('umbra-upscale'),
      status: 'staging',
      modelName,
      maxDimension,
      outputFolder,
      queuePlacement,
      total: sources.length,
      completed: 0,
      failed: 0,
      createdAt: now,
      updatedAt: now,
      items: sources.map((source, index) => ({
        id: `${index + 1}`,
        name: sanitizeFilename(source.name, `image-${index + 1}`),
        sourcePath: String(source.sourcePath || '').trim(),
        status: 'staging',
        promptId: '',
        outputs: [],
        error: '',
      })),
    };
    this.jobs.set(job.id, job);
    job.status = 'queued';
    job.updatedAt = Date.now();
    const run = async () => {
      let releaseExecution: (() => void | Promise<void>) | undefined;
      try {
        const preparedRelease = await this.prepareExecution?.({ jobId: job.id, queuePlacement });
        if (typeof preparedRelease === 'function') releaseExecution = preparedRelease;
        await this.processSerialJob(job, sources, modelName, maxDimension, outputFolder, queuePlacement);
      } catch (error: any) {
        const message = String(error?.message || error || 'Upscale scheduling failed.');
        for (let index = 0; index < job.items.length; index += 1) {
          const item = job.items[index];
          if (item.status === 'completed' || item.status === 'failed') continue;
          item.status = 'failed';
          item.error = message;
          const source = sources[index];
          if (source?.cleanup) await source.cleanup().catch(() => undefined);
        }
        job.completed = job.items.filter((candidate) => candidate.status === 'completed').length;
        job.failed = job.items.filter((candidate) => candidate.status === 'failed').length;
        job.status = job.completed > 0 ? 'partial' : 'failed';
        job.updatedAt = Date.now();
      } finally {
        if (releaseExecution) await releaseExecution();
      }
    };
    this.executionTail = this.executionTail.catch(() => undefined).then(run);
    return cloneJob(job);
  }

  private async uploadInput(jobId: string, index: number, sourceName: string, bytes: Uint8Array): Promise<string> {
    const safeName = `${String(index + 1).padStart(4, '0')}_${sanitizeFilename(sourceName, `image-${index + 1}`)}`;
    const subfolder = `umbra-ui-upscale/${jobId}`;
    const form = new FormData();
    form.append('image', new Blob([Buffer.from(bytes)]), safeName);
    form.append('type', 'input');
    form.append('subfolder', subfolder);
    form.append('overwrite', 'true');
    const response = await fetch(`${this.getComfyBaseUrl()}/upload/image`, { method: 'POST', body: form });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `ComfyUI rejected the upscale input (${response.status}).`);
    }
    const payload: any = await response.json().catch(() => ({}));
    const returnedName = String(payload?.name || safeName).trim() || safeName;
    const returnedSubfolder = String(payload?.subfolder || subfolder).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return returnedSubfolder ? `${returnedSubfolder}/${returnedName}` : returnedName;
  }

  private buildWorkflow(inputName: string, sourceName: string, modelName: string, maxDimension: number, outputFolder: string) {
    const sourceStem = sanitizeFilename(sourceName, 'image').replace(/\.[^.]+$/, '');
    return {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: inputName },
        _meta: { title: 'Umbra UI Upscale Input' },
      },
      '2': {
        class_type: 'UmbraImageUpscale',
        inputs: {
          image: ['1', 0],
          upscale_model: modelName,
          max_dimension: maxDimension,
          enabled: true,
        },
        _meta: { title: 'Umbra UI Model Upscale' },
      },
      '3': {
        class_type: 'UmbraLabSaveImage',
        inputs: {
          images: ['2', 0],
          filename_prefix: `UmbraUI_Upscale_${sourceStem}_%date%`,
          positive_prompt: '',
          negative_prompt: '',
          output_folder: outputFolder || 'Umbra UI/extras',
          save_to_yyyy_mm_dd_folder: !outputFolder,
          save_to_set_subfolder: false,
          set_subfolder: '',
          save_set_to_style_subfolder: '',
          model_name: modelName,
          seed: 0,
          steps: 1,
          cfg: 0,
          sampler_name: 'upscale',
          scheduler: 'none',
        },
        _meta: { title: 'Umbra UI Extras Output' },
      },
    };
  }

  private async processSerialJob(
    job: UmbraUiUpscaleJob,
    sources: UmbraUiUpscaleSource[],
    modelName: string,
    maxDimension: number,
    outputFolder: string,
    queuePlacement: UmbraUiUpscaleQueuePlacement,
  ) {
    job.status = 'running';
    job.updatedAt = Date.now();
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      const item = job.items[index];
      item.status = 'staging';
      job.updatedAt = Date.now();
      try {
        const rawBytes = await source.read();
        const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
        if (bytes.byteLength <= 0) throw new Error('The source image is empty.');
        if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('The source image exceeds the 512 MB upscale limit.');
        const inputName = await this.uploadInput(job.id, index, item.name, bytes);
        const graph = this.buildWorkflow(inputName, item.name, modelName, maxDimension, outputFolder);
        item.status = 'queued';
        job.updatedAt = Date.now();
        const response = await fetch(`${this.getComfyBaseUrl()}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: `umbra-ui-upscale-${job.id}`,
            prompt: graph,
            extra_data: {
              extra_pnginfo: {
                workflow: graph,
                umbra_upscale: {
                  version: 1,
                  dispatchMode: 'serial',
                  source: 'umbra_ui_extras',
                  sourceName: item.name,
                  sourcePath: item.sourcePath,
                  modelName,
                  maxDimension,
                  outputFolder,
                  queuePlacement,
                },
              },
            },
          }),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(detail || `ComfyUI rejected the upscale workflow (${response.status}).`);
        }
        const promptId = readPromptId(await response.json().catch(() => ({})));
        if (!promptId) throw new Error('ComfyUI did not return an upscale prompt id.');
        item.promptId = promptId;
        item.status = 'running';
        job.updatedAt = Date.now();
        const record = await this.waitForHistory(item.promptId);
        const executionError = readExecutionError(record);
        const status = String(record?.status?.status_str || '').trim().toLowerCase();
        if (executionError || status === 'error') throw new Error(executionError || 'ComfyUI upscale execution failed.');
        item.outputs = collectOutputs(record);
        if (item.outputs.length <= 0) throw new Error('ComfyUI finished the upscale without reporting a saved output.');
        item.status = 'completed';
      } catch (error: any) {
        item.status = 'failed';
        item.error = String(error?.message || error || 'Upscale failed.');
      } finally {
        await this.cleanupStagedInputs(job.id);
        if (source.cleanup) await source.cleanup().catch(() => undefined);
      }
      sources[index] = null as unknown as UmbraUiUpscaleSource;
      job.completed = job.items.filter((candidate) => candidate.status === 'completed').length;
      job.failed = job.items.filter((candidate) => candidate.status === 'failed').length;
      job.updatedAt = Date.now();
    }
    job.status = job.completed === job.total
      ? 'completed'
      : job.completed > 0 ? 'partial' : 'failed';
    job.updatedAt = Date.now();
  }

  private async waitForHistory(promptId: string): Promise<any> {
    const startedAt = Date.now();
    let lastError = '';
    while (Date.now() - startedAt < HISTORY_TIMEOUT_MS) {
      try {
        const response = await fetch(`${this.getComfyBaseUrl()}/history/${encodeURIComponent(promptId)}`, { cache: 'no-store' });
        if (response.ok) {
          const record = readHistoryRecord(await response.json().catch(() => ({})), promptId);
          if (record) {
            const status = String(record?.status?.status_str || '').trim().toLowerCase();
            if (readExecutionError(record) || status === 'error' || status === 'success' || status === 'completed' || record?.status?.completed === true) {
              return record;
            }
          }
        } else {
          lastError = `${response.status} ${response.statusText}`.trim();
        }
      } catch (error: any) {
        lastError = String(error?.message || error || 'history request failed');
      }
      await Bun.sleep(1000);
    }
    throw new Error(`Timed out waiting for ComfyUI upscale ${promptId}.${lastError ? ` ${lastError}` : ''}`);
  }

  private prune() {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const [jobId, job] of this.jobs) {
      if (job.updatedAt < cutoff) this.jobs.delete(jobId);
    }
  }

  private async cleanupStagedInputs(jobId: string): Promise<void> {
    try {
      const inputRoot = String(this.getComfyInputRoot?.() || '').trim();
      if (!inputRoot || !/^umbra-upscale-[a-z0-9-]+$/i.test(jobId)) return;
      const stagingRoot = resolve(join(inputRoot, 'umbra-ui-upscale'));
      const target = resolve(join(stagingRoot, jobId));
      if (!target.startsWith(`${stagingRoot}${sep}`)) return;
      await rm(target, { recursive: true, force: true });
    } catch {
      // Staging cleanup is best effort; completed outputs remain authoritative.
    }
  }
}
