export interface OpenClawChatSessionSummary {
  key: string;
  sessionId?: string;
  displayName?: string;
  channel?: string;
  chatType?: string;
  updatedAt?: number;
  model?: string;
  modelProvider?: string;
  [key: string]: unknown;
}

export interface OpenClawChatSessionsResponse {
  count?: number;
  sessions: OpenClawChatSessionSummary[];
  [key: string]: unknown;
}

export interface OpenClawChatMessagePart {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  partialJson?: string;
  [key: string]: unknown;
}

export interface OpenClawChatMessage {
  role: string;
  content?: string | OpenClawChatMessagePart[];
  timestamp?: number;
  provider?: string;
  model?: string;
  usage?: Record<string, unknown>;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  [key: string]: unknown;
}

export interface OpenClawChatHistoryResponse {
  sessionKey: string;
  sessionId?: string;
  messages: OpenClawChatMessage[];
  [key: string]: unknown;
}

export interface OpenClawChatGatewayHealth {
  ok?: boolean;
  [key: string]: unknown;
}

export interface OpenClawChatGatewayStatus {
  status: "connecting" | "connected" | "disconnected" | "error";
  summary: string;
}

export interface OpenClawChatSendResponse {
  runId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface OpenClawChatStreamEvent {
  type: "text" | "thinking" | "phase" | "done" | "error";
  runId?: string;
  sessionKey?: string;
  delta?: string;
  phase?: string;
}
