export type FolderActivityEntry = { id: string; count: number; direct: boolean };
export type FolderActivitySnapshot = {
  epoch: string;
  folders: Array<{ path: string; entries: FolderActivityEntry[] }>;
  recentFolders: Array<{ path: string; updatedAt: number }>;
};
export type FolderActivityReadState = { epoch: string; counts: Record<string, number> };
export const FOLDER_ACTIVITY_READ_KEY = 'umbra:filmstrip-folder-activity-read:v1';

export function folderActivityCounts(snapshot: FolderActivitySnapshot | null, read: FolderActivityReadState) {
  const counts: Record<string, number> = {};
  const unique = new Map<string, number>();
  for (const folder of snapshot?.folders || []) {
    counts[folder.path] = 0;
    for (const entry of folder.entries) {
      const unread = Math.max(0, entry.count - (read.epoch === snapshot?.epoch ? read.counts[entry.id] || 0 : 0));
      counts[folder.path] += unread;
      unique.set(entry.id, unread);
    }
  }
  return { counts, total: [...unique.values()].reduce((sum, count) => sum + count, 0) };
}

export function acknowledgeFolderActivity(snapshot: FolderActivitySnapshot, read: FolderActivityReadState, path: string): FolderActivityReadState {
  const counts = read.epoch === snapshot.epoch ? { ...read.counts } : {};
  for (const entry of snapshot.folders.find(folder => folder.path === path)?.entries || []) {
    if (!entry.direct) continue;
    counts[entry.id] = Math.max(counts[entry.id] || 0, entry.count);
  }
  return { epoch: snapshot.epoch, counts };
}

export function readFolderActivityState(): FolderActivityReadState {
  try {
    const value = JSON.parse(localStorage.getItem(FOLDER_ACTIVITY_READ_KEY) || 'null');
    if (typeof value?.epoch === 'string' && value.counts && typeof value.counts === 'object') {
      return { epoch: value.epoch, counts: Object.fromEntries(Object.entries(value.counts).filter(([id, count]) =>
        /^[a-f0-9]{64}$/.test(id) && Number.isSafeInteger(count) && Number(count) >= 0,
      )) as Record<string, number> };
    }
  } catch { /* Browser storage is optional. */ }
  return { epoch: '', counts: {} };
}
