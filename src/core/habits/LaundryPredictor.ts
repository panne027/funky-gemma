import type { LaundryState } from '../../types';

/**
 * Predictive depletion algorithm for laundry / gym clothes inventory.
 *
 * Tracks:
 *   - total_gym_clothes: total items in rotation
 *   - clean_count / dirty_count: current inventory split
 *   - gym_days: which days the user exercises
 *   - avg_clothes_per_session: average items consumed per gym visit
 *
 * Predicts:
 *   - When clean clothes will run out
 *   - When user should wash to avoid friction spike
 *   - Optimal wash day to prevent last-minute panic
 */

interface DepletionForecast {
  days_until_depletion: number;
  recommended_wash_by: number; // unix timestamp
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  clean_after_next_gym: number;
  gym_sessions_until_empty: number;
}

export function predictDepletion(
  state: LaundryState,
  now: number = Date.now(),
): DepletionForecast {
  const meta = state.metadata;
  const currentDay = new Date(now).getDay();

  const upcomingGymDays = getUpcomingGymDays(meta.gym_days, currentDay, 14);
  const sessionsUntilEmpty = Math.floor(meta.clean_count / meta.avg_clothes_per_session);

  let cleanRemaining = meta.clean_count;
  let daysUntilDepletion = 0;

  for (const daysAhead of upcomingGymDays) {
    cleanRemaining -= meta.avg_clothes_per_session;
    if (cleanRemaining <= 0) {
      daysUntilDepletion = daysAhead;
      break;
    }
  }

  if (cleanRemaining > 0) {
    daysUntilDepletion = 14; // more than 2 weeks out
  }

  const cleanAfterNextGym = Math.max(
    0,
    meta.clean_count - meta.avg_clothes_per_session,
  );

  // Recommend washing 1 day before depletion, or 2 days if depletion is > 3 days out
  const washBuffer = daysUntilDepletion > 3 ? 2 : 1;
  const recommendedWashDay = Math.max(0, daysUntilDepletion - washBuffer);
  const recommendedWashBy = now + recommendedWashDay * 24 * 60 * 60 * 1000;

  const urgency = categorizeUrgency(daysUntilDepletion);

  return {
    days_until_depletion: daysUntilDepletion,
    recommended_wash_by: recommendedWashBy,
    urgency,
    clean_after_next_gym: cleanAfterNextGym,
    gym_sessions_until_empty: sessionsUntilEmpty,
  };
}

function getUpcomingGymDays(
  gymDays: number[],
  currentDayOfWeek: number,
  lookAheadDays: number,
): number[] {
  const result: number[] = [];
  for (let d = 1; d <= lookAheadDays; d++) {
    const dayOfWeek = (currentDayOfWeek + d) % 7;
    if (gymDays.includes(dayOfWeek)) {
      result.push(d);
    }
  }
  return result;
}

function categorizeUrgency(
  daysUntilDepletion: number,
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (daysUntilDepletion <= 0) return 'critical';
  if (daysUntilDepletion <= 1) return 'high';
  if (daysUntilDepletion <= 3) return 'medium';
  if (daysUntilDepletion <= 5) return 'low';
  return 'none';
}

/**
 * After a gym session, consume clothes from inventory.
 */
export function consumeGymClothes(state: LaundryState): LaundryState {
  const newClean = Math.max(0, state.metadata.clean_count - state.metadata.avg_clothes_per_session);
  const consumed = state.metadata.clean_count - newClean;

  return {
    ...state,
    metadata: {
      ...state.metadata,
      clean_count: newClean,
      dirty_count: state.metadata.dirty_count + consumed,
    },
  };
}

/**
 * After washing, move dirty clothes back to clean.
 */
export function washClothes(state: LaundryState): LaundryState {
  return {
    ...state,
    metadata: {
      ...state.metadata,
      clean_count: state.metadata.clean_count + state.metadata.dirty_count,
      dirty_count: 0,
      last_wash_timestamp: Date.now(),
    },
    last_completion_timestamp: Date.now(),
  };
}

/**
 * Integrate depletion forecast into friction score.
 * Approaching depletion = higher friction for skipping laundry.
 */
export function laundryFrictionBoost(forecast: ReturnType<typeof predictDepletion>): number {
  switch (forecast.urgency) {
    case 'critical': return 0.5;
    case 'high': return 0.3;
    case 'medium': return 0.15;
    case 'low': return 0.05;
    default: return 0;
  }
}
