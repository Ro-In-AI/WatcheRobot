# 模块对接文档：舵机遥控与位置同步

> 适用对象：硬件端开发、桌面端开发、服务端联调开发
> 对应能力：桌面端遥控硬件舵机、硬件端实时回传当前舵机位置、桌面端数值孪生同步
> 当前状态：已实现，可直接对接

## 1. 模块目标

本模块解决两件事：

1. 桌面端通过服务端控制硬件端舵机移动
2. 硬件端通过服务端持续上报当前舵机位置，供桌面端数值孪生同步

当前舵机为双自由度：

- `x_deg`
- `y_deg`

## 2. 当前链路结论

当前服务端已经接通：

- `desktop -> server -> hardware`
  - `ctrl.servo.angle`
- `hardware -> server -> desktop`
  - `evt.servo.position`
  - `evt.device.status`

桌面端应把 `evt.servo.position` 视为“当前位置真值”。

## 3. 连接前提

### 3.1 硬件端

连接后必须先发送：

```json
{
  "type": "sys.client.hello",
  "code": 0,
  "data": {
    "role": "hardware",
    "fw_version": "1.2.3"
  }
}
```

### 3.2 桌面端

连接后必须先发送：

```json
{
  "type": "sys.client.hello",
  "code": 0,
  "data": {
    "role": "desktop"
  }
}
```

### 3.3 在线状态通知

当桌面端 `hello` 成功后，服务端会主动下发：

```json
{
  "type": "evt.device.status",
  "code": 0,
  "data": {
    "devices": [],
    "online_hardware_count": 0
  }
}
```

桌面端应以此判断当前是否存在可控硬件。

## 4. 消息总表

### 4.1 桌面端 -> 服务端 -> 硬件端

- `ctrl.servo.angle`

### 4.2 硬件端 -> 服务端 -> 桌面端

- `evt.servo.position`
- `evt.device.status`

## 5. 桌面端遥控

### 5.1 发送格式

桌面端发送：

```json
{
  "type": "ctrl.servo.angle",
  "code": 0,
  "data": {
    "x_deg": 25,
    "y_deg": -10,
    "duration_ms": 320
  }
}
```

字段说明：

- `x_deg`
  目标 X 轴角度
- `y_deg`
  目标 Y 轴角度
- `duration_ms`
  可选，表示期望动作时长

### 5.2 桌面端实现建议

桌面端 UI 可以按“增量控制”设计，但发给服务端的仍建议是绝对角度。

推荐做法：

1. 先保存最近一次 `evt.servo.position`
2. 用户点击“X+/X-/Y+/Y-”时，在本地用“当前位置 + 步长”算出新目标
3. 发送新的 `ctrl.servo.angle`
4. 收到下一次 `evt.servo.position` 后，用硬件回传位置覆盖本地估算值

这样桌面端既能做到遥控，也能保证数值孪生最终与硬件真实位置对齐。

### 5.3 成功响应

桌面端发送 `ctrl.servo.angle` 后，服务端会先返回：

```json
{
  "type": "sys.ack",
  "code": 0,
  "data": {
    "type": "ctrl.servo.angle",
    "forwarded_clients": 1
  }
}
```

其中：

- `forwarded_clients`
  实际转发到多少个硬件连接

### 5.4 失败响应

当前常见失败：

```json
{
  "type": "sys.nack",
  "code": 1,
  "data": {
    "type": "ctrl.servo.angle",
    "reason": "no hardware client is connected"
  }
}
```

桌面端至少要处理：

- 没有硬件在线
- 当前连接角色错误
- 数据格式错误

## 6. 硬件端位置上报

### 6.1 上报格式

硬件端发送：

```json
{
  "type": "evt.servo.position",
  "code": 0,
  "data": {
    "x_deg": 12.5,
    "y_deg": -18.0
  }
}
```

### 6.2 什么时候上报

硬件端应在以下情况上报：

1. 收到 `ctrl.servo.angle` 并执行完成后
2. 舵机在本地被手动调整后
3. 舵机位置持续变化过程中，需要同步给桌面端时

当前服务端对 `evt.servo.position` 的处理是直接转发给所有桌面端，不做节流、不做聚合、不做位置修正。

因此硬件端应自行决定合适的上报频率。

### 6.3 当前建议

如果目标是给桌面端做数值孪生同步，建议：

- 位置发生变化就上报
- 停止运动后再补发一次最终位置

## 7. 在线状态同步

桌面端会收到：

```json
{
  "type": "evt.device.status",
  "code": 0,
  "data": {
    "devices": [
      {
        "client_id": 123456,
        "online": true,
        "fw_version": "1.2.3",
        "hw_version": "A1"
      }
    ],
    "online_hardware_count": 1
  }
}
```

### 7.1 桌面端如何使用

桌面端应使用：

- `online_hardware_count`
  控制遥控按钮是否启用
- `devices`
  展示在线硬件列表、固件版本、板卡信息

### 7.2 当前重要限制

当前协议没有“指定某一台硬件”为目标设备的字段。

这意味着：

- 只要桌面端发送 `ctrl.servo.angle`
- 服务端就会广播给所有在线硬件端

因此当前版本更适合：

- 单硬件联调
- 或者多硬件同时跟随同一控制指令

如果后续要实现“桌面端只控制某一台硬件”，协议需要补：

- `target_client_id`
  或等价的设备唯一标识字段

## 8. 当前服务端真实行为

### 8.1 `ctrl.servo.angle`

当前服务端行为：

- 只允许 `desktop` 发送
- 转发给所有 `hardware`
- 若没有硬件在线，返回 `sys.nack`
- 不校验角度范围
- 不等待硬件执行完成

也就是说，当前 ACK 的含义是：

- “服务端已成功转发”

而不是：

- “硬件已经执行完成”

### 8.2 `evt.servo.position`

当前服务端行为：

- 只允许 `hardware` 发送
- 收到后直接转发给所有 `desktop`
- 不改写位置值
- 不持久化历史轨迹

桌面端的数值孪生应直接使用这个事件驱动。

## 9. `command_id` 说明

当前协议中，`ctrl.servo.angle` 已不再要求携带 `command_id`。

原因：

- 舵机遥控属于高频控制消息
- 当前服务端不会用它做去重
- 当前服务端不会用它做 ACK 关联
- 当前服务端不会用它做幂等控制

因此桌面端和硬件端都可以按更精简的消息体实现：

- 只发送 `x_deg / y_deg / duration_ms`
- 不依赖 `command_id`

## 10. 推荐对接顺序

### 桌面端

1. 连接成功后发送 `sys.client.hello`
2. 接收 `evt.device.status`
3. 若有硬件在线，启用遥控 UI
4. 发送 `ctrl.servo.angle`
5. 接收 `sys.ack / sys.nack`
6. 持续接收 `evt.servo.position`
7. 用 `evt.servo.position` 更新数值孪生

### 硬件端

1. 连接成功后发送 `sys.client.hello`
2. 监听 `ctrl.servo.angle`
3. 执行舵机动作
4. 发送 `evt.servo.position`
5. 若本地有人工手动调整，也继续发送 `evt.servo.position`

## 11. 最小联调示例

### 11.1 桌面端发控制

```json
{
  "type": "ctrl.servo.angle",
  "code": 0,
  "data": {
    "x_deg": 30,
    "y_deg": -5,
    "duration_ms": 200
  }
}
```

### 11.2 硬件端回位置

```json
{
  "type": "evt.servo.position",
  "code": 0,
  "data": {
    "x_deg": 30,
    "y_deg": -5
  }
}
```

## 12. 联调检查项

- 桌面端 `hello` 后是否能收到 `evt.device.status`
- 硬件端 `hello` 后桌面端在线列表是否更新
- 桌面端发 `ctrl.servo.angle` 后是否收到 `sys.ack`
- 硬件端是否能收到 `ctrl.servo.angle`
- 硬件端执行后是否发送 `evt.servo.position`
- 桌面端数值孪生是否按 `evt.servo.position` 实时刷新
- 本地手动调整硬件位置后，桌面端是否能同步更新
