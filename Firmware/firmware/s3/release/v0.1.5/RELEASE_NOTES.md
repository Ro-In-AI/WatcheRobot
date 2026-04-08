## v0.1.5

Recommended baseline for current animation system and behavior action validation on the ESP32-S3 mainline.

### Highlights
- Align emoji layers more reliably and recenter the main animation layer during expression playback.
- Harden SPIFFS-driven behavior action fallback so missing action clips degrade safely.
- Reduce startup state handoff desync between animation playback and action execution.
- Carry the latest merged servo interpolation and runtime stability fixes from main.

### Validation Focus
- Expression playback alignment
- SPIFFS action triggering and fallback
- Startup animation-to-action handoff
- Mixed local/cloud behavior state transitions

### Release Assets
The attached zip contains all binaries required for full flashing:
- bootloader.bin
- partition-table.bin
- WatcheRobot-S3.bin
- srmodels.bin
- storage.bin
