import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Panel from "@/shared/ui/Panel";
import { agentConfigApi } from "@/modules/openclaw/agent_config/api";
import type {
  OpenClawAgent,
  OpenClawAgentDetails,
  OpenClawAgentWorkspaceDocs,
  OpenClawSessionBindingMatch,
  OpenClawSessionBindingsOverview,
  OpenClawSessionSummary,
} from "@/modules/openclaw/shared/types";

type DocName = "SOUL.md" | "IDENTITY.md" | "AGENTS.md";

interface DetailState {
  id: string;
  name: string;
}

const DOC_TABS: DocName[] = ["SOUL.md", "IDENTITY.md", "AGENTS.md"];

function slugifyAgentId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDetailState(agent: OpenClawAgent): DetailState {
  return {
    id: agent.id,
    name: agent.name ?? agent.id,
  };
}

function buildAgentPayload(source: OpenClawAgent, detail: DetailState): OpenClawAgent {
  return {
    ...source,
    id: detail.id,
    name: detail.name.trim() || undefined,
  };
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<OpenClawAgentDetails[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [workspaceDocs, setWorkspaceDocs] = useState<OpenClawAgentWorkspaceDocs | null>(null);
  const [sessionOverview, setSessionOverview] = useState<OpenClawSessionBindingsOverview | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocName>("SOUL.md");

  const refresh = async () => {
    const [nextAgents, nextOverview] = await Promise.all([
      agentConfigApi.getAgents(),
      agentConfigApi.getSessionBindingsOverview(),
    ]);
    setAgents(nextAgents);
    setSessionOverview(nextOverview);
    setSelectedAgentId((previous) => {
      if (previous && nextAgents.some(({ agent }) => agent.id === previous)) {
        return previous;
      }
      return nextAgents[0]?.agent.id ?? null;
    });
  };

  useEffect(() => {
    void refresh().catch((reason) => {
      toast.error("读取 OpenClaw agent 配置失败", {
        description: String(reason),
      });
    });
  }, []);

  const selectedAgent = useMemo(
    () => agents.find(({ agent }) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const dedupedSessions = useMemo(() => {
    const byMatch = new Map<string, OpenClawSessionSummary>();

    for (const session of sessionOverview?.sessions ?? []) {
      const matchKey = session.match
        ? `${session.match.channel}:${session.match.peer.kind}:${session.match.peer.id}`
        : session.key;
      const previous = byMatch.get(matchKey);
      if (!previous || (session.updatedAt ?? 0) > (previous.updatedAt ?? 0)) {
        byMatch.set(matchKey, session);
      }
    }

    return Array.from(byMatch.values());
  }, [sessionOverview]);

  const selectedAgentBoundSessions = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    return dedupedSessions.filter((session) => session.boundAgentId === selectedAgent.agent.id);
  }, [dedupedSessions, selectedAgent]);

  const bindableSessions = useMemo(
    () => dedupedSessions.filter((session) => session.bindable && session.match),
    [dedupedSessions],
  );

  useEffect(() => {
    if (!selectedAgent) {
      setDetailState(null);
      setWorkspaceDocs(null);
      return;
    }

    setDetailState(toDetailState(selectedAgent.agent));
    void agentConfigApi
      .getAgentWorkspaceDocs(selectedAgent.agent.id)
      .then(setWorkspaceDocs)
      .catch((reason) => {
        toast.error("读取 agent 工作区文档失败", {
          description: String(reason),
        });
      });
  }, [selectedAgent]);

  const saveNewAgent = async () => {
    const rawName = window.prompt("输入新 agent 名字");
    const name = rawName?.trim() ?? "";
    const agentId = slugifyAgentId(name);

    if (!name) {
      toast.error("请输入 agent 名字");
      return;
    }

    if (!agentId) {
      toast.error("名字无法生成有效的 agent ID");
      return;
    }

    if (agents.some(({ agent }) => agent.id === agentId)) {
      toast.error(`agent ${agentId} 已存在`);
      return;
    }

    await agentConfigApi.setAgent(agentId, {
      id: agentId,
      name,
    });

    toast.success(`已新增 agent ${name}`);
    await refresh();
    setSelectedAgentId(agentId);
  };

  const saveDetail = async () => {
    if (!selectedAgent || !detailState) {
      return;
    }

    await agentConfigApi.setAgent(
      selectedAgent.agent.id,
      buildAgentPayload(selectedAgent.agent, detailState),
    );
    toast.success("agent 配置已保存");
    await refresh();
  };

  const saveDoc = async (docName: DocName) => {
    if (!selectedAgent || !workspaceDocs) {
      return;
    }

    await agentConfigApi.setAgentWorkspaceDoc(
      selectedAgent.agent.id,
      docName,
      workspaceDocs.docs[docName] ?? "",
    );
    toast.success(`${docName} 已保存`);
  };

  const setBinding = async (
    agentId: string | null,
    match: OpenClawSessionBindingMatch,
    successMessage: string,
  ) => {
    await agentConfigApi.setSessionBinding(agentId, match);
    toast.success(successMessage);
    setSessionOverview(await agentConfigApi.getSessionBindingsOverview());
  };

  const removeAgent = async (agentId: string) => {
    await agentConfigApi.removeAgent(agentId);
    toast.success(`已删除 agent ${agentId}`);
    if (selectedAgentId === agentId) {
      setSelectedAgentId(null);
    }
    await refresh();
  };

  return (
    <div className={`agent-stage${selectedAgent && detailState ? " is-selected" : ""}`}>
      <Panel
        title="Agent 列表"
        description={undefined}
        className="agent-stage__list"
      >
        <div className="agent-create-inline">
          <button type="button" className="primary-button" onClick={() => void saveNewAgent()}>
            <Plus size={16} />
            添加
          </button>
          <button type="button" className="ghost-button" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>

        {selectedAgent && detailState ? (
          <div className="agent-list-shell is-compact">
            {agents.map((detail) => (
              <button
                key={detail.agent.id}
                type="button"
                className={`agent-list-item${selectedAgentId === detail.agent.id ? " is-active" : ""}`}
                onClick={() => setSelectedAgentId(detail.agent.id)}
              >
                <strong>{detail.agent.name || detail.agent.id}</strong>
              </button>
            ))}
          </div>
        ) : (
          <div className="agent-list-shell">
            {agents.length === 0 ? (
              <div className="empty-state">
                <span>当前还没有 agent。</span>
              </div>
            ) : (
              agents.map((detail) => (
                <button
                  key={detail.agent.id}
                  type="button"
                  className="agent-list-item"
                  onClick={() => setSelectedAgentId(detail.agent.id)}
                >
                  <strong>{detail.agent.name || detail.agent.id}</strong>
                </button>
              ))
            )}
          </div>
        )}
      </Panel>

      <Panel
        title={selectedAgent ? selectedAgent.agent.name || selectedAgent.agent.id : "Agent 详情"}
        description={undefined}
        className="agent-stage__detail"
        actions={
          selectedAgent && detailState ? (
            <div className="panel-actions-inline">
              <button type="button" className="ghost-button" onClick={() => setSelectedAgentId(null)}>
                <ChevronLeft size={16} />
                返回列表
              </button>
              <button
                type="button"
                className="icon-button"
                title={`删除 ${selectedAgent.agent.id}`}
                onClick={() => void removeAgent(selectedAgent.agent.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : null
        }
      >
        {selectedAgent && detailState ? (
          <div className="agent-detail">
            <details className="agent-section" open>
              <summary>名字</summary>
              <div className="agent-section__body">
                <div className="agent-name-edit">
                  <LabeledField
                    label="名字"
                    value={detailState.name}
                    onChange={(value) =>
                      setDetailState((previous) => (previous ? { ...previous, name: value } : previous))
                    }
                  />
                  <div className="panel-actions-inline">
                    <button type="button" className="primary-button" onClick={() => void saveDetail()}>
                      <Save size={15} />
                      保存名字
                    </button>
                  </div>
                </div>
              </div>
            </details>

            <details className="agent-section" open>
              <summary>会话绑定</summary>
              <div className="agent-section__body">
                <div className="agent-binding-group">
                  <div className="agent-binding-group__head">
                    <strong>当前已绑定到这个 agent 的会话</strong>
                    <span>{selectedAgentBoundSessions.length} 个</span>
                  </div>

                  {selectedAgentBoundSessions.length === 0 ? (
                    <div className="empty-state empty-state--inline">
                      <span>这个 agent 还没有绑定任何会话。</span>
                    </div>
                  ) : (
                    <div className="agent-binding-list">
                      {selectedAgentBoundSessions.map((session) => (
                        <SessionBindingCard
                          key={session.key}
                          session={session}
                          actionLabel="解绑"
                          onAction={() =>
                            session.match
                              ? void setBinding(null, session.match, `已解绑 ${session.title}`)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="agent-binding-group">
                  <div className="agent-binding-group__head">
                    <strong>将会话绑定到当前 agent 工作区</strong>
                    <span>{bindableSessions.length} 个可选</span>
                  </div>

                  <div className="agent-binding-list">
                    {bindableSessions.length === 0 ? (
                      <div className="empty-state empty-state--inline">
                        <span>暂时没有可绑定的会话。</span>
                      </div>
                    ) : (
                      bindableSessions.map((session) => {
                        const alreadyBound = session.boundAgentId === selectedAgent.agent.id;
                        return (
                          <SessionBindingCard
                            key={session.key}
                            session={session}
                            currentAgentLabel={
                              session.boundAgentId
                                ? agents.find((item) => item.agent.id === session.boundAgentId)?.agent.name ||
                                  session.boundAgentId
                                : "未绑定"
                            }
                            actionLabel={alreadyBound ? "已绑定" : "绑定到当前 agent"}
                            actionDisabled={alreadyBound}
                            onAction={() =>
                              session.match
                                ? void setBinding(
                                    selectedAgent.agent.id,
                                    session.match,
                                    `已将 ${session.title} 绑定到 ${selectedAgent.agent.name || selectedAgent.agent.id}`,
                                  )
                                : undefined
                            }
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </details>

            <details className="agent-section" open>
              <summary>文档内容</summary>
              <div className="agent-section__body agent-docs">
                <div className="agent-docs__tabs">
                  {DOC_TABS.map((docName) => (
                    <button
                      key={docName}
                      type="button"
                      className={`ghost-button${activeDoc === docName ? " is-active" : ""}`}
                      onClick={() => setActiveDoc(docName)}
                    >
                      {docName}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>
                    {activeDoc}
                  </span>
                  <textarea
                    className="agent-textarea agent-textarea--doc"
                    value={workspaceDocs?.docs[activeDoc] ?? ""}
                    onChange={(event) =>
                      setWorkspaceDocs((previous) =>
                        previous
                          ? {
                              ...previous,
                              docs: {
                                ...previous.docs,
                                [activeDoc]: event.target.value,
                              },
                            }
                          : previous,
                      )
                    }
                  />
                </label>

                <div className="panel-actions-inline">
                  <button type="button" className="primary-button" onClick={() => void saveDoc(activeDoc)}>
                    <Save size={15} />
                    保存 {activeDoc}
                  </button>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <div className="agent-detail agent-detail--empty">
            <div className="empty-state">
              <span>点击左侧任意 agent 查看详情。</span>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SessionBindingCard({
  session,
  currentAgentLabel,
  actionLabel,
  actionDisabled = false,
  onAction,
}: {
  session: OpenClawSessionSummary;
  currentAgentLabel?: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="agent-binding-card">
      <div className="agent-binding-card__content">
        <strong>{session.title}</strong>
        <span>{session.subtitle || `${session.ownerAgentId} 工作区记录`}</span>
        <small>
          当前记录所在 agent: {session.ownerAgentId}
          {currentAgentLabel ? ` · 当前绑定: ${currentAgentLabel}` : ""}
        </small>
      </div>
      <button
        type="button"
        className={`ghost-button${actionDisabled ? " is-disabled" : ""}`}
        disabled={actionDisabled}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
