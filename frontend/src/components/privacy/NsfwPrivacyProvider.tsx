'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { pushAppSettingsToBackend, saveAppSettings, type AppSettings } from '@/lib/appSettings';
import {
  createUmbraPrivacySalt,
  hashUmbraPrivacyPin,
  isUmbraPrivacyLocked,
  normalizeFourDigitPin,
  NSFW_PRIVACY_UNLOCK_DURATION_MS,
} from '@/lib/nsfwPrivacy';
import { useStore } from '@/store/useStore';

type NsfwPrivacyMode = AppSettings['ui.nsfwPrivacyMode'];
type PrivacyDialogMode = 'setup' | 'unlock';

interface NsfwPrivacyContextValue {
  mode: NsfwPrivacyMode;
  locked: boolean;
  hasPin: boolean;
  unlockedUntil: number;
  setMode: (mode: NsfwPrivacyMode) => void;
  requestUnlock: () => void;
  configurePin: () => void;
  lockNow: () => void;
}

const NsfwPrivacyContext = createContext<NsfwPrivacyContextValue | null>(null);

const PROTECTED_MEDIA_SELECTOR = '[data-umbra-nsfw-media]';

function NsfwPinDialog({
  mode,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: PrivacyDialogMode;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (pin: string, confirmation: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pinRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => pinRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  const normalizeInput = (value: string) => value.replace(/\D/g, '').slice(0, 4);

  const dialog = (
    <div
      data-umbra-modal="nsfw-pin"
      className="fixed inset-0 z-[14000] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="umbra-nsfw-pin-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <form
        className="w-full max-w-sm rounded-lg border border-red-300/25 bg-[#090b10] p-4 shadow-2xl shadow-black/80"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(pin, confirmation);
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-300/25 bg-red-500/10 text-red-200">
              {mode === 'setup' ? <ShieldCheck size={19} /> : <LockKeyhole size={19} />}
            </span>
            <div className="min-w-0">
              <h2 id="umbra-nsfw-pin-title" className="text-sm font-bold text-zinc-100">
                {mode === 'setup' ? 'Set privacy PIN' : 'Unlock protected media'}
              </h2>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                {mode === 'setup'
                  ? 'Use four digits. Media relocks when Umbra Studio restarts.'
                  : 'Enter your four-digit PIN to reveal protected images and videos for 15 minutes.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-zinc-500 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50" aria-label="Close privacy PIN dialog">
            <X size={15} />
          </button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          4-digit PIN
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'}
            value={pin}
            onChange={(event) => setPin(normalizeInput(event.target.value))}
            className="mt-1.5 h-11 w-full rounded-md border border-white/10 bg-black/45 px-3 text-center font-mono text-lg tracking-[0.45em] text-zinc-100 outline-none focus:border-red-300/45"
            aria-invalid={Boolean(error)}
          />
        </label>

        {mode === 'setup' ? (
          <label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Confirm PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(normalizeInput(event.target.value))}
              className="mt-1.5 h-11 w-full rounded-md border border-white/10 bg-black/45 px-3 text-center font-mono text-lg tracking-[0.45em] text-zinc-100 outline-none focus:border-red-300/45"
              aria-invalid={Boolean(error)}
            />
          </label>
        ) : null}

        <div className="mt-2 min-h-4 text-[11px] text-red-300" role="status">{error}</div>
        <button
          type="submit"
          disabled={busy || pin.length !== 4 || (mode === 'setup' && confirmation.length !== 4)}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-300/35 bg-red-500/15 text-[11px] font-bold text-red-100 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LockKeyhole size={14} />
          {busy ? 'Checking...' : mode === 'setup' ? 'Set PIN and lock' : 'Unlock media'}
        </button>
      </form>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}

export function NsfwPrivacyProvider({ children }: { children: React.ReactNode }) {
  const appSettings = useStore((state) => state.appSettings);
  const applyAppSettings = useStore((state) => state.applyAppSettings);
  const mode = appSettings['ui.nsfwPrivacyMode'];
  const pinHash = String(appSettings['ui.nsfwPrivacyPinHash'] || '');
  const pinSalt = String(appSettings['ui.nsfwPrivacyPinSalt'] || '');
  const hasPin = Boolean(pinHash && pinSalt);
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const [dialogMode, setDialogMode] = useState<PrivacyDialogMode | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const [pendingLockEnable, setPendingLockEnable] = useState(false);

  const locked = isUmbraPrivacyLocked({ mode, unlockedUntil });

  const commitSettings = useCallback((updates: Partial<AppSettings>) => {
    const nextSettings = saveAppSettings(updates);
    applyAppSettings(nextSettings);
    void pushAppSettingsToBackend(nextSettings).catch((error) => {
      console.warn('[NsfwPrivacy] Failed to persist privacy settings:', error);
      useStore.getState().showToast('Failed to save NSFW privacy settings', 'error');
    });
  }, [applyAppSettings]);

  const closeDialog = useCallback(() => {
    if (dialogBusy) return;
    setDialogMode(null);
    setDialogError('');
    setPendingLockEnable(false);
  }, [dialogBusy]);

  const configurePin = useCallback(() => {
    setDialogError('');
    setPendingLockEnable(mode !== 'lock');
    setDialogMode('setup');
  }, [mode]);

  const requestUnlock = useCallback(() => {
    setDialogError('');
    if (!hasPin) {
      setPendingLockEnable(true);
      setDialogMode('setup');
      return;
    }
    setDialogMode('unlock');
  }, [hasPin]);

  const lockNow = useCallback(() => {
    setUnlockedUntil(0);
    commitSettings({
      'ui.nsfwPrivacyMode': 'lock',
      'ui.nsfwPrivacyLockEngaged': true,
      'ui.nsfwPrivacyLockEngagedAt': Date.now(),
      'ui.nsfwThumbnailBlurEnabled': false,
    });
  }, [commitSettings]);

  const setMode = useCallback((nextMode: NsfwPrivacyMode) => {
    if (nextMode === 'lock') {
      if (!hasPin) {
        setDialogError('');
        setPendingLockEnable(true);
        setDialogMode('setup');
        return;
      }
      lockNow();
      return;
    }
    setUnlockedUntil(0);
    commitSettings({
      'ui.nsfwPrivacyMode': nextMode,
      'ui.nsfwPrivacyLockEngaged': false,
      'ui.nsfwThumbnailBlurEnabled': nextMode === 'blur',
    });
  }, [commitSettings, hasPin, lockNow]);

  const submitPin = useCallback(async (rawPin: string, rawConfirmation: string) => {
    const pin = normalizeFourDigitPin(rawPin);
    if (!pin) {
      setDialogError('PIN must contain exactly four digits.');
      return;
    }
    setDialogBusy(true);
    setDialogError('');
    try {
      if (dialogMode === 'setup') {
        const confirmation = normalizeFourDigitPin(rawConfirmation);
        if (!confirmation || confirmation !== pin) {
          setDialogError('PIN confirmation does not match.');
          return;
        }
        const salt = createUmbraPrivacySalt();
        const hash = await hashUmbraPrivacyPin(pin, salt);
        setUnlockedUntil(0);
        commitSettings({
          'ui.nsfwPrivacyPinSalt': salt,
          'ui.nsfwPrivacyPinHash': hash,
          'ui.nsfwPrivacyMode': pendingLockEnable || mode === 'lock' ? 'lock' : mode,
          'ui.nsfwPrivacyLockEngaged': pendingLockEnable || mode === 'lock',
          'ui.nsfwPrivacyLockEngagedAt': Date.now(),
          'ui.nsfwThumbnailBlurEnabled': pendingLockEnable || mode === 'lock' ? false : mode === 'blur',
        });
        setDialogMode(null);
        setPendingLockEnable(false);
        useStore.getState().showToast('NSFW privacy PIN saved', 'success');
        return;
      }

      const attemptedHash = await hashUmbraPrivacyPin(pin, pinSalt);
      if (attemptedHash !== pinHash) {
        setDialogError('Incorrect PIN.');
        return;
      }
      setUnlockedUntil(Date.now() + NSFW_PRIVACY_UNLOCK_DURATION_MS);
      setDialogMode(null);
      useStore.getState().showToast('Protected media unlocked for 15 minutes', 'success');
    } finally {
      setDialogBusy(false);
    }
  }, [commitSettings, dialogMode, mode, pendingLockEnable, pinHash, pinSalt]);

  useEffect(() => {
    if (mode !== 'lock' || unlockedUntil <= Date.now()) return;
    const timer = window.setTimeout(() => {
      setUnlockedUntil(0);
      useStore.getState().showToast('NSFW media previews relocked', 'info');
    }, Math.max(0, unlockedUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [mode, unlockedUntil]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const blurEnabled = mode === 'blur';
    const lockEnabled = locked;
    const intensity = Math.max(0, Math.min(100, Math.round(Number(appSettings['ui.nsfwThumbnailBlurIntensity'] ?? 85))));
    document.body.classList.toggle('umbra-nsfw-thumbnail-blur-enabled', blurEnabled);
    document.body.classList.toggle('umbra-nsfw-media-locked', lockEnabled);
    document.documentElement.style.setProperty('--umbra-nsfw-thumbnail-blur', `${((intensity / 100) * 20).toFixed(2)}px`);
    return () => {
      document.body.classList.remove('umbra-nsfw-thumbnail-blur-enabled');
      document.body.classList.remove('umbra-nsfw-media-locked');
      document.documentElement.style.removeProperty('--umbra-nsfw-thumbnail-blur');
    };
  }, [appSettings, locked, mode]);

  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    const interceptProtectedMedia = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest(PROTECTED_MEDIA_SELECTOR) : null;
      if (!target || target.closest('[data-umbra-nsfw-exempt]')) return;
      event.preventDefault();
      event.stopPropagation();
      requestUnlock();
    };
    document.addEventListener('pointerdown', interceptProtectedMedia, true);
    return () => document.removeEventListener('pointerdown', interceptProtectedMedia, true);
  }, [locked, requestUnlock]);

  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    const pauseProtectedVideo = (candidate: Element | EventTarget | null) => {
      if (!(candidate instanceof HTMLVideoElement) || !candidate.matches(PROTECTED_MEDIA_SELECTOR)) return;
      candidate.pause();
    };
    document.querySelectorAll(PROTECTED_MEDIA_SELECTOR).forEach((element) => pauseProtectedVideo(element));
    const interceptPlayback = (event: Event) => pauseProtectedVideo(event.target);
    document.addEventListener('play', interceptPlayback, true);
    return () => document.removeEventListener('play', interceptPlayback, true);
  }, [locked]);

  const value = useMemo<NsfwPrivacyContextValue>(() => ({
    mode,
    locked,
    hasPin,
    unlockedUntil,
    setMode,
    requestUnlock,
    configurePin,
    lockNow,
  }), [configurePin, hasPin, lockNow, locked, mode, requestUnlock, setMode, unlockedUntil]);

  return (
    <NsfwPrivacyContext.Provider value={value}>
      {children}
      {dialogMode ? (
        <NsfwPinDialog
          key={dialogMode}
          mode={dialogMode}
          busy={dialogBusy}
          error={dialogError}
          onClose={closeDialog}
          onSubmit={(pin, confirmation) => void submitPin(pin, confirmation)}
        />
      ) : null}
    </NsfwPrivacyContext.Provider>
  );
}

export function useNsfwPrivacy(): NsfwPrivacyContextValue {
  const context = useContext(NsfwPrivacyContext);
  if (!context) throw new Error('useNsfwPrivacy must be used inside NsfwPrivacyProvider.');
  return context;
}

export function NsfwPrivacyShield({ compact = false, protectedMedia = true }: { compact?: boolean; protectedMedia?: boolean }) {
  const { locked, requestUnlock } = useNsfwPrivacy();
  if (!locked || !protectedMedia) return null;
  return (
    <button
      type="button"
      data-umbra-nsfw-shield=""
      className="absolute inset-0 z-[45] flex h-full w-full items-center justify-center bg-[#050608] text-red-100"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestUnlock();
      }}
      aria-label="Unlock protected media"
      title="Protected media - enter PIN to unlock"
    >
      <span className="flex flex-col items-center justify-center gap-1.5 px-2 text-center">
        <LockKeyhole size={compact ? 16 : 24} />
        {!compact ? <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Protected media</span> : null}
      </span>
    </button>
  );
}
