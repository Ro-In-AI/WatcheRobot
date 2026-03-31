import { useState } from "react";
import { toast } from "sonner";
import StartPage from "@/modules/onboarding/StartPage";
import InitializationPage from "@/modules/onboarding/InitializationPage";
import { startServer } from "@/modules/server/service/api";

interface OnboardingFlowProps {
  wsUrl?: string;
  onEnterMain: () => void;
}

export default function OnboardingFlow({ wsUrl, onEnterMain }: OnboardingFlowProps) {
  const [stage, setStage] = useState<"start" | "setup" | "app">("start");
  const [startingServer, setStartingServer] = useState(false);

  const handleStart = async () => {
    setStartingServer(true);
    try {
      await startServer();
    } catch (error) {
      toast.error("启动服务器失败", {
        description: String(error),
      });
    } finally {
      setStartingServer(false);
      setStage("setup");
    }
  };

  if (stage === "start") {
    return <StartPage onStart={() => void handleStart()} isStarting={startingServer} />;
  }

  if (stage === "setup") {
    return (
      <InitializationPage
        wsUrl={wsUrl}
        onComplete={() => {
          setStage("app");
          onEnterMain();
        }}
      />
    );
  }

  return null;
}
