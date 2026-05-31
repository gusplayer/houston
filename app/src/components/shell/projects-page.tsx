/**
 * Projects page — workspace-level repo binding surface.
 *
 * Phase 3 makes Projects a first-class sidebar item: the workspace owns
 * its repos, not individual agents. The per-agent Repo tab is gone;
 * specialist agents pick which projects they can access via the agent
 * selector (`config.projectIds`).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@squad/core";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useProjects, useStories } from "../../hooks/queries";
import { ProjectsSection } from "./workspace-page";

export function ProjectsPage() {
  const { t } = useTranslation(["shell", "agents"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const { data: projects } = useProjects(workspace?.id);
  const { data: stories } = useStories(workspace?.path);

  // Story count per project so each row shows its slice of the board.
  const storyCountByProject = useMemo(() => {
    const out: Record<string, number> = {};
    for (const story of stories ?? []) {
      const pid = story.projectId;
      if (!pid) continue;
      out[pid] = (out[pid] ?? 0) + 1;
    }
    return out;
  }, [stories]);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("shell:projects.noWorkspaceTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("shell:projects.noWorkspaceDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const projectCount = projects?.length ?? 0;
  const totalAssigned = Object.values(storyCountByProject).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border px-8 py-6">
        <h1 className="text-2xl font-semibold">{t("shell:sidebar.projects")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shell:projects.subtitle", {
            count: projectCount,
            stories: totalAssigned,
          })}
        </p>
      </header>
      <div className="flex-1 px-8 py-6">
        <ProjectsSection workspaceId={workspace.id} />
      </div>
    </div>
  );
}
