# TTS 模块插件开发指南

本指南通过 **火山引擎 TTS 插件**的完整实现流程，说明如何为 TTS 模块开发新的 Provider 插件。

## 开发流程概览

```
步骤1: 创建 Provider 实现类
   ↓
步骤2: 使用 @register_provider 装饰器注册插件
   ↓
步骤3: 更新 providers/__init__.py 导出
   ↓
步骤4: 在 config.py 中添加配置验证规则
   ↓
步骤5: 创建配置文件 config/tts.json
   ↓
步骤6: 测试使用
```

---

## 步骤 1: 创建 Provider 实现类

在 `src/modules/tts/providers/` 目录下创建新文件 `huoshan.py`：

```python
"""火山引擎实时语音合成实现"""
import asyncio
import gzip
import json
import uuid
from typing import Optional, AsyncIterator

import websockets
from websockets.protocol import State

from ..base import TTSProvider, TTSResult
from ..registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)
```

### 定义 HuoshanTTS 类

```python
@register_provider("huoshan", {
    "app_key": str,
    "access_key": str,
    "voice_type": str,
    "host": str,
    "api_url": str,
    "encoding": str,
    "speed_ratio": float,
    "volume_ratio": float,
    "pitch_ratio": float,
})
class HuoshanTTS(TTSProvider):
    """火山引擎实时语音合成"""

    # 消息类型常量
    MESSAGE_TYPE_AUDIO = 0xb
    MESSAGE_TYPE_FRONTEND = 0xc
    MESSAGE_TYPE_ERROR = 0xf

    def __init__(
        self,
        app_key: str,
        access_key: str,
        voice_type: str = "ICL_zh_male_nuanxintitie_tob",
        host: str = "openspeech.bytedance.com",
        api_url: str = "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
        sample_rate: int = 24000,
        encoding: str = "pcm",
        speed_ratio: float = 1.0,
        volume_ratio: float = 1.0,
        pitch_ratio: float = 1.0,
    ):
        """初始化火山引擎TTS

        Args:
            app_key: App Key
            access_key: Access Key
            voice_type: 声音类型
            host: 主机地址
            api_url: API URL
            sample_rate: 采样率
            encoding: 音频编码格式
            speed_ratio: 语速比例
            volume_ratio: 音量比例
            pitch_ratio: 音调比例
        """
        super().__init__()

        self.app_key = app_key
        self.access_key = access_key
        self.voice_type = voice_type
        self.host = host
        self.api_url = api_url
        self.sample_rate = sample_rate
        self.encoding = encoding
        self.speed_ratio = speed_ratio
        self.volume_ratio = volume_ratio
        self.pitch_ratio = pitch_ratio

        # WebSocket连接
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

        # 默认消息头 (protocol_version=1, message_type=1, serialization=1, compression=1)
        self._default_header = bytearray(b'\x11\x10\x11\x00')

        logger.info(
            f"火山引擎TTS初始化: app_key={app_key[:8] if app_key else ''}... "
            f"voice_type={voice_type} sample_rate={sample_rate}"
        )
```

**关键点**：
- 继承 `TTSProvider` 抽象基类
- `__init__` 参数应包含所有配置字段
- 使用 `@register_provider` 装饰器注册（步骤2说明）

### 实现 initialize 方法

```python
    async def initialize(self):
        """初始化TTS引擎"""
        if self._is_initialized:
            logger.warning("火山引擎TTS已经初始化")
            return

        logger.info("初始化火山引擎TTS引擎...")
        self._is_initialized = True
        logger.info("火山引擎TTS引擎初始化完成")
```

### 实现 synthesize 方法（非流式）

```python
    async def synthesize(self, text: str) -> TTSResult:
        """合成语音

        Args:
            text: 要合成的文本

        Returns:
            TTS合成结果
        """
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        logger.info(f"开始TTS合成: {text[:50]}...")

        # 连接WebSocket
        await self._ensure_connection()

        # 发送请求并获取音频
        audio_data = await self._synthesize_text(text)

        # 计算音频时长（PCM格式：采样率 * 位深(2字节) * 通道数 * 秒数）
        duration = len(audio_data) / (self.sample_rate * 2) if self.encoding == "pcm" else None

        logger.info(f"TTS合成完成: audio_size={len(audio_data)} bytes, duration={duration}s")

        return TTSResult(
            audio_data=audio_data,
            format=self.encoding,
            sample_rate=self.sample_rate,
            duration=duration
        )
```

### 实现 synthesize_stream 方法（流式）

```python
    async def synthesize_stream(self, text: str) -> AsyncIterator[TTSResult]:
        """流式合成语音，按句子分批合成并返回

        Args:
            text: 要合成的文本

        Yields:
            TTSResult: 每个句子的音频片段
        """
        if not self._is_initialized:
            raise RuntimeError("TTS未初始化，请先调用initialize()")

        # 按标点分句
        sentences = self.split_text_by_sentences(text, max_length=200)
        logger.info(f"文本已拆分为 {len(sentences)} 个句子")

        for i, sentence in enumerate(sentences):
            if not sentence.strip():
                continue

            logger.debug(f"流式合成第 {i+1}/{len(sentences)} 句: {sentence[:30]}...")

            # 确保连接有效
            await self._ensure_connection()

            # 合成当前句子
            audio_data = await self._synthesize_text(sentence)

            if audio_data:
                duration = len(audio_data) / (self.sample_rate * 2) if self.encoding == "pcm" else None
                logger.debug(f"第 {i+1} 句合成完成: audio_size={len(audio_data)} bytes")

                yield TTSResult(
                    audio_data=audio_data,
                    format=self.encoding,
                    sample_rate=self.sample_rate,
                    duration=duration
                )
```

### 实现 cleanup 方法

```python
    async def cleanup(self):
        """清理资源"""
        logger.info("清理火山引擎TTS资源...")

        if self._ws:
            await self._ws.close()
            self._ws = None

        self._is_initialized = False
        logger.info("火山引擎TTS资源清理完成")
```

---

## 步骤 2: 使用 @register_provider 装饰器注册插件

在类定义上方添加装饰器：

```python
@register_provider("huoshan", {
    "app_key": str,
    "access_key": str,
    "voice_type": str,
    "host": str,
    "api_url": str,
    "encoding": str,
    "speed_ratio": float,
    "volume_ratio": float,
    "pitch_ratio": float,
})
class HuoshanTTS(TTSProvider):
    ...
```

**装饰器参数说明**：
- 第一个参数 `"huoshan"`：Provider 的唯一标识符（小写）
- 第二个参数（字典）：配置字段 schema，定义该 Provider 支持的配置字段及其类型

**schema 的作用**：
- 自动验证配置文件中的字段类型
- 在工厂创建实例时自动过滤无关字段
- 支持配置自发现

---

## 步骤 3: 更新 providers/__init__.py 导出

编辑 `src/modules/tts/providers/__init__.py`：

```python
"""TTS Providers"""
from .huoshan import HuoshanTTS

__all__ = ["HuoshanTTS"]
```

**作用**：确保 Provider 类被导入，从而触发 `@register_provider` 装饰器执行。

---

## 步骤 4: 在 config.py 中添加配置验证规则

编辑 `src/modules/tts/config.py`，在 `validate()` 方法中添加：

```python
def validate(self) -> Tuple[bool, str]:
    """验证配置是否有效"""
    provider = self.provider.lower()

    # 针对不同提供商定义必填字段
    required_fields_map = {
        "aliyun": ["appkey", "ak_id", "ak_secret"],
        "huoshan": ["app_key", "access_key"],
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
```

**作用**：在启动时验证必填配置是否完整，避免运行时错误。

---

## 步骤 5: 创建配置文件 config/tts.json

在项目根目录的 `config/` 文件夹下创建 `tts.json`：

```json
{
    "provider": "huoshan",
    "common": {
        "sample_rate": 24000
    },
    "huoshan": {
        "app_key": "your-app-key-here",
        "access_key": "your-access-key-here",
        "voice_type": "ICL_zh_male_nuanxintitie_tob",
        "host": "openspeech.bytedance.com",
        "api_url": "wss://openspeech.bytedance.com/api/v1/tts/ws_binary",
        "encoding": "pcm",
        "speed_ratio": 1.0,
        "volume_ratio": 1.0,
        "pitch_ratio": 1.0
    }
}
```

**配置文件结构说明**：

| 字段 | 说明 |
|------|------|
| `provider` | 要使用的 Provider 名称（对应 `@register_provider` 的第一个参数） |
| `common` | 通用配置，适用于所有 Provider |
| `huoshan` | Provider 特定配置（字段名与 Provider 的 schema 匹配） |

---

## 步骤 6: 测试使用

### 方式 1: 使用 Manager 单例

```python
import asyncio
from src.modules.tts import TTS

async def main():
    # 初始化
    await TTS.initialize(config_path="config/tts.json")

    # 非流式合成
    text = "你好，这是一段测试文本。"
    result = await TTS.provider.synthesize(text)

    print(f"音频大小: {len(result.audio_data)} bytes")
    print(f"音频格式: {result.format}")
    print(f"采样率: {result.sample_rate}")
    print(f"时长: {result.duration}s")

    # 保存音频文件
    with open("output.pcm", "wb") as f:
        f.write(result.audio_data)

    # 清理
    await TTS.cleanup()

asyncio.run(main())
```

### 方式 2: 使用 Factory

```python
from src.modules.tts import TTSFactory

async def main():
    # 创建 Provider
    provider = TTSFactory.create_from_file("config/tts.json")
    await provider.initialize()

    # 使用
    result = await provider.synthesize("你好世界")
    with open("output.pcm", "wb") as f:
        f.write(result.audio_data)

    # 清理
    await provider.cleanup()

asyncio.run(main())
```

### 方式 3: 流式合成

```python
from src.modules.tts import TTSFactory

async def main():
    provider = TTSFactory.create_from_file("config/tts.json")
    await provider.initialize()

    # 流式合成（按句子分批）
    text = "你好。这是一个测试。我们会分句合成。"

    async for result in provider.synthesize_stream(text):
        print(f"收到音频片段: {len(result.audio_data)} bytes")
        # 可以实时播放或保存每个片段
        with open(f"output_{result.duration}.pcm", "wb") as f:
            f.write(result.audio_data)

    await provider.cleanup()

asyncio.run(main())
```

### 验证插件注册

```python
from src.modules.tts import list_providers, get_config_schema

# 列出所有已注册的 Provider
print("可用 Provider:", list_providers())
# 输出: ['huoshan', 'aliyun']

# 查看 Huoshan 的配置 schema
schema = get_config_schema("huoshan")
print("Huoshan schema:", schema)
# 输出: {'app_key': <class 'str'>, 'access_key': <class 'str'>, ...}
```

---

## 完整的 Huoshan TTS 实现文件

参考：[src/modules/tts/providers/huoshan.py](src/modules/tts/providers/huoshan.py)

---

## 开发新 Provider 的快速清单

开发新的 Provider（例如阿里云）时，按此清单操作：

- [ ] 创建 `src/modules/tts/providers/aliyun.py`
- [ ] 定义 AliyunTTS 类，继承 TTSProvider
- [ ] 添加 `@register_provider("aliyun", {...})` 装饰器
- [ ] 实现 `__init__`、`initialize`、`synthesize`、`synthesize_stream`、`cleanup` 方法
- [ ] 在 `providers/__init__.py` 中添加 `from .aliyun import AliyunTTS`
- [ ] 在 `config.py` 的 `validate()` 中添加 `"aliyun": ["appkey", "ak_id", "ak_secret"]`
- [ ] 创建 `config/tts.json`，添加 `"aliyun"` 配置节
- [ ] 测试验证

---

## 注意事项

1. **异步设计**：所有方法必须是 `async` 的
2. **WebSocket 管理**：确保连接正确建立和关闭，避免连接泄漏
3. **错误处理**：捕获并记录网络错误和 API 错误
4. **流式支持**：需实现 `synthesize_stream` 方法，支持按句子分批合成
5. **配置验证**：必填字段必须在 `config.py` 中声明
6. **资源清理**：在 `cleanup()` 中释放连接、关闭客户端等
7. **音频格式**：确保采样率、编码格式等参数正确
8. **文本分句**：流式合成时需要按标点符号合理分句
