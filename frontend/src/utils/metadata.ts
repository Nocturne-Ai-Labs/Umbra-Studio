/**
 * Metadata extraction and manipulation utilities
 * Handles PNG metadata parsing, legacy parameter parsing, and metadata embedding.
 */

export interface ImageMetadata {
  type: 'image' | 'video';
  name?: string;
  size?: number;
  format?: 'comfyui' | 'cozyui' | 'a1111' | 'unknown';
  workflow?: any;
  prompt?: any;
  umbra_api_workflow?: any;
  umbra_power_prompter?: Record<string, unknown>;
  umbra_inpaint?: Record<string, unknown>;
  umbra_metadata?: Record<string, unknown>;
  source_file?: string;
  sourceFile?: string;
  positive_prompt?: string;
  negative_prompt?: string;
  cozyui?: any;
  parameters?: string;
  model?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  vae?: string;
  loras?: Array<{ name: string; model_weight?: number }>;
  denoise?: number;
  // Parsed prompts (for convenience)
  parsedPrompts?: {
    positive?: string;
    negative?: string;
  };
  error?: boolean;
}

/**
 * Extract text chunks from PNG file bytes
 */
export function extractPngTextChunks(bytes: Uint8Array): Record<string, string | null> {
  const result: Record<string, string | null> = {
    prompt: null,
    workflow: null,
    umbra_api_workflow: null,
    umbra_power_prompter: null,
    umbra_inpaint: null,
    umbra_metadata: null,
    positive_prompt: null,
    negative_prompt: null,
    cozyui: null,
    parameters: null,
  };

  // PNG signature is 8 bytes
  let offset = 8;

  while (offset < bytes.length - 12) {
    // Read chunk length (4 bytes, big endian)
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    offset += 4;

    // Check for tEXt or iTXt chunks
    if (type === 'tEXt' || type === 'iTXt') {
      const data = bytes.slice(offset, offset + length);
      let keyword = '';
      let value = '';

      if (type === 'tEXt') {
        const nullIndex = data.indexOf(0);
        if (nullIndex > -1) {
          keyword = String.fromCharCode(...data.slice(0, nullIndex));
          value = new TextDecoder('latin1').decode(data.slice(nullIndex + 1));
        }
      } else if (type === 'iTXt') {
        const null1 = data.indexOf(0);
        if (null1 > -1) {
          keyword = String.fromCharCode(...data.slice(0, null1));
          let ptr = null1 + 1;
          // Compression flag + compression method
          ptr += 2;
          const null2 = data.indexOf(0, ptr);
          if (null2 > -1) {
            // language tag
            ptr = null2 + 1;
            const null3 = data.indexOf(0, ptr);
            if (null3 > -1) {
              // translated keyword
              value = new TextDecoder('utf-8').decode(data.slice(null3 + 1));
            }
          }
        }
      }

      // Store recognized keywords
      if (keyword === 'prompt') result.prompt = value;
      else if (keyword === 'workflow') result.workflow = value;
      else if (keyword === 'umbra_api_workflow') result.umbra_api_workflow = value;
      else if (keyword === 'umbra_power_prompter') result.umbra_power_prompter = value;
      else if (keyword === 'umbra_inpaint') result.umbra_inpaint = value;
      else if (keyword === 'umbra_metadata') result.umbra_metadata = value;
      else if (keyword === 'positive_prompt') result.positive_prompt = value;
      else if (keyword === 'negative_prompt') result.negative_prompt = value;
      else if (keyword === 'cozyui') result.cozyui = value;
      else if (keyword === 'parameters') result.parameters = value;
    }

    // Move to next chunk (data + 4 byte CRC)
    offset += length + 4;

    // Stop at IEND
    if (type === 'IEND') break;
  }

  return result;
}

/**
 * Detect metadata format
 */
function detectFormat(textContent: Record<string, string | null>): ImageMetadata['format'] {
  if (textContent.workflow || textContent.prompt || textContent.umbra_inpaint || textContent.umbra_metadata) return 'comfyui';
  if (textContent.cozyui) return 'cozyui';
  if (textContent.positive_prompt || textContent.negative_prompt) return 'a1111';
  if (textContent.parameters) return 'a1111';
  return 'unknown';
}

/**
 * Extract metadata from PNG file
 */
export async function extractPngMetadata(
  input: File | Blob | ArrayBuffer
): Promise<ImageMetadata | null> {
  try {
    let buffer: ArrayBuffer;

    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else {
      buffer = await input.arrayBuffer();
    }

    const bytes = new Uint8Array(buffer);
    const textContent = extractPngTextChunks(bytes);

    const metadata: ImageMetadata = {
      type: 'image',
      format: detectFormat(textContent),
    };

    // Parse JSON chunks
    if (textContent.prompt) {
      try {
        metadata.prompt = JSON.parse(textContent.prompt);
      } catch (e) {
        console.warn('[Metadata] Failed to parse prompt JSON');
      }
    }

    if (textContent.workflow) {
      try {
        metadata.workflow = JSON.parse(textContent.workflow);
      } catch (e) {
        console.warn('[Metadata] Failed to parse workflow JSON');
      }
    }

    if (textContent.umbra_api_workflow) {
      try {
        metadata.umbra_api_workflow = JSON.parse(textContent.umbra_api_workflow);
        if (!metadata.workflow) metadata.workflow = metadata.umbra_api_workflow;
      } catch (e) {
        console.warn('[Metadata] Failed to parse Umbra API workflow JSON');
      }
    }

    if (textContent.umbra_power_prompter) {
      try {
        const powerPrompterMeta = JSON.parse(textContent.umbra_power_prompter);
        if (powerPrompterMeta && typeof powerPrompterMeta === 'object' && !Array.isArray(powerPrompterMeta)) {
          metadata.umbra_power_prompter = powerPrompterMeta;
          const sourceFile = String(powerPrompterMeta.source_file || powerPrompterMeta.sourceFile || '').trim();
          if (sourceFile) {
            metadata.source_file = sourceFile;
            metadata.sourceFile = sourceFile;
          }
        }
      } catch (e) {
        console.warn('[Metadata] Failed to parse Umbra Power Prompter JSON');
      }
    }

    if (textContent.umbra_inpaint) {
      try {
        const inpaintMeta = JSON.parse(textContent.umbra_inpaint);
        if (inpaintMeta && typeof inpaintMeta === 'object' && !Array.isArray(inpaintMeta)) {
          metadata.umbra_inpaint = inpaintMeta;
          if (typeof inpaintMeta.prompt === 'string') metadata.positive_prompt = inpaintMeta.prompt;
          if (typeof inpaintMeta.negativePrompt === 'string') metadata.negative_prompt = inpaintMeta.negativePrompt;
          if (typeof inpaintMeta.checkpointName === 'string') metadata.model = inpaintMeta.checkpointName;
          if (Number.isFinite(Number(inpaintMeta.seed))) metadata.seed = Number(inpaintMeta.seed);
          if (Number.isFinite(Number(inpaintMeta.steps))) metadata.steps = Number(inpaintMeta.steps);
          if (Number.isFinite(Number(inpaintMeta.cfg))) metadata.cfg = Number(inpaintMeta.cfg);
          if (typeof inpaintMeta.samplerName === 'string') metadata.sampler = inpaintMeta.samplerName;
          if (typeof inpaintMeta.scheduler === 'string') metadata.scheduler = inpaintMeta.scheduler;
          const region = inpaintMeta.generationRegion;
          if (region && typeof region === 'object') {
            if (Number.isFinite(Number(region.width))) metadata.width = Number(region.width);
            if (Number.isFinite(Number(region.height))) metadata.height = Number(region.height);
          }
          if (Number.isFinite(Number(inpaintMeta.denoise))) metadata.denoise = Number(inpaintMeta.denoise);
        }
      } catch (e) {
        console.warn('[Metadata] Failed to parse Umbra Inpaint JSON');
      }
    }

    if (textContent.umbra_metadata) {
      try {
        const umbraMeta = JSON.parse(textContent.umbra_metadata);
        if (umbraMeta && typeof umbraMeta === 'object' && !Array.isArray(umbraMeta)) {
          metadata.umbra_metadata = umbraMeta;
          if (!metadata.positive_prompt && typeof umbraMeta.positive_prompt === 'string') metadata.positive_prompt = umbraMeta.positive_prompt;
          if (!metadata.negative_prompt && typeof umbraMeta.negative_prompt === 'string') metadata.negative_prompt = umbraMeta.negative_prompt;
          if (!metadata.model && typeof umbraMeta.model === 'string') metadata.model = umbraMeta.model;
          if (metadata.seed === undefined && Number.isFinite(Number(umbraMeta.seed))) metadata.seed = Number(umbraMeta.seed);
          if (metadata.steps === undefined && Number.isFinite(Number(umbraMeta.steps))) metadata.steps = Number(umbraMeta.steps);
          if (metadata.cfg === undefined && Number.isFinite(Number(umbraMeta.cfg))) metadata.cfg = Number(umbraMeta.cfg);
          if (!metadata.sampler && typeof umbraMeta.sampler === 'string') metadata.sampler = umbraMeta.sampler;
          if (!metadata.scheduler && typeof umbraMeta.scheduler === 'string') metadata.scheduler = umbraMeta.scheduler;
          if (!metadata.width && Number.isFinite(Number(umbraMeta.width))) metadata.width = Number(umbraMeta.width);
          if (!metadata.height && Number.isFinite(Number(umbraMeta.height))) metadata.height = Number(umbraMeta.height);
          const sourceFile = String(umbraMeta.source_file || umbraMeta.sourceFile || '').trim();
          if (sourceFile) {
            metadata.source_file = sourceFile;
            metadata.sourceFile = sourceFile;
          }
        }
      } catch (e) {
        console.warn('[Metadata] Failed to parse Umbra metadata JSON');
      }
    }

    // Capture text prompts
    if (textContent.positive_prompt) {
      metadata.positive_prompt = textContent.positive_prompt;
    }
    if (textContent.negative_prompt) {
      metadata.negative_prompt = textContent.negative_prompt;
    }

    // Parse CozyUI metadata
    if (textContent.cozyui) {
      try {
        metadata.cozyui = JSON.parse(textContent.cozyui);
      } catch (e) {
        metadata.cozyui = textContent.cozyui;
      }
    }

    // Store parameters for legacy parsing.
    if (textContent.parameters) {
      metadata.parameters = textContent.parameters;
    }

    // Extract and store parsed prompts
    const prompts = extractPrompts(metadata);
    metadata.parsedPrompts = {
      positive: prompts.positive || undefined,
      negative: prompts.negative || undefined,
    };

    return metadata;
  } catch (err) {
    console.error('[Metadata] Extraction error:', err);
    return null;
  }
}

/**
 * Parse legacy generation parameter text.
 */
export function parseLegacyGenerationParameters(text: string): {
  positive: string;
  negative: string;
} {
  const result = { positive: '', negative: '' };

  if (!text) return result;

  // Split by "Negative prompt:"
  const negSplit = text.split(/Negative prompt:\s*/i);

  if (negSplit.length >= 2) {
    result.positive = negSplit[0].trim();
    // Negative prompt ends at the parameters line (Steps:, etc)
    const negPart = negSplit[1];
    const paramMatch = negPart.match(/\n(Steps:|Sampler:|CFG)/);
    if (paramMatch) {
      result.negative = negPart.substring(0, paramMatch.index).trim();
    } else {
      result.negative = negPart.split('\n')[0].trim();
    }
  } else {
    // No negative prompt marker, everything before Steps: is positive
    const paramMatch = text.match(/(Steps:|Sampler:|CFG)/);
    if (paramMatch) {
      result.positive = text.substring(0, paramMatch.index).trim();
    } else {
      result.positive = text.trim();
    }
  }

  return result;
}

/**
 * Extract prompts from metadata with fallbacks
 */
export function extractPrompts(metadata: ImageMetadata): {
  positive: string | null;
  negative: string | null;
} {
  let positive = metadata.positive_prompt || null;
  let negative = metadata.negative_prompt || null;

  if (metadata.umbra_power_prompter) {
    const powerPrompter = metadata.umbra_power_prompter;
    if (!positive && powerPrompter.prompt !== undefined) positive = String(powerPrompter.prompt || '').trim() || null;
    if (!negative && powerPrompter.negativePrompt !== undefined) negative = String(powerPrompter.negativePrompt || '').trim() || null;
    if (!negative && powerPrompter.negative_prompt !== undefined) negative = String(powerPrompter.negative_prompt || '').trim() || null;
  }

  // Try CozyUI metadata
  if (metadata.cozyui) {
    const cozy = metadata.cozyui;
    if (!positive && cozy.positive) positive = cozy.positive;
    if (!negative && cozy.negative) negative = cozy.negative;
  }

  // Try legacy parameter text as fallback.
  if (metadata.parameters && (!positive || !negative)) {
    const parsed = parseLegacyGenerationParameters(metadata.parameters);
    if (!positive && parsed.positive) positive = parsed.positive;
    if (!negative && parsed.negative) negative = parsed.negative;
  }

  return { positive, negative };
}

/**
 * Extract generation parameters from metadata
 */
export function extractGenerationParams(metadata: ImageMetadata): Partial<ImageMetadata> {
  const params: Partial<ImageMetadata> = {};

  // Try direct metadata fields first (from ImageItem)
  if (metadata.model) params.model = metadata.model;
  if (metadata.seed !== undefined) params.seed = metadata.seed;
  if (metadata.steps) params.steps = metadata.steps;
  if (metadata.cfg) params.cfg = metadata.cfg;
  if (metadata.sampler) params.sampler = metadata.sampler;
  if (metadata.scheduler) params.scheduler = metadata.scheduler;
  if (metadata.width) params.width = metadata.width;
  if (metadata.height) params.height = metadata.height;
  if (metadata.denoise !== undefined) params.denoise = metadata.denoise;

  if (metadata.umbra_inpaint) {
    const inpaint = metadata.umbra_inpaint;
    if (!params.model && typeof inpaint.checkpointName === 'string') params.model = inpaint.checkpointName;
    if (params.seed === undefined && Number.isFinite(Number(inpaint.seed))) params.seed = Number(inpaint.seed);
    if (!params.steps && Number.isFinite(Number(inpaint.steps))) params.steps = Number(inpaint.steps);
    if (params.cfg === undefined && Number.isFinite(Number(inpaint.cfg))) params.cfg = Number(inpaint.cfg);
    if (!params.sampler && typeof inpaint.samplerName === 'string') params.sampler = inpaint.samplerName;
    if (!params.scheduler && typeof inpaint.scheduler === 'string') params.scheduler = inpaint.scheduler;
    if (params.denoise === undefined && Number.isFinite(Number(inpaint.denoise))) params.denoise = Number(inpaint.denoise);
    const region = inpaint.generationRegion;
    if (region && typeof region === 'object') {
      const width = Number((region as Record<string, unknown>).width);
      const height = Number((region as Record<string, unknown>).height);
      if (!params.width && Number.isFinite(width)) params.width = width;
      if (!params.height && Number.isFinite(height)) params.height = height;
    }
  }

  // Try CozyUI metadata
  if (metadata.cozyui) {
    const cozy = metadata.cozyui;
    if (!params.model && cozy.model) params.model = cozy.model;
    if (params.seed === undefined && cozy.seed !== undefined) params.seed = cozy.seed;
    if (!params.steps && cozy.steps) params.steps = cozy.steps;
    if (!params.cfg && cozy.cfg) params.cfg = cozy.cfg;
    if (!params.sampler && cozy.sampler) params.sampler = cozy.sampler;
    if (!params.scheduler && cozy.scheduler) params.scheduler = cozy.scheduler;
    if (!params.width && cozy.width) params.width = cozy.width;
    if (!params.height && cozy.height) params.height = cozy.height;
    if (cozy.vae) params.vae = cozy.vae;
    if (cozy.denoise !== undefined) params.denoise = cozy.denoise;
    if (cozy.loras) params.loras = cozy.loras;
  }

  // Try ComfyUI workflow metadata
  if (metadata.workflow?.nodes) {
    // Find KSampler node
    const samplerNode = Object.values(metadata.workflow.nodes as any[]).find(
      (node: any) =>
        node.class_type === 'KSampler'
        || node.class_type === 'KSamplerAdvanced'
        || node.class_type === 'UmbraKSampler'
    );
    if (samplerNode?.inputs) {
      if (!params.seed && samplerNode.inputs.seed !== undefined) params.seed = samplerNode.inputs.seed;
      if (!params.steps && samplerNode.inputs.steps) params.steps = samplerNode.inputs.steps;
      if (!params.cfg && samplerNode.inputs.cfg) params.cfg = samplerNode.inputs.cfg;
      if (!params.sampler && samplerNode.inputs.sampler_name) params.sampler = samplerNode.inputs.sampler_name;
      if (!params.scheduler && samplerNode.inputs.scheduler) params.scheduler = samplerNode.inputs.scheduler;
    }
    
    // Find CheckpointLoader node for model
    const checkpointNode = Object.values(metadata.workflow.nodes as any[]).find(
      (node: any) => node.class_type === 'CheckpointLoaderSimple'
    );
    if (checkpointNode?.inputs?.ckpt_name && !params.model) {
      params.model = checkpointNode.inputs.ckpt_name;
    }

    // Find EmptyLatentImage for dimensions
    const latentNode = Object.values(metadata.workflow.nodes as any[]).find(
      (node: any) => node.class_type === 'EmptyLatentImage'
    );
    if (latentNode?.inputs) {
      if (!params.width && latentNode.inputs.width) params.width = latentNode.inputs.width;
      if (!params.height && latentNode.inputs.height) params.height = latentNode.inputs.height;
    }
  }

  // Try ComfyUI prompt metadata (alternative format)
  if (metadata.prompt) {
    const nodes = metadata.prompt;
    for (const key in nodes) {
      const node = nodes[key];
      if (
        node.class_type === 'KSampler'
        || node.class_type === 'KSamplerAdvanced'
        || node.class_type === 'UmbraKSampler'
      ) {
        if (!params.seed && node.inputs?.seed !== undefined) params.seed = node.inputs.seed;
        if (!params.steps && node.inputs?.steps) params.steps = node.inputs.steps;
        if (!params.cfg && node.inputs?.cfg) params.cfg = node.inputs.cfg;
        if (!params.sampler && node.inputs?.sampler_name) params.sampler = node.inputs.sampler_name;
        if (!params.scheduler && node.inputs?.scheduler) params.scheduler = node.inputs.scheduler;
      }
      if (node.class_type === 'CheckpointLoaderSimple' && !params.model) {
        params.model = node.inputs?.ckpt_name;
      }
      if (node.class_type === 'EmptyLatentImage') {
        if (!params.width && node.inputs?.width) params.width = node.inputs.width;
        if (!params.height && node.inputs?.height) params.height = node.inputs.height;
      }
    }
  }

  // Try legacy generation parameter format.
  if (metadata.parameters && typeof metadata.parameters === 'string') {
    const paramText = metadata.parameters;
    const lines = paramText.split('\n');
    
    for (const line of lines) {
      // Look for parameter lines like "Steps: 20, Sampler: DPM++ 2M, CFG scale: 7, Seed: 123, Size: 512x512, Model: model_name"
      if (line.match(/^(Steps|Sampler|Scheduler|Schedule type|CFG|Seed|Size|Model):/)) {
        const paramParts = line.split(',').map(p => p.trim());
        
        for (const part of paramParts) {
          if (!params.steps && part.startsWith('Steps:')) {
            const val = parseInt(part.split(':')[1].trim());
            if (!isNaN(val)) params.steps = val;
          } else if (!params.sampler && part.startsWith('Sampler:')) {
            params.sampler = part.split(':')[1].trim();
          } else if (!params.cfg && (part.startsWith('CFG scale:') || part.startsWith('CFG:'))) {
            const val = parseFloat(part.split(':').slice(1).join(':').trim());
            if (!isNaN(val)) params.cfg = val;
          } else if (!params.seed && part.startsWith('Seed:')) {
            const val = parseInt(part.split(':')[1].trim());
            if (!isNaN(val)) params.seed = val;
          } else if ((!params.width || !params.height) && part.startsWith('Size:')) {
            const size = part.split(':')[1].trim();
            const match = size.match(/(\d+)\s*[x×]\s*(\d+)/);
            if (match) {
              params.width = parseInt(match[1]);
              params.height = parseInt(match[2]);
            }
          } else if (!params.model && part.startsWith('Model:')) {
            params.model = part.split(':')[1].trim();
          } else if (!params.scheduler && part.startsWith('Scheduler:')) {
            params.scheduler = part.split(':').slice(1).join(':').trim();
          } else if (!params.scheduler && part.startsWith('Schedule type:')) {
            params.scheduler = part.split(':').slice(1).join(':').trim();
          }
        }
      }
    }
  }

  // Final fallback if API/parser already provided scheduler directly.
  if (!params.scheduler && metadata.scheduler) {
    params.scheduler = String(metadata.scheduler);
  }

  return params;
}

export function getComfyUiJsonText(metadata: ImageMetadata): string | null {
  return getWorkflowJsonExport(metadata)?.text ?? null;
}

export type WorkflowJsonExport = {
  text: string;
  label: string;
  kind: 'workflow' | 'prompt';
  filenameSuffix: string;
};

function looksLikeComfyApiPromptGraph(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  let inspected = 0;
  let matching = 0;
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    inspected += 1;
    const node = value as Record<string, unknown>;
    if ('class_type' in node && node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs)) {
      matching += 1;
    }
    if (inspected >= 8) break;
  }
  return inspected > 0 && matching === inspected;
}

function looksLikeComfyUiWorkflow(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return Array.isArray(record.nodes) || Array.isArray(record.links) || Number.isFinite(record.last_node_id);
}

export function getWorkflowJsonExport(metadata: ImageMetadata | null | undefined): WorkflowJsonExport | null {
  if (!metadata) return null;
  const workflowPayload = metadata.workflow;
  const workflowIsApiPromptGraph = looksLikeComfyApiPromptGraph(workflowPayload);
  const apiWorkflowPayload = metadata.umbra_api_workflow;
  const promptPayload = metadata.prompt
    ?? (workflowIsApiPromptGraph ? workflowPayload : undefined)
    ?? apiWorkflowPayload;
  const hasRealWorkflow = workflowPayload !== undefined
    && workflowPayload !== null
    && (looksLikeComfyUiWorkflow(workflowPayload) || !workflowIsApiPromptGraph);
  const payload = hasRealWorkflow ? workflowPayload : promptPayload;
  if (payload === undefined || payload === null) return null;

  let text = '';
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    text = trimmed;
  } else {
    try {
      text = JSON.stringify(payload, null, 2);
    } catch {
      return null;
    }
  }
  if (!text.trim()) return null;

  const kind = hasRealWorkflow ? 'workflow' : 'prompt';
  return {
    text,
    kind,
    label: hasRealWorkflow ? 'ComfyUI Workflow JSON' : 'ComfyUI Prompt Graph JSON',
    filenameSuffix: hasRealWorkflow ? 'workflow.json' : 'prompt.json',
  };
}

export function getComfyWorkflowJsonExport(metadata: ImageMetadata | null | undefined): WorkflowJsonExport | null {
  if (!metadata || metadata.workflow === undefined || metadata.workflow === null) return null;
  const payload = metadata.workflow;
  if (!looksLikeComfyUiWorkflow(payload) || looksLikeComfyApiPromptGraph(payload)) return null;

  let text = '';
  if (typeof payload === 'string') {
    text = payload.trim();
  } else {
    try {
      text = JSON.stringify(payload, null, 2);
    } catch {
      return null;
    }
  }
  if (!text.trim()) return null;
  return {
    text,
    kind: 'workflow',
    label: 'ComfyUI Workflow JSON',
    filenameSuffix: 'workflow.json',
  };
}

export function getLegacyGenerationParametersText(metadata: ImageMetadata): string | null {
  if (typeof metadata.parameters === 'string' && metadata.parameters.trim()) {
    return metadata.parameters.trim();
  }

  const prompts = extractPrompts(metadata);
  const params = extractGenerationParams(metadata);
  const sections: string[] = [];

  if (prompts.positive) sections.push(prompts.positive.trim());
  if (prompts.negative) sections.push(`Negative prompt: ${prompts.negative.trim()}`);

  const paramParts: string[] = [];
  if (params.steps !== undefined && params.steps !== null) paramParts.push(`Steps: ${params.steps}`);
  if (params.sampler) paramParts.push(`Sampler: ${params.sampler}`);
  if (params.scheduler) paramParts.push(`Scheduler: ${params.scheduler}`);
  if (params.cfg !== undefined && params.cfg !== null) paramParts.push(`CFG scale: ${params.cfg}`);
  if (params.seed !== undefined && params.seed !== null) paramParts.push(`Seed: ${params.seed}`);
  if (params.width && params.height) paramParts.push(`Size: ${params.width}x${params.height}`);
  if (params.model) paramParts.push(`Model: ${params.model}`);

  if (paramParts.length > 0) {
    sections.push(paramParts.join(', '));
  }

  const text = sections.join('\n').trim();
  return text || null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Escape HTML for safe display
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Syntax highlight JSON
 */
export function syntaxHighlightJson(json: string): string {
  json = String(json ?? '');
  // Escape HTML first
  json = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Add color spans
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/**
 * Extract metadata from image file (client-side)
 */
export async function extractMetadataFromFile(file: File): Promise<ImageMetadata> {
  const metadata: ImageMetadata = {
    type: 'image',
    name: file.name,
    size: file.size
  };

  // Only process image files
  if (!file.type.startsWith('image/')) {
    metadata.type = 'video';
    return metadata;
  }

  // Prefer backend parser for consistency with saved-output metadata parsing.
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const response = await fetch('/api/metadata/scan-upload', {
      method: 'POST',
      body: formData,
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (payload && typeof payload === 'object') {
        Object.assign(metadata, payload);
        return metadata;
      }
    }
  } catch {
    // Fall back to local PNG parser.
  }

  try {
    const buffer = await file.arrayBuffer();
    const extracted = await extractPngMetadata(buffer);
    if (extracted) {
      Object.assign(metadata, extracted);
    }
  } catch (err) {
    console.error('[Metadata] Extraction error:', err);
  }

  return metadata;
}

/**
 * Extract metadata from image path (via backend API)
 */
export async function extractMetadataFromPath(imagePath: string): Promise<ImageMetadata | null> {
  try {
    const res = await fetch('/api/metadata/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath })
    });

    if (!res.ok) {
      console.error('[Metadata] API error:', res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('[Metadata] Failed to extract metadata:', err);
    return null;
  }
}
