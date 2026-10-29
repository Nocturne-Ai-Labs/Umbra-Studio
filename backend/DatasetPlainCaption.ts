import { checkDatasetCaptionSize } from './DatasetCaptionFile';
import type { CaptionRecord, CaptionSourceKind } from './DatasetCaptionSources';

const paragraphs = (text: string) => text.trim().split(/\r?\n\s*\r?\n/).map(value => value.trim()).filter(Boolean);
// The first comma-separated paragraph holds tags; descriptions follow after
// a blank line. Regenerating one mode retains the other section.
export function isDatasetTagParagraph(text: string): boolean {
  return !/[.!?。！？]\s*$/.test(text) && (text.includes(',') || /^[\w:()\-]+$/.test(text));
}
export function mergeGeneratedDatasetCaption(existing: string, generated: string, kind: CaptionSourceKind): string {
  const incoming = generated.trim();
  checkDatasetCaptionSize(incoming);
  if (!incoming) throw new Error('No caption text was produced.');
  const parts = paragraphs(existing);
  if (!parts.length) return incoming;
  const hasTags = isDatasetTagParagraph(parts[0]);
  if (kind === 'tags') {
    return checkDatasetCaptionSize([incoming, ...(hasTags ? parts.slice(1) : parts)].filter(Boolean).join('\n\n'));
  }
  return checkDatasetCaptionSize([...(hasTags ? [parts[0]] : []), incoming].join('\n\n'));
}
export function recoverLegacyDatasetCaption(existing: string, record: CaptionRecord): string {
  const parts = paragraphs(existing);
  // Keep the latest successful output even if a later attempt failed.
  for (const kind of ['tags', 'natural'] as const) {
    const saved = [...(record.sources[kind] || [])].reverse().find(entry => !entry.error && entry.text.trim());
    const text = saved?.text.trim();
    if (text && !existing.includes(text) && !parts.includes(text)) parts.push(text);
  }
  return checkDatasetCaptionSize(parts.join('\n\n'));
}
