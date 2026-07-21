import React from 'react';

type PromptChipToken = {
  key: string;
  text: string;
  kind: 'lora' | 'trained' | 'neutral';
  color?: string;
};

export type PowerPrompterPromptChipConfig = {
  loraColorByName?: Record<string, string>;
  trainedTags?: string[];
};

function normalizePromptChipText(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLoraSyntaxName(rawName: unknown): string {
  return String(rawName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '');
}

function hexToRgba(hexColor: string, alpha: number): string {
  const safe = String(hexColor || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(safe)) return `rgba(34,211,238,${alpha})`;
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function extractLoraName(rawToken: string): string {
  const token = normalizePromptChipText(rawToken);
  if (!token) return '';
  const weighted = token.match(/^<\s*lora\s*:\s*([^:>]+?)\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+))?\s*>$/i);
  if (weighted) return normalizeLoraSyntaxName(weighted[1]).toLowerCase();
  const compact = token.match(/^<\s*lora\s*:\s*([^:>]+?)\s*>$/i);
  if (compact) return normalizeLoraSyntaxName(compact[1]).toLowerCase();
  return '';
}

export function buildPowerPrompterPromptChipTokens(
  text: unknown,
  config?: PowerPrompterPromptChipConfig,
): PromptChipToken[] {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  const loraColorByName = config?.loraColorByName || {};
  const trainedTagSet = new Set(
    (config?.trainedTags || [])
      .map((tag) => normalizePromptChipText(tag).toLowerCase())
      .filter(Boolean),
  );

  return raw
    .split(',')
    .map((entry, index) => ({ text: normalizePromptChipText(entry), index }))
    .filter((entry) => entry.text.length > 0)
    .map((entry) => {
      const loraName = extractLoraName(entry.text);
      if (loraName) {
        return {
          key: `${entry.index}:lora:${loraName}:${entry.text}`,
          text: entry.text,
          kind: 'lora',
          color: loraColorByName[loraName] || '#c084fc',
        };
      }

      const trainedKey = entry.text.toLowerCase();
      if (trainedTagSet.has(trainedKey)) {
        return {
          key: `${entry.index}:trained:${trainedKey}`,
          text: entry.text,
          kind: 'trained',
        };
      }

      return {
        key: `${entry.index}:neutral:${entry.text}`,
        text: entry.text,
        kind: 'neutral',
      };
    });
}

export function hasPowerPrompterPromptSpecialChips(
  text: unknown,
  config?: PowerPrompterPromptChipConfig,
): boolean {
  return buildPowerPrompterPromptChipTokens(text, config)
    .some((token) => token.kind === 'lora' || token.kind === 'trained');
}

type Props = {
  text: unknown;
  config?: PowerPrompterPromptChipConfig;
  className?: string;
  emptyText?: string;
  compact?: boolean;
  specialOnly?: boolean;
};

export const PowerPrompterPromptChips = React.memo(function PowerPrompterPromptChips({
  text,
  config,
  className = '',
  emptyText = '',
  compact = false,
  specialOnly = false,
}: Props) {
  const tokens = React.useMemo(() => {
    const allTokens = buildPowerPrompterPromptChipTokens(text, config);
    return specialOnly
      ? allTokens.filter((token) => token.kind === 'lora' || token.kind === 'trained')
      : allTokens;
  }, [config, specialOnly, text]);
  if (tokens.length <= 0) {
    return emptyText ? <span className={className}>{emptyText}</span> : null;
  }

  return (
    <span className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 overflow-hidden ${className}`.trim()}>
      {tokens.map((token, index) => {
        const trailingSeparator = !specialOnly && index < tokens.length - 1 ? ',' : '';
        if (token.kind === 'lora') {
          const color = token.color || '#c084fc';
          return (
            <span key={token.key} className="inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden">
              <span
                className="inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4"
                style={{
                  color,
                  borderColor: hexToRgba(color, 0.52),
                  backgroundColor: hexToRgba(color, 0.15),
                  boxShadow: `0 0 0 1px ${hexToRgba(color, 0.12)} inset`,
                }}
                title="LoRA token"
              >
                <span className="min-w-0 truncate">{token.text}</span>
              </span>
              {trailingSeparator ? <span className="text-zinc-400">{trailingSeparator}</span> : null}
            </span>
          );
        }

        if (token.kind === 'trained') {
          return (
            <span key={token.key} className="inline-flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden">
              <span
                className="inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-md border border-cyan-400/35 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.08)_inset]"
                title="Trained tag"
              >
                <span className="min-w-0 truncate">{token.text}</span>
              </span>
              {trailingSeparator ? <span className="text-zinc-400">{trailingSeparator}</span> : null}
            </span>
          );
        }

        return (
          <span
            key={token.key}
            className={`min-w-0 leading-relaxed text-zinc-300 ${compact ? 'text-[10px]' : 'text-[11px]'}`}
          >
            {token.text}{trailingSeparator}
          </span>
        );
      })}
    </span>
  );
});
