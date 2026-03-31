"""系统配置加载。

当前服务基础配置统一从 `config/system.json` 读取，
不再依赖 `.env` 作为用户可编辑的主配置入口。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr


def get_app_root() -> Path:
    """获取应用根目录。

    - 源码运行时：项目根目录
    - 打包后二进制运行时：可执行文件所在目录
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def get_system_config_path() -> Path:
    """获取系统配置文件路径。"""
    return get_app_root() / "config" / "system.json"


class Settings(BaseModel):
    """应用配置。"""

    model_config = ConfigDict(extra="ignore")

    _config_path: Path = PrivateAttr(default_factory=get_system_config_path)
    _cached_openclaw_prompt: Optional[str] = PrivateAttr(default=None)
    _cached_llm_think_prompt: Optional[str] = PrivateAttr(default=None)

    # 服务基础信息
    service_name: str = Field(default="watcher-server", description="服务名称")
    service_version: str = Field(default="1.0.0", description="服务版本")
    protocol_version: str = Field(default="0.1.5", description="当前通信协议版本")

    # WebSocket 配置
    ws_host: str = Field(default="0.0.0.0", description="WebSocket 服务地址")
    ws_port: int = Field(default=8765, description="WebSocket 服务端口")
    ws_max_size: int = Field(default=10 * 1024 * 1024, description="WebSocket 最大消息大小")

    # OpenClaw / 公共运行时补充配置
    deepgram_api_key: str = Field(default="", description="Deepgram API Key 全局兜底")
    openclaw_api_key: str = Field(default="", description="OpenClaw API 密钥")
    openclaw_api_url: Optional[str] = Field(default=None, description="OpenClaw API 地址")
    openclaw_model: str = Field(default="", description="OpenClaw 模型名称")
    openclaw_agent: str = Field(default="main", description="OpenClaw Agent ID")
    openclaw_status_poll_interval: int = Field(default=3, description="OpenClaw 状态轮询间隔（秒）")
    openclaw_prompt_file: str = Field(default="config/openclaw_prompt.txt", description="OpenClaw 提示词文件路径")
    openclaw_media_root: str = Field(
        default="~/.openclaw/workspace/.watcher_media",
        description="OpenClaw 媒体桥接目录",
    )
    openclaw_media_retention_seconds: int = Field(
        default=24 * 60 * 60,
        description="OpenClaw 媒体桥接文件保留时长（秒）",
    )

    # LLM 补充配置
    llm_prompt_file: str = Field(default="config/llm_think_prompt.txt", description="LLM 精简思考提示词文件路径")

    # 服务发现配置
    discovery_enabled: bool = Field(default=True, description="是否启用服务发现")
    discovery_port: int = Field(default=37020, description="UDP 发现端口")

    # 定时任务配置
    scheduler_enabled: bool = Field(default=True, description="是否启用定时任务模块")
    scheduler_config_file: str = Field(default="config/scheduler.json", description="定时任务配置文件路径")

    # HTTP 管理接口配置
    http_management_enabled: bool = Field(default=True, description="是否启用本地 HTTP 管理接口")
    http_management_host: str = Field(default="127.0.0.1", description="HTTP 管理接口监听地址")
    http_management_port: int = Field(default=8766, description="HTTP 管理接口监听端口")

    # 线程池配置
    thread_pool_max_workers: int = Field(default=10, description="线程池最大工作线程数")
    thread_pool_min_workers: int = Field(default=2, description="线程池最小工作线程数")

    # 日志配置
    log_level: str = Field(default="INFO", description="日志级别")
    log_dir: str = Field(default="logs", description="日志目录")
    log_max_bytes: int = Field(default=10 * 1024 * 1024, description="单个日志文件最大大小")

    @classmethod
    def load(cls, config_path: str | Path | None = None) -> "Settings":
        """从 `config/system.json` 加载配置。"""
        path = Path(config_path) if config_path is not None else get_system_config_path()
        data: dict[str, Any] = {}

        if path.exists():
            with path.open("r", encoding="utf-8") as file:
                loaded = json.load(file)
            if not isinstance(loaded, dict):
                raise ValueError(f"system config must be a JSON object: {path}")
            data = loaded

        instance = cls(**data)
        instance._config_path = path
        return instance

    @property
    def config_path(self) -> Path:
        """当前系统配置文件路径。"""
        return self._config_path

    @property
    def app_root(self) -> Path:
        """应用根目录。"""
        return self._config_path.parent.parent

    @property
    def log_path(self) -> Path:
        """日志目录路径。"""
        return self._resolve_path(self.log_dir)

    def _resolve_path(self, raw_path: str) -> Path:
        path = Path(raw_path).expanduser()
        if path.is_absolute():
            return path
        return (self.app_root / path).resolve()

    def _load_prefixed_text(self, relative_path: str, prefix: str, fallback: str, cache_attr: str) -> str:
        cached_value = getattr(self, cache_attr, None)
        if cached_value is not None:
            return cached_value

        try:
            prompt_file = self._resolve_path(relative_path)
            if prompt_file.exists():
                content = prompt_file.read_text(encoding="utf-8")
                for line in content.splitlines():
                    line = line.strip()
                    if line.startswith(prefix):
                        value = line.split("=", 1)[1].strip()
                        setattr(self, cache_attr, value)
                        return value
        except Exception as exc:
            from src.utils.logger import get_logger

            logger = get_logger(__name__)
            logger.warning("加载配置文本失败，使用默认值: {}", exc)

        setattr(self, cache_attr, fallback)
        return fallback

    def get_openclaw_prompt(self) -> str:
        """加载 OpenClaw 提示词。"""
        default_prompt = (
            "请用简洁的纯文本回复，不要使用 Markdown 格式（如 #、**、*、` 等符号），"
            "不要使用列表，不要使用 emoji、颜文字或装饰性符号，直接用自然段落回复。"
            "回复内容将用于语音合成。"
        )
        return self._load_prefixed_text(
            self.openclaw_prompt_file,
            "TTS_PROMPT=",
            default_prompt,
            "_cached_openclaw_prompt",
        )

    def get_llm_think_prompt(self) -> str:
        """加载 LLM 精简思考提示词。"""
        default_prompt = """你是一个智能助手的思考过程精简器。你的任务是将长篇的思考内容精简为简短、自然的语音播报内容。

规则：
1. 精简后的内容要简短，适合语音播报（不超过30字）
2. 保持思考的核心意图
3. 使用第一人称，像在和主人对话
4. 不要使用Markdown格式
5. 不要添加额外解释，直接输出精简后的内容

思考内容：
{think_content}

精简后："""
        return self._load_prefixed_text(
            self.llm_prompt_file,
            "LLM_THINK_PROMPT=",
            default_prompt,
            "_cached_llm_think_prompt",
        )


settings = Settings.load()
