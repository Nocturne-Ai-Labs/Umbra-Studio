import { Save, Copy, Loader2, TextCursorInput } from 'lucide-react';
import type { DatasetImage } from '../types';
import { DatasetThumbnail } from './DatasetThumbnail';
import { DatasetRedownloadButton } from './DatasetRedownloadButton';
import { useCaptionDraft } from '../hooks/useCaptionDraft';

interface CaptionEditorProps {
  image: DatasetImage | null;
  datasetName: string;
  conceptFolder: string;
  onSave: (imageName: string, caption: string) => Promise<boolean>;
  onRedownload: (image: DatasetImage) => void;
  isRedownloading: boolean;
}

export function CaptionEditor({
  image,
  datasetName,
  conceptFolder,
  onSave,
  onRedownload,
  isRedownloading,
}: CaptionEditorProps) {
  const { caption, setCaption, isSaving, isDirty, error, save: handleSave } = useCaptionDraft(
    JSON.stringify([datasetName, conceptFolder, image?.filename]), image?.caption || '',
    image ? value => onSave(image.filename, value) : undefined,
  );

  const handleCopyTags = () => {
    if (image?.tags) {
      setCaption(image.tags.join(', '));
    }
  };

  if (!image) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-500">
        <TextCursorInput size={24} />
        <p className="text-sm text-zinc-300">Image captions</p>
        <p className="text-xs leading-relaxed">Select an image to review its sources and edit its training caption.</p>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex h-full flex-col overflow-y-auto">
      {/* Preview */}
      <div className="flex-shrink-0 border-b border-white/10 p-3">
        <div className="umbra-surface-deep relative mx-auto h-36 overflow-hidden rounded border border-white/10">
          <DatasetThumbnail image={image} datasetName={datasetName} conceptFolder={conceptFolder} contain />
        </div>
      </div>

      {/* Image info */}
      <div className="flex-shrink-0 space-y-1 border-b border-white/10 p-3">
        <p data-i18n-skip="" className="text-sm text-zinc-300 truncate" title={image.filename}>
          {image.filename}
        </p>
        {image.width && image.height && (
          <p className="text-xs text-zinc-500">
            {image.width} x {image.height}
          </p>
        )}
        <DatasetRedownloadButton image={image} busy={isRedownloading} onRedownload={onRedownload} />
      </div>

      <div className="shrink-0 space-y-2 border-b border-white/10 p-3 text-xs">
        <p className="font-bold uppercase tracking-widest text-zinc-400">Paired sources</p>
        {image.captionSourceError && <p role="alert" className="text-red-300">{image.captionSourceError}</p>}
        {(['natural', 'tags'] as const).map(kind => {
          const source = image.captionSources?.[kind];
          return <details key={kind} className="forge-disclosure"><summary><span>{kind === 'natural' ? 'Description' : 'Generated tags'}</span><span className={`ml-auto text-[10px] ${source?.error ? 'text-red-300' : source?.text ? 'text-emerald-300' : 'text-zinc-500'}`}>{source?.error ? 'Failed' : source?.text ? 'Saved' : 'Missing'}</span></summary><p className="custom-scrollbar mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-2 text-zinc-400" data-i18n-skip="">{source?.error || source?.text || 'Run this caption mode to save its source separately.'}</p></details>;
        })}
        <p className="text-[11px] leading-relaxed text-zinc-500">Training export combines descriptions and tags into matching .txt files.</p>
      </div>
      {/* Caption editor */}
      <div className="flex min-h-64 flex-1 flex-col space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
            Training caption (.txt)
          </span>
          {isDirty && (
            <span className="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-300">Unsaved</span>
          )}
        </div>

        <textarea
          aria-label="Training caption"
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
          }}
          placeholder="Write a description, tags, or both…"
          className="umbra-input custom-scrollbar min-h-32 w-full flex-1 resize-y rounded p-2 text-xs leading-relaxed placeholder:text-zinc-500 focus:border-[var(--umbra-accent)] focus:outline-none"
        />

        {/* Actions */}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="forge-button forge-button-primary flex-1"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Saving…' : 'Save caption'}
          </button>
        </div>
      </div>

      {/* Source tags (if available) */}
      {image.tags && image.tags.length > 0 && (
        <details className="forge-disclosure shrink-0 border-t border-white/10 p-3 text-xs">
          <summary>Original source tags<span className="ml-auto text-zinc-500">{image.tags.length}</span></summary>
          <div className="my-2 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
              Source Tags
            </span>
            <button
              type="button"
              onClick={handleCopyTags}
              className="forge-button"
            >
              <Copy className="w-3 h-3" />
              Copy to Caption
            </button>
          </div>
          <div className="custom-scrollbar flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {image.tags.slice(0, 30).map(tag => (
              <span data-i18n-skip=""
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
        </details>
      )}
    </div>
  );
}
