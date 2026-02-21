import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { agentLoop } from '../../core/agent/AgentLoop';
import { setSimulatedScroll, resetScrollSession } from '../../core/context/signals/ScrollSignal';
import { setSimulatedCalendar, simulateEventEnd } from '../../core/context/signals/CalendarSignal';
import { setSimulatedMotion } from '../../core/context/signals/MotionSignal';
import { setSimulatedScreen } from '../../core/context/signals/ScreenTimeSignal';
import { setSimulatedHealth } from '../../core/context/signals/HealthSignal';
import { setSimulatedBattery } from '../../core/context/signals/BatterySignal';
import { resetNotificationCounters } from '../../core/context/ContextAggregator';
import { habitEngine } from '../../core/habits/HabitStateEngine';
import { aiLogger, type AILogEntry } from '../../core/logging/AILogger';
import { useStore } from '../store';
import { colors, spacing, typography, radius } from '../theme';
import { DaySimulator } from './DaySimulator';

interface Scenario {
  id: string;
  title: string;
  description: string;
  setup: () => void;
  trigger: () => Promise<void>;
}

interface ScenarioResult {
  scenarioId: string;
  title: string;
  description: string;
  action: string | null;
  nudgeMessage: string | null;
  prompt: string;
  durationMs: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'morning-fresh',
    title: '7:15am — Morning, fresh start',
    description: 'Well rested (7.5h sleep), HR 62bpm. Calendar shows "Sprint Planning" at 10am. Great time for meditation or gym.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 230, sleep_hours_last_night: 7.5, resting_heart_rate: 62, active_minutes_today: 0, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 45 });
      setSimulatedBattery(0.92, false);
      setSimulatedCalendar([
        { title: 'Sprint Planning', startTime: Date.now() + 165 * 60000, endTime: Date.now() + 225 * 60000 },
        { title: 'Lunch with Sam', startTime: Date.now() + 285 * 60000, endTime: Date.now() + 345 * 60000 },
        { title: '1:1 with Manager', startTime: Date.now() + 375 * 60000, endTime: Date.now() + 405 * 60000 },
      ]);
    },
    trigger: () => agentLoop.trigger('interval').then(() => {}),
  },
  {
    id: 'doom-scroll-instagram',
    title: '9:45am — Doom scrolling Instagram',
    description: '22 min on Instagram. Sprint Planning in 15 min. Only 1,200 steps so far. Gym momentum dropping.',
    setup: () => {
      setSimulatedScroll(22);
      setSimulatedScreen(true, 'Instagram');
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 1200, sleep_hours_last_night: 7.5, resting_heart_rate: 68, active_minutes_today: 5, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 120 });
    },
    trigger: () => agentLoop.trigger('prolonged_scrolling').then(() => {}),
  },
  {
    id: 'post-standup',
    title: '10:32am — Sprint Planning just ended',
    description: '"Sprint Planning" done. 88 min free until lunch. 2,100 steps. Perfect window for a walk or gym.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 2100, sleep_hours_last_night: 7.5, resting_heart_rate: 70, active_minutes_today: 8, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 180 });
      simulateEventEnd({ title: 'Sprint Planning', startTime: Date.now() - 60 * 60000, endTime: Date.now() });
      setSimulatedCalendar([
        { title: 'Lunch with Sam', startTime: Date.now() + 88 * 60000, endTime: Date.now() + 148 * 60000 },
        { title: '1:1 with Manager', startTime: Date.now() + 178 * 60000, endTime: Date.now() + 208 * 60000 },
      ]);
    },
    trigger: () => agentLoop.trigger('calendar_event_ended').then(() => {}),
  },
  {
    id: 'lunch-scroll',
    title: '12:45pm — Post-lunch phone zombie',
    description: 'Scrolling Twitter 18 min post-lunch. Only 3,400 steps. Reading at 20% momentum. 1:1 in 75 min.',
    setup: () => {
      setSimulatedScroll(18);
      setSimulatedScreen(true, 'Twitter');
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 3400, sleep_hours_last_night: 7.5, resting_heart_rate: 72, active_minutes_today: 12, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 310 });
      setSimulatedCalendar([{ title: '1:1 with Manager', startTime: Date.now() + 75 * 60000, endTime: Date.now() + 105 * 60000 }]);
    },
    trigger: () => agentLoop.trigger('prolonged_scrolling').then(() => {}),
  },
  {
    id: 'post-meeting-free',
    title: '2:35pm — Last meeting done, evening free',
    description: '1:1 ended. No more meetings. 4,200 steps, no exercise yet. All evening free.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 4200, sleep_hours_last_night: 7.5, resting_heart_rate: 68, active_minutes_today: 15, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 380 });
      simulateEventEnd({ title: '1:1 with Manager', startTime: Date.now() - 30 * 60000, endTime: Date.now() });
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('calendar_event_ended').then(() => {}),
  },
  {
    id: 'poor-sleep-low-energy',
    title: '3:30pm — Bad sleep, low energy',
    description: 'Only 4.5h sleep. HR elevated at 82bpm. Battery at 18%. Struggling — needs gentler approach.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 2800, sleep_hours_last_night: 4.5, resting_heart_rate: 82, active_minutes_today: 5, exercise_sessions_today: 0, last_exercise_type: null, last_exercise_timestamp: null, calories_burned_today: 200 });
      setSimulatedBattery(0.18, false);
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('interval').then(() => {}),
  },
  {
    id: 'gym-done-health',
    title: '6:15pm — Just finished gym! (Health Connect)',
    description: 'Gym workout detected via Health Connect. 45 min exercise, 8,200 steps, 420 cal burned. Streak grows!',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('walking');
      setSimulatedHealth({ steps_today: 8200, sleep_hours_last_night: 7.5, resting_heart_rate: 75, active_minutes_today: 52, exercise_sessions_today: 1, last_exercise_type: 'gym', last_exercise_timestamp: Date.now() - 2 * 60000, calories_burned_today: 420 });
      setSimulatedBattery(0.55, false);
      setSimulatedCalendar([]);
    },
    trigger: async () => {
      await habitEngine.recordCompletion('gym');
      await agentLoop.trigger('exercise_detected');
    },
  },
  {
    id: 'evening-step-milestone',
    title: '7:30pm — Hit 10,000 steps!',
    description: 'Evening walk pushed you to 10,200 steps. Meditation and reading still undone. Wind-down time.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 10200, sleep_hours_last_night: 7.5, resting_heart_rate: 66, active_minutes_today: 68, exercise_sessions_today: 1, last_exercise_type: 'walking', last_exercise_timestamp: Date.now() - 15 * 60000, calories_burned_today: 520 });
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('health_milestone').then(() => {}),
  },
  {
    id: 'bedtime-reading',
    title: '10:30pm — Bedtime, scrolling instead of reading',
    description: 'In bed scrolling TikTok 15 min. Reading streak about to break. 7-day meditation streak active!',
    setup: () => {
      setSimulatedScroll(15);
      setSimulatedScreen(true, 'TikTok');
      setSimulatedMotion('still');
      setSimulatedHealth({ steps_today: 10500, sleep_hours_last_night: 7.5, resting_heart_rate: 62, active_minutes_today: 68, exercise_sessions_today: 1, last_exercise_type: 'gym', last_exercise_timestamp: Date.now() - 4 * 3600000, calories_burned_today: 540 });
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('prolonged_scrolling').then(() => {}),
  },
];

const LOG_COLORS: Record<string, string> = {
  cactus: '#6C63FF',
  gemma: '#FF6584',
  agent: '#43E97B',
  nudge: '#FFD93D',
  context: '#4FC3F7',
};

export function DemoMode() {
  const [tab, setTab] = useState<'scenarios' | 'daysim'>('scenarios');
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const { setDemoMode } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    setLogs(aiLogger.getEntries().slice(-30));
    const unsub = aiLogger.subscribe((entry) => {
      setLogs((prev) => [...prev.slice(-60), entry]);
    });
    return unsub;
  }, []);

  const runAllScenarios = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults([]);
    aiLogger.clear();
    setLogs([]);

    resetNotificationCounters();
    await habitEngine.createDefaultHabits();

    for (let i = 0; i < SCENARIOS.length; i++) {
      if (abortRef.current) break;

      const scenario = SCENARIOS[i];
      setCurrentIdx(i);
      scenario.setup();

      // Small delay so context signals settle
      await sleep(300);

      const start = Date.now();
      await scenario.trigger();
      const elapsed = Date.now() - start;

      const cycle = useStore.getState().latestCycle;
      const toolCall = cycle?.tool_call;

      const result: ScenarioResult = {
        scenarioId: scenario.id,
        title: scenario.title,
        description: scenario.description,
        action: toolCall ? `${toolCall.name}` : 'no action',
        nudgeMessage: toolCall?.name === 'send_nudge'
          ? (toolCall.arguments as any).message ?? null
          : toolCall?.name === 'delay_nudge'
            ? `[delayed: ${(toolCall.arguments as any).reason}]`
            : toolCall?.name === 'increase_cooldown'
              ? `[cooldown +${(toolCall.arguments as any).minutes}min]`
              : null,
        prompt: cycle?.prompt_sent ?? '',
        durationMs: elapsed,
      };

      setResults((prev) => [...prev, result]);

      // Wait between scenarios so the user can see the notification
      if (i < SCENARIOS.length - 1 && !abortRef.current) {
        await sleep(4000);
      }
    }

    setRunning(false);
    setCurrentIdx(-1);
  }, []);

  const stopSimulation = useCallback(() => {
    abortRef.current = true;
  }, []);

  if (tab === 'daysim') {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabInactive} onPress={() => setTab('scenarios')}>
            <Text style={styles.tabTextInactive}>Scenarios</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabActive}>
            <Text style={styles.tabTextActive}>Day Sim</Text>
          </TouchableOpacity>
        </View>
        <DaySimulator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabActive}>
          <Text style={styles.tabTextActive}>Scenarios</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabInactive} onPress={() => setTab('daysim')}>
          <Text style={styles.tabTextInactive}>Day Sim</Text>
        </TouchableOpacity>
      </View>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Simulation</Text>
          <Text style={styles.subtitle}>{SCENARIOS.length} scenarios, real nudges</Text>
        </View>
        <TouchableOpacity onPress={() => setDemoMode(false)} style={styles.exitBtn}>
          <Text style={styles.exitText}>Exit</Text>
        </TouchableOpacity>
      </View>

      {!running && results.length === 0 && (
        <View style={styles.startSection}>
          <Text style={styles.startDesc}>
            This runs through a full day of scenarios — morning routine, meetings,
            doom scrolling, post-meeting windows, evening habits, and bedtime.{'\n\n'}
            Each scenario sets up real context (calendar, screen time, scroll) and
            triggers the agent. You'll see banner notifications appear on your phone.
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={runAllScenarios}>
            <Text style={styles.startBtnText}>Run Full Day Simulation</Text>
          </TouchableOpacity>
        </View>
      )}

      {running && (
        <View style={styles.runningBar}>
          <ActivityIndicator color={colors.accent.primary} size="small" />
          <Text style={styles.runningText}>
            Running scenario {currentIdx + 1}/{SCENARIOS.length}...
          </Text>
          <TouchableOpacity onPress={stopSimulation} style={styles.stopBtn}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {results.map((r, i) => (
        <View key={r.scenarioId} style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultIndex}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle}>{r.title}</Text>
              <Text style={styles.resultDesc}>{r.description}</Text>
            </View>
          </View>

          <View style={styles.resultBody}>
            <View style={[
              styles.actionBadge,
              {
                backgroundColor: r.action === 'send_nudge'
                  ? colors.accent.pink + '20'
                  : r.action === 'delay_nudge'
                    ? colors.text.muted + '20'
                    : colors.accent.warning + '20',
              },
            ]}>
              <Text style={[
                styles.actionText,
                {
                  color: r.action === 'send_nudge'
                    ? colors.accent.pink
                    : r.action === 'delay_nudge'
                      ? colors.text.muted
                      : colors.accent.warning,
                },
              ]}>
                {r.action}
              </Text>
            </View>
            <Text style={styles.durationText}>{r.durationMs}ms</Text>
          </View>

          {r.nudgeMessage && (
            <View style={styles.nudgeBox}>
              <Text style={styles.nudgeLabel}>
                {r.action === 'send_nudge' ? 'NOTIFICATION' : 'DECISION'}
              </Text>
              <Text style={styles.nudgeMessage}>{r.nudgeMessage}</Text>
            </View>
          )}
        </View>
      ))}

      {!running && results.length > 0 && (
        <TouchableOpacity style={styles.rerunBtn} onPress={runAllScenarios}>
          <Text style={styles.rerunBtnText}>Run Again</Text>
        </TouchableOpacity>
      )}

      {/* Live Log Panel */}
      <View style={styles.logSection}>
        <TouchableOpacity
          style={styles.logToggle}
          onPress={() => setShowLogs((v) => !v)}
        >
          <Text style={styles.logToggleText}>
            {showLogs ? 'Hide' : 'Show'} Agent Logs ({logs.length})
          </Text>
        </TouchableOpacity>

        {showLogs && (
          <View style={styles.logContainer}>
            {logs.length === 0 && (
              <Text style={styles.logEmpty}>No logs yet — run the simulation</Text>
            )}
            {logs.map((entry) => (
              <View key={entry.id} style={styles.logRow}>
                <Text style={[styles.logSource, { color: LOG_COLORS[entry.source] ?? colors.text.muted }]}>
                  {entry.source.toUpperCase()}
                </Text>
                <Text style={styles.logMsg} numberOfLines={3}>
                  {entry.message}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    </View>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.accent.primary + '25',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.primary + '50',
  },
  tabInactive: {
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  tabTextActive: {
    ...typography.caption,
    color: colors.accent.primary,
    fontWeight: '700',
  },
  tabTextInactive: {
    ...typography.caption,
    color: colors.text.muted,
  },
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: { ...typography.h1, color: colors.text.primary },
  subtitle: { ...typography.caption, color: colors.text.muted, marginTop: 2 },
  exitBtn: {
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  exitText: { ...typography.caption, color: colors.text.secondary },

  startSection: { marginBottom: spacing.xl },
  startDesc: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  startBtn: {
    backgroundColor: colors.accent.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  startBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },

  runningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.primary + '15',
    borderWidth: 1,
    borderColor: colors.accent.primary + '40',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  runningText: { ...typography.body, color: colors.accent.primary, flex: 1 },
  stopBtn: {
    backgroundColor: colors.accent.danger + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  stopBtnText: { ...typography.caption, color: colors.accent.danger, fontWeight: '700' },

  resultCard: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  resultHeader: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  resultIndex: {
    ...typography.h3,
    color: colors.accent.primary,
    width: 28,
    textAlign: 'center',
  },
  resultTitle: { ...typography.body, color: colors.text.primary, fontWeight: '600' },
  resultDesc: { ...typography.caption, color: colors.text.muted, marginTop: 2, lineHeight: 18 },
  resultBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  actionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  actionText: { ...typography.caption, fontWeight: '700' },
  durationText: { ...typography.caption, color: colors.text.muted },

  nudgeBox: {
    backgroundColor: colors.bg.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.pink,
  },
  nudgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.pink,
    letterSpacing: 1,
    marginBottom: 4,
  },
  nudgeMessage: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },

  rerunBtn: {
    backgroundColor: colors.bg.elevated,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  rerunBtnText: { ...typography.body, color: colors.text.secondary, fontWeight: '600' },

  logSection: { marginTop: spacing.xl },
  logToggle: {
    backgroundColor: colors.bg.elevated,
    padding: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logToggleText: { ...typography.caption, color: colors.text.secondary, fontWeight: '700' },
  logContainer: {
    backgroundColor: '#0D0D0D',
    borderRadius: radius.md,
    padding: spacing.sm,
    maxHeight: 400,
  },
  logEmpty: { ...typography.caption, color: colors.text.muted, textAlign: 'center', padding: spacing.md },
  logRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    gap: 6,
  },
  logSource: {
    fontSize: 10,
    fontWeight: '800',
    width: 52,
    fontFamily: 'monospace',
  },
  logMsg: {
    fontSize: 11,
    color: '#CCC',
    flex: 1,
    fontFamily: 'monospace',
  },
});
