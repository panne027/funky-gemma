import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { HabitState } from '../../types';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  habits: HabitState[];
}

type OverallTier = 'dormant' | 'warming_up' | 'building' | 'on_fire' | 'unstoppable';

const TIER_CONFIG: Record<OverallTier, { label: string; color: string; emoji: string }> = {
  dormant:     { label: 'Dormant',     color: '#6B7280', emoji: '\u{1F4A4}' },
  warming_up:  { label: 'Warming Up',  color: '#F59E0B', emoji: '\u{1F31F}' },
  building:    { label: 'Building',    color: '#3B82F6', emoji: '\u{26A1}' },
  on_fire:     { label: 'On Fire',     color: '#F97316', emoji: '\u{1F525}' },
  unstoppable: { label: 'Unstoppable', color: '#8B5CF6', emoji: '\u{1F680}' },
};

function computeOverallScore(habits: HabitState[]): {
  score: number;
  tier: OverallTier;
  streakBonus: number;
  activeHabits: number;
  totalHabits: number;
  longestStreak: number;
} {
  if (habits.length === 0) {
    return { score: 0, tier: 'dormant', streakBonus: 0, activeHabits: 0, totalHabits: 0, longestStreak: 0 };
  }

  const totalHabits = habits.length;
  const avgMomentum = habits.reduce((s, h) => s + h.momentum_score, 0) / totalHabits;
  const activeHabits = habits.filter((h) => h.momentum_score > 15).length;
  const longestStreak = Math.max(...habits.map((h) => h.streak_count), 0);
  const totalStreakDays = habits.reduce((s, h) => s + h.streak_count, 0);

  // Streak multiplier: more combined streak days = higher bonus (log scale)
  const streakBonus = Math.min(20, Math.log2(totalStreakDays + 1) * 5);

  // Active ratio bonus: reward having ALL habits active vs just one
  const activeRatio = activeHabits / totalHabits;
  const diversityBonus = activeRatio * 15;

  // Completion consistency bonus
  const avgCompletion = habits.reduce((s, h) => s + h.completion_rate_7d, 0) / totalHabits;
  const consistencyBonus = avgCompletion * 10;

  const raw = avgMomentum + streakBonus + diversityBonus + consistencyBonus;
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  let tier: OverallTier;
  if (score < 15) tier = 'dormant';
  else if (score < 35) tier = 'warming_up';
  else if (score < 55) tier = 'building';
  else if (score < 78) tier = 'on_fire';
  else tier = 'unstoppable';

  return { score, tier, streakBonus: Math.round(streakBonus), activeHabits, totalHabits, longestStreak };
}

export function OverallMomentum({ habits }: Props) {
  const data = useMemo(() => computeOverallScore(habits), [habits]);
  const cfg = TIER_CONFIG[data.tier];

  return (
    <View style={styles.container}>
      <View style={styles.scoreRow}>
        <Text style={styles.emoji}>{cfg.emoji}</Text>
        <View style={styles.scoreCol}>
          <View style={styles.scoreValueRow}>
            <Text style={[styles.score, { color: cfg.color }]}>{data.score}</Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <Text style={[styles.tierLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={styles.statsCol}>
          <MiniStat label="Active" value={`${data.activeHabits}/${data.totalHabits}`} />
          <MiniStat label="Best Streak" value={`${data.longestStreak}d`} />
          <MiniStat label="Streak Bonus" value={`+${data.streakBonus}`} />
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${data.score}%`, backgroundColor: cfg.color }]} />
        {/* Tier markers */}
        <View style={[styles.tierMark, { left: '15%' }]} />
        <View style={[styles.tierMark, { left: '35%' }]} />
        <View style={[styles.tierMark, { left: '55%' }]} />
        <View style={[styles.tierMark, { left: '78%' }]} />
      </View>

      <View style={styles.tierLabels}>
        <Text style={styles.tierSmall}>{'\u{1F4A4}'}</Text>
        <Text style={styles.tierSmall}>{'\u{1F31F}'}</Text>
        <Text style={styles.tierSmall}>{'\u{26A1}'}</Text>
        <Text style={styles.tierSmall}>{'\u{1F525}'}</Text>
        <Text style={styles.tierSmall}>{'\u{1F680}'}</Text>
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emoji: {
    fontSize: 36,
    marginRight: spacing.md,
  },
  scoreCol: {
    flex: 1,
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  score: {
    fontSize: 42,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreMax: {
    fontSize: 18,
    color: colors.text.muted,
    fontWeight: '500',
    marginLeft: 2,
  },
  tierLabel: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  statsCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  miniLabel: {
    fontSize: 10,
    color: colors.text.muted,
  },
  miniValue: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'right',
  },
  barTrack: {
    height: 8,
    backgroundColor: colors.bg.elevated,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  tierMark: {
    position: 'absolute',
    top: 0,
    width: 1.5,
    height: '100%',
    backgroundColor: colors.bg.primary + 'AA',
  },
  tierLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  tierSmall: {
    fontSize: 10,
  },
});
