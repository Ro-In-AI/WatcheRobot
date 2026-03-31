"""ASR 模块 - 自动语音识别

目录结构:
- base.py        : 基类定义 (ASRProvider, ASRResult, ASRCallbacks)
- config.py      : 配置类 (ASRConfig, ASRCommonConfig)
- factory.py     : 工厂类 (ASRFactory) 和管理器 (ASRManager)
- registry.py    : 注册表 (register_provider)
- providers/    : Provider 实现目录
    - aliyun.py  : 阿里云实现
"""

# 基础类（包括回调机制）
from .base import ASRProvider, ASRResult, AudioConfig, ASRCallbacks, ASREventData

# 配置类
from .config import ASRConfig, ASRCommonConfig

# 工厂和管理器
from .factory import ASRFactory, ASRManager

# 注册表
from .registry import register_provider, get_provider_class, list_providers, get_config_schema

# 全局单例
from .factory import ASR

# 提供商实现
from .providers import AliyunASR, DeepgramASR

__all__ = [
    # 基础类
    "ASRProvider",
    "ASRResult",
    "AudioConfig",
    # 回调
    "ASRCallbacks",
    "ASREventData",
    # 配置
    "ASRConfig",
    "ASRCommonConfig",
    # 工厂
    "ASRFactory",
    "ASRManager",
    # 注册
    "register_provider",
    "get_provider_class",
    "list_providers",
    "get_config_schema",
    # 全局单例
    "ASR",
    # 实现
    "AliyunASR",
    "DeepgramASR",
]
