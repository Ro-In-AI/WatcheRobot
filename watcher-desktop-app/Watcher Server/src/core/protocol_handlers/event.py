"""事件类消息处理器。"""
from __future__ import annotations

from src.core.ai_status_controller import ai_status_controller
from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import (
    ensure_object_payload,
    ensure_role,
    forward_text_to_role,
    reject_server_only_message,
)
from src.models.protocol import ClientRole, TextMessage, TextMessageType
from src.utils.logger import get_logger

logger = get_logger(__name__)


async def handle_evt_asr_result(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.EVT_ASR_RESULT)


async def handle_evt_ai_status(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_AI_STATUS, (ClientRole.DESKTOP,)):
        return

    if not ensure_object_payload(message):
        await context.session.msg_handler.send_nack(
            TextMessageType.EVT_AI_STATUS,
            "data must be an object",
        )
        return

    status = message.data.get("status")
    if not isinstance(status, str):
        await context.session.msg_handler.send_nack(
            TextMessageType.EVT_AI_STATUS,
            "status is invalid",
            data={"allowed_statuses": ai_status_controller.list_statuses()},
        )
        return

    try:
        payload = ai_status_controller.normalize_payload_data(message.data)
    except ValueError as exc:
        await context.session.msg_handler.send_nack(
            TextMessageType.EVT_AI_STATUS,
            str(exc),
            data={"allowed_statuses": ai_status_controller.list_statuses()} if str(exc) == "status is invalid" else None,
        )
        return

    forwarded = await context.server.ai_status_controller.broadcast_payload_to_hardware(
        context.server,
        payload,
        exclude=context.websocket,
    )
    if forwarded == 0:
        await context.session.msg_handler.send_nack(
            TextMessageType.EVT_AI_STATUS,
            "no hardware client is connected",
        )
        return

    await context.session.msg_handler.send_ack(
        TextMessageType.EVT_AI_STATUS,
        {"forwarded_clients": forwarded, "status": status},
    )


async def handle_evt_ai_thinking(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.EVT_AI_THINKING)


async def handle_evt_ai_reply(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.EVT_AI_REPLY)


async def handle_evt_server_error(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.EVT_SERVER_ERROR)


async def handle_evt_device_status(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.EVT_DEVICE_STATUS)


async def handle_evt_camera_state(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_CAMERA_STATE, (ClientRole.HARDWARE,)):
        return

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发相机状态事件: client_id={}, forwarded={}", context.client_id, forwarded)


async def handle_evt_servo_position(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_SERVO_POSITION, (ClientRole.HARDWARE,)):
        return

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发舵机位置事件: client_id={}, forwarded={}", context.client_id, forwarded)


async def handle_evt_ota_progress(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_OTA_PROGRESS, (ClientRole.HARDWARE,)):
        return

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发 OTA 进度事件: client_id={}, forwarded={}", context.client_id, forwarded)


async def handle_evt_device_error(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_DEVICE_ERROR, (ClientRole.HARDWARE,)):
        return

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发设备错误事件: client_id={}, forwarded={}", context.client_id, forwarded)


async def handle_evt_device_firmware(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.EVT_DEVICE_FIRMWARE, (ClientRole.HARDWARE,)):
        return

    if isinstance(message.data, dict):
        context.server.device_registry.update_hardware_firmware(
            context.websocket,
            message.data,
            client_id=context.client_id,
        )

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发固件信息事件: client_id={}, forwarded={}", context.client_id, forwarded)
    await context.server.broadcast_device_status()
