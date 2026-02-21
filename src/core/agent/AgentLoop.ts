import type {
  AgentTrigger,
  AgentCycleResult,
  ContextSnapshot,
  HabitState,
  RoutingDecision,
} from '../../types';
import { getContextSnapshot } from '../context/ContextAggregator';
import { getScrollSignal } from '../context/signals/ScrollSignal';
import { habitEngine } from '../habits/HabitStateEngine';
import { functionGemma } from '../cactus/FunctionGemmaClient';
import { toolExecutor } from '../tools/ToolExecutor';
import { buildSystemPrompt, buildUserPrompt } from './PromptBuilder';
import { storage } from '../storage/LocalStorage';
import { aiLog } from '../logging/AILogger';
import { scorePromptComplexity, routeDecision } from '../routing/HybridRouter';

type CycleListener = (result: AgentCycleResult) => void;

/**
 * AgentLoop: the core agentic decision cycle.
 *
 * TRIGGER CONDITIONS:
 *   1. Interval tick (every 10–15 minutes, jittered)
 *   2. Calendar event just ended
 *   3. Prolonged scrolling detected (>15 min)
 *   4. Prolonged inactivity detected
 *   5. Habit manually completed by user
 *   6. Health milestone detected (step goal, exercise session)
 *   7. Manual/demo trigger
 *
 * EACH CYCLE:
 *   1. Collect context snapshot (time, calendar, screen, scroll, health, battery, connectivity)
 *   2. Update friction + resistance for all habits
 *   3. Recalculate momentum scores
 *   4. Route decision: local FunctionGemma vs. cloud Gemini vs. mock
 *   5. Build LLM prompt (context + states + cooldowns + health + outcomes)
 *   6. Run inference via chosen path
 *   7. Parse tool call from response
 *   8. Execute tool deterministically
 *   9. Update storage + emit result
 */
export class AgentLoop {
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private scrollPollTimer: ReturnType<typeof setInterval> | null = null;
  private healthPollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private listeners: CycleListener[] = [];
  private intervalMs = 12 * 60 * 1000;
  private scrollThresholdMin = 15;
  private lastStepCount = 0;

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

    // Health monitoring (check every 2 min for exercise sessions, step milestones)
    this.healthPollTimer = setInterval(() => {
      this.checkHealthTriggers();
    }, 120_000);

    aiLog('agent', `Started — interval ${(this.intervalMs / 60000).toFixed(0)}min, scroll threshold ${this.scrollThresholdMin}min`);

    this.runCycle('interval').catch((err) =>
      aiLog('agent', `Initial cycle error: ${err}`),
    );
  }

  stop(): void {
    this.running = false;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.scrollPollTimer) clearInterval(this.scrollPollTimer);
    if (this.healthPollTimer) clearInterval(this.healthPollTimer);
    this.intervalTimer = null;
    this.scrollPollTimer = null;
    this.healthPollTimer = null;
    console.log('[AgentLoop] Stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  async trigger(reason: AgentTrigger): Promise<AgentCycleResult> {
    return this.runCycle(reason);
  }

  async runCycle(trigger: AgentTrigger): Promise<AgentCycleResult> {
    const cycleStart = Date.now();

    const context = getContextSnapshot();
    aiLog('context', `${context.time_of_day.hour}:${String(context.time_of_day.minute).padStart(2, '0')} ${context.time_of_day.isWeekend ? 'weekend' : 'weekday'} | screen ${context.screen.continuous_usage_minutes}min | scroll ${context.scroll.continuous_scroll_minutes}min${context.scroll.is_doom_scrolling ? ' [DOOM]' : ''} | steps ${context.health.steps_today} | sleep ${context.health.sleep_hours_last_night ?? '?'}h`);

    const habits = await habitEngine.recalculateAll(context);
    aiLog('agent', `Trigger: ${trigger} | Habits: ${habits.map((h) => `${h.name}=${h.momentum_score}%`).join(', ')}`);

    // Compute routing decision
    const complexity = scorePromptComplexity({
      hasHealth: context.health.steps_today > 0 || context.health.sleep_hours_last_night !== null,
      hasCalendar: !!context.calendar.current_event || !!context.calendar.next_event,
      hasMeeting: !!context.calendar.just_ended_event,
      isDoomScrolling: context.scroll.is_doom_scrolling,
      habitCount: habits.length,
      hasRecoveryHabit: habits.some((h) => h.momentum_score < 20 && h.streak_count === 0),
      hasMilestone: habits.some((h) => [7, 14, 30].includes(h.streak_count) || h.momentum_score >= 80),
    });

    const route = routeDecision({
      is_connected: context.connectivity.is_connected,
      battery_level: context.battery.level,
      prompt_complexity: complexity,
      recent_local_latency_ms: 0,
      recent_cloud_latency_ms: 0,
      local_failures: 0,
      cloud_failures: 0,
    });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context, habits);

    let rawResponse = '';
    let toolCallParsed = null;
    let confidence = 0;

    try {
      const decision = await functionGemma.decide(systemPrompt, userPrompt, route);
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

    const cycleResult: AgentCycleResult = {
      trigger,
      timestamp: cycleStart,
      context,
      habit_states: habits,
      prompt_sent: `${systemPrompt}\n\n${userPrompt}`,
      raw_response: rawResponse,
      tool_call: toolCallParsed,
      tool_result: toolResult,
      routing_decision: route,
      cycle_duration_ms: Date.now() - cycleStart,
    };

    await storage.appendCycleResult(cycleResult);
    await storage.setLastContext(context);

    this.listeners.forEach((l) => l(cycleResult));

    aiLog('agent', `Cycle done: ${trigger} → ${toolCallParsed?.name ?? 'no_action'} [${route}] (${cycleResult.cycle_duration_ms}ms)`);

    return cycleResult;
  }

  private async checkHealthTriggers(): Promise<void> {
    try {
      const context = getContextSnapshot();
      const hd = context.health;

      // Step milestone (every 5000 steps)
      if (hd.steps_today > 0 && hd.steps_today >= this.lastStepCount + 5000) {
        this.lastStepCount = Math.floor(hd.steps_today / 5000) * 5000;
        aiLog('agent', `Health trigger: step milestone ${this.lastStepCount}`);
        this.runCycle('health_milestone').catch(() => {});
      }

      // New exercise session detected
      if (hd.exercise_sessions_today > 0 && hd.last_exercise_timestamp) {
        const minutesSinceExercise = (Date.now() - hd.last_exercise_timestamp) / 60000;
        if (minutesSinceExercise < 3) {
          aiLog('agent', `Health trigger: exercise session detected (${hd.last_exercise_type})`);
          this.runCycle('exercise_detected').catch(() => {});
        }
      }
    } catch {
      // Health data unavailable
    }
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    if (this.running && this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = setInterval(() => this.runCycle('interval'), ms);
    }
  }
}

export const agentLoop = new AgentLoop();
