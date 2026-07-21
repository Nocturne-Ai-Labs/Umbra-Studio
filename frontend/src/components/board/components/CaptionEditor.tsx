import { useState, useEffect } from 'react';
import { Save, Copy, Loader2 } from 'lucide-react';
import type { DatasetImage } from '../types';

interface CaptionEditorProps {
  image: DatasetImage | null;
  datasetName: string;
  conceptFolder: string;
  onSave: (imageName: string, caption: string) => Promise<boolean>;
}

export function CaptionEditor({
  image,
  datasetName,
  conceptFolder,
  onSave,
}: CaptionEditorProps) {
  const [caption, setCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Load caption when image changes
  useEffect(() => {
    if (image) {
      setCaption(image.caption || '');
      setIsDirty(false);
    }
  }, [image]);

  const handleSave = async () => {
    if (!image || !isDirty) return;

    setIsSaving(true);
    const success = await onSave(image.filename, caption);
    setIsSaving(false);

    if (success) {
      setIsDirty(false);
    }
  };

  const handleCopyTags = () => {
    if (image?.tags) {
      setCaption(image.tags.join(', '));
      setIsDirty(true);
    }
  };

  if (!image) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <p className="text-xs uppercase tracking-[0.16em]">Select an image to edit caption</p>
      </div>
    );
  }

  // Build image URL
  const imageUrl = `/api/files/datasets/${encodeURIComponent(datasetName)}/${encodeURIComponent(conceptFolder)}/${encodeURIComponent(image.filename)}`;

  return (
    <div className="h-full flex flex-col">
      {/* Preview */}
      <div className="flex-shrink-0 border-b border-white/10 p-3">
        <div className="umbra-surface-deep mx-auto aspect-square max-h-48 overflow-hidden rounded-lg border border-white/10">
          <img
            src={imageUrl}
            alt={image.filename}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Image info */}
      <div className="flex-shrink-0 space-y-1 border-b border-white/10 p-3">
        <p className="text-sm text-zinc-300 truncate" title={image.filename}>
          {image.filename}
        </p>
        {image.width && image.height && (
          <p className="text-xs text-zinc-500">
            {image.width} x {image.height}
          </p>
        )}
      </div>

      {/* Caption editor */}
      <div className="flex-1 flex flex-col p-3 space-y-2 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
            Caption
          </span>
          {isDirty && (
            <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-300">Unsaved</span>
          )}
        </div>

        <textarea
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
            setIsDirty(true);
          }}
          placeholder="Enter caption tags..."
          className="umbra-input custom-scrollbar w-full flex-1 resize-none rounded-lg p-2 text-sm placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
        />

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-500/22 disabled:border-white/10 disabled:bg-white/5 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>

      {/* Source tags (if available) */}
      {image.tags && image.tags.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
              Source Tags
            </span>
            <button
              onClick={handleCopyTags}
              className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
            >
              <Copy className="w-3 h-3" />
              Copy to Caption
            </button>
          </div>
          <div className="custom-scrollbar flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {image.tags.slice(0, 30).map(tag => (
              <span
                key={tag}
                className="umbra-chip-neutral rounded px-1.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            {image.tags.length > 30 && (
              <span className="px-1.5 py-0.5 text-xs text-zinc-500">
                +{image.tags.length - 30} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
