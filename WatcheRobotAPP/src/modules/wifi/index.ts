import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export type WifiSecurity =
  | 'open'
  | 'wep'
  | 'wpa'
  | 'wpa2'
  | 'wpa3'
  | 'enterprise'
  | 'unknown';

export type WifiScanItem = {
  ssid: string;
  bssid?: string;
  level: number;
  frequency?: number;
  security: WifiSecurity;
  requiresPassword: boolean;
  isConnected: boolean;
};

type ConnectResult = {
  status: 'connected' | 'saved';
  ssid: string;
};

type WifiInfo = {
  ssid?: string | null;
  isWifiConnected: boolean;
};

type WifiControlNativeModule = {
  scanNearbyNetworks(): Promise<WifiScanItem[]>;
  connectToNetwork(config: {
    ssid: string;
    password?: string;
    security?: WifiSecurity;
  }): Promise<ConnectResult>;
  getCurrentWifiInfo(): Promise<WifiInfo>;
};

const nativeModule = NativeModules.WifiControlModule as
  | WifiControlNativeModule
  | undefined;

const ensureAndroidWifiModule = () => {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Android Wi-Fi module is unavailable.');
  }

  return nativeModule;
};

export const requestAndroidWifiPermissions = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  const permissions =
    Platform.Version >= 33
      ? [
          PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    permission => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );
};

export const scanNearbyNetworks = async (): Promise<WifiScanItem[]> => {
  const module = ensureAndroidWifiModule();
  return module.scanNearbyNetworks();
};

export const connectToNetwork = async (config: {
  ssid: string;
  password?: string;
  security?: WifiSecurity;
}): Promise<ConnectResult> => {
  const module = ensureAndroidWifiModule();
  return module.connectToNetwork(config);
};

export const getCurrentWifiInfo = async (): Promise<WifiInfo> => {
  const module = ensureAndroidWifiModule();
  return module.getCurrentWifiInfo();
};
