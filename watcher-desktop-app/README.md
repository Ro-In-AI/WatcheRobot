# Watcher Workspace

Chinese version: [README.zh-CN.md](./README.zh-CN.md)

Watcher Workspace is the umbrella repository for the Watcher desktop app and server project.

- `Watcher Desktop App/`: Tauri desktop application source, frontend assets, and build configuration
- `Watcher Server/`: server repository included as a Git submodule

## Structure

```text
watcher-desktop-app/
|-- Watcher Desktop App/
|-- Watcher Server/
|-- .gitmodules
`-- README.md
```

## Clone The Repository

Because `Watcher Server/` is a submodule, the recommended clone command is:

```bash
git clone --recurse-submodules git@github.com:ERRORIGHT-AI/watcher-desktop-app.git
```

If you already cloned the repository without submodules, run:

```bash
git submodule update --init --recursive
```

## Update The Submodule

When the `Watcher Server` repository moves forward, update it from the workspace root:

```bash
git submodule update --remote --merge
git add "Watcher Server"
git commit -m "Update Watcher Server submodule"
```

## Common Commands

```bash
cd "Watcher Desktop App"
npm install
npm run dev
```

```bash
cd "Watcher Desktop App"
npm run typecheck
```

## Releases

Desktop builds are published on GitHub Releases:

[Watcher Desktop App Releases](https://github.com/ERRORIGHT-AI/watcher-desktop-app/releases)
