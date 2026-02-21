import type { ToolResult } from '../../../types';
import { notificationDispatcher } from '../../notifications/NotificationDispatcher';
import { storage } from '../../storage/LocalStorage';
import { aiLog } from '../../logging/AILogger';

export async function handleCelebrateMilestone(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const milestone = args.milestone as string;
  const message = args.message as string;

  if (!habitId || !milestone || !message) {
    return {
      success: false,
      tool_name: 'celebrate_milestone',
      data: {},
      error: 'Required: habit_id, milestone, message',
    };
  }

  const habit = await storage.getHabit(habitId);

  // Record the milestone
  const milestones = (habit?.metadata.milestones as any[]) ?? [];
  milestones.push({ milestone, timestamp: Date.now(), message });
  if (habit) {
    habit.metadata.milestones = milestones.slice(-50);
    await storage.saveHabit(habit);
  }

  // Send celebratory notification
  await notificationDispatcher.sendNudge({
    habitId,
    tone: 'playful',
    message,
    timestamp: Date.now(),
  });

  aiLog('nudge', `Milestone: ${milestone} for ${habitId} — "${message}"`);
  return {
    success: true,
    tool_name: 'celebrate_milestone',
    data: { habit_id: habitId, milestone, message },
  };
}
