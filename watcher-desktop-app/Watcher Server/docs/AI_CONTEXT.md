# Watcher Server - AI 上下文文档

> 最后更新: 2026-03-23
> 当前状态: 协议骨架、配置中心、设备状态同步与音频链路已接通，摄像头/OTA 业务仍有保留能力未完全实现

## 1. 这份文档的用途

这份文档是给后续 AI 或新接手开发者快速建立项目上下文用的。

重点不是历史设计，而是：

- 当前真实可运行的架构
- 当前协议主线
- 哪些链路已经接通
- 哪些文件是核心入口
- 后续要改业务时应该优先改哪里

---

## 2. 当前项目是什么

`watcher-server` 是一个基于 `websockets + asyncio` 的协议与编排服务。

它当前承担 4 类职责：

1. 接收硬件端或桌面端的 WebSocket 连接
2. 解析统一文本帧和统一二进制帧
3. 在服务端做本地处理或在不同客户端角色之间转发消息
4. 对音频链路执行 `ASR -> AI -> TTS` 的完整会话编排
5. 作为配置中心，为桌面端提供 `ASR / TTS / LLM / Dialogue` 配置读写与热更新
6. 维护硬件端在线状态与版本快照，并同步给桌面端
7. 托管独立定时任务模块，在系统空闲时下发非对话流状态

当前系统里有两类客户端连接：

- `hardware`
- `desktop`

服务端通过 `sys.client.hello` 判断连接角色。

其中硬件端在连接建立后必须发送：

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

`fw_version` 会在连接阶段保存到服务端元数据中，用于后续 OTA 判断入口。
注意：当前代码只是“保存并 ACK”，自动 OTA 触发逻辑还没有真正实现。

---

## 3. 当前协议主线

当前应优先阅读的文档只有：

- `docs/device_communication_protocol.md`
- `docs/AI_CONTEXT.md`
- `docs/ALIYUN_ASR.md`
- `docs/ESP32_SERVICE_DISCOVERY.md`
- `docs/integration/ai_status_integration.md`
- `docs/integration/scheduler_module_integration.md`
- `docs/integration/config_runtime_switch_integration.md`
- `docs/integration/servo_control_and_digital_twin_integration.md`

其它旧协议文档、旧 context 拆分文档和过时设计稿已经清理，不应再作为新增开发依据。

当前服务基础配置文件为：

- `config/system.json`

这里维护：

- `ws_host / ws_port / ws_max_size`
- `service_version / protocol_version`
- `discovery_enabled / discovery_port`
- `scheduler_enabled / scheduler_config_file`
- `http_management_enabled / http_management_host / http_management_port`
- `openclaw_*`
- `thread_pool_*`
- `log_*`

当前主服务不再从 `.env` 读取基础配置。

---

## 4. 当前运行时总流程

### 4.1 单连接生命周期

每个 WebSocket 连接建立后，服务端会创建：

1. 一个 `AudioSessionHandler`
2. 一个 `MessageDispatcher`
3. 一个 `ProtocolHandlerContext`
4. 一整套通过 `protocol_router.py` 注册好的 handler

可以把运行路径理解成：

```text
WebSocket message
  -> MessageDispatcher
  -> protocol_router
  -> protocol_handlers/*
  -> 本地处理 / 跨角色转发 / 拒绝 / 占位
```

### 4.2 音频链路

硬件端上行音频时：

```text
hardware binary.audio
  -> binary.handle_audio_frame()
  -> AudioSessionHandler.feed_audio()
  -> RuntimeServices.ensure_asr_provider()
  -> ASR stream_start / stream_feed
  -> AudioSessionHandler.end_session()
  -> evt.asr.result
  -> RuntimeServices.chat()
  -> evt.ai.status / evt.ai.thinking / evt.ai.reply
  -> 若语音链路出错，广播 evt.server.error 给 desktop
  -> RuntimeServices.ensure_tts_provider()
  -> TTS synthesize_stream()
  -> binary.audio 下行给当前客户端
```

如果同一硬件连接在语音提问前刚上传了完整图片流：

```text
hardware binary.image
  -> binary.handle_image_frame()
  -> AudioSessionHandler.ingest_media_frame()
  -> SessionMediaStore 缓存最近完整图片
  -> 下一轮 RuntimeServices.chat() 在 openclaw 模式下带上图片上下文
  -> LocalOpenClawProvider / TmuxOpenClawProvider
  -> OpenClawMediaBridge 落盘到 ~/.openclaw/workspace/.watcher_media/images/
  -> openclaw agent 读取本地图片路径并返回描述
  -> 本次问答结束后立即删除本次桥接生成的图片文件
```

### 4.3 转发链路

当前已经接通的跨角色转发包括：

- `desktop -> server -> hardware`
  - `ctrl.servo.angle`
- `hardware -> server -> desktop`
  - `evt.device.status`
  - `evt.servo.position`
  - `evt.ota.progress`
  - `evt.device.error`
  - `evt.device.firmware`
  - `xfer.ota.handshake`
  - `binary.video`
  - `binary.image`

---

## 5. 当前核心文件和角色

### 5.1 服务端入口

#### `src/main.py`

服务启动入口。

职责：

- 创建 `RuntimeServices`
- 创建 `WebSocketServer`
- 启动服务

#### `src/core/websocket_server.py`

这是当前服务端的主入口协调层。

职责：

- 接收新连接
- 为每个连接创建 `AudioSessionHandler`
- 创建 `MessageDispatcher`
- 创建 `ProtocolHandlerContext`
- 调用 `register_protocol_handlers()` 完成消息注册
- 托管 `DeviceRegistry`
- 维护连接状态：
  - `connected_clients`
  - `client_roles`
  - `client_last_seen`
  - `client_metadata`
  - `client_sessions`
- 提供跨角色广播能力：
  - `broadcast_text_message()`
  - `broadcast_binary_frame()`
  - `broadcast_device_status()`

如果某个需求涉及“把消息发给另一类客户端”，通常最终会落到这里的广播方法。

#### `src/core/runtime_services.py`

运行时模块管理层。

职责：

- 读取和写入 `config/*.json`
- 初始化和热切换 `ASR / TTS / LLM`
- 托管 `DialogueManager`
- 对外提供统一的：
  - `get_*_report()`
  - `update_*_config()`
  - `ensure_asr_provider()`
  - `ensure_tts_provider()`
  - `chat()`

这是当前“配置中心”和“运行时热更新”的主入口。

#### `src/core/scheduler/service.py`

定时任务模块入口。

职责：

- 读取 `config/scheduler.json`
- 创建并托管定时任务实例
- 同时承载 `interval` 和 `scheduled` 两类任务
- 在服务启动时启动，在服务关闭时清理
- 为任务注入 `WebSocketServer + RuntimeServices`
- 复用同一条 TTS 下发链路给定时任务和 HTTP 立即测试接口
- 作为后续自定义任务的统一宿主

#### `src/core/http_management_server.py`

本地 HTTP 管理接口入口。

职责：

- 监听 `http_management_host / http_management_port`
- 提供 `scheduled_tts_push` 的读取、保存、立即测试接口
- 只面向桌面端页面、本地调试工具和开发联调，不属于硬件 WebSocket 协议
- 为 `test_client.html` 提供 CORS 兼容的本地管理入口

#### `src/core/device_registry.py`

硬件状态注册表。

职责：

- 记录当前在线硬件
- 记录 `fw_version / hw_version / board_model / mac`
- 生成 `evt.device.status` 快照

#### `src/core/session_media.py`

会话级媒体缓存层。

职责：

- 重组 `binary.image / binary.video`
- 兼容 JPEG 尾部 padding
- 缓存最近一次完整图片
- 为 AI 问答提供最近媒体上下文

注意：

- 当前真正进入 OpenClaw 视觉问答的只有最近图片
- 视频当前只做协议接收、缓存和转发占位

### 5.2 协议层

#### `src/models/protocol.py`

协议数据模型与编解码定义。

这里定义了：

- `ClientRole`
- `TextMessageType`
- `BinaryFrameType`
- `BinaryFrameFlag`
- `TextMessage`
- `BinaryFrame`
- 若干消息类型集合

当前统一文本信封：

```json
{
  "type": "evt.device.error",
  "code": 1501,
  "data": {}
}
```

当前统一二进制帧头：

```text
magic(4) + frame_type(1) + flags(1) + seq(4) + payload_len(4)
```

`magic` 固定为 `WSPK`。

#### `src/core/message_dispatcher.py`

消息解析与分发器。

职责：

- 如果收到 `str`，按 `TextMessage.from_json()` 解析
- 如果收到 `bytes`，按 `BinaryFrame.from_bytes()` 解析
- 根据注册表把消息交给对应 handler

注意：

- 它不是业务层
- 它不关心谁是硬件端或桌面端
- 它也不负责转发，只负责“分发到正确 handler”

#### `src/core/protocol_context.py`

单连接协议上下文。

它把下面几样东西绑在一起传给 handler：

- `server`
- `websocket`
- `session`
- `runtime`
- 当前连接 `client_id`
- 当前连接 `role`

#### `src/core/protocol_router.py`

协议总路由表。

职责：

- 把每个 `TextMessageType` 注册到对应 handler
- 把每个 `BinaryFrameType` 注册到对应 handler

它不是实际转发逻辑，只是“消息 -> handler” 的映射入口。

### 5.3 协议 handler 层

#### `src/core/protocol_handlers/system.py`

系统治理类消息处理。

当前主要做：

- `sys.client.hello`
  - 校验角色
  - 硬件端必须带 `fw_version`
  - 锁定连接角色
  - 保存 `client_metadata`
  - 对硬件端预热运行时 ASR
  - 桌面端 hello 成功后主动发送 `evt.device.status`
  - 硬件端 hello 成功后广播 `evt.device.status`
- `sys.ping / sys.pong`
- `sys.ack / sys.nack`
- `sys.session.resume`
  - 当前只返回未实现

#### `src/core/protocol_handlers/control.py`

控制类消息处理。

当前真正接通的只有：

- `ctrl.servo.angle`
  - 限制发送方必须是 `desktop`
  - 转发到 `hardware`
  - 若没有硬件连接则返回 `sys.nack`

当前已接协议入口但会拒绝的：

- `ctrl.camera.video_config`
- `ctrl.camera.capture_image`
- `ctrl.camera.start_video`
- `ctrl.camera.stop_video`

原因：这些现在按“服务端下行到硬件”的能力预留，不允许客户端直接伪造上行。

### 5.4 OpenClaw 视觉层

#### `src/modules/openclaw/media_bridge.py`

OpenClaw 媒体桥接层。

职责：

- 把 Watcher 收到的图片转换成 OpenClaw CLI 可访问的本地文件
- 当前落盘目录默认是 `~/.openclaw/workspace/.watcher_media/`
- 为用户问题拼接带本地图片路径的 prompt
- 在单次问答完成后删除本次桥接生成的图片文件
- 保留 `retention_seconds` 兜底清理异常残留文件

当前状态：

- 图片：已实现
- 视频：只保留 `VideoMediaPreparer` 占位，明确未实现

#### `src/modules/openclaw/local_claw.py`

当前本地 OpenClaw 主实现。

职责：

- 检查 OpenClaw CLI / Gateway 可用性
- 读取本地 `~/.openclaw/openclaw.json`
- 获取当前 agent / model / inputs 运行时信息
- 无媒体时走普通 `openclaw agent --message`
- 有图片时走 `OpenClawMediaBridge`，然后改为用本地图片路径调用 `openclaw agent`

当前注意点：

- 当前图片问答主路径已经不再依赖 Gateway `/v1/responses` 直接吃图片 bytes
- `_chat_with_status()` 的 CLI 等待逻辑已经修过，避免子进程结束后长时间卡住

#### `src/modules/openclaw/tmux_claw.py`

带 session 日志跟踪的 OpenClaw 实现。

当前补充点：

- 保留 thinking / tool_call / tool_result 日志能力
- 同步修了 CLI 进程等待逻辑
- 同样会读取 agent 当前 model / inputs 能力信息

#### `src/core/protocol_handlers/config.py`

配置类消息处理。

当前状态：

- `cfg.asr.*`
- `cfg.tts.*`
- `cfg.llm.*`
- `cfg.dialogue.*`

这些消息现在已经真正接通。

当前行为：

- `cfg.*.get`
  - 仅允许 `desktop`
  - 返回当前配置文件完整内容和运行时状态
- `cfg.*.update`
  - 仅允许 `desktop`
  - 更新对应 JSON 文件
  - 立即热切换对应运行时实例
  - 成功后广播 `cfg.*.report` 给全部桌面端
  - 若硬件端当前有活跃音频会话，则拒绝更新

#### `src/core/protocol_handlers/event.py`

事件类消息处理。

当前服务端允许硬件端上行并转发到桌面端的事件：

- `evt.device.status`
- `evt.servo.position`
- `evt.ota.progress`
- `evt.device.error`
- `evt.device.firmware`

当前服务端自己产出、不允许客户端伪造的事件：

- `evt.asr.result`
- `evt.ai.status`
- `evt.ai.thinking`
- `evt.ai.reply`
- `evt.server.error`
- `evt.device.status`

#### `src/core/protocol_handlers/transfer.py`

传输会话类消息处理。

当前行为：

- `xfer.ota.handshake`
  - 允许硬件端上行
  - 可转发给桌面端观察
- `xfer.ota.checksum`
  - 当前按服务端下行消息处理
  - 客户端上行会被拒绝

#### `src/core/protocol_handlers/binary.py`

二进制帧处理。

当前行为：

- `audio`
  - 限制发送方为 `hardware`
  - 本地进入音频会话处理
- `video`
  - `hardware -> desktop` 转发
- `image`
  - `hardware -> desktop` 转发
- `ota`
  - 当前客户端上行不允许

### 5.4 音频会话层

#### `src/core/audio_session_handler.py`

音频链路的核心编排器。

职责：

- `feed_audio()`
  - 从 `RuntimeServices` 获取本次会话使用的 ASR 实例
  - 启动流式 ASR
  - 按帧喂音频
  - 刷新超时
- `end_session()`
  - 结束 ASR
  - 发送 `evt.asr.result`
  - 调用 `RuntimeServices.chat()`
  - 发送 `evt.ai.status`
  - 发送 `evt.ai.thinking`
  - 发送 `evt.ai.reply`
  - 若语音链路出错，广播 `evt.server.error` 给桌面端
  - 从 `RuntimeServices` 获取本次会话使用的 TTS 实例
  - 下行发送二进制音频帧
  - 重置 ASR

这里是语音交互业务的主编排层，不负责协议解析，只负责业务流程。

重要约束：

- 会话开始后，会固定本次使用的 ASR / TTS 实例
- 配置热更新只影响“后续新会话”，不强行切换当前会话

### 5.5 消息发送层

#### `src/utils/message_handler.py`

统一消息发送器。

职责：

- 发送文本帧
- 发送二进制帧
- 封装常用服务端消息：
  - `send_asr_result()`
  - `send_ai_status()`
  - `send_ai_thinking()`
  - `send_ai_reply()`
  - `send_server_error()`
  - `send_ack()`
  - `send_nack()`
  - `send_audio_frame()`

如果新增“服务端主动发出的消息”，通常会先在这里补一个发送方法。

#### `src/core/ai_status_controller.py`

统一的 AI 状态控制器。

职责：

- 统一校验 `evt.ai.status`
- 统一从 `config/ai_status_map.json` 补默认图片/动作/音效资源
- 统一拼装状态 payload
- 统一执行“发给当前硬件连接”或“广播给所有硬件端”

当前对话工作流、定时任务和桌面端上位机状态转发，都应优先经过这层，而不是各自手工拼装 `evt.ai.status.data`。

---

## 6. Provider 层

### 6.1 ASR

目录：

- `src/modules/asr/`

当前主用 provider：

- `AliyunASR`

当前注意点：

- 已去掉固定 150ms 发送节流，避免上游音频帧积压
- `stream_stop()` 已调整为先 stop 再等结果
- 即使阿里云最终 completed 没回来，也会尽量保留中间识别文本

### 6.2 AI / OpenClaw

目录：

- `src/modules/openclaw/`
- `src/modules/llm/`

当前已不再走“自动 fallback”。

现在通过 `config/dialogue.json` 和 `cfg.dialogue.*` 明确选择对话模式：

- `provider = openclaw`
- `provider = llm`
- 当 `provider = openclaw` 时，桌面端只切 `providers.openclaw.basic.backend`
- OpenClaw 的 Agent、命令行环境和内部参数不通过桌面端配置

当前相关实现：

- `LocalOpenClawProvider`
- `TmuxOpenClawProvider`
- `OpenClawMediaBridge`
- `DialogueManager`

视觉相关补充：

- 当前图片问答主路径不再依赖 Gateway `/v1/responses` 直接吃图片 bytes
- Watcher 会先把最近图片落盘到 `~/.openclaw/workspace/.watcher_media/images/`
- 媒体桥接目录放在用户目录下，而不是项目目录下，这样后续打包成可执行文件后仍然可写
- 再通过 `openclaw agent` 的 CLI 路径，把本地图片路径拼进 prompt 交给 OpenClaw 自己读取
- 单次图片问答结束后会立即删除本次桥接生成的图片文件
- `OPENCLAW_MEDIA_RETENTION_SECONDS` 只作为异常中断时的孤儿文件兜底清理
- 视频桥接层已经预留，但当前明确未实现；后续再接关键帧/摘要方案

本轮已实测通过的结论：

- `openclaw agent` 可以正确分析放在 OpenClaw workspace 内的图片文件
- `LocalOpenClawProvider` 通过 `OpenClawMediaBridge` + `openclaw agent` 也已实测返回图片描述
- 图片桥接临时文件会在单次问答结束后被删除
- 旧逻辑遗留的历史文件如果仍在目录中，不代表新逻辑没有清理；新逻辑只负责清理本轮生成的临时文件，保留期负责兜底清理旧残留

当前 AI 状态和思考过程，来源如下：

- OpenClaw 模式：
  - provider 回调进入 `AudioSessionHandler`
  - 再转成 `evt.ai.status / evt.ai.thinking`
- LLM 模式：
  - 当前主要返回 `evt.ai.status` 和最终 `evt.ai.reply`
  - 还没有完整的多轮对话上下文管理

### 6.3 TTS

目录：

- `src/modules/tts/`

当前主用 provider：

- `HuoshanTTS`

当前注意点：

- TTS WebSocket 连接已改为优先复用
- `synthesize_stream()` 每句合成完成后就立刻下发
- 最后一段音频通过二进制帧 `LAST` 标记结束

### 6.4 服务发现

目录：

- `src/modules/discovery/discovery_server.py`

这是 WebSocket 之外的 UDP 发现能力。
它不是当前协议主线的一部分，但仍然是项目功能的一部分。

---

## 7. 当前协议实现状态

### 7.1 已接通

- `sys.client.hello`
- `sys.ack`
- `sys.nack`
- `sys.ping`
- `sys.pong`
- `ctrl.servo.angle`
- `cfg.asr.get / report / update`
- `cfg.tts.get / report / update`
- `cfg.llm.get / report / update`
- `cfg.dialogue.get / report / update`
- `cfg.scheduler.get / report / update`
- `evt.asr.result`
- `evt.ai.status`
- `evt.ai.thinking`
- `evt.ai.reply`
- `evt.server.error`
  - 当前由服务端产生并广播给桌面端
- `evt.servo.position`
- `evt.ota.progress`
- `evt.device.error`
- `evt.device.firmware`
- `evt.device.status`
- `xfer.ota.handshake`
- 二进制 `audio`
- 二进制 `video`
- 二进制 `image`

### 7.2 已注册但未完成业务实现

- `sys.session.resume`
- `ctrl.camera.*`
- `xfer.ota.*` 的完整业务闭环

### 7.3 当前按协议拒绝的客户端消息

- `ctrl.camera.video_config`
- `ctrl.camera.capture_image`
- `ctrl.camera.start_video`
- `ctrl.camera.stop_video`
- `xfer.ota.checksum`
- 二进制 `ota`
- 客户端伪造的：
  - `evt.asr.result`
  - `evt.ai.status`
  - `evt.ai.thinking`
  - `evt.ai.reply`
  - `evt.server.error`

### 7.4 本地 HTTP 管理接口

这部分不是硬件通信协议，而是服务端额外开放的本地管理接口。

当前已接通：

- `GET /api/admin/health`
- `GET /api/admin/scheduled-tts`
- `PUT /api/admin/scheduled-tts`
- `POST /api/admin/scheduled-tts/trigger`

当前用途：

- 读取和保存固定名字的 `scheduled_tts_push` 管理任务
- 立即测试一段 TTS 播报
- 在硬件语音会话忙碌时等待空闲后再播报

---

## 8. 当前最重要的设计约束

1. 不要再向新代码里引入旧协议 `"over"` 或裸文本结束标记
2. 不要再使用旧消息名：
   - `asr_result`
   - `bot_reply`
   - `status`
   - `openclaw_log`
   - `error`
   - `tts_end`
3. 新文本消息统一走：

```json
{
  "type": "...",
  "code": 0,
  "data": {}
}
```

4. 新二进制消息统一走 `WSPK` 帧头
5. 硬件端 `sys.client.hello` 必须带 `fw_version`
6. `protocol_router.py` 只做注册，不做业务
7. 真正的转发逻辑优先写在 `src/core/protocol_handlers/`

---

## 9. 后续扩展时应该怎么改

如果后续业务新增一个协议消息，推荐按这个顺序改：

1. 先更新 `docs/device_communication_protocol.md`
2. 在 `src/models/protocol.py` 新增 `TextMessageType` 或 `BinaryFrameType`
3. 在 `src/core/protocol_handlers/` 对应分类文件里实现 handler
4. 在 `src/core/protocol_router.py` 注册 handler
5. 如果是服务端主动发送的消息，在 `src/utils/message_handler.py` 增加发送方法
6. 如果需要跨角色转发，优先复用 `WebSocketServer.broadcast_text_message()` 或 `broadcast_binary_frame()`
7. 更新 `test_client.html`
8. 补充或更新测试

判断应该改哪一层时，可以用这个原则：

- 协议定义变化：改 `src/models/protocol.py`
- “这类消息应该交给谁”：改 `src/core/protocol_router.py`
- “消息具体怎么处理”：改 `src/core/protocol_handlers/*`
- 音频会话业务流程：改 `src/core/audio_session_handler.py`
- 服务端主动发送格式：改 `src/utils/message_handler.py`

---

## 10. 当前测试与调试入口

### 10.1 测试页

- `test_client.html`

当前测试页支持：

- 选择 `hardware` / `desktop`
- 发送 `sys.client.hello`
- 输入硬件 `fw_version`
- 自动接收 `evt.device.status`
- 自动拉取 `ASR / TTS / LLM / Dialogue` 配置
- 发送任意文本帧模板
- 录音并按统一二进制音频帧上传
- 播放下行二进制音频
- 观察协议流量
- 观察配置报告与设备状态
- 预览图片流
- desktop 模式下通过 HTTP 管理接口读取/保存/立即测试定时 TTS

联调建议：

- 标签页 A：`hardware`
- 标签页 B：`desktop`

这样可以直接验证转发链路。

### 10.2 协议测试

- `tests/test_protocol_dispatcher.py`

当前只覆盖最小协议编解码和分发 smoke test，不覆盖端到端业务。

---

## 11. 当前配置文件结构

当前 `config/asr.json`、`config/tts.json`、`config/llm.json`、`config/dialogue.json` 已经统一成适合桌面端直接展示的结构：

- 顶层 `provider`：当前选中的提供商
- `common.basic`：普通用户常改的通用配置
- `common.advanced`：高级通用配置
- `providers.<name>.basic`：当前提供商的基础配置
- `providers.<name>.advanced`：当前提供商的高级配置
- `providers.<name>.label`：桌面端可直接显示的名称

运行时代码会把 `basic/advanced` 合并成模块内部使用的扁平参数，因为：

- `src/modules/asr/config.py`
- `src/modules/tts/config.py`
- `src/modules/llm/config.py`
- `src/core/runtime_services.py` 内的 `DialogueManager`

都会自动把 `basic/advanced` 合并成模块内部继续使用的扁平配置。

这意味着：

- 配置文件可以直接返回给桌面端渲染
- `Factory.create_from_file()` 直接读取当前分组结构即可
- 以后如果继续加字段，优先先判断应该放 `basic` 还是 `advanced`
- `cfg.dialogue.report.runtime` 还会额外返回 OpenClaw 可用实现列表与当前解析后的实现名，供桌面端做实现切换器
- `cfg.dialogue.report.runtime.openclaw_runtime` 还会返回当前 agent / model / inputs / supported_media_kinds

---

## 12. 当前 AI 最容易踩坑的点

1. `AI_CONTEXT.md` 旧版本曾经写的是旧协议，当前版本才是最新的
2. 如果看到旧协议关键词如 `"over"`、`asr_result`、`bot_reply`，说明拿到的是历史上下文，不是当前主线
3. `src/utils/message_receiver.py` 基本已经不在当前主路径上
4. `protocol_router.py` 只是路由表，不是转发器本体
5. 硬件端 `hello` 不带 `fw_version` 会被拒绝
6. 看到某个消息“已经注册”，不代表业务已经实现完成
7. 配置类消息现在已经接通，不要再按“骨架未实现”理解
8. OTA 的连接阶段信息和传输阶段信息不是一回事：
   - 连接阶段：`sys.client.hello`
   - 传输阶段：`xfer.ota.handshake`

---

## 13. 一句话总结

当前项目已经从旧 WebSocket 语音服务，迁移成了“统一协议层 + 双客户端角色 + 音频会话编排 + 可扩展消息路由”的结构。

现在最核心的主线文件是：

- `src/core/websocket_server.py`
- `src/core/runtime_services.py`
- `src/core/device_registry.py`
- `src/core/message_dispatcher.py`
- `src/core/protocol_router.py`
- `src/core/protocol_handlers/*`
- `src/core/audio_session_handler.py`
- `src/models/protocol.py`
- `src/utils/message_handler.py`
- `docs/device_communication_protocol.md`

如果未来 AI 需要快速理解项目，优先按上面这些文件读，不要先从旧协议文档读起。
