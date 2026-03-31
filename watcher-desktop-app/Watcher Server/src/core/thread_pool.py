"""线程池管理"""
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Any, Callable, Optional
import threading

from src.utils.logger import get_logger

logger = get_logger(__name__)


class ThreadPoolManager:
    """线程池管理器"""

    _instance: Optional["ThreadPoolManager"] = None
    _lock = threading.Lock()

    def __new__(cls, max_workers: int = 10, min_workers: int = 2):
        """单例模式"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, max_workers: int = 10, min_workers: int = 2):
        """初始化线程池

        Args:
            max_workers: 最大工作线程数
            min_workers: 最小工作线程数
        """
        if hasattr(self, "_initialized"):
            return

        self.max_workers = max_workers
        self.min_workers = min_workers
        self.executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="watcher_worker"
        )
        self._initialized = True
        logger.info(f"线程池初始化完成: max_workers={max_workers}, min_workers={min_workers}")

    def submit(self, fn: Callable, *args: Any, **kwargs: Any) -> Future:
        """提交任务到线程池

        Args:
            fn: 要执行的函数
            *args: 位置参数
            **kwargs: 关键字参数

        Returns:
            Future对象
        """
        logger.debug(f"提交任务到线程池: {fn.__name__}")
        return self.executor.submit(fn, *args, **kwargs)

    def shutdown(self, wait: bool = True):
        """关闭线程池

        Args:
            wait: 是否等待所有任务完成
        """
        logger.info("正在关闭线程池...")
        self.executor.shutdown(wait=wait)
        logger.info("线程池已关闭")

    def get_active_count(self) -> int:
        """获取活跃线程数（估算）"""
        # ThreadPoolExecutor没有直接的方法获取活跃线程数
        # 这里返回线程数上限作为参考
        return self.max_workers


# 全局线程池实例
_thread_pool: Optional[ThreadPoolManager] = None


def get_thread_pool() -> ThreadPoolManager:
    """获取全局线程池实例

    Returns:
        ThreadPoolManager实例
    """
    global _thread_pool
    if _thread_pool is None:
        from src.config import settings
        _thread_pool = ThreadPoolManager(
            max_workers=settings.thread_pool_max_workers,
            min_workers=settings.thread_pool_min_workers
        )
    return _thread_pool


def shutdown_thread_pool():
    """关闭全局线程池"""
    global _thread_pool
    if _thread_pool is not None:
        _thread_pool.shutdown()
        _thread_pool = None
