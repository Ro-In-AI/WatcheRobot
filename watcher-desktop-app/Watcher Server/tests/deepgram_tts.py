"""Deepgram TTS 测试脚本。

用法示例:
    export DEEPGRAM_API_KEY="your_api_key"
    python tests/deepgram_tts.py
    python tests/deepgram_tts.py --text "Hello from Deepgram." --model aura-2-thalia-en
    python tests/deepgram_tts.py --text-file /path/to/input.txt
    echo "Hello from stdin" | python tests/deepgram_tts.py

说明:
    - 走的是 Deepgram TTS REST API: POST https://api.deepgram.com/v1/speak
    - 默认输出 linear16 + wav + 24000Hz，便于本地直接试听
    - 根据 Deepgram 当前官方文档，Aura TTS 支持 en/es/de/fr/nl/it/ja，暂未看到中文语音模型
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

import requests


DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TTS_CONFIG_PATH = PROJECT_ROOT / "config" / "tts.json"
SYSTEM_CONFIG_PATH = PROJECT_ROOT / "config" / "system.json"


def read_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def read_deepgram_key_from_config() -> tuple[str, str]:
    tts_config = read_json_file(TTS_CONFIG_PATH)
    provider = str(tts_config.get("provider", "")).strip().lower()
    providers = tts_config.get("providers", {})
    if provider == "deepgram" and isinstance(providers, dict):
        provider_section = providers.get("deepgram", {})
        if isinstance(provider_section, dict):
            basic = provider_section.get("basic", {})
            if isinstance(basic, dict):
                api_key = str(basic.get("api_key", "")).strip()
                if api_key:
                    return api_key, "config/tts.json"

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deepgram TTS 测试脚本")
    parser.add_argument(
        "--api-key",
        default="",
        help="Deepgram API Key，优先级高于环境变量和 config/*.json",
    )
    parser.add_argument(
        "--text",
        default="",
        help="要合成的文本；未传时可通过 --text-file 或 stdin 提供",
    )
    parser.add_argument(
        "--text-file",
        default="",
        help="从文本文件读取要合成的内容",
    )
    parser.add_argument(
        "--model",
        default="aura-2-thalia-en",
        help="TTS 声音模型，默认 aura-2-thalia-en",
    )
    parser.add_argument(
        "--encoding",
        default="linear16",
        choices=["linear16", "mulaw", "alaw", "mp3", "opus", "flac", "aac"],
        help="输出音频编码，默认 linear16",
    )
    parser.add_argument(
        "--container",
        default="",
        help="容器格式；不传时会按编码自动推断，裸流可传 none",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=24000,
        help="输出采样率，默认 24000",
    )
    parser.add_argument(
        "--output",
        default="output/deepgram_tts",
        help="输出文件路径，默认 output/deepgram_tts，后缀会按返回格式自动补齐",
    )
    return parser.parse_args()


def resolve_text(args: argparse.Namespace) -> tuple[str, str]:
    if args.text.strip():
        return args.text.strip(), "--text"

    if args.text_file.strip():
        text_path = Path(args.text_file).expanduser().resolve()
        if not text_path.exists():
            raise SystemExit(f"文本文件不存在: {text_path}")
        text = text_path.read_text(encoding="utf-8").strip()
        if text:
            return text, "--text-file"
        raise SystemExit(f"文本文件内容为空: {text_path}")

    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
        if text:
            return text, "stdin"

    return "Hello, this is a Deepgram text to speech test.", "default"


def normalize_output_path(output: str, encoding: str, container: str) -> Path:
    output_path = Path(output).expanduser().resolve()
    if output_path.suffix:
        return output_path

    if container and container != "none":
        return output_path.with_suffix(f".{container}")
    if encoding == "mp3":
        return output_path.with_suffix(".mp3")
    if encoding == "opus":
        return output_path.with_suffix(".ogg")
    if encoding == "flac":
        return output_path.with_suffix(".flac")
    if encoding == "aac":
        return output_path.with_suffix(".aac")
    return output_path.with_suffix(".pcm")


def resolve_container(container: str, encoding: str) -> str:
    if container:
        return container
    if encoding in {"linear16", "mulaw", "alaw"}:
        return "wav"
    return "none"


def main() -> None:
    args = parse_args()
    api_key, api_key_source = resolve_api_key(args.api_key)
    text, text_source = resolve_text(args)

    if not api_key:
        raise SystemExit("缺少 Deepgram API Key，请通过 --api-key、环境变量 DEEPGRAM_API_KEY、config/tts.json 或 config/system.json 提供")

    container = resolve_container(args.container, args.encoding)
    output_path = normalize_output_path(args.output, args.encoding, container)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    params = {
        "model": args.model,
        "encoding": args.encoding,
        "sample_rate": args.sample_rate,
    }
    if container:
        params["container"] = container

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json",
    }

    payload = {"text": text}

    print("=" * 60)
    print("Deepgram TTS 测试开始")
    print("=" * 60)
    print(f"API Key 来源: {api_key_source}")
    print(f"模型: {args.model}")
    print(f"编码: {args.encoding}")
    print(f"容器: {container}")
    print(f"采样率: {args.sample_rate}")
    print(f"文本来源: {text_source}")
    print(f"文本: {text}")
    print(f"输出文件: {output_path}")

    with requests.post(
        DEEPGRAM_SPEAK_URL,
        params=params,
        headers=headers,
        json=payload,
        stream=True,
        timeout=300,
    ) as response:
        if not response.ok:
            print("请求失败:")
            print(f"HTTP {response.status_code}")
            print(response.text)
            response.raise_for_status()

        with output_path.open("wb") as output_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    output_file.write(chunk)

        print("\n合成成功")
        print(f"Content-Type: {response.headers.get('content-type', '')}")
        print(f"dg-model-name: {response.headers.get('dg-model-name', '')}")
        print(f"dg-request-id: {response.headers.get('dg-request-id', '')}")
        print(f"文件大小: {output_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
