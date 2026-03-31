# Watcher 通信协议规范

> 状态: Draft
> 版本: 0.1.5
> 最后更新: 2026-03-23

## 当前协议支持能力概览

当前协议支持以下能力：

1. 连接发现与版本识别
   UDP discovery 可返回服务端 `ip`、`port`、程序版本、`protocol_version`，客户端可在 WebSocket 建连前完成发现与协议版本检查。
2. 双客户端角色接入
   支持 `hardware` 与 `desktop` 两种客户端角色，连接后通过 `sys.client.hello` 声明身份；硬件端需同时上报 `fw_version`。
3. 文本帧控制与事件通信
   支持统一 JSON 文本帧 `type / code / data`，用于控制、事件、配置读取、配置更新、心跳、ACK/NACK。
4. 二进制音频、视频、图片、OTA 传输
   支持统一二进制帧头，承载 `audio / video / image / ota` 四类二进制负载；接收端通过 `frame_type / flags / seq / payload_len` 解析。
5. 语音对话主链路
   支持硬件端上行音频、服务端下发 ASR 结果、AI 状态、AI 思考过程、AI 最终回复，以及服务端下行 TTS 音频。
6. 图片视觉上下文接入
   支持硬件端上行图片，服务端缓存最近完整图片并在当前对话引擎支持图片能力时作为 AI 上下文使用；当前不支持图片级唯一业务标识。
7. 桌面端配置中心与热更新
   支持桌面端读取与更新 `ASR / TTS / LLM / Dialogue / Scheduler` 配置；更新写回服务端 JSON 配置文件，并对运行时实例或定时任务模块进行热切换。
8. 语音流程中的热更新保护
   当硬件正在执行 `ASR / AI / TTS` 流程时，服务端可拒绝影响运行时实例的 `cfg.*.update`，并通过 `sys.nack` 返回错误原因与阻塞阶段。
9. 舵机遥控与数字孪生同步
   支持桌面端通过 `ctrl.servo.angle` 遥控硬件舵机；支持硬件端通过 `evt.servo.position` 实时上报当前位置供桌面端同步显示。
10. 媒体转发与摄像头控制骨架
    当前已接通硬件端上行图片、视频并转发给桌面端显示；`ctrl.camera.*` 仅完成协议注册，当前实现仍按保留能力处理，服务端不会在正式流程中下发。
11. OTA 握手与保留传输骨架
    当前已接通 `xfer.ota.handshake` 观察链路与 `evt.ota.progress` 上报；`xfer.ota.checksum` 与 OTA 二进制传输仍属于预留能力，尚未形成完整闭环。
12. 上位机 AI 状态转发
    支持 `desktop -> server -> hardware` 转发 `evt.ai.status`；状态枚举、状态归属范围以及默认图片/动作/音效资源由 `config/ai_status_map.json` 统一维护，当前默认映射包含 `thinking / processing / listening / speaking / completed / error / standby / observing`，其中前六个属于 `dialogue_flow`，后两个属于 `ambient_flow`，消息本身可通过 `image_name / action_file / sound_file` 告知硬件当前状态对应的资源文件名称。
13. 在线状态与错误上报
    支持服务端向桌面端下发 `evt.device.status`、硬件向桌面端上报 `evt.device.error / evt.device.firmware`，以及服务端向桌面端下发 `evt.server.error`。
14. 定时任务与空闲态状态推送
    支持独立定时任务模块；当前内置任务会在系统不处于语音对话忙碌态时，先按随机触发概率决定是否触发，再由当前 `OpenClaw / LLM` 对话引擎只选择一个 `ambient_flow` 范围内的非对话流状态，最后由系统按与对话工作流一致的 `evt.ai.status` 最小格式向硬件端发送。

当前协议不支持以下能力：

- 不支持图片级唯一标识，例如 `image_id / media_id / asset_id`
- 二进制图片帧本身不携带唯一图片业务 ID
- 不支持同一连接内同一 `frame_type` 的多路并发流

## 0. 协议版本

当前协议版本号：

```text
0.1.5
```

说明：

- 当前版本号对应当前消息分发器与通信协议规范
- 文本帧本身不携带 `protocol_version`
- UDP discovery 响应会额外返回 `protocol_version`

## 1. UDP Discovery

UDP discovery 用于客户端在正式建立 WebSocket 连接前，先发现服务端地址和当前协议版本。

约束：

- UDP discovery 发生在 WebSocket 正式通信之前
- UDP discovery 只负责发现服务端入口，不承载正式业务消息
- 客户端拿到 discovery 响应后，仍然必须继续建立 WebSocket 连接并发送 `sys.client.hello`

### 1.1 Discovery 请求

客户端通过 UDP 发送 JSON：

```json
{
  "cmd": "DISCOVER",
  "device_id": "esp32-001",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `cmd` | string | 是 | 固定为 `DISCOVER` |
| `device_id` | string | 否 | 客户端设备 ID |
| `mac` | string | 否 | 客户端设备 MAC |

### 1.2 Discovery 响应

服务端返回 JSON：

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

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `cmd` | string | 是 | 固定为 `ANNOUNCE` |
| `ip` | string | 是 | 服务端局域网 IP |
| `port` | int | 是 | WebSocket 端口 |
| `version` | string | 是 | 服务端程序版本 |
| `protocol_version` | string | 是 | 当前通信协议版本 |
| `server` | string | 是 | 服务名称 |

约束：

- `port` 表示正式 WebSocket 协议入口端口，不是 UDP 端口
- `protocol_version` 用于客户端判断当前消息分发器与通信协议规范是否匹配
- UDP discovery 不替代正式协议中的 `sys.client.hello`

## 2. 连接角色

系统包含 3 个角色：

| 角色 | 说明 |
|---|---|
| 服务端 | 协议中心、消息转发中心、配置中心 |
| 硬件端客户端 | 负责音频、摄像头、舵机、OTA |
| 桌面应用端客户端 | 负责配置展示、配置更新、硬件控制、数值孪生同步 |

## 3. 帧类型

协议只区分两种帧：

| 帧类型 | 载荷 | 用途 |
|---|---|---|
| 文本帧 | JSON | 控制、事件、配置、传输会话、系统治理 |
| 二进制帧 | bytes | 音频、视频、图片、OTA 数据包 |

约束：

- 客户端建立连接后，应首先发送 `sys.client.hello`
- `type` 字段仅用于 JSON 文本帧
- 二进制帧不使用字符串消息类型
- 二进制帧必须携带统一二进制帧头
- 接收端通过二进制帧头区分音频、视频、图片、OTA

## 4. 客户端消息总表

### 4.1 硬件端客户端

#### 硬件端 -> 服务端

文本帧：

| `type` | 含义 |
|---|---|
| `evt.ota.progress` | OTA 升级进度 |
| `evt.servo.position` | 当前舵机位置 |
| `evt.device.error` | 设备错误信息 |
| `evt.device.firmware` | 固件版本信息 |
| `xfer.ota.handshake` | OTA 握手与当前固件信息 |
| `sys.ack` | ACK |
| `sys.client.hello` | 连接后声明客户端角色 |
| `sys.nack` | NACK |
| `sys.pong` | 心跳响应 |

二进制帧：

| 二进制载荷 | 含义 |
|---|---|
| 二进制音频帧 | 音频流 |
| 二进制视频帧 | 视频流；当前服务端实现仅做转发与缓存占位，不进入 OpenClaw 视觉问答 |
| 二进制图片帧 | 图片流，服务端可缓存最近完整图片供 OpenClaw 视觉问答使用 |

#### 服务端 -> 硬件端

文本帧：

| `type` | 含义 |
|---|---|
| `ctrl.servo.angle` | 舵机角度控制 |
| `ctrl.camera.video_config` | 视频流参数控制 |
| `ctrl.camera.capture_image` | 拍一张图片 |
| `ctrl.camera.start_video` | 开始视频采集 |
| `ctrl.camera.stop_video` | 结束视频采集 |
| `evt.asr.result` | ASR 识别结果 |
| `evt.ai.status` | AI 状态事件 |
| `evt.ai.thinking` | AI 思考过程事件 |
| `evt.ai.reply` | AI 最终回复 |
| `xfer.ota.handshake` | OTA 握手 |
| `xfer.ota.checksum` | OTA 哈希校验信息 |
| `sys.ping` | 心跳请求 |

说明：

- `ctrl.camera.*` 当前仍是保留协议位，服务端实现尚未正式下发这些消息
- `xfer.ota.checksum` 当前属于服务端保留消息，尚未形成完整 OTA 闭环

二进制帧：

| 二进制载荷 | 含义 |
|---|---|
| 二进制音频帧 | 音频流 |
| 二进制 OTA 帧 | 固件数据 |

说明：

- 当前服务端不会在正式流程中下发 OTA 二进制数据

### 4.2 桌面应用端客户端

#### 桌面端 -> 服务端

文本帧：

| `type` | 含义 |
|---|---|
| `cfg.asr.get` | 读取 ASR 配置 |
| `cfg.tts.get` | 读取 TTS 配置 |
| `cfg.llm.get` | 读取 LLM 配置 |
| `cfg.dialogue.get` | 读取对话引擎配置 |
| `cfg.scheduler.get` | 读取定时任务模块配置 |
| `cfg.asr.update` | 更新 ASR 配置 |
| `cfg.tts.update` | 更新 TTS 配置 |
| `cfg.llm.update` | 更新 LLM 配置 |
| `cfg.dialogue.update` | 更新对话引擎配置 |
| `cfg.scheduler.update` | 更新定时任务模块配置 |
| `ctrl.servo.angle` | 控制硬件舵机角度 |
| `evt.ai.status` | 上位机模拟下发 AI 状态，由服务端转发到硬件端 |
| `sys.client.hello` | 连接后声明客户端角色 |
| `sys.pong` | 心跳响应 |

#### 服务端 -> 桌面端

文本帧：

| `type` | 含义 |
|---|---|
| `cfg.asr.report` | 返回 ASR 配置 |
| `cfg.tts.report` | 返回 TTS 配置 |
| `cfg.llm.report` | 返回 LLM 配置 |
| `cfg.dialogue.report` | 返回对话引擎配置 |
| `cfg.scheduler.report` | 返回定时任务模块配置 |
| `evt.device.status` | 当前硬件在线状态与版本快照 |
| `evt.servo.position` | 实时舵机位置 |
| `evt.device.error` | 硬件错误信息 |
| `evt.device.firmware` | 固件版本信息 |
| `evt.server.error` | 服务端错误事件 |
| `sys.ack` | ACK |
| `sys.nack` | NACK |
| `sys.ping` | 心跳请求 |

二进制帧：

| 二进制载荷 | 含义 |
|---|---|
| 二进制视频帧 | 实时视频显示 |
| 二进制图片帧 | 图片显示 |

## 5. 文本帧规范

### 5.1 JSON 信封

所有文本帧统一使用：

```json
{
  "type": "evt.device.error",
  "code": 1501,
  "data": {}
}
```

字段定义：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `type` | string | 是 | 文本消息类型 |
| `code` | int | 是 | 业务码，`0` 表示成功 |
| `data` | object/array/string/number/null | 是 | 业务数据 |

协议不使用以下字段：

- `req_id`
- `ts`
- `protocol_version`

### 5.2 文本消息分类

| 分类 | 前缀 | 说明 |
|---|---|---|
| 控制类 | `ctrl` | 控制对端动作 |
| 事件类 | `evt` | 上报状态、进度、错误 |
| 配置类 | `cfg` | 配置读取、返回、更新 |
| 传输会话类 | `xfer` | 传输开始、握手、结束、校验 |
| 系统治理类 | `sys` | ACK/NACK、心跳、恢复 |

### 5.3 文本消息命名

文本消息统一命名为：

```text
<category>.<domain>.<action>
```

示例：

- `ctrl.servo.angle`
- `evt.servo.position`
- `cfg.tts.update`
- `xfer.ota.checksum`
- `sys.ack`

### 5.4 文本消息约束

#### `ctrl`

- `ctrl` 是否携带 `command_id` 由具体消息定义
- `ctrl` 默认要求 `sys.ack` 或 `sys.nack`

#### `evt`

- `evt` 默认不要求 ACK

#### `cfg`

- `cfg.*.get` 表示读取配置
- `cfg.*.report` 表示返回配置
- `cfg.*.update` 表示更新配置
- `cfg.*.update` 默认要求 ACK
- `cfg.*.update` 应写入服务端 JSON 配置文件
- 当存在活跃硬件音频会话时，服务端必须拒绝会影响运行时实例的 `cfg.*.update`

#### `xfer`

- `xfer.data.transfer_id` 必填
- `xfer.*.checksum` 用于传输完成后的完整性校验

#### `sys`

- `sys.client.hello` 用于连接建立后的客户端角色声明
- 硬件端 `sys.client.hello.data.fw_version` 必填
- `sys.ack` / `sys.nack` 用于响应 `ctrl`、`cfg.*.update`、`xfer.*`
- `sys.ping` / `sys.pong` 用于心跳
- `sys.session.resume` 用于会话恢复

## 6. 二进制帧规范

### 6.1 统一二进制帧头

所有二进制帧必须使用统一帧头：

```text
+----------------------+----------------------+
| Binary Header (14B)  | Payload (N bytes)    |
+----------------------+----------------------+
```

帧头定义：

| 偏移 | 长度 | 类型 | 字段 | 说明 |
|---|---:|---|---|---|
| `0` | `4` | ASCII | `magic` | 固定为 `WSPK` |
| `4` | `1` | uint8 | `frame_type` | 帧类型枚举 |
| `5` | `1` | uint8 | `flags` | 标志位 |
| `6` | `4` | uint32 LE | `seq` | 帧序号 |
| `10` | `4` | uint32 LE | `payload_len` | 负载长度 |

约束：

- 所有多字节整数字段使用 `LE`
- 所有二进制帧必须包含完整帧头
- 同一连接允许不同 `frame_type` 的二进制帧交错发送
- 当前协议约束为：同一连接内每种 `frame_type` 同时最多只有一条活动流
- 接收端以 `frame_type + seq` 识别和组装二进制流
- 帧头固定为 `14` 字节，不再定义 `version`、`header_len`、`pts_ms`、`reserved`
- `image/video` 为 JPEG 负载时，接收端应按最后一个 `FFD9` 截断尾部 `0x00 padding`

### 6.2 二进制帧类型枚举

| `frame_type` | 名称 | 说明 |
|---|---|---|
| `1` | `audio` | 音频帧 |
| `2` | `video` | 视频帧 |
| `3` | `image` | 图片帧 |
| `4` | `ota` | OTA 数据帧 |

### 6.3 `flags` 定义

| bit | 含义 |
|---|---|
| `bit0` | 首帧 |
| `bit1` | 末帧 |
| `bit2` | 关键帧，视频/图片可用 |
| `bit3` | 分片帧 |
| `bit4-bit7` | 保留 |

约束：

- 接收端以 `flags.bit1 = 1` 判定当前流接收完毕
- 音频、图片、OTA 不再使用文本结束标记

### 6.4 音频二进制帧

#### 音频帧

- `frame_type = 1`
- 方向：由发送方角色决定
- 上行音频使用：`PCM 16kHz / 16bit / mono / LE`
- 下行音频使用：`PCM 24kHz / 16bit / mono / LE`
- 接收完毕：以 `flags.bit1 = 1` 判定

### 6.5 视频二进制帧

- `frame_type = 2`
- 负载格式：视频帧负载
- 同一视频流按 `seq` 递增
- 关键帧通过 `flags.bit2` 标记

### 6.6 图片二进制帧

- `frame_type = 3`
- 负载格式：图片帧负载
- 接收完毕：以 `flags.bit1 = 1` 判定

### 6.7 OTA 二进制帧

- `frame_type = 4`
- 格式：OTA 数据分片
- 传输握手：`xfer.ota.handshake`
- 接收完毕：以 `flags.bit1 = 1` 判定
- 完整性校验：`xfer.ota.checksum.data.sha256`

## 7. 已冻结文本消息目录

### 7.1 控制类

#### `ctrl.servo.angle`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `x_deg` | number | 是 | X 轴角度 |
| `y_deg` | number | 是 | Y 轴角度 |
| `duration_ms` | int | 否 | 动作时长 |

#### 摄像头控制

| `type` | 说明 |
|---|---|
| `ctrl.camera.video_config` | 视频流参数控制 |
| `ctrl.camera.capture_image` | 拍照 |
| `ctrl.camera.start_video` | 开始视频采集 |
| `ctrl.camera.stop_video` | 结束视频采集 |

#### `ctrl.camera.video_config`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `command_id` | string | 是 | 命令 ID |
| `width` | int | 否 | 视频宽度 |
| `height` | int | 否 | 视频高度 |
| `fps` | int | 否 | 帧率 |
| `quality` | int | 否 | 视频质量或压缩质量 |

### 7.2 事件类

#### 会话与 AI 事件

| `type` | 说明 |
|---|---|
| `evt.asr.result` | ASR 识别结果 |
| `evt.ai.status` | AI 状态事件 |
| `evt.ai.thinking` | AI 思考过程事件 |
| `evt.ai.reply` | AI 最终回复 |
| `evt.server.error` | 服务端错误事件 |
| `evt.device.status` | 当前硬件在线状态与版本快照 |

#### `evt.asr.result`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 是 | 识别文本 |

#### `evt.ai.status`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `status` | string | 是 | 状态标识；当前默认映射包含 `thinking` / `processing` / `listening` / `speaking` / `completed` / `error` / `standby` / `observing` |
| `message` | string | 否 | 状态说明 |
| `image_name` | string | 是 | 当前状态关联的图片名称，供硬件端定位当前应读取的图片 |
| `action_file` | string | 是 | 当前状态关联的动作文件名称，供硬件端定位当前应执行的动作 |
| `sound_file` | string | 是 | 当前状态关联的音效文件名称，供硬件端定位当前应播放的音效 |
| `detail` | object | 否 | 附加状态数据 |

最小示例：

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {
    "status": "thinking",
    "image_name": "thinking",
    "action_file": "thinking",
    "sound_file": "thinking"
  }
}
```

说明：

- 硬件端应固定读取 `status / image_name / action_file / sound_file`
- `message / detail` 为可选扩展字段

约束：

- `thinking`: AI 已开始处理当前用户输入
- `processing`: 当前处于处理中间阶段；当前主要用于 OpenClaw 图片上下文准备或 Session 轮询处理中
- `listening`: 当前处于语音输入监听阶段；适合上位机或后续 ASR 流程向硬件同步“正在听”
- `speaking`: 当前处于语音播报输出阶段；适合上位机或后续 TTS 流程向硬件同步“正在说”
- `completed`: AI 已完成本轮生成，后续通常会继续下发 `evt.ai.reply`
- `error`: AI Provider 在内部处理阶段返回错误；桌面端同时可能收到 `evt.server.error`
- `standby`: 当前处于空闲待机状态；适合非语言对话流中的背景状态展示或待机动作
- `observing`: 当前处于空闲观察状态；适合非语言对话流中的轻量观察/巡视动作
- `image_name / action_file / sound_file` 在实际下发给硬件端时必须始终存在
- 三个资源字段的取值优先级一致：消息显式值 > `config/ai_status_map.json` 默认值 > `status` 本身
- 当状态映射表里的资源字段为空字符串时，服务端应自动用状态名本身填充，且不带文件后缀
- 定时任务模块下发 `standby / observing` 时，也复用本结构；如果没有额外过程信息，不应附带 scheduler 专属 `detail`
- 当前允许 `desktop -> server -> hardware` 转发 `evt.ai.status`
- 当前不允许 `hardware -> server` 上行 `evt.ai.status`

#### `evt.ai.status` 状态资源映射表

位置：

```text
config/ai_status_map.json
```

用途：

- 统一维护允许的 AI 状态枚举
- 统一维护每个状态属于哪一类流程或状态域
- 统一维护每个状态默认关联的图片、动作、音效资源名称
- 供服务端校验 `evt.ai.status` 合法性，并在消息缺省资源字段时自动补默认值

映射表字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `label` | string | 是 | 状态中文名称 |
| `description` | string | 否 | 状态说明 |
| `scope` | string | 是 | 状态归属范围，例如 `dialogue_flow` |
| `image_name` | string | 否 | 默认图片名称 |
| `action_file` | string | 否 | 默认动作文件名称 |
| `sound_file` | string | 否 | 默认音效文件名称 |

当前默认状态映射中：

- `thinking / processing / listening / speaking / completed / error` 的 `scope` 为 `dialogue_flow`
- `standby / observing` 的 `scope` 为 `ambient_flow`

#### `evt.ai.thinking`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `kind` | string | 否 | 过程类型，如 `thinking`、`tool_call`、`tool_result`、`text` |
| `content` | string | 是 | 实时过程文本 |
| `detail` | object | 否 | 附加过程数据 |

#### `evt.ai.reply`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 是 | AI 最终回复文本 |

#### `evt.server.error`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | 是 | 错误信息 |
| `stage` | string | 否 | 错误阶段 |
| `detail` | object | 否 | 附加错误数据 |

约束：

- 当前语音链路中的服务端错误仅下发给桌面端
- 当前硬件端不接收 `evt.server.error`

#### `evt.servo.position`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `x_deg` | number | 是 | 当前 X 轴角度 |
| `y_deg` | number | 是 | 当前 Y 轴角度 |

#### 其他事件

| `type` | 说明 |
|---|---|
| `evt.camera.state` | 相机抓拍/视频状态 |
| `evt.ota.progress` | OTA 进度 |
| `evt.device.error` | 设备错误 |
| `evt.device.firmware` | 固件版本 |

#### `evt.camera.state`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | `capture_image` / `start_video` / `stop_video` / `video_config` |
| `state` | string | 是 | 当前状态 |
| `fps` | int | 否 | 当前视频帧率 |
| `message` | string | 否 | 附加说明 |

#### `evt.device.status`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `devices` | array | 是 | 当前在线硬件列表 |
| `online_hardware_count` | int | 是 | 当前在线硬件数量 |

`devices` 数组元素字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `client_id` | int | 是 | 服务端当前连接 ID |
| `online` | bool | 是 | 是否在线 |
| `fw_version` | string | 否 | 当前固件版本 |
| `hw_version` | string | 否 | 当前硬件版本 |
| `board_model` | string | 否 | 板卡型号 |
| `mac` | string | 否 | 设备 MAC |
| `capabilities` | object/array | 否 | 能力描述 |

约束：

- 服务端在以下时机向桌面端发送 `evt.device.status`
- 桌面端 `sys.client.hello` 成功后
- 硬件端 `sys.client.hello` 成功后
- 硬件端 `evt.device.firmware` 上报后
- 硬件端连接断开后

### 7.3 配置类

| `type` | 说明 |
|---|---|
| `cfg.asr.get` | 读取 ASR 配置 |
| `cfg.asr.report` | 返回 ASR 配置 |
| `cfg.asr.update` | 更新 ASR 配置 |
| `cfg.tts.get` | 读取 TTS 配置 |
| `cfg.tts.report` | 返回 TTS 配置 |
| `cfg.tts.update` | 更新 TTS 配置 |
| `cfg.llm.get` | 读取 LLM 配置 |
| `cfg.llm.report` | 返回 LLM 配置 |
| `cfg.llm.update` | 更新 LLM 配置 |
| `cfg.dialogue.get` | 读取对话引擎配置 |
| `cfg.dialogue.report` | 返回对话引擎配置 |
| `cfg.dialogue.update` | 更新对话引擎配置 |
| `cfg.scheduler.get` | 读取定时任务模块配置 |
| `cfg.scheduler.report` | 返回定时任务模块配置 |
| `cfg.scheduler.update` | 更新定时任务模块配置 |

#### `cfg.*.report`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `config` | object | 是 | 服务端当前配置文件完整内容 |
| `runtime` | object | 是 | 当前运行时状态 |

`runtime` 最小字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `provider` | string | 是 | 当前运行时提供商或模式 |
| `initialized` | bool | 是 | 当前实例是否已就绪 |
| `last_error` | string | 否 | 最近一次初始化或切换失败原因 |

#### `cfg.*.update`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `command_id` | string | 是 | 更新命令 ID |
| `config` | object | 是 | 要写入的完整配置对象 |

约束：

- 服务端校验 `config` 后写入对应 JSON 文件
- 写入成功后，服务端必须立即尝试热更新对应运行时实例
- 热更新失败时，服务端必须返回 `sys.nack`
- 热更新成功后，服务端应向全部桌面端广播对应 `cfg.*.report`
- `cfg.scheduler.update` 不受语音主链路忙碌态保护约束，应支持在服务运行中直接关闭或重新开启调度模块

#### `cfg.dialogue.*`

用途：

- 明确当前对话引擎模式
- `provider = openclaw` 表示语音对话由 OpenClaw 执行
- `provider = llm` 表示语音对话由 LLM 执行
- 当 `provider = openclaw` 时，桌面端只通过 `providers.openclaw.basic.backend` 切换 OpenClaw 实现方式

约束：

- `openclaw` 与 `llm` 互斥，同一时刻只能选择一个
- `cfg.dialogue.update` 成功后，后续新音频会话按新模式执行
- `providers.openclaw.basic.backend` 允许值为 `auto` 或当前服务端已注册的 OpenClaw 实现名
- OpenClaw 的账号、命令行行为、Agent 内部设置不属于本协议桌面端配置范围
- 服务端配置文件中可以保留 OpenClaw 本地运行字段，但桌面端协议只要求识别并编辑 `providers.openclaw.basic.backend`
- 当 `provider = openclaw` 且当前实现支持视觉输入时，服务端可将同一硬件连接最近一次完整图片流作为下一轮问答的视觉上下文
- 当前服务端实现中，OpenClaw 视觉问答仅支持图片；视频问答能力仅预留协议入口，暂未实现
- `cfg.dialogue.report.runtime` 应返回：
  - `openclaw_backends`：当前服务端可识别的 OpenClaw 实现列表
  - `openclaw_backend`：当前配置的 OpenClaw 实现
  - `openclaw_backend_resolved`：当 `openclaw_backend = auto` 时，当前实际解析后使用的实现
  - `openclaw_runtime`：当前 OpenClaw 运行时能力快照
    - `agent`：当前使用的 agent
    - `model`：当前 agent 绑定的模型
    - `inputs`：当前模型声明的输入能力
    - `supported_media_kinds`：当前服务端真正接通的媒体能力
    - `media_bridge.media_root`：媒体桥接目录
    - `media_bridge.retention_seconds`：桥接文件兜底保留时长

#### `cfg.scheduler.*`

用途：

- 读取当前定时任务模块配置
- 在不重启服务的情况下启用或关闭整个定时任务模块
- 在不重启服务的情况下启用或关闭单个定时任务
- 运行时重载 `config/scheduler.json`

约束：

- `cfg.scheduler.get` / `cfg.scheduler.report` / `cfg.scheduler.update` 仅允许桌面端使用
- `cfg.scheduler.update` 成功后，服务端应立即重建定时任务运行循环
- `cfg.scheduler.update` 不要求等待硬件语音对话空闲，应支持运行中直接关闭
- `cfg.scheduler.report.runtime` 应返回：
  - `provider`：固定为 `scheduler`
  - `initialized`：定时任务模块服务是否已挂载
  - `system_enabled`：系统级总开关
  - `config_enabled`：当前配置文件顶层 `enabled`
  - `active`：当前是否存在正在运行的任务循环
  - `loaded_task_count`：配置中任务数
  - `active_task_count`：当前有效运行任务数
  - `tasks`：任务运行时摘要列表

#### 本地 HTTP 管理接口（不属于 WebSocket 协议）

用途：

- 给桌面端测试页或本地调试工具提供定时 TTS 的独立管理入口
- 不影响硬件端与服务端之间的 WebSocket 通信协议

约束：

- 默认监听 `http_management_host / http_management_port`
- 当前仅建议本机桌面端页面或本地开发工具使用
- 这条链路不要求建立 `desktop` WebSocket 连接，但页面侧应只在 desktop 视角开放入口

当前已接通接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/admin/health` | 读取 HTTP 管理服务可用性 |
| `GET` | `/api/admin/scheduled-tts` | 读取定时 TTS 管理任务快照 |
| `PUT` | `/api/admin/scheduled-tts` | 保存或覆盖固定名字的 `scheduled_tts_push` 管理任务 |
| `POST` | `/api/admin/scheduled-tts/trigger` | 立即触发一次 TTS 播报测试 |

说明：

- `PUT /api/admin/scheduled-tts` 当前只要求 `trigger_at + text`
- 服务端会把这条管理任务落到 `config/scheduler.json`
- 当前固定管理任务名为 `http_managed_scheduled_tts`
- 一次性任务执行后，服务端会自动写回 `enabled = false`，并记录 `completed_at / last_result`
- `POST /api/admin/scheduled-tts/trigger` 如果遇到硬件语音会话忙碌，会等待空闲后再播报；超时则返回错误
- 这条 HTTP 管理链路最终仍复用现有 TTS provider 和下行 `binary.audio`

### 7.4 传输会话类

| `type` | 说明 |
|---|---|
| `xfer.ota.handshake` | OTA 握手与当前固件信息 |
| `xfer.ota.checksum` | OTA 哈希校验信息 |

说明：

- 当前只完成 `xfer.ota.handshake` 的观察/转发链路
- `xfer.ota.checksum` 仍属于保留能力，客户端上行会被拒绝

### 7.5 系统治理类

| `type` | 说明 |
|---|---|
| `sys.client.hello` | 客户端角色声明 |
| `sys.ack` | ACK |
| `sys.nack` | NACK |
| `sys.ping` | 心跳请求 |
| `sys.pong` | 心跳响应 |
| `sys.session.resume` | 会话恢复 |

说明：

- `sys.session.resume` 当前仅完成协议注册，尚未实现业务恢复逻辑

#### `sys.client.hello`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `role` | string | 是 | `hardware` 或 `desktop` |
| `fw_version` | string | 条件必填 | 当 `role = hardware` 时必填，表示当前固件版本 |

约束：

- `role = hardware` 时，客户端必须在连接后的首个 `sys.client.hello` 中携带 `fw_version`
- 服务端使用 `fw_version` 判断是否需要触发后续 OTA 升级流程
- `xfer.ota.handshake` 仍用于 OTA 传输阶段的固件握手，不替代连接阶段的 `sys.client.hello`
- 当 `role = desktop` 时，服务端应在 `sys.client.hello` 成功后主动下发当前 `evt.device.status`

## 8. 最小示例

### 8.1 `ctrl.servo.angle`

```json
{
  "type": "ctrl.servo.angle",
  "code": 0,
  "data": {
    "x_deg": 30,
    "y_deg": 15,
    "duration_ms": 200
  }
}
```

### 8.2 `evt.servo.position`

```json
{
  "type": "evt.servo.position",
  "code": 0,
  "data": {
    "x_deg": 30,
    "y_deg": 15
  }
}
```

### 8.3 `evt.ai.thinking`

```json
{
  "type": "evt.ai.thinking",
  "code": 0,
  "data": {
    "kind": "tool_call",
    "content": "camera_capture invoked",
    "detail": {
      "tool": "camera_capture"
    }
  }
}
```

### 8.4 `xfer.ota.checksum`

```json
{
  "type": "xfer.ota.checksum",
  "code": 0,
  "data": {
    "transfer_id": "ota-001",
    "sha256": "9f6c0f8f7f5b8e5d4e3c2b1a00112233445566778899aabbccddeeff00112233"
  }
}
```

### 8.5 `sys.client.hello`

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

### 8.6 `evt.device.status`

```json
{
  "type": "evt.device.status",
  "code": 0,
  "data": {
    "devices": [
      {
        "client_id": 4401083680,
        "online": true,
        "fw_version": "1.2.3",
        "hw_version": "A1",
        "board_model": "watcher-main"
      }
    ],
    "online_hardware_count": 1
  }
}
```

### 8.7 `cfg.dialogue.report`

```json
{
  "type": "cfg.dialogue.report",
  "code": 0,
  "data": {
    "config": {
      "provider": "openclaw",
      "common": {
        "basic": {
          "history_enabled": false
        },
        "advanced": {
          "max_turns": 6
        }
      },
      "providers": {
        "openclaw": {
          "label": "OpenClaw",
          "basic": {
            "backend": "tmux"
          }
        },
        "llm": {
          "label": "LLM",
          "basic": {},
          "advanced": {}
        }
      }
    },
    "runtime": {
      "provider": "openclaw",
      "initialized": true,
      "openclaw_backend": "tmux",
      "openclaw_backend_resolved": "tmux",
      "openclaw_backends": [
        {
          "name": "auto",
          "label": "Auto",
          "available": true
        },
        {
          "name": "local",
          "label": "Local",
          "available": true
        },
        {
          "name": "tmux",
          "label": "Tmux",
          "available": true
        }
      ],
      "openclaw_runtime": {
        "agent": "main",
        "model": "zai/glm-4.7",
        "inputs": [
          "text"
        ],
        "supported_media_kinds": [
          "image"
        ],
        "media_bridge": {
          "media_root": "~/.openclaw/workspace/.watcher_media",
          "retention_seconds": 86400,
          "supported_media_kinds": [
            "image"
          ],
          "video_reserved": true
        }
      }
    }
  }
}
```
