import { describe, expect, it } from 'bun:test';
import { buildTrashThumbnailUrl } from './galleryTrashMedia';

describe('buildTrashThumbnailUrl', () => {
  it('preserves the file-backed revision from a trash listing', () => {
    const url = buildTrashThumbnailUrl({
      path: 'User/Trash/2026-07-27/example.png',
      thumbnailUrl: '/api/fs/thumbnail?path=User%2FTrash%2F2026-07-27%2Fexample.png&size=small&q=70&rev=m1234-s5678',
    }, {
      quality: 64,
      defer: true,
      retry: 2,
      fallbackRevision: 'metadata-revision',
    });

    const parsed = new URL(url, 'http://umbra.local');
    expect(parsed.searchParams.get('rev')).toBe('m1234-s5678');
    expect(parsed.searchParams.get('q')).toBe('64');
    expect(parsed.searchParams.get('defer')).toBe('1');
    expect(parsed.searchParams.get('retry')).toBe('2');
  });

  it('uses the metadata revision only when no live thumbnail URL exists', () => {
    const url = buildTrashThumbnailUrl({
      path: 'User/Trash/2026-07-27/example image.png',
    }, {
      fallbackRevision: 'trash-entry-123',
    });

    const parsed = new URL(url, 'http://umbra.local');
    expect(parsed.searchParams.get('path')).toBe('User/Trash/2026-07-27/example image.png');
    expect(parsed.searchParams.get('rev')).toBe('trash-entry-123');
  });
});
