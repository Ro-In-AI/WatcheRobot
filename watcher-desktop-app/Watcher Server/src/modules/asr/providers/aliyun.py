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

# 阿里云 SDK 用于获取 Token
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


def get_aliyun_token(ak_id: str, ak_secret: str) -> Optional[tuple[str, int]]:
    """使用阿里云SDK获取Token

    Args:
        ak_id: AccessKeyId
        ak_secret: AccessKeySecret

    Returns:
        (token, expire_time) 或 None
    """
    if not ALIYUN_SDK_AVAILABLE:
        logger.error("阿里云SDK未安装，请运行: pip install aliyun-python-sdk-core")
        return None

    try:
        client = AcsClient(ak_id, ak_secret, "cn-shanghai")

        request = CommonRequest()
        request.set_method('POST')
        request.set_domain('nls-meta.cn-shanghai.aliyuncs.com')
        request.set_version('2019-02-28')
        request.set_action_name('CreateToken')

        response = client.do_action_with_exception(request)
        result = json.loads(response)

        if 'Token' in result and 'Id' in result['Token']:
            token = result['Token']['Id']
            expire_time = result['Token']['ExpireTime']
            logger.info(f"成功获取阿里云Token，过期时间: {expire_time}")
            return (token, expire_time)
        else:
            logger.error(f"获取Token失败，响应: {result}")
            return None

    except Exception as e:
        logger.error(f"获取阿里云Token异常: {e}")
        return None


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
        # 新增：AK/SK 方式获取 Token
        ak_id: str = "",
        ak_secret: str = "",
    ):
        super().__init__()

        if not NLS_AVAILABLE:
            raise ImportError(
                "阿里云SDK未安装，请运行: pip install alibabacloud-nls-python-sdk"
            )

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
        self._token = token  # 内部 token 存储
        self._token_expire_time = 0  # Token 过期时间戳
        self._token_refresh_buffer = 300  # 提前 5 分钟刷新 Token

        # 如果提供了 AK/SK，优先使用
        if ak_id and ak_secret:
            self._refresh_token()
        elif token:
            # 兼容旧的直接传入 token 方式
            self._token = token
            self._token_expire_time = 0  # 不知道过期时间，不自动刷新

        # 识别器实例
        self._transcriber: Optional[nls.NlsSpeechTranscriber] = None

        # 后台线程（持续运行 transcriber.start()）
        self._session_thread: Optional[threading.Thread] = None

        # 结果队列和事件
        self._result_queue: Queue = Queue()
        self._result_event: threading.Event = threading.Event()
        self._current_text: str = ""
        self._current_sentence_text: str = ""
        self._is_started: bool = False

        # 启动会话事件：等待 SDK 内部 __start_flag 设置完成后才 set
        self._session_ready_event: threading.Event = threading.Event()
        self._start_success: bool = False

        # 连接失败重试控制
        self._last_connect_failure_time: float = 0
        self._connect_retry_delay: float = 2.0

        # 回调参数
        self._callback_args: list = []

        # 日志输出
        auth_mode = "AK/SK" if (ak_id and ak_secret) else "Token"
        logger.info(
            f"阿里云ASR初始化: appkey={appkey[:8]}..., "
            f"sample_rate={sample_rate}, channels={channels}, language={language}, "
            f"auth={auth_mode}"
        )
        logger.info("提示: 语言模型需要在阿里云控制台的AppKey项目中配置")

    def _refresh_token(self) -> bool:
        """刷新 Token（使用 AK/SK）"""
        if not self.ak_id or not self.ak_secret:
            logger.warning("未配置 AK/SK，无法刷新 Token")
            return False

        result = get_aliyun_token(self.ak_id, self.ak_secret)
        if result:
            self._token, self._token_expire_time = result
            logger.info(f"Token 刷新成功，过期时间: {self._token_expire_time}")
            return True
        else:
            logger.error("Token 刷新失败")
            return False

    def _get_valid_token(self) -> Optional[str]:
        """获取有效的 Token（如果需要则自动刷新）"""
        current_time = time.time()

        if not self._token:
            if not self._refresh_token():
                return None
        elif self._token_expire_time > 0:
            if current_time > (self._token_expire_time - self._token_refresh_buffer):
                logger.info("Token 即将过期，尝试刷新...")
                if not self._refresh_token():
                    pass

        return self._token

    async def initialize(self):
        """初始化ASR引擎"""
        if self._is_initialized:
            logger.warning("阿里云ASR已经初始化")
            return

        logger.info("初始化阿里云ASR引擎...")
        self._is_initialized = True
        logger.info("阿里云ASR引擎初始化完成")

    def _create_transcriber(self):
        """创建语音识别器实例"""
        token = self._get_valid_token()
        if not token:
            raise RuntimeError("无法获取有效的阿里云 Token")

        return nls.NlsSpeechTranscriber(
            url=self.url,
            token=token,
            appkey=self.appkey,
            on_start=self._on_start,
            on_sentence_begin=self._on_sentence_begin,
            on_sentence_end=self._on_sentence_end,
            on_result_changed=self._on_result_changed,
            on_completed=self._on_completed,
            on_error=self._on_error,
            on_close=self._on_close,
            callback_args=self._callback_args,
        )

    def _on_start(self, message: str, *args):
        """识别开始回调"""
        try:
            data = json.loads(message) if isinstance(message, str) else message
            logger.info(f"阿里云ASR识别会话开始: {data.get('name', 'unknown')}")
        except Exception:
            logger.info("阿里云ASR识别会话开始")

        self._is_started = True
        self._start_success = True
        self._last_connect_failure_time = 0

        time.sleep(0.05)
        self._session_ready_event.set()

    def _on_sentence_begin(self, message: str, *args):
        logger.debug(f"ASR on_sentence_begin: {message}")
        self._current_sentence_text = ""

    def _on_sentence_end(self, message: str, *args):
        """句子结束回调 - 累积所有句子的识别结果"""
        logger.debug(f"ASR on_sentence_end: {message}")
        try:
            data = json.loads(message) if isinstance(message, str) else message
            payload = data.get("payload", {})
            result = payload.get("result", "")
            if result:
                if self._current_text:
                    self._current_text += result
                else:
                    self._current_text = result
                logger.debug(f"句子识别完成: {result}")

                # 每次句子结束都把结果放入队列（用于及时获取中间结果）
                self._result_queue.put({
                    "text": self._current_text,
                    "is_final": False,  # 标记为非最终结果
                    "status": "sentence_end"
                })
                self._result_event.set()
                self._current_sentence_text = ""
        except Exception as e:
            logger.warning(f"解析句子结束消息失败: {e}")

    def _on_result_changed(self, message: str, *args):
        """中间结果回调"""
        logger.debug(f"ASR on_result_changed: {message}")
        try:
            data = json.loads(message) if isinstance(message, str) else message
            payload = data.get("payload", {})
            result = payload.get("result", "")
            if result:
                self._current_sentence_text = result
        except Exception as e:
            logger.warning(f"解析中间结果消息失败: {e}")

    def _on_completed(self, message: str, *args):
        logger.debug(f"ASR on_completed: {message}")
        try:
            text = self._build_best_effort_text()

            self._result_queue.put({
                "text": text,
                "is_final": True,
                "status": "completed"
            })
            self._result_event.set()
            logger.debug(f"识别完成: {text}")

        except Exception as e:
            logger.error(f"解析完成结果失败: {e}", exc_info=True)

    def _on_error(self, message: str, *args):
        logger.error(f"ASR on_error: {message}")
        try:
            data = json.loads(message) if isinstance(message, str) else message
            error_msg = data.get("message", "Unknown error")
            status_text = data.get("status_text", "")

            if "TOO_MANY_REQUESTS" in status_text or "40000005" in str(data.get("status", "")):
                logger.warning("检测到QPS限制错误，增加重试延迟")
                self._connect_retry_delay = min(self._connect_retry_delay * 2, 30)

            fallback_text = self._build_best_effort_text()
            self._result_queue.put({
                "text": fallback_text,
                "is_final": True,
                "status": "error",
                "error": error_msg
            })
            self._result_event.set()

        except Exception as e:
            logger.error(f"解析错误消息失败: {e}")

        self._start_success = False
        self._is_started = False
        self._last_connect_failure_time = time.time()
        if not self._session_ready_event.is_set():
            self._session_ready_event.set()

    def _on_close(self, *args):
        logger.info(f"ASR on_close: args={args}")
        self._is_started = False

    def _build_best_effort_text(self) -> str:
        """拼出当前可用的最佳识别文本。"""
        if self._current_text and self._current_sentence_text:
            return f"{self._current_text}{self._current_sentence_text}"
        return self._current_text or self._current_sentence_text

    async def _start_session(self) -> bool:
        """在独立后台线程启动识别会话"""
        self._session_ready_event.clear()
        self._start_success = False
        self._is_started = False

        def _run():
            try:
                self._transcriber = self._create_transcriber()
                self._transcriber.start(
                    aformat="pcm",
                    sample_rate=self.sample_rate,
                    ch=self.channels,
                    enable_intermediate_result=self.enable_intermediate_result,
                    enable_punctuation_prediction=self.enable_punctuation_prediction,
                    enable_inverse_text_normalization=self.enable_inverse_text_normalization,
                    timeout=10,
                )
                logger.debug("阿里云ASR后台线程：start() 已返回，会话结束")
            except Exception as e:
                logger.error(f"阿里云ASR后台线程异常: {e}", exc_info=True)
                self._start_success = False
                self._is_started = False
                self._last_connect_failure_time = time.time()
                if not self._session_ready_event.is_set():
                    self._session_ready_event.set()

        self._session_thread = threading.Thread(target=_run, daemon=True, name="AliyunASR-Session")
        self._session_thread.start()

        loop = asyncio.get_event_loop()
        ready = await loop.run_in_executor(
            None,
            lambda: self._session_ready_event.wait(timeout=10)
        )

        if not ready:
            logger.error("等待阿里云ASR会话就绪超时（10s内未收到服务端确认）")
            self._start_success = False
            self._last_connect_failure_time = time.time()
            return False

        if self._start_success:
            logger.info("阿里云ASR会话启动成功，可以开始发送音频")
        else:
            logger.error("阿里云ASR会话启动失败（收到错误回调）")

        return self._start_success

    # ========== 抽象方法实现 ==========

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

        def _send_audio():
            try:
                # 上游已经按实时链路发送音频，这里不再做固定节流，避免服务端消费积压。
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

        fallback_text = self._build_best_effort_text()

        # 先显式停止会话，让阿里云尽快下发 completed / sentence_end。
        await self.stop()

        # stop 返回后再短暂等待结果事件，避免在最终回调到达前过早取空。
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: self._result_event.wait(timeout=2))

        # 获取结果 - 优先使用正确结果，忽略后续错误
        result_text = fallback_text
        has_valid_result = False

        while not self._result_queue.empty():
            try:
                result = self._result_queue.get_nowait()
                if result.get("status") == "error":
                    # 如果已经有有效结果，忽略错误
                    if has_valid_result:
                        logger.warning(f"忽略后续错误（已有有效结果）: {result.get('error')}")
                        continue
                    error_msg = result.get("error", "Unknown error")
                    logger.error(f"识别出错: {error_msg}")
                    error_text = result.get("text", "")
                    if error_text:
                        result_text = error_text
                        has_valid_result = True
                else:
                    result_text = result.get("text", "")
                    if result_text:
                        has_valid_result = True
            except Exception:
                break

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

    async def reset(self):
        """重置ASR状态"""
        if self._is_started:
            await self.stop()

        self._current_text = ""
        self._current_sentence_text = ""
        self._is_started = False
        self._start_success = False
        self._result_event.clear()
        self._session_ready_event.clear()
        self._last_connect_failure_time = 0
        self._connect_retry_delay = 2.0
        self._session_thread = None

        while not self._result_queue.empty():
            try:
                self._result_queue.get_nowait()
            except Exception:
                break

        logger.debug("阿里云ASR状态已重置")

    async def stop(self):
        """停止当前识别会话"""
        if not self._is_started or self._transcriber is None:
            return

        def _stop():
            try:
                result = self._transcriber.stop(timeout=10)
                logger.info(f"阿里云ASR会话停止: {result}")
                return result
            except Exception as e:
                logger.error(f"停止阿里云ASR会话异常: {e}", exc_info=True)
                return False

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _stop)

        self._is_started = False

        if self._session_thread and self._session_thread.is_alive():
            await loop.run_in_executor(None, lambda: self._session_thread.join(timeout=5))

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
