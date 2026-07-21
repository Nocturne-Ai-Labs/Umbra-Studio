// Booru post from any source
export interface BooruPost {
  id: string;
  source: string;
  previewUrl: string;
  fullUrl: string;
  md5: string;
  width: number;
  height: number;
  score: number;
  rating: 'safe' | 'questionable' | 'explicit';
  tags: string[];
  fileSize?: number;
  fileExt: string;
}

// Search tab state
export interface SearchTab {
  id: string;
  name: string;
  tags: string;
  sources: string[];
  results: BooruPost[];
  selected: Set<string>;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
}

// Download queue item
export interface DownloadItem {
  id: string;
  post: BooruPost;
  dataset: string;
  concept: string;
  status: 'queued' | 'downloading' | 'done' | 'error';
  progress: number;
  error?: string;
}

// Dataset with concepts
export interface Dataset {
  name: string;
  path: string;
  archive?: {
    path: string;
    size: number;
    modifiedMs: number;
  } | null;
  concepts: Concept[];
}

// Concept folder (e.g., "10_base")
export interface Concept {
  name: string;
  repeats: number;
  isReg: boolean;
  images: DatasetImage[];
}

// Image in a dataset
export interface DatasetImage {
  filename: string;
  path: string;
  caption?: string;
  width?: number;
  height?: number;
  tags?: string[]; // Original booru tags if available
}

// Booru source configuration
export interface BooruSource {
  id: string;
  name: string;
  icon: string;
  color: string;
  baseUrl: string;
  searchUrl: (tags: string, page: number, limit: number) => string;
  autocompleteUrl: (query: string) => string;
  parseResults: (data: any) => BooruPost[];
  parseAutocomplete: (data: any) => string[];
  postUrl: (id: string) => string;
}

// Board browser store state
export interface BoardState {
  // Search
  searchTabs: SearchTab[];
  activeSearchTabId: string | null;
  favorites: string[];
  searchHistory: string[];

  // Downloads
  downloadQueue: DownloadItem[];
  isDownloading: boolean;

  // Settings
  enabledSources: string[];
  defaultRepeats: number;

  // Actions
  addSearchTab: () => void;
  removeSearchTab: (id: string) => void;
  setActiveSearchTab: (id: string) => void;
  updateSearchTab: (id: string, updates: Partial<SearchTab>) => void;

  addFavorite: (query: string) => void;
  removeFavorite: (query: string) => void;
  addSearchHistory: (query: string) => void;

  addToDownloadQueue: (items: Omit<DownloadItem, 'id' | 'status' | 'progress'>[]) => void;
  updateDownloadItem: (id: string, updates: Partial<DownloadItem>) => void;
  removeFromDownloadQueue: (id: string) => void;
  clearDownloadQueue: () => void;

  setIsDownloading: (value: boolean) => void;
  toggleSource: (sourceId: string) => void;
  setDefaultRepeats: (value: number) => void;
}
