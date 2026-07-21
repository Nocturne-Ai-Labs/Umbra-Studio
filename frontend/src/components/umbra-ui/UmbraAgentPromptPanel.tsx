'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Video,
  WandSparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  createUmbraUiAgentInstruction,
  discardUmbraUiAgentDraft,
  formatHermesMcpConfig,
  loadUmbraUiAgentDrafts,
  loadUmbraUiAgentInstructions,
  loadUmbraUiAgentSettings,
  regenerateUmbraUiAgentToken,
  saveUmbraUiAgentInstructions,
  type UmbraUiAgentConnectionSettings,
  type UmbraUiAgentDraft,
  type UmbraUiAgentInstruction,
  type UmbraUiAgentMediaType,
} from '@/lib/umbraUiAgent';
import { createDefaultUmbraUiAgentInstructions } from '../../../../shared/umbra-ui/agentTypes';

type AgentPanelTab = 'drafts' | 'instructions' | 'connect';

interface UmbraAgentPromptPanelProps {
  open: boolean;
  onClose: () => void;
  onApplyDraft: (draft: UmbraUiAgentDraft) => void | Promise<void>;
  onPendingCountChange?: (count: number) => void;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500';

function tabButtonClass(active: boolean): string {
  return cn(
    'inline-flex h-8 items-center justify-center gap-1.5 border-b-2 px-3 text-[9px] font-black uppercase tracking-[0.13em] transition-colors',
    active
      ? 'border-cyan-300 text-cyan-100'
      : 'border-transparent text-zinc-600 hover:text-zinc-300',
  );
}

function mediaIcon(mediaType: UmbraUiAgentMediaType, size = 12) {
  return mediaType === 'video' ? <Video size={size} /> : <WandSparkles size={size} />;
}

function formatDraftAge(createdAt: number): string {
  const elapsed = Math.max(0, Date.now() - createdAt);
  if (elapsed < 60_000) return 'now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  return `${Math.floor(elapsed / 3_600_000)}h`;
}

export function UmbraAgentPromptPanel({
  open,
  onClose,
  onApplyDraft,
  onPendingCountChange,
}: UmbraAgentPromptPanelProps) {
  const showToast = useStore((state) => state.showToast);
  const [tab, setTab] = React.useState<AgentPanelTab>('drafts');
  const [drafts, setDrafts] = React.useState<UmbraUiAgentDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = React.useState('');
  const [instructions, setInstructions] = React.useState<UmbraUiAgentInstruction[]>([]);
  const [selectedInstructionId, setSelectedInstructionId] = React.useState('');
  const [settings, setSettings] = React.useState<UmbraUiAgentConnectionSettings | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showToken, setShowToken] = React.useState(false);
  const knownDraftIdsRef = React.useRef<Set<string> | null>(null);

  const refreshDrafts = React.useCallback(async (announce = false) => {
    const next = await loadUmbraUiAgentDrafts();
    const nextIds = new Set(next.map((draft) => draft.id));
    const previousIds = knownDraftIdsRef.current;
    if (announce && previousIds && next.some((draft) => !previousIds.has(draft.id))) {
      showToast('Hermes staged a new Umbra UI prompt draft.', 'success');
    }
    knownDraftIdsRef.current = nextIds;
    setDrafts(next);
    setSelectedDraftId((current) => current && nextIds.has(current) ? current : next[0]?.id || '');
  }, [showToast]);

  React.useEffect(() => {
    void refreshDrafts(false).catch(() => undefined);
    const timer = window.setInterval(() => {
      void refreshDrafts(true).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refreshDrafts]);

  React.useEffect(() => {
    onPendingCountChange?.(drafts.length);
  }, [drafts.length, onPendingCountChange]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open) return;
    let canceled = false;
    setLoading(true);
    void Promise.all([
      loadUmbraUiAgentInstructions(),
      loadUmbraUiAgentSettings(),
      refreshDrafts(false),
    ]).then(([nextInstructions, nextSettings]) => {
      if (canceled) return;
      setInstructions(nextInstructions);
      setSelectedInstructionId((current) => (
        current && nextInstructions.some((entry) => entry.id === current)
          ? current
          : nextInstructions[0]?.id || ''
      ));
      setSettings(nextSettings);
    }).catch((error) => {
      if (!canceled) showToast(error instanceof Error ? error.message : 'Failed to open the agent prompt panel.', 'error');
    }).finally(() => {
      if (!canceled) setLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [open, refreshDrafts, showToast]);

  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) || null;
  const selectedInstruction = instructions.find((entry) => entry.id === selectedInstructionId) || null;
  const displayedHermesConfig = settings
    ? formatHermesMcpConfig(showToken ? settings : { ...settings, token: '<hidden>' })
    : '';

  const updateSelectedInstruction = (patch: Partial<UmbraUiAgentInstruction>) => {
    setInstructions((current) => current.map((entry) => entry.id === selectedInstructionId
      ? { ...entry, ...patch, updatedAt: Date.now() }
      : entry));
  };

  const handleSaveInstructions = async () => {
    if (instructions.some((entry) => !entry.name.trim() || !entry.instruction.trim())) {
      showToast('Finish or remove empty instruction entries before saving.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveUmbraUiAgentInstructions(instructions);
      setInstructions(saved);
      setSelectedInstructionId((current) => saved.some((entry) => entry.id === current) ? current : saved[0]?.id || '');
      showToast('Umbra UI agent instructions saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save agent instructions.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddInstruction = () => {
    const mediaType: UmbraUiAgentMediaType = selectedInstruction?.mediaType || 'image';
    const entry = createUmbraUiAgentInstruction(mediaType, instructions.length);
    setInstructions((current) => [...current, entry]);
    setSelectedInstructionId(entry.id);
  };

  const handleDuplicateInstruction = () => {
    if (!selectedInstruction) return;
    const entry = {
      ...createUmbraUiAgentInstruction(selectedInstruction.mediaType, instructions.length),
      name: `${selectedInstruction.name} Copy`,
      instruction: selectedInstruction.instruction,
    };
    setInstructions((current) => [...current, entry]);
    setSelectedInstructionId(entry.id);
  };

  const handleDeleteInstruction = () => {
    if (!selectedInstruction || instructions.length <= 1) return;
    if (!window.confirm(`Delete "${selectedInstruction.name}"?`)) return;
    setInstructions((current) => {
      const next = current.filter((entry) => entry.id !== selectedInstruction.id).map((entry, order) => ({ ...entry, order }));
      setSelectedInstructionId(next[0]?.id || '');
      return next;
    });
  };

  const moveInstruction = (direction: -1 | 1) => {
    const index = instructions.findIndex((entry) => entry.id === selectedInstructionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= instructions.length) return;
    setInstructions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((entry, order) => ({ ...entry, order }));
    });
  };

  const handleApplyDraft = async () => {
    if (!selectedDraft) return;
    try {
      await onApplyDraft(selectedDraft);
      await discardUmbraUiAgentDraft(selectedDraft.id);
      await refreshDrafts(false);
      showToast(`${selectedDraft.mediaType === 'video' ? 'Video' : 'Image'} prompt draft applied.`, 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to apply the agent draft.', 'error');
    }
  };

  const handleDiscardDraft = async () => {
    if (!selectedDraft) return;
    try {
      await discardUmbraUiAgentDraft(selectedDraft.id);
      await refreshDrafts(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to discard the agent draft.', 'error');
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied.`, 'success');
    } catch {
      showToast(`Failed to copy ${label.toLowerCase()}.`, 'error');
    }
  };

  const regenerateToken = async () => {
    if (!settings || !window.confirm('Regenerate the MCP token? Hermes will need the updated configuration.')) return;
    try {
      const next = await regenerateUmbraUiAgentToken();
      setSettings({
        ...settings,
        token: next.token,
        updatedAt: next.updatedAt,
        hermesConfig: {
          mcp_servers: {
            umbra_ui: {
              url: settings.endpoint,
              headers: { Authorization: `Bearer ${next.token}` },
            },
          },
        },
      });
      showToast('Umbra UI MCP token regenerated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to regenerate the MCP token.', 'error');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[12300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Umbra UI Agent Prompts"
        className="flex h-[82vh] min-h-[580px] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-cyan-300/25 bg-[#05070a] shadow-2xl shadow-black/80"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4">
          <Bot size={16} className="text-cyan-300" />
          <div className="min-w-0">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-100">Agent Prompts</h2>
            <div className="font-mono text-[9px] text-zinc-600">Hermes MCP prompt authoring</div>
          </div>
          <div className="ml-4 flex h-full items-end">
            <button type="button" onClick={() => setTab('drafts')} className={tabButtonClass(tab === 'drafts')}>
              <Clipboard size={11} /> Drafts {drafts.length > 0 ? <span className="text-cyan-300">{drafts.length}</span> : null}
            </button>
            <button type="button" onClick={() => setTab('instructions')} className={tabButtonClass(tab === 'instructions')}>
              <FileText size={11} /> Instructions
            </button>
            <button type="button" onClick={() => setTab('connect')} className={tabButtonClass(tab === 'connect')}>
              <Settings2 size={11} /> Connect
            </button>
          </div>
          <button type="button" onClick={onClose} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100" title="Close">
            <X size={13} />
          </button>
        </header>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-zinc-600"><Loader2 size={20} className="animate-spin" /></div>
        ) : tab === 'drafts' ? (
          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-r border-white/10 p-2 custom-scrollbar">
              <div className="mb-1 flex items-center px-2 py-1">
                <span className={labelClass}>Review Inbox</span>
                <button type="button" onClick={() => void refreshDrafts(false)} className="ml-auto inline-flex h-6 w-6 items-center justify-center text-zinc-600 hover:text-cyan-200" title="Refresh drafts">
                  <RefreshCw size={11} />
                </button>
              </div>
              {drafts.length <= 0 ? (
                <div className="px-2 py-10 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">No staged drafts</div>
              ) : (
                <div className="space-y-1">
                  {drafts.map((draft) => (
                    <button
                      type="button"
                      key={draft.id}
                      onClick={() => setSelectedDraftId(draft.id)}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-2 rounded-md border p-2.5 text-left transition-colors',
                        selectedDraftId === draft.id
                          ? 'border-cyan-300/35 bg-cyan-500/[0.09]'
                          : 'border-transparent bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
                      )}
                    >
                      <span className={draft.mediaType === 'video' ? 'mt-0.5 text-fuchsia-300' : 'mt-0.5 text-cyan-300'}>{mediaIcon(draft.mediaType)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-bold text-zinc-200">{draft.title}</span>
                        <span className="mt-1 block truncate font-mono text-[8px] text-zinc-600">{draft.instructionName || 'Direct draft'}</span>
                      </span>
                      <span className="font-mono text-[8px] text-zinc-700">{formatDraftAge(draft.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <main className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
              {!selectedDraft ? (
                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">Select a staged prompt</div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="flex items-start gap-3 border-b border-white/10 pb-3">
                    <span className={selectedDraft.mediaType === 'video' ? 'text-fuchsia-300' : 'text-cyan-300'}>{mediaIcon(selectedDraft.mediaType, 16)}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-zinc-100">{selectedDraft.title}</h3>
                      <div className="mt-1 font-mono text-[9px] text-zinc-600">
                        {selectedDraft.mediaType.toUpperCase()} {selectedDraft.instructionName ? ` / ${selectedDraft.instructionName}` : ''}
                      </div>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <button type="button" onClick={() => void handleDiscardDraft()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-300/20 px-3 text-[9px] font-black uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/[0.08]">
                        <Trash2 size={11} /> Discard
                      </button>
                      <button type="button" onClick={() => void handleApplyDraft()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-500/[0.1] px-3 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/[0.16]">
                        <Check size={11} /> Apply Prompt
                      </button>
                    </div>
                  </div>

                  {selectedDraft.warnings.length > 0 ? (
                    <div className="border-l-2 border-amber-300/50 bg-amber-500/[0.05] px-3 py-2 text-[10px] text-amber-100/80">
                      {selectedDraft.warnings.join(' ')}
                    </div>
                  ) : null}

                  {selectedDraft.mediaType === 'image' && selectedDraft.segments.length > 0 ? (
                    <div className="space-y-2">
                      <div className={labelClass}>Positive Prompt Segments</div>
                      {selectedDraft.segments.map((segment, index) => (
                        <div key={`${selectedDraft.id}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] border border-white/10 bg-black/30">
                          <div className="flex items-center justify-center border-r border-white/10 font-mono text-[9px] text-cyan-300/70">{index + 1}</div>
                          <div className="whitespace-pre-wrap p-2.5 text-xs leading-relaxed text-zinc-200">{segment}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className={labelClass}>Prompt</div>
                      <div className="whitespace-pre-wrap border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-zinc-200">{selectedDraft.prompt}</div>
                    </div>
                  )}

                  {selectedDraft.negativePrompt ? (
                    <div className="space-y-2">
                      <div className={labelClass}>Negative Prompt</div>
                      <div className="whitespace-pre-wrap border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-zinc-300">{selectedDraft.negativePrompt}</div>
                    </div>
                  ) : null}
                  {selectedDraft.notes ? (
                    <div className="space-y-2">
                      <div className={labelClass}>Agent Notes</div>
                      <div className="whitespace-pre-wrap border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-500">{selectedDraft.notes}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </main>
          </div>
        ) : tab === 'instructions' ? (
          <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r border-white/10">
              <div className="flex min-h-11 items-center gap-1 border-b border-white/10 px-2">
                <button type="button" onClick={handleAddInstruction} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-cyan-300/20 px-2 text-[9px] font-black uppercase tracking-[0.11em] text-cyan-100 hover:bg-cyan-500/[0.08]">
                  <Plus size={11} /> Add
                </button>
                <button type="button" onClick={handleDuplicateInstruction} disabled={!selectedInstruction} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800" title="Duplicate instruction">
                  <Copy size={11} />
                </button>
                <button type="button" onClick={() => moveInstruction(-1)} disabled={!selectedInstruction || instructions[0]?.id === selectedInstructionId} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800" title="Move up">
                  <ArrowUp size={11} />
                </button>
                <button type="button" onClick={() => moveInstruction(1)} disabled={!selectedInstruction || instructions[instructions.length - 1]?.id === selectedInstructionId} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:text-zinc-800" title="Move down">
                  <ArrowDown size={11} />
                </button>
                <button type="button" onClick={handleDeleteInstruction} disabled={!selectedInstruction || instructions.length <= 1} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-300/15 text-zinc-600 hover:text-red-200 disabled:text-zinc-800" title="Delete instruction">
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
                <div className="space-y-1">
                  {instructions.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => setSelectedInstructionId(entry.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left',
                        selectedInstructionId === entry.id
                          ? 'border-cyan-300/30 bg-cyan-500/[0.09] text-cyan-50'
                          : 'border-transparent text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200',
                      )}
                    >
                      <span className={entry.mediaType === 'video' ? 'text-fuchsia-300' : 'text-cyan-300'}>{mediaIcon(entry.mediaType)}</span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold">{entry.name || 'Untitled instruction'}</span>
                      <span className="font-mono text-[8px] uppercase text-zinc-700">{entry.mediaType}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto p-4 custom-scrollbar">
              {selectedInstruction ? (
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <FileText size={14} className="text-cyan-300" />
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">Prompting Instruction</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm('Restore all built-in image and video instruction templates?')) return;
                        const defaults = createDefaultUmbraUiAgentInstructions();
                        setInstructions(defaults);
                        setSelectedInstructionId(defaults[0]?.id || '');
                      }}
                      className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[9px] font-black uppercase tracking-[0.11em] text-zinc-500 hover:text-zinc-200"
                    >
                      <RefreshCw size={10} /> Restore Templates
                    </button>
                    <button type="button" onClick={() => void handleSaveInstructions()} disabled={saving} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-500/[0.08] px-2.5 text-[9px] font-black uppercase tracking-[0.11em] text-emerald-100 hover:bg-emerald-500/[0.13] disabled:text-zinc-600">
                      {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save All
                    </button>
                  </div>

                  <label className="block space-y-1.5">
                    <span className={labelClass}>Name</span>
                    <input value={selectedInstruction.name} onChange={(event) => updateSelectedInstruction({ name: event.target.value })} maxLength={120} className={inputClass} />
                  </label>

                  <div className="space-y-1.5">
                    <span className={labelClass}>Media</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['image', 'video', 'both'] as UmbraUiAgentMediaType[]).map((mediaType) => (
                        <button
                          type="button"
                          key={mediaType}
                          onClick={() => updateSelectedInstruction({ mediaType })}
                          className={cn(
                            'h-8 border text-[9px] font-black uppercase tracking-[0.12em]',
                            selectedInstruction.mediaType === mediaType
                              ? 'border-cyan-300/35 bg-cyan-500/[0.1] text-cyan-100'
                              : 'border-white/10 text-zinc-600 hover:text-zinc-300',
                          )}
                        >
                          {mediaType}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1.5">
                    <span className={labelClass}>Instruction</span>
                    <textarea
                      value={selectedInstruction.instruction}
                      onChange={(event) => updateSelectedInstruction({ instruction: event.target.value })}
                      maxLength={24_000}
                      className={`${inputClass} min-h-[330px] resize-y font-mono leading-relaxed`}
                    />
                    <span className="block text-right font-mono text-[8px] text-zinc-700">{selectedInstruction.instruction.length.toLocaleString()} / 24,000</span>
                  </label>
                </div>
              ) : null}
            </main>
          </div>
        ) : (
          <main className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <KeyRound size={15} className="text-emerald-300" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.14em] text-zinc-200">Hermes MCP Connection</h3>
                  <div className="mt-1 font-mono text-[9px] text-zinc-600">Host-only Streamable HTTP / prompt staging only</div>
                </div>
              </div>

              {settings ? (
                <>
                  <div className="space-y-1.5">
                    <span className={labelClass}>Endpoint</span>
                    <div className="flex gap-2">
                      <input readOnly value={settings.endpoint} className={`${inputClass} font-mono`} />
                      <button type="button" onClick={() => void copyText(settings.endpoint, 'Endpoint')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100" title="Copy endpoint"><Copy size={12} /></button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className={labelClass}>Bearer Token</span>
                    <div className="flex gap-2">
                      <input readOnly type={showToken ? 'text' : 'password'} value={settings.token} className={`${inputClass} font-mono`} />
                      <button type="button" onClick={() => setShowToken((current) => !current)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100" title={showToken ? 'Hide token' : 'Show token'}>
                        {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button type="button" onClick={() => void copyText(settings.token, 'Token')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100" title="Copy token"><Copy size={12} /></button>
                      <button type="button" onClick={() => void regenerateToken()} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-300/20 text-zinc-500 hover:text-amber-100" title="Regenerate token"><RefreshCw size={12} /></button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center">
                      <span className={labelClass}>Hermes MCP Config</span>
                      <button type="button" onClick={() => void copyText(formatHermesMcpConfig(settings), 'Hermes MCP config')} className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-cyan-300/20 px-2 text-[9px] font-black uppercase tracking-[0.11em] text-cyan-100 hover:bg-cyan-500/[0.08]">
                        <Copy size={10} /> Copy Config
                      </button>
                    </div>
                    <pre className="overflow-x-auto border border-white/10 bg-black/45 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 custom-scrollbar">{displayedHermesConfig}</pre>
                  </div>

                  <div className="grid grid-cols-3 border border-white/10 bg-white/[0.02]">
                    {['Read prompt context', 'Read saved instructions', 'Stage reviewed drafts'].map((label) => (
                      <div key={label} className="flex min-h-12 items-center justify-center gap-2 border-r border-white/10 px-3 text-center text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500 last:border-r-0">
                        <Check size={10} className="text-emerald-300" /> {label}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">Connection settings unavailable</div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
