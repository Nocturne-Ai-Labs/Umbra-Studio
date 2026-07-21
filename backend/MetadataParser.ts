/**
 * Metadata Parser - SIMPLIFIED
 * Extracts AI generation metadata from PNG images
 * Supports: A1111, ComfyUI, Umbra Studio
 */

import { open } from 'fs/promises';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { extname, basename, dirname, join } from 'path';

export interface ImageMetadata {
  positive_prompt?: string;
  negative_prompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  sampler?: string;
  scheduler?: string;
  cfg?: number;
  width?: number;
  height?: number;
  prompt?: any;
  workflow?: any;
  umbra_api_workflow?: any;
  umbra_power_prompter?: Record<string, unknown>;
  umbra_inpaint?: Record<string, unknown>;
  umbra_metadata?: Record<string, unknown>;
  source_file?: string;
  sourceFile?: string;
  format?: 'comfyui' | 'a1111' | 'cozyui' | 'unknown';
}

export class MetadataParser {
  private static readonly VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv', '.gif']);

  static async parse(filePath: string): Promise<ImageMetadata> {
    const ext = extname(filePath).toLowerCase();
    if (this.VIDEO_EXTENSIONS.has(ext)) {
      return await this.parseVideo(filePath);
    }

    // Allow non-PNG media (e.g. GIF) to read metadata from sidecar PNG.
    if (ext !== '.png') {
      const sidecarMeta = await this.parseSidecarPng(filePath);
      if (Object.keys(sidecarMeta).length > 0) {
        return sidecarMeta;
      }
    }

    let fileHandle;
    try {
      fileHandle = await open(filePath, 'r');
      const headerBuffer = Buffer.alloc(8);
      await fileHandle.read(headerBuffer, 0, 8, 0);

      // Only PNG supported for now
      if (headerBuffer.toString('hex') === '89504e470d0a1a0a') {
        return await this.parsePNG(fileHandle);
      }
      return {};
    } catch { return {}; }
    finally { if (fileHandle) await fileHandle.close(); }
  }

  private static async parseVideo(filePath: string): Promise<ImageMetadata> {
    const result: ImageMetadata = await this.parseSidecarPng(filePath);

    // Probe the first video stream for source sizing and read generation metadata.
    try {
      const probe = spawnSync(
        'ffprobe',
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height:format_tags=comment',
          '-of', 'json',
          filePath,
        ],
        { encoding: 'utf-8' }
      );
      if (probe.status !== 0) return result;

      const raw = (probe.stdout || '').trim();
      if (!raw) return result;
      const payload = JSON.parse(raw) as {
        streams?: Array<{ width?: number; height?: number }>;
        format?: { tags?: Record<string, unknown> };
      };
      const stream = payload.streams?.[0];
      const width = Number(stream?.width);
      const height = Number(stream?.height);
      if (Number.isFinite(width) && width > 0) result.width = Math.round(width);
      if (Number.isFinite(height) && height > 0) result.height = Math.round(height);

      const tags = payload.format?.tags || {};
      const comment = String(tags.comment ?? tags.COMMENT ?? '').trim();
      return comment ? { ...result, ...this.parseVideoComment(comment) } : result;
    } catch {
      return result;
    }
  }

  private static parseVideoComment(comment: string): ImageMetadata {
    const chunks: Record<string, string> = {};

    // Preferred path: structured JSON comment emitted by ffmpeg metadata.
    try {
      const parsed = JSON.parse(comment);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed as any)) {
          if (value === undefined || value === null) continue;
          chunks[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
        return this.processChunks(chunks);
      }
    } catch {
      // Fallback below.
    }

    // Fallback path: attempt to recover prompt fields from malformed JSON-ish comment strings.
    const recovered: ImageMetadata = {};
    try {
      const positiveMatch = comment.match(/"positive_prompt"\s*:\s*"([^"]*)"/);
      const negativeMatch = comment.match(/"negative_prompt"\s*:\s*"([^"]*)"/);
      if (positiveMatch?.[1]) recovered.positive_prompt = positiveMatch[1];
      if (negativeMatch?.[1]) recovered.negative_prompt = negativeMatch[1];

      const parametersMatch = comment.match(/"parameters"\s*:\s*"([^"]*)"/);
      if (parametersMatch?.[1]) {
        const a1111 = this.parseA1111(parametersMatch[1].replace(/\\n/g, '\n'));
        if (!recovered.positive_prompt && a1111.positive_prompt) recovered.positive_prompt = a1111.positive_prompt;
        if (!recovered.negative_prompt && a1111.negative_prompt) recovered.negative_prompt = a1111.negative_prompt;
        if (a1111.model) recovered.model = a1111.model;
        if (a1111.seed !== undefined) recovered.seed = a1111.seed;
        if (a1111.steps !== undefined) recovered.steps = a1111.steps;
        if (a1111.cfg !== undefined) recovered.cfg = a1111.cfg;
        if (a1111.sampler) recovered.sampler = a1111.sampler;
        if (a1111.width) recovered.width = a1111.width;
        if (a1111.height) recovered.height = a1111.height;
      }
    } catch {
      // Ignore malformed fallback parsing.
    }

    if (Object.keys(recovered).length > 0) recovered.format = 'a1111';
    return recovered;
  }

  private static async parseSidecarPng(filePath: string): Promise<ImageMetadata> {
    const stem = basename(filePath, extname(filePath));
    const sidecarPng = join(dirname(filePath), `${stem}.png`);
    if (!existsSync(sidecarPng)) return {};

    let sidecarHandle;
    try {
      sidecarHandle = await open(sidecarPng, 'r');
      return await this.parsePNG(sidecarHandle);
    } catch {
      return {};
    } finally {
      if (sidecarHandle) await sidecarHandle.close();
    }
  }

  private static async parsePNG(fileHandle: any): Promise<ImageMetadata> {
    const chunks: Record<string, string> = {};
    let offset = 8;
    const buffer = Buffer.alloc(8);

    try {
      while (true) {
        const { bytesRead } = await fileHandle.read(buffer, 0, 8, offset);
        if (bytesRead < 8) break;

        const length = buffer.readUInt32BE(0);
        const type = buffer.toString('ascii', 4, 8);
        offset += 8;

        if (type === 'tEXt' || type === 'iTXt') {
          const dataBuffer = Buffer.alloc(length);
          await fileHandle.read(dataBuffer, 0, length, offset);

          let keyword = '', text = '';

          if (type === 'tEXt') {
            const nullIndex = dataBuffer.indexOf(0);
            if (nullIndex > -1) {
              keyword = dataBuffer.toString('latin1', 0, nullIndex);
              text = dataBuffer.toString('latin1', nullIndex + 1);
            }
          } else if (type === 'iTXt') {
            let ptr = 0;
            const null1 = dataBuffer.indexOf(0, ptr);
            if (null1 > -1) {
              keyword = dataBuffer.toString('latin1', 0, null1);
              ptr = null1 + 3; // Skip null, compFlag, compMethod
              const null2 = dataBuffer.indexOf(0, ptr);
              if (null2 > -1) {
                ptr = null2 + 1;
                const null3 = dataBuffer.indexOf(0, ptr);
                if (null3 > -1) text = dataBuffer.toString('utf8', null3 + 1);
              }
            }
          }

          if (keyword && text) chunks[keyword] = text;
        }

        offset += length + 4;
        if (type === 'IEND') break;
      }
    } catch { }

    return this.processChunks(chunks);
  }

  private static processChunks(chunks: Record<string, string>): ImageMetadata {
    const meta: ImageMetadata = {};
    let detected: ImageMetadata['format'] = 'unknown';

    // ComfyUI prompt/workflow data
    if (chunks['prompt']) {
      try {
        const promptWorkflow = JSON.parse(chunks['prompt']);
        meta.prompt = promptWorkflow;
        Object.assign(meta, this.parseComfyUI(promptWorkflow));
        if (!meta.workflow) meta.workflow = promptWorkflow;
        detected = 'comfyui';
      } catch { }
    }
    if (chunks['workflow']) {
      try {
        const workflowPayload = JSON.parse(chunks['workflow']);
        meta.workflow = workflowPayload;
        if (detected === 'unknown') detected = 'comfyui';
      } catch { }
    }

    if (chunks['umbra_api_workflow']) {
      try {
        meta.umbra_api_workflow = JSON.parse(chunks['umbra_api_workflow']);
        if (!meta.workflow) meta.workflow = meta.umbra_api_workflow;
        if (detected === 'unknown') detected = 'comfyui';
      } catch { }
    }

    if (chunks['umbra_power_prompter']) {
      try {
        const powerPrompterMeta = JSON.parse(chunks['umbra_power_prompter']);
        if (powerPrompterMeta && typeof powerPrompterMeta === 'object' && !Array.isArray(powerPrompterMeta)) {
          meta.umbra_power_prompter = powerPrompterMeta as Record<string, unknown>;
          const sourceFile = String((powerPrompterMeta as any).source_file || (powerPrompterMeta as any).sourceFile || '').trim();
          if (sourceFile) {
            meta.source_file = sourceFile;
            meta.sourceFile = sourceFile;
          }
        }
      } catch { }
    }

    if (chunks['umbra_inpaint']) {
      try {
        const inpaintMeta = JSON.parse(chunks['umbra_inpaint']);
        if (inpaintMeta && typeof inpaintMeta === 'object' && !Array.isArray(inpaintMeta)) {
          meta.umbra_inpaint = inpaintMeta as Record<string, unknown>;
          if (!meta.positive_prompt && typeof (inpaintMeta as any).prompt === 'string') {
            meta.positive_prompt = String((inpaintMeta as any).prompt);
          }
          if (!meta.negative_prompt && typeof (inpaintMeta as any).negativePrompt === 'string') {
            meta.negative_prompt = String((inpaintMeta as any).negativePrompt);
          }
          if (!meta.model && typeof (inpaintMeta as any).checkpointName === 'string') {
            meta.model = String((inpaintMeta as any).checkpointName);
          }
          if (meta.seed === undefined && Number.isFinite(Number((inpaintMeta as any).seed))) {
            meta.seed = Number((inpaintMeta as any).seed);
          }
          if (meta.steps === undefined && Number.isFinite(Number((inpaintMeta as any).steps))) {
            meta.steps = Number((inpaintMeta as any).steps);
          }
          if (meta.cfg === undefined && Number.isFinite(Number((inpaintMeta as any).cfg))) {
            meta.cfg = Number((inpaintMeta as any).cfg);
          }
          if (!meta.sampler && typeof (inpaintMeta as any).samplerName === 'string') {
            meta.sampler = String((inpaintMeta as any).samplerName);
          }
          if (!meta.scheduler && typeof (inpaintMeta as any).scheduler === 'string') {
            meta.scheduler = String((inpaintMeta as any).scheduler);
          }
          const region = (inpaintMeta as any).generationRegion;
          if (region && typeof region === 'object') {
            if (!meta.width && Number.isFinite(Number(region.width))) meta.width = Number(region.width);
            if (!meta.height && Number.isFinite(Number(region.height))) meta.height = Number(region.height);
          }
          if (detected === 'unknown') detected = 'comfyui';
        }
      } catch { }
    }

    if (chunks['source_file']) {
      const sourceFile = String(chunks['source_file'] || '').trim();
      if (sourceFile) {
        meta.source_file = sourceFile;
        meta.sourceFile = sourceFile;
      }
    }

    if (chunks['umbra_metadata']) {
      try {
        const umbraMeta = JSON.parse(chunks['umbra_metadata']);
        if (umbraMeta && typeof umbraMeta === 'object' && !Array.isArray(umbraMeta)) {
          meta.umbra_metadata = umbraMeta as Record<string, unknown>;
          if (!meta.positive_prompt && typeof (umbraMeta as any).positive_prompt === 'string') {
            meta.positive_prompt = String((umbraMeta as any).positive_prompt);
          }
          if (!meta.negative_prompt && typeof (umbraMeta as any).negative_prompt === 'string') {
            meta.negative_prompt = String((umbraMeta as any).negative_prompt);
          }
          if (!meta.model && typeof (umbraMeta as any).model === 'string') meta.model = String((umbraMeta as any).model);
          if (meta.seed === undefined && Number.isFinite(Number((umbraMeta as any).seed))) meta.seed = Number((umbraMeta as any).seed);
          if (meta.steps === undefined && Number.isFinite(Number((umbraMeta as any).steps))) meta.steps = Number((umbraMeta as any).steps);
          if (meta.cfg === undefined && Number.isFinite(Number((umbraMeta as any).cfg))) meta.cfg = Number((umbraMeta as any).cfg);
          if (!meta.sampler && typeof (umbraMeta as any).sampler === 'string') meta.sampler = String((umbraMeta as any).sampler);
          if (!meta.scheduler && typeof (umbraMeta as any).scheduler === 'string') meta.scheduler = String((umbraMeta as any).scheduler);
          if (!meta.width && Number.isFinite(Number((umbraMeta as any).width))) meta.width = Number((umbraMeta as any).width);
          if (!meta.height && Number.isFinite(Number((umbraMeta as any).height))) meta.height = Number((umbraMeta as any).height);
          const sourceFile = String((umbraMeta as any).source_file || (umbraMeta as any).sourceFile || '').trim();
          if (sourceFile) {
            meta.source_file = sourceFile;
            meta.sourceFile = sourceFile;
          }
          if (detected === 'unknown') detected = 'comfyui';
        }
      } catch { }
    }

    // A1111 parameters fallback
    if (chunks['parameters']) {
      try {
        const a1111 = this.parseA1111(chunks['parameters']);
        if (a1111.positive_prompt && !meta.positive_prompt) meta.positive_prompt = a1111.positive_prompt;
        if (a1111.negative_prompt && !meta.negative_prompt) meta.negative_prompt = a1111.negative_prompt;
        if (a1111.model && !meta.model) meta.model = a1111.model;
        if (a1111.seed !== undefined && meta.seed === undefined) meta.seed = a1111.seed;
        if (a1111.steps !== undefined && meta.steps === undefined) meta.steps = a1111.steps;
        if (a1111.cfg !== undefined && meta.cfg === undefined) meta.cfg = a1111.cfg;
        if (a1111.sampler && !meta.sampler) meta.sampler = a1111.sampler;
        if (a1111.width && !meta.width) meta.width = a1111.width;
        if (a1111.height && !meta.height) meta.height = a1111.height;
        if (detected === 'unknown') detected = 'a1111';
      } catch { }
    }

    // Umbra legacy cozyui blob fallback
    if (chunks['cozyui']) {
      try {
        const cozy = JSON.parse(chunks['cozyui']);
        if (cozy?.positive && !meta.positive_prompt) meta.positive_prompt = cozy.positive;
        if (cozy?.negative && !meta.negative_prompt) meta.negative_prompt = cozy.negative;
        if (cozy?.model && !meta.model) meta.model = cozy.model;
        if (cozy?.seed !== undefined && meta.seed === undefined) meta.seed = Number(cozy.seed);
        if (cozy?.steps !== undefined && meta.steps === undefined) meta.steps = Number(cozy.steps);
        if (cozy?.cfg !== undefined && meta.cfg === undefined) meta.cfg = Number(cozy.cfg);
        if (cozy?.sampler && !meta.sampler) meta.sampler = cozy.sampler;
        if (cozy?.scheduler && !meta.scheduler) meta.scheduler = cozy.scheduler;
        if (cozy?.width && !meta.width) meta.width = Number(cozy.width);
        if (cozy?.height && !meta.height) meta.height = Number(cozy.height);
        if (detected === 'unknown') detected = 'cozyui';
      } catch { }
    }

    if (detected !== 'unknown') meta.format = detected;
    return meta;
  }

  private static parseA1111(raw: string): ImageMetadata {
    try {
      const lines = raw.split('\n');
      let positive = '', negative = '', paramsLine = '', mode = 'positive';

      for (const line of lines) {
        if (line.startsWith('Negative prompt:')) { mode = 'negative'; negative += line.substring(16).trim(); }
        else if (line.startsWith('Steps: ')) { paramsLine = line; mode = 'params'; }
        else { if (mode === 'positive') positive += line + '\n'; if (mode === 'negative') negative += line + '\n'; }
      }

      const meta: ImageMetadata = { positive_prompt: positive.trim(), negative_prompt: negative.trim() };

      if (paramsLine) {
        for (const pair of paramsLine.split(', ')) {
          const [k, v] = pair.split(': ');
          if (!k || !v) continue;
          if (k === 'Steps') meta.steps = parseInt(v);
          else if (k === 'Sampler') meta.sampler = v;
          else if (k === 'CFG scale') meta.cfg = parseFloat(v);
          else if (k === 'Seed') meta.seed = parseInt(v);
          else if (k === 'Schedule type' || k === 'Scheduler') meta.scheduler = v;
          else if (k === 'Model') meta.model = v;
          else if (k === 'Size') { const [w, h] = v.split('x').map(Number); meta.width = w; meta.height = h; }
        }
      }
      return meta;
    } catch { return {}; }
  }

  private static parseComfyUI(json: any): ImageMetadata {
    const meta: ImageMetadata = {};
    const negativeKeywords = ['negative', 'bad', 'worst', 'blurry', 'deformed', 'ugly', 'lowres', 'artifact', 'watermark'];
    for (const key in json) {
      const node = json[key];
      if (
        node.class_type === 'KSampler'
        || node.class_type === 'KSamplerAdvanced'
        || node.class_type === 'UmbraKSampler'
      ) {
        const inputs = node.inputs;
        if (inputs.seed !== undefined) meta.seed = Number(inputs.seed);
        if (inputs.steps !== undefined) meta.steps = Number(inputs.steps);
        if (inputs.cfg !== undefined) meta.cfg = Number(inputs.cfg);
        if (inputs.sampler_name) meta.sampler = inputs.sampler_name;
        if (typeof inputs.scheduler === 'string') meta.scheduler = inputs.scheduler;
      }
      if (node.class_type === 'CheckpointLoaderSimple' && node.inputs.ckpt_name) meta.model = node.inputs.ckpt_name;
      if (node.class_type === 'EmptyLatentImage') {
        if (node.inputs?.width) meta.width = Number(node.inputs.width);
        if (node.inputs?.height) meta.height = Number(node.inputs.height);
      }
      if (node.class_type === 'CLIPTextEncode' && typeof node.inputs.text === 'string') {
        const text = node.inputs.text;
        const isNegative = negativeKeywords.some((kw) => text.toLowerCase().includes(kw));
        if (isNegative) {
          if (!meta.negative_prompt) meta.negative_prompt = text;
        } else if (!meta.positive_prompt) {
          meta.positive_prompt = text;
        }
      }
      if (node.class_type === 'UmbraLabSaveImage' || node.class_type === 'UmbraLabSaveImageSimple') {
        if (!meta.positive_prompt && typeof node.inputs?.positive_prompt === 'string') meta.positive_prompt = node.inputs.positive_prompt;
        if (!meta.negative_prompt && typeof node.inputs?.negative_prompt === 'string') meta.negative_prompt = node.inputs.negative_prompt;
        if (!meta.model && typeof node.inputs?.model_name === 'string') meta.model = node.inputs.model_name;
        if (meta.seed === undefined && node.inputs?.seed !== undefined) meta.seed = Number(node.inputs.seed);
        if (meta.steps === undefined && node.inputs?.steps !== undefined) meta.steps = Number(node.inputs.steps);
        if (meta.cfg === undefined && node.inputs?.cfg !== undefined) meta.cfg = Number(node.inputs.cfg);
        if (!meta.sampler && typeof node.inputs?.sampler_name === 'string') meta.sampler = node.inputs.sampler_name;
        if (!meta.scheduler && typeof node.inputs?.scheduler === 'string') meta.scheduler = node.inputs.scheduler;
      }
    }
    return meta;
  }
}
