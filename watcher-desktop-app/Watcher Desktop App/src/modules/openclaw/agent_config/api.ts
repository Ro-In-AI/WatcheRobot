import { openclawApi } from "@/modules/openclaw/shared/api";
import type {
  OpenClawAgent,
  OpenClawAgentSkillsInventory,
  OpenClawSessionBindingMatch,
} from "@/modules/openclaw/shared/types";

export const agentConfigApi = {
  getAgents() {
    return openclawApi.getAgents();
  },
  getAgentSkills(agentId: string): Promise<OpenClawAgentSkillsInventory> {
    return openclawApi.getAgentSkills(agentId);
  },
  installAgentSkill(agentId: string, skillSlug: string): Promise<OpenClawAgentSkillsInventory> {
    return openclawApi.installAgentSkill(agentId, skillSlug);
  },
  setAgent(agentId: string, agent: OpenClawAgent) {
    return openclawApi.setAgent(agentId, agent);
  },
  removeAgent(agentId: string) {
    return openclawApi.removeAgent(agentId);
  },
  getAgentWorkspaceDocs(agentId: string) {
    return openclawApi.getAgentWorkspaceDocs(agentId);
  },
  setAgentWorkspaceDoc(agentId: string, fileName: string, content: string) {
    return openclawApi.setAgentWorkspaceDoc(agentId, fileName, content);
  },
  getSessionBindingsOverview() {
    return openclawApi.getSessionBindingsOverview();
  },
  setSessionBinding(agentId: string | null, match: OpenClawSessionBindingMatch) {
    return openclawApi.setSessionBinding(agentId, match);
  },
};
