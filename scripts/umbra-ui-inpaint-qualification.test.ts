import { describe, expect, test } from 'bun:test';
import {
  validateUmbraUiInpaintOutputMetadata,
  type UmbraUiInpaintMetadataExpectation,
} from './umbra-ui-inpaint-qualification';

const expected: UmbraUiInpaintMetadataExpectation = {
  canvasProjectId: 'qualification-flux-fill',
  operationMode: 'outpaint',
  workflowId: 'umbra-ui-flux-fill-inpaint',
  modelFamily: 'FLUX Fill',
  modelSource: 'diffusion_model',
  inpaintAdapter: 'flux_fill',
  adapterModelName: '',
  checkpointName: 'flux/fill-model.safetensors',
  prompt: 'extend the jacket naturally',
  negativePrompt: 'seams',
  seed: 42,
  steps: 20,
  cfg: 1,
  clipSkip: 1,
  samplerName: 'euler',
  scheduler: 'simple',
  denoise: 0.8,
  samples: 1,
  maskGrow: 8,
  maskFeather: 4,
  canvasMaskGrow: 8,
  canvasMaskFeather: 4,
  contextPadding: 32,
  processingScaleMode: 'manual',
  processingWidth: 1024,
  processingHeight: 768,
  coherenceMode: 'staged',
  coherenceEdgeSize: 16,
  coherenceMinimumDenoise: 0.15,
  fillMode: 'neutral',
  infillColor: '#7f7f7f',
  infillTileSize: 32,
  inpaintModelName: '',
  seamlessX: false,
  seamlessY: false,
  outputOnlyMaskedRegions: false,
  colorMatch: 0,
  differentialStrength: 1,
  regionalGuidanceIds: ['face'],
  controlLayerIds: ['pose'],
  referenceLayerIds: ['style'],
  generationX: 64,
  generationY: 32,
  generationWidth: 896,
  generationHeight: 704,
  submissionX: 32,
  submissionY: 16,
  submissionWidth: 960,
  submissionHeight: 736,
  width: 1024,
  height: 768,
};

function validMetadata() {
  return {
    prompt: {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'flux/fill-model.safetensors' } },
      '2': { class_type: 'UmbraLabSaveImage', inputs: { images: ['1', 0] } },
    },
    umbra_inpaint: {
      version: 4,
      source: 'umbra_ui_inpaint',
      canvasProjectId: expected.canvasProjectId,
      operationMode: expected.operationMode,
      workflowId: expected.workflowId,
      modelFamily: expected.modelFamily,
      modelSource: expected.modelSource,
      inpaintAdapter: expected.inpaintAdapter,
      adapterModelName: expected.adapterModelName,
      checkpointName: 'flux\\fill-model.safetensors',
      prompt: expected.prompt,
      negativePrompt: expected.negativePrompt,
      seed: expected.seed,
      steps: expected.steps,
      cfg: expected.cfg,
      clipSkip: expected.clipSkip,
      samplerName: expected.samplerName,
      scheduler: expected.scheduler,
      denoise: expected.denoise,
      samples: expected.samples,
      maskGrow: expected.maskGrow,
      maskFeather: expected.maskFeather,
      canvasMaskGrow: expected.canvasMaskGrow,
      canvasMaskFeather: expected.canvasMaskFeather,
      contextPadding: expected.contextPadding,
      processingScaleMode: expected.processingScaleMode,
      processingWidth: expected.processingWidth,
      processingHeight: expected.processingHeight,
      processing: {
        mode: expected.processingScaleMode,
        requestedWidth: expected.processingWidth,
        requestedHeight: expected.processingHeight,
        width: expected.width,
        height: expected.height,
      },
      coherenceMode: expected.coherenceMode,
      coherenceEdgeSize: expected.coherenceEdgeSize,
      coherenceMinimumDenoise: expected.coherenceMinimumDenoise,
      fillMode: expected.fillMode,
      infillColor: expected.infillColor,
      infillTileSize: expected.infillTileSize,
      inpaintModelName: expected.inpaintModelName,
      seamlessX: expected.seamlessX,
      seamlessY: expected.seamlessY,
      outputOnlyMaskedRegions: expected.outputOnlyMaskedRegions,
      colorMatch: expected.colorMatch,
      differentialStrength: expected.differentialStrength,
      regionalGuidance: [{ id: 'face' }],
      controlLayers: [{ id: 'pose' }],
      referenceLayers: [{ id: 'style' }],
      width: expected.width,
      height: expected.height,
      generationRegion: {
        x: expected.generationX,
        y: expected.generationY,
        width: expected.generationWidth,
        height: expected.generationHeight,
      },
      submissionRegion: {
        x: expected.submissionX,
        y: expected.submissionY,
        width: expected.submissionWidth,
        height: expected.submissionHeight,
      },
    },
  };
}

describe('Umbra UI inpaint qualification metadata', () => {
  test('accepts a matching app receipt and recoverable API prompt graph', () => {
    expect(validateUmbraUiInpaintOutputMetadata(validMetadata(), expected)).toEqual({
      workflowEmbedded: true,
      inpaintMetadataValid: true,
      metadataIssues: [],
    });
  });

  test('rejects a CLIPSetLastLayer mutation when the receipt claims normal CLIP', () => {
    const metadata = validMetadata();
    (metadata.prompt as Record<string, unknown>).clipSkip = {
      class_type: 'CLIPSetLastLayer',
      inputs: { clip: ['1', 1], stop_at_clip_layer: -1 },
    };

    const result = validateUmbraUiInpaintOutputMetadata(metadata, expected);

    expect(result.inpaintMetadataValid).toBe(false);
    expect(result.metadataIssues).toContain(
      'The embedded API prompt graph mutates CLIP with CLIPSetLastLayer even though CLIP skip 1 requires normal checkpoint CLIP.',
    );
  });

  test('accepts the exact CLIPSetLastLayer contract for clip skip values above 1', () => {
    const metadata = validMetadata();
    (metadata.prompt as Record<string, unknown>).clipSkip = {
      class_type: 'CLIPSetLastLayer',
      inputs: { clip: ['1', 1], stop_at_clip_layer: -2 },
    };
    metadata.umbra_inpaint.clipSkip = 2;

    expect(validateUmbraUiInpaintOutputMetadata(metadata, { ...expected, clipSkip: 2 })).toEqual({
      workflowEmbedded: true,
      inpaintMetadataValid: true,
      metadataIssues: [],
    });
  });

  test('rejects receipt-only model source changes when the executable loader disagrees', () => {
    const metadata = validMetadata();
    (metadata.prompt as Record<string, unknown>).loader = {
      class_type: 'UmbraLoadCheckpoint',
      inputs: {
        model_type: 'unet',
        diffusion_model_name: '',
        unet_name: expected.checkpointName,
      },
    };

    const result = validateUmbraUiInpaintOutputMetadata(metadata, expected);

    expect(result.inpaintMetadataValid).toBe(false);
    expect(result.metadataIssues).toContain(
      'UmbraLoadCheckpoint node loader did not use requested model source diffusion_model.',
    );
    expect(result.metadataIssues).toContain(
      'UmbraLoadCheckpoint node loader did not load the requested model from diffusion_model_name.',
    );
  });

  test('accepts an exact Umbra model loader source and input binding', () => {
    const metadata = validMetadata();
    (metadata.prompt as Record<string, unknown>).loader = {
      class_type: 'UmbraLoadCheckpoint',
      inputs: {
        model_type: 'diffusion_model',
        diffusion_model_name: expected.checkpointName,
        unet_name: '',
      },
    };

    expect(validateUmbraUiInpaintOutputMetadata(metadata, expected).inpaintMetadataValid).toBe(true);
  });

  test('rejects a receipt-only masked IP Adapter reference', () => {
    const metadata = validMetadata();
    metadata.umbra_inpaint.referenceLayers = [{
      id: 'style',
      method: 'ip_adapter',
      hasInfluenceMask: true,
    }];
    const maskedReferenceExpected: UmbraUiInpaintMetadataExpectation = {
      ...expected,
      referenceLayers: [{
        id: 'style',
        method: 'ip_adapter',
        hasInfluenceMask: true,
      }],
    };

    const result = validateUmbraUiInpaintOutputMetadata(metadata, maskedReferenceExpected);

    expect(result.inpaintMetadataValid).toBe(false);
    expect(result.metadataIssues).toContain(
      'The embedded API prompt graph only binds 0 of 1 masked IP Adapter reference layer(s) to LoadImageMask.',
    );
  });

  test('accepts a masked IP Adapter reference wired to LoadImageMask', () => {
    const metadata = validMetadata();
    metadata.umbra_inpaint.referenceLayers = [{
      id: 'style',
      method: 'ip_adapter',
      hasInfluenceMask: true,
    }];
    (metadata.prompt as Record<string, unknown>).referenceMask = {
      class_type: 'LoadImageMask',
      inputs: { image: 'reference-mask.png', channel: 'red' },
    };
    (metadata.prompt as Record<string, unknown>).ipAdapter = {
      class_type: 'IPAdapterAdvanced',
      inputs: { attn_mask: ['referenceMask', 0] },
    };
    const maskedReferenceExpected: UmbraUiInpaintMetadataExpectation = {
      ...expected,
      referenceLayers: [{
        id: 'style',
        method: 'ip_adapter',
        hasInfluenceMask: true,
      }],
    };

    expect(validateUmbraUiInpaintOutputMetadata(metadata, maskedReferenceExpected).inpaintMetadataValid).toBe(true);
  });

  test('accepts a recoverable editor workflow', () => {
    const metadata = validMetadata();
    delete (metadata as Record<string, unknown>).prompt;
    (metadata as Record<string, unknown>).workflow = {
      nodes: [{ id: 1, type: 'UmbraLabSaveImage' }],
      links: [],
    };
    expect(validateUmbraUiInpaintOutputMetadata(metadata, expected).workflowEmbedded).toBe(true);
  });

  test('reports missing workflow and inpaint metadata independently', () => {
    expect(validateUmbraUiInpaintOutputMetadata({}, expected)).toEqual({
      workflowEmbedded: false,
      inpaintMetadataValid: false,
      metadataIssues: [
        'No recoverable ComfyUI workflow or API prompt graph was embedded.',
        'The umbra_inpaint metadata block is missing.',
      ],
    });
  });

  test('reports mismatched provider and generation geometry', () => {
    const metadata = validMetadata();
    const inpaint = metadata.umbra_inpaint;
    inpaint.operationMode = 'inpaint';
    inpaint.modelFamily = 'SDXL';
    inpaint.checkpointName = 'wrong.safetensors';
    inpaint.generationRegion = { x: 0, y: 0, width: 512, height: 512 };

    const result = validateUmbraUiInpaintOutputMetadata(metadata, expected);
    expect(result.workflowEmbedded).toBe(true);
    expect(result.inpaintMetadataValid).toBe(false);
    expect(result.metadataIssues).toContain('Operation mode did not match the submitted qualification case.');
    expect(result.metadataIssues).toContain('Model family did not match the submitted qualification case.');
    expect(result.metadataIssues).toContain('Checkpoint/model name did not match the submitted qualification case.');
    expect(result.metadataIssues).toContain('Generation region width did not match the submitted qualification case.');
  });

  test('validates exact regional, control, and reference settings instead of ids alone', () => {
    const metadata = validMetadata();
    metadata.umbra_inpaint.regionalGuidance = [{
      id: 'face', name: 'Face', positivePrompt: 'detailed eyes', negativePrompt: 'blurred eyes',
      autoNegative: true, weight: 0.8, beginStepPercent: 0.1, endStepPercent: 0.9,
    }];
    metadata.umbra_inpaint.controlLayers = [{
      id: 'pose', name: 'Pose', adapterType: 'controlnet', controlMode: 'balanced',
      controlType: 'pose', modelName: 'control/pose.safetensors', weight: 0.7,
    }];
    metadata.umbra_inpaint.referenceLayers = [{
      id: 'style', name: 'Style', method: 'ip_adapter', modelName: 'ip/style.safetensors',
      visionModelName: 'clip/vision.safetensors', weight: 0.65, hasInfluenceMask: true,
    }];
    const strictExpected: UmbraUiInpaintMetadataExpectation = {
      ...expected,
      requiredPromptNodeClasses: ['UNETLoader', 'UmbraLabSaveImage'],
      regionalGuidance: [{
        id: 'face', name: 'Face', positivePrompt: 'detailed eyes', negativePrompt: 'blurred eyes',
        autoNegative: true, weight: 0.8, beginStepPercent: 0.1, endStepPercent: 0.9,
      }],
      controlLayers: [{
        id: 'pose', name: 'Pose', adapterType: 'controlnet', controlMode: 'balanced',
        controlType: 'pose', modelName: 'control/pose.safetensors', weight: 0.7,
      }],
      referenceLayers: [{
        id: 'style', name: 'Style', method: 'ip_adapter', modelName: 'ip/style.safetensors',
        visionModelName: 'clip/vision.safetensors', weight: 0.65, hasInfluenceMask: true,
      }],
    };
    (metadata.prompt as Record<string, unknown>).referenceMask = {
      class_type: 'LoadImageMask',
      inputs: { image: 'reference-mask.png', channel: 'red' },
    };
    (metadata.prompt as Record<string, unknown>).ipAdapter = {
      class_type: 'IPAdapterAdvanced',
      inputs: { attn_mask: ['referenceMask', 0] },
    };
    expect(validateUmbraUiInpaintOutputMetadata(metadata, strictExpected).inpaintMetadataValid).toBe(true);

    metadata.umbra_inpaint.regionalGuidance[0].weight = 0.25;
    metadata.umbra_inpaint.controlLayers[0].modelName = 'control/wrong.safetensors';
    metadata.umbra_inpaint.referenceLayers[0].hasInfluenceMask = false;
    const result = validateUmbraUiInpaintOutputMetadata(metadata, strictExpected);
    expect(result.inpaintMetadataValid).toBe(false);
    expect(result.metadataIssues).toContain('Regional guidance face weight did not match the submitted qualification case.');
    expect(result.metadataIssues).toContain('Control layer pose modelName did not match the submitted qualification case.');
    expect(result.metadataIssues).toContain('Reference layer style hasInfluenceMask did not match the submitted qualification case.');

    const missingNodeResult = validateUmbraUiInpaintOutputMetadata(validMetadata(), {
      ...expected,
      requiredPromptNodeClasses: ['UNETLoader', 'ConditioningSetMask'],
    });
    expect(missingNodeResult.workflowEmbedded).toBe(false);
    expect(missingNodeResult.inpaintMetadataValid).toBe(true);
    expect(missingNodeResult.metadataIssues).toContain(
      'The embedded API prompt graph is missing required node class ConditioningSetMask.',
    );
  });
});
