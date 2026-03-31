import type { AppModuleDefinition } from "@/app/module-definition";
import { dashboardModule } from "@/modules/dashboard/manifest";
import { installerModule } from "@/modules/installer/manifest";
import { openclawAgentConfigModule } from "@/modules/openclaw/agent_config/manifest";
import { openclawChatModule } from "@/modules/openclaw/chat/manifest";
import { openclawModelConfigModule } from "@/modules/openclaw/model_config/manifest";
import { serverModule } from "@/modules/server/manifest";

export const appModules: AppModuleDefinition[] = [
  dashboardModule,
  installerModule,
  openclawModelConfigModule,
  openclawAgentConfigModule,
  openclawChatModule,
  serverModule,
];
