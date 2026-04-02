import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {WifiSelectPage} from '../../src/screens/watcher/WifiSelectPage';

const mockConnectToDevice = jest.fn().mockResolvedValue(undefined);
const mockSetWifiConfig = jest.fn().mockResolvedValue(undefined);
const mockGetWifiStatus = jest.fn().mockResolvedValue(null);
const mockClearWifiConfig = jest.fn().mockResolvedValue(null);
let protocolListener:
  | ((message: {
      type: string;
      code?: number;
      data: Record<string, unknown>;
    }) => void)
  | null = null;

jest.mock('../../src/components/WatcherHeader', () => ({
  WatcherHeader: () => null,
}));

jest.mock('../../src/hooks/useResponsiveScale', () => ({
  useResponsiveScale: () => ({
    windowWidth: 390,
    scaleValue: (value: number) => value,
    verticalScaleValue: (value: number) => value,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    reset: jest.fn(),
  }),
  useRoute: () => ({
    params: {
      bleId: 'device-1',
      bleName: 'Watcher',
    },
  }),
}));

jest.mock('../../src/modules/wifi', () => ({
  requestAndroidWifiPermissions: jest.fn().mockResolvedValue(true),
  scanNearbyNetworks: jest.fn().mockResolvedValue([
    {
      ssid: 'OfficeWiFi',
      level: -40,
      security: 'open',
      requiresPassword: false,
      isConnected: false,
      frequency: 2412,
    },
  ]),
}));

jest.mock('../../src/modules/bluetooth', () => ({
  BLE_PROTOCOL_TYPES: {
    ack: 'sys.ack',
    wifiSet: 'cfg.wifi.set',
    wifiStatus: 'evt.wifi.status',
  },
  BluetoothStatus: {
    Connected: 'connected',
    Error: 'error',
    Disconnected: 'disconnected',
  },
  isAckMessage: (message: {type: string}) => message.type === 'sys.ack',
  isWifiStatusMessage: (message: {type: string}) =>
    message.type === 'evt.wifi.status',
  toWifiProvisioningStatus: (message: {
    data: {status: string; ssid?: string; ip?: string};
  }) => ({
    state: message.data.status,
    message: message.data.status,
    raw: JSON.stringify(message),
    ssid: message.data.ssid,
    ip: message.data.ip,
  }),
  useBluetooth: () => ({
    status: 'connected',
    error: null,
    clearError: jest.fn(),
    connectToDevice: mockConnectToDevice,
    setWifiConfig: mockSetWifiConfig,
    getWifiStatus: mockGetWifiStatus,
    clearWifiConfig: mockClearWifiConfig,
    subscribeToProtocolMessages: (
      listener: (message: {type: string; data: Record<string, unknown>}) => void,
    ) => {
      protocolListener = listener;
      return () => {
        protocolListener = null;
      };
    },
  }),
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('WifiSelectPage', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    protocolListener = null;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockConnectToDevice.mockClear();
    mockSetWifiConfig.mockClear();
    mockGetWifiStatus.mockClear();
    mockClearWifiConfig.mockClear();
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  it('connects to the selected device, provisions wifi, and reacts to wifi status notifications', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(<WifiSelectPage />);
    });

    await flush();
    await flush();

    expect(mockClearWifiConfig).toHaveBeenCalled();
    const wifiRows = renderer!.root.findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('wifi-row-'),
    );
    const wifiRow =
      wifiRows.find(node => String(node.props.testID).includes('Public')) ??
      wifiRows[0];
    const selectedSsid = String(wifiRow.props.testID).replace('wifi-row-', '');

    await act(async () => {
      wifiRow.props.onPress();
    });

    expect(mockSetWifiConfig).toHaveBeenCalledWith({
      ssid: selectedSsid,
      password: '',
    });

    await act(async () => {
      protocolListener?.({
        type: 'evt.wifi.status',
        code: 0,
        data: {
          status: 'connected',
          ssid: selectedSsid,
          ip: '192.168.1.10',
        },
      });
    });

    const description = renderer!.root.findByProps({
      testID: 'wifi-success-description',
    });

    expect(String(description.props.children)).toContain(selectedSsid);
  });

  it('treats wifi set ack as saved success even if disconnected arrives first', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = ReactTestRenderer.create(<WifiSelectPage />);
    });

    await flush();
    await flush();

    const wifiRows = renderer!.root.findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('wifi-row-'),
    );
    const wifiRow =
      wifiRows.find(node => String(node.props.testID).includes('Public')) ??
      wifiRows[0];
    const selectedSsid = String(wifiRow.props.testID).replace('wifi-row-', '');

    await act(async () => {
      wifiRow.props.onPress();
    });

    await act(async () => {
      protocolListener?.({
        type: 'evt.wifi.status',
        code: 0,
        data: {
          status: 'disconnected',
          ssid: selectedSsid,
        },
      });
    });

    expect(alertSpy).not.toHaveBeenCalledWith(
      'Wi-Fi connection failed',
      expect.any(String),
    );

    await act(async () => {
      protocolListener?.({
        type: 'sys.ack',
        code: 0,
        data: {
          type: 'cfg.wifi.set',
          command_id: 'wifi-set-0002',
        },
      });
    });
    await flush();

    const description = renderer!.root.findByProps({
      testID: 'wifi-success-description',
    });

    expect(String(description.props.children)).toContain('Watcher saved Wi-Fi');
    expect(String(description.props.children)).toContain(selectedSsid);
  });
});
