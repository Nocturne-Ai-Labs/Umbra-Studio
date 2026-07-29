import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { enrichTrashListItem } from './trash';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('enrichTrashListItem', () => {
  it('adds a stat-backed thumbnail revision for a trashed file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-trash-list-'));
    temporaryRoots.push(root);
    const trashFolder = join(root, 'User', 'Trash', '2026-07-27');
    await mkdir(trashFolder, { recursive: true });
    await writeFile(join(trashFolder, 'sample.png'), Buffer.alloc(321, 7));

    const item = await enrichTrashListItem({
      id: 'trash-entry-1',
      originalPath: 'Tools/ComfyUI/output/sample.png',
      trashPath: 'User/Trash/2026-07-27/sample.png',
      name: 'sample.png',
      type: 'image',
      size: 0,
      deletedAt: '2026-07-27T01:00:00.000Z',
      expiresAt: '2026-08-26T01:00:00.000Z',
    }, {
      ROOT_DIR: root,
      USER_DIR: join(root, 'User'),
      corsHeaders: {},
    });

    expect(item.size).toBe(321);
    expect(item.modifiedMs).toBeGreaterThan(0);
    expect(item.thumbnailUrl).toMatch(/rev=m\d+-s321/);
    expect(item.url).toMatch(/rev=m\d+-s321/);
  });

  it('does not invent a media thumbnail for a trashed folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-trash-folder-'));
    temporaryRoots.push(root);

    const item = await enrichTrashListItem({
      id: 'trash-folder-1',
      originalPath: 'Tools/ComfyUI/output/folder',
      trashPath: 'User/Trash/2026-07-27/folder',
      name: 'folder',
      type: 'folder',
      size: 0,
      deletedAt: '2026-07-27T01:00:00.000Z',
      expiresAt: '2026-08-26T01:00:00.000Z',
    }, {
      ROOT_DIR: root,
      USER_DIR: join(root, 'User'),
      corsHeaders: {},
    });

    expect(item.thumbnailUrl).toBeUndefined();
  });
});
