import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, Loader2, Play, RefreshCcw, Square, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { agentConfigApi } from "@/modules/openclaw/agent_config/api";
import Panel from "@/shared/ui/Panel";
import { openclawChatApi } from "@/modules/openclaw/chat/api";
import {
  buildConversationItems,
  summarizeToolCalls,
  type ChatConversationItem,
  type ChatDisplayMessage,
} from "@/modules/openclaw/chat/presentation";
import type {
  OpenClawAgentDetails,
  OpenClawSessionSummary as OpenClawBindingSessionSummary,
} from "@/modules/openclaw/shared/types";
import type {
  OpenClawChatGatewayStatus,
  OpenClawChatSessionSummary,
  OpenClawChatStreamEvent,
} from "@/modules/openclaw/chat/types";

type GatewayStatus = "checking" | "online" | "offline";
type PendingIndicatorTone = "thinking" | "warning";

interface SessionListItem {
  session: OpenClawChatSessionSummary;
  workspaceId: string;
  workspaceLabel: string;
  title: string;
  subtitle: string;
}

interface SessionWorkspaceGroup {
  id: string;
  label: string;
  sessions: SessionListItem[];
  latestUpdatedAt: number;
}

const STREAM_DRAFT_PREFIX = "assistant-stream-";
const QUEUED_PHASE_GRACE_MS = 1_200;
const FIRST_STREAM_TIMEOUT_MS = 15_000;

function resolveRunPhase(current: string | null, incoming: string | null): string | null {
  if (!incoming) {
    return current;
  }

  const rank: Record<string, number> = {
    queued: 0,
    planning: 1,
    executing: 2,
    streaming: 3,
  };

  if (!current) {
    return incoming;
  }

  const currentRank = rank[current] ?? -1;
  const incomingRank = rank[incoming] ?? -1;
  return incomingRank >= currentRank ? incoming : current;
}

function formatTimestamp(value?: number) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

function formatMessageTime(value?: number) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSessionDisplayName(session: OpenClawChatSessionSummary): string {
  const displayName =
    typeof session.displayName === "string" && session.displayName.trim()
      ? session.displayName.trim()
      : null;
  if (displayName) {
    return displayName;
  }

  const key = session.key;
  const tokens = key.split(":");
  return tokens[tokens.length - 1] || key;
}

function parseWorkspaceIdFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split(":");
  if (parts.length >= 3 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return null;
}

function stripWorkspacePrefix(sessionKey: string, workspaceId: string | null): string {
  if (!workspaceId) {
    return sessionKey;
  }

  const prefix = `agent:${workspaceId}:`;
  return sessionKey.startsWith(prefix) ? sessionKey.slice(prefix.length) : sessionKey;
}

function formatWorkspaceLabel(workspaceId: string, agentName?: string | null): string {
  const normalizedWorkspaceId = workspaceId.trim() || "unassigned";
  const normalizedAgentName = agentName?.trim();

  if (!normalizedAgentName) {
    return normalizedWorkspaceId;
  }

  if (normalizedAgentName.toLowerCase() === normalizedWorkspaceId.toLowerCase()) {
    return normalizedWorkspaceId;
  }

  return `${normalizedAgentName} (${normalizedWorkspaceId})`;
}

function buildSessionTitle(
  session: OpenClawChatSessionSummary,
  overview: OpenClawBindingSessionSummary | undefined,
  workspaceId: string,
): string {
  const overviewTitle = overview?.title?.trim();
  if (overviewTitle && overviewTitle !== "未分类会话") {
    return overviewTitle;
  }

  const withoutWorkspace = stripWorkspacePrefix(session.key, workspaceId);
  return withoutWorkspace || buildSessionDisplayName(session);
}

function buildSessionSubtitle(
  session: OpenClawChatSessionSummary,
  overview: OpenClawBindingSessionSummary | undefined,
  workspaceLabel: string,
  title: string,
): string {
  const candidates = [
    overview?.subtitle,
    session.displayName,
    session.channel && session.chatType ? `${session.channel} · ${session.chatType}` : null,
  ];

  const details = candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value, index, values) => Boolean(value) && value !== title && values.indexOf(value) === index);

  return details.length > 0 ? `${workspaceLabel} · ${details.join(" · ")}` : workspaceLabel;
}

function selectFallbackSessionKey(sessions: OpenClawChatSessionSummary[]): string {
  return sessions[0]?.key ?? "";
}

function createLocalSessionKey() {
  const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000)}`;
  return `agent:main:webchat:direct:watcher-desktop-${suffix}`;
}

function isLikelyMissingSession(error: unknown): boolean {
  const reason = String(error).toLowerCase();
  return reason.includes("not found") || reason.includes("unknown session");
}

function mapGatewayStatus(status: OpenClawChatGatewayStatus["status"]): GatewayStatus {
  if (status === "connected") {
    return "online";
  }
  if (status === "connecting") {
    return "checking";
  }
  return "offline";
}

function messagePreview(message: ChatDisplayMessage) {
  if (message.text.trim()) {
    return message.text;
  }
  if (message.thinking) {
    return "...";
  }
  return "(无文本输出)";
}

function hasSystemSection(message: ChatDisplayMessage) {
  return message.role === "system" || Boolean(message.thinking) || Boolean(message.provider) || Boolean(message.model);
}

function systemSummary(message: ChatDisplayMessage) {
  if (message.role === "system") {
    return messagePreview(message);
  }

  if (message.thinking) {
    return "思考过程";
  }

  const meta = [message.provider, message.model].filter(Boolean).join(" · ");
  return meta || "系统信息";
}

function matchesCurrentStream(
  event: OpenClawChatStreamEvent,
  activeSessionKey: string,
  currentRunId: string | null,
) {
  if (event.runId && currentRunId && event.runId === currentRunId) {
    return true;
  }

  if (event.sessionKey && activeSessionKey && event.sessionKey === activeSessionKey) {
    return true;
  }

  return false;
}

function buildPendingIndicator(
  phase: string | null,
  timedOut: boolean,
): { tone: PendingIndicatorTone; delayed: boolean } {
  if (timedOut) {
    return {
      tone: "warning",
      delayed: true,
    };
  }

  switch (phase) {
    case "queued":
    case "planning":
    case "executing":
    case "streaming":
    default:
      return {
        tone: "thinking",
        delayed: false,
      };
  }
}

export default function OpenClawChatPage() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("checking");
  const [gatewaySummary, setGatewaySummary] = useState("检测中");
  const [sessions, setSessions] = useState<OpenClawChatSessionSummary[]>([]);
  const [sessionOverviewByKey, setSessionOverviewByKey] = useState<
    Record<string, OpenClawBindingSessionSummary>
  >({});
  const [agentNameById, setAgentNameById] = useState<Record<string, string>>({});
  const [activeSessionKey, setActiveSessionKey] = useState<string>("");
  const [messages, setMessages] = useState<ChatConversationItem[]>([]);
  const [input, setInput] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingSessionKey, setDeletingSessionKey] = useState<string | null>(null);
  const [refreshingView, setRefreshingView] = useState(false);
  const [sending, setSending] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runPhase, setRunPhase] = useState<string | null>(null);
  const [hasAssistantActivity, setHasAssistantActivity] = useState(false);
  const [waitingTimedOut, setWaitingTimedOut] = useState(false);

  const activeSessionKeyRef = useRef("");
  const runIdRef = useRef<string | null>(null);
  const pendingBootstrapSessionRef = useRef<string | null>(null);
  const draftMessageIdRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  const applyGatewayStatus = useCallback((status: OpenClawChatGatewayStatus) => {
    setGatewayStatus(mapGatewayStatus(status.status));
    setGatewaySummary(status.summary);
  }, []);

  const resetPendingState = useCallback(() => {
    setRunPhase(null);
    setHasAssistantActivity(false);
    setWaitingTimedOut(false);
  }, []);

  const refreshGatewayHealth = useCallback(async () => {
    setGatewayStatus("checking");
    try {
      const health = await openclawChatApi.gatewayHealth();
      const isOk = health?.ok !== false;
      setGatewayStatus(isOk ? "online" : "offline");
      setGatewaySummary(isOk ? "Gateway 正常" : "Gateway 异常");
      return isOk;
    } catch {
      setGatewayStatus("offline");
      setGatewaySummary("Gateway 未连接");
      return false;
    }
  }, []);

  const refreshSessions = useCallback(
    async (preserveActiveSession = true, quiet = false, includeMetadata = true) => {
      setLoadingSessions(true);
      try {
        const response = await openclawChatApi.listSessions();

        if (includeMetadata) {
          const [overviewResult, agentsResult] = await Promise.allSettled([
            agentConfigApi.getSessionBindingsOverview(),
            agentConfigApi.getAgents(),
          ]);

          if (overviewResult.status === "fulfilled") {
            const nextOverviewByKey = Object.fromEntries(
              (overviewResult.value.sessions ?? []).map((session) => [session.key, session]),
            );
            setSessionOverviewByKey(nextOverviewByKey);
          }

          if (agentsResult.status === "fulfilled") {
            const nextAgentNames = Object.fromEntries(
              (agentsResult.value ?? []).flatMap((detail: OpenClawAgentDetails) => {
                const agentId = detail.agent.id?.trim();
                if (!agentId) {
                  return [];
                }
                const agentName = detail.agent.name?.trim() || agentId;
                return [[agentId, agentName]];
              }),
            );
            setAgentNameById(nextAgentNames);
          }
        }

        const incoming = Array.isArray(response.sessions) ? response.sessions : [];
        const nextSessions = [...incoming].sort(
          (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
        );
        setSessions(nextSessions);

        const fallbackSessionKey = selectFallbackSessionKey(nextSessions);

        if (!preserveActiveSession || !activeSessionKeyRef.current) {
          activeSessionKeyRef.current = fallbackSessionKey;
          setActiveSessionKey(fallbackSessionKey);
          if (!fallbackSessionKey) {
            setMessages([]);
          }
        } else if (!nextSessions.some((session) => session.key === activeSessionKeyRef.current)) {
          activeSessionKeyRef.current = fallbackSessionKey;
          setActiveSessionKey(fallbackSessionKey);
          if (!fallbackSessionKey) {
            setMessages([]);
          }
        }
      } catch (error) {
        if (!quiet) {
          toast.error("获取会话列表失败", { description: String(error) });
        }
      } finally {
        setLoadingSessions(false);
      }
    },
    [],
  );

  const loadHistory = useCallback(async (sessionKey: string, silent = false) => {
    if (!sessionKey) {
      setMessages([]);
      return [];
    }

    if (!silent) {
      setLoadingHistory(true);
    }

    try {
      const history = await openclawChatApi.getHistory(sessionKey);
      const nextMessages = buildConversationItems(history);
      setMessages(nextMessages);
      return nextMessages;
    } catch (error) {
      if (!isLikelyMissingSession(error) && !silent) {
        toast.error("获取会话历史失败", {
          description: String(error),
        });
      } else {
        setMessages([]);
      }
      return [];
    } finally {
      if (!silent) {
        setLoadingHistory(false);
      }
    }
  }, []);

  const appendAssistantDelta = useCallback((kind: "text" | "thinking", delta: string) => {
    if (!delta) {
      return;
    }

    setMessages((previous) => {
      const next = [...previous];
      let draftId = draftMessageIdRef.current;
      let draftIndex = draftId
        ? next.findIndex((item) => item.kind === "message" && item.message.id === draftId)
        : -1;

      if (draftIndex < 0) {
        draftId = `${STREAM_DRAFT_PREFIX}${Date.now()}`;
        draftMessageIdRef.current = draftId;
        next.push({
          kind: "message",
          id: draftId,
          message: {
            id: draftId,
            role: "assistant",
            text: "",
            timestamp: Date.now(),
          },
        });
        draftIndex = next.length - 1;
      }

      const current = next[draftIndex];
      if (current.kind !== "message") {
        return next;
      }

      next[draftIndex] = {
        ...current,
        message: {
          ...current.message,
          text: kind === "text" ? `${current.message.text}${delta}` : current.message.text,
          thinking:
            kind === "thinking"
              ? `${current.message.thinking ?? ""}${delta}`
              : current.message.thinking,
          timestamp: Date.now(),
        },
      };

      return next;
    });
  }, []);

  const finalizeActiveRun = useCallback(
    (sessionKey?: string) => {
      draftMessageIdRef.current = null;
      pendingBootstrapSessionRef.current = null;
      runIdRef.current = null;
      setRunId(null);
      setSending(false);
      resetPendingState();

      if (sessionKey && sessionKey === activeSessionKeyRef.current) {
        void loadHistory(sessionKey, true);
      }
      void refreshSessions(true, true, false);
    },
    [loadHistory, refreshSessions, resetPendingState],
  );

  const handleStreamEvent = useCallback(
    (event: OpenClawChatStreamEvent) => {
      if (!matchesCurrentStream(event, activeSessionKeyRef.current, runIdRef.current)) {
        return;
      }

      if (event.type === "text" && event.delta) {
        setHasAssistantActivity(true);
        setWaitingTimedOut(false);
        setRunPhase("streaming");
        appendAssistantDelta("text", event.delta);
        return;
      }

      if (event.type === "thinking" && event.delta) {
        setHasAssistantActivity(true);
        setWaitingTimedOut(false);
        setRunPhase("streaming");
        appendAssistantDelta("thinking", event.delta);
        return;
      }

      if (event.type === "phase") {
        setSending(true);
        setRunPhase((current) => resolveRunPhase(current, event.phase ?? "planning"));
        return;
      }

      if (event.type === "done") {
        finalizeActiveRun(event.sessionKey);
        return;
      }

      if (event.type === "error") {
        setSending(false);
        draftMessageIdRef.current = null;
        pendingBootstrapSessionRef.current = null;
        runIdRef.current = null;
        setRunId(null);
        toast.error("会话执行失败", {
          description: event.delta ?? "Agent execution failed",
        });
        resetPendingState();
        void loadHistory(activeSessionKeyRef.current, true);
      }
    },
    [appendAssistantDelta, finalizeActiveRun, loadHistory, resetPendingState],
  );

  useEffect(() => {
    let cancelled = false;
    let unlistenStream: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void openclawChatApi.onStream(handleStreamEvent).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlistenStream = fn;
    });

    void openclawChatApi.onStatus((status) => {
      if (!cancelled) {
        applyGatewayStatus(status);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlistenStatus = fn;
    });

    return () => {
      cancelled = true;
      unlistenStream?.();
      unlistenStatus?.();
    };
  }, [applyGatewayStatus, handleStreamEvent]);

  useEffect(() => {
    void (async () => {
      setGatewayStatus("checking");
      setGatewaySummary("正在建立 Gateway 实时连接");
      await refreshSessions(false, false);
    })();
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionKey) {
      return;
    }

    if (pendingBootstrapSessionRef.current === activeSessionKey) {
      return;
    }

    draftMessageIdRef.current = null;
    resetPendingState();
    void loadHistory(activeSessionKey);
  }, [activeSessionKey, loadHistory, resetPendingState]);

  useEffect(() => {
    if (!sending || hasAssistantActivity || runPhase !== "queued") {
      return;
    }

    const timer = window.setTimeout(() => {
      setRunPhase((current) => resolveRunPhase(current, "planning"));
    }, QUEUED_PHASE_GRACE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sending, hasAssistantActivity, runPhase, runId, activeSessionKey]);

  useEffect(() => {
    if (!sending || hasAssistantActivity) {
      setWaitingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setWaitingTimedOut(true);
    }, FIRST_STREAM_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sending, hasAssistantActivity, runId, activeSessionKey]);

  useEffect(() => {
    const node = messagesContainerRef.current;
    if (!node) {
      return;
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior: "auto",
    });
  }, [messages, sending]);

  const groupedSessions = useMemo<SessionWorkspaceGroup[]>(() => {
    const groups = new Map<string, SessionWorkspaceGroup>();

    for (const session of sessions) {
      const overview = sessionOverviewByKey[session.key];
      const workspaceId =
        overview?.ownerAgentId ?? parseWorkspaceIdFromSessionKey(session.key) ?? "unassigned";
      const workspaceLabel = formatWorkspaceLabel(workspaceId, agentNameById[workspaceId]);
      const title = buildSessionTitle(session, overview, workspaceId);
      const subtitle = buildSessionSubtitle(session, overview, workspaceLabel, title);
      const latestUpdatedAt = session.updatedAt ?? 0;
      const existing = groups.get(workspaceId);

      const nextItem: SessionListItem = {
        session,
        workspaceId,
        workspaceLabel,
        title,
        subtitle,
      };

      if (existing) {
        existing.sessions.push(nextItem);
        existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, latestUpdatedAt);
      } else {
        groups.set(workspaceId, {
          id: workspaceId,
          label: workspaceLabel,
          sessions: [nextItem],
          latestUpdatedAt,
        });
      }
    }

    const orderedGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort(
          (left, right) => (right.session.updatedAt ?? 0) - (left.session.updatedAt ?? 0),
        ),
      }))
      .sort((left, right) => {
        const mainBias = Number(right.id === "main") - Number(left.id === "main");
        if (mainBias !== 0) {
          return mainBias;
        }

        return right.latestUpdatedAt - left.latestUpdatedAt || left.label.localeCompare(right.label);
      });

    if (
      activeSessionKey &&
      !orderedGroups.some((group) =>
        group.sessions.some((sessionItem) => sessionItem.session.key === activeSessionKey),
      )
    ) {
      const workspaceId = parseWorkspaceIdFromSessionKey(activeSessionKey) ?? "unassigned";
      orderedGroups.unshift({
        id: `active-${workspaceId}`,
        label: formatWorkspaceLabel(workspaceId, agentNameById[workspaceId]),
        latestUpdatedAt: Date.now(),
        sessions: [
          {
            session: {
              key: activeSessionKey,
              displayName: "当前会话",
              updatedAt: Date.now(),
            },
            workspaceId,
            workspaceLabel: formatWorkspaceLabel(workspaceId, agentNameById[workspaceId]),
            title: stripWorkspacePrefix(activeSessionKey, workspaceId),
            subtitle: "当前会话",
          },
        ],
      });
    }

    return orderedGroups;
  }, [activeSessionKey, agentNameById, sessionOverviewByKey, sessions]);

  const pendingIndicator = useMemo(() => {
    if (!sending || hasAssistantActivity) {
      return null;
    }

    return buildPendingIndicator(runPhase, waitingTimedOut);
  }, [sending, hasAssistantActivity, runPhase, waitingTimedOut]);

  const runStatusLabel = sending
    ? hasAssistantActivity
      ? "回答生成中"
      : "正在思考"
    : "就绪";

  const sendButtonLabel = sending
    ? hasAssistantActivity
      ? "生成中..."
      : "思考中..."
    : "发送";

  const handleCreateSession = () => {
    const sessionKey = createLocalSessionKey();
    activeSessionKeyRef.current = sessionKey;
    draftMessageIdRef.current = null;
    runIdRef.current = null;
    pendingBootstrapSessionRef.current = null;
    setActiveSessionKey(sessionKey);
    setMessages([]);
    setRunId(null);
    setSending(false);
    resetPendingState();
  };

  const handleStartGateway = async () => {
    try {
      const result = await openclawChatApi.startGateway();
      toast.success("Gateway 已启动", {
        description: result,
      });

      const healthOk = await refreshGatewayHealth();
      if (!healthOk) {
        return;
      }

      await refreshSessions();
    } catch (error) {
      toast.error("启动 Gateway 失败", {
        description: String(error),
      });
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingView(true);
    try {
      if (gatewayStatus === "offline") {
        const healthOk = await refreshGatewayHealth();
        if (!healthOk) {
          return;
        }
      }

      await refreshSessions(true, true, false);
    } finally {
      setRefreshingView(false);
    }
  };

  const handleStop = async () => {
    if (!activeSessionKey) {
      return;
    }

    try {
      await openclawChatApi.abortSession(activeSessionKey);
      toast.success("已停止当前会话生成");
    } catch (error) {
      toast.error("停止失败", {
        description: String(error),
      });
    } finally {
      draftMessageIdRef.current = null;
      pendingBootstrapSessionRef.current = null;
      runIdRef.current = null;
      setRunId(null);
      setSending(false);
      resetPendingState();
      await loadHistory(activeSessionKey, true);
    }
  };

  const handleDeleteSession = useCallback(
    async (sessionItem: SessionListItem) => {
      const sessionKey = sessionItem.session.key;
      if (!sessionKey) {
        return;
      }

      if (sending && sessionKey === activeSessionKeyRef.current) {
        toast.warning("当前会话正在运行", {
          description: "请先停止当前生成，再删除这个会话。",
        });
        return;
      }

      setDeletingSessionKey(sessionKey);

      try {
        await openclawChatApi.deleteSession(sessionKey);

        setSessions((previous) => previous.filter((session) => session.key !== sessionKey));
        setSessionOverviewByKey((previous) => {
          const next = { ...previous };
          delete next[sessionKey];
          return next;
        });

        const wasActive = sessionKey === activeSessionKeyRef.current;
        if (wasActive) {
          activeSessionKeyRef.current = "";
          draftMessageIdRef.current = null;
          runIdRef.current = null;
          pendingBootstrapSessionRef.current = null;
          setActiveSessionKey("");
          setMessages([]);
          setRunId(null);
          setSending(false);
          resetPendingState();
        }

        toast.success("会话已删除", {
          description: sessionItem.title,
        });

        await refreshSessions(!wasActive, true);
      } catch (error) {
        toast.error("删除会话失败", {
          description: String(error),
        });
      } finally {
        setDeletingSessionKey(null);
      }
    },
    [refreshSessions, resetPendingState, sending],
  );

  const submitMessage = useCallback(
    async (rawMessage: string, options?: { optimistic?: boolean }) => {
      const text = rawMessage.trim();
      if (!text || sending) {
        return;
      }

      let sessionKey = activeSessionKeyRef.current;
      if (!sessionKey) {
        sessionKey = createLocalSessionKey();
        activeSessionKeyRef.current = sessionKey;
        setActiveSessionKey(sessionKey);
      }

      if (!sessions.some((session) => session.key === sessionKey)) {
        pendingBootstrapSessionRef.current = sessionKey;
      }

      const shouldCreateOptimisticMessage = options?.optimistic ?? true;
      if (shouldCreateOptimisticMessage) {
        const optimisticUserId = `user-local-${Date.now()}`;

        setMessages((previous) => [
          ...previous,
          {
            kind: "message",
            id: optimisticUserId,
            message: {
              id: optimisticUserId,
              role: "user",
              text,
              timestamp: Date.now(),
            },
          },
        ]);
      }

      draftMessageIdRef.current = null;
      runIdRef.current = null;
      setRunId(null);
      setInput("");
      setSending(true);
      setRunPhase("queued");
      setHasAssistantActivity(false);
      setWaitingTimedOut(false);

      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `watcher-${Date.now()}`;

        const response = await openclawChatApi.sendMessage({
          sessionKey,
          message: text,
          idempotencyKey,
        });

        const nextRunId = typeof response.runId === "string" ? response.runId : null;
        pendingBootstrapSessionRef.current = null;
        runIdRef.current = nextRunId;
        setRunId(nextRunId);

        if (!nextRunId) {
          setSending(false);
          resetPendingState();
          await loadHistory(sessionKey, true);
          await refreshSessions();
        }
      } catch (error) {
        pendingBootstrapSessionRef.current = null;
        draftMessageIdRef.current = null;
        runIdRef.current = null;
        setRunId(null);
        setSending(false);
        resetPendingState();
        toast.error("发送失败", {
          description: String(error),
        });

        if (shouldCreateOptimisticMessage) {
          const errorMessageId = `system-error-${Date.now()}`;
          setMessages((previous) => [
            ...previous,
            {
              kind: "message",
              id: errorMessageId,
              message: {
                id: errorMessageId,
                role: "system",
                text: `发送失败：${String(error)}`,
                timestamp: Date.now(),
              },
            },
          ]);
        }
      }
    },
    [refreshSessions, resetPendingState, sending, sessions, loadHistory],
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) {
      return;
    }

    await submitMessage(text, { optimistic: true });
  };

  const handleNewSessionCommand = async () => {
    if (sending || gatewayStatus !== "online") {
      return;
    }

    await submitMessage("/new", { optimistic: false });
    await refreshSessions(true, true, false);
  };

  return (
    <div className="openclaw-chat-page">
      <div className="openclaw-chat-layout">
        <Panel
          title="会话"
          className="openclaw-chat-sessions"
          actions={
            <div className="panel-actions-inline">
              <button
                type="button"
                className="ghost-button"
                disabled={loadingSessions}
                onClick={() => void refreshSessions()}
              >
                <RefreshCcw size={16} />
                刷新
              </button>
              <button type="button" className="primary-button" onClick={handleCreateSession}>
                新建会话
              </button>
            </div>
          }
        >
          <div className="openclaw-chat-session-list">
            {loadingSessions && groupedSessions.length === 0 ? (
              <div className="openclaw-chat-empty">
                <Loader2 size={16} className="spin" />
                正在加载会话...
              </div>
            ) : groupedSessions.length === 0 ? (
              <div className="openclaw-chat-empty">暂无会话，点击“新建会话”开始。</div>
            ) : (
              groupedSessions.map((group) => (
                <section key={group.id} className="openclaw-chat-session-group">
                  <header className="openclaw-chat-session-group__header">
                    <div>
                      <strong>{group.label}</strong>
                      <span>{group.sessions.length} 个会话</span>
                    </div>
                    {group.latestUpdatedAt ? <em>{formatTimestamp(group.latestUpdatedAt)}</em> : null}
                  </header>

                  <div className="openclaw-chat-session-group__list">
                    {group.sessions.map((sessionItem) => {
                      const active = sessionItem.session.key === activeSessionKey;
                      const deleting = deletingSessionKey === sessionItem.session.key;

                      return (
                        <article
                          key={sessionItem.session.key}
                          className={`openclaw-chat-session-card ${active ? "is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className="openclaw-chat-session-select"
                            onClick={() => {
                              activeSessionKeyRef.current = sessionItem.session.key;
                              setActiveSessionKey(sessionItem.session.key);
                            }}
                          >
                            <strong>{sessionItem.title}</strong>
                            <span>{sessionItem.subtitle}</span>
                            <em>{formatTimestamp(sessionItem.session.updatedAt)}</em>
                          </button>

                          <button
                            type="button"
                            className="icon-button openclaw-chat-session-delete"
                            aria-label={`删除会话 ${sessionItem.title}`}
                            disabled={deleting}
                            onClick={() => void handleDeleteSession(sessionItem)}
                          >
                            {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </Panel>

        <section className="panel openclaw-chat-conversation">
          <div className="panel__body">
            <div className="openclaw-chat-toolbar">
              <div className="openclaw-chat-toolbar-status">
                <span
                  className={`openclaw-chat-toolbar-dot openclaw-chat-toolbar-dot--${gatewayStatus}`}
                />
                <span>{gatewaySummary}</span>
                <span>·</span>
                <span>{runStatusLabel}</span>
              </div>
              <div className="panel-actions-inline">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={refreshingView}
                  onClick={() => void handleRefreshAll()}
                >
                  {refreshingView ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
                  刷新
                </button>
                <button type="button" className="ghost-button" onClick={() => void handleStartGateway()}>
                  <Play size={16} />
                  启动 Gateway
                </button>
              </div>
            </div>
            <div className="openclaw-chat-messages" ref={messagesContainerRef}>
              {loadingHistory ? (
                <div className="openclaw-chat-empty">
                  <Loader2 size={16} className="spin" />
                  正在加载历史...
                </div>
              ) : (
                <>
                  {messages.length === 0 && !pendingIndicator ? (
                    <div className="openclaw-chat-empty openclaw-chat-empty--conversation">
                      <Bot size={18} />
                      <span>发送一条消息开始对话</span>
                    </div>
                  ) : null}
                  {messages.map((item) => {
                    if (item.kind === "toolCallGroup") {
                      const timeLabel = formatMessageTime(item.group.timestamp);
                      const metaLabel = [item.group.provider, item.group.model].filter(Boolean).join(" · ");

                      return (
                        <div
                          key={item.id}
                          className="openclaw-chat-message-row openclaw-chat-message-row--assistant"
                        >
                          <div className="openclaw-chat-message-stack">
                            <details className="openclaw-chat-tool-fold openclaw-chat-tool-fold--group">
                              <summary>
                                <ChevronRight className="openclaw-chat-fold-caret" size={16} />
                                <span className="openclaw-chat-tool-fold__icon" aria-hidden="true">
                                  <Zap size={15} />
                                </span>
                                <span className="openclaw-chat-tool-fold__copy">
                                  <strong>{summarizeToolCalls(item.group.calls)}</strong>
                                  {metaLabel ? <small>{metaLabel}</small> : null}
                                </span>
                              </summary>
                              <div className="openclaw-chat-tool-fold__body">
                                {item.group.calls.map((call) => (
                                  <section key={call.id} className="openclaw-chat-tool-fold__section">
                                    <strong>{call.name}</strong>
                                    <pre>{call.argumentsText}</pre>
                                  </section>
                                ))}
                              </div>
                            </details>
                            <div className="openclaw-chat-message-caption">
                              <span>OpenClaw</span>
                              {timeLabel ? <em>{timeLabel}</em> : null}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (item.kind === "toolResult") {
                      const timeLabel = formatMessageTime(item.result.timestamp);

                      return (
                        <div
                          key={item.id}
                          className="openclaw-chat-message-row openclaw-chat-message-row--assistant"
                        >
                          <div className="openclaw-chat-message-stack">
                            <details className="openclaw-chat-tool-fold">
                              <summary>
                                <ChevronRight className="openclaw-chat-fold-caret" size={16} />
                                <span className="openclaw-chat-tool-fold__icon" aria-hidden="true">
                                  <Zap size={15} />
                                </span>
                                <span className="openclaw-chat-tool-fold__copy">
                                  <strong>Tool output</strong>
                                  <small>{item.result.toolName}</small>
                                </span>
                              </summary>
                              <div className="openclaw-chat-tool-fold__body">
                                <pre>{item.result.output}</pre>
                              </div>
                            </details>
                            <div className="openclaw-chat-message-caption">
                              <span>Tool</span>
                              {timeLabel ? <em>{timeLabel}</em> : null}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const message = item.message;
                    const roleLabel =
                      message.role === "user"
                        ? "你"
                        : message.role === "assistant"
                          ? "OpenClaw"
                          : "系统";
                    const timeLabel = formatMessageTime(message.timestamp);

                    if (message.role === "system") {
                      return (
                        <div
                          key={item.id}
                          className="openclaw-chat-message-row openclaw-chat-message-row--system"
                        >
                          <details className="openclaw-chat-system-fold">
                            <summary>
                              <span>{roleLabel}</span>
                              {timeLabel ? <em>{timeLabel}</em> : null}
                              <strong>{systemSummary(message)}</strong>
                            </summary>
                            <div className="openclaw-chat-system-fold__body">
                              <p>{messagePreview(message)}</p>
                              {(message.provider || message.model) ? (
                                <small>
                                  {[message.provider, message.model].filter(Boolean).join(" · ")}
                                </small>
                              ) : null}
                            </div>
                          </details>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className={`openclaw-chat-message-row openclaw-chat-message-row--${message.role}`}
                      >
                        <div className="openclaw-chat-message-stack">
                          <article
                            className={`openclaw-chat-bubble openclaw-chat-bubble--${message.role}`}
                          >
                            <p>{messagePreview(message)}</p>
                            {hasSystemSection(message) ? (
                              <details className="openclaw-chat-inline-system">
                                <summary>系统部分</summary>
                                <div className="openclaw-chat-inline-system__body">
                                  {message.thinking ? (
                                    <section>
                                      <strong>思考过程</strong>
                                      <pre>{message.thinking}</pre>
                                    </section>
                                  ) : null}
                                  {(message.provider || message.model) ? (
                                    <section>
                                      <strong>运行信息</strong>
                                      <p>{[message.provider, message.model].filter(Boolean).join(" · ")}</p>
                                    </section>
                                  ) : null}
                                </div>
                              </details>
                            ) : null}
                          </article>
                          <div className="openclaw-chat-message-caption">
                            <span>{roleLabel}</span>
                            {timeLabel ? <em>{timeLabel}</em> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {pendingIndicator ? (
                    <div className="openclaw-chat-message-row openclaw-chat-message-row--assistant">
                      <article
                        className={`openclaw-chat-pending openclaw-chat-pending--${pendingIndicator.tone}`}
                      >
                        <div className="openclaw-chat-thinking-indicator" aria-label="思考中">
                          <span>.</span>
                          <span>.</span>
                          <span>.</span>
                        </div>
                        {pendingIndicator.delayed ? (
                          <p>等待首个输出时间较长，可以继续等待，或手动刷新会话状态。</p>
                        ) : null}
                      </article>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="openclaw-chat-input">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入要发送给 OpenClaw 的内容..."
                rows={4}
                disabled={sending || gatewayStatus === "offline"}
              />
              <div className="openclaw-chat-input-actions">
                <div className="openclaw-chat-input-buttons">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={sending || gatewayStatus !== "online" || refreshingView}
                    onClick={() => void handleNewSessionCommand()}
                  >
                    New
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!sending}
                    onClick={() => void handleStop()}
                  >
                    <Square size={16} />
                    停止
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!input.trim() || sending || gatewayStatus !== "online"}
                    onClick={() => void handleSend()}
                  >
                    {sending ? <Loader2 size={16} className="spin" /> : null}
                    {sendButtonLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
