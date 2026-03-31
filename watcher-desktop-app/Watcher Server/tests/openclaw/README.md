# OpenClaw 本地接入说明

## 概述

OpenClaw 是本项目可选的对话后端之一。

当前 watcher-server 中与 OpenClaw 相关的基础参数主要来自：

- `config/system.json`
- `config/dialogue.json`

## 本地环境

| 配置项 | 值 |
|--------|-----|
| API 地址 | `config/system.json -> openclaw_api_url` |
| API Key | `config/system.json -> openclaw_api_key` |
| 默认 Agent | `config/system.json -> openclaw_agent` |
| 对话模式 | `config/dialogue.json -> provider` |

## 接入方式

### 方式一：CLI 命令（最简单）

```bash
openclaw agent --agent main --message "你好" --json
```

**参数说明：**
- `--agent`: Agent ID（默认 `main`）
- `--message`: 发送的消息
- `--json`: 输出 JSON 格式

**返回格式：**
```json
{
  "runId": "xxx",
  "status": "ok",
  "summary": "completed",
  "result": {
    "payloads": [
      {
        "text": "AI 回复内容",
        "mediaUrl": null
      }
    ],
    "meta": {
      "durationMs": 17188,
      "agentMeta": {
        "provider": "zai",
        "model": "glm-4.7",
        "usage": {
          "input": 121464,
          "output": 433,
          "total": 128829
        }
      }
    }
  }
}
```

### 方式二：Python 调用 CLI

在 Python 中通过子进程调用 CLI：

```python
import asyncio
import json

async def chat(message: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "openclaw", "agent", "--agent", "main",
        "--message", message, "--json",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    result = json.loads(stdout)
    return result["result"]["payloads"][0]["text"]
```

### 方式三：WebSocket API（高级）

连接到 `ws://127.0.0.1:18789` 进行更复杂的交互。

## 项目集成

### 配置项（JSON）

```json
// config/system.json
{
  "openclaw_api_url": "http://127.0.0.1:18789/v1/responses",
  "openclaw_api_key": "",
  "openclaw_agent": "main"
}
```

```json
// config/dialogue.json
{
  "provider": "openclaw",
  "providers": {
    "openclaw": {
      "basic": {
        "backend": "tmux",
        "agent": "main"
      }
    }
  }
}
```

### 实现建议

1. **简单方案**：使用 `asyncio.subprocess` 调用 CLI 命令
2. **完整方案**：实现 WebSocket 客户端连接网关

## 测试命令

```bash
# 测试 CLI
openclaw agent --agent main --message "你好" --json

# 查看网关状态
openclaw gateway status

# 查看健康状态
openclaw gateway call health --json
```
