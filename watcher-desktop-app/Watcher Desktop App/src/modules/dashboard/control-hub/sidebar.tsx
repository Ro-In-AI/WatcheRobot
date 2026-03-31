import {
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { DashboardModuleDefinition, DashboardModuleFooterCopy } from "@/modules/dashboard/module-definition";
import type { ControlHubView } from "@/modules/dashboard/shared/types";
import { cn } from "@/shared/lib/cn";

interface ControlHubSidebarProps {
  activeView: ControlHubView;
  collapsed: boolean;
  items: DashboardModuleDefinition[];
  footer: DashboardModuleFooterCopy;
  onSelect: (view: ControlHubView) => void;
  onToggle: () => void;
}

export default function ControlHubSidebar({
  activeView,
  collapsed,
  items,
  footer: _footer,
  onSelect,
  onToggle,
}: ControlHubSidebarProps) {
  return (
    <aside className={cn("control-hub-sidebar", collapsed && "is-collapsed")}>
      <div className="control-hub-sidebar__top">
        <button
          type="button"
          className="control-hub-sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={2.1} /> : <PanelLeftClose size={16} strokeWidth={2.1} />}
        </button>

        {collapsed ? null : (
          <div className="control-hub-sidebar__brand">
            <strong>Control Hub</strong>
          </div>
        )}
      </div>

      {collapsed ? null : (
        <div className="control-hub-sidebar__section-label">WORKSPACE</div>
      )}

      <nav className="control-hub-sidebar__nav" aria-label="Control Hub">
        {items.map((item) => {
          const active = item.id === activeView;

          return (
            <button
              key={item.id}
              type="button"
              className={cn("control-hub-sidebar__nav-item", active && "is-active", collapsed && "is-collapsed")}
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.title : undefined}
            >
              <span className="control-hub-sidebar__nav-icon" aria-hidden="true">
                <item.icon size={16} strokeWidth={2.1} />
              </span>
              {collapsed ? null : (
                <span className="control-hub-sidebar__nav-copy">
                  <strong>{item.title}</strong>
                  <small>{item.caption}</small>
                </span>
              )}
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
