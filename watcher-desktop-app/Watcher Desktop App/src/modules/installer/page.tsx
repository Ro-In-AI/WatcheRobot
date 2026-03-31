import { startTransition, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, CheckCircle2, DownloadCloud, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import Panel from "@/shared/ui/Panel";
import StatusBadge from "@/shared/ui/StatusBadge";
import { checkEnvironment, startInstallation } from "@/modules/installer/service/api";
import RobotPreviewPanel from "@/modules/installer/components/RobotPreviewPanel";
import { parseInstallStages } from "@/modules/installer/service/installStages";
import type { EnvironmentStatus, InstallState } from "@/shared/types/runtime";

export default function InstallerPage() {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<InstallState>("checking");
  const [error, setError] = useState("");

  const refreshEnvironment = async () => {
    setState("checking");
    const result = await checkEnvironment();
    setEnvironment(result);
    setState(result.openclaw.installed ? "installed" : "ready");
  };

  useEffect(() => {
    void refreshEnvironment().catch((reason) => {
      setState("error");
      setError(String(reason));
    });
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    Promise.all([
      listen<string>("installation-log", ({ payload }) => {
        startTransition(() => {
          setLogs((previous) => [...previous, payload]);
        });
      }),
      listen("installation-complete", () => {
        setState("installed");
        toast.success("OpenClaw 初始化完成");
        void refreshEnvironment().catch(console.error);
      }),
      listen<string>("installation-error", ({ payload }) => {
        setState("error");
        setError(payload);
        toast.error("安装流程失败", {
          description: payload,
        });
      }),
    ]).then((disposers) => {
      disposers.forEach((dispose) => unlisteners.push(dispose));
    });

    return () => {
      unlisteners.forEach((dispose) => dispose());
    };
  }, []);

  const runInstallation = async () => {
    setLogs([]);
    setError("");
    setState("installing");

    try {
      await startInstallation();
      toast.info("安装流程已启动");
    } catch (reason) {
      setState("error");
      setError(String(reason));
      toast.error("无法启动安装流程", {
        description: String(reason),
      });
    }
  };

  const { stages, version } = parseInstallStages(logs);
  const isInstalled = state === "installed";
  const installStatusText = isInstalled
    ? `已就绪 ${version || environment?.openclaw.version || ""}`.trim()
    : state === "installing"
      ? "安装进行中"
      : state === "error"
        ? "需要处理错误"
        : "等待执行安装";

  return (
    <>
      <div className="content-grid">
        <RobotPreviewPanel />

        <Panel
          title="环境状态"
          className="span-two"
          actions={
            <div className="panel-actions-inline">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void refreshEnvironment()}
              >
                重新检测
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void runInstallation()}
                disabled={state === "installing"}
              >
                {state === "installing" ? "安装中..." : "开始安装"}
              </button>
            </div>
          }
        >
          <div className="status-showcase">
            <div className="status-check-grid">
            <CheckItem
              label="Node.js"
              ok={Boolean(environment?.nodejs.installed)}
              value={environment?.nodejs.version ?? "未检测"}
            />
            <CheckItem
              label="OpenClaw"
              ok={Boolean(environment?.openclaw.installed)}
              value={environment?.openclaw.version ?? "未安装"}
            />
          </div>

            <div className="status-showcase__meta">
              <div className="summary-pills">
                <StatusBadge tone={isInstalled ? "success" : state === "error" ? "danger" : "info"}>
                  {installStatusText}
                </StatusBadge>
              </div>
            </div>
          </div>
        </Panel>

        {!isInstalled ? (
          <>
            <Panel title="安装阶段" className="span-two">
              <div className="timeline">
                {stages.map((stage) => (
                  <article key={stage.id} className={`timeline-card timeline-${stage.status}`}>
                    <div className="timeline-card__head">
                      <strong>
                        {stage.id}. {stage.name}
                      </strong>
                      <StatusBadge
                        tone={
                          stage.status === "completed"
                            ? "success"
                            : stage.status === "active"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {stage.status === "completed"
                          ? "完成"
                          : stage.status === "active"
                            ? "进行中"
                            : "等待中"}
                      </StatusBadge>
                    </div>
                    <div className="timeline-items">
                      {stage.items.length === 0 ? (
                        <span className="timeline-empty">等待阶段日志...</span>
                      ) : (
                        stage.items.slice(-4).map((item) => (
                          <div key={`${stage.id}-${item.text}`} className="timeline-item">
                            {item.status === "success" ? (
                              <CheckCircle2 size={15} />
                            ) : item.status === "loading" ? (
                              <LoaderCircle size={15} className="spin" />
                            ) : (
                              <AlertTriangle size={15} />
                            )}
                            <span>{item.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel
              title="实时日志"
              className="span-two"
              actions={
                <div className="panel-actions-inline">
                  {error ? <span className="panel-inline-note">{error}</span> : null}
                  <button type="button" className="ghost-button" onClick={() => setLogs([])}>
                    清空日志
                  </button>
                </div>
              }
            >
              <div className="log-surface">
                {logs.length === 0 ? (
                  <div className="log-empty">
                    <DownloadCloud size={20} />
                    <span>等待安装日志...</span>
                  </div>
                ) : (
                  logs.map((line, index) => (
                    <div key={`${index}-${line}`} className="log-line">
                      <span className="log-line__index">{String(index + 1).padStart(2, "0")}</span>
                      <code>{line}</code>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </>
        ) : null}
      </div>
    </>
  );
}

function CheckItem({
  label,
  ok,
  value,
}: {
  label: string;
  ok: boolean;
  value: string;
}) {
  return (
    <div className="check-item">
      <div className="check-item__title">
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <strong>{label}</strong>
      </div>
      <span>{value}</span>
    </div>
  );
}
