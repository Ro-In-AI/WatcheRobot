# 阿里云 ASR 当前实现说明

> 最后更新: 2026-03-18
> 对应实现: `src/modules/asr/providers/aliyun.py`

## 1. 文档用途

这份文档不是阿里云官方接入指南，而是当前项目里 `AliyunASR` 的实现说明。

后续 AI 或开发者如果要排查 ASR 链路、修改音频分片策略、调整会话收尾逻辑，优先看这份文档和对应源码。

---

## 2. 代码位置

核心文件：

- `src/modules/asr/providers/aliyun.py`
- `src/modules/asr/base.py`
- `src/modules/asr/factory.py`
- `src/core/audio_session_handler.py`

当前调用链：

```text
binary.audio
  -> src/core/protocol_handlers/binary.py
  -> AudioSessionHandler.feed_audio()
  -> AliyunASR.stream_start()
  -> AliyunASR.stream_feed()
  -> AudioSessionHandler.end_session()
  -> AliyunASR.stream_stop()
```

---

## 3. 当前公开使用方式

当前项目不是按旧的 `process_audio()` 单次接口使用 ASR，而是按流式会话使用：

1. `initialize()`
2. `stream_start()`
3. `stream_feed(audio_bytes)` 持续送音频
4. `stream_stop()` 获取最终结果
5. `reset()` 为下一次会话做准备

`AudioSessionHandler` 已经封装了这条流程，通常不需要在业务代码里直接编排这些步骤。

---

## 4. 当前输入要求

上行音频协议要求：

- `PCM`
- `16kHz`
- `16bit`
- `mono`
- `LE`

当前测试页会按固定二进制帧头上传音频，服务端在协议层拆出 payload 后，直接把纯 PCM 交给 `AliyunASR.stream_feed()`。

---

## 5. 当前实现细节

### 5.1 认证方式

支持两种方式：

1. 推荐：`AK/SK` 自动换取 Token
2. 兼容：直接传入临时 `token`

如果同时提供 `ak_id / ak_secret`，优先使用 `AK/SK`。

### 5.2 后台线程模型

阿里云 SDK 的 transcriber 不是纯 asyncio 风格，所以当前实现使用后台线程承载 SDK 会话。

关键点：

- `start()` 在后台线程里运行
- Python 主协程负责：
  - 等待 `on_start`
  - 喂音频
  - 等待最终结果

### 5.3 结果累积策略

当前结果来源分 3 层：

1. `on_result_changed`
   - 保存当前句的 best-effort 文本
2. `on_sentence_end`
   - 把完整句子累积到 `_current_text`
3. `on_completed`
   - 尝试作为最终完成结果

如果最终 completed 没回来，代码会尽量保留中间识别文本，不再像旧实现那样容易丢成空串。

### 5.4 当前已修正的重要问题

#### 固定 150ms 节流已去掉

旧逻辑里，`stream_feed()` 之前有人为发送节流，配合 20ms 或 256ms 分片会造成严重积压。

当前实现已经移除这层固定节流，音频会按上游实际速度实时送到阿里云 SDK。

#### `stream_stop()` 顺序已修正

当前逻辑是：

1. 先向 SDK 明确发送 stop
2. 再等待最终回调或 fallback 结果

这比旧版“先等结果再 stop”更稳定，不容易出现 `request timeout after 23 seconds` 这种现象。

---

## 6. 当前项目内谁负责 ASR 会话结束

ASR 会话结束不是靠旧协议 `"over"` 了。

当前音频会话结束条件是：

- 上行二进制音频帧 `flags.bit1 = 1`
- 或者 `AudioSessionHandler` 的超时逻辑触发

因此如果要改“什么时候结束 ASR”，优先看：

- `src/core/protocol_handlers/binary.py`
- `src/core/audio_session_handler.py`

而不是先改 `AliyunASR` 本身。

---

## 7. 排查问题时先看哪里

### 识别速度慢

优先检查：

1. 客户端音频分片大小
2. 服务端是否又引入了额外节流
3. `stream_feed()` 是否被阻塞

### 最终结果为空

优先检查：

1. 是否收到了 `on_result_changed`
2. 是否收到了 `on_sentence_end`
3. `stream_stop()` 是否真正调用到了 SDK stop

### 会话结束很晚

优先检查：

1. 上行音频最后一帧是否正确打了 `LAST`
2. `binary.handle_audio_frame()` 是否进入 `end_session()`
3. `AudioSessionHandler` 超时是否被不断刷新

---

## 8. 当前配置入口

ASR provider 配置入口主要在：

- `src/modules/asr/config.py`
- `src/modules/asr/factory.py`
- `config/asr.json`
- `config/system.json`

常见配置项包括：

- `config/asr.json.providers.aliyun.basic.appkey`
- `config/asr.json.providers.aliyun.basic.ak_id`
- `config/asr.json.providers.aliyun.basic.ak_secret`
- `config/asr.json.providers.aliyun.basic.token`
- `config/asr.json.providers.aliyun.advanced.url`

当前推荐优先使用 `AK/SK`，不要把临时 token 当成长期方案。

---

## 9. 后续改动建议

如果后续业务要改 ASR，推荐按下面顺序判断改动位置：

1. 协议分片或结束规则变了：
   - 改 `docs/device_communication_protocol.md`
   - 改 `src/core/protocol_handlers/binary.py`
2. 会话编排变了：
   - 改 `src/core/audio_session_handler.py`
3. 阿里云 SDK 行为、认证、回调处理变了：
   - 改 `src/modules/asr/providers/aliyun.py`

一句话总结：

ASR provider 负责“怎么和阿里云说话”，
`AudioSessionHandler` 负责“什么时候开始/结束说话”。
