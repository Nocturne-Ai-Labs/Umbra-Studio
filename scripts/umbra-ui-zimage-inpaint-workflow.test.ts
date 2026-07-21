import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { listUmbraUiInpaintPipelineGraphIssues } from '../backend/UmbraUiPipelineCapabilities';
import { requiredPromptNodeClasses, type QualificationCase } from './qualify-umbra-ui-inpaint';

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type WorkflowGraph = Record<string, WorkflowNode>;

function graphReference(value: unknown): [string, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const nodeId = String(value[0] || '').trim();
  const output = Number(value[1]);
  return nodeId && Number.isFinite(output) ? [nodeId, output] : null;
}

function findNode(
  graph: WorkflowGraph,
  predicate: (node: WorkflowNode) => boolean,
): [string, WorkflowNode] {
  const match = Object.entries(graph).find(([, node]) => predicate(node));
  if (!match) throw new Error('Expected workflow node was not found.');
  return match;
}

describe('shipped Z-Image Turbo native inpaint workflow', () => {
  test('requires a regional timing node only for a restricted step range', () => {
    const baseCase = {
      operationMode: 'inpaint',
      modelFamily: 'Z-Image Turbo',
      modelSource: 'diffusion_model',
      checkpointName: 'z-image.safetensors',
      prompt: 'repair',
      width: 1024,
      height: 1024,
    } as QualificationCase;
    const fullRange = requiredPromptNodeClasses({
      ...baseCase,
      regionalGuidance: [{ id: 'full', beginStepPercent: 0, endStepPercent: 1 }],
    }, 'native_edit', 'Z-Image Turbo');
    const restricted = requiredPromptNodeClasses({
      ...baseCase,
      regionalGuidance: [{ id: 'restricted', beginStepPercent: 0.1, endStepPercent: 0.9 }],
    }, 'native_edit', 'Z-Image Turbo');
    expect(fullRange).not.toContain('ConditioningSetTimestepRange');
    expect(restricted).toContain('ConditioningSetTimestepRange');
  });

  test('keeps source and mask on a permanent model-native edit path before optional controls', async () => {
    const projectRoot = resolve(import.meta.dir, '..');
    const workflowPath = join(
      projectRoot,
      'defaults',
      'PowerPrompter',
      'API Workflows',
      '[Umbra UI] Z-Image Turbo Inpaint Pipeline.json',
    );
    const graph = JSON.parse(await readFile(workflowPath, 'utf8')) as WorkflowGraph;
    const descriptor = Object.values(graph)
      .flatMap((node) => Array.isArray(node._meta?.umbra_ui_pipelines) ? node._meta.umbra_ui_pipelines : [])
      .find((entry: any) => entry?.feature === 'inpainting');
    expect(descriptor?.model_family).toBe('Z-Image Turbo');
    expect(descriptor?.inpaint_adapter).toBe('native_edit');
    expect(listUmbraUiInpaintPipelineGraphIssues(graph, {
      modelFamily: 'Z-Image Turbo',
      modelSources: ['diffusion_model', 'unet', 'gguf'],
      inpaintAdapter: 'native_edit',
    })).toEqual([]);

    const [sourceId] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_source');
    const [maskId] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_mask');
    const [processorId, processor] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_mask_processor');
    const [patchId, patch] = findNode(graph, (node) => node.class_type === 'ModelPatchLoader');
    const [nativeEditId, nativeEdit] = findNode(graph, (node) => node.class_type === 'ZImageFunControlnet');
    const [sinkId, sink] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_control_model_sink');
    const [, sampler] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_sampler');
    const [compositeId, composite] = findNode(graph, (node) => node.class_type === 'ImageCompositeMasked');
    const [, output] = findNode(graph, (node) => node._meta?.umbra_role === 'inpaint_output');

    expect(patch.inputs?.name).toBe('Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors');
    expect(graphReference(processor.inputs?.mask)?.[0]).toBe(maskId);
    expect(graphReference(nativeEdit.inputs?.model_patch)?.[0]).toBe(patchId);
    expect(graphReference(nativeEdit.inputs?.inpaint_image)?.[0]).toBe(sourceId);
    expect(graphReference(nativeEdit.inputs?.mask)?.[0]).toBe(processorId);
    expect(graphReference(sink.inputs?.model)?.[0]).toBe(nativeEditId);
    expect(sink._meta?.umbra_control_adapter).toBe('z_image_control');
    expect(graphReference(sampler.inputs?.model)?.[0]).toBe(sinkId);
    expect(graphReference(composite.inputs?.destination)?.[0]).toBe(sourceId);
    expect(graphReference(composite.inputs?.mask)?.[0]).toBe(processorId);
    expect(graphReference(output.inputs?.images)?.[0]).toBe(compositeId);
  });
});
