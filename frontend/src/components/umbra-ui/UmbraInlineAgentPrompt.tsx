'use client';

import React from 'react';
import { Bot, Loader2, WandSparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  generateUmbraUiAgentPrompt,
  loadUmbraUiAgentInstructions,
  type UmbraUiAgentInstruction,
} from '@/lib/umbraUiAgent';

interface UmbraInlineAgentPromptProps {
  mediaType: 'image' | 'video';
  sourcePrompt: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  agentPrompt: string;
  onAgentPromptChange: (prompt: string) => void;
  context?: Record<string, unknown>;
  accent?: 'cyan' | 'fuchsia';
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-300/45';

export function UmbraInlineAgentPrompt({
  mediaType,
  sourcePrompt,
  enabled,
  onEnabledChange,
  agentPrompt,
  onAgentPromptChange,
  context,
  accent = 'cyan',
}: UmbraInlineAgentPromptProps) {
  const showToast = useStore((state) => state.showToast);
  const [instructions, setInstructions] = React.useState<UmbraUiAgentInstruction[]>([]);
  const [selectedInstructionId, setSelectedInstructionId] = React.useState('');
  const [loadingInstructions, setLoadingInstructions] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generatedFrom, setGeneratedFrom] = React.useState('');

  React.useEffect(() => {
    if (!enabled || instructions.length > 0) return;
    let canceled = false;
    setLoadingInstructions(true);
    void loadUmbraUiAgentInstructions()
      .then((entries) => {
        if (canceled) return;
        const compatible = entries.filter((entry) => entry.mediaType === 'both' || entry.mediaType === mediaType);
        setInstructions(compatible);
        setSelectedInstructionId((current) => compatible.some((entry) => entry.id === current) ? current : compatible[0]?.id || '');
      })
      .catch((error) => {
        if (!canceled) showToast(error instanceof Error ? error.message : 'Failed to load agent instructions.', 'error');
      })
      .finally(() => {
        if (!canceled) setLoadingInstructions(false);
      });
    return () => {
      canceled = true;
    };
  }, [enabled, instructions.length, mediaType, showToast]);

  const sourceChanged = Boolean(agentPrompt.trim() && generatedFrom && generatedFrom !== sourcePrompt.trim());
  const handleGenerate = async () => {
    const request = sourcePrompt.trim();
    if (!request) {
      showToast('Enter a prompt request before enabling Hermes composition.', 'error');
      return;
    }
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateUmbraUiAgentPrompt({
        mediaType,
        prompt: request,
        instructionId: selectedInstructionId,
        context,
      });
      onAgentPromptChange(result.prompt);
      setGeneratedFrom(request);
      if (result.instructionId) setSelectedInstructionId(result.instructionId);
      showToast(`Hermes composed the ${mediaType} prompt in ${(result.durationMs / 1000).toFixed(1)}s.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Hermes failed to compose the prompt.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const accentClasses = accent === 'fuchsia'
    ? 'border-fuchsia-300/25 bg-fuchsia-500/[0.045]'
    : 'border-cyan-300/25 bg-cyan-500/[0.045]';
  const activeButtonClasses = accent === 'fuchsia'
    ? 'border-fuchsia-300/35 bg-fuchsia-500/[0.12] text-fuchsia-100'
    : 'border-cyan-300/35 bg-cyan-500/[0.12] text-cyan-100';

  return (
    <div className={cn('rounded-md border px-2.5 py-2', enabled ? accentClasses : 'border-white/10 bg-white/[0.02]')}>
      <div className="flex items-center gap-2">
        <Bot size={13} className={enabled ? (accent === 'fuchsia' ? 'text-fuchsia-300' : 'text-cyan-300') : 'text-zinc-600'} />
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Agent Mode</div>
          <div className="font-mono text-[9px] text-zinc-500">Hermes prompt composition</div>
        </div>
        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          className={cn(
            'ml-auto inline-flex h-8 min-w-20 items-center justify-center rounded-md border px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors',
            enabled ? activeButtonClasses : 'border-white/10 bg-black/25 text-zinc-600 hover:text-zinc-300',
          )}
          aria-pressed={enabled}
          title={enabled ? 'Use the agent prompt for generation' : 'Use Hermes to compose the generation prompt'}
        >
          {enabled ? 'Enabled' : 'Enable'}
        </button>
      </div>

      {enabled ? (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={selectedInstructionId}
              onChange={(event) => setSelectedInstructionId(event.target.value)}
              disabled={loadingInstructions || instructions.length <= 0}
              className={`${inputClass} h-9 py-1.5 text-[11px] disabled:text-zinc-700`}
              title="Hermes prompting instruction"
            >
              {instructions.length <= 0 ? <option value="">Default instruction</option> : null}
              {instructions.map((instruction) => <option key={instruction.id} value={instruction.id}>{instruction.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !sourcePrompt.trim()}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:border-white/10 disabled:text-zinc-700',
                accent === 'fuchsia'
                  ? 'border-fuchsia-300/30 text-fuchsia-100 hover:bg-fuchsia-500/[0.1]'
                  : 'border-cyan-300/30 text-cyan-100 hover:bg-cyan-500/[0.1]',
              )}
              title="Send the request to Hermes"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />}
              {generating ? 'Composing' : agentPrompt.trim() ? 'Regenerate' : 'Compose'}
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="flex items-center text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
              Agent Prompt
              {sourceChanged ? <span className="ml-auto text-amber-300/80">Source changed</span> : <span className="ml-auto text-emerald-300/60">Workflow input</span>}
            </span>
            <textarea
              value={agentPrompt}
              onChange={(event) => onAgentPromptChange(event.target.value)}
              maxLength={40_000}
              placeholder="Hermes output appears here. You can edit it before generation."
              className={`${inputClass} min-h-28 resize-y leading-relaxed`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
