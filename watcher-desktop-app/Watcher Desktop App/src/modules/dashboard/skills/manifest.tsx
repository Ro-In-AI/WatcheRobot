import { Zap } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { skillsQuickAction } from "@/modules/dashboard/skills/definition";
import SkillsWorkspace from "@/modules/dashboard/skills/workspace";

export const skillsModule: DashboardModuleDefinition = {
  id: "skills",
  title: skillsQuickAction.title,
  caption: skillsQuickAction.caption,
  icon: Zap,
  footer: {
    title: "Agent-ready skill setup",
    body: "Keep recommended and installed skills easy to scan so each agent can pick up the right tools without extra friction.",
  },
  surface: "settings",
  render: () => <SkillsWorkspace />,
};
