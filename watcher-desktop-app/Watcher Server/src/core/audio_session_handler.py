"""音频会话处理器 - 处理单个客户端的音频会话流程"""
import asyncio
import math
import struct
from typing import TYPE_CHECKING, Optional, Set
import websockets

from src.core.session_media import SessionMediaAsset, SessionMediaStore, normalize_media_frame
from src.core.runtime_services import RuntimeServices
from src.models.protocol import BinaryFrame, ClientRole, TextMessageType
from src.modules.openclaw.base import ChatMediaKind
from src.utils.logger import get_logger
from src.utils.message_handler import MessageHandler
from src.modules.asr.base import ASRProvider
from src.modules.tts.base import TTSProvider

if TYPE_CHECKING:
    from src.core.websocket_server import WebSocketServer

logger = get_logger(__name__)

# 常量
AUDIO_SESSION_TIMEOUT = 2.0  # 2秒无结束符自动超时
AUDIO_ACTIVITY_RMS_THRESHOLD = 300.0
AUDIO_ACTIVITY_PEAK_THRESHOLD = 1500


class AudioSessionHandler:
    """音频会话处理器 - 处理单个客户端的完整音频会话流程"""

    def __init__(
        self,
        websocket: websockets.WebSocketServerProtocol,
        server: "WebSocketServer",
        runtime_services: RuntimeServices,
        connected_clients: Set[websockets.WebSocketServerProtocol],
    ):
        self.ws = websocket
        self.server = server
        self.msg_handler = MessageHandler(websocket)
        self.runtime = runtime_services
        self.connected_clients = connected_clients

        # ASR 流式识别状态
        self._asr_stream_started = False
        self._timeout_task: Optional[asyncio.Task] = None
        self._session_asr: Optional[ASRProvider] = None
        self._session_tts: Optional[TTSProvider] = None
        self._media_store = SessionMediaStore()
        self._ai_session_key = f"watcher-client:{id(websocket)}"
        self._is_busy = False
        self._busy_stage = "idle"
        self._audio_frame_count = 0
        self._audio_total_bytes = 0
        self._audio_max_rms = 0.0
        self._audio_max_peak = 0
        self._audio_active_frames = 0

    @property
    def is_busy(self) -> bool:
        """当前连接是否正处于音频会话处理中。"""
        return self._is_busy

    @property
    def busy_stage(self) -> str:
        """当前音频会话忙碌阶段。"""
        return self._busy_stage

    def _mark_busy(self, stage: str) -> None:
        """标记当前连接正处于语音链路忙碌状态。"""
        self._is_busy = True
        self._busy_stage = stage

    def _mark_idle(self) -> None:
        """清除语音链路忙碌状态。"""
        self._is_busy = False
        self._busy_stage = "idle"

    @staticmethod
    def _summarize_pcm16(audio_data: bytes) -> tuple[float, int]:
        if not audio_data or len(audio_data) < 2:
            return 0.0, 0

        usable = audio_data[: len(audio_data) - (len(audio_data) % 2)]
        if not usable:
            return 0.0, 0

        samples = [sample[0] for sample in struct.iter_unpack("<h", usable)]
        if not samples:
            return 0.0, 0

        peak = max(abs(sample) for sample in samples)
        rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
        return rms, peak

    def _record_audio_diagnostics(self, audio_data: bytes) -> None:
        rms, peak = self._summarize_pcm16(audio_data)
        self._audio_frame_count += 1
        self._audio_total_bytes += len(audio_data)
        self._audio_max_rms = max(self._audio_max_rms, rms)
        self._audio_max_peak = max(self._audio_max_peak, peak)
        if rms >= AUDIO_ACTIVITY_RMS_THRESHOLD or peak >= AUDIO_ACTIVITY_PEAK_THRESHOLD:
            self._audio_active_frames += 1

        if self._audio_frame_count <= 3:
            logger.info(
                "音频帧摘要: client_id={}, frame_index={}, bytes={}, rms={:.1f}, peak={}",
                id(self.ws),
                self._audio_frame_count,
                len(audio_data),
                rms,
                peak,
            )

    def _log_audio_session_summary(self, recognized_text: str) -> None:
        logger.info(
            "音频会话摘要: client_id={}, frames={}, bytes={}, max_rms={:.1f}, max_peak={}, active_frames={}, recognized={}",
            id(self.ws),
            self._audio_frame_count,
            self._audio_total_bytes,
            self._audio_max_rms,
            self._audio_max_peak,
            self._audio_active_frames,
            bool(recognized_text),
        )

        if not recognized_text:
            logger.warning(
                "空识别结果诊断: client_id={}, frames={}, bytes={}, max_rms={:.1f}, max_peak={}, active_frames={}",
                id(self.ws),
                self._audio_frame_count,
                self._audio_total_bytes,
                self._audio_max_rms,
                self._audio_max_peak,
                self._audio_active_frames,
            )

    def _reset_audio_diagnostics(self) -> None:
        self._audio_frame_count = 0
        self._audio_total_bytes = 0
        self._audio_max_rms = 0.0
        self._audio_max_peak = 0
        self._audio_active_frames = 0

    async def feed_audio(self, audio_data: bytes):
        """处理音频数据"""
        try:
            self._mark_busy("asr.initialize" if self._session_asr is None else "asr.streaming")
            await self.ensure_asr_ready()
            self._mark_busy("asr.streaming")
            self._record_audio_diagnostics(audio_data)

            # 首次收到音频时启动流式识别
            if not self._asr_stream_started:
                await self._session_asr.stream_start()
                self._asr_stream_started = True
            # 每次收到音频帧都刷新超时定时器，避免长音频流被误判结束。
            self._start_timeout_timer()

            await self._session_asr.stream_feed(audio_data)
        except Exception as exc:
            logger.opt(exception=True).error("ASR处理音频失败: {}", exc)
            await self._notify_desktop_server_error(
                f"ASR processing failed - {exc}",
                stage="asr.feed",
                detail={"provider": type(self._session_asr).__name__ if self._session_asr else ""},
            )

    async def end_session(self):
        """结束会话 - 处理识别结果、调用AI、TTS合成"""
        # 取消超时定时器
        self._cancel_timeout_timer()
        self._mark_busy("asr.stop")

        logger.info("=" * 60)
        logger.info("开始处理会话结束")
        logger.info("=" * 60)
        try:
            # 1. 停止 ASR 获取结果
            try:
                logger.info("正在停止 ASR...")
                if self._session_asr is None:
                    logger.warning("结束会话时未持有 ASR provider，跳过处理")
                    return

                result = await self._session_asr.stream_stop()
                recognized_text = result.text
                logger.info("识别结果已获取: {}", recognized_text)
                self._log_audio_session_summary(recognized_text)
            except Exception as exc:
                logger.opt(exception=True).error("获取识别结果失败: {}", exc)
                await self._notify_desktop_server_error(
                    f"Recognition failed - {exc}",
                    stage="asr.stop",
                    detail={"provider": type(self._session_asr).__name__ if self._session_asr else ""},
                )
                return

            # 发送识别结果
            logger.info("发送识别结果: {}", recognized_text)
            await self.msg_handler.send_asr_result(recognized_text)

            # 2. 调用 AI 对话
            bot_reply = None
            ai_attempted = False
            if recognized_text:
                logger.info("开始调用 AI 对话...")
                ai_attempted = True
                bot_reply = await self._call_ai(recognized_text)

            # 3. TTS 语音合成
            text_to_speak = bot_reply or (recognized_text if not ai_attempted else None)
            if text_to_speak:
                logger.info("开始 TTS 语音合成...")
                await self._synthesize_and_play(text_to_speak)

            # 4. 重置 ASR 准备下一次
            try:
                logger.info("重置 ASR 状态...")
                await self._session_asr.reset()
                self._asr_stream_started = False
            except Exception as exc:
                logger.error("重置ASR失败: {}", exc)
        finally:
            self._session_asr = None
            self._session_tts = None
            self._mark_idle()
            self._asr_stream_started = False
            self._reset_audio_diagnostics()

        logger.info("会话处理完成")

    def ingest_media_frame(self, frame: BinaryFrame) -> Optional[SessionMediaAsset]:
        """接收并重组图片/视频流，为后续 AI 问答缓存最近媒体。"""
        return self._media_store.append_frame(frame)

    def normalize_media_frame(self, frame: BinaryFrame) -> BinaryFrame:
        """对媒体帧做协议兼容归一化。"""
        return normalize_media_frame(frame)

    def _start_timeout_timer(self):
        """启动超时定时器 - 2秒无结束符自动触发会话处理"""
        self._cancel_timeout_timer()
        self._timeout_task = asyncio.create_task(self._timeout_handler())

    def _cancel_timeout_timer(self):
        """取消超时定时器"""
        if self._timeout_task and not self._timeout_task.done():
            self._timeout_task.cancel()
            try:
                # Don't await here, just discard the task
                pass
            except asyncio.CancelledError:
                pass
        self._timeout_task = None

    async def _timeout_handler(self):
        """超时处理 - 2秒后自动结束会话"""
        try:
            await asyncio.sleep(AUDIO_SESSION_TIMEOUT)
            logger.warning(f"音频会话超时（{AUDIO_SESSION_TIMEOUT}s），自动结束会话")
            await self.end_session()
        except asyncio.CancelledError:
            # 正常取消，不记录错误
            pass
        except Exception as exc:
            logger.opt(exception=True).error("超时处理失败: {}", exc)

    async def _call_ai(self, text: str) -> Optional[str]:
        """调用 AI 对话服务"""
        try:
            self._mark_busy("ai.chat")
            logger.info("调用 AI 对话...")

            supported_media_kinds = self.runtime.get_supported_dialogue_media_kinds()
            context_media = self._media_store.get_recent_media(supported_media_kinds)
            related_image_name = next(
                (
                    media.filename
                    for media in context_media
                    if media.kind is ChatMediaKind.IMAGE and media.filename
                ),
                None,
            )
            if context_media:
                logger.info(
                    "本轮 AI 将附带最近媒体: kinds={}",
                    [media.kind.value for media in context_media],
                )

            # 状态回调
            async def on_status_change(status: str, data: dict):
                await self.server.ai_status_controller.send_to_handler(
                    self.msg_handler,
                    status,
                    message=data.get("message", ""),
                    image_name=data.get("image_name") or related_image_name,
                    action_file=data.get("action_file"),
                    sound_file=data.get("sound_file"),
                    detail=data,
                )

            # 日志回调
            async def on_log(content: str, log_type: str):
                await self.msg_handler.send_ai_thinking(
                    content,
                    kind=log_type,
                )

            # 调用对话
            logger.info("开始等待 AI 回复...")
            bot_reply = await self.runtime.chat(
                text,
                on_status_change=on_status_change,
                on_log=on_log,
                media=context_media,
                session_user=self._ai_session_key,
            )

            if context_media:
                self._media_store.discard_kinds({media.kind for media in context_media})
            await self.msg_handler.send_ai_reply(bot_reply)
            logger.debug("AI 回复: {}", bot_reply)
            logger.info("AI 回复: {}...", bot_reply[:50])
            return bot_reply

        except Exception as exc:
            logger.opt(exception=True).error("AI 对话失败: {}", exc)
            await self._notify_desktop_server_error(
                f"AI chat failed - {exc}",
                stage="ai.chat",
                detail={"dialogue_provider": self.runtime.dialogue.current_mode},
            )
            return None

    async def _synthesize_and_play(self, text: str):
        """TTS 语音合成并播放"""
        self._mark_busy("tts.synthesize")
        clean_text = self.msg_handler.clean_text_for_tts(text)
        logger.debug("TTS 原始文本: {}", text)
        logger.debug("TTS 清理后文本: {}", clean_text)
        logger.info("TTS 文本: {}...", clean_text[:50])

        try:
            if self._session_tts is None:
                self._session_tts = await self.runtime.ensure_tts_provider()

            async for tts_result in self._session_tts.synthesize_stream(clean_text):
                if not tts_result.audio_data:
                    continue

                await self.msg_handler.send_audio_frame(
                    tts_result.audio_data,
                    is_first=tts_result.is_first,
                    is_last=tts_result.is_last,
                )

            logger.info("TTS 播放完成")

        except Exception as exc:
            logger.opt(exception=True).error("TTS 合成失败: {}", exc)
            await self._notify_desktop_server_error(
                f"TTS failed - {exc}",
                stage="tts.synthesize",
                detail={"provider": type(self._session_tts).__name__ if self._session_tts else ""},
            )

    async def ensure_asr_ready(self):
        """确保 ASR 已就绪"""
        if self._session_asr is None:
            try:
                self._session_asr = await self.runtime.ensure_asr_provider()
            except Exception as exc:
                await self._notify_desktop_server_error(
                    f"ASR init failed - {exc}",
                    stage="asr.initialize",
                )
                raise

    async def _notify_desktop_server_error(
        self,
        error_msg: str,
        *,
        stage: str,
        detail: Optional[dict] = None,
    ) -> None:
        """将语音链路的服务端错误广播给桌面端。

        当前阶段硬件端不接收这类错误事件，统一由桌面端展示。
        """
        payload = {
            "message": error_msg,
            "stage": stage,
            "detail": {
                "source": "voice_session",
                "client_id": id(self.ws),
                "role": self.server.get_client_role(self.ws).value,
            },
        }
        if detail:
            payload["detail"].update(detail)

        forwarded = await self.server.broadcast_text_message(
            ClientRole.DESKTOP,
            TextMessageType.EVT_SERVER_ERROR.value,
            data=payload,
            code=MessageHandler.Code.ERROR,
        )

        logger.info(
            "语音链路错误已通知桌面端: stage={}, client_id={}, forwarded={}",
            stage,
            id(self.ws),
            forwarded,
        )
