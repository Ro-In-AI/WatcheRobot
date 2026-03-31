# WatcherRobot

<p align="center">
  <img src="./icon.png" alt="Watcher Robot Logo" width="160" height="160" />
</p>

<p align="center">
  Unified repository for the WatcherRobot embedded firmware, desktop workspace, mobile app, and hardware files.
</p>

<p align="center">
  <a href="./README_cn.md">中文说明</a>
</p>

## Overview

WatcherRobot is a desktop robot project built around SenseCAP Watcher. This repository is the current workspace root for all major parts of the system:

- Embedded firmware for the robot device
- Desktop application and Python desktop service
- Mobile control application
- Hardware design assets and manufacturing files

All imported projects are stored in this repository as regular directories. They are not Git submodules.

## Repository Layout

```text
Watcher/
|-- Firmware/
|   |-- docs/
|   |-- firmware/
|   |   `-- s3/
|   |-- hardware/
|   `-- tools/
|-- watcher-desktop-app/
|   |-- Watcher Desktop App/
|   `-- Watcher Server/
|-- WatcheRobotAPP/
|-- Hardware/
|-- README.md
`-- README_cn.md
```

## Subprojects

### `Firmware/`

Embedded firmware workspace for the robot device.

- Main ESP32-S3 firmware source under `Firmware/firmware/s3/`
- Project docs under `Firmware/docs/`
- Flashing and asset tooling under `Firmware/tools/`
- Additional board and firmware support files under `Firmware/hardware/`

Start here: [Firmware/README.md](./Firmware/README.md)

### `watcher-desktop-app/`

Desktop workspace for local robot control and desktop-side services.

- `watcher-desktop-app/Watcher Desktop App/`: Tauri + React + Vite desktop application
- `watcher-desktop-app/Watcher Server/`: Python desktop service, docs, tests, and environment files

Start here:

- [watcher-desktop-app/README.md](./watcher-desktop-app/README.md)
- [watcher-desktop-app/Watcher Desktop App/README.md](./watcher-desktop-app/Watcher%20Desktop%20App/README.md)
- [watcher-desktop-app/Watcher Server/README.md](./watcher-desktop-app/Watcher%20Server/README.md)

### `WatcheRobotAPP/`

React Native mobile app for BLE control and mobile interaction flows.

- Android project under `WatcheRobotAPP/android/`
- iOS project under `WatcheRobotAPP/ios/`
- App source under `WatcheRobotAPP/src/`
- Screenshots and docs under `WatcheRobotAPP/docs/`

Start here: [WatcheRobotAPP/README.md](./WatcheRobotAPP/README.md)

### `Hardware/`

Hardware design files for the robot body and PCB production.

- PCB source files
- Gerber manufacturing files
- BOM
- 3D structure models and assets

Start here: [Hardware/README.md](./Hardware/README.md)

## Quick Start

### Firmware

```bash
cd Firmware/firmware/s3
idf.py set-target esp32s3
idf.py build
```

### Desktop App

```bash
cd "watcher-desktop-app/Watcher Desktop App"
npm install
npm run dev
```

### Desktop Server

```bash
cd "watcher-desktop-app/Watcher Server"
pip install -r requirements.txt
python main.py
```

### Mobile App

```bash
cd WatcheRobotAPP
yarn install
yarn android
```

## Tech Stack

| Area | Main Technologies |
| --- | --- |
| Firmware | ESP-IDF, ESP32-S3, FreeRTOS, LVGL |
| Desktop App | Tauri, React, TypeScript, Vite |
| Desktop Server | Python |
| Mobile App | React Native, TypeScript |
| Hardware | PCB design files, Gerber, BOM, 3D models |

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes.

## License

This repository is licensed under [GPL-3.0](./LICENSE), unless a subproject states otherwise in its own license file.
