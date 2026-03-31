"""TTS 模块 - 文本转语音

目录结构:
- base.py        : 基类定义 (TTSProvider, TTSResult, TTSCallbacks)
- config.py      : 配置类 (TTSConfig, TTSCommonConfig)
- factory.py     : 工厂类 (TTSFactory) 和管理器 (TTSManager)
- registry.py    : 注册表 (register_provider)
- providers/    : Provider 实现目录
    - __init__.py
    - deepgram.py : Deepgram 实现
    - huoshan.py  : 火山引擎实现
"""

# 基础类（包括回调机制）
from .base import TTSProvider, TTSResult, TTSCallbacks, TTSEventData

# 配置类
from .config import TTSConfig, TTSCommonConfig

# 工厂和管理器
from .factory import TTSFactory, TTSManager

# 注册表
from .registry import register_provider, get_provider_class, list_providers, get_config_schema

# 全局单例
from .factory import TTS

# 提供商实现
from .providers import DeepgramTTS, HuoshanTTS

__all__ = [
    # 基础类
    "TTSProvider",
    "TTSResult",
    "TTSCallbacks",
    "TTSEventData",
    # 配置
    "TTSConfig",
    "TTSCommonConfig",
    # 工厂
    "TTSFactory",
    "TTSManager",
    # 注册
    "register_provider",
    "get_provider_class",
    "list_providers",
    "get_config_schema",
    # 全局单例
    "TTS",
    # 实现
    "DeepgramTTS",
    "HuoshanTTS",
]
