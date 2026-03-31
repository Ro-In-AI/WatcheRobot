"""ASR 基础类定义"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Callable, Awaitable, TYPE_CHECKING

if TYPE_CHECKING:
    pass


@dataclass
class AudioConfig:
    """音频配置"""
    sample_rate: int = 16000      # 采样率
    channels: int = 1             # 声道数
    format: str = "pcm"           # 音频格式 (pcm, wav, mp3)
    codec: str = "pcm_s16le"      # 编解码器


@dataclass
class ASRResult:
    """ASR 识别结果"""

    text: str                     # 识别文本
    confidence: float             # 置信度 0-1
    is_final: bool               # 是否为最终结果
    timestamp: Optional[float]   # 时间戳
    language: str = "zh-CN"      # 识别语言
    duration: Optional[float] = None    # 音频时长（秒）


class ASRProvider(ABC):
    """ASR 提供商基类"""

    def __init__(self):
        """初始化 ASR 提供商"""
        self._is_initialized = False

    @abstractmethod
    async def initialize(self) -> None:
        """初始化 ASR 引擎/会话"""
        pass

    @abstractmethod
    async def recognize(
        self,
        audio_data: bytes,
        audio_config: Optional[AudioConfig] = None
    ) -> ASRResult:
        """识别一段音频（非流式）

        Args:
            audio_data: 音频二进制数据
            audio_config: 音频配置

        Returns:
            ASRResult: 识别结果
        """
        pass

    @abstractmethod
    async def stream_start(
        self,
        audio_config: Optional[AudioConfig] = None
    ) -> None:
        """开始流式识别会话"""
        pass

    @abstractmethod
    async def stream_feed(self, audio_data: bytes) -> None:
        """输入音频数据（流式）

        Args:
            audio_data: 音频二进制数据块
        """
        pass

    @abstractmethod
    async def stream_stop() -> ASRResult:
        """停止流式识别，返回最终结果

        Returns:
            ASRResult: 最终识别结果
        """
        pass

    @abstractmethod
    async def reset(self) -> None:
        """重置识别状态"""
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """清理资源"""
        pass

    @property
    def is_initialized(self) -> bool:
        """是否已初始化"""
        return self._is_initialized


# ========== 回调机制 ==========

class ASREventData:
    """ASR 事件数据"""

    def __init__(
        self,
        result: "ASRResult",
        provider: "ASRProvider",
        session_id: Optional[str] = None,
    ):
        self.result = result
        self.provider = provider
        self.session_id = session_id


# 回调类型定义
ASRCallback = Callable[[ASREventData], Awaitable[None]]


class ASRCallbacks:
    """ASR 回调集合"""

    def __init__(
        self,
        on_intermediate_result: Optional[ASRCallback] = None,
        on_final_result: Optional[ASRCallback] = None,
        on_error: Optional[ASRCallback] = None,
        on_start: Optional[ASRCallback] = None,
        on_end: Optional[ASRCallback] = None,
    ):
        """初始化回调集合

        Args:
            on_intermediate_result: 中间结果回调
            on_final_result: 最终结果回调
            on_error: 错误回调
            on_start: 开始识别回调
            on_end: 结束识别回调
        """
        self.on_intermediate_result = on_intermediate_result
        self.on_final_result = on_final_result
        self.on_error = on_error
        self.on_start = on_start
        self.on_end = on_end

    async def call_intermediate(self, event_data: ASREventData) -> None:
        """触发中间结果回调"""
        if self.on_intermediate_result:
            await self.on_intermediate_result(event_data)

    async def call_final(self, event_data: ASREventData) -> None:
        """触发最终结果回调"""
        if self.on_final_result:
            await self.on_final_result(event_data)

    async def call_error(self, event_data: ASREventData) -> None:
        """触发错误回调"""
        if self.on_error:
            await self.on_error(event_data)

    async def call_start(self, event_data: ASREventData) -> None:
        """触发开始回调"""
        if self.on_start:
            await self.on_start(event_data)

    async def call_end(self, event_data: ASREventData) -> None:
        """触发结束回调"""
        if self.on_end:
            await self.on_end(event_data)
