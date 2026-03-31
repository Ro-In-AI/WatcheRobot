"""消息分发处理器 - 统一处理文本消息与二进制帧。"""
from __future__ import annotations

from typing import Awaitable, Callable, Dict

from src.models.protocol import (
    BinaryFrame,
    BinaryFrameType,
    ProtocolError,
    TextMessage,
    TextMessageType,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)

TextHandler = Callable[[TextMessage], Awaitable[None]]
BinaryHandler = Callable[[BinaryFrame], Awaitable[None]]


class MessageDispatcher:
    """协议消息分发器。"""

    def __init__(self):
        self._text_handlers: Dict[str, TextHandler] = {}
        self._binary_handlers: Dict[BinaryFrameType, BinaryHandler] = {}

    def register_text_handler(
        self,
        msg_type: str | TextMessageType,
        handler: TextHandler,
    ) -> None:
        """注册文本消息处理器。"""
        self._text_handlers[_normalize_text_type(msg_type)] = handler

    def register_binary_handler(
        self,
        frame_type: BinaryFrameType,
        handler: BinaryHandler,
    ) -> None:
        """注册二进制帧处理器。"""
        self._binary_handlers[frame_type] = handler

    async def dispatch(self, message) -> None:
        """分发消息。"""
        if isinstance(message, bytes):
            await self._dispatch_binary(message)
            return

        if isinstance(message, str):
            await self._dispatch_text(message)
            return

        logger.warning(f"未知消息类型: {type(message).__name__}")

    async def _dispatch_binary(self, raw_message: bytes) -> None:
        """分发二进制消息。"""
        try:
            frame = BinaryFrame.from_bytes(raw_message)
        except ProtocolError as exc:
            logger.warning("二进制帧解析失败: {}", exc)
            return

        handler = self._binary_handlers.get(frame.frame_type)
        if handler is None:
            logger.warning("未注册的二进制帧类型: {}", frame.frame_type)
            return

        await handler(frame)

    async def _dispatch_text(self, raw_message: str) -> None:
        """分发文本消息。"""
        try:
            message = TextMessage.from_json(raw_message)
        except ProtocolError as exc:
            logger.debug("忽略无法解析的文本消息: {}", exc)
            return

        handler = self._text_handlers.get(message.type)
        if handler:
            await handler(message)
            return

        logger.debug("未注册的文本消息类型: {}", message.type)


def _normalize_text_type(msg_type: str | TextMessageType) -> str:
    if isinstance(msg_type, TextMessageType):
        return msg_type.value
    return msg_type
