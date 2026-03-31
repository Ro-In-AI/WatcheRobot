"""空闲时非对话流 AI 状态推送任务。"""
from __future__ import annotations

import json
import random
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from src.core.ai_status_catalog import AIStatusDefinition, ai_status_catalog
from src.core.scheduler.base import ScheduledTask, ScheduledTaskConfig, ScheduledTaskContext
from src.models.protocol import ClientRole
from src.utils.logger import get_logger


logger = get_logger(__name__)


DEFAULT_DECISION_SYSTEM_PROMPT = """你是 Watcher 的空闲状态选择器。

你的任务不是决定是否发送，而是只在给定候选状态中，选出当前最适合发送给硬件端的一个状态。

规则：
1. 只能从给定 candidate statuses 中选择一个状态名。
2. 回复只允许输出状态名本身，例如 `standby` 或 `observing`。
3. 不要输出 JSON，不要输出解释，不要输出额外文本。
4. 如果拿不准，也必须从候选状态中选一个最稳妥的状态。
"""


@dataclass(slots=True)
class IdleAIStatusSelection:
    status: str = ""


class IdleAIStatusPushTask(ScheduledTask):
    """在系统空闲时向硬件发送非对话流状态。"""

    task_type = "idle_ai_status_push"

    def __init__(
        self,
        config: ScheduledTaskConfig,
        *,
        candidate_scopes: list[str],
        candidate_statuses: list[str],
        decision_mode: str,
        fallback_mode: str,
        trigger_probability: float,
        history_limit: int,
        message: str,
    ) -> None:
        super().__init__(config)
        self._candidate_scopes = candidate_scopes
        self._candidate_statuses = candidate_statuses
        self._decision_mode = decision_mode
        self._fallback_mode = fallback_mode
        self._trigger_probability = min(1.0, max(0.0, trigger_probability))
        self._history_limit = max(1, history_limit)
        self._message = message
        self._history: deque[dict[str, Any]] = deque(maxlen=self._history_limit)
        self._warned_no_candidates = False

    @classmethod
    def from_raw(cls, raw_task: dict[str, Any]) -> "IdleAIStatusPushTask":
        if not isinstance(raw_task, dict):
            raise ValueError("task must be an object")

        task_type = cls._coerce_optional_string(raw_task.get("type"), "type")
        if task_type != cls.task_type:
            raise ValueError(f"unsupported task type for {cls.__name__}: {task_type}")

        name = cls._coerce_optional_string(raw_task.get("name"), "name") or cls.task_type
        enabled = bool(raw_task.get("enabled", True))
        interval_seconds = cls._coerce_positive_float(
            raw_task.get("interval_seconds"),
            "interval_seconds",
            default=60.0,
        )
        initial_delay_seconds = cls._coerce_positive_float(
            raw_task.get("initial_delay_seconds"),
            "initial_delay_seconds",
            default=0.0,
        )
        jitter_seconds = cls._coerce_positive_float(
            raw_task.get("jitter_seconds"),
            "jitter_seconds",
            default=0.0,
        )
        candidate_scopes = cls._coerce_optional_string_list(raw_task.get("candidate_scopes"), "candidate_scopes")
        candidate_statuses = cls._coerce_optional_string_list(raw_task.get("candidate_statuses"), "candidate_statuses")
        decision_mode = cls._coerce_optional_string(raw_task.get("decision_mode"), "decision_mode", default="dialogue_provider").strip() or "dialogue_provider"
        fallback_mode = cls._coerce_optional_string(raw_task.get("fallback_mode"), "fallback_mode", default="random").strip() or "random"
        trigger_probability = cls._coerce_probability(raw_task.get("trigger_probability"), "trigger_probability", default=0.35)
        message = cls._coerce_optional_string(raw_task.get("message"), "message")
        history_limit = int(raw_task.get("history_limit", 8) or 8)

        if decision_mode not in {"dialogue_provider", "random"}:
            raise ValueError("decision_mode must be 'dialogue_provider' or 'random'")
        if fallback_mode not in {"none", "random"}:
            raise ValueError("fallback_mode must be 'none' or 'random'")

        return cls(
            ScheduledTaskConfig(
                name=name,
                type=task_type,
                enabled=enabled,
                interval_seconds=interval_seconds,
                initial_delay_seconds=initial_delay_seconds,
                jitter_seconds=jitter_seconds,
                options=raw_task,
            ),
            candidate_scopes=candidate_scopes,
            candidate_statuses=candidate_statuses,
            decision_mode=decision_mode,
            fallback_mode=fallback_mode,
            trigger_probability=trigger_probability,
            history_limit=history_limit,
            message=message,
        )

    def next_delay_seconds(self) -> float:
        if self.jitter_seconds <= 0:
            return self.interval_seconds
        return self.interval_seconds + random.uniform(0, self.jitter_seconds)

    async def tick(self, context: ScheduledTaskContext) -> None:
        if not context.server.has_online_hardware():
            return

        if context.server.has_busy_hardware_session():
            return

        candidates = self._resolve_candidates()
        if not candidates:
            if not self._warned_no_candidates:
                logger.warning(
                    "定时任务 {} 未找到可用的非对话流状态，请在 config/ai_status_map.json 中增加非 dialogue_flow 状态或调整 task scopes/statuses",
                    self.name,
                )
                self._warned_no_candidates = True
            return

        self._warned_no_candidates = False

        if not self._should_trigger_this_tick():
            return

        decision = await self._decide(context, candidates)
        if not decision:
            return

        selected = next((item for item in candidates if item.status == decision.status), None)
        if selected is None:
            logger.warning("定时任务 {} 返回了未知状态: {}", self.name, decision.status)
            return

        if context.server.has_busy_hardware_session():
            return

        sent = await context.server.broadcast_ai_status_to_hardware(
            selected.status,
            message=self._message,
            image_name=selected.image_name,
            action_file=selected.action_file,
            sound_file=selected.sound_file,
        )

        if sent > 0:
            self._history.append(
                {
                    "status": selected.status,
                    "scope": selected.scope,
                    "sent_at": datetime.now().isoformat(timespec="seconds"),
                }
            )
            logger.info(
                "定时任务 {} 已向硬件发送空闲状态: status={}, scope={}, receivers={}",
                self.name,
                selected.status,
                selected.scope,
                sent,
            )

    @staticmethod
    def _coerce_probability(value: Any, field_name: str, *, default: float) -> float:
        if value is None:
            return default
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field_name} must be number") from exc
        if number < 0 or number > 1:
            raise ValueError(f"{field_name} must be between 0 and 1")
        return number

    def _should_trigger_this_tick(self) -> bool:
        return random.random() <= self._trigger_probability

    def _resolve_candidates(self) -> list[AIStatusDefinition]:
        definitions = ai_status_catalog.list_definitions()

        if self._candidate_statuses:
            by_name = {definition.status: definition for definition in definitions}
            return [by_name[name] for name in self._candidate_statuses if name in by_name]

        scopes = self._candidate_scopes or ["ambient_flow"]
        return [definition for definition in definitions if definition.scope in scopes]

    async def _decide(
        self,
        context: ScheduledTaskContext,
        candidates: list[AIStatusDefinition],
    ) -> Optional[IdleAIStatusSelection]:
        if self._decision_mode == "dialogue_provider":
            selection = await self._decide_by_dialogue_provider(context, candidates)
            if selection is not None:
                return selection
            if self._fallback_mode == "none":
                return None

        return self._select_random(candidates)

    async def _decide_by_dialogue_provider(
        self,
        context: ScheduledTaskContext,
        candidates: list[AIStatusDefinition],
    ) -> Optional[IdleAIStatusSelection]:
        prompt_payload = {
            "task_name": self.name,
            "now": datetime.now().isoformat(timespec="seconds"),
            "candidate_statuses": [
                {
                    "status": candidate.status,
                    "label": candidate.label,
                    "description": candidate.description,
                    "scope": candidate.scope,
                }
                for candidate in candidates
            ],
            "recent_history": list(self._history),
            "instruction": "只选择一个当前最适合发送的状态名，由系统决定本轮是否触发发送。",
        }

        try:
            raw_text = await context.runtime.ask_scheduler_decision(
                system_prompt=DEFAULT_DECISION_SYSTEM_PROMPT,
                user_payload=prompt_payload,
                session_user=f"scheduler:{self.name}",
            )
        except Exception as exc:
            logger.warning("定时任务 {} 使用 dialogue provider 判定失败: {}", self.name, exc)
            return None

        status_name = self._parse_status_name(raw_text)
        if not status_name:
            logger.warning("定时任务 {} 无法解析 dialogue provider 状态选择结果: {}", self.name, raw_text)
            return None

        if status_name not in {candidate.status for candidate in candidates}:
            logger.warning("定时任务 {} 状态选择返回了不在候选集内的状态: {}", self.name, status_name)
            return None

        return IdleAIStatusSelection(status=status_name)

    def _select_random(self, candidates: list[AIStatusDefinition]) -> Optional[IdleAIStatusSelection]:
        if not candidates:
            return None

        filtered = candidates
        if self._history and len(candidates) > 1:
            last_status = self._history[-1]["status"]
            alternatives = [candidate for candidate in candidates if candidate.status != last_status]
            if alternatives:
                filtered = alternatives

        selected = random.choice(filtered)
        return IdleAIStatusSelection(status=selected.status)

    @staticmethod
    def _parse_status_name(raw_text: str) -> str:
        if not raw_text:
            return ""

        stripped = raw_text.strip().strip("`").strip().strip("\"'")
        if stripped and "\n" not in stripped and " " not in stripped and "{" not in stripped:
            return stripped

        try:
            payload = json.loads(raw_text)
            if isinstance(payload, str):
                return payload.strip()
            if isinstance(payload, dict):
                return str(payload.get("status", "") or "").strip()
        except json.JSONDecodeError:
            pass

        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start < 0 or end <= start:
            first_line = raw_text.strip().splitlines()[0].strip().strip("`").strip("\"'")
            return first_line if first_line and " " not in first_line else ""

        try:
            payload = json.loads(raw_text[start:end + 1])
        except json.JSONDecodeError:
            return ""

        if isinstance(payload, dict):
            return str(payload.get("status", "") or "").strip()
        return ""
