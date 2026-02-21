import { Platform } from 'react-native';
import type { NudgeTone } from '../../types';
import { recordNudgeInteraction } from '../context/ContextAggregator';
import { aiLog } from '../logging/AILogger';

export interface NudgePayload {
  habitId: string;
  tone: NudgeTone;
  message: string;
  timestamp: number;
}

type NudgeListener = (payload: NudgePayload) => void;

const TONE_TITLES: Record<NudgeTone, string> = {
  gentle: 'Nudgy-Nudge 💫',
  firm: 'Nudgy-Nudge ⚡',
  playful: 'Nudgy-Nudge 👉',
};

/**
 * NotificationDispatcher: sends real banner notifications.
 *
 * Android/iOS: uses @notifee/react-native for native banner notifications.
 * Web: uses browser Notification API.
 * Always: emits to in-app UI listeners.
 */
class NotificationDispatcherService {
  private listeners: NudgeListener[] = [];
  private history: NudgePayload[] = [];
  private notifee: any = null;
  private channelId: string | null = null;

  async initialize(): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      this.notifee = require('@notifee/react-native').default;
      await this.notifee.requestPermission();
      this.channelId = await this.notifee.createChannel({
        id: 'nudgy-nudge',
        name: 'Nudgy-Nudge',
        importance: 4,
        vibration: true,
        sound: 'default',
      });
      console.log('[NotificationDispatcher] Notifee initialized, channel:', this.channelId);
    } catch (err) {
      console.warn('[NotificationDispatcher] Notifee not available:', err);
    }
  }

  subscribe(listener: NudgeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async sendNudge(payload: NudgePayload): Promise<void> {
    this.history.push(payload);

    // Always emit to in-app UI listeners
    this.listeners.forEach((listener) => listener(payload));

    // Send real platform notification
    await this.sendBannerNotification(payload);

    aiLog('nudge', `[${payload.tone}] → "${payload.message}"`);
  }

  getHistory(): NudgePayload[] {
    return [...this.history];
  }

  getLastNudge(): NudgePayload | null {
    return this.history[this.history.length - 1] ?? null;
  }

  handleNotificationAction(action: 'completed' | 'dismissed' | 'snoozed'): void {
    recordNudgeInteraction(action);
  }

  private async sendBannerNotification(payload: NudgePayload): Promise<void> {
    const title = TONE_TITLES[payload.tone];

    // Native: use @notifee/react-native
    if (this.notifee && this.channelId) {
      try {
        await this.notifee.displayNotification({
          title,
          body: payload.message,
          android: {
            channelId: this.channelId,
            pressAction: { id: 'default' },
            importance: payload.tone === 'firm' ? 4 : 3,
            smallIcon: 'ic_launcher',
          },
          data: {
            habit_id: payload.habitId,
            tone: payload.tone,
          },
        });
        return;
      } catch (err) {
        console.warn('[NotificationDispatcher] Notifee send failed:', err);
      }
    }

    // Web fallback: browser Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          new Notification(title, { body: payload.message, tag: `momentum-${payload.habitId}` });
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            new Notification(title, { body: payload.message, tag: `momentum-${payload.habitId}` });
          }
        }
      } catch {
        // Not available
      }
    }
  }
}

export const notificationDispatcher = new NotificationDispatcherService();
