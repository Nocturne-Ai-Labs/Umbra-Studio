import { useEffect, useMemo, useRef, useState } from 'react';
import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import type { GlobalSearchSuggestionEntry } from '@/components/power-prompter/powerPrompterSupport';
import {
  buildPowerPrompterGlobalSearchSuggestions,
  filterPowerPrompterGlobalSearchSuggestions,
} from '@/components/power-prompter/powerPrompterSearchModel';

export function usePowerPrompterGlobalSearch(cardDocument: PowerPrompterCardDocument) {
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchSuggestionOpen, setGlobalSearchSuggestionOpen] = useState(false);
  const [globalSearchSuggestionIndex, setGlobalSearchSuggestionIndex] = useState(0);
  const [globalSearchFocusValue, setGlobalSearchFocusValue] = useState('');
  const [globalSearchFocusNonce, setGlobalSearchFocusNonce] = useState(0);
  const globalSearchBoxRef = useRef<HTMLDivElement | null>(null);
  const suppressGlobalSearchSuggestOpenRef = useRef(false);

  const globalSearchSuggestions = useMemo<GlobalSearchSuggestionEntry[]>(
    () => buildPowerPrompterGlobalSearchSuggestions(cardDocument.cards),
    [cardDocument.cards]
  );

  const filteredGlobalSearchSuggestions = useMemo(
    () => filterPowerPrompterGlobalSearchSuggestions(globalSearchSuggestions, globalSearchQuery),
    [globalSearchQuery, globalSearchSuggestions]
  );

  useEffect(() => {
    const query = String(globalSearchQuery || '').trim();
    if (!query) {
      setGlobalSearchSuggestionOpen(false);
      setGlobalSearchSuggestionIndex(0);
      return;
    }
    if (suppressGlobalSearchSuggestOpenRef.current) {
      suppressGlobalSearchSuggestOpenRef.current = false;
      return;
    }
    setGlobalSearchSuggestionOpen(true);
    setGlobalSearchSuggestionIndex(0);
  }, [globalSearchQuery]);

  useEffect(() => {
    if (filteredGlobalSearchSuggestions.length === 0) {
      if (globalSearchSuggestionIndex !== 0) setGlobalSearchSuggestionIndex(0);
      return;
    }
    if (globalSearchSuggestionIndex >= filteredGlobalSearchSuggestions.length) {
      setGlobalSearchSuggestionIndex(filteredGlobalSearchSuggestions.length - 1);
    }
  }, [filteredGlobalSearchSuggestions, globalSearchSuggestionIndex]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const host = globalSearchBoxRef.current;
      if (!host) return;
      if (!host.contains(event.target as Node)) {
        setGlobalSearchSuggestionOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const applyGlobalSearchSelection = (rawValue: string) => {
    const value = String(rawValue || '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    suppressGlobalSearchSuggestOpenRef.current = true;
    setGlobalSearchQuery(value);
    setGlobalSearchSuggestionOpen(false);
    setGlobalSearchSuggestionIndex(0);
    setGlobalSearchFocusValue(value);
    setGlobalSearchFocusNonce((prev) => prev + 1);
  };

  return {
    globalSearchBoxRef,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchSuggestionOpen,
    setGlobalSearchSuggestionOpen,
    globalSearchSuggestionIndex,
    setGlobalSearchSuggestionIndex,
    globalSearchFocusValue,
    globalSearchFocusNonce,
    filteredGlobalSearchSuggestions,
    applyGlobalSearchSelection,
  };
}
