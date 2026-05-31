/**
 * Library page — workspace pool of abilities (Phase 5 MVP).
 *
 * Skills, MCPs, and routines still live per-agent on disk (no storage
 * refactor in this phase). The Library is a read-through catalog: it
 * aggregates every agent's abilities so the workspace level can see
 * what is installed and who has it.
 *
 * The full catalog-then-copy install flow ("assign to agent") depends on
 * the LibraryDialog component that has not yet landed; this page is
 * structurally ready for it (selecting an agent jumps to that agent's
 * own Skills or MCP tab where install-from-URL already works).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Empty, EmptyHeader, EmptyTitle, EmptyDescription, SquadAvatar, resolveAgentColor } from "@squad/core";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";

export function LibraryPage() {
  const { t } = useTranslation(["shell"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);

  const rows = useMemo(() => agents, [agents]);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("shell:library.noWorkspaceTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("shell:library.noWorkspaceDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("shell:library.noAgentsTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("shell:library.noAgentsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border px-8 py-6">
        <h1 className="text-2xl font-semibold">{t("shell:sidebar.library")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shell:library.subtitle")}
        </p>
      </header>
      <div className="grid flex-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setCurrentAgent(row)}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <SquadAvatar color={resolveAgentColor(row.color)} diameter={28} />
              <span className="truncate text-sm font-medium">{row.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("shell:library.openAgentHint")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {t("shell:library.skillsChip")}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {t("shell:library.mcpChip")}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {t("shell:library.routinesChip")}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
