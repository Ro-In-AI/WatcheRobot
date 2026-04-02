import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Alert,
    SafeAreaView,
    StatusBar,
} from 'react-native';
import { AppText } from '../../app-text';
import { useBluetooth } from '../hooks/useBluetooth';
import { BluetoothStatus } from '../types';

/**
 * Bluetooth 模块测试页面
 *
 * 提供完整的蓝牙功能测试界面，采用 iOS 风格设计。
 *
 * @category Screens
 */
export const BluetoothScreen: React.FC = () => {
    const {
        status,
        deviceInfo,
        receivedData,
        error,
        initialize,
        startScan,
        stopScan,
        connectToDevice,
        disconnect,
        writeData,
        readData,
        subscribeToNotifications,
        clearError,
    } = useBluetooth();

    // UI State
    const [logs, setLogs] = useState<string[]>([]);
    const [targetServiceUUID, setTargetServiceUUID] = useState<string>('');
    const [targetCharUUID, setTargetCharUUID] = useState<string>('');
    const [writeContent, setWriteContent] = useState<string>('');
    const [isSubscribing, setIsSubscribing] = useState<boolean>(false);
    const [unsubscribeFunc, setUnsubscribeFunc] = useState<(() => void) | null>(null);

    // 扫描到的设备列表
    const [scannedDevices, setScannedDevices] = useState<any[]>([]);
    const [isDevicesExpanded, setIsDevicesExpanded] = useState<boolean>(true);
    const [searchText, setSearchText] = useState<string>('');

    // 过滤设备列表
    const filteredDevices = scannedDevices.filter(device => {
        if (!searchText) return true;
        const searchLower = searchText.toLowerCase();
        return (
            (device.name && device.name.toLowerCase().includes(searchLower)) ||
            (device.id && device.id.toLowerCase().includes(searchLower))
        );
    });

    // 添加日志
    const addLog = useCallback((message: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs((prev) => [`[${time}] ${message}`, ...prev].slice(0, 50));
    }, []);

    // 监听状态变化
    useEffect(() => {
        // addLog(`状态更新: ${status}`);
    }, [status, addLog]);

    // 监听错误
    useEffect(() => {
        if (error) {
            addLog(`错误: ${error.message}`);
            Alert.alert('蓝牙错误', error.message, [
                { text: '确定', onPress: clearError }
            ]);
        }
    }, [error, addLog, clearError]);

    // 监听接收数据
    useEffect(() => {
        if (receivedData) {
            if (typeof receivedData === 'string') {
                addLog(`收到数据: ${receivedData}`);
            } else {
                addLog(`收到数据 (${receivedData.characteristicUUID}): ${JSON.stringify(receivedData.data)}`);
            }
        }
    }, [receivedData, addLog]);

    // 初始化
    const handleInitialize = async () => {
        addLog('正在初始化蓝牙...');
        await initialize();
    };

    // 扫描
    const handleStartScan = async () => {
        setScannedDevices([]);
        addLog('开始扫描...');
        await startScan((device) => {
            setScannedDevices((prev) => {
                if (prev.find((d) => d.id === device.id)) return prev;
                return [...prev, device];
            });
        });
    };

    // 连接
    const handleConnect = async (device: any) => {
        addLog(`正在连接 ${device.name || device.id}...`);
        await connectToDevice(device.id);
    };

    // 写入数据
    const handleWrite = async (withResponse: boolean) => {
        if (!targetServiceUUID || !targetCharUUID || !writeContent) {
            Alert.alert('提示', '请填写 UUID 和数据');
            return;
        }
        try {
            addLog(`正在写入 ${targetCharUUID}...`);
            await writeData(targetServiceUUID, targetCharUUID, writeContent, withResponse);
            addLog('写入成功');
        } catch (e: any) {
            addLog(`写入失败: ${e.message}`);
        }
    };

    // 读取数据
    const handleRead = async () => {
        if (!targetServiceUUID || !targetCharUUID) {
            Alert.alert('提示', '请填写 UUID');
            return;
        }
        try {
            addLog(`正在读取 ${targetCharUUID}...`);
            const data = await readData(targetServiceUUID, targetCharUUID);
            addLog(`读取结果: ${data}`);
        } catch (e: any) {
            addLog(`读取失败: ${e.message}`);
        }
    };

    // 订阅通知
    const handleSubscribe = () => {
        if (isSubscribing) {
            if (unsubscribeFunc) {
                unsubscribeFunc();
                setUnsubscribeFunc(null);
            }
            setIsSubscribing(false);
            addLog('已取消订阅');
        } else {
            if (!targetServiceUUID || !targetCharUUID) {
                Alert.alert('提示', '请填写 UUID');
                return;
            }
            try {
                addLog(`正在订阅 ${targetCharUUID}...`);
                const unsub = subscribeToNotifications(
                    { serviceUUID: targetServiceUUID, characteristicUUID: targetCharUUID },
                    () => {
                        // 数据处理已在 useEffect 中统一处理
                    }
                );
                setUnsubscribeFunc(() => unsub);
                setIsSubscribing(true);
                addLog('订阅成功');
            } catch (e: any) {
                addLog(`订阅失败: ${e.message}`);
            }
        }
    };

    const renderDeviceItem = (item: any) => (
        <TouchableOpacity
            key={item.id}
            style={styles.deviceItem}
            onPress={() => handleConnect(item)}
            disabled={status === BluetoothStatus.Connecting || status === BluetoothStatus.Connected}
        >
            <View style={styles.deviceInfo}>
                <AppText style={styles.deviceName}>{item.name || '未知设备'}</AppText>
                <AppText style={styles.deviceId}>{item.id}</AppText>
            </View>
            <View style={styles.deviceMeta}>
                <AppText style={styles.deviceRssi}>{item.rssi} dBm</AppText>
                {status === BluetoothStatus.Connected && deviceInfo?.id === item.id && (
                    <AppText style={styles.connectedLabel}>已连接</AppText>
                )}
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F2F2F7" />

            <View style={styles.header}>
                <AppText style={styles.headerTitle}>蓝牙调试</AppText>
                <View style={[styles.statusBadge, getStatusColor(status)]}>
                    <AppText style={styles.statusText}>{getStatusText(status)}</AppText>
                </View>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

                {/* 控制面板 */}
                <View style={styles.section}>
                    <AppText style={styles.sectionHeader}>操作</AppText>
                    <View style={styles.card}>
                        <View style={styles.buttonGrid}>
                            <Button
                                title="初始化"
                                onPress={handleInitialize}
                                icon="🔄"
                            />
                            <Button
                                title="扫描"
                                onPress={handleStartScan}
                                disabled={status === BluetoothStatus.Scanning}
                                icon="🔍"
                            />
                            <Button
                                title="停止"
                                onPress={stopScan}
                                disabled={status !== BluetoothStatus.Scanning}
                                icon="⏹️"
                            />
                            <Button
                                title="断开"
                                onPress={disconnect}
                                disabled={status !== BluetoothStatus.Connected}
                                danger
                                icon="🔌"
                            />
                        </View>
                    </View>
                </View>

                {/* 设备信息 */}
                {status === BluetoothStatus.Connected && deviceInfo && (
                    <View style={styles.section}>
                        <AppText style={styles.sectionHeader}>已连接设备</AppText>
                        <View style={styles.card}>
                            <InfoRow label="名称" value={deviceInfo.name || '未知'} />
                            <Divider />
                            <InfoRow label="ID" value={deviceInfo.id} />
                            <Divider />
                            <InfoRow label="MTU" value={deviceInfo.mtu?.toString() || '-'} />
                        </View>
                    </View>
                )}

                {/* 数据交互 */}
                {status === BluetoothStatus.Connected && (
                    <View style={styles.section}>
                        <AppText style={styles.sectionHeader}>数据交互</AppText>
                        <View style={styles.card}>
                            <View style={styles.inputGroup}>
                                <AppText style={styles.inputLabel}>Service UUID</AppText>
                                <TextInput
                                    style={styles.input}
                                    placeholder="输入 Service UUID"
                                    value={targetServiceUUID}
                                    onChangeText={setTargetServiceUUID}
                                    autoCapitalize="none"
                                />
                            </View>
                            <Divider />
                            <View style={styles.inputGroup}>
                                <AppText style={styles.inputLabel}>Char UUID</AppText>
                                <TextInput
                                    style={styles.input}
                                    placeholder="输入 Characteristic UUID"
                                    value={targetCharUUID}
                                    onChangeText={setTargetCharUUID}
                                    autoCapitalize="none"
                                />
                            </View>
                            <Divider />
                            <View style={styles.inputGroup}>
                                <AppText style={styles.inputLabel}>数据</AppText>
                                <TextInput
                                    style={styles.input}
                                    placeholder="输入要发送的数据"
                                    value={writeContent}
                                    onChangeText={setWriteContent}
                                />
                            </View>

                            <View style={styles.actionButtons}>
                                <ActionButton title="写入" onPress={() => handleWrite(true)} />
                                <ActionButton title="写入(无响应)" onPress={() => handleWrite(false)} />
                                <ActionButton title="读取" onPress={handleRead} />
                                <ActionButton
                                    title={isSubscribing ? "取消订阅" : "订阅通知"}
                                    onPress={handleSubscribe}
                                    active={isSubscribing}
                                />
                            </View>
                        </View>
                    </View>
                )}

                {/* 设备列表 */}
                {status !== BluetoothStatus.Connected && (
                    <View style={styles.section}>
                        <TouchableOpacity
                            style={styles.sectionHeaderRow}
                            onPress={() => setIsDevicesExpanded(!isDevicesExpanded)}
                        >
                            <AppText style={styles.sectionHeader}>发现设备 ({scannedDevices.length})</AppText>
                            <AppText style={styles.sectionHeaderIcon}>{isDevicesExpanded ? '▼' : '▶'}</AppText>
                        </TouchableOpacity>

                        {isDevicesExpanded && (
                            <View style={styles.card}>
                                <View style={styles.searchContainer}>
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="搜索设备名称或ID"
                                        value={searchText}
                                        onChangeText={setSearchText}
                                        clearButtonMode="while-editing"
                                    />
                                </View>
                                <Divider />
                                {filteredDevices.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <AppText style={styles.emptyStateText}>
                                            {scannedDevices.length === 0 ? '暂无设备，请点击扫描' : '未找到匹配设备'}
                                        </AppText>
                                    </View>
                                ) : (
                                    filteredDevices.map((item, index) => (
                                        <React.Fragment key={item.id}>
                                            {index > 0 && <Divider />}
                                            {renderDeviceItem(item)}
                                        </React.Fragment>
                                    ))
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* 日志 */}
                <View style={styles.section}>
                    <AppText style={styles.sectionHeader}>日志</AppText>
                    <View style={[styles.card, styles.logCard]}>
                        <ScrollView nestedScrollEnabled style={styles.logScroll}>
                            {logs.map((log, index) => (
                                <AppText key={index} style={styles.logText}>{log}</AppText>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

// --- 组件 ---

const Button = ({ title, onPress, disabled, danger, icon }: any) => (
    <TouchableOpacity
        style={[
            styles.gridButton,
            disabled && styles.buttonDisabled,
            danger && styles.buttonDanger
        ]}
        onPress={onPress}
        disabled={disabled}
    >
        <AppText style={styles.buttonIcon}>{icon}</AppText>
        <AppText style={[
            styles.gridButtonText,
            danger && styles.buttonDangerText,
            disabled && styles.buttonDisabledText
        ]}>{title}</AppText>
    </TouchableOpacity>
);

const ActionButton = ({ title, onPress, active }: any) => (
    <TouchableOpacity
        style={[styles.actionButton, active && styles.actionButtonActive]}
        onPress={onPress}
    >
        <AppText style={[styles.actionButtonText, active && styles.actionButtonActiveText]}>{title}</AppText>
    </TouchableOpacity>
);

const InfoRow = ({ label, value }: any) => (
    <View style={styles.infoRow}>
        <AppText style={styles.infoLabel}>{label}</AppText>
        <AppText style={styles.infoValue}>{value}</AppText>
    </View>
);

const Divider = () => <View style={styles.divider} />;

const getStatusColor = (status: BluetoothStatus) => {
    switch (status) {
        case BluetoothStatus.Connected: return { backgroundColor: '#34C759' }; // iOS Green
        case BluetoothStatus.Scanning: return { backgroundColor: '#007AFF' }; // iOS Blue
        case BluetoothStatus.Error: return { backgroundColor: '#FF3B30' }; // iOS Red
        default: return { backgroundColor: '#8E8E93' }; // iOS Gray
    }
};

const getStatusText = (status: BluetoothStatus) => {
    switch (status) {
        case BluetoothStatus.Idle: return '空闲';
        case BluetoothStatus.Scanning: return '扫描中';
        case BluetoothStatus.Connecting: return '连接中';
        case BluetoothStatus.Connected: return '已连接';
        case BluetoothStatus.Disconnected: return '已断开';
        case BluetoothStatus.Error: return '错误';
        default: return status;
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F7', // iOS Grouped Background Color
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#F2F2F7',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 28,
        color: '#000',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: '#FFF',
        fontSize: 13,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingRight: 4,
    },
    sectionHeader: {
        fontSize: 13,
        color: '#6E6E73',
        marginLeft: 4,
        textTransform: 'uppercase',
    },
    sectionHeaderIcon: {
        fontSize: 12,
        color: '#6E6E73',
    },
    searchContainer: {
        padding: 8,
        backgroundColor: '#FFF',
    },
    searchInput: {
        backgroundColor: '#F2F2F7',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: '#000',
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 10,
        overflow: 'hidden',
    },
    buttonGrid: {
        flexDirection: 'row',
        padding: 8,
    },
    gridButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#F2F2F7',
        marginHorizontal: 4,
    },
    buttonDanger: {
        backgroundColor: '#FF3B3015',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    gridButtonText: {
        fontSize: 12,
        color: '#007AFF',
    },
    buttonDangerText: {
        color: '#FF3B30',
    },
    buttonDisabledText: {
        color: '#8E8E93',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
    },
    infoLabel: {
        fontSize: 16,
        color: '#000',
    },
    infoValue: {
        fontSize: 16,
        color: '#8E8E93',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#C6C6C8',
        marginLeft: 16,
    },
    inputGroup: {
        padding: 12,
    },
    inputLabel: {
        fontSize: 12,
        color: '#8E8E93',
        marginBottom: 4,
    },
    input: {
        fontSize: 16,
        color: '#000',
        paddingVertical: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 8,
        gap: 8,
        backgroundColor: '#F9F9F9',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#C6C6C8',
    },
    actionButton: {
        backgroundColor: '#FFF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    actionButtonActive: {
        backgroundColor: '#007AFF',
    },
    actionButtonText: {
        color: '#007AFF',
        fontSize: 13,
    },
    actionButtonActiveText: {
        color: '#FFF',
    },
    deviceItem: {
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        fontSize: 16,
        color: '#000',
        marginBottom: 2,
    },
    deviceId: {
        fontSize: 12,
        color: '#8E8E93',
    },
    deviceMeta: {
        alignItems: 'flex-end',
    },
    deviceRssi: {
        fontSize: 12,
        color: '#8E8E93',
    },
    connectedLabel: {
        fontSize: 12,
        color: '#34C759',
        marginTop: 2,
    },
    emptyState: {
        padding: 24,
        alignItems: 'center',
    },
    emptyStateText: {
        color: '#8E8E93',
        fontSize: 14,
    },
    logCard: {
        backgroundColor: '#1C1C1E', // Dark mode for logs
    },
    logScroll: {
        height: 200,
        padding: 12,
    },
    logText: {
        color: '#34C759',
        fontSize: 11,
        marginBottom: 2,
    },
});
