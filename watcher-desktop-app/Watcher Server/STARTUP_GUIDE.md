# Startup Guide

English | [简体中文](STARTUP_GUIDE.zh-CN.md)

This guide is the fastest way to boot a local Watcher Server instance from the current repository.

## Prerequisites

- Conda or Miniconda
- Python environment created from [`environment.yml`](environment.yml)
- Valid provider configuration under [`config/`](config/)
- If you want OpenClaw mode, a working local OpenClaw runtime and agent

## Step 1: Create the environment

```bash
conda env create -f environment.yml
conda activate watcher-server
```

## Step 2: Prepare configuration

If needed, bootstrap the system config:

```bash
cp config/system.example.json config/system.json
```

Then review these files:

- [`config/system.json`](config/system.json)
- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)
- [`config/dialogue.json`](config/dialogue.json)
- [`config/scheduler.json`](config/scheduler.json)

Important defaults:

- WebSocket: `ws://0.0.0.0:8765`
- UDP discovery: `37020`
- HTTP management: `http://127.0.0.1:8766`

## Step 3: Start the server

### Direct start

```bash
python main.py
```

### Helper script

```bash
chmod +x start.sh
./start.sh
```

Windows:

```cmd
start.bat
```

## Step 4: Verify the server

### Check the HTTP management API

```bash
curl http://127.0.0.1:8766/api/admin/health
```

### Expected response

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "base_url": "http://127.0.0.1:8766"
  }
}
```

### Check logs

The server writes logs under [`logs/`](logs/).

## Common Startup Issues

### `config/system.json` is missing

Copy [`config/system.example.json`](config/system.example.json) first.

### OpenClaw requests fail

Make sure:

- [`config/dialogue.json`](config/dialogue.json) is set to `openclaw`
- the configured OpenClaw backend is available
- the local OpenClaw runtime is running

### Reminder HTTP calls hit the wrong port

Use `8766` for HTTP management, not `8765`.

### Provider authentication fails

Review your provider credentials in:

- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)

