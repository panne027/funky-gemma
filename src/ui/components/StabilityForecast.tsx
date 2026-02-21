import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { HabitState } from '../../types';
import { predictMomentumDecay, getMomentumTier } from '../../core/habits/MomentumCalculator';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  habits: HabitState[];
}

export function StabilityForecast({ habits }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>STABILITY FORECAST</Text>

      {habits.map((habit) => {
        const daysToLow = predictMomentumDecay(habit, 35);
        const daysToCritical = predictMomentumDecay(habit, 15);
        const tier = getMomentumTier(habit.momentum_score);
        const tierColor = colors.momentum[tier];

        return (
          <View key={habit.id} style={styles.row}>
            <View style={styles.habitInfo}>
              <View style={[styles.dot, { backgroundColor: tierColor }]} />
              <Text style={styles.habitName}>{habit.name}</Text>
            </View>

            <View style={styles.forecasts}>
              {daysToCritical !== null && daysToCritical <= 3 ? (
                <Text style={[styles.forecast, styles.danger]}>
                  Critical in {daysToCritical}d
                </Text>
              ) : daysToLow !== null && daysToLow <= 5 ? (
                <Text style={[styles.forecast, styles.warning]}>
                  Low in {daysToLow}d
                </Text>
              ) : (
                <Text style={[styles.forecast, styles.safe]}>
                  Stable {daysToLow ? `${daysToLow}d+` : '7d+'}
                </Text>
              )}
            </View>
          </View>
        );
      })}
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
  title: {
    ...typography.caption,
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg.elevated,
  },
  habitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  habitName: {
    ...typography.body,
    color: colors.text.primary,
  },
  forecasts: {},
  forecast: {
    ...typography.caption,
    fontWeight: '600',
  },
  danger: {
    color: colors.accent.danger,
  },
  warning: {
    color: colors.accent.warning,
  },
  safe: {
    color: colors.accent.success,
  },
});
