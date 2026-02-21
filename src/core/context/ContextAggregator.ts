import type { ContextSnapshot, NudgeOutcome } from '../../types';
import { getTimeSignal } from './signals/TimeSignal';
import { getCalendarSignal } from './signals/CalendarSignal';
import { getMotionSignal } from './signals/MotionSignal';
import { getScreenSignal } from './signals/ScreenTimeSignal';
import { getScrollSignal } from './signals/ScrollSignal';

/**
 * ContextAggregator: collects all local context signals into a unified snapshot.
 *
 * This is the single entry point for "what is happening right now?"
 * Every agent cycle starts by calling getContextSnapshot().
 *
 * All signals are local — no cloud dependency.
 */

let lastNudgeResponse: NudgeOutcome | null = null;
let recentNotificationCount = 0;

export function recordNudgeInteraction(outcome: NudgeOutcome): void {
  lastNudgeResponse = outcome;
  recentNotificationCount++;
}

export function resetNotificationCounters(): void {
  recentNotificationCount = 0;
  lastNudgeResponse = null;
}

export function getContextSnapshot(now: number = Date.now()): ContextSnapshot {
  const time = getTimeSignal(now);
  const calendar = getCalendarSignal(now);
  const motion = getMotionSignal(now);
  const screen = getScreenSignal(now);
  const scroll = getScrollSignal(now);

  return {
    timestamp: now,
    time_of_day: time,
    calendar,
    screen,
    motion,
    scroll,
    notifications: {
      recent_interaction_count: recentNotificationCount,
      last_nudge_response: lastNudgeResponse,
    },
    battery: {
      level: 0.8, // TODO: hook into native battery API
      is_charging: false,
    },
  };
}
