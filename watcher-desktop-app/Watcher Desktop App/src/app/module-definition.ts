import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface AppModuleRenderContext {
  wsUrl?: string;
}

export interface AppModuleDefinition {
  id: string;
  label: string;
  title: string;
  group: "core" | "openclaw" | "runtime";
  icon: LucideIcon;
  render: (context: AppModuleRenderContext) => ReactNode;
}
