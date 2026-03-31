# OpenClaw 模块插件开发指南

本指南说明如何为 OpenClaw 模块开发新的 Provider 插件，并介绍 OpenClaw Provider 与 LLM Provider 在架构上的主要差异。

> ✅ 由于 OpenClaw 的执行主要依赖本地 CLI（openclaw）及其 session 日志，默认不会使用单独的配置文件。插件的配置由 `register_provider` 注册时的 schema 决定。

---

## 目录

1. [核心概念](#核心概念)
2. [OpenClaw 插件开发流程](#openclaw-插件开发流程)
3. [OpenClaw Provider 接口说明](#openclaw-provider-接口说明)
4. [OpenClaw vs LLM：接口差异与替换策略](#openclaw-vs-llm接口差异与替换策略)

---

## 核心概念

### 插件体系

OpenClaw 模块已经实现 **插件注册 + 工厂创建**机制：

- `src/modules/openclaw/registry.py` 负责注册 Provider
- `src/modules/openclaw/factory.py` 负责根据 `provider` 名称创建实例
- `src/modules/openclaw/__init__.py` 提供 `create_openclaw_provider()` 作为统一入口

目前默认提供的 Provider：

- `local`：通过 `openclaw agent` CLI 直接调用（最低依赖）
- `tmux`：通过 `openclaw agent` + session.jsonl 读取实时日志（需要 tmux）

你可以新增 Provider（例如基于 HTTP API、Remote Gateway 等），使用同样的插件机制即可。

---

## OpenClaw 插件开发流程

### 步骤 1：创建 Provider 实现类

在 `src/modules/openclaw/` 目录下创建新文件，例如 `my_provider.py`。

```python
from typing import List, Optional

from src.modules.openclaw.base import OpenClawProvider, ChatMessage, ChatResponse
from src.modules.openclaw.registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)


@register_provider("myprovider", {
    "agent": str,
    "poll_interval": int,
})
class MyProvider(OpenClawProvider):
    """自定义 OpenClaw Provider 示例"""

    def __init__(
        self,
        agent: str = "main",
        poll_interval: int = 3,
    ):
        super().__init__()
        self.agent = agent
        self.poll_interval = poll_interval

    async def initialize(self):
        # 初始化逻辑（例如检查环境、初始化客户端）
        self._is_initialized = True

    async def chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        **kwargs
    ) -> ChatResponse:
        # 发送聊天请求并返回 ChatResponse
        return ChatResponse(content="", model="myprovider")

    async def cleanup(self):
        # 清理资源
        self._is_initialized = False
```

**关键点**：
- 继承 `OpenClawProvider` 基类
- 必须实现 `initialize()` / `chat()` / `cleanup()`
- 可选实现回调支持（建议实现 `set_callbacks`）


### 步骤 2：确认 Provider 已被注册

注册成功后，插件会被自动记录在注册表中，你可以在运行时通过 `src.modules.openclaw.list_providers()` 查看：

```python
from src.modules.openclaw import list_providers
print(list_providers())  # e.g. ['local', 'tmux', 'myprovider']
```

---

## OpenClaw Provider 接口说明

### 1) 初始化（initialize）
- 在模块启动时执行（如 `WatcherServer.initialize()`）
- 目的：验证运行环境（例如 `openclaw` 是否可用、Gateway 是否启动）

### 2) 对话接口（chat）

```python
async def chat(
    self,
    messages: List[ChatMessage],
    model: Optional[str] = None,
    **kwargs
) -> ChatResponse:
```

- `messages`：典型为两条消息（system + user）
- `model`：可选模型名称
- `kwargs`：可扩展参数（可根据 Provider 自由定义）

**返回值**：`ChatResponse`（包含 `content`、`model`、`finish_reason`、`usage`）

### 3) 清理资源（cleanup）
- 停止任何后台进程、关闭连接、释放资源

### 4) 可选回调（推荐）
OpenClaw 模块的业务中会使用回调（例如：思考动画、实时日志）的机制，建议在 Provider 中提供：

- `on_status_change(status: str, data: dict)`
- `on_log(content: str, log_type: str)`

你可以在 Provider 中实现 `set_callbacks(on_status_change, on_log)`，或基于基类新增，并在 `chat()` 流程中适时调用。

```python
# 示例：在基类中添加 set_callbacks（已在当前框架中实现）
provider.set_callbacks(on_status_change=my_status_cb, on_log=my_log_cb)
```

---

## OpenClaw vs LLM：接口差异与替换策略

### ✅ 核心区别

| 特性 | OpenClaw Provider | LLM Provider |
|------|------------------|-------------|
| 接口形式 | `chat(messages, model, **kwargs)` | `chat(messages, config, **kwargs)` + `chat_stream` |
| 核心使用场景 | Agent（tool + session）风格的对话，支持状态/日志回调 | 纯 LLM 聊天/生成（含流式） |
| 实时日志/思考流 | `on_log` / `on_status_change` | 通过 `LLMCallbacks.on_chunk` 处理流式文本 |
| 运行依赖 | 依赖 OpenClaw CLI / Gateway / tmux (可选) | 依赖远程 API (OpenAI/Ark/Anthropic 等) |

### ✅ “OpenClaw 不可用时使用 LLM 代替”策略（架构思路）

你提到希望“OpenClaw 未安装时默认使用 LLM 补齐对话”。常见做法如下：

1. **首选 OpenClaw Provider**（例如 `provider="tmux"` 或 `provider="local"`）
2. **若初始化失败或未安装**：捕获异常，降级为 LLM Provider
3. **调用层保持统一接口**（只需要保证输出为 `ChatResponse` 或类似格式）

在当前架构中，你可以让调用方（例如 `WebSocketServer`）在创建 Provider 时做降级：

```python
try:
    openclaw = create_openclaw_provider(...)
    await openclaw.initialize()
except Exception:
    # 降级到 LLM（示例）
    llm = LLMFactory.create_from_file("config/llm.json")
    await llm.initialize()
    # 然后转成统一的 ChatResponse
```

> ⚠️ 如果希望 “OpenClaw & LLM 能互相替换”，建议设计一层小的 Adapter：
> - 将 LLM 的 `LLMResponse` 映射为 `ChatResponse`
> - 将 OpenClaw 的 `ChatResponse` 兼容成 LLM 所需格式

---

## 示例：在代码里创建 OpenClaw Provider（无需 config 文件）

```python
from src.modules.openclaw import create_openclaw_provider

openclaw = create_openclaw_provider(
    provider="auto",  # auto / local / tmux / 你自己注册的 provider 名称
    agent="main",
    poll_interval=3,
    log_poll_interval=2,
)

await openclaw.initialize()
response = await openclaw.chat([
    ChatMessage(role="system", content="你是助手"),
    ChatMessage(role="user", content="你好"),
])
```

---

## 插件开发注意事项

- 你的 Provider 应该尽可能稳健：
  - `initialize()` 必须能尽快失败（避免启动卡住）
  - `cleanup()` 必须保证可重复调用
- 推荐按照 `tmux` 的思路：即使不需要 `tmux`，也可以提供 `on_log` 回调以便 UI 展示实时进度

---

## 参考：现有 Provider 实现

- `src/modules/openclaw/local_claw.py`（最基础的 CLI 实现）
- `src/modules/openclaw/tmux_claw.py`（基于 session 日志的增强实现）

你可以直接在这些文件中发现“真实业务如何调 `openclaw agent`”、“如何解析返回结果”等逻辑。

---

如你需要，我可以进一步帮你把 “OpenClaw + LLM 可替换策略” 定义成一个统一的对话接口（例如 `ConversationProvider`），并补齐 `adapter` 层以实现无缝降级切换。
