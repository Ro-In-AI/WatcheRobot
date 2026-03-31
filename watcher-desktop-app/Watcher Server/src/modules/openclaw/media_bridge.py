"""OpenClaw 媒体桥接层。

负责把 Watcher 收到的媒体数据转换成 OpenClaw CLI 更稳定可消费的本地文件路径。

当前策略：
- 图片：落盘到 OpenClaw workspace 下的 `.watcher_media/images/`
- 视频：仅保留架构占位，后续再接关键帧/摘要方案
"""
from __future__ import annotations

import hashlib
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence
from uuid import uuid4

from src.config import settings
from src.modules.openclaw.base import ChatMedia, ChatMediaKind, ChatMessage


def _resolve_media_root(media_root: Optional[str | Path] = None) -> Path:
    if media_root is None:
        media_root = settings.openclaw_media_root
    return Path(media_root).expanduser().resolve()


def _extension_for_mime(mime_type: str, fallback: str) -> str:
    mapping = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/mjpeg": "mjpeg",
    }
    return mapping.get(mime_type, fallback)


class OpenClawMediaBridgeError(RuntimeError):
    """OpenClaw 媒体桥接错误。"""


class UnsupportedMediaBridgeError(OpenClawMediaBridgeError):
    """当前桥接层尚未实现该媒体类型。"""


@dataclass(slots=True)
class PreparedMediaReference:
    """一份已经落盘完成的媒体引用。"""

    kind: ChatMediaKind
    path: Path
    mime_type: str
    filename: str
    seq: Optional[int] = None


@dataclass(slots=True)
class PreparedMediaContext:
    """OpenClaw 可消费的媒体上下文。"""

    prompt: str
    references: list[PreparedMediaReference]

    def cleanup_files(self) -> None:
        """删除本次桥接生成的临时媒体文件。"""
        for reference in self.references:
            try:
                reference.path.unlink(missing_ok=True)
            except TypeError:
                if reference.path.exists():
                    reference.path.unlink()
            except FileNotFoundError:
                continue

            parent = reference.path.parent
            try:
                if parent.exists() and not any(parent.iterdir()):
                    parent.rmdir()
            except OSError:
                continue


class BaseMediaPreparer(ABC):
    """媒体落盘处理器基类。"""

    def __init__(self, media_root: Path, retention_seconds: int) -> None:
        self.media_root = media_root
        self.retention_seconds = retention_seconds

    @property
    @abstractmethod
    def kind(self) -> ChatMediaKind:
        """当前处理器负责的媒体类型。"""

    @abstractmethod
    def prepare(self, media: ChatMedia) -> PreparedMediaReference:
        """把媒体准备为 OpenClaw 可访问的本地文件。"""

    def _cleanup_expired_files(self, directory: Path) -> None:
        if self.retention_seconds <= 0 or not directory.exists():
            return

        now = time.time()
        for child in directory.iterdir():
            if not child.is_file():
                continue
            try:
                if now - child.stat().st_mtime > self.retention_seconds:
                    child.unlink()
            except FileNotFoundError:
                continue


class ImageMediaPreparer(BaseMediaPreparer):
    """图片桥接：直接落盘到 OpenClaw workspace。"""

    @property
    def kind(self) -> ChatMediaKind:
        return ChatMediaKind.IMAGE

    def prepare(self, media: ChatMedia) -> PreparedMediaReference:
        image_dir = self.media_root / "images" / time.strftime("%Y%m%d")
        image_dir.mkdir(parents=True, exist_ok=True)
        self._cleanup_expired_files(image_dir)

        digest = hashlib.sha1(media.data).hexdigest()[:12]
        extension = _extension_for_mime(media.mime_type, "jpg")
        seq = media.seq if media.seq is not None else 0
        filename = f"image-{seq}-{digest}-{uuid4().hex[:8]}.{extension}"
        path = image_dir / filename
        path.write_bytes(media.data)

        return PreparedMediaReference(
            kind=self.kind,
            path=path,
            mime_type=media.mime_type,
            filename=filename,
            seq=media.seq,
        )


class VideoMediaPreparer(BaseMediaPreparer):
    """视频桥接占位实现。

    后续预期在这里接入：
    - 关键帧抽取
    - contact sheet 拼图
    - 视频摘要文件
    """

    @property
    def kind(self) -> ChatMediaKind:
        return ChatMediaKind.VIDEO

    def prepare(self, media: ChatMedia) -> PreparedMediaReference:
        raise UnsupportedMediaBridgeError(
            "OpenClaw 视频桥接暂未实现。当前只支持图片桥接，视频流入口已预留。"
        )


class OpenClawMediaBridge:
    """OpenClaw 媒体桥接入口。"""

    def __init__(
        self,
        media_root: Optional[str | Path] = None,
        retention_seconds: Optional[int] = None,
    ) -> None:
        self.media_root = _resolve_media_root(media_root)
        self.retention_seconds = (
            settings.openclaw_media_retention_seconds
            if retention_seconds is None
            else retention_seconds
        )
        self._preparers = {
            ChatMediaKind.IMAGE: ImageMediaPreparer(self.media_root, self.retention_seconds),
            ChatMediaKind.VIDEO: VideoMediaPreparer(self.media_root, self.retention_seconds),
        }

    def supported_media_kinds(self) -> frozenset[ChatMediaKind]:
        return frozenset({ChatMediaKind.IMAGE})

    def get_runtime_info(self) -> dict:
        return {
            "media_root": str(self.media_root),
            "retention_seconds": self.retention_seconds,
            "supported_media_kinds": [kind.value for kind in self.supported_media_kinds()],
            "video_reserved": True,
        }

    def prepare_user_message(self, message: ChatMessage) -> PreparedMediaContext:
        references: list[PreparedMediaReference] = []

        for media in message.media:
            preparer = self._preparers.get(media.kind)
            if preparer is None:
                raise OpenClawMediaBridgeError(f"未知媒体类型: {media.kind.value}")
            references.append(preparer.prepare(media))

        prompt = self._build_prompt(message.content, references)
        return PreparedMediaContext(prompt=prompt, references=references)

    @staticmethod
    def _build_prompt(
        user_text: str,
        references: Sequence[PreparedMediaReference],
    ) -> str:
        parts: list[str] = [user_text.strip() or "请分析附带媒体。"]
        if not references:
            return parts[0]

        parts.extend(
            [
                "",
                "请先查看以下位于本地工作区的媒体文件，再结合用户问题回答：",
            ]
        )

        for index, reference in enumerate(references, start=1):
            parts.append(
                f"{index}. {reference.kind.value}: {reference.path}"
            )

        parts.append(
            "如果可用，请使用图片或文件读取相关工具读取这些路径；如果无法访问，请明确说明原因。"
        )
        return "\n".join(parts).strip()
