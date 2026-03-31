import { useEffect, useState } from "react";
import { Cpu, PlugZap, Rocket, Square, Workflow } from "lucide-react";
import { toast } from "sonner";
import Panel from "@/shared/ui/Panel";
import StatusBadge from "@/shared/ui/StatusBadge";
import { getServerRuntimeMode, stopServer, type ServerRuntimeMode } from "@/modules/server/service/api";
import type { DashboardLogEntry } from "@/modules/dashboard/shared/types";

interface RuntimeConsoleWorkspaceProps {
  isRunning: boolean;
  socketState: string;
  logs: DashboardLogEntry[];
  startingServer: boolean;
  onStartServer: () => Promise<void>;
  onClearLogs: () => void;
}

export default function RuntimeConsoleWorkspace({
  isRunning,
  socketState,
  logs,
  startingServer,
  onStartServer,
  onClearLogs,
}: RuntimeConsoleWorkspaceProps) {
  const [backendMode, setBackendMode] = useState<ServerRuntimeMode>("unknown");
  const [stopLoading, setStopLoading] = useState(false);

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

  const handleStop = async () => {
    setStopLoading(true);
    try {
      await stopServer();
      toast.success("服务停止指令已发送");
    } catch (reason) {
      toast.error("停止服务失败", {
        description: String(reason),
      });
    } finally {
      setStopLoading(false);
    }
  };

  return (
    <div className="control-hub-settings-page">
      <div className="content-grid">
        <Panel
          title="运行与连接状态"
          className="span-two"
          actions={
            <div className="panel-actions-inline">
              <button
                type="button"
                className="primary-button"
                disabled={isRunning || startingServer}
                onClick={() => void onStartServer()}
              >
                <Rocket size={16} />
                {startingServer ? "启动中..." : "启动服务"}
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

        <Panel
          title="服务日志"
          className="span-two"
          actions={
            <button type="button" className="ghost-button" onClick={onClearLogs}>
              清空日志
            </button>
          }
        >
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
    </div>
  );
}
