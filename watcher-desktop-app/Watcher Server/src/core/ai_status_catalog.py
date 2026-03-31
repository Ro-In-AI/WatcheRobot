"""AI 状态目录与资源映射表加载。"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from src.utils.logger import get_logger


logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_AI_STATUS_MAP_PATH = PROJECT_ROOT / "config" / "ai_status_map.json"

DEFAULT_AI_STATUS_MAP: dict[str, dict[str, Any]] = {
    "thinking": {
        "label": "正在思考",
        "description": "AI 已开始处理当前用户输入",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "processing": {
        "label": "处理中",
        "description": "AI 正在处理中间步骤或资源准备阶段",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "listening": {
        "label": "正在聆听",
        "description": "当前处于语音输入监听阶段",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "speaking": {
        "label": "正在播报",
        "description": "当前处于语音播报输出阶段",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "standby": {
        "label": "待机中",
        "description": "系统空闲时的待机状态，属于非语言对话流",
        "scope": "ambient_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "observing": {
        "label": "观察中",
        "description": "系统空闲时的环境观察状态，属于非语言对话流",
        "scope": "ambient_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "completed": {
        "label": "已完成",
        "description": "AI 已完成本轮生成",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
    "error": {
        "label": "处理失败",
        "description": "AI 在内部处理阶段返回错误",
        "scope": "dialogue_flow",
        "image_name": "",
        "action_file": "",
        "sound_file": "",
    },
}


@dataclass(slots=True, frozen=True)
class AIStatusDefinition:
    """单个 AI 状态定义。"""

    status: str
    label: str
    description: str
    scope: str
    image_name: str = ""
    action_file: str = ""
    sound_file: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "description": self.description,
            "scope": self.scope,
            "image_name": self.image_name,
            "action_file": self.action_file,
            "sound_file": self.sound_file,
        }


def _normalize_string(value: Any, field_name: str, status: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"ai status map: {status}.{field_name} must be string")
    return value


def _resolve_resource_name(
    status: str,
    explicit_value: Optional[str],
    default_value: str,
) -> str:
    if explicit_value is not None and explicit_value.strip():
        return explicit_value.strip()
    if default_value.strip():
        return default_value.strip()
    return status


class AIStatusCatalog:
    """带自动重载的 AI 状态目录。"""

    def __init__(self, path: str | Path = DEFAULT_AI_STATUS_MAP_PATH) -> None:
        self._path = Path(path)
        self._cached_mtime_ns: Optional[int] = None
        self._definitions: dict[str, AIStatusDefinition] = {}

    @property
    def path(self) -> Path:
        return self._path

    def _load_raw_mapping(self) -> dict[str, Any]:
        if not self._path.exists():
            return DEFAULT_AI_STATUS_MAP

        with self._path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, dict):
            raise ValueError(f"AI status map must be a JSON object: {self._path}")

        return data

    def _parse_definitions(self, raw_mapping: dict[str, Any]) -> dict[str, AIStatusDefinition]:
        definitions: dict[str, AIStatusDefinition] = {}

        for status, raw_definition in raw_mapping.items():
            if not isinstance(status, str) or not status.strip():
                raise ValueError("AI status map keys must be non-empty strings")
            if not isinstance(raw_definition, dict):
                raise ValueError(f"ai status map: {status} must be an object")

            scope = raw_definition.get("scope", "dialogue_flow")
            if not isinstance(scope, str) or not scope.strip():
                raise ValueError(f"ai status map: {status}.scope must be non-empty string")

            definitions[status] = AIStatusDefinition(
                status=status,
                label=_normalize_string(raw_definition.get("label", status), "label", status) or status,
                description=_normalize_string(raw_definition.get("description", ""), "description", status),
                scope=scope.strip(),
                image_name=_normalize_string(raw_definition.get("image_name", ""), "image_name", status),
                action_file=_normalize_string(raw_definition.get("action_file", ""), "action_file", status),
                sound_file=_normalize_string(raw_definition.get("sound_file", ""), "sound_file", status),
            )

        return definitions

    def _reload_if_needed(self) -> None:
        current_mtime_ns = self._path.stat().st_mtime_ns if self._path.exists() else None
        if current_mtime_ns == self._cached_mtime_ns and self._definitions:
            return

        try:
            raw_mapping = self._load_raw_mapping()
            definitions = self._parse_definitions(raw_mapping)
        except Exception as exc:
            if self._definitions:
                logger.warning("AI 状态映射表加载失败，继续使用上一份有效映射: {}", exc)
                self._cached_mtime_ns = current_mtime_ns
                return

            logger.warning("AI 状态映射表加载失败，回退到内置默认映射: {}", exc)
            definitions = self._parse_definitions(DEFAULT_AI_STATUS_MAP)

        self._definitions = definitions
        self._cached_mtime_ns = current_mtime_ns

    def get(self, status: str) -> Optional[AIStatusDefinition]:
        self._reload_if_needed()
        return self._definitions.get(status)

    def list_statuses(self) -> list[str]:
        self._reload_if_needed()
        return sorted(self._definitions)

    def list_definitions(self) -> list[AIStatusDefinition]:
        self._reload_if_needed()
        return [self._definitions[key] for key in sorted(self._definitions)]

    def to_mapping_dict(self) -> dict[str, dict[str, Any]]:
        self._reload_if_needed()
        return {status: definition.to_dict() for status, definition in self._definitions.items()}

    def build_payload_data(
        self,
        status: str,
        *,
        message: str = "",
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        definition = self.get(status)
        if definition is None:
            raise ValueError(f"unknown ai status: {status}")

        data: dict[str, Any] = {"status": status}
        if message:
            data["message"] = message

        final_image_name = _resolve_resource_name(status, image_name, definition.image_name)
        final_action_file = _resolve_resource_name(status, action_file, definition.action_file)
        final_sound_file = _resolve_resource_name(status, sound_file, definition.sound_file)

        data["image_name"] = final_image_name
        data["action_file"] = final_action_file
        data["sound_file"] = final_sound_file
        if detail:
            data["detail"] = detail

        return data


ai_status_catalog = AIStatusCatalog()
