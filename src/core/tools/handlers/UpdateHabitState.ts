import type { ToolResult } from '../../../types';
import { storage } from '../../storage/LocalStorage';

export async function handleUpdateHabitState(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const field = args.field as string;
  const rawValue = args.value;

  if (!habitId || !field || rawValue === undefined) {
    return {
      success: false,
      tool_name: 'update_habit_state',
      data: {},
      error: 'Missing required parameters: habit_id, field, value',
    };
  }

  // Coerce value to the appropriate type
  let value: unknown = rawValue;
  if (typeof rawValue === 'string') {
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') value = Number(rawValue);
  }

  const ALLOWED_FIELDS = [
    'resistance_score',
    'friction_score',
    'streak_count',
    'completion_rate_7d',
    'metadata.clean_count',
    'metadata.dirty_count',
    'metadata.avg_clothes_per_session',
  ];

  if (!ALLOWED_FIELDS.includes(field)) {
    return {
      success: false,
      tool_name: 'update_habit_state',
      data: {},
      error: `Field "${field}" is not in the allowed update list`,
    };
  }

  try {
    const updated = await storage.updateHabitField(habitId, field, value);
    if (!updated) {
      return {
        success: false,
        tool_name: 'update_habit_state',
        data: {},
        error: `Habit "${habitId}" not found`,
      };
    }

    return {
      success: true,
      tool_name: 'update_habit_state',
      data: { habit_id: habitId, field, value, updated_at: Date.now() },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'update_habit_state',
      data: {},
      error: `Failed to update: ${err}`,
    };
  }
}
