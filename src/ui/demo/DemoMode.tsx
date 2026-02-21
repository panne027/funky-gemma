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
import { resetNotificationCounters } from '../../core/context/ContextAggregator';
import { habitEngine } from '../../core/habits/HabitStateEngine';
import { aiLogger, type AILogEntry } from '../../core/logging/AILogger';
import { useStore } from '../store';
import { colors, spacing, typography, radius } from '../theme';

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
    description: 'You just woke up, phone screen on for 2 min. Calendar shows "Sprint Planning" at 10am. Gym streak is active.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
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
    description: 'You\'ve been scrolling Instagram for 22 minutes. Sprint Planning is in 15 min. Gym momentum dropping.',
    setup: () => {
      setSimulatedScroll(22);
      setSimulatedScreen(true, 'Instagram');
      setSimulatedMotion('still');
    },
    trigger: () => agentLoop.trigger('prolonged_scrolling').then(() => {}),
  },
  {
    id: 'post-standup',
    title: '10:32am — Sprint Planning just ended',
    description: '"Sprint Planning" just finished. You have 88 min free until "Lunch with Sam". Sitting at desk.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      simulateEventEnd({
        title: 'Sprint Planning',
        startTime: Date.now() - 60 * 60000,
        endTime: Date.now(),
      });
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
    description: 'Lunch is over. You\'ve been on your phone for 35 min straight, scrolling Twitter. Reading habit at 20% momentum.',
    setup: () => {
      setSimulatedScroll(18);
      setSimulatedScreen(true, 'Twitter');
      setSimulatedMotion('still');
      setSimulatedCalendar([
        { title: '1:1 with Manager', startTime: Date.now() + 75 * 60000, endTime: Date.now() + 105 * 60000 },
      ]);
    },
    trigger: () => agentLoop.trigger('prolonged_scrolling').then(() => {}),
  },
  {
    id: 'post-meeting-free',
    title: '2:35pm — Last meeting done, evening free',
    description: '"1:1 with Manager" just ended. Nothing else on calendar tonight. Gym momentum is low, reading untouched.',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('still');
      simulateEventEnd({
        title: '1:1 with Manager',
        startTime: Date.now() - 30 * 60000,
        endTime: Date.now(),
      });
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('calendar_event_ended').then(() => {}),
  },
  {
    id: 'evening-couch',
    title: '7:20pm — Evening on the couch',
    description: 'Home for the evening. Been on phone 45 min. No gym today yet. Laundry running low on clean gym clothes.',
    setup: () => {
      setSimulatedScroll(12);
      setSimulatedScreen(true, 'YouTube');
      setSimulatedMotion('still');
      setSimulatedCalendar([]);
    },
    trigger: () => agentLoop.trigger('interval').then(() => {}),
  },
  {
    id: 'gym-done',
    title: '8:15pm — Just finished gym!',
    description: 'You completed your gym session. Streak extended! But laundry pile is growing...',
    setup: () => {
      resetScrollSession();
      setSimulatedScreen(true);
      setSimulatedMotion('walking');
      setSimulatedCalendar([]);
    },
    trigger: async () => {
      await habitEngine.recordCompletion('gym');
      await agentLoop.trigger('habit_completed');
    },
  },
  {
    id: 'bedtime-reading',
    title: '10:30pm — Bedtime, scrolling instead of reading',
    description: 'It\'s late, you\'re in bed scrolling TikTok for 15 min. Reading streak about to break. Perfect wind-down moment.',
    setup: () => {
      setSimulatedScroll(15);
      setSimulatedScreen(true, 'TikTok');
      setSimulatedMotion('still');
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

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Simulation</Text>
          <Text style={styles.subtitle}>8 scenarios, real nudges</Text>
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
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
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
