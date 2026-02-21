import { create } from 'zustand';
import type { HabitState, AgentCycleResult, ContextSnapshot, AppSettings } from '../types';
import type { NudgePayload } from '../core/notifications/NotificationDispatcher';
import type { GoogleUser } from '../core/auth/GoogleAuthService';

interface MomentumStore {
  // Data
  habits: HabitState[];
  latestCycle: AgentCycleResult | null;
  recentCycles: AgentCycleResult[];
  lastContext: ContextSnapshot | null;
  activeNudge: NudgePayload | null;
  settings: AppSettings;

  // Auth
  googleUser: GoogleUser | null;

  // Agent state
  agentRunning: boolean;
  modelLoaded: boolean;
  demoMode: boolean;

  // Actions
  setHabits: (habits: HabitState[]) => void;
  setCycleResult: (result: AgentCycleResult) => void;
  setContext: (ctx: ContextSnapshot) => void;
  setActiveNudge: (nudge: NudgePayload | null) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setAgentRunning: (running: boolean) => void;
  setModelLoaded: (loaded: boolean) => void;
  setDemoMode: (demo: boolean) => void;
  setGoogleUser: (user: GoogleUser | null) => void;
}

export const useStore = create<MomentumStore>((set, get) => ({
  habits: [],
  latestCycle: null,
  recentCycles: [],
  lastContext: null,
  activeNudge: null,
  googleUser: null,
  settings: {
    agent_interval_minutes: 12,
    scroll_threshold_minutes: 15,
    inactivity_threshold_minutes: 30,
    demo_mode: false,
    time_acceleration_factor: 1,
    model_loaded: false,
    onboarding_complete: false,
  },
  agentRunning: false,
  modelLoaded: false,
  demoMode: false,

  setHabits: (habits) => set({ habits }),

  setCycleResult: (result) =>
    set((state) => ({
      latestCycle: result,
      recentCycles: [...state.recentCycles.slice(-19), result],
      habits: result.habit_states,
    })),

  setContext: (ctx) => set({ lastContext: ctx }),

  setActiveNudge: (nudge) => set({ activeNudge: nudge }),

  setSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  setAgentRunning: (running) => set({ agentRunning: running }),
  setModelLoaded: (loaded) => set({ modelLoaded: loaded }),
  setDemoMode: (demo) => set({ demoMode: demo }),
  setGoogleUser: (user) => set({ googleUser: user }),
}));
