import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { IntegrationPage } from "@/shared/types/runtime";

interface NavItem {
  id: IntegrationPage;
  label: string;
  icon: LucideIcon;
}

interface AppShellProps {
  items: NavItem[];
  currentPage: IntegrationPage;
  pageTitle?: string;
  onNavigate: (page: IntegrationPage) => void;
  children: ReactNode;
}

export default function AppShell({
  items,
  currentPage,
  pageTitle,
  onNavigate,
  children,
}: AppShellProps) {
  const activeItem = items.find((item) => item.id === currentPage) ?? items[0];

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="shell-title">
          <span className="eyebrow">Watcher Desktop</span>
          <h1>{pageTitle ?? activeItem?.label ?? "Watcher"}</h1>
        </div>
        <nav className="shell-nav">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn("nav-pill", currentPage === item.id && "is-active")}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-pill__icon">
                  <Icon size={18} />
                </span>
                <span className="nav-pill__content">
                  <strong>{item.label}</strong>
                </span>
              </button>
            );
          })}
        </nav>
      </header>
      <main className="shell-content">{children}</main>
    </div>
  );
}
