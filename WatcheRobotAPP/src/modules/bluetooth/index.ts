/**
 * 蓝牙 (Bluetooth) 模块
 *
 * 提供完整的低功耗蓝牙 (BLE) 通信功能，包括设备扫描、连接、数据传输和状态管理。
 * 封装了底层蓝牙操作，提供统一的 Hook 和组件接口。
 *
 * 主要功能：
 * - 🔍 **设备扫描**：支持自动/手动扫描，可配置过滤规则
 * - 🔗 **连接管理**：支持自动重连、超时控制、MTU协商
 * - 📡 **数据通信**：支持读写特征值、订阅通知 (Notify/Indicate)
 * - 💾 **状态管理**：集成 Redux，统一管理连接状态和数据
 * - 📱 **UI 组件**：提供开箱即用的扫描弹窗和状态展示组件
 */

export * from './components/BLEPop';
export * from './screens/BluetoothScreen';
export * from './services/bluetoothService';
export * from './services/bleCommandHelper';
export * from './hooks/useBluetooth';
export * from './protocol/bleProtocol';
/** @hidden */
export * from './store';
/** @hidden */
export * from './constants/bluetoothConstants';
export * from './types';
