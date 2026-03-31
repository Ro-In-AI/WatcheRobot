# 配置说明

[English](configuration.md) | 简体中文

Watcher Server 当前以 `config/` 目录下的 JSON 文件作为主要运行时配置来源。

## 配置原则

- `config/*.json` 是配置事实来源
- `.env` 已不再是主要运行时配置输入
- 来自桌面端的配置更新会回写到 JSON 文件
- 配置更新后，运行时 provider 可以被重新加载

## 配置文件

### `config/system.json`

系统级配置，包括：

- 服务名与版本号
- WebSocket host / port
- discovery 开关与 UDP 端口
- OpenClaw 公共配置
- HTTP 管理接口 host / port
- scheduler 配置路径
- 日志与线程池参数

启动模板：

- [`../config/system.example.json`](../config/system.example.json)

### `config/asr.json`

ASR provider 选择与 provider 自身配置。

当前代码支持：

- `aliyun`
- `deepgram`

### `config/tts.json`

TTS provider 选择与 provider 自身配置。

当前支持：

- `huoshan`
- `deepgram`

### `config/llm.json`

独立 LLM provider 配置。

当前支持：

- `ark`

### `config/dialogue.json`

对话模式与 OpenClaw backend 选择。

当前支持的对话 provider：

- `openclaw`
- `llm`

当前支持的 OpenClaw backend：

- `auto`
- `local`
- `tmux`

### `config/scheduler.json`

调度器总开关与任务定义。

当前仓库内置配置包括：

- `idle_non_dialogue_status_push`
- `http_managed_scheduled_tts`

### `config/ai_status_map.json`

AI 状态目录以及发给硬件端时使用的资源映射。

## 提示词文件

部分文本提示词来自普通文本文件：

- `config/openclaw_prompt.txt`
- `config/llm_think_prompt.txt`

这些文件由 [`src/config/env.py`](../src/config/env.py) 加载。

## 当前开发配置画像

当前仓库里的开发配置默认选择：

- `openclaw` 对话模式
- OpenClaw backend 为 `tmux`
- ASR 为 `aliyun`
- TTS 为 `huoshan`

它更适合作为本地开发配置，而不是直接公开发布的模板。

## 热更新行为

桌面端可以通过 `cfg.*.update` 消息更新运行时配置。

这类更新会：

1. 校验 payload
2. 回写 JSON 文件
3. 在需要时重建或切换运行时实例

如果硬件端当前正在执行语音链路，某些更新可能会被阻塞。

## 安全说明

如果你准备公开发布这个项目：

- 请先从 `config/*.json` 中移除真实 API Key / Token
- 尽量把本机路径替换成占位符
- 对外文档优先使用脱敏后的示例配置

