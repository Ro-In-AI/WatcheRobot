import { creatorModeQuickAction } from "@/modules/dashboard/creator-mode/definition";
import { buildQuickAction } from "@/modules/dashboard/explore-build/definition";
import { expressionsQuickAction } from "@/modules/dashboard/expressions/definition";
import { skillsQuickAction } from "@/modules/dashboard/skills/definition";

export const DASHBOARD_QUICK_ACTIONS = [
  skillsQuickAction,
  creatorModeQuickAction,
  expressionsQuickAction,
  buildQuickAction,
] as const;
