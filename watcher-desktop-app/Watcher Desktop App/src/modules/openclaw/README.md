# OpenClaw Frontend Domain

`src/modules/openclaw/` 用来承载所有 OpenClaw 相关前端能力。当前已经拆出的模块有：

- `model_config`
- `agent_config`
- `runtime_settings`
- `chat`
- `shared`

后续新增 `heartbeat`、`scheduler`、`settings` 等功能时，应该继续在这个目录下扩展，而不是回到全局平铺。

## 当前结构

```text
src/modules/openclaw/
├── shared/
├── model_config/
├── agent_config/
├── runtime_settings/
└── chat/
```

## 什么时候新建一个 OpenClaw 子模块

满足下面任一条件时，建议拆成独立模块：

- 页面或导航上可以独立出现
- 有自己的后端 command / API
- 有独立的数据结构或状态
- 后续预计会继续扩展

典型例子：

- `heartbeat`
- `scheduler`
- `settings`
- `sessions`

## 子模块推荐结构

```text
src/modules/openclaw/<submodule>/
├── page.tsx        可选，只有有独立 UI 时才需要
├── manifest.tsx    可选，只有需要注册成顶层模块时才需要
├── api.ts
├── components/
├── hooks/
├── lib/
└── shared/
```

## 如何新增 heartbeat / scheduler

1. 创建 `src/modules/openclaw/heartbeat/` 或 `src/modules/openclaw/scheduler/`
2. 编写 `page.tsx`
3. 如果需要独立页面，再编写 `page.tsx`
4. 如果需要顶层导航入口，再编写 `manifest.tsx`
5. 如需和后端交互，编写 `api.ts`
6. 在 `src/app/moduleRegistry.ts` 注册
7. 如需共享 OpenClaw 域内类型或常量，优先放到 `src/modules/openclaw/shared/`

## shared 的使用规则

`src/modules/openclaw/shared/` 只放以下内容：

- 多个 OpenClaw 子模块都会用到的类型
- 多个 OpenClaw 子模块都会用到的 provider preset / mapper / 常量
- 域内共享 API 适配层

不要把只属于单个子模块的实现放到这里，否则很快会重新长成一个大杂烩。

## 与后端的对齐约定

前端和后端保持：

- 同名业务域：都叫 `openclaw`
- 同名子域：`agent_config`、`model_config`、`runtime_settings`、`chat`
- 同边界：每个子域只处理自己的配置、状态或交互
- 不混放：前端代码只在 `src/modules/openclaw/`，后端代码只在 `src-tauri/src/modules/openclaw/`

其中 `runtime_settings` 目前在前端是 service-only 子域，还没有单独页面，这种情况是允许的。
