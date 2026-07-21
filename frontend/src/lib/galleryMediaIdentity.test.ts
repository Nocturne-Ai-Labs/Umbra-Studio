import { describe, expect, test } from 'bun:test';
import { galleryMediaCacheKey, galleryMediaRevision } from './galleryMediaIdentity';

describe('gallery media identity', () => {
  test('changes when a file path is reused by different content', () => {
    const previous = {
      uid: 'old-file-uid',
      path: 'D:/output/image-001.png',
      createdMs: 100,
      modifiedMs: 200,
      size: 4096,
    };
    const replacement = {
      uid: 'new-file-uid',
      path: 'D:/output/image-001.png',
      createdMs: 300,
      modifiedMs: 400,
      size: 8192,
    };

    expect(galleryMediaRevision(previous)).not.toBe(galleryMediaRevision(replacement));
    expect(galleryMediaCacheKey(previous.path, previous)).not.toBe(galleryMediaCacheKey(replacement.path, replacement));
  });

  test('uses file stats when an indexed uid is unavailable', () => {
    const previous = {
      id: 'D:/output/image-001.png',
      path: 'D:/output/image-001.png',
      modifiedMs: 200,
      size: 4096,
    };
    const replacement = { ...previous, modifiedMs: 201 };

    expect(galleryMediaRevision(previous)).not.toBe(galleryMediaRevision(replacement));
  });

  test('does not treat a path-only fallback as immutable content', () => {
    const unresolved = {
      id: 'D:/output/image-001.png',
      path: 'D:/output/image-001.png',
    };

    expect(galleryMediaRevision(unresolved)).toBe('');
  });
});
