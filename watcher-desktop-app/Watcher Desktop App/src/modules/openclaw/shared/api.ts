import { invoke } from "@tauri-apps/api/core";
import { startDebugTimer } from "@/shared/lib/debugLog";
import type {
  OpenClawDefaultModel,
  OpenClawAgent,
  OpenClawAgentDetails,
  OpenClawAgentSkillsInventory,
  OpenClawAgentWorkspaceDocs,
  OpenClawAgentsDefaults,
  OpenClawEnvConfig,
  OpenClawToolsConfig,
  OpenClawSessionBindingsOverview,
  OpenClawSessionBindingMatch,
  OpenClawHealthWarning,
  OpenClawWriteOutcome,
  OpenClawProviderConfig,
} from "@/modules/openclaw/shared/types";

async function invokeOpenClaw<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const timer = startDebugTimer("OpenClawApi", `invoke ${command}`, args);

  try {
    const result = await invoke<T>(command, args);
    timer.success(`invoke ${command} completed`);
    return result;
  } catch (error) {
    timer.fail(error, `invoke ${command} failed`);
    throw error;
  }
}

/**
 * OpenClaw configuration API
 */
export const openclawApi = {
  // ============================================================
  // Provider Configuration
  // ============================================================

  async getProviderIds(): Promise<string[]> {
    return await invokeOpenClaw("get_openclaw_provider_ids");
  },

  async getProvider(providerId: string): Promise<OpenClawProviderConfig | null> {
    return await invokeOpenClaw("get_openclaw_provider", { providerId });
  },

  async setProvider(
    providerId: string,
    config: OpenClawProviderConfig,
  ): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_provider", { providerId, config });
  },

  async removeProvider(providerId: string): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("remove_openclaw_provider", { providerId });
  },

  // ============================================================
  // Agents Defaults Configuration
  // ============================================================

  async getDefaultModel(): Promise<OpenClawDefaultModel | null> {
    return await invokeOpenClaw("get_openclaw_default_model");
  },

  async setDefaultModel(
    model: OpenClawDefaultModel,
  ): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_default_model", { model });
  },

  async getAgentsDefaults(): Promise<OpenClawAgentsDefaults | null> {
    return await invokeOpenClaw("get_openclaw_agents_defaults");
  },

  async setAgentsDefaults(
    defaults: OpenClawAgentsDefaults,
  ): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_agents_defaults", { defaults });
  },

  async getAgents(): Promise<OpenClawAgentDetails[]> {
    return await invokeOpenClaw("get_openclaw_agents");
  },

  async getAgentSkills(agentId: string): Promise<OpenClawAgentSkillsInventory> {
    return await invokeOpenClaw("get_openclaw_agent_skills", { agentId });
  },

  async installAgentSkill(
    agentId: string,
    skillSlug: string,
  ): Promise<OpenClawAgentSkillsInventory> {
    return await invokeOpenClaw("install_openclaw_agent_skill", { agentId, skillSlug });
  },

  async setAgent(
    agentId: string,
    agent: OpenClawAgent,
  ): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_agent", { agentId, agent });
  },

  async removeAgent(agentId: string): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("remove_openclaw_agent", { agentId });
  },

  async getAgentWorkspaceDocs(agentId: string): Promise<OpenClawAgentWorkspaceDocs> {
    return await invokeOpenClaw("get_openclaw_agent_workspace_docs", { agentId });
  },

  async setAgentWorkspaceDoc(
    agentId: string,
    fileName: string,
    content: string,
  ): Promise<void> {
    return await invokeOpenClaw("set_openclaw_agent_workspace_doc", {
      agentId,
      fileName,
      content,
    });
  },

  async getSessionBindingsOverview(): Promise<OpenClawSessionBindingsOverview> {
    return await invokeOpenClaw("get_openclaw_session_bindings_overview");
  },

  async setSessionBinding(
    agentId: string | null,
    match: OpenClawSessionBindingMatch,
  ): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_session_binding", { agentId, match });
  },

  // ============================================================
  // Env Configuration
  // ============================================================

  async getEnv(): Promise<OpenClawEnvConfig> {
    return await invokeOpenClaw("get_openclaw_env");
  },

  async setEnv(env: OpenClawEnvConfig): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_env", { env });
  },

  // ============================================================
  // Tools Configuration
  // ============================================================

  async getTools(): Promise<OpenClawToolsConfig> {
    return await invokeOpenClaw("get_openclaw_tools");
  },

  async setTools(tools: OpenClawToolsConfig): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_tools", { tools });
  },

  // ============================================================
  // Health Check
  // ============================================================

  async scanHealth(): Promise<OpenClawHealthWarning[]> {
    return await invokeOpenClaw("scan_openclaw_health");
  },

  // ============================================================
  // Models Configuration
  // ============================================================

  async getModels(): Promise<Record<string, OpenClawProviderConfig>> {
    return await invokeOpenClaw("get_openclaw_models");
  },

  async ensureModelsField(): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("ensure_openclaw_models_field");
  },

  async getConfig(): Promise<Record<string, unknown>> {
    return await invokeOpenClaw("get_openclaw_config");
  },

  async setConfig(config: Record<string, unknown>): Promise<OpenClawWriteOutcome> {
    return await invokeOpenClaw("set_openclaw_config", { config });
  },
};
