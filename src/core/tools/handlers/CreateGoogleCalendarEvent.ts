import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';
import { googleAuth } from '../../auth/GoogleAuthService';

export async function handleCreateGoogleCalendarEvent(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const title = args.title as string;
  const durationMinutes = Number(args.duration_minutes);
  const offsetMinutes = Number(args.offset_minutes ?? 0);
  const description = args.description as string | undefined;

  if (!title || isNaN(durationMinutes) || durationMinutes <= 0) {
    return {
      success: false,
      tool_name: 'create_google_calendar_event',
      data: {},
      error: 'Missing required parameters: title, duration_minutes',
    };
  }

  if (!googleAuth.isSignedIn) {
    return {
      success: false,
      tool_name: 'create_google_calendar_event',
      data: {},
      error: 'Not signed in to Google. User needs to sign in first.',
    };
  }

  try {
    const { createCalendarEvent } = require('../../auth/GoogleAPIClient');
    const startTime = new Date(Date.now() + offsetMinutes * 60000);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const eventId = await createCalendarEvent(title, startTime, endTime, description);

    aiLog('agent', `Created Google Calendar event: "${title}" at ${startTime.toLocaleTimeString()}`);

    return {
      success: true,
      tool_name: 'create_google_calendar_event',
      data: {
        event_id: eventId,
        title,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'create_google_calendar_event',
      data: {},
      error: `Google Calendar event creation failed: ${err}`,
    };
  }
}
