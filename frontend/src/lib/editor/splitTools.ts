export interface SplitCandidate {
  id?: string;
  path: string;
  type?: string;
  name?: string;
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'flv', 'wmv']);

const getPathExtension = (path: string) => {
  const fileName = path.split('/').pop() ?? path;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return fileName.slice(dotIndex + 1).toLowerCase();
};

export const isSplitCompatibleCandidate = (item: SplitCandidate | null | undefined) => {
  if (!item?.path) return false;
  if (item.type === 'folder' || item.type === 'video' || item.type === 'gif') return false;

  const ext = getPathExtension(item.path);
  if (ext === 'gif') return false;
  if (VIDEO_EXTENSIONS.has(ext)) return false;
  return true;
};

const dedupeByPath = (items: SplitCandidate[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
};

export const resolveSplitMenuTargets = (
  clickedItem: SplitCandidate | null | undefined,
  selection: SplitCandidate[],
) => {
  const normalizedSelection = dedupeByPath(selection.filter(Boolean));
  const clickedIsInSelection = !!clickedItem && normalizedSelection.some((item) => item.path === clickedItem.path);
  const effectiveSelection = clickedItem
    ? clickedIsInSelection
      ? normalizedSelection
      : [clickedItem]
    : normalizedSelection;

  const compatibleSelection = effectiveSelection.filter((item) => isSplitCompatibleCandidate(item));
  const stackTarget = isSplitCompatibleCandidate(clickedItem)
    ? clickedItem?.path ?? null
    : compatibleSelection[0]?.path ?? null;
  const bashTargets = compatibleSelection.length === 4
    ? compatibleSelection.map((item) => item.path)
    : [];

  return {
    stackTarget,
    bashTargets,
  };
};
