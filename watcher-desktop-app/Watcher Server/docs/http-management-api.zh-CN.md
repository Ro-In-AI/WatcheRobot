# HTTP 管理接口

[English](http-management-api.md) | 简体中文

Watcher Server 提供了一个本地 HTTP 管理接口，供桌面工具和自动化能力调用。

## 用途

当前接口刻意保持很小，主要用于：

- 健康检查
- 管理单个一次性提醒任务
- 手动触发提醒播报做测试

默认监听：

- host: `127.0.0.1`
- port: `8766`

重要说明：

- `8766` 是 HTTP 管理端口
- `8765` 是 WebSocket 端口
- 不要把提醒相关 HTTP 请求打到 `8765`

## 接口列表

### `GET /api/admin/health`

返回 HTTP 管理接口是否启用。

示例：

```bash
curl http://127.0.0.1:8766/api/admin/health
```

### `GET /api/admin/scheduled-tts`

返回当前一次性提醒任务的调度器状态与任务状态。

示例：

```bash
curl http://127.0.0.1:8766/api/admin/scheduled-tts
```

### `PUT /api/admin/scheduled-tts`

创建或替换当前一次性提醒任务。

请求体：

```json
{
  "trigger_at": "2026-03-29T21:30",
  "text": "提醒我检查 API"
}
```

示例：

```bash
curl -X PUT http://127.0.0.1:8766/api/admin/scheduled-tts \
  -H "Content-Type: application/json" \
  -d '{"trigger_at":"2026-03-29T21:30","text":"提醒我检查 API"}'
```

### `POST /api/admin/scheduled-tts/trigger`

立即触发一次提醒播报，常用于测试。

请求体：

```json
{
  "text": "这是一条测试提醒",
  "wait_timeout_seconds": 30
}
```

两个字段都可选；如果不传 `text`，则使用当前任务中保存的提醒文本。

示例：

```bash
curl -X POST http://127.0.0.1:8766/api/admin/scheduled-tts/trigger \
  -H "Content-Type: application/json" \
  -d '{"text":"这是一条测试提醒","wait_timeout_seconds":30}'
```

## 提醒任务语义

- 任意时刻只存在一个 HTTP 管理提醒任务
- 新的 `PUT` 会覆盖旧提醒
- 这是一次性任务，不是周期任务
- 任务完成后会被标记为禁用，并写入完成元数据

## 错误码

- `400`：请求体格式不对或字段非法
- `409`：当前运行时状态拒绝触发提醒
- `500`：内部异常

## OpenClaw Reminder Skill

仓库内置了一个调用这个 API 的 JavaScript OpenClaw skill：

- [`../skills/watcher-reminder-http/SKILL.md`](../skills/watcher-reminder-http/SKILL.md)
- [`../skills/watcher-reminder-http/scripts/reminder_http.js`](../skills/watcher-reminder-http/scripts/reminder_http.js)

这个 skill 会强制使用正确端口和路径，是 OpenClaw 侧调用该接口的首选方式。

