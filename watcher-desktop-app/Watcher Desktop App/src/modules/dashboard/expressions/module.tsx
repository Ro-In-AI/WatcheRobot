import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EXPRESSION_PRESETS, EXPRESSION_PRESET_IMAGE_SRCS } from "@/modules/dashboard/expressions/presets";
import ExpressionsWorkspace from "@/modules/dashboard/expressions/workspace";
import type { DashboardLogLine, ServoPosition } from "@/modules/dashboard/shared/types";

interface ExpressionsModuleProps {
  active: boolean;
  online: boolean;
  draftServo: ServoPosition;
  recentLogLines: DashboardLogLine[];
  onBackToDashboard: () => void;
  onLog: (text: string) => void;
  onSendJson: (message: unknown) => boolean;
}

export default function ExpressionsModule({
  active,
  online,
  draftServo,
  recentLogLines,
  onBackToDashboard,
  onLog,
  onSendJson,
}: ExpressionsModuleProps) {
  const [selectedExpressionId, setSelectedExpressionId] = useState("love");

  useEffect(() => {
    if (!active) {
      return;
    }

    EXPRESSION_PRESET_IMAGE_SRCS.forEach((src) => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    });
  }, [active]);

  const handleSelectExpression = useCallback(
    (expressionId: string, label: string) => {
      const preset = EXPRESSION_PRESETS.find((item) => item.id === expressionId);
      if (!preset) {
        toast.error("未找到对应的 Expression 协议映射", {
          description: expressionId,
        });
        return;
      }

      const ok = onSendJson({
        type: "evt.ai.status",
        code: 0,
        data: {
          status: preset.protocol.status,
          message: `Desktop expression preset: ${label}`,
          image_name: preset.protocol.resourceName,
          action_file: preset.protocol.resourceName,
          sound_file: preset.protocol.resourceName,
          detail: {
            source: "desktop_expression_panel",
            expression_id: preset.id,
            label: preset.label,
          },
        },
      });

      if (!ok) {
        toast.error("Expression 指令未发送", {
          description: "Watcher WebSocket 还没有准备好。",
        });
        onLog(`[Expression] 指令未发送: ${label}`);
        return;
      }

      setSelectedExpressionId(expressionId);
      onLog(
        `[Expression] 发送 ${label} -> status=${preset.protocol.status}, resource=${preset.protocol.resourceName}`,
      );
    },
    [onLog, onSendJson],
  );

  return (
    <ExpressionsWorkspace
      online={online}
      visible={active}
      draftServo={draftServo}
      recentLogLines={recentLogLines}
      selectedExpressionId={selectedExpressionId}
      onBackToDashboard={onBackToDashboard}
      onSelectExpression={handleSelectExpression}
    />
  );
}
