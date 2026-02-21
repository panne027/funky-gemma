import type { ToolResult, NudgeTone } from '../../../types';
import { notificationDispatcher } from '../../notifications/NotificationDispatcher';
import { habitEngine } from '../../habits/HabitStateEngine';

export async function handleSendNudge(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const tone = args.tone as NudgeTone;
  const message = args.message as string;

  if (!habitId || !tone || !message) {
    return {
      success: false,
      tool_name: 'send_nudge',
      data: {},
      error: 'Missing required parameters: habit_id, tone, message',
    };
  }

  try {
    await notificationDispatcher.sendNudge({
      habitId,
      tone,
      message,
      timestamp: Date.now(),
    });

    await habitEngine.recordNudgeOutcome(habitId, {
      timestamp: Date.now(),
      tone,
      message,
      outcome: null, // will be updated when user responds
    });

    return {
      success: true,
      tool_name: 'send_nudge',
      data: { habit_id: habitId, tone, message, sent_at: Date.now() },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'send_nudge',
      data: {},
      error: `Failed to send nudge: ${err}`,
    };
  }
}
