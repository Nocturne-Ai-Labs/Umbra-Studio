import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { actionRoutes, actionMethods, classifyAction, safeMethod, type ActionGroup, type ActionProcess, type ActionIdentity } from './backendActionRegistry';

// A nested in-process main dispatch belongs to the existing outer main action.
// Cross-process return hops use the independently authenticated ownership proof.
const mainDispatch = new AsyncLocalStorage<boolean>();

export const ACTION_FRAME = '@umbra-action-v1 ';
export type ActionOutcome = 'success' | 'accepted' | 'redirect' | 'rejected' | 'failed' | 'uncaught' | 'aborted' | 'response' | 'upgrade';
export type ActionRecord = {
  version: 1; time: string; id: string; group: ActionGroup; method: string;
  route: string; status: number | null; outcome: ActionOutcome; elapsed: number;
};
const groups = {
  Gallery: ['🖼', 36], 'Umbra UI': ['🎨', 35], 'Data Forge': ['🧰', 34],
  'Model Manager': ['📦', 33], Shared: ['🔗', 37],
} as const;
const outcomes: readonly string[] = ['success','accepted','redirect','rejected','failed','uncaught','aborted','response','upgrade'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unmatched = ['/api/:unmatched', '/api/gallery-bridge/:unmatched', '/api/fs/:unmatched', '/api/umbra-ui/:unmatched', '/api/data-forge/:unmatched', '/api/dataset/:unmatched', '/api/datasets/:unmatched', '/api/model-manager/:unmatched', '/api/models/:unmatched', '/api/civitai/:unmatched'];
const identities = new Set(actionRoutes.map(r => `${r.group}\0${r.display}`));
identities.add('Shared\0/api/:preflight');
for (const route of unmatched) { const c = classifyAction(route, 'GET', 'Umbra main'); if (c) identities.add(`${c.group}\0${route}`); }
const fields = ['version','time','id','group','method','route','status','outcome','elapsed'].sort().join(',');
function coherentOutcome(r: ActionRecord): boolean {
  if (r.outcome === 'aborted') return true;
  if (r.outcome === 'uncaught') return r.status === null;
  if (r.outcome === 'upgrade') return r.status === null || r.status === 101;
  if (r.status === null) return false;
  if (r.outcome === 'failed') return r.status >= 500;
  if (r.outcome === 'rejected') return r.status >= 400 && r.status < 500;
  if (r.outcome === 'redirect') return r.status >= 300 && r.status < 400;
  if (r.outcome === 'accepted') return r.status === 202;
  return r.status >= 200 && r.status < 300 && r.status !== 202;
}
export function validateActionRecord(value: unknown): value is ActionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as ActionRecord;
  return Object.keys(r).sort().join(',') === fields && r.version === 1
    && typeof r.time === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.time) && Number.isFinite(Date.parse(r.time)) && new Date(r.time).toISOString() === r.time
    && typeof r.id === 'string' && uuidPattern.test(r.id)
    && typeof r.group === 'string' && typeof r.route === 'string'
    && Object.hasOwn(groups, r.group) && identities.has(`${r.group}\0${r.route}`)
    && [...actionMethods, 'OTHER'].includes(r.method as typeof actionMethods[number])
    && (r.status === null || (Number.isInteger(r.status) && r.status >= 100 && r.status <= 599))
    && outcomes.includes(r.outcome) && coherentOutcome(r) && Number.isFinite(r.elapsed) && r.elapsed >= 0 && r.elapsed <= Number.MAX_SAFE_INTEGER;
}
export function renderAction(record: ActionRecord, env: Record<string, string | undefined> = process.env, tty = Boolean(process.stdout.isTTY)): string {
  const color = env.NO_COLOR ? false : env.FORCE_COLOR === '0' ? false : ['1', '2', '3', 'true', ''].includes(env.FORCE_COLOR) ? true : tty;
  const paint = (text: string, code: number) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const [emoji, groupColor] = groups[record.group];
  const outcomeColor = ['failed','uncaught'].includes(record.outcome) ? 31 : ['rejected','aborted'].includes(record.outcome) ? 33 : 32;
  return `${record.time} ${record.id} ${paint(`${emoji} ${record.group}`, groupColor)} ${record.method} ${record.route} ${record.status ?? '-'} ${paint(record.outcome, outcomeColor)} ${record.elapsed.toFixed(1)}ms`;
}
function outcome(response: Response | undefined, aborted: boolean, threw: boolean): ActionOutcome {
  if (aborted) return 'aborted';
  if (threw) return 'uncaught';
  if (!response || response.status === 101) return 'upgrade';
  if (response.status >= 500) return 'failed';
  if (response.status >= 400) return 'rejected';
  if (response.status >= 300) return 'redirect';
  if (response.status === 202) return 'accepted';
  if ((response.body && !response.headers.has('content-type')) || response.headers.get('transfer-encoding') === 'chunked' || /^(text\/event-stream|application\/(octet-stream|zip)|image\/|video\/|audio\/)/i.test(response.headers.get('content-type') || '') || response.headers.has('content-disposition')) return 'response';
  return 'success';
}
export type LoggerOptions = {
  process: ActionProcess; sink?: (line: string) => void; frame?: boolean;
  clock?: () => number; classifier?: typeof classifyAction;
  env?: Record<string,string | undefined>; tty?: boolean;
  suppressed?: (req: Request, response: Response | undefined) => boolean;
};
export function createActionLogger(options: LoggerOptions) {
  const sink = options.sink || ((line: string) => console.log(line));
  const clock = options.clock || (() => performance.now());
  const safeClock = () => { try { const n = clock(); return Number.isFinite(n) ? n : 0; } catch { return 0; } };
  return {
    wrap<A extends unknown[], R extends Response | undefined>(handler: (req: Request, ...args: A) => Promise<R> | R) {
      return async (req: Request, ...args: A): Promise<R> => {
        const nestedMain = options.process === 'Umbra main' && mainDispatch.getStore() === true;
        const started = safeClock();
        let identity: ActionIdentity | null = null;
        try { identity = (options.classifier || classifyAction)(new URL(req.url).pathname, req.method, options.process); } catch {}
        let response: R | undefined; let threw = false;
        try {
          response = await (options.process === 'Umbra main' ? mainDispatch.run(true, () => handler(req, ...args)) : handler(req, ...args));
          return response;
        }
        catch (error) { threw = true; throw error; }
        finally {
          try {
            if (identity && !nestedMain && !options.suppressed?.(req, response)) {
              const record: ActionRecord = {
                version: 1, time: new Date().toISOString(), id: randomUUID(),
                ...identity, method: safeMethod(req.method), status: response?.status ?? null,
                outcome: outcome(response, req.signal.aborted, threw), elapsed: Math.max(0, safeClock() - started),
              };
              if (validateActionRecord(record)) sink(options.frame ? ACTION_FRAME + JSON.stringify(record) : renderAction(record, options.env, options.tty));
            }
          } catch { /* Terminal reporting must not affect dispatch or error propagation. */ }
        }
      };
    },
  };
}
