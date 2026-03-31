"""协议路由注册。

这个文件只做一件事：把“协议消息类型”绑定到“具体 handler 函数”。

它本身不直接执行业务，不直接做消息转发，也不直接处理音频/视频/图片。
真正的处理逻辑在 `src/core/protocol_handlers/` 目录下：

- `system.py`：连接声明、ACK/NACK、ping/pong、session resume
- `control.py`：控制类消息
- `config.py`：配置类消息
- `event.py`：事件类消息
- `transfer.py`：传输会话类消息
- `binary.py`：二进制帧处理

可以把这个文件理解成“协议总路由表”：

1. `MessageDispatcher` 负责把收到的数据解析成文本消息或二进制帧
2. `protocol_router.py` 负责决定“这类消息应该交给哪个 handler”
3. 具体 handler 再决定：
   - 是本地处理
   - 转发到另一类客户端
   - 还是先占位，返回 not implemented
"""
from __future__ import annotations

from src.core.message_dispatcher import MessageDispatcher
from src.core.protocol_context import ProtocolHandlerContext
from src.core.protocol_handlers import binary, config, control, event, system, transfer
from src.models.protocol import BinaryFrameType, TextMessageType


def register_protocol_handlers(
    dispatcher: MessageDispatcher,
    context: ProtocolHandlerContext,
) -> None:
    """注册当前协议支持的全部消息处理器。

    当前消息大体分为三类：

    1. 本地处理消息
       例如 `sys.client.hello`、`sys.ping`、上行音频帧。
       这类消息主要在服务端本连接内完成处理。

    2. 转发类消息
       例如：
       - `ctrl.servo.angle`：桌面端 -> 服务端 -> 硬件端
       - `evt.servo.position`：硬件端 -> 服务端 -> 桌面端
       - `evt.device.error` / `evt.device.firmware` / `evt.ota.progress`
       - 二进制 `video` / `image`：硬件端 -> 服务端 -> 桌面端

    3. 预留骨架消息
       已经接入协议路由，但 handler 当前只返回拒绝或未实现，
       后续可以直接在对应 handler 文件里补业务逻辑，而不用再改总路由。
    """

    # 系统治理类：
    # 这组主要是连接生命周期管理，本地处理为主。
    # - `sys.client.hello` 会锁定当前连接角色，并保存硬件固件版本等元数据
    # - `sys.ping` / `sys.pong` 处理连接保活
    # - `sys.ack` / `sys.nack` 目前主要用于记录和观察
    dispatcher.register_text_handler(
        TextMessageType.SYS_CLIENT_HELLO,
        lambda message: system.handle_client_hello(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.SYS_ACK,
        lambda message: system.handle_ack(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.SYS_NACK,
        lambda message: system.handle_nack(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.SYS_PING,
        lambda message: system.handle_ping(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.SYS_PONG,
        lambda message: system.handle_pong(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.SYS_SESSION_RESUME,
        lambda message: system.handle_session_resume(context, message),
    )

    # 控制类：
    # 当前真正接通转发的是 `ctrl.servo.angle`
    # 路径为：desktop -> server -> hardware
    #
    # camera 相关控制消息已经接到协议入口，但当前策略是：
    # “客户端不能主动发这类服务端下行命令”，因此会被明确拒绝。
    dispatcher.register_text_handler(
        TextMessageType.CTRL_SERVO_ANGLE,
        lambda message: control.handle_servo_angle(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CTRL_CAMERA_VIDEO_CONFIG,
        lambda message: control.handle_camera_video_config(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CTRL_CAMERA_CAPTURE_IMAGE,
        lambda message: control.handle_camera_capture_image(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CTRL_CAMERA_START_VIDEO,
        lambda message: control.handle_camera_start_video(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CTRL_CAMERA_STOP_VIDEO,
        lambda message: control.handle_camera_stop_video(context, message),
    )

    # 配置类：
    # 这组现在已经真正接入“服务端 JSON 配置 + 运行时热更新”。
    # 桌面端可以通过 cfg.*.get / report / update 读取和修改：
    # - ASR
    # - TTS
    # - LLM
    # - Dialogue(openclaw / llm)
    # - Scheduler(定时任务模块运行时启停 / 任务开关)
    dispatcher.register_text_handler(
        TextMessageType.CFG_ASR_GET,
        lambda message: config.handle_cfg_asr_get(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_ASR_REPORT,
        lambda message: config.handle_cfg_asr_report(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_ASR_UPDATE,
        lambda message: config.handle_cfg_asr_update(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_TTS_GET,
        lambda message: config.handle_cfg_tts_get(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_TTS_REPORT,
        lambda message: config.handle_cfg_tts_report(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_TTS_UPDATE,
        lambda message: config.handle_cfg_tts_update(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_LLM_GET,
        lambda message: config.handle_cfg_llm_get(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_LLM_REPORT,
        lambda message: config.handle_cfg_llm_report(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_LLM_UPDATE,
        lambda message: config.handle_cfg_llm_update(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_DIALOGUE_GET,
        lambda message: config.handle_cfg_dialogue_get(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_DIALOGUE_REPORT,
        lambda message: config.handle_cfg_dialogue_report(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_DIALOGUE_UPDATE,
        lambda message: config.handle_cfg_dialogue_update(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_SCHEDULER_GET,
        lambda message: config.handle_cfg_scheduler_get(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_SCHEDULER_REPORT,
        lambda message: config.handle_cfg_scheduler_report(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.CFG_SCHEDULER_UPDATE,
        lambda message: config.handle_cfg_scheduler_update(context, message),
    )

    # 事件类：
    # 这里最容易出现“服务端只做转发”的场景。
    #
    # 当前已接通的转发关系：
    # - `evt.camera.state`：hardware -> desktop
    # - `evt.servo.position`：hardware -> desktop
    # - `evt.ota.progress`：hardware -> desktop
    # - `evt.device.error`：hardware -> desktop
    # - `evt.device.firmware`：hardware -> desktop
    #
    # 下面几类事件大多是“服务端自己产出”的，不允许客户端伪造上行。
    # 其中 `evt.ai.status` 是一个特例：桌面端作为上位机时，允许上行给服务端，
    # 再由服务端校验后转发到硬件端，用于状态同步和联调。
    # - `evt.asr.result`
    # - `evt.ai.thinking`
    # - `evt.ai.reply`
    # - `evt.server.error`
    dispatcher.register_text_handler(
        TextMessageType.EVT_ASR_RESULT,
        lambda message: event.handle_evt_asr_result(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_AI_STATUS,
        lambda message: event.handle_evt_ai_status(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_AI_THINKING,
        lambda message: event.handle_evt_ai_thinking(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_AI_REPLY,
        lambda message: event.handle_evt_ai_reply(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_SERVER_ERROR,
        lambda message: event.handle_evt_server_error(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_DEVICE_STATUS,
        lambda message: event.handle_evt_device_status(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_CAMERA_STATE,
        lambda message: event.handle_evt_camera_state(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_SERVO_POSITION,
        lambda message: event.handle_evt_servo_position(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_OTA_PROGRESS,
        lambda message: event.handle_evt_ota_progress(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_DEVICE_ERROR,
        lambda message: event.handle_evt_device_error(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.EVT_DEVICE_FIRMWARE,
        lambda message: event.handle_evt_device_firmware(context, message),
    )

    # 传输会话类：
    # 当前 `xfer.ota.handshake` 允许硬件端上报，并可转发给桌面端观察。
    # `xfer.ota.checksum` 暂按“服务端下行消息”处理，客户端上行会被拒绝。
    dispatcher.register_text_handler(
        TextMessageType.XFER_OTA_HANDSHAKE,
        lambda message: transfer.handle_xfer_ota_handshake(context, message),
    )
    dispatcher.register_text_handler(
        TextMessageType.XFER_OTA_CHECKSUM,
        lambda message: transfer.handle_xfer_ota_checksum(context, message),
    )

    # 二进制帧：
    # 当前行为如下：
    # - `audio`：hardware -> server，本地进入 ASR/AI/TTS 音频会话处理
    # - `video`：hardware -> desktop，服务端转发并缓存最近一帧标准化视频负载
    # - `image`：hardware -> desktop，服务端转发并缓存最近完整图片
    #            当 dialogue=openclaw 且实现支持视觉输入时，最近图片会作为下一轮问答上下文
    # - `ota`：当前客户端上行不允许，先拒绝
    dispatcher.register_binary_handler(
        BinaryFrameType.AUDIO,
        lambda frame: binary.handle_audio_frame(context, frame),
    )
    dispatcher.register_binary_handler(
        BinaryFrameType.VIDEO,
        lambda frame: binary.handle_video_frame(context, frame),
    )
    dispatcher.register_binary_handler(
        BinaryFrameType.IMAGE,
        lambda frame: binary.handle_image_frame(context, frame),
    )
    dispatcher.register_binary_handler(
        BinaryFrameType.OTA,
        lambda frame: binary.handle_ota_frame(context, frame),
    )
