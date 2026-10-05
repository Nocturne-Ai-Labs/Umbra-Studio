import { isAbsolute, relative, resolve, sep } from 'node:path';
import { resolveAllowedGalleryPath } from './GalleryPathAccess';

// Card browsing may follow the explicitly configured Prompts directory link.
// This exception is limited to text listings below that logical directory;
// canonical authorization still rejects nested links escaping its real root.
export async function resolvePowerPrompterBrowserPath(
  candidate: string,
  filter: string | null,
  promptsRoot: string,
  ordinaryRoots: string[],
): Promise<string | null> {
  const ordinary = await resolveAllowedGalleryPath(candidate, ordinaryRoots);
  if (ordinary || filter !== 'text') return ordinary;
  const rel = relative(resolve(promptsRoot), resolve(candidate));
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return resolveAllowedGalleryPath(candidate, [promptsRoot]);
}
