import { LayoutDashboard } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import DashboardPage from "@/modules/dashboard/page";

export const dashboardModule: AppModuleDefinition = {
  id: "dashboard",
  label: "Dashboard",
  title: "Control Hub",
  group: "core",
  icon: LayoutDashboard,
  render: ({ wsUrl }) => <DashboardPage wsUrl={wsUrl} />,
};
