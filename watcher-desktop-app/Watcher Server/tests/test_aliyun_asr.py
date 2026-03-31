"""阿里云 ASR 手动集成脚本。

该文件保留在 `tests/` 下供人工联调用，不作为默认单元测试收集目标。
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from src.modules.asr.config import ASRConfig
from src.modules.asr.factory import ASRFactory
from src.modules.asr.providers.aliyun import AliyunASR
from src.utils.logger import setup_logger, get_logger

# 配置日志
setup_logger()
logger = get_logger(__name__)


def build_aliyun_asr() -> AliyunASR:
    """从 `config/asr.json` 构造阿里云 ASR 实例。"""
    config_path = project_root / "config" / "asr.json"
    config = ASRConfig.from_file(str(config_path))
    if config.provider != "aliyun":
        raise ValueError("当前 config/asr.json 的 provider 不是 aliyun，请先切换后再运行此脚本")

    provider = ASRFactory.create(config)
    if not isinstance(provider, AliyunASR):
        raise TypeError(f"期望 AliyunASR，实际为 {type(provider).__name__}")
    return provider


async def run_aliyun_asr_with_file(audio_file: str) -> None:
    """使用音频文件测试阿里云 ASR。"""
    logger.info("开始测试阿里云 ASR，音频文件: {}", audio_file)

    audio_path = Path(audio_file).expanduser().resolve()
    if not audio_path.exists():
        logger.error("音频文件不存在: {}", audio_path)
        return

    asr = build_aliyun_asr()

    try:
        await asr.initialize()
        await asr.stream_start()

        audio_data = audio_path.read_bytes()
        logger.info("音频文件大小: {} bytes", len(audio_data))

        chunk_size = 640
        chunks = [audio_data[i:i + chunk_size] for i in range(0, len(audio_data), chunk_size)]
        logger.info("开始发送音频数据，共 {} 块", len(chunks))

        for index, chunk in enumerate(chunks, start=1):
            await asr.stream_feed(chunk)
            if index % 10 == 0:
                logger.info("已发送 {}/{} 个音频块", index, len(chunks))
            await asyncio.sleep(0.01)

        result = await asr.stream_stop()
        logger.info("最终识别结果: {}", result.text)
    except Exception as exc:
        logger.error("测试失败: {}", exc, exc_info=True)
    finally:
        await asr.cleanup()
        logger.info("ASR 资源已清理")


async def run_aliyun_asr_realtime() -> None:
    """使用麦克风实时测试阿里云 ASR。"""
    import numpy as np
    import sounddevice as sd

    sample_rate = 16000
    channels = 1
    chunk_duration = 0.1
    chunk_size = int(sample_rate * chunk_duration)

    asr = build_aliyun_asr()

    try:
        await asr.initialize()
        await asr.stream_start()

        loop = asyncio.get_running_loop()
        audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

        def audio_callback(indata, frames, time_info, status) -> None:
            if status:
                logger.warning(status)
            pcm = (indata * 32767).astype(np.int16).tobytes()
            loop.call_soon_threadsafe(audio_queue.put_nowait, pcm)

        logger.info("开始监听麦克风（Ctrl+C 停止）")

        with sd.InputStream(
            samplerate=sample_rate,
            channels=channels,
            dtype="float32",
            blocksize=chunk_size,
            callback=audio_callback,
        ):
            sent_chunks = 0
            while True:
                chunk = await audio_queue.get()
                await asr.stream_feed(chunk)
                sent_chunks += 1
                if sent_chunks % 10 == 0:
                    logger.info("已发送 {} 个音频块", sent_chunks)
                await asyncio.sleep(chunk_duration)
    except KeyboardInterrupt:
        logger.info("用户停止识别")
        try:
            result = await asr.stream_stop()
            logger.info("最终识别结果: {}", result.text)
        except Exception as exc:
            logger.warning("停止流式识别时失败: {}", exc)
    except Exception as exc:
        logger.error("实时测试失败: {}", exc, exc_info=True)
    finally:
        await asr.cleanup()
        logger.info("ASR 资源已清理")


def main() -> None:
    """主函数。"""
    import argparse

    parser = argparse.ArgumentParser(description="阿里云 ASR 手动集成脚本")
    parser.add_argument(
        "--mode",
        choices=["file", "realtime"],
        default="file",
        help="测试模式: file(文件模式) 或 realtime(实时模式)",
    )
    parser.add_argument(
        "--audio",
        type=str,
        help="音频文件路径（仅 file 模式需要）",
    )

    args = parser.parse_args()

    if args.mode == "file":
        if not args.audio:
            logger.error("文件模式需要指定 --audio 参数")
            return
        asyncio.run(run_aliyun_asr_with_file(args.audio))
    else:
        asyncio.run(run_aliyun_asr_realtime())


if __name__ == "__main__":
    main()
