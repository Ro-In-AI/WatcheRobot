import { debugError, debugLog } from "@/shared/lib/debugLog";

export type PythonServerSocketState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface PythonServerJsonMessage {
  type?: string;
  code?: number;
  data?: unknown;
}

export interface PythonServerSocketHandlers {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: () => void;
  onJsonMessage?: (message: PythonServerJsonMessage) => void;
  onTextMessage?: (message: string) => void;
  onBinaryMessage?: (data: ArrayBuffer) => void;
}

export function connectPythonServerSocket(
  url: string,
  handlers: PythonServerSocketHandlers,
) {
  debugLog("PythonServerSocket", "creating websocket connection", { url });
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    debugLog("PythonServerSocket", "websocket opened", { url });
    handlers.onOpen?.();
  };

  socket.onclose = (event) => {
    debugLog("PythonServerSocket", "websocket closed", {
      url,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    handlers.onClose?.(event);
  };

  socket.onerror = (event) => {
    debugError("PythonServerSocket", "websocket error", event, { url });
    handlers.onError?.();
  };

  socket.onmessage = async (event) => {
    if (typeof event.data === "string") {
      debugLog("PythonServerSocket", "received text frame", {
        url,
        preview: event.data.slice(0, 300),
      });
      handlers.onTextMessage?.(event.data);

      try {
        const message = JSON.parse(event.data) as PythonServerJsonMessage;
        debugLog("PythonServerSocket", "parsed json frame", {
          url,
          type: message.type ?? null,
          code: message.code ?? null,
        });
        handlers.onJsonMessage?.(message);
      } catch {
        // Ignore non-JSON text frames.
      }
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      debugLog("PythonServerSocket", "received binary frame", {
        url,
        bytes: event.data.byteLength,
      });
      handlers.onBinaryMessage?.(event.data);
      return;
    }

    if (event.data instanceof Blob) {
      const data = await event.data.arrayBuffer();
      debugLog("PythonServerSocket", "received blob frame", {
        url,
        bytes: data.byteLength,
      });
      handlers.onBinaryMessage?.(data);
    }
  };

  return socket;
}
