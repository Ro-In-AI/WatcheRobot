import { MessageSquare } from "lucide-react";
import type { AppModuleDefinition } from "@/app/module-definition";
import OpenClawChatPage from "@/modules/openclaw/chat/page";

export const openclawChatModule: AppModuleDefinition = {
  id: "openclaw-chat",
  label: "对话",
  title: "OpenClaw 对话",
  group: "openclaw",
  icon: MessageSquare,
  render: () => <OpenClawChatPage />,
};
