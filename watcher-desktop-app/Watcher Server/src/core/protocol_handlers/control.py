"""控制类消息处理器。"""
from __future__ import annotations

from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import (
    ensure_object_payload,
    ensure_role,
    reject_server_only_message,
)
from src.models.protocol import ClientRole, TextMessage, TextMessageType


async def handle_servo_angle(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """处理桌面端舵机控制。"""
    if not await ensure_role(
        context,
        TextMessageType.CTRL_SERVO_ANGLE,
        (ClientRole.DESKTOP,),
    ):
        return

    if not ensure_object_payload(message):
        await context.session.msg_handler.send_nack(
            TextMessageType.CTRL_SERVO_ANGLE,
            "data must be an object",
        )
        return

    forwarded = await context.server.broadcast_text_message(
        ClientRole.HARDWARE,
        TextMessageType.CTRL_SERVO_ANGLE,
        data=message.data,
        code=message.code,
    )
    if forwarded == 0:
        await context.session.msg_handler.send_nack(
            TextMessageType.CTRL_SERVO_ANGLE,
            "no hardware client is connected",
        )
        return

    await context.session.msg_handler.send_ack(
        TextMessageType.CTRL_SERVO_ANGLE,
        {"forwarded_clients": forwarded},
    )


async def handle_camera_video_config(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CTRL_CAMERA_VIDEO_CONFIG)


async def handle_camera_capture_image(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CTRL_CAMERA_CAPTURE_IMAGE)


async def handle_camera_start_video(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CTRL_CAMERA_START_VIDEO)


async def handle_camera_stop_video(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CTRL_CAMERA_STOP_VIDEO)
