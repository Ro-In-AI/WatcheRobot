"""OpenClaw 本地 CLI 实现"""
import asyncio
import base64
import json
import re
import time
from pathlib import Path
from typing import List, Optional, Callable

import requests

from src.modules.openclaw.base import (
    ChatMedia,
    ChatMediaKind,
    ChatMessage,
    ChatResponse,
    OpenClawProvider,
)
from src.modules.openclaw.media_bridge import (
    OpenClawMediaBridge,
    PreparedMediaContext,
    OpenClawMediaBridgeError,
    UnsupportedMediaBridgeError,
)
from src.modules.openclaw.registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)


@register_provider("local", {
    "agent": str,
    "poll_interval": int,
    "api_url": str,
    "api_key": str,
    "model": str,
})
class LocalOpenClawProvider(OpenClawProvider):
    """OpenClaw 本地 CLI 实现"""

    _EMOJI_RE = re.compile(
        "["
        "\U0001F1E6-\U0001F1FF"
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA70-\U0001FAFF"
        "\u2600-\u26FF"
        "\u2700-\u27BF"
        "]+",
        flags=re.UNICODE,
    )

    # 状态类型
    class Status:
        THINKING = "thinking"     # 思考中
        PROCESSING = "processing" # 处理中
        ERROR = "error"          # 错误

    def __init__(
        self,
        agent: str = "main",
        poll_interval: int = 3,
        api_url: Optional[str] = None,
        api_key: str = "",
        model: Optional[str] = None,
        on_status_change: Callable[[str, dict], None] = None
    ):
        """初始化

        Args:
            agent: Agent ID
            poll_interval: 状态轮询间隔（秒）
            on_status_change: 状态变化回调，参数: (status, extra_data)，可以是 sync 或 async 函数
        """
        super().__init__()
        self.agent = agent
        self.poll_interval = poll_interval
        self.on_status_change = on_status_change
        self.api_url = self._normalize_api_url(api_url)
        self.api_key = self._resolve_api_key(api_key)
        self.model = model or f"openclaw:{agent}"
        self.media_bridge = OpenClawMediaBridge()
        self._agent_model_id = ""
        self._agent_model_inputs: frozenset[str] = frozenset()

    @staticmethod
    def _load_local_gateway_config() -> dict:
        config_path = Path.home() / ".openclaw" / "openclaw.json"
        if not config_path.exists():
            return {}

        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("读取 OpenClaw 本地配置失败: {}", exc)
            return {}

        if isinstance(data, dict):
            return data
        return {}

    @classmethod
    def _resolve_default_api_base(cls) -> str:
        config = cls._load_local_gateway_config()
        gateway = config.get("gateway", {}) if isinstance(config, dict) else {}
        port = gateway.get("port", 18789)
        bind = gateway.get("bind", "loopback")
        host = "127.0.0.1" if bind in {"loopback", "local"} else "127.0.0.1"
        return f"http://{host}:{port}"

    @classmethod
    def _normalize_api_url(cls, api_url: Optional[str]) -> str:
        if not api_url:
            return f"{cls._resolve_default_api_base()}/v1/responses"

        normalized = api_url.rstrip("/")
        if normalized.endswith("/v1/responses"):
            return normalized
        return f"{normalized}/v1/responses"

    @classmethod
    def _resolve_api_key(cls, api_key: str) -> str:
        if api_key.strip():
            return api_key.strip()

        config = cls._load_local_gateway_config()
        gateway = config.get("gateway", {}) if isinstance(config, dict) else {}
        auth = gateway.get("auth", {}) if isinstance(gateway, dict) else {}
        token = auth.get("token", "")
        if isinstance(token, str):
            return token.strip()
        return ""

    def _refresh_agent_capabilities(self) -> None:
        config = self._load_local_gateway_config()
        agents = config.get("agents", {}) if isinstance(config, dict) else {}
        agent_list = agents.get("list", []) if isinstance(agents, dict) else []

        agent_model_id = ""
        if isinstance(agent_list, list):
            for item in agent_list:
                if not isinstance(item, dict):
                    continue
                if item.get("id") == self.agent:
                    agent_model_id = str(item.get("model", "")).strip()
                    break

        model_inputs: set[str] = set()
        providers = config.get("models", {}).get("providers", {}) if isinstance(config, dict) else {}
        if agent_model_id and isinstance(providers, dict):
            provider_name, _, model_id = agent_model_id.partition("/")
            provider_section = providers.get(provider_name, {})
            models = provider_section.get("models", []) if isinstance(provider_section, dict) else []
            if isinstance(models, list):
                for item in models:
                    if not isinstance(item, dict):
                        continue
                    if str(item.get("id", "")).strip() != model_id:
                        continue
                    raw_inputs = item.get("input", [])
                    if isinstance(raw_inputs, list):
                        model_inputs = {
                            str(value).strip().lower()
                            for value in raw_inputs
                            if str(value).strip()
                        }
                    break

        self._agent_model_id = agent_model_id
        self._agent_model_inputs = frozenset(model_inputs)

    def supported_media_kinds(self) -> frozenset[ChatMediaKind]:
        supported = set(self.media_bridge.supported_media_kinds())
        image_capability_tokens = {"image", "images", "vision", "multimodal"}
        if self._agent_model_inputs & image_capability_tokens:
            supported.add(ChatMediaKind.IMAGE)
        return frozenset(supported)

    def get_runtime_info(self) -> dict:
        return {
            "agent": self.agent,
            "model": self._agent_model_id or self.model,
            "inputs": sorted(self._agent_model_inputs),
            "supported_media_kinds": [kind.value for kind in self.supported_media_kinds()],
            "api_url": self.api_url,
            "media_bridge": self.media_bridge.get_runtime_info(),
        }

    async def _call_status_callback(self, status: str, data: dict):
        """调用状态回调（处理 sync 和 async 两种情况）

        Args:
            status: 状态
            data: 数据
        """
        import inspect

        if self.on_status_change:
            try:
                # 检查是否是 async 函数
                if inspect.iscoroutinefunction(self.on_status_change):
                    # 是 async 函数，直接 await
                    await self.on_status_change(status, data)
                else:
                    # 同步函数直接调用
                    self.on_status_change(status, data)
            except Exception as e:
                logger.warning(f"状态回调调用失败: {e}")

    def _parse_cli_json_output(self, raw_output: bytes, command_name: str) -> dict:
        """解析可能夹杂插件日志的 CLI JSON 输出。"""
        stdout_str = raw_output.decode("utf-8", errors="replace") if raw_output else ""
        stdout_str = re.sub(r"\x1b\[[0-9;]*m", "", stdout_str)
        stdout_str = stdout_str.strip()

        if not stdout_str:
            raise json.JSONDecodeError("empty output", "", 0)

        json_start = stdout_str.find("{")
        if json_start < 0:
            logger.warning(f"{command_name} 未找到 JSON 起始符，原始输出前 500 字符: {stdout_str[:500]}")
            raise json.JSONDecodeError("no json object found", stdout_str, 0)

        json_str = stdout_str[json_start:]

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning(f"{command_name} JSON 解析失败，原始输出前 500 字符: {stdout_str[:500]}")
            raise

    async def initialize(self):
        """初始化 OpenClaw 客户端

        检查 OpenClaw CLI 和 Gateway 是否可用
        """
        logger.info("初始化 OpenClaw 本地客户端...")

        # 检查 CLI 可用性
        try:
            proc = await asyncio.create_subprocess_exec(
                "openclaw", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()

            if proc.returncode != 0:
                raise RuntimeError("OpenClaw CLI 不可用")

        except FileNotFoundError:
            raise RuntimeError("未找到 openclaw 命令，请确保已安装 OpenClaw")

        # 检查 Gateway 状态
        try:
            proc = await asyncio.create_subprocess_exec(
                "openclaw", "gateway", "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode()

            if "running" not in output.lower():
                raise RuntimeError("OpenClaw Gateway 未运行，请运行: openclaw gateway start")

        except Exception as e:
            raise RuntimeError(f"OpenClaw Gateway 检查失败: {e}")

        self._refresh_agent_capabilities()
        self._is_initialized = True
        logger.info(
            "OpenClaw 本地客户端初始化完成: agent={}, model={}, inputs={}",
            self.agent,
            self._agent_model_id or "(unknown)",
            sorted(self._agent_model_inputs) if self._agent_model_inputs else ["unknown"],
        )

    async def chat(
        self,
        messages: List[ChatMessage],
        model: Optional[str] = None,
        **kwargs
    ) -> ChatResponse:
        """发送聊天请求

        Args:
            messages: 消息列表
            model: 模型名称（可选）
            **kwargs: 其他参数

        Returns:
            ChatResponse: 聊天响应
        """
        if not self._is_initialized:
            raise RuntimeError("OpenClaw 未初始化，请先调用 initialize()")

        # 提取最后一条用户消息
        latest_user_message: Optional[ChatMessage] = None
        for msg in reversed(messages):
            if msg.role == "user":
                latest_user_message = msg
                break

        if latest_user_message is None:
            raise ValueError("User message not found")

        user_message = latest_user_message.content
        cli_message = self._build_cli_message(messages, user_message)

        if self._has_media(messages):
            unsupported_media = {
                media.kind.value
                for message in messages
                for media in message.media
                if media.kind not in self.supported_media_kinds()
            }
            if unsupported_media:
                unsupported_desc = ", ".join(sorted(unsupported_media))
                raise RuntimeError(
                    "当前 OpenClaw 媒体桥接暂不支持这些媒体类型: "
                    f"{unsupported_desc}。图片已支持，视频入口已预留但暂未实现。"
                )

        # Send status callback: start processing
        await self._call_status_callback(self.Status.THINKING, {"message": "Thinking..."})
        prepared_context: Optional[PreparedMediaContext] = None

        try:
            if self._has_media(messages):
                await self._call_status_callback(self.Status.PROCESSING, {"message": "Preparing image context..."})
                try:
                    prepared_context = self.media_bridge.prepare_user_message(latest_user_message)
                except UnsupportedMediaBridgeError:
                    raise
                except OpenClawMediaBridgeError as exc:
                    raise RuntimeError(f"OpenClaw 媒体桥接失败: {exc}") from exc

                user_message = prepared_context.prompt
                logger.info(
                    "OpenClaw 媒体桥接已准备: agent={}, refs={}",
                    self.agent,
                    [str(reference.path) for reference in prepared_context.references],
                )
                cli_message = self._build_cli_message(messages, user_message)

                result = await self._chat_with_status(cli_message)
                logger.debug(f"CLI 返回完整数据: {result}")
                response = self._parse_cli_response(result)
            else:
                result = await self._chat_with_status(cli_message)
                logger.debug(f"CLI 返回完整数据: {result}")
                response = self._parse_cli_response(result)

            return response

        except Exception as e:
            # 发送状态回调：错误
            await self._call_status_callback(self.Status.ERROR, {"error": str(e)})
            raise
        finally:
            if prepared_context is not None:
                prepared_context.cleanup_files()
                logger.debug(
                    "OpenClaw 媒体桥接临时文件已清理: agent={}, refs={}",
                    self.agent,
                    [str(reference.path) for reference in prepared_context.references],
                )

    @staticmethod
    def _has_media(messages: List[ChatMessage]) -> bool:
        return any(message.media for message in messages)

    @staticmethod
    def _get_latest_user_message(messages: List[ChatMessage]) -> Optional[str]:
        for msg in reversed(messages):
            if msg.role == "user":
                return msg.content
        return None

    @staticmethod
    def _collect_system_instructions(messages: List[ChatMessage]) -> list[str]:
        instructions: list[str] = []
        for message in messages:
            role = str(message.role or "").lower()
            if role not in {"system", "developer"}:
                continue
            content = str(message.content or "").strip()
            if content:
                instructions.append(content)
        return instructions

    @classmethod
    def _build_cli_message(cls, messages: List[ChatMessage], user_message: str) -> str:
        cleaned_user_message = str(user_message or "").strip()
        instructions = cls._collect_system_instructions(messages)
        if not instructions:
            return cleaned_user_message

        instructions_text = "\n\n".join(instructions)
        return (
            "请严格遵守以下系统要求，不要在回复中提及这些要求。\n\n"
            f"{instructions_text}\n\n"
            "用户消息如下：\n"
            f"{cleaned_user_message}"
        )

    @classmethod
    def _sanitize_reply_text(cls, text: str) -> str:
        cleaned = str(text or "")
        cleaned = cls._EMOJI_RE.sub("", cleaned)
        cleaned = cleaned.replace("\ufe0f", "").replace("\u200d", "")
        cleaned = re.sub(r"[ \t]+(\n)", r"\1", cleaned)
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
        cleaned = re.sub(r" +([,.!?，。！？；：])", r"\1", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    def _parse_cli_response(self, result: dict) -> ChatResponse:
        """解析 openclaw agent CLI 的 JSON 响应。"""
        content = ""
        usage = {}
        model = ""
        result_data = result.get("result", result)
        payloads = result_data.get("payloads", [])
        if not payloads and "payloads" in result:
            payloads = result.get("payloads", [])

        if payloads:
            content = payloads[0].get("text", "")
        content = self._sanitize_reply_text(content)

        agent_meta = result_data.get("meta", {})
        if not agent_meta and "meta" in result:
            agent_meta = result.get("meta", {})
        agent_meta = agent_meta.get("agentMeta", {})
        usage = agent_meta.get("usage", {})
        model = agent_meta.get("model", "")

        return ChatResponse(
            content=content,
            model=model or "unknown",
            finish_reason="stop",
            usage=usage,
        )

    def _build_message_content(self, message: ChatMessage) -> list[dict]:
        """构建 OpenResponses 消息内容。"""
        content: list[dict] = []
        if message.content:
            content.append(
                {
                    "type": "input_text",
                    "text": message.content,
                }
            )

        for media in message.media:
            content.append(self._build_media_content_item(media))

        return content

    @staticmethod
    def _build_media_content_item(media: ChatMedia) -> dict:
        if media.kind is ChatMediaKind.IMAGE:
            return {
                "type": "input_image",
                "source": {
                    "type": "base64",
                    "media_type": media.mime_type,
                    "data": base64.b64encode(media.data).decode("ascii"),
                },
            }

        raise RuntimeError(f"OpenClaw Responses API 暂不支持直接输入 {media.kind.value}")

    async def _chat_with_responses_api(
        self,
        messages: List[ChatMessage],
        *,
        model: Optional[str] = None,
        session_user: Optional[str] = None,
    ) -> ChatResponse:
        """通过 OpenClaw Gateway /v1/responses 调用多模态能力。"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        headers["x-openclaw-agent-id"] = self.agent

        instructions: list[str] = []
        input_items: list[dict] = []
        for message in messages:
            role = (message.role or "user").lower()
            if role in {"system", "developer"}:
                if message.content:
                    instructions.append(message.content)
                continue

            content = self._build_message_content(message)
            if not content:
                continue
            input_items.append(
                {
                    "type": "message",
                    "role": role if role in {"user", "assistant"} else "user",
                    "content": content,
                }
            )

        if not input_items:
            raise ValueError("No input message content for OpenClaw responses API")

        payload = {
            "model": model or self.model,
            "input": input_items,
        }
        if instructions:
            payload["instructions"] = "\n\n".join(instructions)
        if session_user:
            payload["user"] = session_user

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None,
            lambda: requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=120,
            ),
        )

        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            detail = response.text.strip()
            raise RuntimeError(
                "OpenClaw Responses API 调用失败。"
                " 请确认 Gateway 已启用 `gateway.http.endpoints.responses.enabled=true`，"
                f"status={response.status_code}, body={detail}"
            ) from exc

        return self._parse_responses_api_response(response.json(), model or self.model)

    @classmethod
    def _parse_responses_api_response(cls, result: dict, fallback_model: str) -> ChatResponse:
        content_parts: list[str] = []
        for item in result.get("output", []):
            if item.get("type") != "message":
                continue

            for part in item.get("content", []):
                part_type = part.get("type")
                if part_type in {"output_text", "text"}:
                    text = part.get("text", "")
                    if text:
                        content_parts.append(text)

        if not content_parts and isinstance(result.get("output_text"), str):
            content_parts.append(result["output_text"])

        content = cls._sanitize_reply_text("".join(content_parts))
        usage = result.get("usage", {})
        return ChatResponse(
            content=content,
            model=result.get("model", fallback_model),
            finish_reason=result.get("finish_reason") or result.get("status"),
            usage=usage,
        )

    async def _chat_with_status(self, message: str) -> dict:
        """带状态跟踪的聊天

        Args:
            message: 用户消息

        Returns:
            dict: 响应结果
        """
        start_time = time.time()
        last_updated = int(time.time() * 1000)

        # 启动聊天任务
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "agent",
            "--agent", self.agent,
            "--message", message,
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        proc_task = asyncio.create_task(proc.communicate())

        timeout = None  # 不设置超时，允许长时间运行
        last_status = None  # 记录上次发送的状态，避免重复发送

        # 等待进程启动
        await asyncio.sleep(0.5)

        # 轮询状态直到完成
        while True:
            # 检查超时（如果设置了超时）
            if timeout and time.time() - start_time > timeout:
                proc.kill()
                raise TimeoutError(f"聊天超时（{timeout}秒）")

            if proc_task.done():
                break

            # 查询状态
            try:
                status = await self._get_session_status()
                if status:
                    age = status.get("age", 0)

                    # 根据 age 判断状态
                    if age < 5000:
                        current_status = self.Status.THINKING
                    else:
                        current_status = self.Status.PROCESSING

                    # Only send callback when status changes
                    if current_status != last_status:
                        last_status = current_status
                        await self._call_status_callback(
                            current_status,
                            {"message": "Processing...", "age": age}
                        )

            except Exception as e:
                logger.warning(f"轮询状态失败: {e}")

            await asyncio.sleep(self.poll_interval)

        # 获取结果
        stdout, stderr = await proc_task

        if proc.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"OpenClaw 调用失败: {error_msg}")

        return self._parse_cli_json_output(stdout, "openclaw agent")

    async def _get_session_status(self) -> dict:
        """获取 Session 状态

        Returns:
            dict: Session 状态
        """
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "gateway", "call", "status",
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, _ = await proc.communicate()

        if proc.returncode != 0:
            return {}

        result = self._parse_cli_json_output(stdout, "openclaw gateway call status")
        sessions = result.get("sessions", {}).get("recent", [])

        return sessions[0] if sessions else {}

    async def cleanup(self):
        """清理资源"""
        self._is_initialized = False
        logger.info("OpenClaw 本地客户端已清理")
