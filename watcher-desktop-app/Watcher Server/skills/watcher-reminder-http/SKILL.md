---
name: watcher-reminder-http
description: |
  设置或查询 watcher-server 的一次性提醒播报。

  当用户想设置提醒、闹钟、定时播报、稍后提醒、延迟提醒时使用，例如：
  - “一分钟后提醒我去处理垃圾”
  - “五分钟后提醒我检查 API”
  - “明天早上 9 点提醒我开会”
  - “帮我看看现在设置了什么提醒”
  - “测试一下提醒播报”

  必须始终使用随 skill 提供的 JS 脚本：
  - `node scripts/reminder_http.js health`
  - `node scripts/reminder_http.js get`
  - `node scripts/reminder_http.js set --trigger-at ... --text ...`
  - `node scripts/reminder_http.js trigger --text ...`

  不要自己发明 `curl`、`fetch`、`urllib` 请求。
  不要使用 `8765`；那是 WebSocket 端口。HTTP 管理端口是 `8766`。

  创建提醒前必须同时拿到：
  - `trigger_at`
  - `text`

  不适用于周期性提醒，也不适用于多个独立提醒同时管理。
---

# Watcher Reminder HTTP Skill

使用 watcher-server 的本地 HTTP 管理接口管理一次性提醒。底层对应单个 `http_managed_scheduled_tts` 任务，新的提醒会覆盖旧的提醒。

## 第一原则

- 只允许使用随 skill 提供的 JS 脚本。
- 不要自己手写 `curl`、`fetch`、`urllib` 或临时 HTTP 请求。
- 不要探测随机路径，不要猜测端口。
- `8765` 是 WebSocket 端口，不是 HTTP 管理端口。
- HTTP 管理端口固定是 `8766`。
- 不要使用不存在的路径，例如 `/api/schedule`、`/api/status`、`/api/health`。

## 唯一允许的命令

默认只使用以下命令模板：

```bash
node scripts/reminder_http.js health
node scripts/reminder_http.js get
node scripts/reminder_http.js set --trigger-at "2026-03-28T09:00" --text "提醒你开会"
node scripts/reminder_http.js trigger --text "这是一条测试提醒"
```

不要改脚本名，不要改命令结构，不要改默认端口。

## 何时使用

- 用户要设置提醒、闹钟、定时播报、语音提醒
- 用户说“X 分钟后提醒我……”
- 用户说“明天/今晚/下午某个时间提醒我……”
- 用户想查看当前提醒内容
- 用户想手动触发一次提醒做测试

## 必填信息

设置提醒时必须同时具备：

1. `trigger_at`
2. `text`

如果缺少任意一项，先补问，不要直接调用接口。

补问优先级：

- 缺时间：问“要在什么时间提醒？”
- 缺内容：问“提醒内容是什么？”

## 时间规则

- 默认时区：`Asia/Shanghai`
- 先把相对时间换算成绝对时间，再调用脚本
- 优先使用 `YYYY-MM-DDTHH:MM`
- 也可接受 `YYYY-MM-DDTHH:MM:SS`

如果用户只说“明天上午”这种不够精确的时间，先追问明确小时和分钟。

如果用户说“5 分钟后提醒我”这类相对时间，先在 `Asia/Shanghai` 时区下换算成绝对时间，再调用脚本。

## 标准工作流

### 1. 设置提醒

按这个顺序做：

1. 提取或补问 `trigger_at` 和 `text`
2. 把时间整理成绝对时间
3. 先运行健康检查
4. 再运行 `set`
5. 简洁回复最终提醒时间和提醒内容

示例：

```bash
node scripts/reminder_http.js health
node scripts/reminder_http.js set --trigger-at "2026-03-28T09:00" --text "九点出门打羽毛球"
```

### 2. 查看当前提醒

```bash
node scripts/reminder_http.js get
```

### 3. 手动测试提醒

```bash
node scripts/reminder_http.js trigger \
  --text "这是一条测试提醒"
```

## 混合请求处理

如果用户一次提到“提醒”和“添加到日程/日历”：

1. 先用本 skill 只处理提醒部分
2. 再用日历相关 skill 或工具处理日程部分

不要尝试让提醒 HTTP 接口顺带处理日历，也不要为了同时做两件事去猜新的 HTTP 路径。

## 失败时怎么做

- 如果 `health` 失败，直接告诉用户 watcher-server HTTP 管理接口当前不可访问。
- 如果脚本报参数错误，先修正时间格式或补问缺失字段。
- 如果看到 WebSocket 握手相关错误，说明你错误地把 HTTP 请求打到了 `8765`，立刻回到本 skill 的 JS 脚本。

## 只有脚本不可用时，才允许的原始 HTTP

默认地址：

- `http://127.0.0.1:8766`

精确接口：

- `GET /api/admin/health`
- `GET /api/admin/scheduled-tts`
- `PUT /api/admin/scheduled-tts`
- `POST /api/admin/scheduled-tts/trigger`

仅在脚本不可用时，才允许用这些精确 HTTP 调用：

```bash
curl -sS http://127.0.0.1:8766/api/admin/health
curl -sS http://127.0.0.1:8766/api/admin/scheduled-tts
curl -sS -X PUT http://127.0.0.1:8766/api/admin/scheduled-tts \
  -H "Content-Type: application/json" \
  -d '{"trigger_at":"2026-03-28T09:00","text":"提醒你开会"}'
```

不要把这些 URL 改写成 `8765`，也不要把路径改成 `/api/schedule`、`/api/status` 或 `/api/health`。

## 成功后的回复风格

简洁确认，不要复述一大段接口细节。直接告诉用户：

- 已设置成功
- 具体提醒时间
- 提醒内容

示例：

```text
已经帮你设置好了。
提醒时间：2026-03-28 09:00
提醒内容：提醒你开会
```

## 限制与注意事项

- 当前接口是“一次性提醒”
- 当前接口实际只维护一个 HTTP 管理提醒，后写入的会覆盖前一个
- 不是周期性提醒
- 不是多提醒列表系统
- 如果没有在线硬件，到点时任务会完成，但可能不会实际播报

## 错误处理

- `trigger_at must be a non-empty string`
- `text must be a non-empty string`
- `trigger_at must match YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS`
- HTTP 500 或连接失败
- `unsupported HTTP method; expected GET; got POST`
- `missing Connection header`

### 处理原则

- 参数缺失：补问
- 时间格式不对：重新整理成标准格式后再提交
- 服务不可用：明确告诉用户 watcher-server HTTP 管理接口当前不可访问，不要再猜别的端口和路径
- 不支持的需求：如“每天提醒我”，要明确说明当前这套接口只支持一次性提醒
- 如果看到 WebSocket 握手相关错误，优先检查是否误用了 `8765` 端口；这通常表示普通 HTTP 请求被打到了 WebSocket 服务上
