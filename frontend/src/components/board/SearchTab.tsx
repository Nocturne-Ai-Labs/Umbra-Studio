import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Plus, X, Star, Download, CheckSquare, Square, Loader2, History, SlidersHorizontal, Search, FolderOpen } from 'lucide-react';
import { SourceSelector } from './components/SourceSelector';
import { SearchInput } from './components/SearchInput';
import { ImageGrid } from './components/ImageGrid';
import { ApiKeysModal } from './components/ApiKeysModal';
import { BoardLightbox } from './components/BoardLightbox';
import { DownloadDestinationPanel } from './components/DownloadDestinationPanel';
import { CollectionSettings } from './components/CollectionSettings';
import { SourceSearchTools } from './components/SourceSearchTools';
import { sourceSearchQueryKey } from './sourceSearchTools';
import { BOORU_SOURCES } from './sources';
import { useBoardStore } from './hooks/useBoardStore';
import { useBooru } from './hooks/useBooru';
import { useDatasets } from './hooks/useDatasets';
import { useApiKeys } from './hooks/useApiKeys';
import type { BooruPost } from './types';
import { DEFAULT_COLLECTION_OPTIONS, collectionOptionsError, filterCollectionPosts, collectionDownloadBatch, collectionSelectionAfterChange, validCollectionDestination, type CollectionOptions } from './collectionOptions';

interface SearchTabProps {
  onDownload: (posts: BooruPost[], dataset: string, concepts: string[]) => void;
}

export function SearchTab({ onDownload }: SearchTabProps) {
  const {
    searchTabs,
    activeSearchTabId,
    favorites,
    searchHistory,
    addSearchTab,
    removeSearchTab,
    setActiveSearchTab,
    updateSearchTab,
    addFavorite,
    removeFavorite,
    addSearchHistory,
  } = useBoardStore();
  const activeTab = searchTabs.find(t => t.id === activeSearchTabId) || searchTabs[0];

  const { search } = useBooru();
  const searchError = activeTab?.searchError;
  const pendingSearch = !!activeTab?.resultQuery && activeTab.resultQuery !== sourceSearchQueryKey(activeTab.tags, activeTab.sources, activeTab.sourceSearch);
  const { config: apiKeyConfig } = useApiKeys();
  const { datasets, renameDataset, createDataset, fetchDatasets, hasLoaded, isLoading: foldersLoading, error: datasetError } = useDatasets();
  const [datasetActionError, setDatasetActionError] = useState('');

  const selectedDataset = activeTab?.downloadDestination?.dataset || '';
  const enabledConcepts = useMemo(() => new Set(activeTab?.downloadDestination?.concepts || []), [activeTab?.downloadDestination]);
  const setSelectedDataset = (name: string) => {
    if (!activeTab || name === selectedDataset) return;
    const selected = datasets.find(dataset => dataset.name === name);
    updateSearchTab(activeTab.id, { downloadDestination: { dataset: name, concepts: selected?.layout === 'flat' ? [name] : [] } });
  };
  const [isCreatingConcept, setIsCreatingConcept] = useState(false);
  const [showNewConceptModal, setShowNewConceptModal] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [destinationOpen, setDestinationOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const [checkingDestination, setCheckingDestination] = useState(false);

  // Dataset modals
  const [showRenameDatasetModal, setShowRenameDatasetModal] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [isRenamingDataset, setIsRenamingDataset] = useState(false);

  useEffect(() => {
    if (!hasLoaded || foldersLoading || datasetError || isRenamingDataset) return;
    for (const tab of useBoardStore.getState().searchTabs) {
      const valid = validCollectionDestination(tab.downloadDestination, datasets);
      if (JSON.stringify(valid) !== JSON.stringify(tab.downloadDestination)) {
        updateSearchTab(tab.id, { downloadDestination: valid });
      }
    }
  }, [datasets, hasLoaded, foldersLoading, datasetError, isRenamingDataset, updateSearchTab]);

  // API Keys modal
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Refs for scroll container and loading state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const searchControllerRef = useRef<AbortController | null>(null);
  const loadingTabIdRef = useRef<string | null>(null);

  useEffect(() => () => { searchControllerRef.current?.abort(); }, []);

  // Set initial active tab
  useEffect(() => {
    if (!activeSearchTabId && searchTabs.length > 0) {
      setActiveSearchTab(searchTabs[0].id);
    }
  }, [activeSearchTabId, searchTabs, setActiveSearchTab]);

  const collection = activeTab?.collection || DEFAULT_COLLECTION_OPTIONS;
  const collectionError = collectionOptionsError(collection);
  const filteredResults = useMemo(() => filterCollectionPosts(activeTab?.results || [], collection), [activeTab?.results, collection]);
  const downloadBatch = useMemo(() => collectionDownloadBatch(activeTab?.results || [], activeTab?.selected || new Set(), collection), [activeTab?.results, activeTab?.selected, collection]);
  const updateCollection = (patch: Partial<CollectionOptions>) => {
    if (!activeTab) return;
    const next = { ...collection, ...patch };
    updateSearchTab(activeTab.id, { collection: next, selected: collectionSelectionAfterChange(activeTab.results, activeTab.selected, next) });
    setLightboxOpen(false);
  };

  // Perform search
  const doSearch = useCallback(async (append = false, tagsOverride?: string) => {
    if (!activeTab || (append && loadingTabIdRef.current === activeTab.id)) return;
    const tab = useBoardStore.getState().searchTabs.find(item => item.id === activeTab.id);
    if (!tab) return;
    if (searchControllerRef.current) {
      searchControllerRef.current.abort();
      if (loadingTabIdRef.current) updateSearchTab(loadingTabIdRef.current, { isLoading: false });
    }
    const searchTags = String(tagsOverride ?? tab.tags).trim();
    const sources = [...tab.sources];
    const queryKey = sourceSearchQueryKey(searchTags, sources, tab.sourceSearch);
    if (append && tab.resultQuery !== queryKey) return;
    if (sources.some(source => {
      const score = tab.sourceSearch?.[source]?.score;
      return score?.trim() && !Number.isSafeInteger(Number(score));
    })) {
      updateSearchTab(tab.id, { isLoading: false, searchError: 'Site minimum score must be a whole number, or leave it blank.' });
      return;
    }
    const appendPage = append && tab.resultQuery === queryKey;
    const controller = new AbortController();
    searchControllerRef.current = controller;
    isLoadingRef.current = true;
    loadingTabIdRef.current = tab.id;
    updateSearchTab(tab.id, { isLoading: true, tags: searchTags, searchError: null });
    if (!appendPage) addSearchHistory(searchTags);

    const page = appendPage ? tab.page + 1 : 1;
    const exhaustedSources = new Set(appendPage ? tab.exhaustedSources || [] : []);
    let pageInfo: Record<string, boolean> | null = null;
    try {
      const results = await search({
        sources: sources.filter(source => !exhaustedSources.has(source)),
        tags: searchTags,
        sourceSearch: tab.sourceSearch,
        page,
        limit: 40,
        signal: controller.signal,
        onPageInfo: (info) => { pageInfo = info; },
        onError: (error) => {
          const current = useBoardStore.getState().searchTabs.find(item => item.id === tab.id);
          if (!controller.signal.aborted && current && sourceSearchQueryKey(current.tags, current.sources, current.sourceSearch) === queryKey) updateSearchTab(tab.id, { searchError: error });
        },
      });
      if (results === null || controller.signal.aborted) return;
      const currentTab = useBoardStore.getState().searchTabs.find(item => item.id === tab.id);
      if (!currentTab || sourceSearchQueryKey(currentTab.tags, currentTab.sources, currentTab.sourceSearch) !== queryKey) return;
      if (pageInfo) for (const [source, hasMore] of Object.entries(pageInfo)) {
        if (!hasMore) exhaustedSources.add(source);
      }

      // Deduplicate when appending paginated results.
      let finalResults = results;
      if (appendPage) {
        const existingIds = new Set(currentTab.results.map(p => p.id));
        finalResults = [...currentTab.results, ...results.filter(p => !existingIds.has(p.id))];
      }

      updateSearchTab(tab.id, {
        results: finalResults,
        resultQuery: queryKey,
        selected: appendPage ? currentTab.selected : new Set(),
        page,
        hasMore: sources.some(source => !exhaustedSources.has(source)) && (pageInfo !== null || results.length >= 40),
        exhaustedSources: [...exhaustedSources],
        tags: searchTags,
        name: searchTags.split(' ')[0] || 'Search',
      });
    } finally {
      if (searchControllerRef.current === controller) {
        updateSearchTab(tab.id, { isLoading: false });
        isLoadingRef.current = false;
        loadingTabIdRef.current = null;
        searchControllerRef.current = null;
      }
    }
  }, [activeTab, addSearchHistory, search, updateSearchTab]);

  // Auto-load more when scrolled to bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !activeTab?.hasMore || pendingSearch || (isLoadingRef.current && loadingTabIdRef.current === activeTab.id) || searchError) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Trigger when within 100px of bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      doSearch(true);
    }
  }, [activeTab?.hasMore, doSearch, searchError, pendingSearch]);

  // Toggle selection
  const toggleSelect = (postId: string, selected: boolean) => {
    if (!activeTab) return;

    const newSelected = new Set(activeTab.selected);
    if (selected) {
      newSelected.add(postId);
    } else {
      newSelected.delete(postId);
    }
    updateSearchTab(activeTab.id, { selected: newSelected });
  };

  // Select all / none
  const selectAll = () => {
    if (!activeTab) return;
    const allIds = new Set(filteredResults.map(p => p.id));
    updateSearchTab(activeTab.id, { selected: allIds });
  };

  const selectNone = () => {
    if (!activeTab) return;
    updateSearchTab(activeTab.id, { selected: new Set() });
  };

  // Open lightbox with the thumbnail's preview button.
  const openLightbox = (_post: BooruPost, index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Add tag to current search from lightbox
  const handleAddTag = (tag: string) => {
    if (!activeTab) return;
    const currentTags = activeTab.tags.trim();
    // Don't add if already present
    if (currentTags.split(' ').includes(tag)) return;
    const newTags = currentTags ? `${currentTags} ${tag}` : tag;
    updateSearchTab(activeTab.id, { tags: newTags });
  };

  // Toggle concept enabled/disabled
  const toggleConcept = (folder: string) => {
    if (!activeTab) return;
    const next = new Set(enabledConcepts);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    updateSearchTab(activeTab.id, { downloadDestination: { dataset: selectedDataset, concepts: [...next] } });
  };

  // Recheck the folder catalog before queueing; folders may have changed in Datasets.
  const handleDownload = async () => {
    if (!activeTab || checkingDestination) return;
    setDatasetActionError('');
    setCheckingDestination(true);
    try {
      const catalog = await fetchDatasets();
      const state = useBoardStore.getState();
      const tab = state.searchTabs.find(item => item.id === activeTab.id);
      if (!tab || state.activeSearchTabId !== tab.id) return;
      if (!catalog) {
        setDatasetActionError('Could not verify the download folder. Refresh folders and try again.');
        return;
      }
      const destination = validCollectionDestination(tab.downloadDestination, catalog);
      if (!destination?.concepts.length || JSON.stringify(destination) !== JSON.stringify(tab.downloadDestination)) {
        updateSearchTab(tab.id, { downloadDestination: destination });
        setDatasetActionError('The destination changed. Choose a download folder again; your media selection is kept.');
        setDestinationOpen(true);
        return;
      }
      const posts = collectionDownloadBatch(tab.results, tab.selected, tab.collection || DEFAULT_COLLECTION_OPTIONS);
      if (!posts.length) return;
      onDownload(posts, destination.dataset, destination.concepts);
      const queued = new Set(posts.map(post => post.id));
      updateSearchTab(tab.id, { selected: new Set([...tab.selected].filter(id => !queued.has(id))) });
    } finally {
      setCheckingDestination(false);
    }
  };

  // Create a plain dataset folder
  const handleCreateConcept = async () => {
    if (!newConceptName.trim() || isCreatingConcept) return;
    setDatasetActionError('');
    setIsCreatingConcept(true);
    const folder = await createDataset(newConceptName.trim());
    setIsCreatingConcept(false);
    if (!folder) {
      setDatasetActionError('Could not create dataset folder');
      return;
    }
    // Select the new folder
    if (activeTab) updateSearchTab(activeTab.id, { downloadDestination: { dataset: folder, concepts: [folder] } });
    setShowNewConceptModal(false);
    setNewConceptName('');
  };

  // Rename dataset
  const handleRenameDataset = async () => {
    if (!selectedDataset || !newDatasetName.trim()) return;
    setDatasetActionError('');
    setIsRenamingDataset(true);
    const renamed = await renameDataset(selectedDataset, newDatasetName.trim());
    setIsRenamingDataset(false);
    if (!renamed) {
      setDatasetActionError('Could not rename dataset');
      return;
    }
    for (const tab of useBoardStore.getState().searchTabs) {
      if (tab.downloadDestination?.dataset !== selectedDataset) continue;
      updateSearchTab(tab.id, { downloadDestination: {
        dataset: renamed,
        concepts: tab.downloadDestination.concepts.map(folder => folder === selectedDataset ? renamed : folder),
      } });
    }
    setShowRenameDatasetModal(false);
    setNewDatasetName('');
  };

  return (
    <div
      data-umbra-data-forge-search
      className="h-full min-h-0 flex flex-col bg-[var(--umbra-bg)] text-[var(--umbra-text)]"
      style={{ fontFamily: 'var(--font-family)' }}
    >
      {/* Tab bar */}
      <div
        data-umbra-data-forge-search-tabs
        className="glass-panel custom-scrollbar flex-shrink-0 flex items-center gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-2 py-1"
      >
        <button
          type="button"
          onClick={addSearchTab}
          className="forge-button forge-button-icon"
          aria-label="New search tab"
          title="New search tab"
        >
          <Plus className="w-4 h-4" />
        </button>

        {searchTabs.map(tab => (
          <div
            key={tab.id}
            className={`flex shrink-0 items-center gap-1 rounded border pr-1 text-xs ${
              tab.id === activeSearchTabId ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]' : 'border-white/10 text-zinc-400'
            }`}
          >
            <button type="button" aria-pressed={tab.id === activeSearchTabId} onClick={() => setActiveSearchTab(tab.id)} className="min-h-8 max-w-44 truncate rounded px-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]">{tab.name}</button>
            {searchTabs.length > 1 && (
              <button
                type="button"
                aria-label={`Close search: ${tab.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeSearchTab(tab.id);
                }}
                className="umbra-icon-button rounded p-1.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div data-umbra-data-forge-search-main className="relative flex-1 flex min-h-0">
        {mobileFiltersOpen && (
          <button
            type="button"
            data-umbra-data-forge-filter-backdrop
            aria-label="Close source filters"
            onClick={() => setMobileFiltersOpen(false)}
          />
        )}

        {/* Left sidebar */}
        <div
          data-umbra-data-forge-sources
          data-open={mobileFiltersOpen ? 'true' : 'false'}
          className="glass-panel custom-scrollbar w-52 flex-shrink-0 space-y-4 overflow-y-auto rounded-none border-y-0 border-l-0 p-3"
        >
          <div data-umbra-data-forge-filter-header>
            <span>Search source</span>
            <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close source filters">
              <X className="h-5 w-5" />
            </button>
          </div>

          <SourceSelector
            selected={activeTab?.sources[0] || 'danbooru'}
            onChange={(source) => {
              if (!activeTab || activeTab.sources[0] === source) return;
              if (loadingTabIdRef.current === activeTab.id) searchControllerRef.current?.abort();
              setLightboxOpen(false);
              updateSearchTab(activeTab.id, { sources: [source] });
            }}
            apiConfig={apiKeyConfig}
            onOpenApiKeys={() => setShowApiKeysModal(true)}
          />

          <div className="border-t border-white/10 pt-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Recent searches
            </div>
            <div className="space-y-0.5">
              {searchHistory.map(query => (
                <button
                  key={query}
                  type="button"
                  onClick={() => updateSearchTab(activeTab.id, { tags: query })}
                  onDoubleClick={() => {
                    updateSearchTab(activeTab.id, { tags: query });
                    void doSearch(false, query);
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                  title="Double-click to search"
                >
                  <History className="h-3 w-3 shrink-0" />
                  <span className="truncate">{query}</span>
                </button>
              ))}
              {searchHistory.length === 0 && (
                <p className="px-1.5 text-[10px] italic" style={{ color: 'rgba(255,255,255,0.4)' }}>No recent searches</p>
              )}
            </div>
          </div>

          <SourceSearchTools source={activeTab?.sources[0] || 'danbooru'} value={activeTab?.sourceSearch || {}}
            onChange={sourceSearch => updateSearchTab(activeTab.id, { sourceSearch })} />

          <div className="border-t border-white/10 pt-3">
            <div className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Favorites
            </div>
            <div className="space-y-0.5">
              {favorites.map(fav => (
                <div
                  key={fav}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer group transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    updateSearchTab(activeTab.id, { tags: fav });
                    void doSearch(false, fav);
                  }}
                >
                  <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--umbra-text)' }}>{fav}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(fav);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {favorites.length === 0 && (
                <p className="text-[10px] italic px-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>No favorites yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Center content */}
        <div data-umbra-data-forge-results className="flex-1 flex flex-col min-w-0">
          {/* Search bar - compact */}
          <div
            data-umbra-data-forge-search-bar
            className="glass-panel relative z-20 flex-shrink-0 rounded-none border-x-0 border-t-0 px-3 py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-xs font-semibold">Find media</h2><span className="text-[11px] text-zinc-500">{BOORU_SOURCES[activeTab?.sources[0] || 'danbooru']?.name}</span></div>
            <div className="flex gap-1.5 items-start">
              <button
                type="button"
                data-umbra-data-forge-filter-button
                aria-label="Choose source and recent searches"
                title="Source and search history"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <SearchInput
                  value={activeTab?.tags || ''}
                  onChange={(tags) => updateSearchTab(activeTab.id, { tags })}
                  onSearch={() => doSearch(false)}
                  source={activeTab?.sources[0] || 'danbooru'}
                  placeholder="Type tags… try blue hair or -watermark"
                />
              </div>
              <button type="button" onClick={() => void doSearch(false)} disabled={activeTab?.isLoading} className="forge-button forge-button-primary h-10">
                {activeTab?.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {activeTab?.isLoading ? 'Searching…' : 'Search'}
              </button>
              <button
                type="button"
                aria-label="Save search to favorites"
                onClick={() => addFavorite(activeTab?.tags || '')}
                disabled={!activeTab?.tags}
                className="forge-button forge-button-icon h-10"
                title="Add to favorites"
              >
                <Star className="w-4 h-4" />
              </button>
            </div>

            {searchError && (
              <div role="alert" className="mt-2 rounded border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {searchError}
              </div>
            )}

            {pendingSearch && <p role="status" className="mt-2 text-xs text-amber-200">Search changed. Press Search to update these results.</p>}

            {/* Results info - inline */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {filteredResults.length} loaded matches{activeTab?.results.length !== filteredResults.length && ` / ${activeTab?.results.length || 0} loaded`}
                {(activeTab?.selected.size || 0) > 0 && (
                  <span style={{ color: 'var(--umbra-accent)' }} className="ml-1.5">
                    ({activeTab?.selected.size} selected)
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={filteredResults.length === 0}
                  className="forge-button"
                >
                  <CheckSquare className="w-3 h-3" />
                  Select loaded
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  disabled={!activeTab?.selected.size}
                  className="forge-button"
                >
                  <Square className="w-3 h-3" />
                  Clear selection
                </button>
              </div>
            </div>
            <CollectionSettings value={collection} onChange={updateCollection} />
          </div>

          {/* Image grid with infinite scroll */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            data-umbra-data-forge-image-results
            className="custom-scrollbar flex-1 overflow-y-auto"
          >
            <ImageGrid
              posts={filteredResults}
              selected={activeTab?.selected || new Set()}
              onSelect={toggleSelect}
              onImagePreview={openLightbox}
              isLoading={activeTab?.isLoading}
              hasSearched={!!activeTab?.resultQuery}
            />

            {/* Load more button */}
            {!!activeTab?.resultQuery && (
              <div className="p-4 flex justify-center">
                {activeTab?.isLoading ? (
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </div>
                ) : pendingSearch ? (
                  <span className="text-xs text-zinc-500">Press Search to load the updated query.</span>
                ) : activeTab?.hasMore ? (
                  <button
                    onClick={() => doSearch(true)}
                    type="button"
                    className="forge-button"
                  >
                    Load More
                  </button>
                ) : (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    End of results
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {destinationOpen && <>
          <button type="button" aria-label="Dismiss download folders" className="absolute inset-0 z-30 bg-black/60 xl:hidden" onClick={() => setDestinationOpen(false)} />
          <DownloadDestinationPanel datasets={datasets} selected={selectedDataset} folders={enabledConcepts}
            loading={foldersLoading} error={datasetError} onSelect={setSelectedDataset} onToggle={toggleConcept}
            onCreate={() => { setDatasetActionError(''); setShowNewConceptModal(true); }}
            onRename={() => { setNewDatasetName(selectedDataset); setDatasetActionError(''); setShowRenameDatasetModal(true); }}
            onRefresh={() => { setDatasetActionError(''); void fetchDatasets(); }} onClose={() => setDestinationOpen(false)} />
        </>}
      </div>

      {/* Download action bar */}
      <div
        data-umbra-data-forge-download-bar
        className="glass-panel flex-shrink-0 rounded-none border-x-0 border-b-0 px-3 py-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="forge-button min-w-0 max-w-full" aria-expanded={destinationOpen} aria-controls="booru-download-folders" onClick={() => setDestinationOpen(open => !open)} title={selectedDataset || 'Choose download folder'}>
            <FolderOpen size={14} className="shrink-0" /><span className="truncate">{selectedDataset || 'Download folder'}</span>
          </button>

          <button
            type="button"
            data-umbra-data-forge-download-button
            onClick={handleDownload}
            disabled={checkingDestination || foldersLoading || !!datasetError || !selectedDataset || enabledConcepts.size === 0 || downloadBatch.length === 0 || !!collectionError}
            className="forge-button forge-button-primary ml-auto"
          >
            <Download className="w-3.5 h-3.5" />
            {checkingDestination ? 'Checking folder…' : 'Download selected'}{downloadBatch.length ? ` (${downloadBatch.length}${downloadBatch.length < (activeTab?.selected.size || 0) ? ` of ${activeTab?.selected.size}` : ''})` : ''}
            {enabledConcepts.size > 1 && ` x ${enabledConcepts.size}`}
          </button>
        </div>
        <p role="status" className="mt-2 text-[11px] text-zinc-500">{!selectedDataset ? 'Choose a destination folder, then select media to download.' : enabledConcepts.size === 0 ? 'Choose at least one subfolder in the download folder panel.' : !downloadBatch.length ? 'Select media in the grid. Use the preview button for a closer look.' : `${downloadBatch.length} selected files → ${enabledConcepts.size} destination${enabledConcepts.size === 1 ? '' : 's'} (${downloadBatch.length * enabledConcepts.size} downloads). Highest scores first; remaining selections are kept.`}</p>
        {datasetActionError && !showNewConceptModal && !showRenameDatasetModal && <p role="alert" className="mt-2 text-xs text-red-300">{datasetActionError}</p>}
      </div>

      {/* New dataset folder */}
      {showNewConceptModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-panel p-4 w-72" style={{ background: 'var(--umbra-panel)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--umbra-text)' }}>New dataset folder</h3>

            <div className="space-y-2">
              <input
                type="text"
                value={newConceptName}
                onChange={(e) => setNewConceptName(e.target.value)}
                aria-label="Dataset folder name" placeholder="Folder name…"
                autoFocus
                className="settings-input !text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateConcept()}
              />

            </div>

            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Folder: {newConceptName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'name'}
            </p>
            {datasetActionError && <p role="alert" className="mt-2 text-xs text-red-300">{datasetActionError}</p>}

            <div className="flex justify-end gap-2 mt-3">
              <button
                disabled={isCreatingConcept}
                onClick={() => {
                  setShowNewConceptModal(false);
                  setNewConceptName('');
                }}
                className="px-3 py-1 text-xs transition-colors"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConcept}
                disabled={!newConceptName.trim() || isCreatingConcept}
                className="px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                style={{ background: 'var(--umbra-accent)', color: 'white' }}
              >
                {isCreatingConcept ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dataset Modal */}
      {showRenameDatasetModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-panel p-4 w-72" style={{ background: 'var(--umbra-panel)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--umbra-text)' }}>Rename Dataset</h3>

            <input
              type="text"
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              placeholder="New name..."
              autoFocus
              className="settings-input !text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleRenameDataset()}
            />

            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Renaming "{selectedDataset}" to "{newDatasetName.replace(/[^a-zA-Z0-9_-]/g, '_') || '...'}"
            </p>
            {datasetActionError && <p role="alert" className="mt-2 text-xs text-red-300">{datasetActionError}</p>}

            <div className="flex justify-end gap-2 mt-3">
              <button
                disabled={isRenamingDataset}
                onClick={() => {
                  setShowRenameDatasetModal(false);
                  setNewDatasetName('');
                }}
                className="px-3 py-1 text-xs transition-colors"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRenameDataset}
                disabled={!newDatasetName.trim() || isRenamingDataset || newDatasetName === selectedDataset}
                className="px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                style={{ background: 'var(--umbra-accent)', color: 'white' }}
              >
                {isRenamingDataset ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Modal */}
      <ApiKeysModal
        isOpen={showApiKeysModal}
        onClose={() => setShowApiKeysModal(false)}
      />

      {/* Lightbox */}
      {lightboxOpen && filteredResults.length > 0 && (
        <BoardLightbox
          posts={filteredResults}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onAddTag={handleAddTag}
        />
      )}
    </div>
  );
}
