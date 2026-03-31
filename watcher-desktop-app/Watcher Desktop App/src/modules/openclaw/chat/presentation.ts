import type {
  OpenClawChatHistoryResponse,
  OpenClawChatMessage,
  OpenClawChatMessagePart,
} from "@/modules/openclaw/chat/types";

export interface ChatDisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thinking?: string;
  timestamp?: number;
  provider?: string;
  model?: string;
}

export interface ChatDisplayToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export interface ChatDisplayToolCallGroup {
  id: string;
  timestamp?: number;
  provider?: string;
  model?: string;
  calls: ChatDisplayToolCall[];
}

export interface ChatDisplayToolResult {
  id: string;
  timestamp?: number;
  toolName: string;
  toolCallId?: string;
  output: string;
  isError: boolean;
}

export type ChatConversationItem =
  | {
      kind: "message";
      id: string;
      message: ChatDisplayMessage;
    }
  | {
      kind: "toolCallGroup";
      id: string;
      group: ChatDisplayToolCallGroup;
    }
  | {
      kind: "toolResult";
      id: string;
      result: ChatDisplayToolResult;
    };

function normalizeMessageParts(content: OpenClawChatMessage["content"]): OpenClawChatMessagePart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content as OpenClawChatMessagePart[];
}

function formatStructuredValue(value: unknown): string {
  if (typeof value === "string") {
    return prettifyJsonText(value);
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function prettifyJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!/^[\[{]/.test(trimmed)) {
    return value;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function extractMessageText(content: OpenClawChatMessage["content"]) {
  const parts = normalizeMessageParts(content);
  const text = parts
    .map((part) => {
      if (part?.type === "toolCall" || part?.type === "thinking") {
        return "";
      }
      return typeof part?.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("\n");

  const thinking = parts
    .map((part) => (typeof part?.thinking === "string" ? part.thinking : ""))
    .filter(Boolean)
    .join("\n");

  return { text, thinking };
}

function extractToolCalls(message: OpenClawChatMessage): ChatDisplayToolCall[] {
  return normalizeMessageParts(message.content)
    .filter((part) => part?.type === "toolCall")
    .map((part, index) => {
      const name = typeof part?.name === "string" && part.name.trim() ? part.name.trim() : "tool";
      const argumentsText =
        formatStructuredValue(part?.arguments) ||
        (typeof part?.partialJson === "string" ? prettifyJsonText(part.partialJson) : "") ||
        "(无参数)";

      return {
        id:
          typeof part?.id === "string" && part.id.trim()
            ? part.id
            : `${message.timestamp ?? Date.now()}-tool-call-${index}`,
        name,
        argumentsText,
      };
    });
}

function extractToolResultOutput(message: OpenClawChatMessage) {
  const { text, thinking } = extractMessageText(message.content);
  const combined = [text, thinking].filter(Boolean).join("\n").trim();
  return prettifyJsonText(combined) || "(无输出)";
}

function normalizeMessageRole(role: string): ChatDisplayMessage["role"] {
  if (role === "assistant" || role === "user") {
    return role;
  }
  return "system";
}

export function summarizeToolCalls(calls: ChatDisplayToolCall[]) {
  const names = calls
    .map((call) => call.name)
    .filter((name, index, collection) => collection.indexOf(name) === index);

  if (calls.length === 0) {
    return "工具调用";
  }

  if (names.length === 1) {
    return `${calls.length} ${calls.length === 1 ? "tool" : "tools"} ${names[0]}`;
  }

  return `${calls.length} ${calls.length === 1 ? "tool" : "tools"}`;
}

export function buildConversationItems(
  history: OpenClawChatHistoryResponse | null,
): ChatConversationItem[] {
  if (!history || !Array.isArray(history.messages)) {
    return [];
  }

  const items: ChatConversationItem[] = [];

  history.messages.forEach((message, index) => {
    const timestamp = typeof message.timestamp === "number" ? message.timestamp : undefined;
    const provider = typeof message.provider === "string" ? message.provider : undefined;
    const model = typeof message.model === "string" ? message.model : undefined;
    const baseId = `${timestamp ?? Date.now()}-${index}`;

    if (message.role === "toolResult") {
      items.push({
        kind: "toolResult",
        id: `${baseId}-tool-result`,
        result: {
          id: `${baseId}-tool-result`,
          timestamp,
          toolName:
            typeof message.toolName === "string" && message.toolName.trim()
              ? message.toolName.trim()
              : "tool",
          toolCallId:
            typeof message.toolCallId === "string" && message.toolCallId.trim()
              ? message.toolCallId
              : undefined,
          output: extractToolResultOutput(message),
          isError: Boolean(message.isError),
        },
      });
      return;
    }

    const toolCalls = message.role === "assistant" ? extractToolCalls(message) : [];
    if (toolCalls.length > 0) {
      items.push({
        kind: "toolCallGroup",
        id: `${baseId}-tool-calls`,
        group: {
          id: `${baseId}-tool-calls`,
          timestamp,
          provider,
          model,
          calls: toolCalls,
        },
      });
    }

    const content = extractMessageText(message.content);
    const hasVisibleMessage =
      Boolean(content.text.trim()) ||
      Boolean(content.thinking) ||
      message.role === "system" ||
      toolCalls.length === 0;

    if (!hasVisibleMessage) {
      return;
    }

    items.push({
      kind: "message",
      id: `${baseId}-${message.role}`,
      message: {
        id: `${baseId}-${message.role}`,
        role: normalizeMessageRole(message.role),
        text: content.text.trim() || (content.thinking ? "" : "(无文本输出)"),
        thinking: content.thinking || undefined,
        timestamp,
        provider,
        model,
      },
    });
  });

  return items;
}
