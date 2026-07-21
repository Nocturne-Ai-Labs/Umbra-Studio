import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface PowerPrompterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: any;
  onSave: (newSettings: any) => void;
}

export const PowerPrompterSettingsModal = ({ isOpen, onClose, settings, onSave }: PowerPrompterSettingsModalProps) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleColorChange = (key: string, value: string) => {
    setLocalSettings((prev: any) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value }
    }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const categories = [
    { key: 'general', label: 'General', id: 0 },
    { key: 'artist', label: 'Artist', id: 1 },
    { key: 'copyright', label: 'Copyright', id: 3 },
    { key: 'character', label: 'Character', id: 4 },
    { key: 'metadata', label: 'Metadata', id: 5 },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] glass-panel p-6 rounded-xl shadow-2xl border border-white/10 bg-[#09090b]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Power Prompter Settings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Fuzzy Sensitivity */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-zinc-400">
              <span>Fuzzy Search Sensitivity</span>
              <span>{localSettings.fuzzySensitivity?.toFixed(1) || 0.6}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={localSettings.fuzzySensitivity || 0.6}
              onChange={(e) => setLocalSettings({ ...localSettings, fuzzySensitivity: parseFloat(e.target.value) })}
              className="w-full accent-[var(--umbra-accent)] h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-[10px] text-zinc-600">Lower values are stricter, higher values are more lenient.</p>
          </div>

          {/* Colors */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-zinc-400 border-b border-white/5 pb-1">Category Colors</div>
            <div className="grid gap-3">
              {categories.map((cat) => (
                <div key={cat.key} className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full border border-white/10 shadow-sm"
                    style={{ backgroundColor: localSettings.colors?.[cat.key] }}
                  />
                  <span className="text-xs text-zinc-300 w-20">{cat.label}</span>
                  <input
                    type="text"
                    value={localSettings.colors?.[cat.key] || ''}
                    onChange={(e) => handleColorChange(cat.key, e.target.value)}
                    className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-xs font-mono text-zinc-400 focus:text-white focus:border-[var(--umbra-accent)] outline-none transition-all"
                    placeholder="#000000"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-[var(--umbra-accent)] text-white text-xs font-bold py-2 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <Save size={14} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
