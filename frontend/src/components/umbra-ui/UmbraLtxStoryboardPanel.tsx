'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Clock3,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  generateUmbraUiAgentPrompt,
  loadUmbraUiAgentInstructions,
  type UmbraUiAgentInstruction,
} from '@/lib/umbraUiAgent';
import {
  isUmbraDirectorImageName,
  readUmbraDirectorDraggedImagePath,
  UMBRA_GALLERY_DRAG_PATHS_MIME,
} from '@/lib/umbraDirectorDrag';
import type { UmbraLtxStoryboardShot } from '../../../../shared/umbra-ui/videoStoryboard';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500';

interface UmbraLtxStoryboardPanelProps {
  shots: UmbraLtxStoryboardShot[];
  selectedShotId: string;
  agentContext?: Record<string, unknown>;
  onSelectedShotChange: (shotId: string) => void;
  onShotsChange: (shots: UmbraLtxStoryboardShot[]) => void;
  onAddShot: () => void;
  onClose: () => void;
}

export function UmbraLtxStoryboardPanel({
  shots,
  selectedShotId,
  agentContext,
  onSelectedShotChange,
  onShotsChange,
  onAddShot,
  onClose,
}: UmbraLtxStoryboardPanelProps) {
  const showToast = useStore((state) => state.showToast);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadingShotId, setUploadingShotId] = React.useState('');
  const [imageDropActive, setImageDropActive] = React.useState(false);
  const [enhancing, setEnhancing] = React.useState(false);
  const [instructions, setInstructions] = React.useState<UmbraUiAgentInstruction[]>([]);
  const [instructionId, setInstructionId] = React.useState('');
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) || shots[0] || null;
  const selectedAgentShots = shots.filter((shot) => shot.agentEnabled && shot.prompt.trim());
  const totalSeconds = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  const minimumTotalSeconds = Math.max(0.5, shots.length * 0.5);
  const maximumTotalSeconds = Math.min(600, Math.max(minimumTotalSeconds, shots.length * 60));

  React.useEffect(() => {
    let canceled = false;
    void loadUmbraUiAgentInstructions()
      .then((entries) => {
        if (canceled) return;
        const compatible = entries.filter((entry) => entry.mediaType === 'video' || entry.mediaType === 'both');
        setInstructions(compatible);
        setInstructionId((current) => compatible.some((entry) => entry.id === current)
          ? current
          : compatible[0]?.id || '');
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, []);

  React.useEffect(() => {
    if (selectedShot || shots.length <= 0) return;
    onSelectedShotChange(shots[0].id);
  }, [onSelectedShotChange, selectedShot, shots]);

  const updateShot = React.useCallback((id: string, patch: Partial<UmbraLtxStoryboardShot>) => {
    onShotsChange(shots.map((shot) => shot.id === id ? { ...shot, ...patch } : shot));
  }, [onShotsChange, shots]);

  const updateTotalDuration = React.useCallback((nextTotalSeconds: number) => {
    if (shots.length <= 0) return;
    const target = Math.max(minimumTotalSeconds, Math.min(maximumTotalSeconds, nextTotalSeconds));
    const currentTotal = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    const equalDuration = target / shots.length;
    const scaled = shots.map((shot) => ({
      ...shot,
      durationSeconds: Math.max(
        0.5,
        Math.min(60, currentTotal > 0 ? shot.durationSeconds * target / currentTotal : equalDuration),
      ),
    }));
    onShotsChange(scaled);
  }, [maximumTotalSeconds, minimumTotalSeconds, onShotsChange, shots]);

  const moveShot = React.useCallback((id: string, direction: -1 | 1) => {
    const index = shots.findIndex((shot) => shot.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= shots.length) return;
    const next = [...shots];
    [next[index], next[target]] = [next[target], next[index]];
    onShotsChange(next);
  }, [onShotsChange, shots]);

  const removeShot = React.useCallback((id: string) => {
    if (shots.length <= 2) return;
    const index = shots.findIndex((shot) => shot.id === id);
    const next = shots.filter((shot) => shot.id !== id);
    onShotsChange(next);
    if (id === selectedShotId) {
      onSelectedShotChange(next[Math.max(0, index - 1)]?.id || next[0]?.id || '');
    }
  }, [onSelectedShotChange, onShotsChange, selectedShotId, shots]);

  const uploadImage = React.useCallback(async (file: File) => {
    if (!selectedShot || uploadingShotId) return;
    setUploadingShotId(selectedShot.id);
    try {
      const response = await fetch('/api/comfy/upload-media', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-umbra-media-kind': 'image',
          'x-umbra-file-name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'Failed to upload the storyboard image.'));
      }
      const sourceImagePath = String(payload?.sourcePath || '').trim();
      const sourceImageName = String(payload?.filename || '').trim();
      if (!sourceImagePath || !sourceImageName) throw new Error('Umbra did not return the uploaded storyboard image.');
      updateShot(selectedShot.id, { sourceImagePath, sourceImageName });
      showToast('Umbra Director image ready.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to upload the storyboard image.', 'error');
    } finally {
      setUploadingShotId('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [selectedShot, showToast, updateShot, uploadingShotId]);

  const dropImage = React.useCallback((dataTransfer: DataTransfer) => {
    if (!selectedShot || uploadingShotId) return;
    const localPath = readUmbraDirectorDraggedImagePath(dataTransfer);
    if (localPath) {
      const sourceImageName = localPath.split(/[\\/]/).pop() || '';
      updateShot(selectedShot.id, {
        sourceImagePath: localPath,
        sourceImageName,
      });
      showToast(`Guide image added to shot ${shots.findIndex((shot) => shot.id === selectedShot.id) + 1}.`, 'success');
      return;
    }

    const file = Array.from(dataTransfer.files || []).find((entry) => (
      entry.type.startsWith('image/') || isUmbraDirectorImageName(entry.name)
    ));
    if (file) {
      void uploadImage(file);
      return;
    }

    showToast('Drop an image from the filmstrip, Gallery, or your computer.', 'error');
  }, [selectedShot, shots, showToast, updateShot, uploadImage, uploadingShotId]);

  const enhanceShots = React.useCallback(async () => {
    if (enhancing || selectedAgentShots.length <= 0) return;
    const sourceById = new Map(selectedAgentShots.map((shot) => [shot.id, shot.prompt]));
    const enhancedById = new Map<string, string>();
    setEnhancing(true);
    try {
      for (const shot of selectedAgentShots) {
        const index = shots.findIndex((entry) => entry.id === shot.id);
        const result = await generateUmbraUiAgentPrompt({
          mediaType: 'video',
          task: 'enhance-field',
          fieldLabel: `Umbra Director shot ${index + 1}`,
          prompt: shot.prompt,
          instructionId,
          context: {
            ...(agentContext || {}),
            storyboardShot: {
              id: shot.id,
              position: index + 1,
              shotCount: shots.length,
              durationSeconds: shot.durationSeconds,
              hasImageGuide: Boolean(shot.sourceImagePath || shot.sourceImageName),
            },
          },
        });
        enhancedById.set(shot.id, result.prompt);
      }
      let applied = 0;
      onShotsChange(shots.map((shot) => {
        const enhanced = enhancedById.get(shot.id);
        if (!enhanced || sourceById.get(shot.id) !== shot.prompt) return shot;
        applied += 1;
        return { ...shot, prompt: enhanced };
      }));
      showToast(`Agent enhanced ${applied} storyboard prompt${applied === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent failed to enhance the storyboard prompts.', 'error');
    } finally {
      setEnhancing(false);
    }
  }, [
    agentContext,
    enhancing,
    instructionId,
    onShotsChange,
    selectedAgentShots,
    shots,
    showToast,
  ]);

  return (
    <aside
      data-umbra-ltx-storyboard=""
      onDragEnter={(event) => {
        if (!selectedShot || uploadingShotId) return;
        const types = Array.from(event.dataTransfer.types || []);
        if (
          types.includes(UMBRA_GALLERY_DRAG_PATHS_MIME)
          || types.includes('application/json')
          || types.includes('Files')
        ) {
          event.preventDefault();
          setImageDropActive(true);
        }
      }}
      onDragOver={(event) => {
        if (!selectedShot || uploadingShotId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setImageDropActive(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setImageDropActive(false);
        dropImage(event.dataTransfer);
      }}
      className="relative min-h-0 overflow-y-auto border-r border-cyan-300/15 bg-[#05090a] p-3 custom-scrollbar"
    >
      {imageDropActive && selectedShot ? (
        <div className="pointer-events-none absolute inset-2 z-[80] flex items-center justify-center border-2 border-dashed border-cyan-300/60 bg-[#031011]/95 p-6 text-center shadow-[0_0_30px_rgba(34,211,238,0.2)]">
          <div>
            <ImageIcon size={28} className="mx-auto mb-3 text-cyan-200" />
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100">
              Add guide to shot {shots.findIndex((shot) => shot.id === selectedShot.id) + 1}
            </p>
            <p className="mt-1 font-mono text-[9px] text-zinc-500">
              Release the image anywhere in Umbra Director
            </p>
          </div>
        </div>
      ) : null}
      <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-500/[0.08] text-cyan-200">
          <Clock3 size={14} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-100">Umbra Director</h2>
          <p className="font-mono text-[9px] text-zinc-500">
            {shots.length} shots / {totalSeconds.toFixed(1)} seconds total
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-red-300/20 hover:text-red-200"
          title="Close Umbra Director"
        >
          <X size={13} />
        </button>
      </div>

      <label className="mb-3 block rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] p-2.5">
        <span className="flex items-center gap-2">
          <span className={labelClass}>Total Duration</span>
          <span className="ml-auto font-mono text-[11px] font-bold text-cyan-100">{totalSeconds.toFixed(1)} seconds</span>
        </span>
        <input
          type="range"
          min={minimumTotalSeconds}
          max={maximumTotalSeconds}
          step={0.5}
          value={Math.max(minimumTotalSeconds, Math.min(maximumTotalSeconds, totalSeconds))}
          onChange={(event) => updateTotalDuration(Number(event.target.value))}
          className="mt-2 h-4 w-full cursor-pointer accent-cyan-300"
          aria-label="Total storyboard duration in seconds"
        />
      </label>

      <div className="mb-3 flex items-center gap-2">
        <select
          value={instructionId}
          onChange={(event) => setInstructionId(event.target.value)}
          className={`${inputClass} h-9 min-w-0 flex-1 py-1.5 text-[10px]`}
          title="Agent instruction for selected Umbra Director prompts"
        >
          {instructions.length <= 0 ? <option value="">Default video instruction</option> : null}
          {instructions.map((instruction) => (
            <option key={instruction.id} value={instruction.id}>{instruction.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void enhanceShots()}
          disabled={enhancing || selectedAgentShots.length <= 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-fuchsia-300/25 bg-fuchsia-500/[0.07] px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-fuchsia-100 hover:bg-fuchsia-500/[0.12] disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-700"
          title="Enhance only shots with their agent icon enabled"
        >
          {enhancing ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />}
          {enhancing ? 'Enhancing' : `Enhance ${selectedAgentShots.length}`}
        </button>
      </div>

      <div className="space-y-1.5">
        {shots.map((shot, index) => (
          <div
            key={shot.id}
            className={cn(
              'grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-1.5 transition-colors',
              shot.id === selectedShot?.id
                ? 'border-cyan-300/35 bg-cyan-500/[0.07]'
                : 'border-white/[0.08] bg-white/[0.015]',
            )}
          >
            <button
              type="button"
              onClick={() => onSelectedShotChange(shot.id)}
              className="flex h-12 items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-black/50"
              title={`Edit shot ${index + 1}`}
            >
              {shot.sourceImagePath ? (
                <img
                  src={`/api/fs/image?path=${encodeURIComponent(shot.sourceImagePath)}`}
                  alt={`Shot ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : <ImageIcon size={14} className="text-zinc-700" />}
            </button>
            <button
              type="button"
              onClick={() => onSelectedShotChange(shot.id)}
              className="min-w-0 text-left"
            >
              <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-zinc-200">Shot {index + 1}</span>
              <span className="block truncate font-mono text-[9px] text-zinc-500">{shot.prompt || 'Prompt required'}</span>
              <span className="block font-mono text-[8px] text-cyan-200/65">{shot.durationSeconds.toFixed(1)} seconds</span>
            </button>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => updateShot(shot.id, { agentEnabled: !shot.agentEnabled })}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-sm border',
                  shot.agentEnabled
                    ? 'border-fuchsia-300/35 bg-fuchsia-500/[0.1] text-fuchsia-100'
                    : 'border-white/10 text-zinc-600',
                )}
                title={shot.agentEnabled ? 'Agent enhancement enabled' : 'Enable agent enhancement'}
              >
                <Bot size={11} />
              </button>
              <button
                type="button"
                onClick={() => removeShot(shot.id)}
                disabled={shots.length <= 2}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-300/15 text-zinc-700 hover:text-red-300 disabled:opacity-20"
                title="Remove shot"
              >
                <Trash2 size={10} />
              </button>
              <button
                type="button"
                onClick={() => moveShot(shot.id, -1)}
                disabled={index === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-600 hover:text-cyan-200 disabled:opacity-20"
                title="Move shot earlier"
              >
                <ArrowUp size={10} />
              </button>
              <button
                type="button"
                onClick={() => moveShot(shot.id, 1)}
                disabled={index === shots.length - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-600 hover:text-cyan-200 disabled:opacity-20"
                title="Move shot later"
              >
                <ArrowDown size={10} />
              </button>
            </div>
            <label className="col-span-3 grid grid-cols-[auto_minmax(0,1fr)_54px] items-center gap-2 border-t border-white/[0.07] pt-1.5">
              <span className="font-mono text-[8px] text-zinc-600">LENGTH</span>
              <input
                type="range"
                min={0.5}
                max={60}
                step={0.5}
                value={shot.durationSeconds}
                onChange={(event) => updateShot(shot.id, {
                  durationSeconds: Number(event.target.value),
                })}
                className="h-4 w-full cursor-pointer accent-cyan-300"
                aria-label={`Shot ${index + 1} duration in seconds`}
              />
              <span className="text-right font-mono text-[9px] font-bold text-cyan-100">
                {shot.durationSeconds.toFixed(1)}s
              </span>
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddShot}
        disabled={shots.length >= 24}
        className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/20 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/[0.08] disabled:text-zinc-700"
      >
        <Plus size={12} /> Add Shot
      </button>

      {selectedShot ? (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <div className="flex h-20 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/50">
              {selectedShot.sourceImagePath ? (
                <img
                  src={`/api/fs/image?path=${encodeURIComponent(selectedShot.sourceImagePath)}`}
                  alt="Selected storyboard guide"
                  className="h-full w-full object-contain"
                />
              ) : <ImageIcon size={18} className="text-zinc-700" />}
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className={labelClass}>Optional Guide Image</span>
              <input
                value={selectedShot.sourceImagePath}
                onChange={(event) => updateShot(selectedShot.id, {
                  sourceImagePath: event.target.value,
                  sourceImageName: '',
                })}
                placeholder="Paste a local image path"
                className={inputClass}
              />
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.avif,.bmp,.gif,.jpeg,.jpg,.png,.webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={Boolean(uploadingShotId)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-white/10 px-2 text-[9px] font-black uppercase text-zinc-400 hover:text-cyan-100 disabled:opacity-40"
                >
                  {uploadingShotId ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                  Choose
                </button>
                <button
                  type="button"
                  onClick={() => updateShot(selectedShot.id, { sourceImagePath: '', sourceImageName: '' })}
                  disabled={!selectedShot.sourceImagePath}
                  className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-red-300/15 px-2 text-[9px] font-black uppercase text-zinc-600 hover:text-red-200 disabled:opacity-30"
                >
                  <X size={10} /> Clear
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <label className="space-y-1.5">
              <span className={labelClass}>Guide Strength</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={selectedShot.strength}
                onChange={(event) => updateShot(selectedShot.id, {
                  strength: Math.max(0, Math.min(1, Number(event.target.value) || 0)),
                })}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="flex items-center gap-2">
              <span className={labelClass}>Shot Prompt</span>
              <button
                type="button"
                onClick={() => updateShot(selectedShot.id, { agentEnabled: !selectedShot.agentEnabled })}
                className={cn(
                  'ml-auto inline-flex h-7 w-7 items-center justify-center rounded-sm border',
                  selectedShot.agentEnabled
                    ? 'border-fuchsia-300/35 bg-fuchsia-500/[0.1] text-fuchsia-100'
                    : 'border-white/10 text-zinc-600',
                )}
                title="Toggle agent enhancement for this shot"
              >
                <Bot size={11} />
              </button>
            </span>
            <textarea
              value={selectedShot.prompt}
              onChange={(event) => updateShot(selectedShot.id, { prompt: event.target.value.replace(/\|/g, ',') })}
              maxLength={40_000}
              placeholder="Describe motion, camera movement, and what changes during this shot."
              className={`${inputClass} min-h-32 resize-y leading-relaxed`}
            />
          </label>
        </div>
      ) : null}
    </aside>
  );
}

export default UmbraLtxStoryboardPanel;
