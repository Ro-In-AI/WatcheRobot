"""本地 HTTP 管理接口。"""
from __future__ import annotations

from typing import Any

from aiohttp import web

from src.config import settings
from src.utils.logger import get_logger


logger = get_logger(__name__)


class HTTPManagementServer:
    """提供仅供桌面端/本地工具使用的 HTTP 管理接口。"""

    def __init__(self, *, scheduler_service) -> None:
        self._scheduler_service = scheduler_service
        self.host = settings.http_management_host
        self.port = settings.http_management_port
        self._app: web.Application | None = None
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None

    @property
    def is_enabled(self) -> bool:
        return bool(settings.http_management_enabled)

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    async def start(self) -> None:
        if not self.is_enabled:
            logger.info("HTTP 管理接口已在系统配置中关闭")
            return

        if self._runner is not None:
            return

        self._app = web.Application(middlewares=[self._cors_middleware])
        self._app.add_routes(
            [
                web.get("/api/admin/health", self._handle_health),
                web.get("/api/admin/scheduled-tts", self._handle_get_scheduled_tts),
                web.put("/api/admin/scheduled-tts", self._handle_put_scheduled_tts),
                web.post("/api/admin/scheduled-tts/trigger", self._handle_trigger_scheduled_tts),
                web.options("/{path:.*}", self._handle_options),
            ]
        )

        self._runner = web.AppRunner(self._app, access_log=None)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, self.host, self.port)
        await self._site.start()
        logger.info("HTTP 管理接口已启动: {}", self.base_url)

    async def stop(self) -> None:
        if self._runner is None:
            return

        await self._runner.cleanup()
        self._app = None
        self._runner = None
        self._site = None
        logger.info("HTTP 管理接口已停止")

    @web.middleware
    async def _cors_middleware(self, request: web.Request, handler):
        if request.method == "OPTIONS":
            response = web.Response(status=204)
        else:
            response = await handler(request)

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Cache-Control"] = "no-store"
        return response

    async def _handle_options(self, _request: web.Request) -> web.Response:
        return web.Response(status=204)

    async def _handle_health(self, _request: web.Request) -> web.Response:
        return self._json_response(
            {
                "ok": True,
                "data": {
                    "enabled": self.is_enabled,
                    "base_url": self.base_url,
                },
            }
        )

    async def _handle_get_scheduled_tts(self, _request: web.Request) -> web.Response:
        payload = self._scheduler_service.get_http_managed_scheduled_tts_payload()
        payload["management"] = {
            "enabled": self.is_enabled,
            "base_url": self.base_url,
        }
        return self._json_response({"ok": True, "data": payload})

    async def _handle_put_scheduled_tts(self, request: web.Request) -> web.Response:
        try:
            data = await self._read_json_body(request)
            report = await self._scheduler_service.upsert_http_managed_scheduled_tts_task(
                trigger_at_text=data.get("trigger_at"),
                text=data.get("text"),
            )
        except ValueError as exc:
            return self._error_response(str(exc), status=400)
        except Exception as exc:
            logger.error("HTTP 更新定时 TTS 任务失败: {}", exc, exc_info=True)
            return self._error_response(str(exc), status=500)

        payload = self._scheduler_service.get_http_managed_scheduled_tts_payload(report=report)
        payload["management"] = {
            "enabled": self.is_enabled,
            "base_url": self.base_url,
        }
        return self._json_response({"ok": True, "data": payload})

    async def _handle_trigger_scheduled_tts(self, request: web.Request) -> web.Response:
        try:
            data = await self._read_json_body(request)
            result = await self._scheduler_service.trigger_http_managed_scheduled_tts(
                text=data.get("text"),
                wait_timeout_seconds=data.get("wait_timeout_seconds"),
            )
        except ValueError as exc:
            return self._error_response(str(exc), status=400)
        except RuntimeError as exc:
            return self._error_response(str(exc), status=409)
        except Exception as exc:
            logger.error("HTTP 触发定时 TTS 测试失败: {}", exc, exc_info=True)
            return self._error_response(str(exc), status=500)

        return self._json_response({"ok": True, "data": result})

    async def _read_json_body(self, request: web.Request) -> dict[str, Any]:
        if request.content_length in (None, 0):
            return {}

        try:
            payload = await request.json()
        except Exception as exc:
            raise ValueError("request body must be valid JSON") from exc

        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    @staticmethod
    def _json_response(payload: dict[str, Any], *, status: int = 200) -> web.Response:
        return web.json_response(payload, status=status)

    def _error_response(
        self,
        message: str,
        *,
        status: int,
        data: dict[str, Any] | None = None,
    ) -> web.Response:
        return self._json_response(
            {
                "ok": False,
                "error": {
                    "message": message,
                    "status": status,
                    "data": data or {},
                },
            },
            status=status,
        )
