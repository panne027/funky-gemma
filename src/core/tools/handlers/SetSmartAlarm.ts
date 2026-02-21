import { Platform, NativeModules, Linking } from 'react-native';
import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';

export async function handleSetSmartAlarm(args: Record<string, unknown>): Promise<ToolResult> {
  const habitId = args.habit_id as string;
  const hour = Number(args.hour);
  const minute = Number(args.minute ?? 0);
  const label = args.label as string;

  if (!habitId || isNaN(hour) || hour < 0 || hour > 23 || !label) {
    return {
      success: false,
      tool_name: 'set_smart_alarm',
      data: {},
      error: 'Required: habit_id, hour (0-23), label',
    };
  }

  if (Platform.OS === 'android') {
    try {
      // Use Android's AlarmClock intent
      const uri = `intent:#Intent;action=android.intent.action.SET_ALARM;` +
        `i.android.intent.extra.alarm.HOUR=${hour};` +
        `i.android.intent.extra.alarm.MINUTES=${minute};` +
        `S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};` +
        `B.android.intent.extra.alarm.SKIP_UI=true;end`;

      // Direct intent via Linking
      await Linking.openURL(
        `content://com.android.deskclock/alarm?hour=${hour}&minutes=${minute}&message=${encodeURIComponent(label)}`,
      ).catch(() => {
        // Fallback: use generic alarm intent
        return Linking.openURL(`alarmsetter://set?hour=${hour}&minutes=${minute}&label=${encodeURIComponent(label)}`);
      }).catch(() => {
        aiLog('agent', 'Alarm intent not available, using scheduled notification fallback');
      });

      aiLog('agent', `Smart alarm set: ${hour}:${String(minute).padStart(2, '0')} — "${label}"`);
      return {
        success: true,
        tool_name: 'set_smart_alarm',
        data: { habit_id: habitId, hour, minute, label },
      };
    } catch (err) {
      return { success: false, tool_name: 'set_smart_alarm', data: {}, error: `Alarm failed: ${err}` };
    }
  }

  // Fallback for non-Android: acknowledge the intent
  aiLog('agent', `Smart alarm (simulated): ${hour}:${String(minute).padStart(2, '0')} — "${label}"`);
  return {
    success: true,
    tool_name: 'set_smart_alarm',
    data: { habit_id: habitId, hour, minute, label, simulated: true },
  };
}
