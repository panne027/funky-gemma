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
        habit_id: {
          type: 'string',
          description: 'The ID of the habit to update',
        },
        field: {
          type: 'string',
          description: 'The field path to update (e.g. "resistance_score", "metadata.clean_count")',
        },
        value: {
          type: 'string',
          description: 'The new value (will be coerced to appropriate type)',
        },
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
        habit_id: {
          type: 'string',
          description: 'The ID of the habit to cooldown',
        },
        minutes: {
          type: 'number',
          description: 'Number of minutes to extend the cooldown',
        },
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
        habit_id: {
          type: 'string',
          description: 'The ID of the habit being evaluated',
        },
        reason: {
          type: 'string',
          description: 'Why the nudge is being delayed (logged for learning)',
        },
      },
      required: ['habit_id', 'reason'],
    },
  },
];

/**
 * Format tool definitions into the schema block for the system prompt.
 */
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
