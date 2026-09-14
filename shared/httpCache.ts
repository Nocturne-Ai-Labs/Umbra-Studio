const ENTITY_TAG = '(?:W/)?"[\\x21\\x23-\\x7e\\x80-\\xff]*"';
const ENTITY_TAG_LIST = new RegExp(`^[ \\t]*${ENTITY_TAG}(?:[ \\t]*,[ \\t]*${ENTITY_TAG})*[ \\t]*$`);

export function createVariantEtag(etag: string, variant: string): string {
  if (!new RegExp(`^${ENTITY_TAG}$`).test(etag)) throw new Error('Invalid source ETag');
  return `${etag.slice(0, -1)}-${encodeURIComponent(variant)}"`;
}

// If-None-Match uses weak comparison for these read-only media responses.
export function matchesIfNoneMatch(value: string | null, etag: string): boolean {
  if (!value) return false;
  if (value.trim() === '*') return true;
  if (!ENTITY_TAG_LIST.test(value)) return false;
  const opaqueTag = etag.replace(/^W\//, '');
  return [...value.matchAll(new RegExp(ENTITY_TAG, 'g'))]
    .some(([candidate]) => candidate.replace(/^W\//, '') === opaqueTag);
}

export function permitsConditionalRange(value: string | null, etag: string): boolean {
  if (value === null) return true;
  const validator = value.trim();
  // Files can change more than once per second: Gallery's Last-Modified dates
  // cannot prove byte identity. Only an exact strong entity tag can do that.
  return validator.startsWith('"')
    && new RegExp(`^${ENTITY_TAG}$`).test(validator)
    && validator === etag;
}
