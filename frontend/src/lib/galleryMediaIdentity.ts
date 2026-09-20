export type GalleryMediaIdentitySource = {
  revision?: unknown;
  metadataRevision?: unknown;
  metadataReady?: unknown;
  uid?: unknown;
  id?: unknown;
  path?: unknown;
  createdMs?: unknown;
  modifiedMs?: unknown;
  size?: unknown;
};

function normalizeIdentityPath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function normalizeRevisionNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function galleryMediaRevision(source: GalleryMediaIdentitySource): string {
  if (typeof source.revision === 'string') return source.revision;
  const path = normalizeIdentityPath(source.path);
  const uid = String(source.uid || '').trim();
  const id = String(source.id || '').trim();
  const stableIdentity = uid && normalizeIdentityPath(uid) !== path
    ? uid
    : (id && normalizeIdentityPath(id) !== path ? id : '');
  const createdMs = normalizeRevisionNumber(source.createdMs);
  const modifiedMs = normalizeRevisionNumber(source.modifiedMs);
  const size = normalizeRevisionNumber(source.size);

  // A path by itself is not a content revision and must never receive immutable caching.
  if (!stableIdentity && createdMs === 0 && modifiedMs === 0 && size === 0) return '';
  return [stableIdentity || path, createdMs, modifiedMs, size].join('-');
}

export function galleryMediaCacheKey(pathValue: unknown, source: GalleryMediaIdentitySource): string {
  const path = normalizeIdentityPath(pathValue);
  if (!path) return '';
  return `${path}\u0000${galleryMediaRevision(source) || 'unversioned'}`;
}

export function galleryMetadataCacheKey(pathValue: unknown, source?: GalleryMediaIdentitySource): string {
  const key = galleryMediaCacheKey(pathValue, source || {});
  if (!key || source?.metadataRevision === '') return '';
  if (!source) return key;
  return `${key}\u0000${JSON.stringify([source.metadataRevision ?? null, source.metadataReady ?? null])}`;
}
