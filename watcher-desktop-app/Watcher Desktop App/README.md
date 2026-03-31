# Watcher Desktop

Chinese version: [README.zh-CN.md](./README.zh-CN.md)

Watcher Desktop is a Tauri + React + TypeScript desktop client that brings the following workflows into one app:

- OpenClaw environment detection, installation, and onboarding
- OpenClaw provider and channel configuration
- `Watcher Server` lifecycle management, logging, and runtime control

This directory is a standalone project, but it is designed to run inside the workspace layout and expects a sibling `../Watcher Server/` repository.

## Highlights

- Tauri 2 desktop shell
- React-based renderer for setup and control flows
- Rust modules for installer logic, OpenClaw configuration, and server process management
- Support for bundling or syncing `Watcher Server` into the desktop runtime

## Stack

- React 18
- TypeScript
- Vite
- Tauri 2
- Rust 2021 edition

## Requirements

Before getting started, install:

- Node.js 18 or newer
- npm
- Rust 1.85.0 or newer
- The native Tauri prerequisites for your operating system
- Git
- Python 3.10 or newer

Python is needed when:

- running `Watcher Server` in source mode
- building the bundled backend with `npm run build:server-bundle`

## Recommended Clone Flow

Clone the workspace root with submodules:

```bash
git clone --recurse-submodules git@github.com:ERRORIGHT-AI/watcher-desktop-app.git
cd watcher-desktop-app
```

If you already cloned the repository without submodules, run:

```bash
git submodule update --init --recursive
```

## Install Dependencies

From this directory:

```bash
npm install
```

## Development

Run the renderer only:

```bash
npm run dev:renderer
```

Run the full desktop application:

```bash
npm run dev
```

Type-check the codebase:

```bash
npm run typecheck
```

## Build

Build the desktop app:

```bash
npm run build
```

Build only the renderer:

```bash
npm run build:renderer
```

Bundle `Watcher Server` into Tauri resources:

```bash
npm run build:server-bundle
```

The `build:server-bundle` script will:

- locate the server source at `../Watcher Server/`
- prepare `Watcher Server/.venv-build/`
- build `watcher-server-backend` with PyInstaller
- copy the output into `src-tauri/resources/server/`

## Workspace Layout

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

## Important Directories

- `src/`: React UI, pages, state, and styles
- `src-tauri/src/modules/installer/`: OpenClaw installation and environment detection
- `src-tauri/src/modules/openclaw/`: OpenClaw configuration, chat, and runtime settings
- `src-tauri/src/modules/server/`: `Watcher Server` process startup, status, and log streaming
- `scripts/build-bundled-server.mjs`: helper that packages the backend for desktop builds

## Runtime Notes

The desktop app normally works with the sibling `../Watcher Server/` directory. At runtime it can:

- launch a bundled backend binary
- launch the Python source version
- switch automatically between modes

Useful environment variables include:

- `WATCHER_SERVER_RUNTIME_MODE`: `binary`, `python`, or `auto`
- `WATCHER_SERVER_SERVER_BIN`: explicit backend binary path
- `WATCHER_SERVER_PYTHON_BIN`: explicit Python interpreter path
- `WATCHER_SERVER_RESOURCE_ROOT`: server project root override
- `WATCHER_SERVER_CONFIG_ROOT`: config directory override
- `WATCHER_SERVER_BUILD_PYTHON_BIN`: Python used by the bundle script

## Troubleshooting

### `Watcher Server` has no files

Your submodule has not been initialized yet:

```bash
git submodule update --init --recursive
```

### `npm run build:server-bundle` cannot find Python

Make sure Python 3.10+ is available, or set:

```bash
export WATCHER_SERVER_BUILD_PYTHON_BIN=python3
```

On PowerShell:

```powershell
$env:WATCHER_SERVER_BUILD_PYTHON_BIN = "python"
```

### `npm run dev` cannot start Tauri

Check that:

- Rust is installed
- your OS-specific Tauri dependencies are installed
- `npm install` completed successfully
