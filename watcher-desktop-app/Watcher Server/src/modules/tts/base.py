"""TTS 基础类"""
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, AsyncIterator, Callable, Awaitable, TYPE_CHECKING

if TYPE_CHECKING:
    pass


@dataclass
class TTSResult:
    """TTS合成结果"""

    audio_data: bytes  # 音频二进制数据
    format: str  # 音频格式 (wav, mp3, etc.)
    sample_rate: int  # 采样率
    duration: Optional[float] = None  # 时长(秒)
    chunk_index: int = 0  # 当前分片序号（从0开始）
    chunk_count: int = 1  # 总分片数
    is_first: bool = True  # 是否首片
    is_last: bool = True  # 是否末片


class TTSProvider(ABC):
    """TTS提供商基类"""

    def __init__(self):
        """初始化TTS提供商"""
        self._is_initialized = False

    @abstractmethod
    async def initialize(self):
        """初始化TTS引擎"""
        pass

    @abstractmethod
    async def synthesize(self, text: str) -> TTSResult:
        """合成语音

        Args:
            text: 要合成的文本

        Returns:
            TTS合成结果
        """
        pass

    @abstractmethod
    async def cleanup(self):
        """清理资源"""
        pass

    @property
    def is_initialized(self) -> bool:
        """是否已初始化"""
        return self._is_initialized

    @staticmethod
    def split_text_by_sentences(text: str, max_length: int = 200) -> list[str]:
        """按标点符号分句，支持长文本切分

        Args:
            text: 原始文本
            max_length: 单句最大字符数

        Returns:
            list[str]: 句子列表
        """
        if not text:
            return []

        # 标点符号正则
        sentence_end = re.compile(r'([。！？；\n]+)')
        # 分割句子
        sentences = sentence_end.split(text)

        result = []
        current = ""

        for part in sentences:
            # 如果是分隔符，直接添加到当前句子并结束
            if sentence_end.match(part):
                current += part
                if current.strip():
                    result.append(current.strip())
                current = ""
            else:
                # 检查当前部分是否超长
                if len(current) + len(part) > max_length:
                    # 当前句子太长，需要分割
                    if current.strip():
                        result.append(current.strip())
                    # 尝试在当前部分中找到合适的位置分割
                    remaining = part
                    while len(remaining) > max_length:
                        # 找到逗号分割
                        comma_pos = remaining[:max_length].rfind('，')
                        if comma_pos > max_length // 2:
                            result.append(remaining[:comma_pos + 1].strip())
                            remaining = remaining[comma_pos + 1:]
                        else:
                            # 没有合适的分割点，直接截断
                            result.append(remaining[:max_length].strip())
                            remaining = remaining[max_length:]
                    current = remaining
                else:
                    current += part

        # 处理最后剩余的文本
        if current.strip():
            result.append(current.strip())

        return result if result else [text]

    @abstractmethod
    async def synthesize_stream(self, text: str) -> AsyncIterator[TTSResult]:
        """流式合成语音（边合成边返回）

        Args:
            text: 要合成的文本

        Yields:
            TTSResult: 音频片段结果
        """
        pass


# ========== 回调机制 ==========

class TTSEventData:
    """TTS 事件数据"""

    def __init__(
        self,
        result: "TTSResult",
        provider: "TTSProvider",
        session_id: Optional[str] = None,
    ):
        self.result = result
        self.provider = provider
        self.session_id = session_id


# 回调类型定义
TTSCallback = Callable[[TTSEventData], Awaitable[None]]


class TTSCallbacks:
    """TTS 回调集合"""

    def __init__(
        self,
        on_audio_chunk: Optional[TTSCallback] = None,
        on_complete: Optional[TTSCallback] = None,
        on_error: Optional[TTSCallback] = None,
        on_start: Optional[TTSCallback] = None,
    ):
        """初始化回调集合

        Args:
            on_audio_chunk: 音频片段回调
            on_complete: 合成完成回调
            on_error: 错误回调
            on_start: 开始回调
        """
        self.on_audio_chunk = on_audio_chunk
        self.on_complete = on_complete
        self.on_error = on_error
        self.on_start = on_start

    async def call_audio_chunk(self, event_data: TTSEventData) -> None:
        """触发音频片段回调"""
        if self.on_audio_chunk:
            await self.on_audio_chunk(event_data)

    async def call_complete(self, event_data: TTSEventData) -> None:
        """触发完成回调"""
        if self.on_complete:
            await self.on_complete(event_data)

    async def call_error(self, event_data: TTSEventData) -> None:
        """触发错误回调"""
        if self.on_error:
            await self.on_error(event_data)

    async def call_start(self, event_data: TTSEventData) -> None:
        """触发开始回调"""
        if self.on_start:
            await self.on_start(event_data)
