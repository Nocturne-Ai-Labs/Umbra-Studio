import { useCallback, useEffect } from 'react';
import type {
  PowerPrompterCompletionSoundStyle,
  PowerPrompterSettings,
} from '@/types/powerPrompter';
import {
  POWER_PROMPTER_SOUND_STYLE_GLASS_TICK,
  POWER_PROMPTER_SOUND_STYLE_OPTIONS,
  clampCompletionSoundVolume,
  configurePowerPrompterNotificationAudio,
  playPowerPrompterNotificationSound,
  primePowerPrompterNotificationAudio,
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
  const primeCompletionSound = useCallback(async (): Promise<boolean> => {
    return primePowerPrompterNotificationAudio();
  }, []);

  const playCompletionSound = useCallback(() => {
    playPowerPrompterNotificationSound('completed');
  }, []);

  const playSubmissionSound = useCallback(() => {
    playPowerPrompterNotificationSound('submitted');
  }, []);

  const handleActivePromptTypeProgress = useCallback((_charsAdded: number) => undefined, []);
  const handleChainLinkFeedback = useCallback((_event: 'anchor' | 'toggle' | 'save' | 'clear' | 'done') => undefined, []);

  useEffect(() => {
    configurePowerPrompterNotificationAudio(settings);
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
    configurePowerPrompterNotificationAudio(nextSettings);
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
    configurePowerPrompterNotificationAudio(nextSettings);
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
    configurePowerPrompterNotificationAudio(nextSettings);
    const persisted = await persistSettings(nextSettings, { silent: true });
    if (!persisted) {
      showToast('Failed to update generation sound volume', 'error');
    }
  }, [persistSettings, setSettings, settings, showToast]);

  return {
    playCompletionSound,
    playSubmissionSound,
    handleActivePromptTypeProgress,
    handleChainLinkFeedback,
    handleToggleCompletionSound,
    handleSetCompletionSoundStyle,
    handleSetCompletionSoundVolume,
  };
}
