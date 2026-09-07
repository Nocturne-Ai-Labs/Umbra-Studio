import { getSavedQueueAvailability } from '../shared/power-prompter/savedQueue';
import { parseUmbraUiPipelineTargetId } from '../shared/umbra-ui/pipelineTypes';

type RecordValue = Record<string, any>;
interface SavedQueueRequest {
  requestId: string;
  origin: string;
  mode: string;
  activeSetId: number;
  pipelineId: string;
  prompts: Array<{
    promptIndex: number;
    status: string;
    prompt: string;
    generation: unknown;
    seed: number;
    setId: number;
    outputSubfolder: string;
    styleName: string;
  }>;
}

export function buildRemainingPowerPrompterQueueSnapshot(
  state: { paused: boolean; requests: SavedQueueRequest[] },
  snapshots: Map<string, RecordValue>,
): RecordValue {
  const availability = getSavedQueueAvailability(state);
  if (!availability.canSave) throw new Error(availability.reason);
  const result: RecordValue = {
    version: 1, snapshotSchemaVersion: 3, savedAt: Date.now(), paused: true,
    queueTargetType: 'pipeline', randomApplied: true,
    requestIds: [], prompts: [], promptEntries: [], promptSetIds: [], promptOutputSubfolders: [],
    promptStyleNames: [], promptSeedGroupIds: [], generationByPrompt: [], groupSnapshots: [],
  };
  for (const request of state.requests) {
    if (request.origin !== 'power_prompter') continue;
    const remaining = request.prompts.filter((prompt) => prompt.status === 'pending');
    if (!remaining.length) continue;
    const source = snapshots.get(request.requestId);
    if (!source) throw new Error('Power Prompter queue metadata is unavailable. The queue was not saved.');
    const start = result.prompts.length;
    const editorSnapshot = source.groupSnapshots?.find((group: RecordValue) => group.requestId === request.requestId)?.editorSnapshot;
    for (const prompt of remaining) {
      const index = prompt.promptIndex;
      result.requestIds.push(request.requestId);
      result.prompts.push(prompt.prompt);
      result.promptEntries.push({ ...(source.promptEntries?.[index] || { tokens: [] }), prompt: prompt.prompt });
      result.promptSetIds.push(prompt.setId);
      result.promptOutputSubfolders.push(prompt.outputSubfolder);
      result.promptStyleNames.push(prompt.styleName);
      result.promptSeedGroupIds.push(source.promptSeedGroupIds?.[index] || `${request.requestId}:${index}`);
      result.generationByPrompt.push({ ...(prompt.generation as RecordValue), seed: prompt.seed });
    }
    result.groupSnapshots.push({
      id: request.requestId, requestId: request.requestId, mode: request.mode, activeSetId: request.activeSetId,
      promptStartIndex: start, promptCount: remaining.length,
      promptIndices: remaining.map((_, index) => start + index),
      targetBridgeId: request.pipelineId, file: source.file || null,
      dispatchDelayMs: source.dispatchDelayMs || 0, editorSnapshot,
    });
    if (start === 0) Object.assign(result, {
      file: source.file || null, mode: request.mode, activeSetId: request.activeSetId,
      targetBridgeId: request.pipelineId, dispatchDelayMs: source.dispatchDelayMs || 0,
      generation: result.generationByPrompt[0],
    });
  }
  return result;
}

export function splitSavedPowerPrompterQueue(snapshot: RecordValue): Array<{ mode: string; prompts: string[]; state: RecordValue }> {
  const byRequest = new Map<string, number[]>();
  for (let index = 0; index < snapshot.prompts.length; index++) {
    const id = snapshot.requestIds?.[index] || 'saved';
    const indices = byRequest.get(id) || [];
    indices.push(index);
    byRequest.set(id, indices);
  }
  return [...byRequest].map(([id, indices]) => {
    const group = snapshot.groupSnapshots?.find((entry: RecordValue) => entry.requestId === id) || {};
    const pick = (key: string) => indices.map((index) => snapshot[key]?.[index]);
    const prompts = pick('prompts');
    const generationByPrompt = pick('generationByPrompt');
    const targetBridgeId = group.targetBridgeId || snapshot.targetBridgeId;
    const pipeline = parseUmbraUiPipelineTargetId(targetBridgeId);
    if (!pipeline) throw new Error('Saved queue has no supported Umbra pipeline.');
    return {
      mode: group.mode || snapshot.mode,
      prompts,
      state: {
        queueOrigin: 'power_prompter', queueTargetType: 'pipeline', targetBridgeId, pipeline,
        sourceFile: group.file ?? snapshot.file, file: group.file ?? snapshot.file,
        activeSetId: group.activeSetId || snapshot.activeSetId, activeQueueSet: group.activeSetId || snapshot.activeSetId,
        prompts, activePrompt: prompts[0], generation: generationByPrompt[0] || snapshot.generation,
        generationByPrompt, promptSetIds: pick('promptSetIds'), promptOutputSubfolders: pick('promptOutputSubfolders'),
        promptStyleNames: pick('promptStyleNames'), promptSeedGroupIds: pick('promptSeedGroupIds'),
        promptEntries: snapshot.promptEntries ? pick('promptEntries') : undefined,
        editorSnapshot: group.editorSnapshot, dispatchDelayMs: group.dispatchDelayMs ?? snapshot.dispatchDelayMs,
        randomApplied: true, restoredSavedQueue: true,
      },
    };
  });
}
