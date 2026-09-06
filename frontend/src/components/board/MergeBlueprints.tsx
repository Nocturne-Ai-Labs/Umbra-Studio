import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Loader2, Upload } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { mergeButtonClass as buttonClass } from './ModelMergeControls';

export type MergeBlueprintSetup = {
  a: string; b: string; ratio: number; name: string; cleanMetadata?: boolean;
  blocks: Record<string, number>;
  lorasA: { id: string; model: string; strength: number; enabled: boolean }[];
  lorasB: { id: string; model: string; strength: number; enabled: boolean }[];
};
type Entry = { id: string; title: string; createdAt: string; family: string };
export async function getMergeBlueprint(id: string) {
  const response = await fetch('/api/data-forge/model-merge/blueprint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Blueprint unavailable. Import its backup first.');
  return result.blueprint as Entry & { setup: MergeBlueprintSetup };
}

export function MergeBlueprints({ refreshKey, locked, onLoad }: { refreshKey: string; locked: boolean; onLoad: (setup: MergeBlueprintSetup) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const importFile = async (file: File) => {
    setBusy(true); setError('');
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('Blueprint files must be smaller than 4 MB.');
      const response = await fetch('/api/data-forge/model-merge/blueprints/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(await file.text())) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not import blueprint.');
      const value = result.blueprint as Entry;
      setEntries(current => [value, ...current.filter(item => item.id !== value.id)]); setId(value.id);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/data-forge/model-merge/blueprints', { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load blueprints.');
      setEntries(result.blueprints); setError('');
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [refreshKey]);
  const read = async (download: boolean) => {
    setBusy(true); setError('');
    try {
      const value = await getMergeBlueprint(id);
      if (download) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${value.title}.umbra-blueprint.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else onLoad(value.setup);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <section aria-label="Saved merge blueprints" className="space-y-2 border-b border-[var(--umbra-border)] pb-5">
    <label htmlFor="merge-blueprint" className="block text-sm font-semibold">Merge history / blueprints</label>
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-44 flex-1"><UmbraSelect triggerId="merge-blueprint" ariaLabel="Saved merge blueprint" value={id} onValueChange={setId} disabled={locked || busy} placeholder="Choose a completed merge" options={entries.map(item => ({ value: item.id, label: item.title, description: `${item.family} | ${new Date(item.createdAt).toLocaleString()}` }))} buttonClassName="!min-h-11 !text-sm" /></div>
      <button className={buttonClass} disabled={locked || busy || !id} title="Restore this blueprint into the editable merge controls" onClick={() => void read(false)}>{busy ? <Loader2 size={17} className="animate-spin" /> : <FolderOpen size={17} />}Continue editing</button>
      <button className={buttonClass} disabled={busy || !id} title="Export private blueprint (includes source models and LoRAs)" aria-label="Export private blueprint" onClick={() => void read(true)}><Download size={17} /></button>
      <button className={buttonClass} disabled={locked || busy} title="Import blueprint backup" aria-label="Import blueprint backup" onClick={() => fileInput.current?.click()}><Upload size={17} /></button>
      <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </section>;
}
