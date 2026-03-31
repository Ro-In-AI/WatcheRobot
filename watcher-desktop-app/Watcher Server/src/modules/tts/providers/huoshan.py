"""火山引擎实时语音合成实现"""
import asyncio
import gzip
import json
import uuid
from typing import Optional, AsyncIterator

import websockets
from websockets.protocol import State

from ..base import TTSProvider, TTSResult
from ..registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)


@register_provider("huoshan", {
    "app_key": str,
    "access_key": str,
    "voice_type": str,
    "host": str,
    "api_url": str,
    "encoding": str,
    "speed_ratio": float,
    "volume_ratio": float,
    "pitch_ratio": float,
})
class HuoshanTTS(TTSProvider):
    """火山引擎实时语音合成"""

    # 消息类型常量
    MESSAGE_TYPE_AUDIO = 0xb
    MESSAGE_TYPE_FRONTEND = 0xc
    MESSAGE_TYPE_ERROR = 0xf

    def __init__(
        self,
        app_key: str,
        access_key: str,
        voice_type: str = "ICL_zh_male_nuanxintitie_tob",
        host: str = "openspeech.bytedance.com",
        api_url: str = "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
        sample_rate: int = 24000,
        encoding: str = "pcm",
        speed_ratio: float = 1.0,
        volume_ratio: float = 1.0,
        pitch_ratio: float = 1.0,
    ):
        """初始化火山引擎TTS

        Args:
            app_key: App Key
            access_key: Access Key
            voice_type: 声音类型
            host: 主机地址
            api_url: API URL
            sample_rate: 采样率
            encoding: 音频编码格式
            speed_ratio: 语速比例
            volume_ratio: 音量比例
            pitch_ratio: 音调比例
        """
        super().__init__()

        self.app_key = app_key
        self.access_key = access_key
        self.voice_type = voice_type
        self.host = host
        self.api_url = api_url
        self.sample_rate = sample_rate
        self.encoding = encoding
        self.speed_ratio = speed_ratio
        self.volume_ratio = volume_ratio
        self.pitch_ratio = pitch_ratio

        # WebSocket连接
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

        # 默认消息头 (protocol_version=1, message_type=1, serialization=1, compression=1)
        self._default_header = bytearray(b'\x11\x10\x11\x00')

        # 请求JSON模板
        self._request_template = {
            "app": {
                "appid": self.app_key,
                "token": "access_token",
                "cluster": "volcano_tts"
            },
            "user": {
                "uid": "watcher_server"
            },
            "audio": {
                "voice_type": self.voice_type,
                "encoding": self.encoding,
                "speed_ratio": self.speed_ratio,
                "volume_ratio": self.volume_ratio,
                "pitch_ratio": self.pitch_ratio,
            },
            "request": {
                "reqid": "",
                "text": "",
                "text_type": "plain",
                "operation": "submit"
            }
        }

        logger.info(
            "火山引擎TTS初始化: app_key={}... voice_type={} sample_rate={}",
            app_key[:8] if app_key else "",
            voice_type,
            sample_rate,
        )

    def set_voice_type(self, voice_type: str):
        """设置音色类型

        Args:
            voice_type: 音色类型
        """
        self.voice_type = voice_type
        logger.info(f"音色已设置为: {voice_type}")

    def set_speed_ratio(self, speed_ratio: float):
        """设置语速

        Args:
            speed_ratio: 语速比例 (0.5-2.0)
        """
        self.speed_ratio = speed_ratio

    def set_volume_ratio(self, volume_ratio: float):
        """设置音量

        Args:
            volume_ratio: 音量比例 (0.1-10.0)
        """
        self.volume_ratio = volume_ratio

    def set_pitch_ratio(self, pitch_ratio: float):
        """设置音调

        Args:
            pitch_ratio: 音调比例 (0.5-2.0)
        """
        self.pitch_ratio = pitch_ratio

    async def close_connection(self):
        """关闭WebSocket连接（下次请求时会自动重建）"""
        if self._ws:
            await self._ws.close()
            self._ws = None
            logger.info("TTS WebSocket连接已关闭")

    async def initialize(self):
        """初始化TTS引擎"""
        if self._is_initialized:
            logger.warning("火山引擎TTS已经初始化")
            return

        logger.info("初始化火山引擎TTS引擎...")
        self._is_initialized = True
        logger.info("火山引擎TTS引擎初始化完成")

    async def synthesize(self, text: str) -> TTSResult:
        """合成语音

        Args:
            text: 要合成的文本

        Returns:
            TTS合成结果
        """
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        logger.info("开始TTS合成: {}...", text[:50])

        # 连接WebSocket
        await self._ensure_connection()

        # 发送请求并获取音频
        audio_chunks = []
        async for chunk, _is_last in self._stream_sentence_audio(text):
            if chunk:
                audio_chunks.append(chunk)
        audio_data = b"".join(audio_chunks)

        # 计算音频时长（PCM格式：采样率 * 位深(2字节) * 通道数 * 秒数）
        duration = len(audio_data) / (self.sample_rate * 2) if self.encoding == "pcm" else None

        logger.info("TTS合成完成: audio_size={} bytes, duration={}s", len(audio_data), duration)

        return TTSResult(
            audio_data=audio_data,
            format=self.encoding,
            sample_rate=self.sample_rate,
            duration=duration,
            chunk_index=0,
            chunk_count=1,
            is_first=True,
            is_last=True,
        )

    async def synthesize_stream(self, text: str) -> AsyncIterator[TTSResult]:
        """流式合成语音，按句子分批合成并返回

        Args:
            text: 要合成的文本

        Yields:
            TTSResult: 每个句子的音频片段
        """
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        # 按标点分句，并提前去掉空句，便于稳定计算首尾分片。
        sentences = [
            sentence for sentence in self.split_text_by_sentences(text, max_length=200)
            if sentence.strip()
        ]
        logger.info("文本已拆分为 {} 个句子", len(sentences))

        emitted_chunks = 0
        for i, sentence in enumerate(sentences):
            logger.debug("流式合成第 {}/{} 句: {}...", i + 1, len(sentences), sentence[:30])

            # 确保连接有效
            await self._ensure_connection()

            sentence_chunk_index = 0
            is_last_sentence = i == len(sentences) - 1
            async for audio_data, is_last_chunk_of_sentence in self._stream_sentence_audio(sentence):
                if not audio_data:
                    continue

                duration = len(audio_data) / (self.sample_rate * 2) if self.encoding == "pcm" else None
                logger.debug(
                    "第 {} 句流式片段已生成: chunk_index={}, audio_size={} bytes",
                    i + 1,
                    sentence_chunk_index,
                    len(audio_data),
                )
                yield TTSResult(
                    audio_data=audio_data,
                    format=self.encoding,
                    sample_rate=self.sample_rate,
                    duration=duration,
                    chunk_index=emitted_chunks,
                    chunk_count=0,
                    is_first=(emitted_chunks == 0),
                    is_last=(is_last_sentence and is_last_chunk_of_sentence),
                )
                emitted_chunks += 1
                sentence_chunk_index += 1

        if emitted_chunks == 0:
            return

    async def _stream_sentence_audio(self, text: str) -> AsyncIterator[tuple[bytes, bool]]:
        """按云端返回节奏流式产出单句音频片段。"""
        # 构建请求 - 每次都使用最新的配置
        request_json = {
            "app": {
                "appid": self.app_key,
                "token": "access_token",
                "cluster": "volcano_tts"
            },
            "user": {
                "uid": "watcher_server"
            },
            "audio": {
                "voice_type": self.voice_type,
                "encoding": self.encoding,
                "speed_ratio": self.speed_ratio,
                "volume_ratio": self.volume_ratio,
                "pitch_ratio": self.pitch_ratio,
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "text_type": "plain",
                "operation": "submit"
            }
        }

        logger.debug(
            "TTS请求配置: voice_type={}, speed={}, volume={}, pitch={}",
            self.voice_type,
            self.speed_ratio,
            self.volume_ratio,
            self.pitch_ratio,
        )

        # 序列化和压缩
        payload_bytes = json.dumps(request_json).encode('utf-8')
        payload_bytes = gzip.compress(payload_bytes)

        # 构建完整请求
        full_request = bytearray(self._default_header)
        full_request.extend(len(payload_bytes).to_bytes(4, 'big'))
        full_request.extend(payload_bytes)

        # 发送请求
        await self._ws.send(full_request)

        pending_audio: Optional[bytes] = None
        while True:
            response = await self._ws.recv()
            done, audio_data = await self._parse_response(response)

            if audio_data:
                if pending_audio is not None:
                    yield pending_audio, False
                pending_audio = audio_data

            if done:
                if pending_audio is not None:
                    yield pending_audio, True
                break

    async def _ensure_connection(self):
        """确保WebSocket连接有效"""
        # 已建立且可用时直接复用，避免每句都重复握手。
        if self._ws is not None:
            try:
                if self._ws.state == State.OPEN:
                    return
                if self._ws.state != State.CLOSED:
                    await self._ws.close()
            except Exception:
                pass
            self._ws = None
        
        if self._ws is None or self._ws.state != State.OPEN:
            logger.info("创建火山引擎TTS WebSocket连接...")
            header = {"Authorization": f"Bearer; {self.access_key}"}
            self._ws = await websockets.connect(
                self.api_url,
                additional_headers=header,
                ping_interval=None
            )
            logger.info("火山引擎TTS WebSocket连接已建立")

    async def _parse_response(self, response: bytes) -> tuple[bool, Optional[bytes]]:
        """解析服务器响应

        Returns:
            (is_done, audio_data): 是否完成, 音频数据
        """
        # 解析响应头部
        protocol_version = response[0] >> 4
        header_size = response[0] & 0x0f
        message_type = response[1] >> 4
        message_type_specific_flags = response[1] & 0x0f
        serialization_method = response[2] >> 4
        message_compression = response[2] & 0x0f
        reserved = response[3]
        header_extensions = response[4:header_size * 4]
        payload = response[header_size * 4:]

        if message_type == self.MESSAGE_TYPE_AUDIO:
            # 音频数据
            if message_type_specific_flags == 0:
                # 无序列号作为ACK
                return False, None

            sequence_number = int.from_bytes(payload[:4], "big", signed=True)
            audio_payload = payload[8:]  # 跳过序列号(4字节)和负载大小(4字节)

            is_done = sequence_number < 0
            return is_done, audio_payload

        elif message_type == self.MESSAGE_TYPE_ERROR:
            # 错误消息
            code = int.from_bytes(payload[:4], "big", signed=False)
            error_msg = payload[8:]

            if message_compression == 1:
                error_msg = gzip.decompress(error_msg)

            error_text = error_msg.decode("utf-8")
            summary = self._summarize_error_text(error_text)
            logger.error(
                "火山引擎TTS错误: code={}, summary={}, raw={}",
                code,
                summary,
                error_text,
            )
            await self.close_connection()
            raise RuntimeError(summary)

        elif message_type == self.MESSAGE_TYPE_FRONTEND:
            # 前端消息
            frontend_msg = payload[4:]
            if message_compression == 1:
                frontend_msg = gzip.decompress(frontend_msg)
            logger.debug("前端消息: {}", frontend_msg.decode("utf-8"))
            return False, None

        else:
            logger.warning("未知的消息类型: {}", message_type)
            return True, None

    @staticmethod
    def _summarize_error_text(error_text: str) -> str:
        """将供应商错误文本压缩为适合日志与上抛的摘要。"""
        try:
            payload = json.loads(error_text)
        except json.JSONDecodeError:
            return f"TTS错误: {error_text}"

        if not isinstance(payload, dict):
            return f"TTS错误: {error_text}"

        parts = []
        reqid = payload.get("reqid")
        if reqid:
            parts.append(f"reqid={reqid}")

        provider_message = payload.get("message")
        if provider_message:
            parts.append(f"message={provider_message}")

        provider_code = payload.get("code")
        if provider_code not in (None, ""):
            parts.append(f"provider_code={provider_code}")

        backend_code = payload.get("backend_code")
        if backend_code not in (None, ""):
            parts.append(f"backend_code={backend_code}")

        if not parts:
            return "TTS错误: unknown provider error"
        return "TTS错误: " + ", ".join(parts)

    async def cleanup(self):
        """清理资源"""
        logger.info("清理火山引擎TTS资源...")

        if self._ws:
            await self._ws.close()
            self._ws = None

        self._is_initialized = False
        logger.info("火山引擎TTS资源清理完成")
