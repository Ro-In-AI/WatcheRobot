# Configuration

English | [简体中文](configuration.zh-CN.md)

Watcher Server uses JSON files under `config/` as the primary runtime configuration source.

## Configuration Philosophy

- `config/*.json` is the source of truth
- `.env` is no longer the main runtime config input
- updates from desktop clients are written back to JSON files
- runtime providers can be reloaded after config updates

## Files

### `config/system.json`

System-level settings:

- service name and versions
- WebSocket host and port
- discovery enablement and UDP port
- OpenClaw shared settings
- HTTP management host and port
- scheduler config path
- log and thread-pool settings

Bootstrap template:

- [`../config/system.example.json`](../config/system.example.json)

### `config/asr.json`

ASR provider selection and provider-specific settings.

Supported providers in the current code:

- `aliyun`
- `deepgram`

### `config/tts.json`

TTS provider selection and provider-specific settings.

Supported providers:

- `huoshan`
- `deepgram`

### `config/llm.json`

Standalone LLM provider settings.

Supported provider:

- `ark`

### `config/dialogue.json`

Dialogue mode and OpenClaw backend selection.

Supported dialogue providers:

- `openclaw`
- `llm`

Supported OpenClaw backends:

- `auto`
- `local`
- `tmux`

### `config/scheduler.json`

Scheduler enablement and task definitions.

The current checked-in configuration includes:

- `idle_non_dialogue_status_push`
- `http_managed_scheduled_tts`

### `config/ai_status_map.json`

AI status catalog and asset mapping used by hardware-facing status messages.

## Prompt Files

Some text prompts are stored as plain text files:

- `config/openclaw_prompt.txt`
- `config/llm_think_prompt.txt`

These are loaded by [`src/config/env.py`](../src/config/env.py).

## Current Development Profile

The current checked-in development profile selects:

- `openclaw` dialogue mode
- `tmux` as the OpenClaw backend
- `aliyun` ASR
- `huoshan` TTS

Treat that as a local development profile, not a public deployment template.

## Hot Reload Behavior

Desktop clients can update runtime configuration through `cfg.*.update` messages.

Those updates:

1. validate the payload
2. write the JSON file
3. reinitialize or switch the runtime instance when needed

Some updates can be blocked while a hardware voice session is busy.

## Security Note

If you plan to publish this project:

- remove any live API keys or tokens from `config/*.json`
- replace local machine paths with placeholders where possible
- prefer sanitized example configs for public documentation

