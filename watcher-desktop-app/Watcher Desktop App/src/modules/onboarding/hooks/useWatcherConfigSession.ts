import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWatcherConfigSocket,
  type WatcherConfigSocketState,
} from "@/modules/onboarding/api/watcherConfig";
import { debugError, debugLog, startDebugTimer } from "@/shared/lib/debugLog";
import type {
  OnboardingServerModule,
  WatcherConfigSnapshot,
  WatcherModuleReport,
} from "@/shared/types/runtime";

const EMPTY_SNAPSHOT: WatcherConfigSnapshot = {
  asr: null,
  tts: null,
  llm: null,
  dialogue: null,
};

function setSnapshotEntry(
  previous: WatcherConfigSnapshot,
  module: OnboardingServerModule,
  report: WatcherModuleReport,
): WatcherConfigSnapshot {
  return {
    ...previous,
    [module]: report,
  };
}

export function useWatcherConfigSession(wsUrl?: string) {
  const socketRef = useRef<ReturnType<typeof createWatcherConfigSocket> | null>(null);
  const [socketState, setSocketState] = useState<WatcherConfigSocketState>("idle");
  const [snapshot, setSnapshot] = useState<WatcherConfigSnapshot>(EMPTY_SNAPSHOT);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!wsUrl) {
      debugLog("WatcherConfigSession", "wsUrl missing, resetting session");
      socketRef.current?.close();
      socketRef.current = null;
      setSocketState("idle");
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    const socket = createWatcherConfigSocket(wsUrl);
    debugLog("WatcherConfigSession", "creating watcher config socket", { wsUrl });
    socketRef.current = socket;
    const disposeState = socket.onStateChange((state) => {
      debugLog("WatcherConfigSession", "socket state updated", { wsUrl, state });
      setSocketState(state);
    });
    socket.connect();

    return () => {
      debugLog("WatcherConfigSession", "disposing watcher config socket", { wsUrl });
      disposeState();
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [wsUrl]);

  const requestReport = useCallback(async (module: OnboardingServerModule) => {
    const socket = socketRef.current;
    if (!socket) {
      debugError(
        "WatcherConfigSession",
        "requestReport called before websocket client was ready",
        new Error("watcher websocket client is not ready"),
        { module },
      );
      throw new Error("watcher websocket client is not ready");
    }

    const timer = startDebugTimer("WatcherConfigSession", `request module report ${module}`, { module });

    try {
      const report = await socket.requestReport(module);
      setSnapshot((previous) => setSnapshotEntry(previous, module, report));
      timer.success(`request module report ${module} completed`);
      return report;
    } catch (error) {
      timer.fail(error, `request module report ${module} failed`);
      throw error;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const timer = startDebugTimer("WatcherConfigSession", "refresh all module reports");
    setIsRefreshing(true);
    try {
      await Promise.all([
        requestReport("asr"),
        requestReport("tts"),
        requestReport("llm"),
        requestReport("dialogue"),
      ]);
      timer.success("refresh all module reports completed");
    } catch (error) {
      timer.fail(error, "refresh all module reports failed");
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [requestReport]);

  const saveModule = useCallback(
    async (module: OnboardingServerModule, config: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket) {
        debugError(
          "WatcherConfigSession",
          "saveModule called before websocket client was ready",
          new Error("watcher websocket client is not ready"),
          { module },
        );
        throw new Error("watcher websocket client is not ready");
      }

      const timer = startDebugTimer("WatcherConfigSession", `save module ${module}`, {
        module,
        keys: Object.keys(config),
      });

      try {
        const report = await socket.updateConfig({ module, config });
        setSnapshot((previous) => setSnapshotEntry(previous, module, report));
        timer.success(`save module ${module} completed`);
        return report;
      } catch (error) {
        timer.fail(error, `save module ${module} failed`, { module });
        throw error;
      }
    },
    [],
  );

  return {
    socketState,
    snapshot,
    isRefreshing,
    requestReport,
    refreshAll,
    saveModule,
  };
}
