# LLM 模块插件开发指南

本指南通过 **ARK LLM 插件**的完整实现流程，说明如何为 LLM 模块开发新的 Provider 插件。

## 开发流程概览

```
步骤1: 创建 Provider 实现类
   ↓
步骤2: 使用 @register_provider 装饰器注册插件
   ↓
步骤3: 更新 providers/__init__.py 导出
   ↓
步骤4: 在 config.py 中添加配置验证规则
   ↓
步骤5: 创建配置文件 config/llm.json
   ↓
步骤6: 测试使用
```

---

## 步骤 1: 创建 Provider 实现类

在 `src/modules/llm/providers/` 目录下创建新文件 `ark.py`：

```python
"""Ark LLM 实现"""
import json
import asyncio
from typing import Optional, AsyncIterator, List, Dict, Any

import requests

from ..base import (
    LLMProvider,
    LLMResponse,
    LLMStreamChunk,
    LLMConfig,
    Message,
    Role,
)
from ..registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)
```

### 定义 ArkLLM 类

```python
@register_provider("ark", {
    "api_key": str,
    "model": str,
    "base_url": str,
})
class ArkLLM(LLMProvider):
    """Ark LLM 提供商

    支持火山引擎 Ark API 的 LLM 服务
    """

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek-v3-2-251201",
        base_url: str = "https://ark.cn-beijing.volces.com/api/v3",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.9,
    ):
        """初始化 Ark LLM

        Args:
            api_key: API Key
            model: 模型名称
            base_url: API 基础地址
            temperature: 温度参数
            max_tokens: 最大 token 数
            top_p: top-p 采样参数
        """
        super().__init__()
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self._url = f"{base_url}/responses"
```

**关键点**：
- 继承 `LLMProvider` 抽象基类
- `__init__` 参数应包含所有配置字段
- 使用 `@register_provider` 装饰器注册（步骤2说明）

### 实现 initialize 方法

```python
    async def initialize(self) -> None:
        """初始化 LLM 客户端"""
        if self._is_initialized:
            logger.warning("Ark LLM 已经初始化")
            return

        # Ark LLM 不需要特殊初始化
        self._is_initialized = True
        logger.info("Ark LLM 初始化完成")
```

### 实现 chat 方法（非流式）

```python
    async def chat(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> LLMResponse:
        """发送聊天请求（非流式）

        Args:
            messages: 消息列表
            config: LLM 配置（可选，用于覆盖默认配置）
            **kwargs: 其他参数

        Returns:
            LLM 响应
        """
        if not self._is_initialized:
            raise RuntimeError("Ark LLM 未初始化，请先调用 initialize()")

        try:
            response = await self._make_request(messages, stream=False)
            response.raise_for_status()

            result = response.json()

            # 提取回复内容
            output = result.get("output", [])
            content = ""
            for item in output:
                if item.get("type") == "message":
                    msg_content = item.get("content", [])
                    for c in msg_content:
                        if c.get("type") == "output_text":
                            content = c.get("text", "")

            # 提取 token 使用情况
            usage = result.get("usage", {})

            # 提取结束原因
            finish_reason = result.get("finish_reason", "stop")

            return LLMResponse(
                content=content,
                model=self.model,
                finish_reason=finish_reason,
                usage={
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
                raw_response=result
            )

        except requests.HTTPError as e:
            logger.error(f"Ark LLM HTTP 错误: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Ark LLM 调用失败: {e}")
            raise
```

### 实现 chat_stream 方法（流式）

```python
    async def chat_stream(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> AsyncIterator[LLMStreamChunk]:
        """发送聊天请求（流式）

        Args:
            messages: 消息列表
            config: LLM 配置（可选）
            **kwargs: 其他参数

        Yields:
            LLM 流式响应片段
        """
        if not self._is_initialized:
            raise RuntimeError("Ark LLM 未初始化，请先调用 initialize()")

        # 使用 SSE 客户端处理流式响应
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self._url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "stream": True, "input": self._build_messages(messages)},
                timeout=aiohttp.ClientTimeout(total=120)
            ) as response:
                response.raise_for_status()

                async for line in response.content:
                    if not line or not line.startswith(b'data: '):
                        continue

                    json_str = line[6:].decode('utf-8').strip()

                    if json_str == '[DONE]':
                        yield LLMStreamChunk(
                            content="",
                            delta="",
                            is_final=True,
                            finish_reason="stop"
                        )
                        break

                    chunk_data = json.loads(json_str)
                    # ... 提取内容并 yield LLMStreamChunk
```

### 实现 cleanup 方法

```python
    async def cleanup(self) -> None:
        """清理资源"""
        self._is_initialized = False
        logger.info("Ark LLM 已清理")
```

---

## 步骤 2: 使用 @register_provider 装饰器注册插件

在类定义上方添加装饰器：

```python
@register_provider("ark", {
    "api_key": str,
    "model": str,
    "base_url": str,
})
class ArkLLM(LLMProvider):
    ...
```

**装饰器参数说明**：
- 第一个参数 `"ark"`：Provider 的唯一标识符（小写）
- 第二个参数（字典）：配置字段 schema，定义该 Provider 支持的配置字段及其类型

**schema 的作用**：
- 自动验证配置文件中的字段类型
- 在工厂创建实例时自动过滤无关字段
- 支持配置自发现

---

## 步骤 3: 更新 providers/__init__.py 导出

编辑 `src/modules/llm/providers/__init__.py`：

```python
"""LLM Providers"""
from .ark import ArkLLM

__all__ = ["ArkLLM"]
```

**作用**：确保 Provider 类被导入，从而触发 `@register_provider` 装饰器执行。

---

## 步骤 4: 在 config.py 中添加配置验证规则

编辑 `src/modules/llm/config.py`，在 `validate()` 方法中添加：

```python
def validate(self) -> Tuple[bool, str]:
    """验证配置是否有效

    Returns:
        (is_valid, error_message): 是否有效, 错误信息
    """
    provider = self.provider.lower()

    # 针对不同提供商定义必填字段
    required_fields_map = {
        "ark": ["api_key"],              # Ark 需要 api_key
        "openai": ["api_key"],           # OpenAI 需要 api_key
        "anthropic": ["api_key"],        # Anthropic 需要 api_key
        "deepseek": ["api_key"],         # DeepSeek 需要 api_key
    }

    required_fields = required_fields_map.get(provider, [])

    # 检查必填字段
    missing_fields = []
    for field in required_fields:
        value = self.provider_config.get(field, "")
        if not value or str(value).strip() == "":
            missing_fields.append(field)

    if missing_fields:
        return False, f"配置验证失败: {provider} 提供商缺少必填字段: {', '.join(missing_fields)}"

    return True, ""
```

**作用**：在启动时验证必填配置是否完整，避免运行时错误。

---

## 步骤 5: 创建配置文件 config/llm.json

在项目根目录的 `config/` 文件夹下创建 `llm.json`：

```json
{
    "provider": "ark",
    "common": {
        "temperature": 0.7,
        "max_tokens": 2048,
        "top_p": 0.9,
        "stream": false
    },
    "ark": {
        "api_key": "your-api-key-here",
        "model": "deepseek-v3-2-251201",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3"
    }
}
```

**配置文件结构说明**：

| 字段 | 说明 |
|------|------|
| `provider` | 要使用的 Provider 名称（对应 `@register_provider` 的第一个参数） |
| `common` | 通用配置，适用于所有 Provider |
| `ark` | Provider 特定配置（字段名与 Provider 的 schema 匹配） |

---

## 步骤 6: 测试使用

### 方式 1: 使用 Manager 单例

```python
import asyncio
from src.modules.llm import LLM, Message, Role

async def main():
    # 初始化
    await LLM.initialize(config_path="config/llm.json")

    # 构建消息
    messages = [
        Message(Role.SYSTEM, "You are a helpful assistant"),
        Message(Role.USER, "你好，请介绍一下自己"),
    ]

    # 发送请求
    response = await LLM.provider.chat(messages)
    print(f"回复: {response.content}")
    print(f"模型: {response.model}")
    print(f"Token 使用: {response.usage}")

    # 清理
    await LLM.cleanup()

asyncio.run(main())
```

### 方式 2: 使用 Factory

```python
from src.modules.llm import LLMFactory, Message, Role

async def main():
    # 创建 Provider
    provider = LLMFactory.create_from_file("config/llm.json")
    await provider.initialize()

    # 使用
    messages = [
        Message(Role.SYSTEM, "You are a helpful assistant"),
        Message(Role.USER, "Hello!"),
    ]
    response = await provider.chat(messages)
    print(response.content)

    # 清理
    await provider.cleanup()

asyncio.run(main())
```

### 验证插件注册

```python
from src.modules.llm import list_providers, get_config_schema

# 列出所有已注册的 Provider
print("可用 Provider:", list_providers())
# 输出: ['ark']

# 查看 Ark 的配置 schema
schema = get_config_schema("ark")
print("Ark schema:", schema)
# 输出: {'api_key': <class 'str'>, 'model': <class 'str'>, 'base_url': <class 'str'>}
```

---

## 完整的 Ark LLM 实现文件

参考：[src/modules/llm/providers/ark.py](src/modules/llm/providers/ark.py)

---

## 开发新 Provider 的快速清单

开发新的 Provider（例如 OpenAI）时，按此清单操作：

- [ ] 创建 `src/modules/llm/providers/openai.py`
- [ ] 定义 OpenAILLM 类，继承 LLMProvider
- [ ] 添加 `@register_provider("openai", {...})` 装饰器
- [ ] 实现 `__init__`、`initialize`、`chat`、`chat_stream`、`cleanup` 方法
- [ ] 在 `providers/__init__.py` 中添加 `from .openai import OpenAILLM`
- [ ] 在 `config.py` 的 `validate()` 中添加 `"openai": ["api_key"]`
- [ ] 创建 `config/llm.json`，添加 `"openai"` 配置节
- [ ] 测试验证

---

## 注意事项

1. **异步设计**：所有方法必须是 `async` 的
2. **错误处理**：捕获并记录网络错误和 API 错误
3. **流式支持**：建议同时实现非流式 `chat()` 和流式 `chat_stream()`
4. **配置验证**：必填字段必须在 `config.py` 中声明
5. **日志记录**：使用 `logger` 记录关键操作和错误
6. **资源清理**：在 `cleanup()` 中释放连接、关闭客户端等
