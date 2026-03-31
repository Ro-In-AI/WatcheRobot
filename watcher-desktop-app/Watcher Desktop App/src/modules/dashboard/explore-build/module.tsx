import { useEffect } from "react";
import { toast } from "sonner";
import ExploreBuildWorkspace from "@/modules/dashboard/explore-build/workspace";
import { BUILD_STAGE_IMAGE_SRCS } from "@/modules/dashboard/explore-build/stages";

interface BuildModuleProps {
  onBackToDashboard: () => void;
  onLog: (text: string) => void;
}

export default function BuildModule({ onBackToDashboard, onLog }: BuildModuleProps) {
  useEffect(() => {
    BUILD_STAGE_IMAGE_SRCS.forEach((src) => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    });
  }, []);

  const handleSelectStage = (stageId: string, title: string) => {
    toast.message("暂未开发", {
      description: `${title} 功能正在开发中。`,
    });
    onLog(`[Build] ${title} (${stageId}) 暂未开发`);
  };

  return (
    <div className="dashboard-build-page">
      <button
        type="button"
        className="main-dashboard__build-back dashboard-build-page__back"
        onClick={onBackToDashboard}
      >
        Back to Dashboard
      </button>
      <ExploreBuildWorkspace embedded onSelectStage={handleSelectStage} />
    </div>
  );
}
