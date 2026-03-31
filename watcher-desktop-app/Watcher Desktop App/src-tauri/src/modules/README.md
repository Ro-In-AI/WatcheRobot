# Tauri Modules

`src-tauri/src/modules/` 是桌面端 Rust 业务模块的入口。现在的结构已经从顶层平铺文件改成了按模块分目录组织，后续也应继续沿用这个模式。

对于同时存在前端实现的业务域，优先和 `src/modules/` 保持：

- 同名业务域
- 同名子域
- 同边界
- 同职责

但前后端代码仍然分别放在自己的根目录中，不混放。

## 目录原则

- 一个目录对应一个后端业务模块。
- 模块目录内放自己的 command 和实现。
- 真正跨模块的基础能力放到 `src-tauri/src/shared/`。
- 领域内共享能力放到领域自己的 `shared/`，例如 `src-tauri/src/modules/openclaw/shared/`。

## 当前结构

```text
src-tauri/src/modules/
├── installer/
├── server/
└── openclaw/
```

## 推荐结构

```text
src-tauri/src/modules/<module>/
├── mod.rs
├── commands.rs
├── service.rs
└── shared/
```

如果模块还要继续细分，可以在模块目录下再拆子模块。

## 如何新增一个后端模块

1. 在 `src-tauri/src/modules/` 下创建新目录。
2. 新建 `mod.rs`，导出该模块的子文件。
3. 新建 `commands.rs`，放 Tauri `#[tauri::command]` 入口。
4. 新建 `service.rs` 或其他实现文件。
5. 在 `src-tauri/src/modules/mod.rs` 中注册模块。
6. 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中挂上对应 command。
7. 如果模块有全局状态，在 `src-tauri/src/lib.rs` 里加 `.manage(...)`。

## 注册入口

后端模块注册有两个位置：

- `src-tauri/src/modules/mod.rs`
- `src-tauri/src/lib.rs`

缺一不可。

## 开发约束

- 不要重新引入旧的顶层 `commands/` 平铺模式。
- command 只负责参数接收和转发，业务逻辑放到模块内部实现。
- 模块之间尽量通过公开接口交互，不要直接依赖彼此内部细节。
- 如果前端已有对应子域，后端新增子域时优先沿用相同命名。
