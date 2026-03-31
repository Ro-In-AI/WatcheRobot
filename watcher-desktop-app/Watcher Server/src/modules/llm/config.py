"""LLM 配置类"""
import json
import os
from typing import Dict, Any, Tuple
from dataclasses import dataclass

from .registry import get_config_schema


# 默认配置文件路径
DEFAULT_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "config",
    "llm.json"
)


@dataclass
class LLMCommonConfig:
    """LLM 通用配置"""
    provider: str = "ark"
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 0.9
    stream: bool = False


class LLMConfig:
    """LLM 完整配置

    通用配置 + 提供商特定配置（从 JSON 文件加载）
    """

    def __init__(
        self,
        common: LLMCommonConfig = None,
        provider_config: Dict[str, Any] = None,
    ):
        self.common = common or LLMCommonConfig()
        self.provider_config: Dict[str, Any] = provider_config or {}

    @property
    def provider(self) -> str:
        return self.common.provider

    @staticmethod
    def _merge_grouped_section(section: Any, section_name: str) -> Dict[str, Any]:
        """读取 `basic/advanced` 分组结构。"""
        if not isinstance(section, dict):
            raise ValueError(f"{section_name} must be an object")

        unexpected_keys = set(section.keys()) - {"basic", "advanced", "label", "description"}
        if unexpected_keys:
            raise ValueError(f"{section_name} must use basic/advanced structure")

        basic = section.get("basic", {})
        advanced = section.get("advanced", {})
        if basic and not isinstance(basic, dict):
            raise ValueError(f"{section_name}.basic must be an object")
        if advanced and not isinstance(advanced, dict):
            raise ValueError(f"{section_name}.advanced must be an object")

        merged: Dict[str, Any] = {}
        if isinstance(basic, dict):
            merged.update(basic)
        if isinstance(advanced, dict):
            merged.update(advanced)
        return merged

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LLMConfig":
        """从分组 JSON 配置加载。"""
        if not isinstance(data, dict):
            raise ValueError("LLM config must be a JSON object")

        common_data = cls._merge_grouped_section(data.get("common", {}), "llm.common")
        common = LLMCommonConfig(
            provider=data.get("provider", "ark"),
            temperature=common_data.get("temperature", 0.7),
            max_tokens=common_data.get("max_tokens", 2048),
            top_p=common_data.get("top_p", 0.9),
            stream=common_data.get("stream", False),
        )

        provider_name = common.provider.lower()
        providers_data = data.get("providers", {})
        if not isinstance(providers_data, dict):
            raise ValueError("LLM config must contain providers object")

        provider_section = providers_data.get(provider_name)
        if not isinstance(provider_section, dict):
            raise ValueError(f"LLM config missing providers.{provider_name}")

        provider_data = cls._merge_grouped_section(
            provider_section,
            f"llm.providers.{provider_name}",
        )

        schema = get_config_schema(provider_name)
        provider_config = {}
        if schema:
            for field_name in schema:
                if field_name in provider_data:
                    provider_config[field_name] = provider_data[field_name]

        return cls(common=common, provider_config=provider_config)

    @classmethod
    def from_file(cls, config_path: str = None) -> "LLMConfig":
        """从 JSON 配置文件加载配置

        Args:
            config_path: 配置文件路径，默认使用 config/llm.json

        Returns:
            LLMConfig 实例
        """
        if config_path is None:
            config_path = DEFAULT_CONFIG_PATH

        if not os.path.exists(config_path):
            # 文件不存在时使用默认值
            return cls()

        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return cls.from_dict(data)

    def validate(self) -> Tuple[bool, str]:
        """验证配置是否有效

        Returns:
            (is_valid, error_message): 是否有效, 错误信息
        """
        provider = self.provider.lower()

        # 针对不同提供商定义必填字段
        required_fields_map = {
            "ark": ["api_key"],
            "openai": ["api_key"],
            "anthropic": ["api_key"],
            "deepseek": ["api_key"],
        }

        required_fields = required_fields_map.get(provider, [])

        # 检查必填字段
        missing_fields = []
        for field in required_fields:
            value = self.provider_config.get(field, "")
            if not value or str(value).strip() == "":
                missing_fields.append(field)

        if missing_fields:
            return False, f"配置验证失败: {provider} 提供商缺少必填字段: {', '.join(missing_fields)}"

        return True, ""
