import type { RoutingDecision, RoutingContext } from '../../types';
import { aiLog } from '../logging/AILogger';

/**
 * HybridRouter: intelligent edge/cloud routing engine.
 *
 * Online  → cloud  (Gemini Flash Lite via REST — fast, non-blocking)
 * Offline → local  (FunctionGemma on-device via Cactus)
 *
 * No rules-based mock — every nudge is LLM-generated.
 */

const COMPLEXITY_THRESHOLD_LOCAL = 0.4;
const BATTERY_LOW_THRESHOLD = 0.15;

let recentLocalLatencies: number[] = [];
let recentCloudLatencies: number[] = [];
let localFailures = 0;
let cloudFailures = 0;

export function recordLatency(path: 'local' | 'cloud', ms: number): void {
  const arr = path === 'local' ? recentLocalLatencies : recentCloudLatencies;
  arr.push(ms);
  if (arr.length > 10) arr.shift();
}

export function recordFailure(path: 'local' | 'cloud'): void {
  if (path === 'local') localFailures++;
  else cloudFailures++;
}

export function recordSuccess(path: 'local' | 'cloud'): void {
  if (path === 'local') localFailures = Math.max(0, localFailures - 1);
  else cloudFailures = Math.max(0, cloudFailures - 1);
}

function avgLatency(arr: number[]): number {
  if (arr.length === 0) return 5000;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function scorePromptComplexity(context: {
  hasHealth: boolean;
  hasCalendar: boolean;
  hasMeeting: boolean;
  isDoomScrolling: boolean;
  habitCount: number;
  hasRecoveryHabit: boolean;
  hasMilestone: boolean;
}): number {
  let score = 0.2;

  if (context.hasHealth) score += 0.15;
  if (context.hasCalendar) score += 0.1;
  if (context.hasMeeting) score += 0.1;
  if (context.isDoomScrolling) score += 0.05;
  if (context.habitCount > 3) score += 0.1;
  if (context.hasRecoveryHabit) score += 0.1;
  if (context.hasMilestone) score += 0.15;

  return Math.min(1, score);
}

export function routeDecision(ctx: RoutingContext): RoutingDecision {
  if (!ctx.is_connected) {
    aiLog('gemma', 'Route: LOCAL (offline — Cactus FunctionGemma)');
    return 'local';
  }

  if (ctx.battery_level < BATTERY_LOW_THRESHOLD) {
    aiLog('gemma', 'Route: LOCAL (low battery — saving radio)');
    return 'local';
  }

  if (ctx.prompt_complexity < COMPLEXITY_THRESHOLD_LOCAL && localFailures === 0) {
    aiLog('gemma', `Route: LOCAL (simple prompt ${ctx.prompt_complexity.toFixed(2)})`);
    return 'local';
  }

  const avgLocal = avgLatency(recentLocalLatencies);
  const avgCloud = avgLatency(recentCloudLatencies);

  if (ctx.prompt_complexity > 0.7) {
    aiLog('gemma', `Route: CLOUD (high complexity ${ctx.prompt_complexity.toFixed(2)})`);
    return 'cloud';
  }

  if (avgLocal < avgCloud * 0.7 && localFailures === 0) {
    aiLog('gemma', `Route: LOCAL (faster: ${avgLocal.toFixed(0)}ms vs cloud ${avgCloud.toFixed(0)}ms)`);
    return 'local';
  }

  aiLog('gemma', `Route: CLOUD (Gemini Flash Lite, avg ${avgCloud.toFixed(0)}ms)`);
  return 'cloud';
}

export function getRoutingStats() {
  return {
    localFailures,
    cloudFailures,
    avgLocalLatency: avgLatency(recentLocalLatencies),
    avgCloudLatency: avgLatency(recentCloudLatencies),
  };
}
