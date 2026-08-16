'use client';

import React from 'react';
import { DEFAULT_POWER_PROMPTER_SETTINGS, normalizePowerPrompterSettings } from '@/lib/powerPrompter';
import {
  isUmbraQueueActivityTerminal,
  useUmbraQueueActivities,
  type UmbraQueueActivity,
} from '@/lib/umbraQueueActivity';
import {
  configurePowerPrompterNotificationAudio,
  playPowerPrompterNotificationSound,
  primePowerPrompterNotificationAudio,
} from '@/components/power-prompter/powerPrompterAudio';

const POWER_PROMPTER_SETTINGS_SYNC_CHANNEL = 'umbra-powerprompter-settings-sync';
const NEW_TERMINAL_ACTIVITY_SOUND_WINDOW_MS = 5000;

export interface UmbraQueueNotificationTransitions {
  submitted: boolean;
  completed: boolean;
}

export function resolveUmbraQueueNotificationTransitions(
  previousStatuses: ReadonlyMap<string, UmbraQueueActivity['status']>,
  activities: UmbraQueueActivity[],
  now = Date.now(),
): UmbraQueueNotificationTransitions {
  let submitted = false;
  let completed = false;
  for (const activity of activities) {
    const previousStatus = previousStatuses.get(activity.id);
    const completedNow = activity.status === 'completed' || activity.status === 'partial';
    if (!previousStatus) {
      if (completedNow) {
        if (now - activity.updatedAt <= NEW_TERMINAL_ACTIVITY_SOUND_WINDOW_MS) completed = true;
      } else if (!isUmbraQueueActivityTerminal(activity.status)) {
        submitted = true;
      }
      continue;
    }
    if (!isUmbraQueueActivityTerminal(previousStatus) && completedNow) completed = true;
  }
  return { submitted, completed };
}

export function useUmbraQueueNotificationAudio(
  controllerActivities: UmbraQueueActivity[],
) {
  const workspaceActivities = useUmbraQueueActivities();
  const [settingsReady, setSettingsReady] = React.useState(false);
  const previousStatusesRef = React.useRef(new Map<string, UmbraQueueActivity['status']>());
  const lifecycleReadyRef = React.useRef(false);
  const activities = React.useMemo(() => {
    const byId = new Map<string, UmbraQueueActivity>();
    for (const activity of [...controllerActivities, ...workspaceActivities]) {
      byId.set(activity.id, activity);
    }
    return Array.from(byId.values());
  }, [controllerActivities, workspaceActivities]);

  React.useEffect(() => {
    let disposed = false;
    let channel: BroadcastChannel | null = null;
    const applySettings = (value: unknown) => {
      const normalized = normalizePowerPrompterSettings(value);
      configurePowerPrompterNotificationAudio(normalized);
    };

    void fetch('/api/powerprompter/settings', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return DEFAULT_POWER_PROMPTER_SETTINGS;
        return response.json();
      })
      .then((value) => {
        if (!disposed) applySettings(value);
      })
      .catch(() => {
        if (!disposed) applySettings(DEFAULT_POWER_PROMPTER_SETTINGS);
      })
      .finally(() => {
        if (!disposed) setSettingsReady(true);
      });

    try {
      channel = new BroadcastChannel(POWER_PROMPTER_SETTINGS_SYNC_CHANNEL);
      channel.onmessage = (event) => {
        if (disposed) return;
        const value = event.data && typeof event.data === 'object'
          ? (event.data as { settings?: unknown }).settings
          : null;
        if (value) applySettings(value);
      };
    } catch {
      channel = null;
    }

    return () => {
      disposed = true;
      channel?.close();
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const primeOnInteraction = () => {
      void primePowerPrompterNotificationAudio();
      window.removeEventListener('pointerdown', primeOnInteraction);
      window.removeEventListener('keydown', primeOnInteraction);
    };
    window.addEventListener('pointerdown', primeOnInteraction, { passive: true });
    window.addEventListener('keydown', primeOnInteraction);
    return () => {
      window.removeEventListener('pointerdown', primeOnInteraction);
      window.removeEventListener('keydown', primeOnInteraction);
    };
  }, []);

  React.useEffect(() => {
    const nextStatuses = new Map<string, UmbraQueueActivity['status']>();
    for (const activity of activities) nextStatuses.set(activity.id, activity.status);

    if (!settingsReady || !lifecycleReadyRef.current) {
      previousStatusesRef.current = nextStatuses;
      if (settingsReady) lifecycleReadyRef.current = true;
      return;
    }

    const { submitted, completed } = resolveUmbraQueueNotificationTransitions(
      previousStatusesRef.current,
      activities,
    );
    previousStatusesRef.current = nextStatuses;

    if (submitted) playPowerPrompterNotificationSound('submitted');
    if (completed) {
      if (submitted) {
        window.setTimeout(() => playPowerPrompterNotificationSound('completed'), 180);
      } else {
        playPowerPrompterNotificationSound('completed');
      }
    }
  }, [activities, settingsReady]);
}
