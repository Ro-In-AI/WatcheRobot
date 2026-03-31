# ASR 模块插件开发指南

本指南通过 **阿里云 ASR 插件**的完整实现流程，说明如何为 ASR 模块开发新的 Provider 插件。

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
步骤5: 创建配置文件 config/asr.json
   ↓
步骤6: 测试使用
```

---

## 步骤 1: 创建 Provider 实现类

在 `src/modules/asr/providers/` 目录下创建新文件 `aliyun.py`：

```python
"""阿里云实时语音识别实现"""
import asyncio
import json
import threading
import time
from typing import Optional
from queue import Queue

try:
    import nls
    NLS_AVAILABLE = True
except ImportError:
    NLS_AVAILABLE = False

try:
    from aliyunsdkcore.client import AcsClient
    from aliyunsdkcore.request import CommonRequest
    ALIYUN_SDK_AVAILABLE = True
except ImportError:
    ALIYUN_SDK_AVAILABLE = False

from ..base import ASRProvider, ASRResult, AudioConfig
from ..registry import register_provider
from src.utils.logger import get_logger

logger = get_logger(__name__)
```

### 定义 AliyunASR 类

```python
@register_provider("aliyun", {
    "appkey": str,
    "ak_id": str,
    "ak_secret": str,
    "token": str,  # 可选，与 ak_id/ak_secret 二选一
    "url": str,
    "language": str,
    "enable_intermediate_result": bool,
    "enable_punctuation_prediction": bool,
    "enable_inverse_text_normalization": bool,
})
class AliyunASR(ASRProvider):
    """阿里云实时语音识别"""

    def __init__(
        self,
        appkey: str,
        token: str = "",
        url: str = "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1",
        sample_rate: int = 16000,
        channels: int = 1,
        enable_intermediate_result: bool = True,
        enable_punctuation_prediction: bool = True,
        enable_inverse_text_normalization: bool = True,
        language: str = "zh-CN",
        # AK/SK 方式获取 Token
        ak_id: str = "",
        ak_secret: str = "",
    ):
        super().__init__()

        self.appkey = appkey
        self.url = url
        self.sample_rate = sample_rate
        self.channels = channels
        self.enable_intermediate_result = enable_intermediate_result
        self.enable_punctuation_prediction = enable_punctuation_prediction
        self.enable_inverse_text_normalization = enable_inverse_text_normalization
        self.language = language

        # AK/SK 方式获取 Token
        self.ak_id = ak_id
        self.ak_secret = ak_secret
        self._token = token

        # 识别器实例
        self._transcriber: Optional[nls.NlsSpeechTranscriber] = None

        # 后台线程（持续运行 transcriber.start()）
        self._session_thread: Optional[threading.Thread] = None

        # 结果队列和事件
        self._result_queue: Queue = Queue()
        self._result_event: threading.Event = threading.Event()
        self._current_text: str = ""
        self._is_started: bool = False

        # 启动会话事件：等待 SDK 内部 __start_flag 设置完成后才 set
        self._session_ready_event: threading.Event = threading.Event()
        self._start_success: bool = False
```

**关键点**：
- 继承 `ASRProvider` 抽象基类
- `__init__` 参数应包含所有配置字段
- 使用 `@register_provider` 装饰器注册（步骤2说明）

### 实现 initialize 方法

```python
    async def initialize(self):
        """初始化ASR引擎"""
        if self._is_initialized:
            logger.warning("阿里云ASR已经初始化")
            return

        logger.info("初始化阿里云ASR引擎...")
        self._is_initialized = True
        logger.info("阿里云ASR引擎初始化完成")
```

### 实现 recognize 方法（非流式）

```python
    async def recognize(
        self,
        audio_data: bytes,
        audio_config: Optional[AudioConfig] = None
    ) -> ASRResult:
        """识别一段音频（非流式）"""
        await self.stream_start(audio_config)
        await self.stream_feed(audio_data)
        result = await self.stream_stop()
        return result
```

### 实现流式识别方法

```python
    async def stream_start(
        self,
        audio_config: Optional[AudioConfig] = None
    ) -> None:
        """开始流式识别会话"""
        if self._is_started:
            logger.warning("流式识别已在进行中")
            return

        await self.reset()
        success = await self._start_session()
        if not success:
            raise RuntimeError("启动流式识别会话失败")

    async def stream_feed(self, audio_data: bytes) -> None:
        """输入音频数据（流式）"""
        if not self._is_started:
            raise RuntimeError("流式识别未启动，请先调用 stream_start()")

        # 发送速率限制
        current_time = time.time()
        if self._last_send_time > 0:
            elapsed = current_time - self._last_send_time
            if elapsed < self._min_send_interval:
                await asyncio.sleep(self._min_send_interval - elapsed)
        self._last_send_time = time.time()

        def _send_audio():
            try:
                self._transcriber.send_audio(audio_data)
            except Exception as e:
                logger.error(f"发送音频失败: {e}")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_audio)

    async def stream_stop(self) -> ASRResult:
        """停止流式识别，返回最终结果"""
        if not self._is_started:
            return ASRResult(
                text="",
                confidence=0.0,
                is_final=True,
                timestamp=None,
                language=self.language
            )

        # 等待结果
        self._result_event.wait(timeout=30)

        # 获取结果 - 优先使用正确结果，忽略后续错误
        result_text = ""
        has_valid_result = False

        while not self._result_queue.empty():
            try:
                result = self._result_queue.get_nowait()
                if result.get("status") == "error":
                    # 如果已经有有效结果，忽略错误
                    if has_valid_result:
                        logger.warning(f"忽略后续错误: {result.get('error')}")
                        continue
                    error_msg = result.get("error", "Unknown error")
                    logger.error(f"识别出错: {error_msg}")
                else:
                    result_text = result.get("text", "")
                    if result_text:
                        has_valid_result = True
            except Exception:
                break

        # 清理
        await self.stop()

        if has_valid_result:
            return ASRResult(
                text=result_text,
                confidence=0.9,
                is_final=True,
                timestamp=None,
                language=self.language
            )

        # 没有有效结果，返回空
        return ASRResult(
            text="",
            confidence=0.0,
            is_final=True,
            timestamp=None,
            language=self.language
        )
```

### 实现 reset 和 cleanup 方法

```python
    async def reset(self):
        """重置ASR状态"""
        if self._is_started:
            await self.stop()

        self._current_text = ""
        self._is_started = False
        self._start_success = False
        self._result_event.clear()
        self._session_ready_event.clear()
        self._last_connect_failure_time = 0
        self._connect_retry_delay = 2.0
        self._last_send_time = 0
        self._session_thread = None

        while not self._result_queue.empty():
            try:
                self._result_queue.get_nowait()
            except Exception:
                break

        logger.debug("阿里云ASR状态已重置")

    async def cleanup(self):
        """清理资源"""
        logger.info("清理阿里云ASR资源...")

        await self.stop()

        if self._transcriber:
            def _shutdown():
                try:
                    self._transcriber.shutdown()
                    logger.info("阿里云ASR识别器已关闭")
                except Exception as e:
                    logger.error(f"关闭识别器失败: {e}")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _shutdown)
            self._transcriber = None

        self._session_thread = None
        self._is_initialized = False
        logger.info("阿里云ASR资源清理完成")
```

---

## 步骤 2: 使用 @register_provider 装饰器注册插件

在类定义上方添加装饰器：

```python
@register_provider("aliyun", {
    "appkey": str,
    "ak_id": str,
    "ak_secret": str,
    "token": str,  # 可选，与 ak_id/ak_secret 二选一
    "url": str,
    "language": str,
    "enable_intermediate_result": bool,
    "enable_punctuation_prediction": bool,
    "enable_inverse_text_normalization": bool,
})
class AliyunASR(ASRProvider):
    ...
```

**装饰器参数说明**：
- 第一个参数 `"aliyun"`：Provider 的唯一标识符（小写）
- 第二个参数（字典）：配置字段 schema，定义该 Provider 支持的配置字段及其类型

**schema 的作用**：
- 自动验证配置文件中的字段类型
- 在工厂创建实例时自动过滤无关字段
- 支持配置自发现

---

## 步骤 3: 更新 providers/__init__.py 导出

编辑 `src/modules/asr/providers/__init__.py`：

```python
"""ASR Providers"""
from .aliyun import AliyunASR

__all__ = ["AliyunASR"]
```

**作用**：确保 Provider 类被导入，从而触发 `@register_provider` 装饰器执行。

---

## 步骤 4: 在 config.py 中添加配置验证规则

编辑 `src/modules/asr/config.py`，在 `validate()` 方法中添加：

```python
def validate(self) -> Tuple[bool, str]:
    """验证配置是否有效

    Returns:
        (is_valid, error_message): 是否有效, 错误信息
    """
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

## 步骤 5: 创建配置文件 config/asr.json

在项目根目录的 `config/` 文件夹下创建 `asr.json`：

```json
{
    "provider": "aliyun",
    "common": {
        "sample_rate": 16000,
        "channels": 1
    },
    "aliyun": {
        "appkey": "your-appkey-here",
        "ak_id": "your-access-key-id-here",
        "ak_secret": "your-access-key-secret-here",
        "url": "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1",
        "language": "zh-CN",
        "enable_intermediate_result": true,
        "enable_punctuation_prediction": true,
        "enable_inverse_text_normalization": true
    }
}
```

**配置文件结构说明**：

| 字段 | 说明 |
|------|------|
| `provider` | 要使用的 Provider 名称（对应 `@register_provider` 的第一个参数） |
| `common` | 通用配置，适用于所有 Provider |
| `aliyun` | Provider 特定配置（字段名与 Provider 的 schema 匹配） |

---

## 步骤 6: 测试使用

### 方式 1: 使用 Manager 单例

```python
import asyncio
from src.modules.asr import ASR

async def main():
    # 初始化
    await ASR.initialize(config_path="config/asr.json")

    # 非流式识别
    with open("audio.pcm", "rb") as f:
        audio_data = f.read()

    result = await ASR.provider.recognize(audio_data)
    print(f"识别结果: {result.text}")

    # 清理
    await ASR.cleanup()

asyncio.run(main())
```

### 方式 2: 使用 Factory

```python
from src.modules.asr import ASRFactory

async def main():
    # 创建 Provider
    provider = ASRFactory.create_from_file("config/asr.json")
    await provider.initialize()

    # 使用
    result = await provider.recognize(audio_data)
    print(result.text)

    # 清理
    await provider.cleanup()

asyncio.run(main())
```

### 方式 3: 流式识别

```python
from src.modules.asr import ASRFactory

async def main():
    provider = ASRFactory.create_from_file("config/asr.json")
    await provider.initialize()

    # 流式识别
    await provider.stream_start()

    # 分块发送音频
    for chunk in audio_chunks:
        await provider.stream_feed(chunk)
        await asyncio.sleep(0.01)  # 模拟实时音频流

    # 获取结果
    result = await provider.stream_stop()
    print(f"识别结果: {result.text}")

    await provider.cleanup()

asyncio.run(main())
```

### 验证插件注册

```python
from src.modules.asr import list_providers, get_config_schema

# 列出所有已注册的 Provider
print("可用 Provider:", list_providers())
# 输出: ['aliyun', 'huoshan']

# 查看 Aliyun 的配置 schema
schema = get_config_schema("aliyun")
print("Aliyun schema:", schema)
# 输出: {'appkey': <class 'str'>, 'ak_id': <class 'str'>, ...}
```

---

## 完整的 Aliyun ASR 实现文件

参考：[src/modules/asr/providers/aliyun.py](src/modules/asr/providers/aliyun.py)

---

## 开发新 Provider 的快速清单

开发新的 Provider（例如火山引擎）时，按此清单操作：

- [ ] 创建 `src/modules/asr/providers/huoshan.py`
- [ ] 定义 HuoshanASR 类，继承 ASRProvider
- [ ] 添加 `@register_provider("huoshan", {...})` 装饰器
- [ ] 实现 `__init__`、`initialize`、`recognize`、`stream_start`、`stream_feed`、`stream_stop`、`reset`、`cleanup` 方法
- [ ] 在 `providers/__init__.py` 中添加 `from .huoshan import HuoshanASR`
- [ ] 在 `config.py` 的 `validate()` 中添加 `"huoshan": ["app_key", "access_key"]`
- [ ] 创建 `config/asr.json`，添加 `"huoshan"` 配置节
- [ ] 测试验证

---

## 注意事项

1. **异步设计**：所有方法必须是 `async` 的
2. **线程安全**：如果使用回调（如阿里云 SDK），注意线程同步，使用 `queue.Queue` 和 `threading.Event`
3. **错误处理**：捕获并记录网络错误和 API 错误
4. **流式支持**：需实现 `stream_start`、`stream_feed`、`stream_stop` 三个方法
5. **配置验证**：必填字段必须在 `config.py` 中声明
6. **资源清理**：在 `cleanup()` 中释放连接、关闭客户端等
7. **音频格式**：确保采样率、声道数等参数正确
