"""WebSocket 消息接收处理器"""
import json
from typing import Set, Any

import websockets

from src.utils.logger import get_logger

logger = get_logger(__name__)


class MessageReceiver:
    """WebSocket 消息接收处理器"""

    def __init__(
        self,
        connected_clients: Set[websockets.WebSocketServerProtocol],
    ):
        """初始化消息接收处理器

        Args:
            connected_clients: 所有已连接的 WebSocket 客户端集合
        """
        self.connected_clients = connected_clients

    async def handle_message(self, message: Any) -> bool:
        """处理接收到的消息

        Args:
            message: 接收到的消息 (str 或 bytes)

        Returns:
            bool: 是否处理了消息
        """
        # 处理字符串消息
        if isinstance(message, str):
            return await self._handle_string_message(message)

        return False

    async def _handle_string_message(self, message: str) -> bool:
        """处理字符串消息

        Args:
            message: 字符串消息

        Returns:
            bool: 是否处理了消息
        """
        # 尝试解析 JSON
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            pass

        # 处理 "over" 字符串
        if message == "over":
            logger.info("Received 'over' marker")
            # over 的处理逻辑由调用方处理，这里返回 False
            return False

        return False
