import type { ContextSnapshot, HabitState, LaundryState } from '../../types';
import { getMomentumTier, isInRecovery } from '../habits/MomentumCalculator';
import { predictDepletion } from '../habits/LaundryPredictor';

/**
 * PromptBuilder: constructs concise prompts for FunctionGemma (270M).
 *
 * Tool schemas are NOT included here — the Cactus SDK injects them
 * via the model's chat template when tools are passed to complete().
 * Keep prompts short: 270M models have limited context capacity.
 */

export function buildSystemPrompt(): string {
  return `You are an adaptive habit agent. Decide the single best action based on context.

Rules:
- Respect cooldowns. Don't nudge if cooldown is active.
- If user dismissed last nudge, use increase_cooldown.
- If doom-scrolling during a habit window, nudge playfully.
- If no action needed, use delay_nudge.
- For laundry, factor in clothes depletion urgency.
- Be gentle in recovery mode.`;
}

export function buildUserPrompt(
  context: ContextSnapshot,
  habits: HabitState[],
): string {
  const lines: string[] = [];

  const h = context.time_of_day.hour;
  const m = pad(context.time_of_day.minute);
  const day = context.time_of_day.isWeekend ? 'weekend' : 'weekday';
  lines.push(`Time: ${h}:${m} (${day})`);

  if (context.calendar.just_ended_event) {
    lines.push(`Event just ended: "${context.calendar.just_ended_event}"`);
  }
  lines.push(`Free: ${context.calendar.free_block_minutes} min`);

  if (context.scroll.is_doom_scrolling) {
    lines.push(`DOOM SCROLLING: ${context.scroll.continuous_scroll_minutes} min`);
  }
  if (context.notifications.last_nudge_response) {
    lines.push(`Last nudge: ${context.notifications.last_nudge_response}`);
  }

  for (const habit of habits) {
    const tier = getMomentumTier(habit.momentum_score);
    const recovery = isInRecovery(habit);
    const cooled = habit.cooldown_until > context.timestamp;

    lines.push(`${habit.name}: momentum=${habit.momentum_score} [${tier}] streak=${habit.streak_count}${recovery ? ' RECOVERY' : ''}${cooled ? ' COOLDOWN' : ''}`);

    if (isLaundryHabit(habit)) {
      const forecast = predictDepletion(habit as LaundryState, context.timestamp);
      lines.push(`  clothes: ${(habit as LaundryState).metadata.clean_count}/${(habit as LaundryState).metadata.total_gym_clothes}, depletion: ${forecast.days_until_depletion}d [${forecast.urgency}]`);
    }
  }

  return lines.join('\n');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function isLaundryHabit(habit: HabitState): boolean {
  return habit.id === 'laundry' && 'total_gym_clothes' in (habit.metadata ?? {});
}
