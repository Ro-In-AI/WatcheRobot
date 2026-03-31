"""项目根启动入口。

保持为一个很薄的代理层，统一复用 `src.main` 的最新启动流程，
避免根目录入口和 `src.main` 的服务架构发生漂移。
"""
import asyncio

from src.main import logger, main


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("程序被用户中断")
