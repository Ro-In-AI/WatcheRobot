import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

interface StatusBadgeProps {
  tone: Tone;
  children: ReactNode;
}

export default function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={cn("status-badge", `tone-${tone}`)}>{children}</span>;
}
