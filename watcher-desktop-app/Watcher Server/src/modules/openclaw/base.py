"""OpenClaw基础类"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional


@dataclass
class ChatMessage:
    """聊天消息"""
    role: str  # system, user, assistant
    content: str  # 消息内容
    media: List["ChatMedia"] = field(default_factory=list)  # 附带媒体输入


class ChatMediaKind(str, Enum):
    """媒体类型。"""

    IMAGE = "image"
    VIDEO = "video"


@dataclass
class ChatMedia:
    """聊天消息附带的媒体输入。"""

    kind: ChatMediaKind
    data: bytes
    mime_type: str
    filename: Optional[str] = None
    seq: Optional[int] = None
    source_url: Optional[str] = None


@dataclass
class ChatResponse:
    """聊天响应"""
    content: str  # 响应内容
    model: str  # 使用的模型
    finish_reason: Optional[str] = None  # 结束原因
    usage: Optional[dict] = field(default_factory=dict)  # 使用量统计


class OpenClawProvider(ABC):
    """OpenClaw提供商基类"""

    def __init__(self):
        """初始化OpenClaw提供商"""
        self._is_initialized = False

    @abstractmethod
    async def initialize(self):
        """初始化OpenClaw客户端"""
        pass

    @abstractmethod
    async def chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        **kwargs
    ) -> ChatResponse:
        """发送聊天请求

        Args:
            messages: 消息列表
            model: 模型名称
            **kwargs: 其他参数

        Returns:
            聊天响应
        """
        pass

    @abstractmethod
    async def cleanup(self):
        """清理资源"""
        pass

    @property
    def is_initialized(self) -> bool:
        """是否已初始化"""
        return self._is_initialized

    def set_callbacks(
        self,
        on_status_change: Optional[Callable[[str, dict], None]] = None,
        on_log: Optional[Callable[[str, str], None]] = None,
    ):
        """设置或更新回调函数"""
        if hasattr(self, "on_status_change"):
            self.on_status_change = on_status_change
        if hasattr(self, "on_log"):
            self.on_log = on_log

    def supported_media_kinds(self) -> frozenset[ChatMediaKind]:
        """返回当前 Provider 可直接理解的媒体类型。"""
        return frozenset()

    def get_runtime_info(self) -> dict:
        """返回 Provider 运行时信息，供外层诊断与展示。"""
        return {}
