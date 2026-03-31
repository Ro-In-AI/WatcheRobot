import type { OpenClawProviderConfig } from "@/modules/openclaw/shared/types";

export interface OpenClawProviderPreset {
  id: string;
  name: string;
  providerId: string;
  websiteUrl?: string;
  settingsConfig: OpenClawProviderConfig;
}

export const openclawProviderPresets: OpenClawProviderPreset[] = [
  {
    id: "custom",
    name: "自定义",
    providerId: "",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "",
      apiKey: "",
      models: [{ id: "", name: "" }],
    },
  },
  {
    id: "bailian",
    name: "阿里云百炼",
    providerId: "bailian",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "",
      models: [
        { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
        { id: "qwen-plus", name: "Qwen Plus" },
        { id: "qwen-turbo", name: "Qwen Turbo" },
      ],
    },
  },
  {
    id: "bailian-coding-plan",
    name: "阿里云百炼 Coding Plan",
    providerId: "bailian-coding-plan",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      api: "anthropic-messages",
      baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      apiKey: "",
      models: [{ id: "qwen3.5-plus", name: "qwen3.5-plus" }],
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    providerId: "deepseek",
    websiteUrl: "https://platform.deepseek.com",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      models: [
        { id: "deepseek-chat", name: "DeepSeek Chat" },
        { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
      ],
    },
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    providerId: "zhipu",
    websiteUrl: "https://open.bigmodel.cn",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "",
      models: [{ id: "glm-4.5", name: "GLM 4.5" }],
    },
  },
  {
    id: "kimi",
    name: "Moonshot Kimi",
    providerId: "kimi",
    websiteUrl: "https://platform.moonshot.cn/console",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://api.moonshot.cn/v1",
      apiKey: "",
      models: [{ id: "kimi-k2-0711-preview", name: "Kimi K2 Preview" }],
    },
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    providerId: "siliconflow",
    websiteUrl: "https://siliconflow.cn",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "",
      models: [
        { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
        { id: "Qwen/Qwen3-Coder-480B-A35B-Instruct", name: "Qwen3 Coder 480B" },
      ],
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    providerId: "openrouter",
    websiteUrl: "https://openrouter.ai",
    settingsConfig: {
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
      models: [
        { id: "openai/gpt-4.1", name: "GPT-4.1" },
        { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    },
  },
];

export function getOpenClawProviderPreset(
  presetId: string,
): OpenClawProviderPreset | undefined {
  return openclawProviderPresets.find((preset) => preset.id === presetId);
}
