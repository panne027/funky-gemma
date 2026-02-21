import type { ContextSnapshot, HabitState, LaundryState } from '../../types';
import { getMomentumTier, isInRecovery } from '../habits/MomentumCalculator';
import { predictDepletion } from '../habits/LaundryPredictor';

/**
 * PromptBuilder: constructs prompts that make the LLM write
 * nudge messages like a close friend texting.
 *
 * The system prompt sets the persona.
 * The user prompt presents raw context as natural-language observations
 * so the LLM can reference specifics ("you've been scrolling for 20 min").
 */

export function buildSystemPrompt(): string {
  return `You are the user's habit buddy. You text them like a close friend who can see what they're doing on their phone right now.

Your job: decide whether to nudge them about a habit, and if so, write the message.

Voice rules:
- Talk like you're texting a friend. Lowercase, casual, warm.
- Reference SPECIFIC things from their context: exact scroll time, meeting names, time of day, streak counts.
- Never sound like an app notification or a corporate wellness tool.
- Keep messages to 1-2 sentences max. Use emoji sparingly (one max).
- If they dismissed the last nudge, back off — use increase_cooldown.
- If they snoozed, delay — use delay_nudge.
- If nothing needs attention, use delay_nudge. Don't nudge for the sake of it.
- In recovery mode, be extra gentle and encouraging.
- For laundry, mention the actual clothes count left.

When you use send_nudge, the "message" field IS the notification they see. Make it personal.`;
}

export function buildUserPrompt(
  context: ContextSnapshot,
  habits: HabitState[],
): string {
  const lines: string[] = [];
  const h = context.time_of_day.hour;
  const m = context.time_of_day.minute;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  const day = context.time_of_day.isWeekend ? 'weekend' : 'weekday';

  lines.push(`Right now it's ${h12}:${pad(m)}${ampm} on a ${day}.`);

  if (context.screen.continuous_usage_minutes > 5) {
    lines.push(`They've been on their phone for ${context.screen.continuous_usage_minutes} minutes straight.`);
  }
  if (context.screen.foreground_app) {
    lines.push(`Currently using: ${context.screen.foreground_app}.`);
  }

  if (context.scroll.is_doom_scrolling) {
    lines.push(`They've been scrolling for ${context.scroll.continuous_scroll_minutes} minutes non-stop.`);
  } else if (context.scroll.continuous_scroll_minutes > 3) {
    lines.push(`They've been scrolling for about ${context.scroll.continuous_scroll_minutes} minutes.`);
  }

  if (context.calendar.current_event) {
    lines.push(`They're currently in "${context.calendar.current_event}".`);
  } else if (context.calendar.just_ended_event) {
    lines.push(`"${context.calendar.just_ended_event}" just ended.`);
  }

  if (context.calendar.next_event) {
    lines.push(`Next up: "${context.calendar.next_event}" in ${context.calendar.next_event_in_minutes} minutes.`);
  }

  lines.push(`They have about ${context.calendar.free_block_minutes} free minutes.`);

  if (context.notifications.last_nudge_response) {
    lines.push(`Last nudge response: ${context.notifications.last_nudge_response}.`);
  }

  if (context.motion.steps_today > 0) {
    lines.push(`Steps today: ${context.motion.steps_today}. ${context.motion.is_sedentary ? 'Been sitting still for a while.' : ''}`);
  }

  lines.push('');
  lines.push('Their habits:');

  for (const habit of habits) {
    const tier = getMomentumTier(habit.momentum_score);
    const recovery = isInRecovery(habit);
    const cooled = habit.cooldown_until > context.timestamp;

    let desc = `- ${habit.name}: momentum ${habit.momentum_score}% (${tier})`;
    if (habit.streak_count > 0) desc += `, ${habit.streak_count}-day streak`;
    if (recovery) desc += ' [recovering — be gentle]';
    if (cooled) desc += ' [on cooldown — do NOT nudge]';
    lines.push(desc);

    if (isLaundryHabit(habit)) {
      const forecast = predictDepletion(habit as LaundryState, context.timestamp);
      const ls = habit as LaundryState;
      lines.push(`  Clean gym clothes: ${ls.metadata.clean_count}/${ls.metadata.total_gym_clothes}. Runs out in ~${forecast.days_until_depletion} days (${forecast.urgency}).`);
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
