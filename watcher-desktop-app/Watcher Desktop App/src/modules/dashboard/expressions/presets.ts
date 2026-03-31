import exprError from "@/assets/pencil/dev-pages/expr-error-thumb.png";
import exprHappy from "@/assets/pencil/dev-pages/expr-happy-thumb.png";
import exprInvoke from "@/assets/pencil/dev-pages/expr-invoke-thumb.png";
import exprListen from "@/assets/pencil/dev-pages/expr-listen-thumb.png";
import exprLove from "@/assets/pencil/dev-pages/expr-love-thumb.png";
import exprSleep from "@/assets/pencil/dev-pages/expr-sleep-thumb.png";
import exprSpeaking from "@/assets/pencil/dev-pages/expr-speaking-thumb.png";
import exprThink from "@/assets/pencil/dev-pages/expr-think-thumb.png";
import exprThinking from "@/assets/pencil/dev-pages/expr-thinking-thumb.png";

export interface ExpressionPreset {
  id: string;
  label: string;
  image: string;
  protocol: {
    status: string;
    resourceName: string;
  };
}

export const EXPRESSION_PRESETS: ExpressionPreset[] = [
  {
    id: "love",
    label: "Love",
    image: exprLove,
    protocol: {
      status: "observing",
      resourceName: "love",
    },
  },
  {
    id: "error",
    label: "Error",
    image: exprError,
    protocol: {
      status: "error",
      resourceName: "error",
    },
  },
  {
    id: "invoke-tool",
    label: "Invoke the tool",
    image: exprInvoke,
    protocol: {
      status: "processing",
      resourceName: "invoke",
    },
  },
  {
    id: "happy",
    label: "Happy",
    image: exprHappy,
    protocol: {
      status: "completed",
      resourceName: "happy",
    },
  },
  {
    id: "sleep",
    label: "Sleep",
    image: exprSleep,
    protocol: {
      status: "standby",
      resourceName: "sleep",
    },
  },
  {
    id: "thinking",
    label: "Thinking",
    image: exprThinking,
    protocol: {
      status: "processing",
      resourceName: "thinking",
    },
  },
  {
    id: "think",
    label: "Think",
    image: exprThink,
    protocol: {
      status: "thinking",
      resourceName: "think",
    },
  },
  {
    id: "speaking",
    label: "Speaking",
    image: exprSpeaking,
    protocol: {
      status: "speaking",
      resourceName: "speaking",
    },
  },
  {
    id: "listen",
    label: "listen",
    image: exprListen,
    protocol: {
      status: "listening",
      resourceName: "listen",
    },
  },
] as const;

export const EXPRESSION_PRESET_IMAGE_SRCS = EXPRESSION_PRESETS.map((preset) => preset.image);
