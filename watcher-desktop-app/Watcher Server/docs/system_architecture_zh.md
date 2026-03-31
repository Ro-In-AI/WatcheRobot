# Watcher Server 系统设计图谱（中文）

本文档基于以下文档与源码整理：

- `docs/device_communication_protocol.md`
- `docs/AI_CONTEXT.md`
- `docs/ESP32_SERVICE_DISCOVERY.md`
- `src/core/websocket_server.py`
- `src/core/audio_session_handler.py`
- `src/core/runtime_services.py`
- `src/core/protocol_router.py`
- `src/core/protocol_handlers/*`
- `src/core/session_media.py`
- `src/utils/message_handler.py`

目标：

- 画出系统的用户主时序图
- 画出模块关系图
- 画出整体大架构图
- 画出大架构下的小模块拆解图
- 画出数据流设计图

## 1. 用户主时序图

这个时序图覆盖了“设备发现 -> 建连 -> 用户说话 -> ASR -> AI -> TTS -> 回放”的主链路，并补上了桌面端的状态观察路径。

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#fffaf4",
    "primaryColor": "#f3dcc6",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#c97b63",
    "lineColor": "#4b5563",
    "secondaryColor": "#dceef2",
    "tertiaryColor": "#f8efe4",
    "actorBkg": "#d7ecef",
    "actorBorder": "#2f6f75",
    "actorTextColor": "#12343b",
    "signalColor": "#1f2937",
    "signalTextColor": "#1f2937",
    "labelBoxBkgColor": "#ffffff",
    "labelBoxBorderColor": "#c97b63",
    "labelTextColor": "#1f2937",
    "loopTextColor": "#1f2937",
    "noteBkgColor": "#fff3c4",
    "noteBorderColor": "#d9a441",
    "noteTextColor": "#4b3b1f",
    "fontFamily": "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  },
  "sequence": {
    "showSequenceNumbers": true,
    "mirrorActors": false
  }
}}%%
sequenceDiagram
    autonumber
    actor EndUser as 用户
    participant HW as 硬件端客户端
    participant UDP as UDP服务发现
    participant WS as WebSocketServer
    participant DISP as 消息分发与协议路由
    participant SESSION as 音频会话编排器
    participant RUNTIME as RuntimeServices
    participant ASR as ASR Provider
    participant DIALOGUE as DialogueManager
    participant TTS as TTS Provider
    participant DESKTOP as 桌面端客户端

    rect rgb(248, 239, 228)
        EndUser ->> HW: 发起语音交互
        HW ->> UDP: DISCOVER
        UDP -->> HW: ANNOUNCE(ip, ws端口)
        HW ->> WS: 建立 WebSocket 连接
        HW ->> WS: sys.client.hello(role=hardware, fw_version)
        WS -->> HW: sys.ack
        WS -->> DESKTOP: evt.device.status
        DESKTOP ->> WS: sys.client.hello(role=desktop)
        WS -->> DESKTOP: sys.ack
        WS -->> DESKTOP: evt.device.status
    end

    rect rgb(220, 238, 242)
        loop 用户说话期间
            HW ->> WS: binary.audio(WSPK统一帧)
            WS ->> DISP: MessageDispatcher.dispatch()
            DISP ->> SESSION: binary.handle_audio_frame()
            SESSION ->> RUNTIME: ensure_asr_provider()
            RUNTIME ->> ASR: stream_start / stream_feed
            ASR -->> SESSION: 流式识别中间状态
        end
    end

    rect rgb(243, 220, 198)
        HW ->> WS: binary.audio(LAST)
        WS ->> DISP: 解析末帧
        DISP ->> SESSION: end_session()
        SESSION ->> ASR: stream_stop()
        ASR -->> SESSION: recognized_text
        SESSION -->> HW: evt.asr.result
        SESSION ->> RUNTIME: chat(text, media)
        RUNTIME ->> DIALOGUE: OpenClaw 或 LLM
        DIALOGUE -->> SESSION: 状态、思考过程、最终回复
        SESSION -->> HW: evt.ai.status
        SESSION -->> HW: evt.ai.thinking
        SESSION -->> HW: evt.ai.reply
        alt 语音链路异常
            SESSION -->> DESKTOP: evt.server.error
        else 正常生成回复
            SESSION ->> RUNTIME: ensure_tts_provider()
            RUNTIME ->> TTS: synthesize_stream()
            loop 分段语音回放
                TTS -->> SESSION: 音频片段
                SESSION -->> HW: binary.audio(FIRST...LAST)
            end
        end
    end

    Note over DESKTOP,WS: 桌面端主要负责配置读取、热更新、状态观测和硬件控制
```

## 2. 模块之间的关系

这个图强调的是“谁依赖谁、谁调谁、谁负责转发”。

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#fffaf4",
    "primaryColor": "#f7e4ce",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#b86f52",
    "secondaryColor": "#d9eef1",
    "tertiaryColor": "#eef5f6",
    "lineColor": "#4b5563",
    "fontFamily": "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  },
  "flowchart": {
    "curve": "basis",
    "htmlLabels": true
  }
}}%%
flowchart LR
    USER["用户"]

    subgraph CLIENTS["客户端角色"]
        HW["硬件端客户端"]
        DESKTOP["桌面端客户端"]
    end

    subgraph ENTRY["接入层"]
        MAIN["WatcherServer<br/>src/main.py"]
        WS["WebSocketServer<br/>连接管理 / 广播 / 会话容器"]
        REG["DeviceRegistry<br/>设备在线状态与固件快照"]
        DISC["UDP 服务发现"]
    end

    subgraph PROTOCOL["协议层"]
        DISP["MessageDispatcher<br/>文本与二进制解析分发"]
        ROUTER["protocol_router<br/>消息类型注册表"]
        SYS["system handler"]
        CTRL["control handler"]
        CFG["config handler"]
        EVT["event handler"]
        XFER["transfer handler"]
        BIN["binary handler"]
    end

    subgraph BIZ["业务编排层"]
        SESSION["AudioSessionHandler<br/>ASR -> AI -> TTS 编排"]
        MEDIA["SessionMediaStore<br/>图片/视频重组与缓存"]
        SENDER["MessageHandler<br/>统一文本/二进制发送"]
    end

    subgraph RUNTIME["运行时与配置中心"]
        RS["RuntimeServices"]
        DLG["DialogueManager"]
        STORE["JsonConfigStore"]
        JSONCFG["config/*.json"]
    end

    subgraph PLUGINS["插件能力层"]
        ASR["ASR Manager / Provider"]
        TTS["TTS Manager / Provider"]
        LLM["LLM Manager / Provider"]
        OC["OpenClaw Provider"]
    end

    USER --> HW
    HW --> DISC
    DISC --> HW
    MAIN --> RS
    MAIN --> WS
    HW --> WS
    DESKTOP --> WS
    WS --> REG
    WS --> SESSION
    WS --> DISP
    DISP --> ROUTER
    ROUTER --> SYS
    ROUTER --> CTRL
    ROUTER --> CFG
    ROUTER --> EVT
    ROUTER --> XFER
    ROUTER --> BIN
    BIN --> SESSION
    SYS --> REG
    SYS --> RS
    CTRL --> WS
    EVT --> WS
    XFER --> WS
    CFG --> RS
    SESSION --> MEDIA
    SESSION --> SENDER
    SESSION --> RS
    RS --> STORE
    STORE --> JSONCFG
    RS --> DLG
    RS --> ASR
    RS --> TTS
    DLG --> LLM
    DLG --> OC
```

## 3. 整个大架构设计

这个图更接近“总览图”，按层把系统拆成用户终端、接入网关、协议编排、业务编排、运行时中心和插件能力。

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#fffaf4",
    "primaryColor": "#f4dac8",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#be6d55",
    "secondaryColor": "#d7ecef",
    "tertiaryColor": "#f2f6f7",
    "lineColor": "#4b5563",
    "fontFamily": "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  },
  "flowchart": {
    "curve": "linear",
    "htmlLabels": true
  }
}}%%
flowchart TB
    subgraph L0["第 0 层：用户与终端"]
        USER0["用户"]
        HARD0["硬件端客户端<br/>音频 / 视频 / 图片 / 舵机 / OTA"]
        DESK0["桌面端客户端<br/>配置界面 / 监控界面 / 控制面板 / HTTP 测试"]
    end

    subgraph L1["第 1 层：接入网关层"]
        UDP0["DiscoveryServer<br/>局域网 UDP 发现"]
        WS0["WebSocketServer<br/>连接管理 / 角色识别 / 广播 / 生命周期"]
        HTTP0["HTTPManagementServer<br/>本地 HTTP 管理接口"]
    end

    subgraph L2["第 2 层：协议编排层"]
        MODEL0["TextMessage / BinaryFrame<br/>统一协议模型"]
        DISP0["MessageDispatcher"]
        CTX0["ProtocolHandlerContext"]
        ROUTE0["protocol_router + protocol_handlers"]
    end

    subgraph L3["第 3 层：业务编排层"]
        AUDIO0["AudioSessionHandler<br/>语音会话主编排"]
        MEDIA0["SessionMediaStore<br/>最近媒体缓存"]
        DEVICE0["DeviceRegistry<br/>设备状态注册"]
        SEND0["MessageHandler<br/>统一消息发送"]
    end

    subgraph L4["第 4 层：运行时与配置中心"]
        RS0["RuntimeServices"]
        SCH0["SchedulerService<br/>interval / scheduled / TTS push"]
        DLG0["DialogueManager<br/>openclaw / llm 模式切换"]
        STORE0["JsonConfigStore"]
        CFG0["config/asr.json<br/>config/tts.json<br/>config/llm.json<br/>config/dialogue.json<br/>config/scheduler.json"]
    end

    subgraph L5["第 5 层：能力插件层"]
        ASR0["ASR 插件体系"]
        TTS0["TTS 插件体系"]
        LLM0["LLM 插件体系"]
        OC0["OpenClaw 插件体系"]
    end

    subgraph L6["第 6 层：外部能力与执行环境"]
        VENDOR0["阿里云 / Deepgram / 火山引擎 / Ark"]
        AGENT0["Local / Tmux OpenClaw Agent"]
    end

    USER0 --> HARD0
    USER0 --> DESK0
    HARD0 --> UDP0
    HARD0 --> WS0
    DESK0 --> WS0
    DESK0 --> HTTP0
    UDP0 --> WS0
    HTTP0 --> SCH0
    WS0 --> MODEL0
    WS0 --> DISP0
    WS0 --> SCH0
    DISP0 --> CTX0
    DISP0 --> ROUTE0
    ROUTE0 --> AUDIO0
    ROUTE0 --> DEVICE0
    ROUTE0 --> SEND0
    AUDIO0 --> MEDIA0
    AUDIO0 --> RS0
    DEVICE0 --> WS0
    SEND0 --> WS0
    SCH0 --> WS0
    SCH0 --> RS0
    SCH0 --> STORE0
    RS0 --> STORE0
    STORE0 --> CFG0
    RS0 --> DLG0
    RS0 --> ASR0
    RS0 --> TTS0
    DLG0 --> LLM0
    DLG0 --> OC0
    ASR0 --> VENDOR0
    TTS0 --> VENDOR0
    LLM0 --> VENDOR0
    OC0 --> AGENT0
```

## 4. 大架构下每个小模块的设计

这个图把服务端内部拆得更细，适合拿来讲代码结构和职责边界。

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#fffaf4",
    "primaryColor": "#f8e7d5",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#bf7256",
    "secondaryColor": "#dcedf0",
    "tertiaryColor": "#f5f1eb",
    "lineColor": "#4b5563",
    "fontFamily": "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  },
  "flowchart": {
    "curve": "stepBefore",
    "htmlLabels": true
  }
}}%%
flowchart TB
    subgraph SERVER["Watcher Server 内部小模块设计"]
        subgraph CONN["A. 连接与会话容器"]
            WS1["WebSocketServer<br/>- connected_clients<br/>- client_roles<br/>- client_last_seen<br/>- client_metadata<br/>- client_sessions"]
            REG1["DeviceRegistry<br/>- 在线硬件清单<br/>- fw/hw/board/mac 快照"]
        end

        subgraph PRT["B. 协议处理子系统"]
            DISP1["MessageDispatcher<br/>解析 str / bytes"]
            ROUTER1["Protocol Router<br/>建立 消息类型 -> handler 映射"]
            SYS1["system.py<br/>角色声明 / 心跳 / ACK / NACK"]
            CTRL1["control.py<br/>桌面到硬件控制转发"]
            CFG1["config.py<br/>配置读取 / 校验 / 热更新"]
            EVT1["event.py<br/>硬件事件转发 / 状态同步"]
            XFER1["transfer.py<br/>OTA 握手与传输会话"]
            BIN1["binary.py<br/>音频 / 视频 / 图片 / OTA"]
        end

        subgraph SES["C. 音频会话子系统"]
            AUDIO1["AudioSessionHandler<br/>- ASR 流状态<br/>- 超时定时器<br/>- 会话级 AI key<br/>- 端到端语音编排"]
            MEDIA1["SessionMediaStore<br/>- 图片/视频分片重组<br/>- 最近媒体缓存<br/>- AI 多模态上下文注入"]
            SEND1["MessageHandler<br/>- 文本帧发送<br/>- 二进制音频发送<br/>- ACK / NACK 封装"]
        end

        subgraph RUN1["D. 运行时子系统"]
            HTTP1["HTTPManagementServer<br/>- aiohttp routes<br/>- CORS<br/>- 本地管理接口"]
            SCH1["SchedulerService<br/>- interval / scheduled 任务宿主<br/>- 定时 TTS / 立即测试播报"]
            RS1["RuntimeServices<br/>- initialize<br/>- ensure_*_provider<br/>- get_*_report<br/>- update_*_config"]
            DLG1["DialogueManager<br/>- openclaw / llm 切换<br/>- runtime 状态暴露<br/>- 回调桥接"]
            STORE1["JsonConfigStore<br/>原子读写 JSON 配置"]
        end

        subgraph PLG1["E. 插件与提供商"]
            ASR1["ASRFactory / ASRManager"]
            TTS1["TTSFactory / TTSManager"]
            LLM1["LLMFactory / LLMManager"]
            OC1["OpenClawFactory / ProviderRegistry"]
        end
    end

    WS1 --> REG1
    WS1 --> DISP1
    DISP1 --> ROUTER1
    ROUTER1 --> SYS1
    ROUTER1 --> CTRL1
    ROUTER1 --> CFG1
    ROUTER1 --> EVT1
    ROUTER1 --> XFER1
    ROUTER1 --> BIN1
    BIN1 --> AUDIO1
    SYS1 --> RS1
    SYS1 --> REG1
    CTRL1 --> WS1
    EVT1 --> WS1
    EVT1 --> REG1
    XFER1 --> WS1
    CFG1 --> RS1
    CFG1 --> SCH1
    AUDIO1 --> MEDIA1
    AUDIO1 --> SEND1
    AUDIO1 --> RS1
    HTTP1 --> SCH1
    SCH1 --> WS1
    SCH1 --> RS1
    SCH1 --> STORE1
    RS1 --> DLG1
    RS1 --> STORE1
    RS1 --> ASR1
    RS1 --> TTS1
    DLG1 --> LLM1
    DLG1 --> OC1
```

### 小模块职责摘要

- `WebSocketServer`：负责连接生命周期、连接角色、会话对象、广播能力和发现服务挂载。
- `HTTPManagementServer`：负责本地 HTTP 管理接口、CORS 兼容，以及为桌面端测试页提供定时 TTS 管理入口。
- `MessageDispatcher + protocol_router`：负责把文本帧/二进制帧分发到正确 handler，不直接承载业务逻辑。
- `protocol_handlers/*`：负责协议准入、角色校验、本地处理、跨角色转发和拒绝策略。
- `AudioSessionHandler`：负责语音主链路编排，串起 `ASR -> AI -> TTS`，并在异常时把 `evt.server.error` 广播给桌面端。
- `SessionMediaStore`：负责缓存最近图片/视频，为 OpenClaw 多模态问答提供上下文。
- `SchedulerService`：负责托管间隔任务和定时任务，并复用统一的 TTS 下发链路给 scheduler 与 HTTP 立即测试接口。
- `RuntimeServices`：负责配置中心、运行时热更新、Provider 初始化和对话模式切换。
- `Factory / Manager / Provider`：负责插件化扩展，不同 ASR/TTS/LLM/OpenClaw 实现都通过统一入口接入。

## 5. 数据流设计

这个图重点强调系统里真正存在的 4 类主数据流：语音主链路、配置链路、状态/控制链路、媒体上下文链路。

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#fffaf4",
    "primaryColor": "#f5e0cf",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#bd6e55",
    "secondaryColor": "#dbedf0",
    "tertiaryColor": "#f7f3ed",
    "lineColor": "#4b5563",
    "fontFamily": "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
  },
  "flowchart": {
    "curve": "basis",
    "htmlLabels": true
  }
}}%%
flowchart TB
    subgraph FLOW_A["数据流 A：语音主链路"]
        A1["硬件端 binary.audio"] --> A2["binary handler"]
        A2 --> A3["AudioSessionHandler.feed_audio / end_session"]
        A3 --> A4["ASR.stream_feed / stream_stop"]
        A4 --> A5["evt.asr.result"]
        A5 --> A6["RuntimeServices.chat"]
        A6 --> A7["DialogueManager / OpenClaw / LLM"]
        A7 --> A8["evt.ai.status / evt.ai.thinking / evt.ai.reply"]
        A8 --> A9["TTS.synthesize_stream"]
        A9 --> A10["下行 binary.audio"]
    end

    subgraph FLOW_B["数据流 B：配置中心链路"]
        B1["桌面端 cfg.*.get / cfg.*.update"] --> B2["config handler"]
        B2 --> B3["RuntimeServices"]
        B3 --> B4["JsonConfigStore"]
        B4 --> B5["config/*.json"]
        B3 --> B6["ASR / TTS / LLM / Dialogue 热切换"]
        B6 --> B7["cfg.*.report 广播到桌面端"]
    end

    subgraph FLOW_C["数据流 C：状态与控制链路"]
        C1["桌面端 ctrl.servo.angle"] --> C2["control handler"]
        C2 --> C3["广播到硬件端"]
        C4["硬件端 evt.* / xfer.ota.handshake"] --> C5["event / transfer handler"]
        C5 --> C6["广播到桌面端"]
        C7["硬件端 evt.device.firmware"] --> C8["DeviceRegistry 更新"]
        C8 --> C9["evt.device.status 广播"]
    end

    subgraph FLOW_D["数据流 D：媒体上下文链路"]
        D1["硬件端 binary.video / binary.image"] --> D2["binary handler"]
        D2 --> D3["SessionMediaStore 重组与缓存"]
        D3 --> D4["AudioSessionHandler 调用 RuntimeServices.chat(media=...)"]
        D4 --> D5["OpenClaw Provider 多模态输入"]
    end

    subgraph FLOW_E["数据流 E：本地 HTTP 管理链路"]
        E1["desktop test_client.html"] --> E2["HTTPManagementServer"]
        E2 --> E3["SchedulerService"]
        E3 --> E4["config/scheduler.json"]
        E3 --> E5["TTS.synthesize_stream"]
        E5 --> E6["下行 binary.audio -> hardware"]
    end
```

## 6. 设计结论

### 6.1 这个系统本质上是什么

`watcher-server` 本质上不是单纯的 WebSocket 透传服务，而是一个：

- 统一协议网关
- 双客户端角色编排中心
- 语音会话主流程编排器
- 配置中心与运行时热更新中心
- 可插件化扩展的 AI 能力接入层

### 6.2 当前最核心的 5 条主线

1. `hardware` 与 `desktop` 通过 `sys.client.hello` 进入双角色模型。
2. 所有文本与二进制数据都先进入统一协议层，再路由到 handler。
3. 语音主链路由 `AudioSessionHandler` 串起 `ASR -> AI -> TTS`。
4. 配置更新由 `RuntimeServices` 负责落盘、校验、热切换和广播。
5. 图片/视频不是独立业务闭环，而是会作为最近媒体上下文注入 AI 会话。
6. 定时 TTS 管理同时支持 WebSocket 配置链路和本地 HTTP 管理链路，但两者最终都汇总到 `SchedulerService`。

### 6.3 当前明确已接通与未完成的边界

- 已接通：`sys.client.hello`、配置读写、舵机控制转发、设备状态同步、音频会话主链路、视频/图片转发、媒体上下文注入。
- 已注册但未完成：`sys.session.resume`、`ctrl.camera.*`、完整 OTA 传输闭环。
- 明确拒绝客户端伪造：`evt.asr.result`、`evt.ai.*`、`evt.server.error`、上行 `binary.ota`。
