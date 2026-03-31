# WatcherRobot

<p align="center">
  <img src="./icon.png" alt="Watcher Robot Logo" width="160" height="160" />
</p>

<p align="center">
  WatcherRobot 的统一仓库，包含嵌入式固件、桌面端、移动端和硬件设计文件。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## 项目总览

WatcherRobot 是一个围绕 SenseCAP Watcher 构建的桌面机器人项目。当前仓库已经整理为统一工作区，主要包含四个部分：

- 机器人嵌入式固件
- 桌面端应用和桌面服务
- 移动端控制应用
- 硬件设计与生产资料

现在这些子项目都已经作为普通目录直接保存在当前仓库中，不再使用 Git 子模块。

## 目录结构

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

## 子项目说明

### `Firmware/`

机器人嵌入式固件工作区。

- 主固件代码位于 `Firmware/firmware/s3/`
- 文档位于 `Firmware/docs/`
- 烧录、资源处理和辅助脚本位于 `Firmware/tools/`
- 其他固件配套文件位于 `Firmware/hardware/`

入口文档：[Firmware/README.md](./Firmware/README.md)

### `watcher-desktop-app/`

桌面端工作区，用于本地控制机器人以及运行桌面侧服务。

- `watcher-desktop-app/Watcher Desktop App/`：基于 Tauri + React + Vite 的桌面应用
- `watcher-desktop-app/Watcher Server/`：Python 桌面服务，包含配置、文档和测试

入口文档：

- [watcher-desktop-app/README.md](./watcher-desktop-app/README.md)
- [watcher-desktop-app/Watcher Desktop App/README.md](./watcher-desktop-app/Watcher%20Desktop%20App/README.md)
- [watcher-desktop-app/Watcher Server/README.md](./watcher-desktop-app/Watcher%20Server/README.md)

### `WatcheRobotAPP/`

移动端控制应用，基于 React Native，主要负责 BLE 连接和移动端交互流程。

- Android 工程位于 `WatcheRobotAPP/android/`
- iOS 工程位于 `WatcheRobotAPP/ios/`
- 应用源码位于 `WatcheRobotAPP/src/`
- 文档和截图位于 `WatcheRobotAPP/docs/`

入口文档：[WatcheRobotAPP/README.md](./WatcheRobotAPP/README.md)

### `Hardware/`

机器人硬件设计资料。

- PCB 源文件
- Gerber 生产文件
- BOM 物料清单
- 结构模型和展示资源

入口文档：[Hardware/README.md](./Hardware/README.md)

## 快速开始

### 固件

```bash
cd Firmware/firmware/s3
idf.py set-target esp32s3
idf.py build
```

### 桌面应用

```bash
cd "watcher-desktop-app/Watcher Desktop App"
npm install
npm run dev
```

### 桌面服务

```bash
cd "watcher-desktop-app/Watcher Server"
pip install -r requirements.txt
python main.py
```

### 移动端

```bash
cd WatcheRobotAPP
yarn install
yarn android
```

## 技术栈

| 模块 | 主要技术 |
| --- | --- |
| 固件 | ESP-IDF、ESP32-S3、FreeRTOS、LVGL |
| 桌面应用 | Tauri、React、TypeScript、Vite |
| 桌面服务 | Python |
| 移动端 | React Native、TypeScript |
| 硬件 | PCB 设计文件、Gerber、BOM、3D 模型 |

## 贡献

提交修改前请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

仓库根目录默认使用 [GPL-3.0](./LICENSE)。如果某个子项目目录内单独声明了许可证，则以该子项目自己的许可证说明为准。
