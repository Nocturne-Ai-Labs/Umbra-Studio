export function restoreUmbraImg2ImgSource<T extends { path: string; name: string; imageUrl: string }>(source: T): T {
  const canRestage = !source.imageUrl || source.imageUrl.startsWith('/api/fs/image?');
  if (!source.path || !source.name || !canRestage) return source;
  // Gallery and typed local paths can be staged again if ComfyUI's input copy was removed.
  return { ...source, name: '' };
}
