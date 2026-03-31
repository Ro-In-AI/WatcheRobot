"""AI 状态发送控制器。"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from src.core.ai_status_catalog import ai_status_catalog
from src.models.protocol import ClientRole, TextMessageType

if TYPE_CHECKING:
    from src.core.websocket_server import WebSocketServer


class AIStatusController:
    """统一封装 AI 状态的校验、资源补齐与发送。"""

    def list_statuses(self) -> list[str]:
        return ai_status_catalog.list_statuses()

    def build_payload_data(
        self,
        status: str,
        *,
        message: str = "",
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        return ai_status_catalog.build_payload_data(
            status,
            message=message,
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )

    def normalize_payload_data(self, raw_data: Any) -> dict[str, Any]:
        if not isinstance(raw_data, dict):
            raise ValueError("data must be an object")

        status = raw_data.get("status")
        if not isinstance(status, str) or ai_status_catalog.get(status) is None:
            raise ValueError("status is invalid")

        message = raw_data.get("message", "")
        if message is not None and not isinstance(message, str):
            raise ValueError("message must be string")

        image_name = raw_data.get("image_name")
        if image_name is not None and not isinstance(image_name, str):
            raise ValueError("image_name must be string")

        action_file = raw_data.get("action_file")
        if action_file is not None and not isinstance(action_file, str):
            raise ValueError("action_file must be string")

        sound_file = raw_data.get("sound_file")
        if sound_file is not None and not isinstance(sound_file, str):
            raise ValueError("sound_file must be string")

        detail = raw_data.get("detail")
        if detail is not None and not isinstance(detail, dict):
            raise ValueError("detail must be object")

        return self.build_payload_data(
            status,
            message=message or "",
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )

    async def send_to_handler(
        self,
        handler,
        status: str,
        *,
        message: str = "",
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
    ) -> bool:
        payload = self.build_payload_data(
            status,
            message=message,
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )
        return await handler.send(TextMessageType.EVT_AI_STATUS, payload, 0)

    async def send_payload_to_handler(
        self,
        handler,
        payload: dict[str, Any],
    ) -> bool:
        return await handler.send(TextMessageType.EVT_AI_STATUS, payload, 0)

    async def broadcast_to_hardware(
        self,
        server: "WebSocketServer",
        status: str,
        *,
        message: str = "",
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
        exclude=None,
    ) -> int:
        payload = self.build_payload_data(
            status,
            message=message,
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )
        return await self.broadcast_payload_to_hardware(server, payload, exclude=exclude)

    async def broadcast_payload_to_hardware(
        self,
        server: "WebSocketServer",
        payload: dict[str, Any],
        *,
        exclude=None,
    ) -> int:
        return await server.broadcast_text_message(
            ClientRole.HARDWARE,
            TextMessageType.EVT_AI_STATUS.value,
            data=payload,
            code=0,
            exclude=exclude,
        )


ai_status_controller = AIStatusController()
