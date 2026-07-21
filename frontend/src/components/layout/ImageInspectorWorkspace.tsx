'use client';

import React from 'react';
import { ScannerWorkspace } from './ScannerWorkspace';
import { WaifuDiffusionWorkspace } from './WaifuDiffusionWorkspace';
import { Search, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';

export function ImageInspectorWorkspace() {
  const { ui, setUI } = useStore();
  const activeTab = ui.imageInspectorTab;

  return (
    <div data-umbra-image-inspector-root="" className="relative flex h-full flex-col bg-[var(--umbra-bg)] text-[var(--umbra-text)] overflow-hidden">
      {/* Image Inspector Header */}
      <div data-umbra-image-inspector-header="" className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl z-10">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">Image Inspector</h2>
            <p className="mt-0.5 text-xs umbra-text-muted">Analyze metadata and generate booru tags</p>
          </div>
          
          {/* Tab Switcher */}
          <div className="flex p-1 bg-black/40 rounded-lg border border-white/5">
            <button
              onClick={() => setUI('imageInspectorTab', 'scanner')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all ${
                activeTab === 'scanner' 
                ? 'bg-[var(--umbra-accent)] text-white shadow-[0_0_12px_var(--umbra-accent-glow)]' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Search size={12} />
              Metadata Scanner
            </button>
            <button
              onClick={() => setUI('imageInspectorTab', 'waifu')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all ${
                activeTab === 'waifu' 
                ? 'bg-[var(--umbra-accent)] text-white shadow-[0_0_12px_var(--umbra-accent-glow)]' 
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Sparkles size={12} />
              Waifu Diffusion
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 relative min-h-0">
        <div className={activeTab === 'scanner' ? 'h-full w-full' : 'hidden'}>
          <ScannerWorkspace hideHeader />
        </div>
        <div className={activeTab === 'waifu' ? 'h-full w-full' : 'hidden'}>
          <WaifuDiffusionWorkspace hideHeader />
        </div>
      </div>
    </div>
  );
}
