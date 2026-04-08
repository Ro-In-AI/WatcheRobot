## v0.1.6

Recommended baseline for validating Bluetooth feedback, audio recovery, and action playback on the current ESP32-S3 mainline.

### Highlights
- Add a dedicated Bluetooth feedback state with matching local animation and sound assets.
- Improve TTS playback recovery after audio-path drop or failed handoff.
- Resume WebSocket from the last known good endpoint before falling back to UDP discovery after BLE disconnect.
- Refine speaking and thinking action timing for smoother expression playback.

### Validation Focus
- Bluetooth state feedback
- TTS recovery after local/cloud audio handoff
- BLE disconnect to cached WebSocket resume
- Speaking and thinking action playback smoothness

### Release Assets
The attached zip contains all binaries required for full flashing:
- bootloader.bin
- partition-table.bin
- WatcheRobot-S3.bin
- srmodels.bin
- storage.bin
