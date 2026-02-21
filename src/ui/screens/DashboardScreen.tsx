import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { HabitCard } from '../components/HabitCard';
import { DemoMode } from '../demo/DemoMode';
import { agentLoop } from '../../core/agent/AgentLoop';
import { habitEngine } from '../../core/habits/HabitStateEngine';
import { functionGemma } from '../../core/cactus/FunctionGemmaClient';
import { notificationDispatcher } from '../../core/notifications/NotificationDispatcher';
import { storage } from '../../core/storage/LocalStorage';
import { aiLogger, type AILogEntry, type LogSource } from '../../core/logging/AILogger';
import { initScreenTimeTracking } from '../../core/context/signals/ScreenTimeSignal';
import { refreshCalendar } from '../../core/context/signals/CalendarSignal';
import { colors, spacing, typography, radius } from '../theme';

type BootPhase = 'init' | 'downloading' | 'loading' | 'ready';

const SOURCE_COLORS: Record<LogSource, string> = {
  cactus: '#F59E0B',
  gemma: '#8B5CF6',
  agent: '#3B82F6',
  nudge: '#EC4899',
  context: '#6B7280',
};

const SOURCE_LABELS: Record<LogSource, string> = {
  cactus: 'CACTUS',
  gemma: 'GEMMA',
  agent: 'AGENT',
  nudge: 'NUDGE',
  context: 'CTX',
};

export function DashboardScreen() {
  const {
    habits,
    latestCycle,
    agentRunning,
    demoMode,
    setHabits,
    setCycleResult,
    setActiveNudge,
    setAgentRunning,
    setModelLoaded,
    setDemoMode,
  } = useStore();

  const [bootPhase, setBootPhase] = useState<BootPhase>('init');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [inferenceMode, setInferenceMode] = useState<'native' | 'hybrid' | 'mock'>('mock');
  const [logs, setLogs] = useState<AILogEntry[]>([]);
  const logListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = aiLogger.subscribe((entry) => {
      setLogs((prev) => [...prev.slice(-100), entry]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await storage.initialize();
      await notificationDispatcher.initialize();
      initScreenTimeTracking();
      refreshCalendar().catch(() => {});

      setBootPhase('downloading');
      const loaded = await functionGemma.initialize(
        (progress: number) => {
          if (!cancelled) setDownloadProgress(progress);
        },
      );

      if (cancelled) return;
      setBootPhase('loading');
      setModelLoaded(loaded);
      const mode = functionGemma.isHybridMode ? 'hybrid' : functionGemma.isRealInference ? 'native' : 'mock';
      setInferenceMode(mode);

      const existingHabits = await storage.getHabits();
      if (Object.keys(existingHabits).length === 0) {
        await habitEngine.createDefaultHabits();
      }
      const allHabits = await storage.getHabits();
      setHabits(Object.values(allHabits));

      agentLoop.subscribe((result) => setCycleResult(result));
      notificationDispatcher.subscribe((nudge) => setActiveNudge(nudge));

      await agentLoop.start();
      setAgentRunning(true);
      setBootPhase('ready');
    }

    boot().catch((err) => console.error('[Boot] Error:', err));
    return () => {
      cancelled = true;
      agentLoop.stop();
    };
  }, [setCycleResult, setActiveNudge, setAgentRunning, setModelLoaded, setHabits]);

  const handleComplete = useCallback(
    async (habitId: string) => {
      await habitEngine.recordCompletion(habitId);
      const allHabits = await storage.getHabits();
      setHabits(Object.values(allHabits));
      await agentLoop.trigger('habit_completed');
    },
    [setHabits],
  );

  const triggerManualCycle = useCallback(async () => {
    await agentLoop.trigger('manual');
  }, []);

  if (demoMode) {
    return <DemoMode />;
  }

  // ── Boot screen ───────────────────────────────────────────────────
  if (bootPhase !== 'ready') {
    const pct = Math.round(downloadProgress * 100);
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />
        <Text style={styles.loadingIcon}>👉</Text>
        <Text style={styles.loadingTitle}>Nudgy-Nudge</Text>
        {bootPhase === 'init' && (
          <Text style={styles.loadingSubtitle}>Waking up...</Text>
        )}
        {bootPhase === 'downloading' && downloadProgress > 0 && (
          <View style={styles.downloadContainer}>
            <Text style={styles.loadingSubtitle}>Getting FunctionGemma brain...</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressText}>{pct}%</Text>
          </View>
        )}
        {bootPhase === 'downloading' && downloadProgress === 0 && (
          <Text style={styles.loadingSubtitle}>Checking for AI model...</Text>
        )}
        {bootPhase === 'loading' && (
          <Text style={styles.loadingSubtitle}>Loading brain into memory...</Text>
        )}
      </SafeAreaView>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>Nudgy-Nudge</Text>
            <Text style={[styles.appSubtitle, { color: inferenceMode === 'mock' ? '#F59E0B' : '#10B981' }]}>
              {inferenceMode === 'hybrid' ? '● Hybrid (local + Gemini cloud)' : inferenceMode === 'native' ? '● FunctionGemma on-device' : '● Offline fallback'}
            </Text>
          </View>
          <TouchableOpacity style={styles.demoBtn} onPress={() => setDemoMode(true)}>
            <Text style={styles.demoBtnText}>Demo</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <TouchableOpacity style={styles.triggerBtn} onPress={triggerManualCycle}>
          <Text style={styles.triggerBtnText}>Nudge Me Now</Text>
        </TouchableOpacity>

        {/* Habits */}
        <Text style={styles.sectionTitle}>HABITS</Text>
        {habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} onComplete={handleComplete} />
        ))}

        {/* AI Log Feed */}
        <Text style={styles.sectionTitle}>AI LOG</Text>
        <View style={styles.logContainer}>
          {logs.length === 0 && (
            <Text style={styles.logEmpty}>Waiting for first agent cycle...</Text>
          )}
          {logs.slice(-30).reverse().map((entry) => (
            <View key={entry.id} style={styles.logRow}>
              <View style={[styles.logBadge, { backgroundColor: SOURCE_COLORS[entry.source] + '30' }]}>
                <Text style={[styles.logBadgeText, { color: SOURCE_COLORS[entry.source] }]}>
                  {SOURCE_LABELS[entry.source]}
                </Text>
              </View>
              <Text style={styles.logMessage} numberOfLines={3}>
                {entry.message}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  appTitle: {
    ...typography.h1,
    color: colors.text.primary,
  },
  appSubtitle: {
    ...typography.caption,
    marginTop: 4,
  },
  demoBtn: {
    backgroundColor: colors.accent.warning + '22',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  demoBtnText: {
    ...typography.caption,
    color: colors.accent.warning,
    fontWeight: '700',
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.text.muted,
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  triggerBtn: {
    backgroundColor: colors.accent.primary + '20',
    borderWidth: 1,
    borderColor: colors.accent.primary + '40',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  triggerBtnText: {
    ...typography.body,
    color: colors.accent.primary,
    fontWeight: '600',
  },
  logContainer: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 200,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  logBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: spacing.sm,
    minWidth: 52,
    alignItems: 'center',
  },
  logBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logMessage: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 18,
  },
  logEmpty: {
    ...typography.caption,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  loadingTitle: {
    ...typography.h1,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  loadingSubtitle: {
    ...typography.body,
    color: colors.text.muted,
    textAlign: 'center',
  },
  downloadContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '80%',
    height: 8,
    backgroundColor: colors.bg.elevated,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
    borderRadius: 4,
  },
  progressText: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
});
