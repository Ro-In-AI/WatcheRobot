import { Workflow } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import ChannelConfigWorkspace from "@/modules/dashboard/channel-config/workspace";

export const channelConfigModule: DashboardModuleDefinition = {
  id: "channel",
  title: "OpenClaw Config",
  caption: "Providers and routes",
  icon: Workflow,
  footer: {
    title: "Provider routing and defaults",
    body: "Keep model channels explicit and readable so route changes never feel hidden behind forms.",
  },
  surface: "settings",
  render: () => <ChannelConfigWorkspace />,
};
