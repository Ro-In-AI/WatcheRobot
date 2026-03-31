"""火山引擎 TTS 手动集成脚本。

默认从 `config/tts.json` 中读取 `huoshan` 配置，不在导入阶段依赖环境变量或硬编码密钥。
"""
import asyncio
import json
import sys
import wave
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from src.modules.tts.config import TTSConfig
from src.modules.tts.factory import TTSFactory
from src.modules.tts.providers.huoshan import HuoshanTTS
from src.utils.logger import setup_logger, get_logger

# 配置日志
setup_logger()
logger = get_logger(__name__)


def build_huoshan_tts() -> HuoshanTTS:
    """从 `config/tts.json` 构造火山引擎 TTS 实例。"""
    config_path = project_root / "config" / "tts.json"
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    raw["provider"] = "huoshan"

    config = TTSConfig.from_dict(raw)
    provider = TTSFactory.create(config)
    if not isinstance(provider, HuoshanTTS):
        raise TypeError(f"期望 HuoshanTTS，实际为 {type(provider).__name__}")
    return provider


async def run_tts_synthesize() -> None:
    """测试基础 TTS 合成。"""
    logger.info("=" * 60)
    logger.info("开始测试火山引擎 TTS 语音合成")
    logger.info("=" * 60)

    tts = build_huoshan_tts()

    try:
        await tts.initialize()
        logger.info("TTS 初始化成功")

        test_texts = [
            "你好，我是语音合成测试。",
            "今天天气真不错！",
            "语音识别和语音合成是人工智能的重要应用领域。",
            "Hello, this is a test for TTS.",
        ]

        for index, text in enumerate(test_texts, start=1):
            logger.info("--- 测试 {}: {} ---", index, text)
            result = await tts.synthesize(text)

            logger.info("音频格式: {}", result.format)
            logger.info("采样率: {} Hz", result.sample_rate)
            logger.info("音频大小: {} bytes", len(result.audio_data))
            if result.duration is not None:
                logger.info("时长: {:.2f} 秒", result.duration)

            output_file = project_root / "output" / f"tts_test_{index}.pcm"
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_bytes(result.audio_data)
            logger.info("音频已保存到: {}", output_file)
    except Exception as exc:
        logger.error("测试失败: {}", exc, exc_info=True)
    finally:
        await tts.cleanup()
        logger.info("TTS 资源已清理")


async def run_tts_with_wav_header() -> None:
    """测试生成带 WAV 头的音频文件。"""
    logger.info("=" * 60)
    logger.info("测试生成带 WAV 头的音频文件")
    logger.info("=" * 60)

    tts = build_huoshan_tts()

    try:
        await tts.initialize()
        text = "这是一个带 WAV 头文件的测试。"
        logger.info("合成文本: {}", text)

        result = await tts.synthesize(text)
        output_file = project_root / "output" / "tts_test_with_header.wav"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with wave.open(str(output_file), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(result.sample_rate)
            wav_file.writeframes(result.audio_data)

        logger.info("WAV 文件已保存到: {}", output_file)
    except Exception as exc:
        logger.error("测试失败: {}", exc, exc_info=True)
    finally:
        await tts.cleanup()


async def main() -> None:
    """主函数。"""
    await run_tts_synthesize()
    await run_tts_with_wav_header()


if __name__ == "__main__":
    asyncio.run(main())
