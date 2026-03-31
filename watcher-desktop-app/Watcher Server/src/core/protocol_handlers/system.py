"""系统治理类消息处理器。"""
from __future__ import annotations

import asyncio

from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import ensure_object_payload
from src.models.protocol import ClientRole, ProtocolError, TextMessage, TextMessageType
from src.utils.logger import get_logger

logger = get_logger(__name__)


async def handle_client_hello(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """处理客户端角色声明。"""
    if not ensure_object_payload(message):
        await context.session.msg_handler.send_nack(
            TextMessageType.SYS_CLIENT_HELLO,
            "data must be an object",
        )
        return

    current_role = context.server.get_client_role(context.websocket)
    try:
        declared_role = ClientRole.from_value(message.data.get("role"))
    except ProtocolError as exc:
        await context.session.msg_handler.send_nack(TextMessageType.SYS_CLIENT_HELLO, str(exc))
        return

    if declared_role is ClientRole.UNKNOWN:
        await context.session.msg_handler.send_nack(
            TextMessageType.SYS_CLIENT_HELLO,
            "role must be hardware or desktop",
        )
        return

    if current_role not in (ClientRole.UNKNOWN, declared_role):
        await context.session.msg_handler.send_nack(
            TextMessageType.SYS_CLIENT_HELLO,
            f"role already locked as {current_role.value}",
            data={"role": current_role.value},
        )
        return

    metadata: dict = {"role": declared_role.value}
    if declared_role is ClientRole.HARDWARE:
        fw_version = message.data.get("fw_version")
        if not isinstance(fw_version, str) or not fw_version.strip():
            await context.session.msg_handler.send_nack(
                TextMessageType.SYS_CLIENT_HELLO,
                "hardware client must provide fw_version",
            )
            return

        metadata["fw_version"] = fw_version.strip()

    if declared_role is ClientRole.HARDWARE:
        try:
            await context.runtime.ensure_asr_provider()
        except Exception as exc:
            logger.error(f"硬件端 ASR 预初始化失败: {exc}")
            await context.session.msg_handler.send_nack(
                TextMessageType.SYS_CLIENT_HELLO,
                f"ASR init failed - {exc}",
                data={"role": declared_role.value},
            )
            return

    context.server.client_roles[context.websocket] = declared_role
    context.server.client_last_seen[context.websocket] = asyncio.get_running_loop().time()
    context.server.client_metadata[context.websocket] = metadata

    if declared_role is ClientRole.HARDWARE:
        context.server.device_registry.update_hardware_hello(
            context.websocket,
            client_id=context.client_id,
            fw_version=metadata["fw_version"],
        )
        await context.server.sync_discovery_server_state()

    logger.info(
        "客户端 {} 已声明角色: {}, metadata={}",
        context.client_id,
        declared_role.value,
        metadata,
    )

    await context.session.msg_handler.send_ack(
        TextMessageType.SYS_CLIENT_HELLO,
        metadata,
    )

    if declared_role is ClientRole.HARDWARE:
        await context.server.broadcast_device_status()
    elif declared_role is ClientRole.DESKTOP:
        await context.server.send_device_status_to(context.websocket)


async def handle_ack(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """记录客户端 ACK。"""
    logger.info("收到客户端 ACK: client_id={}, payload={}", context.client_id, message.data)


async def handle_nack(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """记录客户端 NACK。"""
    logger.warning("收到客户端 NACK: client_id={}, payload={}", context.client_id, message.data)


async def handle_ping(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """处理客户端 ping。"""
    context.server.client_last_seen[context.websocket] = asyncio.get_running_loop().time()
    await context.session.msg_handler.send(
        TextMessageType.SYS_PONG,
        message.data if ensure_object_payload(message) else {},
    )


async def handle_pong(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """处理客户端 pong。"""
    context.server.client_last_seen[context.websocket] = asyncio.get_running_loop().time()
    logger.debug("收到客户端 pong: client_id={}, payload={}", context.client_id, message.data)


async def handle_session_resume(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    """处理会话恢复。"""
    await context.session.msg_handler.send_nack(
        TextMessageType.SYS_SESSION_RESUME,
        "session resume is not implemented yet",
    )
