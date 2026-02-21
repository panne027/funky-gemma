import type { ToolResult } from '../../../types';
import { notificationDispatcher } from '../../notifications/NotificationDispatcher';
import { aiLog } from '../../logging/AILogger';

export async function handleSuggestHabitStack(args: Record<string, unknown>): Promise<ToolResult> {
  const primaryHabitId = args.primary_habit_id as string;
  const stackedHabitId = args.stacked_habit_id as string;
  const message = args.message as string;
  const anchor = args.anchor as string; // "before" or "after"

  if (!primaryHabitId || !stackedHabitId || !message) {
    return {
      success: false,
      tool_name: 'suggest_habit_stack',
      data: {},
      error: 'Required: primary_habit_id, stacked_habit_id, message',
    };
  }

  await notificationDispatcher.sendNudge({
    habitId: primaryHabitId,
    tone: 'playful',
    message,
    timestamp: Date.now(),
  });

  aiLog('agent', `Habit stack: ${stackedHabitId} ${anchor ?? 'after'} ${primaryHabitId}`);
  return {
    success: true,
    tool_name: 'suggest_habit_stack',
    data: { primary: primaryHabitId, stacked: stackedHabitId, anchor: anchor ?? 'after', message },
  };
}
