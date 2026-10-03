export interface OfficialVideoLoraRow {
  on: boolean;
  lora: string;
  str: number;
  vs: number;
  as: number;
}

const NODE_TYPE = 'DaSiWa_LTX2LoraLoader';
const fail = (message: string): never => { throw new Error(`Official video LoRA stack: ${message}`); };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function checkedRows(value: unknown): OfficialVideoLoraRow[] {
  if (!Array.isArray(value)) return fail('expected an array of native DaSiWa rows.');
  return value.map((entry, index) => {
    if (!record(entry) || typeof entry.on !== 'boolean' || typeof entry.lora !== 'string' || !entry.lora.trim()
      || typeof entry.str !== 'number' || !Number.isFinite(entry.str) || entry.str < -5 || entry.str > 5
      || typeof entry.vs !== 'number' || !Number.isFinite(entry.vs) || entry.vs < 0 || entry.vs > 2
      || typeof entry.as !== 'number' || !Number.isFinite(entry.as) || entry.as < 0 || entry.as > 2) {
      fail(`row ${index + 1} must contain {on, lora, str, vs, as} with strength -5..5 and multipliers 0..2.`);
    }
    return { on: entry.on, lora: entry.lora, str: entry.str, vs: entry.vs, as: entry.as };
  });
}

export function readOfficialVideoLoraStack(node: unknown): OfficialVideoLoraRow[] {
  if (!record(node)) return fail(`expected a ${NODE_TYPE} node.`);
  if (node.type !== NODE_TYPE) return fail(`expected a ${NODE_TYPE} node.`);
  const properties = record(node.properties) ? node.properties : {};
  const named = record(node.widgets_values_named) ? node.widgets_values_named : {};
  const inputs = record(node.inputs) ? node.inputs : {};
  const raw = properties.stack_data ?? named.stack_data ?? (Array.isArray(node.widgets_values) ? node.widgets_values[0] : undefined) ?? inputs.stack_data;
  if (typeof raw !== 'string') fail('native stack_data STRING is missing.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail('native stack_data is not valid JSON.'); }
  return checkedRows(parsed);
}

export function validateAndSerializeOfficialVideoLoraStack(rows: unknown): string {
  return JSON.stringify(checkedRows(rows));
}

export const serializeOfficialVideoLoraStack = validateAndSerializeOfficialVideoLoraStack;

export function readOfficialVideoLoraChoices(catalog: unknown): string[] | null {
  if (!record(catalog)) return null;
  const info = record(catalog[NODE_TYPE]) ? catalog[NODE_TYPE] as Record<string, unknown> : catalog;
  const input = record(info.input) ? info.input : null;
  const hidden = input && record(input.hidden) ? input.hidden : null;
  const field = hidden?.available_loras;
  if (!Array.isArray(field) || !Array.isArray(field[0]) || !field[0].every((name: unknown) => typeof name === 'string')) return null;
  return field[0].filter((name: string) => name && name !== 'None');
}

export function validateOfficialVideoLoraChoices(rows: unknown, catalog: unknown): void {
  const active = checkedRows(rows).map((row, index) => ({ ...row, index: index + 1 }))
    .filter(row => row.on && row.lora !== 'None');
  if (!active.length) return;
  const choices = readOfficialVideoLoraChoices(catalog);
  if (!choices) fail('installed LoRA choices are unavailable from object_info; reconnect ComfyUI and refresh its model list before capture.');
  const installed = new Set(choices);
  const missing = active.filter(row => !installed.has(row.lora));
  if (missing.length) fail(`installed LoRA file missing for ${missing.map(row => `slot ${row.index} (${row.lora})`).join(', ')}. Install the file, select another LoRA, or disable the slot before capture.`);
}
