# Development Guide

English | [简体中文](DEVELOPMENT.zh-CN.md)

This guide is for contributors working on the current codebase, not the historical architecture.

## Recommended Reading Order

- [`README.md`](README.md)
- [`docs/README.md`](docs/README.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/configuration.md`](docs/configuration.md)
- [`docs/protocol-overview.md`](docs/protocol-overview.md)

For the current detailed Chinese design notes, also see:

- [`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md)
- [`docs/device_communication_protocol.md`](docs/device_communication_protocol.md)

## Environment

```bash
conda env create -f environment.yml
conda activate watcher-server
```

Useful commands:

```bash
conda env update -f environment.yml --prune
python main.py
python -m py_compile src/main.py
pytest
```

## Core Entry Points

- [`main.py`](main.py): thin root entry that delegates to `src.main`
- [`src/main.py`](src/main.py): application lifecycle
- [`src/core/websocket_server.py`](src/core/websocket_server.py): connection hub and broadcast layer
- [`src/core/protocol_router.py`](src/core/protocol_router.py): protocol registration table
- [`src/core/protocol_handlers/`](src/core/protocol_handlers): text and binary message handlers
- [`src/core/audio_session_handler.py`](src/core/audio_session_handler.py): `ASR -> AI -> TTS` orchestration
- [`src/core/runtime_services.py`](src/core/runtime_services.py): config IO and runtime switching
- [`src/core/http_management_server.py`](src/core/http_management_server.py): local reminder API
- [`src/core/scheduler/service.py`](src/core/scheduler/service.py): scheduler runtime

## Configuration Model

The service is JSON-first. Runtime configuration lives under [`config/`](config/):

- `system.json`
- `asr.json`
- `tts.json`
- `llm.json`
- `dialogue.json`
- `scheduler.json`
- `ai_status_map.json`

The server no longer uses `.env` as the main configuration source. [`config/system.example.json`](config/system.example.json) is the only checked-in bootstrap template today.

## Voice Session Path

```text
hardware binary.audio
  -> MessageDispatcher
  -> protocol_handlers.binary
  -> AudioSessionHandler
  -> RuntimeServices.ensure_asr_provider()
  -> RuntimeServices.chat()
  -> RuntimeServices.ensure_tts_provider()
  -> binary.audio back to hardware
```

If the hardware uploads a complete image before the audio question, OpenClaw mode can attach that image as chat context.

## Runtime Switching

Dialogue mode is controlled by [`config/dialogue.json`](config/dialogue.json):

- `provider = "openclaw"`
- `provider = "llm"`

OpenClaw backends:

- `auto`
- `local`
- `tmux`

Config updates are written back to disk and applied at runtime. During an active voice session, some updates can be rejected to avoid breaking the current pipeline.

## Providers

### ASR

1. Add a provider implementation under [`src/modules/asr/providers/`](src/modules/asr/providers)
2. Inherit from [`src/modules/asr/base.py`](src/modules/asr/base.py)
3. Register it through the registry/decorator pattern
4. Add its JSON shape to [`config/asr.json`](config/asr.json)

### TTS

1. Add a provider implementation under [`src/modules/tts/providers/`](src/modules/tts/providers)
2. Inherit from [`src/modules/tts/base.py`](src/modules/tts/base.py)
3. Register it
4. Add config support in [`config/tts.json`](config/tts.json)

### LLM

1. Add a provider implementation under [`src/modules/llm/providers/`](src/modules/llm/providers)
2. Inherit from [`src/modules/llm/base.py`](src/modules/llm/base.py)
3. Register it
4. Add config support in [`config/llm.json`](config/llm.json)

### OpenClaw

1. Add a backend implementation under [`src/modules/openclaw/`](src/modules/openclaw)
2. Inherit from [`src/modules/openclaw/base.py`](src/modules/openclaw/base.py)
3. Register it through [`src/modules/openclaw/registry.py`](src/modules/openclaw/registry.py)
4. Select it through [`config/dialogue.json`](config/dialogue.json)

## Scheduler Notes

The scheduler currently ships two built-in task types:

- `idle_ai_status_push`
- `scheduled_tts_push`

The reminder HTTP API manages a single one-shot scheduled TTS task named `http_managed_scheduled_tts`.

## Testing Notes

The repository currently contains a mix of:

- unit-style tests
- protocol checks
- manual OpenClaw and integration notes

If a test needs external services, hardware, or a local OpenClaw runtime, treat it as environment-dependent.

## Contributor Notes Before Open Source

- Replace any real provider credentials with placeholders before public release
- Prefer relative links in docs and comments
- Keep English docs as the primary entry point and add Chinese mirrors when content is contributor-facing

