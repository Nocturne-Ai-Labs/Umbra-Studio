import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, X, Star, Download, CheckSquare, Square, Loader2, FolderPlus, Pencil, History } from 'lucide-react';
import { SourceSelector } from './components/SourceSelector';
import { SearchInput } from './components/SearchInput';
import { ImageGrid } from './components/ImageGrid';
import { ApiKeysModal } from './components/ApiKeysModal';
import { BoardLightbox } from './components/BoardLightbox';
import { useBoardStore } from './hooks/useBoardStore';
import { useBooru } from './hooks/useBooru';
import { useDatasets } from './hooks/useDatasets';
import { useApiKeys } from './hooks/useApiKeys';
import type { BooruPost } from './types';

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

  const { search, error: searchError } = useBooru();
  const { config: apiKeyConfig } = useApiKeys();
  const { datasets, createDataset, renameDataset, createConcept } = useDatasets();

  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [enabledConcepts, setEnabledConcepts] = useState<Set<string>>(new Set());
  const [isCreatingConcept, setIsCreatingConcept] = useState(false);
  const [showNewConceptModal, setShowNewConceptModal] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptRepeats, setNewConceptRepeats] = useState(10);
  const [newConceptIsReg, setNewConceptIsReg] = useState(false);

  // Dataset modals
  const [showNewDatasetModal, setShowNewDatasetModal] = useState(false);
  const [showRenameDatasetModal, setShowRenameDatasetModal] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [isCreatingDataset, setIsCreatingDataset] = useState(false);
  const [isRenamingDataset, setIsRenamingDataset] = useState(false);

  // API Keys modal
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Refs for scroll container and loading state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  // Set initial active tab
  useEffect(() => {
    if (!activeSearchTabId && searchTabs.length > 0) {
      setActiveSearchTab(searchTabs[0].id);
    }
  }, [activeSearchTabId, searchTabs, setActiveSearchTab]);

  // Reset enabled concepts when dataset changes
  useEffect(() => {
    setEnabledConcepts(new Set());
  }, [selectedDataset]);

  const activeTab = searchTabs.find(t => t.id === activeSearchTabId) || searchTabs[0];

  const filteredResults = activeTab?.results || [];

  // Perform search
  const doSearch = useCallback(async (append = false, tagsOverride?: string) => {
    if (!activeTab || isLoadingRef.current) return;

    isLoadingRef.current = true;
    updateSearchTab(activeTab.id, { isLoading: true });
    const searchTags = String(tagsOverride ?? activeTab.tags).trim();
    if (!append) addSearchHistory(searchTags);

    const page = append ? activeTab.page + 1 : 1;
    const results = await search({
      sources: activeTab.sources,
      tags: searchTags,
      page,
      limit: 40,
    });

    // Deduplicate when appending paginated results
    let finalResults = results;
    if (append) {
      const existingIds = new Set(activeTab.results.map(p => p.id));
      const newResults = results.filter(p => !existingIds.has(p.id));
      finalResults = [...activeTab.results, ...newResults];
    }

    updateSearchTab(activeTab.id, {
      results: finalResults,
      page,
      hasMore: results.length >= 40,
      isLoading: false,
      tags: searchTags,
      name: searchTags.split(' ')[0] || 'Search',
    });
    isLoadingRef.current = false;
  }, [activeTab, addSearchHistory, search, updateSearchTab]);

  // Auto-load more when scrolled to bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !activeTab?.hasMore || isLoadingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Trigger when within 100px of bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      doSearch(true);
    }
  }, [activeTab?.hasMore, doSearch]);

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

  // Open lightbox on double-click
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
    setEnabledConcepts(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  // Handle download to all enabled concepts
  const handleDownload = async () => {
    if (!activeTab || !selectedDataset || enabledConcepts.size === 0) return;

    const selectedPosts = filteredResults.filter(p => activeTab.selected.has(p.id));
    if (selectedPosts.length === 0) return;

    onDownload(selectedPosts, selectedDataset, Array.from(enabledConcepts));
    selectNone();
  };

  // Create new concept
  const handleCreateConcept = async () => {
    if (!selectedDataset || !newConceptName.trim()) return;
    setIsCreatingConcept(true);
    const success = await createConcept(selectedDataset, newConceptName.trim(), newConceptRepeats, newConceptIsReg);
    if (success) {
      const folder = `${newConceptRepeats}_${newConceptIsReg ? 'reg_' : ''}${newConceptName.trim()}`;
      // Auto-enable the new concept
      setEnabledConcepts(prev => new Set([...prev, folder]));
    }
    setIsCreatingConcept(false);
    setShowNewConceptModal(false);
    setNewConceptName('');
    setNewConceptRepeats(10);
    setNewConceptIsReg(false);
  };

  // Create new dataset
  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) return;
    setIsCreatingDataset(true);
    const success = await createDataset(newDatasetName.trim());
    if (success) {
      setSelectedDataset(newDatasetName.trim());
    }
    setIsCreatingDataset(false);
    setShowNewDatasetModal(false);
    setNewDatasetName('');
  };

  // Rename dataset
  const handleRenameDataset = async () => {
    if (!selectedDataset || !newDatasetName.trim()) return;
    setIsRenamingDataset(true);
    const success = await renameDataset(selectedDataset, newDatasetName.trim());
    if (success) {
      setSelectedDataset(newDatasetName.trim().replace(/[^a-zA-Z0-9_-]/g, '_'));
    }
    setIsRenamingDataset(false);
    setShowRenameDatasetModal(false);
    setNewDatasetName('');
  };

  // Get concepts for selected dataset
  const datasetObj = datasets.find(d => d.name === selectedDataset);
  const concepts = datasetObj?.concepts || [];

  return (
    <div className="h-full flex flex-col bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      {/* Tab bar */}
      <div className="glass-panel custom-scrollbar flex-shrink-0 flex items-center gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-2 py-1">
        <button
          onClick={addSearchTab}
          className="umbra-icon-button flex-shrink-0 rounded p-1.5 transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          title="New Tab"
        >
          <Plus className="w-4 h-4" />
        </button>

        {searchTabs.map(tab => (
          <div
            key={tab.id}
            className={`flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1 text-xs transition-colors ${
              tab.id === activeSearchTabId ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100' : 'umbra-chip-neutral text-zinc-400'
            }`}
            onClick={() => setActiveSearchTab(tab.id)}
          >
            <span className="text-xs truncate max-w-24">{tab.name}</span>
            {searchTabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSearchTab(tab.id);
                }}
                className="p-0.5 rounded opacity-50 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <div className="glass-panel custom-scrollbar w-44 flex-shrink-0 space-y-3 overflow-y-auto rounded-none border-y-0 border-l-0 p-2">
          <SourceSelector
            selected={activeTab?.sources || []}
            onChange={(sources) => updateSearchTab(activeTab.id, { sources })}
            apiConfig={apiKeyConfig}
            onOpenApiKeys={() => setShowApiKeysModal(true)}
          />

          <div className="pt-2" style={{ borderTop: '1px solid var(--umbra-border)' }}>
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

          <div className="pt-2" style={{ borderTop: '1px solid var(--umbra-border)' }}>
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
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search bar - compact */}
          <div className="glass-panel relative z-20 flex-shrink-0 rounded-none border-x-0 border-t-0 px-2 py-1.5">
            <div className="flex gap-1.5 items-center">
              <div className="flex-1">
                <SearchInput
                  value={activeTab?.tags || ''}
                  onChange={(tags) => updateSearchTab(activeTab.id, { tags })}
                  onSearch={() => doSearch(false)}
                  source={activeTab?.sources[0] || 'danbooru'}
                />
              </div>
              <button
                onClick={() => addFavorite(activeTab?.tags || '')}
                disabled={!activeTab?.tags}
                className="p-1.5 transition-colors disabled:opacity-30"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => !e.currentTarget.disabled && (e.currentTarget.style.color = '#eab308')}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                title="Add to favorites"
              >
                <Star className="w-4 h-4" />
              </button>
            </div>

            {searchError && (
              <div className="mt-1 rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                {searchError}
              </div>
            )}

            {/* Results info - inline */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {filteredResults.length} results
                {(activeTab?.selected.size || 0) > 0 && (
                  <span style={{ color: 'var(--umbra-accent)' }} className="ml-1.5">
                    ({activeTab?.selected.size} selected)
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={selectAll}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-colors"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                >
                  <CheckSquare className="w-3 h-3" />
                  All
                </button>
                <button
                  onClick={selectNone}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-colors"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                >
                  <Square className="w-3 h-3" />
                  None
                </button>
              </div>
            </div>
          </div>

          {/* Image grid with infinite scroll */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="custom-scrollbar flex-1 overflow-y-auto">
            <ImageGrid
              posts={filteredResults}
              selected={activeTab?.selected || new Set()}
              onSelect={toggleSelect}
              onImageDoubleClick={openLightbox}
              isLoading={activeTab?.isLoading}
            />

            {/* Load more button */}
            {filteredResults.length > 0 && (
              <div className="p-4 flex justify-center">
                {activeTab?.isLoading ? (
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </div>
                ) : activeTab?.hasMore ? (
                  <button
                    onClick={() => doSearch(true)}
                    className="px-4 py-1.5 rounded text-xs font-medium transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      color: 'var(--umbra-text)',
                      border: '1px solid var(--umbra-border)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
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
      </div>

      {/* Download bar with concept toggles */}
      <div className="glass-panel flex-shrink-0 rounded-none border-x-0 border-b-0 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>Download to:</span>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="settings-input !py-1 !text-xs !w-auto min-w-[100px]"
            >
              <option value="">Dataset...</option>
              {datasets.map(d => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            <button
              onClick={() => setShowNewDatasetModal(true)}
              className="p-1 rounded transition-colors"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              title="Create new dataset"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {selectedDataset && (
              <button
                onClick={() => {
                  setNewDatasetName(selectedDataset);
                  setShowRenameDatasetModal(true);
                }}
                className="p-1 rounded transition-colors"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                title="Rename dataset"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Concept toggles */}
          {selectedDataset && concepts.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
              {concepts.slice(0, 20).map(c => {
                const folder = `${c.repeats}_${c.isReg ? 'reg_' : ''}${c.name}`;
                const isEnabled = enabledConcepts.has(folder);
                return (
                  <button
                    key={folder}
                    onClick={() => toggleConcept(folder)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                    style={{
                      background: isEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: isEnabled ? '#22c55e' : '#ef4444',
                      border: `1px solid ${isEnabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    }}
                    title={isEnabled ? 'Click to ignore' : 'Click to enable'}
                  >
                    {folder}
                  </button>
                );
              })}
            </div>
          )}

          {selectedDataset && (
            <button
              onClick={() => setShowNewConceptModal(true)}
              className="p-1 rounded transition-colors flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--umbra-accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
              title="Add new concept"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleDownload}
            disabled={!selectedDataset || enabledConcepts.size === 0 || (activeTab?.selected.size || 0) === 0}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all disabled:opacity-40 flex-shrink-0"
            style={{
              background: 'var(--umbra-accent)',
              color: 'white',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Download {activeTab?.selected.size || 0}
            {enabledConcepts.size > 1 && ` x ${enabledConcepts.size}`}
          </button>
        </div>
      </div>

      {/* New Concept Modal */}
      {showNewConceptModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-panel p-4 w-72" style={{ background: 'var(--umbra-panel)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--umbra-text)' }}>New Concept</h3>

            <div className="space-y-2">
              <input
                type="text"
                value={newConceptName}
                onChange={(e) => setNewConceptName(e.target.value)}
                placeholder="Concept name..."
                autoFocus
                className="settings-input !text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateConcept()}
              />

              <div className="flex items-center gap-2">
                <label className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Repeats:</label>
                <input
                  type="number"
                  value={newConceptRepeats}
                  onChange={(e) => setNewConceptRepeats(parseInt(e.target.value) || 1)}
                  min={1}
                  max={100}
                  className="settings-input !py-1 !text-xs !w-16"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newConceptIsReg}
                  onChange={(e) => setNewConceptIsReg(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: 'var(--umbra-accent)' }}
                />
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>Regularization images</span>
              </label>
            </div>

            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Folder: {newConceptRepeats}_{newConceptIsReg ? 'reg_' : ''}{newConceptName || 'name'}
            </p>

            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowNewConceptModal(false);
                  setNewConceptName('');
                  setNewConceptRepeats(10);
                  setNewConceptIsReg(false);
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

      {/* New Dataset Modal */}
      {showNewDatasetModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-panel p-4 w-72" style={{ background: 'var(--umbra-panel)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--umbra-text)' }}>New Dataset</h3>

            <input
              type="text"
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              placeholder="Dataset name..."
              autoFocus
              className="settings-input !text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDataset()}
            />

            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Special characters will be replaced with underscores
            </p>

            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowNewDatasetModal(false);
                  setNewDatasetName('');
                }}
                className="px-3 py-1 text-xs transition-colors"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDataset}
                disabled={!newDatasetName.trim() || isCreatingDataset}
                className="px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                style={{ background: 'var(--umbra-accent)', color: 'white' }}
              >
                {isCreatingDataset ? 'Creating...' : 'Create'}
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

            <div className="flex justify-end gap-2 mt-3">
              <button
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
