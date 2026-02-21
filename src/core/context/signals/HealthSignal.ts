import { Platform } from 'react-native';
import { aiLog } from '../../logging/AILogger';

export interface HealthData {
  steps_today: number;
  sleep_hours_last_night: number | null;
  resting_heart_rate: number | null;
  active_minutes_today: number;
  exercise_sessions_today: number;
  last_exercise_type: string | null;
  last_exercise_timestamp: number | null;
  calories_burned_today: number;
}

let HealthConnect: any = null;
let initialized = false;
let cachedData: HealthData = defaultHealth();
let lastFetch = 0;
const FETCH_INTERVAL = 3 * 60 * 1000;

function defaultHealth(): HealthData {
  return {
    steps_today: 0,
    sleep_hours_last_night: null,
    resting_heart_rate: null,
    active_minutes_today: 0,
    exercise_sessions_today: 0,
    last_exercise_type: null,
    last_exercise_timestamp: null,
    calories_burned_today: 0,
  };
}

export async function initHealthConnect(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (initialized) return true;

  try {
    HealthConnect = require('react-native-health-connect');
    const available = await HealthConnect.getSdkStatus();
    if (available !== HealthConnect.SdkAvailabilityStatus?.SDK_AVAILABLE) {
      aiLog('context', 'Health Connect SDK not available');
      return false;
    }

    const granted = await HealthConnect.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    ]);

    initialized = granted.length > 0;
    if (initialized) {
      aiLog('context', `Health Connect initialized (${granted.length} permissions)`);
      await fetchHealthData();
    }
    return initialized;
  } catch (err) {
    aiLog('context', `Health Connect init failed: ${err}`);
    return false;
  }
}

async function fetchHealthData(): Promise<void> {
  if (!HealthConnect || !initialized) return;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday6pm = new Date(startOfDay.getTime() - 6 * 60 * 60 * 1000);

  try {
    // Steps today
    try {
      const steps = await HealthConnect.readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });
      cachedData.steps_today = (steps.records ?? []).reduce(
        (sum: number, r: any) => sum + (r.count ?? 0), 0,
      );
    } catch { /* permission not granted */ }

    // Sleep last night
    try {
      const sleep = await HealthConnect.readRecords('SleepSession', {
        timeRangeFilter: {
          operator: 'between',
          startTime: yesterday6pm.toISOString(),
          endTime: now.toISOString(),
        },
      });
      const totalMs = (sleep.records ?? []).reduce((sum: number, r: any) => {
        const start = new Date(r.startTime).getTime();
        const end = new Date(r.endTime).getTime();
        return sum + (end - start);
      }, 0);
      cachedData.sleep_hours_last_night = totalMs > 0 ? Math.round(totalMs / 3600000 * 10) / 10 : null;
    } catch { /* permission not granted */ }

    // Heart rate
    try {
      const hr = await HealthConnect.readRecords('HeartRate', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });
      const samples = (hr.records ?? []).flatMap((r: any) => r.samples ?? []);
      if (samples.length > 0) {
        const avg = samples.reduce((s: number, sample: any) => s + (sample.beatsPerMinute ?? 0), 0) / samples.length;
        cachedData.resting_heart_rate = Math.round(avg);
      }
    } catch { /* permission not granted */ }

    // Exercise sessions today
    try {
      const exercise = await HealthConnect.readRecords('ExerciseSession', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });
      const sessions = exercise.records ?? [];
      cachedData.exercise_sessions_today = sessions.length;
      if (sessions.length > 0) {
        const last = sessions[sessions.length - 1];
        cachedData.last_exercise_type = last.exerciseType ?? null;
        cachedData.last_exercise_timestamp = last.endTime ? new Date(last.endTime).getTime() : null;
        cachedData.active_minutes_today = sessions.reduce((sum: number, s: any) => {
          const start = new Date(s.startTime).getTime();
          const end = new Date(s.endTime).getTime();
          return sum + Math.round((end - start) / 60000);
        }, 0);
      }
    } catch { /* permission not granted */ }

    // Calories
    try {
      const cal = await HealthConnect.readRecords('ActiveCaloriesBurned', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });
      cachedData.calories_burned_today = Math.round(
        (cal.records ?? []).reduce((sum: number, r: any) => sum + (r.energy?.inKilocalories ?? 0), 0),
      );
    } catch { /* permission not granted */ }

    lastFetch = Date.now();
  } catch (err) {
    aiLog('context', `Health data fetch error: ${err}`);
  }
}

// Simulation support
let simulated: HealthData | null = null;

export function setSimulatedHealth(data: Partial<HealthData>): void {
  simulated = { ...defaultHealth(), ...data };
}

export function clearSimulatedHealth(): void {
  simulated = null;
}

export function getHealthSignal(now: number = Date.now()): HealthData {
  if (simulated) return simulated;

  if (initialized && now - lastFetch >= FETCH_INTERVAL) {
    fetchHealthData().catch(() => {});
  }

  return { ...cachedData };
}
