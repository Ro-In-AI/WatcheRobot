"""按指定日期时间触发一次的 TTS 播报任务。"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from src.core.scheduler.base import ScheduledTask, ScheduledTaskConfig, ScheduledTaskContext
from src.utils.logger import get_logger


logger = get_logger(__name__)


class ScheduledTTSPushTask(ScheduledTask):
    """在指定日期时间向当前在线硬件播放固定文本。"""

    task_type = "scheduled_tts_push"
    schedule_kind = "scheduled"
    _PENDING_POLL_SECONDS = 1.0

    def __init__(
        self,
        config: ScheduledTaskConfig,
        *,
        trigger_at: datetime,
        trigger_at_raw: str,
        text: str,
    ) -> None:
        super().__init__(config)
        self._trigger_at = trigger_at
        self._trigger_at_raw = trigger_at_raw
        self._text = text
        self._pending_due_at: datetime | None = None
        self._waiting_for_idle_logged = False
        self._completed = False

    @classmethod
    def from_raw(cls, raw_task: dict[str, Any]) -> "ScheduledTTSPushTask":
        if not isinstance(raw_task, dict):
            raise ValueError("task must be an object")

        task_type = cls._coerce_optional_string(raw_task.get("type"), "type")
        if task_type != cls.task_type:
            raise ValueError(f"unsupported task type for {cls.__name__}: {task_type}")

        name = cls._coerce_optional_string(raw_task.get("name"), "name") or cls.task_type
        enabled = bool(raw_task.get("enabled", True))
        trigger_at_raw = cls._coerce_optional_string(raw_task.get("trigger_at"), "trigger_at").strip()
        trigger_at = cls._coerce_trigger_at(trigger_at_raw, "trigger_at")
        text = cls._coerce_optional_string(raw_task.get("text"), "text").strip()
        if not text:
            raise ValueError("text must be a non-empty string")

        return cls(
            ScheduledTaskConfig(
                name=name,
                type=task_type,
                enabled=enabled,
                interval_seconds=0.0,
                initial_delay_seconds=0.0,
                jitter_seconds=0.0,
                options=raw_task,
            ),
            trigger_at=trigger_at,
            trigger_at_raw=trigger_at_raw,
            text=text,
        )

    async def on_start(self, _context: ScheduledTaskContext) -> None:
        self._pending_due_at = None
        self._waiting_for_idle_logged = False
        self._completed = not self.enabled

    async def tick(self, context: ScheduledTaskContext) -> None:
        if self._completed or not self.enabled:
            return

        now = datetime.now()
        if self._pending_due_at is None and now < self._trigger_at:
            return

        if self._pending_due_at is None:
            self._pending_due_at = self._trigger_at

        if not context.server.has_online_hardware():
            logger.info(
                "定时任务 {} 已到触发时间，但当前没有在线硬件，本次一次性任务记为完成",
                self.name,
            )
            await self._complete_task(context, result="skipped_no_hardware")
            return

        if context.server.has_busy_hardware_session():
            if not self._waiting_for_idle_logged:
                logger.info(
                    "定时任务 {} 已到触发时间，但硬件语音会话仍在执行，等待结束后立即补发",
                    self.name,
                )
                self._waiting_for_idle_logged = True
            return

        self._waiting_for_idle_logged = False
        scheduler_service = getattr(context.server, "scheduler_service", None)
        if scheduler_service is None:
            raise RuntimeError("scheduler service is not attached to websocket server")

        result = await scheduler_service.push_tts_to_hardware(
            text=self._text,
            source=f"scheduled:{self.name}",
            wait_for_idle=False,
        )
        receivers = int(result.get("receivers", 0) or 0)
        logger.info(
            "定时任务 {} 已执行一次性 TTS 播报: trigger_at={}, receivers={}",
            self.name,
            self._format_trigger_at(),
            receivers,
        )
        await self._complete_task(
            context,
            result="sent" if receivers > 0 else "completed_without_receivers",
        )

    def next_delay_seconds(self) -> float:
        if self._completed or not self.enabled:
            return 3600.0

        if self._pending_due_at is not None:
            return self._PENDING_POLL_SECONDS

        delay = (self._trigger_at - datetime.now()).total_seconds()
        return max(1.0, delay)

    async def _complete_task(self, context: ScheduledTaskContext, *, result: str) -> None:
        self._completed = True
        self.config.enabled = False
        self._pending_due_at = None
        self._waiting_for_idle_logged = False
        scheduler_service = getattr(context.server, "scheduler_service", None)
        if scheduler_service is None:
            return
        await scheduler_service.persist_task_completion(
            self.name,
            completed_at=datetime.now(),
            last_result=result,
        )

    def _format_trigger_at(self) -> str:
        return self._trigger_at_raw

    @staticmethod
    def _coerce_trigger_at(value: Any, field_name: str) -> datetime:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field_name} must be a non-empty string")

        raw = value.strip()
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(raw, fmt).replace(microsecond=0)
            except ValueError:
                continue

        raise ValueError(f"{field_name} must match YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS")
