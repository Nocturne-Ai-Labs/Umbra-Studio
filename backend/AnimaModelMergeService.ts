import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open, readdir, realpath, rm, stat, readFile, rename, link } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { extractUmbraUiTriggerWords } from './UmbraUiLoraMetadata';

type MergeConfig = { modelsRoot: string; python: string; comfyRoot?: string };
type LoraEntry = { id: string; model: string; strength: number; enabled: boolean };
type MergeInput = { a?: unknown; b?: unknown; ratio?: unknown; name?: unknown; blocks?: unknown; lorasA?: unknown; lorasB?: unknown; cleanMetadata?: unknown };

export function normalizeMergeOptions(input: MergeInput) {
  if (input.cleanMetadata !== undefined && typeof input.cleanMetadata !== 'boolean') throw new Error('Invalid metadata setting.');
  const blocks = input.blocks ?? {};
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) throw new Error('Invalid block weights.');
  for (const [index, value] of Object.entries(blocks)) {
    if (!/^(?:[0-9]|[1-3][0-9])$/.test(index) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid block weights.');
  }
  const stack = (raw: unknown): LoraEntry[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 32) throw new Error('A source supports up to 32 LoRAs.');
    const ids = new Set<string>();
    return raw.map(entry => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.model !== 'string' || !entry.model.startsWith('loras/') || !entry.model.endsWith('.safetensors') || typeof entry.enabled !== 'boolean' || typeof entry.strength !== 'number' || !Number.isFinite(entry.strength) || Math.abs(entry.strength) > 2) throw new Error('Invalid LoRA stack entry.');
      ids.add(entry.id);
      return { id: entry.id, model: entry.model, strength: entry.strength, enabled: entry.enabled };
    });
  };
  return { blocks: blocks as Record<string, number>, lorasA: stack(input.lorasA), lorasB: stack(input.lorasB), cleanMetadata: input.cleanMetadata !== false };
}
export type AnimaMergeJob = {
  id: string; phase: string; progress: number; a: string; b: string; ratio: number;
  output: string; blueprintId?: string; error?: string; processed?: number; total?: number;
};

export class AnimaModelMergeService {
  private job: AnimaMergeJob | null = null;
  private worker: ChildProcess | null = null;
  private busy = false;
  private cancelPath = '';
  private familyCache = new Map<string, { stamp: string; family: string | null; blueprintId?: string; umbra?: boolean }>();
  constructor(private config: () => MergeConfig, private script: string, private workRoot: string) {}

  async catalog() {
    const { modelsRoot } = this.config();
    const items: { id: string; name: string; bytes: number; family: string; blueprintId?: string; umbra?: boolean }[] = [];
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.safetensors')) {
          const info = await stat(path).catch(() => null);
          if (info) {
            const stamp = `${info.size}:${info.mtimeMs}`;
            let cached = this.familyCache.get(path);
            if (cached?.stamp !== stamp) {
              let family: string | null = null;
              let blueprintId: string | undefined;
              let umbra = false;
              const handle = await open(path, 'r').catch(() => null);
              if (handle) {
                try {
                  const prefix = Buffer.alloc(8);
                  await handle.read(prefix, 0, 8, 0);
                  const length = Number(prefix.readBigUInt64LE());
                  if (length > 1 && length <= 16 * 1024 * 1024) {
                    const bytes = Buffer.alloc(length);
                    await handle.read(bytes, 0, length, 8);
                    const header = JSON.parse(bytes.toString('utf8'));
                    const metadata = header.__metadata__ || {};
                    umbra = metadata['umbra.creator'] === 'Umbra Studio' || typeof metadata['umbra.merge'] === 'string';
                    if (typeof metadata['umbra.blueprint_id'] === 'string' && /^[a-f0-9-]{36}$/.test(metadata['umbra.blueprint_id'])) blueprintId = metadata['umbra.blueprint_id'];
                    const keys = Object.keys(header);
                    const blocks = new Set(keys.flatMap(key => { const match = key.match(/^(?:model\.diffusion_model\.|diffusion_model\.|net\.)?blocks\.(\d+)\./); return match ? [Number(match[1])] : []; }));
                    if ([28, 40].includes(blocks.size) && keys.some(key => key.includes('llm_adapter.blocks.')) && [...blocks].every(block => block < blocks.size)) family = blocks.size === 40 ? 'Anima 2.9B' : 'Anima';
                  }
                } catch { /* Unsupported or incomplete files stay out of the merge catalog. */ }
                finally { await handle.close(); }
              }
              if (this.familyCache.size > 1000) this.familyCache.clear();
              cached = { stamp, family, blueprintId, umbra };
              this.familyCache.set(path, cached);
            }
            if (cached.family) items.push({ id: relative(modelsRoot, path).replaceAll('\\', '/'), name: entry.name, bytes: info.size, family: cached.family, blueprintId: cached.blueprintId, umbra: cached.umbra });
          }
        }
      }
    };
    for (const folder of ['diffusion_models', 'checkpoints', 'unet']) await walk(join(modelsRoot, folder));
    return items.sort((a, b) => a.id.localeCompare(b.id));
  }

  private async source(id: unknown, root: string, lora = false) {
    if (typeof id !== 'string' || !(lora ? /^loras\// : /^(diffusion_models|checkpoints|unet)\//).test(id) || !id.endsWith('.safetensors')) throw new Error('Select a local safetensors model.');
    const base = await realpath(root);
    const path = await realpath(resolve(root, id));
    const rel = relative(base, path);
    if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(path)).isFile()) throw new Error('Model must be inside the configured model folder.');
    return path;
  }

  async loras() {
    const { modelsRoot } = this.config();
    const items: { id: string; name: string; bytes: number }[] = [];
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && entry.name.endsWith('.safetensors')) items.push({ id: relative(modelsRoot, path).replaceAll('\\', '/'), name: entry.name, bytes: (await stat(path)).size });
      }
    };
    await walk(join(modelsRoot, 'loras'));
    return items.sort((a, b) => a.id.localeCompare(b.id));
  }

  async loraInfo(id: unknown) {
    const path = await this.source(id, this.config().modelsRoot, true);
    const handle = await open(path, 'r');
    try {
      const prefix = Buffer.alloc(8);
      await handle.read(prefix, 0, 8, 0);
      const length = Number(prefix.readBigUInt64LE());
      if (length < 2 || length > 16 * 1024 * 1024) throw new Error('Invalid LoRA header.');
      const bytes = Buffer.alloc(length);
      await handle.read(bytes, 0, length, 8);
      const metadata = JSON.parse(bytes.toString('utf8')).__metadata__ || {};
      const sidecar = await readFile(path.replace(/\.safetensors$/, '.civitai.info'), 'utf8').then(JSON.parse).catch(() => null);
      return { triggers: extractUmbraUiTriggerWords(sidecar, metadata) };
    } finally { await handle.close(); }
  }

  private recipeRoot() { return join(this.workRoot, 'Recipes'); }
  private blueprintRoot() { return join(this.workRoot, 'Blueprints'); }
  async blueprint(id: unknown) {
    const value = JSON.parse(await readFile(join(this.blueprintRoot(), `${this.recipeId(id)}.json`), 'utf8'));
    return this.validateBlueprint(value, id);
  }
  private validateBlueprint(value: any, id: unknown) {
    if (value.version !== 1 || value.kind !== 'umbra-model-merge' || value.id !== id || !value.setup || typeof value.title !== 'string' || typeof value.setup.a !== 'string' || typeof value.setup.b !== 'string' || typeof value.setup.name !== 'string' || typeof value.setup.ratio !== 'number' || !Number.isFinite(value.setup.ratio) || value.setup.ratio < 0 || value.setup.ratio > 1) throw new Error('Invalid merge blueprint.');
    return { ...value, setup: { ...value.setup, ...normalizeMergeOptions(value.setup) } };
  }
  async importBlueprint(input: unknown) {
    if (!input || typeof input !== 'object' || JSON.stringify(input).length > 4 * 1024 * 1024) throw new Error('Invalid or oversized blueprint.');
    const id = this.recipeId((input as { id?: unknown }).id);
    const value = this.validateBlueprint(input, id);
    await mkdir(this.blueprintRoot(), { recursive: true });
    const destination = join(this.blueprintRoot(), `${id}.json`);
    if (existsSync(destination)) {
      if (JSON.stringify(await this.blueprint(id)) !== JSON.stringify(value)) throw new Error('A different blueprint already uses this ID. Existing history was not changed.');
      return value;
    }
    const temporary = join(this.blueprintRoot(), `${id}.${randomUUID()}.tmp`);
    try {
      await Bun.write(temporary, JSON.stringify(value, null, 2));
      await link(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
    return value;
  }
  async blueprints() {
    const result = [];
    for (const file of await readdir(this.blueprintRoot()).catch(() => [])) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      try {
        const value = await this.blueprint(file.slice(0, -5));
        result.push({ id: value.id, title: value.title, createdAt: value.createdAt, family: value.family });
      } catch { /* Partial or malformed blueprints are never offered for loading. */ }
    }
    return result.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  async recipes() {
    const result = [];
    for (const file of await readdir(this.recipeRoot()).catch(() => [])) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      try {
        const recipe = JSON.parse(await readFile(join(this.recipeRoot(), file), 'utf8'));
        if (recipe.version !== 1 || recipe.id + '.json' !== file || typeof recipe.title !== 'string' || !recipe.title.trim()) continue;
        const setup = recipe.setup;
        if (!setup || typeof setup.a !== 'string' || typeof setup.b !== 'string' || typeof setup.name !== 'string' || typeof setup.ratio !== 'number' || !Number.isFinite(setup.ratio) || setup.ratio < 0 || setup.ratio > 1) continue;
        result.push({ ...recipe, setup: { ...setup, ...normalizeMergeOptions(setup) } });
      } catch { /* Ignore incomplete or malformed recipes. */ }
    }
    return result.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }
  async saveRecipe(input: { id?: unknown; title?: unknown; setup?: MergeInput }) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 || !input.setup) throw new Error('Name the recipe first.');
    const setup = input.setup;
    if (typeof setup.a !== 'string' || typeof setup.b !== 'string' || typeof setup.name !== 'string' || typeof setup.ratio !== 'number' || !Number.isFinite(setup.ratio) || setup.ratio < 0 || setup.ratio > 1) throw new Error('Invalid recipe.');
    const id = input.id === undefined ? randomUUID() : this.recipeId(input.id);
    const recipe = { id, title: input.title.trim(), version: 1, setup: { a: setup.a, b: setup.b, name: setup.name, ratio: setup.ratio, ...normalizeMergeOptions(setup) } };
    await mkdir(this.recipeRoot(), { recursive: true });
    const destination = join(this.recipeRoot(), `${id}.json`);
    const temporary = join(this.recipeRoot(), `${id}.${randomUUID()}.tmp`);
    try { await Bun.write(temporary, JSON.stringify(recipe, null, 2)); await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }); }
    return recipe;
  }
  private recipeId(id: unknown) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid recipe ID.');
    return id;
  }
  async deleteRecipe(id: unknown) { await rm(join(this.recipeRoot(), `${this.recipeId(id)}.json`), { force: true }); }

  private run(python: string, request: object, onEvent?: (event: Record<string, unknown>) => void) {
    const child = spawn(python, ['-u', this.script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1', PYTORCH_NVML_BASED_CUDA_CHECK: '0', OMP_NUM_THREADS: '2' } });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(request));
    let buffer = '', errors = '';
    let last: Record<string, unknown> = {};
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        try { last = JSON.parse(line); onEvent?.(last); } catch { /* Ignore non-protocol library output. */ }
      }
    });
    child.stderr.on('data', (chunk) => { errors = (errors + String(chunk)).slice(-2000); });
    const done = new Promise<Record<string, unknown>>((accept, reject) => {
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? accept(last) : reject(new Error(String(last.error || errors || 'Merge worker stopped.'))));
    });
    return { child, done };
  }

  async inspect(a: unknown, b: unknown) {
    const config = this.config();
    const paths = { a: await this.source(a, config.modelsRoot), b: await this.source(b, config.modelsRoot) };
    const { child, done } = this.run(config.python, { action: 'inspect', ...paths });
    const timeout = setTimeout(() => child.kill(), 30000);
    try { return await done; } finally { clearTimeout(timeout); }
  }

  status() { return this.job; }

  async start(input: MergeInput) {
    if (this.busy) throw new Error('A model merge is already running.');
    this.busy = true;
    try {
      const config = this.config();
      const a = await this.source(input.a, config.modelsRoot), b = await this.source(input.b, config.modelsRoot);
      if (a === b) throw new Error('Choose two different source models.');
      if (typeof input.ratio !== 'number' || !Number.isFinite(input.ratio) || input.ratio < 0 || input.ratio > 1) throw new Error('Mix must be between 0 and 100 percent.');
      const options = normalizeMergeOptions(input);
      const resolveStack = async (stack: LoraEntry[]) => {
        const result = [];
        for (const entry of stack.filter(item => item.enabled && item.strength !== 0)) result.push({ path: await this.source(entry.model, config.modelsRoot, true), strength: entry.strength });
        return result;
      };
      const lorasA = await resolveStack(options.lorasA), lorasB = await resolveStack(options.lorasB);
      const name = typeof input.name === 'string' ? input.name.trim().replace(/\.safetensors$/i, '') : '';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,99}$/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Use a filename of 1-100 letters, numbers, spaces, dots, underscores, or hyphens.');
      const destination = join(config.modelsRoot, 'diffusion_models', 'Merges');
      await mkdir(destination, { recursive: true });
      const base = await realpath(config.modelsRoot);
      const rel = relative(base, await realpath(destination));
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Output folder must remain inside the model folder.');
      const output = join(destination, `${name}.safetensors`);
      if (existsSync(output)) throw new Error('Output already exists. Choose a new name.');
      await mkdir(this.workRoot, { recursive: true });
      const id = randomUUID();
      const partial = join(destination, `.${id}.partial`);
      this.cancelPath = join(this.workRoot, `${id}.cancel`);
      await mkdir(this.blueprintRoot(), { recursive: true });
      const blueprint = { id, title: name, createdAt: new Date().toISOString(), setup: { a: input.a, b: input.b, ratio: input.ratio, name, ...options } };
      this.job = { id, phase: 'checking', progress: 0, a: String(input.a), b: String(input.b), ratio: input.ratio, output, blueprintId: id };
      const { child, done } = this.run(config.python, { action: 'merge', a, b, ratio: input.ratio, blocks: options.blocks, lorasA, lorasB, cleanMetadata: options.cleanMetadata, blueprint, blueprintPath: join(this.blueprintRoot(), `${id}.json`), comfyRoot: config.comfyRoot, output, partial, cancel: this.cancelPath }, event => {
        if (!this.job || this.job.id !== id) return;
        if (typeof event.phase === 'string') this.job.phase = event.phase;
        if (typeof event.progress === 'number') this.job.progress = event.progress;
        if (typeof event.processed === 'number') this.job.processed = event.processed;
        if (typeof event.total === 'number') this.job.total = event.total;
      });
      this.worker = child;
      void done.catch(error => {
        if (this.job?.id === id) {
          if (this.job.phase !== 'completed') {
            this.job.phase = existsSync(this.cancelPath) ? 'cancelled' : 'failed';
            this.job.error = error.message;
          }
        }
      }).finally(async () => {
        await rm(partial, { force: true }).catch(() => undefined);
        await rm(this.cancelPath, { force: true }).catch(() => undefined);
        this.worker = null;
        this.busy = false;
      });
      return this.job;
    } catch (error) { this.busy = false; throw error; }
  }

  async cancel() {
    if (!this.worker || !this.busy) return;
    await Bun.write(this.cancelPath, 'cancel');
    // The worker checks cancellation between tensors and before publishing.
    // Give a save already in progress time to finish cleanly before forcing exit.
    const worker = this.worker;
    const timeout = setTimeout(() => { if (this.worker === worker) worker.kill(); }, 30000);
    worker.once('close', () => clearTimeout(timeout));
  }

  async shutdown() {
    if (!this.worker) return;
    const worker = this.worker;
    const closed = new Promise<void>(resolve => worker.once('close', () => resolve()));
    await Bun.write(this.cancelPath, 'cancel');
    worker.kill();
    await closed;
  }
}
