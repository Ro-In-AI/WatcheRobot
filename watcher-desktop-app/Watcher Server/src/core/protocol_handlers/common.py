"""协议处理公共辅助函数。"""
from __future__ import annotations

from collections.abc import Iterable

from src.core.protocol_context import ProtocolHandlerContext
from src.models.protocol import BinaryFrame, ClientRole, TextMessage, TextMessageType


def _normalize_message_type(message_type: str | TextMessageType) -> str:
    if isinstance(message_type, TextMessageType):
        return message_type.value
    return message_type


async def ensure_declared_role(
    context: ProtocolHandlerContext,
    message_type: str | TextMessageType,
) -> bool:
    """确保连接已声明角色。"""
    if context.role is not ClientRole.UNKNOWN:
        return True

    await context.session.msg_handler.send_nack(
        message_type,
        "client role is not declared",
        data={"required": TextMessageType.SYS_CLIENT_HELLO.value},
    )
    return False


async def ensure_role(
    context: ProtocolHandlerContext,
    message_type: str | TextMessageType,
    allowed_roles: Iterable[ClientRole],
) -> bool:
    """校验当前连接角色是否允许发送该消息。"""
    allowed_roles = tuple(allowed_roles)
    if not await ensure_declared_role(context, message_type):
        return False

    if context.role in allowed_roles:
        return True

    await context.session.msg_handler.send_nack(
        message_type,
        f"{context.role.value} client cannot send this message",
        data={"role": context.role.value, "allowed_roles": [role.value for role in allowed_roles]},
    )
    return False


async def reject_server_only_message(
    context: ProtocolHandlerContext,
    message_type: str | TextMessageType,
) -> None:
    """拒绝客户端发送仅服务端下发的消息。"""
    await context.session.msg_handler.send_nack(
        message_type,
        "this message is server-originated only",
        data={"role": context.role.value},
    )


async def reject_not_implemented(
    context: ProtocolHandlerContext,
    message_type: str | TextMessageType,
) -> None:
    """返回暂未实现。"""
    await context.session.msg_handler.send_nack(
        message_type,
        "handler is registered but not implemented yet",
        data={"role": context.role.value},
    )


async def forward_text_to_role(
    context: ProtocolHandlerContext,
    role: ClientRole,
    message: TextMessage,
) -> int:
    """转发文本消息给指定角色客户端。"""
    return await context.server.broadcast_text_message(
        role,
        message.type,
        data=message.data,
        code=message.code,
        exclude=context.websocket,
    )


async def forward_binary_to_role(
    context: ProtocolHandlerContext,
    role: ClientRole,
    frame: BinaryFrame,
) -> int:
    """转发二进制帧给指定角色客户端。"""
    return await context.server.broadcast_binary_frame(
        role,
        frame,
        exclude=context.websocket,
    )


def ensure_object_payload(message: TextMessage) -> bool:
    """校验 data 是否为对象。"""
    return isinstance(message.data, dict)


def normalize_message_type(message_type: str | TextMessageType) -> str:
    """供外部调用的消息类型标准化。"""
    return _normalize_message_type(message_type)
