import { useTranslation } from "react-i18next";
import { FileText, Lock } from "lucide-react";
import { cn } from "@squad/core";

export interface ProjectClaudeEntry {
  projectId: string;
  projectName: string;
  exists: boolean;
}

export type SelectedFile = "agent" | { projectId: string; projectName: string };

interface InstructionsFileTreeProps {
  selectedFile: SelectedFile;
  onSelectFile: (file: SelectedFile) => void;
  projectClaudes: ProjectClaudeEntry[];
}

function isProjectSelected(selected: SelectedFile, projectId: string): boolean {
  return typeof selected === "object" && selected.projectId === projectId;
}

export function InstructionsFileTree({
  selectedFile,
  onSelectFile,
  projectClaudes,
}: InstructionsFileTreeProps) {
  const { t } = useTranslation("agents");

  const visibleProjects = projectClaudes.filter((p) => p.exists);

  return (
    <nav
      aria-label={t("instructions.fileTreeAria")}
      className="w-48 shrink-0 px-2 py-3 overflow-y-auto border-r border-border flex flex-col gap-1"
    >
      {/* Agent CLAUDE.md */}
      <button
        type="button"
        onClick={() => onSelectFile("agent")}
        aria-current={selectedFile === "agent" ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors",
          selectedFile === "agent"
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate font-medium">CLAUDE.md</span>
      </button>

      {/* Project CLAUDE.md files */}
      {visibleProjects.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {visibleProjects.map((p) => {
            const isActive = isProjectSelected(selectedFile, p.projectId);
            return (
              <button
                key={p.projectId}
                type="button"
                onClick={() =>
                  onSelectFile({ projectId: p.projectId, projectName: p.projectName })
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3 shrink-0 opacity-60" />
                  <span className="truncate italic">CLAUDE.md</span>
                </span>
                <span className="pl-4.5 truncate text-[11px] opacity-70">
                  {t("instructions.fromProject", { name: p.projectName })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Hint when no projects bound */}
      {projectClaudes.length === 0 && (
        <p className="mt-2 px-2.5 text-[11px] text-muted-foreground/60 leading-snug">
          {t("instructions.noProjectsHint")}
        </p>
      )}
    </nav>
  );
}
