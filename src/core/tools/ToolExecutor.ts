import type { ToolCall, ToolResult } from '../../types';
import { handleSendNudge } from './handlers/SendNudge';
import { handleUpdateHabitState } from './handlers/UpdateHabitState';
import { handleIncreaseCooldown } from './handlers/IncreaseCooldown';
import { handleDelayNudge } from './handlers/DelayNudge';
import { handleCreateCalendarBlock } from './handlers/CreateCalendarBlock';
import { handleScheduleReminder } from './handlers/ScheduleReminder';
import { handleAdjustDifficulty } from './handlers/AdjustDifficulty';
import { handleCelebrateMilestone } from './handlers/CelebrateMilestone';
import { handleSuggestHabitStack } from './handlers/SuggestHabitStack';
import { handleLogHealthActivity } from './handlers/LogHealthActivity';
import { handleSetSmartAlarm } from './handlers/SetSmartAlarm';
import { handleAnalyzePattern } from './handlers/AnalyzePattern';
import { handleFetchGoogleCalendar } from './handlers/FetchGoogleCalendar';
import { handleCreateGoogleCalendarEvent } from './handlers/CreateGoogleCalendarEvent';
import { handleAddShoppingItem } from './handlers/AddShoppingItem';
import { handleGetShoppingList } from './handlers/GetShoppingList';

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  send_nudge: handleSendNudge,
  update_habit_state: handleUpdateHabitState,
  increase_cooldown: handleIncreaseCooldown,
  delay_nudge: handleDelayNudge,
  create_calendar_block: handleCreateCalendarBlock,
  schedule_reminder: handleScheduleReminder,
  adjust_difficulty: handleAdjustDifficulty,
  celebrate_milestone: handleCelebrateMilestone,
  suggest_habit_stack: handleSuggestHabitStack,
  log_health_activity: handleLogHealthActivity,
  set_smart_alarm: handleSetSmartAlarm,
  analyze_pattern: handleAnalyzePattern,
  fetch_google_calendar: handleFetchGoogleCalendar,
  create_google_calendar_event: handleCreateGoogleCalendarEvent,
  add_shopping_item: handleAddShoppingItem,
  get_shopping_list: handleGetShoppingList,
};

export class ToolExecutor {
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const handler = TOOL_HANDLERS[toolCall.name];

    if (!handler) {
      return {
        success: false,
        tool_name: toolCall.name,
        data: {},
        error: `Unknown tool: "${toolCall.name}". Available: ${Object.keys(TOOL_HANDLERS).join(', ')}`,
      };
    }

    try {
      const result = await handler(toolCall.arguments);
      console.log(
        `[ToolExecutor] ${toolCall.name} → ${result.success ? 'OK' : 'FAIL'}`,
        result.data,
      );
      return result;
    } catch (err) {
      return {
        success: false,
        tool_name: toolCall.name,
        data: {},
        error: `Execution error: ${err}`,
      };
    }
  }

  listAvailableTools(): string[] {
    return Object.keys(TOOL_HANDLERS);
  }
}

export const toolExecutor = new ToolExecutor();
