import { Sparkles } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { expressionsQuickAction } from "@/modules/dashboard/expressions/definition";
import ExpressionsModule from "@/modules/dashboard/expressions/module";

export const expressionsModule: DashboardModuleDefinition = {
  id: "expressions",
  title: expressionsQuickAction.title,
  caption: expressionsQuickAction.caption,
  icon: Sparkles,
  footer: {
    title: "Expression presets and moods",
    body: "Keep the robot state library easy to scan so expression testing feels immediate even before runtime triggers are wired.",
  },
  surface: "canvas",
  keepAlive: true,
  render: (context) => (
    <ExpressionsModule
      active={context.active}
      online={context.controlReady}
      draftServo={context.draftServo}
      recentLogLines={context.recentLogLines}
      onBackToDashboard={() => context.navigate("dashboard")}
      onLog={context.addLog}
      onSendJson={context.sendJson}
    />
  ),
};
