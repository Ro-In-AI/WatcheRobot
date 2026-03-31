# Watcher Desktop

English version: [README.md](./README.md)

Watcher Desktop 是基于 Tauri + React + TypeScript 构建的桌面客户端，用来统一管理以下能力：

- OpenClaw 环境检测、安装与初始化
- OpenClaw provider / channel 配置
- `Watcher Server` 服务端的启动、日志与运行时控制

这个目录本身是一个完整项目，但它默认运行在工作区结构中，并依赖同级目录下的 `../Watcher Server/` 子模块。

## 功能概览

- 基于 Tauri 2 的桌面应用外壳
- React 前端界面与配置工作流
- Rust 后端模块负责安装器、OpenClaw 配置与服务端进程控制
- 支持在开发和构建阶段将 `Watcher Server` 打包或同步到桌面端运行时目录

## 技术栈

- React 18
- TypeScript
- Vite
- Tauri 2
- Rust 2021 edition

## 环境要求

开始前请先准备：

- Node.js 18 或更高版本
- npm
- Rust 1.85.0 或更高版本
- 对应操作系统所需的 Tauri 原生构建依赖
- Git
- Python 3.10 或更高版本

Python 主要用于两类场景：

- 以源码模式运行 `Watcher Server`
- 执行 `npm run build:server-bundle` 时打包后端二进制

## 推荐克隆方式

建议从工作区根目录递归拉取子模块：

```bash
git clone --recurse-submodules git@github.com:ERRORIGHT-AI/watcher-desktop-app.git
cd watcher-desktop-app
```

如果你已经完成普通克隆，再执行：

```bash
git submodule update --init --recursive
```

## 安装依赖

在当前目录执行：

```bash
npm install
```

## 本地开发

只启动前端开发服务器：

```bash
npm run dev:renderer
```

启动完整桌面应用：

```bash
npm run dev
```

类型检查：

```bash
npm run typecheck
```

## 构建

构建桌面应用：

```bash
npm run build
```

单独构建前端资源：

```bash
npm run build:renderer
```

单独打包 `Watcher Server` 到 Tauri 资源目录：

```bash
npm run build:server-bundle
```

`build:server-bundle` 会做这些事：

- 在 `../Watcher Server/` 下定位服务端源码
- 自动准备 `Watcher Server/.venv-build/`
- 使用 PyInstaller 构建 `watcher-server-backend`
- 将结果拷贝到 `src-tauri/resources/server/`

## 工作区结构

```text
watcher-desktop-app/
|-- Watcher Desktop App/
|   |-- src/
|   |-- src-tauri/
|   |-- scripts/
|   |-- design/
|   `-- README.md
|-- Watcher Server/
|-- .gitmodules
`-- README.md
```

## 关键目录

- `src/`: React 前端页面、组件、状态与样式
- `src-tauri/src/modules/installer/`: OpenClaw 安装与环境检测
- `src-tauri/src/modules/openclaw/`: OpenClaw 配置、聊天与运行设置
- `src-tauri/src/modules/server/`: `Watcher Server` 进程启动、状态与日志转发
- `scripts/build-bundled-server.mjs`: 打包桌面端附带的服务端二进制

## 运行时说明

桌面端默认与同级目录下的 `../Watcher Server/` 协同工作。运行时会根据配置选择：

- 使用服务端二进制
- 使用 Python 源码模式
- 自动在两者之间切换

常见环境变量包括：

- `WATCHER_SERVER_RUNTIME_MODE`: `binary`、`python` 或 `auto`
- `WATCHER_SERVER_SERVER_BIN`: 显式指定服务端二进制
- `WATCHER_SERVER_PYTHON_BIN`: 显式指定 Python 解释器
- `WATCHER_SERVER_RESOURCE_ROOT`: 指定服务端项目根目录
- `WATCHER_SERVER_CONFIG_ROOT`: 指定配置目录
- `WATCHER_SERVER_BUILD_PYTHON_BIN`: 指定打包服务端时使用的 Python

## 常见问题

### `Watcher Server` 目录为空或没有代码

说明子模块还没初始化，执行：

```bash
git submodule update --init --recursive
```

### `npm run build:server-bundle` 找不到 Python

请确认本机存在 Python 3.10+，或者显式设置：

```bash
set WATCHER_SERVER_BUILD_PYTHON_BIN=python
```

在 PowerShell 中：

```powershell
$env:WATCHER_SERVER_BUILD_PYTHON_BIN = "python"
```

### `npm run dev` 无法启动 Tauri

请先确认：

- 已安装 Rust 工具链
- 已安装当前操作系统要求的 Tauri 原生依赖
- `npm install` 已成功完成
