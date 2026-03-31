import { Radio } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import ModelConfigPage from "@/modules/openclaw/model_config/page";

export const openclawModelConfigModule: AppModuleDefinition = {
  id: "openclaw-model-config",
  label: "模型",
  title: "模型配置",
  group: "openclaw",
  icon: Radio,
  render: () => <ModelConfigPage />,
};
