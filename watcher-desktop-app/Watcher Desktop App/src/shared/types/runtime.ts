export interface ComponentStatus {
  installed: boolean;
  version?: string | null;
}

export interface ToolsStatus {
  curl: boolean;
  tar: boolean;
  ca_certificates: boolean;
}

export interface EnvironmentStatus {
  nodejs: ComponentStatus;
  openclaw: ComponentStatus;
  tools: ToolsStatus;
}

export interface IntegrationPaths {
  appRoot: string;
  installerRoot: string;
  assistantRoot: string;
  serverRoot: string;
  wsUrl: string;
}

export type OnboardingServerModule = "asr" | "tts" | "llm" | "dialogue";

export interface WatcherModuleReport {
  config: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

export interface WatcherConfigSnapshot {
  asr: WatcherModuleReport | null;
  tts: WatcherModuleReport | null;
  llm: WatcherModuleReport | null;
  dialogue: WatcherModuleReport | null;
}

export type InstallState =
  | "checking"
  | "ready"
  | "installing"
  | "installed"
  | "error";

export type IntegrationPage = string;
