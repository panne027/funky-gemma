import { Platform } from 'react-native';
import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';
import { googleAuth } from '../../auth/GoogleAuthService';

export async function handleCreateCalendarBlock(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const title = args.title as string;
  const durationMinutes = Number(args.duration_minutes);
  const offsetMinutes = Number(args.offset_minutes ?? 0);

  if (!habitId || !title || isNaN(durationMinutes) || durationMinutes <= 0) {
    return {
      success: false,
      tool_name: 'create_calendar_block',
      data: {},
      error: 'Missing required parameters: habit_id, title, duration_minutes',
    };
  }

  const startTime = new Date(Date.now() + offsetMinutes * 60000);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  // Prefer Google Calendar API if signed in
  if (googleAuth.isSignedIn) {
    try {
      const { createCalendarEvent } = require('../../auth/GoogleAPIClient');
      const eventId = await createCalendarEvent(
        title,
        startTime,
        endTime,
        `Habit session: ${habitId} (created by Nudgy-Nudge)`,
      );

      aiLog('agent', `Created Google Calendar block: "${title}" (${eventId})`);
      return {
        success: true,
        tool_name: 'create_calendar_block',
        data: {
          habit_id: habitId,
          title,
          event_id: eventId,
          source: 'google_calendar',
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
      };
    } catch (err) {
      aiLog('agent', `Google Calendar failed, falling back to local: ${err}`);
    }
  }

  if (Platform.OS === 'web') {
    aiLog('agent', `Calendar block (web sim): "${title}" ${durationMinutes}min`);
    return {
      success: true,
      tool_name: 'create_calendar_block',
      data: { habit_id: habitId, title, start: startTime.toISOString(), end: endTime.toISOString(), simulated: true },
    };
  }

  try {
    const RNCalendarEvents = require('react-native-calendar-events').default;
    const status = await RNCalendarEvents.checkPermissions();
    if (status !== 'authorized') {
      const result = await RNCalendarEvents.requestPermissions();
      if (result !== 'authorized') {
        return { success: false, tool_name: 'create_calendar_block', data: {}, error: 'Calendar permission denied' };
      }
    }

    const eventId = await RNCalendarEvents.saveEvent(title, {
      startDate: startTime.toISOString(),
      endDate: endTime.toISOString(),
      notes: `Habit session: ${habitId} (created by Nudgy-Nudge)`,
      alarms: [{ date: -5 }],
    });

    aiLog('agent', `Created local calendar block: "${title}" (${eventId})`);
    return {
      success: true,
      tool_name: 'create_calendar_block',
      data: { habit_id: habitId, title, event_id: eventId, source: 'device_calendar', start: startTime.toISOString(), end: endTime.toISOString() },
    };
  } catch (err) {
    return { success: false, tool_name: 'create_calendar_block', data: {}, error: `Calendar write failed: ${err}` };
  }
}
