# 模块对接文档：配置读取与插件切换

> 适用对象：桌面端开发、服务端联调开发
> 对应能力：ASR / TTS / LLM / Dialogue 配置读取、配置更新、运行时热切换
> 当前状态：已实现，可直接对接

说明：

- 定时任务模块 `Scheduler` 的运行时启停不放在本文展开，单独见 [scheduler_module_integration.md](/Users/mima0000/Desktop/Projects/watcher-server/docs/integration/scheduler_module_integration.md)

## 1. 模块目标

本模块用于让桌面端通过服务端完成以下两类动作：

1. 读取服务端当前配置文件内容与当前运行时状态
2. 更新服务端 JSON 配置文件，并切换当前运行时实例

当前支持 4 个配置模块：

- `asr`
- `tts`
- `llm`
- `dialogue`

其中：

- `asr / tts / llm` 用于切换具体 provider
- `dialogue` 用于切换当前对话引擎：`openclaw` 或 `llm`

## 2. 角色分工

### 2.1 桌面端

负责：

- 发送 `cfg.*.get`
- 接收 `cfg.*.report`
- 编辑配置
- 发送 `cfg.*.update`
- 处理 `sys.ack / sys.nack`

### 2.2 硬件端

本模块下没有直接的配置消息接口。

硬件端不主动接收 `cfg.*` 消息，但会间接受到配置切换后的运行时效果，例如：

- 后续上行音频改用新的 ASR provider
- 后续 AI 对话改用新的 `dialogue` 模式
- 后续下行语音改用新的 TTS provider

### 2.3 服务端

服务端在本模块中承担：

- 配置中心
- JSON 配置文件存储
- 运行时实例切换器
- 配置报告广播器

## 3. 连接前提

桌面端连接建立后，必须先发送：

```json
{
  "type": "sys.client.hello",
  "code": 0,
  "data": {
    "role": "desktop"
  }
}
```

服务端成功 ACK 后，桌面端即可开始读取和更新配置。

## 4. 消息总表

### 4.1 桌面端 -> 服务端

- `cfg.asr.get`
- `cfg.asr.update`
- `cfg.tts.get`
- `cfg.tts.update`
- `cfg.llm.get`
- `cfg.llm.update`
- `cfg.dialogue.get`
- `cfg.dialogue.update`

### 4.2 服务端 -> 桌面端

- `cfg.asr.report`
- `cfg.tts.report`
- `cfg.llm.report`
- `cfg.dialogue.report`
- `sys.ack`
- `sys.nack`

## 5. 读取配置

### 5.1 请求

读取请求统一为：

```json
{
  "type": "cfg.asr.get",
  "code": 0,
  "data": {}
}
```

其它模块只替换 `type`：

- `cfg.tts.get`
- `cfg.llm.get`
- `cfg.dialogue.get`

### 5.2 返回

服务端返回：

```json
{
  "type": "cfg.asr.report",
  "code": 0,
  "data": {
    "config": {},
    "runtime": {}
  }
}
```

字段说明：

- `data.config`
  当前服务端配置文件完整内容
- `data.runtime.provider`
  当前实际运行中的 provider 或模式
- `data.runtime.initialized`
  当前实例是否已就绪
- `data.runtime.last_error`
  最近一次初始化或切换失败原因，可选

### 5.3 当前桌面端使用建议

桌面端应始终以 `cfg.*.report.data.config` 为编辑源，而不是本地写死字段。

原因：

- provider 列表来自服务端 JSON
- 基础设置 / 高级设置的结构也来自服务端 JSON
- 后续新增 provider 时，桌面端不需要改协议，只需要按返回结构渲染

### 5.4 `data.config` 的推荐结构

当前服务端返回的配置对象，统一推荐按下面的结构组织：

```json
{
  "provider": "aliyun",
  "common": {
    "basic": {},
    "advanced": {}
  },
  "providers": {
    "aliyun": {
      "label": "阿里云 ASR",
      "basic": {},
      "advanced": {}
    }
  }
}
```

字段说明：

- `provider`
  当前配置选中的 provider
- `common.basic`
  普通用户常改的通用设置
- `common.advanced`
  高级通用设置
- `providers.<name>.label`
  桌面端直接展示给用户的 provider 名称
- `providers.<name>.basic`
  当前 provider 的基础设置
- `providers.<name>.advanced`
  当前 provider 的高级设置

### 5.5 字段不是固定表

桌面端不要把 ASR、TTS、LLM 的字段写死成固定表单。

当前真实约束是：

- 模块名固定：`asr / tts / llm / dialogue`
- 结构层级固定：`provider / common / providers`
- 分区语义固定：`basic / advanced`
- 具体字段不固定，应以服务端返回为准

例如：

- ASR 可能出现 `appkey / ak_id / ak_secret / token`
- TTS 可能出现 `voice_type / model / speed_ratio`
- LLM 可能出现 `model / temperature / max_tokens`
- Dialogue 可能出现 `history_enabled / max_turns / providers.openclaw.basic.backend`

所以桌面端应按以下规则实现：

1. 先读取 `cfg.*.report`
2. 使用 `config.provider` 决定当前选中的 provider
3. 渲染 `common.basic`
4. 按“显示高级设置”决定是否渲染 `common.advanced`
5. 渲染 `providers.<current>.basic`
6. 按“显示高级设置”决定是否渲染 `providers.<current>.advanced`

### 5.6 当前模块的大致示例

#### ASR

```json
{
  "provider": "deepgram",
  "common": {
    "basic": {
      "sample_rate": 16000,
      "channels": 1
    },
    "advanced": {}
  },
  "providers": {
    "aliyun": {
      "label": "阿里云 ASR",
      "basic": {
        "appkey": "...",
        "ak_id": "...",
        "ak_secret": "...",
        "token": ""
      },
      "advanced": {
        "url": "...",
        "language": "zh-CN"
      }
    },
    "deepgram": {
      "label": "Deepgram ASR",
      "basic": {
        "api_key": "..."
      },
      "advanced": {
        "model": "nova-2",
        "language": "multi"
      }
    }
  }
}
```

#### TTS

```json
{
  "provider": "deepgram",
  "common": {
    "basic": {
      "sample_rate": 24000
    },
    "advanced": {}
  },
  "providers": {
    "huoshan": {
      "label": "火山引擎 TTS",
      "basic": {
        "app_key": "...",
        "access_key": "...",
        "voice_type": "..."
      },
      "advanced": {
        "encoding": "pcm",
        "speed_ratio": 1
      }
    },
    "deepgram": {
      "label": "Deepgram TTS",
      "basic": {
        "api_key": "...",
        "model": "aura-2-thalia-en"
      },
      "advanced": {
        "encoding": "linear16"
      }
    }
  }
}
```

#### LLM

```json
{
  "provider": "ark",
  "common": {
    "basic": {
      "temperature": 0.7,
      "max_tokens": 2048
    },
    "advanced": {
      "top_p": 0.9,
      "stream": false
    }
  },
  "providers": {
    "ark": {
      "label": "火山 Ark LLM",
      "basic": {
        "api_key": "...",
        "model": "deepseek-v3-2-251201"
      },
      "advanced": {
        "base_url": "https://ark.cn-beijing.volces.com/api/v3"
      }
    }
  }
}
```

## 6. 更新配置

### 6.1 请求格式

更新请求统一为：

```json
{
  "type": "cfg.asr.update",
  "code": 0,
  "data": {
    "command_id": "cfg-asr-1710000000000",
    "config": {}
  }
}
```

其中：

- `data.config` 必须是完整配置对象
- 当前服务端实现支持两种写法：
  - `data.config = {...}`
  - 或直接把 `provider / common / providers` 放在 `data` 顶层

建议统一使用 `data.config`。

### 6.2 成功响应

服务端先返回 ACK：

```json
{
  "type": "sys.ack",
  "code": 0,
  "data": {
    "type": "cfg.asr.update",
    "provider": "aliyun"
  }
}
```

随后服务端会向所有桌面端广播最新报告：

```json
{
  "type": "cfg.asr.report",
  "code": 0,
  "data": {
    "config": {},
    "runtime": {
      "provider": "aliyun",
      "initialized": true
    }
  }
}
```

注意：

- `cfg.*.update` 是服务端全局配置，不是“按某一台硬件单独生效”
- 一次更新成功后，所有桌面端都会收到新的 `cfg.*.report`
- 后续会话会使用新 provider

### 6.3 失败响应

失败时返回：

```json
{
  "type": "sys.nack",
  "code": 1,
  "data": {
    "type": "cfg.asr.update",
    "reason": "runtime update is blocked while hardware voice pipeline is active",
    "busy_client_id": 4401083680,
    "busy_role": "hardware",
    "busy_stage": "ai.chat",
    "fw_version": "1.2.3"
  }
}
```

当前常见失败原因：

- `data must be an object`
- `data.config must be a config object`
- `runtime update is blocked while hardware voice pipeline is active`
- provider 初始化失败
- 配置校验失败

### 6.4 热更新保护

当任意硬件端正在执行语音链路任务时，服务端必须拒绝桌面端发起的运行时热更新。

当前受保护的阶段包括：

- `asr.initialize`
- `asr.streaming`
- `asr.stop`
- `ai.chat`
- `tts.synthesize`

也就是说，只要硬件端当前这轮语音流程还没完全结束，以下更新都应被拒绝：

- `cfg.asr.update`
- `cfg.tts.update`
- `cfg.llm.update`
- `cfg.dialogue.update`

桌面端收到 `sys.nack` 后，应立即提示用户当前流程仍在执行中，并根据 `data.busy_stage` 展示具体阻塞阶段。

## 7. Dialogue 模块的特殊说明

`dialogue` 不表示具体模型，而表示“当前对话链路由谁回答”。

当前支持：

- `openclaw`
- `llm`

示例：

```json
{
  "type": "cfg.dialogue.update",
  "code": 0,
  "data": {
    "command_id": "cfg-dialogue-1710000000000",
    "config": {
      "provider": "llm",
      "common": {
        "basic": {
          "history_enabled": true
        },
        "advanced": {
          "max_turns": 6
        }
      },
      "providers": {
        "openclaw": {
          "label": "OpenClaw",
          "basic": {
            "backend": "tmux",
            "agent": "main"
          },
          "advanced": {
            "poll_interval": 3,
            "log_poll_interval": 1
          }
        },
        "llm": {
          "label": "LLM",
          "basic": {},
          "advanced": {}
        }
      }
    }
  }
}
```

### 7.1 OpenClaw 当前对接约束

当前产品约束下：

- 桌面端可以切换 `dialogue.provider = openclaw | llm`
- 当 `provider = openclaw` 时，桌面端主要切换 `providers.openclaw.basic.backend`
- OpenClaw 自身更细的账号和内部运行参数，原则上不通过桌面端维护

### 7.2 `cfg.dialogue.report.runtime` 的补充字段

当前服务端会额外返回：

- `openclaw_backend`
- `openclaw_backend_resolved`
- `openclaw_backends`
- `openclaw_runtime`

这些字段用于桌面端展示 OpenClaw 当前实现方式和服务端解析结果。

## 8. 当前实现边界

### 8.1 配置切换是服务端全局行为

当前 `cfg.*.update` 不是“某一台硬件专用配置”。

也就是说：

- 桌面端改的是服务端全局运行时
- 多台硬件同时在线时，它们后续都会使用新的 ASR / TTS / Dialogue / LLM 设置

### 8.2 活跃硬件音频会话期间禁止切换

如果某个硬件连接正在进行语音链路，服务端会拒绝影响运行时实例的配置更新。

桌面端应在收到：

- `sys.nack`
- `reason = runtime update is blocked while hardware voice pipeline is active`

后提示用户稍后重试。

建议弹窗中至少展示：

- 当前被拒绝的消息类型
- `reason`
- `busy_stage`
- `busy_client_id`
- `fw_version`

### 8.3 `command_id` 当前不是强依赖

按当前协议文档，`cfg.*.update` 仍然携带 `command_id`。

但当前服务端的真实实现中：

- ACK/NACK 仅按 `type` 返回
- 服务端不会用 `command_id` 做去重或幂等

因此它当前更像“保留字段”。桌面端仍建议按现版协议带上，避免后续协议调整时再返工。

## 9. 推荐对接顺序

### 桌面端

1. 连接成功后发送 `sys.client.hello`
2. 依次发送 `cfg.asr.get / cfg.tts.get / cfg.llm.get / cfg.dialogue.get`
3. 用 `cfg.*.report.data.config` 渲染配置页面
4. 用户修改后发送 `cfg.*.update`
5. 监听 `sys.ack / sys.nack`
6. 如果收到热更新保护类 `sys.nack`，应弹窗提示“当前硬件语音流程执行中，稍后重试”
7. 以新的 `cfg.*.report` 刷新当前页面

### 硬件端

1. 不需要直接实现 `cfg.*`
2. 只需要按正常音频 / 对话链路工作
3. 接受服务端切换后的新运行时效果

## 10. 联调检查项

- 桌面端发送 `cfg.asr.get` 后，是否收到 `cfg.asr.report`
- 桌面端切换 provider 后，是否先收到 `sys.ack`
- ACK 后是否收到新的 `cfg.*.report`
- 修改期间如果硬件正在语音会话，是否收到 `sys.nack`
- `sys.nack.data.busy_stage` 是否能反映当前阻塞阶段，例如 `ai.chat / tts.synthesize`
- `cfg.dialogue.update` 切到 `llm` 后，后续语音问答是否改走 LLM
- `cfg.dialogue.update` 切到 `openclaw` 后，后续语音问答是否改走 OpenClaw
