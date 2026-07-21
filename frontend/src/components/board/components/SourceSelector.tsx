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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Sources
        </div>
        {onOpenApiKeys && (
          <button
            onClick={onOpenApiKeys}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.05)' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--umbra-text)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            }}
            title="Manage site credentials"
          >
            <KeyRound className="h-3 w-3" />
            Auth
          </button>
        )}
      </div>

      <div className="space-y-1">
        {SOURCE_LIST.map(source => {
          const isSelected = selected.includes(source.id);
          const requiresAuth = AUTH_REQUIRED.has(source.id);
          const configured = !!apiConfig?.[source.id as keyof ApiKeyConfig]?.hasApiKey;

          return (
            <button
              key={source.id}
              type="button"
              onClick={() => toggle(source.id)}
              className="w-full rounded-md border px-2 py-1.5 text-left transition-all"
              style={{
                background: isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                borderColor: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.09)',
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

              <div className="mt-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
