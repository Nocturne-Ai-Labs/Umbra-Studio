'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface DuplicateFile {
  name: string;
  exists: boolean;
  identical: boolean;
  size: number;
  existingSize: number;
}

interface DuplicateConflictModalProps {
  duplicates: DuplicateFile[];
  onResolve: (strategies: Record<string, 'skip' | 'replace' | 'keepBoth'>) => void;
  onCancel: () => void;
}

export function DuplicateConflictModal({ duplicates, onResolve, onCancel }: DuplicateConflictModalProps) {
  const [strategies, setStrategies] = useState<Record<string, 'skip' | 'replace' | 'keepBoth'>>(
    Object.fromEntries(duplicates.map(d => [d.name, 'keepBoth']))
  );
  const [applyToAll, setApplyToAll] = useState(false);
  const [globalStrategy, setGlobalStrategy] = useState<'skip' | 'replace' | 'keepBoth'>('keepBoth');

  const handleStrategyChange = (fileName: string, strategy: 'skip' | 'replace' | 'keepBoth') => {
    if (applyToAll) {
      setGlobalStrategy(strategy);
      setStrategies(Object.fromEntries(duplicates.map(d => [d.name, strategy])));
    } else {
      setStrategies(prev => ({ ...prev, [fileName]: strategy }));
    }
  };

  const handleApplyToAllChange = (checked: boolean) => {
    setApplyToAll(checked);
    if (checked) {
      setStrategies(Object.fromEntries(duplicates.map(d => [d.name, globalStrategy])));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-lg font-semibold text-white">Duplicate Files Found</h2>
              <p className="text-sm text-gray-400">
                {duplicates.length} file{duplicates.length > 1 ? 's' : ''} already exist in this folder
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {duplicates.map((duplicate) => (
            <div
              key={duplicate.name}
              className="bg-white/5 border border-white/10 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{duplicate.name}</p>
                  <div className="flex gap-4 mt-1">
                    <p className="text-xs text-gray-400">
                      New: {formatSize(duplicate.size)}
                    </p>
                    <p className="text-xs text-gray-400">
                      Existing: {formatSize(duplicate.existingSize)}
                    </p>
                    {duplicate.identical && (
                      <span className="text-xs text-green-400 font-medium">
                        ✓ Identical
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleStrategyChange(duplicate.name, 'skip')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    strategies[duplicate.name] === 'skip'
                      ? 'bg-gray-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Skip
                </button>
                <button
                  onClick={() => handleStrategyChange(duplicate.name, 'replace')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    strategies[duplicate.name] === 'replace'
                      ? 'bg-red-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Replace
                </button>
                <button
                  onClick={() => handleStrategyChange(duplicate.name, 'keepBoth')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    strategies[duplicate.name] === 'keepBoth'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Keep Both
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => handleApplyToAllChange(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-gray-300">Apply to all conflicts</span>
          </label>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
            >
              Cancel Upload
            </button>
            <button
              onClick={() => onResolve(strategies)}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              Continue Upload
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
