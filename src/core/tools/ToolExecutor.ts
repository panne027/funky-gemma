import type { ToolCall, ToolResult } from '../../types';
import { handleSendNudge } from './handlers/SendNudge';
import { handleUpdateHabitState } from './handlers/UpdateHabitState';
import { handleIncreaseCooldown } from './handlers/IncreaseCooldown';
import { handleDelayNudge } from './handlers/DelayNudge';

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  send_nudge: handleSendNudge,
  update_habit_state: handleUpdateHabitState,
  increase_cooldown: handleIncreaseCooldown,
  delay_nudge: handleDelayNudge,
};

/**
 * ToolExecutor: deterministic dispatch layer.
 *
 * Takes a parsed ToolCall from FunctionGemma's output,
 * routes to the correct handler, and returns a structured result.
 * No ambiguity — every tool call maps to exactly one handler.
 */
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
