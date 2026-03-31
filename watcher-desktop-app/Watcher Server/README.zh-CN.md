# Watcher Server

[English](README.md) | 简体中文

Watcher Server 是一个基于 asyncio 的协议中枢与语音编排服务，面向 `hardware + desktop` 双客户端模型：

- `hardware` 端通过 WebSocket 上传音频、图片、视频和设备事件
- `desktop` 端通过 WebSocket 查看运行时状态、更新配置并控制硬件
- 服务端负责编排 `ASR -> 对话引擎 -> TTS`
- 运行时支持在 `OpenClaw` 与普通 `LLM` 后端之间切换
- 本地 HTTP 管理接口提供提醒调度等桌面侧自动化能力

## 项目能力

- 接收 `hardware` 和 `desktop` 两类 WebSocket 客户端
- 解析统一 JSON 文本协议与统一二进制帧协议
- 跑通完整的 `ASR -> AI -> TTS` 语音链路
- 为 OpenClaw 模式提供图片上下文能力
- 使用 `config/*.json` 持久化配置并支持运行时热切换
- 广播设备在线状态与 AI 状态
- 通过 UDP 实现局域网服务发现
- 托管定时任务，包括通过 HTTP 创建的一次性提醒播报

## 当前默认运行参数

当前仓库中的开发配置默认启用：

- WebSocket 端口 `8765`
- UDP discovery 端口 `37020`
- 本地 HTTP 管理接口端口 `8766`
- 对话模式 `openclaw`
- OpenClaw backend 为 `tmux`
- ASR 为 `aliyun`
- TTS 为 `huoshan`
- 独立 LLM provider 为 `ark`

这些默认值来自当前 `config/*.json`，你的实际部署可以不同。

## 快速启动

### 1. 创建环境

```bash
conda env create -f environment.yml
conda activate watcher-server
```

### 2. 检查配置

Watcher Server 通过 [`config/`](config/) 下的 JSON 文件配置：

- [`config/system.json`](config/system.json)
- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)
- [`config/dialogue.json`](config/dialogue.json)
- [`config/scheduler.json`](config/scheduler.json)
- [`config/ai_status_map.json`](config/ai_status_map.json)

如果你本地还没有 `config/system.json`，可以先从 [`config/system.example.json`](config/system.example.json) 复制。

### 3. 启动服务

```bash
python main.py
```

也可以用脚本：

```bash
chmod +x start.sh
./start.sh
```

Windows:

```cmd
start.bat
```

## 运行时结构

### 核心组件

- [`src/main.py`](src/main.py)：服务生命周期与优雅退出
- [`src/core/websocket_server.py`](src/core/websocket_server.py)：连接中枢、角色管理、广播链路
- [`src/core/runtime_services.py`](src/core/runtime_services.py)：provider 初始化、配置读写、运行时切换
- [`src/core/audio_session_handler.py`](src/core/audio_session_handler.py)：完整语音会话编排
- [`src/core/http_management_server.py`](src/core/http_management_server.py)：本地 HTTP 管理接口
- [`src/core/scheduler/service.py`](src/core/scheduler/service.py)：定时任务宿主与提醒任务管理

### 语音主链路

```text
hardware binary.audio
  -> ASR provider
  -> dialogue engine (OpenClaw or LLM)
  -> TTS provider
  -> binary.audio 回传给 hardware
```

### 提醒链路

```text
desktop 工具 / OpenClaw skill
  -> HTTP PUT /api/admin/scheduled-tts
  -> SchedulerService
  -> 向在线硬件执行一次性 TTS 播报
```

## 目录结构

```text
watcher-server/
├── config/                  运行时 JSON 配置
├── docs/                    架构、协议、集成文档
├── skills/                  项目内置 OpenClaw skills
├── src/
│   ├── config/              Settings 与路径解析
│   ├── core/                WebSocket、调度器、运行时编排
│   ├── models/              协议模型与二进制编解码
│   ├── modules/             ASR / TTS / LLM / OpenClaw / discovery
│   └── utils/               日志与消息工具
├── tests/                   单测与手动集成说明
├── DEVELOPMENT.md           英文开发指南
├── STARTUP_GUIDE.md         英文启动指南
├── start.sh
├── start.bat
└── main.py
```

## Provider 与 Backend

- ASR: `aliyun`, `deepgram`
- TTS: `huoshan`, `deepgram`
- LLM: `ark`
- Dialogue mode: `openclaw`, `llm`
- OpenClaw backend: `auto`, `local`, `tmux`

## 提醒 Skill

仓库内置了一个 OpenClaw reminder skill：

- [`skills/watcher-reminder-http/SKILL.md`](skills/watcher-reminder-http/SKILL.md)
- [`skills/watcher-reminder-http/scripts/reminder_http.js`](skills/watcher-reminder-http/scripts/reminder_http.js)

它通过本地 HTTP 管理接口 `8766` 工作，只支持一次性提醒；新提醒会覆盖旧提醒。

## 文档入口

- 英文 docs 索引：[`docs/README.md`](docs/README.md)
- 中文 docs 索引：[`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- 架构说明：[`docs/architecture.md`](docs/architecture.md)
- 配置说明：[`docs/configuration.md`](docs/configuration.md)
- 协议概览：[`docs/protocol-overview.md`](docs/protocol-overview.md)
- HTTP 管理接口：[`docs/http-management-api.md`](docs/http-management-api.md)

## 面向开源的注意事项

- 当前仓库中的 `config/*.json` 仍然带有开发环境色彩。
- 正式开源前，请将真实密钥、Token 和机器相关配置全部替换成占位符。
- 建议在首次公开发布前补充 License 和一套脱敏后的配置示例。

## 当前状态

Watcher Server 已经接通当前主语音链路、运行时切换、桌面端配置读写、OpenClaw 图片上下文、调度器任务与本地提醒 API。

仍然属于保留或未闭环的协议面包括：

- `sys.session.resume`
- 大部分 `ctrl.camera.*` 下行能力
- 完整 OTA checksum / binary 传输闭环

