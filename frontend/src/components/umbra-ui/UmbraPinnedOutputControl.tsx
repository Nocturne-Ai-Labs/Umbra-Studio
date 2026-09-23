import React from 'react';
import { FolderOutput } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { getUmbraUiPinnedFolderLabel, normalizeUmbraUiPinnedFolder, resolveUmbraUiPinnedFolderOption } from '@/lib/pinnedOutputFolders';

export function usePinnedOutputFolder(scope: string) {
  const key = `umbra-ui:pinned-output:${scope}`;
  const read = () => { try { return window.localStorage.getItem(key) || ''; } catch { return ''; } };
  const [selection, setSelection] = React.useState(() => ({ key, folder: read() }));
  const folder = selection.key === key ? selection.folder : read();
  const selectFolder = React.useCallback((value: string) => {
    const next = normalizeUmbraUiPinnedFolder(value);
    setSelection({ key, folder: next });
    try { window.localStorage.setItem(key, next); } catch { /* session-only when storage is unavailable */ }
  }, [key]);
  return [folder, selectFolder] as const;
}

export function UmbraPinnedOutputControl({ value, onChange, task, disabled = false }: {
  value: string; onChange: (value: string) => void; task: string; disabled?: boolean;
}) {
  const pins = useStore((state) => state.appSettings['library.pinnedFolders']);
  const folders = React.useMemo(() => Array.from(new Set((Array.isArray(pins) ? pins : [])
    .map(normalizeUmbraUiPinnedFolder).filter(Boolean))), [pins]);
  const selected = resolveUmbraUiPinnedFolderOption(value, folders);
  return <label className="flex min-w-0 flex-wrap items-center gap-2" title={selected ? `${selected}/${task}` : 'Use the existing default output destination. Pin folders in Gallery to select them here.'}>
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase"><FolderOutput size={12} />Pinned folder</span>
    <UmbraSelectControl value={selected} onChange={(event) => onChange(event.target.value)} disabled={disabled}
      aria-label={`${task} pinned folder output`} className="h-9 min-w-0 flex-1 rounded border border-[var(--umbra-border)] bg-black/25 px-2 text-xs" title={`${task} output destination`}>
      <option value="">Default output</option>
      {selected && !folders.includes(selected) && <option value={selected}>{getUmbraUiPinnedFolderLabel(selected)} (unavailable)</option>}
      {folders.map((folder) => <option key={folder} value={folder}>{getUmbraUiPinnedFolderLabel(folder)}</option>)}
    </UmbraSelectControl>
  </label>;
}
