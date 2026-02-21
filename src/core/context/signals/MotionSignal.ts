import type { MotionState } from '../../../types';

/**
 * MotionSignal: tracks user's physical activity state.
 *
 * On real device: uses accelerometer/CMMotionManager/Activity Recognition API.
 * Here we provide an abstraction + simulation layer.
 */

export interface MotionData {
  state: MotionState;
  duration_minutes: number;
}

let currentMotion: MotionState = 'still';
let motionSince: number = Date.now();

export function setSimulatedMotion(state: MotionState): void {
  if (state !== currentMotion) {
    currentMotion = state;
    motionSince = Date.now();
  }
}

export function getMotionSignal(now: number = Date.now()): MotionData {
  return {
    state: currentMotion,
    duration_minutes: Math.round((now - motionSince) / (60 * 1000)),
  };
}
