import { startTransition, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Cpu, PlugZap, Rocket, Square, Workflow } from "lucide-react";
import { toast } from "sonner";
import Panel from "@/shared/ui/Panel";
import StatusBadge from "@/shared/ui/StatusBadge";
import {
  getServerRuntimeMode,
  onServerEvent,
  startServer,
  stopServer,
  type ServerRuntimeMode,
} from "@/modules/server/service/api";
import { usePythonServerSocket } from "@/modules/server/service/usePythonServerSocket";
import { useServerStatus } from "@/modules/server/service/useServerStatus";
interface ServerPageProps {
  wsUrl?: string;
}

interface LogEntry {
  id: number;
  text: string;
  timestamp: string;
}

export default function ServerPage({ wsUrl = "ws://127.0.0.1:8765" }: ServerPageProps) {
  const [isRunning] = useServerStatus();
  const [backendMode, setBackendMode] = useState<ServerRuntimeMode>("unknown");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [startLoading, setStartLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const previousSocketStateRef = useRef("idle");

  const addLog = (text: string) => {
    startTransition(() => {
      setLogs((previous) => [
        ...previous,
        {
          id: Date.now() + previous.length,
          text,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    });
  };

  useEffect(() => {
    let cancelled = false;

    const syncMode = async () => {
      try {
        const mode = await getServerRuntimeMode();
        if (!cancelled) {
          setBackendMode(mode);
        }
      } catch {
        if (!cancelled) {
          setBackendMode("unknown");
        }
      }
    };

    void syncMode();

    if (!isRunning) {
      return () => {
        cancelled = true;
      };
    }

    const interval = window.setInterval(() => {
      void syncMode();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isRunning]);

  const { state: socketState, lastError } = usePythonServerSocket({
    url: wsUrl,
    enabled: isRunning,
    onJsonMessage: (message) => {
      const type = message.type ?? "unknown";
      const payload =
        typeof message.data === "string"
          ? message.data
          : JSON.stringify(message.data ?? "");
      addLog(`[ws:${type}] ${payload}`);
    },
    onBinaryMessage: (data) => {
      addLog(`[ws:binary] 收到 ${data.byteLength} bytes`);
    },
  });

  useEffect(() => {
    if (previousSocketStateRef.current !== socketState) {
      addLog(`[系统] WebSocket 状态: ${socketState}`);
      previousSocketStateRef.current = socketState;
    }
  }, [socketState]);

  useEffect(() => {
    if (lastError) {
      addLog(`[错误] ${lastError}`);
    }
  }, [lastError]);

  useEffect(() => {
    const disposers: Array<() => void> = [];

    Promise.all([
      onServerEvent("server-log", (payload) => addLog(String(payload))),
      onServerEvent("server-exited", () => addLog("[系统] 服务器进程已退出")),
      onServerEvent("server-stopped", () => addLog("[系统] 服务器已停止")),
      listen("tauri://close-requested", () => addLog("[系统] 收到窗口关闭事件")),
    ]).then((result) => {
      result.forEach((dispose) => disposers.push(dispose));
    });

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  const handleStart = async () => {
    setStartLoading(true);
    try {
      const result = await startServer();
      toast.success("后端服务已启动");
      addLog(`[系统] 启动完成，当前模式: ${result.mode} (${result.label})`);
      addLog(`[系统] 启动命令: ${result.command}`);
    } catch (reason) {
      toast.error("启动服务失败", {
        description: String(reason),
      });
      addLog(`[错误] 启动失败: ${reason}`);
    } finally {
      setStartLoading(false);
    }
  };

  const handleStop = async () => {
    setStopLoading(true);
    try {
      await stopServer();
      toast.success("服务停止指令已发送");
    } catch (reason) {
      toast.error("停止服务失败", {
        description: String(reason),
      });
      addLog(`[错误] 停止失败: ${reason}`);
    } finally {
      setStopLoading(false);
    }
  };

  return (
    <>
      <div className="content-grid">
        <Panel
          title="运行与连接状态"
          className="span-two"
          actions={
            <div className="panel-actions-inline">
              <button
                type="button"
                className="primary-button"
                disabled={isRunning || startLoading}
                onClick={() => void handleStart()}
              >
                <Rocket size={16} />
                {startLoading ? "启动中..." : "启动服务"}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!isRunning || stopLoading}
                onClick={() => void handleStop()}
              >
                <Square size={16} />
                {stopLoading ? "停止中..." : "停止服务"}
              </button>
            </div>
          }
        >
          <div className="status-showcase">
            <div className="status-check-grid status-check-grid--triple">
              <div className="check-item">
                <div className="check-item__title">
                  <Workflow size={16} />
                  <strong>服务状态</strong>
                </div>
                <span>{isRunning ? "运行中" : "未运行"}</span>
              </div>
              <div className="check-item">
                <div className="check-item__title">
                  <PlugZap size={16} />
                  <strong>WebSocket</strong>
                </div>
                <span>{socketState}</span>
              </div>
              <div className="check-item">
                <div className="check-item__title">
                  <Cpu size={16} />
                  <strong>Backend</strong>
                </div>
                <span>{backendMode}</span>
              </div>
            </div>
          </div>
          <div className="summary-pills">
            <StatusBadge tone={isRunning ? "success" : "neutral"}>
              {isRunning ? "服务运行中" : "服务未运行"}
            </StatusBadge>
            <StatusBadge
              tone={
                socketState === "connected"
                  ? "success"
                  : socketState === "connecting"
                    ? "info"
                    : "warning"
              }
            >
              WebSocket {socketState}
            </StatusBadge>
            <StatusBadge tone={backendMode === "unknown" ? "warning" : "success"}>
              backend {backendMode}
            </StatusBadge>
          </div>
        </Panel>

        <Panel title="服务日志" className="span-two" actions={
          <button type="button" className="ghost-button" onClick={() => setLogs([])}>
            清空日志
          </button>
        }>
          <div className="log-surface">
            {logs.length === 0 ? (
              <div className="log-empty">
                <Cpu size={20} />
                <span>等待服务日志...</span>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="log-line">
                  <span className="log-line__index">{log.timestamp}</span>
                  <code>{log.text}</code>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
