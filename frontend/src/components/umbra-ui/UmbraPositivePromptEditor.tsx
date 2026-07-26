'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  BookmarkPlus,
  Copy,
  History,
  ListPlus,
  Loader2,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { generateUmbraUiAgentPrompt } from '@/lib/umbraUiAgent';
import {
  getUmbraUiPromptHistoryFieldCount,
  type UmbraUiPromptHistoryEntry,
} from '@/lib/umbraUiPromptHistory';
import {
  compileUmbraUiPromptSegments,
  createUmbraUiPromptSegment,
  mergeUmbraUiPromptSegmentEnhancements,
  normalizeUmbraUiPromptSegmentText,
  type UmbraUiPromptSegment,
} from '@/lib/umbraUiPromptSegments';
import {
  applyUmbraPromptWeightToTextarea,
  isUmbraPromptWeightShortcut,
  isUmbraQueueShortcut,
} from '@/lib/umbraUiPromptShortcuts';
import {
  cloneUmbraUiPromptFieldHistory,
  recordUmbraUiPromptFieldCheckpoint,
  redoUmbraUiPromptField,
  undoUmbraUiPromptField,
  type UmbraUiPromptFieldHistory,
} from '@/lib/umbraUiPromptFieldHistory';

interface UmbraPositivePromptEditorProps {
  segments: UmbraUiPromptSegment[];
  activeSegmentId: string;
  onChange: (segments: UmbraUiPromptSegment[]) => void;
  onActiveSegmentChange: (segmentId: string) => void;
  history?: UmbraUiPromptHistoryEntry[];
  onRememberCurrent?: () => void;
  onRestoreHistory?: (entry: UmbraUiPromptHistoryEntry) => void;
  onRemoveHistory?: (entryId: string) => void;
  onClearHistory?: () => void;
  accent?: 'cyan' | 'rose' | 'fuchsia';
  heading?: string;
  onSubmit?: () => void;
  agentContext?: Record<string, unknown>;
  onAgentEnhancementApplied?: () => void;
  mediaType?: 'image' | 'video';
}

const MAX_PROMPT_SEGMENTS = 24;

function getPromptSegmentTextSignature(segments: UmbraUiPromptSegment[]): string {
  return JSON.stringify(segments.map((segment) => [segment.id, segment.text]));
}

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
  onSubmit,
  agentContext,
  onAgentEnhancementApplied,
  mediaType = 'image',
}: UmbraPositivePromptEditorProps) {
  const showToast = useStore((state) => state.showToast);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [enhancingFields, setEnhancingFields] = React.useState(false);
  const textareaRefs = React.useRef(new Map<string, HTMLTextAreaElement>());
  const fieldHistoriesRef = React.useRef(new Map<string, UmbraUiPromptFieldHistory>());
  const typingCheckpointIdsRef = React.useRef(new Set<string>());
  const expectedInternalSignatureRef = React.useRef<string | null>(null);
  const previousSegmentsRef = React.useRef(segments);
  const [, forceHistoryRender] = React.useState(0);
  const segmentsRef = React.useRef(segments);
  segmentsRef.current = segments;
  const compiledPrompt = React.useMemo(() => compileUmbraUiPromptSegments(segments), [segments]);
  const selectedAgentSegments = React.useMemo(
    () => segments.filter((segment) => segment.agentEnabled === true),
    [segments],
  );
  const activeClasses = accent === 'rose'
    ? 'border-rose-300/35 bg-rose-500/[0.045]'
    : accent === 'fuchsia'
      ? 'border-fuchsia-300/35 bg-fuchsia-500/[0.045]'
      : 'border-cyan-300/35 bg-cyan-500/[0.045]';

  const emitSegments = React.useCallback((next: UmbraUiPromptSegment[]) => {
    expectedInternalSignatureRef.current = getPromptSegmentTextSignature(next);
    previousSegmentsRef.current = next;
    segmentsRef.current = next;
    onChange(next);
  }, [onChange]);

  const recordFieldCheckpoint = React.useCallback((
    id: string,
    previousText: string,
    inheritedHistory?: UmbraUiPromptFieldHistory,
  ) => {
    fieldHistoriesRef.current.set(
      id,
      recordUmbraUiPromptFieldCheckpoint(
        inheritedHistory || fieldHistoriesRef.current.get(id),
        previousText,
      ),
    );
    forceHistoryRender((revision) => revision + 1);
  }, []);

  const updateSegment = React.useCallback((
    id: string,
    text: string,
    mode: 'typing' | 'action' | 'silent' = 'typing',
  ) => {
    const currentSegments = segmentsRef.current;
    const current = currentSegments.find((segment) => segment.id === id);
    if (!current || current.text === text) return;
    if (mode === 'action') {
      recordFieldCheckpoint(id, current.text);
      typingCheckpointIdsRef.current.delete(id);
    } else if (mode === 'typing' && !typingCheckpointIdsRef.current.has(id)) {
      recordFieldCheckpoint(id, current.text);
      typingCheckpointIdsRef.current.add(id);
    }
    emitSegments(currentSegments.map((segment) => (
      segment.id === id ? { ...segment, text } : segment
    )));
  }, [emitSegments, recordFieldCheckpoint]);

  const normalizeSegment = React.useCallback((id: string) => {
    typingCheckpointIdsRef.current.delete(id);
    const current = segmentsRef.current.find((segment) => segment.id === id);
    if (!current) return;
    updateSegment(id, normalizeUmbraUiPromptSegmentText(current.text), 'silent');
  }, [updateSegment]);

  const undoField = React.useCallback((id: string) => {
    const current = segmentsRef.current.find((segment) => segment.id === id);
    if (!current) return;
    const result = undoUmbraUiPromptField(fieldHistoriesRef.current.get(id), current.text);
    if (!result) return;
    fieldHistoriesRef.current.set(id, result.history);
    typingCheckpointIdsRef.current.delete(id);
    forceHistoryRender((revision) => revision + 1);
    updateSegment(id, result.text, 'silent');
    window.requestAnimationFrame(() => textareaRefs.current.get(id)?.focus({ preventScroll: true }));
  }, [updateSegment]);

  const redoField = React.useCallback((id: string) => {
    const current = segmentsRef.current.find((segment) => segment.id === id);
    if (!current) return;
    const result = redoUmbraUiPromptField(fieldHistoriesRef.current.get(id), current.text);
    if (!result) return;
    fieldHistoriesRef.current.set(id, result.history);
    typingCheckpointIdsRef.current.delete(id);
    forceHistoryRender((revision) => revision + 1);
    updateSegment(id, result.text, 'silent');
    window.requestAnimationFrame(() => textareaRefs.current.get(id)?.focus({ preventScroll: true }));
  }, [updateSegment]);

  React.useEffect(() => {
    const signature = getPromptSegmentTextSignature(segments);
    if (expectedInternalSignatureRef.current === signature) {
      expectedInternalSignatureRef.current = null;
      previousSegmentsRef.current = segments;
      return;
    }

    expectedInternalSignatureRef.current = null;
    const previousSegments = previousSegmentsRef.current;
    if (getPromptSegmentTextSignature(previousSegments) === signature) return;
    const previousById = new Map(previousSegments.map((segment) => [segment.id, segment]));
    let historyChanged = false;
    segments.forEach((segment, index) => {
      const previous = previousById.get(segment.id) || previousSegments[index];
      if (!previous || previous.text === segment.text) return;
      const inheritedHistory = previous.id === segment.id
        ? fieldHistoriesRef.current.get(segment.id)
        : cloneUmbraUiPromptFieldHistory(fieldHistoriesRef.current.get(previous.id));
      fieldHistoriesRef.current.set(
        segment.id,
        recordUmbraUiPromptFieldCheckpoint(inheritedHistory, previous.text),
      );
      historyChanged = true;
    });
    typingCheckpointIdsRef.current.clear();
    previousSegmentsRef.current = segments;
    if (historyChanged) forceHistoryRender((revision) => revision + 1);
  }, [segments]);

  const addSegment = React.useCallback(() => {
    const currentSegments = segmentsRef.current;
    if (currentSegments.length >= MAX_PROMPT_SEGMENTS) return;
    const nextSegment = createUmbraUiPromptSegment();
    const activeIndex = Math.max(0, currentSegments.findIndex((segment) => segment.id === activeSegmentId));
    const insertAt = currentSegments.length <= 0 ? 0 : activeIndex + 1;
    const next = [...currentSegments.slice(0, insertAt), nextSegment, ...currentSegments.slice(insertAt)];
    emitSegments(next);
    onActiveSegmentChange(nextSegment.id);
    window.requestAnimationFrame(() => textareaRefs.current.get(nextSegment.id)?.focus());
  }, [activeSegmentId, emitSegments, onActiveSegmentChange]);

  const removeSegment = React.useCallback((id: string) => {
    const currentSegments = segmentsRef.current;
    const index = currentSegments.findIndex((segment) => segment.id === id);
    if (index < 0) return;
    if (currentSegments.length <= 1) {
      updateSegment(id, '', 'action');
      return;
    }
    const next = currentSegments.filter((segment) => segment.id !== id);
    emitSegments(next);
    if (activeSegmentId === id) {
      onActiveSegmentChange(next[Math.max(0, index - 1)]?.id || next[0]?.id || '');
    }
  }, [activeSegmentId, emitSegments, onActiveSegmentChange, updateSegment]);

  const moveSegment = React.useCallback((id: string, direction: -1 | 1) => {
    const currentSegments = segmentsRef.current;
    const index = currentSegments.findIndex((segment) => segment.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentSegments.length) return;
    const next = [...currentSegments];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    emitSegments(next);
  }, [emitSegments]);

  const toggleAgentSegment = React.useCallback((id: string) => {
    if (enhancingFields) return;
    emitSegments(segmentsRef.current.map((segment) => segment.id === id
      ? { ...segment, agentEnabled: segment.agentEnabled !== true }
      : segment));
  }, [emitSegments, enhancingFields]);

  const enhanceSelectedSegments = React.useCallback(async () => {
    if (enhancingFields) return;
    const selected = segments.filter((segment) => segment.agentEnabled === true && segment.text.trim());
    if (selected.length <= 0) {
      showToast('Enable the agent on at least one non-empty prompt field.', 'error');
      return;
    }

    const sourceTextById = new Map(selected.map((segment) => [segment.id, segment.text]));
    const enhancedTextById = new Map<string, string>();
    const protectedFieldLabels = segments
      .filter((segment) => segment.agentEnabled !== true)
      .map((segment, index) => segment.label || `Field ${index + 1}`);
    setEnhancingFields(true);
    try {
      for (const segment of selected) {
        const index = segments.findIndex((entry) => entry.id === segment.id);
        const fieldLabel = segment.label || (index === 0 ? 'Base' : `Segment ${index + 1}`);
        const result = await generateUmbraUiAgentPrompt({
          mediaType,
          task: 'enhance-field',
          fieldLabel,
          prompt: segment.text,
          context: {
            ...(agentContext || {}),
            promptField: {
              id: segment.id,
              label: fieldLabel,
              position: index + 1,
              fieldCount: segments.length,
            },
            protectedFieldLabels,
          },
        });
        enhancedTextById.set(segment.id, result.prompt);
      }

      const merged = mergeUmbraUiPromptSegmentEnhancements(
        segmentsRef.current,
        sourceTextById,
        enhancedTextById,
      );
      if (merged.applied > 0) {
        const currentById = new Map(segmentsRef.current.map((segment) => [segment.id, segment]));
        merged.segments.forEach((segment) => {
          const current = currentById.get(segment.id);
          if (current && current.text !== segment.text) {
            recordFieldCheckpoint(segment.id, current.text);
          }
        });
        emitSegments(merged.segments);
        onAgentEnhancementApplied?.();
      }
      const skippedMessage = merged.skipped > 0
        ? ` ${merged.skipped} field${merged.skipped === 1 ? ' was' : 's were'} preserved because the text changed while the agent was working.`
        : '';
      showToast(
        merged.applied > 0
          ? `Agent enhanced ${merged.applied} prompt field${merged.applied === 1 ? '' : 's'}.${skippedMessage}`
          : `No prompt fields were replaced.${skippedMessage}`,
        merged.applied > 0 ? 'success' : 'error',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent failed to enhance the selected prompt fields.', 'error');
    } finally {
      setEnhancingFields(false);
    }
  }, [
    agentContext,
    enhancingFields,
    emitSegments,
    onAgentEnhancementApplied,
    recordFieldCheckpoint,
    mediaType,
    segments,
    showToast,
  ]);

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.02]">
      <header className="flex min-h-10 flex-wrap items-center gap-2 px-2.5 py-1.5">
        <Sparkles size={13} className={accent === 'rose' ? 'text-rose-300' : accent === 'fuchsia' ? 'text-fuchsia-300' : 'text-cyan-300'} />
        <span className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">{heading}</span>
        <span className="rounded-sm border border-white/10 bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
          {segments.length} field{segments.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void enhanceSelectedSegments()}
            disabled={enhancingFields || selectedAgentSegments.length <= 0}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 font-mono text-[9px] font-black uppercase transition-colors',
              selectedAgentSegments.length > 0
                ? accent === 'rose'
                  ? 'border-rose-300/30 bg-rose-500/[0.08] text-rose-100'
                  : accent === 'fuchsia'
                    ? 'border-fuchsia-300/30 bg-fuchsia-500/[0.08] text-fuchsia-100'
                    : 'border-cyan-300/30 bg-cyan-500/[0.08] text-cyan-100'
                : 'border-white/10 text-zinc-700',
            )}
            title="Enhance only the prompt fields with an enabled agent icon"
          >
            {enhancingFields ? <Loader2 size={11} className="animate-spin" /> : <WandSparkles size={11} />}
            {enhancingFields ? 'Enhancing' : `Enhance ${selectedAgentSegments.length}`}
          </button>
          <button
            type="button"
            onClick={onRememberCurrent}
            disabled={!compiledPrompt || !onRememberCurrent}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:border-cyan-300/25 hover:text-cyan-100 disabled:text-zinc-800"
            title="Save the current prompt to history"
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
            title="Show prompt history"
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
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400">Prompt History</span>
            <button
              type="button"
              onClick={onClearHistory}
              disabled={history.length <= 0 || !onClearHistory}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm border border-red-300/15 px-2 font-mono text-[9px] font-black uppercase text-red-200/65 hover:text-red-100 disabled:text-zinc-800"
              title="Clear prompt history"
            >
              <Trash2 size={10} /> Clear
            </button>
          </div>
          {history.length > 0 ? (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
              {history.map((entry) => {
                const historyPrompt = compileUmbraUiPromptSegments(entry.promptSegments);
                const fieldCount = getUmbraUiPromptHistoryFieldCount(entry);
                const fieldLabels = entry.promptSegments
                  .map((segment, index) => segment.label || `Field ${index + 1}`)
                  .join(' + ');
                return (
                  <div key={entry.id} className="flex min-w-0 items-center gap-1.5 border border-white/[0.07] bg-black/25 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onRestoreHistory?.(entry)}
                      disabled={!onRestoreHistory}
                      className="min-w-0 flex-1 text-left"
                      title={historyPrompt}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-200">{historyPrompt}</span>
                        <span className="shrink-0 rounded-sm border border-cyan-300/20 bg-cyan-500/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-black uppercase text-cyan-100/80">
                          {fieldCount} field{fieldCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] text-zinc-600">
                        {entry.createdAt > 0 ? new Date(entry.createdAt).toLocaleString() : 'Imported prompt'}
                        {fieldLabels ? ` / ${fieldLabels}` : ''}
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
          const fieldHistory = fieldHistoriesRef.current.get(segment.id);
          return (
            <article key={segment.id} className={cn('rounded-md border border-white/10 bg-black/25 p-2 transition-colors', active && activeClasses)}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  {segment.label || (index === 0 ? 'Base' : `Segment ${index + 1}`)}
                </span>
                {segment.variantName ? (
                  <span className="min-w-0 truncate font-mono text-[9px] text-zinc-600" title={segment.variantName}>
                    {segment.variantName}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => undoField(segment.id)}
                    disabled={!fieldHistory?.undo.length}
                    aria-label="Undo the last change to this prompt field"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 transition-colors hover:border-cyan-300/25 hover:text-cyan-100 disabled:text-zinc-800"
                    title="Undo the last change to this prompt field"
                  >
                    <Undo2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => redoField(segment.id)}
                    disabled={!fieldHistory?.redo.length}
                    aria-label="Redo the last change to this prompt field"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 transition-colors hover:border-cyan-300/25 hover:text-cyan-100 disabled:text-zinc-800"
                    title="Redo the last change to this prompt field"
                  >
                    <Redo2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAgentSegment(segment.id)}
                    disabled={enhancingFields}
                    aria-pressed={segment.agentEnabled === true}
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors disabled:opacity-40',
                      segment.agentEnabled === true
                        ? accent === 'rose'
                          ? 'border-rose-300/40 bg-rose-500/[0.12] text-rose-100'
                          : accent === 'fuchsia'
                            ? 'border-fuchsia-300/40 bg-fuchsia-500/[0.12] text-fuchsia-100'
                            : 'border-cyan-300/40 bg-cyan-500/[0.12] text-cyan-100'
                        : 'border-white/10 text-zinc-600 hover:text-zinc-300',
                    )}
                    title={segment.agentEnabled === true
                      ? 'Agent enhancement enabled for this field'
                      : 'Enable agent enhancement for this field'}
                  >
                    <Bot size={12} />
                  </button>
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
                onKeyDown={(event) => {
                  if (isUmbraPromptWeightShortcut(event.nativeEvent)) {
                    const weighted = applyUmbraPromptWeightToTextarea(
                      event.currentTarget,
                      event.key === 'ArrowUp' ? 0.1 : -0.1,
                    );
                    if (!weighted) return;
                    event.preventDefault();
                    updateSegment(segment.id, weighted.nextValue, 'action');
                    window.requestAnimationFrame(() => {
                      const textarea = textareaRefs.current.get(segment.id);
                      if (!textarea) return;
                      textarea.focus({ preventScroll: true });
                      textarea.setSelectionRange(weighted.selectionStart, weighted.selectionEnd);
                    });
                    return;
                  }
                  if (onSubmit && isUmbraQueueShortcut(event.nativeEvent)) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                onBlur={() => normalizeSegment(segment.id)}
                placeholder={index === 0 ? 'Main subject and composition' : 'Additional details, style, pose, or environment'}
                className={cn(
                  'min-h-20 w-full resize-y rounded-sm border bg-black/35 px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600',
                  accent === 'rose'
                    ? 'focus:border-rose-300/45'
                    : accent === 'fuchsia' ? 'focus:border-fuchsia-300/45' : 'focus:border-cyan-300/45',
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
