import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Settings, Star, Copy, Trash2, ExternalLink, Database, RefreshCw, Tags } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface SearchResult {
  tag: string;
  category: number;
  extra?: string;
  source?: string;
  type: 'tag' | 'character';
}

interface Favorite extends SearchResult {
  addedAt: number;
}

interface PowerPrompterSearchPanelProps {
  onInsert: (text: string) => void;
  enabledCSVs: string[];
  onToggleCSV: (name: string) => void;
  onOpenSettings: () => void;
  overlayMode?: boolean;
  menuMode?: boolean;
}

const getCsvSourceId = (type: 'tag' | 'character', fileName: string) => `${type}:${fileName}`;

const isCsvSourceEnabled = (enabledCSVs: string[], sourceId: string, fileName: string) => (
  enabledCSVs.includes(sourceId) || enabledCSVs.includes(fileName)
);

export const PowerPrompterSearchPanel = React.memo(({ onInsert, enabledCSVs, onToggleCSV, onOpenSettings, overlayMode = false, menuMode = false }: PowerPrompterSearchPanelProps) => {
  const [activeTab, setActiveTab] = useState<'search' | 'favorites' | 'csv'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [csvList, setCsvList] = useState<{ tags: string[], characters: string[] }>({ tags: [], characters: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [colors, setColors] = useState<any>({
    general: '#0073ff',
    artist: '#c00000',
    copyright: '#a000a0',
    character: '#00aa00',
    metadata: '#ff8a00'
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: SearchResult;
  } | null>(null);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const showToast = useStore((state) => state.showToast);

  useEffect(() => {
    loadSettings();
    loadFavorites();
    loadCSVList();
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/powerprompter/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.colors) {
          setColors(data.colors);
        }
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  const loadFavorites = async () => {
    try {
      const res = await fetch('/api/powerprompter/favorites');
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch (e) {
      console.error('Failed to load favorites', e);
    }
  };

  const loadCSVList = async (showFeedback = false) => {
    try {
      const res = await fetch('/api/powerprompter/csv/list');
      if (res.ok) {
        setCsvList(await res.json());
        if (showFeedback) showToast('CSV library refreshed', 'success');
      }
    } catch (e) {
      console.error('Failed to load CSV list', e);
      if (showFeedback) showToast('Failed to refresh CSV library', 'error');
    }
  };

  const addFavorite = async (item: SearchResult) => {
    try {
      const res = await fetch('/api/powerprompter/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });

      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites);
        showToast('Added to favorites', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to add', 'error');
      }
    } catch (e) {
      showToast('Failed to add favorite', 'error');
    }
  };

  const removeFavorite = async (item: SearchResult) => {
    try {
      const res = await fetch('/api/powerprompter/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: item.tag, type: item.type })
      });

      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites);
        showToast('Removed from favorites', 'success');
      }
    } catch (e) {
      showToast('Failed to remove favorite', 'error');
    }
  };

  const isFavorite = (item: SearchResult) => {
    return favorites.some(f => f.tag === item.tag && f.type === item.type);
  };

  const search = async (q: string, p: number = 0, append: boolean = false) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const csvQuery = encodeURIComponent(enabledCSVs.join(','));
      const res = await fetch(`/api/powerprompter/search?q=${encodeURIComponent(q)}&page=${p}&limit=100&csvs=${csvQuery}`);
      const data = await res.json();

      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setHasMore(data.hasMore);
      setPage(p);
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      search(query, 0, false);
    }, 300);
  }, [query, enabledCSVs]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading) {
      search(query, page + 1, true);
    }
  };

  // Helper to clean tag text (remove underscores, quotes)
  const cleanTag = (tag: string): string => {
    return String(tag ?? '')
      .replace(/_/g, ' ')  // Replace underscores with spaces
      .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
      .trim();
  };

  const buildTagClipboardText = (item: SearchResult) => {
    const cleanedTag = cleanTag(item.tag);
    return item.type === 'character' && item.extra
      ? `${cleanedTag}, ${cleanTag(item.extra)}`
      : cleanedTag;
  };

  const handleResultClick = (item: SearchResult) => {
    handleCopyTag(item);
  };

  const handleContextMenu = (e: React.MouseEvent, item: SearchResult) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const handleCopyTag = (item: SearchResult) => {
    const text = buildTagClipboardText(item);
    void navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
    setContextMenu(null);
  };

  const getDanbooruSearchUrl = (item: SearchResult): string => {
    const tag = String(item.tag || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/^["']|["']$/g, '');
    return `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(tag)}`;
  };

  const getCategoryColor = (cat: number) => {
    switch (cat) {
      case 0: return colors.general || '#0073ff';
      case 1: return colors.artist || '#c00000';
      case 3: return colors.copyright || '#a000a0';
      case 4: return colors.character || '#00aa00';
      case 5: return colors.metadata || '#ff8a00';
      default: return colors.general || '#0073ff';
    }
  };

  const renderItem = (item: SearchResult, idx: number, showFavoriteStar: boolean = true) => {
    const favorited = isFavorite(item);
    const displayTag = cleanTag(item.tag);
    const displayExtra = item.extra ? cleanTag(item.extra) : null;

    return (
      <div
        key={`${item.tag}-${idx}`}
        onClick={() => handleResultClick(item)}
        onContextMenu={(e) => handleContextMenu(e, item)}
        className="group flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent bg-white/[0.015] p-2 text-left transition-all hover:border-white/10 hover:bg-white/[0.05]"
        title="Click to copy tag"
      >
        <div className="flex items-center gap-2">
          {showFavoriteStar && favorited && (
            <Star size={10} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />
          )}
          <span
            className="text-xs font-bold truncate"
            style={{ color: getCategoryColor(item.category) }}
          >
            {displayTag}
          </span>
          <span className="ml-auto text-[9px] text-zinc-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
            Copy
          </span>
        </div>
        {displayExtra && (
          <div className="truncate border-l border-white/10 pl-2 text-[10px] text-zinc-500">
            {displayExtra}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-umbra-powerprompter-search-panel=""
      className={`${menuMode ? 'h-full min-h-0 w-full max-w-none' : 'h-full w-80 flex-shrink-0 border-l border-white/5'} flex flex-col glass-panel`}
      style={{ backgroundColor: overlayMode ? 'rgba(5,5,8,0.98)' : '#050508' }}
    >
      <div className="border-b border-white/5 px-3 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">
            <Tags size={13} className="text-cyan-300" />
            <span>Tag Browser</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-600">
            Search tags, favorites, and CSV sources
          </div>
        </div>
        <button
          onClick={onOpenSettings}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-cyan-100"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="border-b border-white/5 p-2">
        <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/25 p-1">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center justify-center gap-2 rounded px-2 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'search' ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.14)]' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'}`}
        >
          <Search size={12} />
          Search
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`flex items-center justify-center gap-2 rounded px-2 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'favorites' ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.14)]' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'}`}
        >
          <Star size={12} />
          Fav
          {favorites.length > 0 && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{favorites.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('csv')}
          className={`flex items-center justify-center gap-2 rounded px-2 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'csv' ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.14)]' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'}`}
        >
          <Database size={12} />
          CSVs
          {enabledCSVs.length > 0 && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{enabledCSVs.length}</span>
          )}
        </button>
        </div>
      </div>

      {activeTab === 'search' ? (
        <>
          {/* Search Input */}
          <div className="border-b border-white/5 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tags & characters..."
                className="w-full rounded-md border border-white/10 bg-black/35 py-2 pl-9 pr-8 text-xs text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-cyan-300/60 focus:bg-black/45"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={12} className="animate-spin text-[var(--umbra-accent)]" />
                </div>
              )}
            </div>
          </div>

          {/* Results List */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar"
          >
            {results.length === 0 && query.length >= 2 && !loading && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-xs text-zinc-600">
                No results found
              </div>
            )}

            {results.length === 0 && query.length < 2 && (
              <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-xs text-zinc-600">
                Type 2+ characters to search
              </div>
            )}

            {results.map((item, idx) => renderItem(item, idx))}

            {loading && results.length > 0 && (
              <div className="py-2 flex justify-center">
                <Loader2 size={16} className="animate-spin text-zinc-600" />
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'favorites' ? (
        /* Favorites List */
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar">
          {favorites.length === 0 && (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-xs text-zinc-600">
              No favorites yet.<br />
              Right-click a tag to add it.
            </div>
          )}

          {favorites.map((item, idx) => renderItem(item, idx, false))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="border-b border-white/5 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">CSV Sources</div>
              <div className="mt-1 text-[10px] text-zinc-600">{enabledCSVs.length} enabled source{enabledCSVs.length === 1 ? '' : 's'}</div>
            </div>
            <button
              onClick={() => loadCSVList(true)}
              className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
              title="Refresh CSV Library"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar">
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-white/5 pb-2">Tag CSVs</div>
              {csvList.tags.length === 0 && (
                <div className="text-[11px] text-zinc-600">No tag CSVs found</div>
              )}
              {csvList.tags.map((csv) => {
                const sourceId = getCsvSourceId('tag', csv);
                const checked = isCsvSourceEnabled(enabledCSVs, sourceId, csv);
                return (
                  <label key={sourceId} className={`group flex cursor-pointer items-center gap-3 rounded-md border px-2.5 py-2 transition-all ${checked ? 'border-cyan-300/25 bg-cyan-400/10' : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'}`}>
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleCSV(sourceId)}
                        className="sr-only"
                      />
                      <div className={`h-4 w-8 rounded-full transition-colors ${checked ? 'bg-cyan-400/80' : 'bg-zinc-800'}`} />
                      <div className={`absolute left-1 w-2 h-2 bg-white rounded-full transition-all ${checked ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className={`truncate text-xs ${checked ? 'text-cyan-50' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{csv}</span>
                  </label>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-white/5 pb-2">Character CSVs</div>
              {csvList.characters.length === 0 && (
                <div className="text-[11px] text-zinc-600">No character CSVs found</div>
              )}
              {csvList.characters.map((csv) => {
                const sourceId = getCsvSourceId('character', csv);
                const checked = isCsvSourceEnabled(enabledCSVs, sourceId, csv);
                return (
                  <label key={sourceId} className={`group flex cursor-pointer items-center gap-3 rounded-md border px-2.5 py-2 transition-all ${checked ? 'border-emerald-300/25 bg-emerald-400/10' : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'}`}>
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleCSV(sourceId)}
                        className="sr-only"
                      />
                      <div className={`h-4 w-8 rounded-full transition-colors ${checked ? 'bg-emerald-400/80' : 'bg-zinc-800'}`} />
                      <div className={`absolute left-1 w-2 h-2 bg-white rounded-full transition-all ${checked ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className={`truncate text-xs ${checked ? 'text-emerald-50' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{csv}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-[#1a1a1f] border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const text = buildTagClipboardText(contextMenu.item);
              onInsert(text);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <span className="w-4 h-4 flex items-center justify-center text-zinc-500">+</span>
            Insert Tag
          </button>
          <button
            onClick={() => handleCopyTag(contextMenu.item)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <Copy size={14} className="text-zinc-500" />
            Copy Tag
          </button>
          <a
            href={getDanbooruSearchUrl(contextMenu.item)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <ExternalLink size={14} className="text-zinc-500" />
            Search Danbooru
          </a>
          <div className="border-t border-white/5 my-1" />
          {isFavorite(contextMenu.item) ? (
            <button
              onClick={() => {
                removeFavorite(contextMenu.item);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Trash2 size={14} />
              Remove from Favorites
            </button>
          ) : (
            <button
              onClick={() => {
                addFavorite(contextMenu.item);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-xs text-yellow-400 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Star size={14} />
              Add to Favorites
            </button>
          )}
        </div>
      )}
    </div>
  );
});

PowerPrompterSearchPanel.displayName = 'PowerPrompterSearchPanel';
