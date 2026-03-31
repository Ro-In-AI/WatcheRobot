from tempfile import TemporaryDirectory

from src.modules.openclaw.base import ChatMedia, ChatMediaKind, ChatMessage
from src.modules.openclaw.media_bridge import (
    OpenClawMediaBridge,
    UnsupportedMediaBridgeError,
)


def test_image_bridge_persists_file_and_builds_prompt():
    with TemporaryDirectory() as tmpdir:
        bridge = OpenClawMediaBridge(media_root=tmpdir, retention_seconds=60)
        image = b"\xff\xd8\xffdemo-image"
        context = bridge.prepare_user_message(
            ChatMessage(
                role="user",
                content="这张图片里有什么？",
                media=[
                    ChatMedia(
                        kind=ChatMediaKind.IMAGE,
                        data=image,
                        mime_type="image/jpeg",
                        seq=7,
                    )
                ],
            )
        )

        assert len(context.references) == 1
        reference = context.references[0]
        assert reference.kind is ChatMediaKind.IMAGE
        assert reference.path.exists()
        assert reference.path.read_bytes() == image
        assert "这张图片里有什么？" in context.prompt
        assert str(reference.path) in context.prompt

        context.cleanup_files()
        assert not reference.path.exists()


def test_video_bridge_is_reserved_for_future_implementation():
    with TemporaryDirectory() as tmpdir:
        bridge = OpenClawMediaBridge(media_root=tmpdir, retention_seconds=60)
        try:
            bridge.prepare_user_message(
                ChatMessage(
                    role="user",
                    content="请分析这个视频",
                    media=[
                        ChatMedia(
                            kind=ChatMediaKind.VIDEO,
                            data=b"fake-video",
                            mime_type="video/mjpeg",
                            seq=1,
                        )
                    ],
                )
            )
        except UnsupportedMediaBridgeError as exc:
            assert "视频桥接暂未实现" in str(exc)
        else:
            raise AssertionError("expected UnsupportedMediaBridgeError for video bridge placeholder")
