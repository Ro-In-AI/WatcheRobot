# HTTP Management API

English | [简体中文](http-management-api.zh-CN.md)

Watcher Server exposes a local HTTP management API for desktop tools and automation helpers.

## Purpose

The current API is intentionally small. It is used for:

- health checks
- managing a single one-shot reminder task
- manually triggering reminder playback for testing

By default, it binds to:

- host: `127.0.0.1`
- port: `8766`

Important:

- `8766` is the HTTP management port
- `8765` is the WebSocket port
- do not send reminder HTTP requests to `8765`

## Endpoints

### `GET /api/admin/health`

Returns whether the HTTP management server is enabled.

Example:

```bash
curl http://127.0.0.1:8766/api/admin/health
```

### `GET /api/admin/scheduled-tts`

Returns the current scheduler-level and task-level state for the one-shot reminder task.

Example:

```bash
curl http://127.0.0.1:8766/api/admin/scheduled-tts
```

### `PUT /api/admin/scheduled-tts`

Creates or replaces the current one-shot reminder task.

Request body:

```json
{
  "trigger_at": "2026-03-29T21:30",
  "text": "Remind me to check the API"
}
```

Example:

```bash
curl -X PUT http://127.0.0.1:8766/api/admin/scheduled-tts \
  -H "Content-Type: application/json" \
  -d '{"trigger_at":"2026-03-29T21:30","text":"Remind me to check the API"}'
```

### `POST /api/admin/scheduled-tts/trigger`

Immediately triggers reminder playback for testing.

Request body:

```json
{
  "text": "This is a test reminder",
  "wait_timeout_seconds": 30
}
```

Both fields are optional. If `text` is omitted, the task's stored reminder text is used.

Example:

```bash
curl -X POST http://127.0.0.1:8766/api/admin/scheduled-tts/trigger \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test reminder","wait_timeout_seconds":30}'
```

## Reminder Task Semantics

- only one HTTP-managed reminder exists at a time
- a new `PUT` replaces the previous reminder
- the task is one-shot, not recurring
- once completed, the task is marked disabled with completion metadata

## Error Codes

- `400`: invalid request body or invalid fields
- `409`: reminder could not be triggered because the runtime state rejected it
- `500`: unexpected internal failure

## OpenClaw Reminder Skill

The repository includes a JavaScript OpenClaw skill that uses this API:

- [`../skills/watcher-reminder-http/SKILL.md`](../skills/watcher-reminder-http/SKILL.md)
- [`../skills/watcher-reminder-http/scripts/reminder_http.js`](../skills/watcher-reminder-http/scripts/reminder_http.js)

That skill enforces the correct port and endpoint usage and is the preferred way to access this API from OpenClaw.

