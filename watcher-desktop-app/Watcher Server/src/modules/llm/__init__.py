"""LLM 模块

提供插件式 LLM 服务，支持多个提供商：
- ark: 火山引擎 Ark LLM

使用方式：
    from src.modules.llm import LLM, LLMConfig, LLMFactory
    from src.modules.llm.base import Message, Role

    # 方式1: 使用 Manager 单例
    await LLM.initialize(config_path="config/llm.json")
    response = await LLM.provider.chat([
        Message(Role.SYSTEM, "You are a helpful assistant"),
        Message(Role.USER, "Hello"),
    ])

    # 方式2: 使用 Factory
    provider = LLMFactory.create_from_file("config/llm.json")
    await provider.initialize()
    response = await provider.chat(messages)
"""

# 基础类
from src.modules.llm.base import (
    Role,
    Message,
    LLMResponse,
    LLMStreamChunk,
    LLMConfig,
    LLMCallbacks,
    LLMProvider,
)

# 配置
from src.modules.llm.config import LLMConfig as LLMFullConfig, LLMCommonConfig

# 工厂
from src.modules.llm.factory import LLMFactory, LLMManager

# 注册表
from src.modules.llm.registry import (
    register_provider,
    get_provider_class,
    list_providers,
    get_config_schema,
)

# 全局单例
LLM = LLMManager()

__all__ = [
    # 基础类
    "Role",
    "Message",
    "LLMResponse",
    "LLMStreamChunk",
    "LLMConfig",
    "LLMCallbacks",
    "LLMProvider",
    # 配置
    "LLMFullConfig",
    "LLMCommonConfig",
    # 工厂
    "LLMFactory",
    "LLMManager",
    # 注册表
    "register_provider",
    "get_provider_class",
    "list_providers",
    "get_config_schema",
    # 全局单例
    "LLM",
]
