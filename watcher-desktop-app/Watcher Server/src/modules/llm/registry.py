"""LLM 提供商注册系统

提供插件式的提供商注册机制，支持自声明配置 schema
"""
from typing import Dict, Type, Optional, Any
from src.modules.llm.base import LLMProvider


# 全局注册表
_provider_registry: Dict[str, Type[LLMProvider]] = {}
_config_schema_registry: Dict[str, Dict[str, Any]] = {}


def register_provider(
    name: str,
    config_schema: Dict[str, Any]
) -> callable:
    """注册 LLM 提供商

    Args:
        name: 提供商名称（如 "ark", "openai", "anthropic"）
        config_schema: 配置 schema，定义提供商支持的配置字段及其类型
                       格式: {"field_name": type, ...}

    Returns:
        装饰器函数

    Example:
        @register_provider("ark", {
            "api_key": str,
            "model": str,
            "base_url": str,
        })
        class ArkLLM(LLMProvider):
            ...
    """
    def decorator(cls: Type[LLMProvider]) -> Type[LLMProvider]:
        _provider_registry[name.lower()] = cls
        _config_schema_registry[name.lower()] = config_schema
        return cls

    return decorator


def get_provider_class(name: str) -> Optional[Type[LLMProvider]]:
    """获取提供商类

    Args:
        name: 提供商名称

    Returns:
        提供商类，如果不存在则返回 None
    """
    return _provider_registry.get(name.lower())


def list_providers() -> list[str]:
    """列出所有已注册的提供商

    Returns:
        提供商名称列表
    """
    return list(_provider_registry.keys())


def get_config_schema(name: str) -> Optional[Dict[str, Any]]:
    """获取提供商的配置 schema

    Args:
        name: 提供商名称

    Returns:
        配置 schema，如果提供商不存在则返回 None
    """
    return _config_schema_registry.get(name.lower())


def is_provider_registered(name: str) -> bool:
    """检查提供商是否已注册

    Args:
        name: 提供商名称

    Returns:
        是否已注册
    """
    return name.lower() in _provider_registry
