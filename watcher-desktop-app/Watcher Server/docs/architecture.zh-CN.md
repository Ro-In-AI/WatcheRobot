# 架构概览

[English](architecture.md) | 简体中文

Watcher Server 是一个基于 asyncio 的运行时中枢，位于 `hardware` 与 `desktop` 两类客户端之间。

## 顶层组件

- [`src/main.py`](../src/main.py)：启动运行时、安装退出信号、拉起所有服务
- [`src/core/websocket_server.py`](../src/core/websocket_server.py)：WebSocket 入口、连接注册、按角色广播
- [`src/core/runtime_services.py`](../src/core/runtime_services.py)：配置读写、provider 生命周期、对话引擎切换
- [`src/core/audio_session_handler.py`](../src/core/audio_session_handler.py)：语音会话编排
- [`src/core/http_management_server.py`](../src/core/http_management_server.py)：本地 HTTP 管理接口
- [`src/core/scheduler/service.py`](../src/core/scheduler/service.py)：调度器宿主
- [`src/modules/discovery/discovery_server.py`](../src/modules/discovery/discovery_server.py)：UDP 局域网发现

## 客户端角色

当前服务期望两类客户端：

- `hardware`
- `desktop`

每个 WebSocket 客户端都应通过 `sys.client.hello` 声明角色。硬件端还应带上 `fw_version` 等固件信息。

## 核心运行流程

```text
WatcherServer
  -> RuntimeServices.initialize()
  -> SchedulerService.start()
  -> HTTPManagementServer.start()
  -> WebSocketServer.start()
```

## 语音主链路

```text
hardware binary.audio
  -> MessageDispatcher
  -> protocol_handlers.binary.handle_audio_frame()
  -> AudioSessionHandler.feed_audio()
  -> RuntimeServices.ensure_asr_provider()
  -> ASR stream
  -> AudioSessionHandler.end_session()
  -> RuntimeServices.chat()
  -> evt.ai.status / evt.ai.thinking / evt.ai.reply
  -> RuntimeServices.ensure_tts_provider()
  -> TTS synthesize_stream()
  -> binary.audio 回传给 hardware
```

当前代码已经不再对 OpenClaw 对话路径施加固定 5 分钟超时，而是一直等待直到对话引擎返回结果或抛错。

## 图片辅助 OpenClaw 链路

如果硬件在语音提问前上传了一张完整图片：

```text
hardware binary.image
  -> protocol_handlers.binary.handle_image_frame()
  -> SessionMediaStore
  -> RuntimeServices.chat()
  -> OpenClaw media bridge
  -> 本地图片路径
  -> OpenClaw 响应
```

桥接后的图片文件会存放在配置好的 OpenClaw media root 下，并在使用后清理。

## 按角色转发

当前已接通的转发路径包括：

- `desktop -> hardware`
  - `ctrl.servo.angle`
  - 某些桌面侧驱动的 AI 状态转发
- `hardware -> desktop`
  - `evt.device.status`
  - `evt.device.error`
  - `evt.device.firmware`
  - `evt.ota.progress`
  - `evt.servo.position`
  - `xfer.ota.handshake`
  - `binary.video`
  - `binary.image`

## 配置与热更新

主配置全部位于 `config/*.json`。

更新路径是：

```text
desktop cfg.*.update
  -> protocol_handlers.config
  -> RuntimeServices / SchedulerService
  -> JSON 文件落盘
  -> 运行时实例替换或更新
```

如果硬件端正在执行语音链路，某些更新会被拒绝，以避免中途替换 provider 造成当前请求失败。

## 调度器与 HTTP API

当前调度器内置两类任务：

- `idle_ai_status_push`
- `scheduled_tts_push`

HTTP 管理接口封装的是单个一次性提醒任务 `http_managed_scheduled_tts`。

当前提醒链路：

```text
HTTPManagementServer
  -> SchedulerService.upsert_http_managed_scheduled_tts_task()
  -> ScheduledTTSPushTask
  -> 在硬件空闲时向在线硬件播报 TTS
```

## Discovery

如果启用了 discovery，UDP 服务会在局域网中回应发现请求，返回：

- 服务端 IP
- WebSocket 端口
- 服务版本
- 协议版本

这一步发生在正式建立 WebSocket 连接之前。

当前实现里，discovery 还会配合“发现入口收口”策略工作：

- 当没有硬件在线时，UDP discovery 保持开启
- 第一台硬件成功完成 `sys.client.hello(role=hardware)` 后，UDP discovery 会暂停
- 最后一台硬件断开后，UDP discovery 会恢复
- 如果还有其他硬件直接连到 WebSocket，当前实现不会额外拦截，便于联调和 HTML 模拟硬件测试

## 当前边界

代码已经支持当前主语音链路、桌面配置、局域网发现和提醒管理。

以下部分仍处于保留或未完全闭环状态：

- `sys.session.resume`
- 大部分 `ctrl.camera.*`
- 完整 OTA checksum / binary 传输闭环
