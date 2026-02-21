import type { HabitState, ContextSnapshot, NudgeRecord, LaundryState } from '../../types';
import {
  calculateMomentum,
  calculateFriction,
  calculateResistance,
} from './MomentumCalculator';
import { predictDepletion, laundryFrictionBoost } from './LaundryPredictor';
import { storage } from '../storage/LocalStorage';

/**
 * HabitStateEngine: central authority for habit state transitions.
 *
 * Responsibilities:
 *   - Recalculate momentum for all habits
 *   - Update friction/resistance from context
 *   - Record completions and maintain streaks
 *   - Manage cooldowns
 *   - Coordinate laundry-specific predictions
 */

export class HabitStateEngine {
  async recalculateAll(context: ContextSnapshot): Promise<HabitState[]> {
    const habitsMap = await storage.getHabits();
    const habits = Object.values(habitsMap);
    const now = context.timestamp;

    const updated: HabitState[] = [];

    for (const habit of habits) {
      const inWindow = this.isInPreferredWindow(habit, context);

      let frictionBase = calculateFriction({
        isInEvent: !!context.calendar.current_event,
        isWeekend: context.time_of_day.isWeekend,
        hourOfDay: context.time_of_day.hour,
        motionState: context.motion.state,
        continuousScreenMinutes: context.screen.continuous_usage_minutes,
        inPreferredWindow: inWindow,
      });

      // Laundry-specific friction overlay
      if (this.isLaundryHabit(habit)) {
        const forecast = predictDepletion(habit as LaundryState, now);
        frictionBase += laundryFrictionBoost(forecast);
        (habit as LaundryState).metadata.predicted_depletion_date =
          now + forecast.days_until_depletion * 24 * 60 * 60 * 1000;
      }

      habit.friction_score = Math.min(1, frictionBase);
      habit.resistance_score = calculateResistance(habit);
      habit.momentum_score = calculateMomentum(habit, now);

      await storage.saveHabit(habit);
      updated.push(habit);
    }

    return updated;
  }

  async recordCompletion(habitId: string): Promise<HabitState | null> {
    const habit = await storage.getHabit(habitId);
    if (!habit) return null;

    const now = Date.now();
    const lastCompletion = habit.last_completion_timestamp;
    const daysSinceLast = lastCompletion
      ? (now - lastCompletion) / (1000 * 60 * 60 * 24)
      : Infinity;

    // Streak logic: if completed within ~36 hours, extend streak; otherwise reset to 1
    if (daysSinceLast <= 1.5) {
      habit.streak_count += 1;
    } else {
      habit.streak_count = 1;
    }

    habit.last_completion_timestamp = now;

    // Update 7-day completion rate (sliding window approximation)
    const decayFactor = 0.85;
    habit.completion_rate_7d = Math.min(1, habit.completion_rate_7d * decayFactor + (1 - decayFactor));

    habit.momentum_score = calculateMomentum(habit, now);

    await storage.saveHabit(habit);
    return habit;
  }

  async recordNudgeOutcome(habitId: string, record: NudgeRecord): Promise<void> {
    const habit = await storage.getHabit(habitId);
    if (!habit) return;

    habit.recent_nudge_outcomes.push(record);
    if (habit.recent_nudge_outcomes.length > 20) {
      habit.recent_nudge_outcomes = habit.recent_nudge_outcomes.slice(-20);
    }

    habit.resistance_score = calculateResistance(habit);
    await storage.saveHabit(habit);
  }

  async setCooldown(habitId: string, minutes: number): Promise<void> {
    const habit = await storage.getHabit(habitId);
    if (!habit) return;

    habit.cooldown_until = Date.now() + minutes * 60 * 1000;
    await storage.saveHabit(habit);
  }

  isCoolingDown(habit: HabitState, now: number = Date.now()): boolean {
    return habit.cooldown_until > now;
  }

  async createDefaultHabits(): Promise<void> {
    const now = Date.now();

    const gym: HabitState = {
      id: 'gym',
      name: 'Gym Workout',
      category: 'fitness',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 6, endHour: 9, dayOfWeek: [1, 2, 3, 4, 5], weight: 0.8 },
        { startHour: 17, endHour: 20, dayOfWeek: [1, 2, 3, 4, 5], weight: 0.6 },
      ],
      resistance_score: 0.3,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: {},
    };

    const laundry: LaundryState = {
      id: 'laundry',
      name: 'Gym Laundry',
      category: 'hygiene',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 19, endHour: 22, dayOfWeek: [0, 3, 6], weight: 0.7 },
      ],
      resistance_score: 0.4,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: {
        total_gym_clothes: 7,
        clean_count: 7,
        dirty_count: 0,
        last_wash_timestamp: null,
        gym_days: [1, 3, 5], // Mon, Wed, Fri
        avg_clothes_per_session: 1,
        depletion_rate: 0.43,
        predicted_depletion_date: null,
      },
    };

    const reading: HabitState = {
      id: 'reading',
      name: 'Reading',
      category: 'learning',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 21, endHour: 23, dayOfWeek: [0, 1, 2, 3, 4, 5, 6], weight: 0.9 },
        { startHour: 7, endHour: 9, dayOfWeek: [0, 6], weight: 0.5 },
      ],
      resistance_score: 0.15,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: {},
    };

    const meditation: HabitState = {
      id: 'meditation',
      name: 'Meditation',
      category: 'health',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 6, endHour: 8, dayOfWeek: [0, 1, 2, 3, 4, 5, 6], weight: 0.9 },
        { startHour: 20, endHour: 22, dayOfWeek: [0, 1, 2, 3, 4, 5, 6], weight: 0.6 },
      ],
      resistance_score: 0.2,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: { target_minutes: 10 },
    };

    const hydration: HabitState = {
      id: 'hydration',
      name: 'Drink Water',
      category: 'health',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 8, endHour: 20, dayOfWeek: [0, 1, 2, 3, 4, 5, 6], weight: 0.5 },
      ],
      resistance_score: 0.05,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: { glasses_target: 8, glasses_today: 0 },
    };

    const walking: HabitState = {
      id: 'walking',
      name: 'Daily Walk',
      category: 'fitness',
      streak_count: 0,
      last_completion_timestamp: null,
      completion_rate_7d: 0,
      preferred_time_windows: [
        { startHour: 12, endHour: 14, dayOfWeek: [1, 2, 3, 4, 5], weight: 0.7 },
        { startHour: 17, endHour: 19, dayOfWeek: [0, 6], weight: 0.8 },
      ],
      resistance_score: 0.1,
      friction_score: 0,
      momentum_score: 0,
      cooldown_until: 0,
      recent_nudge_outcomes: [],
      created_at: now,
      metadata: { step_goal: 8000 },
    };

    await Promise.all([
      storage.saveHabit(gym),
      storage.saveHabit(laundry),
      storage.saveHabit(reading),
      storage.saveHabit(meditation),
      storage.saveHabit(hydration),
      storage.saveHabit(walking),
    ]);
  }

  private isInPreferredWindow(habit: HabitState, context: ContextSnapshot): boolean {
    return habit.preferred_time_windows.some(
      (w) =>
        w.dayOfWeek.includes(context.time_of_day.dayOfWeek) &&
        context.time_of_day.hour >= w.startHour &&
        context.time_of_day.hour < w.endHour,
    );
  }

  private isLaundryHabit(habit: HabitState): habit is LaundryState {
    return habit.id === 'laundry' && 'total_gym_clothes' in (habit.metadata ?? {});
  }
}

export const habitEngine = new HabitStateEngine();
