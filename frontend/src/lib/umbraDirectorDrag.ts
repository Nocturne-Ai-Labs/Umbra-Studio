export const UMBRA_GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';

const IMAGE_PATH_RE = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

type UmbraDirectorDataTransfer = Pick<DataTransfer, 'getData'>;

export function isUmbraDirectorImageName(value: unknown): boolean {
  return IMAGE_PATH_RE.test(String(value || '').trim());
}

export function readUmbraDirectorDraggedImagePath(dataTransfer: UmbraDirectorDataTransfer): string {
  const normalizePath = (value: unknown) => String(value || '').trim();
  const findImagePath = (values: unknown[]) => values
    .map(normalizePath)
    .find((value) => IMAGE_PATH_RE.test(value)) || '';

  try {
    const paths = JSON.parse(dataTransfer.getData(UMBRA_GALLERY_DRAG_PATHS_MIME) || '[]');
    if (Array.isArray(paths)) {
      const path = findImagePath(paths);
      if (path) return path;
    }
  } catch {}

  try {
    const payload = JSON.parse(dataTransfer.getData('application/json') || '{}') as {
      paths?: unknown[];
      image?: { path?: unknown };
      images?: Array<{ path?: unknown }>;
    };
    const path = findImagePath([
      ...(Array.isArray(payload.paths) ? payload.paths : []),
      payload.image?.path,
      ...(Array.isArray(payload.images) ? payload.images.map((entry) => entry?.path) : []),
    ]);
    if (path) return path;
  } catch {}

  const plainText = normalizePath(dataTransfer.getData('text/plain'));
  return IMAGE_PATH_RE.test(plainText) && !/^https?:\/\//i.test(plainText) ? plainText : '';
}
