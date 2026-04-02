import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Path} from 'react-native-svg';
import {WatcherHeader} from '../../components/WatcherHeader';
import {
  BLE_PROTOCOL_TYPES,
  BluetoothStatus,
  isAckMessage,
  isWifiStatusMessage,
  toWifiProvisioningStatus,
  useBluetooth,
  type WifiProvisioningStatus,
} from '../../modules/bluetooth';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import type {RootStackParamList} from '../../navigation/AppNavigator';
import {
  requestAndroidWifiPermissions,
  scanNearbyNetworks,
  type WifiScanItem,
} from '../../modules/wifi';
import {STORAGE_KEYS} from '../../utils/storageKeys';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'WifiSelect'
>;
type RouteProps = RouteProp<RootStackParamList, 'WifiSelect'>;

type WifiConnectResult = {
  status: 'connected' | 'saved';
  ssid: string;
  ip?: string;
};

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  greenSoft: '#F3F8E8',
  border: '#EFF0F1',
  textSecondary: '#8E959F',
  bodySubText: '#636A74',
  overlay: 'rgba(0, 0, 0, 0.65)',
  inputBg: '#F5F5F9',
  error: '#E66A6A',
};

const WIFI_PAGE_LOG_PREFIX = '[蓝牙][配网页]';

const logWifiPage = (message: string, details?: unknown) => {
  if (details !== undefined) {
    console.log(WIFI_PAGE_LOG_PREFIX, message, details);
    return;
  }

  console.log(WIFI_PAGE_LOG_PREFIX, message);
};

const MOCK_WIFI_OPTIONS: WifiScanItem[] = [
  {
    ssid: 'Innoxsz-2.4G',
    level: -45,
    security: 'wpa2',
    requiresPassword: true,
    isConnected: false,
  },
  {
    ssid: 'Innoxsz-Public',
    level: -52,
    security: 'open',
    requiresPassword: false,
    isConnected: false,
  },
];

const PROVISIONING_TIMEOUT_MS = 30000;
const PASSWORD_ERROR_TEXT = 'Incorrect password. Please try again.';

const is24GHzNetwork = (network: WifiScanItem) => {
  if (typeof network.frequency === 'number' && network.frequency > 0) {
    return network.frequency >= 2400 && network.frequency <= 2500;
  }

  return !/(^|[_\-\s])5g(hz)?($|[_\-\s])/i.test(network.ssid);
};

const getDisplayWifiNetworks = (networks: WifiScanItem[]) =>
  networks.filter(network => !network.isConnected);

const getWifiErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to load nearby Wi-Fi networks.';
};

const getBluetoothErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to connect to the device over Bluetooth.';
};

const getPreparationErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to reset Watcher Wi-Fi before provisioning.';
};

const getProvisioningFailureMessage = (status: WifiProvisioningStatus) => {
  switch (status.state) {
    case 'disconnected':
      return status.ssid
        ? `Watcher failed to join ${status.ssid}. Check that the password is correct and the network is 2.4GHz.`
        : 'Watcher failed to join the Wi-Fi network. Check that the password is correct and the network is 2.4GHz.';
    case 'error':
      return 'Watcher rejected the Wi-Fi request. Please retry.';
    default:
      return 'Watcher did not finish Wi-Fi provisioning.';
  }
};

const getProvisioningHintText = (status: WifiProvisioningStatus) => {
  switch (status.state) {
    case 'unconfigured':
      return 'Watcher is waiting for Wi-Fi credentials.';
    case 'cleared':
      return 'Stored Wi-Fi credentials were cleared.';
    case 'connecting':
      return status.ssid
        ? `Watcher is connecting to ${status.ssid}...`
        : 'Watcher is connecting to Wi-Fi...';
    case 'connected':
      return status.ip
        ? `Watcher connected to ${status.ssid ?? 'Wi-Fi'} (${status.ip})`
        : `Watcher connected to ${status.ssid ?? 'Wi-Fi'}`;
    case 'disconnected':
      return status.ssid
        ? `Watcher could not join ${status.ssid}.`
        : 'Watcher failed to join Wi-Fi.';
    case 'error':
      return 'Watcher reported a Wi-Fi provisioning error.';
    default:
      return null;
  }
};

const WifiIcon: React.FC<{active?: boolean}> = ({active = false}) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M0 5.513L1.455 7.056C5.069 3.221 10.931 3.221 14.545 7.056L16 5.513C11.585 0.829 4.422 0.829 0 5.513ZM5.818 11.685L8 14L10.182 11.685C8.982 10.405 7.025 10.405 5.818 11.685ZM2.91 8.6L4.365 10.143C6.372 8.013 9.63 8.013 11.637 10.143L13.091 8.6C10.284 5.622 5.724 5.622 2.909 8.6H2.91Z"
      fill={active ? COLORS.green : '#000000'}
    />
  </Svg>
);

const RefreshIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M4.16967 2.53792C4.20434 2.51659 4.23634 2.49592 4.26501 2.47659C5.36718 1.7298 6.66833 1.33146 7.99967 1.33326C11.6817 1.33326 14.6663 4.31792 14.6663 7.99992C14.6682 9.24711 14.3186 10.4696 13.6577 11.5273C13.6379 11.5589 13.6102 11.5847 13.5773 11.6024C13.5445 11.62 13.5076 11.6288 13.4703 11.6279C13.4331 11.6269 13.3967 11.6163 13.3648 11.597C13.3329 11.5777 13.3065 11.5505 13.2883 11.5179L11.6083 8.49526C11.5801 8.44452 11.5657 8.38729 11.5664 8.32923C11.5671 8.27118 11.5829 8.21431 11.6123 8.16427C11.6418 8.11422 11.6838 8.07274 11.7342 8.04391C11.7846 8.01508 11.8416 7.99992 11.8997 7.99992H13.333C13.3332 7.01395 13.0601 6.0472 12.544 5.20709C12.0279 4.36697 11.289 3.68636 10.4094 3.24086C9.52984 2.79537 8.54397 2.60242 7.56133 2.68346C6.57868 2.7645 5.63774 3.11635 4.84301 3.69992C4.77484 3.74994 4.69682 3.78488 4.61411 3.80242C4.5314 3.81996 4.44591 3.81971 4.36331 3.80168C4.28071 3.78364 4.20289 3.74824 4.13503 3.69783C4.06716 3.64741 4.01079 3.58313 3.96967 3.50926L3.93234 3.44259C3.84783 3.29024 3.82534 3.11117 3.86955 2.94265C3.91376 2.77414 4.02126 2.62917 4.16967 2.53792ZM11.7397 13.5199C10.6364 14.269 9.33319 14.6686 7.99967 14.6666C4.31767 14.6666 1.33301 11.6819 1.33301 7.99992C1.33301 6.75059 1.67701 5.58126 2.27434 4.58192C2.30013 4.53867 2.33685 4.50298 2.38082 4.47844C2.42479 4.45389 2.47444 4.44136 2.52479 4.4421C2.57514 4.44284 2.62441 4.45684 2.66763 4.48267C2.71085 4.5085 2.74651 4.54527 2.77101 4.58926L4.39101 7.50459C4.41922 7.55533 4.4337 7.61256 4.433 7.67062C4.4323 7.72867 4.41644 7.78554 4.38701 7.83558C4.35758 7.88563 4.31558 7.92711 4.26518 7.95594C4.21479 7.98477 4.15773 7.99993 4.09967 7.99992H2.66634C2.66632 8.98624 2.9398 9.95323 3.4564 10.7934C3.97299 11.6336 4.71245 12.3141 5.5926 12.7593C6.47274 13.2044 7.45908 13.3968 8.442 13.315C9.42491 13.2332 10.3659 12.8804 11.1603 12.2959C11.2303 12.2437 11.3104 12.2068 11.3955 12.1875C11.4806 12.1683 11.5688 12.1671 11.6544 12.184C11.74 12.201 11.821 12.2358 11.8923 12.286C11.9636 12.3363 12.0236 12.401 12.0683 12.4759C12.1652 12.6378 12.195 12.8311 12.1512 13.0146C12.1075 13.198 11.9938 13.3572 11.8343 13.4579C11.8029 13.4779 11.7718 13.4983 11.741 13.5193L11.7397 13.5199Z"
      fill="#5D6E7F"
    />
  </Svg>
);

const SuccessDecoration: React.FC = () => (
  <Svg width={132} height={84} viewBox="0 0 132 84" fill="none">
    <Circle cx="66" cy="40" r="33" fill="#8FC31F" />
    <Path
      d="M51 39.5L61.5 50L82 28.5"
      stroke="white"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M13 45L0 51L13 57" fill="#8FC31F" />
    <Path
      d="M20 53L33 37"
      stroke="#3A94D8"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <Path
      d="M119 29L132 17"
      stroke="#F0B14B"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <Circle cx="101" cy="8" r="4" fill="#8FC31F" />
  </Svg>
);

const HiddenPasswordIcon: React.FC = () => (
  <Svg width={15} height={7} viewBox="0 0 15 7" fill="none">
    <Path
      d="M13.7964 1.004C13.8642 0.901827 13.892 0.778192 13.8743 0.656824C13.8565 0.535457 13.7946 0.424909 13.7004 0.3464C13.597 0.270148 13.468 0.237187 13.3408 0.254514C13.2135 0.271841 13.098 0.338092 13.0188 0.4392C12.9948 0.4624 10.2924 3.5416 7.06758 3.5416C3.94758 3.5416 1.11638 0.4392 1.09238 0.416C1.00451 0.325596 0.886373 0.27079 0.760603 0.262081C0.634833 0.253372 0.510271 0.291371 0.410779 0.3688C0.317572 0.450037 0.260232 0.564805 0.251242 0.688118C0.242252 0.811431 0.28234 0.933303 0.362779 1.0272C0.410779 1.0976 0.996378 1.7312 1.92678 2.4352L0.683579 3.6824C0.639748 3.72597 0.605408 3.77815 0.582718 3.83563C0.560027 3.89312 0.549477 3.95469 0.551731 4.01645C0.553985 4.07821 0.568995 4.13884 0.595816 4.19452C0.622636 4.25021 0.660688 4.29974 0.707579 4.34C0.755579 4.4328 0.875579 4.4792 0.995579 4.4792C1.12408 4.47738 1.24729 4.42776 1.34118 4.34L2.68118 3.0008C3.3706 3.46409 4.11706 3.83625 4.90198 4.108L4.38918 5.7784C4.31638 6.0344 4.46118 6.2976 4.73318 6.368H4.87878C4.98505 6.37017 5.0889 6.33611 5.17323 6.2714C5.25757 6.2067 5.31736 6.11521 5.34278 6.012L5.85638 4.34C6.25862 4.41416 6.66657 4.45298 7.07558 4.456C7.48459 4.45299 7.89254 4.41417 8.29478 4.34L8.80838 5.988C8.85638 6.1976 9.07238 6.344 9.27318 6.344C9.32118 6.344 9.36918 6.344 9.39318 6.3216C9.51906 6.289 9.62692 6.20789 9.69318 6.096C9.72512 6.04161 9.74558 5.98125 9.75328 5.91864C9.76099 5.85603 9.75578 5.79251 9.73798 5.732L9.22518 4.084C10.014 3.8128 10.7612 3.4408 11.4468 2.9784L12.762 4.2936C12.8189 4.34793 12.888 4.38799 12.9634 4.41051C13.0388 4.43303 13.1185 4.43736 13.1959 4.42316C13.2733 4.40895 13.3463 4.37661 13.4088 4.32879C13.4713 4.28096 13.5216 4.21901 13.5556 4.148C13.5943 4.06429 13.6073 3.971 13.5931 3.87989C13.5788 3.78878 13.538 3.70392 13.4756 3.636L12.2332 2.3888C12.8023 1.98451 13.3267 1.52055 13.7972 1.0048L13.7964 1.004Z"
      fill="#BABFC4"
      stroke="#BABFC4"
      strokeWidth="0.5"
    />
  </Svg>
);

const VisiblePasswordIcon: React.FC = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path
      d="M7.9993 13C5.5553 13 3.3743 11.457 1.4623 8.444C1.37786 8.31131 1.33301 8.15728 1.33301 8C1.33301 7.84272 1.37786 7.68869 1.4623 7.556C3.3743 4.543 5.5553 3 7.9993 3C10.4443 3 12.6253 4.543 14.5373 7.556C14.6217 7.68869 14.6666 7.84272 14.6666 8C14.6666 8.15728 14.6217 8.31131 14.5373 8.444C12.6253 11.457 10.4443 13 7.9993 13ZM7.9993 4C5.9763 4 4.1013 5.31 2.3723 8C4.1023 10.69 5.9763 12 7.9993 12C10.0233 12 11.8973 10.69 13.6263 8C11.8973 5.31 10.0233 4 7.9993 4ZM7.9993 10.333C7.37781 10.3357 6.78069 10.0914 6.33926 9.65389C5.89783 9.21639 5.64821 8.6215 5.6453 8C5.64821 7.3785 5.89783 6.78361 6.33926 6.34611C6.78069 5.90862 7.37781 5.66434 7.9993 5.667C9.2993 5.667 10.3533 6.711 10.3533 8C10.3504 8.6215 10.1008 9.21639 9.65934 9.65389C9.21791 10.0914 8.6208 10.3357 7.9993 10.333ZM7.9993 9.333C8.35452 9.3346 8.69584 9.19508 8.94824 8.94512C9.20063 8.69517 9.34345 8.35522 9.3453 8C9.34345 7.64478 9.20063 7.30484 8.94824 7.05488C8.69584 6.80492 8.35452 6.6654 7.9993 6.667C7.64426 6.66567 7.3032 6.8053 7.05102 7.05523C6.79884 7.30516 6.65615 7.64496 6.6543 8C6.65615 8.35504 6.79884 8.69484 7.05102 8.94477C7.3032 9.1947 7.64426 9.33433 7.9993 9.333Z"
      fill="#BABFC4"
    />
  </Svg>
);

// 配网页用于扫描手机当前可见的 Wi-Fi，并通过 BLE 将凭据下发给设备。
export const WifiSelectPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const {scaleValue, verticalScaleValue, windowWidth, windowHeight} =
    useResponsiveScale();
  const {
    status: bluetoothStatus,
    error: bluetoothError,
    clearError: clearBluetoothError,
    connectToDevice,
    clearWifiConfig,
    getWifiStatus,
    setWifiConfig,
    subscribeToProtocolMessages,
  } = useBluetooth();
  const passwordInputRef = useRef<TextInput>(null);
  const bluetoothActionsRef = useRef({
    clearBluetoothError,
    connectToDevice,
    clearWifiConfig,
    getWifiStatus,
    subscribeToProtocolMessages,
  });
  const bootstrapKeyRef = useRef<string | null>(null);
  const provisioningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingWifiSsidRef = useRef<string | null>(null);
  const savedWifiSsidRef = useRef<string | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(24)).current;
  const refreshRotation = useRef(new Animated.Value(0)).current;
  const successOverlayOpacity = useRef(new Animated.Value(0)).current;
  const successCardScale = useRef(new Animated.Value(0.96)).current;
  const [wifiList, setWifiList] = useState<WifiScanItem[]>([]);
  const [selectedWifi, setSelectedWifi] = useState<WifiScanItem | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoadingWifiList, setIsLoadingWifiList] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreparingDevice, setIsPreparingDevice] = useState(true);
  const [isSubmittingWifi, setIsSubmittingWifi] = useState(false);
  const [isClearingSavedWifi, setIsClearingSavedWifi] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showUnsupportedNetworks, setShowUnsupportedNetworks] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [connectResult, setConnectResult] = useState<WifiConnectResult | null>(
    null,
  );
  const [provisioningHint, setProvisioningHint] = useState<string | null>(null);

  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const cardWidth = Math.min(contentWidth, scaleValue(353, 326, 360));
  const sideInset = scaleValue(30, 24, 30);
  const cardTop = verticalScaleValue(13, 10, 16);
  const rowHeight = verticalScaleValue(48, 44, 48);
  const listCardMaxHeight = Math.min(
    windowHeight - insets.top - insets.bottom - cardTop,
    windowHeight,
  );
  const listScrollMaxHeight = Math.max(
    listCardMaxHeight - verticalScaleValue(104, 96, 116),
    verticalScaleValue(220, 200, 240),
  );
  const sheetHeight = verticalScaleValue(320, 300, 320);
  const successCardWidth = Math.min(contentWidth, scaleValue(324, 304, 330));
  const sheetCardTop = verticalScaleValue(20, 16, 20);
  const sheetActionTop = verticalScaleValue(28, 24, 28);
  const isDeviceConnected = bluetoothStatus === BluetoothStatus.Connected;
  const targetBleName = route.params?.bleName?.trim() || undefined;
  const targetBleId = route.params?.bleId?.trim() || undefined;
  const targetDeviceLabel = targetBleName ?? targetBleId ?? 'Watcher';
  const supportedWifiList = wifiList.filter(is24GHzNetwork);
  const unsupportedWifiList = wifiList.filter(network => !is24GHzNetwork(network));
  const unsupportedVisibleCount = showUnsupportedNetworks
    ? unsupportedWifiList.length
    : 0;
  const estimatedWifiContentHeight =
    supportedWifiList.length * rowHeight +
    (unsupportedWifiList.length > 0 ? verticalScaleValue(44, 40, 48) : 0) +
    unsupportedVisibleCount * rowHeight +
    insets.bottom +
    verticalScaleValue(16, 12, 16);
  const shouldScrollWifiList =
    estimatedWifiContentHeight > listScrollMaxHeight;

  useEffect(() => {
    bluetoothActionsRef.current = {
      clearBluetoothError,
      connectToDevice,
      clearWifiConfig,
      getWifiStatus,
      subscribeToProtocolMessages,
    };
  }, [
    clearBluetoothError,
    connectToDevice,
    clearWifiConfig,
    getWifiStatus,
    subscribeToProtocolMessages,
  ]);

  const clearProvisioningTimeout = () => {
    if (provisioningTimeoutRef.current) {
      clearTimeout(provisioningTimeoutRef.current);
      provisioningTimeoutRef.current = null;
    }
  };

  const loadNearbyWifiNetworks = useCallback(async () => {
    setWifiError(null);
    setIsLoadingWifiList(true);
    logWifiPage('开始扫描手机可见 Wi-Fi');

    try {
      if (Platform.OS !== 'android') {
        setWifiList(MOCK_WIFI_OPTIONS);
        logWifiPage('非 Android 平台，使用模拟 Wi-Fi 列表', {
          count: MOCK_WIFI_OPTIONS.length,
        });
        return;
      }

      const granted = await requestAndroidWifiPermissions();
      if (!granted) {
        setWifiList([]);
        setWifiError(
          'Wi-Fi permission was denied. Please enable location and nearby Wi-Fi access.',
        );
        return;
      }

      const networks = await scanNearbyNetworks();
      const filteredNetworks = getDisplayWifiNetworks(networks);

      console.log('[WifiSelect] Scan results before filter', {
        total: networks.length,
        ssids: networks.map(network => ({
          ssid: network.ssid,
          frequency: network.frequency,
          isConnected: network.isConnected,
          security: network.security,
        })),
      });
      console.log('[WifiSelect] Scan results after filter', {
        total: filteredNetworks.length,
        ssids: filteredNetworks.map(network => ({
          ssid: network.ssid,
          frequency: network.frequency,
          isConnected: network.isConnected,
          security: network.security,
        })),
      });

      setWifiList(filteredNetworks);
      logWifiPage('手机 Wi-Fi 扫描完成', {
        scannedCount: networks.length,
        filteredCount: filteredNetworks.length,
        ssids: filteredNetworks.map(network => network.ssid),
      });
      if (filteredNetworks.length === 0) {
        setWifiError('No nearby Wi-Fi networks were found.');
      }
    } catch (error) {
      setWifiList([]);
      logWifiPage('手机 Wi-Fi 扫描失败', {error});
      setWifiError(getWifiErrorMessage(error));
    } finally {
      setIsLoadingWifiList(false);
      setIsRefreshing(false);
    }
  }, []);

  const clearDeviceWifiBeforeProvisioning = useCallback(async () => {
    logWifiPage('开始清理设备已保存 Wi-Fi 配置');
    setProvisioningHint('Clearing saved Wi-Fi from Watcher...');
    clearProvisioningTimeout();
    pendingWifiSsidRef.current = null;
    savedWifiSsidRef.current = null;

    const nextStatus = await bluetoothActionsRef.current.clearWifiConfig();
    logWifiPage('设备 Wi-Fi 清理完成', {nextStatus});
    const nextHint = nextStatus
      ? getProvisioningHintText(nextStatus)
      : 'Stored Wi-Fi credentials were cleared.';

    setProvisioningHint(nextHint ?? 'Stored Wi-Fi credentials were cleared.');
  }, []);

  const prepareDevice = useCallback(async () => {
    setIsPreparingDevice(true);
    setWifiError(null);
    let hasBleConnectionReady = isDeviceConnected;

    try {
      bluetoothActionsRef.current.clearBluetoothError();

      if (!isDeviceConnected) {
        if (!targetBleId) {
          throw new Error(
            'No Bluetooth device was selected. Please go back and choose a device.',
          );
        }

        await bluetoothActionsRef.current.connectToDevice(targetBleId, {
          timeout: 12000,
          autoConnect: false,
        });
        hasBleConnectionReady = true;
      }

      await clearDeviceWifiBeforeProvisioning();
      logWifiPage('设备准备完成，开始扫描手机 Wi-Fi');
      return true;
    } catch (error) {
      setWifiList([]);
      setProvisioningHint(null);
      setWifiError(
        hasBleConnectionReady
          ? getPreparationErrorMessage(error)
          : getBluetoothErrorMessage(error),
      );
      return false;
    } finally {
      setIsPreparingDevice(false);
    }
  }, [clearDeviceWifiBeforeProvisioning, isDeviceConnected, targetBleId]);

  const prepareDeviceAndLoadWifi = useCallback(async () => {
    const deviceReady = await prepareDevice();
    if (!deviceReady) {
      setIsRefreshing(false);
      return;
    }

    await loadNearbyWifiNetworks();
  }, [loadNearbyWifiNetworks, prepareDevice]);

  const submitWifiConnection = async (
    wifi: WifiScanItem,
    nextPassword?: string,
  ) => {
    setIsSubmittingWifi(true);
    setWifiError(null);
    setPasswordError(null);
    setProvisioningHint(`Sending ${wifi.ssid} to Watcher...`);

    try {
      if (!isDeviceConnected) {
        throw new Error('Bluetooth device is not connected.');
      }

      pendingWifiSsidRef.current = wifi.ssid;
      savedWifiSsidRef.current = null;
      clearProvisioningTimeout();
      provisioningTimeoutRef.current = setTimeout(() => {
        if (!pendingWifiSsidRef.current) {
          return;
        }

        setIsSubmittingWifi(false);
        setWifiError(
          `Watcher did not confirm saving ${pendingWifiSsidRef.current} within 30 seconds.`,
        );
        setProvisioningHint(null);
        pendingWifiSsidRef.current = null;
      }, PROVISIONING_TIMEOUT_MS);

      await setWifiConfig({
        ssid: wifi.ssid,
        password: nextPassword ?? '',
      });
    } catch (error) {
      clearProvisioningTimeout();
      pendingWifiSsidRef.current = null;
      savedWifiSsidRef.current = null;
      const message = getWifiErrorMessage(error);
      setWifiError(message);
      setProvisioningHint(null);
      Alert.alert('Wi-Fi connection failed', message);
      setIsSubmittingWifi(false);
    }
  };

  const handleWifiPress = (wifi: WifiScanItem) => {
    if (!isDeviceConnected || isPreparingDevice) {
      setWifiError('Bluetooth is still connecting to Watcher. Please wait.');
      return;
    }

    if (!is24GHzNetwork(wifi)) {
      setWifiError(`${wifi.ssid} is 5GHz. Not supported for Watcher.`);
      return;
    }

    clearProvisioningTimeout();
    pendingWifiSsidRef.current = null;
    setIsSubmittingWifi(false);
    setProvisioningHint(null);
    setSelectedWifi(wifi);
    setPassword('');
    setPasswordError(null);
    setShowPassword(false);

    if (!wifi.requiresPassword) {
      submitWifiConnection(wifi).catch(() => {});
      return;
    }

    setShowPasswordModal(true);
  };

  const handleConfirmPassword = () => {
    if (!selectedWifi) {
      return;
    }

    if (selectedWifi.requiresPassword && password.length === 0) {
      setPasswordError('Please enter the Wi-Fi password.');
      Alert.alert('Password required', 'Please enter the Wi-Fi password.');
      return;
    }

    submitWifiConnection(selectedWifi, password).catch(() => {});
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(current => !current);
    requestAnimationFrame(() => passwordInputRef.current?.focus());
  };

  const handleRefresh = () => {
    if (isRefreshing || isLoadingWifiList || isPreparingDevice) {
      return;
    }

    const pendingSsid = pendingWifiSsidRef.current;

    clearProvisioningTimeout();
    pendingWifiSsidRef.current = null;
    setIsSubmittingWifi(false);
    setProvisioningHint(null);
    setWifiError(null);

    setIsRefreshing(true);
    refreshRotation.setValue(0);

    Animated.timing(refreshRotation, {
      toValue: 1,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      refreshRotation.setValue(0);
      prepareDeviceAndLoadWifi().catch(() => {});
    });
  };

  const handleStartUsing = async () => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.hasCompletedInitialBinding,
        'true',
      );
    } catch {}

    setShowSuccessModal(false);
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'MainTabs',
          params: {
            screen: 'Watcher',
            params: {connected: true},
          },
        },
      ],
    });
  };

  const handleReprovision = async () => {
    if (isClearingSavedWifi) {
      return;
    }

    setIsClearingSavedWifi(true);
    setWifiError(null);
    setConnectResult(null);
    setShowSuccessModal(false);
    setProvisioningHint('Clearing saved Wi-Fi from Watcher...');
    clearProvisioningTimeout();
    pendingWifiSsidRef.current = null;
    savedWifiSsidRef.current = null;

    try {
      await clearWifiConfig();
      await bluetoothActionsRef.current.getWifiStatus().catch(() => {});
      await loadNearbyWifiNetworks();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to clear saved Wi-Fi from Watcher.';
      setWifiError(message);
      Alert.alert('Unable to re-provision', message);
    } finally {
      setIsClearingSavedWifi(false);
    }
  };

  useEffect(() => {
    if (!isDeviceConnected) {
      return;
    }

    const unsubscribe = bluetoothActionsRef.current.subscribeToProtocolMessages(
      protocolMessage => {
        if (
          pendingWifiSsidRef.current &&
          isAckMessage(protocolMessage) &&
          protocolMessage.data.type === BLE_PROTOCOL_TYPES.wifiSet
        ) {
          const savedSsid = pendingWifiSsidRef.current;
          logWifiPage('收到 Wi-Fi 配置保存 ACK', {
            ssid: savedSsid,
            commandId: protocolMessage.data.command_id,
          });
          clearProvisioningTimeout();
          pendingWifiSsidRef.current = null;
          savedWifiSsidRef.current = savedSsid;
          setIsSubmittingWifi(false);
          setConnectResult(current =>
            current?.status === 'connected'
              ? current
              : {
                  status: 'saved',
                  ssid: savedSsid,
                },
          );
          setShowPasswordModal(false);
          setShowSuccessModal(true);
          setSelectedWifi(null);
          setPassword('');
          setWifiError(null);
          setProvisioningHint(
            `Watcher saved Wi-Fi: ${savedSsid}. BLE control remains available until Wi-Fi connects.`,
          );
          return;
        }

        if (!isWifiStatusMessage(protocolMessage)) {
          return;
        }

        const nextStatus = toWifiProvisioningStatus(protocolMessage);
        setProvisioningHint(getProvisioningHintText(nextStatus));

        if (nextStatus.state === 'connecting') {
          if (
            pendingWifiSsidRef.current &&
            (!nextStatus.ssid || nextStatus.ssid === pendingWifiSsidRef.current)
          ) {
            setIsSubmittingWifi(true);
          }
          return;
        }

        if (nextStatus.state === 'connected') {
          const resolvedSsid =
            nextStatus.ssid ??
            pendingWifiSsidRef.current ??
            savedWifiSsidRef.current ??
            '';
          clearProvisioningTimeout();
          pendingWifiSsidRef.current = null;
          savedWifiSsidRef.current = resolvedSsid || savedWifiSsidRef.current;
          setIsSubmittingWifi(false);
          setConnectResult({
            status: 'connected',
            ssid: resolvedSsid,
            ip: nextStatus.ip,
          });
          setShowPasswordModal(false);
          setShowSuccessModal(true);
          setSelectedWifi(null);
          setPassword('');
          setPasswordError(null);
          setWifiError(null);
          return;
        }

        if (pendingWifiSsidRef.current && nextStatus.state === 'disconnected') {
          logWifiPage('收到 Wi-Fi 断开状态，继续等待保存 ACK 或后续状态', {
            ssid: pendingWifiSsidRef.current,
            nextStatus,
          });
          setProvisioningHint(
            nextStatus.ssid
              ? `Watcher has not joined ${nextStatus.ssid} yet, but BLE control is still available.`
              : 'Watcher has not joined Wi-Fi yet, but BLE control is still available.',
          );
          return;
        }

        if (pendingWifiSsidRef.current && nextStatus.state === 'error') {
          clearProvisioningTimeout();
          pendingWifiSsidRef.current = null;
          setIsSubmittingWifi(false);
          const message = getProvisioningFailureMessage(nextStatus);
          setWifiError(message);
          if (showPasswordModal && selectedWifi?.requiresPassword) {
            setPasswordError(PASSWORD_ERROR_TEXT);
          } else {
            Alert.alert('Wi-Fi connection failed', message);
          }
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [isDeviceConnected, selectedWifi?.requiresPassword, showPasswordModal]);

  useEffect(() => {
    const bootstrapKey = targetBleName ?? '__default__';
    if (bootstrapKeyRef.current === bootstrapKey) {
      return () => {
        clearProvisioningTimeout();
      };
    }

    bootstrapKeyRef.current = bootstrapKey;
    prepareDeviceAndLoadWifi().catch(() => {});

    return () => {
      clearProvisioningTimeout();
    };
  }, [prepareDeviceAndLoadWifi, targetBleName]);

  useEffect(() => {
    if (!isPreparingDevice && bluetoothStatus === BluetoothStatus.Disconnected) {
      clearProvisioningTimeout();
      pendingWifiSsidRef.current = null;
      savedWifiSsidRef.current = null;
      setIsSubmittingWifi(false);
      setProvisioningHint(null);
      setWifiError('Bluetooth disconnected. Please go back and reconnect.');
    }
  }, [bluetoothStatus, isPreparingDevice]);

  useEffect(() => {
    if (
      !isPreparingDevice &&
      bluetoothStatus === BluetoothStatus.Error &&
      bluetoothError?.message
    ) {
      clearProvisioningTimeout();
      pendingWifiSsidRef.current = null;
      savedWifiSsidRef.current = null;
      setIsSubmittingWifi(false);
      setProvisioningHint(null);
      setWifiError(bluetoothError.message);
    }
  }, [bluetoothError?.message, bluetoothStatus, isPreparingDevice]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!showPasswordModal) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(24);
      setPasswordError(null);
      setKeyboardHeight(0);
      return;
    }

    requestAnimationFrame(() => passwordInputRef.current?.focus());
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, sheetTranslateY, showPasswordModal]);

  useEffect(() => {
    if (!showSuccessModal) {
      successOverlayOpacity.setValue(0);
      successCardScale.setValue(0.96);
      return;
    }

    Animated.parallel([
      Animated.timing(successOverlayOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(successCardScale, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.back(1.05)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [showSuccessModal, successCardScale, successOverlayOpacity]);

  const successTitle =
    connectResult?.status === 'saved' ? 'Wi-Fi saved' : 'Connection successful';
  const successDescription =
    connectResult?.status === 'saved'
      ? `Watcher saved Wi-Fi: ${connectResult?.ssid ?? ''}. BLE control remains available until Wi-Fi connects.`
      : connectResult?.ip
        ? `Watcher connected to ${connectResult?.ssid ?? ''} (${connectResult.ip})`
        : `Watcher connected to ${connectResult?.ssid ?? ''}`;
  const cardSubtitle = isPreparingDevice
    ? `Connecting to ${targetDeviceLabel} over Bluetooth...`
    : provisioningHint
      ? provisioningHint
      : `Select a 2.4GHz Wi-Fi network for ${targetDeviceLabel}`;
  const refreshRotate = refreshRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const wifiListContent = (
    <>
      {supportedWifiList.map((wifi, index) => {
        const isRowDisabled =
          isSubmittingWifi || isPreparingDevice || !isDeviceConnected;

        return (
          <TouchableOpacity
            key={wifi.bssid ?? `${wifi.ssid}-${index}`}
            style={[
              styles.wifiRow,
              {minHeight: rowHeight},
              index === supportedWifiList.length - 1 &&
                unsupportedWifiList.length === 0 &&
                styles.lastWifiRow,
            ]}
            activeOpacity={0.85}
            onPress={() => handleWifiPress(wifi)}
            disabled={isRowDisabled}>
            <View style={styles.wifiRowContent}>
              <View style={styles.wifiLeft}>
                <WifiIcon active={wifi.isConnected} />
                <Text style={styles.wifiName}>{wifi.ssid}</Text>
              </View>
            </View>
            {index !== supportedWifiList.length - 1 ||
            unsupportedWifiList.length > 0 ? (
              <View style={styles.wifiDivider} />
            ) : null}
          </TouchableOpacity>
        );
      })}

      {unsupportedWifiList.length > 0 ? (
        <View style={styles.unsupportedSection}>
          <TouchableOpacity
            style={styles.unsupportedToggle}
            activeOpacity={0.8}
            onPress={() => setShowUnsupportedNetworks(current => !current)}>
            <Text style={styles.unsupportedToggleText}>
              Show 5GHz networks ({unsupportedWifiList.length})
            </Text>
          </TouchableOpacity>

          {showUnsupportedNetworks
            ? unsupportedWifiList.map((wifi, index) => (
                <View
                  key={wifi.bssid ?? `unsupported-${wifi.ssid}-${index}`}
                  style={[
                    styles.wifiRow,
                    styles.wifiRowUnsupported,
                    index === unsupportedWifiList.length - 1 &&
                      styles.lastWifiRow,
                    {minHeight: rowHeight},
                  ]}>
                  <View style={styles.wifiRowContent}>
                    <View style={styles.wifiLeft}>
                      <WifiIcon active={false} />
                      <Text
                        style={[styles.wifiName, styles.wifiNameUnsupported]}>
                        {wifi.ssid}
                      </Text>
                    </View>
                  </View>
                  {index !== unsupportedWifiList.length - 1 ? (
                    <View style={styles.wifiDivider} />
                  ) : null}
                </View>
              ))
            : null}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.safeArea}>
      <View style={[styles.statusBarSpacer, {height: insets.top}]} />
      <View style={styles.container}>
        <WatcherHeader
          title="Bluetooth pairing"
          onBack={() => navigation.goBack()}
          sideInset={sideInset}
          backgroundColor={COLORS.white}
        />
        <View style={styles.cardArea}>
            <View
              style={[
                styles.listCard,
                {
                  width: cardWidth,
                  marginTop: cardTop,
                  maxHeight: listCardMaxHeight,
                },
              ]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Select Wi-Fi</Text>
              <TouchableOpacity
                style={[
                  styles.refreshIconWrap,
                  (isRefreshing || isLoadingWifiList || isPreparingDevice) &&
                    styles.refreshIconWrapActive,
                ]}
                activeOpacity={0.75}
                onPress={handleRefresh}
                disabled={isRefreshing || isLoadingWifiList || isPreparingDevice}>
                <Animated.View
                  style={[
                    styles.refreshIconInner,
                    {transform: [{rotate: refreshRotate}]},
                    (isRefreshing || isLoadingWifiList || isPreparingDevice) &&
                      styles.refreshIconInnerRefreshing,
                  ]}>
                  <RefreshIcon />
                </Animated.View>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardSubtitle}>{cardSubtitle}</Text>

            <View style={styles.listWrap}>
              {wifiList.length > 0 ? (
                shouldScrollWifiList ? (
                  <ScrollView
                    style={[styles.listScroll, {maxHeight: listScrollMaxHeight}]}
                    contentContainerStyle={[
                      styles.listScrollContent,
                      {
                        paddingBottom:
                          insets.bottom + verticalScaleValue(16, 12, 16),
                      },
                    ]}
                    scrollIndicatorInsets={{bottom: insets.bottom}}
                    showsVerticalScrollIndicator={false}
                    bounces={false}>
                    {wifiListContent}
                  </ScrollView>
                ) : (
                  <View style={styles.listStatic}>{wifiListContent}</View>
                )
              ) : null}
              {isPreparingDevice ? (
                <Text style={styles.emptyStateText}>
                  Connecting to Watcher over Bluetooth...
                </Text>
              ) : null}

              {isLoadingWifiList && !isPreparingDevice ? (
                <Text style={styles.emptyStateText}>
                  Scanning nearby Wi-Fi...
                </Text>
              ) : null}

              {!isPreparingDevice && !isLoadingWifiList && wifiList.length === 0 ? (
                <Text
                  style={[
                    styles.emptyStateText,
                    wifiError ? styles.emptyStateError : null,
                  ]}>
                  {wifiError ?? 'No Wi-Fi networks found.'}
                </Text>
              ) : null}

              {!isPreparingDevice && !isLoadingWifiList && wifiList.length > 0 && wifiError ? (
                <Text style={[styles.inlineErrorText, styles.emptyStateError]}>
                  {wifiError}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <Modal
          visible={showSuccessModal}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => setShowSuccessModal(false)}>
          <Animated.View
            style={[
              styles.overlay,
              styles.centerOverlay,
              {opacity: successOverlayOpacity},
            ]}>
            <Animated.View
              style={[
                styles.successCard,
                {
                  width: successCardWidth,
                  transform: [{scale: successCardScale}],
                },
              ]}>
              <SuccessDecoration />
              <Text style={styles.successTitle}>{successTitle}</Text>
              <Text
                testID="wifi-success-description"
                style={styles.successDescription}>
                {successDescription}
              </Text>
              <View style={styles.successActions}>
                <TouchableOpacity
                  style={[styles.successButton, styles.successSecondaryButton]}
                  activeOpacity={0.85}
                  disabled={isClearingSavedWifi}
                  onPress={() => {
                    handleReprovision().catch(() => {});
                  }}>
                  <Text
                    style={[
                      styles.successButtonText,
                      styles.successSecondaryButtonText,
                    ]}>
                    {isClearingSavedWifi ? 'Clearing...' : 'Re-provision'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.successButton}
                  activeOpacity={0.85}
                  disabled={isClearingSavedWifi}
                  onPress={handleStartUsing}>
                  <Text style={styles.successButtonText}>Start using</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      </View>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowPasswordModal(false)}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}>
          <Animated.View style={[styles.overlay, {opacity: overlayOpacity}]}>
          <TouchableOpacity
            style={styles.overlayTapArea}
            activeOpacity={1}
            onPress={() => setShowPasswordModal(false)}
          />
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                minHeight: sheetHeight,
                paddingBottom: Math.max(insets.bottom, 16) + 18,
                marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
                transform: [{translateY: sheetTranslateY}],
              },
            ]}>
            <Text style={styles.sheetTitle}>Enter the password</Text>
            <View style={[styles.sheetCard, {marginTop: sheetCardTop}]}>
              <Text style={styles.sheetWifiName}>
                Wi-Fi name: {selectedWifi?.ssid ?? ''}
              </Text>
              <View style={styles.passwordInputWrap}>
                <TextInput
                  ref={passwordInputRef}
                  value={password}
                  onChangeText={value => {
                    setPassword(value);
                    if (passwordError) {
                      setPasswordError(null);
                    }
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmittingWifi}
                  style={styles.passwordInput}
                />
                <TouchableOpacity
                  style={styles.passwordEyeButton}
                  activeOpacity={0.8}
                  onPress={handleTogglePasswordVisibility}
                  disabled={isSubmittingWifi}>
                  {showPassword ? (
                    <VisiblePasswordIcon />
                  ) : (
                    <HiddenPasswordIcon />
                  )}
                </TouchableOpacity>
              </View>
              {passwordError ? (
                <Text style={styles.passwordErrorText}>{passwordError}</Text>
              ) : null}
              <View style={[styles.sheetActions, {marginTop: sheetActionTop}]}>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  activeOpacity={0.85}
                  onPress={() => setShowPasswordModal(false)}
                  disabled={isSubmittingWifi}>
                  <Text style={styles.secondaryActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryAction,
                    isSubmittingWifi && styles.primaryActionDisabled,
                  ]}
                  activeOpacity={0.85}
                  onPress={handleConfirmPassword}
                  disabled={isSubmittingWifi}>
                  <Text style={styles.primaryActionText}>
                    {isSubmittingWifi ? 'Connecting...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: COLORS.background},
  statusBarSpacer: {backgroundColor: COLORS.white},
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  cardArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  listCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 18,
  },
  cardTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  refreshIconWrap: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIconWrapActive: {
    backgroundColor: '#EEF1F4',
  },
  refreshIconInner: {
    opacity: 1,
  },
  refreshIconInnerRefreshing: {
    opacity: 0.55,
  },
  cardSubtitle: {
    marginTop: 12,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  listWrap: {
    marginTop: 24,
    minHeight: 0,
    maxHeight: '100%',
    flexShrink: 1,
  },
  listScroll: {},
  listStatic: {},
  listScrollContent: {
    flexGrow: 0,
  },
  wifiRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  wifiRowUnsupported: {
    opacity: 0.55,
  },
  lastWifiRow: {
    borderBottomWidth: 0,
  },
  wifiRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wifiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  wifiDivider: {
    position: 'absolute',
    left: 28,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: COLORS.border,
  },
  wifiName: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.black,
  },
  wifiNameUnsupported: {
    color: COLORS.textSecondary,
  },
  unsupportedSection: {
    marginTop: 8,
  },
  unsupportedToggle: {
    paddingVertical: 14,
  },
  unsupportedToggleText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '500',
    color: COLORS.bodySubText,
  },
  emptyStateText: {
    paddingVertical: 24,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.bodySubText,
    textAlign: 'center',
  },
  emptyStateError: {
    color: COLORS.error,
  },
  inlineErrorText: {
    paddingTop: 12,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  keyboardAvoidingOverlay: {
    flex: 1,
  },
  overlayTapArea: {
    flex: 1,
  },
  centerOverlay: {
    justifyContent: 'center',
  },
  bottomSheet: {
    position: 'relative',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 34,
    alignItems: 'center',
    zIndex: 30,
    elevation: 30,
  },
  sheetTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  sheetCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sheetWifiName: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.black,
  },
  passwordInput: {
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 14,
    paddingRight: 44,
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 20,
    color: COLORS.black,
    paddingVertical: 0,
  },
  passwordInputWrap: {
    marginTop: 16,
    position: 'relative',
    justifyContent: 'center',
  },
  passwordEyeButton: {
    position: 'absolute',
    right: 8,
    top: 10,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordErrorText: {
    marginTop: 10,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.error,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  primaryAction: {
    width: '47.5%',
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionDisabled: {
    opacity: 0.7,
  },
  primaryActionText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  secondaryAction: {
    width: '47.5%',
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.green,
  },
  successCard: {
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 28,
    alignItems: 'center',
  },
  successTitle: {
    marginTop: 24,
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  successDescription: {
    marginTop: 12,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: COLORS.bodySubText,
    textAlign: 'center',
  },
  successActions: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  successButton: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successSecondaryButton: {
    backgroundColor: COLORS.greenSoft,
  },
  successButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  successSecondaryButtonText: {
    color: COLORS.green,
  },
});
