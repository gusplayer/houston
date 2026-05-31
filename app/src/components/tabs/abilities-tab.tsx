/**
 * Abilities tab — aggregated agent capabilities (Phase 7).
 *
 * Replaces the standalone Skills, MCP, and Routines per-agent tabs with
 * a single navigation surface. Each pane reuses the existing tab UIs so
 * editing semantics (install-from-URL, schedule editor, MCP CRUD) keep
 * working without a refactor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@squad/core";
import type { TabProps } from "../../lib/types";
import SkillsTab from "./skills-tab";
import McpTab from "./mcp-tab";
import RoutinesTab from "./routines-tab";

type Pane = "skills" | "mcps" | "routines";

const PANES: Pane[] = ["skills", "mcps", "routines"];

export default function AbilitiesTab(props: TabProps) {
  const { t } = useTranslation("shell");
  const [pane, setPane] = useState<Pane>("skills");

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2"
        role="tablist"
        aria-label={t("abilities.tablistLabel")}
      >
        {PANES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pane === id}
            onClick={() => setPane(id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              pane === id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`abilities.panes.${id}` as const)}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {pane === "skills" ? (
          <SkillsTab {...props} />
        ) : pane === "mcps" ? (
          <McpTab {...props} />
        ) : (
          <RoutinesTab {...props} />
        )}
      </div>
    </div>
  );
}
