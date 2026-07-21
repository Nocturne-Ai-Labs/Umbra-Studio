'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Copy,
  History,
  ListPlus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UmbraCanvasPromptHistoryEntry } from '@/lib/umbraUiCanvasDocument';
import {
  compileUmbraUiPromptSegments,
  createUmbraUiPromptSegment,
  normalizeUmbraUiPromptSegmentText,
  type UmbraUiPromptSegment,
} from '@/lib/umbraUiPromptSegments';

interface UmbraPositivePromptEditorProps {
  segments: UmbraUiPromptSegment[];
  activeSegmentId: string;
  onChange: (segments: UmbraUiPromptSegment[]) => void;
  onActiveSegmentChange: (segmentId: string) => void;
  history?: UmbraCanvasPromptHistoryEntry[];
  onRememberCurrent?: () => void;
  onRestoreHistory?: (entry: UmbraCanvasPromptHistoryEntry) => void;
  onRemoveHistory?: (entryId: string) => void;
  onClearHistory?: () => void;
  accent?: 'cyan' | 'rose';
  heading?: string;
}

const MAX_PROMPT_SEGMENTS = 24;

export function UmbraPositivePromptEditor({
  segments,
  activeSegmentId,
  onChange,
  onActiveSegmentChange,
  history = [],
  onRememberCurrent,
  onRestoreHistory,
  onRemoveHistory,
  onClearHistory,
  accent = 'cyan',
  heading = 'Positive Prompt',
}: UmbraPositivePromptEditorProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const textareaRefs = React.useRef(new Map<string, HTMLTextAreaElement>());
  const compiledPrompt = React.useMemo(() => compileUmbraUiPromptSegments(segments), [segments]);
  const activeClasses = accent === 'rose'
    ? 'border-rose-300/35 bg-rose-500/[0.045]'
    : 'border-cyan-300/35 bg-cyan-500/[0.045]';

  const updateSegment = React.useCallback((id: string, text: string) => {
    onChange(segments.map((segment) => segment.id === id ? { ...segment, text } : segment));
  }, [onChange, segments]);

  const normalizeSegment = React.useCallback((id: string) => {
    onChange(segments.map((segment) => segment.id === id
      ? { ...segment, text: normalizeUmbraUiPromptSegmentText(segment.text) }
      : segment));
  }, [onChange, segments]);

  const addSegment = React.useCallback(() => {
    if (segments.length >= MAX_PROMPT_SEGMENTS) return;
    const nextSegment = createUmbraUiPromptSegment();
    const activeIndex = Math.max(0, segments.findIndex((segment) => segment.id === activeSegmentId));
    const insertAt = segments.length <= 0 ? 0 : activeIndex + 1;
    const next = [...segments.slice(0, insertAt), nextSegment, ...segments.slice(insertAt)];
    onChange(next);
    onActiveSegmentChange(nextSegment.id);
    window.requestAnimationFrame(() => textareaRefs.current.get(nextSegment.id)?.focus());
  }, [activeSegmentId, onActiveSegmentChange, onChange, segments]);

  const removeSegment = React.useCallback((id: string) => {
    const index = segments.findIndex((segment) => segment.id === id);
    if (index < 0) return;
    if (segments.length <= 1) {
      onChange([{ ...segments[0], text: '' }]);
      return;
    }
    const next = segments.filter((segment) => segment.id !== id);
    onChange(next);
    if (activeSegmentId === id) {
      onActiveSegmentChange(next[Math.max(0, index - 1)]?.id || next[0]?.id || '');
    }
  }, [activeSegmentId, onActiveSegmentChange, onChange, segments]);

  const moveSegment = React.useCallback((id: string, direction: -1 | 1) => {
    const index = segments.findIndex((segment) => segment.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= segments.length) return;
    const next = [...segments];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  }, [onChange, segments]);

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02]">
      <header className="flex min-h-10 flex-wrap items-center gap-2 px-2.5 py-1.5">
        <Sparkles size={13} className={accent === 'rose' ? 'text-rose-300' : 'text-cyan-300'} />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">{heading}</span>
        <span className="rounded-sm border border-white/10 bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
          {segments.length} field{segments.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onRememberCurrent}
            disabled={!compiledPrompt || !onRememberCurrent}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:border-cyan-300/25 hover:text-cyan-100 disabled:text-zinc-800"
            title="Save the current prompt to this canvas project"
          >
            <BookmarkPlus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 font-mono text-[9px] font-black uppercase',
              historyOpen ? 'border-cyan-300/30 bg-cyan-500/[0.08] text-cyan-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200',
            )}
            title="Show prompt history for this canvas project"
          >
            <History size={11} /> {history.length}
          </button>
          <button
            type="button"
            onClick={addSegment}
            disabled={segments.length >= MAX_PROMPT_SEGMENTS}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.025] px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:border-cyan-300/25 hover:text-cyan-100 disabled:text-zinc-700"
            title="Add positive prompt field"
          >
            <ListPlus size={11} /> Add Field
          </button>
        </div>
      </header>

      {historyOpen ? (
        <div className="border-t border-white/10 bg-black/15 p-2">
          <div className="mb-1.5 flex items-center gap-2 px-0.5">
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400">Project History</span>
            <button
              type="button"
              onClick={onClearHistory}
              disabled={history.length <= 0 || !onClearHistory}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm border border-red-300/15 px-2 font-mono text-[9px] font-black uppercase text-red-200/65 hover:text-red-100 disabled:text-zinc-800"
              title="Clear prompt history for this canvas project"
            >
              <Trash2 size={10} /> Clear
            </button>
          </div>
          {history.length > 0 ? (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {history.map((entry) => {
                const historyPrompt = compileUmbraUiPromptSegments(entry.promptSegments);
                return (
                  <div key={entry.id} className="flex min-w-0 items-center gap-1.5 border border-white/[0.07] bg-black/25 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onRestoreHistory?.(entry)}
                      disabled={!onRestoreHistory}
                      className="min-w-0 flex-1 text-left"
                      title={historyPrompt}
                    >
                      <span className="block truncate font-mono text-[10px] text-zinc-200">{historyPrompt}</span>
                      <span className="mt-0.5 block font-mono text-[9px] text-zinc-600">
                        {entry.createdAt > 0 ? new Date(entry.createdAt).toLocaleString() : 'Imported prompt'}
                        {entry.negativePrompt ? ' / negative saved' : ''}
                      </span>
                    </button>
                    <button type="button" onClick={() => onRestoreHistory?.(entry)} disabled={!onRestoreHistory} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-cyan-300/15 text-cyan-200/70 hover:text-cyan-100 disabled:text-zinc-800" title="Restore this prompt"><RotateCcw size={11} /></button>
                    <button type="button" onClick={() => onRemoveHistory?.(entry.id)} disabled={!onRemoveHistory} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-red-300/15 text-red-200/60 hover:text-red-100 disabled:text-zinc-800" title="Remove this prompt from history"><Trash2 size={11} /></button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-white/[0.07] px-2 py-4 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-600">
              Generated and saved prompts appear here
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-white/10 p-2.5">
        {segments.map((segment, index) => {
          const active = segment.id === activeSegmentId;
          return (
            <article key={segment.id} className={cn('rounded-md border border-white/10 bg-black/25 p-2 transition-colors', active && activeClasses)}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  {index === 0 ? 'Base' : `Segment ${index + 1}`}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSegment(segment.id, -1)}
                    disabled={index === 0}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800"
                    title="Move prompt field up"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSegment(segment.id, 1)}
                    disabled={index === segments.length - 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800"
                    title="Move prompt field down"
                  >
                    <ArrowDown size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(segment.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-300/15 text-red-200/60 hover:border-red-300/35 hover:text-red-100"
                    title={segments.length <= 1 ? 'Clear prompt field' : 'Remove prompt field'}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <textarea
                ref={(node) => {
                  if (node) textareaRefs.current.set(segment.id, node);
                  else textareaRefs.current.delete(segment.id);
                }}
                value={segment.text}
                onFocus={() => onActiveSegmentChange(segment.id)}
                onChange={(event) => updateSegment(segment.id, event.target.value)}
                onBlur={() => normalizeSegment(segment.id)}
                placeholder={index === 0 ? 'Main subject and composition' : 'Additional details, style, pose, or environment'}
                className={cn(
                  'min-h-20 w-full resize-y rounded-sm border bg-black/35 px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600',
                  accent === 'rose' ? 'focus:border-rose-300/45' : 'focus:border-cyan-300/45',
                )}
              />
            </article>
          );
        })}

        <div className="flex min-w-0 items-center gap-2 rounded-sm border border-white/10 bg-black/20 px-2 py-1.5">
          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Compiled</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-300" title={compiledPrompt || 'Empty prompt'}>
            {compiledPrompt || 'Empty prompt'}
          </span>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(compiledPrompt)}
            disabled={!compiledPrompt}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800"
            title="Copy compiled prompt"
          >
            <Copy size={11} />
          </button>
        </div>
      </div>
    </section>
  );
}
