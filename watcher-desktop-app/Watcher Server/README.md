# Watcher Server

English | [简体中文](README.zh-CN.md)

Watcher Server is an asyncio-based protocol hub and voice orchestration service for a dual-client setup:

- `hardware` clients connect over WebSocket to stream audio, images, video, and device events
- `desktop` clients connect over WebSocket to inspect runtime state, update configuration, and control hardware
- the server coordinates `ASR -> dialogue engine -> TTS`
- the runtime can switch between `OpenClaw` and a regular `LLM` backend
- a local HTTP management API exposes reminder scheduling and other desktop-side automation hooks

## What It Does

- Accepts WebSocket connections from `hardware` and `desktop` roles
- Parses a shared JSON text protocol and a shared binary frame protocol
- Runs streaming voice sessions with `ASR -> AI -> TTS`
- Supports image context for OpenClaw-based conversations
- Provides JSON-based runtime config storage and hot switching
- Broadcasts device presence and AI status updates
- Runs UDP LAN discovery for hardware and desktop clients
- Hosts scheduler tasks, including one-shot reminder playback over HTTP

## Current Runtime Defaults

The checked-in development configuration currently uses:

- WebSocket server on `8765`
- UDP discovery on `37020`
- local HTTP management API on `8766`
- `openclaw` as the dialogue provider
- `tmux` as the configured OpenClaw backend
- `aliyun` for ASR
- `huoshan` for TTS
- `ark` for the standalone LLM provider

These defaults come from the current `config/*.json` files and may differ from your deployment.

## Quick Start

### 1. Create the environment

```bash
conda env create -f environment.yml
conda activate watcher-server
```

### 2. Review configuration

Watcher Server is configured through JSON files under [`config/`](config/):

- [`config/system.json`](config/system.json)
- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)
- [`config/dialogue.json`](config/dialogue.json)
- [`config/scheduler.json`](config/scheduler.json)
- [`config/ai_status_map.json`](config/ai_status_map.json)

If you do not have a local system config yet, copy [`config/system.example.json`](config/system.example.json) to `config/system.json`.

### 3. Start the server

```bash
python main.py
```

Or use the helper scripts:

```bash
chmod +x start.sh
./start.sh
```

Windows:

```cmd
start.bat
```

## Runtime Overview

### Core services

- [`src/main.py`](src/main.py): process lifecycle and graceful shutdown
- [`src/core/websocket_server.py`](src/core/websocket_server.py): connection hub, role management, broadcast paths
- [`src/core/runtime_services.py`](src/core/runtime_services.py): provider initialization, config storage, runtime switching
- [`src/core/audio_session_handler.py`](src/core/audio_session_handler.py): end-to-end voice session orchestration
- [`src/core/http_management_server.py`](src/core/http_management_server.py): local HTTP management API
- [`src/core/scheduler/service.py`](src/core/scheduler/service.py): scheduler host and reminder task management

### Main audio flow

```text
hardware binary.audio
  -> ASR provider
  -> dialogue engine (OpenClaw or LLM)
  -> TTS provider
  -> binary.audio back to hardware
```

### Reminder flow

```text
desktop tool / OpenClaw skill
  -> HTTP PUT /api/admin/scheduled-tts
  -> SchedulerService
  -> one-shot TTS push to online hardware
```

## Repository Layout

```text
watcher-server/
├── config/                  JSON runtime configuration
├── docs/                    Architecture, protocol, and integration docs
├── skills/                  Project-shipped OpenClaw skills
├── src/
│   ├── config/              Settings loader and path helpers
│   ├── core/                WebSocket server, scheduler, runtime orchestration
│   ├── models/              Protocol models and binary frame codec
│   ├── modules/             ASR / TTS / LLM / OpenClaw / discovery modules
│   └── utils/               Logging and message helpers
├── tests/                   Unit tests and manual integration notes
├── DEVELOPMENT.md           Development guide
├── STARTUP_GUIDE.md         Setup and startup guide
├── start.sh
├── start.bat
└── main.py
```

## Providers and Backends

- ASR providers: `aliyun`, `deepgram`
- TTS providers: `huoshan`, `deepgram`
- LLM providers: `ark`
- Dialogue modes: `openclaw`, `llm`
- OpenClaw backends: `auto`, `local`, `tmux`

## Reminder Skill

The repository ships an OpenClaw skill for one-shot reminder management:

- [`skills/watcher-reminder-http/SKILL.md`](skills/watcher-reminder-http/SKILL.md)
- [`skills/watcher-reminder-http/scripts/reminder_http.js`](skills/watcher-reminder-http/scripts/reminder_http.js)

This skill talks to the local HTTP management API on port `8766`. It is designed for one-shot reminders only and replaces the previous reminder when a new one is written.

## Documentation

- English docs index: [`docs/README.md`](docs/README.md)
- Chinese docs index: [`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Configuration: [`docs/configuration.md`](docs/configuration.md)
- Protocol overview: [`docs/protocol-overview.md`](docs/protocol-overview.md)
- HTTP management API: [`docs/http-management-api.md`](docs/http-management-api.md)

## Open-Source Readiness Notes

- The current repository still contains development-oriented provider configuration under `config/*.json`.
- Before publishing publicly, replace any real credentials, tokens, or machine-specific values with placeholders.
- Add a license file and a sanitized deployment example set before the first public release.

## Status

Watcher Server already supports the current voice loop, runtime switching, desktop-side configuration, image-assisted OpenClaw sessions, scheduler tasks, and the local reminder API.

Some protocol surfaces are still partial or reserved, including:

- `sys.session.resume`
- most `ctrl.camera.*` downlink actions
- the full OTA checksum/binary transfer loop

