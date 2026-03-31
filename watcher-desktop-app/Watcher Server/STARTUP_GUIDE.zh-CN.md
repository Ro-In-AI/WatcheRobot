# 启动指南

[English](STARTUP_GUIDE.md) | 简体中文

这份文档用于快速把当前仓库里的 Watcher Server 跑起来。

## 前置条件

- 已安装 Conda 或 Miniconda
- 已根据 [`environment.yml`](environment.yml) 创建 Python 环境
- 已在 [`config/`](config/) 中准备好有效配置
- 如果要跑 OpenClaw 模式，需要本地可用的 OpenClaw runtime 和 agent

## 第一步：创建环境

```bash
conda env create -f environment.yml
conda activate watcher-server
```

## 第二步：准备配置

如果本地还没有系统配置，可以先复制：

```bash
cp config/system.example.json config/system.json
```

然后检查这些文件：

- [`config/system.json`](config/system.json)
- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)
- [`config/dialogue.json`](config/dialogue.json)
- [`config/scheduler.json`](config/scheduler.json)

关键默认值：

- WebSocket: `ws://0.0.0.0:8765`
- UDP discovery: `37020`
- HTTP 管理接口: `http://127.0.0.1:8766`

## 第三步：启动服务

### 直接启动

```bash
python main.py
```

### 使用脚本

```bash
chmod +x start.sh
./start.sh
```

Windows:

```cmd
start.bat
```

## 第四步：验证服务

### 检查 HTTP 管理接口

```bash
curl http://127.0.0.1:8766/api/admin/health
```

### 预期返回

```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "base_url": "http://127.0.0.1:8766"
  }
}
```

### 查看日志

服务日志会写到 [`logs/`](logs/)。

## 常见启动问题

### `config/system.json` 不存在

先从 [`config/system.example.json`](config/system.example.json) 复制。

### OpenClaw 请求失败

确认：

- [`config/dialogue.json`](config/dialogue.json) 已设置为 `openclaw`
- 配置的 OpenClaw backend 可用
- 本地 OpenClaw runtime 正在运行

### 提醒 HTTP 请求打错端口

HTTP 管理接口要用 `8766`，不是 `8765`。

### Provider 鉴权失败

检查这些文件里的鉴权配置：

- [`config/asr.json`](config/asr.json)
- [`config/tts.json`](config/tts.json)
- [`config/llm.json`](config/llm.json)

