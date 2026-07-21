'use client';

import { useState, useEffect } from 'react';
import {
    Download,
    Search,
    Filter,
    ChevronDown,
    HardDrive,
    Cloud,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface CivitAIModel {
    id: number;
    name: string;
    description: string;
    type: string;
    nsfw: boolean;
    tags: string[];
    creator: {
        username: string;
        image: string | null;
    };
    stats: {
        downloadCount: number;
        favoriteCount: number;
        commentCount: number;
        ratingCount: number;
        rating: number;
    };
    modelVersions: Array<{
        id: number;
        name: string;
        description: string;
        baseModel: string;
        files: Array<{
            name: string;
            sizeKB: number;
            downloadUrl: string;
            primary: boolean;
        }>;
        images: Array<{
            url: string;
            nsfw: boolean;
            width: number;
            height: number;
        }>;
    }>;
}

interface LocalModel {
    name: string;
    path: string;
    type: string;
    sizeKB: number;
}

const MODEL_TYPES = [
    { value: 'LORA', label: 'LoRA' },
    { value: 'LoCon', label: 'LoCon' },
    { value: 'DoRA', label: 'DoRA' },
    { value: 'Checkpoint', label: 'Checkpoint' },
    { value: 'TextualInversion', label: 'Textual Inversion' },
    { value: 'Hypernetwork', label: 'Hypernetwork' },
    { value: 'Controlnet', label: 'ControlNet' },
    { value: 'VAE', label: 'VAE' },
    { value: 'Upscaler', label: 'Upscaler' },
];

const SORT_OPTIONS = [
    { value: 'Highest Rated', label: 'Highest Rated' },
    { value: 'Most Downloaded', label: 'Most Downloaded' },
    { value: 'Newest', label: 'Newest' },
];

const PERIOD_OPTIONS = [
    { value: 'AllTime', label: 'All Time' },
    { value: 'Year', label: 'Year' },
    { value: 'Month', label: 'Month' },
    { value: 'Week', label: 'Week' },
    { value: 'Day', label: 'Day' },
];

const BASE_MODELS = [
    { value: 'All', label: 'All Base Models' },
    { value: 'SD 1.5', label: 'SD 1.5' },
    { value: 'SDXL 1.0', label: 'SDXL 1.0' },
    { value: 'SDXL 0.9', label: 'SDXL 0.9' },
    { value: 'SD 2.1', label: 'SD 2.1' },
    { value: 'Pony', label: 'Pony' },
    { value: 'Flux.1 D', label: 'Flux.1 D' },
];

export const ModelBrowser = () => {
    const [currentSource, setCurrentSource] = useState<'local' | 'civitai'>('civitai');
    const [searchQuery, setSearchQuery] = useState('');
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [civitaiModels, setCivitaiModels] = useState<CivitAIModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [downloadingModels, setDownloadingModels] = useState<Set<number>>(new Set());

    // Filters
    const [selectedTypes, setSelectedTypes] = useState<string[]>(['Checkpoint']);
    const [sortBy, setSortBy] = useState('Highest Rated');
    const [period, setPeriod] = useState('AllTime');
    const [baseModel, setBaseModel] = useState('All');
    const [showTypeDropdown, setShowTypeDropdown] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Load data based on source
    useEffect(() => {
        if (currentSource === 'local') {
            loadLocalModels();
        } else {
            searchCivitAI();
        }
    }, [currentSource]);

    const loadLocalModels = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/models/local');
            if (res.ok) {
                const data = await res.json();
                setLocalModels(data.models || []);
            }
        } catch (err) {
            console.error('Failed to load local models:', err);
        }
        setIsLoading(false);
    };

    const searchCivitAI = async (loadMore = false) => {
        if (!loadMore) {
            setIsLoading(true);
            setPage(1);
        }

        try {
            let url = `/api/civitai/models?limit=20&page=${loadMore ? page + 1 : 1}`;

            if (selectedTypes.length > 0) {
                url += `&types=${selectedTypes.join(',')}`;
            }
            url += `&sort=${sortBy}`;
            if (period !== 'AllTime') {
                url += `&period=${period}`;
            }
            if (baseModel !== 'All') {
                url += `&baseModels=${baseModel}`;
            }
            if (searchQuery) {
                url += `&query=${encodeURIComponent(searchQuery)}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to search CivitAI');

            const data = await res.json();

            if (loadMore) {
                setCivitaiModels(prev => [...prev, ...(data.items || [])]);
                setPage(prev => prev + 1);
            } else {
                setCivitaiModels(data.items || []);
                setPage(1);
            }

            setHasMore(data.metadata?.nextPage != null);
        } catch (err) {
            console.error('CivitAI search failed:', err);
        }

        setIsLoading(false);
    };

    const handleDownload = async (model: CivitAIModel, versionId: number, fileUrl: string, fileName: string) => {
        setDownloadingModels(prev => new Set(prev).add(model.id));

        try {
            const res = await fetch('/api/models/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: fileUrl,
                    fileName,
                    modelType: model.type,
                    modelId: model.id,
                    versionId
                })
            });

            if (!res.ok) throw new Error('Download failed');

            const data = await res.json();
            if (data.success) {
                // Show success notification
                alert(`Download started: ${fileName}`);
            }
        } catch (err) {
            console.error('Download failed:', err);
            alert('Failed to start download');
        }

        setDownloadingModels(prev => {
            const next = new Set(prev);
            next.delete(model.id);
            return next;
        });
    };

    const toggleTypeFilter = (type: string) => {
        setSelectedTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
    };

    const formatFileSize = (kb: number) => {
        if (kb < 1024) return `${kb.toFixed(0)} KB`;
        if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
        return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
    };

    const formatNumber = (num: number | undefined) => {
        if (num === undefined || num === null) return '0';
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 bg-black/30 border-b border-white/5 flex-shrink-0">
                {/* Title */}
                <div className="flex items-center gap-2">
                    <Download size={20} className="text-[var(--umbra-accent)]" />
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Model Browser</h2>
                </div>

                {/* Source Tabs */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentSource('local')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                            currentSource === 'local'
                                ? "bg-[var(--umbra-accent)] text-white shadow-[0_0_20px_var(--umbra-accent-glow)]"
                                : "bg-white/5 text-zinc-400 hover:bg-white/10"
                        )}
                    >
                        <HardDrive size={14} />
                        Local
                    </button>
                    <button
                        onClick={() => setCurrentSource('civitai')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
                            currentSource === 'civitai'
                                ? "bg-[var(--umbra-accent)] text-white shadow-[0_0_20px_var(--umbra-accent-glow)]"
                                : "bg-white/5 text-zinc-400 hover:bg-white/10"
                        )}
                    >
                        <Cloud size={14} />
                        CivitAI
                    </button>
                </div>

                {/* Search Bar */}
                <div className="flex-1 flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2">
                    <Search size={16} className="text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchCivitAI()}
                        placeholder="Search models..."
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                    />
                    <button
                        onClick={() => searchCivitAI()}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <Search size={14} />
                    </button>
                </div>
            </div>

            {/* Filters Bar (CivitAI only) */}
            {currentSource === 'civitai' && (
                <div className="flex items-center gap-4 px-6 py-3 bg-black/20 border-b border-white/5 flex-shrink-0">
                    {/* Type Filter */}
                    <div className="relative">
                        <button
                            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                            className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white hover:bg-white/10 transition-colors"
                        >
                            <Filter size={14} />
                            {selectedTypes.length === 1 ? selectedTypes[0] : `${selectedTypes.length} Types`}
                            <ChevronDown size={14} className={cn("transition-transform", showTypeDropdown && "rotate-180")} />
                        </button>

                        {showTypeDropdown && (
                            <div className="absolute top-full left-0 mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-lg p-2 min-w-[200px] z-10">
                                {MODEL_TYPES.map(type => (
                                    <label key={type.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedTypes.includes(type.value)}
                                            onChange={() => toggleTypeFilter(type.value)}
                                            className="accent-[var(--umbra-accent)]"
                                        />
                                        <span className="text-xs text-white">{type.label}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={(e) => { setSortBy(e.target.value); searchCivitAI(); }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white outline-none"
                    >
                        {SORT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>

                    {/* Period */}
                    <select
                        value={period}
                        onChange={(e) => { setPeriod(e.target.value); searchCivitAI(); }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white outline-none"
                    >
                        {PERIOD_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>

                    {/* Base Model */}
                    <select
                        value={baseModel}
                        onChange={(e) => { setBaseModel(e.target.value); searchCivitAI(); }}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white outline-none"
                    >
                        {BASE_MODELS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {isLoading && civitaiModels.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-[var(--umbra-accent)]" size={48} />
                    </div>
                ) : currentSource === 'civitai' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {civitaiModels.map(model => (
                            <ModelCard
                                key={model.id}
                                model={model}
                                onDownload={handleDownload}
                                isDownloading={downloadingModels.has(model.id)}
                                formatFileSize={formatFileSize}
                                formatNumber={formatNumber}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {localModels.map((model, idx) => (
                            <div key={idx} className="bg-black/20 border border-white/5 rounded-lg p-4">
                                <div className="text-sm font-bold text-white mb-1">{model.name}</div>
                                <div className="text-xs text-zinc-500">{model.type}</div>
                                <div className="text-xs text-zinc-600 mt-2">{formatFileSize(model.sizeKB)}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Load More */}
                {currentSource === 'civitai' && hasMore && !isLoading && civitaiModels.length > 0 && (
                    <div className="flex justify-center mt-6">
                        <button
                            onClick={() => searchCivitAI(true)}
                            className="px-6 py-3 bg-[var(--umbra-accent)] text-white rounded-xl font-bold uppercase tracking-wider hover:brightness-110 transition-all"
                        >
                            Load More
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// Model Card Component
const ModelCard = ({ model, onDownload, isDownloading, formatFileSize, formatNumber }: {
    model: CivitAIModel;
    onDownload: (model: CivitAIModel, versionId: number, fileUrl: string, fileName: string) => void;
    isDownloading: boolean;
    formatFileSize: (kb: number) => string;
    formatNumber: (num: number) => string;
}) => {
    const latestVersion = model.modelVersions[0];
    const primaryFile = latestVersion?.files?.find(f => f.primary) || latestVersion?.files[0];
    const previewImage = latestVersion?.images?.[0];

    return (
        <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden hover:border-[var(--umbra-accent)]/50 transition-all group">
            {/* Image */}
            {previewImage && (
                <div className="relative aspect-square overflow-hidden bg-black">
                    <img
                        src={previewImage.url}
                        alt={model.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {model.nsfw && (
                        <div className="absolute top-2 right-2 px-2 py-1 bg-red-500/80 backdrop-blur-sm rounded text-[8px] font-bold text-white">
                            NSFW
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="p-3">
                <h3 className="text-sm font-bold text-white mb-1 line-clamp-1">{model.name}</h3>
                <p className="text-[10px] text-zinc-500 mb-2 line-clamp-2">{latestVersion?.name}</p>

                {/* Stats */}
                <div className="flex items-center gap-3 mb-3 text-[10px] text-zinc-400">
                    <span>↓ {formatNumber(model.stats.downloadCount)}</span>
                    <span>❤ {formatNumber(model.stats.favoriteCount)}</span>
                    <span>★ {model.stats.rating?.toFixed(1) ?? '0.0'}</span>
                </div>

                {/* Download Button */}
                {primaryFile && (
                    <button
                        onClick={() => onDownload(model, latestVersion.id, primaryFile.downloadUrl, primaryFile.name)}
                        disabled={isDownloading}
                        className="w-full py-2 bg-[var(--umbra-accent)] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isDownloading ? (
                            <>
                                <Loader2 size={12} className="animate-spin" />
                                Downloading...
                            </>
                        ) : (
                            <>
                                <Download size={12} />
                                Download ({formatFileSize(primaryFile.sizeKB)})
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};
