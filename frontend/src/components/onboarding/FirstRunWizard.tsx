'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  HardDrive,
  Languages,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { UmbraLogo } from '@/components/ui/UmbraLogo';
import {
  fetchAppSettingsFromBackend,
  loadAppSettings,
  saveAppSettings,
} from '@/lib/appSettings';
import { translate } from '@/i18n';
import { useStore } from '@/store/useStore';
import type {
  UmbraAppLanguage,
  UmbraFirstRunState,
  UmbraMigrationSummary,
} from '../../../../shared/onboarding/firstRun';

type WizardStep = 'language' | 'mode' | 'migrate';

interface OnboardingStatusResponse {
  success?: boolean;
  required?: boolean;
  hostActionsAvailable?: boolean;
  forceSetupOnLaunch?: boolean;
  launchId?: string;
  state?: UmbraFirstRunState;
  error?: string;
}

const COMPLETED_SETUP_LAUNCH_STORAGE_KEY = 'umbra:first-run-completed-launch';
const SKIP_SETUP_AFTER_MIGRATION_STORAGE_KEY = 'umbra:first-run-skip-after-migration';

function readBrowserStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeBrowserStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage may be unavailable in hardened or private contexts.
  }
}

function removeBrowserStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage may be unavailable in hardened or private contexts.
  }
}

function languageName(language: UmbraAppLanguage, target: UmbraAppLanguage) {
  if (target === 'ja') return translate(language, 'language.japanese');
  if (target === 'zh-CN') return translate(language, 'language.chinese');
  if (target === 'ko') return translate(language, 'language.korean');
  return translate(language, 'language.english');
}

export function FirstRunGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UmbraFirstRunState | null>(null);
  const [hostActionsAvailable, setHostActionsAvailable] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [ready, setReady] = useState(false);
  const launchIdRef = useRef('');
  const migrationObservedRef = useRef(false);
  const reconnectReloadStartedRef = useRef(false);

  const markSetupCompleteForLaunch = useCallback(() => {
    if (launchIdRef.current) {
      writeBrowserStorage(COMPLETED_SETUP_LAUNCH_STORAGE_KEY, launchIdRef.current);
    }
  }, []);

  const hydrateCompletedSetup = useCallback(async (nextState: UmbraFirstRunState) => {
    const backendSettings = await fetchAppSettingsFromBackend();
    const settings = backendSettings || {
      ...loadAppSettings(),
      'ui.language': nextState.language,
    };
    const persisted = saveAppSettings(settings, { replace: true });
    useStore.getState().applyAppSettings(persisted);
    setReady(true);
  }, []);

  const completeSetupForLaunch = useCallback(async (nextState: UmbraFirstRunState) => {
    markSetupCompleteForLaunch();
    await hydrateCompletedSetup(nextState);
  }, [hydrateCompletedSetup, markSetupCompleteForLaunch]);

  const refreshStatus = useCallback(async (quiet = false) => {
    try {
      const response = await fetch('/api/onboarding/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as OnboardingStatusResponse;
      if (!response.ok || payload.success === false || !payload.state) {
        throw new Error(payload.error || `Setup status failed (${response.status})`);
      }
      const nextLaunchId = String(payload.launchId || '').trim();
      const nextHostActionsAvailable = payload.hostActionsAvailable === true;
      launchIdRef.current = nextLaunchId;
      setHostActionsAvailable(nextHostActionsAvailable);
      setLoadError('');
      if (payload.state.phase === 'migrating') {
        setState(payload.state);
        migrationObservedRef.current = true;
        return;
      }
      if (payload.state.phase === 'complete') {
        if (migrationObservedRef.current && !reconnectReloadStartedRef.current) {
          reconnectReloadStartedRef.current = true;
          window.location.reload();
          return;
        }

        if (readBrowserStorage(SKIP_SETUP_AFTER_MIGRATION_STORAGE_KEY)) {
          removeBrowserStorage(SKIP_SETUP_AFTER_MIGRATION_STORAGE_KEY);
          markSetupCompleteForLaunch();
          setState(payload.state);
          await hydrateCompletedSetup(payload.state);
          return;
        }

        const setupAlreadyShownThisLaunch = nextLaunchId
          && readBrowserStorage(COMPLETED_SETUP_LAUNCH_STORAGE_KEY) === nextLaunchId;
        if (
          payload.forceSetupOnLaunch === true
          && nextHostActionsAvailable
          && !setupAlreadyShownThisLaunch
        ) {
          setState({ ...payload.state, phase: 'pending' });
          return;
        }

        setState(payload.state);
        await hydrateCompletedSetup(payload.state);
        return;
      }
      setState(payload.state);
    } catch (error) {
      if (!quiet) {
        setLoadError(error instanceof Error ? error.message : 'Umbra is not responding.');
      }
    }
  }, [hydrateCompletedSetup, markSetupCompleteForLaunch]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (ready || state?.phase !== 'migrating') return;
    const timer = window.setInterval(() => {
      void refreshStatus(true);
    }, 1500);
    const reconnectNow = () => void refreshStatus(true);
    const reconnectWhenVisible = () => {
      if (document.visibilityState === 'visible') reconnectNow();
    };
    window.addEventListener('focus', reconnectNow);
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', reconnectWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reconnectNow);
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', reconnectWhenVisible);
    };
  }, [ready, refreshStatus, state?.phase]);

  if (ready) return <>{children}</>;
  if (!state && !loadError) {
    return (
      <div
        className="fixed inset-0 z-[20000] bg-[#030506]"
        aria-label="Starting Umbra Studio"
      />
    );
  }

  return (
    <FirstRunWizard
      state={state}
      hostActionsAvailable={hostActionsAvailable}
      loadError={loadError}
      onStateChange={setState}
      onRetry={() => void refreshStatus()}
      onComplete={completeSetupForLaunch}
    />
  );
}

interface FirstRunWizardProps {
  state: UmbraFirstRunState | null;
  hostActionsAvailable: boolean;
  loadError: string;
  onStateChange: (state: UmbraFirstRunState) => void;
  onRetry: () => void;
  onComplete: (state: UmbraFirstRunState) => Promise<void>;
}

function FirstRunWizard({
  state,
  hostActionsAvailable,
  loadError,
  onStateChange,
  onRetry,
  onComplete,
}: FirstRunWizardProps) {
  const [language, setLanguage] = useState<UmbraAppLanguage>(state?.language || 'en');
  const [step, setStep] = useState<WizardStep>(state?.phase === 'failed' ? 'migrate' : 'language');
  const [source, setSource] = useState<UmbraMigrationSummary | null>(null);
  const [sourcePath, setSourcePath] = useState(state?.migration?.sourceRoot || '');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(state?.migration?.error || '');
  const t = useCallback(
    (key: Parameters<typeof translate>[1], variables?: Record<string, string | number>) => translate(language, key, variables),
    [language],
  );

  useEffect(() => {
    if (!state) return;
    setLanguage(state.language);
    if (state.phase === 'failed') {
      setStep('migrate');
      setSourcePath(state.migration?.sourceRoot || '');
      setActionError(state.migration?.error || '');
    }
  }, [state]);

  const selectedLanguageLabel = languageName(language, language);
  const setupIsMigrating = state?.phase === 'migrating';
  const progressTitle = state?.phase === 'failed'
    ? t('onboarding.failedTitle')
    : t('onboarding.migratingTitle');
  const progressBody = state?.phase === 'failed'
    ? t('onboarding.failedBody')
    : t('onboarding.migratingBody');
  const choosePreviousBuild = async () => {
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/onboarding/browse-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDir: sourcePath }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || `Folder selection failed (${response.status})`);
      }
      if (payload?.canceled) return;
      setSource(payload.source as UmbraMigrationSummary);
      setSourcePath(String(payload.source?.sourceRoot || ''));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('onboarding.invalidSource'));
    } finally {
      setBusy(false);
    }
  };

  const inspectPreviousBuild = async () => {
    if (!sourcePath.trim()) {
      setActionError(t('onboarding.invalidSource'));
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/onboarding/inspect-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceRoot: sourcePath }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || t('onboarding.invalidSource'));
      }
      setSource(payload.source as UmbraMigrationSummary);
      setSourcePath(String(payload.source?.sourceRoot || sourcePath));
    } catch (error) {
      setSource(null);
      setActionError(error instanceof Error ? error.message : t('onboarding.invalidSource'));
    } finally {
      setBusy(false);
    }
  };

  const startFresh = async () => {
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false || !payload?.state) {
        throw new Error(payload?.error || `Setup failed (${response.status})`);
      }
      onStateChange(payload.state as UmbraFirstRunState);
      await onComplete(payload.state as UmbraFirstRunState);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  };

  const startMigration = async () => {
    if (!source) {
      await inspectPreviousBuild();
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/onboarding/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceRoot: source.sourceRoot, language }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false || !payload?.state) {
        throw new Error(payload?.error || `Migration failed to start (${response.status})`);
      }
      writeBrowserStorage(SKIP_SETUP_AFTER_MIGRATION_STORAGE_KEY, '1');
      onStateChange(payload.state as UmbraFirstRunState);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Migration failed to start.');
    } finally {
      setBusy(false);
    }
  };

  const statusChips = useMemo(() => {
    if (!source) return [];
    return [
      source.hasUser ? t('onboarding.userDataFound') : '',
      source.hasTools ? t('onboarding.toolsFound') : '',
      source.hasComfyUI ? t('onboarding.comfyFound') : '',
      source.hasAIToolkit ? t('onboarding.aiToolkitFound') : '',
    ].filter(Boolean);
  }, [source, t]);

  return (
    <div className="fixed inset-0 z-[20000] overflow-y-auto bg-[#030506] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="w-[190px] sm:w-[240px]">
            <UmbraLogo width="100%" />
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--umbra-accent)]">
              {t('onboarding.eyebrow')}
            </div>
            <div className="mt-1 text-xs text-zinc-500">{selectedLanguageLabel}</div>
          </div>
        </header>

        <main className="flex flex-1 items-center py-10">
          <div className="w-full">
            {loadError && !state ? (
              <section className="max-w-2xl">
                <RefreshCw className="mb-5 text-[var(--umbra-accent)]" size={30} />
                <h1 className="text-3xl font-black sm:text-4xl">{t('onboarding.connectionTitle')}</h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">{t('onboarding.connectionBody')}</p>
                <div className="mt-5 border-l-2 border-red-500/70 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                  {loadError}
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/15 px-5 text-sm font-bold text-white"
                >
                  <RefreshCw size={16} />
                  {t('common.retry')}
                </button>
              </section>
            ) : setupIsMigrating || state?.phase === 'failed' ? (
              <section className="max-w-2xl">
                {setupIsMigrating
                  ? <Loader2 className="mb-5 animate-spin text-[var(--umbra-accent)]" size={32} />
                  : <RefreshCw className="mb-5 text-red-400" size={32} />}
                <h1 className="text-3xl font-black sm:text-4xl">{progressTitle}</h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">{progressBody}</p>
                {setupIsMigrating && (
                  <div className="mt-6 max-w-xl rounded-md border border-white/10 bg-white/[0.025] px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="animate-spin text-[var(--umbra-accent)]" size={16} />
                      <span className="text-sm font-bold text-white">{t('onboarding.migrationOfflineStage')}</span>
                    </div>
                    <p className="mt-3 text-xs leading-6 text-zinc-500">
                      {t('onboarding.largeCopyNotice')}
                    </p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--umbra-accent)]" />
                    </div>
                  </div>
                )}
                {state?.migration?.sourceRoot && (
                  <div className="mt-6 rounded-md border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-zinc-300">
                    {state.migration.sourceRoot}
                  </div>
                )}
                {(state?.migration?.error || actionError) && (
                  <div className="mt-4 border-l-2 border-red-500/70 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {state?.migration?.error || actionError}
                  </div>
                )}
                {setupIsMigrating && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-5 text-sm font-bold text-zinc-200 hover:border-[var(--umbra-accent)]/60"
                  >
                    <RefreshCw size={16} />
                    {t('onboarding.reconnectNow')}
                  </button>
                )}
                {state?.phase === 'failed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError('');
                      setStep('migrate');
                      onStateChange({
                        ...state,
                        phase: 'pending',
                      });
                    }}
                    className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/15 px-5 text-sm font-bold text-white"
                  >
                    <RefreshCw size={16} />
                    {t('common.retry')}
                  </button>
                )}
              </section>
            ) : !hostActionsAvailable && state ? (
              <section className="max-w-2xl">
                <ShieldCheck className="mb-5 text-[var(--umbra-accent)]" size={30} />
                <h1 className="text-3xl font-black sm:text-4xl">{t('onboarding.hostOnlyTitle')}</h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">{t('onboarding.hostOnlyBody')}</p>
              </section>
            ) : step === 'language' ? (
              <section>
                <div className="max-w-3xl">
                  <Languages className="mb-5 text-[var(--umbra-accent)]" size={32} />
                  <h1 className="text-3xl font-black sm:text-5xl">{t('onboarding.welcomeTitle')}</h1>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                    {t('onboarding.welcomeBody')}
                  </p>
                </div>
                <h2 className="mt-10 text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  {t('onboarding.chooseLanguage')}
                </h2>
                <div className="mt-4 grid max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(['en', 'ja', 'zh-CN', 'ko'] as UmbraAppLanguage[]).map((option) => {
                    const selected = language === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLanguage(option)}
                        className={`flex min-h-20 items-center justify-between rounded-md border px-5 text-left transition-colors ${
                          selected
                            ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/12 text-white'
                            : 'border-white/10 bg-white/[0.025] text-zinc-300 hover:border-white/25'
                        }`}
                      >
                        <div>
                          <div className="text-base font-bold">{languageName(option, option)}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {option === 'ja'
                              ? 'Japanese'
                              : option === 'zh-CN'
                                ? 'Simplified Chinese'
                                : option === 'ko'
                                  ? 'Korean'
                                  : 'English'}
                          </div>
                        </div>
                        {selected && <Check size={18} className="text-[var(--umbra-accent)]" />}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-zinc-500">{t('onboarding.languageHint')}</p>
              </section>
            ) : step === 'mode' ? (
              <section>
                <Sparkles className="mb-5 text-[var(--umbra-accent)]" size={32} />
                <h1 className="text-3xl font-black sm:text-4xl">{t('onboarding.setupTitle')}</h1>
                <div className="mt-8 grid gap-4 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void startFresh()}
                    disabled={busy}
                    className="group min-h-44 rounded-md border border-white/10 bg-white/[0.025] p-6 text-left transition-colors hover:border-[var(--umbra-accent)]/60 hover:bg-[var(--umbra-accent)]/8 disabled:opacity-50"
                  >
                    <Sparkles size={24} className="text-[var(--umbra-accent)]" />
                    <h2 className="mt-5 text-xl font-black">{t('onboarding.freshTitle')}</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t('onboarding.freshBody')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('migrate')}
                    disabled={busy}
                    className="group min-h-44 rounded-md border border-white/10 bg-white/[0.025] p-6 text-left transition-colors hover:border-[var(--umbra-accent)]/60 hover:bg-[var(--umbra-accent)]/8 disabled:opacity-50"
                  >
                    <HardDrive size={24} className="text-[var(--umbra-accent)]" />
                    <h2 className="mt-5 text-xl font-black">{t('onboarding.migrateTitle')}</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{t('onboarding.migrateBody')}</p>
                  </button>
                </div>
                {actionError && (
                  <div className="mt-5 border-l-2 border-red-500/70 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {actionError}
                  </div>
                )}
              </section>
            ) : (
              <section>
                <Wrench className="mb-5 text-[var(--umbra-accent)]" size={32} />
                <h1 className="text-3xl font-black sm:text-4xl">{t('onboarding.migrateTitle')}</h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">{t('onboarding.migrationSafety')}</p>
                <div className="mt-8 max-w-4xl">
                  <label className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                    {t('onboarding.previousBuild')}
                  </label>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={sourcePath}
                      onChange={(event) => {
                        setSourcePath(event.target.value);
                        setSource(null);
                      }}
                      onBlur={() => {
                        if (sourcePath.trim() && !source) void inspectPreviousBuild();
                      }}
                      className="min-h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/35 px-4 font-mono text-sm text-white outline-none focus:border-[var(--umbra-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => void choosePreviousBuild()}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.05] px-5 text-sm font-bold hover:border-[var(--umbra-accent)]/60 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                      {t('onboarding.choosePrevious')}
                    </button>
                  </div>
                </div>

                {source && (
                  <div className="mt-5 max-w-4xl rounded-md border border-[var(--umbra-accent)]/35 bg-[var(--umbra-accent)]/[0.06] px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-mono text-xs text-zinc-300">{source.sourceRoot}</div>
                      <div className="text-xs font-bold text-[var(--umbra-accent)]">
                        {t('onboarding.version', { version: source.version })}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {statusChips.map((label) => (
                        <span key={label} className="rounded border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {actionError && (
                  <div className="mt-5 max-w-4xl border-l-2 border-red-500/70 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {actionError}
                  </div>
                )}
                <div className="mt-5 flex max-w-4xl items-start gap-3 text-xs leading-6 text-zinc-500">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[var(--umbra-accent)]" />
                  <span>{t('onboarding.restartNotice')}</span>
                </div>
              </section>
            )}
          </div>
        </main>

        {!loadError && hostActionsAvailable && !setupIsMigrating && state?.phase !== 'failed' && (
          <footer className="flex items-center justify-between border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => {
                if (step === 'migrate') setStep('mode');
                else if (step === 'mode') setStep('language');
              }}
              disabled={step === 'language' || busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold text-zinc-400 hover:text-white disabled:invisible"
            >
              <ArrowLeft size={16} />
              {t('common.back')}
            </button>
            {step === 'language' && (
              <button
                type="button"
                onClick={() => setStep('mode')}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/15 px-5 text-sm font-bold text-white"
              >
                {t('common.continue')}
                <ArrowRight size={16} />
              </button>
            )}
            {step === 'migrate' && (
              <button
                type="button"
                onClick={() => void startMigration()}
                disabled={busy || !source}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/15 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {t('onboarding.startMigration')}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
