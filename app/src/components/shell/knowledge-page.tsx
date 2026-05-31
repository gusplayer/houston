/**
 * Knowledge page — workspace-scoped curated docs (Phase 4).
 *
 * Consolidates the docs surface that used to live as a per-agent Docs
 * tab. Curated docs at `<workspace>/.squad/docs/*.md` still inject into
 * agent prompts via `build_agent_context()` — engine code is untouched.
 * Per-project docs (claude-md, rules, architecture) keep their inline
 * editor on the Projects page.
 *
 * Phase 4 explicitly removes the per-agent Docs tab and the per-agent
 * Files tab; truly private per-agent notes can still be written via the
 * filesystem under the agent's `.squad/` directory if needed.
 */
import { useTranslation } from "react-i18next";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@squad/core";
import { useWorkspaceStore } from "../../stores/workspaces";
import { WorkspaceDocs } from "./workspace-page";

export function KnowledgePage() {
  const { t } = useTranslation(["shell", "agents"]);
  const workspace = useWorkspaceStore((s) => s.current);

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
        <h1 className="text-2xl font-semibold">
          {t("shell:sidebar.knowledge")}
        </h1>
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
