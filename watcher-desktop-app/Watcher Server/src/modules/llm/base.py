"""LLM 基础类"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, AsyncIterator, Dict, Any, List
from enum import Enum


class Role(str, Enum):
    """对话角色"""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class Message:
    """对话消息"""
    role: Role
    content: str

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "role": self.role.value,
            "content": self.content
        }


@dataclass
class LLMResponse:
    """LLM 响应"""
    content: str  # 响应内容
    model: str  # 使用的模型
    finish_reason: Optional[str] = None  # 结束原因: stop, length, tool_calls, error
    usage: Optional[Dict[str, int]] = None  # token 使用情况
    raw_response: Optional[Dict[str, Any]] = None  # 原始响应


@dataclass
class LLMStreamChunk:
    """LLM 流式响应片段"""
    content: str  # 当前片段内容
    delta: str  # 增量内容
    is_final: bool = False  # 是否为最后一个片段
    finish_reason: Optional[str] = None  # 结束原因


@dataclass
class LLMConfig:
    """LLM 通用配置"""
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 0.9
    stream: bool = False


class LLMCallbacks:
    """LLM 回调函数

    用于在流式生成过程中接收中间结果
    """

    async def on_chunk(self, chunk: LLMStreamChunk) -> None:
        """收到流式片段时回调

        Args:
            chunk: 流式片段
        """
        pass

    async def on_start(self) -> None:
        """开始生成时回调"""
        pass

    async def on_complete(self, response: LLMResponse) -> None:
        """生成完成时回调

        Args:
            response: 完整响应
        """
        pass

    async def on_error(self, error: Exception) -> None:
        """发生错误时回调

        Args:
            error: 错误信息
        """
        pass


class LLMProvider(ABC):
    """LLM 提供商基类

    所有 LLM 提供商都需要实现此接口
    """

    def __init__(self):
        """初始化 LLM 提供商"""
        self._is_initialized = False
        self._callbacks: Optional[LLMCallbacks] = None

    @abstractmethod
    async def initialize(self) -> None:
        """初始化 LLM 客户端

        此方法用于建立连接、验证凭证等初始化操作
        """
        pass

    @abstractmethod
    async def chat(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> LLMResponse:
        """发送聊天请求（非流式）

        Args:
            messages: 消息列表
            config: LLM 配置
            **kwargs: 其他参数

        Returns:
            LLM 响应
        """
        pass

    @abstractmethod
    async def chat_stream(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> AsyncIterator[LLMStreamChunk]:
        """发送聊天请求（流式）

        Args:
            messages: 消息列表
            config: LLM 配置
            **kwargs: 其他参数

        Yields:
            LLM 流式响应片段
        """
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """清理资源"""
        pass

    def set_callbacks(self, callbacks: LLMCallbacks) -> None:
        """设置回调函数

        Args:
            callbacks: 回调函数对象
        """
        self._callbacks = callbacks

    @property
    def is_initialized(self) -> bool:
        """是否已初始化"""
        return self._is_initialized

    @property
    def callbacks(self) -> Optional[LLMCallbacks]:
        """获取回调函数"""
        return self._callbacks
