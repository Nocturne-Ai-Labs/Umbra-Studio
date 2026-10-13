import { appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_JOB_BYTES = 8 * 1024 * 1024;
const MAX_SAVED_JOBS = 32;
// A bounded 500-line tail may expand when JSON escapes Unicode/control characters.
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_SETUP_LOG_LINES = 500;
export type SetupLogStatus = { available: boolean; bytes: number; truncated: boolean; error: string };
export type LoggedSetupJob = { id: string; kind: string; phase: 'running' | 'complete' | 'failed' | 'cancelled'; step: string; lines: string[]; startedAt: string; completedAt: string | null; error: string; log?: SetupLogStatus };
export function validSetupJobId(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id); }

export function redactSetupOutput(value: string, secrets: string[] = []): string {
  let safe = String(value);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const form of new Set([secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)])) safe = safe.split(form).join('[redacted]');
  }
  return safe.replace(/\bhf_[A-Za-z0-9]{20,}\b/g, '[redacted]')
    .replace(/(https?:\/\/)[^\s/"<>@]+@/gi, '$1[redacted]@')
    .replace(/([?&](?:token|access_token|hf_token|api_key)=)[^\s&"<>]+/gi, '$1[redacted]');
}

type OpenJob = { job: LoggedSetupJob; secrets: string[]; fd?: number };
export class SetupJobLogStore {
  private readonly root: string;
  private readonly jobs = new Map<string, LoggedSetupJob>();
  private readonly open = new Map<string, OpenJob>();
  constructor(private readonly runtimeRoot: string) {
    this.root = join(resolve(runtimeRoot), 'User', 'Logs', 'Setup');
    try {
      this.ensureRoot();
      for (const name of readdirSync(this.root)) {
        const id = name.replace(/\.json$/, '');
        if (name !== `${id}.json` || !validSetupJobId(id)) continue;
        try {
          const path = this.path(id, '.json');
          if (lstatSync(path).size > MAX_MANIFEST_BYTES) continue;
          const job = JSON.parse(readFileSync(path, 'utf8')) as LoggedSetupJob;
          if (job.id !== id || !['running', 'complete', 'failed', 'cancelled'].includes(job.phase) || !Array.isArray(job.lines) || typeof job.startedAt !== 'string') continue;
          job.lines = job.lines.filter(line => typeof line === 'string').slice(-MAX_SETUP_LOG_LINES).map(line => redactSetupOutput(line).slice(0, 2048));
          job.error = redactSetupOutput(String(job.error || '')); job.step = redactSetupOutput(String(job.step || ''));
          job.log = { available: this.exists(id, '.log'), bytes: Number(job.log?.bytes || 0), truncated: job.log?.truncated === true, error: redactSetupOutput(String(job.log?.error || '')) };
          if (job.phase === 'running') { job.phase = 'failed'; job.completedAt = new Date().toISOString(); job.error = 'Setup stopped before this job completed; the installer result is unknown. Review the saved log.'; job.step = 'Installation interrupted'; }
          this.jobs.set(id, job);
          if (job.step === 'Installation interrupted') this.save(job);
        } catch { /* Ignore malformed or linked manifests, never read arbitrary paths. */ }
      }
      this.prune();
    } catch { /* A new job exposes a logging error without blocking Setup startup. */ }
  }
  private ensureRoot() {
    let parent = realpathSync(resolve(this.runtimeRoot));
    for (const name of ['User', 'Logs', 'Setup']) {
      const next = join(parent, name);
      if (!existsSync(next)) mkdirSync(next);
      const stat = lstatSync(next), physical = realpathSync(next);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform === 'win32' ? dirname(physical).toLowerCase() !== parent.toLowerCase() : dirname(physical) !== parent)) throw new Error('Setup log directory is not a regular owned directory.');
      parent = physical;
    }
  }
  private path(id: string, suffix: '.log' | '.json') {
    if (!validSetupJobId(id)) throw new Error('Invalid setup job ID.');
    this.ensureRoot();
    const path = join(this.root, `${id}${suffix}`);
    if (existsSync(path)) { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Setup log is not a regular owned file.'); }
    return path;
  }
  private exists(id: string, suffix: '.log' | '.json') { try { return existsSync(this.path(id, suffix)); } catch { return false; } }
  start(job: LoggedSetupJob, secrets: string[] = []) {
    job.log = { available: false, bytes: 0, truncated: false, error: '' };
    const entry: OpenJob = { job, secrets: [...secrets, String(process.env.HF_TOKEN || '')].filter(Boolean) };
    this.jobs.set(job.id, job); this.open.set(job.id, entry);
    try { entry.fd = openSync(this.path(job.id, '.log'), 'wx'); job.log.available = true; this.append(job, `Setup job ${job.id} (${job.kind}) started ${job.startedAt}`); this.save(job); this.prune(); }
    catch (error) { this.failed(job, error); }
  }
  addSecrets(job: LoggedSetupJob, secrets: string[]) { this.open.get(job.id)?.secrets.push(...secrets.filter(Boolean)); }
  sanitize(job: LoggedSetupJob, value: string) { return redactSetupOutput(value, this.open.get(job.id)?.secrets); }
  append(job: LoggedSetupJob, value: string): string {
    const safe = this.sanitize(job, value), entry = this.open.get(job.id);
    if (entry?.fd !== undefined && job.log && !job.log.error && !job.log.truncated) {
      try {
        const bytes = Buffer.from(`${safe}\n`);
        if (job.log.bytes + bytes.length > MAX_JOB_BYTES) { appendFileSync(entry.fd, '\n[Full log truncated at the 8 MiB resource limit; final job summary follows.]\n'); job.log.truncated = true; }
        else { appendFileSync(entry.fd, bytes); job.log.bytes += bytes.length; }
      } catch (error) { this.failed(job, error); }
    }
    return safe;
  }
  private failed(job: LoggedSetupJob, error: unknown) { if (job.log) job.log.error = this.sanitize(job, `Full installer log storage failed: ${error instanceof Error ? error.message : String(error)}`); }
  private save(job: LoggedSetupJob) {
    const path = this.path(job.id, '.json'), temporary = `${path}.tmp-${randomUUID()}`;
    const redactValue = (value: unknown): unknown => typeof value === 'string' ? this.sanitize(job, value) : Array.isArray(value) ? value.map(redactValue) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [this.sanitize(job, key), redactValue(item)])) : value;
    const snapshot = { id: job.id, kind: job.kind, phase: job.phase, startedAt: job.startedAt, completedAt: job.completedAt, log: job.log, step: this.sanitize(job, job.step).slice(0, 2048), error: this.sanitize(job, job.error).slice(0, 16384), lines: job.lines.slice(-MAX_SETUP_LOG_LINES).map(line => this.sanitize(job, line).slice(0, 2048)), progress: redactValue((job as LoggedSetupJob & { progress?: unknown }).progress) };
    try { writeFileSync(temporary, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx' }); renameSync(temporary, path); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  finish(job: LoggedSetupJob) {
    const entry = this.open.get(job.id); if (!entry) return;
    job.error = this.sanitize(job, job.error); job.step = this.sanitize(job, job.step);
    try { if (entry.fd !== undefined) { appendFileSync(entry.fd, `\n[Setup job ${job.phase}] ${job.step.slice(0, 2048)}\n${job.error.slice(0, 16384)}\n`); fsyncSync(entry.fd); if (job.log) job.log.bytes = fstatSync(entry.fd).size; } }
    catch (error) { this.failed(job, error); }
    finally { if (entry.fd !== undefined) { try { closeSync(entry.fd); } catch (error) { this.failed(job, error); } } }
    try { this.save(job); } catch (error) { this.failed(job, error); }
    this.open.delete(job.id);
  }
  list() { return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(job => ({ ...job, lines: [...job.lines] })); }
  history() { return this.list().map(({ id, kind, phase, startedAt, completedAt, log }) => ({ id, kind, phase, startedAt, completedAt, log })); }
  latest() { return this.list()[0] || null; }
  download(id: string): Buffer | null { if (!this.jobs.has(id)) return null; const path = this.path(id, '.log'); if (!existsSync(path)) return null; const stat = lstatSync(path); if (stat.size > MAX_JOB_BYTES + 32768) throw new Error('Saved setup log exceeds its resource limit.'); return readFileSync(path); }
  close() { for (const { job } of this.open.values()) this.finish(job); }
  private prune() {
    for (const job of this.list().slice(MAX_SAVED_JOBS)) {
      if (this.open.has(job.id)) continue;
      for (const suffix of ['.log', '.json'] as const) { const path = this.path(job.id, suffix); if (existsSync(path)) unlinkSync(path); }
      this.jobs.delete(job.id);
    }
  }
}
