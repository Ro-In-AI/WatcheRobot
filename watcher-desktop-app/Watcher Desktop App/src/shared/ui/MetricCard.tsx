import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface MetricCardProps {
  label: string;
  value: string;
  caption: string;
  accent?: "blue" | "green" | "gold" | "rose";
  icon?: ReactNode;
}

export default function MetricCard({
  label,
  value,
  caption,
  accent = "blue",
  icon,
}: MetricCardProps) {
  return (
    <article className={cn("metric-card", `accent-${accent}`)}>
      <div className="metric-card__top">
        <span>{label}</span>
        {icon ? <div className="metric-card__icon">{icon}</div> : null}
      </div>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}
