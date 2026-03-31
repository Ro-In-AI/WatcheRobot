# Frontend Modules

`src/modules/` 是前端业务模块的主入口。新功能优先按模块落在这里，不要再把新代码继续堆到旧的 `src/components`、`src/lib`、`src/hooks`、`src/types` 这些兼容层里。

对于同时存在前后端实现的业务域，优先和 `src-tauri/src/modules/` 保持：

- 同名业务域
- 同名子域
- 同边界
- 同职责

但不要把前后端代码混放到同一个目录里。

## 目录原则

- 一个文件夹代表一个业务模块。
- 模块内部优先自包含：页面、模块 API、模块内组件、模块内 hooks、模块内状态，尽量放在同一个目录下。
- 真正跨模块复用的能力放到 `src/shared/`。
- 某个领域内部共享但不适合升到全局的内容，放到领域自己的 `shared/`，例如 `src/modules/openclaw/shared/`。

## 推荐结构

```text
src/modules/<module>/
├── page.tsx
├── manifest.tsx
├── api.ts
├── service/
├── components/
├── hooks/
└── lib/
```

不是每个模块都必须有完整结构，但至少应该有明确的页面入口和注册入口。

如果模块本身就是一个“复合业务域”，例如 `openclaw`，优先继续往下拆成和后端一致的子域目录，而不是把所有实现都堆到一个 `shared/api.ts` 里直接对外使用。

## 如何新增一个前端模块

1. 在 `src/modules/` 下创建模块目录。
2. 新建 `page.tsx`，只负责模块页面本身。
3. 新建 `manifest.tsx`，导出 `AppModuleDefinition`。
4. 如果模块需要和后端交互，在模块目录下新建 `api.ts`。
5. 在 `src/app/moduleRegistry.ts` 中注册模块。

## 注册入口

前端模块通过 `manifest.tsx` 暴露给应用壳层，然后统一在 `src/app/moduleRegistry.ts` 注册。

最小示例：

```tsx
import { Activity } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import HeartbeatPage from "@/modules/openclaw/heartbeat/page";

export const openclawHeartbeatModule: AppModuleDefinition = {
  id: "openclaw-heartbeat",
  label: "心跳",
  title: "OpenClaw Heartbeat",
  group: "openclaw",
  icon: Activity,
  render: () => <HeartbeatPage />,
};
```

然后把它加入 `src/app/moduleRegistry.ts`。

## 开发约束

- 不要在模块外直接深度依赖别的模块内部文件。
- 模块之间优先通过各自公开入口交互。
- 旧路径下的文件目前大多是兼容用 re-export，新代码不要继续往那里写。
- 对于前后端都有的业务域，新增子模块时优先复用后端已存在的命名，例如 `agent_config`、`model_config`、`runtime_settings`。
