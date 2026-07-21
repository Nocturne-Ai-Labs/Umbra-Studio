'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, FolderOpen, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  getWaifuPrependPresetsSnapshot,
  normalizeWaifuPreset,
  setWaifuPrependPresets,
  subscribeWaifuPrependPresets,
} from '@/lib/waifuPrependPresets';

interface WaifuTagScore {
  tag: string;
  score: number;
}

interface WaifuTagResult {
  modelRepo: string;
  generalThreshold: number;
  characterThreshold: number;
  ratingThreshold: number;
  generalMcutEnabled: boolean;
  characterMcutEnabled: boolean;
  usedGeneralThreshold: number;
  usedCharacterThreshold: number;
  rating: Record<string, number>;
  general: WaifuTagScore[];
  character: WaifuTagScore[];
  booruTags: string[];
  booruTagString: string;
  generalTagString: string;
  characterTagString: string;
}

interface WaifuTaggerState {
  status: 'idle' | 'loading' | 'done' | 'error';
  result?: WaifuTagResult;
  error?: string;
}

interface WaifuPanelItem {
  id: string;
  path: string;
  name: string;
  blob: Blob;
  blobUrl: string;
  size: number;
  isVideo: boolean;
  waifuTagger: WaifuTaggerState;
}

interface WaifuTaggerPanelProps {
  imagePath?: string;
  imageName?: string;
  onSendToWaifuDiffusion?: () => void;
}

const WAIFU_MODEL_OPTIONS = [
  { id: 'SmilingWolf/wd-vit-tagger-v3', label: 'wd-vit-tagger-v3' },
  { id: 'SmilingWolf/wd-convnext-tagger-v3', label: 'wd-convnext-tagger-v3' },
  { id: 'SmilingWolf/wd-eva02-large-tagger-v3', label: 'wd-eva02-large-tagger-v3' },
  { id: 'SmilingWolf/wd-swinv2-tagger-v3', label: 'wd-swinv2-tagger-v3' },
];

export function WaifuTaggerPanel({ imagePath, imageName, onSendToWaifuDiffusion }: WaifuTaggerPanelProps) {
  const { showToast } = useStore();
  const [item, setItem] = useState<WaifuPanelItem | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [waifuOptions, setWaifuOptions] = useState(() => ({
    modelRepo: WAIFU_MODEL_OPTIONS[0].id,
    generalThreshold: 0.35,
    characterThreshold: 0.85,
    ratingThreshold: 0.25,
    generalMcutEnabled: false,
    characterMcutEnabled: false,
    maxTags: 120,
    exportUseUnderscores: true,
    exportUseCommas: false,
    prependTags: '',
  }));
  const [prependPresetDraft, setPrependPresetDraft] = useState('');
  const blobUrlRef = useRef<string | null>(null);
  const prependPresets = useSyncExternalStore(
    subscribeWaifuPrependPresets,
    getWaifuPrependPresetsSnapshot,
    () => []
  );

  useEffect(() => {
    let cancelled = false;

    const loadFromPath = async () => {
      if (!imagePath) {
        setItem(null);
        setSourceError(null);
        setIsLoadingSource(false);
        return;
      }

      setIsLoadingSource(true);
      setSourceError(null);

      try {
        const response = await fetch(`/api/fs/read?path=${encodeURIComponent(imagePath)}`);
        if (!response.ok) {
          throw new Error(`Failed to load image (${response.status})`);
        }
        const blob = await response.blob();
        const derivedName = imageName || imagePath.split(/[/\\]/).pop() || 'image';
        const blobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = blobUrl;

        setItem({
          id: `${Date.now()}-${Math.random()}`,
          path: imagePath,
          name: derivedName,
          blob,
          blobUrl,
          size: blob.size,
          isVideo: /\.(mp4|webm|mov)$/i.test(derivedName),
          waifuTagger: { status: 'idle' },
        });
      } catch (error: any) {
        if (!cancelled) {
          setItem(null);
          setSourceError(error?.message || 'Failed to load image');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSource(false);
        }
      }
    };

    void loadFromPath();

    return () => {
      cancelled = true;
    };
  }, [imageName, imagePath]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const setItemTaggerState = useCallback((nextState: WaifuTaggerState) => {
    setItem((prev) => (prev ? { ...prev, waifuTagger: nextState } : prev));
  }, []);

  const copyToClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [showToast]);

  const revealInExplorer = useCallback(async (path?: string) => {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return;
    try {
      await showInFileExplorer(normalizedPath);
      showToast('Opened file location', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open file location', 'error');
    }
  }, [showToast]);

  const runWaifuTagger = useCallback(async () => {
    if (!item) return;
    if (item.isVideo) {
      showToast('Waifu tagger only supports images', 'error');
      return;
    }

    setItemTaggerState({ status: 'loading' });

    try {
      const normalizedPath = String(item.path || '').trim();
      const hasPath = normalizedPath.length > 0 && /[\\/]/.test(normalizedPath);
      const endpoint = '/api/metadata/tag-waifu';
      let response: Response;

      if (hasPath) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: normalizedPath,
            modelRepo: waifuOptions.modelRepo,
            generalThreshold: waifuOptions.generalThreshold,
            characterThreshold: waifuOptions.characterThreshold,
            ratingThreshold: waifuOptions.ratingThreshold,
            generalMcutEnabled: waifuOptions.generalMcutEnabled,
            characterMcutEnabled: waifuOptions.characterMcutEnabled,
            maxTags: waifuOptions.maxTags,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append('image', item.blob, item.name);
        formData.append('modelRepo', waifuOptions.modelRepo);
        formData.append('generalThreshold', String(waifuOptions.generalThreshold));
        formData.append('characterThreshold', String(waifuOptions.characterThreshold));
        formData.append('ratingThreshold', String(waifuOptions.ratingThreshold));
        formData.append('generalMcutEnabled', String(waifuOptions.generalMcutEnabled));
        formData.append('characterMcutEnabled', String(waifuOptions.characterMcutEnabled));
        formData.append('maxTags', String(waifuOptions.maxTags));
        response = await fetch(endpoint, { method: 'POST', body: formData });
      }

      const payload = await response.json().catch(() => null) as (WaifuTagResult & { error?: string; success?: boolean }) | null;
      if (!response.ok || !payload || payload.error || payload.success === false) {
        const message = payload?.error || `Tagging failed (${response.status})`;
        throw new Error(message);
      }

      setItemTaggerState({ status: 'done', result: payload });
      showToast(`Tagged ${payload.booruTags?.length || 0} booru tags`, 'success');
    } catch (error: any) {
      const errorMessage = error?.message || 'Tagging failed';
      setItemTaggerState({ status: 'error', error: errorMessage });
      showToast(errorMessage, 'error');
    }
  }, [item, setItemTaggerState, showToast, waifuOptions]);

  const getBooruExportString = useCallback((result: WaifuTagResult): string => {
    const toTagArray = (raw: string): string[] => {
      const text = String(raw || '').trim();
      if (!text) return [];
      if (text.includes(',')) {
        return text.split(',').map((part) => part.trim()).filter(Boolean);
      }
      return text.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    };

    const normalizeTag = (raw: string): string => {
      const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return '';
      return waifuOptions.exportUseUnderscores
        ? cleaned.replace(/ /g, '_')
        : cleaned.replace(/_/g, ' ');
    };

    const prependTags = toTagArray(waifuOptions.prependTags).map(normalizeTag).filter(Boolean);
    const generatedTags = (result.booruTags || []).map(normalizeTag).filter(Boolean);
    const merged = [...prependTags, ...generatedTags];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const tag of merged) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(tag);
    }
    const separator = waifuOptions.exportUseCommas ? ', ' : ' ';
    return unique.join(separator).trim();
  }, [waifuOptions.exportUseCommas, waifuOptions.exportUseUnderscores, waifuOptions.prependTags]);

  const addPrependPreset = useCallback((rawPreset: string) => {
    const preset = normalizeWaifuPreset(rawPreset);
    if (!preset) {
      showToast('Enter tags to save as a preset', 'error');
      return;
    }
    const currentPresets = getWaifuPrependPresetsSnapshot();
    const exists = currentPresets.some((entry) => entry.toLowerCase() === preset.toLowerCase());
    if (exists) {
      showToast('Preset already exists', 'error');
      return;
    }
    setWaifuPrependPresets([preset, ...currentPresets]);
    setPrependPresetDraft('');
    showToast('Saved prepend preset', 'success');
  }, [showToast]);

  const applyPrependPreset = useCallback((preset: string) => {
    const cleanedPreset = normalizeWaifuPreset(preset);
    if (!cleanedPreset) return;
    setWaifuOptions((prev) => {
      const current = normalizeWaifuPreset(prev.prependTags);
      if (!current) return { ...prev, prependTags: cleanedPreset };
      if (current.toLowerCase() === cleanedPreset.toLowerCase()) return prev;
      return { ...prev, prependTags: `${cleanedPreset}, ${current}` };
    });
    showToast('Preset prepended', 'success');
  }, [showToast]);

  const removePrependPreset = useCallback((preset: string) => {
    const currentPresets = getWaifuPrependPresetsSnapshot();
    setWaifuPrependPresets(currentPresets.filter((entry) => entry !== preset));
  }, []);

  const booruExportString = useMemo(() => {
    if (!item?.waifuTagger.result) return '';
    return getBooruExportString(item.waifuTagger.result);
  }, [getBooruExportString, item?.waifuTagger.result]);

  return (
    <div className="space-y-4 text-[var(--umbra-text)]">
      <div className="glass-panel p-4 border-[var(--umbra-accent)]/35 bg-[var(--umbra-accent)]/8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--umbra-accent)] flex items-center gap-2">
              <Sparkles size={14} />
              Waifu Diffusion Tagger
            </h3>
            <p className="text-xs umbra-text-muted mt-1">Full tagging controls directly in this overlay.</p>
          </div>
          <div className="flex items-center gap-2">
            {onSendToWaifuDiffusion && (
              <button
                onClick={onSendToWaifuDiffusion}
                className="px-3 py-1.5 glass-panel bg-[var(--umbra-accent)]/12 hover:bg-[var(--umbra-accent)]/20 border-[var(--umbra-accent)]/30 text-[var(--umbra-accent)] text-xs font-semibold uppercase tracking-wide transition-colors flex items-center gap-1.5"
              >
                <Send size={13} />
                Open Workspace
              </button>
            )}
            <button
              onClick={runWaifuTagger}
              disabled={!item || item.isVideo || isLoadingSource || item.waifuTagger.status === 'loading'}
              className="px-3 py-1.5 rounded bg-[var(--umbra-accent)] hover:brightness-110 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-xs font-semibold transition inline-flex items-center gap-1.5"
            >
              {item?.waifuTagger.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Tag Image
            </button>
            {!isUmbraRemoteClient() ? (
              <button
                onClick={() => void revealInExplorer(item?.path)}
                disabled={!item}
                className="px-3 py-1.5 rounded border border-white/15 umbra-surface-soft hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold transition inline-flex items-center gap-1.5"
                title="Show source file in file explorer"
              >
                <FolderOpen size={13} />
                Show in File Explorer
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isLoadingSource && (
        <div className="glass-panel p-4 border-white/10 umbra-surface-soft text-sm umbra-text-muted flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-[var(--umbra-accent)]" />
          Loading source image...
        </div>
      )}

      {sourceError && !isLoadingSource && (
        <div className="glass-panel p-4 border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {sourceError}
        </div>
      )}

      {item && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,0.7fr)_minmax(300px,1fr)] gap-4">
            <div className="glass-panel border-white/10 umbra-surface-soft p-3">
              <p className="text-xs umbra-text-faint mb-2">Source</p>
              {item.isVideo ? (
                <video src={item.blobUrl} controls className="w-full max-h-56 object-contain rounded umbra-surface-deep" />
              ) : (
                <img src={item.blobUrl} alt={item.name} className="w-full max-h-56 object-contain rounded umbra-surface-deep" />
              )}
              <p className="text-xs umbra-text-muted mt-2 truncate" title={item.path}>{item.name}</p>
              <p className="text-[11px] umbra-text-faint truncate" title={item.path}>{item.path}</p>
            </div>

            <div className="space-y-3">
              <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-2">Model & Thresholds</p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <label className="text-[11px] umbra-text-faint">
                    Model
                    <select
                      value={waifuOptions.modelRepo}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, modelRepo: e.target.value }))}
                      className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                    >
                      {WAIFU_MODEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] umbra-text-faint">
                    Max Tags
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={waifuOptions.maxTags}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setWaifuOptions((prev) => ({
                          ...prev,
                          maxTags: Number.isFinite(next) ? Math.max(1, Math.min(500, Math.floor(next))) : prev.maxTags,
                        }));
                      }}
                      className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                    />
                  </label>
                </div>

                <div className="space-y-2 mb-3">
                  <label className="block text-[11px] umbra-text-faint">
                    General Threshold: {waifuOptions.generalThreshold.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={waifuOptions.generalThreshold}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, generalThreshold: Number(e.target.value) }))}
                      className="w-full mt-1 accent-[var(--umbra-accent)]"
                      disabled={waifuOptions.generalMcutEnabled}
                    />
                  </label>
                  <label className="block text-[11px] umbra-text-faint">
                    Character Threshold: {waifuOptions.characterThreshold.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={waifuOptions.characterThreshold}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, characterThreshold: Number(e.target.value) }))}
                      className="w-full mt-1 accent-[var(--umbra-accent)]"
                      disabled={waifuOptions.characterMcutEnabled}
                    />
                  </label>
                  <label className="block text-[11px] umbra-text-faint">
                    Rating Threshold: {waifuOptions.ratingThreshold.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={waifuOptions.ratingThreshold}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, ratingThreshold: Number(e.target.value) }))}
                      className="w-full mt-1 accent-[var(--umbra-accent)]"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] umbra-text-muted">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={waifuOptions.generalMcutEnabled}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, generalMcutEnabled: e.target.checked }))}
                      className="accent-[var(--umbra-accent)]"
                    />
                    Auto general threshold (MCut)
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={waifuOptions.characterMcutEnabled}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, characterMcutEnabled: e.target.checked }))}
                      className="accent-[var(--umbra-accent)]"
                    />
                    Auto character threshold (MCut)
                  </label>
                </div>
              </div>

              <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-2">Booru Export Format</p>
                <div className="flex flex-wrap gap-3 text-[11px] umbra-text-muted mb-2">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={waifuOptions.exportUseUnderscores}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, exportUseUnderscores: e.target.checked }))}
                      className="accent-[var(--umbra-accent)]"
                    />
                    Replace spaces with underscores
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={waifuOptions.exportUseCommas}
                      onChange={(e) => setWaifuOptions((prev) => ({ ...prev, exportUseCommas: e.target.checked }))}
                      className="accent-[var(--umbra-accent)]"
                    />
                    Use commas between tags
                  </label>
                </div>
                <label className="block text-[11px] umbra-text-faint">
                  Prepend Tags
                  <input
                    type="text"
                    value={waifuOptions.prependTags}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, prependTags: e.target.value }))}
                    placeholder="masterpiece, best_quality"
                    className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </label>

                <div className="mt-3 space-y-2">
                  <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Saved Prepend Presets</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={prependPresetDraft}
                      onChange={(e) => setPrependPresetDraft(e.target.value)}
                      placeholder="artist_name, style_tag"
                      className="umbra-input flex-1 rounded px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => addPrependPreset(prependPresetDraft)}
                      className="px-2 py-1 rounded text-[11px] font-semibold transition umbra-chip-neutral hover:brightness-110"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => addPrependPreset(waifuOptions.prependTags)}
                      className="px-2 py-1 rounded bg-[var(--umbra-accent)]/25 hover:bg-[var(--umbra-accent)]/35 text-white text-[11px] font-semibold"
                    >
                      Save Current
                    </button>
                  </div>

                  {prependPresets.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {prependPresets.map((preset) => (
                        <div key={preset} className="inline-flex items-center rounded umbra-chip-row">
                          <button
                            type="button"
                            onClick={() => applyPrependPreset(preset)}
                            className="px-2 py-1 text-[11px] umbra-text-muted hover:text-[var(--umbra-text)]"
                            title="Apply preset"
                          >
                            {preset}
                          </button>
                          <button
                            type="button"
                            onClick={() => removePrependPreset(preset)}
                            className="px-1 py-1 umbra-icon-button hover:text-red-400"
                            title="Remove preset"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] umbra-text-faint">No saved presets yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {item.waifuTagger.status === 'error' && (
            <div className="rounded bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-300">
              {item.waifuTagger.error || 'Tagging failed'}
            </div>
          )}

          {item.waifuTagger.status === 'done' && item.waifuTagger.result && (
            <div className="space-y-3">
              <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Booru Tags</p>
                  <button
                    onClick={() => copyToClipboard(booruExportString, 'Copied booru tags')}
                    className="p-1 rounded transition umbra-icon-button"
                    title="Copy booru tags"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <p className="text-xs text-[var(--umbra-text)] mt-1 break-words">{booruExportString || 'No tags'}</p>
              </div>

              {Object.keys(item.waifuTagger.result.rating || {}).length > 0 && (
                <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                  <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-1">Rating</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(item.waifuTagger.result.rating).map(([tag, score]) => (
                      <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                        {tag} ({(score * 100).toFixed(1)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.waifuTagger.result.character.length > 0 && (
                <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Character Tags</p>
                    <button
                      onClick={() => copyToClipboard(item.waifuTagger.result?.characterTagString || '', 'Copied character tags')}
                      className="p-1 rounded transition umbra-icon-button"
                      title="Copy character tags"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.waifuTagger.result.character.map(({ tag, score }) => (
                      <span key={tag} className="px-2 py-1 rounded bg-[var(--umbra-accent)]/15 border border-[var(--umbra-accent)]/25 text-[11px] text-[var(--umbra-accent)]">
                        {tag} ({(score * 100).toFixed(1)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.waifuTagger.result.general.length > 0 && (
                <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide">General Tags</p>
                    <button
                      onClick={() => copyToClipboard(item.waifuTagger.result?.generalTagString || '', 'Copied general tags')}
                      className="p-1 rounded transition umbra-icon-button"
                      title="Copy general tags"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.waifuTagger.result.general.map(({ tag, score }) => (
                      <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                        {tag} ({(score * 100).toFixed(1)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
