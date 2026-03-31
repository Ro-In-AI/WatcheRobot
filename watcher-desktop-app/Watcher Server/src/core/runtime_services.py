"""运行时模块管理层。

负责：
- 配置 JSON 读写
- ASR / TTS / LLM 运行时初始化与热切换
- 对话模式（LLM / OpenClaw）切换
"""
from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Optional

from src.config import settings
from src.modules.asr.base import ASRProvider
from src.modules.asr.config import ASRConfig
from src.modules.asr.factory import ASR
from src.modules.llm.base import Message as LLMMessage
from src.modules.llm.base import Role as LLMRole
from src.modules.llm.config import LLMConfig
from src.modules.llm.factory import LLM
from src.modules.openclaw import create_openclaw_provider
from src.modules.openclaw.base import ChatMedia, ChatMediaKind, ChatMessage, OpenClawProvider
from src.modules.openclaw.registry import get_provider_class, list_providers
from src.modules.tts.base import TTSProvider
from src.modules.tts.config import TTSConfig
from src.modules.tts.factory import TTS
from src.utils.logger import get_logger

logger = get_logger(__name__)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(slots=True)
class ModuleReport:
    """模块配置读取结果。"""

    config: dict[str, Any]
    runtime: dict[str, Any]

    def to_payload(self) -> dict[str, Any]:
        return {
            "config": deepcopy(self.config),
            "runtime": deepcopy(self.runtime),
        }


class JsonConfigStore:
    """JSON 配置文件存储。"""

    def read(self, path: str | Path) -> dict[str, Any]:
        file_path = Path(path)
        with file_path.open("r", encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict):
            raise ValueError(f"config file must be a JSON object: {file_path}")
        return data

    def write(self, path: str | Path, data: dict[str, Any]) -> None:
        file_path = Path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = file_path.with_suffix(file_path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=4)
            file.write("\n")
        temp_path.replace(file_path)


class DialogueManager:
    """对话引擎管理器。

    provider = openclaw | llm
    """

    DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config" / "dialogue.json"

    def __init__(self, config_store: JsonConfigStore):
        self._config_store = config_store
        self._config_path = str(self.DEFAULT_CONFIG_PATH)
        self._raw_config: dict[str, Any] = {}
        self._current_mode = "openclaw"
        self._openclaw_provider: Optional[OpenClawProvider] = None
        self._configured_openclaw_backend = "auto"
        self._resolved_openclaw_backend = ""
        self._last_error = ""

    @staticmethod
    def _flatten_grouped_section(section: Any, skip_keys: set[str] | None = None) -> dict[str, Any]:
        if not isinstance(section, dict):
            return {}

        if "basic" in section or "advanced" in section:
            flattened: dict[str, Any] = {}
            basic = section.get("basic", {})
            advanced = section.get("advanced", {})
            if isinstance(basic, dict):
                flattened.update(basic)
            if isinstance(advanced, dict):
                flattened.update(advanced)
            return flattened

        skip_keys = skip_keys or set()
        return {key: value for key, value in section.items() if key not in skip_keys}

    def _normalize_config(self, raw_config: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(raw_config, dict):
            raise ValueError("dialogue config must be a JSON object")

        provider = raw_config.get("provider", "openclaw")
        if provider not in {"openclaw", "llm"}:
            raise ValueError("dialogue config provider must be 'openclaw' or 'llm'")

        providers = raw_config.get("providers", {})
        if not isinstance(providers, dict):
            raise ValueError("dialogue config providers must be an object")

        return deepcopy(raw_config)

    def _get_openclaw_kwargs(self, raw_config: dict[str, Any]) -> dict[str, Any]:
        providers = raw_config.get("providers", {})
        openclaw_section = providers.get("openclaw", {})
        openclaw_config = self._flatten_grouped_section(openclaw_section, skip_keys={"label", "description"})

        return {
            "provider": openclaw_config.get("backend", "auto"),
            "agent": openclaw_config.get("agent", settings.openclaw_agent),
            "poll_interval": openclaw_config.get("poll_interval", settings.openclaw_status_poll_interval),
            "log_poll_interval": openclaw_config.get("log_poll_interval", 1),
            "api_url": settings.openclaw_api_url,
            "api_key": settings.openclaw_api_key,
            "model": settings.openclaw_model or None,
        }

    def _resolve_openclaw_backend_name(self, provider: Optional[OpenClawProvider]) -> str:
        if provider is None:
            return ""

        for provider_name in list_providers():
            provider_class = get_provider_class(provider_name)
            if provider_class and isinstance(provider, provider_class):
                return provider_name

        return type(provider).__name__

    def _list_openclaw_backends(self) -> list[dict[str, Any]]:
        backends: list[dict[str, Any]] = [
            {
                "name": "auto",
                "label": "Auto",
                "available": True,
            }
        ]

        for provider_name in list_providers():
            provider_class = get_provider_class(provider_name)
            if provider_class is None:
                continue

            available = True
            if hasattr(provider_class, "is_tmux_available"):
                try:
                    available = bool(provider_class.is_tmux_available())
                except Exception:
                    available = False

            backends.append(
                {
                    "name": provider_name,
                    "label": provider_name.capitalize(),
                    "available": available,
                }
            )

        return backends

    @property
    def config_path(self) -> str:
        return self._config_path

    @property
    def current_mode(self) -> str:
        return self._current_mode

    @property
    def is_initialized(self) -> bool:
        if self._current_mode == "llm":
            return LLM.is_initialized and not self._last_error
        return self._openclaw_provider is not None and self._openclaw_provider.is_initialized and not self._last_error

    @property
    def last_error(self) -> str:
        return self._last_error

    def get_raw_config(self) -> dict[str, Any]:
        return deepcopy(self._raw_config)

    def get_runtime_info(self) -> dict[str, Any]:
        runtime = {
            "provider": self._current_mode,
            "initialized": self.is_initialized,
            "last_error": self._last_error,
        }
        runtime["openclaw_backend"] = self._configured_openclaw_backend
        runtime["openclaw_backend_resolved"] = self._resolved_openclaw_backend
        runtime["openclaw_backends"] = self._list_openclaw_backends()
        if self._openclaw_provider is not None:
            runtime["openclaw_runtime"] = self._openclaw_provider.get_runtime_info()
        return runtime

    def supported_media_kinds(self) -> frozenset[ChatMediaKind]:
        if self._current_mode != "openclaw" or self._openclaw_provider is None:
            return frozenset()
        return self._openclaw_provider.supported_media_kinds()

    async def initialize(self, config_path: str | None = None) -> None:
        if config_path is not None:
            self._config_path = config_path

        raw_config = self._config_store.read(self._config_path)
        await self.apply_config(raw_config, persist=False)

    async def apply_config(self, raw_config: dict[str, Any], *, persist: bool) -> None:
        normalized = self._normalize_config(raw_config)
        next_mode = normalized.get("provider", "openclaw")
        configured_openclaw_kwargs = self._get_openclaw_kwargs(normalized)

        previous_provider = self._openclaw_provider
        next_provider: Optional[OpenClawProvider] = None
        next_openclaw_backend = str(configured_openclaw_kwargs.get("provider", "auto"))
        resolved_openclaw_backend = ""

        try:
            if next_mode == "openclaw":
                next_provider = create_openclaw_provider(**configured_openclaw_kwargs)
                await next_provider.initialize()
                resolved_openclaw_backend = self._resolve_openclaw_backend_name(next_provider)
            else:
                if not LLM.is_initialized:
                    await LLM.initialize(config_path=str(PROJECT_ROOT / "config" / "llm.json"))
        except Exception as exc:
            self._last_error = str(exc)
            if next_provider:
                try:
                    await next_provider.cleanup()
                except Exception:
                    pass
            raise

        self._raw_config = normalized
        self._current_mode = next_mode
        self._last_error = ""
        self._openclaw_provider = next_provider if next_mode == "openclaw" else None
        self._configured_openclaw_backend = next_openclaw_backend
        self._resolved_openclaw_backend = resolved_openclaw_backend

        if previous_provider and previous_provider is not self._openclaw_provider:
            try:
                await previous_provider.cleanup()
            except Exception as exc:
                logger.warning("清理旧 OpenClaw Provider 失败: {}", exc)

        if persist:
            self._config_store.write(self._config_path, normalized)

    async def cleanup(self) -> None:
        if self._openclaw_provider:
            await self._openclaw_provider.cleanup()
            self._openclaw_provider = None
        self._resolved_openclaw_backend = ""
        self._last_error = ""

    async def chat(
        self,
        text: str,
        *,
        on_status_change,
        on_log,
        media: Optional[list[ChatMedia]] = None,
        session_user: Optional[str] = None,
    ) -> str:
        if self._current_mode == "openclaw":
            if not self._openclaw_provider:
                await self.initialize(self._config_path)

            provider = self._openclaw_provider
            if provider is None:
                raise RuntimeError("OpenClaw provider is not available")

            if hasattr(provider, "set_callbacks"):
                provider.set_callbacks(
                    on_status_change=on_status_change,
                    on_log=on_log,
                )

            response = await provider.chat(
                [
                    ChatMessage(role="system", content=settings.get_openclaw_prompt()),
                    ChatMessage(role="user", content=text, media=media or []),
                ],
                session_user=session_user,
            )
            return response.content

        if not LLM.is_initialized:
            await LLM.initialize(config_path=str(PROJECT_ROOT / "config" / "llm.json"))

        if media:
            logger.warning(
                "当前 dialogue provider={} 不支持媒体输入，已忽略 {} 个媒体上下文",
                self._current_mode,
                len(media),
            )

        if on_status_change:
            await on_status_change("thinking", {"message": "LLM thinking...", "provider": LLM.current_provider_name})

        llm_provider = LLM.provider
        if llm_provider is None:
            raise RuntimeError("LLM provider is not available")

        response = await llm_provider.chat(
            [
                LLMMessage(role=LLMRole.SYSTEM, content=settings.get_openclaw_prompt()),
                LLMMessage(role=LLMRole.USER, content=text),
            ]
        )

        return response.content

    async def prompt(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        session_user: Optional[str] = None,
    ) -> str:
        """执行一次不携带语音链路回调的纯文本任务。"""
        if self._current_mode == "openclaw":
            if not self._openclaw_provider:
                await self.initialize(self._config_path)

            provider = self._openclaw_provider
            if provider is None:
                raise RuntimeError("OpenClaw provider is not available")

            if hasattr(provider, "set_callbacks"):
                provider.set_callbacks(
                    on_status_change=None,
                    on_log=None,
                )

            response = await provider.chat(
                [
                    ChatMessage(role="system", content=system_prompt),
                    ChatMessage(role="user", content=user_prompt),
                ],
                session_user=session_user,
            )
            return response.content

        if not LLM.is_initialized:
            await LLM.initialize(config_path=str(PROJECT_ROOT / "config" / "llm.json"))

        llm_provider = LLM.provider
        if llm_provider is None:
            raise RuntimeError("LLM provider is not available")

        response = await llm_provider.chat(
            [
                LLMMessage(role=LLMRole.SYSTEM, content=system_prompt),
                LLMMessage(role=LLMRole.USER, content=user_prompt),
            ]
        )
        return response.content


class RuntimeServices:
    """统一运行时服务入口。"""

    ASR_CONFIG_PATH = PROJECT_ROOT / "config" / "asr.json"
    TTS_CONFIG_PATH = PROJECT_ROOT / "config" / "tts.json"
    LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm.json"

    def __init__(self):
        self.config_store = JsonConfigStore()
        self.dialogue = DialogueManager(self.config_store)
        self._module_errors: dict[str, str] = {
            "asr": "",
            "tts": "",
            "llm": "",
            "dialogue": "",
        }

    async def initialize(self) -> None:
        await self._try_initialize_asr()
        await self._try_initialize_tts()
        await self._try_initialize_dialogue()

    async def cleanup(self) -> None:
        if ASR.is_initialized:
            await ASR.cleanup()
        if TTS.is_initialized:
            await TTS.cleanup()
        if LLM.is_initialized:
            await LLM.cleanup()
        await self.dialogue.cleanup()

    async def _try_initialize_asr(self) -> None:
        try:
            await ASR.initialize(config_path=str(self.ASR_CONFIG_PATH))
            self._module_errors["asr"] = ""
        except Exception as exc:
            self._module_errors["asr"] = str(exc)
            logger.warning("ASR 初始化失败，运行时保持未就绪: {}", exc)

    async def _try_initialize_tts(self) -> None:
        try:
            await TTS.initialize(config_path=str(self.TTS_CONFIG_PATH))
            self._module_errors["tts"] = ""
        except Exception as exc:
            self._module_errors["tts"] = str(exc)
            logger.warning("TTS 初始化失败，运行时保持未就绪: {}", exc)

    async def _try_initialize_dialogue(self) -> None:
        try:
            await self.dialogue.initialize()
            self._module_errors["dialogue"] = ""
        except Exception as exc:
            self._module_errors["dialogue"] = str(exc)
            logger.warning("Dialogue 初始化失败，运行时保持未就绪: {}", exc)

    async def ensure_asr_provider(self) -> ASRProvider:
        if not ASR.is_initialized:
            await self._try_initialize_asr()

        provider = ASR.provider
        if provider is None:
            raise RuntimeError(self._module_errors["asr"] or "ASR provider is not initialized")
        return provider

    async def ensure_tts_provider(self) -> TTSProvider:
        if not TTS.is_initialized:
            await self._try_initialize_tts()

        provider = TTS.provider
        if provider is None:
            raise RuntimeError(self._module_errors["tts"] or "TTS provider is not initialized")
        return provider

    async def chat(
        self,
        text: str,
        *,
        on_status_change,
        on_log,
        media: Optional[list[ChatMedia]] = None,
        session_user: Optional[str] = None,
    ) -> str:
        if not self.dialogue.is_initialized:
            await self._try_initialize_dialogue()

        if not self.dialogue.is_initialized:
            raise RuntimeError(self._module_errors["dialogue"] or "dialogue provider is not initialized")

        return await self.dialogue.chat(
            text,
            on_status_change=on_status_change,
            on_log=on_log,
            media=media,
            session_user=session_user,
        )

    async def ask_scheduler_decision(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
        session_user: Optional[str] = None,
    ) -> str:
        """让当前对话引擎执行一次后台调度判断。"""
        return await self.dialogue.prompt(
            system_prompt=system_prompt,
            user_prompt=json.dumps(user_payload, ensure_ascii=False, indent=2),
            session_user=session_user,
        )

    def get_supported_dialogue_media_kinds(self) -> frozenset[ChatMediaKind]:
        return self.dialogue.supported_media_kinds()

    def _build_runtime_info(self, module_name: str, provider: str, initialized: bool) -> dict[str, Any]:
        payload = {
            "provider": provider,
            "initialized": initialized,
        }
        if self._module_errors.get(module_name):
            payload["last_error"] = self._module_errors[module_name]
        return payload

    def get_asr_report(self) -> ModuleReport:
        raw = self.config_store.read(self.ASR_CONFIG_PATH)
        return ModuleReport(
            config=raw,
            runtime=self._build_runtime_info("asr", ASR.current_provider_name or raw.get("provider", ""), ASR.is_initialized),
        )

    def get_tts_report(self) -> ModuleReport:
        raw = self.config_store.read(self.TTS_CONFIG_PATH)
        return ModuleReport(
            config=raw,
            runtime=self._build_runtime_info("tts", TTS.current_provider_name or raw.get("provider", ""), TTS.is_initialized),
        )

    def get_llm_report(self) -> ModuleReport:
        raw = self.config_store.read(self.LLM_CONFIG_PATH)
        return ModuleReport(
            config=raw,
            runtime=self._build_runtime_info("llm", LLM.current_provider_name or raw.get("provider", ""), LLM.is_initialized),
        )

    def get_dialogue_report(self) -> ModuleReport:
        raw = self.config_store.read(self.dialogue.config_path)
        return ModuleReport(
            config=raw,
            runtime=self.dialogue.get_runtime_info(),
        )

    async def update_asr_config(self, raw_config: dict[str, Any]) -> ModuleReport:
        old_raw = self.config_store.read(self.ASR_CONFIG_PATH)
        old_config = ASR.config
        new_config = ASRConfig.from_dict(raw_config)

        is_valid, error = new_config.validate()
        if not is_valid:
            raise ValueError(error)

        switched = False
        try:
            if ASR.is_initialized:
                await ASR.switch_provider(new_config)
            else:
                await ASR.initialize(config=new_config, config_path=str(self.ASR_CONFIG_PATH))
            switched = True
            self.config_store.write(self.ASR_CONFIG_PATH, raw_config)
            self._module_errors["asr"] = ""
        except Exception as exc:
            self._module_errors["asr"] = str(exc)
            if switched:
                if old_config is not None:
                    await ASR.switch_provider(old_config)
                else:
                    await ASR.cleanup()
            raise exc

        return self.get_asr_report()

    async def update_tts_config(self, raw_config: dict[str, Any]) -> ModuleReport:
        old_config = TTS.config
        new_config = TTSConfig.from_dict(raw_config)

        is_valid, error = new_config.validate()
        if not is_valid:
            raise ValueError(error)

        switched = False
        try:
            if TTS.is_initialized:
                await TTS.switch_provider(new_config)
            else:
                await TTS.initialize(config=new_config, config_path=str(self.TTS_CONFIG_PATH))
            switched = True
            self.config_store.write(self.TTS_CONFIG_PATH, raw_config)
            self._module_errors["tts"] = ""
        except Exception as exc:
            self._module_errors["tts"] = str(exc)
            if switched:
                if old_config is not None:
                    await TTS.switch_provider(old_config)
                else:
                    await TTS.cleanup()
            raise exc

        return self.get_tts_report()

    async def update_llm_config(self, raw_config: dict[str, Any]) -> ModuleReport:
        old_config = LLM.config
        new_config = LLMConfig.from_dict(raw_config)

        is_valid, error = new_config.validate()
        if not is_valid:
            raise ValueError(error)

        switched = False
        try:
            if LLM.is_initialized:
                await LLM.switch_provider(new_config)
            else:
                await LLM.initialize(config=new_config, config_path=str(self.LLM_CONFIG_PATH))
            switched = True
            self.config_store.write(self.LLM_CONFIG_PATH, raw_config)
            self._module_errors["llm"] = ""
        except Exception as exc:
            self._module_errors["llm"] = str(exc)
            if switched:
                if old_config is not None:
                    await LLM.switch_provider(old_config)
                else:
                    await LLM.cleanup()
            raise exc

        return self.get_llm_report()

    async def update_dialogue_config(self, raw_config: dict[str, Any]) -> ModuleReport:
        old_raw = self.dialogue.get_raw_config()

        try:
            await self.dialogue.apply_config(raw_config, persist=False)
            self.config_store.write(self.dialogue.config_path, raw_config)
            self._module_errors["dialogue"] = ""
        except Exception as exc:
            self._module_errors["dialogue"] = str(exc)
            if old_raw:
                try:
                    await self.dialogue.apply_config(old_raw, persist=False)
                except Exception as rollback_exc:
                    logger.error("回滚 Dialogue 配置失败: {}", rollback_exc)
            raise exc

        return self.get_dialogue_report()
