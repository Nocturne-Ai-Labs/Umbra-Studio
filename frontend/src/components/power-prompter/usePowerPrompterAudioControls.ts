import { useCallback, useEffect, useRef } from 'react';
import type {
  PowerPrompterCompletionSoundStyle,
  PowerPrompterSettings,
} from '@/types/powerPrompter';
import { DEFAULT_POWER_PROMPTER_SETTINGS } from '@/lib/powerPrompter';
import {
  POWER_PROMPTER_SOUND_PROFILES,
  POWER_PROMPTER_SOUND_STYLE_GLASS_TICK,
  POWER_PROMPTER_SOUND_STYLE_OPTIONS,
  clampAlertLinearGain,
  clampCompletionSoundVolume,
  getCompletionAudioContext,
} from '@/components/power-prompter/powerPrompterAudio';

type PersistPowerPrompterSettings = (
  settings: PowerPrompterSettings,
  options?: { silent?: boolean; broadcast?: boolean }
) => Promise<boolean>;

export interface UsePowerPrompterAudioControlsOptions {
  settings: PowerPrompterSettings;
  setSettings: (settings: PowerPrompterSettings) => void;
  persistSettings: PersistPowerPrompterSettings;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function usePowerPrompterAudioControls({
  settings,
  setSettings,
  persistSettings,
  showToast,
}: UsePowerPrompterAudioControlsOptions) {
  const completionAudioContextRef = useRef<AudioContext | null>(null);
  const completionSoundEnabledRef = useRef<boolean>(DEFAULT_POWER_PROMPTER_SETTINGS.generationCompleteSoundEnabled);
  const completionSoundStyleRef = useRef<PowerPrompterCompletionSoundStyle>(DEFAULT_POWER_PROMPTER_SETTINGS.generationCompleteSoundStyle);
  const completionSoundVolumeRef = useRef<number>(DEFAULT_POWER_PROMPTER_SETTINGS.generationCompleteSoundVolume);

  const primeCompletionSound = useCallback(async (): Promise<boolean> => {
    const context = getCompletionAudioContext(completionAudioContextRef.current);
    if (!context) return false;
    completionAudioContextRef.current = context;
    if (context.state === 'running') return true;
    try {
      await context.resume();
      return String(context.state) === 'running';
    } catch {
      return false;
    }
  }, []);

  const playCompletionSound = useCallback(() => {
    if (!completionSoundEnabledRef.current) return;
    const context = getCompletionAudioContext(completionAudioContextRef.current);
    if (!context) return;
    completionAudioContextRef.current = context;

    const scheduleCompletionSound = () => {
      const style = completionSoundStyleRef.current || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK;
      const volume = clampCompletionSoundVolume(completionSoundVolumeRef.current);
      if (volume <= 0.001) return;
      const now = context.currentTime;
      const masterGain = context.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.connect(context.destination);

      const scheduleTone = (
        frequency: number,
        start: number,
        duration: number,
        gainPeak: number,
        wave: OscillatorType
      ) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, start);
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(gainPeak, start + Math.min(0.012, duration * 0.4));
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gainNode);
        gainNode.connect(masterGain);
        oscillator.start(start);
        oscillator.stop(start + duration);
      };

      const profile = POWER_PROMPTER_SOUND_PROFILES[style] || POWER_PROMPTER_SOUND_PROFILES[POWER_PROMPTER_SOUND_STYLE_GLASS_TICK];
      for (const tone of profile.tones) {
        scheduleTone(tone.frequency, now + tone.delay, tone.duration, tone.gain, profile.wave);
      }
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(clampAlertLinearGain(profile.peak * volume), now + profile.attack);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.release);
    };

    if (context.state !== 'running') {
      void context.resume().then(() => {
        if (context.state === 'running') scheduleCompletionSound();
      }).catch(() => undefined);
      return;
    }
    scheduleCompletionSound();
  }, []);

  const handleActivePromptTypeProgress = useCallback((_charsAdded: number) => undefined, []);
  const handleChainLinkFeedback = useCallback((_event: 'anchor' | 'toggle' | 'save' | 'clear' | 'done') => undefined, []);

  useEffect(() => {
    completionSoundEnabledRef.current = settings.generationCompleteSoundEnabled !== false;
    completionSoundStyleRef.current = (settings.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK) as PowerPrompterCompletionSoundStyle;
    completionSoundVolumeRef.current = clampCompletionSoundVolume(settings.generationCompleteSoundVolume);
  }, [
    settings.generationCompleteSoundEnabled,
    settings.generationCompleteSoundStyle,
    settings.generationCompleteSoundVolume,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFirstInteraction = () => {
      void primeCompletionSound();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction);
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [primeCompletionSound]);

  useEffect(() => {
    return () => {
      const context = completionAudioContextRef.current;
      completionAudioContextRef.current = null;
      if (!context) return;
      void context.close().catch(() => undefined);
    };
  }, []);

  const handleToggleCompletionSound = useCallback(async () => {
    const enabledNext = settings.generationCompleteSoundEnabled === false;
    const nextSettings: PowerPrompterSettings = {
      ...settings,
      generationCompleteSoundEnabled: enabledNext,
      generationCompleteSoundStyle: settings.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK,
      generationCompleteSoundVolume: clampCompletionSoundVolume(settings.generationCompleteSoundVolume),
      editorMode: 'cards',
    };
    setSettings(nextSettings);
    completionSoundEnabledRef.current = enabledNext;
    completionSoundStyleRef.current = nextSettings.generationCompleteSoundStyle;
    completionSoundVolumeRef.current = nextSettings.generationCompleteSoundVolume;
    if (enabledNext) {
      void primeCompletionSound();
    }
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      showToast('Failed to update generation sound setting', 'error');
    }
  }, [persistSettings, primeCompletionSound, setSettings, settings, showToast]);

  const handleSetCompletionSoundStyle = useCallback(async (style: PowerPrompterCompletionSoundStyle) => {
    const nextStyle = POWER_PROMPTER_SOUND_STYLE_OPTIONS.some((entry) => entry.id === style)
      ? style
      : POWER_PROMPTER_SOUND_STYLE_GLASS_TICK;
    const nextSettings: PowerPrompterSettings = {
      ...settings,
      generationCompleteSoundStyle: nextStyle,
      generationCompleteSoundVolume: clampCompletionSoundVolume(settings.generationCompleteSoundVolume),
      editorMode: 'cards',
    };
    setSettings(nextSettings);
    completionSoundStyleRef.current = nextStyle;
    completionSoundVolumeRef.current = nextSettings.generationCompleteSoundVolume;
    if (nextSettings.generationCompleteSoundEnabled !== false) {
      void primeCompletionSound().then((ready) => {
        if (ready) playCompletionSound();
      });
    }
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      showToast('Failed to update generation sound', 'error');
    }
  }, [persistSettings, playCompletionSound, primeCompletionSound, setSettings, settings, showToast]);

  const handleSetCompletionSoundVolume = useCallback(async (volumeRaw: number) => {
    const nextVolume = clampCompletionSoundVolume(volumeRaw);
    const nextSettings: PowerPrompterSettings = {
      ...settings,
      generationCompleteSoundVolume: nextVolume,
      generationCompleteSoundStyle: settings.generationCompleteSoundStyle || POWER_PROMPTER_SOUND_STYLE_GLASS_TICK,
      editorMode: 'cards',
    };
    setSettings(nextSettings);
    completionSoundVolumeRef.current = nextVolume;
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      showToast('Failed to update generation sound volume', 'error');
    }
  }, [persistSettings, setSettings, settings, showToast]);

  return {
    playCompletionSound,
    handleActivePromptTypeProgress,
    handleChainLinkFeedback,
    handleToggleCompletionSound,
    handleSetCompletionSoundStyle,
    handleSetCompletionSoundVolume,
  };
}
