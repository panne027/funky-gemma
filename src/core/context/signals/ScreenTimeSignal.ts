import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';

export interface ScreenData {
  is_active: boolean;
  continuous_usage_minutes: number;
  foreground_app: string | null;
}

let screenActive = true;
let screenActiveSince: number = Date.now();
let foregroundApp: string | null = null;
let appStateListenerAttached = false;

function handleAppStateChange(nextState: AppStateStatus): void {
  const wasActive = screenActive;
  screenActive = nextState === 'active';

  if (screenActive && !wasActive) {
    screenActiveSince = Date.now();
  }
}

/**
 * Attach a real AppState listener for foreground/background tracking.
 * Safe to call multiple times — only attaches once.
 */
export function initScreenTimeTracking(): void {
  if (appStateListenerAttached) return;
  if (Platform.OS === 'web') return;

  appStateListenerAttached = true;
  screenActive = AppState.currentState === 'active';
  if (screenActive) screenActiveSince = Date.now();

  AppState.addEventListener('change', handleAppStateChange);
}

export function setSimulatedScreen(active: boolean, app?: string): void {
  if (active !== screenActive) {
    screenActive = active;
    screenActiveSince = active ? Date.now() : screenActiveSince;
  }
  if (app !== undefined) foregroundApp = app;
}

export function getScreenSignal(now: number = Date.now()): ScreenData {
  return {
    is_active: screenActive,
    continuous_usage_minutes: screenActive
      ? Math.round((now - screenActiveSince) / (60 * 1000))
      : 0,
    foreground_app: screenActive ? foregroundApp : null,
  };
}
