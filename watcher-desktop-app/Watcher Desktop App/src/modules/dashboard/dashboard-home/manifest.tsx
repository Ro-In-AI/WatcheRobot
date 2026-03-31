import { LayoutDashboard } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { DASHBOARD_QUICK_ACTIONS } from "@/modules/dashboard/dashboard-home/quick-actions";
import DashboardHomeWorkspace from "@/modules/dashboard/dashboard-home/workspace";

export const dashboardHomeModule: DashboardModuleDefinition = {
  id: "dashboard",
  title: "Dashboard",
  caption: "Robot + AI control",
  icon: LayoutDashboard,
  footer: {
    title: "watcher-server online",
    body: "Collapse the nav into a slim rail without disturbing the robot, controls, logs or AI layout.",
  },
  surface: "canvas",
  keepAlive: true,
  render: (context) => (
    <DashboardHomeWorkspace
      visible={context.active}
      controlReady={context.controlReady}
      hasHardware={context.hasHardware}
      draftServo={context.draftServo}
      recentLogLines={context.recentLogLines}
      connectRobotLabel={context.connectRobotLabel}
      connectRobotDescription={context.connectRobotDescription}
      startingServer={context.startingServer}
      chatExpanded={context.chatExpanded}
      logsExpanded={context.logsExpanded}
      quickActions={DASHBOARD_QUICK_ACTIONS}
      onConnectRobot={context.onConnectRobot}
      onSelectQuickAction={context.navigate}
      onToggleChatExpanded={context.onToggleChatExpanded}
      onToggleLogsExpanded={context.onToggleLogsExpanded}
      onServoChange={context.onServoChange}
    />
  ),
};
