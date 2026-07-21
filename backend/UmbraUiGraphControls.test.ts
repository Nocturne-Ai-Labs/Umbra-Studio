import { describe, expect, test } from 'bun:test';
import { applyUmbraUiClipSkipToGraph } from './UmbraUiGraphControls';

describe('applyUmbraUiClipSkipToGraph', () => {
  test('bypasses CLIPSetLastLayer when clip skip is 1', () => {
    const graph = {
      loader: { class_type: 'CheckpointLoaderSimple', inputs: {} },
      clipSkip: {
        class_type: 'CLIPSetLastLayer',
        inputs: { clip: ['loader', 1], stop_at_clip_layer: -1 },
      },
      positive: {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['clipSkip', 0], text: 'test' },
      },
      nested: {
        class_type: 'TestNode',
        inputs: { routes: { clip: ['clipSkip', 0] } },
      },
    };

    const result = applyUmbraUiClipSkipToGraph(graph, 1);

    expect(result).toEqual({
      clipSkip: 1,
      bypassedNodeIds: ['clipSkip'],
      configuredNodeIds: [],
    });
    expect(graph.clipSkip).toBeUndefined();
    expect(graph.positive.inputs.clip).toEqual(['loader', 1]);
    expect(graph.nested.inputs.routes.clip).toEqual(['loader', 1]);
  });

  test('keeps and configures CLIPSetLastLayer for clip skip values above 1', () => {
    const graph = {
      loader: { class_type: 'CheckpointLoaderSimple', inputs: {} },
      clipSkip: {
        class_type: 'CLIPSetLastLayer',
        inputs: { clip: ['loader', 1], stop_at_clip_layer: -1 },
      },
      positive: {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['clipSkip', 0], text: 'test' },
      },
    };

    const result = applyUmbraUiClipSkipToGraph(graph, 2);

    expect(result).toEqual({
      clipSkip: 2,
      bypassedNodeIds: [],
      configuredNodeIds: ['clipSkip'],
    });
    expect(graph.clipSkip.inputs.stop_at_clip_layer).toBe(-2);
    expect(graph.positive.inputs.clip).toEqual(['clipSkip', 0]);
  });

  test('fully bypasses chained CLIPSetLastLayer nodes', () => {
    const graph = {
      loader: { class_type: 'CheckpointLoaderSimple', inputs: {} },
      first: { class_type: 'CLIPSetLastLayer', inputs: { clip: ['loader', 1] } },
      second: { class_type: 'CLIPSetLastLayer', inputs: { clip: ['first', 0] } },
      positive: { class_type: 'CLIPTextEncode', inputs: { clip: ['second', 0] } },
    };

    applyUmbraUiClipSkipToGraph(graph, 1);

    expect(graph.first).toBeUndefined();
    expect(graph.second).toBeUndefined();
    expect(graph.positive.inputs.clip).toEqual(['loader', 1]);
  });

  test('rejects a disconnected CLIPSetLastLayer instead of emitting a broken graph', () => {
    const graph = {
      clipSkip: { class_type: 'CLIPSetLastLayer', inputs: { stop_at_clip_layer: -1 } },
    };

    expect(() => applyUmbraUiClipSkipToGraph(graph, 1)).toThrow(
      'CLIPSetLastLayer node clipSkip cannot be bypassed because its clip input is not connected.',
    );
  });
});

