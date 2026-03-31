"""Deepgram ASR Provider 实现"""
import asyncio
import json
from typing import Any, Optional
from urllib.parse import urlencode

import requests
import websockets

from src.config import settings
from src.utils.logger import get_logger

from ..base import ASRProvider, ASRResult, AudioConfig
from ..registry import register_provider

logger = get_logger(__name__)


DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_LIVE_URL = "wss://api.deepgram.com/v1/listen"

def _resolve_api_key(cli_value: str = "") -> str:
    if cli_value.strip():
        return cli_value.strip()

    if getattr(settings, "deepgram_api_key", "").strip():
        return settings.deepgram_api_key.strip()
    return ""


@register_provider("deepgram", {
    "api_key": str,
    "listen_url": str,
    "live_url": str,
    "model": str,
    "language": str,
    "detect_language": bool,
    "smart_format": bool,
    "interim_results": bool,
    "punctuate": bool,
    "vad_events": bool,
    "endpointing": int,
    "utterance_end_ms": int,
})
class DeepgramASR(ASRProvider):
    """Deepgram ASR Provider"""

    def __init__(
        self,
        api_key: str = "",
        listen_url: str = DEEPGRAM_LISTEN_URL,
        live_url: str = DEEPGRAM_LIVE_URL,
        model: str = "nova-2",
        language: str = "multi",
        detect_language: bool = False,
        smart_format: bool = True,
        interim_results: bool = True,
        punctuate: bool = True,
        vad_events: bool = True,
        endpointing: int = 300,
        utterance_end_ms: int = 1000,
        sample_rate: int = 16000,
        channels: int = 1,
    ):
        super().__init__()

        self.api_key = _resolve_api_key(api_key)
        if not self.api_key:
            raise ValueError("缺少 Deepgram API Key，请在 config/asr.json 或 config/system.json 中配置")

        self.listen_url = listen_url
        self.live_url = live_url
        self.model = model
        self.language = language
        self.detect_language = detect_language
        self.smart_format = smart_format
        self.interim_results = interim_results
        self.punctuate = punctuate
        self.vad_events = vad_events
        self.endpointing = endpointing
        self.utterance_end_ms = utterance_end_ms
        self.sample_rate = sample_rate
        self.channels = channels

        self._websocket: Any = None
        self._receiver_task: Optional[asyncio.Task] = None
        self._metadata_event: Optional[asyncio.Event] = None
        self._completed_utterances: list[str] = []
        self._final_segments: list[str] = []
        self._best_confidence: float = 0.0
        self._is_started: bool = False

    async def initialize(self) -> None:
        if self._is_initialized:
            logger.warning("Deepgram ASR 已经初始化")
            return

        logger.info(
            f"初始化 Deepgram ASR: model={self.model} "
            f"language={self.language} sample_rate={self.sample_rate} "
            f"channels={self.channels}"
        )
        self._is_initialized = True

    def _build_prerecorded_params(
        self,
        audio_config: Optional[AudioConfig] = None,
    ) -> dict[str, Any]:
        config = audio_config or AudioConfig(
            sample_rate=self.sample_rate,
            channels=self.channels,
        )

        params: dict[str, Any] = {
            "model": self.model,
            "smart_format": str(self.smart_format).lower(),
            "channels": config.channels,
        }

        if self.detect_language:
            params["detect_language"] = "true"
        elif self.language:
            params["language"] = self.language

        is_raw_audio = config.format.lower() in {"pcm", "raw"}
        if is_raw_audio:
            params["encoding"] = "linear16"
            params["sample_rate"] = config.sample_rate

        return params

    def _build_live_url(self, audio_config: Optional[AudioConfig] = None) -> str:
        config = audio_config or AudioConfig(
            sample_rate=self.sample_rate,
            channels=self.channels,
        )

        params: dict[str, Any] = {
            "model": self.model,
            "encoding": "linear16",
            "sample_rate": config.sample_rate,
            "channels": config.channels,
            "interim_results": str(self.interim_results).lower(),
            "smart_format": str(self.smart_format).lower(),
            "punctuate": str(self.punctuate).lower(),
            "vad_events": str(self.vad_events).lower(),
            "endpointing": self.endpointing,
            "utterance_end_ms": self.utterance_end_ms,
        }

        if self.language:
            params["language"] = self.language

        return f"{self.live_url}?{urlencode(params)}"

    async def _receive_live_results(self) -> None:
        assert self._websocket is not None
        assert self._metadata_event is not None

        async for message in self._websocket:
            if isinstance(message, bytes):
                continue

            event = json.loads(message)
            event_type = event.get("type", "")

            if event_type == "Results":
                channel = event.get("channel", {})
                alternatives = channel.get("alternatives", [])
                alternative = alternatives[0] if alternatives else {}
                transcript = alternative.get("transcript", "").strip()
                confidence = float(alternative.get("confidence") or 0.0)
                is_final = bool(event.get("is_final"))
                speech_final = bool(event.get("speech_final"))

                if confidence > self._best_confidence:
                    self._best_confidence = confidence

                if transcript and is_final:
                    self._final_segments.append(transcript)

                if speech_final and self._final_segments:
                    utterance = "".join(self._final_segments).strip()
                    if utterance:
                        self._completed_utterances.append(utterance)
                    self._final_segments.clear()

            elif event_type == "Metadata":
                self._metadata_event.set()
            elif event_type == "Error":
                message_text = event.get("message", json.dumps(event, ensure_ascii=False))
                logger.error(f"Deepgram 流式识别错误: {message_text}")

    async def recognize(
        self,
        audio_data: bytes,
        audio_config: Optional[AudioConfig] = None,
    ) -> ASRResult:
        config = audio_config or AudioConfig(
            sample_rate=self.sample_rate,
            channels=self.channels,
        )
        params = self._build_prerecorded_params(config)

        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/wav" if config.format.lower() == "wav" else "application/octet-stream",
        }

        response = requests.post(
            self.listen_url,
            params=params,
            headers=headers,
            data=audio_data,
            timeout=300,
        )
        response.raise_for_status()

        result_json = response.json()
        alternative = (
            result_json.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
        )

        transcript = alternative.get("transcript", "").strip()
        confidence = float(alternative.get("confidence") or 0.0)
        language = self.language
        detected_languages = alternative.get("languages", [])
        if detected_languages:
            language = detected_languages[0]

        return ASRResult(
            text=transcript,
            confidence=confidence,
            is_final=True,
            timestamp=None,
            language=language,
        )

    async def stream_start(
        self,
        audio_config: Optional[AudioConfig] = None,
    ) -> None:
        if self._is_started:
            logger.warning("Deepgram 流式识别已启动")
            return

        await self.reset()
        config = audio_config or AudioConfig(
            sample_rate=self.sample_rate,
            channels=self.channels,
        )

        websocket_url = self._build_live_url(config)
        self._metadata_event = asyncio.Event()
        self._websocket = await websockets.connect(
            websocket_url,
            additional_headers={"Authorization": f"Token {self.api_key}"},
            ping_interval=20,
            ping_timeout=20,
            max_size=None,
        )
        self._receiver_task = asyncio.create_task(self._receive_live_results())
        self._is_started = True

    async def stream_feed(self, audio_data: bytes) -> None:
        if not self._is_started or self._websocket is None:
            raise RuntimeError("流式识别未启动，请先调用 stream_start()")

        await self._websocket.send(audio_data)

    async def stream_stop(self) -> ASRResult:
        if not self._is_started or self._websocket is None:
            return ASRResult(
                text="",
                confidence=0.0,
                is_final=True,
                timestamp=None,
                language=self.language,
            )

        try:
            await self._websocket.send(json.dumps({"type": "Finalize"}))
            if self._metadata_event is not None:
                try:
                    await asyncio.wait_for(self._metadata_event.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    logger.warning("等待 Deepgram 最终元数据超时，继续关闭连接")

            await self._websocket.send(json.dumps({"type": "CloseStream"}))
        finally:
            if self._receiver_task is not None:
                try:
                    await asyncio.wait_for(self._receiver_task, timeout=5.0)
                except asyncio.TimeoutError:
                    self._receiver_task.cancel()
            await self._close_websocket()

        if self._final_segments:
            trailing = "".join(self._final_segments).strip()
            if trailing:
                self._completed_utterances.append(trailing)
            self._final_segments.clear()

        full_text = "".join(self._completed_utterances).strip()
        result = ASRResult(
            text=full_text,
            confidence=self._best_confidence,
            is_final=True,
            timestamp=None,
            language=self.language,
        )
        self._is_started = False
        return result

    async def _close_websocket(self) -> None:
        if self._websocket is not None:
            try:
                await self._websocket.close()
            except Exception as exc:
                logger.warning(f"关闭 Deepgram WebSocket 失败: {exc}")
            finally:
                self._websocket = None

    async def reset(self) -> None:
        if self._is_started:
            await self.cleanup()

        self._completed_utterances = []
        self._final_segments = []
        self._best_confidence = 0.0
        self._metadata_event = None
        self._receiver_task = None
        self._is_started = False

    async def cleanup(self) -> None:
        if self._websocket is not None:
            try:
                await self._websocket.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

        if self._receiver_task is not None:
            self._receiver_task.cancel()
            try:
                await self._receiver_task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.warning(f"清理 Deepgram 接收任务失败: {exc}")

        await self._close_websocket()
        self._receiver_task = None
        self._metadata_event = None
        self._is_started = False
