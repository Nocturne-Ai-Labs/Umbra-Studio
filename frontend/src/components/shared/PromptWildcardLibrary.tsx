'use client';

import React from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Folder, FolderOpen, Layers3, Pencil, Search, Trash2, WandSparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  buildPowerPrompterWildcardValues,
  normalizePowerPrompterWildcardDraftName,
  type PowerPrompterWildcardCardSource,
} from '@/lib/powerPrompterWildcardBuilder';

type PromptWildcard = { name: string; folder: string; path: string; values: string[] };
type PromptWildcardEditorState = { name: string; folder: string; path: string; values: string };

interface PromptWildcardLibraryProps {
  onInsert: (token: string) => void;
  compact?: boolean;
  cardSources?: PowerPrompterWildcardCardSource[];
}

export function PromptWildcardLibrary({ onInsert, compact = false, cardSources = [] }: PromptWildcardLibraryProps) {
  const showToast = useStore((state) => state.showToast);
  const [open, setOpen] = React.useState(false);
  const [wildcards, setWildcards] = React.useState<PromptWildcard[]>([]);
  const [selectedFolder, setSelectedFolder] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [mobileView, setMobileView] = React.useState<'browse' | 'create'>('browse');
  const [visibleLimit, setVisibleLimit] = React.useState(24);
  const [name, setName] = React.useState('');
  const [folder, setFolder] = React.useState('');
  const [values, setValues] = React.useState('');
  const [cardWildcardName, setCardWildcardName] = React.useState('');
  const [cardWildcardFolder, setCardWildcardFolder] = React.useState('');
  const [selectedVariantIds, setSelectedVariantIds] = React.useState<string[]>([]);
  const [expandedCardIds, setExpandedCardIds] = React.useState<string[]>([]);
  const [editingWildcard, setEditingWildcard] = React.useState<PromptWildcardEditorState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const allVariantIds = React.useMemo(
    () => cardSources.flatMap((card) => card.variants.map((variant) => variant.id)),
    [cardSources],
  );
  const selectedCardIds = React.useMemo(
    () => cardSources
      .filter((card) => card.variants.some((variant) => selectedVariantIds.includes(variant.id)))
      .map((card) => card.id),
    [cardSources, selectedVariantIds],
  );
  const selectedCardValues = React.useMemo(
    () => buildPowerPrompterWildcardValues(cardSources, selectedCardIds, selectedVariantIds),
    [cardSources, selectedCardIds, selectedVariantIds],
  );
  const folders = React.useMemo(
    () => Array.from(new Set(wildcards.map((entry) => entry.folder).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [wildcards],
  );
  const visibleWildcards = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return wildcards.filter((entry) => {
      if (selectedFolder !== 'all' && entry.folder !== selectedFolder) return false;
      if (!query) return true;
      return entry.name.toLowerCase().includes(query) || entry.folder.toLowerCase().includes(query);
    });
  }, [searchQuery, selectedFolder, wildcards]);
  const displayedWildcards = React.useMemo(
    () => visibleWildcards.slice(0, visibleLimit),
    [visibleLimit, visibleWildcards],
  );

  React.useEffect(() => setVisibleLimit(24), [searchQuery, selectedFolder]);

  const load = React.useCallback(async () => {
    const response = await fetch('/api/powerprompter/wildcards');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || 'Could not load wildcards.'));
    setWildcards(Array.isArray(payload?.wildcards) ? payload.wildcards.map((entry: any) => ({
      name: String(entry?.name || ''),
      folder: String(entry?.folder || ''),
      path: String(entry?.path || entry?.name || ''),
      values: Array.isArray(entry?.values) ? entry.values : [],
    })) : []);
  }, []);

  const openLibrary = React.useCallback(() => {
    setOpen(true);
    setSelectedFolder('all');
    setSearchQuery('');
    setMobileView('browse');
    setVisibleLimit(24);
    setCardWildcardName('');
    setCardWildcardFolder('');
    setSelectedVariantIds([]);
    setExpandedCardIds([]);
    void load().catch((error) => showToast(error instanceof Error ? error.message : 'Could not load wildcards.', 'error'));
  }, [load, showToast]);

  const saveValues = React.useCallback(async (
    rawName: string,
    rawValues: string[] | string,
    options: { confirmReplace?: boolean; folder?: string; path?: string } = {},
  ) => {
    const normalizedName = normalizePowerPrompterWildcardDraftName(rawName);
    if (!normalizedName) throw new Error('Enter a wildcard name.');
    const replacing = wildcards.some((entry) => entry.name === normalizedName);
    if (replacing && options.confirmReplace !== false && !window.confirm(`Replace the existing __${normalizedName}__ wildcard?`)) return null;
    const response = await fetch('/api/powerprompter/wildcards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: normalizedName,
        folder: options.folder ?? '',
        path: options.path ?? '',
        values: rawValues,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || 'Could not save wildcard.'));
    const nextWildcards = Array.isArray(payload?.wildcards) ? payload.wildcards : [];
    setWildcards(nextWildcards);
    return normalizedName;
  }, [wildcards]);

  const saveEditedWildcard = React.useCallback(async () => {
    if (!editingWildcard) return;
    if (!editingWildcard.values.trim()) {
      showToast('Add at least one wildcard value.', 'error');
      return;
    }
    setBusy(true);
    try {
      const savedName = await saveValues(editingWildcard.name, editingWildcard.values, {
        confirmReplace: false,
        folder: editingWildcard.folder,
        path: editingWildcard.path,
      });
      if (!savedName) return;
      setEditingWildcard(null);
      showToast(`__${savedName}__ updated.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  }, [editingWildcard, saveValues, showToast]);

  const save = React.useCallback(async () => {
    if (!name.trim() || !values.trim()) {
      showToast('Enter a wildcard name and at least one value.', 'error');
      return;
    }
    setBusy(true);
    try {
      const savedName = await saveValues(name, values, { folder });
      if (!savedName) return;
      setName('');
      setFolder('');
      setValues('');
      showToast(`__${savedName}__ saved.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  }, [folder, name, saveValues, showToast, values]);

  const saveFromCards = React.useCallback(async () => {
    if (!cardWildcardName.trim()) {
      showToast('Name the card wildcard before saving it.', 'error');
      return;
    }
    if (selectedCardValues.length <= 0) {
      showToast('Select at least one non-empty card variant.', 'error');
      return;
    }
    setBusy(true);
    try {
      const savedName = await saveValues(cardWildcardName, selectedCardValues, { folder: cardWildcardFolder });
      if (!savedName) return;
      setCardWildcardName('');
      setCardWildcardFolder('');
      setSelectedVariantIds([]);
      showToast(`__${savedName}__ created from ${selectedCardValues.length} card variant${selectedCardValues.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create a wildcard from cards.', 'error');
    } finally {
      setBusy(false);
    }
  }, [cardWildcardFolder, cardWildcardName, saveValues, selectedCardValues, showToast]);

  const toggleCard = React.useCallback((card: PowerPrompterWildcardCardSource) => {
    const cardVariantIds = card.variants.map((variant) => variant.id);
    setSelectedVariantIds((current) => {
      const selected = new Set(current);
      const allSelected = cardVariantIds.every((id) => selected.has(id));
      cardVariantIds.forEach((id) => allSelected ? selected.delete(id) : selected.add(id));
      return Array.from(selected);
    });
  }, []);

  const toggleVariant = React.useCallback((variantId: string) => {
    setSelectedVariantIds((current) => current.includes(variantId)
      ? current.filter((id) => id !== variantId)
      : [...current, variantId]);
  }, []);

  const toggleExpandedCard = React.useCallback((cardId: string) => {
    setExpandedCardIds((current) => current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId]);
  }, []);

  const remove = React.useCallback(async (wildcard: PromptWildcard) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/powerprompter/wildcards?path=${encodeURIComponent(wildcard.path || wildcard.name)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not remove wildcard.'));
      setWildcards(Array.isArray(payload?.wildcards) ? payload.wildcards : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not remove wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  return (
    <>
      <button
        type="button"
        onClick={openLibrary}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm border border-fuchsia-300/30 bg-fuchsia-500/[0.08] font-mono text-[9px] font-black uppercase text-fuchsia-100 hover:border-fuchsia-200/65 hover:bg-fuchsia-500/[0.14]',
          compact ? 'h-7 w-7 justify-center' : 'h-7 px-2',
        )}
        title="Manage prompt wildcards"
      >
        <WandSparkles size={11} />
        {!compact ? 'Wildcards' : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/75 p-0 md:items-center md:p-4">
          <section role="dialog" aria-modal="true" aria-label="Prompt wildcards" className="flex h-full w-full flex-col overflow-hidden border border-white/15 bg-[#090b10] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/70 md:h-auto md:max-h-[min(48rem,calc(100dvh-2rem))] md:w-[min(68rem,100%)] md:rounded-md">
            <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5 md:px-4 md:py-3">
              <WandSparkles size={15} className="text-fuchsia-200" />
              <div className="min-w-0">
                <strong className="block text-xs font-black uppercase tracking-[0.12em] text-zinc-100">Prompt Wildcards</strong>
                <span className="hidden text-[10px] text-zinc-400 sm:block">Use tokens such as <code className="text-fuchsia-200">__weather__</code>. One line is one possible value.</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-white" title="Close wildcards"><X size={14} /></button>
            </header>
            <div className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-white/10 bg-black/25 p-2 md:hidden">
              <button type="button" onClick={() => setMobileView('browse')} className={cn('h-9 rounded-sm border text-[9px] font-black uppercase tracking-[0.12em]', mobileView === 'browse' ? 'border-fuchsia-300/40 bg-fuchsia-500/[0.12] text-fuchsia-100' : 'border-white/10 text-zinc-500')}>Browse {wildcards.length}</button>
              <button type="button" onClick={() => setMobileView('create')} className={cn('h-9 rounded-sm border text-[9px] font-black uppercase tracking-[0.12em]', mobileView === 'create' ? 'border-cyan-300/40 bg-cyan-500/[0.12] text-cyan-100' : 'border-white/10 text-zinc-500')}>Create</button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:grid-cols-[minmax(0,1fr)_minmax(300px,0.95fr)] md:p-4 custom-scrollbar">
              <div className={cn('min-h-0 space-y-2', mobileView === 'browse' ? 'block' : 'hidden', 'md:block')}>
                <label className="relative block">
                  <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search wildcard names or folders" className="h-10 w-full rounded-sm border border-white/12 bg-black/40 pl-9 pr-9 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/45" />
                  {searchQuery ? <button type="button" onClick={() => setSearchQuery('')} title="Clear wildcard search" className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-zinc-500 hover:bg-white/[0.06] hover:text-white"><X size={12} /></button> : null}
                </label>
                <nav className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-sm border border-white/10 bg-black/25 p-2 md:flex-wrap md:overflow-visible custom-scrollbar" aria-label="Wildcard folders">
                  <button type="button" onClick={() => setSelectedFolder('all')} className={cn('inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[9px] font-black uppercase tracking-[0.08em]', selectedFolder === 'all' ? 'border-fuchsia-300/45 bg-fuchsia-500/12 text-fuchsia-100' : 'border-white/10 text-zinc-400 hover:text-zinc-100')}>
                    <FolderOpen size={11} /> All <span className="font-mono text-[8px] opacity-70">{wildcards.length}</span>
                  </button>
                  <button type="button" onClick={() => setSelectedFolder('')} className={cn('inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[9px] font-black uppercase tracking-[0.08em]', selectedFolder === '' ? 'border-fuchsia-300/45 bg-fuchsia-500/12 text-fuchsia-100' : 'border-white/10 text-zinc-400 hover:text-zinc-100')}>
                    <Folder size={11} /> Root <span className="font-mono text-[8px] opacity-70">{wildcards.filter((entry) => !entry.folder).length}</span>
                  </button>
                  {folders.map((folderName) => (
                    <button key={`wildcard-folder-${folderName}`} type="button" onClick={() => setSelectedFolder(folderName)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[9px] font-black uppercase tracking-[0.08em]', selectedFolder === folderName ? 'border-fuchsia-300/45 bg-fuchsia-500/12 text-fuchsia-100' : 'border-white/10 text-zinc-400 hover:text-zinc-100')}>
                      <Folder size={11} /> {folderName} <span className="font-mono text-[8px] opacity-70">{wildcards.filter((entry) => entry.folder === folderName).length}</span>
                    </button>
                  ))}
                </nav>
                {wildcards.length === 0 ? <p className="rounded-sm border border-dashed border-white/10 p-4 text-center text-xs text-zinc-500">No wildcards yet.</p> : null}
                {wildcards.length > 0 && visibleWildcards.length === 0 ? <p className="rounded-sm border border-dashed border-white/10 p-4 text-center text-xs text-zinc-500">No wildcards match this folder and search.</p> : null}
                {displayedWildcards.map((wildcard) => {
                  const token = `__${wildcard.name}__`;
                  return <article key={wildcard.path} className="rounded-sm border border-white/10 bg-white/[0.025] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 basis-full truncate text-xs font-bold text-fuchsia-100 sm:basis-auto sm:flex-1">{token}</code>
                      <span className="hidden max-w-40 items-center gap-1 truncate rounded-sm border border-white/10 bg-black/25 px-1.5 py-1 text-[8px] font-bold uppercase text-zinc-500 sm:inline-flex" title={wildcard.folder || 'Root'}><Folder size={9} /> {wildcard.folder || 'Root'}</span>
                      <button type="button" onClick={() => { onInsert(token); setOpen(false); showToast(`${token} inserted.`, 'success'); }} className="inline-flex h-7 items-center gap-1 rounded-sm border border-cyan-300/25 px-2 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-500/[0.1]" title="Insert wildcard token"><Copy size={11} /> Insert</button>
                      <button type="button" disabled={busy} onClick={() => setEditingWildcard({ name: wildcard.name, folder: wildcard.folder, path: wildcard.path, values: wildcard.values.join('\n') })} className="inline-flex h-7 items-center gap-1 rounded-sm border border-fuchsia-300/25 px-2 text-[9px] font-black uppercase text-fuchsia-100 hover:bg-fuchsia-500/[0.1] disabled:opacity-40" title="Edit wildcard values or folder"><Pencil size={11} /> Edit</button>
                      <button type="button" disabled={busy} onClick={() => void remove(wildcard)} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-300/20 text-red-200/70 hover:text-red-100 disabled:opacity-40" title="Delete wildcard"><Trash2 size={11} /></button>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-zinc-400">{wildcard.values.slice(0, 3).join(' · ')}</p>
                    <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-600">{wildcard.values.length} possible value{wildcard.values.length === 1 ? '' : 's'}</div>
                  </article>;
                })}
                {displayedWildcards.length < visibleWildcards.length ? <button type="button" onClick={() => setVisibleLimit((current) => current + 24)} className="inline-flex h-10 w-full items-center justify-center rounded-sm border border-fuchsia-300/25 bg-fuchsia-500/[0.06] text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/[0.12]">Load More ({visibleWildcards.length - displayedWildcards.length} remaining)</button> : null}
              </div>
              <div className={cn('space-y-3', mobileView === 'create' ? 'block' : 'hidden', 'md:block')}>
                {cardSources.length > 0 ? (
                  <section className="rounded-sm border border-cyan-300/20 bg-cyan-500/[0.035] p-3">
                    <div className="flex items-start gap-2">
                      <Layers3 size={14} className="mt-0.5 text-cyan-200" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100">Create From Cards</div>
                        <p className="mt-1 text-[10px] leading-4 text-zinc-500">Select a whole card, or expand it to choose individual variants. Each chosen variant becomes one possible wildcard value.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedVariantIds(selectedVariantIds.length === allVariantIds.length ? [] : allVariantIds)}
                        className="shrink-0 text-[8px] font-black uppercase tracking-wider text-cyan-300 hover:text-cyan-100"
                      >
                        {selectedVariantIds.length === allVariantIds.length ? 'Clear' : 'All'}
                      </button>
                    </div>
                    <label className="mt-3 block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Wildcard Name</label>
                    <input value={cardWildcardName} onChange={(event) => setCardWildcardName(event.target.value)} placeholder="favorite-poses" className="mt-1.5 h-9 w-full rounded-sm border border-white/12 bg-black/40 px-2 text-xs text-zinc-100 outline-none focus:border-cyan-300/45" />
                    <label className="mt-3 block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Folder</label>
                    <input value={cardWildcardFolder} onChange={(event) => setCardWildcardFolder(event.target.value)} placeholder="Poses/Custom" className="mt-1.5 h-9 w-full rounded-sm border border-white/12 bg-black/40 px-2 text-xs text-zinc-100 outline-none focus:border-cyan-300/45" />
                    <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                      {cardSources.map((card) => {
                        const cardVariantIds = card.variants.map((variant) => variant.id);
                        const selectedCount = cardVariantIds.filter((id) => selectedVariantIds.includes(id)).length;
                        const checked = cardVariantIds.length > 0 && selectedCount === cardVariantIds.length;
                        const partial = selectedCount > 0 && !checked;
                        const expanded = expandedCardIds.includes(card.id);
                        return (
                          <div key={card.id} className={cn('overflow-hidden rounded-sm border', selectedCount > 0 ? 'border-cyan-300/30 bg-cyan-500/[0.06]' : 'border-white/8 bg-black/20')}>
                            <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
                              <input
                                type="checkbox"
                                ref={(node) => { if (node) node.indeterminate = partial; }}
                                checked={checked}
                                onChange={() => toggleCard(card)}
                                aria-label={`Select all ${card.label} variants`}
                                className="h-4 w-4 shrink-0 accent-cyan-400"
                              />
                              <button
                                type="button"
                                onClick={() => toggleExpandedCard(card.id)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                aria-expanded={expanded}
                                title={`${expanded ? 'Hide' : 'Choose'} ${card.label} variants`}
                              >
                                {expanded ? <ChevronDown size={12} className="shrink-0 text-cyan-300" /> : <ChevronRight size={12} className="shrink-0 text-zinc-600" />}
                                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-200">{card.label}</span>
                                <span className={cn('font-mono text-[8px]', selectedCount > 0 ? 'text-cyan-200' : 'text-zinc-600')}>{selectedCount}/{card.variants.length}</span>
                                <span className={cn(
                                  'inline-flex h-6 shrink-0 items-center rounded-sm border px-2 text-[8px] font-black uppercase tracking-[0.08em]',
                                  expanded
                                    ? 'border-cyan-300/35 bg-cyan-500/[0.12] text-cyan-100'
                                    : 'border-white/12 bg-white/[0.035] text-zinc-400',
                                )}>
                                  {expanded ? 'Collapse' : 'Expand'}
                                </span>
                              </button>
                            </div>
                            {expanded ? (
                              <div className="space-y-1 border-t border-white/8 bg-black/20 p-1.5">
                                {card.variants.map((variant) => {
                                  const variantChecked = selectedVariantIds.includes(variant.id);
                                  return (
                                    <label key={variant.id} className={cn('flex min-h-10 cursor-pointer items-start gap-2 rounded-sm border px-2 py-1.5', variantChecked ? 'border-fuchsia-300/25 bg-fuchsia-500/[0.07]' : 'border-white/6 hover:border-white/12')}>
                                      <input
                                        type="checkbox"
                                        checked={variantChecked}
                                        onChange={() => toggleVariant(variant.id)}
                                        aria-label={`${card.label}: ${variant.label}`}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-fuchsia-400"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <strong className="block truncate text-[9px] text-zinc-200">{variant.label}</strong>
                                        <span className="mt-0.5 block truncate font-mono text-[8px] text-zinc-600">{variant.value}</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-zinc-500">
                      <span>{selectedCardIds.length} card{selectedCardIds.length === 1 ? '' : 's'} selected</span>
                      <span>{selectedVariantIds.length} variant{selectedVariantIds.length === 1 ? '' : 's'} / {selectedCardValues.length} unique</span>
                    </div>
                    <button type="button" disabled={busy || selectedCardValues.length <= 0} onClick={() => void saveFromCards()} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-cyan-300/35 bg-cyan-500/[0.12] text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-500/[0.18] disabled:opacity-40"><Layers3 size={12} /> Create Card Wildcard</button>
                  </section>
                ) : null}
                <form className="h-fit rounded-sm border border-fuchsia-300/20 bg-fuchsia-500/[0.035] p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                  <label className="block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">New Manual Wildcard</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="weather" className="mt-2 h-9 w-full rounded-sm border border-white/12 bg-black/40 px-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/45" />
                  <label className="mt-3 block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">Folder</label>
                  <input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Locations/Weather" className="mt-2 h-9 w-full rounded-sm border border-white/12 bg-black/40 px-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/45" />
                  <label className="mt-3 block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">Values</label>
                  <textarea value={values} onChange={(event) => setValues(event.target.value)} placeholder={'rain\nsunny day\nfog'} rows={7} className="mt-2 w-full resize-y rounded-sm border border-white/12 bg-black/40 px-2 py-2 text-xs leading-5 text-zinc-100 outline-none focus:border-fuchsia-300/45" />
                  <button type="submit" disabled={busy} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-fuchsia-300/35 bg-fuchsia-500/[0.12] text-[10px] font-black uppercase tracking-[0.1em] text-fuchsia-100 hover:bg-fuchsia-500/[0.18] disabled:opacity-50"><Check size={12} /> Save wildcard</button>
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {editingWildcard ? (
        <div className="fixed inset-0 z-[1010] flex items-stretch justify-center bg-black/80 p-0 md:items-center md:p-4" onMouseDown={() => { if (!busy) setEditingWildcard(null); }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingWildcard.name} wildcard`}
            className="flex h-full w-full flex-col overflow-hidden border border-fuchsia-300/25 bg-[#090b10] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/70 md:h-auto md:max-h-[min(42rem,calc(100dvh-2rem))] md:w-[min(36rem,100%)] md:rounded-md"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Pencil size={14} className="text-fuchsia-200" />
              <div className="min-w-0 flex-1">
                <strong className="block text-xs font-black uppercase tracking-[0.12em] text-zinc-100">Edit Wildcard</strong>
                <code className="mt-0.5 block truncate text-[10px] text-fuchsia-200">__{editingWildcard.name}__</code>
              </div>
              <button type="button" disabled={busy} onClick={() => setEditingWildcard(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-white disabled:opacity-40" title="Close wildcard editor"><X size={14} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
              <label htmlFor="wildcard-editor-folder" className="block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">Folder</label>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">Move this wildcard by changing its category path. Its <code>__{editingWildcard.name}__</code> token stays the same.</p>
              <input
                id="wildcard-editor-folder"
                value={editingWildcard.folder}
                onChange={(event) => setEditingWildcard((current) => current ? { ...current, folder: event.target.value } : current)}
                placeholder="Expressions/Adult"
                className="mt-2 h-9 w-full rounded-sm border border-white/12 bg-black/40 px-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/45"
              />
              <label htmlFor="wildcard-editor-values" className="block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">Values</label>
              <p className="mt-1 text-[10px] leading-4 text-zinc-500">Each non-empty line is one possible value selected by this wildcard.</p>
              <textarea
                id="wildcard-editor-values"
                autoFocus
                value={editingWildcard.values}
                onChange={(event) => setEditingWildcard((current) => current ? { ...current, values: event.target.value } : current)}
                rows={14}
                className="mt-3 min-h-64 w-full resize-y rounded-sm border border-white/12 bg-black/40 px-3 py-2 font-mono text-xs leading-5 text-zinc-100 outline-none focus:border-fuchsia-300/45"
              />
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button type="button" disabled={busy} onClick={() => setEditingWildcard(null)} className="h-9 rounded-sm border border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:text-white disabled:opacity-40">Cancel</button>
              <button type="button" disabled={busy || !editingWildcard.values.trim()} onClick={() => void saveEditedWildcard()} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-fuchsia-300/35 bg-fuchsia-500/[0.12] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-fuchsia-100 hover:bg-fuchsia-500/[0.18] disabled:opacity-40"><Check size={12} /> Save Changes</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
