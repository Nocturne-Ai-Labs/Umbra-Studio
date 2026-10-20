import type { UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';

export function getMossLayoutFieldName(field: UmbraUiPromptSegment, fields: UmbraUiPromptSegment[]): string {
  if (field.label && !/^(base|segment\s+\d+|prompt\s+\d+)$/i.test(field.label)) return field.label;
  const kind = field.moss?.label || 'item';
  const siblings = fields.filter(entry => entry.moss?.purpose === 'item' && entry.moss.label === kind);
  const ordinal = Math.max(1, siblings.findIndex(entry => entry.id === field.id) + 1);
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${ordinal}`;
}
