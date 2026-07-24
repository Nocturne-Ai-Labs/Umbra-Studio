import { describe, expect, test } from 'bun:test';
import { reconcileGalleryViewerNavigation } from './galleryViewerNavigation';

type TestFile = {
  path: string;
  type?: 'image' | 'folder';
};

function numberedFiles(count: number): TestFile[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `D:/output/image-${String(index + 1).padStart(3, '0')}.png`,
    type: 'image',
  }));
}

describe('gallery viewer navigation', () => {
  test('extends an open viewer session when another lazy page arrives', () => {
    const activeFiles = numberedFiles(144);
    const initialPage = activeFiles.slice(0, 72);

    const reconciled = reconcileGalleryViewerNavigation(
      initialPage,
      activeFiles,
      initialPage[0].path,
    );

    expect(reconciled).toHaveLength(144);
    expect(reconciled[72]?.path).toBe('D:/output/image-073.png');
    expect(reconciled.at(-1)?.path).toBe('D:/output/image-144.png');
  });

  test('preserves an isolated session when its open file is outside the active folder', () => {
    const session = [{ path: 'D:/other/external.png', type: 'image' as const }];
    const activeFiles = numberedFiles(144);

    expect(reconcileGalleryViewerNavigation(session, activeFiles, session[0].path)).toBe(session);
  });

  test('returns the existing session when the ordered paths have not changed', () => {
    const session = numberedFiles(72);
    const equivalentActiveFiles = session.map((file) => ({ ...file }));

    expect(reconcileGalleryViewerNavigation(session, equivalentActiveFiles, session[10].path)).toBe(session);
  });

  test('normalizes path separators and excludes duplicate or folder entries', () => {
    const session = [{ path: 'D:/output/image-001.png', type: 'image' as const }];
    const activeFiles: TestFile[] = [
      { path: 'D:\\output\\image-001.png', type: 'image' },
      { path: 'd:/output/image-001.png', type: 'image' },
      { path: 'D:/output/subfolder', type: 'folder' },
      { path: 'D:/output/image-002.png', type: 'image' },
    ];

    const reconciled = reconcileGalleryViewerNavigation(session, activeFiles, session[0].path);

    expect(reconciled.map((file) => file.path)).toEqual([
      'D:\\output\\image-001.png',
      'D:/output/image-002.png',
    ]);
  });
});
