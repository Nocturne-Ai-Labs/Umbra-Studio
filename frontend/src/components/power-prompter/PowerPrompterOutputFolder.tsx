import { useMemo } from 'react';
import { FolderOutput } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { useStore } from '@/store/useStore';
import { getUmbraUiPinnedFolderLabel, normalizeUmbraUiPinnedFolder } from '@/lib/pinnedOutputFolders';

export function PowerPrompterOutputFolder({ value, onChange }: {
  value: string;
  onChange: (folder: string) => void;
}) {
  const pins = useStore((state) => state.appSettings['library.pinnedFolders']);
  const folders = useMemo(() => Array.from(new Set(
    (Array.isArray(pins) ? pins : []).map(normalizeUmbraUiPinnedFolder).filter(Boolean),
  )), [pins]);
  const selected = normalizeUmbraUiPinnedFolder(value);
  const missing = Boolean(selected && !folders.includes(selected));

  return (
    <section data-powerprompter-output-folder="" className="min-w-0 space-y-2 border-t border-white/10 pt-3">
      <label className="flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-200">
          <FolderOutput size={13} /> Pinned Folder
        </span>
        <UmbraSelectControl
          value={selected}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Power Prompter pinned output folder"
          className="min-h-9 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-2 font-mono text-[11px] text-zinc-200"
          title="Choose a Gallery pinned folder. Power Prompter keeps its dated, set, and style subfolders inside it."
        >
          <option value="">Default dated output</option>
          {missing && <option value={selected} disabled>{getUmbraUiPinnedFolderLabel(selected)} (not pinned)</option>}
          {folders.map((folder) => (
            <option key={folder} value={folder}>{getUmbraUiPinnedFolderLabel(folder)}</option>
          ))}
        </UmbraSelectControl>
      </label>
      {selected && (
        <div className={missing ? 'break-all font-mono text-[10px] text-amber-300' : 'break-all font-mono text-[10px] text-zinc-400'} title={selected}>
          {selected}
        </div>
      )}
    </section>
  );
}
