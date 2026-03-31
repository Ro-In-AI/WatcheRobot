"""定时任务基础抽象。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from src.core.runtime_services import RuntimeServices
    from src.core.websocket_server import WebSocketServer


@dataclass(slots=True)
class ScheduledTaskConfig:
    """单个定时任务配置。"""

    name: str
    type: str
    enabled: bool = True
    interval_seconds: float = 60.0
    initial_delay_seconds: float = 0.0
    jitter_seconds: float = 0.0
    options: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ScheduledTaskContext:
    """定时任务运行时上下文。"""

    server: "WebSocketServer"
    runtime: "RuntimeServices"


class ScheduledTask(ABC):
    """定时任务抽象基类。"""

    task_type: str = ""
    schedule_kind: str = "interval"

    def __init__(self, config: ScheduledTaskConfig):
        self.config = config

    @property
    def name(self) -> str:
        return self.config.name

    @property
    def enabled(self) -> bool:
        return self.config.enabled

    @property
    def interval_seconds(self) -> float:
        return self.config.interval_seconds

    @property
    def initial_delay_seconds(self) -> float:
        return self.config.initial_delay_seconds

    @property
    def jitter_seconds(self) -> float:
        return self.config.jitter_seconds

    @classmethod
    @abstractmethod
    def from_raw(cls, raw_task: dict[str, Any]) -> "ScheduledTask":
        """从原始 JSON 构造任务实例。"""

    async def on_start(self, _context: ScheduledTaskContext) -> None:
        """任务启动钩子。"""

    async def on_stop(self, _context: ScheduledTaskContext) -> None:
        """任务停止钩子。"""

    @abstractmethod
    async def tick(self, context: ScheduledTaskContext) -> None:
        """执行一次任务。"""

    def next_delay_seconds(self) -> float:
        return self.interval_seconds

    @staticmethod
    def _coerce_positive_float(value: Any, field_name: str, *, default: float) -> float:
        if value is None:
            return default
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field_name} must be number") from exc
        if number < 0:
            raise ValueError(f"{field_name} must be >= 0")
        return number

    @staticmethod
    def _coerce_optional_string_list(value: Any, field_name: str) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError(f"{field_name} must be an array")
        result: list[str] = []
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise ValueError(f"{field_name} items must be non-empty strings")
            result.append(item.strip())
        return result

    @staticmethod
    def _coerce_optional_dict(value: Any, field_name: str) -> dict[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError(f"{field_name} must be an object")
        return value

    @staticmethod
    def _coerce_optional_string(value: Any, field_name: str, *, default: str = "") -> str:
        if value is None:
            return default
        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")
        return value
