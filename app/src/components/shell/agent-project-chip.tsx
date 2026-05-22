import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderGit2 } from "lucide-react";
import { cn } from "@squad/core";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useProjects } from "../../hooks/queries";
import { tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";

interface AgentProjectChipProps {
  agentPath: string;
}

/**
 * Small badge rendered next to the agent's name showing which workspace
 * project is currently in scope:
 *
 *   - bound to 1 project → "📁 photoapp-rn"
 *   - bound to N projects → "📁 N projects"
 *   - no bindings (CTO mode) → "📁 All projects" (only when the workspace
 *     actually has projects; otherwise hidden so a fresh workspace doesn't
 *     show a meaningless badge)
 *
 * Clicking the chip routes to the workspace Projects tab, which is where
 * the user can rebind / rename / export.
 */
export function AgentProjectChip({ agentPath }: AgentProjectChipProps) {
  const { t } = useTranslation("shell");
  const workspace = useWorkspaceStore((s) => s.current);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const { data: projects } = useProjects(workspace?.id);
  const { data: config } = useQuery({
    queryKey: queryKeys.config(agentPath),
    queryFn: () => tauriConfig.read(agentPath),
    enabled: !!agentPath,
  });

  const allProjects = projects ?? [];
  if (allProjects.length === 0) return null;

  const boundIds = config?.projectIds ?? [];
  const isCtoMode = boundIds.length === 0;

  let label: string;
  if (isCtoMode) {
    label = t("agentProjectChip.allProjects");
  } else if (boundIds.length === 1) {
    const match = allProjects.find((p) => p.id === boundIds[0]);
    label = match?.name ?? t("agentProjectChip.oneProject");
  } else {
    label = t("agentProjectChip.nProjects", { count: boundIds.length });
  }

  return (
    <button
      onClick={() => setViewMode("workspace")}
      className={cn(
        "inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px]",
        "border border-border text-muted-foreground hover:text-foreground hover:bg-accent",
        "transition-colors",
      )}
      title={t("agentProjectChip.tooltip")}
    >
      <FolderGit2 className="size-3" />
      {label}
    </button>
  );
}
