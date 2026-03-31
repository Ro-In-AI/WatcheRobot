import { useEffect, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import dashboardActionCardBg from "@/assets/pencil/dev-pages/card-bg.svg";
import RobotModelViewer from "@/components/RobotModelViewer";
import CompactOpenClawChat from "@/modules/dashboard/chat/compact-chat";
import { classifyLogTone } from "@/modules/dashboard/shared/logTone";
import { SERVO_LIMITS, clampServoAxis } from "@/modules/dashboard/shared/servoLimits";
import type {
  DashboardLogLine,
  DashboardQuickActionDefinition,
  ServoPosition,
} from "@/modules/dashboard/shared/types";

interface DashboardHomeWorkspaceProps {
  visible: boolean;
  controlReady: boolean;
  hasHardware: boolean;
  draftServo: ServoPosition;
  recentLogLines: DashboardLogLine[];
  connectRobotLabel: string;
  connectRobotDescription: string;
  startingServer: boolean;
  chatExpanded: boolean;
  logsExpanded: boolean;
  quickActions: readonly DashboardQuickActionDefinition[];
  onConnectRobot: () => Promise<void>;
  onSelectQuickAction: (actionId: DashboardQuickActionDefinition["id"]) => void;
  onToggleChatExpanded: () => void;
  onToggleLogsExpanded: () => void;
  onServoChange: (nextServo: ServoPosition) => void;
}

export default function DashboardHomeWorkspace({
  visible,
  controlReady,
  hasHardware,
  draftServo,
  recentLogLines,
  connectRobotLabel,
  connectRobotDescription,
  startingServer,
  chatExpanded,
  logsExpanded,
  quickActions,
  onConnectRobot,
  onSelectQuickAction,
  onToggleChatExpanded,
  onToggleLogsExpanded,
  onServoChange,
}: DashboardHomeWorkspaceProps) {
  const logsViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = logsViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [recentLogLines]);

  return (
    <div className="main-dashboard dashboard-layout-embedded">
      <div className={`main-dashboard__layout${logsExpanded ? " main-dashboard__layout--logs-expanded" : ""}`}>
        <section
          className={`main-dashboard__left-column${logsExpanded ? " is-logs-expanded" : ""}`}
        >
          <article className="dashboard-card dashboard-card--hero">
            <div className="dashboard-card__floating-status">
              <div className={`dashboard-card__floating-dot ${controlReady ? "is-online" : ""}`} />
              <span>{controlReady ? "Online" : "Offline"}</span>
              <i aria-hidden="true" />
            </div>
            <RobotModelViewer
              xDeg={draftServo.xDeg}
              yDeg={draftServo.yDeg}
              active={visible}
              showHint={false}
              variant="dashboard"
            />
          </article>

          <div className={`main-dashboard__middle-panel${logsExpanded ? " is-collapsed" : ""}`}>
            {hasHardware ? (
              <div className="main-dashboard__control-grid">
                <article className="dashboard-card dashboard-card--control">
                  <header className="dashboard-card__micro-header">
                    <strong>Up and down</strong>
                  </header>
                  <input
                    className="dashboard-slider"
                    type="range"
                    min={SERVO_LIMITS.yDeg.min}
                    max={SERVO_LIMITS.yDeg.max}
                    step={1}
                    value={draftServo.yDeg}
                    disabled={!controlReady}
                    onChange={(event) =>
                      onServoChange({
                        xDeg: draftServo.xDeg,
                        yDeg: clampServoAxis("yDeg", Number(event.target.value)),
                      })
                    }
                  />
                </article>

                <article className="dashboard-card dashboard-card--control">
                  <header className="dashboard-card__micro-header">
                    <strong>Left and right</strong>
                  </header>
                  <input
                    className="dashboard-slider"
                    type="range"
                    min={SERVO_LIMITS.xDeg.min}
                    max={SERVO_LIMITS.xDeg.max}
                    step={1}
                    value={draftServo.xDeg}
                    disabled={!controlReady}
                    onChange={(event) =>
                      onServoChange({
                        xDeg: clampServoAxis("xDeg", Number(event.target.value)),
                        yDeg: draftServo.yDeg,
                      })
                    }
                  />
                </article>
              </div>
            ) : (
              <article className="dashboard-card dashboard-card--connect">
                <div className="dashboard-card__connect-copy">
                  <strong>{connectRobotLabel}</strong>
                  <span>{connectRobotDescription}</span>
                </div>
                <button
                  type="button"
                  className="dashboard-connect-button"
                  disabled={startingServer}
                  onClick={() => void onConnectRobot()}
                >
                  {startingServer ? "Starting..." : connectRobotLabel}
                </button>
              </article>
            )}
          </div>

          <article className="dashboard-card dashboard-card--logs">
            <header className="dashboard-card__section-header">
              <h3>LOGS</h3>
              <button
                type="button"
                className="ghost-button"
                aria-pressed={logsExpanded}
                onClick={onToggleLogsExpanded}
                title={logsExpanded ? "Collapse logs" : "Expand logs"}
              >
                {logsExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                {logsExpanded ? "Collapse" : "Expand"}
              </button>
            </header>

            <div className="dashboard-log-surface" ref={logsViewportRef}>
              {recentLogLines.length === 0 ? (
                <div className="dashboard-log-surface__empty">Waiting for watcher-server logs...</div>
              ) : (
                recentLogLines.map((line, index, collection) => (
                  <div
                    key={line.id}
                    className={`dashboard-log-line is-${classifyLogTone(line.text, index, collection.length)}`}
                  >
                    <code>{line.text}</code>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section
          className={`main-dashboard__right-column${chatExpanded ? " is-chat-expanded" : ""}`}
        >
          <div
            className={`main-dashboard__quick-actions${chatExpanded ? " is-collapsed" : ""}`}
            aria-hidden={chatExpanded}
          >
            {quickActions.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dashboard-action-card"
                tabIndex={chatExpanded ? -1 : 0}
                onClick={() => onSelectQuickAction(item.id)}
              >
                <img
                  className="dashboard-action-card__background"
                  src={dashboardActionCardBg}
                  alt=""
                  aria-hidden="true"
                />
                <div className="dashboard-action-card__copy">
                  <strong>{item.title}</strong>
                  <span>{item.caption}</span>
                </div>
              </button>
            ))}
          </div>

          <CompactOpenClawChat
            expanded={chatExpanded}
            onToggleExpanded={onToggleChatExpanded}
          />
        </section>
      </div>
    </div>
  );
}
