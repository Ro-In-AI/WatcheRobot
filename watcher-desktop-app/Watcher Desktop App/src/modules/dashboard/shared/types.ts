export interface DashboardLogEntry {
  id: number;
  text: string;
  timestamp: string;
}

export interface DashboardLogLine {
  id: string;
  text: string;
}

export interface ServoPosition {
  xDeg: number;
  yDeg: number;
}

export type ControlHubView =
  | "dashboard"
  | "skills"
  | "creator-mode"
  | "expressions"
  | "channel"
  | "model"
  | "agent"
  | "runtime"
  | "build";

export type DashboardQuickActionId = Extract<
  ControlHubView,
  "skills" | "creator-mode" | "expressions" | "build"
>;

export interface DashboardQuickActionDefinition {
  id: DashboardQuickActionId;
  title: string;
  caption: string;
}
