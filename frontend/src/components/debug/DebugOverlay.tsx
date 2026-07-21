'use client';

import { useEffect, useState } from 'react';
import { useDebugStore } from '@/store/useDebugStore';
import { motion, AnimatePresence } from 'framer-motion';

export function DebugOverlay() {
  const { overlayVisible, toggleOverlay, events, session, config } = useDebugStore();
  const [fps, setFps] = useState(60);
  const [memory, setMemory] = useState(0);

  // FPS Counter
  useEffect(() => {
    if (!config.trackPerformance) return;

    let frameCount = 0;
    let lastTime = performance.now();

    function countFrames() {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime >= lastTime + 1000) {
        setFps(Math.round(frameCount * 1000 / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(countFrames);
    }

    const rafId = requestAnimationFrame(countFrames);
    return () => cancelAnimationFrame(rafId);
  }, [config.trackPerformance]);

  // Memory Monitor
  useEffect(() => {
    if (!config.trackPerformance || !(performance as any).memory) return;

    const interval = setInterval(() => {
      const mem = (performance as any).memory;
      setMemory(Math.round(mem.usedJSHeapSize / 1048576)); // MB
    }, 1000);

    return () => clearInterval(interval);
  }, [config.trackPerformance]);

  // Keyboard shortcut: Ctrl+Shift+K (K = Debug Konsole)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        toggleOverlay();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleOverlay]);

  if (!config.enabled) return null;

  return (
    <>
      {/* Minimal stats (always visible when enabled) */}
      {(config.showOverlay || overlayVisible) && (
        <div className="fixed top-2 right-2 z-[9999] pointer-events-none">
          <div className="glass-panel px-3 py-1 text-xs font-mono space-y-0.5 pointer-events-auto">
            <div className={`${fps < 30 ? 'text-red-500' : fps < 50 ? 'text-yellow-500' : 'text-green-500'}`}>
              FPS: {fps}
            </div>
            {(performance as any).memory && (
              <div className="text-zinc-400">
                MEM: {memory}MB
              </div>
            )}
            <div className="text-zinc-500 text-[10px]">
              Ctrl+Shift+K
            </div>
          </div>
        </div>
      )}

      {/* Full overlay */}
      <AnimatePresence>
        {overlayVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-4 right-4 z-[9998] max-w-4xl mx-auto"
          >
            <div className="glass-panel p-4 max-h-96 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Debug Telemetry</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">
                    Session: {session?.id || 'None'}
                  </span>
                  <span className="text-zinc-400">
                    Events: {events.length}/{config.maxEvents}
                  </span>
                </div>
              </div>

              {/* Event stream */}
              <div className="space-y-1 font-mono text-xs">
                {events.slice(-50).reverse().map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-2 text-zinc-400 hover:bg-white/5 px-2 py-1 rounded"
                  >
                    <span className="text-zinc-600 w-16">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={getCategoryColor(event.category)}>
                      [{event.category}]
                    </span>
                    <span className="flex-1 truncate">
                      {event.type}: {JSON.stringify(event.data).slice(0, 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    cursor: 'text-blue-400',
    click: 'text-green-400',
    keyboard: 'text-purple-400',
    animation: 'text-pink-400',
    render: 'text-orange-400',
    state: 'text-yellow-400',
    network: 'text-cyan-400',
    performance: 'text-red-400',
    error: 'text-red-600',
    lifecycle: 'text-zinc-400',
  };
  return colors[category] || 'text-white';
}
