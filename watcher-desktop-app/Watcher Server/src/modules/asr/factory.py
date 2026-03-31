"""ASR 工厂类 - 支持插件自声明配置"""
from typing import Optional
import asyncio

from .base import ASRProvider, ASRCallbacks
from .config import ASRConfig
from .registry import get_provider_class, list_providers, get_config_schema

# 导入所有 Provider 实现以自动注册
from . import providers  # noqa: F401


class ASRFactory:
    """ASR 工厂类"""

    @staticmethod
    def create_provider(config_path: str = None) -> Optional[ASRProvider]:
        """从 JSON 配置创建 ASR Provider。"""
        try:
            return ASRFactory.create_from_file(config_path)
        except Exception:
            return None

    @staticmethod
    def create(config: ASRConfig) -> ASRProvider:
        """创建 ASR Provider 实例"""
        provider_class = get_provider_class(config.provider)
        if not provider_class:
            available = list_providers()
            raise ValueError(
                f"不支持的 ASR 提供商: {config.provider}。"
                f"可用提供商: {available}"
            )

        # 获取 Provider 的配置 schema
        schema = get_config_schema(config.provider)

        # 构建构造函数参数
        init_kwargs = {
            "sample_rate": config.common.sample_rate,
            "channels": config.common.channels,
        }

        # 根据 schema 添加提供商特定配置
        for field_name in schema.keys():
            if field_name in config.provider_config:
                init_kwargs[field_name] = config.provider_config[field_name]

        return provider_class(**init_kwargs)

    @staticmethod
    def create_from_file(config_path: str = None) -> ASRProvider:
        """从 JSON 配置文件创建 ASR Provider

        Args:
            config_path: 配置文件路径，默认使用 config/asr.json
        """
        config = ASRConfig.from_file(config_path)
        return ASRFactory.create(config)


class ASRManager:
    """ASR 实例管理器 - 支持热切换"""

    _instance: Optional["ASRManager"] = None
    _lock: asyncio.Lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._provider: Optional[ASRProvider] = None
        self._config: Optional[ASRConfig] = None
        self._callbacks: Optional[ASRCallbacks] = None
        self._config_path: Optional[str] = None
        self._initialized = True

    @property
    def provider(self) -> Optional[ASRProvider]:
        return self._provider

    @property
    def config(self) -> Optional[ASRConfig]:
        return self._config

    @property
    def current_provider_name(self) -> str:
        return self._config.provider if self._config else ""

    @property
    def is_initialized(self) -> bool:
        return self._provider is not None

    def set_callbacks(self, callbacks: ASRCallbacks) -> None:
        self._callbacks = callbacks
        if self._provider and hasattr(self._provider, "set_callbacks"):
            self._provider.set_callbacks(callbacks)

    async def initialize(
        self,
        config: Optional[ASRConfig] = None,
        config_path: str = None,
        callbacks: Optional[ASRCallbacks] = None,
    ) -> None:
        from src.utils.logger import get_logger
        logger = get_logger("asr.manager")

        async with self._lock:
            # 优先使用传入的 config，否则从文件加载
            if config is None:
                config = ASRConfig.from_file(config_path)

            # 验证配置
            is_valid, error_msg = config.validate()
            if not is_valid:
                logger.error(f"ASR 配置验证失败: {error_msg}")
                raise ValueError(error_msg)

            self._config = config
            self._config_path = config_path
            self._callbacks = callbacks

            self._provider = ASRFactory.create(config)

            if callbacks and hasattr(self._provider, "set_callbacks"):
                self._provider.set_callbacks(callbacks)

            await self._provider.initialize()

    async def switch_provider(
        self,
        config: ASRConfig,
        callbacks: Optional[ASRCallbacks] = None,
    ) -> None:
        async with self._lock:
            from src.utils.logger import get_logger
            logger = get_logger("asr.manager")

            old_provider = self._provider
            old_config = self._config

            logger.info(f"切换 ASR Provider: {old_config.provider if old_config else 'none'} -> {config.provider}")

            try:
                new_provider = ASRFactory.create(config)

                effective_callbacks = callbacks or self._callbacks
                if effective_callbacks and hasattr(new_provider, "set_callbacks"):
                    new_provider.set_callbacks(effective_callbacks)

                await new_provider.initialize()

                if old_provider:
                    try:
                        await old_provider.cleanup()
                    except Exception as e:
                        logger.warning(f"清理旧 Provider 失败: {e}")

                self._provider = new_provider
                self._config = config
                if callbacks:
                    self._callbacks = callbacks

                logger.info(f"ASR Provider 切换成功: {config.provider}")

            except Exception as e:
                logger.error(f"切换 ASR Provider 失败: {e}，恢复旧 Provider")
                self._provider = old_provider
                self._config = old_config
                raise

    async def reload_from_file(self, config_path: str = None) -> None:
        """从配置文件重新加载"""
        if config_path is None:
            config_path = self._config_path

        config = ASRConfig.from_file(config_path)
        await self.switch_provider(config)

    async def cleanup(self) -> None:
        async with self._lock:
            if self._provider:
                await self._provider.cleanup()
                self._provider = None
                self._config = None
                self._callbacks = None


# 全局单例
ASR = ASRManager()
