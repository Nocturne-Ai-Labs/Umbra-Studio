import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  DatabaseZap,
  ExternalLink,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Tags,
  Trash2,
} from 'lucide-react';
import { useStore } from '@/store/useStore';

interface SearchResult {
  tag: string;
  category: number;
  count?: number;
  extra?: string;
  displayTag?: string;
  searchAliases?: string;
  classifiers?: string[];
  explicit?: boolean;
  source?: string;
  sourceId?: string;
  type: 'tag' | 'character';
}

interface Favorite extends SearchResult {
  addedAt: number;
}

interface ClassifierSummary {
  id: string;
  label: string;
  description: string;
  explicit: boolean;
  count: number;
}

interface RelationCorpusStatus {
  state: 'empty' | 'running' | 'paused' | 'completed' | 'failed';
  mode: 'sample' | 'all';
  targetPosts: number;
  availablePosts: number;
  indexedPosts: number;
  scannedPosts: number;
}

interface RelatedSuggestion {
  tag: string;
  cooccurrenceCount: number;
  conditionalPercent: number;
  corpusPostCount: number;
  lift: number;
  classifiers: string[];
  explicit: boolean;
}

interface RelatedResult {
  tags: string[];
  matchedPostCount: number;
  sampledPostCount: number;
  suggestions: RelatedSuggestion[];
}

interface PowerPrompterSearchPanelProps {
  onInsert: (text: string, options?: { replaceCurrentToken?: boolean; appendComma?: boolean }) => void;
  enabledCSVs: string[];
  onToggleCSV: (name: string) => void;
  onOpenSettings?: () => void;
  overlayMode?: boolean;
  menuMode?: boolean;
  drawerMode?: boolean;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}

type CatalogView = 'catalog' | 'favorites' | 'sources';

const CATEGORY_LABELS: Record<number, string> = {
  0: 'General',
  1: 'Artist',
  3: 'Copyright',
  4: 'Character',
  5: 'Meta',
};

const CATEGORIES = [
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

function cleanTag(tag: string): string {
  return String(tag ?? '')
    .replace(/_/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function buildTagInsertionText(item: SearchResult): string {
  const primary = cleanTag(item.tag);
  return item.type === 'character' && item.extra
    ? `${primary}, ${cleanTag(item.extra)}`
    : primary;
}

function getResultKey(item: SearchResult): string {
  return `${item.type}:${buildTagInsertionText(item).toLowerCase()}`;
}

function formatPostCount(value: number | undefined): string {
  if (!Number.isFinite(value)) return 'count unavailable';
  return `${new Intl.NumberFormat(undefined, {
    notation: Number(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(Number(value))} posts`;
}

export const PowerPrompterSearchPanel = React.memo(({
  onInsert,
  enabledCSVs,
  onToggleCSV,
  onOpenSettings,
  overlayMode = false,
  menuMode = false,
  drawerMode = false,
  drawerOpen,
  onDrawerOpenChange,
}: PowerPrompterSearchPanelProps) => {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const [activeView, setActiveView] = useState<CatalogView>('catalog');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [classifier, setClassifier] = useState('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedItems, setSelectedItems] = useState<SearchResult[]>([]);
  const [suggestionClassifier, setSuggestionClassifier] = useState('smart');
  const [suggestionResult, setSuggestionResult] = useState<RelatedResult | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [relationCorpusStatus, setRelationCorpusStatus] = useState<RelationCorpusStatus | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [classifiers, setClassifiers] = useState<ClassifierSummary[]>([]);
  const [csvList, setCsvList] = useState<{ tags: string[]; characters: string[] }>({ tags: [], characters: [] });
  const [loading, setLoading] = useState(false);
  const [classifiersLoading, setClassifiersLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [colors, setColors] = useState<Record<string, string>>({
    general: '#0073ff',
    artist: '#c00000',
    copyright: '#a000a0',
    character: '#00aa00',
    metadata: '#ff8a00',
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: SearchResult } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const showToast = useStore((state) => state.showToast);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const explicitCatalogEnabled = useStore((state) => state.appSettings['ui.tagCatalogExplicitEnabled'] === true);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const effectiveDrawerOpen = drawerOpen ?? internalDrawerOpen;
  const setDrawerOpen = useCallback((open: boolean) => {
    if (drawerOpen === undefined) setInternalDrawerOpen(open);
    onDrawerOpenChange?.(open);
  }, [drawerOpen, onDrawerOpenChange]);
  const suggestionSeeds = useMemo(
    () => selectedItems.filter((item) => item.type === 'tag'),
    [selectedItems],
  );
  const relationCorpusReady = (relationCorpusStatus?.indexedPosts || 0) > 0;

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/powerprompter/settings');
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.colors) setColors(payload.colors);
    } catch (nextError) {
      console.error('Failed to load Power Prompter settings', nextError);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      const response = await fetch('/api/powerprompter/favorites');
      if (!response.ok) return;
      const payload = await response.json();
      setFavorites(Array.isArray(payload?.favorites) ? payload.favorites : []);
    } catch (nextError) {
      console.error('Failed to load Power Prompter favorites', nextError);
    }
  }, []);

  const loadCSVList = useCallback(async (showFeedback = false, rebuildIndex = false) => {
    setCsvLoading(true);
    try {
      if (rebuildIndex) {
        const indexResponse = await fetch('/api/powerprompter/index', { method: 'POST' });
        if (!indexResponse.ok) throw new Error('Could not rebuild the Power Prompter CSV index.');
      }
      const response = await fetch('/api/powerprompter/csv/list', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load the Power Prompter CSV library.');
      const payload = await response.json();
      setCsvList({
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        characters: Array.isArray(payload?.characters) ? payload.characters : [],
      });
      if (showFeedback) showToast('CSV library and search index refreshed', 'success');
    } catch (nextError) {
      if (showFeedback) showToast(nextError instanceof Error ? nextError.message : 'Failed to refresh CSV library', 'error');
    } finally {
      setCsvLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
    void loadFavorites();
    void loadCSVList();
  }, [loadCSVList, loadFavorites, loadSettings]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (explicitCatalogEnabled) return;
    setSelectedItems((current) => current.filter((item) => item.explicit !== true));
  }, [explicitCatalogEnabled]);

  useEffect(() => {
    if (drawerMode && !effectiveDrawerOpen) return undefined;
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/booru/corpus/status', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Could not load relation corpus status.'));
        if (!cancelled) setRelationCorpusStatus(payload.status || null);
      } catch {
        if (!cancelled) setRelationCorpusStatus(null);
      }
    };
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), relationCorpusStatus?.state === 'running' ? 3_000 : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [drawerMode, effectiveDrawerOpen, relationCorpusStatus?.state]);

  useEffect(() => {
    if (activeView !== 'catalog' || suggestionSeeds.length === 0 || !relationCorpusReady) {
      setSuggestionResult(null);
      setSuggestionError('');
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      setSuggestionError('');
      setSuggestionResult(null);
      try {
        const params = new URLSearchParams({
          tags: suggestionSeeds.map((entry) => entry.tag).join(','),
          classifier: suggestionClassifier,
          includeExplicit: explicitCatalogEnabled ? '1' : '0',
          limit: '60',
          minimumSupport: '20',
          sampleLimit: '50000',
        });
        const response = await fetch(`/api/booru/corpus/related?${params}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Could not calculate related tags.'));
        setSuggestionResult(payload as RelatedResult);
      } catch (nextError) {
        if (controller.signal.aborted) return;
        setSuggestionResult(null);
        setSuggestionError(nextError instanceof Error ? nextError.message : 'Could not calculate related tags.');
      } finally {
        if (!controller.signal.aborted) setSuggestionLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeView, explicitCatalogEnabled, relationCorpusReady, suggestionClassifier, suggestionSeeds]);

  useEffect(() => {
    if (activeView !== 'catalog' || enabledCSVs.length === 0) {
      setClassifiers([]);
      setClassifier('all');
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      csvs: enabledCSVs.join(','),
      includeExplicit: explicitCatalogEnabled ? '1' : '0',
    });
    setClassifiersLoading(true);
    void fetch(`/api/powerprompter/classifiers?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error || 'Could not load tag classifiers.'));
        const values = Array.isArray(payload?.values) ? payload.values : [];
        setClassifiers(values);
        setClassifier((current) => current === 'all' || values.some((entry: ClassifierSummary) => entry.id === current) ? current : 'all');
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
  }, [activeView, enabledCSVs, explicitCatalogEnabled, refreshRevision, showToast]);

  const loadResults = useCallback(async (nextPage: number, append: boolean, signal?: AbortSignal) => {
    if (activeView !== 'catalog' || enabledCSVs.length === 0 || query.trim().length === 1) {
      setResults([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        page: String(nextPage),
        limit: '120',
        csvs: enabledCSVs.join(','),
        browse: '1',
        includeExplicit: explicitCatalogEnabled ? '1' : '0',
      });
      if (category !== 'all') params.set('category', category);
      if (classifier !== 'all') params.set('classifier', classifier);
      const response = await fetch(`/api/powerprompter/search?${params}`, { cache: 'no-store', signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not search the tag catalog.'));
      const values = Array.isArray(payload?.results) ? payload.results : [];
      setResults((current) => append ? [...current, ...values] : values);
      setHasMore(payload?.hasMore === true);
      setPage(nextPage);
    } catch (nextError) {
      if (signal?.aborted) return;
      if (!append) setResults([]);
      setError(nextError instanceof Error ? nextError.message : 'Could not search the tag catalog.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [activeView, category, classifier, enabledCSVs, explicitCatalogEnabled, query]);

  useEffect(() => {
    if (activeView !== 'catalog') return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadResults(0, false, controller.signal);
    }, query.trim() ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeView, loadResults, query, refreshRevision]);

  const classifierLabels = useMemo(
    () => new Map(classifiers.map((entry) => [entry.id, entry.label])),
    [classifiers],
  );
  const selectedKeys = useMemo(() => new Set(selectedItems.map(getResultKey)), [selectedItems]);

  const isFavorite = useCallback((item: SearchResult) => (
    favorites.some((favorite) => favorite.tag === item.tag && favorite.type === item.type)
  ), [favorites]);

  const addFavorite = useCallback(async (item: SearchResult) => {
    try {
      const response = await fetch('/api/powerprompter/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to add favorite.'));
      setFavorites(Array.isArray(payload?.favorites) ? payload.favorites : []);
      showToast('Added to favorites', 'success');
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : 'Failed to add favorite', 'error');
    }
  }, [showToast]);

  const removeFavorite = useCallback(async (item: SearchResult) => {
    try {
      const response = await fetch('/api/powerprompter/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: item.tag, type: item.type }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to remove favorite.'));
      setFavorites(Array.isArray(payload?.favorites) ? payload.favorites : []);
      showToast('Removed from favorites', 'success');
    } catch (nextError) {
      showToast(nextError instanceof Error ? nextError.message : 'Failed to remove favorite', 'error');
    }
  }, [showToast]);

  const toggleItem = useCallback((item: SearchResult) => {
    const key = getResultKey(item);
    setSelectedItems((current) => current.some((entry) => getResultKey(entry) === key)
      ? current.filter((entry) => getResultKey(entry) !== key)
      : [...current, item]);
  }, []);

  const insertItems = useCallback((items: SearchResult[]) => {
    const seen = new Set<string>();
    const values = items
      .map(buildTagInsertionText)
      .filter((value) => {
        const key = value.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (values.length === 0) return;
    onInsert(values.join(', '), { replaceCurrentToken: true, appendComma: true });
    setSelectedItems([]);
    showToast(`Inserted ${values.length} catalog ${values.length === 1 ? 'entry' : 'entries'}`, 'success');
  }, [onInsert, showToast]);

  const openCorpusBuilder = useCallback(() => {
    try {
      window.sessionStorage.setItem('umbra:data-forge-tab', 'corpus');
      window.dispatchEvent(new CustomEvent('umbra:data-forge-open-tab', { detail: { tab: 'corpus' } }));
    } catch {
      // Data Forge still opens even if session storage is unavailable.
    }
    setActiveWorkspace('board');
    if (drawerMode) setDrawerOpen(false);
  }, [drawerMode, setActiveWorkspace, setDrawerOpen]);

  const handleScroll = () => {
    if (!scrollRef.current || loading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 120) void loadResults(page + 1, true);
  };

  const getCategoryColor = (categoryValue: number) => {
    if (categoryValue === 1) return colors.artist || '#c00000';
    if (categoryValue === 3) return colors.copyright || '#a000a0';
    if (categoryValue === 4) return colors.character || '#00aa00';
    if (categoryValue === 5) return colors.metadata || '#ff8a00';
    return colors.general || '#0073ff';
  };

  const getDanbooruSearchUrl = (item: SearchResult) => (
    `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(String(item.tag || '').trim().replace(/\s+/g, '_'))}`
  );

  const copyItem = (item: SearchResult) => {
    void navigator.clipboard.writeText(buildTagInsertionText(item));
    showToast('Copied to clipboard', 'success');
    setContextMenu(null);
  };

  const renderCatalogItem = (item: SearchResult, index: number) => {
    const key = getResultKey(item);
    const selected = selectedKeys.has(key);
    const favorited = isFavorite(item);
    const canonicalTag = cleanTag(item.tag);
    const displayTag = item.displayTag?.trim() || canonicalTag;
    const tagClassifierLabels = (Array.isArray(item.classifiers) ? item.classifiers : [])
      .map((id) => classifierLabels.get(id) || id.replaceAll('_', ' '));
    return (
      <div
        key={`${key}:${item.source || 'favorite'}:${index}`}
        data-umbra-powerprompter-catalog-item={item.tag}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ x: event.clientX, y: event.clientY, item });
        }}
        className={`group grid min-h-14 grid-cols-[minmax(0,1fr)_2rem] overflow-hidden rounded-sm border transition ${selected ? 'border-cyan-300/35 bg-cyan-500/10' : item.explicit ? 'border-red-300/10 bg-red-500/[0.018] hover:border-red-300/20' : 'border-white/[0.08] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.035]'}`}
      >
        <button
          type="button"
          aria-pressed={selected}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleItem(item)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            insertItems([item]);
          }}
          className="grid min-w-0 grid-cols-[1.2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-left"
          title="Select this entry. Double-click to insert it immediately."
        >
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${selected ? 'border-cyan-200/50 bg-cyan-300/20 text-cyan-50' : 'border-white/15 text-transparent'}`}>
            {selected ? <Check className="h-2.5 w-2.5" /> : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-[10px] font-semibold" style={{ color: getCategoryColor(item.category) }} title={displayTag}>{displayTag}</span>
            <span className="mt-0.5 block truncate text-[8px] font-black uppercase tracking-[0.08em] text-zinc-600">
              {CATEGORY_LABELS[item.category] || `Category ${item.category}`} · {item.source || 'Favorite'}
            </span>
            {displayTag !== canonicalTag ? <span className="mt-0.5 block truncate font-mono text-[8px] text-cyan-100/45">{canonicalTag}</span> : null}
            {item.extra ? <span className="mt-0.5 block truncate text-[8px] text-zinc-500" title={cleanTag(item.extra)}>{cleanTag(item.extra)}</span> : null}
            {tagClassifierLabels.length > 0 ? (
              <span className={`mt-0.5 block truncate text-[8px] font-bold uppercase tracking-[0.06em] ${item.explicit ? 'text-red-300/55' : 'text-cyan-200/45'}`} title={tagClassifierLabels.join(', ')}>
                {tagClassifierLabels.slice(0, 3).join(' / ')}{tagClassifierLabels.length > 3 ? ` +${tagClassifierLabels.length - 3}` : ''}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 font-mono text-[9px] text-cyan-200/70">{formatPostCount(item.count)}</span>
        </button>
        <button
          type="button"
          onClick={() => { void (favorited ? removeFavorite(item) : addFavorite(item)); }}
          className={`grid place-items-center border-l border-white/[0.06] ${favorited ? 'text-amber-300' : 'text-zinc-700 hover:text-amber-200'}`}
          title={favorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`h-3.5 w-3.5 ${favorited ? 'fill-current' : ''}`} />
        </button>
      </div>
    );
  };

  return (
    <>
      {drawerMode && !effectiveDrawerOpen ? (
        <button
          type="button"
          data-umbra-tag-catalog-drawer-trigger=""
          onClick={() => setDrawerOpen(true)}
          className="absolute left-0 top-1/2 z-[90] inline-flex min-h-32 -translate-y-1/2 items-center gap-2 rounded-r-md border border-cyan-300/30 px-2 py-4 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 shadow-[8px_0_30px_rgba(0,0,0,0.55)] transition-[transform,opacity] duration-300 ease-out hover:border-cyan-200/50 [writing-mode:vertical-rl]"
          style={{
            backgroundColor: 'var(--umbra-bg, #09090b)',
            backgroundImage: 'linear-gradient(var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)), var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)))',
          }}
        >
          <Tags className="h-3.5 w-3.5" /> Tag Catalog <ChevronUp className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div
      data-umbra-powerprompter-search-panel=""
      data-umbra-powerprompter-tag-catalog=""
      data-umbra-tag-catalog-drawer={drawerMode ? '' : undefined}
      className={`${drawerMode
        ? 'absolute inset-0 z-[95] isolate flex min-h-0 flex-col border-r border-cyan-300/25 shadow-[20px_0_60px_rgba(0,0,0,0.78)] transition-[transform,opacity] duration-300 ease-out'
        : menuMode
          ? 'h-full min-h-0 w-full max-w-none'
          : 'h-full w-80 flex-shrink-0 border-l border-white/5'} ${drawerMode
            ? effectiveDrawerOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : 'translate-x-full opacity-0 pointer-events-none'
            : ''} flex min-h-0 flex-col glass-panel`}
      style={drawerMode ? {
        height: '100%',
        backgroundColor: 'var(--umbra-bg, #09090b)',
        backgroundImage: 'linear-gradient(var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)), var(--umbra-panel-bg, rgba(20, 20, 30, 0.96)))',
      } : { backgroundColor: overlayMode ? 'rgba(5,5,8,0.98)' : '#050508' }}
    >
      <header className="flex min-h-12 items-center gap-2 border-b border-white/10 px-3 py-2">
        <Tags className="h-4 w-4 shrink-0 text-cyan-200" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[10px] font-black uppercase tracking-[0.15em] text-zinc-100">Danbooru Tag Catalog</h2>
          <div className="font-mono text-[9px] text-zinc-600">
            {loading ? 'Loading...' : `${activeView === 'favorites' ? favorites.length : results.length} shown`} · {selectedItems.length} selected · {enabledCSVs.length} CSV
          </div>
        </div>
        <button type="button" onClick={() => setRefreshRevision((value) => value + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100" title="Refresh catalog">
          <RefreshCw className={`h-3.5 w-3.5 ${loading || classifiersLoading ? 'animate-spin' : ''}`} />
        </button>
        {onOpenSettings ? <button type="button" onClick={onOpenSettings} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100" title="Power Prompter settings"><Settings className="h-3.5 w-3.5" /></button> : null}
        {drawerMode ? (
          <button type="button" onClick={() => setDrawerOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400 hover:text-zinc-100">
            <ChevronDown className="h-3.5 w-3.5" /> Close
          </button>
        ) : null}
        <button
          type="button"
          disabled={selectedItems.length === 0}
          onClick={() => insertItems(selectedItems)}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-2.5 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-30"
          title="Insert selected catalog entries"
        >
          <Plus className="h-3 w-3" /> Insert{selectedItems.length > 0 ? ` ${selectedItems.length}` : ''}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-1 border-b border-white/[0.08] p-2">
        {([
          ['catalog', 'Catalog', Tags],
          ['favorites', 'Favorites', Star],
          ['sources', 'Sources', Database],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={activeView === value}
            onClick={() => setActiveView(value)}
            className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${activeView === value ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
          >
            <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{label}</span>
            {value === 'favorites' && favorites.length > 0 ? <span className="font-mono opacity-60">{favorites.length}</span> : null}
            {value === 'sources' && enabledCSVs.length > 0 ? <span className="font-mono opacity-60">{enabledCSVs.length}</span> : null}
          </button>
        ))}
      </div>

      {activeView === 'catalog' ? (
        <>
          <div className="border-b border-white/[0.08] px-3 py-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <input
                  data-umbra-powerprompter-catalog-search
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={enabledCSVs.length > 0 ? 'Search tags and characters' : 'Enable a CSV source first'}
                  disabled={enabledCSVs.length === 0}
                  className="settings-input h-9 !py-1.5 pl-8 text-xs"
                />
              </div>
              <div className="flex gap-1.5">
                <button type="button" disabled={selectedItems.length === 0} onClick={() => setSelectedItems([])} className="h-9 rounded-sm border border-white/10 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-zinc-500 hover:text-zinc-200 disabled:opacity-30">Clear</button>
                <button data-umbra-powerprompter-catalog-insert type="button" disabled={selectedItems.length === 0} onClick={() => insertItems(selectedItems)} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-3 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-30"><Plus className="h-3.5 w-3.5" /> Insert</button>
              </div>
            </div>

            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
              {CATEGORIES.map((entry) => (
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

            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar" data-umbra-powerprompter-catalog-classifiers>
              <span className="mr-1 shrink-0 text-[8px] font-black uppercase tracking-[0.11em] text-zinc-600">Classifiers</span>
              <button type="button" aria-pressed={classifier === 'all'} onClick={() => setClassifier('all')} className={`h-7 shrink-0 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${classifier === 'all' ? 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}>All</button>
              {classifiers.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={classifier === entry.id}
                  data-umbra-powerprompter-catalog-classifier={entry.id}
                  onClick={() => {
                    setClassifier(entry.id);
                    if (category === '1' || category === '3' || category === '4') setCategory('all');
                  }}
                  title={entry.description}
                  className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${classifier === entry.id ? entry.explicit ? 'border-red-300/40 bg-red-500/12 text-red-100' : 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100' : entry.explicit ? 'border-red-300/15 text-red-300/55 hover:text-red-200' : 'border-white/[0.08] text-zinc-600 hover:text-zinc-300'}`}
                >
                  {entry.label}<span className="font-mono text-[8px] opacity-60">{new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(entry.count)}</span>
                </button>
              ))}
              {classifiersLoading ? <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin text-zinc-600" /> : null}
            </div>

            <div className={`mt-2 flex min-h-8 items-center justify-between gap-2 rounded-sm border px-2.5 ${explicitCatalogEnabled ? 'border-red-300/20 bg-red-500/[0.05]' : 'border-white/[0.08] bg-black/20'}`}>
              <span className={`inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.09em] ${explicitCatalogEnabled ? 'text-red-200/80' : 'text-zinc-600'}`}><ShieldCheck className="h-3 w-3" /> Explicit classifiers {explicitCatalogEnabled ? 'visible' : 'hidden'}</span>
              <button type="button" aria-pressed={explicitCatalogEnabled} data-umbra-powerprompter-catalog-explicit-toggle onClick={() => setAppSetting('ui.tagCatalogExplicitEnabled', !explicitCatalogEnabled)} className={`h-6 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${explicitCatalogEnabled ? 'border-red-300/20 text-red-200/70 hover:text-red-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200'}`}>Explicit {explicitCatalogEnabled ? 'On' : 'Off'}</button>
            </div>

            {drawerMode || menuMode || activeView === 'catalog' ? (
              <section data-umbra-tag-suggestion-rail className="mt-2 h-[5.25rem] flex-none overflow-hidden rounded-sm border border-fuchsia-300/15 bg-fuchsia-500/[0.025]">
                <div className="flex h-8 shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5">
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-fuchsia-100">
                    <Network className="h-3 w-3" /> Suggestions
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-zinc-600" title={suggestionSeeds.map((item) => cleanTag(item.tag)).join(' + ')}>
                    For {suggestionSeeds.map((item) => cleanTag(item.tag)).join(' + ')}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {(['smart', 'all'] as const).map((value) => (
                      <button key={value} type="button" aria-pressed={suggestionClassifier === value} onClick={() => setSuggestionClassifier(value)} className={`h-6 rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em] ${suggestionClassifier === value ? 'border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-100' : 'border-white/10 text-zinc-600 hover:text-zinc-300'}`}>
                        {value === 'smart' ? 'Smart' : 'All'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="custom-scrollbar h-9 shrink-0 flex items-center gap-1.5 overflow-x-auto px-2 py-1.5">
                  {!relationCorpusStatus ? (
                    <span className="shrink-0 text-[9px] text-zinc-600">Checking corpus...</span>
                  ) : relationCorpusStatus.indexedPosts === 0 ? (
                    <button type="button" onClick={openCorpusBuilder} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-cyan-300/25 bg-cyan-500/10 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-cyan-100"><DatabaseZap className="h-3 w-3" /> Build Corpus</button>
                  ) : suggestionError ? (
                    <span className="shrink-0 text-[9px] text-amber-200/75">{suggestionError}</span>
                  ) : suggestionLoading ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[9px] text-zinc-500"><Loader2 className="h-3 w-3 animate-spin" /> Finding related tags...</span>
                  ) : !suggestionResult || suggestionResult.suggestions.length === 0 ? (
                    <span className="shrink-0 text-[9px] text-zinc-600">No supported relations found.</span>
                  ) : suggestionResult.suggestions.map((suggestion) => {
                    const item: SearchResult = {
                      tag: suggestion.tag,
                      category: 0,
                      count: suggestion.corpusPostCount,
                      classifiers: suggestion.classifiers,
                      explicit: suggestion.explicit,
                      source: 'Danbooru Relation Corpus',
                      type: 'tag',
                    };
                    const selected = selectedKeys.has(getResultKey(item));
                    return (
                      <button
                        key={suggestion.tag}
                        type="button"
                        aria-pressed={selected}
                        data-umbra-tag-suggestion={suggestion.tag}
                        onClick={() => toggleItem(item)}
                        className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 font-mono text-[9px] transition ${selected ? 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100' : suggestion.explicit ? 'border-red-300/20 bg-red-500/[0.05] text-red-100/80 hover:border-red-300/35' : 'border-fuchsia-300/20 bg-fuchsia-500/[0.05] text-zinc-300 hover:border-fuchsia-300/40 hover:text-fuchsia-50'}`}
                        title={`${suggestion.conditionalPercent.toFixed(1)}% together · ${suggestion.lift.toFixed(2)}x lift · ${new Intl.NumberFormat().format(suggestion.cooccurrenceCount)} matching posts`}
                      >
                        {selected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-60" />}
                        {cleanTag(suggestion.tag)}
                        <span className="text-[8px] opacity-55">{suggestion.conditionalPercent.toFixed(0)}%</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <div ref={scrollRef} onScroll={handleScroll} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2.5">
            {enabledCSVs.length === 0 ? (
              <button type="button" onClick={() => setActiveView('sources')} className="flex min-h-28 w-full items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-[10px] text-zinc-500 hover:border-cyan-300/25 hover:text-cyan-100">Choose at least one tag or character CSV source.</button>
            ) : query.trim().length === 1 ? (
              <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-white/10 text-[10px] text-zinc-600">Type one more character to search.</div>
            ) : error ? (
              <div className="flex min-h-28 items-center justify-center rounded-md border border-red-300/15 bg-red-500/[0.04] px-4 text-center text-[10px] text-red-200/80">{error}</div>
            ) : loading && results.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center text-zinc-600"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : results.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-white/10 text-[10px] text-zinc-600">No matching catalog entries.</div>
            ) : (
              <div className={`grid grid-cols-1 gap-1.5 ${menuMode || drawerMode ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>{results.map(renderCatalogItem)}</div>
            )}
            {loading && results.length > 0 ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-zinc-600" /></div> : null}
          </div>
        </>
      ) : activeView === 'favorites' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Saved entries</span>
            <button type="button" disabled={selectedItems.length === 0} onClick={() => insertItems(selectedItems)} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-3 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-30"><Plus className="h-3 w-3" /> Insert Selected</button>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2.5">
            {favorites.length === 0 ? <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-[10px] text-zinc-600">No favorites yet. Use the star on any catalog entry.</div> : <div className={`grid grid-cols-1 gap-1.5 ${menuMode || drawerMode ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>{favorites.map(renderCatalogItem)}</div>}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-3 py-2.5">
            <div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400">CSV Sources</div><div className="mt-0.5 text-[9px] text-zinc-600">{enabledCSVs.length} enabled source{enabledCSVs.length === 1 ? '' : 's'}</div></div>
            <button type="button" onClick={() => void loadCSVList(true, true)} disabled={csvLoading} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-white/10 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-zinc-400 hover:text-cyan-100 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${csvLoading ? 'animate-spin' : ''}`} /> Reindex</button>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {([
              ['tag', 'Tag CSVs', csvList.tags],
              ['character', 'Character CSVs', csvList.characters],
            ] as const).map(([type, label, files]) => (
              <section key={type}>
                <div className="mb-2 border-b border-white/[0.06] pb-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-zinc-600">{label}</div>
                {files.length === 0 ? <div className="text-[10px] text-zinc-600">No {label.toLowerCase()} found.</div> : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {files.map((fileName) => {
                      const sourceId = getCsvSourceId(type, fileName);
                      const checked = isCsvSourceEnabled(enabledCSVs, sourceId, fileName);
                      return (
                        <label key={sourceId} data-umbra-powerprompter-catalog-source={sourceId} className={`group flex min-h-10 cursor-pointer items-center gap-3 rounded-sm border px-2.5 py-2 transition ${checked ? type === 'character' ? 'border-emerald-300/25 bg-emerald-400/10' : 'border-cyan-300/25 bg-cyan-400/10' : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15'}`}>
                          <input type="checkbox" checked={checked} onChange={() => onToggleCSV(sourceId)} className="h-3.5 w-3.5 accent-cyan-400" />
                          <span className={`min-w-0 flex-1 truncate text-[10px] ${checked ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{fileName}</span>
                          <span className="text-[8px] font-black uppercase tracking-[0.08em] text-zinc-700">{type === 'character' ? 'Char' : 'Tag'}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {contextMenu ? (
        <div className="umbra-context-menu-panel fixed z-[100] min-w-[196px] p-1" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { insertItems([contextMenu.item]); setContextMenu(null); }} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-300"><Plus className="h-3.5 w-3.5 text-cyan-300" /> Insert Tag</button>
          <button type="button" onClick={() => copyItem(contextMenu.item)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-300"><Copy className="h-3.5 w-3.5 text-zinc-500" /> Copy Tag</button>
          <a href={getDanbooruSearchUrl(contextMenu.item)} target="_blank" rel="noopener noreferrer" onClick={() => setContextMenu(null)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-300"><ExternalLink className="h-3.5 w-3.5 text-zinc-500" /> Search Danbooru</a>
          <div className="umbra-context-menu-separator mx-2 my-1.5" />
          {isFavorite(contextMenu.item) ? <button type="button" onClick={() => { void removeFavorite(contextMenu.item); setContextMenu(null); }} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-red-300"><Trash2 className="h-3.5 w-3.5" /> Remove Favorite</button> : <button type="button" onClick={() => { void addFavorite(contextMenu.item); setContextMenu(null); }} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-amber-200"><Star className="h-3.5 w-3.5" /> Add to Favorites</button>}
        </div>
      ) : null}
    </div>
    </>
  );
});

PowerPrompterSearchPanel.displayName = 'PowerPrompterSearchPanel';
