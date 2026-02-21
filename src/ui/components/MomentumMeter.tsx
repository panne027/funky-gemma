import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, typography, radius } from '../theme';
import { getMomentumTier, type MomentumTier } from '../../core/habits/MomentumCalculator';

interface Props {
  score: number;
  habitName: string;
  compact?: boolean;
}

const TIER_LABELS: Record<MomentumTier, string> = {
  critical: 'CRITICAL',
  low: 'LOW',
  building: 'BUILDING',
  steady: 'STEADY',
  peak: 'PEAK',
};

const TIER_COLORS_ORDERED = [
  { threshold: 0, color: colors.momentum.critical },
  { threshold: 15, color: colors.momentum.low },
  { threshold: 35, color: colors.momentum.building },
  { threshold: 55, color: colors.momentum.steady },
  { threshold: 80, color: colors.momentum.peak },
];

function getBarColor(score: number): string {
  for (let i = TIER_COLORS_ORDERED.length - 1; i >= 0; i--) {
    if (score >= TIER_COLORS_ORDERED[i].threshold) {
      return TIER_COLORS_ORDERED[i].color;
    }
  }
  return colors.momentum.critical;
}

export function MomentumMeter({ score, habitName, compact }: Props) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const tier = getMomentumTier(score);
  const tierColor = colors.momentum[tier];
  const barColor = getBarColor(score);

  useEffect(() => {
    Animated.spring(animatedWidth, {
      toValue: Math.max(2, score),
      damping: 15,
      stiffness: 80,
      useNativeDriver: false,
    }).start();

    Animated.timing(glowOpacity, {
      toValue: score > 70 ? 0.6 : 0,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [score, animatedWidth, glowOpacity]);

  const widthInterpolation = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactLabel}>{habitName}</Text>
          <Text style={[styles.compactScore, { color: tierColor }]}>{score}</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View
            style={[styles.barFill, { width: widthInterpolation, backgroundColor: barColor }]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.habitName}>{habitName}</Text>
        <View style={[styles.tierBadge, { backgroundColor: tierColor + '22' }]}>
          <Text style={[styles.tierText, { color: tierColor }]}>
            {TIER_LABELS[tier]}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNumber, { color: tierColor }]}>{score}</Text>
        <Text style={styles.scoreMax}>/100</Text>
      </View>

      <View style={styles.barContainer}>
        <View style={styles.barTrackLarge}>
          <Animated.View
            style={[styles.barFillLarge, { width: widthInterpolation, backgroundColor: barColor }]}
          />
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  habitName: {
    ...typography.h3,
    color: colors.text.primary,
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  tierText: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -2,
  },
  scoreMax: {
    ...typography.h3,
    color: colors.text.muted,
    marginLeft: spacing.xs,
  },
  barContainer: {
    marginTop: spacing.xs,
  },
  barTrackLarge: {
    height: 10,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFillLarge: {
    height: '100%',
    borderRadius: radius.full,
  },
  glow: {
    position: 'absolute',
    top: -4,
    left: 0,
    right: 0,
    bottom: -4,
    borderRadius: radius.full,
    backgroundColor: colors.accent.primary,
  },
  compactContainer: {
    marginBottom: spacing.sm,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  compactLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  compactScore: {
    ...typography.caption,
    fontWeight: '700',
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
