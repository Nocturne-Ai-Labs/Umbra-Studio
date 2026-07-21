import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Star, ExternalLink, Download, Plus, Tag, Check } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import type { BooruPost } from '../types';

interface BoardLightboxProps {
  posts: BooruPost[];
  initialIndex: number;
  onClose: () => void;
  onDownload?: (post: BooruPost) => void;
  onAddTag?: (tag: string) => void;
}

const FULLSCREEN_MEDIA_LOAD_TIMEOUT_MS = 12000;

function buildBooruProxyUrl(rawUrl: string | null | undefined): string {
  const value = String(rawUrl || '').trim();
  return value ? `/api/booru/image-proxy?url=${encodeURIComponent(value)}` : '';
}

function uniqueMediaUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = String(value || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function BoardLightbox({ posts, initialIndex, onClose, onDownload, onAddTag }: BoardLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showTagPanel, setShowTagPanel] = useState(true);
  const [addedTags, setAddedTags] = useState<Set<string>>(new Set());
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [hasError, setHasError] = useState(false);

  const currentPost = posts[currentIndex];
  const source = currentPost ? BOORU_SOURCES[currentPost.source] : null;

  const mediaUrls = currentPost
    ? uniqueMediaUrls([
      buildBooruProxyUrl(currentPost.fullUrl),
      buildBooruProxyUrl(currentPost.previewUrl),
      currentPost.fullUrl,
      currentPost.previewUrl,
    ])
    : [];
  const imageUrl = mediaUrls[Math.min(mediaAttempt, Math.max(0, mediaUrls.length - 1))] || '';

  // Reset state on image change
  useEffect(() => {
    setZoom(1);
    setIsLoading(true);
    setMediaAttempt(0);
    setHasError(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!isLoading || hasError || !imageUrl) return;
    const timeoutId = window.setTimeout(() => {
      setMediaAttempt((attempt) => {
        if (attempt < mediaUrls.length - 1) {
          return attempt + 1;
        }
        setIsLoading(false);
        setHasError(true);
        return attempt;
      });
    }, FULLSCREEN_MEDIA_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [hasError, imageUrl, isLoading, mediaUrls.length]);

  const handleMediaLoaded = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleMediaError = useCallback(() => {
    setMediaAttempt((attempt) => {
      if (attempt < mediaUrls.length - 1) {
        setIsLoading(true);
        return attempt + 1;
      }
      setIsLoading(false);
      setHasError(true);
      return attempt;
    });
  }, [mediaUrls.length]);

  const handleNext = useCallback(() => {
    if (posts.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % posts.length);
  }, [posts.length]);

  const handlePrev = useCallback(() => {
    if (posts.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + posts.length) % posts.length);
  }, [posts.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        !!target?.isContentEditable ||
        !!target?.closest('[contenteditable="true"]') ||
        !!target?.closest('.monaco-editor') ||
        !!target?.closest('.monaco-list') ||
        !!target?.closest('.suggest-widget') ||
        !!target?.closest('.quick-input-widget') ||
        !!target?.closest('.parameter-hints-widget');
      if (isTyping) return;

      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(3, z + 0.25));
      if (e.key === '-') setZoom(z => Math.max(0.5, z - 0.25));
      if (e.key === '0') setZoom(1);
      if (e.key === 't') setShowTagPanel(p => !p);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  if (!currentPost) return null;

  // Get original post URL for opening in browser
  const getPostUrl = () => {
    const id = currentPost.id.slice(currentPost.source.length + 1);
    return source?.postUrl(id) || null;
  };

  const handleTagClick = (tag: string) => {
    if (onAddTag) {
      onAddTag(tag);
      // Show visual feedback
      setAddedTags(prev => new Set([...prev, tag]));
      // Remove after animation
      setTimeout(() => {
        setAddedTags(prev => {
          const next = new Set(prev);
          next.delete(tag);
          return next;
        });
      }, 1500);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        data-umbra-lightbox-root
        className="fixed inset-0 z-[100] flex flex-col bg-black/95"
        onClick={onClose}
      >
        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="glass-panel z-10 flex h-12 items-center justify-between rounded-none border-x-0 border-t-0 px-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">
              {currentIndex + 1} / {posts.length}
            </span>
            {source && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: source.color + '30', color: source.color }}
              >
                <span className="font-bold">{source.icon}</span>
                {source.name}
              </div>
            )}
            <div className="flex items-center gap-1 text-zinc-400 text-sm">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              {currentPost.score}
            </div>
            <span className="text-zinc-500 text-sm">
              {currentPost.width}x{currentPost.height}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="umbra-icon-button rounded p-2 transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-xs text-zinc-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              className="umbra-icon-button rounded p-2 transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn size={18} />
            </button>

            <div className="w-px h-5 bg-white/10 mx-2" />

            <button
              onClick={() => setShowTagPanel(p => !p)}
              className={`rounded p-2 transition-colors ${showTagPanel ? 'border border-cyan-400/35 bg-cyan-500/15 text-cyan-200' : 'umbra-icon-button'}`}
              title="Toggle Tags Panel (T)"
            >
              <Tag size={18} />
            </button>

            {getPostUrl() && (
              <a
                href={getPostUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="umbra-icon-button rounded p-2 transition-colors"
                title="View on Source"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={18} />
              </a>
            )}

            {onDownload && (
              <button
                onClick={() => onDownload(currentPost)}
                className="rounded p-2 text-zinc-400 transition-colors hover:bg-cyan-500/15 hover:text-cyan-200"
                title="Add to Download Queue"
              >
                <Download size={18} />
              </button>
            )}

            <button
              onClick={onClose}
              className="ml-2 rounded p-2 text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Image Container */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {/* Navigation Buttons */}
            {posts.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="glass-panel absolute left-4 z-10 rounded-full p-3 text-white/55 transition-all hover:text-white"
                >
                  <ChevronLeft size={28} />
                </button>

                <button
                  onClick={handleNext}
                  className="glass-panel absolute right-4 z-10 rounded-full p-3 text-white/55 transition-all hover:text-white"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            {/* Image Display */}
            <motion.div
              key={currentPost.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full flex items-center justify-center"
              onWheel={(e) => {
                if (e.ctrlKey) {
                  e.preventDefault();
                  setZoom(z => Math.min(3, Math.max(0.5, z - e.deltaY * 0.001)));
                }
              }}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {hasError ? (
                <div className="flex flex-col items-center justify-center text-zinc-500 gap-2">
                  <span className="text-lg">Failed to load media</span>
                  <span className="max-w-[70vw] truncate text-xs opacity-50">{currentPost.fullUrl || currentPost.previewUrl}</span>
                </div>
              ) : ['mp4', 'webm', 'mov'].includes(currentPost.fileExt?.toLowerCase() || '') ? (
                <video
                  key={imageUrl}
                  src={imageUrl}
                  className="max-h-full max-w-full object-contain"
                  style={{
                    transform: `scale(${zoom})`,
                    opacity: isLoading ? 0 : 1,
                  }}
                  controls
                  autoPlay
                  loop
                  muted
                  onLoadedData={handleMediaLoaded}
                  onError={handleMediaError}
                />
              ) : (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain transition-transform duration-100"
                  style={{
                    transform: `scale(${zoom})`,
                    opacity: isLoading ? 0 : 1,
                  }}
                  draggable={false}
                  onLoad={handleMediaLoaded}
                  onError={handleMediaError}
                />
              )}
            </motion.div>
          </div>

          {/* Right Side Tags Panel */}
          <AnimatePresence>
            {showTagPanel && (
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{ duration: 0.2 }}
                className="glass-panel flex w-64 flex-col rounded-none border-y-0 border-r-0"
              >
                {/* Panel Header */}
                <div className="p-3 border-b border-white/10">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <Tag size={14} />
                    Tags ({currentPost.tags.length})
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Click a tag to add it to your search
                  </p>
                </div>

                {/* Tags List */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  <div className="flex flex-wrap gap-1">
                    {currentPost.tags.map(tag => {
                      const isAdded = addedTags.has(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => handleTagClick(tag)}
                          className={`group flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all duration-200
                            ${isAdded
                              ? 'bg-green-500/30 text-green-300 scale-105'
                              : 'umbra-chip-neutral hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-200'}`}
                        >
                          <span className="truncate max-w-[140px]">{tag}</span>
                          {isAdded ? (
                            <Check size={10} className="flex-shrink-0" />
                          ) : (
                            <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Panel Footer - Image Info */}
                <div className="p-3 border-t border-white/10 space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500">Rating</span>
                    <span className={`font-medium ${
                      currentPost.rating === 'safe' ? 'text-green-400' :
                      currentPost.rating === 'questionable' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {currentPost.rating}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500">Score</span>
                    <span className="text-zinc-300">{currentPost.score}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500">Resolution</span>
                    <span className="text-zinc-300">{currentPost.width}x{currentPost.height}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500">Format</span>
                    <span className="text-zinc-300 uppercase">{currentPost.fileExt}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
