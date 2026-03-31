import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import dashboardLogo from "@/assets/pencil/dev-pages/logo.png";
import userIcon from "@/assets/pencil/dev-pages/user-icon.svg";
import ControlHubSidebar from "@/modules/dashboard/control-hub/sidebar";
import type {
  DashboardModuleRenderContext,
} from "@/modules/dashboard/module-definition";
import { dashboardModuleById, dashboardModules } from "@/modules/dashboard/moduleRegistry";
import type {
  ControlHubView,
  DashboardLogEntry,
  ServoPosition,
} from "@/modules/dashboard/shared/types";
import {
  DEFAULT_SERVO_POSITION,
  clampServoPosition,
  clampServoAxis,
} from "@/modules/dashboard/shared/servoLimits";
import { startServer, onServerEvent } from "@/modules/server/service/api";
import { usePythonServerSocket } from "@/modules/server/service/usePythonServerSocket";
import { useServerStatus } from "@/modules/server/service/useServerStatus";

interface MainDashboardPageProps {
  wsUrl?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

export default function MainDashboardPage({
  wsUrl = "ws://127.0.0.1:8765",
}: MainDashboardPageProps) {
  const [isRunning] = useServerStatus();
  const [logs, setLogs] = useState<DashboardLogEntry[]>([]);
  const [onlineHardwareCount, setOnlineHardwareCount] = useState(0);
  const [servoPosition, setServoPosition] = useState<ServoPosition>(DEFAULT_SERVO_POSITION);
  const [draftServo, setDraftServo] = useState<ServoPosition>(DEFAULT_SERVO_POSITION);
  const [startingServer, setStartingServer] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [activeView, setActiveView] = useState<ControlHubView>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visitedViews, setVisitedViews] = useState<ControlHubView[]>(["dashboard"]);

  const previousSocketStateRef = useRef("idle");
  const helloSentRef = useRef(false);
  const previousHardwareCountRef = useRef(0);
  const servoCommitTimerRef = useRef<number | null>(null);

  const addLog = useCallback((text: string) => {
    startTransition(() => {
      setLogs((previous) => {
        const next = [
          ...previous,
          {
            id: Date.now() + previous.length,
            text,
            timestamp: new Date().toLocaleTimeString(),
          },
        ];

        return next.slice(-180);
      });
    });
  }, []);

  const handleWatcherMessage = useCallback(
    (message: { type?: string; data?: unknown }) => {
      const payload = asRecord(message.data);

      if (message.type === "evt.device.status") {
        const rawDevices =
          Array.isArray(payload?.devices) ? (payload.devices as Array<{ online?: boolean }>) : [];
        const nextCount =
          typeof payload?.online_hardware_count === "number"
            ? payload.online_hardware_count
            : rawDevices.filter((item) => item?.online !== false).length;

        setOnlineHardwareCount(nextCount);

        if (previousHardwareCountRef.current !== nextCount) {
          addLog(
            nextCount > 0
              ? `[设备] 检测到 ${nextCount} 台机器人在线`
              : "[设备] 当前没有机器人在线",
          );
          previousHardwareCountRef.current = nextCount;
        }

        return;
      }

      if (message.type === "evt.servo.position") {
        const xDeg =
          typeof payload?.x_deg === "number"
            ? clampServoAxis("xDeg", payload.x_deg)
            : DEFAULT_SERVO_POSITION.xDeg;
        const yDeg =
          typeof payload?.y_deg === "number"
            ? clampServoAxis("yDeg", payload.y_deg)
            : DEFAULT_SERVO_POSITION.yDeg;

        const nextServo = clampServoPosition({ xDeg, yDeg });
        setServoPosition(nextServo);
        setDraftServo(nextServo);
        return;
      }

      if (message.type === "sys.ack") {
        const target = typeof payload?.type === "string" ? payload.type : "";
        if (target === "sys.client.hello") {
          addLog("[桌面端] 已向 watcher-server 完成 desktop 握手");
          return;
        }

        if (target === "evt.ai.status") {
          const status = typeof payload?.status === "string" ? payload.status : "unknown";
          const forwardedClients =
            typeof payload?.forwarded_clients === "number" ? payload.forwarded_clients : 0;
          addLog(`[Expression] 已同步到 ${forwardedClients} 台硬件: ${status}`);
        }
        return;
      }

      if (message.type === "sys.nack") {
        const target = typeof payload?.type === "string" ? payload.type : "unknown";
        const reason = typeof payload?.reason === "string" ? payload.reason : "unknown error";
        if (target === "evt.ai.status") {
          addLog(`[Expression] 同步失败: ${reason}`);
          toast.error("Expression 同步失败", {
            description: reason,
          });
          return;
        }

        addLog(`[协议错误] ${target}: ${reason}`);
        toast.error("机器人控制失败", {
          description: reason,
        });
        return;
      }

      if (message.type === "evt.ai.status") {
        const status = typeof payload?.status === "string" ? payload.status : "unknown";
        const detail = typeof payload?.message === "string" ? payload.message : "OpenClaw 状态更新";
        addLog(`[OpenClaw] ${status}: ${detail}`);
      }
    },
    [addLog],
  );

  const { state: socketState, lastError, isConnected, sendJson } = usePythonServerSocket({
    url: wsUrl,
    enabled: isRunning,
    onJsonMessage: handleWatcherMessage,
    onBinaryMessage: (data) => {
      addLog(`[二进制] 收到 ${data.byteLength} bytes 数据帧`);
    },
  });

  useEffect(() => {
    if (previousSocketStateRef.current !== socketState) {
      addLog(`[WebSocket] 状态切换为 ${socketState}`);
      previousSocketStateRef.current = socketState;
    }

    if (socketState !== "connected") {
      helloSentRef.current = false;
    }
  }, [addLog, socketState]);

  useEffect(() => {
    if (!lastError) {
      return;
    }

    addLog(`[WebSocket 错误] ${lastError}`);
  }, [addLog, lastError]);

  useEffect(() => {
    if (!isConnected || helloSentRef.current) {
      return;
    }

    const ok = sendJson({
      type: "sys.client.hello",
      code: 0,
      data: {
        role: "desktop",
      },
    });

    if (ok) {
      helloSentRef.current = true;
    }
  }, [isConnected, sendJson]);

  useEffect(() => {
    const disposers: Array<() => void> = [];

    Promise.all([
      onServerEvent("server-log", (payload) => addLog(String(payload))),
      onServerEvent("server-exited", () => addLog("[系统] watcher-server 进程已退出")),
      onServerEvent("server-stopped", () => addLog("[系统] watcher-server 已停止")),
      listen("tauri://close-requested", () => addLog("[系统] 收到窗口关闭事件")),
    ]).then((result) => {
      result.forEach((dispose) => disposers.push(dispose));
    });

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [addLog]);

  useEffect(() => {
    setDraftServo(servoPosition);
  }, [servoPosition]);

  useEffect(() => {
    if (activeView !== "dashboard") {
      setChatExpanded(false);
      setLogsExpanded(false);
    }
  }, [activeView]);

  useEffect(() => {
    setVisitedViews((current) => (current.includes(activeView) ? current : [...current, activeView]));
  }, [activeView]);

  useEffect(() => {
    return () => {
      if (servoCommitTimerRef.current) {
        window.clearTimeout(servoCommitTimerRef.current);
      }
    };
  }, []);

  const handleStartWatcherServer = useCallback(async () => {
    setStartingServer(true);
    try {
      const result = await startServer();
      addLog(`[系统] 服务启动完成: ${result.mode} (${result.label})`);
    } catch (error) {
      toast.error("启动 watcher-server 失败", {
        description: String(error),
      });
      addLog(`[错误] 服务启动失败: ${String(error)}`);
    } finally {
      setStartingServer(false);
    }
  }, [addLog]);

  const scheduleServoCommand = useCallback(
    (nextServo: ServoPosition) => {
      const clampedServo = clampServoPosition(nextServo);
      setDraftServo(clampedServo);

      if (servoCommitTimerRef.current) {
        window.clearTimeout(servoCommitTimerRef.current);
      }

      servoCommitTimerRef.current = window.setTimeout(() => {
        const ok = sendJson({
          type: "ctrl.servo.angle",
          code: 0,
          data: {
            x_deg: clampedServo.xDeg,
            y_deg: clampedServo.yDeg,
            duration_ms: 220,
          },
        });

        if (!ok) {
          toast.error("控制命令未发送", {
            description: "Watcher WebSocket 还没有准备好。",
          });
          return;
        }

        addLog(
          `[控制] 发送舵机目标 x=${clampedServo.xDeg.toFixed(0)}°, y=${clampedServo.yDeg.toFixed(0)}°`,
        );
      }, 140);
    },
    [addLog, sendJson],
  );

  const hasHardware = onlineHardwareCount > 0;
  const controlReady = isRunning && isConnected && hasHardware;

  const recentLogLines = useMemo(() => {
    const flattened = logs.flatMap((entry) => {
      const segments = entry.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (segments.length === 0) {
        return [{ id: `${entry.id}-0`, text: entry.text.trim() }];
      }

      return segments.map((text, index) => ({
        id: `${entry.id}-${index}`,
        text,
      }));
    });

    return flattened.slice(logsExpanded ? -48 : -12);
  }, [logs, logsExpanded]);

  const connectRobotLabel = useMemo(() => {
    if (!isRunning) {
      return "Connect robot";
    }
    if (!isConnected) {
      return "Reconnect desktop";
    }
    return "Waiting for hardware";
  }, [isConnected, isRunning]);

  const connectRobotDescription = useMemo(() => {
    if (!isRunning) {
      return "Start watcher-server and wait for the robot to appear online.";
    }

    if (!isConnected) {
      return "The backend is running. Restore the desktop socket to regain control.";
    }

    return "The desktop bridge is online. Waiting for watcher-server to report hardware.";
  }, [isConnected, isRunning]);

  const handleConnectRobot = useCallback(async () => {
    if (!isRunning) {
      await handleStartWatcherServer();
      return;
    }

    if (!isConnected) {
      addLog("[系统] 正在等待桌面 WebSocket 重连");
      return;
    }

    toast.message("桌面端已在线", {
      description: "当前正在等待硬件机器人通过 watcher-server 上线。",
    });
    addLog("[设备] 桌面端已连接，等待机器人上电或接入网络");
  }, [addLog, handleStartWatcherServer, isConnected, isRunning]);

  const handleSelectView = useCallback(
    (view: ControlHubView) => {
      if (view === activeView) {
        return;
      }

      startTransition(() => {
        setActiveView(view);
      });
    },
    [activeView],
  );

  const activeModule = dashboardModuleById[activeView] ?? dashboardModuleById.dashboard;
  const isCanvasView = activeModule.surface === "canvas";
  const sidebarItems = useMemo(
    () => dashboardModules.filter((module) => module.includeInSidebar !== false),
    [],
  );
  const renderedModules = useMemo(
    () =>
      dashboardModules.filter(
        (module) => module.id === activeView || (module.keepAlive && visitedViews.includes(module.id)),
      ),
    [activeView, visitedViews],
  );
  const moduleRenderContext = useMemo<DashboardModuleRenderContext>(
    () => ({
      active: false,
      wsUrl,
      isRunning,
      socketState,
      logs,
      recentLogLines,
      hasHardware,
      controlReady,
      draftServo,
      startingServer,
      chatExpanded,
      logsExpanded,
      navigate: handleSelectView,
      addLog,
      sendJson,
      onStartServer: handleStartWatcherServer,
      onConnectRobot: handleConnectRobot,
      onClearLogs: () => setLogs([]),
      onToggleChatExpanded: () => setChatExpanded((current) => !current),
      onToggleLogsExpanded: () => setLogsExpanded((current) => !current),
      onServoChange: scheduleServoCommand,
      connectRobotLabel,
      connectRobotDescription,
    }),
    [
      addLog,
      chatExpanded,
      connectRobotDescription,
      connectRobotLabel,
      controlReady,
      draftServo,
      handleConnectRobot,
      handleSelectView,
      handleStartWatcherServer,
      hasHardware,
      isRunning,
      logs,
      logsExpanded,
      recentLogLines,
      scheduleServoCommand,
      sendJson,
      socketState,
      startingServer,
      wsUrl,
    ],
  );

  return (
    <div
      className={`control-hub-page${isCanvasView && sidebarCollapsed ? " control-hub-page--sidebar-collapsed" : ""}`}
    >
      <header
        className={`control-hub-page__topbar${isCanvasView ? " control-hub-page__topbar--dashboard" : ""}`}
      >
        <img className="control-hub-page__logo" src={dashboardLogo} alt="ORULINK" />
        <div className="control-hub-page__profile" aria-hidden="true">
          <img src={userIcon} alt="" />
        </div>
      </header>

      <div
        className={`control-hub-shell${isCanvasView ? " control-hub-shell--dashboard" : ""}`}
      >
        <ControlHubSidebar
          activeView={activeView}
          collapsed={sidebarCollapsed}
          items={sidebarItems}
          footer={activeModule.footer}
          onSelect={handleSelectView}
          onToggle={() => setSidebarCollapsed((current) => !current)}
        />
        <main
          className={`control-hub-shell__workspace${isCanvasView ? " control-hub-shell__workspace--dashboard" : ""}`}
        >
          <div className="control-hub-view-stack">
            {renderedModules.map((module) => {
              const active = module.id === activeView;
              const surfaceClass =
                module.surface === "canvas"
                  ? "control-hub-view--dashboard"
                  : "control-hub-view--settings";

              return (
                <section
                  key={module.id}
                  className={`control-hub-view ${surfaceClass}${active ? " is-active" : " is-hidden"}`}
                  aria-hidden={!active}
                >
                  {module.render({
                    ...moduleRenderContext,
                    active,
                  })}
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
