import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, GitCommit, Plus, RefreshCw, FolderOpen } from "lucide-react";
import {
  Button,
  Badge,
  Spinner,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@squad/core";
import type { TabProps } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  useProjects,
  useCreateProject,
  useGitStatus,
  useGitLog,
  useGitBranches,
  useGitDiff,
} from "../../hooks/queries";
import { tauriAgents } from "../../lib/tauri";

export default function RepoTab(_: TabProps) {
  const { t } = useTranslation("agents");
  const workspace = useWorkspaceStore((s) => s.current);
  const wid = workspace?.id;

  const { data: projects, isLoading: projectsLoading } = useProjects(wid);
  const createProject = useCreateProject(wid);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newStack, setNewStack] = useState("");
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | undefined>(undefined);

  const projectId = selectedProjectId ?? projects?.[0]?.id;
  const project = projects?.find((p) => p.id === projectId);

  const { data: gitStatus, isLoading: statusLoading, refetch: refetchStatus } = useGitStatus(wid, projectId, { refetchInterval: 10_000 });
  const { data: commits, isLoading: logLoading } = useGitLog(wid, projectId);
  const { data: branches } = useGitBranches(wid, projectId);
  const { data: diff } = useGitDiff(
    wid,
    selectedCommitSha ? projectId : undefined,
    selectedCommitSha ? `${selectedCommitSha}~1` : undefined,
    selectedCommitSha,
  );

  async function handleCreateProject() {
    if (!newName.trim() || !newPath.trim()) return;
    const created = await createProject.mutateAsync({
      name: newName.trim(),
      repoPath: newPath.trim(),
      stack: newStack.trim() || undefined,
    });
    setSelectedProjectId(created.id);
    setShowNewProjectForm(false);
    setNewName("");
    setNewPath("");
    setNewStack("");
  }

  async function handlePickDirectory() {
    const picked = await tauriAgents.pickDirectory().catch(() => null);
    if (picked) setNewPath(picked);
  }

  const localBranches = branches?.filter((b) => !b.isRemote) ?? [];
  const currentBranch = gitStatus?.branch ?? "";

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Project selector bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {projectsLoading ? (
          <Spinner className="size-4" />
        ) : projects && projects.length > 0 ? (
          <Select value={projectId ?? ""} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-7 text-xs w-48">
              <SelectValue placeholder={t("repo.selectProject")} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">{t("repo.noProjects")}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setShowNewProjectForm((v) => !v)}
        >
          <Plus className="size-3 mr-1" />
          {t("repo.addProject")}
        </Button>
        {projectId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 ml-auto"
            onClick={() => void refetchStatus()}
          >
            <RefreshCw className={cn("size-3", statusLoading && "animate-spin")} />
          </Button>
        )}
      </div>

      {/* New project form */}
      {showNewProjectForm && (
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
          <p className="text-xs font-medium">{t("repo.newProject")}</p>
          <div className="flex gap-2">
            <input
              className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("repo.projectName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="flex-[2] h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("repo.repoPath")}
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => void handlePickDirectory()}
              type="button"
            >
              <FolderOpen className="size-3" />
            </Button>
            <input
              className="w-24 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("repo.stack")}
              value={newStack}
              onChange={(e) => setNewStack(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleCreateProject()}
              disabled={!newName.trim() || !newPath.trim() || createProject.isPending}
            >
              {createProject.isPending ? <Spinner className="size-3 mr-1" /> : null}
              {t("repo.create")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowNewProjectForm(false)}
            >
              {t("repo.cancel")}
            </Button>
          </div>
        </div>
      )}

      {!projectId ? (
        <div className="flex flex-1 items-center justify-center flex-col gap-2 text-muted-foreground">
          <GitBranch className="size-8 opacity-30" />
          <p className="text-sm">{t("repo.emptyState")}</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel: status + branches + log */}
          <div className="flex flex-col w-64 shrink-0 border-r border-border overflow-auto">
            {/* Git status */}
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <GitBranch className="size-3 text-muted-foreground" />
                <span className="text-xs font-medium">{currentBranch}</span>
                {gitStatus && !gitStatus.clean && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto">
                    {gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length}
                  </Badge>
                )}
                {gitStatus?.clean && (
                  <span className="text-[10px] text-muted-foreground ml-auto">{t("repo.clean")}</span>
                )}
              </div>
              {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                <p className="text-[10px] text-muted-foreground">
                  {gitStatus.ahead > 0 && `↑${gitStatus.ahead} `}
                  {gitStatus.behind > 0 && `↓${gitStatus.behind}`}
                </p>
              )}
              {/* Changed files */}
              {gitStatus && !gitStatus.clean && (
                <div className="mt-1 space-y-0.5">
                  {gitStatus.staged.map((f) => (
                    <div key={f.path} className="flex items-center gap-1">
                      <span className="text-[10px] text-emerald-500 font-mono w-3">{f.status}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{f.path}</span>
                    </div>
                  ))}
                  {gitStatus.unstaged.map((f) => (
                    <div key={f.path} className="flex items-center gap-1">
                      <span className="text-[10px] text-amber-500 font-mono w-3">{f.status}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{f.path}</span>
                    </div>
                  ))}
                  {gitStatus.untracked.map((f) => (
                    <div key={f} className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground font-mono w-3">?</span>
                      <span className="text-[10px] text-muted-foreground truncate">{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Branches */}
            {localBranches.length > 0 && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {t("repo.branches")}
                </p>
                {localBranches.map((b) => (
                  <div
                    key={b.name}
                    className={cn(
                      "flex items-center gap-1.5 py-0.5 px-1 rounded text-xs",
                      b.isCurrent && "bg-accent text-accent-foreground",
                    )}
                  >
                    <GitBranch className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{b.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Commits */}
            <div className="px-3 py-2 flex-1 overflow-auto">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("repo.commits")}
              </p>
              {logLoading ? (
                <Spinner className="size-3 mt-2" />
              ) : (
                commits?.map((c) => (
                  <button
                    key={c.sha}
                    onClick={() => setSelectedCommitSha((prev) => (prev === c.sha ? undefined : c.sha))}
                    className={cn(
                      "w-full text-left py-1 px-1 rounded hover:bg-accent group",
                      selectedCommitSha === c.sha && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <GitCommit className="size-3 shrink-0 text-muted-foreground" />
                      <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0">
                        {c.shortSha}
                      </span>
                    </div>
                    <p className="text-[11px] truncate mt-0.5 text-foreground/80 pl-5">{c.subject}</p>
                    <p className="text-[10px] text-muted-foreground pl-5">{c.authorName}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel: diff */}
          <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
            {selectedCommitSha ? (
              diff !== undefined ? (
                <pre className="flex-1 overflow-auto p-4 text-[11px] font-mono leading-relaxed whitespace-pre">
                  {diff
                    ? diff.split("\n").map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            "px-1",
                            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                            line.startsWith("-") && !line.startsWith("---") && "bg-red-500/10 text-red-600 dark:text-red-400",
                            line.startsWith("@@") && "text-blue-500",
                          )}
                        >
                          {line}
                        </div>
                      ))
                    : <span className="text-muted-foreground">{t("repo.emptyDiff")}</span>}
                </pre>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <Spinner className="size-4" />
                </div>
              )
            ) : (
              <div className="flex flex-1 items-center justify-center flex-col gap-2 text-muted-foreground">
                <GitCommit className="size-8 opacity-30" />
                <p className="text-sm">{t("repo.selectCommit")}</p>
                {project && (
                  <p className="text-xs opacity-60 font-mono">{project.repoPath}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
