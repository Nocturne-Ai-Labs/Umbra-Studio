/**
 * FilenameTemplate — Template-based naming for exports.
 * Supports variables like {name}, {date}, {counter}, etc.
 * Vanilla JS, no React dependencies.
 */

export interface TemplateContext {
  name: string;           // Original filename without extension
  ext: string;            // Original extension (e.g. '.png')
  date: string;           // YYYY-MM-DD
  time: string;           // HH-MM-SS
  datetime: string;       // YYYY-MM-DD_HH-MM-SS
  counter: number;        // Sequential counter (1-based)
  total: number;          // Total count in batch
  format: string;         // Output format extension (png/jpg/webp)
}

export const DEFAULT_TEMPLATE = '{name}_edited';

const VARIABLE_INFO = [
  { name: 'name', desc: 'Original filename (no extension)', example: 'DSC_0042' },
  { name: 'ext', desc: 'Original file extension', example: '.png' },
  { name: 'date', desc: 'Current date', example: '2026-02-05' },
  { name: 'time', desc: 'Current time', example: '14-30-22' },
  { name: 'datetime', desc: 'Date and time', example: '2026-02-05_14-30-22' },
  { name: 'counter', desc: 'Sequential number', example: '1' },
  { name: 'total', desc: 'Total image count', example: '25' },
  { name: 'format', desc: 'Output format', example: 'png' },
];

/**
 * Resolve a filename template with actual values.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  if (!template.trim()) return `${ctx.name}_edited`;

  let result = template;
  result = result.replace(/\{name\}/gi, ctx.name);
  result = result.replace(/\{ext\}/gi, ctx.ext);
  result = result.replace(/\{date\}/gi, ctx.date);
  result = result.replace(/\{time\}/gi, ctx.time);
  result = result.replace(/\{datetime\}/gi, ctx.datetime);
  result = result.replace(/\{counter\}/gi, String(ctx.counter).padStart(String(ctx.total).length, '0'));
  result = result.replace(/\{total\}/gi, String(ctx.total));
  result = result.replace(/\{format\}/gi, ctx.format);

  // Sanitize: remove characters that are invalid in filenames
  result = result.replace(/[<>:"/\\|?*]/g, '_');

  return result;
}

/**
 * Preview what a template will produce, using sample data.
 */
export function previewTemplate(template: string, sampleName?: string): string {
  const now = new Date();
  const ctx: TemplateContext = {
    name: sampleName || 'DSC_0042',
    ext: '.png',
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)}_${formatTime(now)}`,
    counter: 1,
    total: 1,
    format: 'png',
  };
  return resolveTemplate(template || DEFAULT_TEMPLATE, ctx);
}

/**
 * Build a TemplateContext from an image path + export settings.
 */
export function buildContext(
  imagePath: string,
  formatExt: string,
  counter: number,
  total: number,
): TemplateContext {
  const fileName = imagePath.split('/').pop() || 'export';
  const lastDot = fileName.lastIndexOf('.');
  const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.substring(lastDot) : '';
  const now = new Date();

  return {
    name,
    ext,
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)}_${formatTime(now)}`,
    counter,
    total,
    format: formatExt,
  };
}

/**
 * Get the list of available template variables with descriptions.
 */
export function getAvailableVariables(): { name: string; desc: string; example: string }[] {
  return VARIABLE_INFO;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
