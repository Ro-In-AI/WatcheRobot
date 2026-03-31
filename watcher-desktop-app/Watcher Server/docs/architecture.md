# Architecture Overview

English | [简体中文](architecture.zh-CN.md)

Watcher Server is an asyncio-based runtime that sits between `hardware` and `desktop` clients.

## Top-Level Components

- [`src/main.py`](../src/main.py): boots the runtime, installs shutdown handlers, and starts all services
- [`src/core/websocket_server.py`](../src/core/websocket_server.py): WebSocket entry point, connection registry, role-based broadcasting
- [`src/core/runtime_services.py`](../src/core/runtime_services.py): config IO, provider lifecycle, dialogue switching
- [`src/core/audio_session_handler.py`](../src/core/audio_session_handler.py): voice session orchestration
- [`src/core/http_management_server.py`](../src/core/http_management_server.py): local HTTP management API
- [`src/core/scheduler/service.py`](../src/core/scheduler/service.py): scheduler host
- [`src/modules/discovery/discovery_server.py`](../src/modules/discovery/discovery_server.py): UDP LAN discovery

## Client Roles

Watcher Server currently expects two client roles:

- `hardware`
- `desktop`

Each WebSocket client should declare itself through `sys.client.hello`. Hardware clients should also include firmware metadata such as `fw_version`.

## Core Runtime Flow

```text
WatcherServer
  -> RuntimeServices.initialize()
  -> SchedulerService.start()
  -> HTTPManagementServer.start()
  -> WebSocketServer.start()
```

## Voice Pipeline

```text
hardware binary.audio
  -> MessageDispatcher
  -> protocol_handlers.binary.handle_audio_frame()
  -> AudioSessionHandler.feed_audio()
  -> RuntimeServices.ensure_asr_provider()
  -> ASR stream
  -> AudioSessionHandler.end_session()
  -> RuntimeServices.chat()
  -> evt.ai.status / evt.ai.thinking / evt.ai.reply
  -> RuntimeServices.ensure_tts_provider()
  -> TTS synthesize_stream()
  -> binary.audio back to hardware
```

The current server no longer applies a hard five-minute timeout to the OpenClaw dialogue path. It waits until the dialogue engine returns or raises an error.

## Image-Assisted OpenClaw Flow

If the hardware uploads a complete image before a voice question:

```text
hardware binary.image
  -> protocol_handlers.binary.handle_image_frame()
  -> SessionMediaStore
  -> RuntimeServices.chat()
  -> OpenClaw media bridge
  -> local OpenClaw image path
  -> OpenClaw response
```

The bridged image files are stored under the configured OpenClaw media root and are cleaned up after use.

## Role-Based Forwarding

Current forwarding paths include:

- `desktop -> hardware`
  - `ctrl.servo.angle`
  - validated AI status forwarding in some desktop-driven cases
- `hardware -> desktop`
  - `evt.device.status`
  - `evt.device.error`
  - `evt.device.firmware`
  - `evt.ota.progress`
  - `evt.servo.position`
  - `xfer.ota.handshake`
  - `binary.video`
  - `binary.image`

## Configuration and Hot Reloading

All main runtime configuration lives in `config/*.json`.

The config update path is:

```text
desktop cfg.*.update
  -> protocol_handlers.config
  -> RuntimeServices / SchedulerService
  -> JSON file persisted
  -> runtime instance replaced or updated
```

Some updates can be rejected while a hardware voice session is active, because replacing providers mid-session can break the current request.

## Scheduler and HTTP API

The scheduler currently hosts two built-in task families:

- `idle_ai_status_push`
- `scheduled_tts_push`

The HTTP management API wraps the single one-shot reminder task named `http_managed_scheduled_tts`.

The current reminder path is:

```text
HTTPManagementServer
  -> SchedulerService.upsert_http_managed_scheduled_tts_task()
  -> ScheduledTTSPushTask
  -> push TTS to online hardware when idle
```

## Discovery

If enabled, the UDP discovery server answers LAN discovery requests with:

- server IP
- WebSocket port
- service version
- protocol version

This happens before the formal WebSocket connection is established.

## Current Boundaries

The codebase already supports the current production-facing voice loop, desktop configuration, discovery, and reminder management.

The following areas are still partial or reserved:

- `sys.session.resume`
- most `ctrl.camera.*` actions
- full OTA checksum and binary transfer completion

