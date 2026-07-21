import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';
import { useApiKeys, type ApiKeyUpdate, type ApiSiteId } from '../hooks/useApiKeys';

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SiteCredentialDefinition {
  id: ApiSiteId;
  name: string;
  icon: string;
  color: string;
  identityKey: 'username' | 'userId';
  identityLabel: string;
  accountUrl: string;
  required: boolean;
}

const SITES: SiteCredentialDefinition[] = [
  {
    id: 'danbooru',
    name: 'Danbooru',
    icon: 'D',
    color: '#0075f8',
    identityKey: 'username',
    identityLabel: 'Username',
    accountUrl: 'https://danbooru.donmai.us/profile',
    required: false,
  },
  {
    id: 'gelbooru',
    name: 'Gelbooru',
    icon: 'G',
    color: '#5b7cdb',
    identityKey: 'userId',
    identityLabel: 'User ID',
    accountUrl: 'https://gelbooru.com/index.php?page=account&s=options',
    required: true,
  },
  {
    id: 'rule34',
    name: 'Rule34',
    icon: 'R',
    color: '#4ea45b',
    identityKey: 'userId',
    identityLabel: 'User ID',
    accountUrl: 'https://rule34.xxx/index.php?page=account&s=options',
    required: true,
  },
  {
    id: 'e621',
    name: 'e621',
    icon: 'E',
    color: '#ed8b35',
    identityKey: 'username',
    identityLabel: 'Username',
    accountUrl: 'https://e621.net/users/home',
    required: false,
  },
];

type CredentialDrafts = Record<ApiSiteId, { identity: string; apiKey: string }>;

const EMPTY_DRAFTS: CredentialDrafts = {
  danbooru: { identity: '', apiKey: '' },
  gelbooru: { identity: '', apiKey: '' },
  rule34: { identity: '', apiKey: '' },
  e621: { identity: '', apiKey: '' },
};

export function ApiKeysModal({ isOpen, onClose }: ApiKeysModalProps) {
  const { config, saveApiKeys, deleteApiKeys, isLoading } = useApiKeys();
  const [drafts, setDrafts] = useState<CredentialDrafts>(EMPTY_DRAFTS);
  const [savingSite, setSavingSite] = useState<ApiSiteId | null>(null);
  const [savedSite, setSavedSite] = useState<ApiSiteId | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(typeof document !== 'undefined' ? document.body : null);
  }, []);

  useEffect(() => {
    setDrafts(current => ({
      danbooru: { identity: config.danbooru?.username || '', apiKey: current.danbooru.apiKey },
      gelbooru: { identity: config.gelbooru?.userId || '', apiKey: current.gelbooru.apiKey },
      rule34: { identity: config.rule34?.userId || '', apiKey: current.rule34.apiKey },
      e621: { identity: config.e621?.username || '', apiKey: current.e621.apiKey },
    }));
  }, [config]);

  if (!isOpen || !portalTarget) return null;

  const updateDraft = (site: ApiSiteId, field: 'identity' | 'apiKey', value: string) => {
    setDrafts(current => ({
      ...current,
      [site]: { ...current[site], [field]: value },
    }));
  };

  const handleSave = async (site: SiteCredentialDefinition) => {
    const draft = drafts[site.id];
    const hasApiKey = Boolean(config[site.id]?.hasApiKey);
    if (!draft.identity.trim() || (!draft.apiKey.trim() && !hasApiKey)) return;

    const credentials = site.identityKey === 'username'
      ? { username: draft.identity.trim(), apiKey: draft.apiKey.trim() }
      : { userId: draft.identity.trim(), apiKey: draft.apiKey.trim() };
    const update: ApiKeyUpdate = { [site.id]: credentials };
    setSavingSite(site.id);
    setSavedSite(null);
    const success = await saveApiKeys(update);
    setSavingSite(null);
    if (!success) return;
    updateDraft(site.id, 'apiKey', '');
    setSavedSite(site.id);
    window.setTimeout(() => setSavedSite(current => current === site.id ? null : current), 2000);
  };

  const handleDelete = async (site: ApiSiteId) => {
    setSavingSite(site);
    await deleteApiKeys(site);
    setSavingSite(null);
    setDrafts(current => ({ ...current, [site]: { identity: '', apiKey: '' } }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="glass-panel flex max-h-[86vh] w-full max-w-2xl flex-col border-white/10 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" style={{ color: 'var(--umbra-accent)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--umbra-text)' }}>Source credentials</h3>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              Credentials stay on this machine in User/Config/api-keys.json. Existing keys are never returned to the browser.
            </p>
          </div>
          <button onClick={onClose} className="umbra-icon-button rounded p-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="custom-scrollbar grid min-h-0 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {SITES.map(site => {
            const hasApiKey = Boolean(config[site.id]?.hasApiKey);
            const draft = drafts[site.id];
            const isSaving = savingSite === site.id;
            const canSave = draft.identity.trim().length > 0 && (draft.apiKey.trim().length > 0 || hasApiKey);
            return (
              <section key={site.id} className="umbra-surface-soft rounded-md border border-white/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: site.color }}>
                    {site.icon}
                  </span>
                  <span className="text-xs font-medium text-zinc-100">{site.name}</span>
                  <span className={`ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${hasApiKey ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : site.required ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-white/10 text-zinc-500'}`}>
                    <ShieldCheck className="h-3 w-3" />
                    {hasApiKey ? 'Configured' : site.required ? 'Required' : 'Optional'}
                  </span>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={draft.identity}
                    onChange={event => updateDraft(site.id, 'identity', event.target.value)}
                    placeholder={site.identityLabel}
                    className="umbra-input w-full rounded px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
                  />
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={event => updateDraft(site.id, 'apiKey', event.target.value)}
                    placeholder={hasApiKey ? 'Stored API key' : 'API key'}
                    className="umbra-input w-full rounded px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave(site)}
                      disabled={!canSave || isSaving || isLoading}
                      className="flex-1 rounded border border-cyan-400/30 bg-cyan-500/15 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100 disabled:opacity-40"
                    >
                      {isSaving ? 'Saving...' : savedSite === site.id ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span> : 'Save'}
                    </button>
                    {hasApiKey && (
                      <button type="button" onClick={() => void handleDelete(site.id)} disabled={isSaving} className="rounded border border-red-500/30 bg-red-500/10 p-1.5 text-red-300" title={`Delete ${site.name} credentials`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a href={site.accountUrl} target="_blank" rel="noopener noreferrer" className="umbra-icon-button rounded p-1.5" title={`${site.name} account settings`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
