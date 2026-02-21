import type { ToolDefinition } from '../../types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'send_nudge',
    description:
      'Send a context-aware habit nudge notification to the user. Use when conditions are right and momentum would benefit from a timely push.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: {
          type: 'string',
          description: 'The ID of the habit to nudge (e.g. "gym", "laundry", "reading")',
        },
        tone: {
          type: 'string',
          description: 'The emotional tone of the nudge',
          enum: ['gentle', 'firm', 'playful'],
        },
        message: {
          type: 'string',
          description: 'The nudge message to display to the user. Should be concise, motivating, and context-specific.',
        },
      },
      required: ['habit_id', 'tone', 'message'],
    },
  },
  {
    name: 'update_habit_state',
    description:
      'Update a specific field of a habit state. Use to adjust scores, windows, or metadata based on observed patterns.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The ID of the habit to update' },
        field: { type: 'string', description: 'The field path to update (e.g. "resistance_score", "metadata.clean_count")' },
        value: { type: 'string', description: 'The new value (will be coerced to appropriate type)' },
      },
      required: ['habit_id', 'field', 'value'],
    },
  },
  {
    name: 'increase_cooldown',
    description:
      'Increase the cooldown timer for a habit, preventing nudges for the specified duration. Use when the user has been nudged recently or dismissed a nudge.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The ID of the habit to cooldown' },
        minutes: { type: 'number', description: 'Number of minutes to extend the cooldown' },
      },
      required: ['habit_id', 'minutes'],
    },
  },
  {
    name: 'delay_nudge',
    description:
      'Explicitly decide NOT to nudge right now, with a reason. Use when context indicates this is not the right moment.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The ID of the habit being evaluated' },
        reason: { type: 'string', description: 'Why the nudge is being delayed (logged for learning)' },
      },
      required: ['habit_id', 'reason'],
    },
  },
  {
    name: 'create_calendar_block',
    description:
      'Create a time block on the user\'s Google Calendar for a habit session. Use when the user has free time and would benefit from a scheduled commitment.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit this calendar block is for' },
        title: { type: 'string', description: 'Calendar event title (e.g. "Gym Session", "Reading Time")' },
        duration_minutes: { type: 'number', description: 'Duration of the block in minutes' },
        offset_minutes: { type: 'number', description: 'Minutes from now to start the block (0 = now)' },
      },
      required: ['habit_id', 'title', 'duration_minutes'],
    },
  },
  {
    name: 'schedule_reminder',
    description:
      'Schedule a future notification reminder for a habit. Use to follow up later (e.g. "remind me in 30 min to start gym").',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit this reminder is for' },
        message: { type: 'string', description: 'The reminder message' },
        delay_minutes: { type: 'number', description: 'Minutes from now to send the reminder' },
      },
      required: ['habit_id', 'message', 'delay_minutes'],
    },
  },
  {
    name: 'adjust_difficulty',
    description:
      'Scale a habit\'s difficulty up or down. Use "easier" when the user is struggling or in recovery, "harder" when they have strong momentum.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit to adjust' },
        direction: { type: 'string', description: 'Scale direction', enum: ['easier', 'harder'] },
        reason: { type: 'string', description: 'Why the adjustment is being made' },
      },
      required: ['habit_id', 'direction', 'reason'],
    },
  },
  {
    name: 'celebrate_milestone',
    description:
      'Send a special celebration notification for an achievement (streak milestone, momentum peak, first completion, etc.).',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit that achieved the milestone' },
        milestone: { type: 'string', description: 'The milestone name (e.g. "7_day_streak", "peak_momentum", "first_completion")' },
        message: { type: 'string', description: 'The celebratory message to display' },
      },
      required: ['habit_id', 'milestone', 'message'],
    },
  },
  {
    name: 'suggest_habit_stack',
    description:
      'Suggest pairing two habits together (habit stacking). E.g. "after your gym session, throw in a load of laundry".',
    parameters: {
      type: 'object',
      properties: {
        primary_habit_id: { type: 'string', description: 'The anchor habit (the one they\'re already doing)' },
        stacked_habit_id: { type: 'string', description: 'The habit to stack onto it' },
        anchor: { type: 'string', description: 'When to do the stacked habit', enum: ['before', 'after'] },
        message: { type: 'string', description: 'The suggestion message' },
      },
      required: ['primary_habit_id', 'stacked_habit_id', 'message'],
    },
  },
  {
    name: 'log_health_activity',
    description:
      'Log a health/fitness activity detected from Health Connect data. Auto-completes matching habits.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit this activity relates to' },
        activity_type: { type: 'string', description: 'Type of activity (gym, running, walking, yoga, etc.)' },
        duration_minutes: { type: 'number', description: 'Duration of the activity' },
        steps: { type: 'number', description: 'Steps taken during activity' },
        note: { type: 'string', description: 'Optional note about the activity' },
      },
      required: ['habit_id', 'activity_type'],
    },
  },
  {
    name: 'set_smart_alarm',
    description:
      'Set an alarm on the device for a specific time, optimized for habit timing. Uses the system alarm app.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit this alarm is for' },
        hour: { type: 'number', description: 'Alarm hour (0-23)' },
        minute: { type: 'number', description: 'Alarm minute (0-59)' },
        label: { type: 'string', description: 'Alarm label (e.g. "Time for gym!")' },
      },
      required: ['habit_id', 'hour', 'label'],
    },
  },
  {
    name: 'analyze_pattern',
    description:
      'Analyze behavioral patterns for a habit to inform decisions. Returns data about best times, streak risks, or resistance trends.',
    parameters: {
      type: 'object',
      properties: {
        habit_id: { type: 'string', description: 'The habit to analyze' },
        pattern_type: { type: 'string', description: 'Type of analysis', enum: ['best_time', 'streak_risk', 'resistance_trend'] },
      },
      required: ['habit_id', 'pattern_type'],
    },
  },
  {
    name: 'fetch_google_calendar',
    description:
      'Fetch upcoming events from the user\'s Google Calendar. Requires Google Sign-In. Returns today\'s events with times and titles.',
    parameters: {
      type: 'object',
      properties: {
        hours_ahead: { type: 'number', description: 'How many hours ahead to look (default 24)' },
      },
      required: [],
    },
  },
  {
    name: 'create_google_calendar_event',
    description:
      'Create an event on the user\'s real Google Calendar (not just the local device calendar). Use for scheduling habit sessions, focus blocks, or reminders.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title (e.g. "Gym Session", "Reading Block")' },
        duration_minutes: { type: 'number', description: 'Duration in minutes' },
        offset_minutes: { type: 'number', description: 'Minutes from now to start (0 = now)' },
        description: { type: 'string', description: 'Optional event description' },
      },
      required: ['title', 'duration_minutes'],
    },
  },
  {
    name: 'add_shopping_item',
    description:
      'Add an item to the user\'s Google Tasks shopping list (synced via Google Tasks API). Use for habit-related supplies like protein powder, running shoes, books, etc.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'The item to add (e.g. "Protein powder", "New running shoes")' },
        notes: { type: 'string', description: 'Optional notes or context' },
      },
      required: ['item'],
    },
  },
  {
    name: 'get_shopping_list',
    description:
      'Retrieve the user\'s habit-related shopping list from Google Tasks. Returns pending items.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export function formatToolsForPrompt(): string {
  return TOOL_DEFINITIONS.map((tool) => {
    const params = Object.entries(tool.parameters.properties)
      .map(([name, prop]) => {
        const enumStr = prop.enum ? ` (one of: ${prop.enum.join(', ')})` : '';
        const reqStr = tool.parameters.required.includes(name) ? ' [required]' : '';
        return `    - ${name}: ${prop.type}${enumStr}${reqStr} — ${prop.description}`;
      })
      .join('\n');
    return `  ${tool.name}: ${tool.description}\n${params}`;
  }).join('\n\n');
}
