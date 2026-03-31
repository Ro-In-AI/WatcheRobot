# 定时任务模块对接文档

## 1. 目标

定时任务模块用于把“后台周期性动作”从语音主链路里解耦出来。

当前调度器把任务分为两类：

- `interval`：循环间隔任务，按固定周期反复执行
- `scheduled`：一次性定时任务，按指定日期时间触发一次

当前内置了两条任务链路：

- `idle_ai_status_push`
  - 属于 `interval`
  - 系统空闲时按概率触发，再由当前 `OpenClaw / LLM` 只负责从候选状态里选一个最适合下发的状态
  - 最终复用 `evt.ai.status`
- `scheduled_tts_push`
  - 属于 `scheduled`
  - 到达指定日期时间后，直接把预设文本走 TTS 合成并下发给当前在线硬件
  - 这条链路不经过 ASR，也不经过 AI 判定，只走 TTS 和音频下发

桌面端对调度模块的运行时控制使用：

- `cfg.scheduler.get`
- `cfg.scheduler.report`
- `cfg.scheduler.update`

---

## 2. 相关文件

- 调度配置：[scheduler.json](/Users/mima0000/Desktop/Projects/watcher-server/config/scheduler.json)
- 状态映射表：[ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json)
- 调度服务：[service.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/scheduler/service.py)
- 任务基类：[base.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/scheduler/base.py)
- 间隔型任务：[idle_ai_status_push.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/scheduler/tasks/idle_ai_status_push.py)
- 定时型任务：[scheduled_tts_push.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/scheduler/tasks/scheduled_tts_push.py)
- 生命周期接入：[main.py](/Users/mima0000/Desktop/Projects/watcher-server/src/main.py)

---

## 3. 当前内置任务

当前内置任务类型：

- `idle_ai_status_push`
- `scheduled_tts_push`

### 3.1 `idle_ai_status_push`

- `idle_non_dialogue_status_push`

默认行为：

1. 周期性运行。
2. 如果当前没有在线硬件，直接跳过。
3. 如果当前硬件语音会话正忙，直接跳过。
4. 读取 `ai_status_map.json` 中 `scope = ambient_flow` 的状态作为候选状态。
5. 按 `trigger_probability` 判断这一轮是否触发；未命中则本轮直接跳过。
6. 如果命中，再调用当前 `dialogue.provider` 对应的 `OpenClaw / LLM` 选择一个状态名。
7. 如果 AI 选择失败，则按 `fallback_mode` 回退；当前默认回退为 `random`。
8. 系统使用状态映射表中的默认资源拼出 `evt.ai.status`。
9. 通过 `evt.ai.status` 广播给所有在线硬件端。

### 3.2 `scheduled_tts_push`

推荐用途：

- 在指定日期时间播报一段预设文本
- 仅走 TTS，不走 AI
- 音频直接下发给当前在线硬件

默认行为：

1. 任务按配置的 `trigger_at` 只触发一次。
2. 如果触发时没有在线硬件，则本次一次性任务直接结束，并记为未发送。
3. 如果触发时硬件语音会话正忙，则保持“待执行”状态。
4. 当前忙碌会话结束后，任务会立刻补发，不会错过本次一次性触发。
5. 任务只需要 `trigger_at + text` 两个业务字段。
6. 音频通过现有 `binary.audio` 下发，不新增协议消息类型。

---

## 4. 当前忙碌态判定

定时任务模块复用当前语音会话忙碌态：

- `asr.initialize`
- `asr.streaming`
- `asr.stop`
- `ai.chat`
- `tts.synthesize`

对不同任务类型的处理方式：

- `idle_ai_status_push`：只要任意硬件连接处于上述阶段，本轮直接跳过
- `scheduled_tts_push`：如果已经到达设定时间，则不跳过，而是等待当前会话结束后立即补发

---

## 5. 当前配置格式

```json
{
  "enabled": true,
  "tasks": [
    {
      "name": "idle_non_dialogue_status_push",
      "type": "idle_ai_status_push",
      "enabled": true,
      "interval_seconds": 45,
      "initial_delay_seconds": 20,
      "jitter_seconds": 0,
      "candidate_scopes": ["ambient_flow"],
      "candidate_statuses": [],
      "trigger_probability": 0.35,
      "decision_mode": "dialogue_provider",
      "fallback_mode": "random",
      "history_limit": 8,
      "message": ""
    },
    {
      "name": "one_shot_tts_broadcast",
      "type": "scheduled_tts_push",
      "enabled": false,
      "trigger_at": "2026-03-27T09:00:00",
      "text": "早上好，今天也要顺顺利利。"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `enabled` | bool | 是否启用整个定时任务模块 |
| `tasks` | array | 定时任务列表 |
| `name` | string | 任务实例名 |
| `type` | string | 任务类型，当前内置为 `idle_ai_status_push / scheduled_tts_push` |
| `interval_seconds` | number | `interval` 任务的基础运行周期 |
| `initial_delay_seconds` | number | `interval` 任务首次执行前延迟一次 |
| `jitter_seconds` | number | `interval` 任务每轮额外随机抖动 |
| `candidate_scopes` | array | `idle_ai_status_push` 的候选状态 scope 列表 |
| `candidate_statuses` | array | `idle_ai_status_push` 的候选状态白名单 |
| `trigger_probability` | number | `idle_ai_status_push` 的本轮命中概率，范围 `0~1` |
| `decision_mode` | string | `idle_ai_status_push` 的判定模式，支持 `dialogue_provider / random` |
| `fallback_mode` | string | `idle_ai_status_push` 的 AI 判定失败回退策略 |
| `history_limit` | int | `idle_ai_status_push` 的历史记录条数 |
| `message` | string | `idle_ai_status_push` 的默认状态说明 |
| `trigger_at` | string | `scheduled_tts_push` 的一次性触发时间，格式 `YYYY-MM-DDTHH:MM` 或 `YYYY-MM-DDTHH:MM:SS` |
| `text` | string | `scheduled_tts_push` 的播报文本 |

说明：

- `enabled = false` 时，整个调度模块在服务运行中立即停下
- 单个 task 的 `enabled = false` 时，只关闭该任务，不影响其它任务
- 这些修改都支持在不重启服务的情况下生效
- `interval` 任务和 `scheduled` 任务可以混用在同一个 `tasks` 列表里
- `scheduled_tts_push` 不读取 `interval_seconds / initial_delay_seconds / jitter_seconds`
- `idle_ai_status_push` 下发给硬件端的 `evt.ai.status` 与对话工作流共用同一最小格式；当前不附带 scheduler 专属 `detail`

## 5.1 运行时控制消息

读取：

```json
{
  "type": "cfg.scheduler.get",
  "code": 0,
  "data": {}
}
```

更新：

```json
{
  "type": "cfg.scheduler.update",
  "code": 0,
  "data": {
    "config": {
      "enabled": true,
      "tasks": []
    }
  }
}
```

返回：

```json
{
  "type": "cfg.scheduler.report",
  "code": 0,
  "data": {
    "config": {},
    "runtime": {}
  }
}
```

`runtime` 关键字段：

- `provider = scheduler`
- `initialized`
- `system_enabled`
- `config_enabled`
- `active`
- `loaded_task_count`
- `active_task_count`
- `tasks`

`tasks[n]` 中当前会额外包含：

- `schedule_kind`
- 当任务是 `scheduled_tts_push` 时，还会带 `trigger_at / completed_at / last_result`

## 5.2 桌面端推荐控制流程

建议桌面端按下面顺序控制定时任务：

1. 发送 `cfg.scheduler.get`
2. 读取 `cfg.scheduler.report.data.config`
3. 基于返回的完整配置对象修改：
   - 顶层 `enabled`
   - 或 `tasks[n].enabled`
   - 或任务周期/随机触发概率等字段
   - 或一次性定时任务的 `trigger_at / text`
4. 发送 `cfg.scheduler.update`
5. 等待服务端返回：
   - `sys.ack`
   - 随后新的 `cfg.scheduler.report`

## 5.3 本地 HTTP 管理接口

除了 `cfg.scheduler.*` 这条 WebSocket 配置链路，当前还额外提供了一个本地 HTTP 管理接口，专门面向“一次性定时 TTS 播报”任务。

默认监听：

- `http://127.0.0.1:8766`

当前接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/admin/health` | 读取 HTTP 管理服务状态 |
| `GET` | `/api/admin/scheduled-tts` | 读取管理中的定时 TTS 任务 |
| `PUT` | `/api/admin/scheduled-tts` | 保存管理中的定时 TTS 任务 |
| `POST` | `/api/admin/scheduled-tts/trigger` | 立即触发一次 TTS 播报测试 |

当前行为约束：

- 这条 HTTP 链路不属于硬件 WebSocket 协议
- `PUT /api/admin/scheduled-tts` 当前只要求 `trigger_at + text`
- 服务端会自动把顶层 `scheduler.enabled` 设为 `true`
- 当前固定管理任务名为 `http_managed_scheduled_tts`
- 如果该任务已存在，则按固定名字覆盖
- 如果立即测试时硬件语音会话还在执行，接口会等待当前会话结束后再播报
- 一次性任务执行后会自动写回 `enabled = false`，并记录 `completed_at / last_result`

读取示例：

```json
{
  "ok": true,
  "data": {
    "management": {
      "enabled": true,
      "base_url": "http://127.0.0.1:8766"
    },
    "scheduler": {
      "system_enabled": true,
      "config_enabled": true,
      "active": true,
      "active_task_count": 2,
      "loaded_task_count": 2,
      "config_path": "/abs/path/config/scheduler.json"
    },
    "task": {
      "name": "http_managed_scheduled_tts",
      "type": "scheduled_tts_push",
      "schedule_kind": "scheduled",
      "present": true,
      "enabled": true,
      "trigger_at": "2026-03-27T09:00:00",
      "text": "早上好，今天也要顺顺利利。",
      "active": true,
      "completed_at": "",
      "last_result": ""
    }
  }
}
```

保存示例：

```json
{
  "trigger_at": "2026-03-27T09:00:00",
  "text": "早上好，今天也要顺顺利利。"
}
```

立即测试示例：

```json
{
  "text": "这是一次立即测试播报。",
  "wait_timeout_seconds": 60
}
```

### 关闭整个定时任务模块

```json
{
  "type": "cfg.scheduler.update",
  "code": 0,
  "data": {
    "config": {
      "enabled": false,
      "tasks": [
        {
          "name": "idle_non_dialogue_status_push",
          "type": "idle_ai_status_push",
          "enabled": true,
          "interval_seconds": 45,
          "initial_delay_seconds": 20,
          "jitter_seconds": 0,
          "candidate_scopes": ["ambient_flow"],
          "candidate_statuses": [],
          "trigger_probability": 0.35,
          "decision_mode": "dialogue_provider",
          "fallback_mode": "random",
          "history_limit": 8,
          "message": ""
        }
      ]
    }
  }
}
```

### 只关闭一个任务

```json
{
  "type": "cfg.scheduler.update",
  "code": 0,
  "data": {
    "config": {
      "enabled": true,
      "tasks": [
        {
          "name": "idle_non_dialogue_status_push",
          "type": "idle_ai_status_push",
          "enabled": false,
          "interval_seconds": 45,
          "initial_delay_seconds": 20,
          "jitter_seconds": 0,
          "candidate_scopes": ["ambient_flow"],
          "candidate_statuses": [],
          "trigger_probability": 0.35,
          "decision_mode": "dialogue_provider",
          "fallback_mode": "random",
          "history_limit": 8,
          "message": ""
        }
      ]
    }
  }
}
```

---

## 6. 状态表要求

当前第一条任务不会硬编码具体状态，而是从 [ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json) 里筛选：

- `scope = ambient_flow`

当前默认已经提供两个可直接使用的非对话流状态：

- `standby`
- `observing`

如果开发者要自定义新的空闲状态，只需要：

1. 在 [ai_status_map.json](/Users/mima0000/Desktop/Projects/watcher-server/config/ai_status_map.json) 新增状态。
2. 把它的 `scope` 设为 `ambient_flow`，或把任务配置改成自己的新 scope。
3. 如有需要，在状态条目里写默认 `image_name / action_file / sound_file`。

不需要改调度器主代码。

---

## 7. 当前 AI 判定方式

当前 `decision_mode = dialogue_provider` 时，AI 只做一件事：

- 从候选状态里选出一个状态名

AI 不负责：

- 判断本轮是否触发
- 组装完整 JSON
- 生成最终协议包

这些都由系统完成：

1. 系统先按 `trigger_probability` 决定本轮是否触发。
2. 如果触发，再调用 `OpenClaw / LLM`。
3. AI 只返回一个状态名，例如 `standby`。
4. 系统再从状态表中补 `image_name / action_file / sound_file` 等默认资源；如果映射表为空，则回退为状态名本身。
5. 系统最终发送 `evt.ai.status`。

---

## 8. 当前消息格式

定时任务最终下发给硬件端的仍然是：

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {
    "status": "standby"
  }
}
```

如果状态映射表为该状态配置了默认资源，则服务端会自动补出：

- `image_name`
- `action_file`
- `sound_file`

如果状态映射表里这三个字段为空字符串，则服务端会自动填成状态名本身，例如：

- `status = standby`
- `image_name = standby`
- `action_file = standby`
- `sound_file = standby`

也就是说，硬件端不需要新增消息类型，只需要继续处理 `evt.ai.status`，而且定时任务和对话工作流的收包格式保持一致。

---

## 9. 后续扩展方式

如果后续开发者要新增新的定时任务，建议按下面方式扩展：

1. 在 `src/core/scheduler/tasks/` 下新增任务类。
2. 继承 `ScheduledTask`。
3. 在 [service.py](/Users/mima0000/Desktop/Projects/watcher-server/src/core/scheduler/service.py) 的 `TASK_TYPES` 注册表里注册。
4. 在 [scheduler.json](/Users/mima0000/Desktop/Projects/watcher-server/config/scheduler.json) 增加对应任务配置。

这样可以保持：

- 主服务生命周期不变
- 任务之间互不耦合
- 自定义任务只改一处配置和一个任务类
- 间隔型任务和定时型任务都可以共用同一个宿主调度器
