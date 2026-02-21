import { Platform } from 'react-native';

export interface BatteryData {
  level: number;
  is_charging: boolean;
}

let cachedBattery: BatteryData = { level: 0.8, is_charging: false };

export function initBatteryMonitoring(): void {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    (navigator as any).getBattery().then((battery: any) => {
      cachedBattery = { level: battery.level, is_charging: battery.charging };
      battery.addEventListener('levelchange', () => {
        cachedBattery.level = battery.level;
      });
      battery.addEventListener('chargingchange', () => {
        cachedBattery.is_charging = battery.charging;
      });
    }).catch(() => {});
  }
}

export function getBatterySignal(): BatteryData {
  return { ...cachedBattery };
}

export function setSimulatedBattery(level: number, charging: boolean): void {
  cachedBattery = { level, is_charging: charging };
}
