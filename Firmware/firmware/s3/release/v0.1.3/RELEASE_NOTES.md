## v0.1.3

Recommended baseline for stable BLE and Wi-Fi testing on the current ESP32-S3 mainline.

### Highlights
- Harden BLE disconnect to Wi-Fi recovery under low internal heap pressure.
- Reclaim optional WebSocket and voice runtime memory before low-memory Wi-Fi retry.
- Guard recording-time UI updates to reduce LCD flush failures during connectivity tests.
- Reduce WebSocket internal RAM pressure with smaller buffers, dynamic client buffers, and PSRAM-backed audio frame storage.
- Refresh the listening animation pack and regenerate runtime SPIFFS assets.

### Validation Focus
- BLE pairing and provisioning
- Wi-Fi provisioning and reconnect
- BLE-to-Wi-Fi recovery after disconnect
- Repeated local multi-device bring-up testing

### Release Assets
The attached zip contains all binaries required for full flashing:
- bootloader.bin
- partition-table.bin
- WatcheRobot-S3.bin
- srmodels.bin
- storage.bin
