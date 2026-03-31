import { agentConfigModule } from "@/modules/dashboard/agent-config/manifest";
import { channelConfigModule } from "@/modules/dashboard/channel-config/manifest";
import { creatorModeModule } from "@/modules/dashboard/creator-mode/manifest";
import { dashboardHomeModule } from "@/modules/dashboard/dashboard-home/manifest";
import { expressionsModule } from "@/modules/dashboard/expressions/manifest";
import { exploreBuildModule } from "@/modules/dashboard/explore-build/manifest";
import { modelSettingsModule } from "@/modules/dashboard/model-settings/manifest";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import { runtimeConsoleModule } from "@/modules/dashboard/runtime-console/manifest";
import { skillsModule } from "@/modules/dashboard/skills/manifest";

export const dashboardModules: DashboardModuleDefinition[] = [
  dashboardHomeModule,
  expressionsModule,
  channelConfigModule,
  modelSettingsModule,
  agentConfigModule,
  skillsModule,
  creatorModeModule,
  runtimeConsoleModule,
  exploreBuildModule,
];

export const dashboardModuleById = Object.fromEntries(
  dashboardModules.map((module) => [module.id, module]),
) as Record<DashboardModuleDefinition["id"], DashboardModuleDefinition>;
