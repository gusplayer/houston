import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2 } from "lucide-react";
import { Badge, Button, Spinner } from "@squad/core";
import {
  useMethodologyStatus,
  useSeedMethodologyForProject,
} from "../../hooks/queries/use-methodology";
import { useProjects } from "../../hooks/queries/use-projects";
import { useUIStore } from "../../stores/ui";

export function MethodologyProjectsList({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useTranslation("shell");
  const addToast = useUIStore((s) => s.addToast);

  const { data: projects } = useProjects(workspaceId);
  const { data: statusList } = useMethodologyStatus(workspaceId);
  const seedProject = useSeedMethodologyForProject(workspaceId);

  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [seedingId, setSeedingId] = useState<string | null>(null);

  async function handleSeed(projectId: string, projectName: string) {
    setSeedingId(projectId);
    try {
      const result = await seedProject.mutateAsync({
        projectId,
        force: forceOverwrite,
      });
      addToast({
        title: t("workspace.methodologySeeded", { project: projectName }),
        description: t("workspace.methodologySeedSummary", {
          created: result.filesCreated.length,
          skipped: result.filesSkipped.length,
        }),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("workspace.methodologySeedError", { project: projectName }),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setSeedingId(null);
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">
          {t("workspace.methodologyProjects")}
        </h2>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={forceOverwrite}
            onChange={(e) => setForceOverwrite(e.target.checked)}
            className="size-3.5"
          />
          <span>{t("workspace.methodologyForce")}</span>
        </label>
      </div>

      {(projects ?? []).length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          {t("workspace.methodologyNoProjects")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects?.map((p) => {
            const projectStatus = statusList?.find(
              (s) => s.projectId === p.id,
            );
            const seeded = projectStatus?.seeded ?? false;
            const isSeeding = seedingId === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border"
              >
                <FolderGit2 className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                </div>
                {seeded ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("workspace.methodologyBadgeSeeded")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {t("workspace.methodologyBadgeNotSeeded")}
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleSeed(p.id, p.name)}
                  disabled={isSeeding}
                >
                  {isSeeding && <Spinner className="size-3 mr-1" />}
                  {seeded
                    ? t("workspace.methodologyReseed")
                    : t("workspace.methodologySeedBtn")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
