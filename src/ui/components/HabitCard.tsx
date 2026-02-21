import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { HabitState, LaundryState } from '../../types';
import { getMomentumTier } from '../../core/habits/MomentumCalculator';
import { predictDepletion } from '../../core/habits/LaundryPredictor';
import { MomentumMeter } from './MomentumMeter';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  habit: HabitState;
  onComplete: (habitId: string) => void;
  onPress?: (habitId: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  fitness: '💪',
  hygiene: '🧺',
  learning: '📚',
  health: '❤️',
  custom: '⭐',
};

export function HabitCard({ habit, onComplete, onPress }: Props) {
  const tier = getMomentumTier(habit.momentum_score);
  const tierColor = colors.momentum[tier];
  const coolingDown = habit.cooldown_until > Date.now();
  const icon = CATEGORY_ICONS[habit.category] ?? '⭐';
  const isLaundry = habit.id === 'laundry' && 'total_gym_clothes' in (habit.metadata ?? {});

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(habit.id)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{habit.name}</Text>
          <Text style={styles.streak}>
            {habit.streak_count > 0
              ? `${habit.streak_count}-day streak`
              : 'No active streak'}
          </Text>
        </View>
        {coolingDown && (
          <View style={styles.cooldownBadge}>
            <Text style={styles.cooldownText}>⏸ Cooldown</Text>
          </View>
        )}
      </View>

      <MomentumMeter score={habit.momentum_score} habitName={habit.name} compact />

      {isLaundry && <LaundryInfo state={habit as LaundryState} />}

      <View style={styles.footer}>
        <View style={styles.stats}>
          <StatChip label="7d" value={`${(habit.completion_rate_7d * 100).toFixed(0)}%`} />
          <StatChip label="Friction" value={habit.friction_score.toFixed(2)} />
          <StatChip label="Resist" value={habit.resistance_score.toFixed(2)} />
        </View>

        <TouchableOpacity
          style={[styles.completeBtn, { backgroundColor: tierColor }]}
          onPress={() => onComplete(habit.id)}
        >
          <Text style={styles.completeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function LaundryInfo({ state }: { state: LaundryState }) {
  const forecast = predictDepletion(state);
  const urgencyColors = {
    none: colors.accent.success,
    low: colors.accent.info,
    medium: colors.accent.warning,
    high: colors.accent.danger,
    critical: '#DC2626',
  };

  return (
    <View style={styles.laundryBox}>
      <Text style={styles.laundryTitle}>Gym Clothes Inventory</Text>
      <View style={styles.laundryRow}>
        <Text style={styles.laundryText}>
          Clean: {state.metadata.clean_count}/{state.metadata.total_gym_clothes}
        </Text>
        <Text style={[styles.laundryUrgency, { color: urgencyColors[forecast.urgency] }]}>
          {forecast.urgency === 'none'
            ? 'All good'
            : `Wash in ${forecast.days_until_depletion}d`}
        </Text>
      </View>
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...typography.h3,
    color: colors.text.primary,
  },
  streak: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  cooldownBadge: {
    backgroundColor: colors.accent.warning + '22',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  cooldownText: {
    ...typography.caption,
    color: colors.accent.warning,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statChip: {
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: colors.text.muted,
    textTransform: 'uppercase',
  },
  statValue: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  completeBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  completeBtnText: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '700',
  },
  laundryBox: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  laundryTitle: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  laundryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  laundryText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  laundryUrgency: {
    ...typography.caption,
    fontWeight: '600',
  },
});
