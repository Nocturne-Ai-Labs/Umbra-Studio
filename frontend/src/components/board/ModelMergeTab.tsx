import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ArrowRightLeft, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Combine, Cpu, FolderOpen, Loader2, RefreshCw, RotateCcw, Save, Square, Trash2, Workflow } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { ModelMergePreview } from './ModelMergePreview';
import { MergeBlueprints, getMergeBlueprint, type MergeBlueprintSetup } from './MergeBlueprints';
import { nextMergeRevisionName } from '@/lib/modelMergeBlueprint';
import { normalizeMergeDraft } from '@/lib/modelMergeDraft';
import { MergeBlockEditor, MergeLoraStack, mergeButtonClass as buttonClass, mergeInputClass as inputClass, type MergeLora, type MergeLoraModel } from './ModelMergeControls';

type Model = { id: string; name: string; bytes: number; family: string; umbra?: boolean; blueprintId?: string };
type Inspection = { compatible: boolean; blocks: number; blockLabels: string[]; combined: boolean; family: string; tensorCount: number; bytes: number; precision: string[]; estimatedRamBytes: number };
type Setup = { a: string; b: string; ratio: number; name: string; blocks: Record<string, number>; lorasA: MergeLora[]; lorasB: MergeLora[]; cleanMetadata?: boolean };
type Recipe = { id: string; title: string; setup: Setup };
type Job = { id: string; phase: string; progress: number; a: string; b: string; ratio: number; output: string; outputModelId?: string; family?: string; error?: string; processed?: number; total?: number };
const terminal = new Set(['completed', 'cancelled', 'failed']);
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const draftKey = 'umbra:data-forge-merge-draft';

function readDraft(): Setup {
  try { return normalizeMergeDraft(JSON.parse(sessionStorage.getItem(draftKey) || '{}')); }
  catch { return normalizeMergeDraft(null); }
}

async function api<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/data-forge/model-merge/${path}`, {
    signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export function ModelMergeTab() {
  const [models, setModels] = useState<Model[]>([]);
  const [draft] = useState(readDraft);
  const [a, setA] = useState(draft.a);
  const [b, setB] = useState(draft.b);
  const [ratio, setRatio] = useState(draft.ratio);
  const [name, setName] = useState(draft.name);
  const [cleanMetadata, setCleanMetadata] = useState(draft.cleanMetadata !== false);
  const [loras, setLoras] = useState<MergeLoraModel[]>([]);
  const [lorasA, setLorasA] = useState(draft.lorasA);
  const [lorasB, setLorasB] = useState(draft.lorasB);
  const [blocks, setBlocks] = useState(draft.blocks);
  const [advanced, setAdvanced] = useState(Object.keys(draft.blocks).length > 0);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [recipeTitle, setRecipeTitle] = useState('');
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testView, setTestView] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState('');
  const running = !!job && !terminal.has(job.phase);
  const locked = running || submitting || testBusy;

  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ a, b, ratio, name, blocks, lorasA, lorasB, cleanMetadata })); } catch { /* Storage may be unavailable. */ }
  }, [a, b, ratio, name, blocks, lorasA, lorasB, cleanMetadata]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setModels((await api<{ models: Model[] }>('models')).models);
      setLoras((await api<{ loras: MergeLoraModel[] }>('loras')).loras);
      setRecipes((await api<{ recipes: Recipe[] }>('recipes')).recipes);
      setError('');
    }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ job: Job | null }>('status', undefined, controller.signal);
        setJob(result.job);
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    setInspection(null);
    setCheckError('');
    if (!a || !b) { setChecking(false); return; }
    const controller = new AbortController();
    setChecking(true);
    void api<Inspection>('inspect', { a, b }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setInspection(result); })
      .catch(reason => { if (!controller.signal.aborted) setCheckError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [a, b]);

  const start = async () => {
    setSubmitting(true); setError('');
    try { setJob((await api<{ job: Job }>('start', { a, b, ratio: ratio / 100, name, blocks, lorasA, lorasB, cleanMetadata })).job); }
    catch (reason) { setError((reason as Error).message); }
    finally { setSubmitting(false); }
  };
  const cancel = async () => {
    try { await api('cancel', {}); }
    catch (reason) { setError((reason as Error).message); }
  };
  const options = models.filter(model => model.id === a || model.id === b || model.id.toLowerCase().includes(filter.toLowerCase())).map(model => ({ value: model.id, label: model.name, description: `${model.family} · ${model.id}`, badge: model.umbra ? 'Made with Umbra' : size(model.bytes) }));
  const loadSetup = (setup: MergeBlueprintSetup) => {
    setA(setup.a); setB(setup.b); setRatio(setup.ratio * 100); setName(setup.name); setBlocks(setup.blocks); setLorasA(setup.lorasA); setLorasB(setup.lorasB); setCleanMetadata(setup.cleanMetadata !== false); setAdvanced(Object.keys(setup.blocks).length > 0);
    setError('');
    const missing = [setup.a, setup.b].filter(id => !models.some(model => model.id === id));
    const missingLoras = [...setup.lorasA, ...setup.lorasB].filter(entry => entry.enabled && entry.strength !== 0 && !loras.some(model => model.id === entry.model));
    if (missing.length || missingLoras.length) setError(`Restore or reselect missing models: ${[...missing, ...missingLoras.map(entry => entry.model)].join(', ')}`);
  };
  const loadModelBlueprint = async (id: string) => {
    setRecipeBusy(true);
    try { continueBlueprint((await getMergeBlueprint(id)).setup); }
    catch (reason) { setError((reason as Error).message); }
    finally { setRecipeBusy(false); }
  };
  const continueBlueprint = (setup: MergeBlueprintSetup) => {
    const revisionName = nextMergeRevisionName(setup.name, models.map(model => model.name));
    loadSetup({ ...setup, name: revisionName });
    setRecipeId(''); setRecipeTitle(revisionName); setConfirmDelete(false);
  };
  const applyRecipe = () => {
    const recipe = recipes.find(item => item.id === recipeId);
    if (!recipe) return;
    const setup = recipe.setup;
    loadSetup(setup); setRecipeTitle(recipe.title); setConfirmDelete(false);
  };
  const saveRecipe = async () => {
    setRecipeBusy(true); setError('');
    try {
      const existing = recipes.find(item => item.id === recipeId && item.title === recipeTitle.trim());
      const result = await api<{ recipe: Recipe }>('recipes/save', { id: existing?.id, title: recipeTitle, setup: { a, b, ratio: ratio / 100, name, blocks, lorasA, lorasB, cleanMetadata } });
      setRecipeId(result.recipe.id); setRecipes(current => [...current.filter(item => item.id !== result.recipe.id), result.recipe]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setRecipeBusy(false); }
  };
  const deleteRecipe = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setRecipeBusy(true);
    try { await api('recipes/delete', { id: recipeId }); setRecipes(current => current.filter(item => item.id !== recipeId)); setRecipeId(''); setRecipeTitle(''); setConfirmDelete(false); }
    catch (reason) { setError((reason as Error).message); }
    finally { setRecipeBusy(false); }
  };
  const loraBytes = [...lorasA, ...lorasB].filter(entry => entry.enabled && entry.strength !== 0).reduce((sum, entry) => sum + (loras.find(item => item.id === entry.model)?.bytes || 0), 0);

  return (
    <div className="h-full overflow-y-auto" data-model-merge data-test-view={testView ? 'test' : 'merge'} style={{ containerType: 'inline-size', containerName: 'umbra-model-merge', '--umbra-border': 'color-mix(in srgb, var(--umbra-accent) 12%, rgba(255,255,255,0.1))', '--umbra-text-muted': 'color-mix(in srgb, var(--umbra-text) 60%, transparent)' } as CSSProperties}>
      <nav aria-label="Merge workspace view" data-model-merge-view className="hidden gap-2 border-b border-[var(--umbra-border)] p-3">
        <button className={buttonClass} aria-pressed={!testView} onClick={() => setTestView(false)}><Combine size={16} />Merge controls</button>
        <button className={buttonClass} aria-pressed={testView} onClick={() => setTestView(true)}><Workflow size={16} />Test generation{testBusy && <Loader2 size={15} className="animate-spin" />}</button>
      </nav>
      <div data-model-merge-layout className="grid w-full min-w-0">
      <div data-model-merge-editor className="min-w-0 space-y-7 p-4 md:p-6" style={{ containerType: 'inline-size', containerName: 'umbra-model-merge-editor' }}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--umbra-border)] pb-4">
          <div className="flex flex-wrap items-center gap-3"><Combine size={22} className="text-[var(--umbra-accent)]" /><h2 className="text-lg font-semibold">Model Merge</h2><span className="rounded border border-[var(--umbra-border)] px-2 py-1 text-xs">{inspection?.family || 'Safetensors'}</span></div>
          <div className="flex gap-2"><button className={buttonClass} title="Clear merge setup" aria-label="Clear merge setup" disabled={locked} onClick={() => { setA(''); setB(''); setName(''); setRatio(50); setFilter(''); setError(''); setLorasA([]); setLorasB([]); setBlocks({}); setCleanMetadata(true); setRecipeId(''); setRecipeTitle(''); setConfirmDelete(false); }}><RotateCcw size={16} /></button><button className={buttonClass} title="Refresh local models" aria-label="Refresh local models" disabled={loading || locked} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
        </header>

        <section aria-label="Merge recipes" className="flex flex-wrap items-end gap-2 border-b border-[var(--umbra-border)] pb-5">
          <div className="min-w-44 flex-1 space-y-2"><label className="block text-sm" htmlFor="merge-recipe">Recipe</label><UmbraSelect triggerId="merge-recipe" value={recipeId} options={recipes.map(recipe => ({ value: recipe.id, label: recipe.title }))} ariaLabel="Merge recipe" placeholder="Choose recipe" disabled={locked || recipeBusy} onValueChange={value => { setRecipeId(value); setConfirmDelete(false); }} buttonClassName="!min-h-11 !text-sm" /></div>
          <button className={buttonClass} title="Load recipe" aria-label="Load recipe" disabled={locked || recipeBusy || !recipeId} onClick={applyRecipe}><FolderOpen size={17} /></button>
          <div className="min-w-44 flex-1 space-y-2"><label className="block text-sm" htmlFor="merge-recipe-title">Recipe name</label><input id="merge-recipe-title" className={inputClass} value={recipeTitle} maxLength={100} disabled={locked || recipeBusy} onChange={event => setRecipeTitle(event.target.value)} /></div>
          <button className={buttonClass} title="Save recipe" aria-label="Save recipe" disabled={locked || recipeBusy || !recipeTitle.trim()} onClick={() => void saveRecipe()}><Save size={17} /></button>
          <button className={`${buttonClass} text-red-400`} title={confirmDelete ? 'Confirm recipe deletion' : 'Delete recipe'} aria-label={confirmDelete ? 'Confirm recipe deletion' : 'Delete recipe'} disabled={locked || recipeBusy || !recipeId} onClick={() => void deleteRecipe()}><Trash2 size={17} />{confirmDelete && 'Confirm'}</button>
          {confirmDelete && <button className={buttonClass} disabled={recipeBusy} onClick={() => setConfirmDelete(false)}>Cancel</button>}
        </section>

        <MergeBlueprints refreshKey={`${job?.id}:${job?.phase === 'completed'}`} locked={locked || recipeBusy} onLoad={continueBlueprint} />
        <input type="search" aria-label="Filter models" placeholder="Filter local models..." title="Full-precision Safetensors models; quantized and pickle checkpoints are excluded" value={filter} onChange={event => setFilter(event.target.value)} className={`${inputClass} max-w-md`} />
        <section data-model-merge-sources className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]" aria-label="Source models">
          <div className="min-w-0 space-y-2"><label className="block text-sm font-semibold" htmlFor="merge-model-a">Model A <span className="float-right text-[var(--umbra-accent)]">{100 - ratio}%</span></label>
            <UmbraSelect triggerId="merge-model-a" triggerTitle={a} value={a} options={options} onValueChange={value => { setA(value); setBlocks({}); }} ariaLabel="Model A" placeholder="Choose base model" disabled={locked || loading} buttonClassName="!min-h-11 !h-auto !text-sm" />
            {a && <p className="break-all text-xs text-[var(--umbra-text-muted)]">{a}</p>}
            {models.find(model => model.id === a)?.umbra && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Made with Umbra</span>{models.find(model => model.id === a)?.blueprintId && <button className={buttonClass} disabled={locked || recipeBusy} onClick={() => void loadModelBlueprint(models.find(model => model.id === a)!.blueprintId!)}><FolderOpen size={16} />Load A blueprint</button>}</div>}
            <MergeLoraStack side="A" entries={lorasA} models={loras} locked={locked} onChange={setLorasA} />
          </div>
          <button className={`${buttonClass} w-11 self-start mt-7 justify-self-center !px-0`} title="Swap models and LoRA stacks" aria-label="Swap models" disabled={locked || !a || !b} onClick={() => { setA(b); setB(a); setRatio(100 - ratio); setLorasA(lorasB); setLorasB(lorasA); setBlocks(Object.fromEntries(Object.entries(blocks).map(([key, value]) => [key, 1 - value]))); }}><ArrowRightLeft size={18} /></button>
          <div className="min-w-0 space-y-2"><label className="block text-sm font-semibold" htmlFor="merge-model-b">Model B <span className="float-right text-emerald-400">{ratio}%</span></label>
            <UmbraSelect triggerId="merge-model-b" triggerTitle={b} value={b} options={options} onValueChange={value => { setB(value); setBlocks({}); }} ariaLabel="Model B" placeholder="Choose blend model" disabled={locked || loading} buttonClassName="!min-h-11 !h-auto !text-sm" />
            {b && <p className="break-all text-xs text-[var(--umbra-text-muted)]">{b}</p>}
            {models.find(model => model.id === b)?.umbra && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Made with Umbra</span>{models.find(model => model.id === b)?.blueprintId && <button className={buttonClass} disabled={locked || recipeBusy} onClick={() => void loadModelBlueprint(models.find(model => model.id === b)!.blueprintId!)}><FolderOpen size={16} />Load B blueprint</button>}</div>}
            <MergeLoraStack side="B" entries={lorasB} models={loras} locked={locked} onChange={setLorasB} />
          </div>
        </section>

        <section className="space-y-4 border-y border-[var(--umbra-border)] py-5" aria-label="Blend ratio">
          <div className="flex items-center justify-between gap-4"><label htmlFor="merge-ratio" className="text-sm font-semibold">Model B contribution</label><div className="flex items-center gap-2"><input aria-label="Model B percentage" type="number" min={0} max={100} step={1} value={ratio} disabled={locked} onChange={event => setRatio(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} className={`${inputClass} !w-20 text-center`} /><span>%</span></div></div>
          <input id="merge-ratio" type="range" min={0} max={100} step={1} value={ratio} disabled={locked} onChange={event => setRatio(Number(event.target.value))} className="min-h-11 w-full" />
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--umbra-text-muted)]"><span>100% Model A</span><button className="min-h-9 px-3 hover:text-[var(--umbra-text)] disabled:opacity-40" disabled={locked} onClick={() => setRatio(50)}>50 / 50</button><span>100% Model B</span></div>
          <div className="flex h-2 overflow-hidden rounded-sm" aria-hidden="true"><div className="bg-[var(--umbra-accent)]" style={{ width: `${100 - ratio}%` }} /><div className="bg-emerald-400" style={{ width: `${ratio}%` }} /></div>
        </section>

        <section className="space-y-4 border-b border-[var(--umbra-border)] pb-5">
          <button className={`${buttonClass} w-full justify-between`} aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>Advanced block mix <span className="ml-auto text-xs text-[var(--umbra-text-muted)]">{Object.keys(blocks).length} overrides</span>{advanced ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
          {advanced && (inspection ? inspection.blocks > 0 ? <><div className="text-xs text-[var(--umbra-text-muted)]">Non-block weights: global mix{inspection.combined ? ' · Includes VAE / text encoder weights' : ''}</div><MergeBlockEditor key={inspection.blockLabels?.join('|') || inspection.blocks} count={inspection.blocks} labels={inspection.blockLabels} ratio={ratio} values={blocks} locked={locked} onChange={setBlocks} /></> : <p className="text-sm text-[var(--umbra-text-muted)]">No indexed blocks · Global mix only</p> : <p className="text-sm text-[var(--umbra-text-muted)]">Select compatible source models</p>)}
        </section>

        <div className="flex min-h-12 items-start gap-2 text-sm" role="status">
          {checking ? <><Loader2 size={18} className="shrink-0 animate-spin" />Checking tensor compatibility...</> : checkError ? <><CircleAlert size={18} className="shrink-0 text-amber-400" /><span>{checkError}</span></> : inspection ? <><CheckCircle2 size={18} className="shrink-0 text-emerald-400" /><span>{inspection.family} · {inspection.tensorCount.toLocaleString()} matching tensors · {inspection.precision.join(', ')}</span></> : <><Workflow size={18} className="shrink-0" /><span>{models.length ? 'Select two compatible models' : loading ? 'Loading local models...' : 'No local full-precision Safetensors models found'}</span></>}
        </div>

        <section data-model-merge-output className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(200px,0.6fr)]" aria-label="Merge output">
          <div className="min-w-0 space-y-2"><label htmlFor="merge-name" className="block text-sm font-semibold">Output filename</label><div className="flex items-center gap-2"><input id="merge-name" placeholder="My Model Merge" value={name} maxLength={100} onChange={event => setName(event.target.value)} disabled={locked} className={`${inputClass} min-w-0`} /><span className="text-xs">.safetensors</span></div><div className="break-all text-xs text-[var(--umbra-text-muted)]">models / {a.split('/')[0] || 'diffusion_models'} / Merges</div></div>
          <dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="flex items-center gap-2"><Cpu size={15} />Processing</dt><dd>CPU</dd></div><div className="flex justify-between gap-3"><dt>Estimated output</dt><dd>{inspection ? size(inspection.bytes) : '--'}</dd></div><div className="flex justify-between gap-3"><dt>Free RAM required</dt><dd>{inspection ? size(inspection.estimatedRamBytes + loraBytes * 2) : '--'}</dd></div></dl>
        </section>
        <section className="space-y-2 border-b border-[var(--umbra-border)] pb-4" aria-label="Model metadata">
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={cleanMetadata} disabled={locked} onChange={event => setCleanMetadata(event.target.checked)} className="h-5 w-5 accent-[var(--umbra-accent)]" />Clean model metadata</label>
          <p className="text-xs text-[var(--umbra-text-muted)]">{cleanMetadata ? 'Format, runtime architecture metadata, Umbra creator marker, and blueprint ID are retained. Personal source metadata and the recipe stay out of the model.' : 'Source metadata and the full merge recipe will be embedded in the model.'}</p>
          <p className="text-xs text-[var(--umbra-text-muted)]">A private blueprint is saved automatically in User / Config / DataForge / MergeJobs / Blueprints. Back it up separately; the model ID alone cannot restore it.</p>
        </section>
        {error && <div role="alert" className="break-words text-sm text-red-400">{error}</div>}
        <div className="flex flex-wrap justify-end gap-3"><button className={`${buttonClass} border-[var(--umbra-accent)] text-[var(--umbra-accent)]`} disabled={locked || checking || !inspection || !name.trim()} onClick={() => void start()}>{submitting ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}Save merged model</button></div>

        {job && <section className="space-y-3 border-t border-[var(--umbra-border)] pt-5" aria-label="Merge job">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold capitalize">{job.phase}</h3><span className="text-sm tabular-nums">{job.progress}%</span></div>
          <progress className="h-2 w-full accent-[var(--umbra-accent)]" aria-label="Merge progress" max={100} value={job.progress} />
          {job.total && <p className="text-xs tabular-nums">{job.processed?.toLocaleString() || 0} / {job.total.toLocaleString()} tensors</p>}
          <p className="break-all text-xs">{job.a} ({Math.round((1 - job.ratio) * 100)}%) + {job.b} ({Math.round(job.ratio * 100)}%)</p>
          <p className="break-all text-xs text-[var(--umbra-text-muted)]">{job.output}</p>
          {job.error && <p role="alert" className="break-words text-sm text-red-400">{job.error}</p>}
          {running && <button className={buttonClass} onClick={() => void cancel()}><Square size={15} />Cancel merge</button>}
        </section>}
      </div>
      <ModelMergePreview a={a ? { id: a, family: inspection?.family || models.find(model => model.id === a)?.family || 'Safetensors' } : undefined} b={b ? { id: b, family: inspection?.family || models.find(model => model.id === b)?.family || 'Safetensors' } : undefined} merged={job?.phase === 'completed' ? { id: job.outputModelId || `${job.a.split('/')[0]}/Merges/${job.output.replace(/\\/g, '/').split('/').pop()}`, family: job.family || models.find(model => model.id === job.a)?.family || 'Safetensors' } : undefined} mergeBusy={running || submitting} onBusyChange={setTestBusy} />
      </div>
    </div>
  );
}
