# WatcheRobot Hardware 0.2.0

English | [简体中文](./README.zh-CN.md)

WatcheRobot builds on top of the open-source **OSHW SenseCAP Watcher** hardware project from Seeed Studio. The robot head module is based on that upstream design, while this repository adds the robot base hardware, structure model, servo integration, and supporting PCB work needed for the full desktop robot.

Upstream hardware project:

- [Seeed-Studio/OSHW-SenseCAP-Watcher](https://github.com/Seeed-Studio/OSHW-SenseCAP-Watcher)

On top of the upstream design, this hardware package adds:

- robot base PCB work
- magnetic pin Type-C charging board
- full body structure model
- servo-driven motion mechanism

## Overview

The current `Hardware/` directory is organized by purpose:

```text
Hardware/
|-- pcb/
|   |-- adapter-board/
|   `-- magnetic-pin-typec-charging-board/
|-- models/
|   `-- step/
|-- assets/
|   |-- servo.jpg
|   `-- watcher-exploded-view-animation-v1.avi
|-- LICENSE
|-- README.md
`-- README.zh-CN.md
```

## PCB Files

### `pcb/adapter-board/`

Adapter board PCB package.

Included files:

- `altium-export-2026-03-31/`: exported Altium source files
- `bill-of-materials.xlsx`: BOM for sourcing
- `gerber-2026-03-31.zip`: Gerber package for fabrication
- `pcb.webp`: PCB preview
- `schematic.png`: schematic preview

### `pcb/magnetic-pin-typec-charging-board/`

Magnetic pin Type-C charging board package.

Included files:

- `altium-export-2026-03-31/`: exported Altium source files
- `bill-of-materials.xlsx`: BOM for sourcing
- `gerber-2026-03-31.zip`: Gerber package for fabrication
- `pcb.webp`: PCB preview
- `schematic.webp`: schematic preview

## Models

### `models/step/`

This directory stores the current robot structure model.

Current model:

- [`watcherRobot.step`](./models/step/watcherRobot.step)

## Servo

WatcheRobot uses **2 x MG90 servos** for the robot motion mechanism.

Servo reference image:

![MG90 Servo](./assets/servo.jpg)

## Exploded View

The `assets/` directory stores documentation and showcase media.

Current exploded-view asset:

- [`watcher-exploded-view-animation-v1.avi`](./assets/watcher-exploded-view-animation-v1.avi)

Notes:

- This animation shows the structure breakdown and assembly relationship of the robot.
- GitHub usually does not embed `avi` playback directly in README files, so it is provided as a linked asset for local viewing or download.

## Usage Notes

- Use `pcb/` for editable board design files and production outputs.
- Use `models/` for robot body and assembly models.
- Use `assets/` for README media, previews, and exploded-view references.
- Refer to the upstream `OSHW-SenseCAP-Watcher` project for the original head hardware design.

## References

- [OSHW SenseCAP Watcher](https://github.com/Seeed-Studio/OSHW-SenseCAP-Watcher)
- [SenseCAP Watcher hardware overview](https://wiki.seeedstudio.com/cn/watcher_hardware_overview)
