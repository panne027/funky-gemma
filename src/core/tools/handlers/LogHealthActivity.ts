import type { ToolResult } from '../../../types';
import { habitEngine } from '../../habits/HabitStateEngine';
import { storage } from '../../storage/LocalStorage';
import { aiLog } from '../../logging/AILogger';

export async function handleLogHealthActivity(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const activityType = args.activity_type as string;
  const durationMinutes = Number(args.duration_minutes ?? 0);
  const steps = Number(args.steps ?? 0);
  const note = args.note as string ?? '';

  if (!habitId || !activityType) {
    return {
      success: false,
      tool_name: 'log_health_activity',
      data: {},
      error: 'Required: habit_id, activity_type',
    };
  }

  const habit = await storage.getHabit(habitId);
  if (!habit) {
    return { success: false, tool_name: 'log_health_activity', data: {}, error: `Habit ${habitId} not found` };
  }

  // Record activity in metadata
  const activities = (habit.metadata.health_activities as any[]) ?? [];
  const entry = {
    timestamp: Date.now(),
    activity_type: activityType,
    duration_minutes: durationMinutes,
    steps,
    note,
  };
  activities.push(entry);
  habit.metadata.health_activities = activities.slice(-100);

  // Auto-complete the habit if it matches
  if (activityType === 'gym' || activityType === 'workout' || activityType === 'exercise') {
    await habitEngine.recordCompletion(habitId);
  } else {
    await storage.saveHabit(habit);
  }

  aiLog('agent', `Health activity logged: ${activityType} ${durationMinutes}min for ${habitId}`);
  return {
    success: true,
    tool_name: 'log_health_activity',
    data: { habit_id: habitId, ...entry },
  };
}
