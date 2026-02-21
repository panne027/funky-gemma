/**
 * CalendarSignal: reads device calendar for free/busy blocks.
 *
 * On real device, uses react-native-calendars or native module.
 * Provides abstraction for both real and simulated events.
 */

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

let simulatedEvents: CalendarEvent[] = [];
let lastEndedEvent: CalendarEvent | null = null;

export function setSimulatedCalendar(events: CalendarEvent[]): void {
  simulatedEvents = events;
}

export function simulateEventEnd(event: CalendarEvent): void {
  lastEndedEvent = event;
  setTimeout(() => {
    if (lastEndedEvent === event) lastEndedEvent = null;
  }, 5 * 60 * 1000); // clear after 5 min
}

export function getCalendarSignal(now: number = Date.now()): CalendarData {
  const currentEvent = simulatedEvents.find(
    (e) => e.startTime <= now && e.endTime > now,
  );

  const futureEvents = simulatedEvents
    .filter((e) => e.startTime > now)
    .sort((a, b) => a.startTime - b.startTime);

  const nextEvent = futureEvents[0] ?? null;
  const nextEventInMinutes = nextEvent
    ? Math.round((nextEvent.startTime - now) / (60 * 1000))
    : null;

  // Free block = time until next event, capped at 4 hours
  const freeBlockMinutes = nextEventInMinutes
    ? Math.min(nextEventInMinutes, 240)
    : 240;

  return {
    current_event: currentEvent?.title ?? null,
    next_event: nextEvent?.title ?? null,
    next_event_in_minutes: nextEventInMinutes,
    free_block_minutes: freeBlockMinutes,
    just_ended_event: lastEndedEvent?.title ?? null,
  };
}
