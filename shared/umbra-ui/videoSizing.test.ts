import { describe, expect, test } from 'bun:test';
import {
  inferUmbraVideoResolutionPreset,
  resolveUmbraVideoSizing,
  resolveUmbraVideoTargetDimensions,
} from './videoSizing';

describe('resolveUmbraVideoTargetDimensions', () => {
  test('uses a landscape source aspect with the selected constant-area tier', () => {
    expect(resolveUmbraVideoTargetDimensions({
      resolutionPreset: '720p',
      sourceWidth: 1920,
      sourceHeight: 1080,
    })).toMatchObject({
      resolutionPreset: '720p',
      usedSourceAspect: true,
      targetWidth: 1280,
      targetHeight: 704,
    });
  });

  test('rotates the result naturally for a portrait source', () => {
    expect(resolveUmbraVideoTargetDimensions({
      resolutionPreset: '720p',
      sourceWidth: 1080,
      sourceHeight: 1920,
    })).toMatchObject({ targetWidth: 704, targetHeight: 1280 });
  });

  test('keeps a constant pixel budget for square media', () => {
    expect(resolveUmbraVideoTargetDimensions({
      resolutionPreset: '720p',
      sourceWidth: 1024,
      sourceHeight: 1024,
    })).toMatchObject({ targetWidth: 960, targetHeight: 960 });
  });

  test('uses the selected aspect only when there is no source media', () => {
    expect(resolveUmbraVideoTargetDimensions({
      resolutionPreset: '1080p',
      fallbackAspect: '9:16',
    })).toMatchObject({
      usedSourceAspect: false,
      targetWidth: 1088,
      targetHeight: 1920,
    });
  });

  test('infers a migration preset from legacy dimensions', () => {
    expect(inferUmbraVideoResolutionPreset(832, 480)).toBe('480p');
    expect(inferUmbraVideoResolutionPreset(1280, 720)).toBe('720p');
  });
});

describe('resolveUmbraVideoSizing', () => {
  test('keeps the requested dimensions as the final Wan output', () => {
    expect(resolveUmbraVideoSizing({
      width: 1920,
      height: 1080,
      family: 'wan22',
      ltxTwoStage: false,
      upscaleMode: 'rtx',
      upscaleScale: 2,
    })).toEqual({
      targetWidth: 1920,
      targetHeight: 1080,
      samplingWidth: 960,
      samplingHeight: 544,
      decodedWidth: 960,
      decodedHeight: 544,
      latentScale: 1,
      postprocessScale: 2,
      requiresFinalResize: true,
    });
  });

  test('accounts for the LTX latent x2 stage before final upscale', () => {
    const sizing = resolveUmbraVideoSizing({
      width: 1920,
      height: 1080,
      family: 'ltx23',
      ltxTwoStage: true,
      upscaleMode: 'model',
      upscaleScale: 2,
    });

    expect(sizing.targetWidth).toBe(1920);
    expect(sizing.targetHeight).toBe(1080);
    expect(sizing.samplingWidth).toBe(480);
    expect(sizing.samplingHeight).toBe(272);
    expect(sizing.decodedWidth).toBe(960);
    expect(sizing.decodedHeight).toBe(544);
  });

  test('only performs an alignment correction when postprocessing is disabled', () => {
    const sizing = resolveUmbraVideoSizing({
      width: 1280,
      height: 720,
      family: 'wan22',
      ltxTwoStage: false,
      upscaleMode: 'none',
      upscaleScale: 2,
    });

    expect(sizing.samplingWidth).toBe(1280);
    expect(sizing.samplingHeight).toBe(720);
    expect(sizing.requiresFinalResize).toBe(false);
  });
});
