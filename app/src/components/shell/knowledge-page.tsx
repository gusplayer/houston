/**
 * Knowledge page — workspace-scoped curated docs (Phase 4 + Phase 8).
 *
 * Consolidates the docs surface that used to live as a per-agent Docs
 * tab. Curated docs at `<workspace>/.squad/docs/*.md` still inject into
 * agent prompts via `build_agent_context()` — engine code is untouched.
 *
 * Specs (architect ADRs, PM specs) are a filtered view of the same
 * Knowledge store — the "Specs" link in the header jumps to that filter
 * without a separate persistence layer. Per Phase 8.
 */
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  cn,
} from "@squad/core";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useUIStore } from "../../stores/ui";
import { WorkspaceDocs } from "./workspace-page";

export function KnowledgePage() {
  const { t } = useTranslation(["shell", "agents"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const setViewMode = useUIStore((s) => s.setViewMode);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("shell:knowledge.noWorkspaceTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("shell:knowledge.noWorkspaceDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            {t("shell:sidebar.knowledge")}
          </h1>
          <nav
            className="flex items-center gap-1 text-xs"
            aria-label={t("shell:knowledge.subnavLabel")}
          >
            <span
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                "bg-secondary text-foreground",
              )}
            >
              {t("shell:knowledge.subnavAll")}
            </span>
            <button
              type="button"
              onClick={() => setViewMode("specs")}
              className="rounded-md px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              {t("shell:knowledge.subnavSpecs")}
            </button>
          </nav>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shell:knowledge.subtitle")}
        </p>
      </header>
      <div className="flex-1 min-h-0">
        <WorkspaceDocs rootPath={workspace.path} />
      </div>
    </div>
  );
}
