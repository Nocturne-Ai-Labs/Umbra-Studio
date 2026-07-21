import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { Settings, Copy, Save, CheckSquare, Square, Shuffle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { PowerPrompterSettingsModal } from '@/components/modals/PowerPrompterSettingsModal';

export interface PowerPrompterEditorRef {
  insertAtCursor: (text: string) => void;
}

interface PowerPrompterEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  path: string | null;
  enabledCSVs: string[];
  overlayMode?: boolean;
}

export const PowerPrompterEditor = forwardRef<PowerPrompterEditorRef, PowerPrompterEditorProps>(({ value, onChange, onSave, path, enabledCSVs, overlayMode = false }, ref) => {
  const editorBackgroundColor = overlayMode ? '#050508EC' : '#050508';
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const selectionDecorationIdsRef = useRef<string[]>([]);
  const activeSelectionRef = useRef<number[]>([]);
  const hasStoredSelectionRef = useRef(false);
  const valueRef = useRef(value);
  const selectionWriteSeqRef = useRef(0);
  const selectionLoadSeqRef = useRef(0);
  const completionCacheRef = useRef<{
    query: string;
    csvKey: string;
    ts: number;
    suggestions: any[];
  }>({
    query: '',
    csvKey: '',
    ts: 0,
    suggestions: [],
  });
  const completionAbortRef = useRef<AbortController | null>(null);
  const onChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<any>({
    colors: {
      general: '#0073ff',
      artist: '#c00000',
      copyright: '#a000a0',
      character: '#00aa00',
      metadata: '#ff8a00'
    },
    fuzzySensitivity: 0.6
  });
  const [activeSelection, setActiveSelection] = useState<number[]>([]);
  const [hasStoredSelection, setHasStoredSelection] = useState(false);
  const { showToast } = useStore();
  const getSelectableLineIndices = (text: string) => {
    const lines = String(text ?? '').split('\n');
    const indices: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (String(lines[i] ?? '').trim().length > 0) indices.push(i);
    }
    return indices;
  };

  useEffect(() => {
    activeSelectionRef.current = activeSelection;
  }, [activeSelection]);

  useEffect(() => {
    hasStoredSelectionRef.current = hasStoredSelection;
  }, [hasStoredSelection]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const normalizeSelectionIndices = (indices: number[]) => {
    return Array.from(
      new Set(
        indices
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
          .map((value) => Math.floor(value))
      )
    ).sort((a, b) => a - b);
  };

  const applySelectionState = (indices: number[]) => {
    const normalized = normalizeSelectionIndices(indices);
    activeSelectionRef.current = normalized;
    hasStoredSelectionRef.current = true;
    setActiveSelection(normalized);
    setHasStoredSelection(true);
  };

  const persistSelection = async (indices: number[]) => {
    selectionWriteSeqRef.current += 1;
    const unique = normalizeSelectionIndices(indices);

    // Keep UI responsive even if backend write is slow.
    applySelectionState(unique);
    if (!path) return;

    try {
      const res = await fetch('/api/powerprompter/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: path,
          activeIndices: unique,
        }),
      });
      if (!res.ok) throw new Error(`Failed to save selection (${res.status})`);
    } catch (error) {
      console.error('Failed to save Power Prompter selection state', error);
      showToast('Failed to save selection state', 'error');
    }
  };

  const applySelectionMode = async (mode: 'all_on' | 'all_off' | 'random') => {
    const selectable = getSelectableLineIndices(value);
    if (selectable.length === 0) return;

    if (mode === 'all_on') {
      await persistSelection(selectable);
      return;
    }
    if (mode === 'all_off') {
      await persistSelection([]);
      return;
    }

    const next = selectable.filter(() => Math.random() >= 0.5);
    if (next.length === 0) {
      next.push(selectable[Math.floor(Math.random() * selectable.length)]);
    }
    await persistSelection(next);
  };

  const setSelectionAtLine = async (lineIndex: number, enabled: boolean) => {
    const selectable = getSelectableLineIndices(valueRef.current);
    if (!selectable.includes(lineIndex)) return;

    const implicitAllSet = new Set(selectable);
    const working = hasStoredSelectionRef.current ? new Set(activeSelectionRef.current) : implicitAllSet;
    if (enabled) working.add(lineIndex);
    else working.delete(lineIndex);
    await persistSelection(Array.from(working));
  };

  const toggleSelectionAtLine = async (lineIndex: number) => {
    const selectable = getSelectableLineIndices(valueRef.current);
    if (!selectable.includes(lineIndex)) return;
    const implicitAllSet = new Set(selectable);
    const working = hasStoredSelectionRef.current ? new Set(activeSelectionRef.current) : implicitAllSet;
    const nextEnabled = !working.has(lineIndex);
    await setSelectionAtLine(lineIndex, nextEnabled);
  };

  const toggleCurrentLineSelection = async () => {
    if (!path) return;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    const position = editor?.getPosition?.();
    if (!model || !position) return;

    const lineIndex = Math.max(0, Number(position.lineNumber) - 1);
    await toggleSelectionAtLine(lineIndex);
  };

  // Helper to clean tag text (remove underscores, quotes)
  const cleanTagText = (tag: string): string => {
    return String(tag ?? '')
      .replace(/_/g, ' ')  // Replace underscores with spaces
      .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
      .trim();
  };

  // Expose insertAtCursor to parent
  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      // Clean the tag text
      const cleanedText = cleanTagText(text);

      const selection = editor.getSelection();
      const position = selection ? selection.getStartPosition() : editor.getPosition();

      if (!position) return;

      const model = editor.getModel();
      if (!model) return;
      const lineContent = model.getLineContent(position.lineNumber);

      // If line is empty, insert the tag with a trailing comma
      if (!lineContent.trim()) {
        const newLine = cleanedText + ', ';
        editor.executeEdits('', [{
          range: new monaco.Range(position.lineNumber, 1, position.lineNumber, lineContent.length + 1),
          text: newLine,
          forceMoveMarkers: true
        }]);
      } else {
        // Append to end of current line with comma separator
        let insertText = cleanedText + ', ';
        if (!lineContent.endsWith(' ') && !lineContent.endsWith(',')) {
          insertText = ', ' + insertText;
        }
        editor.executeEdits('', [{
          range: new monaco.Range(position.lineNumber, lineContent.length + 1, position.lineNumber, lineContent.length + 1),
          text: insertText,
          forceMoveMarkers: true
        }]);
      }

      editor.focus();
    }
  }), []);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/powerprompter/settings');
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const requestId = ++selectionLoadSeqRef.current;
    const writeSeqAtStart = selectionWriteSeqRef.current;

    const loadSelectionState = async () => {
      if (!path) {
        if (!cancelled) {
          activeSelectionRef.current = [];
          hasStoredSelectionRef.current = false;
          setActiveSelection([]);
          setHasStoredSelection(false);
        }
        return;
      }

      try {
        const res = await fetch(`/api/powerprompter/selections?file=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error(`Failed to load selections (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        if (requestId !== selectionLoadSeqRef.current) return;
        if (selectionWriteSeqRef.current !== writeSeqAtStart) return;
        const indices: number[] = Array.isArray(data?.activeIndices)
          ? data.activeIndices
            .map((value: any) => Number(value))
            .filter((value: number) => Number.isFinite(value) && value >= 0)
            .map((value: number) => Math.floor(value))
          : [];
        const normalized = Array.from(new Set(indices)).sort((a, b) => a - b);
        const stored = Boolean(data?.hasStoredSelection);
        activeSelectionRef.current = normalized;
        hasStoredSelectionRef.current = stored;
        setActiveSelection(normalized);
        setHasStoredSelection(stored);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load Power Prompter selection state', error);
        activeSelectionRef.current = [];
        hasStoredSelectionRef.current = false;
        setActiveSelection([]);
        setHasStoredSelection(false);
      }
    };

    void loadSelectionState();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const saveSettings = async (newSettings: any) => {
    try {
      await fetch('/api/powerprompter/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      setSettings(newSettings);
      updateTheme(newSettings);
    } catch (e) {
      showToast('Failed to save settings', 'error');
    }
  };

  const updateSelectionDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel?.();
    if (!editor || !monaco || !model) return;

    const selectable = getSelectableLineIndices(value);
    const activeSet = hasStoredSelection ? new Set(activeSelection) : new Set(selectable);
    const decorations = selectable.map((lineIndex) => ({
      range: new monaco.Range(lineIndex + 1, 1, lineIndex + 1, 1),
      options: {
        beforeContentClassName: activeSet.has(lineIndex)
          ? 'umbra-pp-status-toggle-enabled'
          : 'umbra-pp-status-toggle-disabled',
      },
    }));

    selectionDecorationIdsRef.current = model.deltaDecorations(selectionDecorationIdsRef.current, decorations);
  }, [value, hasStoredSelection, activeSelection]);

  const updateTheme = useCallback((currentSettings: any) => {
    if (!monacoRef.current) return;
    const monaco = monacoRef.current;
    const colors = currentSettings?.colors || {};
    const asMonacoColor = (value: unknown, fallback: string) =>
      String((typeof value === 'string' && value) ? value : fallback).replace('#', '');

    monaco.editor.defineTheme('power-prompter-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'tag.general', foreground: asMonacoColor(colors.general, '#0073ff') },
        { token: 'tag.artist', foreground: asMonacoColor(colors.artist, '#c00000') },
        { token: 'tag.copyright', foreground: asMonacoColor(colors.copyright, '#a000a0') },
        { token: 'tag.character', foreground: asMonacoColor(colors.character, '#00aa00') },
        { token: 'tag.metadata', foreground: asMonacoColor(colors.metadata, '#ff8a00') },
      ],
      colors: {
        'editor.background': editorBackgroundColor,
        'editor.foreground': '#e5e5e5',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorCursor.foreground': '#e2f331',
        'editor.selectionBackground': '#e2f33130',
      }
    });
    monaco.editor.setTheme('power-prompter-dark');
  }, [overlayMode]);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register language FIRST before completion provider
    monaco.languages.register({ id: 'power-prompt' });

    updateTheme(settings);

    // Helper to clean tag text (remove underscores, quotes)
    const cleanTag = (tag: string): string => {
      return String(tag ?? '')
        .replace(/_/g, ' ')  // Replace underscores with spaces
        .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
        .trim();
    };

    // Register completion provider with more trigger characters
    monaco.languages.registerCompletionItemProvider('power-prompt', {
      triggerCharacters: [' ', ','],
      provideCompletionItems: async (model: any, position: any) => {
        try {
          const lineNumber = Number(position?.lineNumber || 0);
          const column = Number(position?.column || 0);
          if (!model || !Number.isFinite(lineNumber) || !Number.isFinite(column) || lineNumber < 1 || column < 1) {
            return { suggestions: [] };
          }
          if (lineNumber > model.getLineCount()) return { suggestions: [] };

          // Get the text before cursor on current line
          const lineContent = String(model.getLineContent(lineNumber) ?? '');
          const textBeforeCursor = lineContent.substring(0, Math.max(0, column - 1));

          // Find the last word (after comma or space)
          const match = textBeforeCursor.match(/[\w_]+$/);
          const word = match ? match[0] : '';

          const range = {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: Math.max(1, column - word.length),
            endColumn: column,
          };

          // Only search if word is at least 2 chars
          if (word.length < 2) return { suggestions: [] };
          if (/^\d+$/.test(word)) return { suggestions: [] };
          if (!/[a-z_]/i.test(word)) return { suggestions: [] };
          if (word.length > 80) return { suggestions: [] };

          const normalizedWord = word.toLowerCase();
          const csvKey = enabledCSVs.join(',');
          const now = Date.now();
          const cache = completionCacheRef.current;
          if (
            cache.query === normalizedWord &&
            cache.csvKey === csvKey &&
            (now - cache.ts) < 1200
          ) {
            return { suggestions: cache.suggestions };
          }

          if (completionAbortRef.current) {
            completionAbortRef.current.abort();
          }
          const controller = new AbortController();
          completionAbortRef.current = controller;

          const res = await fetch(
            `/api/powerprompter/search?q=${encodeURIComponent(word)}&limit=30&csvs=${encodeURIComponent(enabledCSVs.join(','))}`,
            { signal: controller.signal }
          );
          if (!res.ok) return { suggestions: [] };
          const data = await res.json();
          const results = Array.isArray(data?.results) ? data.results : [];

          // Deduplicate by cleaned tag name
          const seen = new Set<string>();
          const suggestions = results
            .filter((r: any) => r.type === 'tag')
            .map((item: any) => {
              const cleanedTag = cleanTag(item.tag);

              // Skip if we've already seen this tag
              if (seen.has(cleanedTag.toLowerCase())) return null;
              seen.add(cleanedTag.toLowerCase());

              let kind = monaco.languages.CompletionItemKind.Text;
              let detail = 'General';

              switch (item.category) {
                case 1: detail = 'Artist'; kind = monaco.languages.CompletionItemKind.User; break;
                case 3: detail = 'Copyright'; kind = monaco.languages.CompletionItemKind.Class; break;
                case 4: detail = 'Character'; kind = monaco.languages.CompletionItemKind.User; break;
                case 5: detail = 'Metadata'; kind = monaco.languages.CompletionItemKind.Property; break;
              }

              return {
                label: cleanedTag,
                kind: kind,
                detail: detail,
                insertText: cleanedTag + ', ',  // Add comma and space after tag
                range: range,
                documentation: item.source
              };
            })
            .filter(Boolean);  // Remove nulls from deduplication

          completionCacheRef.current = {
            query: normalizedWord,
            csvKey,
            ts: now,
            suggestions,
          };

          return { suggestions };
        } catch (e) {
          if ((e as any)?.name === 'AbortError') {
            return { suggestions: [] };
          }
          return { suggestions: [] };
        }
      }
    });

    const flushOnChange = () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
        onChangeTimerRef.current = null;
      }
      onChange(editor.getValue());
    };

    const scheduleOnChange = () => {
      if (onChangeTimerRef.current) return;
      onChangeTimerRef.current = setTimeout(() => {
        try {
          onChangeTimerRef.current = null;
          onChange(editor.getValue());
        } catch (error) {
          console.error('[PowerPrompterEditor] Delayed onChange failed:', error);
        }
      }, 45);
    };

    editor.onDidChangeModelContent(() => {
      try {
        scheduleOnChange();
      } catch (error) {
        console.error('[PowerPrompterEditor] Model content handler failed:', error);
      }
    });

    editor.onDidBlurEditorText(() => {
      try {
        flushOnChange();
      } catch (error) {
        console.error('[PowerPrompterEditor] Blur flush failed:', error);
      }
    });

    editor.onMouseDown((event: any) => {
      try {
        const mouseTarget = event?.target;
        const position = mouseTarget?.position;
        const targetElement = mouseTarget?.element as HTMLElement | null;
        if (!position || !targetElement) return;
        if (Number(position.column) > 2) return;

        const badgeElement = targetElement.closest('.umbra-pp-status-toggle-enabled, .umbra-pp-status-toggle-disabled') as HTMLElement | null;
        if (!badgeElement) return;
        const lineIndex = Math.max(0, Number(position.lineNumber) - 1);
        const nativeEvent = event?.event?.browserEvent || event?.event;
        const clickX = Number(nativeEvent?.clientX ?? nativeEvent?.x ?? 0);
        const rect = badgeElement?.getBoundingClientRect?.();

        event?.event?.preventDefault?.();
        event?.event?.stopPropagation?.();

        // Left half = ON, right half = OFF. Fallback to toggle when geometry is unavailable.
        if (
          rect &&
          Number.isFinite(clickX) &&
          clickX >= rect.left &&
          clickX <= rect.right
        ) {
          const isOnClick = clickX <= (rect.left + rect.width / 2);
          void setSelectionAtLine(lineIndex, isOnClick);
        } else {
          void toggleSelectionAtLine(lineIndex);
        }
      } catch (error) {
        console.error('[PowerPrompterEditor] Toggle badge click failed:', error);
      }
    });

    updateSelectionDecorations();
  };

  const handleCopyPrompts = () => {
    const lines = String(value ?? '').split('\n');
    const selectable = getSelectableLineIndices(value);
    const activeSet = hasStoredSelection ? new Set(activeSelection) : new Set(selectable);
    const prompts = lines
      .map((line, idx) => ({ idx, text: String(line ?? '').trim() }))
      .filter((entry) => entry.text.length > 0 && activeSet.has(entry.idx))
      .map((entry) => entry.text);
    const text = prompts.join('\n');
    navigator.clipboard.writeText(text);
    showToast(`Copied ${prompts.length} prompts`, 'success');
  };

  // Inject overlay editor CSS
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .umbra-pp-editor-overlay .monaco-editor,
      .umbra-pp-editor-overlay .monaco-editor-background,
      .umbra-pp-editor-overlay .monaco-editor .margin,
      .umbra-pp-editor-overlay .monaco-editor .monaco-editor-background {
        background-color: rgba(5, 5, 8, 0.925) !important;
      }
      .monaco-editor .umbra-pp-status-toggle-enabled,
      .monaco-editor .umbra-pp-status-toggle-disabled {
        display: inline-flex;
        align-items: center;
        margin-right: 0.5rem;
        transform: translateY(1px);
        pointer-events: auto;
      }
      .monaco-editor .umbra-pp-status-toggle-enabled::before,
      .monaco-editor .umbra-pp-status-toggle-enabled::after,
      .monaco-editor .umbra-pp-status-toggle-disabled::before,
      .monaco-editor .umbra-pp-status-toggle-disabled::after {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.65rem;
        height: 0.85rem;
        padding: 0 0.3rem;
        margin-right: 0.22rem;
        border-radius: 0.25rem;
        border: 1px solid transparent;
        font-size: 0.55rem;
        font-weight: 800;
        letter-spacing: 0.03em;
        line-height: 1;
        box-sizing: border-box;
        pointer-events: auto;
      }
      .monaco-editor .umbra-pp-status-toggle-enabled::before,
      .monaco-editor .umbra-pp-status-toggle-disabled::before {
        content: 'ON';
      }
      .monaco-editor .umbra-pp-status-toggle-enabled::after,
      .monaco-editor .umbra-pp-status-toggle-disabled::after {
        content: 'OFF';
      }
      .monaco-editor .umbra-pp-status-toggle-enabled::before {
        color: #06151b;
        background: #22f7d5;
        border-color: #22f7d5;
        box-shadow: 0 0 4px #22f7d5, 0 0 9px rgba(34, 247, 213, 0.75);
      }
      .monaco-editor .umbra-pp-status-toggle-enabled::after {
        color: #7a8191;
        background: rgba(40, 44, 54, 0.7);
        border-color: rgba(122, 129, 145, 0.25);
      }
      .monaco-editor .umbra-pp-status-toggle-disabled::before {
        color: #7a8191;
        background: rgba(40, 44, 54, 0.7);
        border-color: rgba(122, 129, 145, 0.25);
      }
      .monaco-editor .umbra-pp-status-toggle-disabled::after {
        color: #25090c;
        background: #ff4d69;
        border-color: #ff4d69;
        box-shadow: 0 0 4px #ff4d69, 0 0 9px rgba(255, 77, 105, 0.65);
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
        onChangeTimerRef.current = null;
      }
      if (completionAbortRef.current) {
        completionAbortRef.current.abort();
        completionAbortRef.current = null;
      }
      const editor = editorRef.current;
      const model = editor?.getModel?.();
      if (model && selectionDecorationIdsRef.current.length > 0) {
        selectionDecorationIdsRef.current = model.deltaDecorations(selectionDecorationIdsRef.current, []);
      }
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    updateTheme(settings);
  }, [overlayMode, settings, updateTheme]);

  useEffect(() => {
    updateSelectionDecorations();
  }, [updateSelectionDecorations]);

  const selectableLineIndices = getSelectableLineIndices(value);
  const effectiveSelectedSet = hasStoredSelection
    ? new Set(activeSelection)
    : new Set(selectableLineIndices);
  const selectedCount = selectableLineIndices.filter((idx) => effectiveSelectedSet.has(idx)).length;

  return (
    <div
      className={`flex flex-col h-full relative ${overlayMode ? 'umbra-pp-editor-overlay' : ''}`}
      style={{ backgroundColor: editorBackgroundColor }}
    >
      {/* Toolbar */}
      <div className="h-12 border-b border-white/5 flex items-center justify-between px-4" style={{ backgroundColor: editorBackgroundColor }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            {path ? path.split('/').pop() : 'Unsaved Batch'}
          </span>
          <span className="text-[10px] text-zinc-600">
            {selectedCount}/{selectableLineIndices.length} selected
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { void applySelectionMode('all_on'); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-emerald-300 transition-all flex items-center gap-1 text-xs font-bold"
            title="Select All On"
          >
            <CheckSquare size={14} />
            All On
          </button>
          <button
            onClick={() => { void applySelectionMode('all_off'); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1 text-xs font-bold"
            title="Select All Off"
          >
            <Square size={14} />
            All Off
          </button>
          <button
            onClick={() => { void applySelectionMode('random'); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-amber-300 transition-all flex items-center gap-1 text-xs font-bold"
            title="Random Selection"
          >
            <Shuffle size={14} />
            Random
          </button>
          <button
            onClick={() => { void toggleCurrentLineSelection(); }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-cyan-300 transition-all flex items-center gap-1 text-xs font-bold"
            title="Toggle current line selection"
          >
            <CheckSquare size={14} />
            Toggle Line
          </button>
          <button
            onClick={handleCopyPrompts}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center gap-1 text-xs font-bold"
            title="Copy Prompts"
          >
            <Copy size={14} />
            Copy
          </button>
          <button
            onClick={onSave}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-[var(--umbra-accent)] transition-all"
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-all"
            title="Editor Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="power-prompt"
          theme="power-prompter-dark"
          value={value}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            lineHeight: 28,
            fontFamily: "'JetBrains Mono', 'Fira Code', Monaco, monospace",
            lineNumbers: 'on',
            glyphMargin: false,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            padding: { top: 15, bottom: 15 },
            automaticLayout: true,
            quickSuggestions: true,
            quickSuggestionsDelay: 140,
            suggestOnTriggerCharacters: true,
            wordBasedSuggestions: 'off',
          }}
        />
      </div>

      <PowerPrompterSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={saveSettings}
      />
    </div>
  );
});
