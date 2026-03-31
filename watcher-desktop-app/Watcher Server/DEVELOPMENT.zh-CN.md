# 开发指南

[English](DEVELOPMENT.md) | 简体中文

这份文档面向当前代码库的开发者，重点是“现在真实可运行的架构”，不是历史设计。

## 推荐阅读顺序

- [`README.zh-CN.md`](README.zh-CN.md)
- [`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- [`docs/architecture.zh-CN.md`](docs/architecture.zh-CN.md)
- [`docs/configuration.zh-CN.md`](docs/configuration.zh-CN.md)
- [`docs/protocol-overview.zh-CN.md`](docs/protocol-overview.zh-CN.md)

如果你需要更细的中文上下文，也可以继续看：

- [`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md)
- [`docs/device_communication_protocol.md`](docs/device_communication_protocol.md)

## 环境准备

```bash
conda env create -f environment.yml
conda activate watcher-server
```

常用命令：

```bash
conda env update -f environment.yml --prune
python main.py
python -m py_compile src/main.py
pytest
```

## 核心入口

- [`main.py`](main.py)：根入口，薄代理到 `src.main`
- [`src/main.py`](src/main.py)：应用生命周期
- [`src/core/websocket_server.py`](src/core/websocket_server.py)：连接中枢与广播层
- [`src/core/protocol_router.py`](src/core/protocol_router.py)：协议总路由
- [`src/core/protocol_handlers/`](src/core/protocol_handlers)：文本与二进制消息处理器
- [`src/core/audio_session_handler.py`](src/core/audio_session_handler.py)：`ASR -> AI -> TTS` 编排
- [`src/core/runtime_services.py`](src/core/runtime_services.py)：配置读写与运行时切换
- [`src/core/http_management_server.py`](src/core/http_management_server.py)：本地提醒 HTTP API
- [`src/core/scheduler/service.py`](src/core/scheduler/service.py)：调度器宿主

## 配置模型

当前服务使用 `config/*.json` 作为主配置源：

- `system.json`
- `asr.json`
- `tts.json`
- `llm.json`
- `dialogue.json`
- `scheduler.json`
- `ai_status_map.json`

主服务已经不再把 `.env` 作为主要配置入口。当前仓库里唯一的启动模板是 [`config/system.example.json`](config/system.example.json)。

## 语音会话主链路

```text
hardware binary.audio
  -> MessageDispatcher
  -> protocol_handlers.binary
  -> AudioSessionHandler
  -> RuntimeServices.ensure_asr_provider()
  -> RuntimeServices.chat()
  -> RuntimeServices.ensure_tts_provider()
  -> binary.audio 下行给 hardware
```

如果硬件在提问前刚上传了一张完整图片，那么在 OpenClaw 模式下，这张图片会作为上下文一起进入聊天。

## 运行时切换

对话模式由 [`config/dialogue.json`](config/dialogue.json) 控制：

- `provider = "openclaw"`
- `provider = "llm"`

OpenClaw backend:

- `auto`
- `local`
- `tmux`

配置更新会先落盘再应用到运行时。若当前硬件正在执行语音链路，某些更新会被拒绝，以避免打断正在进行的会话。

## 新增 Provider 的方式

### ASR

1. 在 [`src/modules/asr/providers/`](src/modules/asr/providers) 中新增实现
2. 继承 [`src/modules/asr/base.py`](src/modules/asr/base.py)
3. 通过注册表/装饰器注册
4. 在 [`config/asr.json`](config/asr.json) 中补充配置

### TTS

1. 在 [`src/modules/tts/providers/`](src/modules/tts/providers) 中新增实现
2. 继承 [`src/modules/tts/base.py`](src/modules/tts/base.py)
3. 注册 provider
4. 在 [`config/tts.json`](config/tts.json) 中补充配置

### LLM

1. 在 [`src/modules/llm/providers/`](src/modules/llm/providers) 中新增实现
2. 继承 [`src/modules/llm/base.py`](src/modules/llm/base.py)
3. 注册 provider
4. 在 [`config/llm.json`](config/llm.json) 中补充配置

### OpenClaw

1. 在 [`src/modules/openclaw/`](src/modules/openclaw) 中新增 backend
2. 继承 [`src/modules/openclaw/base.py`](src/modules/openclaw/base.py)
3. 通过 [`src/modules/openclaw/registry.py`](src/modules/openclaw/registry.py) 注册
4. 在 [`config/dialogue.json`](config/dialogue.json) 中选择

## Scheduler 说明

当前内置两类任务：

- `idle_ai_status_push`
- `scheduled_tts_push`

提醒 HTTP API 管理的是单个一次性任务 `http_managed_scheduled_tts`。

## 测试说明

当前仓库里的 `tests/` 同时包含：

- 单元测试风格的测试
- 协议检查
- 手动 OpenClaw / 集成说明

如果某个测试依赖外部服务、本地 OpenClaw 或硬件，请按环境依赖测试看待。

## 面向开源的开发注意事项

- 正式开源前先把真实密钥替换成占位符
- 文档和注释尽量使用相对链接
- 英文文档作为主入口，中文作为镜像补充

