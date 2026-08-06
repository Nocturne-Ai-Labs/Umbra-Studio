'use client';

import React from 'react';
import {
  Bot,
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Settings2,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import {
  formatHermesMcpConfig,
  loadUmbraUiAgentModels,
  loadUmbraUiAgentSettings,
  regenerateUmbraUiAgentToken,
  resetUmbraUiHermesSession,
  saveUmbraUiAgentSettings,
  testUmbraUiAgentSettings,
  type UmbraUiAgentConnectionSettings,
  type UmbraUiAgentGenerationSettings,
  type UmbraUiAgentModelOption,
  type UmbraUiAgentProvider,
} from '@/lib/umbraUiAgent';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500';

const DEFAULT_AGENT_GENERATION_SETTINGS: UmbraUiAgentGenerationSettings = {
  provider: 'hermes',
  baseUrl: '',
  model: '',
  hermesProvider: '',
  thinkingLevel: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 1200,
  timeoutMs: 180_000,
};

const PROVIDER_LABELS: Record<UmbraUiAgentProvider, string> = {
  hermes: 'Hermes CLI',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  'openai-compatible': 'OpenAI API',
};

function defaultBaseUrlForProvider(provider: UmbraUiAgentProvider): string {
  if (provider === 'ollama') return 'http://127.0.0.1:11434';
  if (provider === 'lmstudio') return 'http://127.0.0.1:1234/v1';
  if (provider === 'openai-compatible') return 'http://127.0.0.1:8000/v1';
  return '';
}

function thinkingOptions(provider: UmbraUiAgentProvider, model: string) {
  if (provider === 'hermes') {
    return ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((value) => ({
      value,
      label: value ? value[0].toUpperCase() + value.slice(1) : 'Provider default',
    }));
  }
  if (provider === 'ollama' && /gpt[-_ ]?oss/i.test(model)) {
    return ['', 'low', 'medium', 'high'].map((value) => ({
      value,
      label: value ? value[0].toUpperCase() + value.slice(1) : 'Model default',
    }));
  }
  return [
    { value: '', label: 'Model default' },
    { value: 'none', label: 'Off' },
    { value: 'medium', label: 'On' },
  ];
}

export function UmbraAgentSettings() {
  const showToast = useStore((state) => state.showToast);
  const [settings, setSettings] = React.useState<UmbraUiAgentConnectionSettings | null>(null);
  const [generationSettings, setGenerationSettings] = React.useState<UmbraUiAgentGenerationSettings>(DEFAULT_AGENT_GENERATION_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [resettingHermesSession, setResettingHermesSession] = React.useState(false);
  const [testPrompt, setTestPrompt] = React.useState('');
  const [showToken, setShowToken] = React.useState(false);
  const [agentModels, setAgentModels] = React.useState<UmbraUiAgentModelOption[]>([]);
  const [loadingAgentModels, setLoadingAgentModels] = React.useState(false);

  React.useEffect(() => {
    let canceled = false;
    setLoading(true);
    void loadUmbraUiAgentSettings()
      .then((next) => {
        if (canceled) return;
        setSettings(next);
        const nextGeneration = next.generation || DEFAULT_AGENT_GENERATION_SETTINGS;
        setGenerationSettings(nextGeneration);
        if (Array.isArray(next.agentModels)) setAgentModels(next.agentModels);
        void loadUmbraUiAgentModels(nextGeneration.provider, nextGeneration.baseUrl)
          .then((result) => {
            if (!canceled && (result.models || []).length > 0) setAgentModels(result.models);
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        if (!canceled) showToast(error instanceof Error ? error.message : 'Failed to load agent settings.', 'error');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [showToast]);

  const updateGenerationSettings = (patch: Partial<UmbraUiAgentGenerationSettings>) => {
    setGenerationSettings((current) => {
      const nextProvider = patch.provider || current.provider;
      const providerChanged = patch.provider && patch.provider !== current.provider;
      return {
        ...current,
        ...patch,
        baseUrl: providerChanged ? defaultBaseUrlForProvider(nextProvider) : (patch.baseUrl ?? current.baseUrl),
      };
    });
  };

  const refreshAgentModels = async (
    provider = generationSettings.provider,
    baseUrl = generationSettings.baseUrl,
  ) => {
    setLoadingAgentModels(true);
    try {
      const result = await loadUmbraUiAgentModels(provider, baseUrl);
      setAgentModels(result.models || []);
    } catch (error) {
      setAgentModels([]);
      showToast(error instanceof Error ? error.message : 'Failed to load agent models.', 'error');
    } finally {
      setLoadingAgentModels(false);
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
    if (!settings || !window.confirm('Regenerate the MCP token? Connected agent clients will need the updated configuration.')) return;
    try {
      const next = await regenerateUmbraUiAgentToken();
      setSettings({
        ...settings,
        token: next.token,
        generation: next.generation || settings.generation,
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

  const saveSettings = async () => {
    setSaving(true);
    try {
      const saved = await saveUmbraUiAgentSettings(generationSettings);
      setSettings(saved);
      setGenerationSettings(saved.generation);
      showToast('Agent settings saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save agent settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testSettings = async () => {
    setTesting(true);
    setTestPrompt('');
    try {
      const result = await testUmbraUiAgentSettings(generationSettings);
      setTestPrompt(result.prompt);
      showToast(`Agent test completed in ${(result.durationMs / 1000).toFixed(1)}s.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent test failed.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const resetHermesSession = async () => {
    if (!window.confirm('Start a new Umbra conversation in Hermes? The existing Umbra prompt history will no longer be reused.')) return;
    setResettingHermesSession(true);
    try {
      await resetUmbraUiHermesSession();
      showToast('The next agent request will start a new Umbra conversation.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to reset the Umbra Hermes conversation.', 'error');
    } finally {
      setResettingHermesSession(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center text-zinc-600"><Loader2 size={20} className="animate-spin" /></div>;
  }

  if (!settings) {
    return <div className="py-16 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">Connection settings unavailable</div>;
  }

  const displayedHermesConfig = formatHermesMcpConfig(showToken ? settings : { ...settings, token: '<hidden>' });
  const providerNeedsModel = generationSettings.provider !== 'hermes';
  const hermesOverrideEnabled = generationSettings.provider === 'hermes'
    && Boolean(generationSettings.hermesProvider.trim() || generationSettings.model.trim());

  return (
    <div data-umbra-global-agent-settings className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Bot size={18} className="text-cyan-300" />
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-100">Agent</h3>
          <div className="mt-1 text-xs text-zinc-500">Prompt composer models and the local MCP connection.</div>
        </div>
      </div>

      <section data-umbra-agent-composer className="space-y-4 rounded-md border border-white/10 bg-white/[0.02] p-4">
        <div data-umbra-agent-composer-header className="flex items-center gap-2">
          <Settings2 size={14} className="text-cyan-300" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-200">Prompt Composer Model</div>
            <div className="mt-0.5 font-mono text-[8px] text-zinc-600">Used by Agent Mode in image and video generation.</div>
          </div>
          <div data-umbra-agent-composer-actions className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => void testSettings()}
              disabled={testing || (providerNeedsModel && !generationSettings.model.trim())}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/20 px-2.5 text-[9px] font-black uppercase tracking-[0.11em] text-cyan-100 hover:bg-cyan-500/[0.08] disabled:border-white/10 disabled:text-zinc-700"
            >
              {testing ? <Loader2 size={10} className="animate-spin" /> : <WandSparkles size={10} />} Test
            </button>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving || (providerNeedsModel && !generationSettings.model.trim())}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-300/25 bg-emerald-500/[0.08] px-2.5 text-[9px] font-black uppercase tracking-[0.11em] text-emerald-100 hover:bg-emerald-500/[0.13] disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-700"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save
            </button>
          </div>
        </div>

        <div data-umbra-agent-providers className="grid grid-cols-2 gap-1.5">
          {(['hermes', 'ollama'] as UmbraUiAgentProvider[]).map((provider) => (
            <button
              type="button"
              key={provider}
              onClick={() => {
                updateGenerationSettings({ provider, model: provider === 'hermes' ? '' : generationSettings.model });
                setAgentModels([]);
                void refreshAgentModels(provider, defaultBaseUrlForProvider(provider));
              }}
              className={cn(
                'h-9 rounded-md border text-[9px] font-black uppercase tracking-[0.11em]',
                generationSettings.provider === provider
                  ? 'border-cyan-300/35 bg-cyan-500/[0.1] text-cyan-100'
                  : 'border-white/10 text-zinc-600 hover:text-zinc-300',
              )}
            >
              {PROVIDER_LABELS[provider]}
            </button>
          ))}
        </div>

        {generationSettings.provider === 'hermes' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-300/15 bg-emerald-500/[0.045] px-3 py-2">
              <div className="font-mono text-[10px] leading-relaxed text-emerald-100/75">
                {hermesOverrideEnabled
                  ? 'Umbra will use this model only for its Hermes prompt requests.'
                  : 'Using the provider and model already selected in Hermes.'}
              </div>
              {hermesOverrideEnabled ? (
                <button
                  type="button"
                  onClick={() => updateGenerationSettings({ hermesProvider: '', model: '' })}
                  className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400 hover:text-emerald-100"
                >
                  Use Hermes Default
                </button>
              ) : null}
            </div>
            <div className="space-y-1.5">
                <span className={labelClass}>Hermes Model</span>
                <UmbraSelect
                  value={agentModels.find((model) => model.provider === generationSettings.hermesProvider && model.model === generationSettings.model)?.id || ''}
                  onValueChange={(value) => {
                    const selected = agentModels.find((model) => model.id === value);
                    updateGenerationSettings({
                      model: selected?.model || '',
                      hermesProvider: selected?.provider || '',
                    });
                  }}
                  ariaLabel="Hermes model"
                  menuTitle="Hermes Model"
                  options={[
                    { value: '', label: 'Hermes default routing', description: 'Use Hermes native selection' },
                    ...agentModels.map((model) => ({ value: model.id, label: model.label, description: model.detail })),
                    ...(generationSettings.model && !agentModels.some((model) => model.provider === generationSettings.hermesProvider && model.model === generationSettings.model)
                      ? [{ value: `${generationSettings.hermesProvider}::${generationSettings.model}`, label: generationSettings.model, description: 'Current Hermes override' }]
                      : []),
                  ]}
                  size="sm"
                  buttonClassName="w-full font-mono"
                />
            </div>
            <div className="rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.13em] text-cyan-100/80">
                  <Info size={11} />
                  Quick Guide
                </div>
                <button
                  type="button"
                  onClick={() => void resetHermesSession()}
                  disabled={resettingHermesSession}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[8px] font-black uppercase tracking-[0.1em] text-zinc-500 hover:border-cyan-300/20 hover:text-cyan-100 disabled:text-zinc-700"
                >
                  {resettingHermesSession ? <Loader2 size={10} className="animate-spin" /> : <MessageSquarePlus size={10} />}
                  New Umbra Chat
                </button>
              </div>
              <ol className="space-y-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                <li><span className="text-zinc-300">1.</span> Leave both fields blank to use the model selected in Hermes.</li>
                <li><span className="text-zinc-300">2.</span> Use <code>hermes model</code> to change Hermes&apos; native model selection.</li>
                <li><span className="text-zinc-300">3.</span> Select <span className="text-cyan-100/80">Test</span>, then <span className="text-emerald-100/80">Save</span> after the request succeeds.</li>
              </ol>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                Umbra reuses one private Hermes tool conversation. The override applies only to Umbra requests and does not change Hermes itself.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className={labelClass}>Base URL</span>
              <input
                value={generationSettings.baseUrl}
                onChange={(event) => updateGenerationSettings({ baseUrl: event.target.value })}
                placeholder={defaultBaseUrlForProvider(generationSettings.provider)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={labelClass}>Ollama Model</span>
                <button type="button" onClick={() => void refreshAgentModels()} disabled={loadingAgentModels} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-cyan-300/20 px-2 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-100 disabled:text-zinc-700">
                  {loadingAgentModels ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} Refresh Models
                </button>
              </div>
              <UmbraSelect
                value={generationSettings.model}
                onValueChange={(value) => updateGenerationSettings({ model: value })}
                ariaLabel="Ollama model"
                menuTitle="Ollama Model"
                options={[
                  { value: '', label: 'Select an installed Ollama model' },
                  ...agentModels.map((model) => ({ value: model.id, label: model.label, description: model.detail })),
                ]}
                size="sm"
                buttonClassName="w-full font-mono"
              />
              <p className="text-[10px] leading-relaxed text-zinc-600">Models are read from Ollama on this machine. Start Ollama, then refresh the list.</p>
            </div>
          </div>
        )}

        <div data-umbra-agent-tuning className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <span className={labelClass}>Thinking Level</span>
            <UmbraSelect
              value={generationSettings.thinkingLevel}
              onValueChange={(value) => updateGenerationSettings({ thinkingLevel: value })}
              ariaLabel="Thinking level"
              menuTitle="Thinking Level"
              options={thinkingOptions(generationSettings.provider, generationSettings.model)}
              size="sm"
              buttonClassName="w-full font-mono"
            />
          </div>
          <label className="block space-y-1.5">
            <span className={labelClass}>Temperature</span>
            <input type="number" min={0} max={2} step={0.05} value={generationSettings.temperature} onChange={(event) => updateGenerationSettings({ temperature: Number(event.target.value) })} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Max Tokens</span>
            <input type="number" min={64} max={8192} step={64} value={generationSettings.maxTokens} onChange={(event) => updateGenerationSettings({ maxTokens: Number(event.target.value) })} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Timeout Seconds</span>
            <input type="number" min={10} max={600} step={5} value={Math.round(generationSettings.timeoutMs / 1000)} onChange={(event) => updateGenerationSettings({ timeoutMs: Math.max(10, Number(event.target.value) || 180) * 1000 })} className={inputClass} />
          </label>
        </div>

        {testPrompt ? (
          <div className="space-y-1.5">
            <span className={labelClass}>Last Test Prompt</span>
            <div className="whitespace-pre-wrap rounded-md border border-white/10 bg-black/35 p-3 text-[11px] leading-relaxed text-zinc-300">{testPrompt}</div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-md border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-emerald-300" />
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-200">MCP Connection</div>
        </div>

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

        <div data-umbra-agent-capabilities className="grid grid-cols-3 border border-white/10 bg-white/[0.02]">
          {['Read prompt context', 'Read saved instructions', 'Stage reviewed drafts'].map((label) => (
            <div key={label} className="flex min-h-12 items-center justify-center gap-2 border-r border-white/10 px-3 text-center text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500 last:border-r-0">
              <Check size={10} className="text-emerald-300" /> {label}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
