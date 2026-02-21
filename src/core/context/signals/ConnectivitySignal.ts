import { Platform } from 'react-native';

export interface ConnectivityData {
  is_connected: boolean;
  connection_type: 'wifi' | 'cellular' | 'none';
  is_metered: boolean;
}

let cachedConnectivity: ConnectivityData = {
  is_connected: true,
  connection_type: 'wifi',
  is_metered: false,
};

export function getConnectivitySignal(): ConnectivityData {
  if (Platform.OS === 'web') {
    return {
      is_connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connection_type: 'wifi',
      is_metered: false,
    };
  }

  return { ...cachedConnectivity };
}

export function setConnectivityStatus(connected: boolean, type: 'wifi' | 'cellular' | 'none'): void {
  cachedConnectivity = {
    is_connected: connected,
    connection_type: type,
    is_metered: type === 'cellular',
  };
}
