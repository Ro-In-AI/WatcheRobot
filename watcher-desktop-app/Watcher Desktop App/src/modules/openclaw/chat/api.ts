import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  OpenClawChatGatewayHealth,
  OpenClawChatGatewayStatus,
  OpenClawChatHistoryResponse,
  OpenClawChatSendResponse,
  OpenClawChatStreamEvent,
  OpenClawChatSessionsResponse,
} from "@/modules/openclaw/chat/types";

export interface OpenClawChatSendParams {
  sessionKey: string;
  message: string;
  idempotencyKey?: string;
  thinking?: string;
}

const STREAM_EVENT = "openclaw-chat-stream";
const STATUS_EVENT = "openclaw-chat-status";

export const openclawChatApi = {
  async connect(): Promise<OpenClawChatGatewayStatus> {
    return invoke("openclaw_chat_connect");
  },

  async disconnect(): Promise<OpenClawChatGatewayStatus> {
    return invoke("openclaw_chat_disconnect");
  },

  async gatewayHealth(): Promise<OpenClawChatGatewayHealth> {
    return invoke("openclaw_chat_gateway_health");
  },

  async startGateway(): Promise<string> {
    return invoke("openclaw_chat_start_gateway");
  },

  async listSessions(): Promise<OpenClawChatSessionsResponse> {
    return invoke("openclaw_chat_list_sessions");
  },

  async getHistory(sessionKey: string): Promise<OpenClawChatHistoryResponse> {
    return invoke("openclaw_chat_get_history", { sessionKey });
  },

  async sendMessage(params: OpenClawChatSendParams): Promise<OpenClawChatSendResponse> {
    return invoke("openclaw_chat_send_message", {
      sessionKey: params.sessionKey,
      message: params.message,
      idempotencyKey: params.idempotencyKey,
      thinking: params.thinking,
    });
  },

  async abortSession(sessionKey: string): Promise<Record<string, unknown>> {
    return invoke("openclaw_chat_abort_session", { sessionKey });
  },

  async deleteSession(sessionKey: string): Promise<Record<string, unknown>> {
    return invoke("openclaw_chat_delete_session", { sessionKey });
  },

  onStream(
    callback: (event: OpenClawChatStreamEvent) => void,
  ): Promise<UnlistenFn> {
    return listen<OpenClawChatStreamEvent>(STREAM_EVENT, ({ payload }) => {
      callback(payload);
    });
  },

  onStatus(
    callback: (event: OpenClawChatGatewayStatus) => void,
  ): Promise<UnlistenFn> {
    return listen<OpenClawChatGatewayStatus>(STATUS_EVENT, ({ payload }) => {
      callback(payload);
    });
  },
};
