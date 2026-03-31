import { Bot } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import AgentConfigPage from "@/modules/openclaw/agent_config/page";

export const openclawAgentConfigModule: AppModuleDefinition = {
  id: "openclaw-agent-config",
  label: "Agent",
  title: "OpenClaw Agent",
  group: "openclaw",
  icon: Bot,
  render: () => <AgentConfigPage />,
};
