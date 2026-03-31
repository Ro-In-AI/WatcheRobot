"""定时任务服务。"""
from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from src.config import settings
from src.core.scheduler.base import ScheduledTask, ScheduledTaskContext
from src.core.scheduler.tasks import IdleAIStatusPushTask, ScheduledTTSPushTask
from src.models.protocol import BinaryFrame, BinaryFrameFlag, BinaryFrameType, ClientRole
from src.utils.logger import get_logger
from src.utils.message_handler import MessageHandler

if TYPE_CHECKING:
    from src.core.runtime_services import RuntimeServices
    from src.core.websocket_server import WebSocketServer


logger = get_logger(__name__)

HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME = "http_managed_scheduled_tts"
DEFAULT_HTTP_TRIGGER_WAIT_TIMEOUT_SECONDS = 60.0

TASK_TYPES: dict[str, type[ScheduledTask]] = {
    IdleAIStatusPushTask.task_type: IdleAIStatusPushTask,
    ScheduledTTSPushTask.task_type: ScheduledTTSPushTask,
}


@dataclass(slots=True)
class SchedulerReport:
    """定时任务模块配置报告。"""

    config: dict[str, Any]
    runtime: dict[str, Any]

    def to_payload(self) -> dict[str, Any]:
        return {
            "config": deepcopy(self.config),
            "runtime": deepcopy(self.runtime),
        }


class SchedulerService:
    """定时任务服务。"""

    def __init__(
        self,
        *,
        server: "WebSocketServer",
        runtime: "RuntimeServices",
        config_path: str | Path | None = None,
    ) -> None:
        self._server = server
        self._runtime = runtime
        self._config_path = self._resolve_config_path(config_path)
        self._task_handles: list[asyncio.Task] = []
        self._tasks: list[ScheduledTask] = []
        self._active_stop_event: asyncio.Event | None = None
        self._started = False
        self._raw_config: dict[str, Any] = {"enabled": True, "tasks": []}
        self._config_lock = asyncio.Lock()
        self._tts_push_lock = asyncio.Lock()

    @property
    def config_path(self) -> Path:
        return self._config_path

    @property
    def is_started(self) -> bool:
        return self._started

    @property
    def is_active(self) -> bool:
        return bool(self._task_handles)

    @staticmethod
    def _resolve_config_path(config_path: str | Path | None) -> Path:
        raw_path = Path(config_path) if config_path is not None else Path(settings.scheduler_config_file)
        expanded = raw_path.expanduser()
        if expanded.is_absolute():
            return expanded
        return (settings.app_root / expanded).resolve()

    async def start(self) -> None:
        async with self._config_lock:
            if self._started:
                return

            self._started = True
            self._raw_config = self._normalize_config(self._read_config())
            await self._apply_runtime_config_locked(self._raw_config)

    async def stop(self) -> None:
        async with self._config_lock:
            if not self._started:
                return

            await self._stop_active_tasks_locked()
            self._started = False
            logger.info("定时任务模块已停止")

    def get_report(self) -> SchedulerReport:
        try:
            raw = self._normalize_config(self._read_config())
            self._raw_config = deepcopy(raw)
        except Exception:
            raw = deepcopy(self._raw_config)

        return SchedulerReport(
            config=raw,
            runtime=self._build_runtime_info(raw),
        )

    async def update_config(self, raw_config: dict[str, Any]) -> SchedulerReport:
        normalized = self._normalize_config(raw_config)

        async with self._config_lock:
            self._write_config(normalized)
            self._raw_config = deepcopy(normalized)

            if self._started:
                await self._apply_runtime_config_locked(self._raw_config)

        return self.get_report()

    async def persist_task_completion(
        self,
        task_name: str,
        *,
        completed_at: Any,
        last_result: str,
    ) -> None:
        completed_at_text = self._normalize_completion_time(completed_at)

        async with self._config_lock:
            current = deepcopy(self._raw_config)
            tasks = current.get("tasks", [])
            updated = False

            for item in tasks:
                if not isinstance(item, dict):
                    continue
                if str(item.get("name") or "") != task_name:
                    continue
                item["enabled"] = False
                item["completed_at"] = completed_at_text
                item["last_result"] = last_result
                updated = True
                break

            if not updated:
                return

            self._write_config(current)
            self._raw_config = deepcopy(current)

    def get_http_managed_scheduled_tts_payload(
        self,
        *,
        report: SchedulerReport | None = None,
    ) -> dict[str, Any]:
        scheduler_report = report or self.get_report()
        payload = scheduler_report.to_payload()
        config = payload.get("config", {})
        runtime = payload.get("runtime", {})
        config_tasks = config.get("tasks", [])
        runtime_tasks = runtime.get("tasks", [])

        task_config = next(
            (
                item for item in config_tasks
                if isinstance(item, dict)
                and item.get("name") == HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME
                and item.get("type") == ScheduledTTSPushTask.task_type
            ),
            None,
        )
        task_runtime = next(
            (
                item for item in runtime_tasks
                if isinstance(item, dict)
                and item.get("name") == HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME
            ),
            None,
        )

        return {
            "scheduler": {
                "system_enabled": bool(runtime.get("system_enabled", settings.scheduler_enabled)),
                "config_enabled": bool(config.get("enabled", True)),
                "active": bool(runtime.get("active", False)),
                "active_task_count": int(runtime.get("active_task_count", 0) or 0),
                "loaded_task_count": int(runtime.get("loaded_task_count", len(config_tasks)) or 0),
                "config_path": str(runtime.get("config_path", self._config_path)),
            },
            "task": {
                "name": HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME,
                "type": ScheduledTTSPushTask.task_type,
                "schedule_kind": ScheduledTTSPushTask.schedule_kind,
                "present": task_config is not None,
                "enabled": bool(task_config.get("enabled", False)) if task_config else False,
                "trigger_at": str(task_config.get("trigger_at", "") or "") if task_config else "",
                "text": str(task_config.get("text", "") or "") if task_config else "",
                "active": bool(task_runtime.get("active", False)) if task_runtime else False,
                "completed_at": str(task_config.get("completed_at", "") or "") if task_config else "",
                "last_result": str(task_config.get("last_result", "") or "") if task_config else "",
            },
        }

    async def upsert_http_managed_scheduled_tts_task(
        self,
        *,
        trigger_at_text: Any,
        text: Any,
    ) -> SchedulerReport:
        if not isinstance(trigger_at_text, str) or not trigger_at_text.strip():
            raise ValueError("trigger_at must be a non-empty string")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text must be a non-empty string")

        raw_task = {
            "name": HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME,
            "type": ScheduledTTSPushTask.task_type,
            "enabled": True,
            "trigger_at": trigger_at_text.strip(),
            "text": text.strip(),
            "completed_at": "",
            "last_result": "",
        }

        async with self._config_lock:
            normalized = self._normalize_config(self._read_config())
            normalized["enabled"] = True

            tasks = normalized.get("tasks", [])
            updated_tasks: list[dict[str, Any]] = []
            replaced = False
            for item in tasks:
                if (
                    isinstance(item, dict)
                    and item.get("name") == HTTP_MANAGED_SCHEDULED_TTS_TASK_NAME
                ):
                    if not replaced:
                        updated_tasks.append(raw_task)
                        replaced = True
                    continue
                updated_tasks.append(item)

            if not replaced:
                updated_tasks.append(raw_task)

            normalized["tasks"] = updated_tasks
            validated = self._normalize_config(normalized)
            self._write_config(validated)
            self._raw_config = deepcopy(validated)

            if self._started:
                await self._apply_runtime_config_locked(self._raw_config)

        return self.get_report()

    async def trigger_http_managed_scheduled_tts(
        self,
        *,
        text: Any = None,
        wait_timeout_seconds: Any = None,
    ) -> dict[str, Any]:
        resolved_text = text
        if not isinstance(resolved_text, str) or not resolved_text.strip():
            managed_payload = self.get_http_managed_scheduled_tts_payload()
            resolved_text = managed_payload.get("task", {}).get("text", "")

        if not isinstance(resolved_text, str) or not resolved_text.strip():
            raise ValueError("text must be a non-empty string")

        timeout_seconds = DEFAULT_HTTP_TRIGGER_WAIT_TIMEOUT_SECONDS
        if wait_timeout_seconds is not None:
            try:
                timeout_seconds = float(wait_timeout_seconds)
            except (TypeError, ValueError) as exc:
                raise ValueError("wait_timeout_seconds must be number") from exc
            if timeout_seconds <= 0:
                raise ValueError("wait_timeout_seconds must be > 0")

        return await self.push_tts_to_hardware(
            text=resolved_text,
            source="http.trigger",
            wait_for_idle=True,
            wait_timeout_seconds=timeout_seconds,
        )

    async def push_tts_to_hardware(
        self,
        *,
        text: str,
        source: str,
        wait_for_idle: bool,
        wait_timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        cleaned_text = MessageHandler.clean_text_for_tts(text)
        if not cleaned_text or not cleaned_text.strip():
            raise ValueError("text must not be empty after TTS cleanup")

        async with self._tts_push_lock:
            waited_for_idle = False
            if wait_for_idle and self._server.has_busy_hardware_session():
                waited_for_idle = True
                await self._wait_until_hardware_idle(wait_timeout_seconds)
            elif self._server.has_busy_hardware_session():
                raise RuntimeError("hardware voice pipeline is active")

            targets = list(self._server.iter_clients_by_role(ClientRole.HARDWARE))
            if not targets:
                raise RuntimeError("no online hardware")

            self._server.begin_background_audio_push()
            try:
                tts_provider = await self._runtime.ensure_tts_provider()
                receivers = await self._broadcast_tts_stream(
                    tts_provider=tts_provider,
                    text=cleaned_text,
                    targets=targets,
                    source=source,
                )
            finally:
                self._server.end_background_audio_push()

        return {
            "source": source,
            "text": cleaned_text,
            "receivers": receivers,
            "waited_for_idle": waited_for_idle,
        }

    def _read_config(self) -> dict[str, Any]:
        if not self._config_path.exists():
            logger.warning("定时任务配置文件不存在，返回默认空配置: {}", self._config_path)
            return {"enabled": True, "tasks": []}

        with self._config_path.open("r", encoding="utf-8") as file:
            raw = json.load(file)

        if not isinstance(raw, dict):
            raise ValueError(f"scheduler config must be object: {self._config_path}")
        return raw

    async def _wait_until_hardware_idle(self, timeout_seconds: float | None) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds if timeout_seconds is not None else None
        while self._server.has_busy_hardware_session():
            if deadline is not None and loop.time() >= deadline:
                raise RuntimeError("hardware voice pipeline is still active after waiting")
            await asyncio.sleep(0.25)

    @staticmethod
    def _normalize_completion_time(value: Any) -> str:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if hasattr(value, "strftime"):
            return value.strftime("%Y-%m-%dT%H:%M:%S")
        return str(value or "")

    async def _broadcast_tts_stream(
        self,
        *,
        tts_provider,
        text: str,
        targets: list,
        source: str,
    ) -> int:
        seq = 0
        success_ids: set[int] = set()
        alive_targets = list(targets)

        async for tts_result in tts_provider.synthesize_stream(text):
            if not tts_result.audio_data:
                continue

            flags = BinaryFrameFlag.NONE
            if tts_result.is_first:
                flags |= BinaryFrameFlag.FIRST
            if tts_result.is_last:
                flags |= BinaryFrameFlag.LAST

            frame = BinaryFrame(
                frame_type=BinaryFrameType.AUDIO,
                flags=flags,
                seq=seq,
                payload=tts_result.audio_data,
            )
            raw_frame = frame.to_bytes()

            next_alive_targets = []
            for websocket in alive_targets:
                try:
                    await websocket.send(raw_frame)
                    success_ids.add(id(websocket))
                    next_alive_targets.append(websocket)
                except Exception as exc:
                    logger.error(
                        "Scheduler TTS 音频发送失败: source={}, client_id={}, error={}",
                        source,
                        id(websocket),
                        exc,
                    )

            alive_targets = next_alive_targets
            if not alive_targets:
                break

            seq += 1

        logger.info(
            "Scheduler TTS 已下发: source={}, receivers={}, text_len={}",
            source,
            len(success_ids),
            len(text),
        )
        return len(success_ids)

    def _write_config(self, raw_config: dict[str, Any]) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._config_path.with_suffix(self._config_path.suffix + ".tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(raw_config, file, ensure_ascii=False, indent=4)
            file.write("\n")
        temp_path.replace(self._config_path)

    def _normalize_config(self, raw_config: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(raw_config, dict):
            raise ValueError("scheduler config must be object")

        normalized = deepcopy(raw_config)
        enabled = normalized.get("enabled", True)
        tasks = normalized.get("tasks", [])

        if not isinstance(enabled, bool):
            raise ValueError("scheduler config field 'enabled' must be bool")
        if not isinstance(tasks, list):
            raise ValueError("scheduler config field 'tasks' must be an array")

        normalized["enabled"] = enabled
        normalized["tasks"] = tasks

        # 通过构建一次任务对象来完成结构校验。
        self._build_tasks(normalized)
        return normalized

    def _build_tasks(self, raw_config: dict[str, Any]) -> list[ScheduledTask]:
        raw_tasks = raw_config.get("tasks", [])
        if not isinstance(raw_tasks, list):
            raise ValueError("scheduler tasks must be an array")

        tasks: list[ScheduledTask] = []
        for raw_task in raw_tasks:
            if not isinstance(raw_task, dict):
                raise ValueError("scheduler task must be object")

            task_type = raw_task.get("type", "")
            task_cls = TASK_TYPES.get(task_type)
            if task_cls is None:
                raise ValueError(f"unknown scheduler task type: {task_type}")
            tasks.append(task_cls.from_raw(raw_task))

        return tasks

    def _build_runtime_info(self, raw_config: dict[str, Any]) -> dict[str, Any]:
        raw_tasks = raw_config.get("tasks", [])
        running_names = {task.name for task in self._tasks}
        config_enabled = bool(raw_config.get("enabled", True))

        task_summaries: list[dict[str, Any]] = []
        for index, raw_task in enumerate(raw_tasks, start=1):
            if not isinstance(raw_task, dict):
                continue

            name = str(raw_task.get("name") or raw_task.get("type") or f"task-{index}")
            task_type = str(raw_task.get("type", "") or "")
            task_cls = TASK_TYPES.get(task_type)
            schedule_kind = task_cls.schedule_kind if task_cls is not None else "unknown"
            task_summaries.append(
                {
                    "name": name,
                    "type": task_type,
                    "schedule_kind": schedule_kind,
                    "enabled": bool(raw_task.get("enabled", True)),
                    "active": bool(
                        self._started
                        and settings.scheduler_enabled
                        and config_enabled
                        and raw_task.get("enabled", True)
                        and name in running_names
                    ),
                    "interval_seconds": (
                        float(raw_task.get("interval_seconds", 60) or 60)
                        if schedule_kind == "interval"
                        else 0.0
                    ),
                    "initial_delay_seconds": (
                        float(raw_task.get("initial_delay_seconds", 0) or 0)
                        if schedule_kind == "interval"
                        else 0.0
                    ),
                    "jitter_seconds": (
                        float(raw_task.get("jitter_seconds", 0) or 0)
                        if schedule_kind == "interval"
                        else 0.0
                    ),
                }
            )
            if schedule_kind == "scheduled":
                task_summaries[-1]["trigger_at"] = str(raw_task.get("trigger_at", "") or "")
                task_summaries[-1]["completed_at"] = str(raw_task.get("completed_at", "") or "")
                task_summaries[-1]["last_result"] = str(raw_task.get("last_result", "") or "")

        return {
            "provider": "scheduler",
            "initialized": self._started,
            "service_started": self._started,
            "system_enabled": settings.scheduler_enabled,
            "config_enabled": config_enabled,
            "active": self.is_active,
            "config_path": str(self._config_path),
            "loaded_task_count": len(task_summaries),
            "active_task_count": sum(1 for item in task_summaries if item["active"]),
            "tasks": task_summaries,
        }

    async def _apply_runtime_config_locked(self, raw_config: dict[str, Any]) -> None:
        await self._stop_active_tasks_locked()

        if not self._started:
            return

        if not settings.scheduler_enabled:
            logger.info("定时任务模块系统开关已关闭")
            return

        if not raw_config.get("enabled", True):
            logger.info("定时任务配置已关闭: {}", self._config_path)
            return

        tasks = self._build_tasks(raw_config)
        if not tasks:
            logger.info("定时任务模块未加载到任何任务")
            return

        context = ScheduledTaskContext(server=self._server, runtime=self._runtime)
        stop_event = asyncio.Event()

        for task in tasks:
            await task.on_start(context)

        self._tasks = tasks
        self._active_stop_event = stop_event
        for task in self._tasks:
            handle = asyncio.create_task(
                self._run_task_loop(task, context, stop_event),
                name=f"scheduler:{task.name}",
            )
            self._task_handles.append(handle)

        logger.info("定时任务模块已启动: task_count={}, config={}", len(self._tasks), self._config_path)

    async def _stop_active_tasks_locked(self) -> None:
        stop_event = self._active_stop_event
        if stop_event is not None:
            stop_event.set()

        for handle in self._task_handles:
            handle.cancel()

        for handle in self._task_handles:
            try:
                await handle
            except asyncio.CancelledError:
                pass

        context = ScheduledTaskContext(server=self._server, runtime=self._runtime)
        for task in self._tasks:
            try:
                await task.on_stop(context)
            except Exception as exc:
                logger.warning("停止定时任务 {} 时失败: {}", task.name, exc)

        self._task_handles.clear()
        self._tasks.clear()
        self._active_stop_event = None

    async def _run_task_loop(
        self,
        task: ScheduledTask,
        context: ScheduledTaskContext,
        stop_event: asyncio.Event,
    ) -> None:
        initial_delay = task.initial_delay_seconds
        if initial_delay > 0:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=initial_delay)
                return
            except asyncio.TimeoutError:
                pass

        while not stop_event.is_set():
            try:
                if task.enabled:
                    await task.tick(context)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("执行定时任务失败: task={}, error={}", task.name, exc, exc_info=True)

            delay = max(1.0, task.next_delay_seconds())
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=delay)
                return
            except asyncio.TimeoutError:
                continue
