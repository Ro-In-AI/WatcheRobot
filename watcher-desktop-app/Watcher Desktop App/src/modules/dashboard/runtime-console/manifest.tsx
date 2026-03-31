import { TerminalSquare } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import RuntimeConsoleWorkspace from "@/modules/dashboard/runtime-console/workspace";

export const runtimeConsoleModule: DashboardModuleDefinition = {
  id: "runtime",
  title: "Runtime Console",
  caption: "Sessions and health",
  icon: TerminalSquare,
  footer: {
    title: "Session health and transport visibility",
    body: "Surface reconnects, channel swaps and runtime failures before they affect live interaction.",
  },
  surface: "settings",
  render: (context) => (
    <RuntimeConsoleWorkspace
      isRunning={context.isRunning}
      socketState={context.socketState}
      logs={context.logs}
      startingServer={context.startingServer}
      onStartServer={context.onStartServer}
      onClearLogs={context.onClearLogs}
    />
  ),
};
