import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  friction: number; // 0–1
  resistance: number; // 0–1
  habitName: string;
}

function getLevel(value: number): { label: string; color: string } {
  if (value < 0.2) return { label: 'Low', color: colors.accent.success };
  if (value < 0.4) return { label: 'Moderate', color: colors.accent.info };
  if (value < 0.6) return { label: 'Elevated', color: colors.accent.warning };
  if (value < 0.8) return { label: 'High', color: colors.accent.danger };
  return { label: 'Critical', color: '#DC2626' };
}

export function FrictionIndicator({ friction, resistance, habitName }: Props) {
  const frictionLevel = getLevel(friction);
  const resistanceLevel = getLevel(resistance);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{habitName} — Barriers</Text>

      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>Friction</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${friction * 100}%`,
                  backgroundColor: frictionLevel.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.value, { color: frictionLevel.color }]}>
            {frictionLevel.label} ({(friction * 100).toFixed(0)}%)
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.metric}>
          <Text style={styles.label}>Resistance</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${resistance * 100}%`,
                  backgroundColor: resistanceLevel.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.value, { color: resistanceLevel.color }]}>
            {resistanceLevel.label} ({(resistance * 100).toFixed(0)}%)
          </Text>
        </View>
      </View>
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
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  metric: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  value: {
    ...typography.caption,
    fontWeight: '600',
  },
});
