export interface MangaImageProvenance { sourcePath?: string; metadataJson: string }

export function parseMangaImageProvenance(value: unknown): MangaImageProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Manga image provenance.');
  const raw = value as Record<string, unknown>;
  if (typeof raw.metadataJson !== 'string' || raw.metadataJson.length > 2_000_000) throw new Error('Manga image metadata exceeds its supported size.');
  const metadata = JSON.parse(raw.metadataJson);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid Manga image metadata.');
  if (raw.sourcePath !== undefined && (typeof raw.sourcePath !== 'string' || raw.sourcePath.length > 32768 || /[\x00-\x1f]/.test(raw.sourcePath))) throw new Error('Invalid Manga source path.');
  return { metadataJson: JSON.stringify(metadata), ...(raw.sourcePath ? { sourcePath: raw.sourcePath as string } : {}) };
}
