import { SlidersHorizontal } from "lucide-react";
import type { DashboardModuleDefinition } from "@/modules/dashboard/module-definition";
import ModelSettingsWorkspace from "@/modules/dashboard/model-settings/workspace";

export const modelSettingsModule: DashboardModuleDefinition = {
  id: "model",
  title: "Model Settings",
  caption: "ASR / TTS / LLM",
  icon: SlidersHorizontal,
  footer: {
    title: "Speech and dialogue models",
    body: "Keep ASR, TTS and dialogue routing explicit so each channel stays easy to reason about.",
  },
  surface: "settings",
  render: ({ wsUrl }) => <ModelSettingsWorkspace wsUrl={wsUrl} />,
};
