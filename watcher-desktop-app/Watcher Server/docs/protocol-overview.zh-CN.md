# 协议概览

[English](protocol-overview.md) | 简体中文

这是一份面向当前 Watcher Server 实现的简明协议概览。

如果你需要更完整的细节版中文协议，请看 [`device_communication_protocol.md`](device_communication_protocol.md)。

## 角色

Watcher Server 当前面向：

- `hardware`
- `desktop`

每个 WebSocket 客户端在连接后都应尽快发送 `sys.client.hello`。

示例：

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

## 传输层

Watcher Server 使用：

- UDP 做 discovery
- WebSocket 文本帧承载 JSON 消息
- WebSocket 二进制帧承载媒体和 OTA 数据

## Discovery

默认 UDP discovery 端口：

- `37020`

请求示例：

```json
{
  "cmd": "DISCOVER",
  "device_id": "watcher-001",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

响应示例：

```json
{
  "cmd": "ANNOUNCE",
  "ip": "192.168.1.100",
  "port": 8765,
  "version": "1.0.0",
  "protocol_version": "0.1.5",
  "server": "watcher-server"
}
```

## 文本消息包格式

所有文本消息统一使用：

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {}
}
```

字段说明：

- `type`：消息名
- `code`：状态码，通常成功为 `0`
- `data`：负载对象

## 二进制帧格式

二进制帧的编码定义在 [`src/models/protocol.py`](../src/models/protocol.py)。

当前 frame type：

- `1`: audio
- `2`: video
- `3`: image
- `4`: ota

头部结构：

- magic: `WSPK`
- frame type: 1 byte
- flags: 1 byte
- sequence: 4 bytes
- payload length: 4 bytes

当前 flags：

- `FIRST`
- `LAST`
- `KEYFRAME`
- `FRAGMENT`

## 消息族

### System

- `sys.client.hello`
- `sys.ack`
- `sys.nack`
- `sys.ping`
- `sys.pong`
- `sys.session.resume`

### Control

- `ctrl.servo.angle`
- `ctrl.camera.video_config`
- `ctrl.camera.capture_image`
- `ctrl.camera.start_video`
- `ctrl.camera.stop_video`

### Config

- `cfg.asr.*`
- `cfg.tts.*`
- `cfg.llm.*`
- `cfg.dialogue.*`
- `cfg.scheduler.*`

### Events

- `evt.asr.result`
- `evt.ai.status`
- `evt.ai.thinking`
- `evt.ai.reply`
- `evt.server.error`
- `evt.device.status`
- `evt.servo.position`
- `evt.ota.progress`
- `evt.device.error`
- `evt.device.firmware`

### Transfer

- `xfer.ota.handshake`
- `xfer.ota.checksum`

## 当前常用链路

- `desktop -> hardware`
  - 舵机控制
  - 某些经过校验的 AI 状态转发
- `hardware -> desktop`
  - 设备事件
  - 舵机位置
  - OTA 进度
  - 图片/视频转发
- `hardware -> server -> hardware`
  - 音频对话主链路

## 当前限制

目前仍有一些协议面是保留态或部分实现：

- `sys.session.resume` 尚未完整实现
- 大部分 camera control 消息已注册但未完全启用
- OTA binary / checksum 流程还没有形成完整闭环

