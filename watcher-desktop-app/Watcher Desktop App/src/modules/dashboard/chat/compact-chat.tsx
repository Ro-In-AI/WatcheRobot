import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Maximize2, Minimize2, Zap } from "lucide-react";
import { toast } from "sonner";
import aiAvatar from "@/assets/pencil/dev-pages/ai-avatar.svg";
import aiHeaderIcon from "@/assets/pencil/dev-pages/ai-header-icon.svg";
import sendIcon from "@/assets/pencil/dev-pages/send-icon.svg";
import { openclawChatApi } from "@/modules/openclaw/chat/api";
import {
  buildConversationItems,
  summarizeToolCalls,
  type ChatConversationItem,
} from "@/modules/openclaw/chat/presentation";
import type {
  OpenClawChatGatewayStatus,
  OpenClawChatSessionSummary,
  OpenClawChatStreamEvent,
} from "@/modules/openclaw/chat/types";

type GatewayStatus = "checking" | "online" | "offline";

interface CompactOpenClawChatProps {
  expanded?: boolean;
  onToggleExpanded?: () => void;
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

function createLocalSessionKey() {
  const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000)}`;
  return `agent:main:webchat:direct:watcher-desktop-${suffix}`;
}

function parseWorkspaceIdFromSessionKey(sessionKey: string) {
  const parts = sessionKey.split(":");
  if (parts.length >= 3 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return null;
}

function stripWorkspacePrefix(sessionKey: string, workspaceId: string | null) {
  if (!workspaceId) {
    return sessionKey;
  }

  const prefix = `agent:${workspaceId}:`;
  return sessionKey.startsWith(prefix) ? sessionKey.slice(prefix.length) : sessionKey;
}

function buildSessionTitle(session: OpenClawChatSessionSummary) {
  const displayName =
    typeof session.displayName === "string" && session.displayName.trim()
      ? session.displayName.trim()
      : "";
  if (displayName) {
    return displayName;
  }

  const workspaceId = parseWorkspaceIdFromSessionKey(session.key);
  const stripped = stripWorkspacePrefix(session.key, workspaceId);
  return stripped || session.key;
}

function buildFallbackSessionTitle(sessionKey: string) {
  const workspaceId = parseWorkspaceIdFromSessionKey(sessionKey);
  return stripWorkspacePrefix(sessionKey, workspaceId) || sessionKey;
}

function pickLatestSession(sessions: OpenClawChatSessionSummary[]) {
  return [...sessions].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0] ?? null;
}

function matchesActiveStream(
  event: OpenClawChatStreamEvent,
  sessionKey: string,
  runId: string | null,
) {
  if (event.sessionKey && sessionKey && event.sessionKey !== sessionKey) {
    return false;
  }

  if (runId && event.runId && event.runId !== runId) {
    return false;
  }

  return true;
}

export default function CompactOpenClawChat({
  expanded = false,
  onToggleExpanded,
}: CompactOpenClawChatProps) {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("checking");
  const [gatewaySummary, setGatewaySummary] = useState("检查中");
  const [sessions, setSessions] = useState<OpenClawChatSessionSummary[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState("");
  const [messages, setMessages] = useState<ChatConversationItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingPhase, setPendingPhase] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const activeSessionKeyRef = useRef("");
  const runIdRef = useRef<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const draftMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  const scrollToBottom = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingPhase, scrollToBottom]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [expanded, scrollToBottom]);

  const refreshGatewayHealth = useCallback(async () => {
    setGatewayStatus("checking");
    setGatewaySummary("检查 OpenClaw Gateway");

    try {
      const health = await openclawChatApi.gatewayHealth();
      const ok = health?.ok !== false;
      setGatewayStatus(ok ? "online" : "offline");
      setGatewaySummary(ok ? "Gateway 在线" : "Gateway 离线");
      return ok;
    } catch {
      setGatewayStatus("offline");
      setGatewaySummary("Gateway 未连接");
      return false;
    }
  }, []);

  const loadHistory = useCallback(async (sessionKey: string) => {
    if (!sessionKey) {
      setMessages([]);
      return;
    }

    try {
      const history = await openclawChatApi.getHistory(sessionKey);
      setMessages(buildConversationItems(history));
    } catch (error) {
      setMessages([]);
      if (!String(error).toLowerCase().includes("not found")) {
        toast.error("读取 OpenClaw 历史失败", {
          description: String(error),
        });
      }
    }
  }, []);

  const refreshConversation = useCallback(async (preserveActiveSession = true) => {
    setLoadingSessions(true);

    try {
      const gatewayReady = await refreshGatewayHealth();
      if (!gatewayReady) {
        setSessions([]);
        activeSessionKeyRef.current = "";
        setActiveSessionKey("");
        setMessages([]);
        return;
      }

      const response = await openclawChatApi.listSessions();
      const nextSessions = [...(response.sessions ?? [])].sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0),
      );
      setSessions(nextSessions);

      const hasActiveSession =
        preserveActiveSession &&
        Boolean(activeSessionKeyRef.current) &&
        nextSessions.some((session) => session.key === activeSessionKeyRef.current);

      const nextSessionKey = hasActiveSession
        ? activeSessionKeyRef.current
        : pickLatestSession(nextSessions)?.key ?? "";

      activeSessionKeyRef.current = nextSessionKey;
      setActiveSessionKey(nextSessionKey);

      if (!nextSessionKey) {
        setMessages([]);
        return;
      }

      await loadHistory(nextSessionKey);
    } catch (error) {
      toast.error("刷新 OpenClaw 会话失败", {
        description: String(error),
      });
    } finally {
      setLoadingSessions(false);
    }
  }, [loadHistory, refreshGatewayHealth]);

  const resetPendingState = useCallback(() => {
    draftMessageIdRef.current = null;
    runIdRef.current = null;
    setRunId(null);
    setPendingPhase(null);
    setSending(false);
  }, []);

  const appendAssistantDelta = useCallback((kind: "text" | "thinking", delta: string) => {
    if (!delta) {
      return;
    }

    setMessages((current) => {
      const next = [...current];
      let draftId = draftMessageIdRef.current;
      let draftIndex = draftId
        ? next.findIndex((item) => item.kind === "message" && item.message.id === draftId)
        : -1;

      if (draftIndex < 0) {
        draftId = `openclaw-draft-${Date.now()}`;
        draftMessageIdRef.current = draftId;
        next.push({
          kind: "message",
          id: draftId,
          message: {
            id: draftId,
            role: "assistant",
            text: "",
          },
        });
        draftIndex = next.length - 1;
      }

      const currentMessage = next[draftIndex];
      if (currentMessage.kind !== "message") {
        return next;
      }

      next[draftIndex] = {
        ...currentMessage,
        message: {
          ...currentMessage.message,
          text:
            kind === "text" ? `${currentMessage.message.text}${delta}` : currentMessage.message.text,
          thinking:
            kind === "thinking"
              ? `${currentMessage.message.thinking ?? ""}${delta}`
              : currentMessage.message.thinking,
        },
      };

      return next;
    });
  }, []);

  const handleStreamEvent = useCallback(
    (event: OpenClawChatStreamEvent) => {
      if (!matchesActiveStream(event, activeSessionKeyRef.current, runIdRef.current)) {
        return;
      }

      if (event.type === "text" && event.delta) {
        setPendingPhase("streaming");
        appendAssistantDelta("text", event.delta);
        return;
      }

      if (event.type === "thinking" && event.delta) {
        setPendingPhase("streaming");
        appendAssistantDelta("thinking", event.delta);
        return;
      }

      if (event.type === "phase") {
        setSending(true);
        setPendingPhase(event.phase ?? "planning");
        return;
      }

      if (event.type === "done") {
        resetPendingState();
        void refreshConversation();
        return;
      }

      if (event.type === "error") {
        const detail = event.delta ?? "OpenClaw 执行失败";
        const errorMessageId = `openclaw-error-${Date.now()}`;
        resetPendingState();
        setMessages((current) => [
          ...current,
          {
            kind: "message",
            id: errorMessageId,
            message: {
              id: errorMessageId,
              role: "system",
              text: detail,
            },
          },
        ]);
      }
    },
    [appendAssistantDelta, refreshConversation, resetPendingState],
  );

  useEffect(() => {
    let cancelled = false;
    let unlistenStream: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void openclawChatApi.onStream(handleStreamEvent).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlistenStream = dispose;
    });

    void openclawChatApi.onStatus((status) => {
      if (cancelled) {
        return;
      }

      setGatewayStatus(mapGatewayStatus(status.status));
      setGatewaySummary(status.summary);
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlistenStatus = dispose;
    });

    return () => {
      cancelled = true;
      unlistenStream?.();
      unlistenStatus?.();
    };
  }, [handleStreamEvent]);

  useEffect(() => {
    void refreshConversation();
  }, [refreshConversation]);

  const ensureGatewayReady = useCallback(async () => {
    if (gatewayStatus === "online") {
      return true;
    }

    try {
      await openclawChatApi.startGateway();
      return await refreshGatewayHealth();
    } catch (error) {
      toast.error("启动 OpenClaw Gateway 失败", {
        description: String(error),
      });
      return false;
    }
  }, [gatewayStatus, refreshGatewayHealth]);

  const submitMessage = async () => {
    return submitRawMessage(input, { optimistic: true, clearComposer: true });
  };

  const submitRawMessage = useCallback(
    async (
      rawMessage: string,
      options: { optimistic?: boolean; clearComposer?: boolean } = {},
    ) => {
      const normalizedText = rawMessage.trim();
      if (!normalizedText || sending) {
        return false;
      }

      const gatewayReady = gatewayStatus === "online" ? true : await ensureGatewayReady();
      if (!gatewayReady) {
        return false;
      }

      let sessionKey = activeSessionKeyRef.current;
      if (!sessionKey) {
        sessionKey = createLocalSessionKey();
        activeSessionKeyRef.current = sessionKey;
        setActiveSessionKey(sessionKey);
        setMessages([]);
      }

      if (!sessions.some((session) => session.key === sessionKey)) {
        setSessions((current) => [
          {
            key: sessionKey,
            displayName: "当前会话",
            updatedAt: Date.now(),
          },
          ...current,
        ]);
      }

      if (options.optimistic !== false) {
        const optimisticMessageId = `openclaw-user-${Date.now()}`;
        setMessages((current) => [
          ...current,
          {
            kind: "message",
            id: optimisticMessageId,
            message: {
              id: optimisticMessageId,
              role: "user",
              text: normalizedText,
            },
          },
        ]);
      }

      if (options.clearComposer !== false) {
        setInput("");
      }
      setSending(true);
      setPendingPhase("queued");

      try {
        const response = await openclawChatApi.sendMessage({
          sessionKey,
          message: normalizedText,
          idempotencyKey:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `watcher-${Date.now()}`,
        });

        const nextRunId = typeof response.runId === "string" ? response.runId : null;
        runIdRef.current = nextRunId;
        setRunId(nextRunId);

        if (!nextRunId) {
          resetPendingState();
          await loadHistory(sessionKey);
          await refreshConversation();
        }

        return true;
      } catch (error) {
        const failureMessageId = `openclaw-system-${Date.now()}`;
        resetPendingState();
        toast.error("发送到 OpenClaw 失败", {
          description: String(error),
        });
        setMessages((current) => [
          ...current,
          {
            kind: "message",
            id: failureMessageId,
            message: {
              id: failureMessageId,
              role: "system",
              text: `发送失败：${String(error)}`,
            },
          },
        ]);
        return false;
      }
    },
    [ensureGatewayReady, gatewayStatus, loadHistory, refreshConversation, resetPendingState, sending, sessions],
  );

  const handleSessionChange = useCallback(
    async (sessionKey: string) => {
      activeSessionKeyRef.current = sessionKey;
      setActiveSessionKey(sessionKey);
      resetPendingState();
      if (!sessionKey) {
        setMessages([]);
        return;
      }

      await loadHistory(sessionKey);
    },
    [loadHistory, resetPendingState],
  );

  const handleNewSessionCommand = useCallback(async () => {
    if (sending) {
      return;
    }

    const ok = await submitRawMessage("/new", {
      optimistic: false,
      clearComposer: false,
    });
    if (ok) {
      await refreshConversation(false);
    }
  }, [refreshConversation, sending, submitRawMessage]);

  return (
    <section className={`compact-openclaw${expanded ? " compact-openclaw--expanded" : ""}`}>
      <header className="compact-openclaw__header">
        <div className="compact-openclaw__title">
          <span className="compact-openclaw__title-icon-shell" aria-hidden="true">
            <img className="compact-openclaw__title-icon" src={aiHeaderIcon} alt="" />
          </span>
          <div className="compact-openclaw__title-copy">
            <span>OpenClaw</span>
            <h3>AI Agent Interaction</h3>
          </div>
        </div>
        <div className="compact-openclaw__header-actions">
          <label className="compact-openclaw__session-picker">
            <span>Session</span>
            <select
              value={activeSessionKey}
              disabled={sending || loadingSessions || (sessions.length === 0 && !activeSessionKey)}
              onChange={(event) => void handleSessionChange(event.target.value)}
            >
              {activeSessionKey && !sessions.some((session) => session.key === activeSessionKey) ? (
                <option value={activeSessionKey}>{buildFallbackSessionTitle(activeSessionKey)}</option>
              ) : null}
              {sessions.length === 0 ? (
                <option value="">
                  {loadingSessions ? "Loading sessions..." : "No sessions yet"}
                </option>
              ) : (
                sessions.map((session) => (
                  <option key={session.key} value={session.key}>
                    {buildSessionTitle(session)}
                  </option>
                ))
              )}
            </select>
          </label>
          {onToggleExpanded ? (
            <button
              type="button"
              className="ghost-button compact-openclaw__header-toggle"
              aria-pressed={expanded}
              aria-label={expanded ? "Collapse chat" : "Expand chat"}
              onClick={onToggleExpanded}
              title={expanded ? "Collapse chat" : "Expand chat"}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
        </div>
      </header>

      <div className="compact-openclaw__messages-shell">
        <div className="compact-openclaw__messages" ref={messagesViewportRef}>
          {messages.length === 0 ? (
            <article
              className="compact-openclaw__message compact-openclaw__message--assistant compact-openclaw__message--empty"
            >
              <img className="compact-openclaw__avatar" src={aiAvatar} alt="" />
              <div className="compact-openclaw__bubble compact-openclaw__bubble--assistant">
                <p>{gatewayStatus === "online" ? "Start a new conversation." : gatewaySummary}</p>
              </div>
            </article>
          ) : (
            messages.map((item) => {
              if (item.kind === "toolCallGroup") {
                return (
                  <article
                    key={item.id}
                    className="compact-openclaw__message compact-openclaw__message--assistant"
                  >
                    <img className="compact-openclaw__avatar" src={aiAvatar} alt="" />
                    <details className="openclaw-chat-tool-fold openclaw-chat-tool-fold--group">
                      <summary>
                        <ChevronRight className="openclaw-chat-fold-caret" size={16} />
                        <span className="openclaw-chat-tool-fold__icon" aria-hidden="true">
                          <Zap size={15} />
                        </span>
                        <span className="openclaw-chat-tool-fold__copy">
                          <strong>{summarizeToolCalls(item.group.calls)}</strong>
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
                  </article>
                );
              }

              if (item.kind === "toolResult") {
                return (
                  <article
                    key={item.id}
                    className="compact-openclaw__message compact-openclaw__message--assistant"
                  >
                    <img className="compact-openclaw__avatar" src={aiAvatar} alt="" />
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
                  </article>
                );
              }

              const message = item.message;
              const preview = message.text.trim() || (message.thinking ? "..." : "(无文本输出)");

              return (
                <article
                  key={item.id}
                  className={`compact-openclaw__message compact-openclaw__message--${message.role}`}
                >
                  {message.role === "user" ? null : (
                    <img className="compact-openclaw__avatar" src={aiAvatar} alt="" />
                  )}
                  <div className={`compact-openclaw__bubble compact-openclaw__bubble--${message.role}`}>
                    <p>{preview}</p>
                    {message.thinking ? (
                      <small className="compact-openclaw__thinking">{message.thinking}</small>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
          {sending && pendingPhase !== "streaming" ? (
            <article className="compact-openclaw__message compact-openclaw__message--assistant">
              <img className="compact-openclaw__avatar" src={aiAvatar} alt="" />
              <div className="compact-openclaw__bubble compact-openclaw__bubble--assistant compact-openclaw__bubble--pending">
                <div className="compact-openclaw__thinking-indicator" aria-label="思考中">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>

      <div className="compact-openclaw__composer">
        <button
          type="button"
          className="compact-openclaw__new-session"
          disabled={sending || loadingSessions}
          onClick={() => void handleNewSessionCommand()}
        >
          /new
        </button>
        <textarea
          rows={1}
          value={input}
          placeholder={
            gatewayStatus === "online"
              ? "Type to talk to OpenClaw"
              : "Gateway offline. Send a message to wake it up"
          }
          disabled={sending}
          autoFocus={expanded}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitMessage();
            }
          }}
        />
        <button
          type="button"
          className="compact-openclaw__send"
          disabled={!input.trim() || sending}
          onClick={() => void submitMessage()}
        >
          <img src={sendIcon} alt="" />
        </button>
      </div>
    </section>
  );
}
