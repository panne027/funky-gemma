import type { ContextSnapshot, NudgeOutcome } from '../../types';
import { getTimeSignal } from './signals/TimeSignal';
import { getCalendarSignal } from './signals/CalendarSignal';
import { getMotionSignal } from './signals/MotionSignal';
import { getScreenSignal } from './signals/ScreenTimeSignal';
import { getScrollSignal } from './signals/ScrollSignal';
import { getHealthSignal } from './signals/HealthSignal';
import { getConnectivitySignal } from './signals/ConnectivitySignal';
import { getBatterySignal } from './signals/BatterySignal';

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
  const health = getHealthSignal(now);
  const connectivity = getConnectivitySignal();
  const battery = getBatterySignal();

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
    battery,
    health,
    connectivity: {
      is_connected: connectivity.is_connected,
      connection_type: connectivity.connection_type,
    },
  };
}
