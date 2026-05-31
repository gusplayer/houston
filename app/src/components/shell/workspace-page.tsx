import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Users2, FolderGit2, Plus, Trash2, FolderOpen, FileDown, ChevronRight, Workflow } from "lucide-react";
import { ProjectDocsEditor } from "./project-docs-editor";
import {
  Button,
  Badge,
  Spinner,
  cn,
} from "@squad/core";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useUIStore } from "../../stores/ui";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useProjectDocs,
  useSaveProjectDoc,
  useDeleteProjectDoc,
} from "../../hooks/queries";
import { DOC_TEMPLATES, type DocFrontmatter } from "../../lib/project-docs";
import { buildManifestFromAgents, writeTeamManifest } from "../../lib/team-manifest";
import { ROLE_IDS } from "../../lib/recommend-team";
import { tauriAgents } from "../../lib/tauri";
import { AgentStateAvatar } from "../agent-state-avatar";
import { MethodologySection } from "../workspace/methodology-section";

type Section = "team" | "docs" | "projects" | "methodology";

/**
 * I.2 — workspace-level settings + management page. One stop for the
 * pieces that historically lived inside an agent tab even though they
 * apply to the whole workspace: project bindings, sprint phase
 * ownership, shared docs, team-manifest export.
 */
export function WorkspacePage() {
  const { t } = useTranslation(["shell", "agents"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const workspacePath = workspace?.path;

  const [section, setSection] = useState<Section>("team");

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("shell:workspace.noWorkspace")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="shrink-0 px-6 py-4 border-b border-border">
        <h1 className="text-xl font-semibold">{workspace.name}</h1>
      </header>

      <nav className="shrink-0 flex items-center gap-1 px-4 border-b border-border">
        <NavTab active={section === "team"} onClick={() => setSection("team")}>
          <Users2 className="size-3.5" />
          {t("shell:workspace.team")}
        </NavTab>
        <NavTab active={section === "docs"} onClick={() => setSection("docs")}>
          <FileText className="size-3.5" />
          {t("shell:workspace.docs")}
        </NavTab>
        <NavTab active={section === "projects"} onClick={() => setSection("projects")}>
          <FolderGit2 className="size-3.5" />
          {t("shell:workspace.projects")}
        </NavTab>
        <NavTab active={section === "methodology"} onClick={() => setSection("methodology")}>
          <Workflow className="size-3.5" />
          {t("shell:workspace.methodology")}
        </NavTab>
      </nav>

      <div className="flex-1 min-h-0 overflow-auto">
        {section === "team" && <TeamRoster workspaceId={workspace.id} />}
        {section === "docs" && <WorkspaceDocs rootPath={workspacePath} />}
        {section === "projects" && <ProjectsSection workspaceId={workspace.id} />}
        {section === "methodology" && <MethodologySection workspaceId={workspace.id} />}
      </div>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors border-b-2 -mb-px",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Section: Team ───────────────────────────────────────────────────────

function TeamRoster({ workspaceId: _workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("shell");
  const agents = useAgentStore((s) => s.agents);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const workspaceAgents = agents.map((a) => ({
    agent: a,
    def: getAgentDef(a.configId),
  }));

  if (workspaceAgents.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        No agents yet
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <p className="text-xs text-muted-foreground mb-4">{t("workspace.teamHint")}</p>
      <div className="flex flex-col gap-2">
        {workspaceAgents.map(({ agent, def }) => {
          const roleLabel = def?.config.roleLabel;
          return (
            <button
              key={agent.id}
              onClick={() => {
                setCurrent(agent);
                setViewMode("activity");
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left group"
            >
              <AgentStateAvatar agent={agent} diameter={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{agent.name}</div>
                {roleLabel && (
                  <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
                )}
              </div>
              <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Section: Docs ───────────────────────────────────────────────────────

export function WorkspaceDocs({ rootPath }: { rootPath: string | undefined }) {
  const { t } = useTranslation("agents");
  const { data: docs, isLoading } = useProjectDocs(rootPath);
  const saveDoc = useSaveProjectDoc(rootPath);
  const deleteDoc = useDeleteProjectDoc(rootPath);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);

  const active = docs?.find((d) => d.slug === activeSlug) ?? null;

  async function createFromTemplate(slug: string, fm: DocFrontmatter, body: string) {
    let finalSlug = slug;
    let n = 2;
    while (docs?.some((d) => d.slug === finalSlug)) finalSlug = `${slug}-${n++}`;
    await saveDoc.mutateAsync({ slug: finalSlug, frontmatter: fm, body });
    setActiveSlug(finalSlug);
    setShowNewMenu(false);
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 border-r border-border overflow-auto">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("docs.scopeWorkspace")}
          </span>
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => setShowNewMenu((v) => !v)}
            >
              <Plus className="size-3" />
            </Button>
            {showNewMenu && (
              <div className="absolute right-0 top-7 z-50 w-60 rounded-lg border border-border bg-card shadow-lg p-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("docs.templates")}
                </div>
                {DOC_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.slug}
                    onClick={() => void createFromTemplate(tpl.slug, tpl.frontmatter, tpl.body)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2"
                  >
                    <FileText className="size-3 text-muted-foreground" />
                    <span className="flex-1">{tpl.title}</span>
                    {tpl.frontmatter.audience && tpl.frontmatter.audience.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                        {tpl.frontmatter.audience.length}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {(docs ?? []).length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {t("docs.empty")}
          </div>
        ) : (
          (docs ?? []).map((d) => {
            const aud = d.frontmatter.audience ?? [];
            const label = d.frontmatter.title?.trim() || d.slug;
            return (
              <button
                key={d.slug}
                onClick={() => setActiveSlug(d.slug)}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent border-b border-border/40",
                  activeSlug === d.slug && "bg-accent",
                )}
              >
                <FileText className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{label}</div>
                  {aud.length > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {aud.length} {aud.length === 1 ? "role" : "roles"}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-auto">
        {active ? (
          <div className="h-full flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span className="text-sm font-semibold flex-1 truncate">
                {active.frontmatter.title || active.slug}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await deleteDoc.mutateAsync(active.slug);
                  setActiveSlug(null);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            <pre className="flex-1 px-4 py-3 text-xs font-mono whitespace-pre-wrap overflow-auto text-foreground/80">
              {active.body}
            </pre>
            <div className="shrink-0 px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
              {t("docs.audienceLabel")}{" "}
              {active.frontmatter.audience && active.frontmatter.audience.length > 0
                ? active.frontmatter.audience.join(", ")
                : t("docs.audienceAll")}
              . {t("shell:workspace.docsHint")}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            {t("docs.pickOrCreate")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section: Projects ───────────────────────────────────────────────────

/** Folder name pulled off the repoPath — useful as a sanity check when
 * the user-given project name doesn't describe the repo (e.g. "Hola"
 * pointing at .../komercia-mcp/). */
function repoFolderName(repoPath: string): string {
  return repoPath.replace(/\/+$/, "").split("/").pop() ?? repoPath;
}

export function ProjectsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["shell", "agents"]);
  const { data: projects } = useProjects(workspaceId);
  const createProject = useCreateProject(workspaceId);
  const updateProject = useUpdateProject(workspaceId);
  const deleteProject = useDeleteProject(workspaceId);
  const agents = useAgentStore((s) => s.agents);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const addToast = useUIStore((s) => s.addToast);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [stack, setStack] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** Project id whose docs editor is expanded inline. At most one open at a
   * time — keeps the page from turning into a wall of textareas. */
  const [docsOpenId, setDocsOpenId] = useState<string | null>(null);

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed && projects?.find((p) => p.id === id)?.name !== trimmed) {
      await updateProject.mutateAsync({ projectId: id, req: { name: trimmed } });
    }
    setRenamingId(null);
  }

  async function pickDir() {
    const picked = await tauriAgents.pickDirectory().catch(() => null);
    if (picked) setPath(picked);
  }

  async function create() {
    if (!name.trim() || !path.trim()) return;
    await createProject.mutateAsync({
      name: name.trim(),
      repoPath: path.trim(),
      stack: stack.trim() || undefined,
    });
    setName("");
    setPath("");
    setStack("");
    setShowForm(false);
  }

  async function exportTeam(repoPath: string) {
    setExporting(repoPath);
    try {
      const manifest = buildManifestFromAgents(agents, agentDefs, ROLE_IDS);
      if (manifest.agents.length === 0) {
        addToast({
          title: t("agents:repo.exportEmptyTitle"),
          description: t("agents:repo.exportEmptyBody"),
          variant: "info",
        });
        return;
      }
      await writeTeamManifest(repoPath, manifest);
      addToast({
        title: t("agents:repo.exportSuccessTitle"),
        description: t("agents:repo.exportSuccessBody", { count: manifest.agents.length }),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("agents:repo.exportErrorTitle"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">{t("agents:repo.addProject")}</h2>
          <p className="text-xs text-muted-foreground">{t("shell:workspace.projectsHint")}</p>
        </div>
        <Button
          size="sm"
          className="h-7 rounded-full text-xs"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="size-3 mr-1" />
          {t("agents:repo.addProject")}
        </Button>
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-3 mb-4 bg-muted/30 flex flex-col gap-2">
          <input
            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("agents:repo.projectName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("agents:repo.repoPath")}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void pickDir()}>
              <FolderOpen className="size-3" />
            </Button>
          </div>
          <input
            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("agents:repo.stack")}
            value={stack}
            onChange={(e) => setStack(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => void create()} disabled={!name.trim() || !path.trim()}>
              {createProject.isPending && <Spinner className="size-3 mr-1" />}
              {t("agents:repo.create")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>
              {t("agents:repo.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(projects ?? []).map((p) => {
          const folder = repoFolderName(p.repoPath);
          const nameDiffersFromFolder = p.name.toLowerCase() !== folder.toLowerCase();
          const isRenaming = renamingId === p.id;
          const isDocsOpen = docsOpenId === p.id;
          return (
          <div key={p.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <FolderGit2 className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(p.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="w-full h-6 text-sm font-medium rounded border border-border bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <button
                    onClick={() => startRename(p.id, p.name)}
                    className="text-sm font-medium truncate text-left hover:text-muted-foreground transition-colors w-full"
                    title={t("shell:workspace.renameProject")}
                  >
                    {p.name}
                    {nameDiffersFromFolder && (
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        ({folder})
                      </span>
                    )}
                  </button>
                )}
                <div className="text-[10px] text-muted-foreground font-mono truncate">{p.repoPath}</div>
              </div>
              {p.stack && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {p.stack}
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setDocsOpenId(isDocsOpen ? null : p.id)}
                title={t("shell:workspace.projectDocs.toggleHint")}
              >
                <FileText className="size-3 mr-1" />
                {t("shell:workspace.projectDocs.toggle")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => void exportTeam(p.repoPath)}
                disabled={exporting === p.repoPath}
                title={t("agents:repo.exportTeamTitle")}
              >
                {exporting === p.repoPath ? (
                  <Spinner className="size-3 mr-1" />
                ) : (
                  <FileDown className="size-3 mr-1" />
                )}
                {t("agents:repo.exportTeam")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => void deleteProject.mutateAsync(p.id)}
                title={t("shell:workspace.deleteProject")}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            {isDocsOpen && (
              <div className="px-3 pb-3">
                <ProjectDocsEditor workspaceId={workspaceId} projectId={p.id} />
              </div>
            )}
          </div>
          );
        })}
        {(projects ?? []).length === 0 && !showForm && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {t("agents:repo.noProjects")}
          </div>
        )}
      </div>
    </div>
  );
}
