import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { useEffect, useState } from 'react';
import { Database, FileText, FolderOpen, Pause, Play, Square } from 'lucide-react';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

type GeneratorMode = 'character-attributes' | 'tags' | 'combined';
type CharacterSource = 'danbooru' | 'single' | 'series';
type OutputLanguage = 'canonical' | 'ja' | 'zh-CN';
const GENERATOR_JOB_STORAGE_KEY = 'umbra.dataforge.datasetGeneratorJob';

const getDefaultOutputFileName = (mode: GeneratorMode, outputLanguage: OutputLanguage) => {
  const base = mode === 'combined' ? 'danbooru-catalog' : mode === 'tags' ? 'danbooru-tags' : 'danbooru-character-attributes';
  const suffix = outputLanguage === 'canonical' ? '' : outputLanguage === 'ja' ? '-ja' : '-zh-cn';
  return `${base}${suffix}.csv`;
};

const DEFAULT_OUTPUT_FILE_NAMES = new Set(
  (['character-attributes', 'tags', 'combined'] as GeneratorMode[]).flatMap((mode) => (
    (['canonical', 'ja', 'zh-CN'] as OutputLanguage[]).map((language) => getDefaultOutputFileName(mode, language))
  )),
);

type GeneratorResult = {
  ok: boolean;
  id: string;
  running: boolean;
  paused: boolean;
  stopRequested: boolean;
  status: 'running' | 'paused' | 'stopping' | 'stopped' | 'completed' | 'failed';
  exitCode: number | null;
  error?: string;
  outputPath: string;
  stdout: string;
  stderr: string;
  preview: string;
  ratePercent?: number;
  mode?: GeneratorMode;
  args?: string[];
  progress?: { stage: string; completed: number; total: number | null; catalogRows: number; characters?: number; charactersChecked?: number; populated?: number; empty?: number; noMatches?: number; noAttributes?: number; cacheHits?: number; localHits?: number; networkRequests?: number; batchNumber?: number; batchSize?: number; scanned?: number; current: string; retryUntil: number };
};

export function DanbooruDatasetGeneratorTab() {
  const [mode, setMode] = useState<GeneratorMode>('combined');
  const [ratePercent, setRatePercent] = useState(100);
  const [resumeExisting, setResumeExisting] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [preferCorpus, setPreferCorpus] = useState(true);
  const [characterSource, setCharacterSource] = useState<CharacterSource>('danbooru');
  const [tag, setTag] = useState('');
  const [seriesTag, setSeriesTag] = useState('');
  const [tagCategory, setTagCategory] = useState('0');
  const [limit, setLimit] = useState('100');
  const [postSample, setPostSample] = useState(100);
  const [seriesPostSample, setSeriesPostSample] = useState(200);
  const [maxAttributes, setMaxAttributes] = useState(24);
  const [minCharacterPosts, setMinCharacterPosts] = useState(51);
  const [minTagPosts, setMinTagPosts] = useState(201);
  const [minFrequency, setMinFrequency] = useState(0.12);
  const [postFilter, setPostFilter] = useState('solo');
  const [concurrency, setConcurrency] = useState(4);
  const [removeUnderscores, setRemoveUnderscores] = useState(false);
  const [appendCopyright, setAppendCopyright] = useState(true);
  const [animaArtistTokens, setAnimaArtistTokens] = useState(false);
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('canonical');
  const [outputFileName, setOutputFileName] = useState('danbooru-catalog.csv');
  const [running, setRunning] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [reconnecting, setReconnecting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const reconnect = async () => {
      try {
        const url = new URL(window.location.href);
        let savedId = url.searchParams.get('datasetGeneratorJob') || '';
        if (!savedId) {
          try { savedId = window.localStorage.getItem(GENERATOR_JOB_STORAGE_KEY) || ''; } catch { /* Storage can be disabled. */ }
        }
        const load = async (id: string) => fetch(`/api/booru/dataset-generator/status${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store', signal: controller.signal });
        // Prefer the server's current job over an older browser-saved job.
        let response = await load(url.searchParams.get('datasetGeneratorJob') || '');
        if (response.status === 404 && savedId) response = await load(savedId);
        // Older installed backends require an explicit ID; saved/deep-linked
        // jobs still reconnect without restarting an active collection.
        if (response.status === 404) return;
        const data: GeneratorResult = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not reconnect to collection');
        if (cancelled || !data.id) return;
        setResult(data);
        setRunning(data.running === true);
        const args = data.args || [];
        const arg = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
        const numberArg = (name: string, setter: (value: number) => void) => { const value = arg(name); if (value !== undefined && Number.isFinite(Number(value))) setter(Number(value)); };
        if (data.mode) setMode(data.mode);
        setRatePercent(data.ratePercent ?? 100);
        setOutputFileName(data.outputPath.split(/[\\/]/).pop() || 'danbooru-catalog.csv');
        setLimit(args.includes('--all') ? 'all' : arg('--limit') || '100');
        numberArg('--post-sample', setPostSample);
        numberArg('--max-attributes', setMaxAttributes);
        numberArg('--min-character-posts', setMinCharacterPosts);
        numberArg('--min-tag-posts', setMinTagPosts);
        numberArg('--min-frequency', setMinFrequency);
        numberArg('--concurrency', setConcurrency);
        numberArg('--series-post-sample', setSeriesPostSample);
        setPostFilter(arg('--post-filter') || '');
        setResumeExisting(args.includes('--resume-existing'));
        setPreferCorpus(args.includes('--corpus-path'));
        setRemoveUnderscores(args.includes('--remove-underscores'));
        setAppendCopyright(!args.includes('--no-append-copyright'));
        setCharacterSource(arg('--tag') ? 'single' : arg('--series') ? 'series' : 'danbooru');
        setTag(arg('--tag') || '');
        setSeriesTag(arg('--series') || '');
        setTagCategory(arg('--tag-category') || '0');
        setOutputLanguage((arg('--output-language') || 'canonical') as OutputLanguage);
        if (url.searchParams.has('datasetGeneratorJob')) {
          url.searchParams.delete('datasetGeneratorJob');
          window.history.replaceState(window.history.state, '', url);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not reconnect to collection');
      } finally {
        if (!cancelled) setReconnecting(false);
      }
    };
    void reconnect();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    if (!result?.id) return;
    try { window.localStorage.setItem(GENERATOR_JOB_STORAGE_KEY, result.id); } catch { /* Optional persistence. */ }
  }, [result?.id]);

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
          ratePercent,
          resumeExisting,
          preferCorpus,
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
          outputLanguage,
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

  const controlGenerator = async (action: 'pause' | 'resume' | 'stop' | 'speed') => {
    if (!result?.id || controlling) return;
    setControlling(true);
    setError('');
    try {
      const response = await fetch('/api/booru/dataset-generator/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, action, ratePercent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Failed to ${action} generator`);
      setResult(data);
      setRunning(data.running === true);
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} generator`);
    } finally {
      setControlling(false);
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
        setError(!data.running && data.error ? data.error : '');
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to refresh generator status');
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
    setOutputFileName(getDefaultOutputFileName(nextMode, outputLanguage));
  };

  const setOutputLanguageAndDefault = (nextLanguage: OutputLanguage) => {
    setOutputLanguage(nextLanguage);
    if (DEFAULT_OUTPUT_FILE_NAMES.has(outputFileName)) {
      setOutputFileName(getDefaultOutputFileName(mode, nextLanguage));
    }
  };

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const progress = result?.progress;
  const percent = progress?.total ? Math.min(100, 100 * progress.completed / progress.total) : null;
  const retrySeconds = Math.max(0, Math.ceil(((progress?.retryUntil || 0) - clock) / 1000));
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
        <p className="mt-1 text-[10px] leading-4 text-zinc-600">
          The interface follows your Umbra language. CSV tags stay in canonical Danbooru format for model compatibility.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Generator</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => setModeAndDefaultOutput('combined')} className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === 'combined' ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>Combined CSV</button>
              <button onClick={() => setModeAndDefaultOutput('character-attributes')} className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === 'character-attributes' ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>Character CSV</button>
              <button onClick={() => setModeAndDefaultOutput('tags')} className={`rounded-md border px-2 py-2 text-[10px] font-black uppercase tracking-wide ${mode === 'tags' ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>Tag CSV</button>
            </div>
          </div>

          {mode !== 'tags' ? (
            <>
              {mode === 'combined' ? <p className="text-xs leading-5 text-zinc-400">One catalog for artist, series, and character tags. Standalone General and Meta entries are excluded. Character rows include collected attributes. Enable the resulting file in the tag catalog’s Sources.</p> : <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Character Source</label>
                <UmbraSelectControl value={characterSource} onChange={(event) => setCharacterSource(event.target.value as CharacterSource)} className="settings-input !py-2 text-sm">
                  <option value="danbooru">Top Danbooru characters</option>
                  <option value="single">Single character tag</option>
                  <option value="series">Characters from series/copyright</option>
                </UmbraSelectControl>
              </div>}
              {mode !== 'combined' && characterSource === 'single' ? <TextInput label="Character Tag" value={tag} onChange={setTag} placeholder="hatsune_miku" /> : null}
              {mode !== 'combined' && characterSource === 'series' ? <TextInput label="Series / Copyright Tag" value={seriesTag} onChange={setSeriesTag} placeholder="zenless_zone_zero" /> : null}
              <TextInput label={mode === 'combined' ? 'Entries Per Category' : 'Characters'} value={limit} onChange={setLimit} placeholder="100 or all" help={mode === 'combined' ? 'Use all for every qualifying tag in all three categories. Each character needs an attribute sample.' : 'Use a number, or type all to process every matching character.'} />
              {mode !== 'combined' && characterSource === 'series' ? <NumberInput label="Series Posts To Scan" value={seriesPostSample} onChange={setSeriesPostSample} min={1} max={5000} /> : null}
              <Checkbox label="Prefer tag corpus for character attributes" checked={preferCorpus} onChange={setPreferCorpus} />
              <p className="text-xs leading-5 text-zinc-400">Reuses matching local posts and saved samples before requesting Danbooru. Partial local samples are combined without duplicate posts.</p>
              {mode === 'combined' ? <NumberInput label="Min Tag Posts" value={minTagPosts} onChange={setMinTagPosts} min={0} max={10000000} /> : null}
              <NumberInput label="Posts Per Character" value={postSample} onChange={setPostSample} min={1} max={200} help="Capped at 200 to match Danbooru/API safety limits." />
              <NumberInput label="Max Attributes" value={maxAttributes} onChange={setMaxAttributes} min={1} max={80} help="Keeps one subject tag, up to 5 identity traits (6 for dual-colored hair and eyes), 3 defining clothing tags, 1 strongly supported accessory, plus at most one tail type, ear type, fur tag, and breast size. Supported fake animal ears replace natural-ear tags. Armor, footwear, legwear, straps, and arm/leg warmers compete within the clothing limit. Chokers are eligible accessories; repeatedly visible navels are retained. Supported color pairs retain heterochromia or their hair pattern: colored inner hair, streaks, gradient, or two-tone. Color/trim duplicates and alternate designs are excluded. Garments and specific tail types need repeated evidence and 90% agreement among posts describing that type. Uniform styles and patterned legwear are retained; named styles need at least 3 supporting posts. Every character uses the same evidence rules; uncertain outfits remain blank." />
              <NumberInput label="Min Character Posts" value={minCharacterPosts} onChange={setMinCharacterPosts} min={0} max={10000000} />
              <NumberInput label="Min Frequency" value={minFrequency} onChange={setMinFrequency} min={0} max={1} step={0.01} help="Raises the minimum evidence required for inferred traits. Identity traits always need at least 35% support; outfit slots require 90% agreement. Lower values cannot bypass these safeguards. No character-specific outfit defaults are added." />
              <TextInput label="Post Filter" value={postFilter} onChange={setPostFilter} placeholder="solo, rating:g" />
              {/(^|[\s,])solo([\s,]|$)/.test(postFilter) && /(^|[\s,])rating:(g|general)([\s,]|$)/i.test(postFilter) ? <p className="text-xs text-zinc-400">Tries solo General posts first. If none match, uses General posts tagged with only this character and no group tags. Missing attributes are never invented.</p> : null}
              {mode !== 'combined' ? <Checkbox label="Append copyright to ambiguous character names" checked={appendCopyright} onChange={setAppendCopyright} /> : null}
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tag Category</label>
                <UmbraSelectControl value={tagCategory} onChange={(event) => setTagCategory(event.target.value)} className="settings-input !py-2 text-sm">
                  <option value="0">General</option>
                  <option value="1">Artist</option>
                  <option value="5">Meta</option>
                </UmbraSelectControl>
              </div>
              <TextInput label="Tags" value={limit} onChange={setLimit} placeholder="1000 or all" help="Use a number, or type all to fetch every matching tag Danbooru returns." />
              <NumberInput label="Min Tag Posts" value={minTagPosts} onChange={setMinTagPosts} min={0} max={10000000} />
              <p className="rounded-md border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2 text-[10px] leading-4 text-emerald-100/70">
                Every tag row includes Danbooru&apos;s current post count for sorting, filtering, and wildcard scoring.
              </p>
              {tagCategory === '1' ? <Checkbox label="Anima artist tokens: prepend @ and remove spaces/underscores" checked={animaArtistTokens} onChange={setAnimaArtistTokens} /> : null}
            </>
          )}

          {mode === 'combined' ? <Checkbox label="Resume saved CSV" checked={resumeExisting} onChange={setResumeExisting} /> : null}
          {mode === 'combined' && resumeExisting ? <p className="text-xs text-zinc-400">Resume a collection started with this version using the same filename and settings. Saved pages and completed attributes are retained. Older CSV-only collections need a fresh run.</p> : null}
          <NumberInput label="Request speed (%)" value={ratePercent} onChange={setRatePercent} min={10} max={100} help="100% allows up to 3 requests/second. Rate-limit waits can slow it further." />
          {running ? <button disabled={controlling} onClick={() => void controlGenerator('speed')} className="settings-input w-full !py-2 text-xs">Apply speed · currently {result?.ratePercent ?? 100}%</button> : null}
          <NumberInput label="Concurrency" value={concurrency} onChange={setConcurrency} min={1} max={5} help="Capped at 5 to reduce Danbooru rate-limit errors." />
          <Checkbox label="Output tags with spaces instead of underscores" checked={removeUnderscores} onChange={setRemoveUnderscores} />
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Localized Search Aliases</label>
            <UmbraSelectControl
              value={outputLanguage}
              onChange={(event) => setOutputLanguageAndDefault(event.target.value as OutputLanguage)}
              className="settings-input !py-2 text-sm"
            >
              <option value="canonical">Off - canonical tags</option>
              <option value="ja">Japanese aliases (best effort)</option>
              <option value="zh-CN">Chinese aliases (best effort)</option>
            </UmbraSelectControl>
            <p className="mt-1 text-[10px] leading-4 text-zinc-600">
              Adds localized display and search columns. Copied prompt tokens remain canonical Danbooru tags.
            </p>
          </div>
          <TextInput label="Output File Name" value={outputFileName} onChange={setOutputFileName} placeholder="danbooru-character-attributes.csv" />

          {running && result ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void controlGenerator(result.paused ? 'resume' : 'pause')}
                disabled={controlling || result.stopRequested}
                className="flex items-center justify-center gap-2 rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-3 text-xs font-black uppercase tracking-[0.12em] text-amber-100 hover:bg-amber-500/15 disabled:opacity-40"
              >
                {result.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {result.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={() => void controlGenerator('stop')}
                disabled={controlling || result.stopRequested}
                className="flex items-center justify-center gap-2 rounded-md border border-red-400/35 bg-red-500/10 px-3 py-3 text-xs font-black uppercase tracking-[0.12em] text-red-100 hover:bg-red-500/15 disabled:opacity-40"
              >
                <Square className="h-3.5 w-3.5" />
                {result.stopRequested ? 'Stopping' : 'Stop'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => void runGenerator()}
              disabled={running || reconnecting}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              {reconnecting ? 'Reconnecting…' : 'Run Generator'}
            </button>
          )}
        </div>
      </aside>

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-5">
        {error ? <div className="mb-4 rounded-md border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        {!result ? (
          <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] text-center">
            <div>
              <FileText className="mx-auto h-8 w-8 text-zinc-600" />
              <div className="mt-3 text-sm font-bold text-zinc-300">{reconnecting ? 'Checking for a running collection…' : 'No generated CSV yet'}</div>
              <div className="mt-1 text-xs text-zinc-600">{reconnecting ? 'Your collection continues when you leave this page.' : 'Configure the generator and run it.'}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">{generatorStatusLabel(result)}</div>
                  <h2 className="mt-1 truncate text-lg font-black text-zinc-100">{result.outputPath}</h2>
                  <div className="mt-1 text-xs text-zinc-500">
                    {result.paused
                      ? 'Paused. Completed rows are saved.'
                      : result.status === 'stopping'
                        ? 'Stopping after the current request...'
                        : result.status === 'stopped'
                          ? 'Stopped. Completed rows remain in the CSV.'
                          : result.running
                            ? 'Running...'
                            : result.exitCode === 0
                              ? 'Finished successfully'
                              : `Finished with exit code ${result.exitCode ?? 'unknown'}`}
                  </div>
                </div>
                {!isUmbraRemoteClient() ? (
                  <button disabled={result.running} onClick={() => void revealOutput()} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-zinc-300 disabled:opacity-40">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Open Path
                  </button>
                ) : null}
              </div>
              {progress ? <div className="mt-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-sm text-zinc-200">
                  <span>{progress.stage === 'batch-discovery' ? `Batch ${progress.batchNumber}: collecting ${(progress.batchSize ?? 50000).toLocaleString()} new entries` : progress.stage === 'batch-attributes' ? `Batch ${progress.batchNumber}: collecting character attributes` : progress.stage === 'combined' ? 'Collecting tags and character attributes' : progress.stage === 'collecting' ? `Collecting ${progress.current || 'tags'}` : progress.stage === 'completed' ? 'Collection complete' : 'Collecting character attributes'}</span>
                  <span>{percent === null ? `${progress.catalogRows.toLocaleString()} entries found` : `${progress.completed.toLocaleString()} / ${progress.total?.toLocaleString()} · ${percent.toFixed(1)}%`}</span>
                </div>
                <div role="progressbar" aria-label="CSV collection progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${result.paused ? 'bg-amber-300' : 'bg-emerald-300'} ${percent === null && running ? 'animate-pulse' : ''}`} style={{ width: percent === null ? '25%' : `${percent}%` }} />
                </div>
                {progress.populated !== undefined ? <div className="text-xs text-zinc-400">{progress.populated.toLocaleString()} characters with attributes · {(progress.empty ?? 0).toLocaleString()} without attributes ({progress.noMatches ?? 0} without matching posts; {progress.noAttributes ?? 0} without eligible attributes)</div> : null}
                {progress.networkRequests !== undefined ? <div className="text-xs text-zinc-500">{progress.networkRequests.toLocaleString()} requests · {progress.cacheHits ?? 0} saved sample hits · {progress.localHits ?? 0} local corpus hits</div> : null}
                <div className="text-xs text-zinc-400">{progress.catalogRows.toLocaleString()} entries discovered{progress.stage === 'combined' || progress.stage.startsWith('batch-') ? ` · ${(progress.charactersChecked ?? progress.completed).toLocaleString()} / ${(progress.characters ?? 0).toLocaleString()} discovered characters have attributes checked` : ''}{progress.stage === 'batch-discovery' ? ` · ${(progress.scanned ?? 0).toLocaleString()} tag entries scanned (saved entries skipped)` : ''} · Request speed {result.ratePercent ?? 100}%</div>
                {result.running && !result.paused && retrySeconds > 0 ? <div role="status" className="text-xs text-amber-200">Danbooru rate limit / server retry · waiting {retrySeconds}s. Completed rows are saved.</div> : null}
              </div> : result.running ? <div role="status" className="mt-3 text-xs text-zinc-400">Preparing collection…</div> : null}
            </section>
            <section className="rounded-md border border-white/10 bg-black/25 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-300">Preview</h3>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">{previewBody.length} preview rows</span>
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
              <pre className="custom-scrollbar max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-400">{[result.stdout.split('\n').filter(line => !line.startsWith('UMBRA_CSV_PROGRESS ')).join('\n'), result.stderr].filter(Boolean).join('\n')}</pre>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function generatorStatusLabel(result: GeneratorResult): string {
  if (result.status === 'paused') return 'Generator Paused';
  if (result.status === 'stopping') return 'Stopping Generator';
  if (result.status === 'stopped') return 'Generator Stopped';
  if (result.status === 'failed') return 'Generator Failed';
  return result.running ? 'Generating CSV' : 'Generated CSV';
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
