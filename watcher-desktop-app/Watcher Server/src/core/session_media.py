"""会话级媒体缓存与重组。"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterable, Optional

from src.models.protocol import BinaryFrame, BinaryFrameFlag, BinaryFrameType
from src.modules.openclaw.base import ChatMedia, ChatMediaKind


def _trim_jpeg_padding(data: bytes) -> bytes:
    """按协议兼容 JPEG 尾部 0x00 padding。"""
    if not data.startswith(b"\xff\xd8"):
        return data

    eoi = data.rfind(b"\xff\xd9")
    if eoi < 0:
        return data

    return data[: eoi + 2]


def normalize_media_payload(frame_type: BinaryFrameType, payload: bytes) -> bytes:
    """规范化图片/视频帧负载，兼容硬件端 JPEG 尾部 padding。"""
    if not payload:
        return payload

    if frame_type in {BinaryFrameType.IMAGE, BinaryFrameType.VIDEO}:
        return _trim_jpeg_padding(payload)

    return payload


def normalize_media_frame(frame: BinaryFrame) -> BinaryFrame:
    """返回协议兼容的标准化媒体帧。"""
    normalized_payload = normalize_media_payload(frame.frame_type, frame.payload)
    if normalized_payload == frame.payload:
        return frame

    return BinaryFrame(
        frame_type=frame.frame_type,
        flags=frame.flags,
        seq=frame.seq,
        payload=normalized_payload,
    )


def _infer_image_mime(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


def _infer_video_mime(data: bytes) -> str:
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return "video/mp4"
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return "video/webm"
    return "video/mjpeg"


def _frame_type_to_kind(frame_type: BinaryFrameType) -> Optional[ChatMediaKind]:
    if frame_type is BinaryFrameType.IMAGE:
        return ChatMediaKind.IMAGE
    if frame_type is BinaryFrameType.VIDEO:
        return ChatMediaKind.VIDEO
    return None


@dataclass(slots=True)
class SessionMediaAsset:
    """一份已完成接收的会话媒体资产。"""

    kind: ChatMediaKind
    data: bytes
    mime_type: str
    seq: int
    received_at: float

    def to_chat_media(self) -> ChatMedia:
        if self.kind is ChatMediaKind.IMAGE:
            extension = "jpg"
        elif self.mime_type == "video/webm":
            extension = "webm"
        elif self.mime_type == "video/mp4":
            extension = "mp4"
        else:
            extension = "mjpeg"
        return ChatMedia(
            kind=self.kind,
            data=self.data,
            mime_type=self.mime_type,
            filename=f"{self.kind.value}-{self.seq}.{extension}",
            seq=self.seq,
        )


class SessionMediaStore:
    """按连接缓存最近一次完整图片/视频，并负责分片重组。"""

    def __init__(self) -> None:
        self._inflight: dict[BinaryFrameType, bytearray] = {}
        self._latest: dict[ChatMediaKind, SessionMediaAsset] = {}

    def append_frame(self, frame: BinaryFrame) -> Optional[SessionMediaAsset]:
        """写入一帧图片/视频数据；若形成完整媒体则返回该资产。"""
        kind = _frame_type_to_kind(frame.frame_type)
        if kind is None:
            return None

        if kind is ChatMediaKind.VIDEO and not (frame.flags & BinaryFrameFlag.FRAGMENT):
            if not frame.payload:
                self._inflight.pop(frame.frame_type, None)
                return None

            data = normalize_media_payload(frame.frame_type, frame.payload)
            asset = SessionMediaAsset(
                kind=kind,
                data=data,
                mime_type=_infer_video_mime(data),
                seq=frame.seq,
                received_at=time.time(),
            )
            self._latest[kind] = asset
            return asset

        key = frame.frame_type
        if key not in self._inflight or frame.flags & BinaryFrameFlag.FIRST:
            self._inflight[key] = bytearray()

        buffer = self._inflight[key]
        buffer.extend(frame.payload)

        if not (frame.flags & BinaryFrameFlag.LAST):
            return None

        data = normalize_media_payload(frame.frame_type, bytes(buffer))
        self._inflight.pop(key, None)

        mime_type = _infer_image_mime(data) if kind is ChatMediaKind.IMAGE else _infer_video_mime(data)
        asset = SessionMediaAsset(
            kind=kind,
            data=data,
            mime_type=mime_type,
            seq=frame.seq,
            received_at=time.time(),
        )
        self._latest[kind] = asset
        return asset

    def get_recent_media(
        self,
        supported_kinds: Iterable[ChatMediaKind],
        *,
        max_age_seconds: float = 60.0,
    ) -> list[ChatMedia]:
        """取出最近可用于 AI 的媒体。"""
        cutoff = time.time() - max_age_seconds
        recent: list[SessionMediaAsset] = []
        for kind in supported_kinds:
            asset = self._latest.get(kind)
            if asset and asset.received_at >= cutoff:
                recent.append(asset)

        recent.sort(key=lambda item: item.received_at)
        return [asset.to_chat_media() for asset in recent]

    def discard_kinds(self, kinds: Iterable[ChatMediaKind]) -> None:
        """丢弃已消费的最近媒体。"""
        for kind in kinds:
            self._latest.pop(kind, None)
