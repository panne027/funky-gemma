export interface TimeData {
  hour: number;
  minute: number;
  dayOfWeek: number;
  isWeekend: boolean;
}

export function getTimeSignal(now: number = Date.now()): TimeData {
  const d = new Date(now);
  const dayOfWeek = d.getDay();

  return {
    hour: d.getHours(),
    minute: d.getMinutes(),
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}
