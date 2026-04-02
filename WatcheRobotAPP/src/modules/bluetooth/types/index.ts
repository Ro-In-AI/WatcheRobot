import type {Device} from 'react-native-ble-plx';
import type {
  BleAckMessage,
  BleAiStatusCommandData,
  BlePongMessage,
  BleProtocolMessage,
  BleRobotStateSetCommandData,
  BleServoAngleCommandData,
  BleWifiConfigCommandData,
  BleWifiConnectionState,
  BleWifiStatusMessage,
} from '../protocol/bleProtocol';

export enum BluetoothStatus {
  Idle = 'idle',
  Scanning = 'scanning',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Error = 'error',
}

export interface BluetoothDeviceInfo {
  id: string;
  name?: string | null;
  mtu?: number | null;
}

export interface BluetoothError {
  code?: string;
  message: string;
}

export type DeviceDiscoveredCallback = (device: Device) => void;

export interface ScanOptions {
  timeout?: number;
  filter?: (device: Device) => boolean;
}

export interface ConnectOptions {
  timeout?: number;
  autoConnect?: boolean;
  requestMTU?: number;
}

export interface NotificationOptions {
  serviceUUID: string;
  characteristicUUID: string;
}

export interface BluetoothReceivedData {
  characteristicName: string;
  characteristicUUID: string;
  data: unknown;
  timestamp: string;
}

export type NotificationListener = (value: string | BluetoothReceivedData) => void;
export type DisconnectListener = (device: Device) => void;
export type ProtocolMessageListener = (message: BleProtocolMessage) => void;

export type WifiProvisioningState = BleWifiConnectionState | 'cleared' | 'error';

export interface WifiProvisioningStatus {
  state: WifiProvisioningState;
  message: string;
  raw: string;
  ssid?: string;
  ip?: string;
}

export interface BluetoothState {
  status: BluetoothStatus;
  deviceInfo: BluetoothDeviceInfo | null;
  error: BluetoothError | null;
  receivedData: BluetoothReceivedData | string | null;
}

export interface UseBluetoothReturn {
  status: BluetoothStatus;
  deviceInfo: BluetoothDeviceInfo | null;
  receivedData: BluetoothReceivedData | string | null;
  error: BluetoothError | null;
  initialize: () => Promise<void>;
  startScan: (
    onDeviceFound: DeviceDiscoveredCallback,
    options?: ScanOptions,
  ) => Promise<void>;
  stopScan: () => Promise<void>;
  connectToDevice: (deviceId: string, options?: ConnectOptions) => Promise<void>;
  connectToConfiguredDevice: (options?: {
    deviceName?: string;
    scanTimeout?: number;
    connectTimeout?: number;
    autoConnect?: boolean;
    enableAutoRescan?: boolean;
    maxRescanAttempts?: number;
    rescanDelayMs?: number;
  }) => Promise<void>;
  disconnect: () => Promise<void>;
  writeData: (
    serviceUUID: string,
    characteristicUUID: string,
    data: string | Uint8Array,
    withResponse?: boolean,
  ) => Promise<void>;
  readData: (serviceUUID: string, characteristicUUID: string) => Promise<string>;
  subscribeToNotifications: (
    options: NotificationOptions,
    callback: NotificationListener,
  ) => () => void;
  subscribeToProtocolMessages: (callback: ProtocolMessageListener) => () => void;
  sendServoAngle: (payload: {
    xDeg?: number;
    yDeg?: number;
    durationMs?: number;
    commandId?: string;
  }) => Promise<BleAckMessage>;
  sendAiStatus: (payload: {
    status?: string;
    message?: string;
    imageName?: string;
    actionFile?: string;
    soundFile?: string;
    commandId?: string;
  }) => Promise<BleAckMessage>;
  setRobotState: (payload: {
    stateId: string;
    commandId?: string;
  }) => Promise<BleAckMessage>;
  setWifiConfig: (payload: {
    ssid: string;
    password: string;
    commandId?: string;
  }) => Promise<BleAckMessage>;
  getWifiStatus: (commandId?: string) => Promise<WifiProvisioningStatus | null>;
  clearWifiConfig: (commandId?: string) => Promise<WifiProvisioningStatus | null>;
  pingDevice: () => Promise<BlePongMessage>;
  clearError: () => void;
  clearAll: () => void;
}

export type {
  BleAckMessage,
  BleAiStatusCommandData,
  BlePongMessage,
  BleProtocolMessage,
  BleRobotStateSetCommandData,
  BleServoAngleCommandData,
  BleWifiConfigCommandData,
  BleWifiStatusMessage,
};
