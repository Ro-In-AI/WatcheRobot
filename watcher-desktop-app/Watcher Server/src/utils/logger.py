"""日志配置"""
import sys
from pathlib import Path
from loguru import logger

from src.config import settings


def setup_logger():
    """配置日志系统"""
    # 移除默认的handler
    logger.remove()

    # 控制台输出 - 带颜色
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        level="DEBUG",  # 临时改为 INFO，方便调试 ASR
        colorize=True,
    )

    # 文件输出 - 所有日志
    log_path = settings.log_path
    log_path.mkdir(parents=True, exist_ok=True)

    logger.add(
        log_path / "watcher_{time:YYYY-MM-DD}.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        level="DEBUG",
        rotation=f"{settings.log_max_bytes / (1024 * 1024):.0f} MB",
        retention="30 days",
        compression="zip",
        encoding="utf-8",
    )

    # 文件输出 - 错误日志
    logger.add(
        log_path / "watcher_error_{time:YYYY-MM-DD}.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        level="ERROR",
        rotation=f"{settings.log_max_bytes / (1024 * 1024):.0f} MB",
        retention="30 days",
        compression="zip",
        encoding="utf-8",
    )

    logger.info(f"日志系统初始化完成: level={settings.log_level}, path={log_path}")


def get_logger(name: str = None):
    """获取logger实例

    Args:
        name: logger名称

    Returns:
        logger实例
    """
    if name:
        return logger.bind(name=name)
    return logger
