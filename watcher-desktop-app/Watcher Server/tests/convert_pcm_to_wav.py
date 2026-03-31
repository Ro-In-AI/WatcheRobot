"""PCM转WAV格式工具"""
import argparse
import os
import sys
import wave
from pathlib import Path


def pcm_to_wav(pcm_file: str, wav_file: str = None, sample_rate: int = 24000, channels: int = 1, sampwidth: int = 2):
    """将PCM文件转换为WAV文件

    Args:
        pcm_file: PCM文件路径
        wav_file: WAV文件路径（默认与PCM同目录）
        sample_rate: 采样率，默认24000（火山引擎TTS PCM默认采样率）
        channels: 声道数，默认1（单声道）
        sampwidth: 采样宽度（字节），默认2（16位）
    """
    pcm_path = Path(pcm_file)

    if not pcm_path.exists():
        print(f"错误: 文件不存在 - {pcm_file}")
        return False

    # 如果没有指定输出文件名
    if wav_file is None:
        wav_file = pcm_path.with_suffix('.wav')
    else:
        wav_file = Path(wav_file)

    # 确保输出目录存在
    wav_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        # 读取PCM数据
        with open(pcm_path, 'rb') as f:
            pcm_data = f.read()

        # 创建WAV文件
        with wave.open(str(wav_file), 'wb') as wav:
            wav.setnchannels(channels)
            wav.setsampwidth(sampwidth)
            wav.setframerate(sample_rate)
            wav.writeframes(pcm_data)

        # 计算时长
        duration = len(pcm_data) / (sample_rate * channels * sampwidth)

        print(f"转换成功: {pcm_path.name} -> {wav_file.name}")
        print(f"  采样率: {sample_rate} Hz")
        print(f"  声道数: {channels}")
        print(f"  采样位: {sampwidth * 8} bit")
        print(f"  文件大小: {len(pcm_data)} bytes")
        print(f"  时长: {duration:.2f} 秒")

        return True

    except Exception as e:
        print(f"转换失败: {e}")
        return False


def batch_convert(input_dir: str, output_dir: str = None, sample_rate: int = 24000, channels: int = 1):
    """批量转换目录下的所有PCM文件

    Args:
        input_dir: 输入目录
        output_dir: 输出目录（默认与输入相同）
        sample_rate: 采样率 (默认24000，火山引擎TTS PCM默认采样率)
        channels: 声道数
    """
    input_path = Path(input_dir)

    if not input_path.exists():
        print(f"错误: 目录不存在 - {input_dir}")
        return

    if output_dir is None:
        output_path = input_path
    else:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

    # 查找所有PCM文件
    pcm_files = list(input_path.glob("*.pcm"))

    if not pcm_files:
        print(f"在 {input_path} 中没有找到PCM文件")
        return

    print(f"找到 {len(pcm_files)} 个PCM文件，开始转换...\n")

    success_count = 0
    for pcm_file in pcm_files:
        output_file = output_path / pcm_file.with_suffix('.wav').name
        if pcm_to_wav(str(pcm_file), str(output_file), sample_rate, channels):
            success_count += 1

    print(f"\n转换完成: {success_count}/{len(pcm_files)} 成功")


def main():
    parser = argparse.ArgumentParser(description="PCM转WAV格式工具")

    # 添加两种模式
    subparsers = parser.add_subparsers(dest="command", help="命令模式")

    # 单文件转换模式
    convert_parser = subparsers.add_parser("convert", help="转换单个PCM文件")
    convert_parser.add_argument("input", help="输入的PCM文件")
    convert_parser.add_argument("-o", "--output", help="输出的WAV文件（可选）")
    convert_parser.add_argument("-r", "--sample-rate", type=int, default=24000, help="采样率 (默认: 24000)")
    convert_parser.add_argument("-c", "--channels", type=int, default=1, help="声道数 (默认: 1)")

    # 批量转换模式
    batch_parser = subparsers.add_parser("batch", help="批量转换目录下所有PCM文件")
    batch_parser.add_argument("input_dir", help="输入目录")
    batch_parser.add_argument("-o", "--output-dir", help="输出目录（可选）")
    batch_parser.add_argument("-r", "--sample-rate", type=int, default=24000, help="采样率 (默认: 24000)")
    batch_parser.add_argument("-c", "--channels", type=int, default=1, help="声道数 (默认: 1)")

    args = parser.parse_args()

    if args.command == "convert":
        pcm_to_wav(args.input, args.output, args.sample_rate, args.channels)
    elif args.command == "batch":
        batch_convert(args.input_dir, args.output_dir, args.sample_rate, args.channels)
    else:
        # 如果没有指定命令，尝试转换命令行参数中的文件
        parser.print_help()


if __name__ == "__main__":
    main()
