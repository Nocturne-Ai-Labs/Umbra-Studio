export const GALLERY_VERSIONED_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

export function galleryMediaCacheControl(revision: unknown): string {
  return String(revision || '').trim()
    ? GALLERY_VERSIONED_MEDIA_CACHE_CONTROL
    : GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL;
}
