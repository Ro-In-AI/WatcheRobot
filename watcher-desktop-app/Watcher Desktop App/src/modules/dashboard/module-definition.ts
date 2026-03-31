import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type {
  ControlHubView,
  DashboardLogEntry,
  DashboardLogLine,
  ServoPosition,
} from "@/modules/dashboard/shared/types";

export interface DashboardModuleFooterCopy {
  title: string;
  body: string;
}

export interface DashboardModuleRenderContext {
  active: boolean;
  wsUrl?: string;
  isRunning: boolean;
  socketState: string;
  logs: DashboardLogEntry[];
  recentLogLines: DashboardLogLine[];
  hasHardware: boolean;
  controlReady: boolean;
  draftServo: ServoPosition;
  startingServer: boolean;
  chatExpanded: boolean;
  logsExpanded: boolean;
  navigate: (view: ControlHubView) => void;
  addLog: (text: string) => void;
  sendJson: (message: unknown) => boolean;
  onStartServer: () => Promise<void>;
  onConnectRobot: () => Promise<void>;
  onClearLogs: () => void;
  onToggleChatExpanded: () => void;
  onToggleLogsExpanded: () => void;
  onServoChange: (nextServo: ServoPosition) => void;
  connectRobotLabel: string;
  connectRobotDescription: string;
}

export interface DashboardModuleDefinition {
  id: ControlHubView;
  title: string;
  caption: string;
  icon: LucideIcon;
  footer: DashboardModuleFooterCopy;
  surface: "canvas" | "settings";
  includeInSidebar?: boolean;
  keepAlive?: boolean;
  render: (context: DashboardModuleRenderContext) => ReactNode;
}
