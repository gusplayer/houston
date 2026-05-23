import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, cn } from "@squad/core";
import { FolderOpen } from "lucide-react";
import { tauriAgent } from "../../lib/tauri";
import { osRevealAgent } from "../../lib/os-bridge";

// ── Hook: read a project's CLAUDE.md by repo path ────────────────────

export function useProjectClaudeMd(repoPath: string | undefined) {
  return useQuery({
    queryKey: ["project-claude-md", repoPath ?? ""],
    queryFn: () => tauriAgent.readFile(repoPath!, "CLAUDE.md").catch(() => ""),
    enabled: !!repoPath,
  });
}

// ── Read-only project CLAUDE.md banner ───────────────────────────────

function ReadOnlyBanner({
  projectName,
  repoPath,
}: {
  projectName: string;
  repoPath: string | undefined;
}) {
  const { t } = useTranslation("agents");
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-sm text-muted-foreground">
      <span className="flex-1">
        {t("instructions.readOnlyBanner", { name: projectName })}
      </span>
      {repoPath && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={() => osRevealAgent(repoPath).catch(() => {})}
        >
          <FolderOpen className="size-3.5 mr-1.5" />
          {t("instructions.revealInFinder")}
        </Button>
      )}
    </div>
  );
}

// ── Project CLAUDE.md viewer (read-only) ─────────────────────────────

export function InstructionsProjectPanel({
  projectName,
  repoPath,
}: {
  projectName: string;
  repoPath: string | undefined;
}) {
  const { t } = useTranslation("agents");
  const { data: content } = useProjectClaudeMd(repoPath);

  return (
    <>
      <ReadOnlyBanner projectName={projectName} repoPath={repoPath} />
      <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-4">
        {content ? (
          <section className="rounded-xl bg-secondary p-3">
            <textarea
              readOnly
              value={content}
              rows={Math.max(12, content.split("\n").length + 2)}
              className={cn(
                "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
                "bg-background border border-black/[0.04] rounded-lg",
                "outline-none resize-none opacity-80 cursor-default",
              )}
            />
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("instructions.projectClaudeMdMissing")}
          </p>
        )}
      </div>
    </>
  );
}
