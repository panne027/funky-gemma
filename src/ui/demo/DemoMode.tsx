import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import type { DemoEvent } from '../../types';
import { agentLoop } from '../../core/agent/AgentLoop';
import { setSimulatedScroll, resetScrollSession } from '../../core/context/signals/ScrollSignal';
import { setSimulatedCalendar, simulateEventEnd } from '../../core/context/signals/CalendarSignal';
import { setSimulatedMotion } from '../../core/context/signals/MotionSignal';
import { setSimulatedScreen } from '../../core/context/signals/ScreenTimeSignal';
import { habitEngine } from '../../core/habits/HabitStateEngine';
import { useStore } from '../store';
import { colors, spacing, typography, radius } from '../theme';

const DEMO_EVENTS: DemoEvent[] = [
  {
    type: 'scroll',
    payload: { minutes: 20 },
    label: '📱 Simulate 20min Doom Scroll',
  },
  {
    type: 'calendar_end',
    payload: { event: 'Team Standup' },
    label: '📅 End Calendar Event',
  },
  {
    type: 'inactivity',
    payload: { minutes: 45 },
    label: '😴 Simulate 45min Inactivity',
  },
  {
    type: 'habit_complete',
    payload: { habit_id: 'gym' },
    label: '💪 Complete Gym Session',
  },
  {
    type: 'habit_complete',
    payload: { habit_id: 'laundry' },
    label: '🧺 Complete Laundry',
  },
  {
    type: 'habit_complete',
    payload: { habit_id: 'reading' },
    label: '📚 Complete Reading',
  },
  {
    type: 'time_skip',
    payload: { hours: 6 },
    label: '⏩ Skip 6 Hours',
  },
];

export function DemoMode() {
  const [executing, setExecuting] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [accelerated, setAccelerated] = useState(false);
  const { setDemoMode } = useStore();

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  }, []);

  const handleEvent = useCallback(
    async (event: DemoEvent) => {
      setExecuting(event.label);
      addLog(`Triggering: ${event.label}`);

      try {
        switch (event.type) {
          case 'scroll':
            setSimulatedScroll(event.payload.minutes as number);
            setSimulatedScreen(true, 'Instagram');
            addLog(`Simulated ${event.payload.minutes}min continuous scroll`);
            await agentLoop.trigger('prolonged_scrolling');
            break;

          case 'calendar_end':
            simulateEventEnd({
              title: event.payload.event as string,
              startTime: Date.now() - 30 * 60 * 1000,
              endTime: Date.now(),
            });
            addLog(`Calendar event ended: "${event.payload.event}"`);
            await agentLoop.trigger('calendar_event_ended');
            break;

          case 'inactivity':
            setSimulatedScreen(false);
            setSimulatedMotion('still');
            resetScrollSession();
            addLog(`Simulated ${event.payload.minutes}min inactivity`);
            await agentLoop.trigger('prolonged_inactivity');
            break;

          case 'habit_complete': {
            const habitId = event.payload.habit_id as string;
            await habitEngine.recordCompletion(habitId);
            addLog(`Recorded completion: ${habitId}`);
            await agentLoop.trigger('habit_completed');
            break;
          }

          case 'time_skip':
            addLog(`Time skip: +${event.payload.hours}h (simulated via agent cycle)`);
            await agentLoop.trigger('demo');
            break;
        }

        const result = useStore.getState().latestCycle;
        if (result?.tool_call) {
          addLog(
            `Agent decided: ${result.tool_call.name}(${JSON.stringify(result.tool_call.arguments)})`,
          );
        } else {
          addLog('Agent cycle completed — no tool call emitted');
        }
      } catch (err) {
        addLog(`Error: ${err}`);
      }

      setExecuting(null);
    },
    [addLog],
  );

  const toggleAcceleration = useCallback(
    (value: boolean) => {
      setAccelerated(value);
      if (value) {
        agentLoop.setIntervalMs(5_000); // 5-second cycles
        addLog('Time acceleration ON — 5s agent cycles');
      } else {
        agentLoop.setIntervalMs(12 * 60 * 1000);
        addLog('Time acceleration OFF — normal 12min cycles');
      }
    },
    [addLog],
  );

  const initDemoHabits = useCallback(async () => {
    await habitEngine.createDefaultHabits();
    addLog('Default habits created: gym, laundry, reading');

    // Set up some calendar events
    const now = Date.now();
    setSimulatedCalendar([
      { title: 'Morning Standup', startTime: now + 30 * 60000, endTime: now + 45 * 60000 },
      { title: 'Lunch Break', startTime: now + 180 * 60000, endTime: now + 240 * 60000 },
    ]);
    addLog('Simulated calendar events set');
  }, [addLog]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Demo Mode</Text>
        <TouchableOpacity onPress={() => setDemoMode(false)} style={styles.exitBtn}>
          <Text style={styles.exitText}>Exit Demo</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.initBtn} onPress={initDemoHabits}>
        <Text style={styles.initBtnText}>Initialize Demo Habits</Text>
      </TouchableOpacity>

      <View style={styles.accelRow}>
        <Text style={styles.accelLabel}>Time Acceleration (5s cycles)</Text>
        <Switch
          value={accelerated}
          onValueChange={toggleAcceleration}
          trackColor={{ false: colors.bg.elevated, true: colors.accent.primary + '60' }}
          thumbColor={accelerated ? colors.accent.primary : colors.text.muted}
        />
      </View>

      <Text style={styles.sectionTitle}>SIMULATE EVENTS</Text>

      {DEMO_EVENTS.map((event) => (
        <TouchableOpacity
          key={event.label}
          style={[
            styles.eventBtn,
            executing === event.label && styles.eventBtnActive,
          ]}
          onPress={() => handleEvent(event)}
          disabled={executing !== null}
        >
          <Text style={styles.eventBtnText}>{event.label}</Text>
          {executing === event.label && (
            <Text style={styles.executingText}>Running...</Text>
          )}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>AGENT LOG</Text>

      <View style={styles.logContainer}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>
            No events yet. Initialize habits and trigger events above.
          </Text>
        ) : (
          log.map((entry, i) => (
            <Text key={i} style={styles.logEntry}>
              {entry}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  content: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.accent.warning,
  },
  exitBtn: {
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  exitText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  initBtn: {
    backgroundColor: colors.accent.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  initBtnText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '700',
  },
  accelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  accelLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  eventBtn: {
    backgroundColor: colors.bg.card,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventBtnActive: {
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  eventBtnText: {
    ...typography.body,
    color: colors.text.primary,
  },
  executingText: {
    ...typography.caption,
    color: colors.accent.primary,
  },
  logContainer: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 200,
  },
  logEmpty: {
    ...typography.caption,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  logEntry: {
    ...typography.mono,
    color: colors.accent.success,
    lineHeight: 20,
    marginBottom: 4,
  },
});
