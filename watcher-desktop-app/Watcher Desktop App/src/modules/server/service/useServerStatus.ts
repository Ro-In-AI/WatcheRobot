import { useEffect, useState } from "react";
import { getServerStatus } from "@/modules/server/service/api";

export function useServerStatus(refreshInterval = 2000) {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const status = await getServerStatus();
      setIsRunning(status);
    } catch (error) {
      console.error("检查服务器状态失败:", error);
      setIsRunning(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const interval = window.setInterval(checkStatus, refreshInterval);
    return () => window.clearInterval(interval);
  }, [refreshInterval]);

  return [isRunning, loading] as const;
}
