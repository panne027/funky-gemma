/**
 * ScreenTimeSignal: tracks device screen usage.
 *
 * On real device: uses AppState listener + native screen time APIs.
 * Provides simulation hooks for demo mode.
 */

export interface ScreenData {
  is_active: boolean;
  continuous_usage_minutes: number;
  foreground_app: string | null;
}

let screenActive = true;
let screenActiveSince: number = Date.now();
let foregroundApp: string | null = null;

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
