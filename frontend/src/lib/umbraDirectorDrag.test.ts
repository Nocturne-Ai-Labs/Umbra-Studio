import { describe, expect, it } from 'bun:test';
import {
  readUmbraDirectorDraggedImagePath,
  UMBRA_GALLERY_DRAG_PATHS_MIME,
} from './umbraDirectorDrag';

function buildTransfer(values: Record<string, string>): Pick<DataTransfer, 'getData'> {
  return {
    getData: (type: string) => values[type] || '',
  };
}

describe('Umbra Director image drag payloads', () => {
  it('reads the first image from a filmstrip multi-selection', () => {
    const transfer = buildTransfer({
      [UMBRA_GALLERY_DRAG_PATHS_MIME]: JSON.stringify([
        'D:/videos/reference.mp4',
        'D:/images/shot-guide.png',
        'D:/images/alternate.webp',
      ]),
    });

    expect(readUmbraDirectorDraggedImagePath(transfer)).toBe('D:/images/shot-guide.png');
  });

  it('reads the Gallery JSON payload when the path MIME is unavailable', () => {
    const transfer = buildTransfer({
      'application/json': JSON.stringify({
        source: 'react-gallery',
        image: { path: 'D:\\Gallery\\guide.jpg' },
      }),
    });

    expect(readUmbraDirectorDraggedImagePath(transfer)).toBe('D:\\Gallery\\guide.jpg');
  });

  it('rejects remote thumbnail URLs and unsupported media', () => {
    expect(readUmbraDirectorDraggedImagePath(buildTransfer({
      'text/plain': 'http://127.0.0.1:8212/api/fs/image?path=guide.png',
    }))).toBe('');
    expect(readUmbraDirectorDraggedImagePath(buildTransfer({
      [UMBRA_GALLERY_DRAG_PATHS_MIME]: JSON.stringify(['D:/videos/reference.mp4']),
    }))).toBe('');
  });
});
