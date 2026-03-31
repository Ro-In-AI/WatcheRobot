import { Server } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import ServerPage from "@/modules/server/page";

export const serverModule: AppModuleDefinition = {
  id: "server",
  label: "服务",
  title: "启动与日志",
  group: "runtime",
  icon: Server,
  render: ({ wsUrl }) => <ServerPage wsUrl={wsUrl} />,
};
