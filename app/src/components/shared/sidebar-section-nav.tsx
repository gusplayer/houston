import type { LucideIcon } from "lucide-react";
import { Badge } from "@squad/core";

export interface SidebarSectionItem<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  beta?: boolean;
}

interface SidebarSectionNavProps<Id extends string> {
  ariaLabel: string;
  items: SidebarSectionItem<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** Compact icon-only mode — use when horizontal space is limited. */
  compact?: boolean;
  className?: string;
}

export function SidebarSectionNav<Id extends string>({
  ariaLabel,
  items,
  active,
  onSelect,
  compact = false,
  className,
}: SidebarSectionNavProps<Id>) {
  if (compact) {
    return (
      <nav
        aria-label={ariaLabel}
        className={`relative w-12 shrink-0 py-4 flex flex-col items-center gap-0.5 overflow-y-auto before:absolute before:right-0 before:top-4 before:bottom-0 before:w-px before:bg-border ${className ?? ""}`}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
              className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                isActive
                  ? "bg-secondary text-foreground"
                  : item.destructive
                    ? "text-destructive hover:bg-secondary/60"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`relative w-56 shrink-0 px-3 py-6 overflow-y-auto before:absolute before:right-0 before:top-4 before:bottom-0 before:w-px before:bg-border ${className ?? ""}`}
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : item.destructive
                      ? "text-destructive hover:bg-secondary/60"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.beta && (
                  <Badge
                    variant="outline"
                    className="ml-auto h-4 px-1.5 text-[9px] font-semibold tracking-wider text-muted-foreground"
                  >
                    BETA
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
