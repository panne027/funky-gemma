import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';
import { googleAuth } from '../../auth/GoogleAuthService';

export async function handleFetchGoogleCalendar(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const hoursAhead = Number(args.hours_ahead ?? 24);

  if (!googleAuth.isSignedIn) {
    return {
      success: false,
      tool_name: 'fetch_google_calendar',
      data: {},
      error: 'Not signed in to Google. User needs to sign in first.',
    };
  }

  try {
    const { fetchCalendarEvents } = require('../../auth/GoogleAPIClient');
    const now = new Date();
    const end = new Date(now.getTime() + hoursAhead * 3600000);
    const events = await fetchCalendarEvents(now, end);

    aiLog('agent', `Fetched ${events.length} Google Calendar events for next ${hoursAhead}h`);

    return {
      success: true,
      tool_name: 'fetch_google_calendar',
      data: {
        event_count: events.length,
        events: events.map((e: any) => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          location: e.location,
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'fetch_google_calendar',
      data: {},
      error: `Calendar fetch failed: ${err}`,
    };
  }
}
