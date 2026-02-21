import { Platform } from 'react-native';
import type { ToolResult } from '../../../types';
import { notificationDispatcher } from '../../notifications/NotificationDispatcher';
import { aiLog } from '../../logging/AILogger';

export async function handleScheduleReminder(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const message = args.message as string;
  const delayMinutes = Number(args.delay_minutes);

  if (!habitId || !message || isNaN(delayMinutes) || delayMinutes <= 0) {
    return {
      success: false,
      tool_name: 'schedule_reminder',
      data: {},
      error: 'Missing required parameters: habit_id, message, delay_minutes',
    };
  }

  const capped = Math.min(delayMinutes, 480); // max 8 hours
  const scheduledTime = Date.now() + capped * 60000;

  // Schedule via setTimeout for the reminder notification
  setTimeout(async () => {
    try {
      await notificationDispatcher.sendNudge({
        habitId,
        tone: 'gentle',
        message: `[Scheduled] ${message}`,
        timestamp: Date.now(),
      });
    } catch (err) {
      aiLog('agent', `Scheduled reminder failed: ${err}`);
    }
  }, capped * 60000);

  // On Android, also set a system alarm if possible
  if (Platform.OS === 'android') {
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.AlarmModule) {
        await NativeModules.AlarmModule.setAlarm(scheduledTime, message);
      }
    } catch { /* native alarm module not available */ }
  }

  aiLog('agent', `Scheduled reminder in ${capped}min: "${message}"`);
  return {
    success: true,
    tool_name: 'schedule_reminder',
    data: { habit_id: habitId, scheduled_at: new Date(scheduledTime).toISOString(), delay_minutes: capped },
  };
}
