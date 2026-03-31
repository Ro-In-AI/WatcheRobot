# Watcher Workspace

English version: [README.md](./README.md)

Watcher Workspace 是 Watcher 桌面端与服务端的工作区仓库。

- `Watcher Desktop App/`：Tauri 桌面应用源码、前端资源与构建配置
- `Watcher Server/`：以 Git 子模块形式接入的服务端仓库

## 目录结构

```text
watcher-desktop-app/
|-- Watcher Desktop App/
|-- Watcher Server/
|-- .gitmodules
`-- README.md
```

## 克隆仓库

由于 `Watcher Server/` 是子模块，建议使用下面的命令完整拉取：

```bash
git clone --recurse-submodules git@github.com:ERRORIGHT-AI/watcher-desktop-app.git
```

如果你已经完成普通克隆，可以补执行：

```bash
git submodule update --init --recursive
```

## 更新子模块

当 `Watcher Server` 仓库有新提交时，可以在主仓库根目录执行：

```bash
git submodule update --remote --merge
git add "Watcher Server"
git commit -m "Update Watcher Server submodule"
```

## 常用命令

```bash
cd "Watcher Desktop App"
npm install
npm run dev
```

```bash
cd "Watcher Desktop App"
npm run typecheck
```

## 发布下载

桌面端安装包发布在 GitHub Releases 页面：

[Watcher Desktop App Releases](https://github.com/ERRORIGHT-AI/watcher-desktop-app/releases)
