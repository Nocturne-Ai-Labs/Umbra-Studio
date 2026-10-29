import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { createGalleryPathAuthorizer } from './GalleryPathAccess';

/** Refresh permissions when settings change, not after an arbitrary time window. */
export function createConfiguredGalleryAuthorizer(rootDir: string, trashRoot: () => string, resolveLiteral: (value: string) => string) {
  let cached: { revision: string; authorizer: ReturnType<typeof createGalleryPathAuthorizer> } | null = null;
  const settingsPath = join(rootDir, 'User', 'Config', 'settings.json');
  return async () => {
    const trash = trashRoot();
    const stat = await fs.stat(settingsPath).catch(() => null);
    const revision = `${trash}:${stat ? `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : 'missing'}`;
    if (cached?.revision === revision) return cached.authorizer;
    const authorizer = (async () => {
      const roots = [rootDir, trash];
      let app: Record<string, unknown> = {};
      try {
        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        if (settings.app && typeof settings.app === 'object' && !Array.isArray(settings.app)) app = settings.app;
      } catch { /* Unreadable settings do not grant external access. */ }
      const addRoot = (value: unknown) => {
        if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return;
        roots.push(resolveLiteral(value.replace(/\$\{PROJECT_ROOT\}/g, rootDir)));
      };
      addRoot(app['comfyui.externalOutputPath']);
      if (app['library.enableExternalRoots'] !== false && Array.isArray(app['library.externalRoots'])) {
        for (const root of app['library.externalRoots']) addRoot(root);
      }
      return createGalleryPathAuthorizer(roots);
    })();
    const entry = { revision, authorizer };
    cached = entry;
    try { return await authorizer; }
    catch (error) { if (cached === entry) cached = null; throw error; }
  };
}
