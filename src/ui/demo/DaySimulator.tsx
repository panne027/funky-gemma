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
import { setSimulatedTime } from '../../core/context/signals/TimeSignal';
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayEvent {
  hour: number;
  minute: number;
  type: 'meeting' | 'scroll' | 'exercise' | 'break' | 'check' | 'sleep_data';
  title: string;
  durationMin?: number;
  app?: string;
  exerciseType?: string;
}

interface TimelineEntry {
  simTime: string;
  event: string;
  agentAction: string | null;
  nudgeMessage: string | null;
  durationMs: number;
}

// ─── Random day generator ────────────────────────────────────────────────────

const MEETING_NAMES = [
  'Sprint Planning', 'Daily Standup', 'Design Review', '1:1 with Manager',
  'Team Sync', 'Product Roadmap', 'Client Call', 'Retrospective',
  'Brainstorm Session', 'Lunch & Learn', 'Architecture Review', 'Interview Panel',
];

const APPS = ['Instagram', 'Twitter', 'TikTok', 'Reddit', 'YouTube', 'LinkedIn', 'News'];
const EXERCISE_TYPES = ['gym', 'running', 'yoga', 'walking', 'cycling'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomDay(): DayEvent[] {
  const events: DayEvent[] = [];
  const isWeekend = Math.random() < 0.3;

  // Sleep data — random quality
  const sleepHours = isWeekend ? randInt(7, 9) + Math.random() : randInt(4, 8) + Math.random();
  events.push({
    hour: 6, minute: randInt(0, 30),
    type: 'sleep_data',
    title: `Sleep: ${sleepHours.toFixed(1)}h`,
  });

  // Morning check-in
  events.push({
    hour: randInt(6, 7), minute: randInt(15, 45),
    type: 'check', title: 'Morning check-in',
  });

  if (!isWeekend) {
    // Generate 2-5 meetings scattered through the work day
    const meetingCount = randInt(2, 5);
    const usedSlots = new Set<number>();

    for (let i = 0; i < meetingCount; i++) {
      let h = randInt(9, 16);
      while (usedSlots.has(h)) h = randInt(9, 16);
      usedSlots.add(h);

      events.push({
        hour: h, minute: randInt(0, 30),
        type: 'meeting',
        title: pick(MEETING_NAMES),
        durationMin: pick([30, 45, 60]),
      });
    }
  } else {
    // Weekend: maybe 1 casual event
    if (Math.random() > 0.5) {
      events.push({
        hour: randInt(10, 14), minute: randInt(0, 30),
        type: 'meeting',
        title: pick(['Brunch with friends', 'Coffee catch-up', 'Grocery run']),
        durationMin: randInt(45, 90),
      });
    }
  }

  // 2-4 doom-scroll sessions
  const scrollCount = randInt(2, 4);
  for (let i = 0; i < scrollCount; i++) {
    const h = randInt(8, 22);
    events.push({
      hour: h, minute: randInt(0, 50),
      type: 'scroll',
      title: `Scrolling ${pick(APPS)}`,
      durationMin: randInt(8, 35),
      app: pick(APPS),
    });
  }

  // Exercise session (70% chance)
  if (Math.random() < 0.7) {
    const exType = pick(EXERCISE_TYPES);
    events.push({
      hour: randInt(6, 19), minute: randInt(0, 30),
      type: 'exercise',
      title: `${exType.charAt(0).toUpperCase() + exType.slice(1)} session`,
      durationMin: randInt(20, 60),
      exerciseType: exType,
    });
  }

  // Periodic check-ins (agent would normally fire on interval)
  for (let h = 10; h <= 21; h += randInt(2, 4)) {
    if (Math.random() < 0.6) {
      events.push({
        hour: h, minute: randInt(0, 50),
        type: 'check', title: 'Periodic check',
      });
    }
  }

  // Late night scroll (bedtime)
  events.push({
    hour: randInt(22, 23), minute: randInt(0, 45),
    type: 'scroll',
    title: `Bedtime scrolling ${pick(['TikTok', 'Reddit', 'YouTube'])}`,
    durationMin: randInt(10, 25),
    app: pick(['TikTok', 'Reddit', 'YouTube']),
  });

  // Sort by time
  events.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  return events;
}

// ─── Build progressive state for each event ──────────────────────────────────

function buildDayState(events: DayEvent[]) {
  let stepsAccum = randInt(0, 200);
  let activeMinAccum = 0;
  let exerciseSessions = 0;
  let lastExType: string | null = null;
  let caloriesAccum = randInt(20, 60);
  let sleepH: number | null = null;
  let restingHR = randInt(58, 72);

  const calendarEvents: Array<{ title: string; startMs: number; endMs: number }> = [];
  for (const ev of events) {
    if (ev.type === 'meeting' && ev.durationMin) {
      const startMs = (ev.hour * 60 + ev.minute) * 60000;
      calendarEvents.push({
        title: ev.title,
        startMs,
        endMs: startMs + ev.durationMin * 60000,
      });
    }
  }

  return events.map((ev) => {
    const timeMs = (ev.hour * 60 + ev.minute) * 60000;

    // Accumulate steps through the day
    stepsAccum += randInt(200, 800);
    caloriesAccum += randInt(15, 50);

    if (ev.type === 'sleep_data') {
      sleepH = parseFloat(ev.title.match(/Sleep:\s*([\d.]+)h/)?.[1] ?? '7');
    }

    if (ev.type === 'exercise') {
      stepsAccum += randInt(2000, 6000);
      activeMinAccum += ev.durationMin ?? 30;
      exerciseSessions++;
      lastExType = ev.exerciseType ?? 'workout';
      caloriesAccum += randInt(150, 400);
      restingHR += randInt(5, 15);
    }

    // Find meetings around current time
    const recentlyEnded = calendarEvents.find(
      (c) => c.endMs <= timeMs && c.endMs > timeMs - 10 * 60000,
    );
    const upcoming = calendarEvents
      .filter((c) => c.startMs > timeMs)
      .sort((a, b) => a.startMs - b.startMs);
    const current = calendarEvents.find(
      (c) => c.startMs <= timeMs && c.endMs > timeMs,
    );

    return {
      event: ev,
      state: {
        steps: stepsAccum,
        activeMin: activeMinAccum,
        exerciseSessions,
        lastExType,
        calories: caloriesAccum,
        sleepH,
        restingHR: Math.min(restingHR, 95),
        batteryLevel: Math.max(0.08, 1 - (ev.hour - 6) * 0.05 + Math.random() * 0.05),
        recentlyEndedMeeting: recentlyEnded?.title ?? null,
        currentMeeting: current?.title ?? null,
        upcomingMeetings: upcoming.map((u) => ({
          title: u.title,
          minutesAway: Math.round((u.startMs - timeMs) / 60000),
          durationMin: Math.round((u.endMs - u.startMs) / 60000),
        })),
      },
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const SPEED = 100;
const MS_PER_SIM_MINUTE = (60 * 1000) / SPEED; // 600ms real = 1 sim minute

export function DaySimulator() {
  const [running, setRunning] = useState(false);
  const [simClock, setSimClock] = useState('06:00');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [currentEventIdx, setCurrentEventIdx] = useState(-1);
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [stats, setStats] = useState({ nudges: 0, delays: 0, tools: 0 });
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef(false);
  const { setDemoMode } = useStore();

  useEffect(() => {
    const unsub = aiLogger.subscribe((entry) => {
      setLogs((prev) => [...prev.slice(-80), entry]);
    });
    return unsub;
  }, []);

  const regenerateDay = useCallback(() => {
    const events = generateRandomDay();
    setDayEvents(events);
    setTimeline([]);
    setCurrentEventIdx(-1);
    setStats({ nudges: 0, delays: 0, tools: 0 });
  }, []);

  useEffect(() => {
    regenerateDay();
  }, [regenerateDay]);

  const formatTime = (h: number, m: number): string => {
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  const runDay = useCallback(async () => {
    if (dayEvents.length === 0) return;
    abortRef.current = false;
    setRunning(true);
    setTimeline([]);
    setStats({ nudges: 0, delays: 0, tools: 0 });
    aiLogger.clear();
    setLogs([]);

    resetNotificationCounters();
    await habitEngine.createDefaultHabits();

    const dayWithState = buildDayState(dayEvents);
    let nudgeCount = 0;
    let delayCount = 0;
    let toolCount = 0;

    for (let i = 0; i < dayWithState.length; i++) {
      if (abortRef.current) break;

      const { event, state } = dayWithState[i];
      setCurrentEventIdx(i);
      setSimClock(formatTime(event.hour, event.minute));

      // Set simulated time
      setSimulatedTime(event.hour, event.minute);

      // Set context signals based on event type
      resetScrollSession();
      setSimulatedScreen(true, event.app ?? null);
      setSimulatedBattery(state.batteryLevel, state.batteryLevel > 0.9);

      setSimulatedHealth({
        steps_today: state.steps,
        sleep_hours_last_night: state.sleepH,
        resting_heart_rate: state.restingHR,
        active_minutes_today: state.activeMin,
        exercise_sessions_today: state.exerciseSessions,
        last_exercise_type: state.lastExType,
        last_exercise_timestamp: state.lastExType ? Date.now() - 5 * 60000 : null,
        calories_burned_today: state.calories,
      });

      // Calendar setup
      const calEvents = state.upcomingMeetings.map((m) => ({
        title: m.title,
        startTime: Date.now() + m.minutesAway * 60000,
        endTime: Date.now() + (m.minutesAway + m.durationMin) * 60000,
      }));
      setSimulatedCalendar(calEvents);

      if (state.recentlyEndedMeeting) {
        simulateEventEnd({
          title: state.recentlyEndedMeeting,
          startTime: Date.now() - 35 * 60000,
          endTime: Date.now() - 2 * 60000,
        });
      }

      // Event-type-specific setup
      if (event.type === 'scroll') {
        setSimulatedScroll(event.durationMin ?? 15);
        setSimulatedMotion('still');
      } else if (event.type === 'exercise') {
        setSimulatedMotion(event.exerciseType === 'running' ? 'running' : 'walking');
        if (event.exerciseType === 'gym' || event.exerciseType === 'running') {
          await habitEngine.recordCompletion('gym').catch(() => {});
        }
        if (event.exerciseType === 'walking') {
          await habitEngine.recordCompletion('daily_walk').catch(() => {});
        }
      } else {
        setSimulatedMotion('still');
      }

      // Small delay for signal settlement
      await sleep(100);

      // Determine trigger type
      let trigger: 'interval' | 'prolonged_scrolling' | 'calendar_event_ended' | 'exercise_detected' | 'health_milestone' = 'interval';
      if (event.type === 'scroll' && (event.durationMin ?? 0) > 12) trigger = 'prolonged_scrolling';
      if (state.recentlyEndedMeeting) trigger = 'calendar_event_ended';
      if (event.type === 'exercise') trigger = 'exercise_detected';

      // Run agent cycle
      const start = Date.now();
      await agentLoop.trigger(trigger);
      const elapsed = Date.now() - start;

      const cycle = useStore.getState().latestCycle;
      const toolCall = cycle?.tool_call;
      const action = toolCall?.name ?? 'no_action';

      if (action === 'send_nudge' || action === 'celebrate_milestone' || action === 'suggest_habit_stack') nudgeCount++;
      else if (action === 'delay_nudge' || action === 'increase_cooldown') delayCount++;
      else toolCount++;

      let nudgeMsg: string | null = null;
      if (toolCall) {
        const args = toolCall.arguments as any;
        if (args.message) nudgeMsg = args.message;
        else if (args.reason) nudgeMsg = `[${action}: ${args.reason}]`;
        else if (args.item) nudgeMsg = `[shopping: ${args.item}]`;
        else if (args.title) nudgeMsg = `[${action}: ${args.title}]`;
      }

      const entry: TimelineEntry = {
        simTime: formatTime(event.hour, event.minute),
        event: event.title,
        agentAction: action,
        nudgeMessage: nudgeMsg,
        durationMs: elapsed,
      };

      setTimeline((prev) => [...prev, entry]);
      setStats({ nudges: nudgeCount, delays: delayCount, tools: toolCount });

      // Wait proportional to time gap until next event (at 100x speed)
      if (i < dayWithState.length - 1) {
        const nextEv = dayWithState[i + 1].event;
        const gapMin = (nextEv.hour * 60 + nextEv.minute) - (event.hour * 60 + event.minute);
        const realWaitMs = Math.min(Math.max(gapMin * MS_PER_SIM_MINUTE, 800), 5000);
        await sleep(realWaitMs);
      }
    }

    // Reset simulated time
    setSimulatedTime(null);
    setRunning(false);
    setCurrentEventIdx(-1);
  }, [dayEvents]);

  const stopSim = useCallback(() => {
    abortRef.current = true;
    setSimulatedTime(null);
  }, []);

  const eventTypeIcon = (type: string) => {
    switch (type) {
      case 'meeting': return '\u{1F4C5}';
      case 'scroll': return '\u{1F4F1}';
      case 'exercise': return '\u{1F3CB}';
      case 'sleep_data': return '\u{1F634}';
      case 'check': return '\u{1F50D}';
      default: return '\u{2022}';
    }
  };

  const actionColor = (action: string | null) => {
    if (!action || action === 'no_action') return colors.text.muted;
    if (action === 'send_nudge') return colors.accent.pink;
    if (action === 'celebrate_milestone') return '#FFD700';
    if (action === 'delay_nudge' || action === 'increase_cooldown') return colors.text.muted;
    if (action.includes('calendar') || action.includes('google')) return colors.accent.info;
    if (action.includes('shopping')) return colors.accent.success;
    return colors.accent.warning;
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Day Simulator</Text>
          <Text style={styles.subtitle}>{SPEED}x speed — {dayEvents.length} events</Text>
        </View>
        <TouchableOpacity onPress={() => { setSimulatedTime(null); setDemoMode(false); }} style={styles.exitBtn}>
          <Text style={styles.exitText}>Exit</Text>
        </TouchableOpacity>
      </View>

      {/* Virtual clock */}
      <View style={styles.clockBar}>
        <Text style={styles.clockTime}>{simClock}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: colors.accent.pink }]}>{stats.nudges}</Text>
            <Text style={styles.statLabel}>nudges</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: colors.accent.warning }]}>{stats.tools}</Text>
            <Text style={styles.statLabel}>tools</Text>
          </View>
          <View style={styles.statBadge}>
            <Text style={[styles.statNum, { color: colors.text.muted }]}>{stats.delays}</Text>
            <Text style={styles.statLabel}>delays</Text>
          </View>
        </View>
      </View>

      {/* Scheduled day preview */}
      {!running && timeline.length === 0 && (
        <View style={styles.previewSection}>
          <Text style={styles.sectionLabel}>TODAY'S GENERATED SCHEDULE</Text>
          {dayEvents.map((ev, i) => (
            <View key={`${ev.hour}-${ev.minute}-${i}`} style={styles.previewRow}>
              <Text style={styles.previewTime}>{formatTime(ev.hour, ev.minute)}</Text>
              <Text style={styles.previewIcon}>{eventTypeIcon(ev.type)}</Text>
              <Text style={styles.previewTitle}>{ev.title}</Text>
              {ev.durationMin && <Text style={styles.previewDur}>{ev.durationMin}min</Text>}
            </View>
          ))}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.regenBtn} onPress={regenerateDay}>
              <Text style={styles.regenBtnText}>Randomize New Day</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.startBtn} onPress={runDay}>
              <Text style={styles.startBtnText}>Run at {SPEED}x</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Running indicator */}
      {running && (
        <View style={styles.runningBar}>
          <ActivityIndicator color={colors.accent.primary} size="small" />
          <Text style={styles.runningText}>
            {currentEventIdx >= 0 ? dayEvents[currentEventIdx]?.title : 'Starting...'}
          </Text>
          <TouchableOpacity onPress={stopSim} style={styles.stopBtn}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <View style={styles.timelineSection}>
          <Text style={styles.sectionLabel}>TIMELINE</Text>
          {timeline.map((entry, i) => (
            <View key={i} style={styles.tlRow}>
              <View style={styles.tlTimeCol}>
                <Text style={styles.tlTime}>{entry.simTime}</Text>
              </View>
              <View style={[styles.tlDot, { backgroundColor: actionColor(entry.agentAction) }]} />
              <View style={styles.tlContent}>
                <Text style={styles.tlEvent}>{entry.event}</Text>
                <View style={styles.tlActionRow}>
                  <Text style={[styles.tlAction, { color: actionColor(entry.agentAction) }]}>
                    {entry.agentAction}
                  </Text>
                  <Text style={styles.tlDuration}>{entry.durationMs}ms</Text>
                </View>
                {entry.nudgeMessage && (
                  <View style={styles.tlNudge}>
                    <Text style={styles.tlNudgeText}>{entry.nudgeMessage}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Restart */}
      {!running && timeline.length > 0 && (
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.regenBtn} onPress={() => { regenerateDay(); }}>
            <Text style={styles.regenBtnText}>New Random Day</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.startBtn} onPress={runDay}>
            <Text style={styles.startBtnText}>Run Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Log panel */}
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
              <Text style={styles.logEmpty}>No logs yet</Text>
            )}
            {logs.slice(-40).map((entry) => (
              <View key={entry.id} style={styles.logRow}>
                <Text style={[styles.logSource, { color: LOG_COLORS[entry.source] ?? colors.text.muted }]}>
                  {entry.source.toUpperCase()}
                </Text>
                <Text style={styles.logMsg} numberOfLines={2}>
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

const LOG_COLORS: Record<string, string> = {
  cactus: '#6C63FF',
  gemma: '#FF6584',
  agent: '#43E97B',
  nudge: '#FFD93D',
  context: '#4FC3F7',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
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

  clockBar: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clockTime: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statBadge: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { ...typography.caption, color: colors.text.muted, marginTop: 2 },

  previewSection: { marginBottom: spacing.lg },
  sectionLabel: {
    ...typography.caption,
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  previewTime: {
    ...typography.caption,
    color: colors.text.secondary,
    width: 62,
    fontVariant: ['tabular-nums'],
  },
  previewIcon: { fontSize: 14, width: 22, textAlign: 'center' },
  previewTitle: { ...typography.body, color: colors.text.primary, flex: 1 },
  previewDur: { ...typography.caption, color: colors.text.muted },

  btnRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  regenBtn: {
    flex: 1,
    backgroundColor: colors.bg.elevated,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  regenBtnText: { ...typography.body, color: colors.text.secondary, fontWeight: '600' },
  startBtn: {
    flex: 1,
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

  timelineSection: { marginBottom: spacing.lg },
  tlRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  tlTimeCol: { width: 60, paddingTop: 2 },
  tlTime: {
    ...typography.caption,
    color: colors.text.muted,
    fontVariant: ['tabular-nums'],
  },
  tlDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    marginRight: spacing.sm,
  },
  tlContent: { flex: 1 },
  tlEvent: { ...typography.body, color: colors.text.primary, fontWeight: '500' },
  tlActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  tlAction: { ...typography.caption, fontWeight: '700' },
  tlDuration: { ...typography.caption, color: colors.text.muted },
  tlNudge: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.pink,
  },
  tlNudgeText: { ...typography.caption, color: colors.text.secondary, lineHeight: 18 },

  logSection: { marginTop: spacing.lg },
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
