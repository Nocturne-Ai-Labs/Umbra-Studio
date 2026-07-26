import { describe, expect, test } from 'bun:test';
import {
  extractUmbraModelPickerPreviewUrls,
  findUmbraModelPickerThumbnailOverrides,
  getUmbraModelPickerCatalogAliasKeys,
  normalizeUmbraModelPickerThumbnailOverrides,
  umbraModelPickerInfoMatchesPath,
} from './UmbraModelPickerModal';

describe('Umbra model picker catalog previews', () => {
  test('matches equivalent catalog paths instead of requiring identical prefixes', () => {
    const info = {
      modelName: 'checkpoints/Anime/umbraModel.safetensors',
      metadata: {},
      civitai: null,
      trainedTags: [],
      descriptionHtml: '',
      descriptionText: '',
    };

    expect(umbraModelPickerInfoMatchesPath(info, 'Anime/umbraModel.safetensors')).toBe(true);
    expect(getUmbraModelPickerCatalogAliasKeys('loras/Characters/hero.safetensors')).toContain('hero');
  });

  test('hydrates both image and video previews while removing duplicates', () => {
    const info = {
      loraName: 'hero.safetensors',
      metadata: {},
      trainedTags: [],
      descriptionHtml: '',
      descriptionText: '',
      civitai: {
        images: [
          { type: 'image', url: 'https://image.civitai.com/example.webp' },
          { type: 'image', url: 'https://image.civitai.com/example.webp' },
          { type: 'video', url: 'https://image.civitai.com/example.mp4' },
        ],
      },
    };

    const previews = extractUmbraModelPickerPreviewUrls(info);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toContain('width=640');
    expect(previews[1]).toBe('https://image.civitai.com/example.mp4');
  });

  test('shares Power Prompter thumbnail overrides across equivalent paths', () => {
    const overrides = normalizeUmbraModelPickerThumbnailOverrides({
      'loras/Characters/hero.safetensors': [
        '/api/fs/thumbnail?path=hero.webp',
        '/api/fs/thumbnail?path=hero.webp',
      ],
    });

    expect(findUmbraModelPickerThumbnailOverrides(
      overrides,
      'Characters/hero.safetensors',
    )).toEqual(['/api/fs/thumbnail?path=hero.webp']);
  });
});
