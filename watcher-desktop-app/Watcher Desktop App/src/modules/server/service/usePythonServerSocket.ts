import { useEffect, useRef, useState } from "react";
import {
  connectPythonServerSocket,
  type PythonServerJsonMessage,
  type PythonServerSocketState,
} from "@/shared/lib/pythonServerSocket";

interface UsePythonServerSocketOptions {
  url: string;
  enabled: boolean;
  reconnectDelay?: number;
  onJsonMessage?: (message: PythonServerJsonMessage) => void;
  onTextMessage?: (message: string) => void;
  onBinaryMessage?: (data: ArrayBuffer) => void;
}

export function usePythonServerSocket({
  url,
  enabled,
  reconnectDelay = 1500,
  onJsonMessage,
  onTextMessage,
  onBinaryMessage,
}: UsePythonServerSocketOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const onJsonMessageRef = useRef(onJsonMessage);
  const onTextMessageRef = useRef(onTextMessage);
  const onBinaryMessageRef = useRef(onBinaryMessage);

  const [state, setState] = useState<PythonServerSocketState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  onJsonMessageRef.current = onJsonMessage;
  onTextMessageRef.current = onTextMessage;
  onBinaryMessageRef.current = onBinaryMessage;

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      setState("idle");
      setLastError(null);
      return;
    }

    let cancelled = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimerRef.current) {
        return;
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, reconnectDelay);
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      if (socketRef.current) {
        const readyState = socketRef.current.readyState;
        if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
          return;
        }
      }

      setState("connecting");

      const socket = connectPythonServerSocket(url, {
        onOpen: () => {
          if (cancelled) {
            socket.close();
            return;
          }

          setState("connected");
          setLastError(null);
        },
        onClose: () => {
          if (socketRef.current === socket) {
            socketRef.current = null;
          }

          if (cancelled) {
            return;
          }

          setState("disconnected");
          scheduleReconnect();
        },
        onError: () => {
          if (cancelled) {
            return;
          }

          setState("error");
          setLastError("WebSocket connection failed");
        },
        onJsonMessage: (message) => {
          onJsonMessageRef.current?.(message);
        },
        onTextMessage: (message) => {
          onTextMessageRef.current?.(message);
        },
        onBinaryMessage: (data) => {
          onBinaryMessageRef.current?.(data);
        },
      });

      socketRef.current = socket;
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [enabled, reconnectDelay, url]);

  const sendJson = (message: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  };

  const sendText = (message: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(message);
    return true;
  };

  return {
    state,
    lastError,
    isConnected: state === "connected",
    sendJson,
    sendText,
  };
}
