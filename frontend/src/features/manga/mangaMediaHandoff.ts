import { openUmbraUiExtrasTool } from '@/lib/umbraUiExtrasNavigation';
export const MANGA_HANDOFF_KEY = 'umbra:manga:pending-images';
export const MANGA_HANDOFF_EVENT = 'umbra:manga:images';
export const MANGA_ASSET_MIME = 'application/x-umbra-manga-asset';
export const MANGA_GALLERY_MIME = 'application/x-umbra-gallery-paths';
export interface MangaImageHandoff { id: string; path: string }
export const isMangaImagePath = (path: string) => !/^[a-z]+:\/\//i.test(path) && /\.(png|jpe?g|webp|avif|bmp|gif|tiff?)$/i.test(path);
export function readMangaImageHandoff(): MangaImageHandoff[] {
  try { const value = JSON.parse(sessionStorage.getItem(MANGA_HANDOFF_KEY) || '[]'); return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.path === 'string' && isMangaImagePath(item.path)).slice(0, 500) : []; } catch { return []; }
}
export function acknowledgeMangaImages(ids: string[]) {
  sessionStorage.setItem(MANGA_HANDOFF_KEY, JSON.stringify(readMangaImageHandoff().filter(item => !ids.includes(item.id))));
}
export function stageMangaImages(paths: string[]) {
  const images = [...new Set(paths)].filter(isMangaImagePath);
  if (!images.length) throw new Error('Select images to add to Manga Studio.');
  const pending = readMangaImageHandoff();
  if (pending.length + images.length > 500) throw new Error('Import fewer images at a time.');
  sessionStorage.setItem(MANGA_HANDOFF_KEY, JSON.stringify([...pending, ...images.map(path => ({ id: crypto.randomUUID(), path }))]));
  openUmbraUiExtrasTool('manga');
  window.dispatchEvent(new Event(MANGA_HANDOFF_EVENT));
}
export async function loadMangaImagePath(path: string): Promise<File> {
  if (!isMangaImagePath(path)) throw new Error('Manga Studio accepts images only.');
  const result = await fetch(`/api/fs/image?${new URLSearchParams({ path })}`);
  if (!result.ok) throw new Error(`Image could not be read (${result.status}).`);
  if (!result.headers.get('content-type')?.startsWith('image/')) throw new Error('The selected file is not an image.');
  if (Number(result.headers.get('content-length')) > 20_000_000) throw new Error('Import images up to 20 MB.');
  // Bound streaming reads too, including servers without a Content-Length header.
  const reader = result.body?.getReader(); if (!reader) throw new Error('The image could not be read.');
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 20_000_000) throw new Error('Import images up to 20 MB.'); chunks.push(new Uint8Array(chunk.value)); } } finally { await reader.cancel().catch(() => undefined); }
  return new File(chunks, path.replace(/\\/g, '/').split('/').pop() || 'Imported image', { type: result.headers.get('content-type')!.split(';')[0] });
}
