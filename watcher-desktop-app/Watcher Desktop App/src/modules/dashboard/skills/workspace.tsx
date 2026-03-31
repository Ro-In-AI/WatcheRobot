import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { agentConfigApi } from "@/modules/openclaw/agent_config/api";
import { RECOMMENDED_SKILLS } from "@/modules/dashboard/skills/recommended";
import type {
  OpenClawAgentDetails,
  OpenClawAgentSkillsInventory,
} from "@/modules/openclaw/shared/types";
import { cn } from "@/shared/lib/cn";
import StatusBadge from "@/shared/ui/StatusBadge";

type SkillsTab = "recommended" | "installed";

function getAgentLabel(agent: OpenClawAgentDetails) {
  return agent.agent.name?.trim() || agent.agent.id;
}

function formatInstalledCount(count: number) {
  return `${count} skill${count === 1 ? "" : "s"} installed`;
}

function normalizeSkillKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isRecommendedSkillInstalled(
  skill: (typeof RECOMMENDED_SKILLS)[number],
  installedSkills: OpenClawAgentSkillsInventory["skills"],
) {
  const knownKeys = new Set(
    [skill.id, skill.slug, skill.slug.split("/").pop() ?? skill.slug, skill.name]
      .map(normalizeSkillKey)
      .filter(Boolean),
  );

  return installedSkills.some((installedSkill) => {
    const installedKeys = [
      installedSkill.id,
      installedSkill.name,
      installedSkill.path.split("/").pop() ?? "",
    ]
      .map(normalizeSkillKey)
      .filter(Boolean);

    return installedKeys.some((key) => knownKeys.has(key));
  });
}

export default function SkillsWorkspace() {
  const [activeTab, setActiveTab] = useState<SkillsTab>("recommended");
  const [agents, setAgents] = useState<OpenClawAgentDetails[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [inventoryByAgentId, setInventoryByAgentId] = useState<
    Record<string, OpenClawAgentSkillsInventory>
  >({});
  const [loading, setLoading] = useState(true);
  const [installingSkillId, setInstallingSkillId] = useState("");

  const refresh = async () => {
    setLoading(true);

    try {
      const nextAgents = await agentConfigApi.getAgents();
      const nextInventories = await Promise.all(
        nextAgents.map(({ agent }) => agentConfigApi.getAgentSkills(agent.id)),
      );
      const nextInventoryByAgentId = Object.fromEntries(
        nextInventories.map((inventory) => [inventory.agentId, inventory]),
      );

      setAgents(nextAgents);
      setInventoryByAgentId(nextInventoryByAgentId);
      setSelectedAgentId((current) => {
        if (current && nextAgents.some(({ agent }) => agent.id === current)) {
          return current;
        }

        return nextAgents[0]?.agent.id ?? "";
      });
    } catch (reason) {
      toast.error("Failed to load OpenClaw skills", {
        description: String(reason),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selectedAgent = useMemo(
    () => agents.find(({ agent }) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedInventory = useMemo(
    () => (selectedAgentId ? inventoryByAgentId[selectedAgentId] ?? null : null),
    [inventoryByAgentId, selectedAgentId],
  );

  const installedSkills = useMemo(
    () =>
      [...(selectedInventory?.skills ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [selectedInventory],
  );

  const agentStatus = useMemo(
    () =>
      agents.map((agent) => ({
        id: agent.agent.id,
        label: getAgentLabel(agent),
        installedCount: inventoryByAgentId[agent.agent.id]?.skills.length ?? 0,
      })),
    [agents, inventoryByAgentId],
  );

  const handleInstall = async (skill: (typeof RECOMMENDED_SKILLS)[number]) => {
    if (!selectedAgentId || installingSkillId) {
      return;
    }

    const targetAgentLabel = selectedAgent ? getAgentLabel(selectedAgent) : selectedAgentId;
    setInstallingSkillId(skill.id);

    try {
      const inventory = await agentConfigApi.installAgentSkill(selectedAgentId, skill.slug);
      setInventoryByAgentId((current) => ({
        ...current,
        [inventory.agentId]: inventory,
      }));
      toast.success("Skill installed", {
        description: `${skill.name} was installed for ${targetAgentLabel}.`,
      });
    } catch (reason) {
      toast.error("Failed to install skill", {
        description: String(reason),
      });
    } finally {
      setInstallingSkillId("");
    }
  };

  const emptyInstalledLabel = selectedAgent ? getAgentLabel(selectedAgent) : "this agent";

  return (
    <div className="skills-workspace">
      <header className="skills-workspace__header">
        <h1>Skills</h1>
      </header>

      <section className="skills-workspace__controls">
        <label className="skills-agent-picker">
          <span>Target Agent</span>
          <div className="skills-agent-picker__select-shell">
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              aria-label="Select target agent"
              disabled={loading || agents.length === 0 || Boolean(installingSkillId)}
            >
              {agents.length === 0 ? (
                <option value="">No agents</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.agent.id} value={agent.agent.id}>
                    {getAgentLabel(agent)}
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={16} strokeWidth={2.1} aria-hidden="true" />
          </div>
        </label>

        <div className="skills-agent-status-grid" aria-label="Agent skill status">
          {agentStatus.map((agent) => (
            <article
              key={agent.id}
              className={cn(
                "skills-agent-status",
                agent.id === selectedAgentId && "is-active",
              )}
            >
              <div className="skills-agent-status__head">
                <strong>{agent.label}</strong>
                {agent.id === selectedAgentId ? <StatusBadge tone="info">Target</StatusBadge> : null}
              </div>
              <span>{formatInstalledCount(agent.installedCount)}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="skills-workspace__tabs" role="tablist" aria-label="Skill views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "recommended"}
          className={cn("skills-tab", activeTab === "recommended" && "is-active")}
          onClick={() => setActiveTab("recommended")}
        >
          Recommended
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "installed"}
          className={cn("skills-tab", activeTab === "installed" && "is-active")}
          onClick={() => setActiveTab("installed")}
        >
          Installed
        </button>
      </div>

      {activeTab === "recommended" ? (
        <section className="skills-list" aria-label={`Recommended skills for ${emptyInstalledLabel}`}>
          {loading ? (
            <div className="skills-empty-state">
              <strong>Loading skills</strong>
              <p>Reading agents and workspace skill folders from OpenClaw.</p>
            </div>
          ) : (
            RECOMMENDED_SKILLS.map((skill) => {
              const isInstalled = isRecommendedSkillInstalled(skill, installedSkills);
              const isInstalling = installingSkillId === skill.id;

              return (
                <article key={skill.id} className="skills-item">
                  <div className="skills-item__copy">
                    <h2>{skill.name}</h2>
                    <p>{skill.description || "No description found in the skill package."}</p>
                  </div>

                  <div className="skills-item__actions">
                    {isInstalled ? (
                      <button
                        type="button"
                        className="skills-action-button skills-action-button--installed is-active"
                        disabled
                      >
                        Installed
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="skills-action-button skills-action-button--install"
                        disabled={!selectedAgentId || isInstalling || Boolean(installingSkillId)}
                        onClick={() => handleInstall(skill)}
                      >
                        {isInstalling ? "Installing..." : "Install"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      ) : (
        <section
          className={cn("skills-list", "skills-list--installed")}
          aria-label={`Installed skills for ${emptyInstalledLabel}`}
        >
          {loading ? (
            <div className="skills-empty-state">
              <strong>Loading skills</strong>
              <p>Reading installed skills from the selected OpenClaw workspace.</p>
            </div>
          ) : installedSkills.length === 0 ? (
            <div className="skills-empty-state">
              <strong>No installed skills</strong>
              <p>{emptyInstalledLabel} does not have any installed skill folders yet.</p>
            </div>
          ) : (
            installedSkills.map((skill) => (
              <article key={skill.id} className="skills-item">
                <div className="skills-item__copy">
                  <h2>{skill.name}</h2>
                  <p>{skill.description || "No description found in the skill package."}</p>
                </div>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
