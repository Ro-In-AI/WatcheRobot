import { PencilLine } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { creatorModeQuickAction } from "@/modules/dashboard/creator-mode/definition";
import CreatorModeWorkspace from "@/modules/dashboard/creator-mode/workspace";

export const creatorModeModule: DashboardModuleDefinition = {
  id: "creator-mode",
  title: creatorModeQuickAction.title,
  caption: creatorModeQuickAction.caption,
  icon: PencilLine,
  footer: {
    title: "Behavior authoring workspace",
    body: "Separate creation flows from the live dashboard so prompts, mappings and new behaviors can evolve without touching runtime controls.",
  },
  surface: "settings",
  render: () => <CreatorModeWorkspace />,
};
