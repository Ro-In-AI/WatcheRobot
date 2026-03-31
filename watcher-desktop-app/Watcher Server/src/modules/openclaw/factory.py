"""OpenClaw 工厂 - 负责根据配置创建 Provider 实例"""
from typing import Optional, Dict, Any

from .base import OpenClawProvider
from .registry import get_provider_class, list_providers


class OpenClawFactory:
    """OpenClaw Provider 工厂"""

    @staticmethod
    def create(
        provider: str = "auto",
        **kwargs,
    ) -> OpenClawProvider:
        """创建 OpenClaw Provider 实例

        Args:
            provider: 提供商名称（如 'local', 'tmux'），
                      支持 'auto' 自动选择（优先 tmux）
            **kwargs: 传递给 Provider 构造函数的参数

        Returns:
            OpenClawProvider 实例
        """
        # 自动选择模式
        if not provider or provider.lower() == "auto":
            # 当 tmux 可用时优先使用 tmux 实现
            tmux_cls = get_provider_class("tmux")
            if tmux_cls and getattr(tmux_cls, "is_tmux_available", lambda: False)():
                provider = "tmux"
            else:
                provider = "local"

        provider_class = get_provider_class(provider)
        if not provider_class:
            available = list_providers()
            raise ValueError(
                f"不支持的 OpenClaw 提供商: {provider}。可用提供商: {available}"
            )

        return provider_class(**kwargs)
