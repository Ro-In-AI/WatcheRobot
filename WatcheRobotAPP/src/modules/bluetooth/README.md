# bluetooth

## 📌 简介 (Introduction)

蓝牙 (Bluetooth) 模块
提供完整的低功耗蓝牙 (BLE) 通信功能，包括设备扫描、连接、数据传输和状态管理。
封装了底层蓝牙操作，提供统一的 Hook 和组件接口。
主要功能：
- 🔍 **设备扫描**：支持自动/手动扫描，可配置过滤规则
- 🔗 **连接管理**：支持自动重连、超时控制、MTU协商
- 📡 **数据通信**：支持读写特征值、订阅通知 (Notify/Indicate)
- 💾 **状态管理**：集成 Redux，统一管理连接状态和数据
- 📱 **UI 组件**：提供开箱即用的扫描弹窗和状态展示组件

## 🔌 BLE JSON 协议说明

- 当前 App 已切换到单服务单特征模型：`00FF / FF01`
- Android 连接默认申请 `MTU 247`
- 业务消息统一使用 JSON object 编码，并通过 `write with response + 同特征 notify/read fallback` 交互
- 推荐直接使用 `useBluetooth` 暴露的协议方法，而不是拼接裸字符串命令

## 🚀 快速开始 (Quick Start)

### 引入模块 (Import)
```typescript
import { 
  useBluetooth
} from '@/modules/bluetooth';
```

## 📖 API 文档 (API Documentation)

### Hooks

#### [`useBluetooth`](hooks/useBluetooth.ts#L70)

蓝牙功能自定义 Hook

封装了蓝牙服务的所有功能，并集成了 Redux 状态管理。
提供给 UI 组件使用的统一接口。

**返回值 (Returns)**

- [`UseBluetoothReturn`](#usebluetoothreturn) - 成功执行

**示例 (Example)**
```typescript
function MyComponent() {
  const { 
    status, 
    deviceInfo, 
    startScan, 
    connectToDevice,
    disconnect,
    sendServoAngle,
    setWifiConfig,
  } = useBluetooth();

  // 扫描并连接
  const handleScan = async () => {
    await startScan((device) => {
      if (device.name === 'MyDevice') {
        await connectToDevice(device.id);
        await sendServoAngle({xDeg: 90, yDeg: 110});
        await setWifiConfig({ssid: 'OfficeWiFi', password: '12345678'});
      }
    });
  };

  return (
    <View>
      <Text>状态: {status}</Text>
      {deviceInfo && <Text>已连接: {deviceInfo.name}</Text>}
      <Button title="扫描" onPress={handleScan} />
      <Button title="断开" onPress={disconnect} />
    </View>
  );
}
```

### Components

#### [`<BLEPop />`](components/BLEPop/BLEPop.tsx#L49)

蓝牙弹窗组件

用于显示蓝牙连接状态、扫描进度和错误信息。

**属性 (Props)**

类型: [`BLEPopProps`](#blepopprops)

#### [`<BluetoothScreen />`](screens/BluetoothScreen.tsx#L26)

Bluetooth 模块测试页面

提供完整的蓝牙功能测试界面，采用 iOS 风格设计。

### 类型定义 (Type Definitions)

#### [`BluetoothDeviceInfo`](types/index.ts#L38)

蓝牙设备基本信息接口

存储已连接设备的关键信息，用于 UI 显示和状态管理。
这些信息在设备连接成功后获取并缓存。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`id`](types/index.ts#L40) | string | 是 | 设备唯一标识符 - 用于设备识别和重连 | - | - |
| [`mtu`](types/index.ts#L46) | number \| null | 否 | 最大传输单元 - 影响数据传输效率，可能为空 | - | - |
| [`name`](types/index.ts#L43) | string \| null | 否 | 设备名称 - 可能为空，取决于设备广播信息 | - | - |


#### [`BluetoothError`](types/index.ts#L55)

蓝牙错误信息接口

标准化的错误信息结构，提供详细的错误描述和可选的错误代码。
用于错误处理和用户提示。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`code`](types/index.ts#L57) | string | 否 | 错误代码 - 可选的系统级错误代码，用于程序化处理 | - | - |
| [`message`](types/index.ts#L60) | string | 是 | 错误消息 - 人类可读的错误描述，用于用户提示 | - | - |


#### [`BluetoothReceivedData`](types/index.ts#L152)

蓝牙接收数据接口

定义了从蓝牙设备接收到的数据结构，包含特征值信息和实际数据。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`characteristicName`](types/index.ts#L154) | string | 是 | 特征值名称 - 来源特征值的配置名称 | - | - |
| [`characteristicUUID`](types/index.ts#L157) | string | 是 | 特征值 UUID - 来源特征值的唯一标识符 | - | - |
| [`data`](types/index.ts#L160) | any | 是 | 实际数据 - 根据value_format解析后的数据，可能是字符串、数组或对象 | - | - |
| [`timestamp`](types/index.ts#L163) | string | 是 | 时间戳 - 数据接收时间的ISO字符串 | - | - |


#### [`ConnectOptions`](types/index.ts#L90)

设备连接选项接口

配置设备连接行为的参数，支持超时控制、自动重连和 MTU 设置。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`autoConnect`](types/index.ts#L95) | boolean | 否 | 自动重连标志 - 可选，设备断开后是否自动尝试重连 | - | - |
| [`requestMTU`](types/index.ts#L98) | number | 否 | 请求的 MTU 大小 - 可选，仅在 Android 平台有效，影响数据传输效率 | - | - |
| [`timeout`](types/index.ts#L92) | number | 否 | 连接超时时间（毫秒） - 可选，默认通常为 10 秒 | - | - |


#### [`NotificationOptions`](types/index.ts#L107)

特征值通知选项接口

指定要监听或操作的 BLE 特征值，通过服务 UUID 和特征值 UUID 定位。
用于数据读写和通知订阅。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`characteristicUUID`](types/index.ts#L112) | string | 是 | 特征值 UUID - 目标特征值的唯一标识符 | - | - |
| [`serviceUUID`](types/index.ts#L109) | string | 是 | 服务 UUID - 目标特征值所属的服务标识符 | - | - |


#### [`ScanOptions`](types/index.ts#L77)

设备扫描选项接口

配置设备扫描行为的参数，提供灵活的扫描控制。

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`timeout`](types/index.ts#L79) | number | 否 | 扫描超时时间（毫秒） - 可选，未设置时将持续扫描直到手动停止 | - | - |


**方法 (Methods)**

##### [`filter`](types/index.ts#L82)

设备过滤函数 - 可选，用于筛选符合条件的设备

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `device` | [`Device`](#device) |  |

**返回值 (Returns)**

- boolean - 成功执行

#### [`UseBluetoothReturn`](types/index.ts#L185)

useBluetooth Hook 的返回值类型定义

包含了所有蓝牙功能相关的状态和操作方法
这是使用蓝牙模块的主要接口

**属性 (Properties)**

| 属性名 (Name) | 类型 (Type) | 必填 (Required) | 描述 (Description) | 默认值 (Default) | 备注 (Remarks) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`deviceInfo`](types/index.ts#L190) | [`BluetoothDeviceInfo`](#bluetoothdeviceinfo) \| null | 是 | 当前连接的设备信息，未连接时为 null | - | - |
| [`error`](types/index.ts#L196) | [`BluetoothError`](#bluetootherror) \| null | 是 | 当前的错误信息，无错误时为 null | - | - |
| [`receivedData`](types/index.ts#L193) | string \| [`BluetoothReceivedData`](#bluetoothreceiveddata) \| null | 是 | 最近接收到的数据，未接收到数据时为 null | - | - |
| [`status`](types/index.ts#L187) | [`BluetoothStatus`](#bluetoothstatus) | 是 | 当前蓝牙连接状态 | - | - |


**方法 (Methods)**

##### [`clearAll`](types/index.ts#L291)

清除所有状态
重置状态、设备信息、接收数据和错误信息

**返回值 (Returns)**

- void - 成功执行

##### [`clearError`](types/index.ts#L285)

清除错误状态

**返回值 (Returns)**

- void - 成功执行

##### [`connectToConfiguredDevice`](types/index.ts#L227)

连接到配置文件中指定的设备
自动扫描并连接到 ble_config.json 中配置的设备

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `options` | <span style="color:red; font-weight:bold">{ autoConnect?: boolean; connectTimeout?: number; deviceName?: string; enableAutoRescan?: boolean; maxRescanAttempts?: number; rescanDelayMs?: number; scanTimeout?: number }</span> |  |

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`connectToDevice`](types/index.ts#L221)

连接到指定设备

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `deviceId` | string | 设备ID |
| `options` | [`ConnectOptions`](#connectoptions) | 连接选项 |

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`disconnect`](types/index.ts#L240)

断开当前连接

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`initialize`](types/index.ts#L202)

初始化蓝牙服务
检查权限并初始化蓝牙适配器

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`readData`](types/index.ts#L262)

读取特征值数据

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `serviceUUID` | string | 服务UUID |
| `characteristicUUID` | string | 特征值UUID |

**返回值 (Returns)**

- Promise<string> - 读取到的数据 (Base64 字符串)

##### 协议业务方法

以下方法通过同一个 `00FF / FF01` 特征收发 JSON：

- `sendServoAngle({ xDeg?, yDeg?, commandId? })`
- `sendAiStatus({ status, actionFile, message?, soundFile?, commandId? })`
- `setRobotState({ state, commandId? })`
- `setWifiConfig({ ssid, password, commandId? })`
- `getWifiStatus({ commandId? })`
- `clearWifiConfig({ commandId? })`
- `pingDevice({ timestamp?, commandId? })`
- `subscribeToProtocolMessages(listener)`

##### [`startScan`](types/index.ts#L209)

开始扫描设备

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `onDeviceFound` | [`DeviceDiscoveredCallback`](#devicediscoveredcallback) | 发现设备时的回调函数 |
| `options` | [`ScanOptions`](#scanoptions) | 扫描选项 |

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`stopScan`](types/index.ts#L214)

停止扫描

**返回值 (Returns)**

- Promise<void> - 成功执行

##### [`subscribeToNotifications`](types/index.ts#L270)

订阅特征值通知

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `options` | [`NotificationOptions`](#notificationoptions) | 通知选项 |
| `callback` | [`NotificationListener`](#notificationlistener) | 收到通知时的回调 |

**返回值 (Returns)**

- () => void - 取消订阅的函数

##### [`writeData`](types/index.ts#L249)

向设备写入数据 (底层方法)

**请求参数 (Request Parameters)**

| 参数名 (Name) | 类型 (Type) | 描述 (Description) |
| :--- | :--- | :--- |
| `serviceUUID` | string | 服务UUID |
| `characteristicUUID` | string | 特征值UUID |
| `data` | string | Uint8Array<ArrayBufferLike> | 要发送的数据 |
| `withResponse` | boolean | 是否需要响应 |

**返回值 (Returns)**

- Promise<void> - 成功执行

#### [`DeviceDiscoveredCallback`](types/index.ts#L70)

设备发现回调函数类型

在设备扫描过程中，每发现一个设备时调用此回调函数。

#### [`DisconnectListener`](types/index.ts#L133)

断开连接监听器函数类型

当设备意外断开连接时，系统会调用此函数通知应用程序。
可用于实现自动重连、状态更新或用户提示。

#### [`NotificationListener`](types/index.ts#L123)

通知监听器函数类型

当订阅的特征值发生变化时，系统会调用此函数传递新的数据。
支持传统的Base64编码字符串格式和新的结构化数据格式。

#### [`BluetoothStatus`](types/index.ts#L12)

蓝牙连接状态枚举

定义了蓝牙设备连接过程中的所有可能状态，用于状态管理和 UI 显示。
状态流转通常为：Idle -> Scanning -> Connecting -> Connected
异常情况下可能转为：Error 或 Disconnected

| 成员 (Member) | 值 (Value) | 描述 (Description) |
| :--- | :--- | :--- |
| [`Connected`](types/index.ts#L23) | `connected` | 已连接 - 成功连接到设备，可以进行数据通信 |
| [`Connecting`](types/index.ts#L20) | `connecting` | 连接中 - 正在尝试连接到指定设备 |
| [`Disconnected`](types/index.ts#L26) | `disconnected` | 已断开 - 设备连接已断开，可能是主动断开或意外断开 |
| [`Error`](types/index.ts#L29) | `error` | 错误状态 - 连接过程中发生错误，需要用户处理 |
| [`Idle`](types/index.ts#L14) | `idle` | 空闲状态 - 初始状态，未进行任何蓝牙操作 |
| [`Scanning`](types/index.ts#L17) | `scanning` | 扫描中 - 正在搜索附近的蓝牙设备 |
