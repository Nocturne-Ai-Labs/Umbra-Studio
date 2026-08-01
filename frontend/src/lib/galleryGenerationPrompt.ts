import type { ImageMetadata } from '@/utils/metadata';
import { buildUmbraUiMediaGenerationSnapshot } from '@/lib/umbraUiMediaHandoff';
import { buildUmbraUiLoraSyntax } from '@/lib/umbraUiModels';

export type GalleryGenerationPromptBlock = {
  slotId: string;
  variantId: string;
  cardLabel: string;
  variantLabel: string;
  promptText: string;
};

export type GalleryGenerationPromptDetails = {
  ppuid: string;
  blocks: GalleryGenerationPromptBlock[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizedText(value: unknown): string {
  return String(value || '').trim();
}

function includesLora(text: string, rawName: string): boolean {
  const normalizedName = rawName
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '')
    .toLowerCase();
  if (!normalizedName) return false;
  return text.toLowerCase().includes(`<lora:${normalizedName}`);
}

export function buildGalleryGenerationPromptDetails(
  metadata: ImageMetadata | null | undefined,
): GalleryGenerationPromptDetails {
  if (!metadata) return { ppuid: '', blocks: [] };

  const powerPrompter = isRecord(metadata.umbra_power_prompter)
    ? metadata.umbra_power_prompter
    : {};
  const snapshot = buildUmbraUiMediaGenerationSnapshot(metadata);
  const rawSegments = Array.isArray(powerPrompter.segments) ? powerPrompter.segments : [];
  const sourceSegments = rawSegments.length > 0
    ? rawSegments.map((candidate) => {
      const segment = isRecord(candidate) ? candidate : {};
      return {
        text: normalizedText(segment.text),
        label: normalizedText(segment.slotLabel),
        slotType: normalizedText(segment.slotType),
        variantId: normalizedText(segment.variantId),
        variantName: normalizedText(segment.variantName),
        slotId: normalizedText(segment.slotId),
      };
    })
    : (snapshot?.positivePromptSegments || []).map((segment) => ({
      text: normalizedText(segment.text),
      label: normalizedText(segment.label),
      slotType: normalizedText(segment.slotType),
      variantId: normalizedText(segment.variantId),
      variantName: normalizedText(segment.variantName),
      slotId: '',
    }));

  const blocks = sourceSegments
    .filter((segment) => segment.text.length > 0)
    .map((segment, index) => ({
      slotId: segment.slotId || segment.slotType || `gallery-prompt-${index + 1}`,
      variantId: segment.variantId || `gallery-prompt-variant-${index + 1}`,
      cardLabel: segment.label || segment.slotType || `Prompt ${index + 1}`,
      variantLabel: segment.variantName,
      promptText: segment.text,
    }));

  const promptText = blocks.map((block) => block.promptText).join(', ');
  const loraSyntax = (snapshot?.loras || [])
    .filter((lora) => lora.enabled !== false && !includesLora(promptText, lora.name))
    .map((lora) => buildUmbraUiLoraSyntax({
      ...lora,
      trainedTags: [],
    }))
    .filter(Boolean);
  if (loraSyntax.length > 0) {
    blocks.push({
      slotId: 'gallery-loras',
      variantId: 'gallery-loras-enabled',
      cardLabel: 'LoRAs',
      variantLabel: '',
      promptText: loraSyntax.join(', '),
    });
  }

  return {
    ppuid: normalizedText(powerPrompter.ppuid),
    blocks,
  };
}
