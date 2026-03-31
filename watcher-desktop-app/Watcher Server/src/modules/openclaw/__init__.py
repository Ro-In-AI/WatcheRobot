"""OpenClaw模块 - AI对话"""
from typing import Callable, Optional

from .base import ChatMedia, ChatMediaKind, ChatMessage, ChatResponse, OpenClawProvider
from .factory import OpenClawFactory
from .llm_adapter import LLMAsOpenClawProvider
from .registry import list_providers

# 兼容性导出
from .local_claw import LocalOpenClawProvider

try:
    from .tmux_claw import TmuxOpenClawProvider
except ImportError:
    TmuxOpenClawProvider = None


def is_tmux_available() -> bool:
    """检测系统是否支持 tmux"""

    # tmux 提供商会在其类中实现该检测方法
    from .registry import get_provider_class

    tmux_cls = get_provider_class("tmux")
    if not tmux_cls:
        return False

    return getattr(tmux_cls, "is_tmux_available", lambda: False)()


def create_openclaw_provider(
    provider: Optional[str] = None,
    **kwargs,
) -> OpenClawProvider:
    """创建 OpenClaw 提供商实例

    Args:
        provider: 提供商名称（如 "tmux"、"local"），为空或 "auto" 表示自动选择
        **kwargs: 传递给 Provider 构造函数的参数

    Returns:
        OpenClawProvider: OpenClaw 提供商实例
    """
    try:
        return OpenClawFactory.create(provider=provider or "auto", **kwargs)
    except Exception as e:
        # 如果无法创建 OpenClaw Provider，抛出异常交由调用方处理
        raise


__all__ = [
    "OpenClawProvider",
    "ChatMedia",
    "ChatMediaKind",
    "ChatMessage",
    "ChatResponse",
    "LocalOpenClawProvider",
    "TmuxOpenClawProvider",
    "create_openclaw_provider",
    "is_tmux_available",
    "list_providers",
]
