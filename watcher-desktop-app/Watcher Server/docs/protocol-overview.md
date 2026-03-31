# Protocol Overview

English | [简体中文](protocol-overview.zh-CN.md)

This is a concise overview of the current protocol implemented by Watcher Server.

For the full, detailed Chinese reference, see [`device_communication_protocol.md`](device_communication_protocol.md).

## Roles

Watcher Server currently works with:

- `hardware`
- `desktop`

Every WebSocket client should send `sys.client.hello` soon after connecting.

Example:

```json
{
  "type": "sys.client.hello",
  "code": 0,
  "data": {
    "role": "hardware",
    "fw_version": "1.2.3"
  }
}
```

## Transport Layers

Watcher Server uses:

- UDP for discovery
- WebSocket text frames for JSON messages
- WebSocket binary frames for media and OTA payloads

## Discovery

Default UDP discovery port:

- `37020`

Example request:

```json
{
  "cmd": "DISCOVER",
  "device_id": "watcher-001",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

Example response:

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

## Text Message Envelope

All text messages use:

```json
{
  "type": "evt.ai.status",
  "code": 0,
  "data": {}
}
```

Fields:

- `type`: message name
- `code`: status code, usually `0` for success
- `data`: payload object

## Binary Frame Envelope

Binary frames are encoded through [`src/models/protocol.py`](../src/models/protocol.py).

Current frame types:

- `1`: audio
- `2`: video
- `3`: image
- `4`: ota

Header details:

- magic: `WSPK`
- frame type: 1 byte
- flags: 1 byte
- sequence: 4 bytes
- payload length: 4 bytes

Current flags:

- `FIRST`
- `LAST`
- `KEYFRAME`
- `FRAGMENT`

## Message Families

### System

- `sys.client.hello`
- `sys.ack`
- `sys.nack`
- `sys.ping`
- `sys.pong`
- `sys.session.resume`

### Control

- `ctrl.servo.angle`
- `ctrl.camera.video_config`
- `ctrl.camera.capture_image`
- `ctrl.camera.start_video`
- `ctrl.camera.stop_video`

### Config

- `cfg.asr.*`
- `cfg.tts.*`
- `cfg.llm.*`
- `cfg.dialogue.*`
- `cfg.scheduler.*`

### Events

- `evt.asr.result`
- `evt.ai.status`
- `evt.ai.thinking`
- `evt.ai.reply`
- `evt.server.error`
- `evt.device.status`
- `evt.servo.position`
- `evt.ota.progress`
- `evt.device.error`
- `evt.device.firmware`

### Transfer

- `xfer.ota.handshake`
- `xfer.ota.checksum`

## Common Active Paths

- `desktop -> hardware`
  - servo control
  - some validated AI status forwarding
- `hardware -> desktop`
  - device events
  - servo position
  - OTA progress
  - image/video forwarding
- `hardware -> server -> hardware`
  - audio conversation loop

## Current Limits

The current implementation still treats some protocol surfaces as reserved or partial:

- `sys.session.resume` is not fully implemented
- most camera control messages are registered but not fully active
- OTA binary/checksum flow is not complete end-to-end

