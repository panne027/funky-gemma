import type {
  AgentTrigger,
  AgentCycleResult,
  ContextSnapshot,
  HabitState,
} from '../../types';
import { getContextSnapshot } from '../context/ContextAggregator';
import { getScrollSignal } from '../context/signals/ScrollSignal';
import { habitEngine } from '../habits/HabitStateEngine';
import { functionGemma } from '../cactus/FunctionGemmaClient';
import { toolExecutor } from '../tools/ToolExecutor';
import { buildSystemPrompt, buildUserPrompt } from './PromptBuilder';
import { storage } from '../storage/LocalStorage';
import { aiLog } from '../logging/AILogger';

type CycleListener = (result: AgentCycleResult) => void;

/**
 * AgentLoop: the core agentic decision cycle.
 *
 * This is NOT a cron scheduler. The loop is event-driven with multiple triggers:
 *
 * TRIGGER CONDITIONS:
 *   1. Interval tick (every 10–15 minutes, jittered)
 *   2. Calendar event just ended
 *   3. Prolonged scrolling detected (>15 min)
 *   4. Prolonged inactivity detected
 *   5. Habit manually completed by user
 *   6. Manual/demo trigger
 *
 * EACH CYCLE:
 *   1. Collect context snapshot
 *   2. Update friction + resistance for all habits
 *   3. Recalculate momentum scores
 *   4. Build LLM prompt (context + states + cooldowns + outcomes)
 *   5. Run FunctionGemma via Cactus
 *   6. Parse tool call from response
 *   7. Execute tool deterministically
 *   8. Update storage
 *   9. Emit result to listeners
 */
export class AgentLoop {
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private scrollPollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private listeners: CycleListener[] = [];
  private intervalMs = 12 * 60 * 1000; // default 12 min
  private scrollThresholdMin = 15;

  subscribe(listener: CycleListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const settings = await storage.getSettings();
    this.intervalMs = settings.agent_interval_minutes * 60 * 1000;
    this.scrollThresholdMin = settings.scroll_threshold_minutes;

    // Periodic interval trigger with ±20% jitter
    this.intervalTimer = setInterval(() => {
      const jitter = (Math.random() - 0.5) * 0.4 * this.intervalMs;
      setTimeout(() => this.runCycle('interval'), Math.max(0, jitter));
    }, this.intervalMs);

    // Scroll monitoring (check every 30s for doom-scroll threshold)
    this.scrollPollTimer = setInterval(() => {
      const scroll = getScrollSignal();
      if (scroll.continuous_scroll_minutes >= this.scrollThresholdMin) {
        this.runCycle('prolonged_scrolling');
      }
    }, 30_000);

    aiLog('agent', `Started — interval ${(this.intervalMs / 60000).toFixed(0)}min, scroll threshold ${this.scrollThresholdMin}min`);

    this.runCycle('interval').catch((err) =>
      aiLog('agent', `Initial cycle error: ${err}`),
    );
  }

  stop(): void {
    this.running = false;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.scrollPollTimer) clearInterval(this.scrollPollTimer);
    this.intervalTimer = null;
    this.scrollPollTimer = null;
    console.log('[AgentLoop] Stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Trigger a cycle from an external event.
   */
  async trigger(reason: AgentTrigger): Promise<AgentCycleResult> {
    return this.runCycle(reason);
  }

  /**
   * Core agent cycle — the heart of the system.
   */
  async runCycle(trigger: AgentTrigger): Promise<AgentCycleResult> {
    const cycleStart = Date.now();

    const context = getContextSnapshot();
    aiLog('context', `${context.time_of_day.hour}:${String(context.time_of_day.minute).padStart(2, '0')} ${context.time_of_day.isWeekend ? 'weekend' : 'weekday'} | screen ${context.screen.continuous_usage_minutes}min | scroll ${context.scroll.continuous_scroll_minutes}min${context.scroll.is_doom_scrolling ? ' [DOOM]' : ''}`);

    const habits = await habitEngine.recalculateAll(context);
    aiLog('agent', `Trigger: ${trigger} | Habits: ${habits.map((h) => `${h.name}=${h.momentum_score}%`).join(', ')}`);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context, habits);

    let rawResponse = '';
    let toolCallParsed = null;
    let confidence = 0;

    try {
      const decision = await functionGemma.decide(systemPrompt, userPrompt);
      rawResponse = decision.rawResponse;
      toolCallParsed = decision.toolCall;
      confidence = decision.confidence;
    } catch (err) {
      aiLog('agent', `Inference error: ${err}`);
      rawResponse = `ERROR: ${err}`;
    }

    let toolResult = null;
    if (toolCallParsed) {
      toolResult = await toolExecutor.execute(toolCallParsed);
      aiLog('agent', `Executed: ${toolCallParsed.name} → ${toolResult?.success ? 'OK' : 'FAIL'}`);
    }

    // ── Step 8: Persist ──────────────────────────────────────────────
    const cycleResult: AgentCycleResult = {
      trigger,
      timestamp: cycleStart,
      context,
      habit_states: habits,
      prompt_sent: `${systemPrompt}\n\n${userPrompt}`,
      raw_response: rawResponse,
      tool_call: toolCallParsed,
      tool_result: toolResult,
      cycle_duration_ms: Date.now() - cycleStart,
    };

    await storage.appendCycleResult(cycleResult);
    await storage.setLastContext(context);

    // ── Step 9: Emit ─────────────────────────────────────────────────
    this.listeners.forEach((l) => l(cycleResult));

    aiLog('agent', `Cycle done: ${trigger} → ${toolCallParsed?.name ?? 'no_action'} (${cycleResult.cycle_duration_ms}ms)`);

    return cycleResult;
  }

  /**
   * Update interval dynamically (e.g., for demo mode time acceleration).
   */
  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    if (this.running && this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = setInterval(() => this.runCycle('interval'), ms);
    }
  }
}

export const agentLoop = new AgentLoop();
