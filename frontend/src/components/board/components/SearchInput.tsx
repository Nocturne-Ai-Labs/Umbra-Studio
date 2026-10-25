import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { Search, X, Minus, Tag, Loader2, CornerDownLeft } from 'lucide-react';
import { useBooru } from '../hooks/useBooru';
import { BOORU_SOURCES } from '../sources';
import { applyTagSuggestion, collectTagSuggestions, removeSearchTag, tagSuggestionTargets, tokenizeSearchTags, type SearchTagSuggestion } from '../searchTags';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  source: string;
  placeholder?: string;
}

export function SearchInput({ value, onChange, onSearch, source, placeholder = 'Type tags… try blue hair or -watermark' }: SearchInputProps) {
  const [cursor, setCursor] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [response, setResponse] = useState<{ key: string; suggestions: SearchTagSuggestion[]; loading: boolean }>({ key: '', suggestions: [], loading: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingCursor = useRef<number | null>(null);
  const cache = useRef(new Map<string, string[]>());
  const listId = useId();
  const hintId = useId();
  const { autocomplete } = useBooru();
  const tokens = useMemo(() => tokenizeSearchTags(value), [value]);
  const targets = useMemo(() => tagSuggestionTargets(value, cursor), [value, cursor]);
  const requestKey = JSON.stringify([source, value, cursor]);
  const suggestions = response.key === requestKey ? response.suggestions : [];
  const popupVisible = open && targets.length > 0;
  const loading = popupVisible && (response.key !== requestKey || response.loading);

  useEffect(() => {
    const caret = pendingCursor.current;
    if (caret === null) return;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(caret, caret);
    pendingCursor.current = null;
  }, [value, cursor]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [requestKey]);

  useEffect(() => {
    if (!open || !targets.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResponse(previous => ({ key: requestKey, suggestions: previous.key === requestKey ? previous.suggestions : [], loading: true }));
      const results = await Promise.all(targets.map(async target => {
        const key = `${source}:${target.query.toLowerCase()}`;
        const cached = cache.current.get(key);
        if (cached) return cached;
        const matches = await autocomplete(source, target.query, controller.signal);
        if (!controller.signal.aborted && matches.length) {
          if (cache.current.size >= 80) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, matches);
        }
        return matches;
      }));
      if (controller.signal.aborted) return;
      setResponse({ key: requestKey, suggestions: collectTagSuggestions(targets, results), loading: false });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [autocomplete, open, requestKey, source, targets]);

  useEffect(() => {
    if (selectedIndex >= 0) optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const syncCursor = () => setCursor(inputRef.current?.selectionEnd ?? value.length);
  const setQuery = (next: string, position: number, suggest: boolean) => {
    pendingCursor.current = position;
    setCursor(position);
    setSelectedIndex(-1);
    setOpen(suggest);
    onChange(next);
  };
  const insertSuggestion = (suggestion: SearchTagSuggestion) => {
    const next = applyTagSuggestion(value, suggestion);
    setQuery(next.value, next.cursor, false);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (popupVisible && selectedIndex >= 0 && suggestions[selectedIndex]) insertSuggestion(suggestions[selectedIndex]);
      else { setOpen(false); onSearch(); }
    } else if (event.key === 'Tab' && popupVisible && selectedIndex >= 0 && suggestions[selectedIndex]) {
      event.preventDefault();
      insertSuggestion(suggestions[selectedIndex]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      setSelectedIndex(index => event.key === 'ArrowDown' ? Math.min(index + 1, suggestions.length - 1) : Math.max(index - 1, -1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setSelectedIndex(-1);
    }
  };

  return <div ref={rootRef} className="min-w-0 flex-1" onBlur={event => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) { setOpen(false); setSelectedIndex(-1); }
  }}>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input ref={inputRef} type="text" role="combobox" aria-label="Booru search tags" aria-autocomplete="list"
        aria-expanded={popupVisible} aria-controls={popupVisible ? listId : undefined} aria-describedby={hintId}
        aria-activedescendant={popupVisible && selectedIndex >= 0 && suggestions[selectedIndex] ? `${listId}-${selectedIndex}` : undefined}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        value={value} onChange={event => { setSelectedIndex(-1); setOpen(true); setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length); onChange(event.currentTarget.value); }}
        onFocus={() => { syncCursor(); if (pendingCursor.current === null) setOpen(true); }} onClick={() => { syncCursor(); setOpen(true); }} onSelect={syncCursor}
        onKeyDown={handleKeyDown} onKeyUp={syncCursor} placeholder={placeholder}
        className="umbra-input h-10 w-full rounded pl-9 pr-9 text-xs outline-none transition-colors placeholder:text-zinc-500 focus:border-[var(--umbra-accent)]" />
      {value && <button type="button" onClick={() => setQuery('', 0, false)} className="umbra-icon-button absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded" aria-label="Clear search" title="Clear all search tags"><X size={14} /></button>}

      {popupVisible && <div className="forge-tag-suggestions absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border shadow-xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[10px] text-zinc-400"><Tag size={12} /><span className="flex-1">Suggestions · {BOORU_SOURCES[source]?.name || source}</span>{loading && <Loader2 size={12} className="animate-spin" aria-label="Loading suggestions" />}</div>
        <div id={listId} role="listbox" aria-label="Tag suggestions" className="custom-scrollbar max-h-56 overflow-y-auto p-1">
          {suggestions.map((suggestion, index) => <button type="button" role="option" aria-selected={index === selectedIndex}
            id={`${listId}-${index}`} key={`${suggestion.start}:${suggestion.prefix}${suggestion.tag}`} tabIndex={-1}
            ref={element => { optionRefs.current[index] = element; }} data-i18n-skip=""
            onMouseDown={event => event.preventDefault()} onClick={() => insertSuggestion(suggestion)}
            className={`flex w-full min-w-0 items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors ${index === selectedIndex ? 'bg-[var(--umbra-accent-glow)] text-[var(--umbra-text)]' : 'text-zinc-300 hover:bg-white/10'}`}>
            {suggestion.prefix === '-' ? <Minus size={13} className="shrink-0 text-amber-300" /> : <Tag size={13} className="shrink-0 text-zinc-500" />}
            <span className="min-w-0 flex-1 break-words">{suggestion.prefix}{suggestion.tag}</span>
            {value.slice(suggestion.start, suggestion.end).includes(' ') && <span className="shrink-0 text-[10px] text-zinc-500">Join words</span>}
            {index === selectedIndex && <CornerDownLeft size={12} className="shrink-0" />}
          </button>)}
          {!suggestions.length && <p role="status" className="px-2.5 py-3 text-xs text-zinc-500">{loading ? 'Finding matching tags…' : 'No suggestions. You can still search with your tags.'}</p>}
        </div>
        <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-zinc-500">↑ ↓ to choose · Enter to add · Esc to close</p>
      </div>}
    </div>

    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
      <span id={hintId}>Suggestions join words with underscores. Use - to exclude a tag.</span>
      {!!tokens.length && <span className="shrink-0">{tokens.length} {tokens.length === 1 ? 'tag' : 'tags'}</span>}
    </div>
    {!!tokens.length && <div aria-label="Search tags" className="custom-scrollbar mt-1.5 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
      {tokens.map(token => <span key={token.start} className="forge-search-tag inline-flex max-w-full items-center rounded border text-[11px]" data-excluded={token.text.startsWith('-')}>
        <button type="button" data-i18n-skip="" aria-label={`Edit tag ${token.text}`} title={`Edit ${token.text}`} className="min-w-0 truncate px-2 py-1.5 text-left" onClick={() => {
          inputRef.current?.focus(); inputRef.current?.setSelectionRange(token.start, token.end); setCursor(token.end); setSelectedIndex(-1); setOpen(true);
        }}>{token.text}</button>
        <button type="button" aria-label={`Remove tag ${token.text}`} title={`Remove ${token.text}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-r hover:bg-white/10" onClick={() => {
          const next = removeSearchTag(value, token); setQuery(next, Math.min(token.start, next.length), false);
        }}><X size={12} /></button>
      </span>)}
    </div>}
  </div>;
}
