# BLE Motion Control Compatibility Notes（APP + Firmware）

## 1. 变更背景

近期在 APP 端遥控时，固件串口出现以下连续日志：
- `BLE notify skipped (connected=1 notify=0 if=3): ERR_UNSUPPORTED`
- `BLE motion command rejected: ESP_ERR_NOT_SUPPORTED`

APP 已确认写入成功（`type: 'no_response'`），但命令未被固件执行，用户感知为“蓝牙控制无效”。

本说明用于记录根因、变更依据和验收流程，供 PR 审阅与回归复测。

## 2. 根因分析

### 2.1 写链路与执行链路分离
- APP 的写请求使用 `FF01` 特征发送数据，属于 `Write`。
- 目前该特征返回为 `no_response`，表示客户端不等待写响应。
- 固件侧当前实现的命令分发是按字符串前缀匹配执行。

### 2.2 命令不一致
APP 实际发送的是：
`JOY:<xPercent>:<yPercent>`

固件原有解析逻辑只识别：
`X:...`, `Y:...`, `SET_SERVO`, `SERVO_MOVE`, `WIFI_CONFIG`, `WIFI_STATUS`, `WIFI_CLEAR`, `PING`。

因此固件返回 `ESP_ERR_NOT_SUPPORTED` 是预期行为，属于协议对齐问题，不是 BLE 通讯链路问题。

### 2.3 `notify=0` 的含义
`BLE notify skipped` 的含义是：连接已建立，但 App 尚未打开该特征的 `Notify/Indicate`。
这会影响“ACK/状态文本回传”，但不阻断写入本身的下发。

## 3. 处理原则

1. **优先保证协议兼容**：APP 与固件应支持统一命令集合。
2. **保留可观测性**：即便不需要响应式写，仍应记录被拒绝的命令前缀和错误码，帮助定位问题。
3. **避免误报**：明确区分“写入成功”与“命令执行成功”。

## 4. 本次变更（针对本 PR）

本次提交仅在 APP 仓库补充规范文档，约定双方协议如下：
- APP 遥控命令在 `Motion/Surveillance` 页面持续发送：
  - `JOY:<xPercent>:<yPercent>`（已对外展示）
- 固件应支持 `JOY` 命令作为标准化入口，并映射到 X/Y 轴角度控制。
- 若未来固件回调不再兼容，应通过联调前先同步 `BLE_COMMAND_SCHEMA`。

## 5. 关键日志判读（快速排障）

- `BLE_SVC: BLE motion command rejected: ESP_ERR_NOT_SUPPORTED`
  - 说明命令前缀未匹配固件处理器。
- `BLE notify skipped (connected=1 notify=0 ...): ERR_UNSUPPORTED`
  - 说明通知未开启，不影响写成功；可能缺少状态回显。
- `write success (无响应)`
  - 表示手机端写出成功，不能直接等价于“已执行”。

## 6. 回归验证清单

1. 连接设备，确认服务/特征为 `00FF/FF01`。
2. 发送 `JOY:0:0`，观察舵机是否回中位（或保持）。
3. 发送 `JOY:100:0` 与 `JOY:-100:0`，观察 X 轴方向响应。
4. 发送 `JOY:0:100` 与 `JOY:0:-100`，观察 Y 轴方向响应。
5. 检查固件串口是否不再出现 `ESP_ERR_NOT_SUPPORTED`。
6. 可选：开启 Notify，确认状态文本可回传以提高可观测性。

## 7. 风险与回归范围

- 命令映射采用百分比到角度区间转换，建议在 30%~150%（X）及 Y 轴机械限位范围内进行验证，防止越界动作。
- 如出现动作抖动，建议确认 `onVectorChange` 的发送频率与 App 死区阈值（deadzone）配置。

