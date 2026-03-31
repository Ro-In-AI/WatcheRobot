"""LLM 手动联调脚本。

默认从 `config/llm.json` 读取当前 provider 配置，不在导入阶段强依赖环境变量。
"""
import json
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm.json"


def load_llm_runtime_config() -> tuple[str, str, str]:
    """读取当前 LLM provider 的基础请求参数。"""
    raw = json.loads(LLM_CONFIG_PATH.read_text(encoding="utf-8"))
    provider = raw.get("provider", "")
    providers = raw.get("providers", {})
    if not isinstance(providers, dict) or provider not in providers:
        raise ValueError(f"config/llm.json 缺少 providers.{provider} 配置")

    provider_section = providers[provider]
    basic = provider_section.get("basic", {}) if isinstance(provider_section, dict) else {}
    advanced = provider_section.get("advanced", {}) if isinstance(provider_section, dict) else {}
    if not isinstance(basic, dict) or not isinstance(advanced, dict):
        raise ValueError("config/llm.json 中的 provider 配置结构无效")

    api_key = str(basic.get("api_key", "")).strip()
    model = str(basic.get("model", "")).strip()
    base_url = str(advanced.get("base_url", "")).strip().rstrip("/")

    if not api_key:
        raise ValueError("config/llm.json 中缺少当前 provider 的 api_key")
    if not model:
        raise ValueError("config/llm.json 中缺少当前 provider 的 model")
    if not base_url:
        raise ValueError("config/llm.json 中缺少当前 provider 的 base_url")

    return api_key, model, f"{base_url}/responses"


def chat(prompt: str, user_message: str) -> str:
    """调用大模型对话。"""
    api_key, model, url = load_llm_runtime_config()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    data = {
        "model": model,
        "stream": False,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_message}],
            },
        ],
    }

    response = requests.post(url, headers=headers, json=data, timeout=60)
    response.raise_for_status()

    result = response.json()
    output = result.get("output", [])
    for item in output:
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                return content.get("text", "")

    return ""


def chat_stream(prompt: str, user_message: str) -> None:
    """流式调用大模型对话。"""
    api_key, model, url = load_llm_runtime_config()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    data = {
        "model": model,
        "stream": True,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_message}],
            },
        ],
    }

    response = requests.post(url, headers=headers, json=data, stream=True, timeout=60)
    response.raise_for_status()

    print("大模型回复: ", end="")
    for line in response.iter_lines():
        if not line:
            continue
        decoded = line.decode("utf-8")
        if not decoded.startswith("data: "):
            continue

        data_str = decoded[6:]
        if data_str.strip() == "[DONE]":
            break

        try:
            payload = json.loads(data_str)
        except json.JSONDecodeError:
            continue

        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    print(content.get("text", ""), end="", flush=True)
    print()


if __name__ == "__main__":
    test_prompt = "你是一个友好的 AI 助手，请用简短的方式回答问题。"

    print("=" * 50)
    print("测试1: 普通对话")
    print("=" * 50)
    reply = chat(test_prompt, "你好，请介绍一下你自己")
    print(f"回复: {reply}")

    print()
    print("=" * 50)
    print("测试2: 流式对话")
    print("=" * 50)
    chat_stream(test_prompt, "今天有什么热点新闻")
