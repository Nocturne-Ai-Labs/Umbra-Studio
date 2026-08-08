export interface PowerPrompterWildcardVariantSource {
  id: string;
  label: string;
  value: string;
}

export interface PowerPrompterWildcardCardSource {
  id: string;
  label: string;
  variants: PowerPrompterWildcardVariantSource[];
}

export function buildPowerPrompterWildcardValues(
  cardSources: PowerPrompterWildcardCardSource[],
  selectedCardIds: string[],
  selectedVariantIds?: string[],
): string[] {
  const selectedIds = new Set(selectedCardIds.map((id) => String(id || '').trim()).filter(Boolean));
  const selectedVariants = selectedVariantIds
    ? new Set(selectedVariantIds.map((id) => String(id || '').trim()).filter(Boolean))
    : null;
  const seen = new Set<string>();
  const values: string[] = [];

  for (const card of cardSources) {
    if (!selectedIds.has(String(card.id || '').trim())) continue;
    for (const variant of card.variants || []) {
      if (selectedVariants && !selectedVariants.has(String(variant.id || '').trim())) continue;
      const value = String(variant.value || '')
        .replace(/\r?\n+/g, ', ')
        .replace(/\s+/g, ' ')
        .trim();
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
  }

  return values;
}

export function normalizePowerPrompterWildcardDraftName(rawName: string): string {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/\.txt$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}
