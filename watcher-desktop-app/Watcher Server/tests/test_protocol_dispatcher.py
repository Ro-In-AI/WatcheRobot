"""协议编解码与消息分发测试。"""
import asyncio

from src.core.message_dispatcher import MessageDispatcher
from src.models.protocol import (
    BinaryFrame,
    BinaryFrameFlag,
    BinaryFrameType,
    ClientRole,
    TextMessage,
    TextMessageType,
)


def test_text_message_round_trip():
    message = TextMessage(type="evt.device.error", code=1501, data={"message": "boom"})
    encoded = message.to_json()
    decoded = TextMessage.from_json(encoded)

    assert decoded.type == "evt.device.error"
    assert decoded.code == 1501
    assert decoded.data == {"message": "boom"}


def test_binary_frame_round_trip():
    frame = BinaryFrame(
        frame_type=BinaryFrameType.AUDIO,
        flags=BinaryFrameFlag.FIRST | BinaryFrameFlag.LAST,
        seq=3,
        payload=b"abc123",
    )

    encoded = frame.to_bytes()
    decoded = BinaryFrame.from_bytes(encoded)

    assert decoded.frame_type == BinaryFrameType.AUDIO
    assert decoded.flags == (BinaryFrameFlag.FIRST | BinaryFrameFlag.LAST)
    assert decoded.seq == 3
    assert decoded.payload == b"abc123"


def test_dispatcher_routes_registered_binary_message():
    events = []

    async def on_audio(frame: BinaryFrame):
        events.append(("audio", frame.payload))
        if frame.flags & BinaryFrameFlag.LAST:
            events.append(("end", frame.seq))

    dispatcher = MessageDispatcher()
    dispatcher.register_binary_handler(BinaryFrameType.AUDIO, on_audio)
    frame = BinaryFrame(
        frame_type=BinaryFrameType.AUDIO,
        flags=BinaryFrameFlag.LAST,
        seq=0,
        payload=b"audio-payload",
    )

    asyncio.run(dispatcher.dispatch(frame.to_bytes()))

    assert events == [
        ("audio", b"audio-payload"),
        ("end", 0),
    ]


def test_dispatcher_routes_registered_text_message():
    events = []

    async def on_client_hello(message: TextMessage):
        events.append(("hello", message.data["role"]))

    dispatcher = MessageDispatcher()
    dispatcher.register_text_handler(TextMessageType.SYS_CLIENT_HELLO, on_client_hello)

    asyncio.run(
        dispatcher.dispatch(
            TextMessage(
                type="sys.client.hello",
                data={"role": ClientRole.HARDWARE.value},
            ).to_json()
        )
    )

    assert events == [("hello", "hardware")]
