import type {
  HabitState,
  AgentCycleResult,
  AppSettings,
  ContextSnapshot,
  StorageSchema,
} from '../../types';

/**
 * Platform-adaptive storage backend.
 * Web: uses window.localStorage directly.
 * Native: uses @react-native-async-storage/async-storage.
 */
const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const AsyncStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      return window.localStorage.getItem(key);
    }
    try {
      const AS = require('@react-native-async-storage/async-storage').default;
      return await AS.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      window.localStorage.setItem(key, value);
      return;
    }
    try {
      const AS = require('@react-native-async-storage/async-storage').default;
      await AS.setItem(key, value);
    } catch {
      // storage unavailable
    }
  },
  async multiRemove(keys: readonly string[]): Promise<void> {
    if (isWeb) {
      keys.forEach((k) => window.localStorage.removeItem(k));
      return;
    }
    try {
      const AS = require('@react-native-async-storage/async-storage').default;
      await AS.multiRemove(keys as string[]);
    } catch {
      // storage unavailable
    }
  },
};

const KEYS = {
  HABITS: '@momentum/habits',
  HISTORY: '@momentum/agent_history',
  SETTINGS: '@momentum/settings',
  LAST_CONTEXT: '@momentum/last_context',
} as const;

const DEFAULT_SETTINGS: AppSettings = {
  agent_interval_minutes: 10,
  scroll_threshold_minutes: 15,
  inactivity_threshold_minutes: 30,
  demo_mode: false,
  time_acceleration_factor: 1,
  model_loaded: false,
  onboarding_complete: false,
};

const MAX_HISTORY_ENTRIES = 200;

class LocalStorageService {
  private cache: Partial<StorageSchema> = {};

  async initialize(): Promise<void> {
    const [habits, history, settings, lastContext] = await Promise.all([
      this.getJson<Record<string, HabitState>>(KEYS.HABITS),
      this.getJson<AgentCycleResult[]>(KEYS.HISTORY),
      this.getJson<AppSettings>(KEYS.SETTINGS),
      this.getJson<ContextSnapshot | null>(KEYS.LAST_CONTEXT),
    ]);

    this.cache = {
      habits: habits ?? {},
      agent_history: history ?? [],
      settings: settings ?? DEFAULT_SETTINGS,
      last_context: lastContext ?? null,
    };
  }

  // ─── Habits ──────────────────────────────────────────────────────────

  async getHabits(): Promise<Record<string, HabitState>> {
    return this.cache.habits ?? {};
  }

  async getHabit(id: string): Promise<HabitState | null> {
    const habits = await this.getHabits();
    return habits[id] ?? null;
  }

  async saveHabit(habit: HabitState): Promise<void> {
    const habits = await this.getHabits();
    habits[habit.id] = habit;
    this.cache.habits = habits;
    await this.setJson(KEYS.HABITS, habits);
  }

  async updateHabitField(
    habitId: string,
    field: string,
    value: unknown,
  ): Promise<HabitState | null> {
    const habit = await this.getHabit(habitId);
    if (!habit) return null;

    if (field.includes('.')) {
      const parts = field.split('.');
      let target: Record<string, unknown> = habit as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]] as Record<string, unknown>;
      }
      target[parts[parts.length - 1]] = value;
    } else {
      (habit as unknown as Record<string, unknown>)[field] = value;
    }

    await this.saveHabit(habit);
    return habit;
  }

  // ─── Agent History ───────────────────────────────────────────────────

  async appendCycleResult(result: AgentCycleResult): Promise<void> {
    const history = this.cache.agent_history ?? [];
    history.push(result);

    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }

    this.cache.agent_history = history;
    await this.setJson(KEYS.HISTORY, history);
  }

  async getRecentCycles(count: number): Promise<AgentCycleResult[]> {
    const history = this.cache.agent_history ?? [];
    return history.slice(-count);
  }

  // ─── Settings ────────────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    return this.cache.settings ?? DEFAULT_SETTINGS;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...patch };
    this.cache.settings = updated;
    await this.setJson(KEYS.SETTINGS, updated);
    return updated;
  }

  // ─── Context ─────────────────────────────────────────────────────────

  async setLastContext(ctx: ContextSnapshot): Promise<void> {
    this.cache.last_context = ctx;
    await this.setJson(KEYS.LAST_CONTEXT, ctx);
  }

  async getLastContext(): Promise<ContextSnapshot | null> {
    return this.cache.last_context ?? null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorageAdapter.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    await AsyncStorageAdapter.setItem(key, JSON.stringify(value));
  }

  async clearAll(): Promise<void> {
    await AsyncStorageAdapter.multiRemove(Object.values(KEYS));
    this.cache = {};
  }
}

export const storage = new LocalStorageService();
