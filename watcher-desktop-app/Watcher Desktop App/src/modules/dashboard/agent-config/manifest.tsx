import { Bot } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import AgentConfigWorkspace from "@/modules/dashboard/agent-config/workspace";

export const agentConfigModule: DashboardModuleDefinition = {
  id: "agent",
  title: "Agent Config",
  caption: "Persona and bindings",
  icon: Bot,
  footer: {
    title: "Agent voice and workspace docs",
    body: "Tune the persona, workspace files and live session binding in one place before launch.",
  },
  surface: "settings",
  render: () => <AgentConfigWorkspace />,
};
