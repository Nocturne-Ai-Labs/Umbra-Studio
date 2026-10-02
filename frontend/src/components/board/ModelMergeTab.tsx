import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRightLeft, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Combine, Cpu, FolderOpen, Loader2, RefreshCw, RotateCcw, Save, Square, Trash2, Workflow } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { ModelMergePreview } from './ModelMergePreview';
import { MergeBlueprints, getMergeBlueprint, type MergeBlueprintSetup } from './MergeBlueprints';
import { nextMergeRevisionName } from '@/lib/modelMergeBlueprint';
import { normalizeMergeDraft } from '@/lib/modelMergeDraft';
import { MergeBlockEditor, MergeLoraStack, mergeButtonClass as buttonClass, mergeInputClass as inputClass, type MergeLora, type MergeLoraModel } from './ModelMergeControls';
import { modelMergeStyles } from './ModelMergeStyles';

type Model = { id: string; name: string; bytes: number; family: string; umbra?: boolean; blueprintId?: string };
type Inspection = { compatible: boolean; blocks: number; blockLabels: string[]; combined: boolean; family: string; tensorCount: number; bytes: number; precision: string[]; estimatedRamBytes: number };
type Setup = MergeBlueprintSetup;
type Recipe = { id: string; title: string; setup: Setup };
type Job = { mode?: 'merge' | 'lora_bake'; id: string; phase: string; progress: number; a: string; b: string; ratio: number; output: string; outputModelId?: string; family?: string; error?: string; processed?: number; total?: number };
const terminal = new Set(['completed', 'cancelled', 'failed']);
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const draftKey = 'umbra:data-forge-merge-draft';

export function recipeIdForSave(recipes: Recipe[], recipeId: string) {
  return recipes.some(recipe => recipe.id === recipeId) ? recipeId : undefined;
}

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
  const [mode, setMode] = useState(draft.mode || 'merge');
  const baking = mode === 'lora_bake';
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
  const refreshedCompletedJob = useRef('');
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState('');
  const running = !!job && !terminal.has(job.phase);
  const locked = running || submitting || testBusy;
  const setup: Setup = { mode, a, b: baking ? '' : b, ratio: baking ? 0 : ratio / 100, name, blocks: baking ? {} : blocks, lorasA, lorasB: baking ? [] : lorasB, cleanMetadata };

  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ mode, a, b, ratio, name, blocks, lorasA, lorasB, cleanMetadata })); } catch { /* Storage may be unavailable. */ }
  }, [mode, a, b, ratio, name, blocks, lorasA, lorasB, cleanMetadata]);

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
    if (job?.phase !== 'completed' || !job.id || refreshedCompletedJob.current === job.id) return;
    refreshedCompletedJob.current = job.id;
    void refresh();
  }, [job?.id, job?.phase, refresh]);
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
    if (!a || (!baking && !b)) { setChecking(false); return; }
    const controller = new AbortController();
    setChecking(true);
    void api<Inspection>('inspect', { a, b: baking ? '' : b, mode }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setInspection(result); })
      .catch(reason => { if (!controller.signal.aborted) setCheckError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [a, b, baking, mode]);

  const start = async () => {
    setSubmitting(true); setError('');
    try { setJob((await api<{ job: Job }>('start', setup)).job); }
    catch (reason) { setError((reason as Error).message); }
    finally { setSubmitting(false); }
  };
  const cancel = async () => {
    try { await api('cancel', {}); }
    catch (reason) { setError((reason as Error).message); }
  };
  const options = models.filter(model => model.id === a || model.id === b || model.id.toLowerCase().includes(filter.toLowerCase())).map(model => ({ value: model.id, label: model.name, description: `${model.family} · ${model.id}`, badge: model.umbra ? 'Made with Umbra' : size(model.bytes) }));
  const loadSetup = (setup: MergeBlueprintSetup) => {
    setMode(setup.mode || 'merge');
    setA(setup.a); setB(setup.b); setRatio(setup.ratio * 100); setName(setup.name); setBlocks(setup.blocks); setLorasA(setup.lorasA); setLorasB(setup.lorasB); setCleanMetadata(setup.cleanMetadata !== false); setAdvanced(Object.keys(setup.blocks).length > 0);
    setError('');
    const missing = (setup.mode === 'lora_bake' ? [setup.a] : [setup.a, setup.b]).filter(id => !models.some(model => model.id === id));
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
      const result = await api<{ recipe: Recipe }>('recipes/save', { id: recipeIdForSave(recipes, recipeId), title: recipeTitle, setup });
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
  const loraBytes = [...lorasA, ...(baking ? [] : lorasB)].filter(entry => entry.enabled && entry.strength !== 0).reduce((sum, entry) => sum + (loras.find(item => item.id === entry.model)?.bytes || 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-[var(--umbra-bg)] text-[var(--umbra-text)]" data-model-merge data-test-view={testView ? 'test' : 'merge'} style={{ containerType: 'inline-size', containerName: 'umbra-model-merge', '--umbra-border': 'color-mix(in srgb, var(--umbra-accent) 12%, color-mix(in srgb, var(--umbra-text) 10%, transparent))', '--umbra-text-muted': 'color-mix(in srgb, var(--umbra-text) 60%, transparent)' } as CSSProperties}>
      <style>{modelMergeStyles}</style>
      <nav aria-label="Merge workspace view" data-model-merge-view className="hidden gap-2 border-b border-[var(--umbra-border)] p-3">
        <button className={buttonClass} aria-pressed={!testView} onClick={() => setTestView(false)}><Combine size={16} />Merge controls</button>
        <button className={buttonClass} aria-pressed={testView} onClick={() => setTestView(true)}><Workflow size={16} />Test generation{testBusy && <Loader2 size={15} className="animate-spin" />}</button>
      </nav>
      <div data-model-merge-layout className="grid w-full min-w-0 gap-3 p-3">
      <div data-model-merge-editor className="glass-panel merge-panel min-w-0 space-y-4 p-3" style={{ containerType: 'inline-size', containerName: 'umbra-model-merge-editor' }}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--umbra-border)] pb-3">
          <div className="flex flex-wrap items-center gap-2"><Combine size={17} className="text-[var(--umbra-accent)]" /><h2 className="merge-title">Model Merge</h2><span className="merge-badge">{inspection?.family || 'Safetensors'}</span><span className="merge-badge">CPU</span></div>
          <div className="flex gap-2"><button className={buttonClass} title="Clear merge setup" aria-label="Clear merge setup" disabled={locked} onClick={() => { setA(''); setB(''); setName(''); setRatio(50); setFilter(''); setError(''); setLorasA([]); setLorasB([]); setBlocks({}); setCleanMetadata(true); setRecipeId(''); setRecipeTitle(''); setConfirmDelete(false); }}><RotateCcw size={16} /></button><button className={buttonClass} title="Refresh local models" aria-label="Refresh local models" disabled={loading || locked} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
        </header>

        <section aria-label="Merge recipes" className="flex flex-wrap items-end gap-2 border-b border-[var(--umbra-border)] pb-3">
          <div className="min-w-44 flex-1 space-y-1.5"><label className="merge-label block" htmlFor="merge-recipe">Recipe</label><UmbraSelect triggerId="merge-recipe" value={recipeId} options={recipes.map(recipe => ({ value: recipe.id, label: recipe.title }))} ariaLabel="Merge recipe" placeholder="Choose recipe" disabled={locked || recipeBusy} onValueChange={value => { setRecipeId(value); setConfirmDelete(false); }} buttonClassName="merge-select !text-xs" /></div>
          <button className={buttonClass} title="Load recipe" aria-label="Load recipe" disabled={locked || recipeBusy || !recipeId} onClick={applyRecipe}><FolderOpen size={17} /></button>
          <div className="min-w-44 flex-1 space-y-1.5"><label className="merge-label block" htmlFor="merge-recipe-title">Recipe name</label><input id="merge-recipe-title" className={inputClass} value={recipeTitle} maxLength={100} disabled={locked || recipeBusy} onChange={event => setRecipeTitle(event.target.value)} /></div>
          <button className={buttonClass} title="Save recipe" aria-label="Save recipe" disabled={locked || recipeBusy || !recipeTitle.trim()} onClick={() => void saveRecipe()}><Save size={17} /></button>
          <button className={`${buttonClass} text-red-400`} title={confirmDelete ? 'Confirm recipe deletion' : 'Delete recipe'} aria-label={confirmDelete ? 'Confirm recipe deletion' : 'Delete recipe'} disabled={locked || recipeBusy || !recipeId} onClick={() => void deleteRecipe()}><Trash2 size={17} />{confirmDelete && 'Confirm'}</button>
          {confirmDelete && <button className={buttonClass} disabled={recipeBusy} onClick={() => setConfirmDelete(false)}>Cancel</button>}
        </section>

        <MergeBlueprints refreshKey={`${job?.id}:${job?.phase === 'completed'}`} locked={locked || recipeBusy} onLoad={continueBlueprint} />
        <section aria-label="Source configuration" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="merge-label">Source configuration</h3><span className="merge-badge">{models.length} local models</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Model operation" className="flex flex-wrap gap-1.5">
            <button className={buttonClass} aria-pressed={!baking} disabled={locked} onClick={() => setMode('merge')}><Combine size={15} />Merge models</button>
            <button className={buttonClass} aria-pressed={baking} disabled={locked} onClick={() => setMode('lora_bake')}><Save size={15} />Bake LoRAs</button>
          </div>
          <input type="search" aria-label="Filter models" placeholder="Filter local models..." title="Full-precision Safetensors models; quantized and pickle checkpoints are excluded" value={filter} onChange={event => setFilter(event.target.value)} className={`${inputClass} !w-auto min-w-36 flex-1`} />
        </div>
        <section data-model-merge-sources className={`grid min-w-0 grid-cols-1 items-start gap-2 ${baking ? '' : 'md:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)]'}`} aria-label="Source models">
          <div className="umbra-surface-soft min-w-0 space-y-2 rounded-md border border-[var(--umbra-border)] p-2.5"><label className="merge-label block" htmlFor="merge-model-a">{baking ? 'Base model' : 'Model A'} <span className="float-right text-[var(--umbra-accent)]">{baking ? 100 : 100 - ratio}%</span></label>
            <UmbraSelect triggerId="merge-model-a" triggerTitle={a} value={a} options={options} onValueChange={value => { setA(value); setBlocks({}); }} ariaLabel="Model A" placeholder="Choose base model" disabled={locked || loading} buttonClassName="merge-select !h-auto !text-xs" />
            {a && <p className="break-all text-xs text-[var(--umbra-text-muted)]">{a}</p>}
            {models.find(model => model.id === a)?.umbra && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Made with Umbra</span>{models.find(model => model.id === a)?.blueprintId && <button className={buttonClass} disabled={locked || recipeBusy} onClick={() => void loadModelBlueprint(models.find(model => model.id === a)!.blueprintId!)}><FolderOpen size={16} />Load A blueprint</button>}</div>}
            <MergeLoraStack side="A" entries={lorasA} models={loras} locked={locked} onChange={setLorasA} />
          </div>
          {!baking && <><button className={`${buttonClass} merge-swap w-9 self-start mt-7 justify-self-center !px-0`} title="Swap models and LoRA stacks" aria-label="Swap models" disabled={locked || !a || !b} onClick={() => { setA(b); setB(a); setRatio(100 - ratio); setLorasA(lorasB); setLorasB(lorasA); setBlocks(Object.fromEntries(Object.entries(blocks).map(([key, value]) => [key, 1 - value]))); }}><ArrowRightLeft size={16} /></button>
          <div className="umbra-surface-soft min-w-0 space-y-2 rounded-md border border-[var(--umbra-border)] p-2.5"><label className="merge-label block" htmlFor="merge-model-b">Model B <span className="float-right text-emerald-400">{ratio}%</span></label>
            <UmbraSelect triggerId="merge-model-b" triggerTitle={b} value={b} options={options} onValueChange={value => { setB(value); setBlocks({}); }} ariaLabel="Model B" placeholder="Choose blend model" disabled={locked || loading} buttonClassName="merge-select !h-auto !text-xs" />
            {b && <p className="break-all text-xs text-[var(--umbra-text-muted)]">{b}</p>}
            {models.find(model => model.id === b)?.umbra && <div className="flex flex-wrap items-center gap-2 text-xs"><span>Made with Umbra</span>{models.find(model => model.id === b)?.blueprintId && <button className={buttonClass} disabled={locked || recipeBusy} onClick={() => void loadModelBlueprint(models.find(model => model.id === b)!.blueprintId!)}><FolderOpen size={16} />Load B blueprint</button>}</div>}
            <MergeLoraStack side="B" entries={lorasB} models={loras} locked={locked} onChange={setLorasB} />
          </div></>}
        </section>
        </section>

        {!baking && <><section className="space-y-2 border-y border-[var(--umbra-border)] py-3" aria-label="Blend ratio">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="merge-ratio" className="merge-label">Global blend · Model B</label><div className="flex items-center gap-2 text-xs"><input aria-label="Model B percentage" type="number" min={0} max={100} step={1} value={ratio} disabled={locked} onChange={event => setRatio(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} className={`${inputClass} !w-20 text-center`} /><span>%</span></div></div>
          <input id="merge-ratio" type="range" min={0} max={100} step={1} value={ratio} disabled={locked} onChange={event => setRatio(Number(event.target.value))} className="merge-range w-full accent-[var(--umbra-accent)]" />
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--umbra-text-muted)]"><span>A · {100 - ratio}%</span><button className={`${buttonClass} !border-transparent`} disabled={locked} onClick={() => setRatio(50)}>50 / 50</button><span>B · {ratio}%</span></div>
          <div className="flex h-1 overflow-hidden rounded-sm opacity-70" aria-hidden="true"><div className="bg-[var(--umbra-accent)]" style={{ width: `${100 - ratio}%` }} /><div className="bg-emerald-400" style={{ width: `${ratio}%` }} /></div>
        </section>

        <section className="space-y-3 border-b border-[var(--umbra-border)] pb-3">
          <button className={`${buttonClass} w-full justify-between`} aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>Advanced block mix <span className="ml-auto text-xs text-[var(--umbra-text-muted)]">{Object.keys(blocks).length} overrides</span>{advanced ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
          {advanced && (inspection ? inspection.blocks > 0 ? <><div className="text-xs text-[var(--umbra-text-muted)]">Non-block weights: global mix{inspection.combined ? ' · Includes VAE / text encoder weights' : ''}</div><MergeBlockEditor key={inspection.blockLabels?.join('|') || inspection.blocks} count={inspection.blocks} labels={inspection.blockLabels} ratio={ratio} values={blocks} locked={locked} onChange={setBlocks} /></> : <p className="text-sm text-[var(--umbra-text-muted)]">No indexed blocks · Global mix only</p> : <p className="text-sm text-[var(--umbra-text-muted)]">Select compatible source models</p>)}
        </section>

        </>}
        <div className="umbra-surface-soft flex items-center gap-2 rounded-md border border-[var(--umbra-border)] p-2.5 text-xs" role="status">
          {checking ? <><Loader2 size={18} className="shrink-0 animate-spin" />Checking tensor compatibility...</> : checkError ? <><CircleAlert size={18} className="shrink-0 text-amber-400" /><span>{checkError}</span></> : inspection ? <><CheckCircle2 size={18} className="shrink-0 text-emerald-400" /><span>{inspection.family} · {inspection.tensorCount.toLocaleString()} tensors · {inspection.precision.join(', ')}</span></> : <><Workflow size={18} className="shrink-0" /><span>{models.length ? baking ? 'Select a base model' : 'Select two compatible models' : loading ? 'Loading local models...' : 'No local full-precision Safetensors models found'}</span></>}
        </div>

        <section data-model-merge-output className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(200px,0.6fr)]" aria-label="Merge output">
          <div className="min-w-0 space-y-2"><label htmlFor="merge-name" className="merge-label block">Output filename</label><div className="flex items-center gap-2"><input id="merge-name" placeholder="My Model Merge" value={name} maxLength={100} onChange={event => setName(event.target.value)} disabled={locked} className={`${inputClass} min-w-0`} /><span className="text-[11px] text-[var(--umbra-text-muted)]">.safetensors</span></div><div className="break-all text-[11px] text-[var(--umbra-text-muted)]">models / {a.split('/')[0] || 'diffusion_models'} / Merges</div></div>
          <dl className="umbra-surface-soft space-y-2 rounded-md border border-[var(--umbra-border)] p-2.5 text-[11px]"><div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--umbra-text-muted)]"><Cpu size={13} />Processing</dt><dd>CPU</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--umbra-text-muted)]">Estimated output</dt><dd className="tabular-nums">{inspection ? size(inspection.bytes) : '--'}</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--umbra-text-muted)]">Free RAM required</dt><dd className="tabular-nums">{inspection ? size(inspection.estimatedRamBytes + loraBytes * 2) : '--'}</dd></div></dl>
        </section>
        <section className="space-y-2 border-b border-[var(--umbra-border)] pb-3" aria-label="Model metadata">
          <label className="merge-check flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={cleanMetadata} disabled={locked} onChange={event => setCleanMetadata(event.target.checked)} className="h-4 w-4 accent-[var(--umbra-accent)]" />Clean model metadata</label>
          <p className="text-xs text-[var(--umbra-text-muted)]">{cleanMetadata ? 'Format, runtime architecture metadata, Umbra creator marker, and blueprint ID are retained. Personal source metadata and the recipe stay out of the model.' : 'Source metadata and the full merge recipe will be embedded in the model.'}</p>
          <p className="text-xs text-[var(--umbra-text-muted)]">A private blueprint is saved automatically in User / Config / DataForge / MergeJobs / Blueprints. Back it up separately; the model ID alone cannot restore it.</p>
        </section>
        {error && <div role="alert" className="break-words text-sm text-red-400">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2"><button className={`${buttonClass} merge-primary`} disabled={locked || checking || !inspection || !name.trim() || (baking && !lorasA.some(entry => entry.enabled && entry.strength !== 0))} onClick={() => void start()}>{submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{baking ? 'Save baked model' : 'Save merged model'}</button></div>

        {job && <section className="umbra-surface-soft space-y-2 rounded-md border border-[var(--umbra-border)] p-3" aria-label="Merge job">
          <div className="flex items-center justify-between gap-3"><h3 className="merge-label">{job.phase}</h3><span className="text-xs tabular-nums">{job.progress}%</span></div>
          <progress className="h-2 w-full accent-[var(--umbra-accent)]" aria-label="Merge progress" max={100} value={job.progress} />
          {job.total && <p className="text-xs tabular-nums">{job.processed?.toLocaleString() || 0} / {job.total.toLocaleString()} tensors</p>}
          <p className="break-all text-xs">{job.mode === 'lora_bake' ? `${job.a} + LoRAs` : `${job.a} (${Math.round((1 - job.ratio) * 100)}%) + ${job.b} (${Math.round(job.ratio * 100)}%)`}</p>
          <p className="break-all text-xs text-[var(--umbra-text-muted)]">{job.output}</p>
          {job.error && <p role="alert" className="break-words text-sm text-red-400">{job.error}</p>}
          {running && <button className={buttonClass} onClick={() => void cancel()}><Square size={15} />Cancel merge</button>}
        </section>}
      </div>
      <ModelMergePreview a={a ? { id: a, family: inspection?.family || models.find(model => model.id === a)?.family || 'Safetensors' } : undefined} b={!baking && b ? { id: b, family: inspection?.family || models.find(model => model.id === b)?.family || 'Safetensors' } : undefined} merged={job?.phase === 'completed' ? { id: job.outputModelId || `${job.a.split('/')[0]}/Merges/${job.output.replace(/\\/g, '/').split('/').pop()}`, family: job.family || models.find(model => model.id === job.a)?.family || 'Safetensors' } : undefined} mergeBusy={running || submitting} onBusyChange={setTestBusy} />
      </div>
    </div>
  );
}
