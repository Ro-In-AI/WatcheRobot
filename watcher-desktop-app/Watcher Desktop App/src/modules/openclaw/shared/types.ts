// OpenClaw 模型配置
export interface OpenClawModel {
  id: string;
  name?: string;
  alias?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

// OpenClaw 默认模型配置 (agents.defaults.model)
export interface OpenClawDefaultModel {
  primary: string;
  fallbacks?: string[];
  [key: string]: unknown;
}

// OpenClaw 模型目录条目 (agents.defaults.models)
export interface OpenClawModelCatalogEntry {
  alias?: string;
  [key: string]: unknown;
}

// OpenClaw agents.defaults 完整配置
export interface OpenClawAgentsDefaults {
  model?: OpenClawDefaultModel;
  models?: Record<string, OpenClawModelCatalogEntry>;
  timeoutSeconds?: number;
  timeout?: number;
  workspace?: string;
  contextTokens?: number;
  maxConcurrent?: number;
  [key: string]: unknown;
}

export interface OpenClawAgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface OpenClawAgentRuntimeAcp {
  agent?: string;
  backend?: string;
  mode?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface OpenClawAgentRuntime {
  type?: string;
  acp?: OpenClawAgentRuntimeAcp;
  [key: string]: unknown;
}

export interface OpenClawAgentSubagents {
  allowAgents?: string[];
  [key: string]: unknown;
}

export interface OpenClawAgent {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string | OpenClawDefaultModel;
  identity?: OpenClawAgentIdentity;
  runtime?: OpenClawAgentRuntime;
  subagents?: OpenClawAgentSubagents;
  tools?: OpenClawToolsConfig;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenClawAgentDetails {
  agent: OpenClawAgent;
  authProfilesPath: string;
  authProfilesExists: boolean;
}

export interface OpenClawAgentWorkspaceDocs {
  workspace: string;
  docs: Record<string, string>;
}

export interface OpenClawInstalledSkill {
  id: string;
  name: string;
  description?: string;
  path: string;
  skillFilePath: string;
}

export interface OpenClawAgentSkillsInventory {
  agentId: string;
  workspace: string;
  skillsDir: string;
  skills: OpenClawInstalledSkill[];
}

export interface OpenClawSessionPeerMatch {
  kind: string;
  id: string;
}

export interface OpenClawSessionBindingMatch {
  channel: string;
  peer: OpenClawSessionPeerMatch;
}

export interface OpenClawSessionBinding {
  agentId: string;
  match: OpenClawSessionBindingMatch;
}

export interface OpenClawSessionSummary {
  key: string;
  ownerAgentId: string;
  sessionId?: string;
  updatedAt?: number;
  displayName?: string;
  chatType?: string;
  channel?: string;
  peerKind?: string;
  peerId?: string;
  title: string;
  subtitle?: string;
  bindable: boolean;
  match?: OpenClawSessionBindingMatch;
  boundAgentId?: string | null;
}

export interface OpenClawSessionBindingsOverview {
  bindings: OpenClawSessionBinding[];
  sessions: OpenClawSessionSummary[];
}

// OpenClaw env 配置
export interface OpenClawEnvConfig {
  [key: string]: unknown;
}

// OpenClaw tools 配置
export type OpenClawToolsProfile = "minimal" | "coding" | "messaging" | "full";

export interface OpenClawToolsConfig {
  profile?: OpenClawToolsProfile | string;
  allow?: string[];
  deny?: string[];
  [key: string]: unknown;
}

// OpenClaw Provider 配置 (models.providers 格式)
export interface OpenClawProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  base_url?: string;
  api_key?: string;
  api?: string;
  models?: OpenClawModel[];
  headers?: Record<string, string>;
  [key: string]: unknown;
}

// OpenClaw Model Entry 配置 (models.entries 格式)
export interface OpenClawModelEntry {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

// 健康检查警告
export interface OpenClawHealthWarning {
  code: string;
  message: string;
  path?: string;
}

// 写入结果
export interface OpenClawWriteOutcome {
  backupPath?: string;
  warnings: OpenClawHealthWarning[];
}
