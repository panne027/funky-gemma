import type { ToolResult } from '../../../types';
import { storage } from '../../storage/LocalStorage';
import { aiLog } from '../../logging/AILogger';

export async function handleAnalyzePattern(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const patternType = args.pattern_type as string;

  if (!habitId || !patternType) {
    return {
      success: false,
      tool_name: 'analyze_pattern',
      data: {},
      error: 'Required: habit_id, pattern_type',
    };
  }

  const habit = await storage.getHabit(habitId);
  if (!habit) {
    return { success: false, tool_name: 'analyze_pattern', data: {}, error: `Habit ${habitId} not found` };
  }

  const recentCycles = await storage.getRecentCycles(50);
  const habitCycles = recentCycles.filter(
    (c) => c.tool_call?.arguments?.habit_id === habitId,
  );

  let analysis: Record<string, unknown> = {};

  switch (patternType) {
    case 'best_time': {
      const completionHours: number[] = [];
      for (const c of habitCycles) {
        if (c.tool_call?.name === 'send_nudge') {
          completionHours.push(c.context.time_of_day.hour);
        }
      }
      const hourCounts: Record<number, number> = {};
      for (const h of completionHours) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
      const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      analysis = {
        best_hour: bestHour ? Number(bestHour[0]) : null,
        hourly_distribution: hourCounts,
        sample_size: completionHours.length,
      };
      break;
    }
    case 'streak_risk': {
      const daysSinceCompletion = habit.last_completion_timestamp
        ? (Date.now() - habit.last_completion_timestamp) / 86400000
        : Infinity;
      analysis = {
        days_since_completion: Math.round(daysSinceCompletion * 10) / 10,
        streak_at_risk: daysSinceCompletion > 1,
        current_streak: habit.streak_count,
        momentum: habit.momentum_score,
      };
      break;
    }
    case 'resistance_trend': {
      const outcomes = habit.recent_nudge_outcomes.slice(-10);
      const dismissed = outcomes.filter((o) => o.outcome === 'dismissed' || o.outcome === 'ignored').length;
      const completed = outcomes.filter((o) => o.outcome === 'completed').length;
      analysis = {
        recent_dismissed: dismissed,
        recent_completed: completed,
        resistance_score: habit.resistance_score,
        trend: dismissed > completed ? 'increasing' : completed > dismissed ? 'decreasing' : 'stable',
      };
      break;
    }
    default:
      analysis = { error: `Unknown pattern type: ${patternType}` };
  }

  aiLog('agent', `Pattern analysis: ${patternType} for ${habitId}`);
  return {
    success: true,
    tool_name: 'analyze_pattern',
    data: { habit_id: habitId, pattern_type: patternType, analysis },
  };
}
