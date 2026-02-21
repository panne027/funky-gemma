import type { ToolResult } from '../../../types';
import { habitEngine } from '../../habits/HabitStateEngine';
import { storage } from '../../storage/LocalStorage';
import { aiLog } from '../../logging/AILogger';

export async function handleAdjustDifficulty(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const direction = args.direction as string;
  const reason = args.reason as string;

  if (!habitId || !direction || !['easier', 'harder'].includes(direction)) {
    return {
      success: false,
      tool_name: 'adjust_difficulty',
      data: {},
      error: 'Required: habit_id, direction ("easier" or "harder"), reason',
    };
  }

  const habit = await storage.getHabit(habitId);
  if (!habit) {
    return { success: false, tool_name: 'adjust_difficulty', data: {}, error: `Habit ${habitId} not found` };
  }

  const oldResistance = habit.resistance_score;
  const delta = direction === 'easier' ? -0.1 : 0.1;
  habit.resistance_score = Math.max(0, Math.min(1, habit.resistance_score + delta));

  // Track difficulty adjustments in metadata
  const adjustments = (habit.metadata.difficulty_adjustments as any[]) ?? [];
  adjustments.push({
    timestamp: Date.now(),
    direction,
    reason,
    resistance_before: oldResistance,
    resistance_after: habit.resistance_score,
  });
  habit.metadata.difficulty_adjustments = adjustments.slice(-20);

  await storage.saveHabit(habit);
  aiLog('agent', `Difficulty ${direction} for ${habitId}: ${oldResistance.toFixed(2)} → ${habit.resistance_score.toFixed(2)}`);

  return {
    success: true,
    tool_name: 'adjust_difficulty',
    data: {
      habit_id: habitId,
      direction,
      resistance_before: oldResistance,
      resistance_after: habit.resistance_score,
      reason,
    },
  };
}
