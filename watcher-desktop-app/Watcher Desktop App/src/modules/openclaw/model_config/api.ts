import { openclawApi } from "@/modules/openclaw/shared/api";
import type { OpenClawDefaultModel, OpenClawProviderConfig } from "@/modules/openclaw/shared/types";

export const modelConfigApi = {
  getModels() {
    return openclawApi.getModels();
  },
  getDefaultModel(): Promise<OpenClawDefaultModel | null> {
    return openclawApi.getDefaultModel();
  },
  setDefaultModel(model: OpenClawDefaultModel) {
    return openclawApi.setDefaultModel(model);
  },
  setProvider(providerId: string, config: OpenClawProviderConfig) {
    return openclawApi.setProvider(providerId, config);
  },
  removeProvider(providerId: string) {
    return openclawApi.removeProvider(providerId);
  },
};
