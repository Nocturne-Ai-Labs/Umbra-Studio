import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Trash2, Flag, Save, Loader2 } from 'lucide-react';
import type { DatasetImage } from '../types';

interface DatasetLightboxProps {
  images: DatasetImage[];
  initialIndex: number;
  datasetName: string;
  conceptFolder: string;
  flaggedForDeletion: Set<string>;
  onToggleFlag: (filename: string) => void;
  onClose: () => void;
  onSaveCaption?: (filename: string, caption: string) => Promise<boolean>;
}

export function DatasetLightbox({
  images,
  initialIndex,
  datasetName,
  conceptFolder,
  flaggedForDeletion,
  onToggleFlag,
  onClose,
  onSaveCaption,
}: DatasetLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [caption, setCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const currentImage = images[currentIndex];
  const isFlagged = currentImage ? flaggedForDeletion.has(currentImage.filename) : false;

  // Build URL - match the grid format exactly (no encoding needed for local API)
  const imageUrl = currentImage
    ? `/api/files/datasets/${datasetName}/${conceptFolder}/${currentImage.filename}`
    : '';

  // Determine if current file is a video
  const fileExt = currentImage?.filename.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'webm', 'mov'].includes(fileExt);

  // Reset state on image change
  useEffect(() => {
    setZoom(1);
    setIsLoading(true);
    setHasError(false);
    const image = images[currentIndex];
    if (image) {
      setCaption(image.caption || '');
      setHasChanges(false);
    }
  }, [currentIndex, images]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleToggleFlag = useCallback(() => {
    if (currentImage) {
      onToggleFlag(currentImage.filename);
    }
  }, [currentImage, onToggleFlag]);

  const handleSaveCaption = async () => {
    if (!currentImage || !onSaveCaption) return;
    setIsSaving(true);
    const success = await onSaveCaption(currentImage.filename, caption);
    setIsSaving(false);
    if (success) {
      setHasChanges(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in text fields/editors (including Monaco)
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
      if (e.key === 'd' || e.key === 'D' || e.key === 'Delete') handleToggleFlag();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(3, z + 0.25));
      if (e.key === '-') setZoom(z => Math.max(0.5, z - 0.25));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleToggleFlag, onClose]);

  if (!currentImage) return null;

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
              {currentIndex + 1} / {images.length}
            </span>
            {isFlagged && (
              <span className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-xs text-red-300">
                <Flag className="w-3 h-3" />
                Flagged for deletion
              </span>
            )}
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
              onClick={onClose}
              className="rounded p-2 text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
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
            {images.length > 1 && (
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
              key={currentImage.filename}
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
                  <span className="text-xs opacity-50 max-w-md text-center break-all">{imageUrl}</span>
                </div>
              ) : isVideo ? (
                <video
                  key={imageUrl}
                  src={imageUrl}
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: `scale(${zoom})` }}
                  controls
                  autoPlay
                  loop
                  muted
                  onLoadedData={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                />
              ) : (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt={currentImage.filename}
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                />
              )}
            </motion.div>
          </div>

          {/* Right Side Panel */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="glass-panel flex w-72 flex-col rounded-none border-y-0 border-r-0"
          >
            {/* Image Info */}
            <div className="p-4 border-b border-white/10">
              <h3 className="text-sm font-medium text-zinc-200 truncate" title={currentImage.filename}>
                {currentImage.filename}
              </h3>
              {currentImage.width && currentImage.height && (
                <p className="text-xs text-zinc-500 mt-1">
                  {currentImage.width} x {currentImage.height}
                </p>
              )}
            </div>

            {/* Caption Editor */}
            <div className="flex-1 p-4 flex flex-col">
              <label className="text-xs font-medium text-zinc-400 mb-2">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="Enter caption..."
                className="umbra-input custom-scrollbar w-full flex-1 resize-none rounded px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              />
              <button
                onClick={handleSaveCaption}
                disabled={!hasChanges || isSaving}
                className="mt-2 flex items-center justify-center gap-2 rounded border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSaving ? 'Saving...' : 'Save Caption'}
              </button>
            </div>

            {/* Flag for Deletion */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={handleToggleFlag}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded font-medium transition-colors
                          ${isFlagged
                            ? 'border border-red-400/50 bg-red-500/25 text-red-100'
                            : 'umbra-surface-soft border border-white/10 text-zinc-400 hover:border-red-500/50 hover:bg-red-500/12 hover:text-red-300'
                          }`}
              >
                <Trash2 className="w-4 h-4" />
                {isFlagged ? 'Unflag' : 'Flag for Deletion'}
              </button>
              <p className="text-[10px] text-zinc-500 mt-2 text-center">
                Press D to toggle flag
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
