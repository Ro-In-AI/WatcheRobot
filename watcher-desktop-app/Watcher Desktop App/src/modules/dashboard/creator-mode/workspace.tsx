import { PencilLine, Sparkles } from "lucide-react";
import Panel from "@/shared/ui/Panel";
import StatusBadge from "@/shared/ui/StatusBadge";

export default function CreatorModeWorkspace() {
  return (
    <div className="control-hub-settings-page">
      <div className="content-grid">
        <Panel
          title="Creator Mode"
          className="span-two"
          description="Behavior authoring has been separated into its own dashboard module so future creation flows no longer need to live inside the main dashboard canvas."
        >
          <div className="summary-pills">
            <StatusBadge tone="info">Module scaffolded</StatusBadge>
            <StatusBadge tone="neutral">Ready for prompts</StatusBadge>
            <StatusBadge tone="neutral">Ready for mappings</StatusBadge>
          </div>

          <div className="status-showcase">
            <div className="status-check-grid">
              <div className="check-item">
                <div className="check-item__title">
                  <PencilLine size={16} />
                  <strong>Authoring Surface</strong>
                </div>
                <span>Prompts, behavior recipes and reusable flows can land here next.</span>
              </div>
              <div className="check-item">
                <div className="check-item__title">
                  <Sparkles size={16} />
                  <strong>Clean Boundary</strong>
                </div>
                <span>This view is now isolated from the dashboard home controller.</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Next Steps"
          description="Suggested follow-on slices once the module boundary is in place."
        >
          <ul>
            <li>Prompt and behavior templates</li>
            <li>Expression-to-protocol mappings</li>
            <li>Preview and publish workflow</li>
          </ul>
        </Panel>

        <Panel
          title="Why It Matters"
          description="The dashboard home stays focused on live control, while creation work can evolve independently."
        >
          <p>
            This module split keeps future creation UI from competing with runtime controls,
            logs, chat, and hardware state in the same file.
          </p>
        </Panel>
      </div>
    </div>
  );
}
