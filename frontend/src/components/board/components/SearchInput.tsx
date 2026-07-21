import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useBooru } from '../hooks/useBooru';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  source: string;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  source,
  placeholder = 'Search tags...',
}: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const { autocomplete } = useBooru();

  // Get the current word being typed
  const getCurrentWord = useCallback(() => {
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const words = beforeCursor.split(' ');
    return words[words.length - 1] || '';
  }, [value]);

  // Fetch autocomplete suggestions
  useEffect(() => {
    const currentWord = getCurrentWord();
    if (currentWord.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const results = await autocomplete(source, currentWord);
      setSuggestions(results.slice(0, 10));
    }, 150);

    return () => clearTimeout(timer);
  }, [value, source, autocomplete, getCurrentWord]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        insertSuggestion(suggestions[selectedIndex]);
      } else {
        onSearch();
      }
      setShowSuggestions(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Insert selected suggestion
  const insertSuggestion = (tag: string) => {
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);

    const words = beforeCursor.split(' ');
    words[words.length - 1] = tag;

    const newValue = words.join(' ') + ' ' + afterCursor.trim();
    onChange(newValue.trim() + ' ');
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
    // Re-enable suggestions after a short delay to override the onBlur timeout
    setTimeout(() => setShowSuggestions(true), 250);
  };

  return (
    <div className="relative flex-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="umbra-input w-full rounded-md px-7 py-1.5 text-xs outline-none transition-colors placeholder:text-zinc-500 focus:border-cyan-400/60"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="umbra-icon-button absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="glass-panel custom-scrollbar absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border-white/10 p-1">
          {suggestions.map((tag, index) => (
            <button
              key={tag}
              onClick={() => insertSuggestion(tag)}
              className={`w-full rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                index === selectedIndex ? 'bg-cyan-500/15 text-cyan-100' : 'text-zinc-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
