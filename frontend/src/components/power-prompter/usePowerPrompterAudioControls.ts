import { useCallback } from 'react';
import { playPowerPrompterNotificationSound } from './powerPrompterAudio';

export function usePowerPrompterAudioControls() {
  const playCompletionSound = useCallback((eventId?: string) => {
    playPowerPrompterNotificationSound('completed', { eventId });
  }, []);
  const playSubmissionSound = useCallback((eventId?: string) => {
    playPowerPrompterNotificationSound('submitted', { eventId });
  }, []);
  const handleActivePromptTypeProgress = useCallback((_charsAdded: number) => undefined, []);
  const handleChainLinkFeedback = useCallback((_event: 'anchor' | 'toggle' | 'save' | 'clear' | 'done') => undefined, []);
  return { playCompletionSound, playSubmissionSound, handleActivePromptTypeProgress, handleChainLinkFeedback };
}
