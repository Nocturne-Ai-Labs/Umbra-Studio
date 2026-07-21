'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Trash2, LayoutTemplate, Image as ImageIcon } from 'lucide-react';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';

interface WatermarkSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WatermarkSettings({ isOpen, onClose }: WatermarkSettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [opacity, setOpacity] = useState(0.5);
  const [scale, setScale] = useState(0.2);
  const [offset, setOffset] = useState(20);
  const [position, setPosition] = useState('bottom-right');
  const [watermarkImage, setWatermarkImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void readUserConfig<{
      enabled?: boolean;
      opacity?: number;
      scale?: number;
      offset?: number;
      position?: string;
      imageData?: string | null;
    }>('editor-watermark-settings', {}).then((saved) => {
      if (typeof saved.enabled === 'boolean') setEnabled(saved.enabled);
      if (Number.isFinite(Number(saved.opacity))) setOpacity(Number(saved.opacity));
      if (Number.isFinite(Number(saved.scale))) setScale(Number(saved.scale));
      if (Number.isFinite(Number(saved.offset))) setOffset(Number(saved.offset));
      if (typeof saved.position === 'string') setPosition(saved.position);
      if (typeof saved.imageData === 'string') setWatermarkImage(saved.imageData);
    }).catch(() => undefined);
    try {
      ['wm_enabled', 'wm_opacity', 'wm_scale', 'wm_offset', 'wm_pos', 'wm_data'].forEach((key) => localStorage.removeItem(key));
    } catch {}
  }, []);

  const saveSettings = (patch: Record<string, unknown>) => {
    const next = {
      enabled,
      opacity,
      scale,
      offset,
      position,
      imageData: watermarkImage,
      ...patch,
    };
    void writeUserConfig('editor-watermark-settings', next).catch((error) => {
      console.warn('[WatermarkSettings] Failed to persist watermark settings:', error);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setWatermarkImage(result);
        setEnabled(true);
        saveSettings({ imageData: result, enabled: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearWatermark = () => {
    setWatermarkImage(null);
    setEnabled(false);
    saveSettings({ imageData: null, enabled: false });
  };

  const positions = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 m-auto w-full max-w-2xl h-fit max-h-[90vh] glass-panel border-2 border-[var(--umbra-accent)] overflow-hidden flex flex-col z-[201]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="p-2 glass-panel border-[var(--umbra-accent)] text-[var(--umbra-accent)]">
              <LayoutTemplate size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                Watermark Lab
              </h2>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
                Branding & Export Settings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 glass-panel hover:bg-red-500/20 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar">
          
          {/* Upload Section */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold uppercase tracking-wide text-zinc-400">Watermark Image</label>
              {watermarkImage && (
                <button 
                  onClick={clearWatermark}
                  className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold flex items-center gap-1"
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
            
            {!watermarkImage ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[var(--umbra-accent)] hover:bg-[var(--umbra-accent)]/5 transition-all group"
              >
                <Upload size={32} className="text-zinc-600 group-hover:text-[var(--umbra-accent)] transition-colors mb-2" />
                <span className="text-xs font-bold uppercase text-zinc-500 group-hover:text-white transition-colors">Click to Upload PNG</span>
              </div>
            ) : (
              <div className="relative h-32 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center overflow-hidden">
                <img src={watermarkImage} alt="Watermark" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/png,image/jpeg,image/webp" 
              onChange={handleFileChange}
            />
          </div>

          {/* Controls */}
          {watermarkImage && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Sliders */}
              <div className="space-y-6">
                 {/* Opacity */}
                 <div className="space-y-2">
                   <div className="flex justify-between text-xs font-bold uppercase text-zinc-500">
                     <span>Opacity</span>
                     <span className="text-[var(--umbra-accent)]">{Math.round(opacity * 100)}%</span>
                   </div>
                   <input 
                     type="range" min="0" max="1" step="0.01"
                     value={opacity}
                     onChange={(e) => {
                       const val = parseFloat(e.target.value);
                       setOpacity(val);
                       saveSettings({ opacity: val });
                     }}
                     className="w-full accent-[var(--umbra-accent)] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                   />
                 </div>

                 {/* Scale */}
                 <div className="space-y-2">
                   <div className="flex justify-between text-xs font-bold uppercase text-zinc-500">
                     <span>Scale</span>
                     <span className="text-[var(--umbra-accent)]">{Math.round(scale * 100)}%</span>
                   </div>
                   <input
                     type="range" min="0.05" max="1" step="0.01"
                     value={scale}
                     onChange={(e) => {
                       const val = parseFloat(e.target.value);
                       setScale(val);
                       saveSettings({ scale: val });
                     }}
                     className="w-full accent-[var(--umbra-accent)] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                   />
                 </div>

                 {/* Offset/Margin */}
                 <div className="space-y-2">
                   <div className="flex justify-between text-xs font-bold uppercase text-zinc-500">
                     <span>Offset</span>
                     <span className="text-[var(--umbra-accent)]">{offset}px</span>
                   </div>
                   <input
                     type="range" min="0" max="100" step="5"
                     value={offset}
                     onChange={(e) => {
                       const val = parseInt(e.target.value);
                       setOffset(val);
                       saveSettings({ offset: val });
                     }}
                     className="w-full accent-[var(--umbra-accent)] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                   />
                 </div>

                 {/* Enable Toggle */}
                 <div className="flex items-center justify-between pt-4 border-t border-white/5">
                   <span className="text-sm font-bold uppercase text-white">Apply on Export</span>
                   <button 
                     onClick={() => {
                       const newState = !enabled;
                       setEnabled(newState);
                       saveSettings({ enabled: newState });
                     }}
                     className={cn(
                       "w-12 h-6 rounded-full transition-colors relative",
                       enabled ? "bg-[var(--umbra-accent)]" : "bg-zinc-800"
                     )}
                   >
                     <div className={cn(
                       "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform",
                       enabled ? "translate-x-6" : "translate-x-0"
                     )} />
                   </button>
                 </div>
              </div>

              {/* Position Grid */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-zinc-500 mb-2">Position</div>
                <div className="grid grid-cols-3 gap-2 aspect-square max-w-[200px] mx-auto bg-black/40 p-2 rounded-xl border border-white/5">
                  {positions.map(pos => (
                    <button
                      key={pos}
                      onClick={() => {
                        setPosition(pos);
                        saveSettings({ position: pos });
                      }}
                      className={cn(
                        "rounded-lg border transition-all hover:bg-white/5 flex items-center justify-center",
                        position === pos 
                          ? "bg-[var(--umbra-accent)]/20 border-[var(--umbra-accent)] text-[var(--umbra-accent)]" 
                          : "border-white/5 text-zinc-700"
                      )}
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        position === pos ? "bg-[var(--umbra-accent)] shadow-[0_0_5px_var(--umbra-accent)]" : "bg-zinc-800"
                      )} />
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {!watermarkImage && (
             <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
               <ImageIcon className="text-blue-400 flex-shrink-0 mt-0.5" size={16} />
               <div className="space-y-1">
                 <h4 className="text-sm font-bold text-blue-400 uppercase">Pro Tip</h4>
                 <p className="text-xs text-zinc-400 leading-relaxed">
                   Upload a transparent PNG logo to automatically apply it to all exported images. You can adjust position, size, and opacity.
                 </p>
               </div>
             </div>
          )}

        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
