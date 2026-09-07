import React from 'react';
import {
  PowerPrompterPromptChips,
  type PowerPrompterPromptChipConfig,
} from './PowerPrompterPromptChips';

type ActivePromptInlineBlock = {
  slotId: string;
  variantId: string;
  cardLabel: string;
  variantLabel: string;
  promptText?: string;
  visibleText?: string;
};

type Props = {
  blocks: ActivePromptInlineBlock[];
  fallbackText: string;
  className?: string;
  chipConfig?: PowerPrompterPromptChipConfig;
  wrapTokens?: boolean;
};

export const PowerPrompterActivePromptInline = React.memo(function PowerPrompterActivePromptInline({
  blocks,
  fallbackText,
  className = '',
  chipConfig,
  wrapTokens = false,
}: Props) {
  if (blocks.length <= 0) {
    return (
      <div className={`text-zinc-500 ${className}`.trim()}>
        <PowerPrompterPromptChips text={fallbackText} config={chipConfig} emptyText={fallbackText} wrapTokens={wrapTokens} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-y-2 text-zinc-200 ${className}`.trim()}>
      {blocks.map((block) => {
        const text = String(
          typeof block.visibleText === 'string'
            ? block.visibleText
            : (block.promptText || '')
        );
        return (
          <div
            key={`active-prompt-inline-${block.slotId}-${block.variantId}`}
            className="min-w-0"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                {block.cardLabel}
              </span>
              {block.variantLabel ? (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  {block.variantLabel}
                </span>
              ) : null}
              <span className={`min-w-0 leading-relaxed text-zinc-200 ${wrapTokens ? 'max-w-full [overflow-wrap:anywhere]' : ''}`}>
                <PowerPrompterPromptChips text={text} config={chipConfig} wrapTokens={wrapTokens} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
