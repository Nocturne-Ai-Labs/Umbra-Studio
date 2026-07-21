import { describe, expect, test } from 'bun:test';
import {
  filterUmbraUiCompatibleIpAdapterModels,
  filterUmbraUiInpaintPrimaryModels,
  getUmbraUiInpaintPrimaryModelIssue,
  inferUmbraUiClassicModelArchitecture,
  inferUmbraUiIpAdapterArchitecture,
} from '../../../shared/umbra-ui/inpaintModelCompatibility';

describe('Umbra inpaint model compatibility', () => {
  test('matches IP Adapter weights to the selected classic model architecture', () => {
    const models = [
      'ip-adapter_sd15_vit-h.safetensors',
      'ip-adapter_sdxl_vit-h.safetensors',
      'ip-adapter.safetensors',
    ];
    expect(filterUmbraUiCompatibleIpAdapterModels(models, 'Anima', 'anima.safetensors')).toEqual([
      'ip-adapter_sdxl_vit-h.safetensors',
    ]);
    expect(filterUmbraUiCompatibleIpAdapterModels(models, 'Stable Diffusion 1.5', 'v1-5.safetensors')).toEqual([
      'ip-adapter_sd15_vit-h.safetensors',
    ]);
    expect(filterUmbraUiCompatibleIpAdapterModels(models, 'Stable Diffusion', 'model.safetensors')).toEqual([]);
  });

  test('infers explicit SDXL and SD 1.5 architecture markers', () => {
    expect(inferUmbraUiClassicModelArchitecture('Illustrious XL', '')).toBe('sdxl');
    expect(inferUmbraUiClassicModelArchitecture('Stable Diffusion', 'pony-xl.safetensors')).toBe('sdxl');
    expect(inferUmbraUiIpAdapterArchitecture('models/ip-adapter_sd15.bin')).toBe('sd15');
    expect(inferUmbraUiIpAdapterArchitecture('models/ip-adapter.bin')).toBe('unknown');
  });

  test('only offers Fill weights to the FLUX Fill provider and explains stale selections', () => {
    const models = ['flux1-dev.gguf', 'flux1-fill-dev.gguf', 'FLUX-FILL.safetensors'];
    expect(filterUmbraUiInpaintPrimaryModels(models, 'flux_fill')).toEqual([
      'flux1-fill-dev.gguf',
      'FLUX-FILL.safetensors',
    ]);
    expect(filterUmbraUiInpaintPrimaryModels(models, 'classic_conditioning')).toEqual(models);
    expect(getUmbraUiInpaintPrimaryModelIssue('flux_fill', 'flux1-dev.gguf')).toContain('FLUX.1 Fill');
    expect(getUmbraUiInpaintPrimaryModelIssue('flux_fill', 'flux1-fill-dev.gguf')).toBe('');
  });
});
