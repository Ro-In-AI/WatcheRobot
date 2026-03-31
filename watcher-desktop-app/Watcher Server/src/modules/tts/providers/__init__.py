"""TTS Provider 实现"""
from .deepgram import DeepgramTTS
from .huoshan import HuoshanTTS

__all__ = ["DeepgramTTS", "HuoshanTTS"]
