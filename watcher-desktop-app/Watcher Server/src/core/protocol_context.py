"""协议处理上下文。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import websockets

from src.models.protocol import ClientRole

if TYPE_CHECKING:
    from src.core.audio_session_handler import AudioSessionHandler
    from src.core.websocket_server import WebSocketServer


@dataclass(slots=True)
class ProtocolHandlerContext:
    """单连接协议处理上下文。"""

    server: "WebSocketServer"
    websocket: websockets.WebSocketServerProtocol
    session: "AudioSessionHandler"

    @property
    def client_id(self) -> int:
        return id(self.websocket)

    @property
    def role(self) -> ClientRole:
        return self.server.get_client_role(self.websocket)

    @property
    def runtime(self):
        return self.server.runtime_services

    @property
    def scheduler(self):
        return getattr(self.server, "scheduler_service", None)
