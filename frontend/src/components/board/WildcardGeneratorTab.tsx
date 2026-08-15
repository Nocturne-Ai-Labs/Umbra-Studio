'use client';

import React from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  DatabaseZap,
  Dices,
  FolderTree,
  FileText,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { WildcardLibraryManager, type WildcardLibraryEntry } from '@/components/shared/WildcardLibraryManager';

type WildcardTag = {
  tag: string;
  category: number;
  postCount: number | null;
  classifiers: string[];
  explicit: boolean;
  source: 'danbooru' | 'local' | 'natural' | 'freeform';
  kind?: 'tag' | 'natural' | 'auto';
  catalogSource?: string;
  catalogType?: 'tag' | 'character';
};

type WildcardClassifierSummary = {
  id: string;
  label: string;
  description: string;
  explicit: boolean;
  count: number;
};

type WildcardOption = {
  id: string;
  tags: WildcardTag[];
  chance: number;
};

type WildcardGroup = {
  id: string;
  name: string;
  enabled: boolean;
  required: boolean;
  options: WildcardOption[];
};

type TagCatalogDestination = 'fixed' | 'excluded' | `group:${string}`;
type TagCatalogView = 'catalog' | 'sources';

type PowerPrompterCatalogItem = {
  tag?: unknown;
  category?: unknown;
  count?: unknown;
  classifiers?: unknown;
  explicit?: unknown;
  source?: unknown;
  type?: unknown;
};

type GeneratedRow = {
  value: string;
  score: number;
  chance: number;
  minimumPostCount: number | null;
  knownPostCountTags: number;
};

type GeneratedResult = {
  rows: GeneratedRow[];
  values: string[];
  requestedCount: number;
  generatedCount: number;
  possibleCombinations: number;
  seed: number;
  warnings: string[];
  audit: {
    unique: boolean;
    maximumTagsPerLine: number;
    unknownPostCountTags: string[];
    groupsUsed: number;
  };
};

const CATEGORY_LABELS: Record<number, string> = {
  0: 'General',
  1: 'Artist',
  3: 'Copyright',
  4: 'Character',
  5: 'Meta',
};

const TAG_CATALOG_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: '0', label: 'General' },
  { value: '4', label: 'Character' },
  { value: '3', label: 'Copyright' },
  { value: '1', label: 'Artist' },
  { value: '5', label: 'Meta' },
] as const;

const getCsvSourceId = (type: 'tag' | 'character', fileName: string) => `${type}:${fileName}`;

const isCsvSourceEnabled = (enabledCSVs: string[], sourceId: string, fileName: string) => (
  enabledCSVs.includes(sourceId) || enabledCSVs.includes(fileName)
);

function mapPowerPrompterCatalogItem(rawItem: PowerPrompterCatalogItem): WildcardTag | null {
  const tag = String(rawItem.tag || '').trim();
  if (!tag) return null;
  const postCount = Number(rawItem.count);
  return {
    tag,
    category: Number.isFinite(Number(rawItem.category)) ? Number(rawItem.category) : 0,
    postCount: Number.isFinite(postCount) ? postCount : null,
    classifiers: Array.isArray(rawItem.classifiers)
      ? rawItem.classifiers.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    explicit: rawItem.explicit === true,
    source: 'local',
    catalogSource: String(rawItem.source || '').trim() || undefined,
    catalogType: rawItem.type === 'character' ? 'character' : 'tag',
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createGroup(name: string): WildcardGroup {
  return { id: createId('group'), name, enabled: true, required: true, options: [] };
}

function normalizeStoredWildcardTag(rawTag: unknown): WildcardTag | null {
  if (typeof rawTag === 'string') {
    const tag = rawTag.trim();
    return tag ? { tag, category: 0, postCount: null, classifiers: [], explicit: false, source: 'local' } : null;
  }
  if (!rawTag || typeof rawTag !== 'object' || Array.isArray(rawTag)) return null;
  const record = rawTag as Record<string, unknown>;
  const tag = String(record.tag || '').trim();
  if (!tag) return null;
  const freeform = record.kind === 'auto' || record.source === 'freeform';
  const natural = record.kind === 'natural' || record.source === 'natural';
  return {
    tag,
    category: Number.isFinite(Number(record.category)) ? Number(record.category) : 0,
    postCount: record.postCount !== null && record.postCount !== undefined && Number.isFinite(Number(record.postCount)) ? Number(record.postCount) : null,
    classifiers: Array.isArray(record.classifiers) ? record.classifiers.map((value) => String(value || '').trim()).filter(Boolean) : [],
    explicit: record.explicit === true,
    source: freeform ? 'freeform' : natural ? 'natural' : record.source === 'danbooru' ? 'danbooru' : 'local',
    kind: freeform ? 'auto' : natural ? 'natural' : 'tag',
  };
}

function createFreeformEntry(value: string): WildcardTag | null {
  const text = value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!text) return null;
  return {
    tag: text,
    category: 0,
    postCount: null,
    classifiers: [],
    explicit: false,
    source: 'freeform',
    kind: 'auto',
  };
}

function isNaturalLanguageEntry(tag: WildcardTag): boolean {
  return tag.kind === 'natural' || tag.source === 'natural';
}

function isFreeformEntry(tag: WildcardTag): boolean {
  return tag.kind === 'auto' || tag.source === 'freeform';
}

function optionText(option: WildcardOption): string {
  return option.tags.map((tag) => tag.tag).join(', ');
}

function normalizeStoredWildcardDefinition(rawDefinition: unknown): {
  count: number;
  seed: number;
  maxTagsPerLine: number;
  prioritizePostCounts: boolean;
  baseTags: WildcardTag[];
  forbiddenTags: WildcardTag[];
  groups: WildcardGroup[];
} | null {
  if (!rawDefinition || typeof rawDefinition !== 'object' || Array.isArray(rawDefinition)) return null;
  const record = rawDefinition as Record<string, unknown>;
  const groups = (Array.isArray(record.groups) ? record.groups : []).map((rawGroup, groupIndex) => {
    const group = rawGroup && typeof rawGroup === 'object' && !Array.isArray(rawGroup) ? rawGroup as Record<string, unknown> : {};
    const options = (Array.isArray(group.options) ? group.options : []).map((rawOption, optionIndex) => {
      const option = rawOption && typeof rawOption === 'object' && !Array.isArray(rawOption) ? rawOption as Record<string, unknown> : {};
      const tags = (Array.isArray(option.tags) ? option.tags : []).map(normalizeStoredWildcardTag).filter((tag): tag is WildcardTag => Boolean(tag));
      return {
        id: String(option.id || createId(`option-${groupIndex}-${optionIndex}`)),
        tags,
        chance: Math.max(0, Math.min(100, Math.round(Number(option.chance) || 0))),
      };
    }).filter((option) => option.tags.length > 0);
    return {
      id: String(group.id || createId(`group-${groupIndex}`)),
      name: String(group.name || `Group ${groupIndex + 1}`).trim() || `Group ${groupIndex + 1}`,
      enabled: group.enabled !== false,
      required: group.required !== false,
      options,
    };
  }).filter((group) => group.options.length > 0);
  if (groups.length === 0) return null;
  return {
    count: Math.max(1, Math.min(1000, Math.floor(Number(record.count) || 50))),
    seed: Math.max(0, Math.min(0xffffffff, Math.floor(Number(record.seed) || 0))),
    maxTagsPerLine: Math.max(2, Math.min(40, Math.floor(Number(record.maxTagsPerLine) || 12))),
    prioritizePostCounts: record.prioritizePostCounts !== false,
    baseTags: (Array.isArray(record.baseTags) ? record.baseTags : []).map(normalizeStoredWildcardTag).filter((tag): tag is WildcardTag => Boolean(tag)),
    forbiddenTags: (Array.isArray(record.forbiddenTags) ? record.forbiddenTags : []).map(normalizeStoredWildcardTag).filter((tag): tag is WildcardTag => Boolean(tag)),
    groups,
  };
}

function allocateWholePercentages(weights: number[], total = 100): number[] {
  if (weights.length === 0) return [];
  const normalizedWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightTotal > 0 ? normalizedWeights : normalizedWeights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0) || effectiveWeights.length;
  const raw = effectiveWeights.map((weight) => (weight / effectiveTotal) * total);
  const values = raw.map((value) => Math.floor(value));
  let remainder = total - values.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < order.length && remainder > 0; index += 1) {
    values[order[index].index] += 1;
    remainder -= 1;
  }
  return values;
}

function evenlyDistributeOptions(options: WildcardOption[]): WildcardOption[] {
  const chances = allocateWholePercentages(options.map(() => 1));
  return options.map((option, index) => ({ ...option, chance: chances[index] || 0 }));
}

function appendOptionWithBalancedChance(options: WildcardOption[], option: Omit<WildcardOption, 'chance'>): WildcardOption[] {
  if (options.length === 0) return [{ ...option, chance: 100 }];
  const newChance = Math.max(1, Math.round(100 / (options.length + 1)));
  const existingChances = allocateWholePercentages(options.map((entry) => entry.chance), 100 - newChance);
  return [
    ...options.map((entry, index) => ({ ...entry, chance: existingChances[index] || 0 })),
    { ...option, chance: newChance },
  ];
}

function removeOptionAndRebalance(options: WildcardOption[], optionId: string): WildcardOption[] {
  const remaining = options.filter((option) => option.id !== optionId);
  if (remaining.length === 0) return [];
  const chances = allocateWholePercentages(remaining.map((option) => option.chance));
  return remaining.map((option, index) => ({ ...option, chance: chances[index] || 0 }));
}

function rebalanceOptionChance(options: WildcardOption[], optionId: string, rawChance: number): WildcardOption[] {
  if (options.length <= 1) return options.map((option) => ({ ...option, chance: 100 }));
  const targetChance = Math.max(0, Math.min(100, Math.round(rawChance)));
  const others = options.filter((option) => option.id !== optionId);
  const otherChances = allocateWholePercentages(others.map((option) => option.chance), 100 - targetChance);
  let otherIndex = 0;
  return options.map((option) => {
    if (option.id === optionId) return { ...option, chance: targetChance };
    const chance = otherChances[otherIndex] || 0;
    otherIndex += 1;
    return { ...option, chance };
  });
}

function formatPostCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'count unavailable';
  return `${new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)} posts`;
}

function minimumOptionPostCount(option: WildcardOption): number | null {
  const counts = option.tags
    .filter((tag) => !isNaturalLanguageEntry(tag))
    .map((tag) => tag.postCount)
    .filter((count): count is number => count !== null);
  return counts.length > 0 ? Math.min(...counts) : null;
}

async function inspectTags(raw: string): Promise<WildcardTag[]> {
  const tags = raw.split(/[\n,]+/).map((tag) => tag.trim()).filter(Boolean);
  if (tags.length === 0) throw new Error('Enter at least one tag.');
  const response = await fetch('/api/data-forge/wildcard-generator/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error || 'Could not inspect tags.'));
  return Array.isArray(payload?.values) ? payload.values : [];
}

function TagComposer({
  placeholder,
  buttonLabel,
  onAdd,
  disabled = false,
}: {
  placeholder: string;
  buttonLabel: string;
  onAdd: (tags: WildcardTag[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<WildcardTag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const requestRevision = React.useRef(0);

  React.useEffect(() => {
    const revision = ++requestRevision.current;
    const token = draft.split(',').at(-1)?.trim() || '';
    if (token.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/data-forge/wildcard-generator/tags?${new URLSearchParams({ query: token, limit: '12' })}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (revision !== requestRevision.current) return;
        setSuggestions(response.ok && Array.isArray(payload?.values) ? payload.values : []);
      } catch {
        if (revision === requestRevision.current) setSuggestions([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const addDraft = async () => {
    if (!draft.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const tags = await inspectTags(draft);
      onAdd(tags);
      setDraft('');
      setSuggestions([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not add tags.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={draft}
            disabled={disabled || loading}
            onChange={(event) => { setDraft(event.target.value); setError(''); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addDraft();
              }
            }}
            placeholder={placeholder}
            className="settings-input h-9 !py-1.5 pl-8 text-xs"
          />
        </div>
        <button
          type="button"
          disabled={disabled || loading || !draft.trim()}
          onClick={() => void addDraft()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-100 disabled:opacity-35"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {buttonLabel}
        </button>
      </div>
      {error ? <div className="mt-1 text-[10px] text-red-300">{error}</div> : null}
      {suggestions.length > 0 ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.3rem)] z-30 max-h-60 overflow-y-auto rounded-md border border-white/15 bg-[#090b10] p-1 shadow-2xl shadow-black/70 custom-scrollbar">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.tag}
              type="button"
              onClick={() => {
                onAdd([suggestion]);
                setDraft('');
                setSuggestions([]);
              }}
              className="flex min-h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-300 hover:bg-cyan-500/10 hover:text-cyan-100"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{suggestion.tag}</span>
              <span className="shrink-0 text-[9px] uppercase text-zinc-600">{CATEGORY_LABELS[suggestion.category] || `Category ${suggestion.category}`}</span>
              <span className="w-20 shrink-0 text-right font-mono text-[10px] text-cyan-200/80">{formatPostCount(suggestion.postCount)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TagList({ tags, onRemove, emptyLabel }: { tags: WildcardTag[]; onRemove: (tag: string) => void; emptyLabel: string }) {
  if (tags.length === 0) return <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-[10px] text-zinc-600">{emptyLabel}</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag.tag} className="inline-flex min-h-7 items-center gap-1 rounded-sm border border-white/10 bg-black/25 pl-2 text-[10px] text-zinc-300">
          <span className="font-mono">{tag.tag}</span>
          <span className={`text-[8px] ${isNaturalLanguageEntry(tag) || isFreeformEntry(tag) ? 'text-fuchsia-200/70' : 'text-cyan-200/70'}`}>
            {isFreeformEntry(tag) ? 'Freeform' : isNaturalLanguageEntry(tag) ? 'Natural' : formatPostCount(tag.postCount)}
          </span>
          <button type="button" onClick={() => onRemove(tag.tag)} className="inline-flex h-6 w-6 items-center justify-center text-zinc-600 hover:text-red-200" title={`Remove ${tag.tag}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
    </div>
  );
}

function FreeformComposer({
  placeholder,
  buttonLabel,
  onAdd,
  disabled = false,
}: {
  placeholder: string;
  buttonLabel: string;
  onAdd: (entry: WildcardTag) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState('');

  const addDraft = () => {
    const entry = createFreeformEntry(draft);
    if (!entry || disabled) return;
    onAdd(entry);
    setDraft('');
  };

  return (
    <div className="flex gap-1.5">
      <div className="relative min-w-0 flex-1">
        <FileText className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fuchsia-300/60" />
        <input
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addDraft();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="settings-input h-9 !py-1.5 pl-8 text-xs"
        />
      </div>
      <button
        type="button"
        disabled={disabled || !draft.trim()}
        onClick={addDraft}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-fuchsia-300/30 bg-fuchsia-500/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-fuchsia-100 disabled:opacity-35"
      >
        <Plus className="h-3.5 w-3.5" /> {buttonLabel}
      </button>
    </div>
  );
}

function WildcardTagCatalogDrawer({
  groups,
  onAddFixed,
  onAddExcluded,
  onAddGroupBundle,
}: {
  groups: WildcardGroup[];
  onAddFixed: (tags: WildcardTag[]) => void;
  onAddExcluded: (tags: WildcardTag[]) => void;
  onAddGroupBundle: (groupId: string, tags: WildcardTag[]) => void;
}) {
  const showToast = useStore((state) => state.showToast);
  const explicitCatalogEnabled = useStore((state) => state.appSettings['ui.tagCatalogExplicitEnabled'] === true);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const [open, setOpen] = React.useState(false);
  const [activeView, setActiveView] = React.useState<TagCatalogView>('catalog');
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [classifier, setClassifier] = React.useState('all');
  const [classifiers, setClassifiers] = React.useState<WildcardClassifierSummary[]>([]);
  const [classifiersLoading, setClassifiersLoading] = React.useState(false);
  const [destination, setDestination] = React.useState<TagCatalogDestination>(() => (
    groups[0] ? `group:${groups[0].id}` : 'fixed'
  ));
  const [items, setItems] = React.useState<WildcardTag[]>([]);
  const [selectedTags, setSelectedTags] = React.useState<WildcardTag[]>([]);
  const [keepSelection, setKeepSelection] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [csvLoading, setCsvLoading] = React.useState(false);
  const [csvList, setCsvList] = React.useState<{ tags: string[]; characters: string[] }>({ tags: [], characters: [] });
  const [enabledCSVs, setEnabledCSVs] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const [refreshRevision, setRefreshRevision] = React.useState(0);
  const catalogSettingsRef = React.useRef<Record<string, unknown>>({});

  const loadCsvSources = React.useCallback(async (showFeedback = false, rebuildIndex = false) => {
    setCsvLoading(true);
    try {
      if (rebuildIndex) {
        const indexResponse = await fetch('/api/powerprompter/index', { method: 'POST' });
        if (!indexResponse.ok) throw new Error('Could not rebuild the CSV search index.');
      }
      const [listResponse, settingsResponse] = await Promise.all([
        fetch('/api/powerprompter/csv/list', { cache: 'no-store' }),
        fetch('/api/powerprompter/settings', { cache: 'no-store' }),
      ]);
      if (!listResponse.ok) throw new Error('Could not load the CSV library.');
      if (!settingsResponse.ok) throw new Error('Could not load CSV source settings.');
      const [listPayload, settingsPayload] = await Promise.all([listResponse.json(), settingsResponse.json()]);
      setCsvList({
        tags: Array.isArray(listPayload?.tags) ? listPayload.tags : [],
        characters: Array.isArray(listPayload?.characters) ? listPayload.characters : [],
      });
      catalogSettingsRef.current = settingsPayload && typeof settingsPayload === 'object' ? settingsPayload : {};
      setEnabledCSVs(Array.isArray(settingsPayload?.enabledCSVs)
        ? settingsPayload.enabledCSVs.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
        : []);
      if (showFeedback) showToast('CSV sources and search index refreshed.', 'success');
    } catch (nextError) {
      if (showFeedback) showToast(nextError instanceof Error ? nextError.message : 'Could not refresh CSV sources.', 'error');
    } finally {
      setCsvLoading(false);
    }
  }, [showToast]);

  const toggleCsvSource = React.useCallback(async (type: 'tag' | 'character', fileName: string) => {
    const sourceId = getCsvSourceId(type, fileName);
    const aliases = new Set([sourceId, fileName]);
    const wasEnabled = enabledCSVs.some((entry) => aliases.has(entry));
    const nextEnabled = wasEnabled
      ? enabledCSVs.filter((entry) => !aliases.has(entry))
      : [...enabledCSVs.filter((entry) => entry !== fileName), sourceId];
    const previousSettings = catalogSettingsRef.current;
    const nextSettings = { ...previousSettings, enabledCSVs: nextEnabled, editorMode: 'cards' };
    setEnabledCSVs(nextEnabled);
    catalogSettingsRef.current = nextSettings;
    try {
      const response = await fetch('/api/powerprompter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      });
      if (!response.ok) throw new Error('Could not save the CSV source selection.');
      try {
        const channel = new BroadcastChannel('umbra-powerprompter-settings-sync');
        channel.postMessage({ settings: nextSettings });
        channel.close();
      } catch {
        // BroadcastChannel may be unavailable in an embedded browser.
      }
    } catch (nextError) {
      catalogSettingsRef.current = previousSettings;
      setEnabledCSVs(Array.isArray(previousSettings.enabledCSVs)
        ? previousSettings.enabledCSVs.map((entry) => String(entry || '').trim()).filter(Boolean)
        : []);
      showToast(nextError instanceof Error ? nextError.message : 'Could not save the CSV source selection.', 'error');
    }
  }, [enabledCSVs, showToast]);

  React.useEffect(() => {
    if (!open) return;
    void loadCsvSources();
  }, [loadCsvSources, open]);

  React.useEffect(() => {
    if (!destination.startsWith('group:')) return;
    const groupId = destination.slice('group:'.length);
    if (groups.some((group) => group.id === groupId)) return;
    setDestination(groups[0] ? `group:${groups[0].id}` : 'fixed');
  }, [destination, groups]);

  React.useEffect(() => {
    if (!open || activeView !== 'catalog' || enabledCSVs.length === 0) {
      setClassifiers([]);
      setClassifier('all');
      return undefined;
    }
    const controller = new AbortController();
    setClassifiersLoading(true);
    void fetch(`/api/powerprompter/classifiers?${new URLSearchParams({
      csvs: enabledCSVs.join(','),
      includeExplicit: explicitCatalogEnabled ? '1' : '0',
    })}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Could not load tag classifiers.'));
        const values = Array.isArray(payload?.values) ? payload.values : [];
        setClassifiers(values);
        setClassifier((current) => current === 'all' || values.some((entry: WildcardClassifierSummary) => entry.id === current) ? current : 'all');
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        setClassifiers([]);
        showToast(nextError instanceof Error ? nextError.message : 'Could not load tag classifiers.', 'error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setClassifiersLoading(false);
      });
    return () => controller.abort();
  }, [activeView, enabledCSVs, explicitCatalogEnabled, open, refreshRevision, showToast]);

  React.useEffect(() => {
    if (!open || activeView !== 'catalog' || enabledCSVs.length === 0) {
      setItems([]);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          limit: '120',
          page: '0',
          browse: '1',
          csvs: enabledCSVs.join(','),
        });
        if (category !== 'all') params.set('category', category);
        if (classifier !== 'all') params.set('classifier', classifier);
        params.set('includeExplicit', explicitCatalogEnabled ? '1' : '0');
        const response = await fetch(`/api/powerprompter/search?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Could not load the tag catalog.'));
        const nextItems = (Array.isArray(payload?.results) ? payload.results : [])
          .map((item: PowerPrompterCatalogItem) => mapPowerPrompterCatalogItem(item))
          .filter((item: WildcardTag | null): item is WildcardTag => Boolean(item));
        setItems(nextItems);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(nextError instanceof Error ? nextError.message : 'Could not load the tag catalog.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeView, category, classifier, enabledCSVs, explicitCatalogEnabled, open, query, refreshRevision]);

  const classifierLabels = React.useMemo(
    () => new Map(classifiers.map((entry) => [entry.id, entry.label])),
    [classifiers],
  );

  const selectedKeys = React.useMemo(
    () => new Set(selectedTags.map((tag) => tag.tag.toLowerCase())),
    [selectedTags],
  );

  const toggleTag = (tag: WildcardTag) => {
    const key = tag.tag.toLowerCase();
    setSelectedTags((current) => current.some((entry) => entry.tag.toLowerCase() === key)
      ? current.filter((entry) => entry.tag.toLowerCase() !== key)
      : [...current, tag]);
  };

  const addSelected = () => {
    if (selectedTags.length === 0) return;
    let destinationLabel = 'Fixed Tags';
    if (destination === 'fixed') onAddFixed(selectedTags);
    else if (destination === 'excluded') {
      destinationLabel = 'Excluded Tags';
      onAddExcluded(selectedTags);
    } else {
      const groupId = destination.slice('group:'.length);
      const group = groups.find((entry) => entry.id === groupId);
      destinationLabel = group?.name || 'Group';
      onAddGroupBundle(groupId, selectedTags);
    }
    showToast(
      `Added ${selectedTags.length} tag${selectedTags.length === 1 ? '' : 's'} to ${destinationLabel}${keepSelection ? '; selection kept' : ''}.`,
      'success',
    );
    if (!keepSelection) setSelectedTags([]);
  };

  if (!open) {
    return (
      <button
        type="button"
        data-umbra-wildcard-tag-drawer-trigger
        onClick={() => setOpen(true)}
        className="absolute bottom-2 left-1/2 z-50 inline-flex h-9 -translate-x-1/2 items-center gap-2 rounded-md border border-cyan-300/30 px-4 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-[0_8px_30px_rgba(0,0,0,0.55)] hover:border-cyan-200/50"
        style={{
          backgroundColor: 'var(--umbra-bg, #09090b)',
          backgroundImage: 'linear-gradient(var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)), var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)))',
        }}
      >
        <Tags className="h-3.5 w-3.5" /> Tag Catalog <ChevronUp className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <section
      data-umbra-wildcard-tag-drawer
      className="absolute inset-x-0 bottom-0 z-50 isolate flex max-h-[78dvh] flex-col border-t border-cyan-300/25 shadow-[0_-20px_60px_rgba(0,0,0,0.78)]"
      style={{
        height: 'min(38rem, 78dvh)',
        backgroundColor: 'var(--umbra-bg, #09090b)',
        backgroundImage: 'linear-gradient(var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)), var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)))',
      }}
    >
      <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tags className="h-4 w-4 shrink-0 text-cyan-200" />
          <div className="min-w-0">
            <h2 className="truncate text-[10px] font-black uppercase tracking-[0.15em] text-zinc-100">Danbooru Tag Catalog</h2>
            <div className="font-mono text-[9px] text-zinc-600">
              {loading ? 'Loading...' : `${items.length} shown`} · {selectedTags.length} selected · {enabledCSVs.length} CSV
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setRefreshRevision((value) => value + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100" title="Refresh tag catalog"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400 hover:text-zinc-100"><ChevronDown className="h-3.5 w-3.5" /> Close</button>
      </header>

      <div className="grid grid-cols-2 gap-1 border-b border-white/[0.08] p-2">
        <button
          type="button"
          aria-pressed={activeView === 'catalog'}
          onClick={() => setActiveView('catalog')}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${activeView === 'catalog' ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
        >
          <Tags className="h-3 w-3" /> Catalog
        </button>
        <button
          type="button"
          aria-pressed={activeView === 'sources'}
          onClick={() => setActiveView('sources')}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${activeView === 'sources' ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
        >
          <DatabaseZap className="h-3 w-3" /> Sources <span className="font-mono opacity-60">{enabledCSVs.length}</span>
        </button>
      </div>

      {activeView === 'catalog' ? <>
      <div className="border-b border-white/[0.08] px-3 py-2.5 sm:px-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,17rem)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tags" aria-label="Search Danbooru tag catalog" className="settings-input h-9 !py-1.5 pl-8 text-xs" />
          </div>
          <UmbraSelectControl
            value={destination}
            onChange={(event) => setDestination(event.target.value as TagCatalogDestination)}
            aria-label="Tag destination"
            menuTitle="Add Tags To"
            className="settings-input h-9 !py-1.5 text-xs"
          >
            <option value="fixed">Fixed Tags</option>
            <option value="excluded">Excluded Tags</option>
            {groups.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.name || 'Untitled Group'} Bundle</option>)}
          </UmbraSelectControl>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={keepSelection}
              onClick={() => setKeepSelection((current) => !current)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] transition ${keepSelection ? 'border-fuchsia-300/35 bg-fuchsia-500/10 text-fuchsia-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200'}`}
              title="Keep selected tags after adding so you can make a similar line"
            >
              <Check className={`h-3 w-3 ${keepSelection ? 'opacity-100' : 'opacity-35'}`} /> Keep Selection
            </button>
            <button type="button" disabled={selectedTags.length === 0} onClick={() => setSelectedTags([])} className="h-9 rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-zinc-500 hover:text-zinc-200 disabled:opacity-30">Clear</button>
            <button type="button" disabled={selectedTags.length === 0} onClick={addSelected} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-3 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-30"><Plus className="h-3.5 w-3.5" /> Add Selected</button>
          </div>
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
          {TAG_CATALOG_CATEGORIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={category === entry.value}
              onClick={() => {
                setCategory(entry.value);
                if (entry.value === '1' || entry.value === '3' || entry.value === '4') setClassifier('all');
              }}
              className={`h-7 shrink-0 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.09em] ${category === entry.value ? 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar" data-umbra-wildcard-classifier-filters>
          <span className="mr-1 shrink-0 text-[8px] font-black uppercase tracking-[0.11em] text-zinc-600">Classifiers</span>
          <button
            type="button"
            aria-pressed={classifier === 'all'}
            onClick={() => setClassifier('all')}
            className={`h-7 shrink-0 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${classifier === 'all' ? 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
          >
            All
          </button>
          {classifiers.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={classifier === entry.id}
              data-umbra-wildcard-classifier={entry.id}
              onClick={() => {
                setClassifier(entry.id);
                if (category === '1' || category === '3' || category === '4') setCategory('all');
              }}
              title={entry.description}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${classifier === entry.id
                ? entry.explicit ? 'border-red-300/40 bg-red-500/12 text-red-100' : 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100'
                : entry.explicit ? 'border-red-300/15 text-red-300/55 hover:text-red-200' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
            >
              {entry.label}
              <span className="font-mono text-[8px] opacity-60">{new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(entry.count)}</span>
            </button>
          ))}
          {classifiersLoading ? <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin text-zinc-600" /> : null}
        </div>

        <div className={`mt-2 flex min-h-8 items-center justify-between gap-2 rounded-sm border px-2.5 ${explicitCatalogEnabled ? 'border-red-300/20 bg-red-500/[0.05]' : 'border-white/[0.08] bg-black/20'}`}>
          <span className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.09em] ${explicitCatalogEnabled ? 'text-red-200/80' : 'text-zinc-600'}`}>
            <ShieldCheck className="h-3 w-3" /> Explicit classifiers {explicitCatalogEnabled ? 'visible' : 'hidden'}
          </span>
          <button
            type="button"
            aria-pressed={explicitCatalogEnabled}
            data-umbra-wildcard-explicit-toggle
            onClick={() => setAppSetting('ui.tagCatalogExplicitEnabled', !explicitCatalogEnabled)}
            className={`h-6 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${explicitCatalogEnabled ? 'border-red-300/20 text-red-200/70 hover:text-red-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200'}`}
          >
            Explicit {explicitCatalogEnabled ? 'On' : 'Off'}
          </button>
        </div>

        {selectedTags.length > 0 ? (
          <div className="custom-scrollbar mt-2 flex max-h-16 flex-wrap gap-1 overflow-y-auto rounded-sm border border-white/[0.08] bg-black/20 p-1.5">
            {selectedTags.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => toggleTag(tag)} className="inline-flex h-6 items-center gap-1 rounded-sm border border-cyan-300/20 bg-cyan-500/[0.08] px-1.5 font-mono text-[9px] text-cyan-100" title={`Remove ${tag.tag} from selection`}>
                {tag.tag}<X className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div data-umbra-wildcard-tag-catalog-list className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {error ? (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-red-300/15 bg-red-500/[0.04] px-4 text-center text-[10px] text-red-200/80">{error}</div>
        ) : loading && items.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : enabledCSVs.length === 0 ? (
          <button type="button" onClick={() => setActiveView('sources')} className="flex min-h-28 w-full items-center justify-center rounded-md border border-dashed border-cyan-300/15 bg-cyan-500/[0.025] px-4 text-center text-[10px] text-cyan-100/65 hover:border-cyan-300/30 hover:text-cyan-100">
            Select at least one CSV source to browse tags.
          </button>
        ) : items.length === 0 ? (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-white/10 text-[10px] text-zinc-600">No matching tags in the selected CSV sources.</div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((tag) => {
              const selected = selectedKeys.has(tag.tag.toLowerCase());
              const tagClassifierLabels = (Array.isArray(tag.classifiers) ? tag.classifiers : [])
                .map((id) => classifierLabels.get(id) || id.replaceAll('_', ' '));
              return (
                <button
                  key={`${tag.catalogType || 'tag'}:${tag.catalogSource || 'catalog'}:${tag.tag}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTag(tag)}
                  className={`grid min-h-12 grid-cols-[1.2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition ${selected ? 'border-cyan-300/35 bg-cyan-500/10' : tag.explicit ? 'border-red-300/10 bg-red-500/[0.018] hover:border-red-300/20' : 'border-white/[0.08] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.035]'}`}
                >
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${selected ? 'border-cyan-200/50 bg-cyan-300/20 text-cyan-50' : 'border-white/15 text-transparent'}`}>{selected ? <Check className="h-2.5 w-2.5" /> : null}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[10px] text-zinc-200" title={tag.tag}>{tag.tag}</span>
                    <span className="mt-0.5 block truncate text-[8px] font-black uppercase tracking-[0.08em] text-zinc-600" title={tag.catalogSource || 'CSV'}>
                      {CATEGORY_LABELS[tag.category] || `Category ${tag.category}`} · {tag.catalogSource || (tag.source === 'danbooru' ? 'Live' : 'CSV')}
                    </span>
                    {tagClassifierLabels.length > 0 ? (
                      <span className={`mt-0.5 block truncate text-[8px] font-bold uppercase tracking-[0.06em] ${tag.explicit ? 'text-red-300/55' : 'text-cyan-200/45'}`} title={tagClassifierLabels.join(', ')}>
                        {tagClassifierLabels.slice(0, 3).join(' / ')}{tagClassifierLabels.length > 3 ? ` +${tagClassifierLabels.length - 3}` : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-cyan-200/75">{formatPostCount(tag.postCount)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </> : (
        <div data-umbra-wildcard-tag-csv-sources className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300">CSV Sources</div>
              <div className="mt-0.5 text-[9px] text-zinc-600">{enabledCSVs.length} enabled. This selection is shared with Power Prompter and Umbra UI.</div>
            </div>
            <button
              type="button"
              disabled={csvLoading}
              onClick={() => { void loadCsvSources(true, true); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-cyan-300/20 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-cyan-100 disabled:opacity-40"
              title="Rescan CSV files and rebuild the shared tag index"
            >
              <RefreshCw className={`h-3 w-3 ${csvLoading ? 'animate-spin' : ''}`} /> Refresh Index
            </button>
          </div>

          {csvLoading && csvList.tags.length === 0 && csvList.characters.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : csvList.tags.length === 0 && csvList.characters.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-[10px] text-zinc-600">No CSV files were found in the Power Prompter CSV library.</div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {([
                ['tag', 'Tag CSVs', csvList.tags],
                ['character', 'Character CSVs', csvList.characters],
              ] as const).map(([type, label, files]) => (
                <section key={type} className="min-w-0 rounded-md border border-white/[0.08] bg-white/[0.018] p-2.5">
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <FileText className="h-3.5 w-3.5 text-cyan-200" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300">{label}</h3>
                    <span className="font-mono text-[8px] text-zinc-600">{files.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {files.length === 0 ? <div className="rounded-sm border border-dashed border-white/[0.08] px-3 py-4 text-center text-[9px] text-zinc-700">No {label.toLowerCase()} found.</div> : files.map((fileName) => {
                      const sourceId = getCsvSourceId(type, fileName);
                      const enabled = isCsvSourceEnabled(enabledCSVs, sourceId, fileName);
                      return (
                        <button
                          key={sourceId}
                          type="button"
                          aria-pressed={enabled}
                          data-umbra-wildcard-csv-source={sourceId}
                          onClick={() => { void toggleCsvSource(type, fileName); }}
                          className={`grid min-h-10 w-full grid-cols-[1.2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition ${enabled ? 'border-cyan-300/30 bg-cyan-500/[0.08] text-cyan-50' : 'border-white/[0.08] bg-black/20 text-zinc-500 hover:border-white/15 hover:text-zinc-200'}`}
                        >
                          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${enabled ? 'border-cyan-200/50 bg-cyan-300/20 text-cyan-50' : 'border-white/15 text-transparent'}`}>{enabled ? <Check className="h-2.5 w-2.5" /> : null}</span>
                          <span className="min-w-0 truncate font-mono text-[10px]" title={fileName}>{fileName}</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.08em] opacity-55">{enabled ? 'Enabled' : 'Off'}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function EditableWildcardOption({
  option,
  optionIndex,
  groupEnabled,
  optionCount,
  onUpdate,
  onRemove,
  onChanceChange,
}: {
  option: WildcardOption;
  optionIndex: number;
  groupEnabled: boolean;
  optionCount: number;
  onUpdate: (option: WildcardOption) => void;
  onRemove: () => void;
  onChanceChange: (chance: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(() => optionText(option));
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (editing) return;
    setDraft(optionText(option));
  }, [editing, option]);

  const cancelEdit = () => {
    setDraft(optionText(option));
    setError('');
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft.trim()) return;
    setError('');
    const entry = createFreeformEntry(draft);
    if (!entry) {
      setError('Enter content for this wildcard line.');
      return;
    }
    onUpdate({ ...option, tags: [entry] });
    setEditing(false);
  };

  const freeform = option.tags.length === 1 && (isFreeformEntry(option.tags[0]) || isNaturalLanguageEntry(option.tags[0]));
  const label = optionText(option);
  return (
    <div className="rounded-sm border border-white/[0.08] bg-black/25 px-2 py-2">
      <div className="flex min-h-7 items-center gap-2">
        <span className="w-6 shrink-0 font-mono text-[9px] text-zinc-700">{String(optionIndex + 1).padStart(2, '0')}</span>
        <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] ${freeform ? 'border-fuchsia-300/20 bg-fuchsia-500/[0.08] text-fuchsia-200' : 'border-cyan-300/20 bg-cyan-500/[0.08] text-cyan-200'}`}>
          {freeform ? 'Freeform' : 'Catalog'}
        </span>
        <span className={`min-w-0 flex-1 truncate text-[11px] text-zinc-300 ${freeform ? 'font-sans' : 'font-mono'}`} title={label}>{label}</span>
        {!freeform ? <span className="shrink-0 text-[9px] text-cyan-200/70">min {formatPostCount(minimumOptionPostCount(option))}</span> : null}
        <button type="button" onClick={() => setEditing(true)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-zinc-500 hover:text-cyan-100" title={`Edit line ${optionIndex + 1}`} aria-label={`Edit wildcard line ${optionIndex + 1}`}><Pencil className="h-3 w-3" /></button>
        <button type="button" onClick={onRemove} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-zinc-600 hover:text-red-200" title="Remove option"><X className="h-3 w-3" /></button>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2 rounded-sm border border-white/[0.08] bg-black/35 p-2">
          <textarea
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setError(''); }}
            rows={3}
            aria-label={`Wildcard line ${optionIndex + 1} content`}
            placeholder="Type tags, natural language, or mix both in the same line."
            className="settings-input min-h-20 resize-y !py-2 text-xs leading-5"
          />
          <div className="text-[9px] leading-4 text-zinc-600">Type anything. Exact catalog tags receive post-count data automatically; all other text is preserved.</div>
          {error ? <div className="text-[10px] text-red-300">{error}</div> : null}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={cancelEdit} className="inline-flex h-8 items-center gap-1 rounded-sm border border-white/10 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-zinc-400"><X className="h-3 w-3" /> Cancel</button>
            <button type="button" disabled={!draft.trim()} onClick={saveEdit} className="inline-flex h-8 items-center gap-1 rounded-sm border border-emerald-300/25 bg-emerald-500/10 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-35"><Check className="h-3 w-3" /> Save Line</button>
          </div>
        </div>
      ) : null}

      <div className="mt-1.5 grid grid-cols-[3.6rem_minmax(5rem,1fr)_3rem] items-center gap-2 pl-8">
        <span className="text-[8px] font-black uppercase tracking-[0.1em] text-zinc-600">Chance</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={option.chance}
          disabled={optionCount === 1 || !groupEnabled}
          onChange={(event) => onChanceChange(Number(event.target.value))}
          aria-label={`Chance for ${label}`}
          className="h-1.5 w-full cursor-pointer disabled:cursor-default disabled:opacity-50"
          style={{ accentColor: 'var(--umbra-accent)' }}
        />
        <span className="rounded-sm border border-cyan-300/15 bg-cyan-500/[0.07] px-1.5 py-1 text-center font-mono text-[10px] text-cyan-100">{option.chance}%</span>
      </div>
    </div>
  );
}

function GroupPanel({
  group,
  index,
  onChange,
  onRemove,
}: {
  group: WildcardGroup;
  index: number;
  onChange: (group: WildcardGroup) => void;
  onRemove: () => void;
}) {
  const addOption = (tags: WildcardTag[]) => {
    if (tags.length === 0) return;
    const key = tags.map((tag) => tag.tag.toLowerCase()).join('|');
    if (group.options.some((option) => option.tags.map((tag) => tag.tag.toLowerCase()).join('|') === key)) return;
    onChange({
      ...group,
      options: appendOptionWithBalancedChance(group.options, { id: createId('option'), tags }),
    });
  };

  const updateOption = (nextOption: WildcardOption) => {
    onChange({
      ...group,
      options: group.options.map((option) => option.id === nextOption.id ? nextOption : option),
    });
  };

  return (
    <section className={`rounded-md border p-3 transition ${group.enabled ? 'border-white/12 bg-white/[0.025]' : 'border-white/[0.06] bg-black/20 opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-cyan-300/20 bg-cyan-500/10 px-1.5 font-mono text-[10px] text-cyan-100">{index + 1}</span>
        <input
          value={group.name}
          onChange={(event) => onChange({ ...group, name: event.target.value })}
          aria-label={`Group ${index + 1} name`}
          className="settings-input h-8 min-w-36 flex-1 !py-1 text-xs font-bold"
        />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-zinc-400">
          <input type="checkbox" checked={group.required} onChange={(event) => onChange({ ...group, required: event.target.checked })} />
          Required
        </label>
        {group.options.length > 1 ? (
          <button
            type="button"
            onClick={() => onChange({ ...group, options: evenlyDistributeOptions(group.options) })}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-cyan-300/20 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100/80 hover:border-cyan-300/40 hover:text-cyan-50"
          >
            <RefreshCw className="h-3 w-3" /> Even Split
          </button>
        ) : null}
        <button type="button" onClick={() => onChange({ ...group, enabled: !group.enabled })} className={`h-8 rounded-sm border px-2 text-[9px] font-black uppercase tracking-[0.08em] ${group.enabled ? 'border-emerald-300/25 text-emerald-200' : 'border-white/10 text-zinc-600'}`}>{group.enabled ? 'Enabled' : 'Disabled'}</button>
        <button type="button" onClick={onRemove} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-red-300/15 text-red-200/60 hover:text-red-100" title={`Remove ${group.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <div className="mt-3 rounded-sm border border-white/[0.08] bg-black/20 p-2.5">
        <FreeformComposer
          placeholder="Type tags, natural language, or mix both"
          buttonLabel="Add line"
          onAdd={(entry) => addOption([entry])}
          disabled={!group.enabled}
        />
        <div className="mt-1.5 text-[9px] leading-4 text-zinc-600">No content mode required. Recognized tags are enriched automatically; other wording remains untouched.</div>
      </div>

      <div className="mt-3 space-y-1.5">
        {group.options.map((option, optionIndex) => (
          <EditableWildcardOption
            key={option.id}
            option={option}
            optionIndex={optionIndex}
            groupEnabled={group.enabled}
            optionCount={group.options.length}
            onUpdate={updateOption}
            onRemove={() => onChange({ ...group, options: removeOptionAndRebalance(group.options, option.id) })}
            onChanceChange={(chance) => onChange({
              ...group,
              options: rebalanceOptionChance(group.options, option.id, chance),
            })}
          />
        ))}
        {group.options.length === 0 ? <div className="rounded-sm border border-dashed border-white/10 px-3 py-3 text-center text-[10px] text-zinc-600">No options in this group.</div> : null}
      </div>
    </section>
  );
}

export function WildcardGeneratorTab() {
  const showToast = useStore((state) => state.showToast);
  const [name, setName] = React.useState('');
  const [folder, setFolder] = React.useState('Generated');
  const [count, setCount] = React.useState(50);
  const [seed, setSeed] = React.useState(1);
  const [maxTagsPerLine, setMaxTagsPerLine] = React.useState(12);
  const [prioritizePostCounts, setPrioritizePostCounts] = React.useState(true);
  const [baseTags, setBaseTags] = React.useState<WildcardTag[]>([]);
  const [forbiddenTags, setForbiddenTags] = React.useState<WildcardTag[]>([]);
  const [groups, setGroups] = React.useState<WildcardGroup[]>([createGroup('Action'), createGroup('Position')]);
  const [result, setResult] = React.useState<GeneratedResult | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [editingWildcardPath, setEditingWildcardPath] = React.useState<string | null>(null);

  const appendUniqueTags = (current: WildcardTag[], incoming: WildcardTag[]) => {
    const existing = new Set(current.map((tag) => tag.tag.toLowerCase()));
    return [...current, ...incoming.filter((tag) => !existing.has(tag.tag.toLowerCase()))];
  };

  const addCatalogBundleToGroup = (groupId: string, tags: WildcardTag[]) => {
    if (tags.length === 0) return;
    const bundleKey = tags.map((tag) => tag.tag.toLowerCase()).join('|');
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const alreadyExists = group.options.some((option) => option.tags.map((tag) => tag.tag.toLowerCase()).join('|') === bundleKey);
      if (alreadyExists) return group;
      return {
        ...group,
        options: appendOptionWithBalancedChance(group.options, { id: createId('option'), tags }),
      };
    }));
  };

  const requestPayload = React.useMemo(() => ({
    baseTags,
    groups,
    forbiddenTags: forbiddenTags.map((tag) => tag.tag),
    count,
    seed,
    maxTagsPerLine,
    prioritizePostCounts,
  }), [baseTags, count, forbiddenTags, groups, maxTagsPerLine, prioritizePostCounts, seed]);

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/data-forge/wildcard-generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Wildcard generation failed.'));
      setResult(payload);
      showToast(`Generated ${payload.generatedCount} unique wildcard value${payload.generatedCount === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Wildcard generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!result?.values.length) {
      showToast('Generate a wildcard preview first.', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Name the wildcard before saving.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/powerprompter/wildcards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingWildcardPath ? { path: editingWildcardPath } : {}),
          name,
          folder,
          values: result.values,
          choices: result.rows.map((row) => ({ value: row.value, chance: row.chance })),
          generatorDefinition: {
            version: 3,
            count,
            seed,
            maxTagsPerLine,
            prioritizePostCounts,
            baseTags,
            forbiddenTags,
            groups,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not save wildcard.'));
      const normalizedName = String(name).trim().toLowerCase().replace(/\.txt$/i, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      setEditingWildcardPath(folder ? `${folder}/${normalizedName}` : normalizedName);
      showToast(`__${normalizedName}__ saved to Power Prompter.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save wildcard.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 0xffffffff));
  const copyValues = async () => {
    if (!result?.values.length) return;
    await navigator.clipboard?.writeText(result.values.join('\n')).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const editStructuredWildcard = (wildcard: WildcardLibraryEntry) => {
    const definition = normalizeStoredWildcardDefinition(wildcard.generatorDefinition);
    if (!definition) {
      showToast('This wildcard does not contain a valid Umbra Combination Groups recipe.', 'error');
      return;
    }
    setName(wildcard.name);
    setFolder(wildcard.folder);
    setCount(definition.count);
    setSeed(definition.seed);
    setMaxTagsPerLine(definition.maxTagsPerLine);
    setPrioritizePostCounts(definition.prioritizePostCounts);
    setBaseTags(definition.baseTags);
    setForbiddenTags(definition.forbiddenTags);
    setGroups(definition.groups);
    setResult(null);
    setEditingWildcardPath(wildcard.path);
    setLibraryOpen(false);
    showToast(`__${wildcard.name}__ loaded into Combination Groups.`, 'success');
  };

  if (libraryOpen) {
    return (
      <div data-umbra-data-forge-wildcard-library="" className="h-full min-h-0 bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
        <WildcardLibraryManager
          open
          activeSaveFolder={folder}
          onClose={() => setLibraryOpen(false)}
          onChooseSaveFolder={(nextFolder) => {
            setFolder(nextFolder);
            setLibraryOpen(false);
          }}
          onEditStructured={editStructuredWildcard}
        />
      </div>
    );
  }

  return (
    <div data-umbra-data-forge-wildcard-generator className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--umbra-bg)] text-[var(--umbra-text)] lg:flex-row lg:overflow-hidden" style={{ fontFamily: 'var(--font-family)' }}>
      <aside data-umbra-wildcard-generator-config className="glass-panel custom-scrollbar w-full shrink-0 overflow-visible rounded-none border-x-0 border-t-0 p-4 lg:w-[21rem] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-cyan-200" />
          <h2 className="min-w-0 flex-1 text-xs font-black uppercase tracking-[0.18em] text-zinc-100">Wildcard Generator</h2>
          {editingWildcardPath ? <span className="max-w-32 truncate rounded-sm border border-emerald-300/20 bg-emerald-500/[0.08] px-1.5 py-1 text-[7px] font-black uppercase tracking-[0.08em] text-emerald-200" title={`Editing ${editingWildcardPath}`}>Editing Umbra</span> : null}
          <button type="button" onClick={() => setLibraryOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-fuchsia-300/25 bg-fuchsia-500/[0.08] px-2 text-[8px] font-black uppercase tracking-[0.1em] text-fuchsia-100 hover:border-fuchsia-200/50" title="Browse and edit existing wildcards"><FolderTree className="h-3 w-3" /> Library</button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Wildcard Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="focused-poses" className="settings-input h-9 !py-1.5 text-xs" />
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Folder</span>
              <button type="button" onClick={() => setLibraryOpen(true)} className="flex h-9 w-full min-w-0 items-center gap-2 rounded-sm border border-white/10 bg-black/35 px-2.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" title="Choose a wildcard save folder"><FolderTree className="h-3.5 w-3.5 shrink-0 text-cyan-200" /><span className="min-w-0 flex-1 truncate">{folder || 'Root'}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" /></button>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Lines</span>
              <input type="number" min={1} max={1000} value={count} onChange={(event) => setCount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} className="settings-input h-9 !py-1.5 text-xs" />
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Max Parts</span>
              <input type="number" min={2} max={40} value={maxTagsPerLine} onChange={(event) => setMaxTagsPerLine(Math.max(2, Math.min(40, Number(event.target.value) || 2)))} className="settings-input h-9 !py-1.5 text-xs" />
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Seed</span>
              <div className="flex">
                <input type="number" min={0} max={4294967295} value={seed} onChange={(event) => setSeed(Math.max(0, Math.min(0xffffffff, Number(event.target.value) || 0)))} className="settings-input h-9 min-w-0 rounded-r-none !py-1.5 text-xs" />
                <button type="button" onClick={randomizeSeed} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-white/10 text-zinc-400 hover:text-cyan-100" title="Randomize seed"><Dices className="h-3.5 w-3.5" /></button>
              </div>
            </label>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300">Post-count priority</span>
              <span className="mt-0.5 block text-[9px] text-zinc-600">Favor established tags while preserving variety.</span>
            </span>
            <input type="checkbox" checked={prioritizePostCounts} onChange={(event) => setPrioritizePostCounts(event.target.checked)} />
          </label>

          <section>
            <h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-200">Fixed Content</h3>
            <FreeformComposer placeholder="Tags or natural language applied to every line" buttonLabel="Add" onAdd={(entry) => setBaseTags((current) => appendUniqueTags(current, [entry]))} />
            <div className="mt-2"><TagList tags={baseTags} emptyLabel="No fixed content." onRemove={(tag) => setBaseTags((current) => current.filter((entry) => entry.tag !== tag))} /></div>
          </section>

          <section>
            <h3 className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-red-200">Excluded Tags</h3>
            <TagComposer placeholder="Reject combinations containing these" buttonLabel="Exclude" onAdd={(tags) => setForbiddenTags((current) => appendUniqueTags(current, tags))} />
            <div className="mt-2"><TagList tags={forbiddenTags} emptyLabel="No exclusions." onRemove={(tag) => setForbiddenTags((current) => current.filter((entry) => entry.tag !== tag))} /></div>
          </section>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-500/12 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/18 disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate Preview
          </button>
        </div>
      </aside>

      <main data-umbra-wildcard-generator-main className="min-h-0 min-w-0 flex-1 lg:overflow-y-auto custom-scrollbar">
        <div className="grid min-h-full grid-cols-1 gap-4 p-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(25rem,0.85fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-100"><Layers3 className="h-4 w-4 text-cyan-200" /> Combination Groups</h2>
                <p className="mt-1 text-[10px] text-zinc-600">Each generated line selects one bundled option from every required group.</p>
              </div>
              <button type="button" onClick={() => setGroups((current) => [...current, createGroup(`Group ${current.length + 1}`)])} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-500/10 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100"><Plus className="h-3.5 w-3.5" /> Add Group</button>
            </div>
            <div className="space-y-3">
              {groups.map((group, index) => (
                <GroupPanel
                  key={group.id}
                  group={group}
                  index={index}
                  onChange={(next) => setGroups((current) => current.map((entry) => entry.id === group.id ? next : entry))}
                  onRemove={() => setGroups((current) => current.filter((entry) => entry.id !== group.id))}
                />
              ))}
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-100"><ShieldCheck className="h-4 w-4 text-emerald-200" /> Preview Audit</h2>
                <p className="mt-1 text-[10px] text-zinc-600">Canonical output ready for Power Prompter.</p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" disabled={!result?.values.length} onClick={() => void copyValues()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 disabled:opacity-35">{copied ? <Check className="h-3.5 w-3.5 text-emerald-200" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" disabled={saving || !result?.values.length || !name.trim()} onClick={() => void save()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-500/10 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100 disabled:opacity-35">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button>
              </div>
            </div>

            {!result ? (
              <div className="flex min-h-[30rem] items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.015] text-center">
                <div>
                  <DatabaseZap className="mx-auto h-9 w-9 text-zinc-700" />
                  <div className="mt-3 text-sm font-bold text-zinc-400">No wildcard preview yet</div>
                  <div className="mt-1 text-[10px] text-zinc-600">Add options to each group, then generate.</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-white/10 bg-white/[0.025] p-2.5"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Generated</span><strong className="mt-1 block font-mono text-sm text-cyan-100">{result.generatedCount}/{result.requestedCount}</strong></div>
                  <div className="rounded-md border border-white/10 bg-white/[0.025] p-2.5"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Possible</span><strong className="mt-1 block font-mono text-sm text-zinc-200">{new Intl.NumberFormat().format(result.possibleCombinations)}</strong></div>
                  <div className="rounded-md border border-white/10 bg-white/[0.025] p-2.5"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Max Parts</span><strong className="mt-1 block font-mono text-sm text-zinc-200">{result.audit.maximumTagsPerLine}</strong></div>
                  <div className="rounded-md border border-white/10 bg-white/[0.025] p-2.5"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Unique</span><strong className={`mt-1 block font-mono text-sm ${result.audit.unique ? 'text-emerald-200' : 'text-red-200'}`}>{result.audit.unique ? 'Yes' : 'No'}</strong></div>
                </div>

                {result.warnings.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-amber-300/20 bg-amber-500/[0.06] p-2.5">
                    {result.warnings.map((warning) => <div key={warning} className="flex gap-2 text-[10px] leading-4 text-amber-100/80"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {warning}</div>)}
                  </div>
                ) : null}

                <div className="custom-scrollbar max-h-[calc(100dvh-20rem)] min-h-80 overflow-y-auto rounded-md border border-white/10 bg-black/25">
                  {result.rows.map((row, index) => (
                    <div key={`${index}-${row.value}`} className="grid grid-cols-[2rem_minmax(0,1fr)_3.2rem_5.5rem] items-start gap-2 border-b border-white/[0.06] px-2.5 py-2 last:border-b-0 odd:bg-white/[0.018]">
                      <span className="font-mono text-[9px] text-zinc-700">{String(index + 1).padStart(3, '0')}</span>
                      <span className="break-words font-mono text-[10px] leading-4 text-zinc-300">{row.value}</span>
                      <span className="rounded-sm border border-emerald-300/15 bg-emerald-500/[0.07] px-1 py-0.5 text-center font-mono text-[9px] text-emerald-100">{row.chance.toFixed(1)}%</span>
                      <span className="text-right font-mono text-[9px] text-cyan-200/70">{formatPostCount(row.minimumPostCount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <WildcardTagCatalogDrawer
        groups={groups}
        onAddFixed={(tags) => setBaseTags((current) => appendUniqueTags(current, tags))}
        onAddExcluded={(tags) => setForbiddenTags((current) => appendUniqueTags(current, tags))}
        onAddGroupBundle={addCatalogBundleToGroup}
      />
    </div>
  );
}
