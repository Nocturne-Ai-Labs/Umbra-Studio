export const captionCategories = ['general', 'artist', 'copyright', 'character', 'meta', 'rating'] as const;
export type CaptionCategory = typeof captionCategories[number];
export type CaptionCategorySelection = Record<CaptionCategory, boolean>;

const categoryIds: Record<number, CaptionCategory> = {
  0: 'general', 1: 'artist', 3: 'copyright', 4: 'character', 5: 'meta', 9: 'rating',
};
const key = (tag: string) => tag.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');

export function createCaptionCategoryFilter(
  catalog: Iterable<{ tag: string; category: number }>,
  include: CaptionCategorySelection,
) {
  const categories = new Map<string, CaptionCategory>();
  for (const entry of catalog) {
    const category = categoryIds[entry.category];
    if (category) categories.set(key(entry.tag), category);
  }
  return (tags: string[], result?: Record<string, unknown>, preserveUnknown = true): string[] => {
    const detected = new Map<string, CaptionCategory>();
    for (const category of captionCategories) {
      const entries = result?.[category];
      const tags = category === 'rating' && entries && typeof entries === 'object'
        ? Object.keys(entries) : Array.isArray(entries) ? entries : [];
      for (const entry of tags) {
        const tag = typeof entry === 'string' ? entry : entry?.tag;
        if (typeof tag === 'string') detected.set(key(tag), category);
      }
    }
    return tags.filter(tag => {
      const category = detected.get(key(tag)) ?? categories.get(key(tag));
      return category ? include[category] : preserveUnknown;
    });
  };
}
