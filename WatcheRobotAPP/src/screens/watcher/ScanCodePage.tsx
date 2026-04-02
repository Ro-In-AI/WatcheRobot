import React, {useEffect, useRef, useState} from 'react';
import {useCallback} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {BluetoothStatus, useBluetooth} from '../../modules/bluetooth';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import type {Device} from 'react-native-ble-plx';
import {WatcherHeader} from '../../components/WatcherHeader';
import {useResponsiveScale} from '../../hooks/useResponsiveScale';
import bleConfig from '../../modules/bluetooth/config/ble_config.json';
import type {
  WatcherQrPayload,
  WatcherStackParamList,
} from '../../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<WatcherStackParamList, 'ScanCode'>;

const COLORS = {
  white: '#FFFFFF',
  green: '#8FC31F',
  overlay: 'rgba(0, 0, 0, 0.26)',
  panel: 'rgba(0, 0, 0, 0.46)',
  modalOverlay: 'rgba(0, 0, 0, 0.58)',
  fallback: '#1C1D21',
  card: '#FFFFFF',
  title: '#000000',
  body: '#636A74',
  cancelBg: '#F3F5F8',
};

type ScannedBleDevice = {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number | null;
};

const ScannerCorners: React.FC = () => (
  <Svg width="100%" height="100%" viewBox="0 0 200 200" fill="none">
    <Path
      d="M189.387 105H11.6127C8.51343 105 6 102.537 6 99.501C6 96.4619 8.51343 94 11.6127 94H189.387C192.488 94 195 96.463 195 99.501C195.001 102.537 192.488 105 189.387 105Z"
      fill={COLORS.green}
    />
    <Path
      d="M76.75 7H53.5H25C15.0589 7 7 15.0589 7 25V53.5V65.125M123.25 7H146.5H175C184.941 7 193 15.0589 193 25V53.5V65.125M76.75 193H53.5H25C15.0589 193 7 184.941 7 175V146.5V134.875M123.25 193H134.875H146.5H175C184.941 193 193 184.941 193 175V146.5V134.875"
      stroke={COLORS.green}
      strokeWidth="9"
      strokeLinecap="round"
    />
  </Svg>
);

const BarcodeHint: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Path
      d="M8.39941 4.40088H2.40088V10.3994C2.40088 10.7175 2.27453 11.0225 2.04963 11.2474C1.82474 11.4723 1.51971 11.5986 1.20166 11.5986C0.883605 11.5986 0.578578 11.4723 0.353681 11.2474C0.128783 11.0225 0.00243755 10.7175 0.00243755 10.3994V3.19922C0.00243755 2.53624 0.538674 2 1.20166 2H8.40185C8.5595 2.00016 8.71556 2.03137 8.86115 2.09184C9.00673 2.15232 9.13898 2.24088 9.25033 2.35246C9.36169 2.46405 9.44998 2.59647 9.51016 2.74218C9.57034 2.88788 9.60123 3.04401 9.60107 3.20166C9.60091 3.3593 9.5697 3.51537 9.50923 3.66095C9.44875 3.80654 9.36019 3.93878 9.24861 4.05014C9.13703 4.1615 9.0046 4.24979 8.8589 4.30997C8.71319 4.37015 8.55706 4.40104 8.39941 4.40088ZM8.39941 32H1.19922C0.881167 32 0.576141 31.8736 0.351244 31.6488C0.126346 31.4239 0 31.1188 0 30.8008V23.6006C0 23.2825 0.126346 22.9775 0.351244 22.7526C0.576141 22.5277 0.881167 22.4014 1.19922 22.4014C1.51727 22.4014 1.8223 22.5277 2.0472 22.7526C2.27209 22.9775 2.39844 23.2825 2.39844 23.6006V29.5991H8.39698C8.71535 29.5988 9.02082 29.725 9.24617 29.9499C9.47153 30.1748 9.59831 30.48 9.59863 30.7983C9.59896 31.1167 9.47279 31.4222 9.2479 31.6475C9.023 31.8729 8.71779 31.9997 8.39941 32ZM28.7983 11.6011C28.4803 11.6011 28.1753 11.4747 27.9504 11.2498C27.7255 11.0249 27.5991 10.7199 27.5991 10.4019V4.40331H21.6006C21.4431 4.40331 21.2872 4.3723 21.1417 4.31203C20.9962 4.25176 20.864 4.16343 20.7526 4.05207C20.6413 3.94071 20.5529 3.80851 20.4927 3.66302C20.4324 3.51752 20.4014 3.36158 20.4014 3.20409C20.4014 3.04661 20.4324 2.89067 20.4927 2.74517C20.5529 2.59968 20.6413 2.46748 20.7526 2.35612C20.864 2.24476 20.9962 2.15643 21.1417 2.09616C21.2872 2.03589 21.4431 2.00488 21.6006 2.00488H28.8008C29.4638 2.00488 30 2.54111 30 3.20409V10.4043C29.9987 10.7221 29.8715 11.0265 29.6463 11.2508C29.4211 11.4751 29.1162 11.6011 28.7983 11.6011ZM28.7983 32H21.5981C21.2801 32 20.9751 31.8736 20.7502 31.6488C20.5253 31.4239 20.3989 31.1188 20.3989 30.8008C20.3989 30.4827 20.5253 30.1777 20.7502 29.9528C20.9751 29.7279 21.2801 29.6016 21.5981 29.6016H27.5967V23.603C27.5967 23.285 27.723 22.9799 27.9479 22.755C28.1728 22.5301 28.4779 22.4038 28.7959 22.4038C29.114 22.4038 29.419 22.5301 29.6439 22.755C29.8688 22.9799 29.9951 23.285 29.9951 23.603V30.8032C29.9954 30.9605 29.9647 31.1162 29.9047 31.2616C29.8446 31.4069 29.7565 31.539 29.6453 31.6502C29.5341 31.7614 29.4021 31.8495 29.2567 31.9096C29.1114 31.9696 28.9556 32.0003 28.7983 32ZM3.88772 10.0094H6.55427V23.993H3.88772V10.0094ZM7.39031 10.0094H8.72359V23.993H7.39031V10.0094ZM24.0721 10.0094H25.9758V23.993H24.0721V10.0094ZM19.8066 10.0094H21.1399V23.993H19.8066V10.0094ZM9.98131 10.0094H13.6375V23.993H9.98131V10.0094ZM16.4552 10.0094H18.6635V23.993H16.4552V10.0094ZM14.398 10.0094H15V23.993H14.398V10.0094ZM22.9363 10.0094H23.5383V23.993H22.9363V10.0094"
      fill="#FFFFFF"
    />
    <Path
      d="M8.39941 4.40088H2.40088V10.3994C2.40088 10.7175 2.27453 11.0225 2.04963 11.2474C1.82474 11.4723 1.51971 11.5986 1.20166 11.5986C0.883605 11.5986 0.578578 11.4723 0.353681 11.2474C0.128783 11.0225 0.00243755 10.7175 0.00243755 10.3994V3.19922C0.00243755 2.53624 0.538674 2 1.20166 2H8.40185C8.5595 2.00016 8.71556 2.03137 8.86115 2.09184C9.00673 2.15232 9.13898 2.24088 9.25033 2.35246C9.36169 2.46405 9.44998 2.59647 9.51016 2.74218C9.57034 2.88788 9.60123 3.04401 9.60107 3.20166C9.60091 3.3593 9.5697 3.51537 9.50923 3.66095C9.44875 3.80654 9.36019 3.93878 9.24861 4.05014C9.13703 4.1615 9.0046 4.24979 8.8589 4.30997C8.71319 4.37015 8.55706 4.40104 8.39941 4.40088ZM8.39941 32H1.19922C0.881167 32 0.576141 31.8736 0.351244 31.6488C0.126346 31.4239 0 31.1188 0 30.8008V23.6006C0 23.2825 0.126346 22.9775 0.351244 22.7526C0.576141 22.5277 0.881167 22.4014 1.19922 22.4014C1.51727 22.4014 1.8223 22.5277 2.0472 22.7526C2.27209 22.9775 2.39844 23.2825 2.39844 23.6006V29.5991H8.39698C8.71535 29.5988 9.02082 29.725 9.24617 29.9499C9.47153 30.1748 9.59831 30.48 9.59863 30.7983C9.59896 31.1167 9.47279 31.4222 9.2479 31.6475C9.023 31.8729 8.71779 31.9997 8.39941 32ZM28.7983 11.6011C28.4803 11.6011 28.1753 11.4747 27.9504 11.2498C27.7255 11.0249 27.5991 10.7199 27.5991 10.4019V4.40331H21.6006C21.4431 4.40331 21.2872 4.3723 21.1417 4.31203C20.9962 4.25176 20.864 4.16343 20.7526 4.05207C20.6413 3.94071 20.5529 3.80851 20.4927 3.66302C20.4324 3.51752 20.4014 3.36158 20.4014 3.20409C20.4014 3.04661 20.4324 2.89067 20.4927 2.74517C20.5529 2.59968 20.6413 2.46748 20.7526 2.35612C20.864 2.24476 20.9962 2.15643 21.1417 2.09616C21.2872 2.03589 21.4431 2.00488 21.6006 2.00488H28.8008C29.4638 2.00488 30 2.54111 30 3.20409V10.4043C29.9987 10.7221 29.8715 11.0265 29.6463 11.2508C29.4211 11.4751 29.1162 11.6011 28.7983 11.6011ZM28.7983 32H21.5981C21.2801 32 20.9751 31.8736 20.7502 31.6488C20.5253 31.4239 20.3989 31.1188 20.3989 30.8008C20.3989 30.4827 20.5253 30.1777 20.7502 29.9528C20.9751 29.7279 21.2801 29.6016 21.5981 29.6016H27.5967V23.603C27.5967 23.285 27.723 22.9799 27.9479 22.755C28.1728 22.5301 28.4779 22.4038 28.7959 22.4038C29.114 22.4038 29.419 22.5301 29.6439 22.755C29.8688 22.9799 29.9951 23.285 29.9951 23.603V30.8032C29.9954 30.9605 29.9647 31.1162 29.9047 31.2616C29.8446 31.4069 29.7565 31.539 29.6453 31.6502C29.5341 31.7614 29.4021 31.8495 29.2567 31.9096C29.1114 31.9696 28.9556 32.0003 28.7983 32Z"
      fill="#8FC31F"
    />
  </Svg>
);

const FlashIcon: React.FC = () => (
  <Svg width={17} height={26} viewBox="0 0 17 26" fill="none">
    <Path
      d="M0.859375 1.71875H15.2594C15.7344 1.71875 16.1188 1.33437 16.1188 0.859375C16.1188 0.384375 15.7344 0 15.2594 0H0.859375C0.384375 0 0 0.384375 0 0.859375C0 1.33437 0.384375 1.71875 0.859375 1.71875ZM16.2 3.67187H0.0406246V8.475L3.525 12.2094V25.675H12.7187V12.325L16.2 8.46562V3.67187ZM10.9969 23.9594H5.24375V12.6156H11V23.9594H10.9969ZM14.4812 7.80625L11.7063 10.8812H4.63437L1.75625 7.79687V5.39062H14.4812V7.80625Z"
      fill="#FFFFFF"
    />
  </Svg>
);

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

// 扫码页用于调用摄像头扫描设备二维码，并继续进入绑定/配网流程。
export const ScanCodePage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();
  const {startScan, stopScan, connectToDevice, status, clearError, clearAll} =
    useBluetooth();
  const {scaleValue, verticalScaleValue, windowWidth, windowHeight} =
    useResponsiveScale();
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [isPairingActive, setIsPairingActive] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [isTorchEnabled, setIsTorchEnabled] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<ScannedBleDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const pairingStartedRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const scannedDevicesRef = useRef<ScannedBleDevice[]>([]);
  const selectedDeviceRef = useRef<ScannedBleDevice | null>(null);
  const targetBleName = bleConfig.ble_device_name;

  // 页面主要尺寸按统一响应式规则换算
  const sideInset = scaleValue(30, 24, 30);
  const contentWidth = windowWidth - sideInset * 2;
  const titleTop = verticalScaleValue(169, 148, 178);
  const frameTop = verticalScaleValue(34, 28, 38);
  const flashTop = verticalScaleValue(32, 24, 36);
  const frameSize = Math.min(contentWidth * 0.6, scaleValue(200, 188, 208));
  const dividerWidth = Math.min(contentWidth * 0.82, scaleValue(270, 248, 278));
  const pairingCardWidth = Math.min(contentWidth, scaleValue(304, 280, 320));
  const failureCardPadding = scaleValue(30, 24, 30);
  const failureIconSize = scaleValue(66, 60, 66);
  const failureButtonGap = scaleValue(20, 16, 20);
  const failureButtonHeight = verticalScaleValue(50, 46, 50);
  const pickerCardWidth = Math.min(contentWidth, scaleValue(324, 296, 336));
  const pickerMaxHeight = Math.min(
    windowHeight * 0.52,
    verticalScaleValue(380, 340, 400),
  );

  const getDeviceDisplayName = useCallback(
    (item: ScannedBleDevice) =>
      item.name?.trim() || item.localName?.trim() || targetBleName,
    [targetBleName],
  );

  const registerScannedDevice = useCallback((deviceItem: Device) => {
    const localName =
      (deviceItem as Device & {localName?: string | null}).localName ?? null;
    const nextDevice: ScannedBleDevice = {
      id: deviceItem.id,
      name: deviceItem.name ?? null,
      localName,
      rssi: deviceItem.rssi ?? null,
    };

    const existingIndex = scannedDevicesRef.current.findIndex(
      item => item.id === nextDevice.id,
    );

    if (existingIndex === -1) {
      const next = [...scannedDevicesRef.current, nextDevice];
      scannedDevicesRef.current = next;
      setScannedDevices(next);
      return next.length === 1;
    }

    const next = [...scannedDevicesRef.current];
    next[existingIndex] = nextDevice;
    scannedDevicesRef.current = next;
    setScannedDevices(next);
    return false;
  }, []);

  const handleOpenSettings = useCallback(() => {
    const openSettings = async () => {
      try {
        if (Platform.OS === 'android') {
          await Linking.sendIntent('android.settings.SETTINGS');
          return;
        }

        await Linking.openSettings();
      } catch {
        Alert.alert(
          'Unable to open settings',
          'Please open your system settings manually and enable camera permission for this app.',
        );
      }
    };

    openSettings().catch(() => {
      Alert.alert(
        'Unable to open settings',
        'Please open your system settings manually and enable camera permission for this app.',
      );
    });
  }, []);

  const requestCameraAccess = useCallback(async () => {
    try {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          'Camera permission required',
          'Camera access is currently turned off. Please allow camera access, or open system settings and enable it manually.',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Open settings',
              onPress: handleOpenSettings,
            },
          ],
        );
      }
    } catch {
      Alert.alert(
        'Camera permission failed',
        'Unable to request camera access right now. Please try again, or open system settings and enable camera access manually.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Open settings',
            onPress: handleOpenSettings,
          },
        ],
      );
    }
  }, [handleOpenSettings, requestPermission]);

  useEffect(() => {
    if (!hasPermission && !permissionRequested) {
      setPermissionRequested(true);
      requestCameraAccess().catch(() => {});
    }
  }, [hasPermission, permissionRequested, requestCameraAccess]);

  const resetPairingState = useCallback(() => {
    pairingStartedRef.current = false;
    setIsPairingActive(false);
    setShowDevicePicker(false);
    setSelectedDeviceId(null);
    setScannedDevices([]);
    scannedDevicesRef.current = [];
    selectedDeviceRef.current = null;
    clearError();
    clearAll();
    stopScan().catch(() => {});
  }, [clearAll, clearError, stopScan]);

  const startPairingFlow = useCallback(async () => {
    if (pairingStartedRef.current) {
      return;
    }

    pairingStartedRef.current = true;
    setShowFailureModal(false);
    setShowDevicePicker(false);
    setIsPairingActive(true);
    setSelectedDeviceId(null);
    setScannedDevices([]);
    scannedDevicesRef.current = [];
    selectedDeviceRef.current = null;
    clearError();
    clearAll();

    try {
      await startScan(
        deviceItem => {
          const localName =
            (deviceItem as Device & {localName?: string | null}).localName ?? null;
          if (deviceItem.name !== targetBleName && localName !== targetBleName) {
            return;
          }

          const isFirstMatchedDevice = registerScannedDevice(deviceItem);
          if (isFirstMatchedDevice) {
            stopScan().catch(() => {});
          }
        },
        {timeout: 10000},
      );
    } finally {
      await stopScan();
      pairingStartedRef.current = false;
      setIsPairingActive(false);
    }

    if (scannedDevicesRef.current.length === 0) {
      setShowFailureModal(true);
      return;
    }

    setShowDevicePicker(true);
  }, [
    clearAll,
    clearError,
    registerScannedDevice,
    startScan,
    stopScan,
    targetBleName,
  ]);

  const handleDeviceConnect = useCallback(
    async (deviceItem: ScannedBleDevice) => {
      if (selectedDeviceId) {
        return;
      }

      selectedDeviceRef.current = deviceItem;
      setSelectedDeviceId(deviceItem.id);
      setShowDevicePicker(false);
      setShowFailureModal(false);
      setIsPairingActive(true);
      clearError();

      try {
        await connectToDevice(deviceItem.id, {
          timeout: 12000,
          autoConnect: false,
        });
      } catch {
        pairingStartedRef.current = false;
        setIsPairingActive(false);
        setSelectedDeviceId(null);
        setShowFailureModal(true);
      }
    },
    [clearError, connectToDevice, selectedDeviceId],
  );

  useEffect(() => {
    if (!isPairingActive) {
      return;
    }

    if (status === BluetoothStatus.Connected && !hasNavigatedRef.current) {
      const targetDevice = selectedDeviceRef.current;
      hasNavigatedRef.current = true;
      navigation.replace('WifiSelect', {
        bleName: targetDevice ? getDeviceDisplayName(targetDevice) : targetBleName,
        bleId: targetDevice?.id,
      } satisfies WatcherQrPayload);
      return;
    }

    if (status === BluetoothStatus.Error) {
      pairingStartedRef.current = false;
      setIsPairingActive(false);
      setSelectedDeviceId(null);
      setShowFailureModal(true);
    }
  }, [getDeviceDisplayName, isPairingActive, navigation, status, targetBleName]);

  const handleScanSuccess = useCallback(() => {
    if (hasNavigatedRef.current || isPairingActive) {
      return;
    }

    startPairingFlow().catch(() => {});
  }, [isPairingActive, startPairingFlow]);

  const handleRetryPairing = () => {
    resetPairingState();
    startPairingFlow().catch(() => {});
  };

  const handleCloseFailureModal = () => {
    setShowFailureModal(false);
    resetPairingState();
  };

  const handleCloseDevicePicker = () => {
    setShowDevicePicker(false);
    resetPairingState();
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'code-128'],
    onCodeScanned: codes => {
      const matchedCode = codes.find(code => {
        return typeof code.value === 'string' && code.value.trim().length > 0;
      });

      if (matchedCode) {
        handleScanSuccess();
      }
    },
  });

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        {device && hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={
              isFocused &&
              !isPairingActive &&
              !showFailureModal &&
              !showDevicePicker
            }
            torch={isTorchEnabled ? 'on' : 'off'}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={styles.cameraFallback} />
        )}

        <View style={{height: insets.top}} />
        <View style={styles.overlay} />

        <WatcherHeader
          title="Scan Code"
          onBack={() => navigation.goBack()}
          sideInset={sideInset}
          backgroundColor="transparent"
          titleColor="#FFFFFF"
          iconColor="#FFFFFF"
        />

        <View style={styles.content}>
          <View style={{marginTop: titleTop}}>
            <View style={styles.scanTitleRow}>
              <BarcodeHint />
              <Text style={styles.scanTitle}>Scan Device QR Code</Text>
            </View>

            <View style={[styles.scanDivider, {width: dividerWidth}]} />

            <View
              style={[
                styles.scanFrameWrap,
                {
                  width: frameSize,
                  height: frameSize,
                  marginTop: frameTop,
                },
              ]}>
              <ScannerCorners />
            </View>

            <TouchableOpacity
              style={[
                styles.flashWrap,
                {marginTop: flashTop},
                isTorchEnabled && styles.flashWrapActive,
              ]}
              activeOpacity={0.85}
              onPress={() => setIsTorchEnabled(previous => !previous)}>
              <FlashIcon />
            </TouchableOpacity>

          </View>
        </View>

        {isPairingActive ? (
          <View style={styles.pairingOverlay}>
            <View style={[styles.pairingCard, {width: pairingCardWidth}]}>
              <ActivityIndicator size="small" color={COLORS.green} />
              <Text style={styles.pairingTitle}>
                {status === BluetoothStatus.Connecting
                  ? 'Bluetooth is connecting'
                  : 'Searching for Watcher'}
              </Text>
              <Text style={styles.pairingBody}>
                {status === BluetoothStatus.Connecting
                  ? 'Please keep your phone close to the robot while pairing.'
                  : 'Scanning nearby Bluetooth devices and locating your Watcher.'}
              </Text>
            </View>
          </View>
        ) : null}

        <Modal
          visible={showDevicePicker}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleCloseDevicePicker}>
          <View style={styles.failureOverlay}>
            <View style={[styles.devicePickerCard, {width: pickerCardWidth}]}>
              <Text style={styles.devicePickerTitle}>Select Bluetooth Device</Text>
              <Text style={styles.devicePickerBody}>
                Found {scannedDevices.length} nearby {targetBleName} devices. Choose
                the MAC or Bluetooth ID you want to connect to.
              </Text>
              <ScrollView
                style={[styles.devicePickerList, {maxHeight: pickerMaxHeight}]}
                contentContainerStyle={styles.devicePickerListContent}
                showsVerticalScrollIndicator={false}>
                {scannedDevices.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.devicePickerItem,
                      selectedDeviceId === item.id && styles.devicePickerItemActive,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      handleDeviceConnect(item).catch(() => {});
                    }}>
                    <View style={styles.devicePickerTextWrap}>
                      <Text style={styles.devicePickerName}>
                        {getDeviceDisplayName(item)}
                      </Text>
                      <Text style={styles.devicePickerId}>{item.id}</Text>
                    </View>
                    <Text style={styles.devicePickerMeta}>
                      {typeof item.rssi === 'number' ? `${item.rssi} dBm` : 'Nearby'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.devicePickerActions}>
                <TouchableOpacity
                  style={[styles.failureSecondaryButton, styles.devicePickerAction]}
                  activeOpacity={0.85}
                  onPress={handleCloseDevicePicker}>
                  <Text style={styles.failureSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.failurePrimaryButton, styles.devicePickerAction]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setShowDevicePicker(false);
                    startPairingFlow().catch(() => {});
                  }}>
                  <Text style={styles.failurePrimaryText}>Rescan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showFailureModal}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleCloseFailureModal}>
          <View style={styles.failureOverlay}>
            <View
              style={[
                styles.failureCard,
                {
                  width: pairingCardWidth,
                  paddingHorizontal: failureCardPadding,
                  paddingTop: failureCardPadding,
                  paddingBottom: failureCardPadding,
                },
              ]}>
              <View
                style={[
                  styles.failureIconWrap,
                  {width: failureIconSize, height: failureIconSize},
                ]}>
                <FailureIcon />
              </View>
              <Text style={styles.failureTitle}>Connection Failed</Text>
              <Text style={styles.failureBody}>
                Please make sure the robot is powered on and nearby, then try
                again.
              </Text>
              <View style={[styles.failureActions, {gap: failureButtonGap}]}>
                <TouchableOpacity
                  style={[
                    styles.failureSecondaryButton,
                    {height: failureButtonHeight},
                  ]}
                  activeOpacity={0.85}
                  onPress={handleCloseFailureModal}>
                  <Text style={styles.failureSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.failurePrimaryButton,
                    {height: failureButtonHeight},
                  ]}
                  activeOpacity={0.85}
                  onPress={handleRetryPairing}>
                  <Text style={styles.failurePrimaryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#101113',
  },
  container: {
    flex: 1,
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.fallback,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  scanTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanTitle: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scanDivider: {
    marginTop: 12,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  scanFrameWrap: {
    alignSelf: 'center',
  },
  flashWrap: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashWrapActive: {
    backgroundColor: 'transparent',
  },
  pairingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    paddingHorizontal: 20,
  },
  pairingCard: {
    borderRadius: 20,
    backgroundColor: COLORS.panel,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
  },
  pairingTitle: {
    marginTop: 14,
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  pairingBody: {
    marginTop: 10,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },
  devicePickerCard: {
    borderRadius: 18,
    backgroundColor: COLORS.card,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
  },
  devicePickerTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: COLORS.title,
    textAlign: 'center',
  },
  devicePickerBody: {
    marginTop: 10,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: COLORS.body,
    textAlign: 'center',
  },
  devicePickerList: {
    marginTop: 18,
  },
  devicePickerListContent: {
    gap: 10,
  },
  devicePickerItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E6EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  devicePickerItemActive: {
    borderColor: COLORS.green,
    backgroundColor: '#F7FBEF',
  },
  devicePickerTextWrap: {
    flex: 1,
  },
  devicePickerName: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
    color: COLORS.title,
  },
  devicePickerId: {
    marginTop: 4,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: COLORS.body,
  },
  devicePickerMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: COLORS.green,
  },
  devicePickerActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  devicePickerAction: {
    flex: 1,
    height: 48,
  },
  failureOverlay: {
    flex: 1,
    backgroundColor: COLORS.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  failureCard: {
    borderRadius: 16,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  failureIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  failureTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    color: COLORS.title,
    textAlign: 'center',
    marginBottom: 12,
  },
  failureBody: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: COLORS.body,
    textAlign: 'center',
  },
  failureActions: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
  },
  failureSecondaryButton: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: COLORS.cancelBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failurePrimaryButton: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failureSecondaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.green,
  },
  failurePrimaryText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
