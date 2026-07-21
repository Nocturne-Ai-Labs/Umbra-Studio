import { describe, expect, test } from 'bun:test';
import {
  assessUmbraUiCancelIsolation,
  assessUmbraUiRestartRecovery,
  assessUmbraUiSharedQueueIsolation,
  countUmbraUiRuntimeOutputs,
  isUmbraUiRuntimeJobTerminal,
} from './umbra-ui-inpaint-runtime-drills';
import {
  assessUmbraUiPartialFailure,
  prepareSharedQueueWorkflowGraph,
  resolveSharedQueueComfyOutputPath,
} from './drill-umbra-ui-inpaint-runtime';

function partialFailureAssessmentFixture() {
  const successfulPath = 'Tools/ComfyUI/output/Umbra UI/Qualification/partial-success.png';
  const initialJob = {
    id: 'partial-job',
    status: 'running',
    total: 2,
    completed: 0,
    failed: 0,
    items: [
      { id: 'sample-running', status: 'running', promptId: 'prompt-running', outputs: [], error: '' },
      { id: 'sample-queued', status: 'running', promptId: 'prompt-queued', outputs: [], error: '' },
    ],
  };
  const terminalJob = {
    id: 'partial-job',
    status: 'partial',
    total: 2,
    completed: 1,
    failed: 1,
    items: [
      {
        id: 'sample-running',
        status: 'completed',
        promptId: 'prompt-running',
        outputs: [{
          filename: 'partial-success.png',
          subfolder: 'Umbra UI/Qualification',
          type: 'output',
          fullpath: successfulPath,
        }],
        error: '',
      },
      {
        id: 'sample-queued',
        status: 'failed',
        promptId: 'prompt-queued',
        outputs: [],
        error: 'ComfyUI no longer reports inpaint prompt prompt-queued in history or its active queue.',
      },
    ],
  };
  const outputChecks = [{ path: successfulPath, mediaReachable: true, metadataReachable: true }];
  const evidence = {
    initialJob,
    observedRunningPromptIds: ['prompt-running'],
    observedQueuedPromptIds: ['prompt-queued'],
    deleteRequestedPromptIds: ['prompt-queued'],
    deleteResponseStatus: 200,
    postDeleteRunningPromptIds: ['prompt-running'],
    postDeleteQueuedPromptIds: [],
    deletedPromptHistoryPresent: false,
    removalConfirmations: 3,
  };
  return { initialJob, terminalJob, outputChecks, evidence };
}

describe('Umbra UI inpaint runtime drill evidence', () => {
  test('prepares a bounded unmanaged workflow without enabling optional detail or upscale stages', () => {
    const source = {
      reader: {
        class_type: 'UmbraPowerPrompterReader',
        inputs: { prompt_text: 'old', negative_prompt: 'old negative', seed: 7, width: 1024, height: 1024, batch_size: 4 },
      },
      sampler: {
        class_type: 'UmbraKSamplerHiResFix',
        inputs: { steps: 30, enabled: true, hires_steps: 18 },
      },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { person_detail: true, face_detail: true, eye_detail: true, hand_detail: true, pipeline_json: '{}' },
      },
      upscaler: {
        class_type: 'UmbraImageUpscale',
        inputs: { enabled: true },
      },
      save: {
        class_type: 'UmbraLabSaveImage',
        inputs: { filename_prefix: 'old', output_folder: 'old', save_to_yyyy_mm_dd_folder: true, steps: 30 },
      },
    };

    const result = prepareSharedQueueWorkflowGraph(source, {
      prompt: 'queue survivor',
      negativePrompt: 'bad output',
      width: 512,
      height: 384,
      steps: 6,
      seed: 42,
      outputPrefix: 'shared_queue_test',
    });

    expect(result).not.toBe(source);
    expect(result.reader.inputs).toMatchObject({
      prompt_text: 'queue survivor',
      negative_prompt: 'bad output',
      seed: 42,
      width: 512,
      height: 384,
      batch_size: 1,
    });
    expect(result.sampler.inputs).toMatchObject({ steps: 6, enabled: false, hires_steps: 0 });
    expect(result.detailer.inputs).toMatchObject({
      person_detail: false,
      face_detail: false,
      eye_detail: false,
      hand_detail: false,
      pipeline_json: '',
    });
    expect(result.upscaler.inputs.enabled).toBe(false);
    expect(result.save.inputs).toMatchObject({
      filename_prefix: 'shared_queue_test',
      output_folder: 'Umbra UI/Qualification/shared-queue',
      save_to_yyyy_mm_dd_folder: false,
      steps: 6,
    });
    expect(source.reader.inputs.width).toBe(1024);
  });

  test('uses the authoritative Comfy full path when custom save nodes return a synthetic preview filename', () => {
    expect(resolveSharedQueueComfyOutputPath({
      filename: 'synthetic_preview.png',
      subfolder: '',
      fullpath: 'D:/runtime/output/real_saved_image.png',
    })).toBe('D:/runtime/output/real_saved_image.png');
    expect(resolveSharedQueueComfyOutputPath({
      filename: 'fallback.png',
      subfolder: 'nested',
    })).toBe('Tools/ComfyUI/output/nested/fallback.png');
  });

  test('accepts an exact two-sample partial failure with one completed reload and one deleted queued prompt', () => {
    const fixture = partialFailureAssessmentFixture();

    expect(assessUmbraUiPartialFailure(
      'partial-job',
      fixture.terminalJob,
      fixture.outputChecks,
      fixture.evidence,
    )).toEqual({ ok: true, issues: [] });
  });

  test('rejects partial-failure prompt substitution and duplicate identities', () => {
    const substituted = partialFailureAssessmentFixture();
    substituted.terminalJob.items[1].promptId = 'replacement-prompt';
    const substitutionResult = assessUmbraUiPartialFailure(
      'partial-job',
      substituted.terminalJob,
      substituted.outputChecks,
      substituted.evidence,
    );

    expect(substitutionResult.ok).toBe(false);
    expect(substitutionResult.issues).toContain('Partial-failure Comfy prompt ids changed; a sample may have been resubmitted or substituted.');
    expect(substitutionResult.issues).toContain('Partial-failure item sample-queued changed Comfy prompt id from prompt-queued to replacement-prompt.');

    const duplicated = partialFailureAssessmentFixture();
    duplicated.initialJob.items[1].id = 'sample-running';
    duplicated.terminalJob.items[1].id = 'sample-running';
    duplicated.initialJob.items[1].promptId = 'prompt-running';
    duplicated.terminalJob.items[1].promptId = 'prompt-running';
    duplicated.evidence.observedQueuedPromptIds = ['prompt-running'];
    duplicated.evidence.deleteRequestedPromptIds = ['prompt-running'];
    const duplicateResult = assessUmbraUiPartialFailure(
      'partial-job',
      duplicated.terminalJob,
      duplicated.outputChecks,
      duplicated.evidence,
    );

    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.issues).toContain('The initial partial-failure job reused item id(s): sample-running.');
    expect(duplicateResult.issues).toContain('The observed partial-failure job reused item id(s): sample-running.');
    expect(duplicateResult.issues).toContain('The initial partial-failure job reused Comfy prompt id(s): prompt-running.');
    expect(duplicateResult.issues).toContain('The observed partial-failure job reused Comfy prompt id(s): prompt-running.');
    expect(duplicateResult.issues).toContain('Queue ownership evidence reused prompt id(s): prompt-running.');
  });

  test('rejects partial failure without exact running, queued, delete, and post-delete ownership evidence', () => {
    const fixture = partialFailureAssessmentFixture();
    fixture.evidence.observedRunningPromptIds = [];
    fixture.evidence.observedQueuedPromptIds = [];
    fixture.evidence.deleteRequestedPromptIds = [];
    fixture.evidence.deleteResponseStatus = 502;
    fixture.evidence.postDeleteQueuedPromptIds = ['prompt-queued'];
    fixture.evidence.deletedPromptHistoryPresent = true;
    fixture.evidence.removalConfirmations = 0;

    const result = assessUmbraUiPartialFailure(
      'partial-job',
      fixture.terminalJob,
      fixture.outputChecks,
      fixture.evidence,
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('Queue ownership evidence reported 0 owned running prompt id(s) instead of 1.');
    expect(result.issues).toContain('Queue ownership evidence reported 0 owned queued prompt id(s) instead of 1.');
    expect(result.issues).toContain('The Comfy queue delete requested 0 prompt id(s) instead of exactly 1.');
    expect(result.issues).toContain('The Comfy queue delete did not return a successful proxy status (502).');
    expect(result.issues).toContain('The deleted queued prompt appeared in Comfy history instead of remaining unexecuted.');
    expect(result.issues).toContain('The queued prompt removal was not confirmed by repeated queue and history reads.');

    const wrongTarget = partialFailureAssessmentFixture();
    wrongTarget.evidence.deleteRequestedPromptIds = ['prompt-running'];
    const wrongTargetResult = assessUmbraUiPartialFailure(
      'partial-job',
      wrongTarget.terminalJob,
      wrongTarget.outputChecks,
      wrongTarget.evidence,
    );
    expect(wrongTargetResult.ok).toBe(false);
    expect(wrongTargetResult.issues).toContain('The Comfy queue delete did not target the exact owned queued prompt id.');
  });

  test('rejects wrong partial terminal counts or an unreachable successful output receipt', () => {
    const fixture = partialFailureAssessmentFixture();
    fixture.terminalJob.status = 'completed';
    fixture.terminalJob.completed = 2;
    fixture.terminalJob.failed = 0;
    fixture.terminalJob.items[1].status = 'completed';
    fixture.outputChecks[0].metadataReachable = false;

    const result = assessUmbraUiPartialFailure(
      'partial-job',
      fixture.terminalJob,
      fixture.outputChecks,
      fixture.evidence,
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('The partial-failure job ended as completed instead of partial.');
    expect(result.issues).toContain('The partial-failure job reported completed=2 instead of 1.');
    expect(result.issues).toContain('The partial-failure job reported failed=0 instead of 1.');
    expect(result.issues).toContain('The terminal job contained 2 completed item(s) instead of 1.');
    expect(result.issues).toContain('Successful metadata could not be reloaded through Umbra: Tools/ComfyUI/output/Umbra UI/Qualification/partial-success.png.');
  });

  test('accepts an owned running cancellation when the unrelated survivor completes', () => {
    const targetBefore = {
      id: 'target',
      status: 'running',
      total: 2,
      completed: 0,
      failed: 0,
      items: [
        { id: 'target-1', status: 'running', promptId: 'prompt-target-1', outputs: [] },
        { id: 'target-2', status: 'running', promptId: 'prompt-target-2', outputs: [] },
      ],
    };
    const targetAfter = {
      ...targetBefore,
      status: 'canceled',
      items: targetBefore.items.map((item) => ({ ...item, status: 'canceled' })),
    };
    const survivor = {
      id: 'survivor',
      status: 'completed',
      total: 1,
      completed: 1,
      failed: 0,
      items: [{
        id: 'survivor-1',
        status: 'completed',
        promptId: 'prompt-survivor-1',
        outputs: [{ filename: 'survivor.png' }],
      }],
    };

    expect(assessUmbraUiCancelIsolation(targetBefore, targetAfter, survivor)).toEqual({ ok: true, issues: [] });
    expect(countUmbraUiRuntimeOutputs(survivor)).toBe(1);
    expect(isUmbraUiRuntimeJobTerminal(targetBefore)).toBe(false);
    expect(isUmbraUiRuntimeJobTerminal(targetAfter)).toBe(true);
  });

  test('fails closed when running ownership or survivor isolation is not proven', () => {
    const result = assessUmbraUiCancelIsolation(
      {
        id: 'target',
        status: 'queued',
        total: 1,
        completed: 0,
        failed: 0,
        items: [{ status: 'queued', promptId: 'shared', outputs: [] }],
      },
      {
        id: 'target',
        status: 'running',
        total: 1,
        completed: 0,
        failed: 0,
        items: [{ status: 'running', promptId: 'shared', outputs: [] }],
      },
      {
        id: 'survivor',
        status: 'failed',
        total: 1,
        completed: 0,
        failed: 1,
        items: [{ status: 'failed', promptId: 'shared', outputs: [] }],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('The cancellation target was not observed running, so interrupt ownership was not physically exercised.');
    expect(result.issues).toContain('The cancellation target ended as running instead of canceled.');
    expect(result.issues).toContain('The survivor job ended as failed instead of completed.');
    expect(result.issues).toContain('The target and survivor unexpectedly shared a Comfy prompt id.');
  });

  test('accepts a restarted job only after every output reloads with metadata', () => {
    const initial = {
      id: 'restart-job',
      status: 'running',
      total: 2,
      completed: 0,
      failed: 0,
      items: [
        { status: 'running', promptId: 'one', outputs: [] },
        { status: 'running', promptId: 'two', outputs: [] },
      ],
    };
    const recovered = {
      id: 'restart-job',
      status: 'completed',
      total: 2,
      completed: 2,
      failed: 0,
      items: [
        { status: 'completed', promptId: 'one', outputs: [{ filename: 'one.png' }] },
        { status: 'completed', promptId: 'two', outputs: [{ filename: 'two.png' }] },
      ],
    };
    const checks = [
      { path: 'one.png', mediaReachable: true, metadataReachable: true },
      { path: 'two.png', mediaReachable: true, metadataReachable: true },
    ];

    expect(assessUmbraUiRestartRecovery('restart-job', recovered, checks, {
      restartPoint: 'active',
      initialJob: initial,
      observedRunningPromptIds: ['one'],
      observedQueuedPromptIds: ['two'],
    })).toEqual({ ok: true, issues: [] });
  });

  test('accepts a completed backend job across a terminal restart point without prompt replacement', () => {
    const completed = {
      id: 'restart-job',
      status: 'completed',
      total: 2,
      completed: 2,
      failed: 0,
      items: [
        { status: 'completed', promptId: 'one', outputs: [{ filename: 'one.png' }] },
        { status: 'completed', promptId: 'two', outputs: [{ filename: 'two.png' }] },
      ],
    };
    const checks = [
      { path: 'one.png', mediaReachable: true, metadataReachable: true },
      { path: 'two.png', mediaReachable: true, metadataReachable: true },
    ];

    expect(assessUmbraUiRestartRecovery('restart-job', completed, checks, {
      restartPoint: 'terminal',
      initialJob: completed,
      observedRunningPromptIds: [],
      observedQueuedPromptIds: [],
    })).toEqual({ ok: true, issues: [] });
  });

  test('rejects restart recovery when a Comfy prompt id was substituted', () => {
    const result = assessUmbraUiRestartRecovery(
      'restart-job',
      {
        id: 'restart-job',
        status: 'completed',
        total: 2,
        completed: 2,
        failed: 0,
        items: [
          { status: 'completed', promptId: 'one', outputs: [{ filename: 'one.png' }] },
          { status: 'completed', promptId: 'replacement', outputs: [{ filename: 'two.png' }] },
        ],
      },
      [
        { path: 'one.png', mediaReachable: true, metadataReachable: true },
        { path: 'two.png', mediaReachable: true, metadataReachable: true },
      ],
      {
        initialJob: {
          id: 'restart-job',
          status: 'running',
          total: 2,
          items: [
            { status: 'running', promptId: 'one' },
            { status: 'running', promptId: 'two' },
          ],
        },
        observedRunningPromptIds: ['one'],
        observedQueuedPromptIds: ['two'],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('Recovered Comfy prompt ids did not exactly match the initial job; a prompt may have been lost or resubmitted.');
  });

  test('rejects duplicate prompt ids and incomplete active-queue evidence', () => {
    const result = assessUmbraUiRestartRecovery(
      'restart-job',
      {
        id: 'restart-job',
        status: 'completed',
        total: 2,
        completed: 2,
        failed: 0,
        items: [
          { status: 'completed', promptId: 'same', outputs: [{ filename: 'one.png' }] },
          { status: 'completed', promptId: 'same', outputs: [{ filename: 'two.png' }] },
        ],
      },
      [
        { path: 'one.png', mediaReachable: true, metadataReachable: true },
        { path: 'two.png', mediaReachable: true, metadataReachable: true },
      ],
      {
        initialJob: {
          id: 'restart-job',
          status: 'running',
          total: 2,
          items: [
            { status: 'running', promptId: 'same' },
            { status: 'running', promptId: 'same' },
          ],
        },
        observedRunningPromptIds: ['same'],
        observedQueuedPromptIds: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('The initial job reused Comfy prompt id(s): same.');
    expect(result.issues).toContain('The recovered job reused Comfy prompt id(s): same.');
    expect(result.issues).toContain('No owned queued Comfy prompt was captured before restart.');
  });

  test('accepts Canvas cancellation while Power Prompter and unmanaged Comfy survivors complete', () => {
    const targetBefore = {
      id: 'canvas-target',
      status: 'running',
      total: 2,
      completed: 0,
      failed: 0,
      items: [
        { status: 'running', promptId: 'canvas-running', outputs: [] },
        { status: 'queued', promptId: 'canvas-pending', outputs: [] },
      ],
    };
    const targetAfter = {
      ...targetBefore,
      status: 'canceled',
      items: targetBefore.items.map((item) => ({ ...item, status: 'canceled' })),
    };

    expect(assessUmbraUiSharedQueueIsolation(targetBefore, targetAfter, {
      powerPrompterObservedBehindTarget: true,
      unmanagedObservedBehindTarget: true,
      powerPrompter: {
        requestId: 'pp-survivor',
        status: 'completed',
        total: 1,
        completed: 1,
        failed: 0,
        canceled: 0,
        prompts: [{ promptIndex: 0, status: 'completed', promptId: 'pp-prompt' }],
      },
      unmanaged: {
        promptId: 'unmanaged-prompt',
        status: 'success',
        outputCount: 1,
        mediaChecks: [{ path: 'unmanaged.png', mediaReachable: true, metadataReachable: true }],
      },
    })).toEqual({ ok: true, issues: [] });
  });

  test('fails closed when either shared-queue survivor is missing or disturbed', () => {
    const result = assessUmbraUiSharedQueueIsolation(
      {
        id: 'canvas-target',
        status: 'running',
        total: 1,
        items: [{ status: 'running', promptId: 'shared-prompt', outputs: [] }],
      },
      {
        id: 'canvas-target',
        status: 'canceled',
        total: 1,
        items: [{ status: 'canceled', promptId: 'shared-prompt', outputs: [] }],
      },
      {
        powerPrompterObservedBehindTarget: false,
        unmanagedObservedBehindTarget: false,
        powerPrompter: {
          requestId: 'pp-survivor',
          status: 'canceled',
          total: 1,
          completed: 0,
          canceled: 1,
          prompts: [{ status: 'canceled', promptId: 'shared-prompt' }],
        },
        unmanaged: {
          promptId: 'shared-prompt',
          status: 'interrupted',
          outputCount: 0,
          mediaChecks: [],
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('The Power Prompter prompt was not observed queued behind the running Canvas target.');
    expect(result.issues).toContain('The unmanaged Comfy survivor ended as interrupted instead of success.');
    expect(result.issues).toContain('The Canvas target and Power Prompter survivor unexpectedly shared a Comfy prompt id.');
    expect(result.issues).toContain('The Power Prompter and unmanaged survivors unexpectedly shared a Comfy prompt id.');
  });

  test('rejects a substituted job or incomplete recovery receipt', () => {
    const result = assessUmbraUiRestartRecovery(
      'expected-job',
      {
        id: 'different-job',
        status: 'partial',
        total: 2,
        completed: 1,
        failed: 1,
        items: [
          { status: 'completed', promptId: 'one', outputs: [{ filename: 'one.png' }] },
          { status: 'failed', promptId: 'two', outputs: [] },
        ],
      },
      [{ path: 'one.png', mediaReachable: true, metadataReachable: false }],
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain('Recovered job id different-job did not match expected-job.');
    expect(result.issues).toContain('The recovered job ended as partial instead of completed.');
    expect(result.issues).toContain('Recovered metadata could not be reloaded: one.png.');
  });
});
