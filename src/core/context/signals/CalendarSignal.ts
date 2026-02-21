import { Platform } from 'react-native';

export interface CalendarData {
  current_event: string | null;
  next_event: string | null;
  next_event_in_minutes: number | null;
  free_block_minutes: number;
  just_ended_event: string | null;
}

interface CalendarEvent {
  title: string;
  startTime: number;
  endTime: number;
}

let RNCalendarEvents: any = null;
try {
  if (Platform.OS !== 'web') {
    RNCalendarEvents = require('react-native-calendar-events').default;
  }
} catch {
  // Not available — will use simulation
}

let simulatedEvents: CalendarEvent[] = [];
let lastEndedEvent: CalendarEvent | null = null;

let cachedRealEvents: CalendarEvent[] = [];
let lastRealFetch = 0;
const REAL_FETCH_INTERVAL = 5 * 60 * 1000; // re-read calendar every 5 min

export function setSimulatedCalendar(events: CalendarEvent[]): void {
  simulatedEvents = events;
}

export function simulateEventEnd(event: CalendarEvent): void {
  lastEndedEvent = event;
  setTimeout(() => {
    if (lastEndedEvent === event) lastEndedEvent = null;
  }, 5 * 60 * 1000);
}

/**
 * Attempt to read real device calendar.
 * Returns cached events if recently fetched, or fetches fresh.
 */
async function fetchRealCalendarEvents(now: number): Promise<CalendarEvent[]> {
  if (!RNCalendarEvents) return [];
  if (now - lastRealFetch < REAL_FETCH_INTERVAL && cachedRealEvents.length > 0) {
    return cachedRealEvents;
  }

  try {
    const authStatus = await RNCalendarEvents.checkPermissions();
    if (authStatus !== 'authorized') {
      const result = await RNCalendarEvents.requestPermissions();
      if (result !== 'authorized') return [];
    }

    const startDate = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const endDate = new Date(now + 8 * 60 * 60 * 1000).toISOString();   // 8h ahead
    const events = await RNCalendarEvents.fetchAllEvents(startDate, endDate);

    cachedRealEvents = (events || []).map((e: any) => ({
      title: e.title || 'Event',
      startTime: new Date(e.startDate).getTime(),
      endTime: new Date(e.endDate).getTime(),
    }));
    lastRealFetch = now;
    return cachedRealEvents;
  } catch {
    return [];
  }
}

/**
 * Refresh the real calendar cache.
 * Call this periodically or after significant time passes.
 */
export async function refreshCalendar(): Promise<void> {
  lastRealFetch = 0;
  await fetchRealCalendarEvents(Date.now());
}

/**
 * Synchronous version using last-known real events + simulated events.
 * The async refresh happens in the background.
 */
export function getCalendarSignal(now: number = Date.now()): CalendarData {
  // Kick off async refresh if stale (non-blocking)
  if (RNCalendarEvents && now - lastRealFetch >= REAL_FETCH_INTERVAL) {
    fetchRealCalendarEvents(now).catch(() => {});
  }

  const allEvents = [...cachedRealEvents, ...simulatedEvents];

  const currentEvent = allEvents.find(
    (e) => e.startTime <= now && e.endTime > now,
  );

  // Detect events that ended in the last 5 minutes
  const recentlyEnded = allEvents
    .filter((e) => e.endTime <= now && e.endTime > now - 5 * 60 * 1000)
    .sort((a, b) => b.endTime - a.endTime);
  const justEnded = lastEndedEvent ?? recentlyEnded[0] ?? null;

  const futureEvents = allEvents
    .filter((e) => e.startTime > now)
    .sort((a, b) => a.startTime - b.startTime);

  const nextEvent = futureEvents[0] ?? null;
  const nextEventInMinutes = nextEvent
    ? Math.round((nextEvent.startTime - now) / (60 * 1000))
    : null;

  const freeBlockMinutes = nextEventInMinutes
    ? Math.min(nextEventInMinutes, 240)
    : 240;

  return {
    current_event: currentEvent?.title ?? null,
    next_event: nextEvent?.title ?? null,
    next_event_in_minutes: nextEventInMinutes,
    free_block_minutes: freeBlockMinutes,
    just_ended_event: justEnded?.title ?? null,
  };
}
