"""OpenClaw 提供商注册系统

用于插件式自动发现和加载 OpenClaw 实现。
"""
from typing import Dict, Type, Any, Optional

from src.modules.openclaw.base import OpenClawProvider


# 全局注册表
_provider_registry: Dict[str, Type[OpenClawProvider]] = {}
_config_schema_registry: Dict[str, Dict[str, Any]] = {}


def register_provider(name: str, config_schema: Dict[str, Any] = None):
    """注册 OpenClaw 提供商装饰器

    Args:
        name: 提供商名称
        config_schema: 配置字段定义

    用法：

        @register_provider("local", {
            "agent": str,
        })
        class LocalOpenClawProvider(OpenClawProvider):
            ...
    """

    def decorator(cls: Type[OpenClawProvider]):
        _provider_registry[name.lower()] = cls
        if config_schema:
            _config_schema_registry[name.lower()] = config_schema
        return cls

    return decorator


def get_provider_class(name: str) -> Optional[Type[OpenClawProvider]]:
    """获取提供商类"""
    return _provider_registry.get(name.lower())


def list_providers() -> list[str]:
    """列出所有已注册的提供商"""
    return list(_provider_registry.keys())


def get_config_schema(name: str) -> Optional[Dict[str, Any]]:
    """获取提供商的配置 schema"""
    return _config_schema_registry.get(name.lower())


def is_provider_registered(name: str) -> bool:
    """检查提供商是否已注册"""
    return name.lower() in _provider_registry
