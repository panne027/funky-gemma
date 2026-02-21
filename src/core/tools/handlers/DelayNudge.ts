import type { ToolResult } from '../../../types';

/**
 * DelayNudge: explicit decision to NOT nudge.
 * This is not a no-op — it logs the decision and reason for future learning.
 */
export async function handleDelayNudge(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const reason = args.reason as string;

  if (!habitId || !reason) {
    return {
      success: false,
      tool_name: 'delay_nudge',
      data: {},
      error: 'Missing required parameters: habit_id, reason',
    };
  }

  return {
    success: true,
    tool_name: 'delay_nudge',
    data: {
      habit_id: habitId,
      reason,
      decided_at: Date.now(),
      action: 'no_nudge',
    },
  };
}
