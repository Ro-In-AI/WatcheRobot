"""数据模型"""

from .protocol import (
    BinaryFrame,
    BinaryFrameFlag,
    BinaryFrameType,
    ClientRole,
    TextMessageType,
    ProtocolError,
    TextMessage,
)

__all__ = [
    "BinaryFrame",
    "BinaryFrameFlag",
    "BinaryFrameType",
    "ClientRole",
    "TextMessageType",
    "ProtocolError",
    "TextMessage",
]
