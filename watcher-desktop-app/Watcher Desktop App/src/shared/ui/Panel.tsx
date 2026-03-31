import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface PanelProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Panel({
  title,
  description,
  actions,
  className,
  children,
}: PanelProps) {
  return (
    <section className={cn("panel", className)}>
      <header className="panel__header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
