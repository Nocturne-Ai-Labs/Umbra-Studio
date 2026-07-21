import { useEffect, useState } from 'react';
import { Database, FileText, FolderOpen, Loader2, Play } from 'lucide-react';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

type GeneratorMode = 'character-attributes' | 'tags';
type CharacterSource = 'danbooru' | 'single' | 'series';

type GeneratorResult = {
  ok: boolean;
  id: string;
  running: boolean;
  exitCode: number | null;
  error?: string;
  outputPath: string;
  stdout: string;
  stderr: string;
  preview: string;
};

export function DanbooruDatasetGeneratorTab() {
  const [mode, setMode] = useState<GeneratorMode>('character-attributes');
  const [characterSource, setCharacterSource] = useState<CharacterSource>('danbooru');
  const [tag, setTag] = useState('');
  const [seriesTag, setSeriesTag] = useState('');
  const [tagCategory, setTagCategory] = useState('0');
  const [limit, setLimit] = useState('100');
  const [postSample, setPostSample] = useState(100);
  const [seriesPostSample, setSeriesPostSample] = useState(200);
  const [maxAttributes, setMaxAttributes] = useState(12);
  const [minCharacterPosts, setMinCharacterPosts] = useState(100);
  const [minTagPosts, setMinTagPosts] = useState(150);
  const [minFrequency, setMinFrequency] = useState(0.12);
  const [postFilter, setPostFilter] = useState('solo');
  const [concurrency, setConcurrency] = useState(4);
  const [removeUnderscores, setRemoveUnderscores] = useState(false);
  const [appendCopyright, setAppendCopyright] = useState(true);
  const [animaArtistTokens, setAnimaArtistTokens] = useState(false);
  const [outputFileName, setOutputFileName] = useState('danbooru-character-attributes.csv');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratorResult | null>(null);

  const runGenerator = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/booru/dataset-generator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          characterSource,
          tag,
          seriesTag,
          tagCategory,
          limit,
          postSample,
          seriesPostSample,
          maxAttributes,
          minCharacterPosts,
          minTagPosts,
          minFrequency,
          postFilter,
          concurrency,
          removeUnderscores,
          appendCopyright,
          animaArtistTokens,
          outputFileName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Generator failed');
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Generator failed');
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!result?.id || !result.running) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/booru/dataset-generator/status?id=${encodeURIComponent(result.id)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to refresh generator status');
        if (cancelled) return;
        setResult(data);
        setRunning(data.running === true);
        if (!data.running && data.error) setError(data.error);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to refresh generator status');
          setRunning(false);
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 1000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [result?.id, result?.running]);

  const revealOutput = async () => {
    if (!result?.outputPath) return;
    if (isUmbraRemoteClient()) return;
    await fetch('/api/model-manager/fs/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: result.outputPath }),
    }).catch(() => {});
  };

  const setModeAndDefaultOutput = (nextMode: GeneratorMode) => {
    setMode(nextMode);
    setOutputFileName(nextMode === 'tags' ? 'danbooru-tags.csv' : 'danbooru-character-attributes.csv');
  };

  const previewRows = parseCsvPreview(result?.preview || '');
  const previewHeaders = previewRows[0] || [];
  const previewBody = previewRows.slice(1);

  return (
    <div className="flex h-full min-h-0 bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      <aside className="glass-panel custom-scrollbar w-96 shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-200" />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-100">Danbooru Dataset Generator</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Runs Umbra's Danbooru CSV generator and writes directly into the PowerPrompter CSV folders.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Generator</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setModeAndDefaultOutput('character-attributes')} className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === 'character-attributes' ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>Character CSV</button>
              <button onClick={() => setModeAndDefaultOutput('tags')} className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === 'tags' ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>Tag CSV</button>
            </div>
          </div>

          {mode === 'character-attributes' ? (
            <>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Character Source</label>
                <select value={characterSource} onChange={(event) => setCharacterSource(event.target.value as CharacterSource)} className="settings-input !py-2 text-sm">
                  <option value="danbooru">Top Danbooru characters</option>
                  <option value="single">Single character tag</option>
                  <option value="series">Characters from series/copyright</option>
                </select>
              </div>
              {characterSource === 'single' ? <TextInput label="Character Tag" value={tag} onChange={setTag} placeholder="hatsune_miku" /> : null}
              {characterSource === 'series' ? <TextInput label="Series / Copyright Tag" value={seriesTag} onChange={setSeriesTag} placeholder="zenless_zone_zero" /> : null}
              <TextInput label="Characters" value={limit} onChange={setLimit} placeholder="100 or all" help="Use a number, or type all to process every matching character." />
              {characterSource === 'series' ? <NumberInput label="Series Posts To Scan" value={seriesPostSample} onChange={setSeriesPostSample} min={1} max={5000} /> : null}
              <NumberInput label="Posts Per Character" value={postSample} onChange={setPostSample} min={1} max={200} help="Capped at 200 to match Danbooru/API safety limits." />
              <NumberInput label="Max Attributes" value={maxAttributes} onChange={setMaxAttributes} min={1} max={80} />
              <NumberInput label="Min Character Posts" value={minCharacterPosts} onChange={setMinCharacterPosts} min={0} max={10000000} />
              <NumberInput label="Min Frequency" value={minFrequency} onChange={setMinFrequency} min={0} max={1} step={0.01} />
              <TextInput label="Post Filter" value={postFilter} onChange={setPostFilter} placeholder="solo, rating:g" />
              <Checkbox label="Append copyright to ambiguous character names" checked={appendCopyright} onChange={setAppendCopyright} />
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tag Category</label>
                <select value={tagCategory} onChange={(event) => setTagCategory(event.target.value)} className="settings-input !py-2 text-sm">
                  <option value="0">General</option>
                  <option value="1">Artist</option>
                  <option value="5">Meta</option>
                </select>
              </div>
              <TextInput label="Tags" value={limit} onChange={setLimit} placeholder="1000 or all" help="Use a number, or type all to fetch every matching tag Danbooru returns." />
              <NumberInput label="Min Tag Posts" value={minTagPosts} onChange={setMinTagPosts} min={0} max={10000000} />
              {tagCategory === '1' ? <Checkbox label="Anima artist tokens: prepend @ and remove spaces/underscores" checked={animaArtistTokens} onChange={setAnimaArtistTokens} /> : null}
            </>
          )}

          <NumberInput label="Concurrency" value={concurrency} onChange={setConcurrency} min={1} max={5} help="Capped at 5 to reduce Danbooru rate-limit errors." />
          <Checkbox label="Output tags with spaces instead of underscores" checked={removeUnderscores} onChange={setRemoveUnderscores} />
          <TextInput label="Output File Name" value={outputFileName} onChange={setOutputFileName} placeholder="danbooru-character-attributes.csv" />

          <button
            onClick={() => void runGenerator()}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Generator
          </button>
        </div>
      </aside>

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-5">
        {error ? <div className="mb-4 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        {!result ? (
          <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] text-center">
            <div>
              <FileText className="mx-auto h-8 w-8 text-zinc-600" />
              <div className="mt-3 text-sm font-bold text-zinc-300">No generated CSV yet</div>
              <div className="mt-1 text-xs text-zinc-600">Configure the generator and run it.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">{result.running ? 'Generating CSV' : 'Generated CSV'}</div>
                  <h2 className="mt-1 truncate text-lg font-black text-zinc-100">{result.outputPath}</h2>
                  <div className="mt-1 text-xs text-zinc-500">
                    {result.running ? 'Running...' : result.exitCode === 0 ? 'Finished successfully' : `Finished with exit code ${result.exitCode ?? 'unknown'}`}
                  </div>
                </div>
                {!isUmbraRemoteClient() ? (
                  <button disabled={result.running} onClick={() => void revealOutput()} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-zinc-300 disabled:opacity-40">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Open Path
                  </button>
                ) : null}
              </div>
              {result.running ? <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-300" /></div> : null}
            </section>
            <section className="rounded-md border border-white/10 bg-black/25 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-300">Preview</h3>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">{previewBody.length} rows</span>
              </div>
              {previewHeaders.length > 0 ? (
                <div className="custom-scrollbar max-h-96 overflow-auto rounded-md border border-white/10">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-950/95 text-[10px] uppercase tracking-widest text-emerald-100">
                      <tr>
                        {previewHeaders.map((header, index) => (
                          <th key={`${header}-${index}`} className="border-b border-white/10 px-3 py-2 font-black">
                            {header || `Column ${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewBody.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-white/[0.025]">
                          {previewHeaders.map((_, columnIndex) => (
                            <td key={columnIndex} className="max-w-[460px] border-b border-white/[0.06] px-3 py-2 align-top text-zinc-300">
                              <span className="break-words">{row[columnIndex] || ''}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="custom-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">{result.stdout}</pre>
              )}
            </section>
            <section className="rounded-md border border-white/10 bg-black/25 p-4">
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-300">Log</h3>
              <pre className="custom-scrollbar max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-400">{[result.stdout, result.stderr].filter(Boolean).join('\n')}</pre>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function parseCsvPreview(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  return rows;
}

function TextInput({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; help?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="settings-input !py-2 text-sm" />
      {help ? <div className="mt-1 text-[10px] leading-4 text-zinc-600">{help}</div> : null}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1, help }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; help?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))}
        className="settings-input !py-2 text-sm"
      />
      {help ? <div className="mt-1 text-[10px] leading-4 text-zinc-600">{help}</div> : null}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
