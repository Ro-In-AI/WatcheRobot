import { connectPythonServerSocket } from "@/shared/lib/pythonServerSocket";
import { debugError, debugLog, debugWarn, startDebugTimer } from "@/shared/lib/debugLog";
import type { OnboardingServerModule, WatcherModuleReport } from "@/shared/types/runtime";

export type WatcherConfigSocketState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface WatcherConfigMessage {
  type?: string;
  code?: number;
  data?: unknown;
}

export interface WatcherConfigRequest {
  module: OnboardingServerModule;
  config: Record<string, unknown>;
}

interface PendingReport {
  resolve: (report: WatcherModuleReport) => void;
  reject: (reason: string) => void;
}

interface PendingAck {
  resolve: (payload: Record<string, unknown>) => void;
}

const REPORT_TYPES: Record<OnboardingServerModule, string> = {
  asr: "cfg.asr.report",
  tts: "cfg.tts.report",
  llm: "cfg.llm.report",
  dialogue: "cfg.dialogue.report",
};

const GET_TYPES: Record<OnboardingServerModule, string> = {
  asr: "cfg.asr.get",
  tts: "cfg.tts.get",
  llm: "cfg.llm.get",
  dialogue: "cfg.dialogue.get",
};

const UPDATE_TYPES: Record<OnboardingServerModule, string> = {
  asr: "cfg.asr.update",
  tts: "cfg.tts.update",
  llm: "cfg.llm.update",
  dialogue: "cfg.dialogue.update",
};

const REQUEST_TIMEOUT_MS = 10000;
const HELLO_TIMEOUT_MS = 8000;

function buildHelloMessage() {
  return {
    type: "sys.client.hello",
    code: 0,
    data: {
      role: "desktop",
    },
  };
}

function createCommandId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function parseReport(message: WatcherConfigMessage): WatcherModuleReport | null {
  if (typeof message.data !== "object" || message.data === null) {
    return null;
  }

  const data = message.data as Partial<WatcherModuleReport>;
  if (!data.config || !data.runtime) {
    return null;
  }

  return {
    config: data.config as Record<string, unknown>,
    runtime: data.runtime as Record<string, unknown>,
  };
}

function parseNackTarget(message: WatcherConfigMessage): string | null {
  if (typeof message.data !== "object" || message.data === null) {
    return message.type === "sys.nack" ? null : message.type ?? null;
  }

  const data = message.data as Record<string, unknown>;
  const target = data.type;
  return typeof target === "string" ? target : message.type ?? null;
}

export class WatcherConfigSocket {
  private socket: WebSocket | null = null;
  private state: WatcherConfigSocketState = "idle";
  private readonly reconnectDelayMs = 1500;
  private reconnectTimer: number | null = null;
  private helloTimeoutTimer: number | null = null;
  private manualClose = false;
  private helloReady = false;
  private helloPromise: Promise<void> | null = null;
  private helloResolve: (() => void) | null = null;
  private helloReject: ((reason: string) => void) | null = null;
  private readonly stateListeners = new Set<(state: WatcherConfigSocketState) => void>();
  private readonly reportPending = new Map<string, Array<PendingReport>>();
  private readonly errorPending = new Map<string, Array<(reason: string) => void>>();
  private readonly ackPending = new Map<string, Array<PendingAck>>();

  constructor(private readonly url: string) {}

  connect() {
    this.manualClose = false;
    this.clearReconnectTimer();
    debugLog("WatcherConfigSocket", "connect requested", { url: this.url, state: this.state });

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      debugLog("WatcherConfigSocket", "connect skipped because websocket is already open", {
        url: this.url,
      });
      return;
    }

    if (!this.helloReady && !this.helloPromise) {
      debugLog("WatcherConfigSocket", "creating pending hello promise for connection attempt", {
        url: this.url,
      });
      this.resetHelloState();
    } else if (!this.helloReady) {
      debugLog("WatcherConfigSocket", "reusing pending hello promise for reconnect attempt", {
        url: this.url,
      });
    }
    this.setState("connecting");
    this.socket = connectPythonServerSocket(this.url, {
      onOpen: () => {
        debugLog("WatcherConfigSocket", "websocket open, sending hello", { url: this.url });
        this.safeSend(buildHelloMessage());
        this.armHelloTimeout();
      },
      onClose: (event) => {
        this.rejectHello("watcher websocket disconnected");
        debugWarn("WatcherConfigSocket", "websocket closed", {
          url: this.url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        this.setState("disconnected");
        this.rejectAllPending("watcher websocket disconnected");
        this.scheduleReconnect();
      },
      onError: () => {
        this.rejectHello("watcher websocket error");
        debugError("WatcherConfigSocket", "websocket error", new Error("watcher websocket error"), {
          url: this.url,
        });
        this.setState("error");
        this.rejectAllPending("watcher websocket error");
        this.scheduleReconnect();
      },
      onJsonMessage: (message) => {
        this.handleJsonMessage(message);
      },
    });
  }

  close() {
    this.manualClose = true;
    this.clearReconnectTimer();
    debugLog("WatcherConfigSocket", "manual close requested", { url: this.url });
    this.rejectHello("watcher websocket session closed");
    this.socket?.close();
    this.socket = null;
    this.setState("idle");
  }

  getState() {
    return this.state;
  }

  onStateChange(listener: (state: WatcherConfigSocketState) => void) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  async requestReport(module: OnboardingServerModule): Promise<WatcherModuleReport> {
    await this.waitForHello();
    const timer = startDebugTimer("WatcherConfigSocket", `request report ${module}`, {
      url: this.url,
      module,
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const reportType = REPORT_TYPES[module];
      const requestType = GET_TYPES[module];
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.removeReportPending(reportType, resolveReport);
        this.removeErrorPending(requestType, rejectRequest);
        const reason = `timed out waiting for ${reportType} or sys.nack after ${REQUEST_TIMEOUT_MS}ms`;
        timer.fail(new Error(reason), `request report ${module} timed out`, {
          url: this.url,
          module,
          requestType,
          reportType,
        });
        reject(reason);
      }, REQUEST_TIMEOUT_MS);
      const resolveReport = (report: WatcherModuleReport) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        timer.success(`request report ${module} completed`, {
          url: this.url,
          module,
        });
        resolve(report);
      };
      const rejectReport = (reason: string) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        timer.fail(new Error(reason), `request report ${module} failed`, {
          url: this.url,
          module,
        });
        reject(reason);
      };
      const rejectRequest = (reason: string) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        timer.fail(new Error(reason), `request report ${module} rejected`, {
          url: this.url,
          module,
        });
        reject(reason);
      };
      this.queueReportResolver(
        reportType,
        resolveReport,
        rejectReport,
      );
      this.queueErrorRejecter(requestType, rejectRequest);

      try {
        debugLog("WatcherConfigSocket", "sending report request", {
          url: this.url,
          module,
          requestType,
        });
        this.safeSend({
          type: requestType,
          code: 0,
          data: {},
        });
      } catch (error) {
        this.removeReportPending(reportType, resolveReport);
        this.removeErrorPending(requestType, rejectRequest);
        settled = true;
        globalThis.clearTimeout(timeoutId);
        timer.fail(error, `request report ${module} send failed`, {
          url: this.url,
          module,
        });
        reject(String(error));
      }
    });
  }

  async updateConfig(request: WatcherConfigRequest): Promise<WatcherModuleReport> {
    await this.waitForHello();
    const timer = startDebugTimer("WatcherConfigSocket", `update config ${request.module}`, {
      url: this.url,
      module: request.module,
      keys: Object.keys(request.config),
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const reportType = REPORT_TYPES[request.module];
      const requestType = UPDATE_TYPES[request.module];
      const commandId = createCommandId(`cfg-${request.module}`);
      const handleAck = async (payload: Record<string, unknown>) => {
        if (settled) {
          return;
        }

        debugLog("WatcherConfigSocket", "received ack for config update", {
          url: this.url,
          module: request.module,
          requestType,
          commandId,
          payload,
        });

        globalThis.clearTimeout(timeoutId);
        this.removeErrorPending(requestType, rejectRequest);
        this.removeAckPending(requestType, handleAck);

        const followUpTimer = startDebugTimer(
          "WatcherConfigSocket",
          `fetch report after ${requestType} ack`,
          {
            url: this.url,
            module: request.module,
            requestType,
            reportType,
            commandId,
          },
        );

        try {
          const report = await this.requestReport(request.module);
          if (settled) {
            return;
          }

          settled = true;
          followUpTimer.success(`fetch report after ${requestType} ack completed`, {
            url: this.url,
            module: request.module,
            requestType,
            reportType,
            commandId,
          });
          timer.success(`update config ${request.module} completed`, {
            url: this.url,
            module: request.module,
            requestType,
            reportType,
            commandId,
          });
          resolve(report);
        } catch (error) {
          if (settled) {
            return;
          }

          settled = true;
          followUpTimer.fail(error, `fetch report after ${requestType} ack failed`, {
            url: this.url,
            module: request.module,
            requestType,
            reportType,
            commandId,
          });
          timer.fail(error, `update config ${request.module} failed after ack`, {
            url: this.url,
            module: request.module,
            requestType,
            reportType,
            commandId,
          });
          reject(String(error));
        }
      };
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.removeErrorPending(requestType, rejectRequest);
        this.removeAckPending(requestType, handleAck);
        const reason = `did not receive sys.ack or sys.nack for ${requestType} after ${REQUEST_TIMEOUT_MS}ms`;
        timer.fail(new Error(reason), `update config ${request.module} timed out`, {
          url: this.url,
          module: request.module,
          requestType,
          reportType,
          commandId,
        });
        reject(reason);
      }, REQUEST_TIMEOUT_MS);
      const rejectRequest = (reason: string) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        this.removeAckPending(requestType, handleAck);
        timer.fail(new Error(reason), `update config ${request.module} rejected`, {
          url: this.url,
          module: request.module,
          requestType,
          reportType,
          commandId,
        });
        reject(reason);
      };
      this.queueErrorRejecter(requestType, rejectRequest);
      this.queueAckResolver(requestType, handleAck);

      try {
        debugLog("WatcherConfigSocket", "sending config update", {
          url: this.url,
          module: request.module,
          requestType,
          reportType,
          commandId,
          keys: Object.keys(request.config),
        });
        this.safeSend({
          type: requestType,
          code: 0,
          data: {
            command_id: commandId,
            config: request.config,
          },
        });
      } catch (error) {
        this.removeErrorPending(requestType, rejectRequest);
        this.removeAckPending(requestType, handleAck);
        settled = true;
        globalThis.clearTimeout(timeoutId);
        timer.fail(error, `update config ${request.module} send failed`, {
          url: this.url,
          module: request.module,
          requestType,
          reportType,
          commandId,
        });
        reject(String(error));
      }
    });
  }

  private queueReportResolver(
    messageType: string,
    resolve: (report: WatcherModuleReport) => void,
    reject: (reason: string) => void,
  ) {
    const listeners = this.reportPending.get(messageType) ?? [];
    listeners.push({ resolve, reject });
    this.reportPending.set(messageType, listeners);
  }

  private queueErrorRejecter(messageType: string, reject: (reason: string) => void) {
    const listeners = this.errorPending.get(messageType) ?? [];
    listeners.push(reject);
    this.errorPending.set(messageType, listeners);
  }

  private queueAckResolver(messageType: string, resolve: (payload: Record<string, unknown>) => void) {
    const listeners = this.ackPending.get(messageType) ?? [];
    listeners.push({ resolve });
    this.ackPending.set(messageType, listeners);
  }

  private removeReportPending(
    messageType: string,
    listener: (report: WatcherModuleReport) => void,
  ) {
    const listeners = this.reportPending.get(messageType);
    if (!listeners) {
      return;
    }

    this.reportPending.set(
      messageType,
      listeners.filter((item) => item.resolve !== listener),
    );
  }

  private removeErrorPending(messageType: string, listener: (reason: string) => void) {
    const listeners = this.errorPending.get(messageType);
    if (!listeners) {
      return;
    }

    this.errorPending.set(
      messageType,
      listeners.filter((item) => item !== listener),
    );
  }

  private removeAckPending(
    messageType: string,
    listener: (payload: Record<string, unknown>) => void,
  ) {
    const listeners = this.ackPending.get(messageType);
    if (!listeners) {
      return;
    }

    this.ackPending.set(
      messageType,
      listeners.filter((item) => item.resolve !== listener),
    );
  }

  private rejectAllPending(reason: string) {
    for (const listeners of this.reportPending.values()) {
      listeners.forEach(({ reject }) => reject(reason));
    }
    for (const listeners of this.errorPending.values()) {
      listeners.forEach((reject) => reject(reason));
    }

    this.reportPending.clear();
    this.errorPending.clear();
    this.ackPending.clear();
  }

  private setState(state: WatcherConfigSocketState) {
    debugLog("WatcherConfigSocket", "state changed", {
      url: this.url,
      from: this.state,
      to: state,
    });
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private resetHelloState() {
    this.helloReady = false;
    this.helloPromise = new Promise<void>((resolve, reject) => {
      this.helloResolve = resolve;
      this.helloReject = reject;
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHelloTimeout() {
    if (this.helloTimeoutTimer !== null) {
      window.clearTimeout(this.helloTimeoutTimer);
      this.helloTimeoutTimer = null;
    }
  }

  private armHelloTimeout() {
    this.clearHelloTimeout();
    this.helloTimeoutTimer = window.setTimeout(() => {
      if (this.helloReady) {
        return;
      }

      const reason = `watcher websocket hello timed out after ${HELLO_TIMEOUT_MS}ms`;
      debugWarn("WatcherConfigSocket", reason, {
        url: this.url,
        state: this.state,
      });
      this.setState("error");
      this.rejectHello(reason);
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(4000, "hello timeout");
      }
    }, HELLO_TIMEOUT_MS);
  }

  private scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      debugLog("WatcherConfigSocket", "reconnect timer fired", {
        url: this.url,
        reconnectDelayMs: this.reconnectDelayMs,
      });
      this.connect();
    }, this.reconnectDelayMs);
    debugLog("WatcherConfigSocket", "scheduled reconnect", {
      url: this.url,
      reconnectDelayMs: this.reconnectDelayMs,
    });
  }

  private resolveHello() {
    debugLog("WatcherConfigSocket", "hello acknowledged by server", { url: this.url });
    this.clearHelloTimeout();
    this.helloReady = true;
    this.setState("connected");
    this.helloResolve?.();
    this.helloResolve = null;
    this.helloReject = null;
  }

  private rejectHello(reason: string) {
    debugWarn("WatcherConfigSocket", "hello rejected or reset", { url: this.url, reason });
    this.clearHelloTimeout();
    if (!this.helloReady) {
      this.helloReject?.(reason);
    }

    this.helloReady = false;
    this.helloPromise = null;
    this.helloResolve = null;
    this.helloReject = null;
  }

  private async waitForHello() {
    if (this.helloReady) {
      debugLog("WatcherConfigSocket", "hello already ready", { url: this.url });
      return;
    }

    if (!this.helloPromise) {
      this.resetHelloState();
    }

    debugLog("WatcherConfigSocket", "waiting for hello acknowledgement", { url: this.url });
    await this.helloPromise;
  }

  private safeSend(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      debugWarn("WatcherConfigSocket", "attempted to send while websocket not connected", {
        url: this.url,
        readyState: this.socket?.readyState ?? null,
        payloadType: typeof payload.type === "string" ? payload.type : null,
      });
      throw new Error("watcher websocket is not connected");
    }

    debugLog("WatcherConfigSocket", "sending websocket payload", {
      url: this.url,
      type: typeof payload.type === "string" ? payload.type : null,
    });
    this.socket.send(JSON.stringify(payload));
  }

  private handleJsonMessage(message: WatcherConfigMessage) {
    if (
      message.type === "sys.ack" &&
      typeof message.data === "object" &&
      message.data !== null &&
      (message.data as Record<string, unknown>).type === "sys.client.hello"
    ) {
      this.resolveHello();
      return;
    }

    if (message.type === "sys.ack") {
      const ackTarget =
        typeof message.data === "object" && message.data !== null
          ? (message.data as Record<string, unknown>).type
          : null;
      const targetType = typeof ackTarget === "string" ? ackTarget : null;

      debugLog("WatcherConfigSocket", "received ack from server", {
        url: this.url,
        targetType,
        payload: message.data ?? null,
      });

      if (targetType) {
        const ackListeners = this.ackPending.get(targetType);
        if (ackListeners && ackListeners.length > 0) {
          this.ackPending.delete(targetType);
          ackListeners.forEach(({ resolve }) =>
            resolve(
              typeof message.data === "object" && message.data !== null
                ? (message.data as Record<string, unknown>)
                : {},
            ),
          );
        }
      }
      return;
    }

    if (message.type === "sys.nack") {
      const targetType = parseNackTarget(message);
      const reason =
        typeof message.data === "object" && message.data !== null
          ? String((message.data as Record<string, unknown>).reason ?? "server rejected config update")
          : "server rejected config update";

      if (targetType === "sys.client.hello") {
        this.rejectHello(reason);
      }

      if (targetType) {
        debugWarn("WatcherConfigSocket", "received nack from server", {
          url: this.url,
          targetType,
          reason,
        });
        const errorListeners = this.errorPending.get(targetType);
        if (errorListeners && errorListeners.length > 0) {
          this.errorPending.delete(targetType);
          errorListeners.forEach((listener) => listener(reason));
        }

        const reportTarget = targetType.replace(/\.get$|\.update$/, ".report");
        const reportListeners = this.reportPending.get(reportTarget);
        if (reportListeners && reportListeners.length > 0) {
          this.reportPending.delete(reportTarget);
          reportListeners.forEach(({ reject: reportReject }) => reportReject(reason));
        }
      }
      return;
    }

    if (!message.type) {
      debugWarn("WatcherConfigSocket", "received message without type", {
        url: this.url,
        message,
      });
      return;
    }

    const report = parseReport(message);
    if (!report) {
      debugLog("WatcherConfigSocket", "received non-report message", {
        url: this.url,
        type: message.type,
        code: message.code ?? null,
      });
      return;
    }

    const listeners = this.reportPending.get(message.type);
    if (!listeners || listeners.length === 0) {
      debugLog("WatcherConfigSocket", "received report without pending listener", {
        url: this.url,
        type: message.type,
      });
      return;
    }

    debugLog("WatcherConfigSocket", "received report response", {
      url: this.url,
      type: message.type,
      listenerCount: listeners.length,
    });
    this.reportPending.delete(message.type);
    listeners.forEach(({ resolve }) => resolve(report));
  }
}

export function createWatcherConfigSocket(url: string) {
  return new WatcherConfigSocket(url);
}

export const watcherConfigMessageTypes = {
  get: GET_TYPES,
  update: UPDATE_TYPES,
  report: REPORT_TYPES,
};
