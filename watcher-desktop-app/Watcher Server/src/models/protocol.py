"""协议数据模型与编解码工具。"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from enum import Enum, IntEnum, IntFlag
from typing import Any


class ProtocolError(ValueError):
    """协议解析错误。"""


class ClientRole(str, Enum):
    """客户端连接角色。"""

    UNKNOWN = "unknown"
    HARDWARE = "hardware"
    DESKTOP = "desktop"

    @classmethod
    def from_value(cls, value: str) -> "ClientRole":
        if not isinstance(value, str) or not value.strip():
            raise ProtocolError("client role must be a non-empty string")

        normalized = value.strip().lower()
        try:
            return cls(normalized)
        except ValueError as exc:
            raise ProtocolError(f"unsupported client role: {value}") from exc


class TextMessageType(str, Enum):
    """文本消息类型。"""

    SYS_CLIENT_HELLO = "sys.client.hello"
    SYS_ACK = "sys.ack"
    SYS_NACK = "sys.nack"
    SYS_PING = "sys.ping"
    SYS_PONG = "sys.pong"
    SYS_SESSION_RESUME = "sys.session.resume"

    CTRL_SERVO_ANGLE = "ctrl.servo.angle"
    CTRL_CAMERA_VIDEO_CONFIG = "ctrl.camera.video_config"
    CTRL_CAMERA_CAPTURE_IMAGE = "ctrl.camera.capture_image"
    CTRL_CAMERA_START_VIDEO = "ctrl.camera.start_video"
    CTRL_CAMERA_STOP_VIDEO = "ctrl.camera.stop_video"

    CFG_ASR_GET = "cfg.asr.get"
    CFG_ASR_REPORT = "cfg.asr.report"
    CFG_ASR_UPDATE = "cfg.asr.update"
    CFG_TTS_GET = "cfg.tts.get"
    CFG_TTS_REPORT = "cfg.tts.report"
    CFG_TTS_UPDATE = "cfg.tts.update"
    CFG_LLM_GET = "cfg.llm.get"
    CFG_LLM_REPORT = "cfg.llm.report"
    CFG_LLM_UPDATE = "cfg.llm.update"
    CFG_DIALOGUE_GET = "cfg.dialogue.get"
    CFG_DIALOGUE_REPORT = "cfg.dialogue.report"
    CFG_DIALOGUE_UPDATE = "cfg.dialogue.update"
    CFG_SCHEDULER_GET = "cfg.scheduler.get"
    CFG_SCHEDULER_REPORT = "cfg.scheduler.report"
    CFG_SCHEDULER_UPDATE = "cfg.scheduler.update"

    EVT_ASR_RESULT = "evt.asr.result"
    EVT_AI_STATUS = "evt.ai.status"
    EVT_AI_THINKING = "evt.ai.thinking"
    EVT_AI_REPLY = "evt.ai.reply"
    EVT_SERVER_ERROR = "evt.server.error"
    EVT_DEVICE_STATUS = "evt.device.status"
    EVT_CAMERA_STATE = "evt.camera.state"
    EVT_SERVO_POSITION = "evt.servo.position"
    EVT_OTA_PROGRESS = "evt.ota.progress"
    EVT_DEVICE_ERROR = "evt.device.error"
    EVT_DEVICE_FIRMWARE = "evt.device.firmware"

    XFER_OTA_HANDSHAKE = "xfer.ota.handshake"
    XFER_OTA_CHECKSUM = "xfer.ota.checksum"


class BinaryFrameType(IntEnum):
    """二进制帧类型。"""

    AUDIO = 1
    VIDEO = 2
    IMAGE = 3
    OTA = 4


class BinaryFrameFlag(IntFlag):
    """二进制帧标志位。"""

    NONE = 0
    FIRST = 1 << 0
    LAST = 1 << 1
    KEYFRAME = 1 << 2
    FRAGMENT = 1 << 3


@dataclass(slots=True)
class TextMessage:
    """文本消息。"""

    type: str
    code: int = 0
    data: Any = None

    def to_json(self) -> str:
        return json.dumps(
            {
                "type": self.type,
                "code": self.code,
                "data": self.data if self.data is not None else {},
            },
            ensure_ascii=False,
        )

    @classmethod
    def from_json(cls, raw_message: str) -> "TextMessage":
        try:
            payload = json.loads(raw_message)
        except json.JSONDecodeError as exc:
            raise ProtocolError(f"invalid text message: {exc}") from exc

        if not isinstance(payload, dict):
            raise ProtocolError("text message must be a JSON object")

        msg_type = payload.get("type")
        if not isinstance(msg_type, str) or not msg_type:
            raise ProtocolError("text message missing valid 'type'")

        code = payload.get("code", 0)
        if not isinstance(code, int):
            raise ProtocolError("text message field 'code' must be int")

        return cls(
            type=msg_type,
            code=code,
            data=payload.get("data", {}),
        )


@dataclass(slots=True)
class BinaryFrame:
    """二进制帧。"""

    MAGIC = b"WSPK"
    STRUCT = struct.Struct("<4sBBII")
    HEADER_SIZE = STRUCT.size

    frame_type: BinaryFrameType
    flags: BinaryFrameFlag = BinaryFrameFlag.NONE
    seq: int = 0
    payload: bytes = b""

    def to_bytes(self) -> bytes:
        payload_len = len(self.payload)
        header = self.STRUCT.pack(
            self.MAGIC,
            int(self.frame_type),
            int(self.flags),
            self.seq,
            payload_len,
        )
        return header + self.payload

    @classmethod
    def from_bytes(cls, raw_frame: bytes) -> "BinaryFrame":
        if len(raw_frame) < cls.HEADER_SIZE:
            raise ProtocolError(
                f"binary frame too short: {len(raw_frame)} < {cls.HEADER_SIZE}"
            )

        magic, raw_type, raw_flags, seq, payload_len = cls.STRUCT.unpack(
            raw_frame[: cls.HEADER_SIZE]
        )

        if magic != cls.MAGIC:
            raise ProtocolError(f"invalid binary frame magic: {magic!r}")

        try:
            frame_type = BinaryFrameType(raw_type)
        except ValueError as exc:
            raise ProtocolError(f"unsupported frame type: {raw_type}") from exc

        payload = raw_frame[cls.HEADER_SIZE :]
        if len(payload) != payload_len:
            raise ProtocolError(
                f"binary frame payload length mismatch: expected {payload_len}, got {len(payload)}"
            )

        return cls(
            frame_type=frame_type,
            flags=BinaryFrameFlag(raw_flags),
            seq=seq,
            payload=payload,
        )


SYSTEM_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.SYS_CLIENT_HELLO,
        TextMessageType.SYS_ACK,
        TextMessageType.SYS_NACK,
        TextMessageType.SYS_PING,
        TextMessageType.SYS_PONG,
        TextMessageType.SYS_SESSION_RESUME,
    }
)

CONTROL_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.CTRL_SERVO_ANGLE,
        TextMessageType.CTRL_CAMERA_VIDEO_CONFIG,
        TextMessageType.CTRL_CAMERA_CAPTURE_IMAGE,
        TextMessageType.CTRL_CAMERA_START_VIDEO,
        TextMessageType.CTRL_CAMERA_STOP_VIDEO,
    }
)

CONFIG_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.CFG_ASR_GET,
        TextMessageType.CFG_ASR_REPORT,
        TextMessageType.CFG_ASR_UPDATE,
        TextMessageType.CFG_TTS_GET,
        TextMessageType.CFG_TTS_REPORT,
        TextMessageType.CFG_TTS_UPDATE,
        TextMessageType.CFG_LLM_GET,
        TextMessageType.CFG_LLM_REPORT,
        TextMessageType.CFG_LLM_UPDATE,
        TextMessageType.CFG_DIALOGUE_GET,
        TextMessageType.CFG_DIALOGUE_REPORT,
        TextMessageType.CFG_DIALOGUE_UPDATE,
        TextMessageType.CFG_SCHEDULER_GET,
        TextMessageType.CFG_SCHEDULER_REPORT,
        TextMessageType.CFG_SCHEDULER_UPDATE,
    }
)

EVENT_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.EVT_ASR_RESULT,
        TextMessageType.EVT_AI_STATUS,
        TextMessageType.EVT_AI_THINKING,
        TextMessageType.EVT_AI_REPLY,
        TextMessageType.EVT_SERVER_ERROR,
        TextMessageType.EVT_DEVICE_STATUS,
        TextMessageType.EVT_CAMERA_STATE,
        TextMessageType.EVT_SERVO_POSITION,
        TextMessageType.EVT_OTA_PROGRESS,
        TextMessageType.EVT_DEVICE_ERROR,
        TextMessageType.EVT_DEVICE_FIRMWARE,
    }
)

TRANSFER_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.XFER_OTA_HANDSHAKE,
        TextMessageType.XFER_OTA_CHECKSUM,
    }
)

HARDWARE_UPLINK_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.SYS_CLIENT_HELLO,
        TextMessageType.SYS_ACK,
        TextMessageType.SYS_NACK,
        TextMessageType.SYS_PONG,
        TextMessageType.SYS_SESSION_RESUME,
        TextMessageType.EVT_CAMERA_STATE,
        TextMessageType.EVT_SERVO_POSITION,
        TextMessageType.EVT_OTA_PROGRESS,
        TextMessageType.EVT_DEVICE_ERROR,
        TextMessageType.EVT_DEVICE_FIRMWARE,
        TextMessageType.XFER_OTA_HANDSHAKE,
    }
)

DESKTOP_UPLINK_TEXT_MESSAGE_TYPES = frozenset(
    {
        TextMessageType.SYS_CLIENT_HELLO,
        TextMessageType.SYS_ACK,
        TextMessageType.SYS_NACK,
        TextMessageType.SYS_PONG,
        TextMessageType.SYS_SESSION_RESUME,
        TextMessageType.CFG_ASR_GET,
        TextMessageType.CFG_ASR_UPDATE,
        TextMessageType.CFG_TTS_GET,
        TextMessageType.CFG_TTS_UPDATE,
        TextMessageType.CFG_LLM_GET,
        TextMessageType.CFG_LLM_UPDATE,
        TextMessageType.CFG_DIALOGUE_GET,
        TextMessageType.CFG_DIALOGUE_UPDATE,
        TextMessageType.CFG_SCHEDULER_GET,
        TextMessageType.CFG_SCHEDULER_UPDATE,
        TextMessageType.CTRL_SERVO_ANGLE,
    }
)
