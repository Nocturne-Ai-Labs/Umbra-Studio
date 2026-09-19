import { statSync } from 'fs';
import { resolve } from 'path';

export function resolveGalleryPublicDir(rootDir: string, gallerySourceDir: string): string {
  const runtimePublic = resolve(rootDir, 'gallery', 'public');
  const candidates = [
    resolve(rootDir, 'resources', 'app', 'gallery', 'public'),
    runtimePublic,
    resolve(gallerySourceDir, 'public'),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Standalone Gallery assets are optional in the React Gallery packages.
    }
  }
  // The supervisor and child must agree even when no standalone assets exist.
  return runtimePublic;
}
