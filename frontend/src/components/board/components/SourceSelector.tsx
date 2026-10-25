import { KeyRound, ShieldCheck } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { SOURCE_LIST } from '../sources';
import type { ApiKeyConfig } from '../hooks/useApiKeys';

interface SourceSelectorProps {
  selected: string;
  onChange: (source: string) => void;
  apiConfig?: ApiKeyConfig;
  onOpenApiKeys?: () => void;
}

const AUTH_REQUIRED = new Set(['gelbooru', 'rule34']);

export function SourceSelector({ selected, onChange, apiConfig, onOpenApiKeys }: SourceSelectorProps) {
  const configured = (id: string) => !!apiConfig?.[id as keyof ApiKeyConfig]?.hasApiKey;
  const authLabel = (id: string) => AUTH_REQUIRED.has(id)
    ? configured(id) ? 'Authenticated' : 'User ID + API key required'
    : 'Public API';
  return (
    <div data-umbra-data-forge-source-selector className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Source</span>
        {onOpenApiKeys && <button type="button" onClick={onOpenApiKeys} className="forge-button" title="Manage site credentials">
          <KeyRound className="h-3 w-3" /> API keys
        </button>}
      </div>
      <UmbraSelect ariaLabel="Search source" menuTitle="Choose a source" menuSubtitle="Search one site at a time"
        value={selected} onValueChange={onChange} size="sm" buttonClassName="!h-10 !text-xs"
        options={SOURCE_LIST.map(source => ({
          value: source.id, label: source.name, description: authLabel(source.id),
          icon: <span className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: source.color }}>{source.icon}</span>,
        }))} />
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
        {configured(selected) && <ShieldCheck className="h-3 w-3 text-[var(--umbra-accent)]" />}
        {authLabel(selected)}
      </div>
    </div>
  );
}
