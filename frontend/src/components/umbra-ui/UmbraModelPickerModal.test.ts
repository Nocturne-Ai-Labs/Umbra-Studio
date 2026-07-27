import React from 'react';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UmbraModelPickerModal,
  extractUmbraModelPickerPreviewUrls,
  findUmbraModelPickerThumbnailOverrides,
  getUmbraModelPickerCatalogAliasKeys,
  normalizeUmbraModelPickerThumbnailOverrides,
  shouldAutoFocusUmbraModelPickerSearch,
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

  test('renders the shared checkpoint and LoRA picker scaffolding for mobile layout', () => {
    const markup = renderToStaticMarkup(React.createElement(UmbraModelPickerModal, {
      open: true,
      kind: 'lora',
      items: ['Characters/hero.safetensors', 'Styles/ink.safetensors'],
      selectedValue: '',
      onClose: () => {},
      onConfirm: () => {},
    }));

    expect(markup).toContain('data-umbra-model-picker-kind="lora"');
    expect(markup).toContain('data-umbra-model-picker-mobile-folder');
    expect(markup.match(/data-umbra-model-picker-card/g)?.length).toBe(2);
    expect(markup).toContain('data-umbra-model-picker-confirm');
  });

  test('does not summon the software keyboard when a phone picker opens', () => {
    expect(shouldAutoFocusUmbraModelPickerSearch('phone')).toBe(false);
    expect(shouldAutoFocusUmbraModelPickerSearch('tablet')).toBe(true);
    expect(shouldAutoFocusUmbraModelPickerSearch('desktop')).toBe(true);
  });

  test('keeps mobile confirmation controls above the persistent phone navigation', () => {
    const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-model-picker] {\n'
      + '  width: 100vw;\n'
      + '  max-width: none;\n'
      + '  height: 100%;\n'
      + '  max-height: 100%;',
    );
  });
});
