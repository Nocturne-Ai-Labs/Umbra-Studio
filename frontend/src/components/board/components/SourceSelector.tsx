import { CheckSquare, KeyRound, ShieldCheck, Square } from 'lucide-react';
import { SOURCE_LIST } from '../sources';
import type { ApiKeyConfig } from '../hooks/useApiKeys';

interface SourceSelectorProps {
  selected: string[];
  onChange: (sources: string[]) => void;
  apiConfig?: ApiKeyConfig;
  onOpenApiKeys?: () => void;
}

const AUTH_REQUIRED = new Set(['gelbooru', 'rule34']);

export function SourceSelector({ selected, onChange, apiConfig, onOpenApiKeys }: SourceSelectorProps) {
  const toggle = (sourceId: string) => {
    if (selected.includes(sourceId)) {
      if (selected.length > 1) onChange(selected.filter(s => s !== sourceId));
      return;
    }
    onChange([...selected, sourceId]);
  };

  return (
    <div data-umbra-data-forge-source-selector className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Sources
        </div>
        {onOpenApiKeys && (
          <button
            type="button"
            onClick={onOpenApiKeys}
            className="forge-button"
            title="Manage site credentials"
          >
            <KeyRound className="h-3 w-3" />
            API keys
          </button>
        )}
      </div>

      <div data-umbra-data-forge-source-grid className="space-y-1">
        {SOURCE_LIST.map(source => {
          const isSelected = selected.includes(source.id);
          const requiresAuth = AUTH_REQUIRED.has(source.id);
          const configured = !!apiConfig?.[source.id as keyof ApiKeyConfig]?.hasApiKey;

          return (
            <button
              key={source.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(source.id)}
              className="w-full rounded border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]"
              style={{
                background: isSelected ? 'var(--umbra-accent-glow)' : 'rgba(255,255,255,0.03)',
                borderColor: isSelected ? 'var(--umbra-accent)' : 'rgba(255,255,255,0.09)',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              }}
            >
              <div className="flex items-center gap-2">
                {isSelected
                  ? <CheckSquare className="h-3.5 w-3.5" style={{ color: 'var(--umbra-accent)' }} />
                  : <Square className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />}
                <span
                  className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ backgroundColor: source.color }}
                >
                  {source.icon}
                </span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--umbra-text)' }}>{source.name}</span>
                {configured && (
                  <ShieldCheck className="ml-auto h-3.5 w-3.5" style={{ color: '#69e09b' }} />
                )}
              </div>

              <div className="mt-1 text-[10px] text-zinc-400">
                {requiresAuth
                  ? configured
                    ? 'Authenticated'
                    : 'User ID + API key required'
                  : 'Public API'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
