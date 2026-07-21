import React from 'react';
import { Search } from 'lucide-react';
import type { GlobalSearchSuggestionEntry } from './powerPrompterSupport';
import { normalizeSearchChip } from './powerPrompterPromptChips';

type PowerPrompterGlobalSearchBoxProps = {
  searchBoxRef: React.RefObject<HTMLDivElement | null>;
  query: string;
  suggestionsOpen: boolean;
  suggestionIndex: number;
  suggestions: GlobalSearchSuggestionEntry[];
  onQueryChange: (value: string) => void;
  onSuggestionsOpenChange: (open: boolean) => void;
  onSuggestionIndexChange: React.Dispatch<React.SetStateAction<number>>;
  onSelect: (value: string) => void;
};

export function PowerPrompterGlobalSearchBox({
  searchBoxRef,
  query,
  suggestionsOpen,
  suggestionIndex,
  suggestions,
  onQueryChange,
  onSuggestionsOpenChange,
  onSuggestionIndexChange,
  onSelect,
}: PowerPrompterGlobalSearchBoxProps) {
  return (
    <div ref={searchBoxRef} className="relative">
      <label className="relative block">
        <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(event) => onQueryChange(String(event.target.value || ''))}
          onFocus={() => {
            if (String(query || '').trim()) {
              onSuggestionsOpenChange(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              if (suggestions.length === 0) return;
              event.preventDefault();
              onSuggestionsOpenChange(true);
              onSuggestionIndexChange((prev) => Math.min(suggestions.length - 1, prev + 1));
              return;
            }
            if (event.key === 'ArrowUp') {
              if (suggestions.length === 0) return;
              event.preventDefault();
              onSuggestionsOpenChange(true);
              onSuggestionIndexChange((prev) => Math.max(0, prev - 1));
              return;
            }
            if (event.key === 'Enter') {
              const selected = suggestions[suggestionIndex];
              if (selected) {
                event.preventDefault();
                onSelect(selected.value);
                return;
              }
              const fallback = normalizeSearchChip(query);
              if (fallback) {
                event.preventDefault();
                onSelect(fallback);
              }
              return;
            }
            if (event.key === 'Escape') {
              onSuggestionsOpenChange(false);
            }
          }}
          placeholder="Search prompt text..."
          className="w-full rounded-md border border-white/12 bg-black/35 pl-7 pr-2.5 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/60"
          title="Global prompt text search"
        />
      </label>
      {suggestionsOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[260px] overflow-y-auto rounded-lg border border-white/15 bg-[#07090f]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md custom-scrollbar">
          {suggestions.map((entry, idx) => {
            const active = idx === suggestionIndex;
            return (
              <button
                key={`pp-global-search-suggest-${entry.key}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(entry.value);
                }}
                className={`w-full border-b border-white/5 px-2.5 py-1.5 text-left transition-colors last:border-b-0 ${
                  active
                    ? 'bg-cyan-500/16 text-cyan-100'
                    : 'text-zinc-200 hover:bg-white/[0.06]'
                }`}
                title={`Use ${entry.kind}: ${entry.value}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full border border-sky-400/45 bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-200">
                    {entry.kind}
                  </span>
                  <span className="truncate text-[11px]">{entry.value}</span>
                  <span className="ml-auto text-[10px] text-zinc-500">{entry.count}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
