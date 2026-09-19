import { create } from 'zustand';
import type { BoardState, SearchTab, DownloadItem } from '../types';
import { createUserPreferenceSession } from '@/lib/userPreferenceSession';
import { startBoardDownloadRunner } from '../boardDownloadRunner';

const SUPPORTED_SOURCES = new Set(['danbooru', 'gelbooru', 'rule34', 'e621']);
let nextBoardId = 0;
const createBoardId = (prefix: string) => `${prefix}_${Date.now()}_${++nextBoardId}`;

function normalizeSources(value: unknown): string[] {
  const sources = Array.isArray(value) ? value.map(source => String(source || '').trim()) : [];
  const filtered = sources.filter(source => SUPPORTED_SOURCES.has(source));
  return filtered.length > 0 ? filtered : ['danbooru'];
}

const createSearchTab = (): SearchTab => ({
  id: createBoardId('tab'),
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
    (set, get) => ({
      // Initial state
      searchTabs: [createSearchTab()],
      activeSearchTabId: null,
      favorites: [],
      searchHistory: [],
      downloadQueue: [],
      isDownloading: false,
      downloadPaused: false,
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
        boardPreferences.update(state => ({
          ...state,
          favorites: state.favorites.includes(query)
            ? state.favorites
            : [...state.favorites, query],
        }));
      },

      removeFavorite: (query) => {
        boardPreferences.update(state => ({
          ...state,
          favorites: state.favorites.filter(f => f !== query),
        }));
      },

      addSearchHistory: (query) => {
        const normalized = query.trim().replace(/\s+/g, ' ');
        if (!normalized) return;
        boardPreferences.update(state => ({
          ...state,
          searchHistory: [normalized, ...state.searchHistory.filter(item => item !== normalized)].slice(0, 5),
        }));
      },

      // Download queue actions
      addToDownloadQueue: (items) => {
        const newItems: DownloadItem[] = items.map((item) => ({
          ...item,
          id: createBoardId('dl'),
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
          downloadQueue: state.downloadQueue.filter(item => item.id !== id || item.status === 'downloading'),
        }));
      },

      clearDownloadQueue: () => {
        set(state => ({ downloadQueue: state.downloadQueue.filter(item => item.status === 'downloading') }));
      },

      // Settings actions
      setIsDownloading: (value) => {
        set({ isDownloading: value });
      },
      setDownloadPaused: (value) => set({ downloadPaused: value }),

      toggleSource: (sourceId) => {
        const remove = get().enabledSources.includes(sourceId);
        boardPreferences.update(state => ({
          ...state,
          enabledSources: remove
            ? state.enabledSources.filter(s => s !== sourceId)
            : [...new Set([...state.enabledSources, sourceId])],
        }));
      },

      setDefaultRepeats: (value) => {
        boardPreferences.update(state => ({ ...state, defaultRepeats: value }));
      },
    })
);

type BoardPreferences = Pick<BoardState, 'favorites' | 'searchHistory' | 'enabledSources' | 'defaultRepeats'>;
const boardPreferences = createUserPreferenceSession<BoardPreferences>({
  key: 'board-preferences',
  initial: { favorites: [], searchHistory: [], enabledSources: ['danbooru'], defaultRepeats: 10 },
  normalize: (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid board preferences');
    const preferences = raw as Partial<BoardPreferences>;
    return {
      favorites: Array.isArray(preferences.favorites) ? preferences.favorites.filter(item => typeof item === 'string') : [],
      searchHistory: Array.isArray(preferences.searchHistory) ? preferences.searchHistory.filter(item => typeof item === 'string').slice(0, 5) : [],
      enabledSources: normalizeSources(preferences.enabledSources),
      defaultRepeats: Number.isFinite(Number(preferences.defaultRepeats)) ? Number(preferences.defaultRepeats) : 10,
    };
  },
  apply: preferences => useBoardStore.setState(preferences),
  onError: error => console.warn('[BoardStore] Failed to synchronize board preferences:', error),
});

if (typeof window !== 'undefined') {
  startBoardDownloadRunner(useBoardStore);
  try { window.localStorage.removeItem('board-storage'); } catch {}
  void boardPreferences.hydrate();
}
