import type { ToolResult } from '../../../types';
import { habitEngine } from '../../habits/HabitStateEngine';

export async function handleIncreaseCooldown(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const minutes = Number(args.minutes);

  if (!habitId || isNaN(minutes) || minutes <= 0) {
    return {
      success: false,
      tool_name: 'increase_cooldown',
      data: {},
      error: 'Missing or invalid parameters: habit_id (string), minutes (positive number)',
    };
  }

  const capped = Math.min(minutes, 120); // max 2-hour cooldown

  try {
    await habitEngine.setCooldown(habitId, capped);

    return {
      success: true,
      tool_name: 'increase_cooldown',
      data: {
        habit_id: habitId,
        minutes: capped,
        cooldown_until: Date.now() + capped * 60 * 1000,
      },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'increase_cooldown',
      data: {},
      error: `Failed to set cooldown: ${err}`,
    };
  }
}
