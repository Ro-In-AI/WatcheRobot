import { openclawApi } from "@/modules/openclaw/shared/api";
import type {
  OpenClawEnvConfig,
  OpenClawHealthWarning,
  OpenClawToolsConfig,
} from "@/modules/openclaw/shared/types";

export const runtimeSettingsApi = {
  getEnv(): Promise<OpenClawEnvConfig> {
    return openclawApi.getEnv();
  },
  setEnv(env: OpenClawEnvConfig) {
    return openclawApi.setEnv(env);
  },
  getTools(): Promise<OpenClawToolsConfig> {
    return openclawApi.getTools();
  },
  setTools(tools: OpenClawToolsConfig) {
    return openclawApi.setTools(tools);
  },
  scanHealth(): Promise<OpenClawHealthWarning[]> {
    return openclawApi.scanHealth();
  },
};
