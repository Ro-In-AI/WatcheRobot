"""OpenClaw 与 LLM 适配器

将一个 LLM Provider 适配为 OpenClaw Provider 接口，使得上层逻辑可以
统一调用 chat() 方法。

适配器主要用于当 OpenClaw 不可用时，降级使用 LLM 进行对话。
"""
from typing import List, Optional

from src.modules.llm.base import LLMProvider, Message as LLMMessage, LLMResponse
from src.modules.openclaw.base import ChatMediaKind, OpenClawProvider, ChatMessage, ChatResponse


class LLMAsOpenClawProvider(OpenClawProvider):
    """将 LLM Provider 适配为 OpenClaw Provider"""

    def __init__(self, llm_provider: LLMProvider):
        super().__init__()
        self._llm = llm_provider

    async def initialize(self):
        if not self._llm.is_initialized:
            await self._llm.initialize()
        self._is_initialized = True

    def _map_messages(self, messages: List[ChatMessage]) -> List[LLMMessage]:
        """将 OpenClaw ChatMessage 转换为 LLM Message"""
        llm_messages: list[LLMMessage] = []
        for m in messages:
            if m.media:
                raise RuntimeError("当前 LLM 后备适配器不支持图片/视频输入")

            role = m.role.lower() if isinstance(m.role, str) else str(m.role)
            if role == "system":
                role = "system"
            elif role == "assistant":
                role = "assistant"
            else:
                # 其他均视为 user
                role = "user"

            llm_messages.append(LLMMessage(role=role, content=m.content))

        return llm_messages

    def _map_response(self, response: LLMResponse) -> ChatResponse:
        """将 LLM 响应转换为 OpenClaw ChatResponse"""
        return ChatResponse(
            content=response.content,
            model=response.model or "",
            finish_reason=response.finish_reason,
            usage=response.usage or {},
        )

    async def chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        **kwargs
    ) -> ChatResponse:
        llm_messages = self._map_messages(messages)
        response = await self._llm.chat(llm_messages, **kwargs)
        return self._map_response(response)

    async def cleanup(self):
        await self._llm.cleanup()
        self._is_initialized = False

    def supported_media_kinds(self) -> frozenset[ChatMediaKind]:
        return frozenset()
