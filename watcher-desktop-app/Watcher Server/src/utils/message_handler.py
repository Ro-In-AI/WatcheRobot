"""WebSocket 消息处理器"""
from collections import defaultdict
import re
from typing import Any, Optional
import websockets

from src.core.ai_status_controller import ai_status_controller
from src.models.protocol import (
    BinaryFrame,
    BinaryFrameFlag,
    BinaryFrameType,
    TextMessage,
    TextMessageType,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)


class MessageHandler:
    """WebSocket 消息发送处理器"""

    # 消息类型
    class MsgType:
        CFG_ASR_REPORT = TextMessageType.CFG_ASR_REPORT.value
        CFG_TTS_REPORT = TextMessageType.CFG_TTS_REPORT.value
        CFG_LLM_REPORT = TextMessageType.CFG_LLM_REPORT.value
        CFG_DIALOGUE_REPORT = TextMessageType.CFG_DIALOGUE_REPORT.value
        EVT_ASR_RESULT = TextMessageType.EVT_ASR_RESULT.value
        EVT_AI_STATUS = TextMessageType.EVT_AI_STATUS.value
        EVT_AI_THINKING = TextMessageType.EVT_AI_THINKING.value
        EVT_AI_REPLY = TextMessageType.EVT_AI_REPLY.value
        EVT_DEVICE_STATUS = TextMessageType.EVT_DEVICE_STATUS.value
        EVT_SERVER_ERROR = TextMessageType.EVT_SERVER_ERROR.value
        SYS_ACK = TextMessageType.SYS_ACK.value
        SYS_NACK = TextMessageType.SYS_NACK.value

    # 错误码
    class Code:
        SUCCESS = 0        # 成功
        ERROR = 1          # 错误

    def __init__(self, websocket: websockets.WebSocketServerProtocol):
        """初始化消息处理器

        Args:
            websocket: WebSocket 连接对象
        """
        self.websocket = websocket
        self._stream_sequences = defaultdict(int)

    @staticmethod
    def clean_text_for_tts(text: str) -> str:
        """清理文本中的 Markdown 符号和 emoji，适合 TTS 朗读

        Args:
            text: 原始文本

        Returns:
            str: 清理后的文本
        """
        if not text:
            return ""

        # 移除 Emoji - 使用字符类别而非范围，避免误伤中文
        # 移除各种常见的 emoji 字符
        emoji_chars = [
            '😊', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
            '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
            '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
            '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
            '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
            '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
            '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳',
            '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
            '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
            '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
            '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
            '😾', '🙈', '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗',
            '💓', '💞', '💕', '💟', '❣️', '💔', '❤', '🧡', '💛', '💚',
            '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦',
            '💨', '🕳', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤',
            '🚀', '🚁', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉',
            '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒',
            '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🛻', '🚚', '🚛',
            '🚜', '🏎️', '🏍️', '🛵', '🦽', '🦼', '🛺', '🚲', '🛴', '🛹',
            '🛼', '🚏', '🛣️', '🛤️', '🛢️', '⛽', '🚨', '🚥', '🚦',
            '🛑', '🚧', '⚓', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢',
            '⚡', '⛄', '⛅', '⛈️', '🌤️', '⛱️', '🌥️', '☁️', '🌦️', '🌧️',
            '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦',
            '☔', '☂️', '🌊', '⭐', '🌟', '💫', '✨', '🔥', '💥', '☀️',
            '🌤️', '☁️', '🌥️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '🌪️',
            '🌈', '🌂', '☂️', '⚡', '❄️', '☃️', '🌬️', '🎉', '🎊', '🎈',
            '🎁', '🏆', '🥇', '🥈', '🥉', '🎯', '🎳', '🎮', '🎰', '🧩',
            '♟️', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘',
            '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🪈', '🎲', '♠️', '♣️',
            '♥️', '♦️', '🃏', '🎴', '🀄', '�🀄', '🏮', '🪔', '📣', '📢',
            '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🗣️', '👤', '👥',
            '🗣️', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️',
            '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️',
            '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲',
            '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶',
            '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️',
            '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔',
            '👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋',
            '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴',
            '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅',
            '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟',
            '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯',
            '🧖', '🧗', '🤸', '🏌️', '🏇', '⛷️', '🏂', '🏋️', '🤼', '🤽',
            '🤾', '🤺', '⛹️', '🏊', '🚣', '🧘', '🏄', '🏇', '🧗', '🛀',
            '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👦', '👨‍👩‍👧',
            '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👧‍👧', '👨‍👩‍👦',
            '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧',
            '🗣️', '👤', '👥', '🗣️', '👣', '🌆', '🌇', '🌆', '🏙️', '🌃',
            '🌌', '🌠', '🌅', '🌄', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️',
            '🏜️', '🏝️', '🏞️', '🏟️', '🏛️', '🏗️', '🧱', '🪨', '🪵', '🛖',
            '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨',
            '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽',
            '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃',
            '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '♨️', '🎠', '🎡', '🎢',
            '💈', '🎪', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉',
            '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒',
            '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🛻', '🚚', '🚛',
            '🚜', '🏎️', '🏍️', '🛵', '🦽', '🦼', '🛺', '🚲', '🛴', '🛹',
            '🛼', '🚏', '🛣️', '🛤️', '🛢️', '⛽', '🚨', '🚥', '🚦',
            '🛑', '🚧', '⚓', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢',
            '🚤', '🛥️', '🛳️', '⛴️', '⚓', '⛽', '🚧', '🛑', '🚦', '🚥',
        ]

        for emoji in emoji_chars:
            text = text.replace(emoji, '')

        # 移除 Markdown 标题符号 (# ## ###)
        text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)

        # 移除加粗符号 (**text** -> text)
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)

        # 移除斜体符号 (*text* -> text)，但要避免移除 ** 中的 *
        text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', text)

        # 先移除代码块 ``` ```，包括内容（必须在行内代码之前！）
        # 多次应用以处理多个代码块
        text = re.sub(r'```[\s\S]*?```', '', text)
        text = re.sub(r'```[\s\S]*?```', '', text)

        # 移除可能残留的三引号（未闭合的）
        text = re.sub(r'```[^`]*$', '', text, flags=re.MULTILINE)  # 开头的 ```
        text = re.sub(r'^```[^`]*', '', text, flags=re.MULTILINE)  # 结尾的 ```

        # 移除行内代码 (`code` -> code) - 必须在代码块之后处理
        text = re.sub(r'`([^`]+)`', r'\1', text)

        # 移除残留的反引号（单独的反引号或连续的反引号，不是单词的一部分）
        # 移除连续的反引号 `` ``` 等
        text = re.sub(r'`{2,}', '', text)
        # 移除单独的反引号（前后是空白或行首行尾）
        text = re.sub(r'(?<!\S)`(?!\S)', '', text)

        # 清理代码块移除后留下的多余空行（2个以上换行变成1个）
        text = re.sub(r'\n\s*\n+', '\n', text)

        # 移除 Markdown 链接 [text](url) -> text
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)

        # 移除列表符号
        text = re.sub(r'^[\s]*[-*]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)

        # 移除分隔线 (---)
        text = re.sub(r'^---+$', '', text, flags=re.MULTILINE)

        # 移除多余的空白字符
        text = re.sub(r'[ \t]+', ' ', text)  # 多个空格变成一个
        text = re.sub(r'\n{3,}', '\n\n', text)  # 多个换行变成两个

        text = text.strip()

        # 如果清理后为空，返回一个空格而不是空字符串
        # 避免 TTS 无法合成
        if not text:
            return " "

        return text

    def _build_message(
        self,
        msg_type: str | TextMessageType,
        data: Any = None,
        code: int = 0,
    ) -> str:
        """构建消息 JSON 字符串

        Args:
            msg_type: 消息类型
            data: 消息数据
            code: 错误码

        Returns:
            str: JSON 字符串
        """
        return TextMessage(
            type=self._normalize_message_type(msg_type),
            code=code,
            data=data if data is not None else {},
        ).to_json()

    def _next_sequence(self, frame_type: BinaryFrameType) -> int:
        """获取并递增指定帧类型的帧序号。"""
        seq = self._stream_sequences[int(frame_type)]
        self._stream_sequences[int(frame_type)] += 1
        return seq

    async def send(
        self,
        msg_type: str | TextMessageType,
        data: Any = None,
        code: int = 0,
    ) -> bool:
        """发送消息

        Args:
            msg_type: 消息类型
            data: 消息数据
            code: 错误码，0 表示成功

        Returns:
            bool: 发送是否成功
        """
        message_str = self._build_message(msg_type, data, code)
        normalized_type = self._normalize_message_type(msg_type)

        try:
            await self.websocket.send(message_str)
            logger.debug(f"消息发送成功: type={normalized_type}, code={code}")
            return True
        except Exception as e:
            logger.error(f"消息发送失败: type={normalized_type}, error={e}")
            return False

    async def send_binary_frame(
        self,
        frame_type: BinaryFrameType,
        payload: bytes,
        *,
        flags: BinaryFrameFlag = BinaryFrameFlag.NONE,
        seq: Optional[int] = None,
    ) -> bool:
        """发送统一协议二进制帧。"""
        if seq is None:
            seq = self._next_sequence(frame_type)

        frame = BinaryFrame(
            frame_type=frame_type,
            flags=flags,
            seq=seq,
            payload=payload,
        )

        try:
            await self.websocket.send(frame.to_bytes())
            logger.debug(
                "二进制帧发送成功: type={}, seq={}, flags={}, payload_len={}",
                frame_type.name,
                seq,
                int(flags),
                len(payload),
            )
            return True
        except Exception as e:
            logger.error(
                "二进制帧发送失败: type={}, error={}",
                frame_type.name,
                e,
            )
            return False

    async def send_audio_frame(
        self,
        payload: bytes,
        *,
        is_first: bool = False,
        is_last: bool = False,
    ) -> bool:
        """发送音频二进制帧。"""
        flags = BinaryFrameFlag.NONE
        if is_first:
            flags |= BinaryFrameFlag.FIRST
        if is_last:
            flags |= BinaryFrameFlag.LAST
        return await self.send_binary_frame(
            BinaryFrameType.AUDIO,
            payload,
            flags=flags,
        )

    @staticmethod
    def _normalize_message_type(msg_type: str | TextMessageType) -> str:
        if isinstance(msg_type, TextMessageType):
            return msg_type.value
        return msg_type

    async def send_asr_result(self, text: str) -> bool:
        """发送 ASR 识别结果

        Args:
            text: 识别文本

        Returns:
            bool: 发送是否成功
        """
        return await self.send(
            self.MsgType.EVT_ASR_RESULT,
            {"text": text},
            self.Code.SUCCESS,
        )

    async def send_config_report(
        self,
        msg_type: str | TextMessageType,
        payload: dict,
    ) -> bool:
        """发送配置报告。"""
        return await self.send(msg_type, payload, self.Code.SUCCESS)

    async def send_device_status(self, payload: dict) -> bool:
        """发送当前硬件设备在线状态。"""
        return await self.send(
            self.MsgType.EVT_DEVICE_STATUS,
            payload,
            self.Code.SUCCESS,
        )

    async def send_ai_status(
        self,
        status: str,
        message: str = "",
        *,
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict] = None,
    ) -> bool:
        """发送 AI 状态事件。"""
        data = ai_status_controller.build_payload_data(
            status,
            message=message,
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )
        return await self.send(self.MsgType.EVT_AI_STATUS, data, self.Code.SUCCESS)

    async def send_ai_thinking(
        self,
        content: str,
        *,
        kind: Optional[str] = None,
        detail: Optional[dict] = None,
    ) -> bool:
        """发送 AI 思考过程事件。"""
        data = {"content": content}
        if kind:
            data["kind"] = kind
        if detail:
            data["detail"] = detail
        return await self.send(self.MsgType.EVT_AI_THINKING, data, self.Code.SUCCESS)

    async def send_ai_reply(self, text: str) -> bool:
        """发送 AI 最终回复。"""
        return await self.send(
            self.MsgType.EVT_AI_REPLY,
            {"text": text},
            self.Code.SUCCESS,
        )

    async def send_server_error(
        self,
        error_msg: str,
        *,
        stage: Optional[str] = None,
        detail: Optional[dict] = None,
    ) -> bool:
        """发送服务端错误事件。"""
        data = {"message": error_msg}
        if stage:
            data["stage"] = stage
        if detail:
            data["detail"] = detail
        return await self.send(self.MsgType.EVT_SERVER_ERROR, data, self.Code.ERROR)

    async def send_ack(
        self,
        target_type: str | TextMessageType,
        data: Optional[dict] = None,
    ) -> bool:
        """发送协议 ACK。"""
        payload = {"type": self._normalize_message_type(target_type)}
        if data:
            payload.update(data)
        logger.debug(
            "发送 ACK: target_type={}, payload={}",
            payload["type"],
            payload,
        )
        return await self.send(self.MsgType.SYS_ACK, payload, self.Code.SUCCESS)

    async def send_nack(
        self,
        target_type: str | TextMessageType,
        reason: str,
        *,
        code: int = Code.ERROR,
        data: Optional[dict] = None,
    ) -> bool:
        """发送协议 NACK。"""
        payload = {
            "type": self._normalize_message_type(target_type),
            "reason": reason,
        }
        if data:
            payload.update(data)
        logger.debug(
            "发送 NACK: target_type={}, code={}, payload={}",
            payload["type"],
            code,
            payload,
        )
        return await self.send(self.MsgType.SYS_NACK, payload, code)
