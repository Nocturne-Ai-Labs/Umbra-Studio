'use client';

import React from 'react';
import { isUmbraQueueActivityTerminal, useUmbraQueueActivities, type UmbraQueueActivity } from '@/lib/umbraQueueActivity';
import { playPowerPrompterNotificationSound, type PowerPrompterNotificationSoundKind } from '@/components/power-prompter/powerPrompterAudio';

type AlertSnapshot = Pick<UmbraQueueActivity, 'status' | 'completed' | 'failed'>;

export function resolveUmbraQueueNotificationEvents(
  previous: ReadonlyMap<string, AlertSnapshot>,
  activities: UmbraQueueActivity[],
  now = Date.now(),
): Array<{ kind: PowerPrompterNotificationSoundKind; eventId: string }> {
  const events: Array<{ kind: PowerPrompterNotificationSoundKind; eventId: string }> = [];
  for (const activity of activities) {
    const before = previous.get(activity.id);
    if (!before && (activity.createdAt <= 0 || now - activity.createdAt > 5000 || activity.createdAt > now)) continue;
    if (!before && !isUmbraQueueActivityTerminal(activity.status)) events.push({ kind: 'submitted', eventId: activity.id });
    if (activity.status === 'failed' && before?.status !== 'failed') {
      events.push({ kind: 'failed', eventId: activity.id });
    } else if (activity.status !== 'canceled' && activity.status !== 'interrupted'
      && (activity.completed > (before?.completed ?? 0)
        || (activity.status === 'completed' && before && before.status !== 'completed'))) {
      events.push({ kind: 'completed', eventId: `${activity.id}:${activity.completed}` });
    }
  }
  return events.sort((a, b) => ['failed', 'completed', 'submitted'].indexOf(a.kind) - ['failed', 'completed', 'submitted'].indexOf(b.kind));
}

export function useUmbraQueueNotificationAudio(controllerActivities: UmbraQueueActivity[]) {
  const workspaceActivities = useUmbraQueueActivities();
  const previousRef = React.useRef(new Map<string, AlertSnapshot>());
  const initializedRef = React.useRef(false);
  const activities = React.useMemo(() => {
    const byId = new Map<string, UmbraQueueActivity>();
    for (const activity of [...controllerActivities, ...workspaceActivities]) byId.set(activity.id, activity);
    return Array.from(byId.values());
  }, [controllerActivities, workspaceActivities]);

  React.useEffect(() => {
    const events = initializedRef.current
      ? resolveUmbraQueueNotificationEvents(previousRef.current, activities) : [];
    initializedRef.current = true;
    for (const activity of activities) previousRef.current.set(activity.id, {
      status: activity.status, completed: activity.completed, failed: activity.failed,
    });
    while (previousRef.current.size > 5000) previousRef.current.delete(previousRef.current.keys().next().value!);
    for (const event of events) playPowerPrompterNotificationSound(event.kind, { eventId: event.eventId });
  }, [activities]);
}
