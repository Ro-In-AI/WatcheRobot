# AI 状态消息对接文档

## 1. 适用范围

本文档说明当前硬件端使用的 AI 状态消息：

- `evt.ai.status`

它用于告诉硬件端，当前语音对话链路里的 AI 阶段处于什么状态。  
它不等于最终回复，也不等于思考流文本。

当前允许两种来源：

- 服务端内部 AI 流程直接下发给硬件端
- 桌面端作为上位机，上行到服务端后，由服务端转发给硬件端

相关消息分工：

- `evt.ai.status`: 阶段状态
- `evt.ai.thinking`: 实时过程文本 / 思考过程 / 工具调用过程
- `evt.ai.reply`: 最终回复文本
- `evt.server.error`: 服务端错误，当前只发桌面端，不发硬件端

---

## 2. 消息格式

当前硬件端应按下面这个固定结构接收：

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

如果服务端需要额外说明过程，也允许再附带：

- `message`
- `detail`

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `type` | string | 是 | 固定为 `evt.ai.status` |
| `code` | int | 是 | 当前成功消息固定为 `0` |
| `data.status` | string | 是 | 当前状态枚举 |
| `data.message` | string | 否 | 给 UI 直接展示的状态说明 |
| `data.image_name` | string | 是 | 当前状态关联的图片名称，供硬件端定位要读取的图片 |
| `data.action_file` | string | 是 | 当前状态关联的动作文件名称，供硬件端定位要执行的动作 |
| `data.sound_file` | string | 是 | 当前状态关联的音效文件名称，供硬件端定位要播放的音效 |
| `data.detail` | object | 否 | 附加调试信息，字段不固定；硬件端不应依赖 |

方向约束：

- `server -> hardware`: 允许
- `desktop -> server -> hardware`: 允许
- `hardware -> server`: 不允许

---

## 3. 当前状态枚举

当前协议允许并已内置到状态表中的状态有 `8` 个：

| `status` | 含义 | 什么时候发送 | 当前来源 |
|---|---|---|---|
| `thinking` | AI 已开始处理 | 用户问题进入 AI 阶段后立即发送 | LLM / OpenClaw |
| `processing` | AI 正在处理中间步骤 | 当前主要用于 OpenClaw 图片上下文准备、Session 状态轮询处理中 | OpenClaw |
| `listening` | 当前处于语音监听阶段 | 适合在硬件开始录音、上位机提示“正在听”时发送 | 当前主要由桌面端上位机转发 |
| `speaking` | 当前处于语音播报阶段 | 适合在硬件开始播放、上位机提示“正在说”时发送 | 当前主要由桌面端上位机转发 |
| `standby` | 当前处于空闲待机阶段 | 适合非语言对话流中的待机状态同步 | 当前主要由定时任务模块下发 |
| `observing` | 当前处于空闲观察阶段 | 适合非语言对话流中的轻量观察状态同步 | 当前主要由定时任务模块下发 |
| `completed` | AI 已完成本轮生成 | 生成结果已经就绪，随后通常会继续发送 `evt.ai.reply` | LLM / OpenClaw |
| `error` | AI Provider 内部处理失败 | Provider 内部抛错并主动上报状态时发送 | 当前主要是 OpenClaw |

说明：

- 当前没有 `idle`
- 当前也没有单独的 `started`
- 当前服务端内部自动流程主要会发 `thinking / processing / completed / error`
- `listening / speaking` 当前已作为合法协议状态开放，适合桌面端上位机转发给硬件端
- 当前默认状态表位于 [ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json)
- 当前默认状态表中的 `thinking / processing / listening / speaking / completed / error` 的 `scope` 为 `dialogue_flow`
- 当前默认状态表中的 `standby / observing` 的 `scope` 为 `ambient_flow`
- `scope` 仅用于服务端状态映射与筛选，不会作为定时任务状态消息的一部分下发给硬件端
- `image_name / action_file / sound_file` 在最终下发给硬件端时始终存在
- 三个资源字段的取值优先级为：消息显式值 > 状态映射表默认值 > `status` 本身
- 如果状态映射表里这三个字段为空字符串，服务端会自动填成状态名本身，且不带文件后缀

---

## 4. 状态资源映射表

位置：

- [ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json)

用途：

- 集中维护 AI 状态枚举
- 集中维护每个状态默认关联的图片、动作、音效资源
- 集中维护每个状态属于哪一类流程或状态域
- 服务端校验 `evt.ai.status` 时使用这张表
- 当消息里未显式携带 `image_name / action_file / sound_file` 时，服务端会先用这张表的默认值补齐
- 如果映射表默认值仍为空字符串，服务端会继续回退为状态名本身

映射字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 状态中文名称 |
| `description` | string | 状态说明 |
| `scope` | string | 状态归属范围，例如 `dialogue_flow` |
| `image_name` | string | 默认图片名称 |
| `action_file` | string | 默认动作文件名称 |
| `sound_file` | string | 默认音效文件名称 |

---

## 4.1 服务端状态控制器

位置：

- [ai_status_controller.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/ai_status_controller.py)

职责：

- 统一校验 `evt.ai.status` 的 `status`
- 统一从 [ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json) 补默认 `image_name / action_file / sound_file`
- 统一拼装 `evt.ai.status.data`
- 统一执行“发送给当前硬件连接”或“广播给所有硬件端”

当前推荐调用方式：

- 对话工作流：
  业务层只告诉控制器当前要发送什么状态，以及是否临时覆盖图片/动作/音效资源
- 定时任务：
  业务层只告诉控制器当前要发送什么状态，由控制器补齐默认资源并下发
- 桌面端上位机转发：
  服务端先通过控制器校验并标准化 payload，再转发给硬件端

当前已支持两种使用方式：

1. 按状态名直接发送
2. 按状态名发送，并临时覆盖：
   - `image_name`
   - `action_file`
   - `sound_file`

也就是说：

- 正常业务可以依赖配置文件默认资源
- 上位机调试也可以不改配置文件，直接临时指定图片、动作、音效

---

## 5. 当前发送时机

### 5.1 四个自动状态的具体发送时机

下面这 `4` 个状态，是当前服务端内部语音对话流程会自动发给硬件端的状态：

| `status` | 是否自动发送 | 当前发送时机 | 当前路径 |
|---|---|---|---|
| `thinking` | 是 | ASR 结束后进入 AI 对话阶段，Provider 即将开始处理用户文本时发送 | LLM / OpenClaw |
| `processing` | 是 | AI 已进入处理中间阶段时发送；当前主要发生在 OpenClaw 图片上下文准备或 tmux session 长时间处理中 | OpenClaw |
| `completed` | 是 | AI Provider 已经拿到最终回复文本，但 `evt.ai.reply` 还没下发前发送 | LLM / OpenClaw |
| `error` | 是，但不是所有失败都保证先发 | OpenClaw Provider 内部处理抛错并主动回调状态时发送 | 当前主要是 OpenClaw |

更细一点的约束：

- `thinking`
  服务端在 `_call_ai()` 内部调用 `runtime.chat(...)` 后，由具体 dialogue provider 通过 `on_status_change` 回调发出。
- `processing`
  当前只有 OpenClaw 会自动发这个状态。
  本地 OpenClaw 模式在开始准备图片上下文时发送；
  tmux OpenClaw 模式会在 session 轮询中从 `thinking` 切到 `processing`。
- `completed`
  表示“AI 回复文本已经准备好”。
  该状态之后，服务端通常会继续发送 `evt.ai.reply`，然后再进入 TTS 阶段。
- `error`
  当前主要是 OpenClaw Provider 自己主动回调。
  如果失败发生在更外层逻辑，也可能只看到桌面端收到 `evt.server.error`，而硬件端没有先收到 `evt.ai.status = error`。

### 5.2 LLM 路径

当 `dialogue.provider = llm` 时，当前服务端会发送：

1. `thinking`
2. `completed`
3. `evt.ai.reply`

典型顺序：

```json
{ "type": "evt.ai.status", "code": 0, "data": { "status": "thinking", "message": "LLM thinking...", "image_name": "thinking", "action_file": "thinking", "sound_file": "thinking" } }
{ "type": "evt.ai.status", "code": 0, "data": { "status": "completed", "message": "LLM reply ready", "image_name": "completed", "action_file": "completed", "sound_file": "completed" } }
{ "type": "evt.ai.reply", "code": 0, "data": { "text": "..." } }
```

---

### 5.3 OpenClaw 路径

当 `dialogue.provider = openclaw` 时，当前服务端可能发送：

1. `thinking`
2. `processing`
3. `completed`
4. `evt.ai.reply`

如果 OpenClaw 使用了带 Session 日志的实现，还可能同时穿插：

- `evt.ai.thinking`

典型顺序：

```json
{ "type": "evt.ai.status", "code": 0, "data": { "status": "thinking", "message": "Thinking...", "image_name": "image-13.jpg", "action_file": "thinking", "sound_file": "thinking.wav" } }
{ "type": "evt.ai.status", "code": 0, "data": { "status": "processing", "message": "Preparing image context...", "image_name": "image-13.jpg", "action_file": "wave.json", "sound_file": "thinking.wav" } }
{ "type": "evt.ai.thinking", "code": 0, "data": { "kind": "thinking", "content": "..." } }
{ "type": "evt.ai.status", "code": 0, "data": { "status": "completed", "image_name": "image-13.jpg", "action_file": "wave.json", "sound_file": "done.wav", "detail": { "content": "..." } } }
{ "type": "evt.ai.reply", "code": 0, "data": { "text": "..." } }
```

---

### 5.4 桌面端上位机路径

当桌面端作为上位机，需要主动给硬件端同步 AI 状态时，可以发送：

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {
    "status": "thinking",
    "message": "Desktop supervisor: waiting AI reply",
    "image_name": "camera_latest.jpg",
    "action_file": "nod.json",
    "sound_file": "thinking.wav"
  }
}
```

服务端行为：

1. 校验当前连接角色必须是 `desktop`
2. 校验 `data.status` 必须属于固定枚举
3. 转发给在线 `hardware` 客户端
4. 回给桌面端 `sys.ack`

如果当前没有在线硬件，服务端会返回 `sys.nack`。

---

### 5.5 错误路径

如果 AI 阶段失败：

- OpenClaw Provider 当前可能先发 `evt.ai.status.status = error`
- 服务端同时会向桌面端发送 `evt.server.error`

当前硬件端不接收 `evt.server.error`，所以硬件端只需要处理：

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {
    "status": "error",
    "image_name": "error",
    "action_file": "error",
    "sound_file": "error",
    "detail": {
      "error": "..."
    }
  }
}
```

---

### 5.6 定时任务空闲态路径

当服务端定时任务模块启用，并且系统当前不处于语音对话忙碌态时，当前还可能发送：

1. `standby`
2. `observing`

这两个状态属于：

- 非语言对话流
- `scope = ambient_flow`

当前来源：

- `config/scheduler.json`
- 当前 `OpenClaw / LLM` 对话引擎的后台判定

典型示例：

```json
{ "type": "evt.ai.status", "code": 0, "data": { "status": "standby", "image_name": "standby", "action_file": "standby", "sound_file": "standby" } }
{ "type": "evt.ai.status", "code": 0, "data": { "status": "observing", "image_name": "observing", "action_file": "observing", "sound_file": "observing" } }
```

约束：

- 定时任务空闲态路径与对话工作流共用同一个 `evt.ai.status` 协议结构
- 如果状态映射表里为 `standby / observing` 配置了 `image_name / action_file / sound_file`，服务端会优先使用这些固定资源字段
- 如果映射表未配置，服务端会自动填 `standby / observing` 作为三个资源字段的值
- 定时任务路径当前不再附加 scheduler 专属 `detail`

---

## 6. 硬件端建议处理方式

建议硬件端把这 `4` 个状态映射成简单 UI 或内部状态：

| `status` | 建议行为 |
|---|---|
| `thinking` | 显示“正在思考” |
| `processing` | 显示“处理中” |
| `completed` | 显示“回复已生成”，等待 `evt.ai.reply` 或下行音频 |
| `error` | 显示“AI 处理失败” |

建议：

- `evt.ai.status` 只做阶段显示，不作为最终结果
- 硬件端应固定读取：
  - `status`
  - `image_name`
  - `action_file`
  - `sound_file`
- 最终文本以 `evt.ai.reply` 为准
- 如果同时收到 `evt.ai.thinking`，可把它当作更细粒度的过程显示
- 如果同时带有 `image_name`，应把当前状态关联到对应图片资源
- 如果同时带有 `action_file`，应把当前状态关联到对应动作资源
- 如果同时带有 `sound_file`，应把当前状态关联到对应音效资源

---

## 7. 当前实现边界

- `processing` 当前主要由 OpenClaw 使用，LLM 路径不会发送
- `error` 当前主要由 OpenClaw Provider 主动回调时出现；不是所有 AI 失败都会先经过这个状态
- `detail` 当前不是固定 schema，硬件端不应依赖其中的具体字段名
- `image_name / action_file / sound_file` 是固定字段，硬件端可以依赖
