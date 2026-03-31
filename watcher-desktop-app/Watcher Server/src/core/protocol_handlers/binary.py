"""二进制帧处理器。"""
from __future__ import annotations

from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import ensure_role, forward_binary_to_role
from src.models.protocol import BinaryFrame, BinaryFrameFlag, ClientRole
from src.utils.logger import get_logger

logger = get_logger(__name__)


async def handle_audio_frame(
    context: ProtocolHandlerContext,
    frame: BinaryFrame,
) -> None:
    """处理硬件端上行音频帧。"""
    if not await ensure_role(context, "binary.audio", (ClientRole.HARDWARE,)):
        return

    await context.session.feed_audio(frame.payload)

    if frame.flags & BinaryFrameFlag.LAST:
        logger.info(
            "收到音频末帧，结束会话: client_id={}, seq={}",
            context.client_id,
            frame.seq,
        )
        await context.session.end_session()


async def handle_video_frame(
    context: ProtocolHandlerContext,
    frame: BinaryFrame,
) -> None:
    """处理硬件端上行视频帧。"""
    if not await ensure_role(context, "binary.video", (ClientRole.HARDWARE,)):
        return

    normalized_frame = context.session.normalize_media_frame(frame)
    asset = context.session.ingest_media_frame(normalized_frame)
    forwarded = await forward_binary_to_role(context, ClientRole.DESKTOP, normalized_frame)
    if asset is not None:
        logger.debug(
            "视频帧已缓存: client_id={}, seq={}, bytes={}, forwarded={}",
            context.client_id,
            asset.seq,
            len(asset.data),
            forwarded,
        )
    if normalized_frame.flags & BinaryFrameFlag.LAST:
        logger.info(
            "视频流结束: client_id={}, seq={}, forwarded={}",
            context.client_id,
            normalized_frame.seq,
            forwarded,
        )
    logger.debug(
        "转发视频帧: client_id={}, seq={}, forwarded={}",
        context.client_id,
        normalized_frame.seq,
        forwarded,
    )


async def handle_image_frame(
    context: ProtocolHandlerContext,
    frame: BinaryFrame,
) -> None:
    """处理硬件端上行图片帧。"""
    if not await ensure_role(context, "binary.image", (ClientRole.HARDWARE,)):
        return

    normalized_frame = context.session.normalize_media_frame(frame)
    asset = context.session.ingest_media_frame(normalized_frame)
    forwarded = await forward_binary_to_role(context, ClientRole.DESKTOP, normalized_frame)
    if asset is not None:
        logger.info(
            "图片流完成并已缓存: client_id={}, bytes={}, forwarded={}",
            context.client_id,
            len(asset.data),
            forwarded,
        )
    logger.debug(
        "转发图片帧: client_id={}, seq={}, forwarded={}",
        context.client_id,
        normalized_frame.seq,
        forwarded,
    )


async def handle_ota_frame(
    context: ProtocolHandlerContext,
    _frame: BinaryFrame,
) -> None:
    """客户端不允许上行 OTA 数据帧。"""
    await context.session.msg_handler.send_nack(
        "binary.ota",
        "client cannot upload ota binary frame",
        data={"role": context.role.value},
    )
