from src.core.session_media import SessionMediaStore
from src.models.protocol import BinaryFrame, BinaryFrameFlag, BinaryFrameType
from src.modules.openclaw.base import ChatMediaKind


def test_image_frames_are_reassembled_and_exposed_for_ai():
    store = SessionMediaStore()
    jpeg = b"\xff\xd8\xff" + b"demo-image-bytes"

    first = BinaryFrame(
        frame_type=BinaryFrameType.IMAGE,
        flags=BinaryFrameFlag.FIRST,
        seq=0,
        payload=jpeg[:5],
    )
    last = BinaryFrame(
        frame_type=BinaryFrameType.IMAGE,
        flags=BinaryFrameFlag.LAST,
        seq=1,
        payload=jpeg[5:],
    )

    assert store.append_frame(first) is None
    asset = store.append_frame(last)

    assert asset is not None
    assert asset.kind is ChatMediaKind.IMAGE
    assert asset.data == jpeg
    assert asset.mime_type == "image/jpeg"

    recent = store.get_recent_media([ChatMediaKind.IMAGE])
    assert len(recent) == 1
    assert recent[0].data == jpeg


def test_discard_consumed_media():
    store = SessionMediaStore()
    frame = BinaryFrame(
        frame_type=BinaryFrameType.IMAGE,
        flags=BinaryFrameFlag.FIRST | BinaryFrameFlag.LAST,
        seq=0,
        payload=b"\x89PNG\r\n\x1a\npng",
    )
    store.append_frame(frame)
    assert store.get_recent_media([ChatMediaKind.IMAGE])

    store.discard_kinds([ChatMediaKind.IMAGE])
    assert store.get_recent_media([ChatMediaKind.IMAGE]) == []


def test_image_padding_is_trimmed_to_last_jpeg_eoi():
    store = SessionMediaStore()
    jpeg = b"\xff\xd8\xffdemo-image\xff\xd9"
    padded = jpeg + (b"\x00" * 33)
    frame = BinaryFrame(
        frame_type=BinaryFrameType.IMAGE,
        flags=BinaryFrameFlag.FIRST | BinaryFrameFlag.LAST | BinaryFrameFlag.KEYFRAME,
        seq=1,
        payload=padded,
    )

    asset = store.append_frame(frame)

    assert asset is not None
    assert asset.data == jpeg
