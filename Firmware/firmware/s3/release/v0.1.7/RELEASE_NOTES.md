## v0.1.7

Recommended baseline for validating reconnect stability and UI state consistency on the current ESP32-S3 mainline.

### Highlights
- Reduce BLE-to-WebSocket recovery memory storms during reconnect and runtime handoff.
- Keep display text and font updates synchronized with behavior-state and WebSocket-driven UI changes.
- Preserve the Bluetooth feedback state, cached WebSocket resume flow, and TTS recovery improvements already merged on main.

### Validation Focus
- BLE / Wi-Fi / WebSocket recovery stability
- On-screen text and font behavior during state transitions
- Bluetooth feedback state behavior
- Mixed local/cloud UI handoff

### Release Assets
The attached zip contains all binaries required for full flashing:
- bootloader.bin
- partition-table.bin
- WatcheRobot-S3.bin
- srmodels.bin
- storage.bin
