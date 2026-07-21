type PromptGraphNode = {
  class_type?: unknown;
  inputs?: Record<string, unknown>;
};

export type UmbraUiClipSkipGraphResult = {
  clipSkip: number;
  bypassedNodeIds: string[];
  configuredNodeIds: string[];
};

function isPromptGraphReference(value: unknown): value is [string, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'string'
    && Number.isFinite(Number(value[1]));
}

function replacePromptGraphReference(
  value: unknown,
  targetNodeId: string,
  replacement: [string, number],
): unknown {
  if (isPromptGraphReference(value) && value[0] === targetNodeId) {
    return [...replacement];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replacePromptGraphReference(entry, targetNodeId, replacement));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      replacePromptGraphReference(entry, targetNodeId, replacement),
    ]));
  }
  return value;
}

function normalizeClipSkip(value: unknown): number {
  const numeric = Math.floor(Math.abs(Number(value)));
  return Number.isFinite(numeric) && numeric >= 1 ? numeric : 1;
}

/**
 * ComfyUI's CLIPSetLastLayer is an actual CLIP mutation, even at layer -1.
 * Umbra's user-facing value of 1 means normal checkpoint CLIP and must bypass it.
 */
export function applyUmbraUiClipSkipToGraph(
  graph: Record<string, PromptGraphNode>,
  requestedClipSkip: unknown,
): UmbraUiClipSkipGraphResult {
  const clipSkip = normalizeClipSkip(requestedClipSkip);
  const bypassedNodeIds: string[] = [];
  const configuredNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(graph)) {
    if (String(node?.class_type || '').trim() !== 'CLIPSetLastLayer') continue;

    if (clipSkip > 1) {
      node.inputs = node.inputs && typeof node.inputs === 'object' ? node.inputs : {};
      node.inputs.stop_at_clip_layer = -clipSkip;
      configuredNodeIds.push(nodeId);
      continue;
    }

    const clipInput = node?.inputs?.clip;
    if (!isPromptGraphReference(clipInput)) {
      throw new Error(
        `CLIPSetLastLayer node ${nodeId} cannot be bypassed because its clip input is not connected.`,
      );
    }
    const replacement: [string, number] = [clipInput[0], Number(clipInput[1])];
    for (const [consumerId, consumerNode] of Object.entries(graph)) {
      if (consumerId === nodeId || !consumerNode?.inputs || typeof consumerNode.inputs !== 'object') continue;
      consumerNode.inputs = replacePromptGraphReference(
        consumerNode.inputs,
        nodeId,
        replacement,
      ) as Record<string, unknown>;
    }
    delete graph[nodeId];
    bypassedNodeIds.push(nodeId);
  }

  return { clipSkip, bypassedNodeIds, configuredNodeIds };
}

