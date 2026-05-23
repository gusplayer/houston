import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, GitCommit, Plus, RefreshCw, FolderOpen, Link2, FileDown } from "lucide-react";
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
import { tauriAgents, tauriConfig, tauriAgent } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import { useAgentStore } from "../../stores/agents";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useUIStore } from "../../stores/ui";
import { buildManifestFromAgents, writeTeamManifest } from "../../lib/team-manifest";
import { ROLE_IDS } from "../../lib/recommend-team";
import { detectProjectStack } from "../../lib/detect-project-stack";
import { injectStackSection, removeStackSection } from "../../lib/inject-stack-section";
import type { Project } from "@squad/engine-client";

export default function RepoTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const workspace = useWorkspaceStore((s) => s.current);
  const wid = workspace?.id;
  const agentPath = agent.folderPath;
  const qc = useQueryClient();

  const { data: projects, isLoading: projectsLoading } = useProjects(wid);
  const createProject = useCreateProject(wid);

  // Per-agent project binding. If `projectIds` is non-empty, this agent
  // only sees those projects in the dropdown (the "specialist" model).
  // Empty / unset means it sees every workspace project (the "CTO" /
  // generalist model — current default behaviour).
  const { data: agentConfig } = useQuery({
    queryKey: queryKeys.config(agentPath),
    queryFn: () => tauriConfig.read(agentPath),
    enabled: !!agentPath,
  });
  const boundIds = agentConfig?.projectIds ?? [];
  const isCtoMode = boundIds.length === 0;
  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    if (isCtoMode) return projects;
    return projects.filter((p) => boundIds.includes(p.id));
  }, [projects, boundIds, isCtoMode]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [showBindings, setShowBindings] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newStack, setNewStack] = useState("");
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | undefined>(undefined);

  // If the selected project becomes invisible (binding changed), clear it.
  useEffect(() => {
    if (selectedProjectId && !visibleProjects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(undefined);
    }
  }, [selectedProjectId, visibleProjects]);

  const projectId = selectedProjectId ?? visibleProjects[0]?.id;
  const project = projects?.find((p) => p.id === projectId);

  async function updateStackInClaude(boundProjects: Project[]) {
    try {
      const current = await tauriAgent.readFile(agentPath, "CLAUDE.md").catch(() => "");
      if (boundProjects.length === 0) {
        const updated = removeStackSection(current);
        if (updated !== current) await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
        return;
      }
      const stacks = await Promise.all(boundProjects.map((p) => detectProjectStack(p.repoPath)));
      const detected = stacks.filter(Boolean);
      if (detected.length === 0) return;
      const combinedRaw = [...new Set(detected.map((s) => s!.raw))].join(" · ");
      const combinedStack = {
        language: detected[0]!.language,
        frameworks: detected.flatMap((s) => s!.frameworks),
        raw: combinedRaw,
      };
      const updated = injectStackSection(current, combinedStack);
      await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      qc.invalidateQueries({ queryKey: queryKeys.instructions(agentPath) });
      addToast({
        title: t("repo.stackDetectedTitle"),
        description: t("repo.stackDetectedBody", { agent: agent.name, stack: combinedRaw }),
        variant: "success",
      });
    } catch (err) {
      // User just bound/unbound a project — if we can't keep their CLAUDE.md
      // in sync, they need to know so they can fix it (manual edit, retry, etc.).
      addToast({
        title: t("stackUpdateFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  }

  async function toggleBinding(pid: string) {
    const current = agentConfig?.projectIds ?? [];
    const next = current.includes(pid)
      ? current.filter((x) => x !== pid)
      : [...current, pid];
    await tauriConfig.write(agentPath, { ...(agentConfig ?? {}), projectIds: next });
    qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) });
    if (projects) {
      const nextProjects = projects.filter((p) => next.includes(p.id));
      void updateStackInClaude(nextProjects);
    }
  }

  async function clearBindings() {
    await tauriConfig.write(agentPath, { ...(agentConfig ?? {}), projectIds: [] });
    qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) });
    void updateStackInClaude([]);
  }

  const allAgents = useAgentStore((s) => s.agents);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const addToast = useUIStore((s) => s.addToast);
  const [exporting, setExporting] = useState(false);

  async function handleExportTeam() {
    if (!project) return;
    setExporting(true);
    try {
      const manifest = buildManifestFromAgents(allAgents, agentDefs, ROLE_IDS);
      if (manifest.agents.length === 0) {
        addToast({
          title: t("repo.exportEmptyTitle"),
          description: t("repo.exportEmptyBody"),
          variant: "info",
        });
        return;
      }
      await writeTeamManifest(project.repoPath, manifest);
      addToast({
        title: t("repo.exportSuccessTitle"),
        description: t("repo.exportSuccessBody", { count: manifest.agents.length }),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("repo.exportErrorTitle"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  }

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

  // Show locals first (current at the top), then remotes. The engine
  // returns both via `for-each-ref refs/heads/ refs/remotes/`. Remotes
  // only show up here if the user has run `git fetch` at least once.
  const sortedBranches = [...(branches ?? [])].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.isRemote !== b.isRemote) return a.isRemote ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const currentBranch = gitStatus?.branch ?? "";

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Project selector bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        {projectsLoading ? (
          <Spinner className="size-4" />
        ) : visibleProjects.length > 0 ? (
          <Select value={projectId ?? ""} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-7 text-xs w-48">
              <SelectValue placeholder={t("repo.selectProject")} />
            </SelectTrigger>
            <SelectContent>
              {visibleProjects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">
            {projects && projects.length > 0 ? t("repo.noBindings") : t("repo.noProjects")}
          </span>
        )}
        {isCtoMode && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {t("repo.ctoMode")}
          </Badge>
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
        {projects && projects.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setShowBindings((v) => !v)}
          >
            <Link2 className="size-3 mr-1" />
            {t("repo.manageBindings")}
            {!isCtoMode && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                {boundIds.length}
              </Badge>
            )}
          </Button>
        )}
        {projectId && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 ml-auto text-xs"
              onClick={() => void handleExportTeam()}
              disabled={exporting}
              title={t("repo.exportTeamTitle")}
            >
              {exporting ? (
                <Spinner className="size-3 mr-1" />
              ) : (
                <FileDown className="size-3 mr-1" />
              )}
              {t("repo.exportTeam")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => void refetchStatus()}
            >
              <RefreshCw className={cn("size-3", statusLoading && "animate-spin")} />
            </Button>
          </>
        )}
        {!projectId && (
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

      {/* Bindings management */}
      {showBindings && projects && projects.length > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">{t("repo.bindingsTitle")}</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-muted-foreground"
              onClick={() => void clearBindings()}
              disabled={isCtoMode}
            >
              {t("repo.ctoModeAction")}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("repo.bindingsHelp")}
          </p>
          <div className="flex flex-col gap-1">
            {projects.map((p) => {
              const bound = boundIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={bound}
                    onChange={() => void toggleBinding(p.id)}
                    className="size-3"
                  />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{p.repoPath}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

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
            {sortedBranches.length > 0 && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {t("repo.branches")}
                </p>
                <div className="max-h-40 overflow-auto">
                  {sortedBranches.map((b) => (
                    <div
                      key={`${b.isRemote ? "r" : "l"}:${b.name}`}
                      className={cn(
                        "flex items-center gap-1.5 py-0.5 px-1 rounded text-xs",
                        b.isCurrent && "bg-accent text-accent-foreground",
                      )}
                    >
                      <GitBranch
                        className={cn(
                          "size-3 shrink-0",
                          b.isRemote ? "text-muted-foreground/50" : "text-muted-foreground",
                        )}
                      />
                      <span className={cn("truncate", b.isRemote && "text-muted-foreground")}>
                        {b.name}
                      </span>
                    </div>
                  ))}
                </div>
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
