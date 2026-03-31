"""传输会话类消息处理器。"""
from __future__ import annotations

from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import ensure_role, forward_text_to_role, reject_server_only_message
from src.models.protocol import ClientRole, TextMessage, TextMessageType
from src.utils.logger import get_logger

logger = get_logger(__name__)


async def handle_xfer_ota_handshake(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    """处理硬件端 OTA 握手信息。"""
    if not await ensure_role(context, TextMessageType.XFER_OTA_HANDSHAKE, (ClientRole.HARDWARE,)):
        return

    forwarded = await forward_text_to_role(context, ClientRole.DESKTOP, message)
    logger.debug("转发 OTA 握手消息: client_id={}, forwarded={}", context.client_id, forwarded)


async def handle_xfer_ota_checksum(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    """当前由服务端下发 OTA 校验信息，客户端上行不允许发送。"""
    await reject_server_only_message(context, TextMessageType.XFER_OTA_CHECKSUM)
