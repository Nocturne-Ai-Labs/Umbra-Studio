'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Send, FileJson, Sparkles } from 'lucide-react';
import {
  ImageMetadata,
  extractPrompts,
  extractGenerationParams,
  getComfyUiJsonText,
  getWorkflowJsonExport,
  getLegacyGenerationParametersText,
} from '@/utils/metadata';

interface MetadataViewerProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ImageMetadata | null;
  imagePath?: string;
  onSendToComfyUI?: () => void;
  renderMode?: 'screen' | 'container';
}

const formatColors: Record<string, string> = {
  comfyui: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cozyui: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  umbrastudio: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  a1111: 'bg-green-500/20 text-green-400 border-green-500/30',
  unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
};

export function MetadataViewer({
  isOpen,
  onClose,
  metadata,
  imagePath,
  onSendToComfyUI,
  renderMode = 'screen',
}: MetadataViewerProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!isOpen || !metadata) return null;

  const hasWorkflow = metadata.workflow || metadata.prompt;
  const prompts = extractPrompts(metadata);
  const params = extractGenerationParams(metadata);
  const workflowExport = getWorkflowJsonExport(metadata);
  const comfyJsonText = workflowExport?.text ?? getComfyUiJsonText(metadata);
  const legacyParametersText = getLegacyGenerationParametersText(metadata);
  const hasPrompts = prompts.positive || prompts.negative;
  const hasParams = params && Object.keys(params).length > 0;
  const formatColor = formatColors[metadata.format || 'unknown'];
  const isContainerMode = renderMode === 'container';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${isContainerMode ? 'absolute z-[100]' : 'fixed z-[100]'} inset-0 bg-black/80 backdrop-blur-sm animate-backdrop`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`${isContainerMode ? 'absolute inset-3 md:inset-4' : 'fixed inset-4 md:inset-8 lg:inset-16'} z-[101] glass-panel border-2 border-[var(--umbra-accent)] overflow-hidden flex flex-col animate-modal`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="p-2 glass-panel border-[var(--umbra-accent)]">
              <FileJson size={24} className="text-[var(--umbra-accent)]" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white">
                Metadata Scanner
              </h2>
              <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
                {metadata.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded text-xs font-bold uppercase border ${formatColor}`}>
              {metadata.format || 'Unknown'}
            </div>
            <button
              onClick={onClose}
              className="p-2 glass-panel hover:bg-red-500/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
            <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded bg-[var(--umbra-accent)]/20 text-[var(--umbra-accent)] border border-[var(--umbra-accent)]/40">
              Metadata Scanner
            </div>
          </div>

          {hasPrompts && (
            <div className="space-y-4 mb-6">
              {prompts.positive && (
                <div className="glass-panel p-4 border-green-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-green-400" />
                      <span className="text-sm font-bold uppercase tracking-wide text-green-400">
                        Positive Prompt
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(prompts.positive!, 'positive')}
                      className="p-1.5 glass-panel hover:bg-white/10 transition-colors"
                    >
                      <Copy size={14} className={copiedField === 'positive' ? 'text-green-400' : ''} />
                    </button>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {prompts.positive}
                  </p>
                </div>
              )}

              {prompts.negative && (
                <div className="glass-panel p-4 border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <X size={16} className="text-red-400" />
                      <span className="text-sm font-bold uppercase tracking-wide text-red-400">
                        Negative Prompt
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(prompts.negative!, 'negative')}
                      className="p-1.5 glass-panel hover:bg-white/10 transition-colors"
                    >
                      <Copy size={14} className={copiedField === 'negative' ? 'text-green-400' : ''} />
                    </button>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {prompts.negative}
                  </p>
                </div>
              )}
            </div>
          )}

          {hasParams && (
            <div className="glass-panel p-4 border-zinc-500/20 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold uppercase tracking-wide text-zinc-300">
                  Generation Parameters
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {params.model && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Model</h4>
                    <p className="text-zinc-200 text-xs font-medium truncate" title={params.model}>
                      {params.model}
                    </p>
                  </div>
                )}
                {params.seed !== null && params.seed !== undefined && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Seed</h4>
                    <p className="text-zinc-200 text-xs font-mono">{params.seed}</p>
                  </div>
                )}
                {params.steps !== null && params.steps !== undefined && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Steps</h4>
                    <p className="text-zinc-200 text-xs font-mono">{params.steps}</p>
                  </div>
                )}
                {params.cfg !== null && params.cfg !== undefined && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">CFG Scale</h4>
                    <p className="text-zinc-200 text-xs font-mono">{params.cfg}</p>
                  </div>
                )}
                {params.sampler && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Sampler</h4>
                    <p className="text-zinc-200 text-xs truncate" title={params.sampler}>
                      {params.sampler}
                    </p>
                  </div>
                )}
                {params.scheduler && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Scheduler</h4>
                    <p className="text-zinc-200 text-xs truncate" title={params.scheduler}>
                      {params.scheduler}
                    </p>
                  </div>
                )}
                {params.width && params.height && (
                  <div className="bg-zinc-900 rounded-lg p-3">
                    <h4 className="text-zinc-500 text-xs font-medium mb-1">Size</h4>
                    <p className="text-zinc-200 text-xs font-mono">{params.width}×{params.height}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {comfyJsonText && (
            <div className="glass-panel p-4 border-orange-500/20 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileJson size={16} className="text-orange-400" />
                  <span className="text-sm font-bold uppercase tracking-wide text-orange-400">
                    {workflowExport?.label || 'ComfyUI Workflow'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {legacyParametersText && (
                    <button
                      onClick={() => copyToClipboard(legacyParametersText, 'legacyParameters')}
                      className="px-3 py-1.5 glass-panel bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-400 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2"
                    >
                      <Copy size={12} className={copiedField === 'legacyParameters' ? 'text-white' : ''} />
                      {copiedField === 'legacyParameters' ? 'Copied Parameters' : 'Copy Parameters'}
                    </button>
                  )}
                  <button
                    onClick={() => copyToClipboard(comfyJsonText, 'workflow')}
                    className="px-3 py-1.5 glass-panel bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2"
                  >
                    <Copy size={12} className={copiedField === 'workflow' ? 'text-green-400' : ''} />
                    {copiedField === 'workflow' ? 'Copied JSON' : 'Copy JSON'}
                  </button>
                </div>
              </div>
              <div className="bg-black/40 p-3 rounded border border-white/5 max-h-64 overflow-y-auto custom-scrollbar">
                <pre className="text-xs text-zinc-400 font-mono">
                  {comfyJsonText}
                </pre>
              </div>
            </div>
          )}

          {legacyParametersText && (
            <div className="glass-panel p-4 border-zinc-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  Legacy Parameters
                </span>
                <button
                  onClick={() => copyToClipboard(legacyParametersText, 'parameters')}
                  className="p-1.5 glass-panel hover:bg-white/10 transition-colors"
                >
                  <Copy size={14} className={copiedField === 'parameters' ? 'text-green-400' : ''} />
                </button>
              </div>
              <p className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                {legacyParametersText}
              </p>
            </div>
          )}

          {!hasPrompts && !comfyJsonText && !legacyParametersText && !hasParams && (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
              <FileJson size={64} className="mb-4 opacity-30" />
              <p className="text-sm font-bold uppercase tracking-wider">No metadata found</p>
              <p className="text-xs text-zinc-700 mt-2">This image does not contain embedded metadata</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-black/20">
          <div className="text-xs text-zinc-600 font-mono">
            {metadata.size ? `${(metadata.size / 1024).toFixed(1)} KB` : ''}
          </div>

          <div className="flex gap-2">
            {comfyJsonText && (
              <button
                onClick={() => copyToClipboard(comfyJsonText, 'workflow-footer')}
                className="px-4 py-2 glass-panel bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-400 font-bold text-sm uppercase tracking-wide transition-colors flex items-center gap-2"
              >
                <Copy size={16} className={copiedField === 'workflow-footer' ? 'text-green-400' : ''} />
                {copiedField === 'workflow-footer' ? 'Copied!' : 'Copy to ComfyUI'}
              </button>
            )}

            {comfyJsonText && onSendToComfyUI && (
              <button
                onClick={onSendToComfyUI}
                className="px-4 py-2 glass-panel bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-400 font-bold text-sm uppercase tracking-wide transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                Send to ComfyUI
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
