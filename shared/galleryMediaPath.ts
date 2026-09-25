// Keep the split Gallery worker and the in-process media fallback on the same
// allowlist. A path inside a Gallery root is not necessarily a media file.
const GALLERY_MEDIA_READ_PATTERN = /\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?|heic|heif|jxl|svg|apng|mp4|webm|mov|mkv|avi|m4v|wmv|flv)$/i;

export function isGalleryMediaReadPath(path: string): boolean {
  return GALLERY_MEDIA_READ_PATTERN.test(path);
}
