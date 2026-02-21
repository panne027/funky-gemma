import type { HabitState } from '../../types';

/**
 * Deterministic momentum scoring engine.
 *
 * momentum_score = weighted(streak, recency, success_rate, friction, resistance)
 *
 * Formula:
 *   raw = (W_STREAK * streakFactor)
 *       + (W_RECENCY * recencyFactor)
 *       + (W_SUCCESS * completion_rate_7d)
 *       - (W_FRICTION * friction_score)
 *       - (W_RESISTANCE * resistance_score)
 *
 *   momentum_score = clamp(raw * 100, 0, 100)
 */

const W_STREAK = 0.25;
const W_RECENCY = 0.30;
const W_SUCCESS = 0.25;
const W_FRICTION = 0.10;
const W_RESISTANCE = 0.10;

const STREAK_SATURATION = 14; // streaks beyond 14 days don't add more
const RECENCY_HALF_LIFE_HOURS = 36; // score halves every 36 hours since last completion

function streakFactor(streak: number): number {
  return Math.min(streak / STREAK_SATURATION, 1.0);
}

function recencyFactor(lastCompletionTimestamp: number | null, now: number): number {
  if (!lastCompletionTimestamp) return 0;
  const hoursSince = (now - lastCompletionTimestamp) / (1000 * 60 * 60);
  if (hoursSince < 0) return 1;
  return Math.pow(0.5, hoursSince / RECENCY_HALF_LIFE_HOURS);
}

export function calculateMomentum(habit: HabitState, now: number = Date.now()): number {
  const streak = streakFactor(habit.streak_count);
  const recency = recencyFactor(habit.last_completion_timestamp, now);
  const success = habit.completion_rate_7d;
  const friction = habit.friction_score;
  const resistance = habit.resistance_score;

  const raw =
    W_STREAK * streak +
    W_RECENCY * recency +
    W_SUCCESS * success -
    W_FRICTION * friction -
    W_RESISTANCE * resistance;

  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}

/**
 * Classify momentum into human-readable tiers.
 */
export type MomentumTier = 'critical' | 'low' | 'building' | 'steady' | 'peak';

export function getMomentumTier(score: number): MomentumTier {
  if (score < 15) return 'critical';
  if (score < 35) return 'low';
  if (score < 55) return 'building';
  if (score < 80) return 'steady';
  return 'peak';
}

/**
 * Determine if a habit is in recovery mode (momentum crashed, needs gentle handling).
 */
export function isInRecovery(habit: HabitState): boolean {
  return habit.momentum_score < 20 && habit.streak_count === 0;
}

/**
 * Predict days until momentum drops below a threshold, given no completions.
 */
export function predictMomentumDecay(
  habit: HabitState,
  targetScore: number,
  now: number = Date.now(),
): number | null {
  if (habit.momentum_score <= targetScore) return 0;

  for (let hours = 1; hours <= 168; hours++) {
    const futureTime = now + hours * 60 * 60 * 1000;
    const futureHabit: HabitState = {
      ...habit,
      streak_count: 0, // assume streak breaks
    };
    const projected = calculateMomentum(futureHabit, futureTime);
    if (projected <= targetScore) {
      return Math.ceil(hours / 24);
    }
  }

  return null; // won't drop in 7 days
}

/**
 * Calculate dynamic friction score based on context.
 * High friction = bad time to nudge (busy, driving, sleeping).
 */
export function calculateFriction(params: {
  isInEvent: boolean;
  isWeekend: boolean;
  hourOfDay: number;
  motionState: string;
  continuousScreenMinutes: number;
  inPreferredWindow: boolean;
}): number {
  let friction = 0;

  if (params.isInEvent) friction += 0.4;
  if (params.motionState === 'driving') friction += 0.5;

  // Late night / early morning penalty
  if (params.hourOfDay < 6 || params.hourOfDay > 23) friction += 0.6;
  else if (params.hourOfDay < 7 || params.hourOfDay > 22) friction += 0.3;

  // High screen time = might be working, slight friction
  if (params.continuousScreenMinutes > 30) friction += 0.15;

  // Preferred window bonus (reduces friction)
  if (params.inPreferredWindow) friction -= 0.25;

  // Weekend slight reduction
  if (params.isWeekend) friction -= 0.1;

  return Math.max(0, Math.min(1, friction));
}

/**
 * Update resistance score based on recent nudge outcomes.
 * More dismissals/ignores = higher resistance.
 */
export function calculateResistance(habit: HabitState): number {
  const recent = habit.recent_nudge_outcomes.slice(-10);
  if (recent.length === 0) return 0.2; // neutral default

  let negativeCount = 0;
  let positiveCount = 0;
  let totalWeight = 0;

  recent.forEach((nudge, i) => {
    const recencyWeight = (i + 1) / recent.length; // more recent = more weight
    totalWeight += recencyWeight;

    if (nudge.outcome === 'completed') positiveCount += recencyWeight;
    else if (nudge.outcome === 'dismissed' || nudge.outcome === 'ignored')
      negativeCount += recencyWeight;
    // snoozed is neutral
  });

  if (totalWeight === 0) return 0.2;

  const ratio = negativeCount / totalWeight;
  return Math.max(0, Math.min(1, ratio));
}
