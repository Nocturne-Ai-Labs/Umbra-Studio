// Shared by Node publishing checks and Bun's updater. Build metadata does not
// affect precedence; the comparator in appUpdate.ts handles that separately.
export function isUmbraReleaseVersion(value) {
  return typeof value === 'string'
    && /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(value);
}
