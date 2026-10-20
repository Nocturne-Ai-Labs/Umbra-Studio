import { formatPromptText, parsePromptJson } from '@/utils/promptText';

/** Plain text and structured prompts share the same safe, selectable rendering. */
export function PromptText({ value }: { value: unknown }) {
  const structured = !!parsePromptJson(value);
  return (
    <div data-i18n-skip="" className="min-w-0">
      {structured && <span className="mb-1 inline-block rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">JSON prompt</span>}
      <div className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${structured ? 'font-mono' : ''}`}>
        {formatPromptText(value)}
      </div>
    </div>
  );
}
