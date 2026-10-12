import { hydrateUmbraUiLoraWords } from '@/lib/umbraUiModels';
import { mangaEnhancements, type MangaGenerationSettings } from './mangaGeneration';
import type { MangaProject } from './mangaModel';

/** Merge delayed metadata into the current project, preserving edits made while it was loading. */
export function applyMangaLoraMetadata(
  project: MangaProject,
  expectedProjectId: string,
  entryId: string,
  requestedName: string,
  info: unknown,
): MangaGenerationSettings | null {
  if (project.id !== expectedProjectId || !project.generation) return null;
  const settings = project.generation;
  const enhancements = mangaEnhancements(settings);
  const index = enhancements.loras.findIndex(entry => entry.id === entryId
    && entry.name.replace(/\\/g, '/').toLowerCase() === requestedName.replace(/\\/g, '/').toLowerCase());
  if (index < 0) return null;
  const entry = enhancements.loras[index];
  const updated = hydrateUmbraUiLoraWords(entry, info);
  if (JSON.stringify(updated) === JSON.stringify(entry)) return null;
  return {
    ...settings,
    enhancements: {
      ...enhancements,
      loras: enhancements.loras.map((lora, position) => position === index ? updated : lora),
    },
  };
}
