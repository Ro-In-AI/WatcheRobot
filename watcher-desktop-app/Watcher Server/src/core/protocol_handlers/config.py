"""配置类消息处理器。"""
from __future__ import annotations

from typing import Callable, Awaitable

from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers.common import ensure_object_payload, ensure_role, reject_server_only_message
from src.models.protocol import ClientRole, TextMessage, TextMessageType


async def handle_cfg_asr_get(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_ASR_GET, (ClientRole.DESKTOP,)):
        return

    await context.session.msg_handler.send_config_report(
        TextMessageType.CFG_ASR_REPORT,
        context.runtime.get_asr_report().to_payload(),
    )


async def handle_cfg_asr_report(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CFG_ASR_REPORT)


async def handle_cfg_asr_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    await _handle_config_update(
        context,
        message,
        request_type=TextMessageType.CFG_ASR_UPDATE,
        report_type=TextMessageType.CFG_ASR_REPORT,
        updater=context.runtime.update_asr_config,
    )


async def handle_cfg_tts_get(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_TTS_GET, (ClientRole.DESKTOP,)):
        return

    await context.session.msg_handler.send_config_report(
        TextMessageType.CFG_TTS_REPORT,
        context.runtime.get_tts_report().to_payload(),
    )


async def handle_cfg_tts_report(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CFG_TTS_REPORT)


async def handle_cfg_tts_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    await _handle_config_update(
        context,
        message,
        request_type=TextMessageType.CFG_TTS_UPDATE,
        report_type=TextMessageType.CFG_TTS_REPORT,
        updater=context.runtime.update_tts_config,
    )


async def handle_cfg_llm_get(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_LLM_GET, (ClientRole.DESKTOP,)):
        return

    await context.session.msg_handler.send_config_report(
        TextMessageType.CFG_LLM_REPORT,
        context.runtime.get_llm_report().to_payload(),
    )


async def handle_cfg_llm_report(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CFG_LLM_REPORT)


async def handle_cfg_llm_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    await _handle_config_update(
        context,
        message,
        request_type=TextMessageType.CFG_LLM_UPDATE,
        report_type=TextMessageType.CFG_LLM_REPORT,
        updater=context.runtime.update_llm_config,
    )


async def handle_cfg_dialogue_get(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_DIALOGUE_GET, (ClientRole.DESKTOP,)):
        return

    await context.session.msg_handler.send_config_report(
        TextMessageType.CFG_DIALOGUE_REPORT,
        context.runtime.get_dialogue_report().to_payload(),
    )


async def handle_cfg_dialogue_report(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CFG_DIALOGUE_REPORT)


async def handle_cfg_dialogue_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    await _handle_config_update(
        context,
        message,
        request_type=TextMessageType.CFG_DIALOGUE_UPDATE,
        report_type=TextMessageType.CFG_DIALOGUE_REPORT,
        updater=context.runtime.update_dialogue_config,
    )


async def handle_cfg_scheduler_get(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_SCHEDULER_GET, (ClientRole.DESKTOP,)):
        return

    if context.scheduler is None:
        await context.session.msg_handler.send_nack(
            TextMessageType.CFG_SCHEDULER_GET,
            "scheduler service is not available",
        )
        return

    await context.session.msg_handler.send_config_report(
        TextMessageType.CFG_SCHEDULER_REPORT,
        context.scheduler.get_report().to_payload(),
    )


async def handle_cfg_scheduler_report(
    context: ProtocolHandlerContext,
    _message: TextMessage,
) -> None:
    await reject_server_only_message(context, TextMessageType.CFG_SCHEDULER_REPORT)


async def handle_cfg_scheduler_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
) -> None:
    if not await ensure_role(context, TextMessageType.CFG_SCHEDULER_UPDATE, (ClientRole.DESKTOP,)):
        return

    if context.scheduler is None:
        await context.session.msg_handler.send_nack(
            TextMessageType.CFG_SCHEDULER_UPDATE,
            "scheduler service is not available",
        )
        return

    if not ensure_object_payload(message):
        await context.session.msg_handler.send_nack(
            TextMessageType.CFG_SCHEDULER_UPDATE,
            "data must be an object",
        )
        return

    config_payload = _extract_config_payload(message)
    if config_payload is None:
        await context.session.msg_handler.send_nack(
            TextMessageType.CFG_SCHEDULER_UPDATE,
            "data.config must be a config object",
        )
        return

    try:
        report = await context.scheduler.update_config(config_payload)
    except Exception as exc:
        await context.session.msg_handler.send_nack(
            TextMessageType.CFG_SCHEDULER_UPDATE,
            str(exc),
        )
        return

    runtime = report.runtime or {}
    await context.session.msg_handler.send_ack(
        TextMessageType.CFG_SCHEDULER_UPDATE,
        data={
            "enabled": bool(report.config.get("enabled", True)),
            "active": bool(runtime.get("active", False)),
            "active_task_count": int(runtime.get("active_task_count", 0) or 0),
        },
    )

    await context.server.broadcast_text_message(
        ClientRole.DESKTOP,
        TextMessageType.CFG_SCHEDULER_REPORT.value,
        data=report.to_payload(),
        code=0,
    )


def _extract_config_payload(message: TextMessage) -> dict | None:
    if not isinstance(message.data, dict):
        return None

    payload = message.data.get("config")
    if isinstance(payload, dict):
        return payload

    if any(key in message.data for key in ("provider", "common", "providers")):
        return message.data

    return None


async def _handle_config_update(
    context: ProtocolHandlerContext,
    message: TextMessage,
    *,
    request_type: TextMessageType,
    report_type: TextMessageType,
    updater: Callable[[dict], Awaitable],
    block_when_busy: bool = True,
) -> None:
    if not await ensure_role(context, request_type, (ClientRole.DESKTOP,)):
        return

    if not ensure_object_payload(message):
        await context.session.msg_handler.send_nack(
            request_type,
            "data must be an object",
        )
        return

    if block_when_busy:
        busy_snapshot = context.server.get_busy_hardware_session_snapshot()
        if busy_snapshot:
            await context.session.msg_handler.send_nack(
                request_type,
                "runtime update is blocked while hardware voice pipeline is active",
                data=busy_snapshot,
            )
            return

    config_payload = _extract_config_payload(message)
    if config_payload is None:
        await context.session.msg_handler.send_nack(
            request_type,
            "data.config must be a config object",
        )
        return

    try:
        report = await updater(config_payload)
    except Exception as exc:
        await context.session.msg_handler.send_nack(
            request_type,
            str(exc),
        )
        return

    await context.session.msg_handler.send_ack(
        request_type,
        data={"provider": report.runtime.get("provider", "")},
    )

    await context.server.broadcast_text_message(
        ClientRole.DESKTOP,
        report_type.value,
        data=report.to_payload(),
        code=0,
    )
