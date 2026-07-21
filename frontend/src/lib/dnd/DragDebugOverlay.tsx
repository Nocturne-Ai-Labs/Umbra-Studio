import { useEffect, useState } from 'react';
import { useDragDropState } from './SimpleDragDrop';
import { motion, AnimatePresence } from 'framer-motion';

export function DragDebugOverlay() {
  const { isDragging, dragData, draggedCount } = useDragDropState();
  const [dropEvents, setDropEvents] = useState<Array<{ type: string; timestamp: number }>>([]);

  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const dropZone = target.closest('[data-drop-zone]');
      setDropEvents(prev => [
        ...prev.slice(-4), // Keep last 5
        {
          type: dropZone?.getAttribute('data-drop-zone') || 'unknown',
          timestamp: Date.now()
        }
      ]);
      
      // Clear after 3 seconds
      setTimeout(() => {
        setDropEvents(prev => prev.filter(evt => Date.now() - evt.timestamp < 3000));
      }, 3000);
    };

    document.addEventListener('drop', handleDrop);
    return () => document.removeEventListener('drop', handleDrop);
  }, []);

  if (!isDragging) return null;

  const dragInfo = dragData ? {
    type: dragData.type,
    imageCount: draggedCount,
    imageName: dragData.image?.name || 'Multiple',
    hasImages: !!(dragData.images || dragData.image),
    path: dragData.path,
  } : null;

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none"
        >
          <div className="bg-black/90 backdrop-blur-lg border border-blue-500 rounded-lg p-4 shadow-2xl min-w-[400px]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <h3 className="text-white font-bold text-sm uppercase tracking-wider">
                Drag Active
              </h3>
            </div>
            
            {dragInfo && (
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="text-blue-400 font-bold">{dragInfo.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Count:</span>
                  <span className="text-green-400 font-bold">{dragInfo.imageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Item:</span>
                  <span className="text-yellow-400 truncate max-w-[200px]">{dragInfo.imageName}</span>
                </div>
                {dragInfo.path && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Path:</span>
                    <span className="text-purple-400 truncate max-w-[200px]">{dragInfo.path}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Has Data:</span>
                  <span className={dragInfo.hasImages ? "text-green-400" : "text-red-400"}>
                    {dragInfo.hasImages ? '✓ YES' : '✗ NO'}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-gray-400 text-xs mb-2">Drop zones available:</div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">Folders</span>
                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">ComfyUI</span>
                <span className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded text-xs">Scanner</span>
                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">Datasets</span>
              </div>
            </div>

            {dropEvents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="text-gray-400 text-xs mb-2">Recent drops:</div>
                {dropEvents.map((evt, i) => (
                  <div key={i} className="text-xs text-green-400 mb-1">
                    ✓ {evt.type}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-gray-500 text-[10px] text-center">
                Check console (F12) for detailed logs
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
