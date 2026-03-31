"""Deepgram TTS Provider 实现"""
import asyncio
from typing import AsyncIterator

import requests

from src.config import settings
from src.utils.logger import get_logger

from ..base import TTSProvider, TTSResult
from ..registry import register_provider

logger = get_logger(__name__)


DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak"

def _resolve_api_key(cli_value: str = "") -> str:
    if cli_value.strip():
        return cli_value.strip()

    if getattr(settings, "deepgram_api_key", "").strip():
        return settings.deepgram_api_key.strip()
    return ""


@register_provider("deepgram", {
    "api_key": str,
    "speak_url": str,
    "model": str,
    "encoding": str,
    "container": str,
    "timeout": int,
})
class DeepgramTTS(TTSProvider):
    """Deepgram TTS Provider"""

    def __init__(
        self,
        api_key: str = "",
        speak_url: str = DEEPGRAM_SPEAK_URL,
        model: str = "aura-2-thalia-en",
        sample_rate: int = 24000,
        encoding: str = "linear16",
        container: str = "none",
        timeout: int = 300,
    ):
        super().__init__()

        self.api_key = _resolve_api_key(api_key)
        if not self.api_key:
            raise ValueError("缺少 Deepgram API Key，请在 config/tts.json 或 config/system.json 中配置")

        self.speak_url = speak_url
        self.model = model
        self.sample_rate = sample_rate
        self.encoding = encoding
        self.container = container
        self.timeout = timeout

    async def initialize(self):
        if self._is_initialized:
            logger.warning("Deepgram TTS 已经初始化")
            return

        logger.info(
            f"初始化 Deepgram TTS: model={self.model} sample_rate={self.sample_rate} "
            f"encoding={self.encoding} container={self.container}"
        )
        self._is_initialized = True

    async def synthesize(self, text: str) -> TTSResult:
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        clean_text = text.strip()
        if not clean_text:
            return TTSResult(audio_data=b"", format="pcm", sample_rate=self.sample_rate, duration=0.0)

        logger.info(f"开始 Deepgram TTS 合成: {clean_text[:50]}...")
        audio_data = await asyncio.to_thread(self._synthesize_sync, clean_text)
        duration = self._estimate_duration(audio_data)

        logger.info(
            f"Deepgram TTS 合成完成: audio_size={len(audio_data)} bytes, duration={duration}s"
        )

        return TTSResult(
            audio_data=audio_data,
            format=self._result_format(),
            sample_rate=self.sample_rate,
            duration=duration,
        )

    async def synthesize_stream(self, text: str) -> AsyncIterator[TTSResult]:
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        sentences = self.split_text_by_sentences(text, max_length=200)
        logger.info(f"文本已拆分为 {len(sentences)} 个句子")

        for i, sentence in enumerate(sentences):
            clean_sentence = sentence.strip()
            if not clean_sentence:
                continue

            logger.debug(f"流式合成第 {i + 1}/{len(sentences)} 句: {clean_sentence[:30]}...")
            audio_data = await asyncio.to_thread(self._synthesize_sync, clean_sentence)
            duration = self._estimate_duration(audio_data)

            yield TTSResult(
                audio_data=audio_data,
                format=self._result_format(),
                sample_rate=self.sample_rate,
                duration=duration,
            )

    async def cleanup(self):
        self._is_initialized = False
        logger.info("Deepgram TTS 资源清理完成")

    def _build_params(self) -> dict:
        params = {
            "model": self.model,
            "encoding": self.encoding,
            "sample_rate": self.sample_rate,
        }
        if self.container:
            params["container"] = self.container
        return params

    def _synthesize_sync(self, text: str) -> bytes:
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json",
        }

        response = requests.post(
            self.speak_url,
            params=self._build_params(),
            headers=headers,
            json={"text": text},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.content

    def _result_format(self) -> str:
        if self.encoding == "linear16" and self.container == "none":
            return "pcm"
        return self.encoding

    def _estimate_duration(self, audio_data: bytes) -> float | None:
        if self.encoding == "linear16" and self.container == "none":
            return len(audio_data) / (self.sample_rate * 2)
        return None
