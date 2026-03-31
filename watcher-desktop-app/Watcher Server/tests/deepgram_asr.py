"""Deepgram ASR 测试脚本。

用法示例:
    export DEEPGRAM_API_KEY="your_api_key"

    # 文件识别
    python tests/deepgram_asr.py --mode file --audio path/to/audio.wav
    python tests/deepgram_asr.py --mode file --audio path/to/audio.pcm --encoding linear16 --sample-rate 16000

    # 麦克风实时识别
    python tests/deepgram_asr.py --mode mic

说明:
    - 文件模式走 Deepgram 预录音识别 REST API: POST https://api.deepgram.com/v1/listen
    - 麦克风模式走 Deepgram 实时识别 WebSocket: wss://api.deepgram.com/v1/listen
    - 默认语言为 multi（多语言），默认模型为 nova-2
"""
from __future__ import annotations

import argparse
import asyncio
from array import array
import json
import mimetypes
import os
from pathlib import Path
import wave
from typing import Any
from urllib.parse import urlencode

import requests


DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_LIVE_URL = "wss://api.deepgram.com/v1/listen"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASR_CONFIG_PATH = PROJECT_ROOT / "config" / "asr.json"
SYSTEM_CONFIG_PATH = PROJECT_ROOT / "config" / "system.json"


def read_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def read_deepgram_key_from_config() -> tuple[str, str]:
    asr_config = read_json_file(ASR_CONFIG_PATH)
    provider = str(asr_config.get("provider", "")).strip().lower()
    providers = asr_config.get("providers", {})
    if provider == "deepgram" and isinstance(providers, dict):
        provider_section = providers.get("deepgram", {})
        if isinstance(provider_section, dict):
            basic = provider_section.get("basic", {})
            if isinstance(basic, dict):
                api_key = str(basic.get("api_key", "")).strip()
                if api_key:
                    return api_key, "config/asr.json"

    system_config = read_json_file(SYSTEM_CONFIG_PATH)
    api_key = str(system_config.get("deepgram_api_key", "")).strip()
    if api_key:
        return api_key, "config/system.json"

    return "", "missing"


def resolve_api_key(cli_value: str = "") -> tuple[str, str]:
    if cli_value.strip():
        return cli_value.strip(), "--api-key"

    env_value = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if env_value:
        return env_value, "environment"

    return read_deepgram_key_from_config()


def mask_secret(secret: str) -> str:
    if not secret:
        return "<missing>"
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}...{secret[-4:]}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deepgram ASR 测试脚本")
    parser.add_argument(
        "--mode",
        choices=["file", "mic"],
        default="file",
        help="识别模式: file(本地文件) 或 mic(麦克风实时识别)",
    )
    parser.add_argument(
        "--audio",
        default="",
        help="本地音频文件路径；file 模式必填",
    )
    parser.add_argument(
        "--api-key",
        default="",
        help="Deepgram API Key，优先级高于环境变量和 config/*.json",
    )
    parser.add_argument(
        "--model",
        default="nova-2",
        help="Deepgram 模型，中文默认推荐 nova-2",
    )
    parser.add_argument(
        "--language",
        default="multi",
        help="语言代码，默认 multi（多语言）",
    )
    parser.add_argument(
        "--multilingual",
        action="store_true",
        help="强制使用多语言模式，等价于 --language multi",
    )
    parser.add_argument(
        "--smart-format",
        action="store_true",
        default=True,
        help="开启 smart_format，默认开启",
    )
    parser.add_argument(
        "--no-smart-format",
        dest="smart_format",
        action="store_false",
        help="关闭 smart_format",
    )
    parser.add_argument(
        "--detect-language",
        action="store_true",
        help="自动检测语言",
    )
    parser.add_argument(
        "--encoding",
        default="",
        help="file 模式下原始无容器音频的编码，例如 linear16",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="采样率，默认 16000",
    )
    parser.add_argument(
        "--channels",
        type=int,
        default=1,
        help="声道数，默认 1",
    )
    parser.add_argument(
        "--content-type",
        default="",
        help="file 模式下手动覆盖 HTTP Content-Type",
    )
    parser.add_argument(
        "--output-json",
        default="",
        help="file 模式可选：把完整返回 JSON 保存到指定路径",
    )
    parser.add_argument(
        "--chunk-ms",
        type=int,
        default=100,
        help="mic 模式每块音频时长，默认 100ms",
    )
    parser.add_argument(
        "--device",
        default="",
        help="mic 模式指定录音设备名称或设备编号",
    )
    parser.add_argument(
        "--interim-results",
        action="store_true",
        default=True,
        help="mic 模式开启中间结果，默认开启",
    )
    parser.add_argument(
        "--no-interim-results",
        dest="interim_results",
        action="store_false",
        help="mic 模式关闭中间结果",
    )
    parser.add_argument(
        "--punctuate",
        action="store_true",
        default=True,
        help="mic 模式自动标点，默认开启",
    )
    parser.add_argument(
        "--no-punctuate",
        dest="punctuate",
        action="store_false",
        help="mic 模式关闭自动标点",
    )
    parser.add_argument(
        "--vad-events",
        action="store_true",
        default=True,
        help="mic 模式启用语音活动事件，默认开启",
    )
    parser.add_argument(
        "--no-vad-events",
        dest="vad_events",
        action="store_false",
        help="mic 模式关闭语音活动事件",
    )
    parser.add_argument(
        "--endpointing",
        type=int,
        default=300,
        help="mic 模式端点检测毫秒数，默认 300",
    )
    parser.add_argument(
        "--utterance-end-ms",
        type=int,
        default=1000,
        help="mic 模式静音多久判定一句结束，默认 1000ms",
    )
    parser.add_argument(
        "--list-devices",
        action="store_true",
        help="列出本机可用录音设备后退出",
    )
    parser.add_argument(
        "--log-audio-level",
        action="store_true",
        help="mic 模式打印音频能量诊断，便于排查是否采到了人声",
    )
    parser.add_argument(
        "--save-mic-wav",
        default="",
        help="mic 模式把采集到的原始音频保存为 WAV 文件，便于回放排查",
    )
    return parser.parse_args()


def guess_content_type(audio_path: Path) -> str:
    suffix = audio_path.suffix.lower()
    manual_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".mp4": "video/mp4",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".opus": "audio/ogg",
        ".aac": "audio/aac",
        ".pcm": "application/octet-stream",
        ".raw": "application/octet-stream",
    }
    if suffix in manual_map:
        return manual_map[suffix]

    guessed, _ = mimetypes.guess_type(str(audio_path))
    return guessed or "application/octet-stream"


def is_raw_audio(audio_path: Path, encoding: str) -> bool:
    return audio_path.suffix.lower() in {".pcm", ".raw"} or bool(encoding)


def build_prerecorded_params(args: argparse.Namespace, raw_audio: bool) -> dict[str, Any]:
    params: dict[str, Any] = {
        "model": args.model,
        "smart_format": str(args.smart_format).lower(),
        "channels": args.channels,
    }

    if args.multilingual:
        params["language"] = "multi"
    elif args.detect_language:
        params["detect_language"] = "true"
    elif args.language:
        params["language"] = args.language

    if raw_audio:
        if not args.encoding:
            raise ValueError("原始 PCM/RAW 音频必须通过 --encoding 指定编码，例如 linear16")
        params["encoding"] = args.encoding
        params["sample_rate"] = args.sample_rate

    return params


def extract_best_alternative(result_json: dict[str, Any]) -> dict[str, Any]:
    return (
        result_json.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
    )


def run_file_mode(args: argparse.Namespace) -> None:
    if not args.audio:
        raise SystemExit("file 模式需要传入 --audio")

    audio_path = Path(args.audio).expanduser().resolve()
    if not audio_path.exists():
        raise SystemExit(f"音频文件不存在: {audio_path}")

    raw_audio = is_raw_audio(audio_path, args.encoding)
    params = build_prerecorded_params(args, raw_audio)
    content_type = args.content_type or guess_content_type(audio_path)

    print("=" * 60)
    print("Deepgram ASR 文件测试开始")
    print("=" * 60)
    print(f"音频文件: {audio_path}")
    print(f"文件大小: {audio_path.stat().st_size} bytes")
    print(f"模型: {args.model}")
    display_language = "multi(多语言)" if args.multilingual or args.language == "multi" else (
        "自动检测" if args.detect_language else args.language
    )
    print(f"语言: {display_language}")
    print(f"Content-Type: {content_type}")
    if raw_audio:
        print(
            f"原始音频参数: encoding={args.encoding}, "
            f"sample_rate={args.sample_rate}, channels={args.channels}"
        )

    headers = {
        "Authorization": f"Token {args.api_key}",
        "Content-Type": content_type,
    }

    with audio_path.open("rb") as audio_file:
        response = requests.post(
            DEEPGRAM_LISTEN_URL,
            params=params,
            headers=headers,
            data=audio_file,
            timeout=300,
        )

    if not response.ok:
        print("请求失败:")
        print(f"HTTP {response.status_code}")
        print(response.text)
        response.raise_for_status()

    result_json = response.json()
    alternative = extract_best_alternative(result_json)
    transcript = alternative.get("transcript", "")
    confidence = alternative.get("confidence")
    words = alternative.get("words", [])
    metadata = result_json.get("metadata", {})

    print("\n识别成功")
    print(f"request_id: {metadata.get('request_id', '')}")
    print(f"模型版本: {metadata.get('model_info', {}).get('name', '')}")
    print(f"置信度: {confidence}")
    print(f"词数: {len(words)}")
    print("转写结果:")
    print(transcript or "<empty transcript>")

    if args.output_json:
        output_path = Path(args.output_json).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(result_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\n完整 JSON 已保存到: {output_path}")


def build_live_url(args: argparse.Namespace) -> str:
    params: dict[str, Any] = {
        "model": args.model,
        "encoding": "linear16",
        "sample_rate": args.sample_rate,
        "channels": args.channels,
        "interim_results": str(args.interim_results).lower(),
        "smart_format": str(args.smart_format).lower(),
        "punctuate": str(args.punctuate).lower(),
        "vad_events": str(args.vad_events).lower(),
        "endpointing": args.endpointing,
        "utterance_end_ms": args.utterance_end_ms,
    }

    if args.multilingual:
        params["language"] = "multi"
    elif args.detect_language:
        params["detect_language"] = "true"
    elif args.language:
        params["language"] = args.language

    return f"{DEEPGRAM_LIVE_URL}?{urlencode(params)}"


def describe_input_device(sd: Any, device: int | str | None) -> dict[str, Any]:
    if device is None:
        default_device = sd.default.device
        if isinstance(default_device, (list, tuple)) and default_device:
            device = default_device[0]
        else:
            device = default_device

    return sd.query_devices(device, "input")


def print_input_devices(sd: Any) -> None:
    default_device = sd.default.device
    default_input = default_device[0] if isinstance(default_device, (list, tuple)) else default_device

    print("=" * 60)
    print("可用录音设备")
    print("=" * 60)
    for index, device in enumerate(sd.query_devices()):
        max_input_channels = int(device.get("max_input_channels", 0))
        if max_input_channels <= 0:
            continue

        marker = " (default)" if index == default_input else ""
        print(
            f"[{index}] {device['name']}{marker} | "
            f"in_ch={max_input_channels} | "
            f"default_sr={device.get('default_samplerate')}"
        )


def summarize_pcm16(chunk: bytes) -> tuple[float, int]:
    if not chunk:
        return 0.0, 0

    samples = array("h")
    samples.frombytes(chunk)
    if not samples:
        return 0.0, 0

    peak = max(abs(sample) for sample in samples)
    rms = (sum(sample * sample for sample in samples) / len(samples)) ** 0.5
    return rms, peak


def maybe_save_wav(path_value: str, audio_bytes: bytes, sample_rate: int, channels: int) -> Path | None:
    if not path_value:
        return None

    output_path = Path(path_value).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_bytes)

    return output_path


async def receive_live_results(websocket: Any) -> list[str]:
    final_segments: list[str] = []
    completed_utterances: list[str] = []

    async for message in websocket:
        if isinstance(message, bytes):
            continue

        event = json.loads(message)
        event_type = event.get("type", "")

        if event_type == "Results":
            channel = event.get("channel", {})
            alternatives = channel.get("alternatives", [])
            alternative = alternatives[0] if alternatives else {}
            transcript = alternative.get("transcript", "").strip()
            words = alternative.get("words", [])
            metadata = event.get("metadata", {})
            is_final = bool(event.get("is_final"))
            speech_final = bool(event.get("speech_final"))
            from_finalize = bool(event.get("from_finalize"))
            detected_languages = alternative.get("languages", [])

            print(
                "[result] "
                f"is_final={is_final} "
                f"speech_final={speech_final} "
                f"from_finalize={from_finalize} "
                f"words={len(words)} "
                f"languages={detected_languages or '-'} "
                f"model={metadata.get('model_info', {}).get('name', '-')}"
            )

            if not transcript:
                print("[result] transcript=<empty>")
            else:
                prefix = "[final]" if is_final else "[interim]"
                print(f"{prefix} {transcript}")

            if is_final and transcript:
                final_segments.append(transcript)

            if speech_final and final_segments:
                utterance = "".join(final_segments).strip()
                if utterance:
                    print(f"[utterance] {utterance}")
                    completed_utterances.append(utterance)
                final_segments.clear()
        elif event_type == "SpeechStarted":
            print("[event] 检测到开始说话")
        elif event_type == "UtteranceEnd":
            print("[event] 一句话结束")
        elif event_type == "Metadata":
            print(
                "[event] 会话结束，"
                f"request_id={event.get('request_id', '')} "
                f"duration={event.get('duration', '')} "
                f"channels={event.get('channels', '')}"
            )
        elif event_type:
            print(f"[event] {event_type}: {json.dumps(event, ensure_ascii=False)}")

    if final_segments:
        trailing_utterance = "".join(final_segments).strip()
        if trailing_utterance:
            completed_utterances.append(trailing_utterance)

    return completed_utterances


async def run_mic_mode(args: argparse.Namespace) -> None:
    try:
        import sounddevice as sd
    except ImportError as exc:
        raise SystemExit(
            "mic 模式需要安装 sounddevice。可执行: pip install sounddevice"
        ) from exc
    try:
        import websockets
    except ImportError as exc:
        raise SystemExit(
            "mic 模式需要安装 websockets。可执行: pip install websockets"
        ) from exc

    if args.list_devices:
        print_input_devices(sd)
        return

    loop = asyncio.get_running_loop()
    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    websocket_url = build_live_url(args)
    blocksize = int(args.sample_rate * args.chunk_ms / 1000)
    captured_audio = bytearray()
    chunk_count = 0
    max_rms = 0.0
    max_peak = 0

    device: int | str | None = args.device if args.device else None
    if isinstance(device, str) and device.isdigit():
        device = int(device)

    device_info = describe_input_device(sd, device)

    print("=" * 60)
    print("Deepgram ASR 麦克风测试开始")
    print("=" * 60)
    print(f"模型: {args.model}")
    display_language = "multi(多语言)" if args.multilingual or args.language == "multi" else (
        "自动检测" if args.detect_language else args.language
    )
    print(f"语言: {display_language}")
    print(f"采样率: {args.sample_rate}")
    print(f"声道数: {args.channels}")
    print(f"chunk: {args.chunk_ms}ms")
    print(f"输入设备: {device_info.get('name', '<unknown>')}")
    print(f"设备默认采样率: {device_info.get('default_samplerate', '<unknown>')}")
    print("按回车停止录音并结束识别\n")

    async with websockets.connect(
        websocket_url,
        additional_headers={"Authorization": f"Token {args.api_key}"},
        ping_interval=20,
        ping_timeout=20,
        max_size=None,
    ) as websocket:
        request_id = getattr(websocket, "response_headers", {}).get("dg-request-id", "")
        if request_id:
            print(f"[connect] dg-request-id={request_id}")
        receiver_task = asyncio.create_task(receive_live_results(websocket))

        def audio_callback(indata: Any, frames: int, time_info: Any, status: Any) -> None:
            nonlocal chunk_count, max_rms, max_peak
            if status:
                print(f"[mic] {status}")
            chunk = bytes(indata)
            if not chunk:
                return

            chunk_count += 1
            captured_audio.extend(chunk)

            if args.log_audio_level:
                rms, peak = summarize_pcm16(chunk)
                max_rms = max(max_rms, rms)
                max_peak = max(max_peak, peak)
                if chunk_count <= 5 or chunk_count % 10 == 0:
                    print(
                        "[mic] "
                        f"chunk={chunk_count} frames={frames} "
                        f"bytes={len(chunk)} rms={rms:.1f} peak={peak}"
                    )

            loop.call_soon_threadsafe(audio_queue.put_nowait, chunk)

        with sd.RawInputStream(
            samplerate=args.sample_rate,
            channels=args.channels,
            dtype="int16",
            blocksize=blocksize,
            callback=audio_callback,
            device=device,
        ):
            print("开始录音...")

            async def sender() -> None:
                while True:
                    chunk = await audio_queue.get()
                    if chunk is None:
                        break
                    await websocket.send(chunk)

            sender_task = asyncio.create_task(sender())

            try:
                await asyncio.to_thread(input)
            finally:
                await audio_queue.put(None)
                await sender_task
                await websocket.send(json.dumps({"type": "Finalize"}))
                await asyncio.sleep(2.0)
                await websocket.send(json.dumps({"type": "CloseStream"}))

        completed_utterances = await receiver_task

    saved_wav_path = maybe_save_wav(
        args.save_mic_wav,
        bytes(captured_audio),
        args.sample_rate,
        args.channels,
    )

    duration_seconds = (
        len(captured_audio) / (args.sample_rate * args.channels * 2)
        if captured_audio
        else 0.0
    )
    print(
        "[mic] capture_summary "
        f"chunks={chunk_count} bytes={len(captured_audio)} "
        f"seconds={duration_seconds:.2f}"
    )
    if args.log_audio_level:
        print(f"[mic] level_summary max_rms={max_rms:.1f} max_peak={max_peak}")
    if saved_wav_path:
        print(f"[mic] WAV 已保存: {saved_wav_path}")

    print("\n" + "=" * 60)
    print("完整 ASR 输出")
    print("=" * 60)
    full_transcript = "".join(completed_utterances).strip()
    print(full_transcript or "<empty transcript>")


def main() -> None:
    args = parse_args()
    api_key, api_key_source = resolve_api_key(args.api_key)
    if not api_key:
        raise SystemExit("缺少 Deepgram API Key，请通过 --api-key、环境变量 DEEPGRAM_API_KEY、config/asr.json 或 config/system.json 提供")

    args.api_key = api_key
    print(f"Deepgram API Key 来源: {api_key_source} ({mask_secret(api_key)})")

    if args.mode == "file":
        run_file_mode(args)
    else:
        asyncio.run(run_mic_mode(args))


if __name__ == "__main__":
    main()
