import { describe, expect, test } from 'bun:test';
import { resolveUmbraCanvasMaskSnapshotLeases } from './umbraUiCanvasAssetLeases';

describe('Umbra canvas mask snapshot leases', () => {
  test('retains every transformed mask until its document revision commits', () => {
    const result = resolveUmbraCanvasMaskSnapshotLeases({
      referencedUrls: new Set(['blob:existing-mask']),
      leases: new Map([
        ['blob:transformed-active', 12],
        ['blob:transformed-secondary', 12],
      ]),
      pendingRestoreUrl: 'blob:transformed-active',
      presentRevision: 11,
    });

    expect([...result.retainedUrls]).toEqual([
      'blob:existing-mask',
      'blob:transformed-active',
      'blob:transformed-secondary',
    ]);
    expect(result.settledLeaseUrls).toEqual([]);
  });

  test('settles leases once history owns their URLs', () => {
    const result = resolveUmbraCanvasMaskSnapshotLeases({
      referencedUrls: new Set(['blob:transformed-active', 'blob:transformed-secondary']),
      leases: new Map([
        ['blob:transformed-active', 12],
        ['blob:transformed-secondary', 12],
      ]),
      pendingRestoreUrl: '',
      presentRevision: 12,
    });

    expect(result.retainedUrls).toEqual(new Set(['blob:transformed-active', 'blob:transformed-secondary']));
    expect(result.settledLeaseUrls).toEqual(['blob:transformed-active', 'blob:transformed-secondary']);
  });

  test('releases a lease when the expected revision commits without using it', () => {
    const result = resolveUmbraCanvasMaskSnapshotLeases({
      referencedUrls: new Set(),
      leases: new Map([['blob:unused-mask', 12]]),
      pendingRestoreUrl: '',
      presentRevision: 12,
    });

    expect(result.retainedUrls.has('blob:unused-mask')).toBe(false);
    expect(result.settledLeaseUrls).toEqual(['blob:unused-mask']);
  });
});
