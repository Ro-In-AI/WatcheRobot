import { Hammer } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { buildQuickAction } from "@/modules/dashboard/explore-build/definition";
import BuildModule from "@/modules/dashboard/explore-build/module";

export const exploreBuildModule: DashboardModuleDefinition = {
  id: "build",
  title: buildQuickAction.title,
  caption: buildQuickAction.caption,
  icon: Hammer,
  footer: {
    title: "SDK workflows and shipping paths",
    body: "Use the lightweight Explore, Build and Deploy map as a focused handoff page from the main dashboard.",
  },
  surface: "canvas",
  includeInSidebar: false,
  render: (context) => (
    <BuildModule
      onBackToDashboard={() => context.navigate("dashboard")}
      onLog={context.addLog}
    />
  ),
};
