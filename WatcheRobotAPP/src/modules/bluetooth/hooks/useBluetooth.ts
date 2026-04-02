import {useCallback, useRef} from 'react';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import base64 from 'react-native-base64';
import {useDispatch, useSelector} from 'react-redux';
import bleConfig from '../config/ble_config.json';
import {
  BLUETOOTH_DEFAULT_CONFIG,
  BLUETOOTH_UUIDS,
} from '../constants/bluetoothConstants';
import {
  BLE_PROTOCOL_TYPES,
  BleProtocolNackError,
  assertAckForCommand,
  assertPongMessage,
  buildAiStatusCommand,
  buildPingCommand,
  buildRobotStateSetCommand,
  buildServoAngleCommand,
  buildWifiClearCommand,
  buildWifiGetCommand,
  buildWifiSetCommand,
  encodeBleProtocolMessage,
  isNackMessage,
  isAckMessage,
  isWifiStatusMessage,
  parseBleProtocolMessage,
  tryParseBleProtocolMessage,
  type BleProtocolMessage,
  type BleWifiStatusMessage,
} from '../protocol/bleProtocol';
import {bluetoothService} from '../services/bluetoothService';
import {
  type BluetoothReceivedData,
  BluetoothStatus,
  type ConnectOptions,
  type DeviceDiscoveredCallback,
  type NotificationListener,
  type NotificationOptions,
  type ProtocolMessageListener,
  type ScanOptions,
  type UseBluetoothReturn,
  type WifiProvisioningStatus,
} from '../types';
import {
  selectBluetoothState,
  setDeviceInfo,
  setError,
  setReceivedData,
  setStatus,
} from '../store';
import {STORAGE_KEYS} from '../../../utils/storageKeys';

const PROTOCOL_NOTIFICATION_OPTIONS: NotificationOptions = {
  serviceUUID: BLUETOOTH_UUIDS.SERVICE_UUID,
  characteristicUUID: BLUETOOTH_UUIDS.PROTOCOL_IO,
};

const HOOK_LOG_PREFIX = '[蓝牙][Hook]';

const logHook = (message: string, details?: unknown) => {
  if (details !== undefined) {
    console.log(HOOK_LOG_PREFIX, message, details);
    return;
  }

  console.log(HOOK_LOG_PREFIX, message);
};

const warnHook = (message: string, details?: unknown) => {
  if (details !== undefined) {
    console.warn(HOOK_LOG_PREFIX, message, details);
    return;
  }

  console.warn(HOOK_LOG_PREFIX, message);
};

const summarizeProtocolMessage = (message: BleProtocolMessage) => ({
  type: message.type,
  code: message.code,
  commandId: 'command_id' in message.data ? message.data.command_id : undefined,
  data: message.data,
});

const getCharacteristicName = (options: NotificationOptions) => {
  const service = bleConfig.services.find(
    item => item.uuid.toLowerCase() === options.serviceUUID.toLowerCase(),
  );
  const characteristic = service?.characteristics.find(
    item => item.uuid.toLowerCase() === options.characteristicUUID.toLowerCase(),
  );

  return characteristic?.name ?? 'Unknown';
};

const toReceivedData = (
  message: unknown,
  options: NotificationOptions,
): BluetoothReceivedData => ({
  characteristicName: getCharacteristicName(options),
  characteristicUUID: options.characteristicUUID,
  data: message,
  timestamp: new Date().toISOString(),
});

const decodeNotificationText = (value: string | BluetoothReceivedData) => {
  if (typeof value === 'string') {
    return base64.decode(value);
  }

  if (typeof value.data === 'string') {
    return value.data;
  }

  return '';
};

export const toWifiProvisioningStatus = (
  message: BleWifiStatusMessage,
): WifiProvisioningStatus => {
  const {status, ssid, ip} = message.data;

  return {
    state: status,
    message:
      status === 'connected'
        ? `Watcher connected to ${ssid ?? 'Wi-Fi'}`
        : status === 'connecting'
          ? `Watcher is connecting to ${ssid ?? 'Wi-Fi'}`
          : status === 'disconnected'
            ? `Watcher disconnected from ${ssid ?? 'Wi-Fi'}`
            : 'Watcher is waiting for Wi-Fi credentials.',
    raw: JSON.stringify(message),
    ssid,
    ip,
  };
};

const clampAngle = (value: number) =>
  Math.max(0, Math.min(180, value));

export const useBluetooth = (): UseBluetoothReturn => {
  const dispatch = useDispatch();
  const {status, deviceInfo, receivedData, error} =
    useSelector(selectBluetoothState);
  const protocolMessageListenersRef = useRef<Set<ProtocolMessageListener>>(
    new Set(),
  );
  const protocolNotificationCleanupRef = useRef<(() => void) | null>(null);
  const protocolSequenceRef = useRef(0);
  const latestWifiStatusRef = useRef<{
    sequence: number;
    status: WifiProvisioningStatus;
  } | null>(null);
  const autoRescanConfigRef = useRef<{
    scanTimeout: number;
    connectTimeout: number;
    autoConnect: boolean;
    enableAutoRescan: boolean;
    maxRescanAttempts: number;
    rescanDelayMs: number;
    currentAttempts: number;
  } | null>(null);

  const dispatchProtocolMessage = useCallback(
    (message: BleProtocolMessage, options: NotificationOptions = PROTOCOL_NOTIFICATION_OPTIONS) => {
      protocolSequenceRef.current += 1;
      if (isWifiStatusMessage(message)) {
        latestWifiStatusRef.current = {
          sequence: protocolSequenceRef.current,
          status: toWifiProvisioningStatus(message),
        };
      }

      logHook('分发协议消息到 Redux', {
        source: {
          serviceUUID: options.serviceUUID,
          characteristicUUID: options.characteristicUUID,
        },
        message: summarizeProtocolMessage(message),
      });
      dispatch(setReceivedData(toReceivedData(message, options)));
    },
    [dispatch],
  );

  const initialize = useCallback(async () => {
    try {
      await bluetoothService.initialize();
    } catch (err: any) {
      dispatch(
        setError({
          message: err.message || 'Bluetooth initialization failed',
        }),
      );
    }
  }, [dispatch]);

  const startScan = useCallback(
    async (onDeviceFound: DeviceDiscoveredCallback, options?: ScanOptions) => {
      try {
        await bluetoothService.initialize();
        dispatch(setStatus(BluetoothStatus.Scanning));
        dispatch(setError(null));
        await bluetoothService.startScan(onDeviceFound, options);
      } catch (err: any) {
        dispatch(setStatus(BluetoothStatus.Error));
        dispatch(
          setError({
            message: err.message || 'Scan failed',
          }),
        );
      }
    },
    [dispatch],
  );

  const stopScan = useCallback(async () => {
    bluetoothService.stopScan();
    if (status === BluetoothStatus.Scanning) {
      dispatch(setStatus(BluetoothStatus.Idle));
    }
  }, [dispatch, status]);

  const connectToDevice = useCallback(
    async (deviceId: string, options?: ConnectOptions) => {
      try {
        dispatch(setStatus(BluetoothStatus.Connecting));
        dispatch(setError(null));

        const device = await bluetoothService.connectToDevice(deviceId, options);
        await AsyncStorage.setItem(STORAGE_KEYS.lastConnectedDeviceId, device.id);

        dispatch(setStatus(BluetoothStatus.Connected));
        dispatch(
          setDeviceInfo({
            id: device.id,
            name: device.name,
            mtu: device.mtu,
          }),
        );

        bluetoothService.setOnDisconnectedListener(() => {
          dispatch(setStatus(BluetoothStatus.Disconnected));
          dispatch(setDeviceInfo(null));
          dispatch(setReceivedData(null));
        });
      } catch (err: any) {
        dispatch(setStatus(BluetoothStatus.Error));
        dispatch(
          setError({
            message: err.message || 'Connection failed',
          }),
        );
        throw err;
      }
    },
    [dispatch],
  );

  const disconnect = useCallback(async () => {
    try {
      await bluetoothService.disconnectDevice();
      dispatch(setStatus(BluetoothStatus.Disconnected));
      dispatch(setDeviceInfo(null));
      dispatch(setReceivedData(null));
    } catch {
      // Ignore disconnect cleanup failures.
    }
  }, [dispatch]);

  const writeData = useCallback(
    async (
      serviceUUID: string,
      characteristicUUID: string,
      data: string | Uint8Array,
      withResponse: boolean = false,
    ) => {
      try {
        const options: NotificationOptions = {
          serviceUUID,
          characteristicUUID,
        };

        if (withResponse) {
          await bluetoothService.sendDataWithResponse(options, data);
        } else {
          await bluetoothService.sendDataWithoutResponse(options, data);
        }
      } catch (err: any) {
        dispatch(
          setError({
            message: err.message || 'Write data failed',
          }),
        );
        throw err;
      }
    },
    [dispatch],
  );

  const readData = useCallback(
    async (serviceUUID: string, characteristicUUID: string) => {
      try {
        return await bluetoothService.readCharacteristic({
          serviceUUID,
          characteristicUUID,
        });
      } catch (err: any) {
        dispatch(
          setError({
            message: err.message || 'Read data failed',
          }),
        );
        throw err;
      }
    },
    [dispatch],
  );

  const subscribeToNotifications = useCallback(
    (options: NotificationOptions, callback: NotificationListener) => {
      try {
        return bluetoothService.startNotifications(options, value => {
          let processedData: unknown = value;

          if (typeof value === 'string') {
            processedData = base64.decode(value);
          }

          logHook('收到原始通知并准备回调分发', {
            serviceUUID: options.serviceUUID,
            characteristicUUID: options.characteristicUUID,
            processedData,
          });

          const nextReceivedData = toReceivedData(processedData, options);
          dispatch(setReceivedData(nextReceivedData));
          callback(nextReceivedData);
        });
      } catch (err: any) {
        dispatch(
          setError({
            message: err.message || 'Subscribe notifications failed',
          }),
        );
        return () => {};
      }
    },
    [dispatch],
  );

  const ensureProtocolNotificationSubscription = useCallback(() => {
    if (protocolNotificationCleanupRef.current) {
      return;
    }

    logHook('建立底层协议通知订阅');
    protocolNotificationCleanupRef.current = subscribeToNotifications(
      PROTOCOL_NOTIFICATION_OPTIONS,
      value => {
        const raw = decodeNotificationText(value);
        logHook('收到协议通知原文', {raw});
        const parsed = tryParseBleProtocolMessage(raw);

        if (!parsed) {
          warnHook('协议通知解析失败，已忽略', {raw});
          return;
        }

        dispatchProtocolMessage(parsed);
        logHook('协议通知解析成功，准备执行监听器', {
          listenerCount: protocolMessageListenersRef.current.size,
          message: summarizeProtocolMessage(parsed),
        });

        protocolMessageListenersRef.current.forEach(listener => {
          try {
            listener(parsed);
          } catch (error) {
            warnHook('协议监听器执行失败', {error});
          }
        });
      },
    );
  }, [dispatchProtocolMessage, subscribeToNotifications]);

  const maybeStopProtocolNotificationSubscription = useCallback(() => {
    if (
      protocolMessageListenersRef.current.size > 0 ||
      !protocolNotificationCleanupRef.current
    ) {
      return;
    }

    logHook('移除底层协议通知订阅');
    protocolNotificationCleanupRef.current();
    protocolNotificationCleanupRef.current = null;
  }, []);

  const subscribeToProtocolMessages = useCallback(
    (callback: ProtocolMessageListener) => {
      protocolMessageListenersRef.current.add(callback);
      logHook('注册协议消息监听器', {
        listenerCount: protocolMessageListenersRef.current.size,
      });
      ensureProtocolNotificationSubscription();

      return () => {
        protocolMessageListenersRef.current.delete(callback);
        logHook('注销协议消息监听器', {
          listenerCount: protocolMessageListenersRef.current.size,
        });
        maybeStopProtocolNotificationSubscription();
      };
    },
    [
      ensureProtocolNotificationSubscription,
      maybeStopProtocolNotificationSubscription,
    ],
  );

  const ensureConnected = useCallback(async () => {
    if (status !== BluetoothStatus.Connected || !deviceInfo) {
      throw new Error('Bluetooth device is not connected.');
    }

    const stillConnected = await bluetoothService.isDeviceConnected(deviceInfo.id);

    if (!stillConnected) {
      dispatch(setStatus(BluetoothStatus.Disconnected));
      dispatch(setDeviceInfo(null));
      throw new Error('The BLE device disconnected.');
    }
  }, [deviceInfo, dispatch, status]);

  const readCachedProtocolMessage = useCallback(async () => {
    logHook('开始读取缓存协议消息');
    const raw = await bluetoothService.readCharacteristic(
      PROTOCOL_NOTIFICATION_OPTIONS,
    );
    logHook('读取到缓存协议原文', {raw});
    const parsed = tryParseBleProtocolMessage(raw);

    if (parsed) {
      dispatchProtocolMessage(parsed);
      logHook('缓存协议消息解析成功', {
        message: summarizeProtocolMessage(parsed),
      });
    } else {
      warnHook('缓存协议消息解析失败', {raw});
    }

    return parsed;
  }, [dispatchProtocolMessage]);

  const waitForWifiStatus = useCallback(
    (
      timeoutMs: number = BLUETOOTH_DEFAULT_CONFIG.PROTOCOL_RESPONSE_TIMEOUT,
      preferredStates?: WifiProvisioningStatus['state'][],
      minSequence: number = 0,
    ) =>
      new Promise<WifiProvisioningStatus | null>(resolve => {
        let settled = false;
        const currentWifiStatus = latestWifiStatusRef.current;
        let latestStatus: WifiProvisioningStatus | null =
          currentWifiStatus && currentWifiStatus.sequence >= minSequence
            ? currentWifiStatus.status
            : null;
        logHook('开始等待 Wi-Fi 状态通知', {timeoutMs});

        if (
          latestStatus &&
          (!preferredStates?.length ||
            preferredStates.includes(latestStatus.state))
        ) {
          logHook('命中已缓存的 Wi-Fi 状态，直接返回', {
            minSequence,
            preferredStates,
            latestStatus,
          });
          resolve(latestStatus);
          return;
        }

        const finalize = () => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(latestStatus);
        };

        const timeoutId = setTimeout(() => {
          warnHook('等待 Wi-Fi 状态通知超时', {timeoutMs});
          finalize();
        }, timeoutMs);

        const unsubscribe = subscribeToProtocolMessages(message => {
          if (!isWifiStatusMessage(message) || settled) {
            return;
          }

          latestStatus = toWifiProvisioningStatus(message);
          logHook('收到 Wi-Fi 状态通知', {
            message: summarizeProtocolMessage(message),
            preferredStates,
            minSequence,
          });

          if (
            !preferredStates?.length ||
            preferredStates.includes(latestStatus.state)
          ) {
            finalize();
          }
        });
      }),
    [subscribeToProtocolMessages],
  );

  const resolveWifiOperationStatus = useCallback(
    async (
      response: BleProtocolMessage,
      expectedType:
        | typeof BLE_PROTOCOL_TYPES.wifiGet
        | typeof BLE_PROTOCOL_TYPES.wifiClear,
      preferredStates?: WifiProvisioningStatus['state'][],
      minSequence: number = 0,
    ) => {
      let immediateStatus: WifiProvisioningStatus | null = null;

      if (isWifiStatusMessage(response)) {
        immediateStatus = toWifiProvisioningStatus(response);
        logHook('Wi-Fi 操作收到即时状态响应', {
          expectedType,
          response: summarizeProtocolMessage(response),
        });
      } else if (isAckMessage(response)) {
        if (response.data.type !== expectedType) {
          warnHook('Wi-Fi 操作 ACK 类型异常，继续等待状态通知', {
            expectedType,
            ackType: response.data.type,
            response: summarizeProtocolMessage(response),
          });
        }
      } else if (response.type === expectedType) {
        logHook('Wi-Fi 操作收到请求回显，继续等待状态通知', {
          expectedType,
          response: summarizeProtocolMessage(response),
        });
      } else {
        warnHook('Wi-Fi 操作收到非预期同步响应，继续等待状态通知', {
          expectedType,
          response: summarizeProtocolMessage(response),
        });
      }

      const notifiedStatus = await waitForWifiStatus(
        BLUETOOTH_DEFAULT_CONFIG.PROTOCOL_RESPONSE_TIMEOUT,
        preferredStates,
        minSequence,
      );
      if (notifiedStatus) {
        return notifiedStatus;
      }

      const fallbackMessage = await readCachedProtocolMessage();
      if (fallbackMessage && isWifiStatusMessage(fallbackMessage)) {
        return toWifiProvisioningStatus(fallbackMessage);
      }

      return immediateStatus;
    },
    [readCachedProtocolMessage, waitForWifiStatus],
  );

  const sendProtocolRequest = useCallback(
    async (request: BleProtocolMessage) => {
      try {
        await ensureConnected();
        dispatch(setError(null));
        logHook('发送协议请求', {
          request: summarizeProtocolMessage(request),
        });

        const rawResponse = await bluetoothService.sendRequest(
          PROTOCOL_NOTIFICATION_OPTIONS,
          encodeBleProtocolMessage(request),
        );
        logHook('收到协议响应原文', {
          requestType: request.type,
          rawResponse,
        });
        const parsedResponse = parseBleProtocolMessage(rawResponse);

        dispatchProtocolMessage(parsedResponse);
        logHook('协议响应解析成功', {
          requestType: request.type,
          response: summarizeProtocolMessage(parsedResponse),
        });

        if (isNackMessage(parsedResponse)) {
          warnHook('收到协议 NACK', {
            requestType: request.type,
            response: summarizeProtocolMessage(parsedResponse),
          });
          throw new BleProtocolNackError(parsedResponse);
        }

        return parsedResponse;
      } catch (err: any) {
        dispatch(
          setError({
            message:
              err instanceof Error ? err.message : 'Failed to send BLE request',
          }),
        );
        throw err;
      }
    },
    [dispatch, dispatchProtocolMessage, ensureConnected],
  );

  const connectToConfiguredDevice = useCallback(
    async (options?: {
      deviceName?: string;
      scanTimeout?: number;
      connectTimeout?: number;
      autoConnect?: boolean;
      enableAutoRescan?: boolean;
      maxRescanAttempts?: number;
      rescanDelayMs?: number;
    }) => {
      const adapterState = await bluetoothService.getAdapterState();

      if (Platform.OS === 'ios') {
        if (adapterState !== 'PoweredOn') {
          await new Promise<void>((resolve, reject) => {
            const subscription = (bluetoothService as any).manager.onStateChange(
              (state: string) => {
                if (state === 'PoweredOn') {
                  subscription.remove();
                  resolve();
                } else if (state === 'PoweredOff' || state === 'Unauthorized') {
                  subscription.remove();
                  reject(new Error('Bluetooth is unavailable on this iPhone.'));
                }
              },
              true,
            );
          });
        }
      } else if (adapterState !== 'PoweredOn') {
        throw new Error('Bluetooth is turned off.');
      }

      const {
        deviceName = bleConfig.ble_device_name,
        scanTimeout = BLUETOOTH_DEFAULT_CONFIG.SCAN_TIMEOUT,
        connectTimeout = BLUETOOTH_DEFAULT_CONFIG.CONNECT_TIMEOUT,
        autoConnect = true,
        enableAutoRescan = false,
        maxRescanAttempts = BLUETOOTH_DEFAULT_CONFIG.MAX_RESCAN_ATTEMPTS,
        rescanDelayMs = BLUETOOTH_DEFAULT_CONFIG.RESCAN_DELAY,
      } = options || {};

      autoRescanConfigRef.current = {
        scanTimeout,
        connectTimeout,
        autoConnect,
        enableAutoRescan,
        maxRescanAttempts,
        rescanDelayMs,
        currentAttempts: 0,
      };

      const performScanAndConnect = async () => {
        dispatch(setError(null));
        dispatch(setStatus(BluetoothStatus.Scanning));
        let matchedDeviceId: string | null = null;

        await bluetoothService.startScan(
          async device => {
            const localName = (device as any).localName;
            if (device.name === deviceName || localName === deviceName) {
              logHook('扫描命中默认目标设备', {
                expectedDeviceName: deviceName,
                matchedDevice: {
                  id: device.id,
                  name: device.name,
                  localName,
                  rssi: device.rssi,
                },
              });
              matchedDeviceId = device.id;
              await stopScan();
            }
          },
          {timeout: scanTimeout},
        );

        if (!matchedDeviceId) {
          dispatch(setStatus(BluetoothStatus.Error));
          dispatch(
            setError({
              message: `Unable to find ${deviceName}. Make sure the device is powered on and advertising BLE.`,
            }),
          );
          return;
        }

        logHook('扫描结束，准备连接命中的默认设备', {
          matchedDeviceId,
          deviceName,
        });
        await connectToDevice(matchedDeviceId, {
          timeout: connectTimeout,
          autoConnect,
        });
      };

      const setupAutoRescan = () => {
        bluetoothService.setOnDisconnectedListener(() => {
          dispatch(setStatus(BluetoothStatus.Disconnected));
          dispatch(setDeviceInfo(null));
          dispatch(setReceivedData(null));

          if (
            autoRescanConfigRef.current &&
            autoRescanConfigRef.current.enableAutoRescan &&
            autoRescanConfigRef.current.currentAttempts <
              autoRescanConfigRef.current.maxRescanAttempts
          ) {
            autoRescanConfigRef.current.currentAttempts += 1;
            setTimeout(() => {
              performScanAndConnect().catch(() => {
                dispatch(
                  setError({
                    message: 'Auto reconnect failed. Please reconnect manually.',
                  }),
                );
              });
            }, autoRescanConfigRef.current.rescanDelayMs);
          }
        });
      };

      try {
        const lastId = await AsyncStorage.getItem(STORAGE_KEYS.lastConnectedDeviceId);

        if (lastId) {
          try {
            await connectToDevice(lastId, {
              timeout: connectTimeout,
              autoConnect,
            });

            if (enableAutoRescan) {
              setupAutoRescan();
            }
            return;
          } catch {
            await AsyncStorage.removeItem(STORAGE_KEYS.lastConnectedDeviceId);
          }
        }

        await performScanAndConnect();

        if (enableAutoRescan) {
          setupAutoRescan();
        }
      } catch (err: any) {
        dispatch(
          setError({
            message: err.message || 'Connection failed',
          }),
        );
        dispatch(setStatus(BluetoothStatus.Error));
        throw err;
      } finally {
        await stopScan().catch(() => undefined);
      }
    },
    [connectToDevice, dispatch, stopScan],
  );

  const sendServoAngle = useCallback<
    UseBluetoothReturn['sendServoAngle']
  >(
    async ({xDeg, yDeg, durationMs, commandId}) => {
      logHook('准备发送舵机角度命令', {
        xDeg,
        yDeg,
        durationMs,
        commandId,
      });
      const response = await sendProtocolRequest(
        buildServoAngleCommand({
          ...(typeof xDeg === 'number' ? {x_deg: clampAngle(xDeg)} : {}),
          ...(typeof yDeg === 'number' ? {y_deg: clampAngle(yDeg)} : {}),
          ...(typeof durationMs === 'number' ? {duration_ms: durationMs} : {}),
          ...(commandId ? {command_id: commandId} : {}),
        }),
      );

      return assertAckForCommand(response, BLE_PROTOCOL_TYPES.servoAngle);
    },
    [sendProtocolRequest],
  );

  const sendAiStatus = useCallback<
    UseBluetoothReturn['sendAiStatus']
  >(
    async ({status: nextStatus, message, imageName, actionFile, soundFile, commandId}) => {
      logHook('准备发送 AI 状态命令', {
        status: nextStatus,
        message,
        imageName,
        actionFile,
        soundFile,
        commandId,
      });
      const response = await sendProtocolRequest(
        buildAiStatusCommand({
          ...(nextStatus ? {status: nextStatus} : {}),
          ...(message ? {message} : {}),
          ...(imageName ? {image_name: imageName} : {}),
          ...(actionFile ? {action_file: actionFile} : {}),
          ...(soundFile ? {sound_file: soundFile} : {}),
          ...(commandId ? {command_id: commandId} : {}),
        }),
      );

      return assertAckForCommand(response, BLE_PROTOCOL_TYPES.aiStatus);
    },
    [sendProtocolRequest],
  );

  const setRobotState = useCallback<
    UseBluetoothReturn['setRobotState']
  >(
    async ({stateId, commandId}) => {
      logHook('准备设置机器人状态', {stateId, commandId});
      const response = await sendProtocolRequest(
        buildRobotStateSetCommand({
          state_id: stateId,
          ...(commandId ? {command_id: commandId} : {}),
        }),
      );

      return assertAckForCommand(response, BLE_PROTOCOL_TYPES.robotStateSet);
    },
    [sendProtocolRequest],
  );

  const setWifiConfig = useCallback<
    UseBluetoothReturn['setWifiConfig']
  >(
    async ({ssid, password, commandId}) => {
      logHook('准备下发 Wi-Fi 配置', {
        ssid,
        hasPassword: Boolean(password),
        commandId,
      });
      const response = await sendProtocolRequest(
        buildWifiSetCommand({
          ssid,
          password,
          ...(commandId ? {command_id: commandId} : {}),
        }),
      );

      if (response.type === BLE_PROTOCOL_TYPES.wifiSet) {
        logHook('Wi-Fi 配置写入收到请求回显，接受并继续等待异步状态', {
          response: summarizeProtocolMessage(response),
        });
        return {
          type: BLE_PROTOCOL_TYPES.ack,
          code: 0,
          data: {
            type: BLE_PROTOCOL_TYPES.wifiSet,
            ...(response.data.command_id
              ? {command_id: response.data.command_id}
              : {}),
          },
        };
      }

      return assertAckForCommand(response, BLE_PROTOCOL_TYPES.wifiSet);
    },
    [sendProtocolRequest],
  );

  const getWifiStatus = useCallback<
    UseBluetoothReturn['getWifiStatus']
  >(
    async commandId => {
      logHook('主动请求 Wi-Fi 状态', {commandId});
      const baselineSequence = protocolSequenceRef.current + 1;
      const response = await sendProtocolRequest(buildWifiGetCommand(commandId));
      return await resolveWifiOperationStatus(
        response,
        BLE_PROTOCOL_TYPES.wifiGet,
        undefined,
        baselineSequence,
      );
    },
    [resolveWifiOperationStatus, sendProtocolRequest],
  );

  const clearWifiConfig = useCallback<
    UseBluetoothReturn['clearWifiConfig']
  >(
    async commandId => {
      logHook('准备清除 Wi-Fi 配置', {commandId});
      const baselineSequence = protocolSequenceRef.current + 1;
      const response = await sendProtocolRequest(
        buildWifiClearCommand(commandId),
      );
      return await resolveWifiOperationStatus(
        response,
        BLE_PROTOCOL_TYPES.wifiClear,
        ['unconfigured'],
        baselineSequence,
      );
    },
    [resolveWifiOperationStatus, sendProtocolRequest],
  );

  const pingDevice = useCallback(async () => {
    logHook('准备发送 Ping');
    const response = await sendProtocolRequest(buildPingCommand());
    return assertPongMessage(response);
  }, [sendProtocolRequest]);

  const clearError = useCallback(() => {
    dispatch(setError(null));
    if (status === BluetoothStatus.Error) {
      dispatch(setStatus(BluetoothStatus.Idle));
    }
  }, [dispatch, status]);

  const clearAll = useCallback(() => {
    dispatch(setStatus(BluetoothStatus.Idle));
    dispatch(setDeviceInfo(null));
    dispatch(setReceivedData(null));
    dispatch(setError(null));
  }, [dispatch]);

  return {
    status,
    deviceInfo,
    receivedData,
    error,
    initialize,
    startScan,
    stopScan,
    connectToDevice,
    connectToConfiguredDevice,
    disconnect,
    writeData,
    readData,
    subscribeToNotifications,
    subscribeToProtocolMessages,
    sendServoAngle,
    sendAiStatus,
    setRobotState,
    setWifiConfig,
    getWifiStatus,
    clearWifiConfig,
    pingDevice,
    clearError,
    clearAll,
  };
};
