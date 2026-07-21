import { describe, expect, test } from 'bun:test';
import {
  GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL,
  GALLERY_VERSIONED_MEDIA_CACHE_CONTROL,
  galleryMediaCacheControl,
} from './GalleryMediaCache';

describe('Gallery media cache policy', () => {
  test('only immutable-caches a content-versioned URL', () => {
    expect(galleryMediaCacheControl('uid-100-200-4096')).toBe(GALLERY_VERSIONED_MEDIA_CACHE_CONTROL);
  });

  test('forces path-only URLs to revalidate', () => {
    expect(galleryMediaCacheControl('')).toBe(GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL);
    expect(galleryMediaCacheControl(undefined)).toBe(GALLERY_UNVERSIONED_MEDIA_CACHE_CONTROL);
  });
});
