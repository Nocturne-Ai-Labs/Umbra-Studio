export const GALLERY_VERSIONED_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

export function galleryMediaCacheControl(revision: unknown): string {
  const value = String(revision || '').trim();
  return value && !/^v\d+$/i.test(value)
    ? GALLERY_VERSIONED_MEDIA_CACHE_CONTROL
    : GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL;
}
