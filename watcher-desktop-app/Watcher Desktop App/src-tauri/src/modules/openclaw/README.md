# OpenClaw Tauri Domain

`src-tauri/src/modules/openclaw/` 是 OpenClaw 领域的后端实现目录。当前已经按能力拆成：

- `model_config`
- `agent_config`
- `runtime_settings`
- `chat`
- `shared`

## 当前职责划分

- `model_config`
  - provider / model / default model 相关接口
- `agent_config`
  - agent / workspace docs / session binding 相关接口
- `runtime_settings`
  - env / tools / health / runtime defaults 相关接口
- `chat`
  - OpenClaw chat gateway 和会话交互
- `shared`
  - OpenClaw 领域共享能力，例如配置存储

## 如何新增 heartbeat / scheduler

推荐直接在这里新增子目录：

```text
src-tauri/src/modules/openclaw/heartbeat/
src-tauri/src/modules/openclaw/scheduler/
```

推荐结构：

```text
src-tauri/src/modules/openclaw/<submodule>/
├── mod.rs
├── commands.rs
└── service.rs
```

## 注册步骤

1. 在 `src-tauri/src/modules/openclaw/mod.rs` 中导出子模块。
2. 在子模块中实现 `commands.rs`。
3. 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中注册 command。
4. 如果需要共享配置存储或通用类型，放进 `src-tauri/src/modules/openclaw/shared/`。

## 关于 shared/config_store.rs

当前 `shared/config_store.rs` 仍然承载了较多底层实现，它现在的角色更接近 OpenClaw 配置仓库。

后续继续拆分时建议遵循下面的顺序：

1. 先保证上层子模块边界稳定
2. 再把 `config_store.rs` 的内部实现逐步抽到对应子模块
3. 不要让前端接口和 Tauri command 名称频繁变化

这样可以在持续演进的同时，避免接口反复震荡。
