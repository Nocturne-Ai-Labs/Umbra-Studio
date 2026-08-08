'use client';

import React from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Layers3, Trash2, WandSparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  buildPowerPrompterWildcardValues,
  normalizePowerPrompterWildcardDraftName,
  type PowerPrompterWildcardCardSource,
} from '@/lib/powerPrompterWildcardBuilder';

type PromptWildcard = { name: string; values: string[] };

interface PromptWildcardLibraryProps {
  onInsert: (token: string) => void;
  compact?: boolean;
  cardSources?: PowerPrompterWildcardCardSource[];
}

export function PromptWildcardLibrary({ onInsert, compact = false, cardSources = [] }: PromptWildcardLibraryProps) {
  const showToast = useStore((state) => state.showToast);
  const [open, setOpen] = React.useState(false);
  const [wildcards, setWildcards] = React.useState<PromptWildcard[]>([]);
  const [name, setName] = React.useState('');
  const [values, setValues] = React.useState('');
  const [cardWildcardName, setCardWildcardName] = React.useState('');
  const [selectedVariantIds, setSelectedVariantIds] = React.useState<string[]>([]);
  const [expandedCardIds, setExpandedCardIds] = React.useState<string[]>([]);
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

  const load = React.useCallback(async () => {
    const response = await fetch('/api/powerprompter/wildcards');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || 'Could not load wildcards.'));
    setWildcards(Array.isArray(payload?.wildcards) ? payload.wildcards : []);
  }, []);

  const openLibrary = React.useCallback(() => {
    setOpen(true);
    setCardWildcardName('');
    setSelectedVariantIds([]);
    setExpandedCardIds([]);
    void load().catch((error) => showToast(error instanceof Error ? error.message : 'Could not load wildcards.', 'error'));
  }, [load, showToast]);

  const saveValues = React.useCallback(async (rawName: string, rawValues: string[] | string) => {
    const normalizedName = normalizePowerPrompterWildcardDraftName(rawName);
    if (!normalizedName) throw new Error('Enter a wildcard name.');
    const replacing = wildcards.some((entry) => entry.name === normalizedName);
    if (replacing && !window.confirm(`Replace the existing __${normalizedName}__ wildcard?`)) return null;
    const response = await fetch('/api/powerprompter/wildcards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizedName, values: rawValues }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || 'Could not save wildcard.'));
    const nextWildcards = Array.isArray(payload?.wildcards) ? payload.wildcards : [];
    setWildcards(nextWildcards);
    return normalizedName;
  }, [wildcards]);

  const save = React.useCallback(async () => {
    if (!name.trim() || !values.trim()) {
      showToast('Enter a wildcard name and at least one value.', 'error');
      return;
    }
    setBusy(true);
    try {
      const savedName = await saveValues(name, values);
      if (!savedName) return;
      setName('');
      setValues('');
      showToast(`__${savedName}__ saved.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  }, [name, saveValues, showToast, values]);

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
      const savedName = await saveValues(cardWildcardName, selectedCardValues);
      if (!savedName) return;
      setCardWildcardName('');
      setSelectedVariantIds([]);
      showToast(`__${savedName}__ created from ${selectedCardValues.length} card variant${selectedCardValues.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create a wildcard from cards.', 'error');
    } finally {
      setBusy(false);
    }
  }, [cardWildcardName, saveValues, selectedCardValues, showToast]);

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

  const remove = React.useCallback(async (wildcardName: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/powerprompter/wildcards/${encodeURIComponent(wildcardName)}`, { method: 'DELETE' });
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
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4">
          <section role="dialog" aria-modal="true" aria-label="Prompt wildcards" className="flex max-h-[min(48rem,calc(100dvh-2rem))] w-[min(68rem,100%)] flex-col overflow-hidden rounded-md border border-white/15 bg-[#090b10] shadow-2xl shadow-black/70">
            <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <WandSparkles size={15} className="text-fuchsia-200" />
              <div className="min-w-0">
                <strong className="block text-xs font-black uppercase tracking-[0.12em] text-zinc-100">Prompt Wildcards</strong>
                <span className="block text-[10px] text-zinc-400">Use tokens such as <code className="text-fuchsia-200">__weather__</code>. One line is one possible value.</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-white" title="Close wildcards"><X size={14} /></button>
            </header>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.95fr)] custom-scrollbar">
              <div className="min-h-0 space-y-2">
                {wildcards.length === 0 ? <p className="rounded-sm border border-dashed border-white/10 p-4 text-center text-xs text-zinc-500">No wildcards yet.</p> : null}
                {wildcards.map((wildcard) => {
                  const token = `__${wildcard.name}__`;
                  return <article key={wildcard.name} className="rounded-sm border border-white/10 bg-white/[0.025] p-3">
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs font-bold text-fuchsia-100">{token}</code>
                      <button type="button" onClick={() => { onInsert(token); setOpen(false); showToast(`${token} inserted.`, 'success'); }} className="inline-flex h-7 items-center gap-1 rounded-sm border border-cyan-300/25 px-2 text-[9px] font-black uppercase text-cyan-100 hover:bg-cyan-500/[0.1]" title="Insert wildcard token"><Copy size={11} /> Insert</button>
                      <button type="button" disabled={busy} onClick={() => void remove(wildcard.name)} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-red-300/20 text-red-200/70 hover:text-red-100 disabled:opacity-40" title="Delete wildcard"><Trash2 size={11} /></button>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-zinc-400">{wildcard.values.join(' · ')}</p>
                  </article>;
                })}
              </div>
              <div className="space-y-3">
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
                  <label className="mt-3 block text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100">Values</label>
                  <textarea value={values} onChange={(event) => setValues(event.target.value)} placeholder={'rain\nsunny day\nfog'} rows={7} className="mt-2 w-full resize-y rounded-sm border border-white/12 bg-black/40 px-2 py-2 text-xs leading-5 text-zinc-100 outline-none focus:border-fuchsia-300/45" />
                  <button type="submit" disabled={busy} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-fuchsia-300/35 bg-fuchsia-500/[0.12] text-[10px] font-black uppercase tracking-[0.1em] text-fuchsia-100 hover:bg-fuchsia-500/[0.18] disabled:opacity-50"><Check size={12} /> Save wildcard</button>
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
