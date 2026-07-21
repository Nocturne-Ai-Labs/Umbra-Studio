import { useEffect, useState } from 'react';
import { BarChart3, Database, Search, Download, FolderOpen, GraduationCap } from 'lucide-react';
import { SearchTab } from './SearchTab';
import { DownloadsTab } from './DownloadsTab';
import { DatasetsTab } from './DatasetsTab';
import { DatasetResearchTab } from './DatasetResearchTab';
import { DanbooruDatasetGeneratorTab } from './DanbooruDatasetGeneratorTab';
import { AIToolkitTab } from './AIToolkitTab';
import { useBoardStore } from './hooks/useBoardStore';
import type { BooruPost } from './types';
import { logDiagnostic } from '@/lib/diagnostics';

type Tab = 'search' | 'research' | 'generator' | 'downloads' | 'datasets' | 'aitoolkit';

export function BoardBrowser() {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [aitoolkitVisited, setAIToolkitVisited] = useState(false);
  const { addToDownloadQueue, downloadQueue } = useBoardStore();

  // Handle download from search - now supports multiple concepts
  const handleDownload = (posts: BooruPost[], dataset: string, concepts: string[]) => {
    logDiagnostic('[Board] handleDownload called:', { posts: posts.length, dataset, concepts }, 'log');

    // Create download items for each post to each enabled concept
    const items: { post: BooruPost; dataset: string; concept: string }[] = [];
    for (const post of posts) {
      for (const concept of concepts) {
        items.push({ post, dataset, concept });
      }
    }

    logDiagnostic('[Board] Adding to queue:', { items: items.length }, 'log');
    addToDownloadQueue(items);
    setActiveTab('downloads');
  };

  // Badge count for downloads
  const pendingDownloads = downloadQueue.filter(
    i => i.status === 'queued' || i.status === 'downloading'
  ).length;

  useEffect(() => {
    if (activeTab === 'aitoolkit') setAIToolkitVisited(true);
  }, [activeTab]);

  const tabs: { id: Tab; label: string; icon: typeof Search; badge?: number }[] = [
    { id: 'search', label: 'Search', icon: Search },
    { id: 'research', label: 'Dataset Research', icon: BarChart3 },
    { id: 'generator', label: 'Danbooru Dataset Generator', icon: Database },
    { id: 'downloads', label: 'Downloads', icon: Download, badge: pendingDownloads },
    { id: 'datasets', label: 'Datasets', icon: FolderOpen },
    { id: 'aitoolkit', label: 'AI-Toolkit', icon: GraduationCap },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      {/* Tab bar */}
      <div className="glass-panel flex-shrink-0 flex items-center gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-2.5 py-1.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all ${
                isActive
                  ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.14)]'
                  : 'umbra-chip-neutral text-zinc-400 hover:border-white/18 hover:text-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] ${
                  isActive ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100' : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="flex-1" />
      </div>

      {/* Tab content */}
      <div className="relative flex-1 min-h-0">
        {activeTab === 'search' && <SearchTab onDownload={handleDownload} />}
        {activeTab === 'research' && <DatasetResearchTab onOpenSearch={() => setActiveTab('search')} />}
        {activeTab === 'generator' && <DanbooruDatasetGeneratorTab />}
        {activeTab === 'downloads' && <DownloadsTab />}
        {activeTab === 'datasets' && <DatasetsTab />}
        {aitoolkitVisited && (
          <div
            className="absolute inset-0"
            aria-hidden={activeTab !== 'aitoolkit'}
            style={{
              visibility: activeTab === 'aitoolkit' ? 'visible' : 'hidden',
              pointerEvents: activeTab === 'aitoolkit' ? 'auto' : 'none',
            }}
          >
            <AIToolkitTab isActive={activeTab === 'aitoolkit'} />
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export for convenience
export { useBoardStore } from './hooks/useBoardStore';
export type { BooruPost, Dataset, Concept, DatasetImage } from './types';
