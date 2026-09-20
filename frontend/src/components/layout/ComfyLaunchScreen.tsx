import React, { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Loader2, Power, RefreshCw, Settings2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useI18n } from '@/i18n';
import { fetchAppSettingsFromBackend, pushAppSettingsToBackend } from '@/lib/appSettings';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

export function ComfyLaunchScreen({ onOpen, onManage }: {
  onOpen: () => void;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const autoStartId = useId();
  const healthy = useStore((state) => state.backendHealth.comfyui);
  const booting = useStore((state) => state.booting.comfyui);
  const startupError = useStore((state) => state.comfyStartupError);
  const autoStart = useStore((state) => state.appSettings['comfyui.autoStart']);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const remote = isUmbraRemoteClient();
  const busy = launching || (booting && !startupError);
  const failure = error || (!healthy && !launching ? startupError : null);
  const visibleError = failure || settingsError;

  useEffect(() => {
    let disposed = false;
    useStore.getState().setBooting('comfyuiVersions', false);
    void fetchAppSettingsFromBackend().then((settings) => {
      if (disposed) return;
      if (settings) {
        useStore.getState().applyAppSettings(settings);
        setSettingsReady(true);
      } else setSettingsError(t('comfy.settingsFailed'));
    });
    return () => { disposed = true; };
  }, [t]);

  useEffect(() => () => controller.current?.abort(), []);

  const launch = async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLaunching(true);
    setError(null);
    const store = useStore.getState();
    store.setComfyLaunchPhase('starting');
    try {
      for (const action of ['start', 'wait-ready']) {
        const response = await fetch(`/api/umbrabridge/backend/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'comfyui', timeout: null }),
          signal: request.signal,
        });
        const result = await response.json();
        if (!response.ok || result.success === false || (action === 'wait-ready' && !result.ready)) {
          throw new Error(result.error || result.message || t('comfy.startFailed'));
        }
      }
      store.setComfyLaunchPhase('ready');
    } catch (cause) {
      if (request.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : t('comfy.startFailed'));
      store.setComfyLaunchPhase('offline');
    } finally {
      controller.current = null;
      if (!request.signal.aborted) {
        setLaunching(false);
        void store.fetchSystemStatus({ force: true });
      }
    }
  };

  const saveAutoStart = async (enabled: boolean) => {
    if (remote || saving || !settingsReady) return;
    setSaving(true);
    setSettingsError(null);
    try {
      await pushAppSettingsToBackend({ 'comfyui.autoStart': enabled });
      const store = useStore.getState();
      store.applyAppSettings({ ...store.appSettings, 'comfyui.autoStart': enabled });
    } catch {
      setSettingsError(t('comfy.saveFailed'));
    } finally { setSaving(false); }
  };

  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--umbra-bg)] p-4 sm:p-8" data-comfy-launch-screen>
      <section className="mx-auto w-full max-w-xl py-4 sm:py-10" aria-label="ComfyUI">
        <div className="flex items-center gap-3">
          <Power className="h-5 w-5 shrink-0 text-[var(--umbra-accent)]" />
          <h1 className="text-xl font-semibold text-zinc-100">ComfyUI</h1>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-200" role="status">
          {busy && !healthy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className={`h-2 w-2 rounded-full ${healthy ? 'bg-emerald-400' : failure ? 'bg-red-400' : 'bg-zinc-500'}`} />}
          {healthy ? t('comfy.ready') : failure ? t('comfy.startFailed') : busy ? t('comfy.starting') : t('comfy.stopped')}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t('comfy.headlessHint')}</p>
        {visibleError && <p role="alert" className="mt-4 break-words rounded-md border border-red-400/25 p-3 text-sm text-red-300">{visibleError}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {healthy ? (
            <button type="button" className={buttonClass} onClick={onOpen}><ExternalLink className="h-4 w-4" />{t('comfy.open')}</button>
          ) : (
            <button type="button" className={buttonClass} onClick={() => void launch()} disabled={busy}><Power className="h-4 w-4" />{failure ? t('common.retry') : t('comfy.start')}</button>
          )}
          <button type="button" className={buttonClass} onClick={onManage}><Settings2 className="h-4 w-4" />{t('comfy.manage')}</button>
          <button type="button" className={buttonClass} onClick={() => void useStore.getState().fetchSystemStatus({ force: true })} aria-label={t('comfy.refresh')} title={t('comfy.refresh')}><RefreshCw className="h-4 w-4" /></button>
        </div>
        {!remote && (
          <div className="mt-6 flex min-h-11 items-center gap-3 border-t border-white/10 pt-5 text-sm text-zinc-200">
            <button id={autoStartId} type="button" role="switch" aria-checked={autoStart} aria-label={t('comfy.autoStart')} className={`relative h-6 w-11 shrink-0 rounded-full border border-white/15 transition-colors disabled:opacity-40 ${autoStart ? 'bg-[var(--umbra-accent)]' : 'bg-white/10'}`} disabled={saving || !settingsReady} onClick={() => void saveAutoStart(!autoStart)}>
              <span className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform ${autoStart ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <label htmlFor={autoStartId} className="cursor-pointer">{t('comfy.autoStart')}</label>
            {saving && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          </div>
        )}
      </section>
    </div>
  );
}
