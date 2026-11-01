import { useState } from 'react';
import { formatPromptText, parsePromptJson } from '@/utils/promptText';
import { reusableMossPrompt } from '../../../../shared/umbra-ui/originalMossPrompt';

/** Preserve generation JSON while letting users recover the recorded pre-enhancement prompt. */
export function PromptText({ value, metadata }: { value: unknown; metadata?: unknown }) {
  const restored = reusableMossPrompt(metadata, typeof value === 'string' ? value : JSON.stringify(value ?? ''));
  const original = restored.kind !== 'unchanged' ? restored.text : undefined;
  const label = restored.kind === 'readable' ? 'readable prompt' : 'original prompt';
  const [selectedOriginal, setSelectedOriginal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const available = original !== undefined && original !== value;
  const showOriginal = available && selectedOriginal === original;
  const display = showOriginal ? original : value;
  const structured = !!parsePromptJson(display);
  return (
    <div data-i18n-skip="" className="min-w-0">
      {available && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" aria-pressed={showOriginal} className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={() => { setSelectedOriginal(showOriginal ? null : original); setCopied(false); }}>
          {showOriginal ? 'Show generation prompt' : `Show ${label}`}
        </button>
        <button type="button" className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={async () => { try { await navigator.clipboard.writeText(original); setCopied(true); } catch { setCopied(false); } }}>
          {copied ? 'Copied' : `Copy ${label}`}
        </button>
      </div>}
      {available && restored.kind === 'readable' && showOriginal && <p className="mb-2 text-xs text-zinc-500">This is readable text extracted from saved MOSS JSON, not a recovery of the original wording.</p>}
      {structured && <span className="mb-1 inline-block rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">JSON prompt</span>}
      <div className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${structured ? 'font-mono' : ''}`}>
        {formatPromptText(display)}
      </div>
    </div>
  );
}
