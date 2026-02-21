import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { HabitState } from '../../types';
import { isInRecovery } from '../../core/habits/MomentumCalculator';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  habits: HabitState[];
}

export function RecoveryMode({ habits }: Props) {
  const recovering = habits.filter(isInRecovery);

  if (recovering.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🩹</Text>
        <Text style={styles.title}>Recovery Mode</Text>
      </View>

      <Text style={styles.description}>
        {recovering.length === 1
          ? `${recovering[0].name} has lost momentum. The agent will use gentle nudges and shorter goals to rebuild.`
          : `${recovering.length} habits have lost momentum. The agent is in gentle recovery mode.`}
      </Text>

      {recovering.map((habit) => (
        <View key={habit.id} style={styles.habitRow}>
          <View style={styles.statusDot} />
          <Text style={styles.habitName}>{habit.name}</Text>
          <Text style={styles.streakText}>
            Streak: {habit.streak_count} | Rate: {(habit.completion_rate_7d * 100).toFixed(0)}%
          </Text>
        </View>
      ))}

      <Text style={styles.hint}>
        Complete just one session to start rebuilding momentum.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accent.danger + '12',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent.danger + '30',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.accent.danger,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.danger,
    marginRight: spacing.sm,
  },
  habitName: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
  },
  streakText: {
    ...typography.caption,
    color: colors.text.muted,
  },
  hint: {
    ...typography.caption,
    color: colors.accent.warning,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
