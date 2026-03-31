"""Watcher Server 主入口"""
import asyncio
import signal
from types import FrameType
from typing import Callable, Optional

from src.config import settings
from src.core.http_management_server import HTTPManagementServer
from src.core.runtime_services import RuntimeServices
from src.core.scheduler import SchedulerService
from src.core.websocket_server import WebSocketServer
from src.core.thread_pool import shutdown_thread_pool
from src.utils.logger import setup_logger, get_logger


# 配置日志
setup_logger()
logger = get_logger(__name__)


class WatcherServer:
    """Watcher Server 主服务"""

    def __init__(self):
        """初始化服务"""
        self.ws_server: WebSocketServer = None
        self.runtime_services = RuntimeServices()
        self.scheduler_service: SchedulerService | None = None
        self.http_management_server: HTTPManagementServer | None = None
        self._shutdown_event = asyncio.Event()

    async def initialize(self):
        """初始化所有模块"""
        logger.info("开始初始化Watcher Server...")
        await self.runtime_services.initialize()

        # 创建 WebSocket 服务器
        self.ws_server = WebSocketServer(
            host=settings.ws_host,
            port=settings.ws_port,
            runtime_services=self.runtime_services,
        )
        self.scheduler_service = SchedulerService(
            server=self.ws_server,
            runtime=self.runtime_services,
        )
        self.ws_server.attach_scheduler_service(self.scheduler_service)
        self.http_management_server = HTTPManagementServer(
            scheduler_service=self.scheduler_service,
        )

        logger.info("Watcher Server初始化完成")

    async def start(self):
        """启动服务"""
        logger.info("启动Watcher Server...")
        if self.scheduler_service is not None:
            await self.scheduler_service.start()
        if self.http_management_server is not None:
            await self.http_management_server.start()
        await self.ws_server.start()

    async def stop(self):
        """停止服务"""
        logger.info("停止Watcher Server...")
        if self.http_management_server is not None:
            await self.http_management_server.stop()
        if self.scheduler_service is not None:
            await self.scheduler_service.stop()
        if self.ws_server:
            await self.ws_server.stop()
        await self.runtime_services.cleanup()
        logger.info("运行时模块资源已清理")

        # 关闭线程池
        shutdown_thread_pool()

        logger.info("Watcher Server已停止")


def _install_shutdown_handlers(
    loop: asyncio.AbstractEventLoop,
    on_shutdown: Callable[[], None],
) -> None:
    """安装跨平台退出信号处理器。

    - Unix: 优先使用 `loop.add_signal_handler`
    - Windows: 回退到 `signal.signal`，再通过 `loop.call_soon_threadsafe`
    """
    signals_to_handle = (signal.SIGINT, signal.SIGTERM)

    try:
        for sig in signals_to_handle:
            loop.add_signal_handler(sig, on_shutdown)
        return
    except (NotImplementedError, RuntimeError):
        logger.info("当前事件循环不支持 add_signal_handler，回退到标准 signal 处理")

    for sig in signals_to_handle:
        def _handler(
            _signum: int,
            _frame: Optional[FrameType],
            *,
            _sig: signal.Signals = sig,
        ) -> None:
            logger.debug("收到信号: {}", _sig.name)
            loop.call_soon_threadsafe(on_shutdown)

        signal.signal(sig, _handler)


async def main():
    """主函数"""
    server = WatcherServer()

    # 设置信号处理
    loop = asyncio.get_running_loop()

    def signal_handler():
        if server._shutdown_event.is_set():
            return
        logger.info("收到退出信号，正在优雅关闭...")
        server._shutdown_event.set()

    _install_shutdown_handlers(loop, signal_handler)

    start_task: asyncio.Task | None = None
    shutdown_waiter: asyncio.Task | None = None

    try:
        # 初始化并启动服务
        await server.initialize()
        start_task = asyncio.create_task(server.start(), name="watcher-server-start")
        shutdown_waiter = asyncio.create_task(
            server._shutdown_event.wait(),
            name="watcher-server-shutdown-waiter",
        )

        done, _pending = await asyncio.wait(
            {start_task, shutdown_waiter},
            return_when=asyncio.FIRST_COMPLETED,
        )

        if start_task in done:
            await start_task
    except asyncio.CancelledError:
        logger.info("任务被取消")
    finally:
        if shutdown_waiter and not shutdown_waiter.done():
            shutdown_waiter.cancel()
            try:
                await shutdown_waiter
            except asyncio.CancelledError:
                pass

        # 清理资源
        await server.stop()

        if start_task and not start_task.done():
            start_task.cancel()
            try:
                await start_task
            except asyncio.CancelledError:
                pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("程序被用户中断")
