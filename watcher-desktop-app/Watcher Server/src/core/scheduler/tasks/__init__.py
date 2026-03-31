"""内置定时任务。"""

from .idle_ai_status_push import IdleAIStatusPushTask
from .scheduled_tts_push import ScheduledTTSPushTask

__all__ = ["IdleAIStatusPushTask", "ScheduledTTSPushTask"]
