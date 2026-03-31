"""Ark LLM 实现"""
import json
import asyncio
from typing import Optional, AsyncIterator, List, Dict, Any

import requests

from ..base import (
    LLMProvider,
    LLMResponse,
    LLMStreamChunk,
    LLMConfig,
    Message,
    Role,
)
from ..registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)


@register_provider("ark", {
    "api_key": str,
    "model": str,
    "base_url": str,
})
class ArkLLM(LLMProvider):
    """Ark LLM 提供商

    支持火山引擎 Ark API 的 LLM 服务
    """

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek-v3-2-251201",
        base_url: str = "https://ark.cn-beijing.volces.com/api/v3",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.9,
    ):
        """初始化 Ark LLM

        Args:
            api_key: API Key
            model: 模型名称
            base_url: API 基础地址
            temperature: 温度参数
            max_tokens: 最大 token 数
            top_p: top-p 采样参数
        """
        super().__init__()
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self._url = f"{base_url}/responses"

        logger.info(
            f"Ark LLM 初始化: model={model}, base_url={base_url}, "
            f"temperature={temperature}, max_tokens={max_tokens}"
        )

    async def initialize(self) -> None:
        """初始化 LLM 客户端"""
        if self._is_initialized:
            logger.warning("Ark LLM 已经初始化")
            return

        # Ark LLM 不需要特殊初始化
        self._is_initialized = True
        logger.info("Ark LLM 初始化完成")

    def _build_messages(self, messages: List[Message]) -> List[Dict[str, Any]]:
        """构建 Ark API 消息格式

        Args:
            messages: 消息列表

        Returns:
            Ark API 格式的消息列表
        """
        ark_messages = []
        for msg in messages:
            ark_messages.append({
                "role": msg.role.value,
                "content": [
                    {
                        "type": "input_text",
                        "text": msg.content
                    }
                ]
            })
        return ark_messages

    async def _make_request(
        self,
        messages: List[Message],
        stream: bool = False
    ) -> requests.Response:
        """发送 API 请求

        Args:
            messages: 消息列表
            stream: 是否使用流式响应

        Returns:
            API 响应
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        data = {
            "model": self.model,
            "stream": stream,
            "input": self._build_messages(messages),
        }

        # Responses API 使用顶层推理参数，不接受 parameters 包装字段。
        if self.temperature is not None:
            data["temperature"] = self.temperature
        if self.top_p is not None:
            data["top_p"] = self.top_p
        if self.max_tokens is not None:
            data["max_output_tokens"] = self.max_tokens

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: requests.post(self._url, headers=headers, json=data, timeout=60)
        )

        return response

    async def chat(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> LLMResponse:
        """发送聊天请求（非流式）

        Args:
            messages: 消息列表
            config: LLM 配置（可选，用于覆盖默认配置）
            **kwargs: 其他参数

        Returns:
            LLM 响应
        """
        if not self._is_initialized:
            raise RuntimeError("Ark LLM 未初始化，请先调用 initialize()")

        try:
            response = await self._make_request(messages, stream=False)
            response.raise_for_status()

            result = response.json()

            # 提取回复内容
            output = result.get("output", [])
            content = ""
            for item in output:
                if item.get("type") == "message":
                    msg_content = item.get("content", [])
                    for c in msg_content:
                        if c.get("type") == "output_text":
                            content = c.get("text", "")

            # 提取 token 使用情况
            usage = result.get("usage", {})

            # 提取结束原因
            finish_reason = result.get("finish_reason", "stop")

            logger.debug(f"Ark LLM 响应: content={content[:50]}..., usage={usage}")

            return LLMResponse(
                content=content,
                model=self.model,
                finish_reason=finish_reason,
                usage={
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
                raw_response=result
            )

        except requests.HTTPError as e:
            logger.error(f"Ark LLM HTTP 错误: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Ark LLM 调用失败: {e}")
            raise

    async def chat_stream(
        self,
        messages: List[Message],
        config: Optional[LLMConfig] = None,
        **kwargs
    ) -> AsyncIterator[LLMStreamChunk]:
        """发送聊天请求（流式）

        Args:
            messages: 消息列表
            config: LLM 配置（可选，用于覆盖默认配置）
            **kwargs: 其他参数

        Yields:
            LLM 流式响应片段
        """
        if not self._is_initialized:
            raise RuntimeError("Ark LLM 未初始化，请先调用 initialize()")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        data = {
            "model": self.model,
            "stream": True,
            "input": self._build_messages(messages),
        }

        # Responses API 使用顶层推理参数，不接受 parameters 包装字段。
        if self.temperature is not None:
            data["temperature"] = self.temperature
        if self.top_p is not None:
            data["top_p"] = self.top_p
        if self.max_tokens is not None:
            data["max_output_tokens"] = self.max_tokens

        try:
            # 使用 SSE 客户端处理流式响应
            import aiohttp

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self._url,
                    headers=headers,
                    json=data,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    response.raise_for_status()

                    async for line in response.content:
                        if not line:
                            continue

                        line_text = line.decode('utf-8').strip()

                        # SSE 格式: "data: {...}"
                        if not line_text.startswith('data: '):
                            continue

                        json_str = line_text[6:]  # 移除 "data: " 前缀

                        if json_str == '[DONE]':
                            yield LLMStreamChunk(
                                content="",
                                delta="",
                                is_final=True,
                                finish_reason="stop"
                            )
                            break

                        try:
                            chunk_data = json.loads(json_str)

                            # 提取内容
                            output = chunk_data.get("output", [])
                            delta = ""
                            for item in output:
                                if item.get("type") == "message":
                                    msg_content = item.get("content", [])
                                    for c in msg_content:
                                        if c.get("type") == "output_text":
                                            delta = c.get("text", "")

                            finish_reason = chunk_data.get("finish_reason", None)

                            yield LLMStreamChunk(
                                content=delta,
                                delta=delta,
                                is_final=finish_reason is not None,
                                finish_reason=finish_reason
                            )

                        except json.JSONDecodeError:
                            logger.warning(f"解析流式响应失败: {json_str}")
                            continue

        except Exception as e:
            logger.error(f"Ark LLM 流式调用失败: {e}")
            raise

    async def cleanup(self) -> None:
        """清理资源"""
        self._is_initialized = False
        logger.info("Ark LLM 已清理")
