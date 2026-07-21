import { create } from 'zustand';
import type { BoardState, SearchTab, DownloadItem } from '../types';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';

const SUPPORTED_SOURCES = new Set(['danbooru', 'gelbooru', 'rule34', 'e621']);

function normalizeSources(value: unknown): string[] {
  const sources = Array.isArray(value) ? value.map(source => String(source || '').trim()) : [];
  const filtered = sources.filter(source => SUPPORTED_SOURCES.has(source));
  return filtered.length > 0 ? filtered : ['danbooru'];
}

const createSearchTab = (): SearchTab => ({
  id: `tab_${Date.now()}`,
  name: 'New Search',
  tags: '',
  sources: ['danbooru'],
  results: [],
  selected: new Set(),
  page: 1,
  hasMore: true,
  isLoading: false,
});

export const useBoardStore = create<BoardState>()(
    (set) => ({
      // Initial state
      searchTabs: [createSearchTab()],
      activeSearchTabId: null,
      favorites: [],
      searchHistory: [],
      downloadQueue: [],
      isDownloading: false,
      enabledSources: ['danbooru'],
      defaultRepeats: 10,

      // Search tab actions
      addSearchTab: () => {
        const newTab = createSearchTab();
        set(state => ({
          searchTabs: [...state.searchTabs, newTab],
          activeSearchTabId: newTab.id,
        }));
      },

      removeSearchTab: (id) => {
        set(state => {
          const tabs = state.searchTabs.filter(t => t.id !== id);
          if (tabs.length === 0) {
            const newTab = createSearchTab();
            return {
              searchTabs: [newTab],
              activeSearchTabId: newTab.id,
            };
          }
          return {
            searchTabs: tabs,
            activeSearchTabId: state.activeSearchTabId === id
              ? tabs[tabs.length - 1].id
              : state.activeSearchTabId,
          };
        });
      },

      setActiveSearchTab: (id) => {
        set({ activeSearchTabId: id });
      },

      updateSearchTab: (id, updates) => {
        set(state => ({
          searchTabs: state.searchTabs.map(tab =>
            tab.id === id ? { ...tab, ...updates } : tab
          ),
        }));
      },

      // Favorites actions
      addFavorite: (query) => {
        set(state => ({
          favorites: state.favorites.includes(query)
            ? state.favorites
            : [...state.favorites, query],
        }));
      },

      removeFavorite: (query) => {
        set(state => ({
          favorites: state.favorites.filter(f => f !== query),
        }));
      },

      addSearchHistory: (query) => {
        const normalized = query.trim().replace(/\s+/g, ' ');
        if (!normalized) return;
        set(state => ({
          searchHistory: [normalized, ...state.searchHistory.filter(item => item !== normalized)].slice(0, 5),
        }));
      },

      // Download queue actions
      addToDownloadQueue: (items) => {
        const newItems: DownloadItem[] = items.map((item, i) => ({
          ...item,
          id: `dl_${Date.now()}_${i}`,
          status: 'queued',
          progress: 0,
        }));
        set(state => ({
          downloadQueue: [...state.downloadQueue, ...newItems],
        }));
      },

      updateDownloadItem: (id, updates) => {
        set(state => ({
          downloadQueue: state.downloadQueue.map(item =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      removeFromDownloadQueue: (id) => {
        set(state => ({
          downloadQueue: state.downloadQueue.filter(item => item.id !== id),
        }));
      },

      clearDownloadQueue: () => {
        set({ downloadQueue: [] });
      },

      // Settings actions
      setIsDownloading: (value) => {
        set({ isDownloading: value });
      },

      toggleSource: (sourceId) => {
        set(state => ({
          enabledSources: state.enabledSources.includes(sourceId)
            ? state.enabledSources.filter(s => s !== sourceId)
            : [...state.enabledSources, sourceId],
        }));
      },

      setDefaultRepeats: (value) => {
        set({ defaultRepeats: value });
      },
    })
);

let boardPreferencesHydrated = false;

if (typeof window !== 'undefined') {
  try { window.localStorage.removeItem('board-storage'); } catch {}
  void readUserConfig<Partial<BoardState>>('board-preferences', {})
    .then((preferences) => {
      useBoardStore.setState({
        favorites: Array.isArray(preferences.favorites) ? preferences.favorites : [],
        searchHistory: Array.isArray(preferences.searchHistory) ? preferences.searchHistory.slice(0, 5) : [],
        enabledSources: normalizeSources(preferences.enabledSources),
        defaultRepeats: Number.isFinite(Number(preferences.defaultRepeats)) ? Number(preferences.defaultRepeats) : 10,
      });
    })
    .finally(() => {
      boardPreferencesHydrated = true;
    });

  useBoardStore.subscribe((state) => {
    if (!boardPreferencesHydrated) return;
    void writeUserConfig('board-preferences', {
      favorites: state.favorites,
      searchHistory: state.searchHistory,
      enabledSources: normalizeSources(state.enabledSources),
      defaultRepeats: state.defaultRepeats,
    }).catch((error) => console.warn('[BoardStore] Failed to persist board preferences:', error));
  });
}
