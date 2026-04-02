import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Svg, Path} from 'react-native-svg';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {
  CompositeNavigationProp,
  RouteProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {
  AnimationIcon,
  DanceIcon,
  MotionIcon,
  SurveillanceIcon,
} from '../../components/icons';
import {
  BluetoothStatus,
  bluetoothService,
  useBluetooth,
} from '../../modules/bluetooth';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import {STORAGE_KEYS} from '../../utils/storageKeys';
import type {VisitRequestKind} from '../../utils/visitFlow';
import type {
  RootStackParamList,
  RootTabParamList,
} from '../../navigation/AppNavigator';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Watcher'>,
  NativeStackNavigationProp<RootStackParamList>
>;
type RouteProps = RouteProp<RootTabParamList, 'Watcher'>;
type WatcherModalType = 'visitDuration' | 'visitRequest' | null;

const COLORS = {
  background: '#F5F5F9',
  white: '#FFFFFF',
  black: '#000000',
  green: '#8FC31F',
  grayIcon: '#363C44',
  statusRed: '#D20706',
  statusGray: '#8E959F',
  cardTitle: '#BABFC4',
  activeCardTitle: '#000000',
  deviceMeta: '#6C7380',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

type FailureType = 'bluetooth' | 'retry' | null;

const MAC_ADDRESS_PATTERN = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

const normalizeBluetoothIdentifier = (identifier?: string | null) => {
  const trimmed = identifier?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const getBluetoothIdentifierLabel = (identifier?: string | null) => {
  if (!identifier) {
    return 'Bluetooth ID';
  }

  return MAC_ADDRESS_PATTERN.test(identifier) ? 'MAC' : 'Bluetooth ID';
};

// Watcher 是设备主入口页，负责展示连接状态、功能卡片，以及承接 Nearby 带来的互访流程。
const LoadingSpinner: React.FC = () => {
  const rotateValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => {
      animation.stop();
      rotateValue.setValue(0);
    };
  }, [rotateValue]);

  const rotate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{transform: [{rotate}]}}>
      <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <Path
          opacity={0.5}
          d="M7.06934 0.335693C7.32836 0.335693 7.55056 0.557176 7.55078 0.816162V3.10327C7.55075 3.3624 7.32847 3.58472 7.06934 3.58472C6.81037 3.58449 6.5889 3.36227 6.58887 3.10327V0.816162C6.58909 0.557306 6.81048 0.335917 7.06934 0.335693Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.6}
          d="M2.33301 2.26318C2.52413 2.07206 2.81752 2.07232 3.00879 2.26318L4.61914 3.87354C4.8104 4.06479 4.8104 4.35806 4.61914 4.54932C4.54952 4.61894 4.42338 4.68115 4.29297 4.68115C4.1794 4.68115 4.04665 4.65261 3.94336 4.54932L2.33301 2.93896C2.14214 2.7477 2.14188 2.45431 2.33301 2.26318Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.7}
          d="M3.10352 6.44922C3.36252 6.44925 3.58474 6.67072 3.58496 6.92969C3.58496 7.18882 3.36265 7.4111 3.10352 7.41113H0.816406C0.55742 7.41091 0.335938 7.18871 0.335938 6.92969C0.336161 6.67083 0.55755 6.44944 0.816406 6.44922H3.10352Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.8}
          d="M3.85059 9.38013C4.04177 9.18912 4.33516 9.18914 4.52637 9.38013C4.71756 9.57132 4.71745 9.86465 4.52637 10.0559L2.91602 11.6663C2.81517 11.767 2.68463 11.7981 2.58984 11.7981C2.47635 11.798 2.34343 11.7695 2.24023 11.6663C2.04925 11.4751 2.04923 11.1817 2.24023 10.9905L3.85059 9.38013Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.9}
          d="M6.92969 10.4158C7.18871 10.4158 7.41091 10.6373 7.41113 10.8962V13.1833C7.4111 13.4425 7.18882 13.6648 6.92969 13.6648C6.67072 13.6646 6.44925 13.4424 6.44922 13.1833V10.8962C6.44944 10.6374 6.67083 10.416 6.92969 10.4158Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          d="M9.35645 9.47339C9.54757 9.28226 9.84096 9.28252 10.0322 9.47339L11.6426 11.0837C11.8338 11.275 11.8338 11.5683 11.6426 11.7595C11.5554 11.8688 11.4143 11.8914 11.3164 11.8914C11.2028 11.8914 11.0701 11.8628 10.9668 11.7595L9.35645 10.1492C9.16558 9.95791 9.16532 9.66451 9.35645 9.47339Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.3}
          d="M13.1836 6.58911C13.4426 6.58914 13.6648 6.81061 13.665 7.06958C13.665 7.32872 13.4427 7.551 13.1836 7.55103H10.8965C10.6375 7.5508 10.416 7.3286 10.416 7.06958C10.4162 6.81072 10.6376 6.58933 10.8965 6.58911H13.1836Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
        <Path
          opacity={0.4}
          d="M11.0605 2.35669C11.2517 2.16568 11.5451 2.16571 11.7363 2.35669C11.9275 2.54789 11.9274 2.84121 11.7363 3.03247L10.126 4.64282C10.0388 4.75199 9.89761 4.77466 9.7998 4.77466C9.68631 4.7746 9.55339 4.74602 9.4502 4.64282C9.25921 4.45162 9.25919 4.15823 9.4502 3.96704L11.0605 2.35669Z"
          fill="white"
          stroke="white"
          strokeWidth={0.2625}
        />
      </Svg>
    </Animated.View>
  );
};

const FailureIcon: React.FC = () => (
  <Svg width="100%" height="100%" viewBox="0 0 66 66" fill="none">
    <Path
      d="M33 66C51.2254 66 66 51.2254 66 33C66 14.7746 51.2254 0 33 0C14.7746 0 0 14.7746 0 33C0 51.2254 14.7746 66 33 66Z"
      fill="#CFD3D8"
    />
    <Path
      d="M29.7061 15C29.7061 14.4477 30.1538 14 30.7061 14H33.7061C34.2584 14 34.7061 14.4477 34.7061 15V40.379C34.7061 40.9312 34.2584 41.379 33.7061 41.379H30.7061C30.1538 41.379 29.7061 40.9312 29.7061 40.379V15Z"
      fill="white"
    />
    <Path
      d="M35.999 48.5C35.999 50.433 34.432 52 32.499 52C30.566 52 28.999 50.433 28.999 48.5C28.999 46.567 30.566 45 32.499 45C34.432 45 35.999 46.567 35.999 48.5Z"
      fill="white"
    />
  </Svg>
);

const DeviceMenuArrow: React.FC = () => (
  <Svg width={8} height={9} viewBox="0 0 8 9" fill="none">
    <Path
      d="M7.5 3.59955C8.16667 3.98445 8.16667 4.9467 7.5 5.3316L1.5 8.7957C0.833334 9.1806 1.22038e-07 8.69948 1.12858e-07 7.92968L3.02403e-08 1.00148C2.10605e-08 0.231675 0.833333 -0.249451 1.5 0.135449L7.5 3.59955Z"
      fill="#363C44"
    />
  </Svg>
);

const HeaderBellIcon: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 14 16" fill="none">
    <Path
      d="M6.07725 14.0625L6.075 14.0873C6.07503 14.2473 6.13195 14.4022 6.23561 14.5242C6.33926 14.6462 6.4829 14.7274 6.64087 14.7533L6.75 14.7622C6.84076 14.7623 6.93061 14.7441 7.01416 14.7086C7.09771 14.6731 7.17325 14.6212 7.23627 14.5559C7.29928 14.4906 7.34847 14.4132 7.3809 14.3284C7.41333 14.2436 7.42833 14.1532 7.425 14.0625H8.4375C8.43729 14.4959 8.27035 14.9125 7.97129 15.2262C7.67223 15.5398 7.26396 15.7264 6.8311 15.7472C6.39823 15.768 5.97394 15.6215 5.64615 15.3381C5.31836 15.0546 5.11219 14.6558 5.07037 14.2245L5.0625 14.0625H6.07725ZM7.335 0V1.15538C8.71804 1.3 9.99849 1.95178 10.9292 2.98495C11.86 4.01812 12.375 5.35942 12.375 6.75V12.3739L13.5 12.375V13.5L12.375 13.4989V13.5H1.125V13.4989L0 13.5V12.375L1.125 12.3739V6.75C1.1249 5.35606 1.64238 4.01173 2.57711 2.97763C3.51185 1.94354 4.79725 1.29336 6.18413 1.15313L6.18525 0H7.335ZM6.75 2.25C5.55653 2.25 4.41193 2.72411 3.56802 3.56802C2.72411 4.41193 2.25 5.55653 2.25 6.75V12.3739H11.25V6.75C11.25 5.55653 10.7759 4.41193 9.93198 3.56802C9.08807 2.72411 7.94347 2.25 6.75 2.25Z"
      fill="#000000"
    />
  </Svg>
);

// 这个页面同时处理三类职责：设备连接、Watcher 功能入口、互访请求弹窗。
export const WatcherPage: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {windowWidth, scaleValue, verticalScaleValue} = useResponsiveScale();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const {
    status: bluetoothStatus,
    deviceInfo,
    clearAll,
    clearError,
    connectToConfiguredDevice,
    disconnect,
  } = useBluetooth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [failureType, setFailureType] = useState<FailureType>(null);
  const [selectedDevice, setSelectedDevice] = useState('Watcher-01');
  const [knownDevices, setKnownDevices] = useState<string[]>([]);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [hasCompletedInitialBinding, setHasCompletedInitialBinding] =
    useState(false);
  const [watcherModal, setWatcherModal] = useState<WatcherModalType>(null);
  const [watcherRequestKind, setWatcherRequestKind] =
    useState<VisitRequestKind>('visit');
  const [watcherRequesterName, setWatcherRequesterName] =
    useState('Crab A');
  const [visitTargetName, setVisitTargetName] = useState('Spicy Crab');
  const [visitDuration, setVisitDuration] = useState('');

  // 页面主要尺寸按统一响应式规则换算
  const horizontalPadding = scaleValue(20, 18, 24);
  const contentWidth = windowWidth - horizontalPadding * 2;
  const heroWidth = Math.min(contentWidth, scaleValue(333, 308, 352));
  const gridGap = scaleValue(16, 14, 18);
  const cardWidth = (contentWidth - gridGap) / 2;
  const robotSize = Math.min(heroWidth * (196 / 333), scaleValue(196, 176, 210));
  const headerBottom = verticalScaleValue(20, 16, 22);
  const deviceGap = verticalScaleValue(16, 14, 18);
  const deviceBottom = verticalScaleValue(20, 16, 24);
  const buttonBottom = verticalScaleValue(32, 24, 38);
  const cardHeight = verticalScaleValue(116, 108, 122);
  const sectionTopPadding = verticalScaleValue(10, 8, 14);
  const modalCardWidth = Math.min(
    contentWidth - scaleValue(9, 0, 12),
    scaleValue(324, 300, 332),
  );
  const modalCardPadding = scaleValue(30, 24, 30);
  const modalIconSize = scaleValue(66, 60, 66);
  const modalButtonGap = scaleValue(20, 16, 20);
  const modalButtonHeight = verticalScaleValue(50, 46, 50);
  const modalTextWidth = modalCardWidth - modalCardPadding * 2;
  const visitModalWidth = Math.min(
    contentWidth - scaleValue(9, 0, 12),
    scaleValue(324, 300, 332),
  );
  const connectedDeviceIdentifier = normalizeBluetoothIdentifier(deviceInfo?.id);
  const connectedDeviceIdentifierLabel = getBluetoothIdentifierLabel(
    connectedDeviceIdentifier,
  );
  const connectedDeviceName = deviceInfo?.name?.trim() || selectedDevice;
  const hasConnectedDeviceDetails = Boolean(connectedDeviceIdentifier);
  const isBluetoothConnected = bluetoothStatus === BluetoothStatus.Connected;
  const additionalKnownDevices = knownDevices.filter(
    name => name.trim() && name !== connectedDeviceName,
  );
  const deviceMenuWidth = scaleValue(196, 182, 204);
  const deviceMenuTop =
    insets.top + sectionTopPadding + verticalScaleValue(54, 48, 58);
  const deviceMenuLeft = horizontalPadding + scaleValue(14, 12, 16);
  const headerTitleInset = scaleValue(8, 6, 10);
  const quickConnectTimeout = 8000;

  // 首次绑定成功后会从其它页面带着 connected 参数回来，这里负责同步在线状态。
  useEffect(() => {
    if (route.params?.connected) {
      setFailureType(null);
      setIsConnecting(false);
      setShowDeviceMenu(false);
      navigation.setParams({connected: undefined});
    }
  }, [navigation, route.params?.connected]);

  useEffect(() => {
    if (isBluetoothConnected) {
      setFailureType(null);
      setIsConnecting(false);
      setIsConnected(true);
      return;
    }

    if (bluetoothStatus === BluetoothStatus.Disconnected) {
      setIsConnected(false);
      setShowDeviceMenu(false);
    }
  }, [bluetoothStatus, isBluetoothConnected]);

  useEffect(() => {
    if (deviceInfo?.name?.trim()) {
      const deviceName = deviceInfo.name.trim();
      setSelectedDevice(deviceName);
      setKnownDevices(previous =>
        previous.includes(deviceName) ? previous : [...previous, deviceName],
      );
    }
  }, [deviceInfo?.name]);

  // Nearby / 其它页面把访问场景带进来时，这里负责弹出对应的请求或时长弹窗。
  useEffect(() => {
    const scenario = route.params?.scenario;
    if (!scenario) {
      return;
    }

    setShowDeviceMenu(false);
    setWatcherRequesterName(route.params?.requesterName ?? 'Crab A');
    setVisitTargetName(route.params?.targetName ?? 'Spicy Crab');
    setWatcherRequestKind(route.params?.requestKind ?? 'visit');
    setVisitDuration('');
    setWatcherModal(
      scenario === 'visitDuration' ? 'visitDuration' : 'visitRequest',
    );

    navigation.setParams({
      scenario: undefined,
      requestKind: undefined,
      requesterName: undefined,
      targetName: undefined,
    });
  }, [
    navigation,
    route.params?.requestKind,
    route.params?.requesterName,
    route.params?.scenario,
    route.params?.targetName,
  ]);

  // 首页的在线状态只跟随真实 BLE 连接结果，避免页面状态和底层连接状态脱节。
  useEffect(() => {
    if (bluetoothStatus === BluetoothStatus.Connected) {
      setFailureType(null);
      setIsConnected(true);
      return;
    }

    if (
      bluetoothStatus === BluetoothStatus.Disconnected ||
      bluetoothStatus === BluetoothStatus.Error ||
      bluetoothStatus === BluetoothStatus.Idle
    ) {
      setIsConnected(false);
    }
  }, [bluetoothStatus]);

  // 读取首次绑定标记，决定“连接设备”是否需要先进入绑定引导页。
  useEffect(() => {
    let mounted = true;

    const loadBindingState = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(
          STORAGE_KEYS.hasCompletedInitialBinding,
        );
        if (mounted) {
          setHasCompletedInitialBinding(storedValue === 'true');
        }
      } catch {
        if (mounted) {
          setHasCompletedInitialBinding(false);
        }
      }
    };

    loadBindingState();

    return () => {
      mounted = false;
    };
  }, []);

  const wait = (ms: number): Promise<void> =>
    new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      return () => clearTimeout(timer);
    });

  const isQuickConnectTimeoutError = (error: unknown) =>
    error instanceof Error && error.message === 'WATCHER_QUICK_CONNECT_TIMEOUT';

  // 当连接失败时，优先跳到更精确的系统设置页，帮助用户快速排障。
  const openFailureSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        if (failureType === 'bluetooth') {
          await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
          return;
        }
      }

      await Linking.openSettings();
    } catch {
      await Linking.openSettings();
    }
  };

  // 连接按钮只负责“首次绑定”或“连接已绑定设备”，扫码页留给绑定/加设备流程。
  const handleConnectPress = async () => {
    if (isConnecting) {
      return;
    }

    if (isConnected) {
      setFailureType(null);
      setShowDeviceMenu(false);
      setIsConnecting(true);

      try {
        await disconnect();
      } finally {
        setIsConnecting(false);
      }
      return;
    }

    setFailureType(null);
    setShowDeviceMenu(false);
    setIsConnecting(true);

    if (!hasCompletedInitialBinding) {
      await wait(700);
      setIsConnecting(false);
      navigation.navigate('BindingGuide');
      return;
    }

    try {
      await wait(700);
      const bluetoothState = await bluetoothService.getAdapterState();

      if (bluetoothState !== 'PoweredOn') {
        setFailureType('bluetooth');
        return;
      }

      clearError();
      clearAll();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          bluetoothService.stopScan();
          reject(new Error('WATCHER_QUICK_CONNECT_TIMEOUT'));
        }, quickConnectTimeout);
      });

      try {
        await Promise.race([
          connectToConfiguredDevice({
            scanTimeout: 6000,
            connectTimeout: 8000,
            autoConnect: true,
            enableAutoRescan: false,
          }),
          timeoutPromise,
        ]);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    } catch (error) {
      if (isQuickConnectTimeoutError(error)) {
        clearAll();
        setFailureType('retry');
      } else {
        setFailureType('retry');
      }

      setShowDeviceMenu(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const failureCopy = {
    description:
      failureType === 'bluetooth'
        ? 'Connection failed. Please turn on the Bluetooth on your mobile phone.'
        : 'Connection failed. Please make sure your Watcher is powered on and nearby.',
    action: failureType === 'bluetooth' ? 'Toggle on' : 'Retry',
  };

  // 访问请求文案会根据 invite / visit 两种来源动态变化。
  const watcherRequestText =
    watcherRequestKind === 'invite'
      ? `[${watcherRequesterName}] Would you like to invite [${visitTargetName}] to visit?`
      : `[${watcherRequesterName}] Would you like to visit [${visitTargetName}]? Is it allowed?`;

  // 关闭互访相关弹窗时，顺手清掉本次输入的访问时长。
  const closeWatcherModal = () => {
    setWatcherModal(null);
    setVisitDuration('');
  };

  // 收到访问请求后，允许访问会继续进入“输入访问时长”这一步。
  const handlePermitWatcherVisit = () => {
    setWatcherModal('visitDuration');
  };

  // 确认访问时长后，进入访问中的会话页；如果没填，则走默认文案。
  const handleConfirmVisitDuration = () => {
    const normalizedDuration = visitDuration.trim();
    setWatcherModal(null);
    setVisitDuration('');
    navigation.navigate('VisitingSession', {
      statusText: normalizedDuration
        ? `[${watcherRequesterName}] is visiting for ${normalizedDuration}...`
        : `[${watcherRequesterName}] is visiting...`,
      buttonLabel: 'End the visit.',
    });
  };

  const cards = [
    {id: 'DANCE', title: 'DANCE', icon: DanceIcon},
    {id: 'MOTION', title: 'MOTION', icon: MotionIcon},
    {id: 'SURVEILLANCE', title: 'SURVEILLANCE', icon: SurveillanceIcon},
    {id: 'ANIMATION', title: 'ANIMATION', icon: AnimationIcon},
  ];

  return (
    <View style={styles.container}>
      {showDeviceMenu ? (
        <TouchableOpacity
          style={styles.deviceMenuBackdrop}
          activeOpacity={1}
          onPress={() => setShowDeviceMenu(false)}
        />
      ) : null}

      <View style={{height: insets.top + sectionTopPadding}} />
      <View style={{width: '100%', paddingHorizontal: horizontalPadding}}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.headerLeft, {marginLeft: headerTitleInset}]}
            activeOpacity={isConnected ? 0.8 : 1}
            disabled={!isConnected}
            onPress={() => setShowDeviceMenu(prev => !prev)}>
            <Text style={styles.headerTitle}>
              Wat<Text style={{color: COLORS.green}}>c</Text>her
            </Text>
            <View
              style={[
                styles.triangleIcon,
                showDeviceMenu && styles.triangleIconOpen,
              ]}>
              <DeviceMenuArrow />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bellButton}
            activeOpacity={0.8}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            onPress={() => navigation.navigate('Notification')}>
            <HeaderBellIcon />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: headerBottom,
            paddingBottom: insets.bottom + verticalScaleValue(94, 84, 104),
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* 中间设备主视觉和在线状态 */}
        <View
          style={[
            styles.heroSection,
            styles.deviceSection,
            {width: heroWidth, gap: deviceGap, marginBottom: deviceBottom},
          ]}>
          <Image
            source={require('../../assets/images/robot_watcher.png')}
            style={[styles.deviceImage, {width: robotSize, height: robotSize}]}
            resizeMode="contain"
          />

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {backgroundColor: isConnected ? COLORS.green : COLORS.statusRed},
              ]}
            />
            <Text style={styles.statusText}>
              {isConnected ? 'Online' : 'Device Offline'}
            </Text>
          </View>

        </View>

        {/* 设备连接按钮 */}
        <View
          style={[
            styles.heroSection,
            styles.buttonContainer,
            {width: heroWidth, marginBottom: buttonBottom},
          ]}>
          <TouchableOpacity
            style={[
              styles.connectButton,
              isConnected && styles.connectButtonDisabled,
            ]}
            onPress={handleConnectPress}
            activeOpacity={0.85}>
            {isConnecting ? (
              <View style={styles.loadingContent}>
                <LoadingSpinner />
                <Text style={styles.connectButtonText}>Connect the device</Text>
              </View>
            ) : (
              <Text style={styles.connectButtonText}>
                {isConnected ? 'Disconnect' : 'Connect the device'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 底部功能入口卡片 */}
        <View style={[styles.gridContainer, {columnGap: gridGap}]}>
          {cards.map(card => {
            const IconComponent = card.icon;
            return (
              <TouchableOpacity
                key={card.id}
                style={[styles.gridCard, {width: cardWidth, height: cardHeight}]}
                activeOpacity={isConnected && !isConnecting ? 0.85 : 1}
                disabled={!isConnected || isConnecting}
                onPress={() => {
                  const routeName: keyof RootStackParamList =
                    card.id === 'DANCE'
                      ? 'Dance'
                      : card.id === 'MOTION'
                        ? 'Motion'
                        : card.id === 'SURVEILLANCE'
                          ? 'Surveillance'
                          : 'Animation';
                  navigation.navigate(routeName);
                }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {color: isConnected ? COLORS.activeCardTitle : COLORS.cardTitle},
                  ]}>
                  {card.title}
                </Text>
                <View style={styles.cardIconBg}>
                  <IconComponent
                    size={26}
                    color={isConnected ? COLORS.green : COLORS.cardTitle}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {showDeviceMenu ? (
        <View
          style={[
            styles.deviceMenu,
            {
              width: deviceMenuWidth,
              top: deviceMenuTop,
              left: deviceMenuLeft,
            },
          ]}>
          {hasConnectedDeviceDetails ? (
            <TouchableOpacity
              style={[
                styles.deviceMenuSelected,
                styles.deviceMenuSelectedDetailed,
              ]}
              activeOpacity={0.85}
              onPress={() => {
                setShowDeviceMenu(false);
              }}>
              <Text
                style={[
                  styles.deviceMenuSelectedText,
                  styles.deviceMenuSelectedTextDetailed,
                ]}>
                {connectedDeviceName}
              </Text>
              <Text style={styles.deviceMenuMetaText}>
                {connectedDeviceIdentifierLabel}: {connectedDeviceIdentifier}
              </Text>
            </TouchableOpacity>
          ) : null}

          {additionalKnownDevices.map(deviceName => (
            <TouchableOpacity
              key={deviceName}
              style={styles.deviceMenuItem}
              activeOpacity={0.85}
              onPress={() => {
                setSelectedDevice(deviceName);
                setShowDeviceMenu(false);
              }}>
              <Text style={styles.deviceMenuItemText}>{deviceName}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.deviceMenuDivider} />

          <TouchableOpacity
            style={styles.deviceMenuItem}
            activeOpacity={0.85}
            onPress={() => {
              setShowDeviceMenu(false);
              navigation.navigate('BindingGuide');
            }}>
            <Text style={styles.deviceMenuAddText}>Add a new robot</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 互访流程弹窗：包含访问请求确认和访问时长输入两种状态。 */}
      <Modal
        visible={watcherModal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeWatcherModal}>
        <View
          style={[
            styles.modalOverlay,
            {paddingHorizontal: scaleValue(34, 24, 40)},
          ]}>
          <TouchableOpacity
            style={styles.modalTapArea}
            activeOpacity={1}
            onPress={closeWatcherModal}
          />

          {/* 访问时长弹窗：供当前设备确认允许访问多久。 */}
          {watcherModal === 'visitDuration' ? (
            <View style={[styles.visitModalCard, {width: visitModalWidth}]}>
              <Text style={styles.visitModalTitle}>Visit Duration</Text>
              <TextInput
                value={visitDuration}
                onChangeText={setVisitDuration}
                placeholder="For example: 5 minutes"
                placeholderTextColor="#C6CBD1"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.visitDurationInput}
              />

              <View style={styles.visitActions}>
                <TouchableOpacity
                  style={styles.visitSecondaryButton}
                  activeOpacity={0.85}
                  onPress={closeWatcherModal}>
                  <Text style={styles.visitSecondaryText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.visitPrimaryButton}
                  activeOpacity={0.85}
                  onPress={handleConfirmVisitDuration}>
                  <Text style={styles.visitPrimaryText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* 访问请求弹窗：展示来自 Nearby/其它页面的邀请或访问请求。 */}
          {watcherModal === 'visitRequest' ? (
            <View style={[styles.visitModalCard, styles.visitRequestCard, {width: visitModalWidth}]}>
              <Text style={styles.visitModalTitle}>Visiting Request</Text>
              <Image
                source={require('../../assets/images/robot_watcher.png')}
                style={styles.visitRequestRobot}
                resizeMode="contain"
              />
              <Text style={styles.visitRequestCopy}>{watcherRequestText}</Text>

              <View style={styles.visitActions}>
                <TouchableOpacity
                  style={styles.visitSecondaryButton}
                  activeOpacity={0.85}
                  onPress={closeWatcherModal}>
                  <Text style={styles.visitSecondaryText}>Refuse</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.visitPrimaryButton}
                  activeOpacity={0.85}
                  onPress={handlePermitWatcherVisit}>
                  <Text style={styles.visitPrimaryText}>Permit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* 连接失败弹窗：根据蓝牙或 Wi-Fi 缺失给出不同的提示和设置入口。 */}
      <Modal
        visible={failureType !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setFailureType(null)}>
        <View
          style={[
            styles.modalOverlay,
            {paddingHorizontal: scaleValue(34, 24, 40)},
          ]}>
          <View
            style={[
              styles.modalCard,
              {
                width: modalCardWidth,
                paddingHorizontal: modalCardPadding,
                paddingTop: modalCardPadding,
                paddingBottom: modalCardPadding,
              },
            ]}>
            <View
              style={[
                styles.modalIconWrap,
                {
                  width: modalIconSize,
                  height: modalIconSize,
                },
              ]}>
              <FailureIcon />
            </View>
            <Text style={styles.modalTitle}>Connection Failed</Text>
            <Text
              style={[
                styles.modalDescription,
                {
                  maxWidth: Math.min(modalTextWidth, scaleValue(264, 248, 264)),
                },
              ]}>
              {failureCopy.description}
            </Text>

            <View style={[styles.modalActions, {gap: modalButtonGap}]}>
              <TouchableOpacity
                style={[styles.modalSecondaryButton, {height: modalButtonHeight}]}
                activeOpacity={0.85}
                onPress={() => setFailureType(null)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryButton, {height: modalButtonHeight}]}
                activeOpacity={0.85}
                onPress={async () => {
                  const currentFailureType = failureType;
                  setFailureType(null);

                  if (currentFailureType === 'bluetooth') {
                    await openFailureSettings();
                    return;
                  }

                  await handleConnectPress();
                }}>
                <Text style={styles.modalPrimaryText}>{failureCopy.action}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  header: {
    width: '100%',
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
  },
  headerTitle: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  triangleIcon: {
    width: 8,
    height: 9,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{rotate: '0deg'}],
  },
  triangleIconOpen: {
    transform: [{rotate: '90deg'}],
  },
  bellButton: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  deviceMenu: {
    position: 'absolute',
    zIndex: 3,
    minHeight: 120,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.025,
    shadowRadius: 5.2,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  deviceMenuSelected: {
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F5F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  deviceMenuSelectedDetailed: {
    minHeight: 52,
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  deviceMenuPlain: {
    backgroundColor: 'transparent',
  },
  deviceMenuSelectedText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  deviceMenuSelectedTextDetailed: {
    textAlign: 'left',
  },
  deviceMenuMetaText: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.deviceMeta,
    textAlign: 'left',
  },
  deviceMenuItem: {
    minHeight: 26,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  deviceMenuSelectedAlt: {
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F5F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  deviceMenuItemText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  deviceMenuDivider: {
    marginTop: 8,
    height: 1,
    backgroundColor: '#F1F2F4',
  },
  deviceMenuAddText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '400',
    color: '#8E959F',
    textAlign: 'center',
  },
  heroSection: {
    alignSelf: 'center',
  },
  deviceSection: {
    alignItems: 'center',
  },
  deviceImage: {
    alignSelf: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.statusGray,
  },
  connectedDeviceInfo: {
    alignItems: 'center',
    marginTop: 10,
    gap: 4,
  },
  connectedDeviceName: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
  },
  connectedDeviceMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.deviceMeta,
    textAlign: 'center',
  },
  buttonContainer: {
    alignSelf: 'center',
  },
  connectButton: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: COLORS.green,
  },
  connectButtonDisabled: {
    backgroundColor: '#E1E1E7',
  },
  connectButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 16,
    textAlign: 'center',
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    width: '100%',
  },
  gridCard: {
    height: 116,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
  },
  cardIconBg: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F3F5F8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.cardTitle,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 34,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.black,
    marginBottom: 12,
  },
  modalDescription: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: '#636A74',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalActions: {
    width: '100%',
    flexDirection: 'row',
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: '#F5F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.green,
  },
  modalPrimaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  modalTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  visitModalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
  },
  visitRequestCard: {
    paddingTop: 18,
  },
  visitModalTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  visitDurationInput: {
    marginTop: 22,
    width: '100%',
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F5F5F9',
    paddingHorizontal: 12,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: COLORS.black,
  },
  visitActions: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  visitSecondaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F5F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visitPrimaryButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visitSecondaryText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '500',
    color: COLORS.green,
  },
  visitPrimaryText: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
  visitRequestRobot: {
    marginTop: 16,
    width: 96,
    height: 96,
  },
  visitRequestCopy: {
    marginTop: 8,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    color: '#636A74',
    textAlign: 'center',
  },
});
