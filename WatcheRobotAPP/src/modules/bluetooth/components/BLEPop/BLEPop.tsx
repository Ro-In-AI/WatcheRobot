import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Animated,
    ImageStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import bleConfig from '../../config/ble_config.json';
import { BluetoothStatus } from '../../types';

// 使用统一的蓝牙状态类型
export type BLEPopStatus = BluetoothStatus;

interface BLEPopProps {
    /** 是否显示弹窗 */
    isVisible?: boolean;

    /** 当前蓝牙状态，用于控制弹窗显示内容 */
    status: BLEPopStatus;

    /** 目标设备名称，用于显示在提示信息中 */
    deviceName?: string;

    /** 取消操作的回调函数 */
    onCancel?: () => void;

    /** 重试操作的回调函数 */
    onRetry?: () => void;

    /** 重新连接的回调函数 */
    onReconnect?: () => void;

    /** 关闭弹窗的回调函数 */
    onClose?: () => void;
}

/**
 * 蓝牙弹窗组件
 *
 * 用于显示蓝牙连接状态、扫描进度和错误信息。
 *
 * @category Components
 */
export const BLEPop: React.FC<BLEPopProps> = ({
    isVisible = true,
    status,
    deviceName = bleConfig.ble_device_name,
    onCancel,
    onRetry,
    onReconnect,
    onClose,
}) => {
    const [progress] = useState(new Animated.Value(0));
    const [dots, setDots] = useState('');

    const slideAnim = useState(new Animated.Value(300))[0]; // 从底部开始(300px)
    const fadeAnim = useState(new Animated.Value(0))[0]; // 初始透明度为0

    useEffect(() => {
        if (isVisible) {
            // 弹窗出现时，从底部滑入+淡入
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // 弹窗消失时，向下滑出+淡出
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 300,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [fadeAnim, isVisible, slideAnim]);

    // 连接动画效果
    useEffect(() => {
        if (status === BluetoothStatus.Connecting) {
            const animation = Animated.loop(
                Animated.timing(progress, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: false,
                }),
            );
            animation.start();
            return () => animation.stop();
        }
    }, [status, progress]);

    // 连接中和搜索中的点点点动画
    useEffect(() => {
        if (status === BluetoothStatus.Connecting || status === BluetoothStatus.Scanning) {
            const interval = setInterval(() => {
                setDots((prev) => {
                    if (prev === '...') return '';
                    return prev + '.';
                });
            }, 500);
            return () => clearInterval(interval);
        }
    }, [status]);

    // 根据状态获取标题文字
    const getTitleText = () => {
        switch (status) {
            case BluetoothStatus.Idle:
                return '蓝牙设备';
            case BluetoothStatus.Scanning:
                return '搜索设备';
            case BluetoothStatus.Connecting:
                return '蓝牙连接';
            case BluetoothStatus.Connected:
                return '连接成功';
            case BluetoothStatus.Error:
                return '连接失败';
            case BluetoothStatus.Disconnected:
                return '没有发现设备';
            default:
                return '蓝牙连接';
        }
    };

    // 根据状态获取状态文字
    const getStatusText = () => {
        switch (status) {
            case BluetoothStatus.Idle:
                return '准备连接蓝牙设备';
            case BluetoothStatus.Scanning:
                return `正在搜索${deviceName}${dots}`;
            case BluetoothStatus.Connecting:
                return `正在连接${deviceName}${dots}`;
            case BluetoothStatus.Connected:
                return `已成功连接到${deviceName}`;
            case BluetoothStatus.Error:
                return `连接${deviceName}失败`;
            case BluetoothStatus.Disconnected:
                return '请检查CLO是否处于可发现状态：';
            default:
                return '';
        }
    };

    // 根据状态获取颜色
    const getStatusColor = () => {
        switch (status) {
            case BluetoothStatus.Idle:
                return '#666666';
            case BluetoothStatus.Scanning:
                return '#2196F3';
            case BluetoothStatus.Connecting:
                return '#F5B43A';
            case BluetoothStatus.Connected:
                return '#4CAF50';
            case BluetoothStatus.Error:
                return '#FF5252';
            case BluetoothStatus.Disconnected:
                return '#000000';
            default:
                return '#F5B43A';
        }
    };

    // 渲染连接步骤（仅在连接中和连接成功时显示）
    const renderConnectionSteps = () => {
        if (status !== BluetoothStatus.Connecting && status !== BluetoothStatus.Connected) return null;

        const steps = [
            { id: 1, text: '搜索附近的CLO设备', completed: true },
            { id: 2, text: '建立蓝牙连接', completed: status === BluetoothStatus.Connected },
            { id: 3, text: '验证设备信息', completed: status === BluetoothStatus.Connected },
        ];

        return (
            <View style={styles.stepsContainer}>
                {steps.map((step) => (
                    <View key={step.id} style={styles.stepItem}>
                        <View
                            style={[
                                styles.stepCircle,
                                { backgroundColor: step.completed ? '#4CAF50' : '#e0e0e0' },
                            ]}
                        >
                            {step.completed ? (
                                <Text style={styles.checkMark}>✓</Text>
                            ) : status === BluetoothStatus.Connecting && step.id === 2 ? (
                                <ActivityIndicator size="small" color="#F5B43A" />
                            ) : (
                                <Text style={styles.stepNumber}>{step.id}</Text>
                            )}
                        </View>
                        <Text style={[styles.stepText, { color: step.completed ? '#4CAF50' : '#666' }]}>
                            {step.text}
                        </Text>
                    </View>
                ))}
            </View>
        );
    };

    // 渲染设备未发现时的说明
    const renderNotFoundInstructions = () => {
        if (status !== BluetoothStatus.Disconnected) return null;

        const instructions = [
            {
                id: 1,
                text: '请确认您的 CLO 设备已正确连接电源线，由于设备未内置电池，必须接通外部电源才能开机和唤醒。',
            },
            {
                id: 2,
                text: '请观察设备的指示灯状态来判断问题：红灯表示设备正在开机自检，蓝色呼吸灯表示已准备好等待蓝牙配对，蓝色常亮则表示蓝牙已成功连接。',
            },
            {
                id: 3,
                text: '完成以上检查后问题依旧存在，请将您遇到的具体情况通过邮件发送至 clo@erroright.ai，我们的技术团队将为您提供支持。',
            },
        ];

        return (
            <View style={styles.instructionContainer}>
                {instructions.map((instruction) => (
                    <View key={instruction.id} style={styles.instructionItem}>
                        <View style={styles.numberCircle}>
                            <Text style={styles.numberText}>{instruction.id}</Text>
                        </View>
                        <Text style={styles.instructionText}>{instruction.text}</Text>
                    </View>
                ))}
            </View>
        );
    };

    // 渲染提示信息
    const renderHintText = () => {
        switch (status) {
            case BluetoothStatus.Connecting:
                return <Text style={styles.hintText}>请确保CLO设备已开机并处于可发现状态</Text>;
            case BluetoothStatus.Connected:
                return <Text style={styles.successText}>🎉 连接成功！现在可以开始使用您的CLO设备了</Text>;
            case BluetoothStatus.Error:
                return <Text style={styles.errorText}>连接失败，请检查设备状态后重试</Text>;
            default:
                return null;
        }
    };

    // 渲染按钮
    const renderButtons = () => {
        switch (status) {
            case BluetoothStatus.Idle:
                return (
                    <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onRetry}>
                        <Text style={styles.retryButtonText}>开始连接</Text>
                    </TouchableOpacity>
                );
            case BluetoothStatus.Scanning:
                return (
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                        <Text style={styles.cancelButtonText}>取消搜索</Text>
                    </TouchableOpacity>
                );
            case BluetoothStatus.Connecting:
                return (
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                        <Text style={styles.cancelButtonText}>取消连接</Text>
                    </TouchableOpacity>
                );
            case BluetoothStatus.Connected:
                return (
                    <TouchableOpacity style={[styles.button, styles.successButton]} onPress={onClose}>
                        <Text style={styles.successButtonText}>完成</Text>
                    </TouchableOpacity>
                );
            case BluetoothStatus.Error:
                return (
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                            <Text style={styles.cancelButtonText}>取消</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onRetry}>
                            <Text style={styles.retryButtonText}>重试</Text>
                        </TouchableOpacity>
                    </View>
                );
            case BluetoothStatus.Disconnected:
                return (
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                            <Text style={styles.cancelButtonText}>取消</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, styles.reconnectButton]} onPress={onReconnect}>
                            <Text style={styles.reconnectButtonText}>重新连接</Text>
                        </TouchableOpacity>
                    </View>
                );
            default:
                return null;
        }
    };

    // 只有在完全隐藏且动画结束时才返回null
    const [isFullyHidden, setIsFullyHidden] = useState(!isVisible);

    useEffect(() => {
        if (!isVisible) {
            const id = fadeAnim.addListener(({ value }) => {
                if (value === 0) setIsFullyHidden(true);
                else setIsFullyHidden(false);
            });
            return () => fadeAnim.removeListener(id);
        } else {
            setIsFullyHidden(false);
        }
    }, [isVisible, fadeAnim]);

    if (isFullyHidden) return null;

    return (
        <>
            {/* 背景遮罩 */}
            <Animated.View
                style={[styles.backdrop, { opacity: fadeAnim }]}
                pointerEvents={isVisible ? 'auto' : 'none'}
            />
            <Animated.View
                style={[
                    styles.container,
                    {
                        transform: [{ translateY: slideAnim }],
                        opacity: fadeAnim,
                    },
                ]}
            >
                <View style={styles.content}>
                    {/* 顶部封面 */}
                    <View style={styles.coverContainer}>
                        <Image
                            // source={require('@/assets/scene1.jpg')}
                            style={styles.deviceImage as ImageStyle}
                        />
                        {/* 黑色遮罩 */}
                        <LinearGradient
                            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                            style={styles.overlay}
                        />
                        {/* 文字内容 */}
                        <View style={styles.textOverlay}>
                            <Text style={styles.titleText}>{getTitleText()}</Text>
                            {(status === BluetoothStatus.Connecting || status === BluetoothStatus.Scanning) && (
                                <ActivityIndicator size="large" color="#ffffff" style={styles.loadingIndicator} />
                            )}
                        </View>
                        {/* 顶部装饰线 */}
                        <View style={styles.decorativeLine} />
                    </View>

                    {/* 状态文字 */}
                    <Text
                        style={[
                            status === BluetoothStatus.Disconnected ? styles.checkStatusText : styles.statusText,
                            { color: getStatusColor() },
                        ]}
                    >
                        {getStatusText()}
                    </Text>

                    {/* 连接进度条（仅在连接中显示） */}
                    {status === BluetoothStatus.Connecting && (
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                                <Animated.View
                                    style={[
                                        styles.progressBarFill,
                                        {
                                            width: progress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0%', '100%'],
                                            }),
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    )}

                    {/* 连接步骤 */}
                    {renderConnectionSteps()}

                    {/* 设备未发现说明 */}
                    {renderNotFoundInstructions()}

                    {/* 提示信息 */}
                    {renderHintText()}

                    {/* 按钮区域 */}
                    <View style={styles.buttonArea}>{renderButtons()}</View>
                </View>
            </Animated.View>
        </>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        paddingTop: 20,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: -2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        zIndex: 1000,
    },
    content: {
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 16,
    },
    coverContainer: {
        width: '100%',
        height: 160,
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#f0f0f0',
    },
    deviceImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    } as ImageStyle,
    overlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    textOverlay: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: [{ translateX: -50 }, { translateY: -25 }],
        alignItems: 'center',
    },
    titleText: {
        fontSize: 24,
        fontWeight: 'normal',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 8,
    },
    loadingIndicator: {
        marginTop: 8,
    },
    decorativeLine: {
        position: 'absolute',
        top: 12.5,
        left: '50%',
        transform: [{ translateX: -38.75 }],
        width: 77.5,
        height: 2,
        backgroundColor: '#ffffff',
        borderRadius: 1,
    },
    statusText: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 4,
        width: '100%',
    },
    checkStatusText: {
        fontSize: 18,
        fontWeight: '900',
        width: '100%',
        marginTop: 4,
        marginBottom: 8,
        textAlign: 'left',
    },
    progressContainer: {
        width: '100%',
        marginVertical: 8,
    },
    progressBarBg: {
        height: 8,
        backgroundColor: '#e4e4e4',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#F5B43A',
        borderRadius: 4,
    },
    stepsContainer: {
        width: '100%',
        gap: 12,
        marginVertical: 8,
    },
    stepItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    stepCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumber: {
        color: '#666',
        fontSize: 14,
        fontWeight: 'bold',
    },
    checkMark: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    stepText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    instructionContainer: {
        width: '100%',
        gap: 16,
    },
    instructionItem: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
    },
    numberCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F5B43A',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 2,
    },
    numberText: {
        color: '#000000',
        fontSize: 14,
        fontWeight: 'bold',
    },
    instructionText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
        color: '#000000',
    },
    hintText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
    },
    successText: {
        fontSize: 14,
        color: '#4CAF50',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
        backgroundColor: '#f0f8f0',
        padding: 12,
        borderRadius: 8,
        width: '100%',
    },
    errorText: {
        fontSize: 14,
        color: '#FF5252',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
        backgroundColor: '#fff0f0',
        padding: 12,
        borderRadius: 8,
        width: '100%',
    },
    buttonArea: {
        width: '100%',
        marginTop: 8,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        gap: 12,
    },
    button: {
        flex: 1,
        height: 53,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#f4f4f4',
    },
    retryButton: {
        backgroundColor: '#F5B43A',
    },
    reconnectButton: {
        backgroundColor: '#F5B43A',
    },
    successButton: {
        backgroundColor: '#4CAF50',
    },
    cancelButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000000',
    },
    retryButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000000',
    },
    reconnectButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000000',
    },
    successButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
    },
});
