import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { AgentCycleResult } from '../../types';
import { colors, spacing, typography, radius } from '../theme';

interface Props {
  cycle: AgentCycleResult;
  onDismiss?: () => void;
}

const TOOL_ICONS: Record<string, string> = {
  send_nudge: '📩',
  update_habit_state: '🔄',
  increase_cooldown: '⏸',
  delay_nudge: '💤',
};

export function NudgeExplanation({ cycle, onDismiss }: Props) {
  const toolName = cycle.tool_call?.name ?? 'no_action';
  const icon = TOOL_ICONS[toolName] ?? '🤖';
  const args = cycle.tool_call?.arguments ?? {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>Agent Decision</Text>
          <Text style={styles.subtitle}>
            {toolName.replace(/_/g, ' ')} — {cycle.trigger}
          </Text>
        </View>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {args.message && (
        <View style={styles.messageBox}>
          <Text style={styles.message}>{args.message as string}</Text>
          {args.tone && (
            <Text style={styles.tone}>Tone: {args.tone as string}</Text>
          )}
        </View>
      )}

      {args.reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reason}>{args.reason as string}</Text>
        </View>
      )}

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {cycle.cycle_duration_ms}ms
        </Text>
        <Text style={styles.metaText}>
          {cycle.tool_result?.success ? '✓ Executed' : '✗ Failed'}
        </Text>
      </View>

      <View style={styles.inferenceBadge}>
        <Text style={styles.inferenceBadgeText}>
          {cycle.raw_response.includes('call:') ? 'FunctionGemma' : 'inference'} → tool_call → state_update → notification
        </Text>
      </View>

      <View style={styles.rawSection}>
        <Text style={styles.rawLabel}>Raw Output</Text>
        <Text style={styles.rawText} numberOfLines={3}>
          {cycle.raw_response}
        </Text>
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
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  dismissBtn: {
    padding: spacing.xs,
  },
  dismissText: {
    fontSize: 24,
    color: colors.text.muted,
  },
  messageBox: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },
  tone: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: spacing.xs,
  },
  reasonBox: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reason: {
    ...typography.body,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metaText: {
    ...typography.caption,
    color: colors.text.muted,
  },
  rawSection: {
    backgroundColor: colors.bg.primary,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  rawLabel: {
    ...typography.caption,
    color: colors.text.muted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rawText: {
    ...typography.mono,
    color: colors.text.muted,
    lineHeight: 18,
  },
  inferenceBadge: {
    backgroundColor: colors.accent.primary + '15',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  inferenceBadgeText: {
    ...typography.caption,
    color: colors.accent.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
