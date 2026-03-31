# 服务发现当前实现说明

> 最后更新: 2026-03-19
> 对应实现: `src/modules/discovery/discovery_server.py`

## 1. 文档用途

这份文档只描述当前项目里“UDP 服务发现”的真实实现。

它的作用是帮助后续 AI 或开发者快速理解：

- 服务发现是不是协议主线的一部分
- 当前服务发现模块做了什么
- 设备发现消息长什么样
- 如果要改发现逻辑，应该改哪里

---

## 2. 当前定位

服务发现模块不是 WebSocket 协议主线的一部分。

它的职责只有一个：

- 帮助局域网设备找到 `watcher-server` 的 WebSocket 地址

当前关系是：

```text
UDP discovery
  -> 获取 watcher-server 的 IP 和 ws 端口
  -> 设备再通过 WebSocket 接入正式协议
```

也就是说：

- 发现阶段：UDP
- 正式通信阶段：WebSocket + 统一文本/二进制协议

---

## 3. 代码位置

核心文件：

- `src/modules/discovery/discovery_server.py`
- `src/core/websocket_server.py`

服务启动路径：

- `WebSocketServer.start()`
  - 如果 `settings.discovery_enabled` 为真
  - 会同时启动 `DiscoveryServer`

---

## 4. 当前运行方式

`DiscoveryServer` 当前会：

1. 获取本机局域网 IP
2. 监听 UDP 端口
3. 接收设备发来的发现请求
4. 返回本机 IP 与 WebSocket 端口
5. 记录已发现设备

当前默认关键信息：

- UDP 端口：来自 `settings.discovery_port`，默认 `37020`
- WebSocket 端口：来自 `settings.ws_port`
- 服务基础配置文件：`config/system.json`
- 协议版本号：来自 `settings.protocol_version`

---

## 5. 当前消息格式

### 5.1 设备发现请求

设备向服务端发送 JSON：

```json
{
  "cmd": "DISCOVER",
  "device_id": "esp32-001",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

### 5.2 服务端响应

服务端返回 JSON：

```json
{
  "cmd": "ANNOUNCE",
  "ip": "192.168.1.100",
  "port": 8765,
  "version": "1.0.0",
  "protocol_version": "0.1.5",
  "server": "watcher-server"
}
```

这里的 `port` 是正式 WebSocket 协议入口，不是 UDP 端口。
这里的 `protocol_version` 是当前正式通信协议版本，可用于设备侧判断消息分发器与通信协议规范是否匹配。

---

## 6. 当前设备记录

`DiscoveryServer` 会把发现过的设备保存在内存里。

当前保存字段包括：

- `device_id`
- `mac`
- `ip`
- `last_seen`

这部分目前只是运行时记录，没有持久化。

---

## 7. 与当前协议层的边界

请明确区分下面两件事：

### 7.1 服务发现做什么

- 找到服务端 IP
- 找到服务端 WebSocket 端口

### 7.2 正式协议做什么

- `sys.client.hello`
- 角色声明 `hardware / desktop`
- 硬件端 `fw_version`
- 文本帧
- 二进制音频/视频/图片/OTA 帧

服务发现不会替代：

- `sys.client.hello`
- 客户端角色判断
- 固件版本上报

这些仍然必须在 WebSocket 连接建立后按正式协议发送。

另外，当前项目里 discovery 的优化只作用在“发现入口”：

- 当已有硬件在线时，暂停 UDP discovery 响应
- 这样新设备不会继续通过局域网广播自动发现这个服务

但这不等价于“禁止多硬件 WebSocket 直连”。

也就是说：

- 停止 discovery 是入口收口
- 是否允许多台硬件继续直接连 WebSocket，仍然属于协议层/测试策略问题

---

## 8. 什么时候改这个模块

下面这些需求才应该改 `DiscoveryServer`：

- 发现请求/响应格式变化
- 发现端口变化
- 局域网 IP 选择策略变化
- 想要记录更多设备发现元数据

下面这些需求通常不应该先改这里：

- WebSocket 协议消息变化
- `sys.client.hello` 变化
- 音频/视频/图片/OTA 传输变化
- 客户端角色与业务转发变化

---

## 9. 当前结论

服务发现模块仍然有效，但它只是“连接前的入口辅助模块”，不是当前协议主架构。

当前真实行为补充：

- 没有硬件在线时，UDP discovery 会保持开启，方便设备找到服务
- 第一台硬件成功完成 `sys.client.hello(role=hardware)` 后，UDP discovery 会暂停
- 当最后一台硬件断开后，UDP discovery 会自动恢复
- 第二台硬件如果已知 WebSocket 地址，仍然可以直接连接，适合当前联调/模拟测试阶段

如果后续 AI 需要理解主通信链路，优先看：

- `docs/device_communication_protocol.md`
- `docs/AI_CONTEXT.md`

如果后续 AI 需要改“设备怎么找到服务端”，再看这份文档和：

- `src/modules/discovery/discovery_server.py`
