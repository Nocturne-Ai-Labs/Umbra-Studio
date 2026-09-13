import { normalizeCensorReviewSettings, type CensorReviewItem, type CensorReviewSettings } from './umbraCensorReview';

type Scope = 'censor' | 'export';
type Selection = { id: string; value: Partial<CensorReviewSettings> };
// Choices survive drawer/workspace remounts, but never modify a project in bulk.
export class CensorReviewPresetSession {
  private choices = new Map<Scope, Selection>();
  private visited = new Set<string>();

  choose(scope: Scope, selection: Selection | null, currentId?: string) {
    this.choices.delete(scope);
    if (selection) this.choices.set(scope, { ...selection, value: structuredClone(selection.value) });
    this.visited.clear();
    if (currentId) this.visited.add(currentId);
  }

  selectedId(scope: Scope, settings: CensorReviewSettings): string {
    const selected = this.choices.get(scope);
    return selected && Object.entries(selected.value).every(([key, value]) =>
      JSON.stringify(settings[key as keyof CensorReviewSettings]) === JSON.stringify(value)) ? selected.id : 'custom';
  }

  apply(item: CensorReviewItem, hasDraft = false): CensorReviewItem {
    if (this.visited.has(item.id)) return item;
    this.visited.add(item.id);
    if (hasDraft || item.status === 'approved' || !this.choices.size) return item;
    const settings = normalizeCensorReviewSettings(Object.assign({}, item.settings, ...Array.from(this.choices.values(), (choice) => choice.value)));
    if (JSON.stringify(settings) === JSON.stringify(item.settings)) return item;
    return { ...item, settings, status: 'needs-review' };
  }
}

const sessions = new Map<string, CensorReviewPresetSession>();
export function censorReviewPresetSession(projectId: string) {
  let session = sessions.get(projectId);
  if (!session) { session = new CensorReviewPresetSession(); sessions.set(projectId, session); }
  return session;
}
