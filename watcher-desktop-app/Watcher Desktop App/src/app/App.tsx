import { useEffect, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import MainDashboardPage from "@/modules/dashboard/page";
import { getIntegrationPaths } from "@/modules/installer/service/api";
import InitializationPage from "@/modules/onboarding/initialization/page";
import { getHasCompletedOnboarding, setHasCompletedOnboarding } from "@/modules/onboarding/lib/onboardingState";
import StartPage from "@/modules/onboarding/start/page";
import { getServerRuntimeMode, getServerStatus, startServer } from "@/modules/server/service/api";
import { debugLog } from "@/shared/lib/debugLog";
import type { IntegrationPaths } from "@/shared/types/runtime";

const FORCE_SETUP_ON_EVERY_LAUNCH = true;

const FLOW_WINDOW_SIZE: Record<"start" | "setup" | "app", { width: number; height: number }> = {
  start: { width: 512, height: 832 },
  setup: { width: 1280, height: 832 },
  app: { width: 1440, height: 920 },
};

function App() {
  const [, setCompletedOnboardingState] = useState(() =>
    FORCE_SETUP_ON_EVERY_LAUNCH ? false : getHasCompletedOnboarding(),
  );
  const [paths, setPaths] = useState<IntegrationPaths | null>(null);
  const [flow, setFlow] = useState<"start" | "setup" | "app">(() =>
    FORCE_SETUP_ON_EVERY_LAUNCH ? "setup" : getHasCompletedOnboarding() ? "app" : "start",
  );
  const [startingServer, setStartingServer] = useState(false);

  useEffect(() => {
    void getIntegrationPaths().then(setPaths).catch(console.error);
  }, []);

  useEffect(() => {
    if (!FORCE_SETUP_ON_EVERY_LAUNCH) {
      return;
    }

    setHasCompletedOnboarding(false);
    setCompletedOnboardingState(false);
  }, []);

  useEffect(() => {
    const syncWindowSize = async () => {
      try {
        const appWindow = getCurrentWindow();
        const nextSize = FLOW_WINDOW_SIZE[flow];
        await appWindow.setSize(new LogicalSize(nextSize.width, nextSize.height));
        await appWindow.center();
      } catch (error) {
        console.error("Failed to sync window size with flow", error);
      }
    };

    void syncWindowSize();
  }, [flow]);

  useEffect(() => {
    if (flow !== "setup" && flow !== "app") {
      return;
    }

    let cancelled = false;

    const ensureServerRunning = async () => {
      try {
        const isRunning = await getServerStatus();
        if (cancelled) {
          return;
        }

        if (isRunning) {
          const mode = await getServerRuntimeMode().catch(() => "unknown");
          debugLog("AppBootstrap", "backend already running", {
            flow,
            mode,
          });
          return;
        }

        const result = await startServer();
        if (cancelled) {
          return;
        }

        debugLog("AppBootstrap", "backend started", {
          flow,
          mode: result.mode,
          label: result.label,
          command: result.command,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("自动启动服务失败", error);
        toast.error("自动启动服务失败", {
          description: "你可以在「服务」页手动启动后端。",
        });
      }
    };

    void ensureServerRunning();

    return () => {
      cancelled = true;
    };
  }, [flow]);

  const handleStart = async () => {
    setStartingServer(true);
    try {
      const isRunning = await getServerStatus();
      if (!isRunning) {
        const result = await startServer();
        debugLog("AppBootstrap", "backend started from start page", {
          mode: result.mode,
          label: result.label,
          command: result.command,
        });
      } else {
        const mode = await getServerRuntimeMode().catch(() => "unknown");
        debugLog("AppBootstrap", "backend already running before start page transition", {
          mode,
        });
      }
      setFlow("setup");
    } catch (error) {
      toast.error("启动服务器失败", {
        description: String(error),
      });
    } finally {
      setStartingServer(false);
    }
  };

  if (flow === "start") {
    return <StartPage onStart={() => void handleStart()} isStarting={startingServer} />;
  }

  if (flow === "setup") {
    return (
      <InitializationPage
        wsUrl={paths?.wsUrl}
        onComplete={() => {
          setHasCompletedOnboarding(true);
          setCompletedOnboardingState(true);
          setFlow("app");
        }}
      />
    );
  }

  return <MainDashboardPage wsUrl={paths?.wsUrl} />;
}

export default App;
