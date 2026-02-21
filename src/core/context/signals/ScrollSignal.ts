/**
 * ScrollSignal: detects continuous scrolling / doom-scrolling behavior.
 *
 * On real device (React Native): uses ScrollView/FlatList event hooks
 * or accessibility services to detect scroll activity.
 *
 * On web: uses IntersectionObserver + scroll event listeners.
 */

export interface ScrollData {
  continuous_scroll_minutes: number;
  is_doom_scrolling: boolean;
}

const DOOM_SCROLL_THRESHOLD_MINUTES = 15;

let scrollingSince: number | null = null;
let lastScrollActivity: number = 0;
const SCROLL_GAP_TIMEOUT_MS = 30_000; // 30s without scroll = session ends

export function reportScrollActivity(): void {
  const now = Date.now();

  if (!scrollingSince || now - lastScrollActivity > SCROLL_GAP_TIMEOUT_MS) {
    scrollingSince = now;
  }

  lastScrollActivity = now;
}

export function resetScrollSession(): void {
  scrollingSince = null;
  lastScrollActivity = 0;
}

export function setSimulatedScroll(minutes: number): void {
  const now = Date.now();
  scrollingSince = now - minutes * 60 * 1000;
  lastScrollActivity = now;
}

export function getScrollSignal(now: number = Date.now()): ScrollData {
  if (!scrollingSince || now - lastScrollActivity > SCROLL_GAP_TIMEOUT_MS) {
    return { continuous_scroll_minutes: 0, is_doom_scrolling: false };
  }

  const minutes = Math.round((now - scrollingSince) / (60 * 1000));
  return {
    continuous_scroll_minutes: minutes,
    is_doom_scrolling: minutes >= DOOM_SCROLL_THRESHOLD_MINUTES,
  };
}
