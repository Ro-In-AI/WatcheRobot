"""ASR 注册表 - 用于插件自动发现"""
from typing import Dict, Type, Any

# 全局注册表
_PROVIDER_REGISTRY: Dict[str, Type] = {}
_PROVIDER_CONFIG_SCHEMA: Dict[str, Dict[str, Any]] = {}


def register_provider(name: str, config_schema: Dict[str, Any] = None):
    """注册 ASR 提供商装饰器

    Args:
        name: 提供商名称
        config_schema: 配置字段定义

    用法：

        @register_provider("aliyun", {
            "appkey": str,
            "ak_id": str,
        })
        class AliyunASR(ASRProvider):
            ...
    """
    def decorator(cls):
        _PROVIDER_REGISTRY[name.lower()] = cls
        if config_schema:
            _PROVIDER_CONFIG_SCHEMA[name.lower()] = config_schema
        return cls
    return decorator


def get_provider_class(name: str):
    """获取 Provider 类"""
    return _PROVIDER_REGISTRY.get(name.lower())


def list_providers():
    """列出所有已注册的提供商"""
    return list(_PROVIDER_REGISTRY.keys())


def get_config_schema(name: str):
    """获取 Provider 的配置字段定义"""
    return _PROVIDER_CONFIG_SCHEMA.get(name.lower(), {})
