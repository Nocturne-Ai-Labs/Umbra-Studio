import { describe, expect, test } from 'bun:test';
import {
  resolveUmbraUiInpaintControlAvailability,
  resolveUmbraUiInpaintReferenceAvailability,
  type UmbraUiInpaintResourceCatalog,
} from './umbraUiInpaintResourceAvailability';

const EMPTY_CATALOG: UmbraUiInpaintResourceCatalog = {
  controlModels: [],
  animaLlliteAvailable: false,
  animaLlliteModels: [],
  modelPatchModels: [],
  styleModels: [],
  ipAdapterModels: [],
  visionModels: [],
};

describe('Umbra inpaint runtime resource availability', () => {
  test('keeps classic controls closed until a real control model is installed', () => {
    expect(resolveUmbraUiInpaintControlAvailability(
      ['controlnet', 't2i_adapter', 'control_lora'],
      EMPTY_CATALOG,
    ).methods).toEqual([]);
    expect(resolveUmbraUiInpaintControlAvailability(
      ['controlnet', 't2i_adapter', 'control_lora'],
      { ...EMPTY_CATALOG, controlModels: ['control.safetensors'] },
    ).methods).toEqual(['controlnet', 't2i_adapter', 'control_lora']);
  });

  test('requires both the Anima provider registration and compatible weights', () => {
    expect(resolveUmbraUiInpaintControlAvailability(
      ['anima_lllite'],
      { ...EMPTY_CATALOG, animaLlliteAvailable: true },
    ).methods).toEqual([]);
    expect(resolveUmbraUiInpaintControlAvailability(
      ['anima_lllite'],
      { ...EMPTY_CATALOG, animaLlliteAvailable: true, animaLlliteModels: ['anima-lllite.safetensors'] },
    ).methods).toEqual(['anima_lllite']);
  });

  test('requires matching model resources for style and IP Adapter methods', () => {
    expect(resolveUmbraUiInpaintReferenceAvailability(['style_model', 'ip_adapter'], EMPTY_CATALOG).methods).toEqual([]);
    expect(resolveUmbraUiInpaintReferenceAvailability(['style_model', 'ip_adapter'], {
      ...EMPTY_CATALOG,
      styleModels: ['redux.safetensors'],
      visionModels: ['clip-vit.safetensors'],
    }).methods).toEqual(['style_model']);
    expect(resolveUmbraUiInpaintReferenceAvailability(['style_model', 'ip_adapter'], {
      ...EMPTY_CATALOG,
      styleModels: ['redux.safetensors'],
      ipAdapterModels: ['ip-adapter.safetensors'],
      visionModels: ['clip-vit.safetensors'],
    }).methods).toEqual(['style_model', 'ip_adapter']);
  });

  test('keeps model-native references available without unrelated style resources', () => {
    expect(resolveUmbraUiInpaintReferenceAvailability(
      ['qwen_image_reference', 'hidream_o1_reference'],
      EMPTY_CATALOG,
    ).methods).toEqual(['qwen_image_reference', 'hidream_o1_reference']);
  });
});
