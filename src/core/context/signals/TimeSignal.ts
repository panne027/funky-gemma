export interface TimeData {
  hour: number;
  minute: number;
  dayOfWeek: number;
  isWeekend: boolean;
}

let simOverride: { hour: number; minute: number; dayOfWeek: number } | null = null;

/**
 * Override the clock for simulation. Pass null to revert to real time.
 */
export function setSimulatedTime(
  hour: number | null,
  minute?: number,
  dayOfWeek?: number,
): void {
  if (hour === null) {
    simOverride = null;
    return;
  }
  simOverride = {
    hour,
    minute: minute ?? 0,
    dayOfWeek: dayOfWeek ?? new Date().getDay(),
  };
}

export function getSimulatedHour(): number | null {
  return simOverride?.hour ?? null;
}

export function getTimeSignal(now: number = Date.now()): TimeData {
  if (simOverride) {
    const dow = simOverride.dayOfWeek;
    return {
      hour: simOverride.hour,
      minute: simOverride.minute,
      dayOfWeek: dow,
      isWeekend: dow === 0 || dow === 6,
    };
  }

  const d = new Date(now);
  const dayOfWeek = d.getDay();

  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}
