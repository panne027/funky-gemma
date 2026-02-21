import type { ContextSnapshot, HabitState, LaundryState } from '../../types';
import { getMomentumTier, isInRecovery } from '../habits/MomentumCalculator';
import { predictDepletion } from '../habits/LaundryPredictor';
import { googleAuth } from '../auth/GoogleAuthService';

export function buildSystemPrompt(): string {
  const googleConnected = googleAuth.isSignedIn;
  const googleName = googleAuth.currentUser?.name ?? null;

  const googleSection = googleConnected
    ? `
Google account connected (${googleName ?? 'signed in'}):
- You can create events on their REAL Google Calendar using create_google_calendar_event.
- You can fetch their upcoming events using fetch_google_calendar.
- You can add items to their Google Tasks shopping list using add_shopping_item (for habit-related supplies).
- You can read their shopping list using get_shopping_list.
- Prefer create_google_calendar_event over create_calendar_block when Google is connected.
- Suggest adding habit-related supplies to their shopping list (e.g. "you're running low on protein — want me to add it to your shopping list?").`
    : `
Google account NOT connected:
- You cannot use fetch_google_calendar, create_google_calendar_event, add_shopping_item, or get_shopping_list.
- Fall back to create_calendar_block for device-local calendar blocks.
- Suggest the user signs in with Google for a better experience.`;

  return `You are the user's habit buddy. You text them like a close friend who has access to their phone, calendar, health data, and habit history.

Your job: decide the BEST action right now. You have 16 tools — use the most impactful one.

Voice rules:
- Talk like you're texting a friend. Lowercase, casual, warm.
- Reference SPECIFIC things from their context: exact scroll time, meeting names, step count, sleep hours, streak counts.
- Never sound like an app notification or a corporate wellness tool.
- Keep messages to 1-2 sentences max. Use emoji sparingly (one max).

Decision rules:
- If they dismissed the last nudge, back off — use increase_cooldown.
- If they snoozed, delay — use delay_nudge.
- If nothing needs attention, use delay_nudge. Don't nudge for the sake of it.
- If they have a milestone (7-day streak, first completion, peak momentum), use celebrate_milestone.
- If they just finished a workout (detected via health data), use log_health_activity and consider suggesting a habit stack.
- If they have a big free block, schedule it on their calendar.
- If they're struggling, use adjust_difficulty to make it easier.
- If they slept poorly, be extra gentle.
- For complex situations, use analyze_pattern first to inform your decision.
- Use schedule_reminder when the timing isn't right but you want to follow up.
- Use set_smart_alarm for morning habits or next-day planning.
- When suggesting supplies or equipment for habits, use add_shopping_item.
${googleSection}

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

  // Screen + scroll context
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

  // Calendar context
  if (context.calendar.current_event) {
    lines.push(`They're currently in "${context.calendar.current_event}".`);
  } else if (context.calendar.just_ended_event) {
    lines.push(`"${context.calendar.just_ended_event}" just ended.`);
  }
  if (context.calendar.next_event) {
    lines.push(`Next up: "${context.calendar.next_event}" in ${context.calendar.next_event_in_minutes} minutes.`);
  }
  lines.push(`They have about ${context.calendar.free_block_minutes} free minutes.`);

  // Health Connect data
  const hd = context.health;
  if (hd.steps_today > 0) {
    lines.push(`Steps today: ${hd.steps_today.toLocaleString()}.`);
  }
  if (hd.sleep_hours_last_night !== null) {
    const quality = hd.sleep_hours_last_night < 6 ? ' (poor sleep)' : hd.sleep_hours_last_night >= 8 ? ' (well rested)' : '';
    lines.push(`Sleep last night: ${hd.sleep_hours_last_night}h${quality}.`);
  }
  if (hd.resting_heart_rate !== null) {
    lines.push(`Resting heart rate: ${hd.resting_heart_rate} bpm.`);
  }
  if (hd.active_minutes_today > 0) {
    lines.push(`Active minutes today: ${hd.active_minutes_today}.`);
  }
  if (hd.exercise_sessions_today > 0) {
    lines.push(`Exercise sessions today: ${hd.exercise_sessions_today} (last: ${hd.last_exercise_type ?? 'unknown'}).`);
  }
  if (hd.calories_burned_today > 0) {
    lines.push(`Calories burned today: ${hd.calories_burned_today}.`);
  }

  // Motion
  if (context.motion.state === 'still' && context.motion.duration_minutes > 30) {
    lines.push(`They've been sitting still for ${context.motion.duration_minutes} minutes.`);
  } else if (context.motion.state === 'walking') {
    lines.push(`They're walking right now (${context.motion.duration_minutes} min).`);
  }

  // Notifications
  if (context.notifications.last_nudge_response) {
    lines.push(`Last nudge response: ${context.notifications.last_nudge_response}.`);
  }

  // Battery + connectivity
  if (context.battery.level < 0.2) {
    lines.push(`Battery low: ${Math.round(context.battery.level * 100)}%.`);
  }

  // Google account status
  if (googleAuth.isSignedIn) {
    lines.push(`Google account connected (${googleAuth.currentUser?.name ?? googleAuth.currentUser?.email ?? 'signed in'}).`);
  } else {
    lines.push('Google account NOT connected.');
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

    // Milestone detection
    if (habit.streak_count === 7 || habit.streak_count === 14 || habit.streak_count === 30) {
      desc += ` [MILESTONE: ${habit.streak_count}-day streak!]`;
    }
    if (habit.momentum_score >= 80 && tier === 'peak') {
      desc += ' [PEAK momentum!]';
    }
    if (habit.streak_count === 1 && habit.last_completion_timestamp &&
        Date.now() - habit.last_completion_timestamp < 86400000) {
      desc += ' [just started!]';
    }

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
