"""WebSocket 服务器 - 核心处理流程"""
import asyncio
from typing import Dict, Iterable, Optional, Set
import websockets

from src.config import settings
from src.core.ai_status_controller import ai_status_controller
from src.core.device_registry import DeviceRegistry
from src.utils.logger import get_logger
from src.utils.message_handler import MessageHandler
from src.modules.discovery.discovery_server import DiscoveryServer
from src.core.audio_session_handler import AudioSessionHandler
from src.core.message_dispatcher import MessageDispatcher
from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_router import register_protocol_handlers
from src.core.runtime_services import RuntimeServices
from src.models.protocol import (
    BinaryFrame,
    ClientRole,
    TextMessageType,
)

logger = get_logger(__name__)


class WebSocketServer:
    """WebSocket 服务器"""

    def __init__(
        self,
        host: str = None,
        port: int = None,
        runtime_services: RuntimeServices | None = None,
    ):
        self.host = host or settings.ws_host
        self.port = port or settings.ws_port
        self.runtime_services = runtime_services or RuntimeServices()
        self.scheduler_service = None
        self.ai_status_controller = ai_status_controller

        # 连接管理
        self.connected_clients: Set[websockets.WebSocketServerProtocol] = set()
        self.client_roles: Dict[websockets.WebSocketServerProtocol, ClientRole] = {}
        self.client_last_seen: Dict[websockets.WebSocketServerProtocol, float] = {}
        self.client_metadata: Dict[websockets.WebSocketServerProtocol, dict] = {}
        self.client_sessions: Dict[websockets.WebSocketServerProtocol, AudioSessionHandler] = {}
        self.device_registry = DeviceRegistry()
        self._background_audio_busy_count = 0

        # 服务器实例
        self.server: Optional[websockets.WebSocketServer] = None

        # 服务发现服务器
        self.discovery_server: Optional[DiscoveryServer] = None

        logger.info(f"WebSocket服务器初始化: {self.host}:{self.port}")

    # ==================== 核心流程 ====================

    async def start(self):
        """启动服务器"""
        logger.info(f"启动WebSocket服务器: ws://{self.host}:{self.port}")

        # 启动服务发现服务器
        if settings.discovery_enabled:
            self.discovery_server = DiscoveryServer(ws_port=self.port)
            await self.sync_discovery_server_state()

        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            max_size=settings.ws_max_size,
        ) as server:
            self.server = server
            logger.info("WebSocket服务器启动成功")
            await asyncio.Future()

    async def handle_client(self, websocket: websockets.WebSocketServerProtocol):
        """处理客户端连接"""
        client_id = id(websocket)
        logger.info(f"新客户端连接: {client_id}")
        self.connected_clients.add(websocket)
        self.client_roles[websocket] = ClientRole.UNKNOWN
        self.client_last_seen[websocket] = asyncio.get_running_loop().time()
        self.client_metadata[websocket] = {}

        # 创建会话处理器
        session = AudioSessionHandler(
            websocket=websocket,
            server=self,
            runtime_services=self.runtime_services,
            connected_clients=self.connected_clients,
        )
        self.client_sessions[websocket] = session

        # 创建消息分发器
        dispatcher = MessageDispatcher()
        context = ProtocolHandlerContext(
            server=self,
            websocket=websocket,
            session=session,
        )
        register_protocol_handlers(dispatcher, context)

        try:
            # 接收消息循环
            async for message in websocket:
                self.client_last_seen[websocket] = asyncio.get_running_loop().time()
                try:
                    await dispatcher.dispatch(message)
                except websockets.exceptions.ConnectionClosed:
                    raise
                except Exception as exc:
                    logger.opt(exception=True).error(
                        "处理客户端消息失败: client_id={}, error={}",
                        client_id,
                        exc,
                    )
        except websockets.exceptions.ConnectionClosed:
            logger.warning(f"客户端断开连接: {client_id}")
        except Exception as exc:
            logger.opt(exception=True).error(
                "处理客户端 {} 时发生错误: {}",
                client_id,
                exc,
            )
        finally:
            disconnected_role = self.client_roles.get(websocket, ClientRole.UNKNOWN)
            self.connected_clients.discard(websocket)
            self.client_roles.pop(websocket, None)
            self.client_last_seen.pop(websocket, None)
            self.client_metadata.pop(websocket, None)
            self.client_sessions.pop(websocket, None)
            if disconnected_role is ClientRole.HARDWARE and self.device_registry.remove_hardware(websocket):
                await self.sync_discovery_server_state()
                await self.broadcast_device_status()
            logger.info(f"客户端连接关闭: {client_id}")

    def get_client_role(
        self,
        websocket: websockets.WebSocketServerProtocol,
    ) -> ClientRole:
        """获取客户端角色。"""
        return self.client_roles.get(websocket, ClientRole.UNKNOWN)

    def get_client_metadata(
        self,
        websocket: websockets.WebSocketServerProtocol,
    ) -> dict:
        """获取客户端握手元数据。"""
        return self.client_metadata.get(websocket, {})

    def iter_clients_by_role(
        self,
        roles: ClientRole | Iterable[ClientRole],
        *,
        exclude: Optional[websockets.WebSocketServerProtocol] = None,
    ):
        """迭代指定角色的连接。"""
        if isinstance(roles, ClientRole):
            roles = {roles}
        else:
            roles = set(roles)

        for websocket in self.connected_clients:
            if exclude is not None and websocket is exclude:
                continue
            if self.get_client_role(websocket) in roles:
                yield websocket

    def get_session(
        self,
        websocket: websockets.WebSocketServerProtocol,
    ) -> Optional[AudioSessionHandler]:
        """获取指定连接的音频会话处理器。"""
        return self.client_sessions.get(websocket)

    def attach_scheduler_service(self, scheduler_service) -> None:
        """挂载定时任务服务，供协议处理器读取和控制。"""
        self.scheduler_service = scheduler_service

    def begin_background_audio_push(self) -> None:
        """标记当前存在服务端主动下发的音频播报。"""
        self._background_audio_busy_count += 1

    def end_background_audio_push(self) -> None:
        """清除服务端主动下发音频播报忙碌态。"""
        if self._background_audio_busy_count > 0:
            self._background_audio_busy_count -= 1

    def has_busy_hardware_session(self) -> bool:
        """是否存在正在处理中的硬件音频会话。"""
        if self._background_audio_busy_count > 0:
            return True

        for websocket in self.iter_clients_by_role(ClientRole.HARDWARE):
            session = self.client_sessions.get(websocket)
            if session and session.is_busy:
                return True
        return False

    def get_busy_hardware_session_snapshot(self) -> Optional[dict]:
        """返回首个忙碌中的硬件语音会话快照。"""
        for websocket in self.iter_clients_by_role(ClientRole.HARDWARE):
            session = self.client_sessions.get(websocket)
            if not session or not session.is_busy:
                continue

            metadata = self.get_client_metadata(websocket)
            return {
                "busy_client_id": id(websocket),
                "busy_role": ClientRole.HARDWARE.value,
                "busy_stage": session.busy_stage,
                "fw_version": metadata.get("fw_version", ""),
                "hw_version": metadata.get("hw_version", ""),
                "board_model": metadata.get("board_model", ""),
                "mac": metadata.get("mac", ""),
            }

        if self._background_audio_busy_count > 0:
            return {
                "busy_client_id": 0,
                "busy_role": "scheduler",
                "busy_stage": "scheduler.tts",
                "fw_version": "",
                "hw_version": "",
                "board_model": "",
                "mac": "",
            }
        return None

    def build_device_status_payload(self) -> dict:
        """构造当前硬件在线状态快照。"""
        devices = self.device_registry.snapshot()
        return {
            "devices": devices,
            "online_hardware_count": len(devices),
        }

    def get_online_hardware_count(
        self,
        *,
        exclude: Optional[websockets.WebSocketServerProtocol] = None,
    ) -> int:
        """返回当前在线硬件连接数。"""
        return sum(
            1
            for _ in self.iter_clients_by_role(
                ClientRole.HARDWARE,
                exclude=exclude,
            )
        )

    def has_online_hardware(self) -> bool:
        """当前是否存在在线硬件端。"""
        return self.get_online_hardware_count() > 0

    async def sync_discovery_server_state(self) -> None:
        """根据硬件在线状态同步 UDP discovery 的启停。"""
        if not settings.discovery_enabled:
            return

        if self.discovery_server is None:
            self.discovery_server = DiscoveryServer(ws_port=self.port)

        should_run = self.get_online_hardware_count() == 0
        is_running = self.discovery_server.is_running

        if should_run and not is_running:
            logger.info("当前无硬件在线，启动 UDP discovery")
            await self.discovery_server.start()
            return

        if not should_run and is_running:
            logger.info("检测到硬件已在线，暂停 UDP discovery")
            await self.discovery_server.stop()

    async def send_text_message_to(
        self,
        websocket: websockets.WebSocketServerProtocol,
        message_type: str,
        *,
        data=None,
        code: int = 0,
    ) -> bool:
        """向指定连接发送文本消息。"""
        handler = MessageHandler(websocket)
        return await handler.send(message_type, data=data, code=code)

    async def send_device_status_to(
        self,
        websocket: websockets.WebSocketServerProtocol,
    ) -> bool:
        """向指定连接发送设备状态快照。"""
        return await self.send_text_message_to(
            websocket,
            TextMessageType.EVT_DEVICE_STATUS.value,
            data=self.build_device_status_payload(),
            code=0,
        )

    async def broadcast_device_status(self) -> int:
        """向所有桌面端广播当前设备状态快照。"""
        return await self.broadcast_text_message(
            ClientRole.DESKTOP,
            TextMessageType.EVT_DEVICE_STATUS.value,
            data=self.build_device_status_payload(),
            code=0,
        )

    async def broadcast_ai_status_to_hardware(
        self,
        status: str,
        *,
        message: str = "",
        image_name: Optional[str] = None,
        action_file: Optional[str] = None,
        sound_file: Optional[str] = None,
        detail: Optional[dict] = None,
    ) -> int:
        """向所有在线硬件广播 AI 状态事件。"""
        data = self.ai_status_controller.build_payload_data(
            status,
            message=message,
            image_name=image_name,
            action_file=action_file,
            sound_file=sound_file,
            detail=detail,
        )
        return await self.ai_status_controller.broadcast_payload_to_hardware(self, data)

    async def broadcast_text_message(
        self,
        roles: ClientRole | Iterable[ClientRole],
        message_type: str,
        *,
        data=None,
        code: int = 0,
        exclude: Optional[websockets.WebSocketServerProtocol] = None,
    ) -> int:
        """向指定角色客户端广播文本消息。"""
        sent = 0
        for websocket in self.iter_clients_by_role(roles, exclude=exclude):
            handler = MessageHandler(websocket)
            if await handler.send(message_type, data=data, code=code):
                sent += 1
        return sent

    async def broadcast_binary_frame(
        self,
        roles: ClientRole | Iterable[ClientRole],
        frame: BinaryFrame,
        *,
        exclude: Optional[websockets.WebSocketServerProtocol] = None,
    ) -> int:
        """向指定角色客户端广播二进制帧。"""
        sent = 0
        raw_frame = frame.to_bytes()
        for websocket in self.iter_clients_by_role(roles, exclude=exclude):
            try:
                await websocket.send(raw_frame)
                sent += 1
            except Exception as exc:
                logger.error("二进制帧广播失败: client_id={}, error={}", id(websocket), exc)
        return sent

    async def stop(self):
        """停止服务器"""
        logger.info("正在停止WebSocket服务器...")

        # 停止服务发现服务器
        if self.discovery_server:
            await self.discovery_server.stop()

        if self.server:
            self.server.close()
            await self.server.wait_closed()
        logger.info("WebSocket服务器已停止")
