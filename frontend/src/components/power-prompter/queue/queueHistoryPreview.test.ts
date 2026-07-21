import { describe, expect, test } from 'bun:test';
import {
  normalizePowerPrompterQueueHistoryPreviewImages,
  normalizePowerPrompterQueueHistorySummary,
} from './queuePersistence';

function makePreview(index: number) {
  return {
    id: `raw-${index}`,
    fullpath: `C:/Umbra/Outputs/image-${index}.png`,
    filename: `image-${index}.png`,
    type: 'image',
    promptIndex: index,
    promptId: `prompt-${index}`,
    setId: 2,
    modified: 1000 + index,
  };
}

describe('queue history preview image normalization', () => {
  test('dedupes explicit paths and stores bounded stable preview metadata', () => {
    const normalized = normalizePowerPrompterQueueHistoryPreviewImages([
      makePreview(1),
      { ...makePreview(2), fullpath: '', fullPath: 'C:/Umbra/Outputs/image-2.png' },
      { ...makePreview(1), fullpath: 'C:/Umbra/Outputs/image-1.png', filename: 'duplicate.png' },
      { filename: 'missing-path.png' },
      { path: 'https://example.com/not-local.png' },
      ...Array.from({ length: 30 }, (_, index) => makePreview(index + 3)),
    ]);

    expect(normalized).toHaveLength(20);
    expect(normalized[0]).toMatchObject({
      path: 'C:/Umbra/Outputs/image-1.png',
      name: 'image-1.png',
      type: 'image',
      promptIndex: 1,
      promptId: 'prompt-1',
      setId: 2,
      modified: 1001,
    });
    expect(normalized[1]?.path).toBe('C:/Umbra/Outputs/image-2.png');
    expect(new Set(normalized.map((entry) => entry.path)).size).toBe(normalized.length);
    expect(normalized.some((entry) => entry.path.includes('https://'))).toBe(false);
    expect(normalized.some((entry) => entry.name === 'missing-path.png')).toBe(false);
  });

  test('queue history summaries expose preview images and editor snapshot availability', () => {
    const summary = normalizePowerPrompterQueueHistorySummary({
      id: 'history-1',
      name: 'History 1',
      createdAt: 1,
      updatedAt: 2,
      promptCount: 1,
      activeSetId: 1,
      mode: 'selected',
      status: 'completed',
      previewImages: [makePreview(1)],
      snapshot: {
        version: 1,
        savedAt: 1,
        file: 'batch.ppcards.json',
        mode: 'selected',
        activeSetId: 1,
        queueTargetType: 'pipeline',
        targetBridgeId: 'workflow',
        requestIds: ['request-1'],
        prompts: ['prompt'],
        promptSetIds: [1],
        promptOutputSubfolders: [''],
        promptStyleNames: [''],
        promptSeedGroupIds: ['1:0'],
        generation: {},
        generationByPrompt: [{}],
        randomApplied: false,
        paused: true,
        dispatchDelayMs: 0,
        groupSnapshots: [{
          id: 'request-1',
          requestId: 'request-1',
          promptStartIndex: 0,
          promptCount: 1,
          editorSnapshot: {
            version: 1,
            sourceFile: 'batch.ppcards.json',
            document: { version: 1, file: 'batch.ppcards.json', cards: [], generation: {} },
            queueBuildSettings: { traversalMode: 'cycle', diversity: 0, promptLimit: null, shuffleEnabled: false, shuffleSeed: 0 },
          },
        }],
      },
    });

    expect(summary?.previewImages).toHaveLength(1);
    expect(summary?.previewImages[0]?.path).toBe('C:/Umbra/Outputs/image-1.png');
    expect(summary?.hasEditorSnapshot).toBe(true);
  });
});
