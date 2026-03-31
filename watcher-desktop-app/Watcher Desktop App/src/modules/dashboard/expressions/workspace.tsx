import RobotModelViewer from "@/components/RobotModelViewer";
import { EXPRESSION_PRESETS } from "@/modules/dashboard/expressions/presets";
import { classifyLogTone } from "@/modules/dashboard/shared/logTone";
import type { DashboardLogLine, ServoPosition } from "@/modules/dashboard/shared/types";

interface ExpressionsWorkspaceProps {
  online: boolean;
  visible: boolean;
  draftServo: ServoPosition;
  recentLogLines: DashboardLogLine[];
  selectedExpressionId: string;
  onBackToDashboard: () => void;
  onSelectExpression: (expressionId: string, label: string) => void;
}

export default function ExpressionsWorkspace({
  online,
  visible,
  draftServo,
  recentLogLines,
  selectedExpressionId,
  onBackToDashboard,
  onSelectExpression,
}: ExpressionsWorkspaceProps) {
  return (
    <div className="expression-workspace">
      <section className="expression-workspace__left">
        <article className="dashboard-card dashboard-card--hero">
          <div className="dashboard-card__floating-status">
            <div className={`dashboard-card__floating-dot ${online ? "is-online" : ""}`} />
            <span>{online ? "Online" : "Offline"}</span>
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

        <article className="expression-logs-card">
          <header className="expression-logs-card__header">
            <h2>LOGS</h2>
          </header>

          <div className="expression-logs-surface">
            {recentLogLines.length === 0 ? (
              <div className="expression-logs-surface__empty">
                Waiting for watcher-server logs...
              </div>
            ) : (
              recentLogLines.map((line, index, collection) => (
                <div
                  key={line.id}
                  className={`expression-log-line is-${classifyLogTone(line.text, index, collection.length)}`}
                >
                  <code>{line.text}</code>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="expression-panel">
        <header className="expression-panel__header">
          <h2>Expressions</h2>
          <button
            type="button"
            className="main-dashboard__build-back expression-panel__back"
            onClick={onBackToDashboard}
          >
            Back to Dashboard
          </button>
        </header>

        <div className="expression-grid">
          {EXPRESSION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`expression-card${selectedExpressionId === preset.id ? " is-active" : ""}`}
              aria-pressed={selectedExpressionId === preset.id}
              onClick={() => onSelectExpression(preset.id, preset.label)}
            >
              <img
                className="expression-card__image"
                src={preset.image}
                alt=""
                aria-hidden="true"
                decoding="async"
              />
              <span className="expression-card__label">{preset.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
