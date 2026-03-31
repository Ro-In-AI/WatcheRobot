import { toast } from "sonner";
import { BUILD_STAGES } from "@/modules/dashboard/explore-build/stages";

interface ExploreBuildWorkspaceProps {
  embedded?: boolean;
  onSelectStage?: (stageId: string, title: string) => void;
}

export default function ExploreBuildWorkspace({
  embedded = false,
  onSelectStage,
}: ExploreBuildWorkspaceProps) {
  const handleSelectStage = (stageId: string, title: string) => {
    if (onSelectStage) {
      onSelectStage(stageId, title);
      return;
    }

    toast.message("暂未开发", {
      description: `${title} 功能正在开发中。`,
    });
  };

  return (
    <div className={`explore-build-workspace${embedded ? " explore-build-workspace--embedded" : ""}`}>
      <div className="explore-build-workspace__stage">
        <section className="explore-build-workspace__hero">
          <h1>Build your own app</h1>
          <p>Create, build &amp; deploy with Python SDK</p>
        </section>

        <section className="explore-build-workspace__grid" aria-label="Build stages">
          {BUILD_STAGES.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className="explore-build-card"
              onClick={() => handleSelectStage(stage.id, stage.title)}
              aria-label={`${stage.title} 功能暂未开发`}
            >
              <div className="explore-build-card__art">
                <img
                  src={stage.image}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  style={{ width: stage.width, height: stage.height }}
                />
              </div>

              <div className="explore-build-card__copy">
                <h2>{stage.title}</h2>
                <p>{stage.description}</p>
              </div>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
