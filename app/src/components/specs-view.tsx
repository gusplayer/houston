/**
 * Specs view — workspace-level list of every story that has a spec on disk.
 * Phase 2 of the auto-spec flow: lets the user browse, open, and approve
 * specs without going through the agent's board. Status / dates come from
 * the spec's YAML frontmatter (parsed lazily per row) so the list reflects
 * the actual file, not just the Story record.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, cn } from "@squad/core";
import type { Story } from "@squad/engine-client";
import { useWorkspaceStore } from "../stores/workspaces";
import { useUIStore } from "../stores/ui";
import { useStories } from "../hooks/queries/use-sprints";
import { useProjects } from "../hooks/queries/use-projects";
import { tauriAgent, tauriFiles } from "../lib/tauri";
import { getEngine } from "../lib/engine";
import { useAgentStore } from "../stores/agents";
import {
  approveSpec,
  parseOpenQuestions,
  QA_AGENT_CONFIG_ID,
  readSpecFrontmatter,
  resolveOpenQuestion,
  type SpecFrontmatter,
} from "../lib/story-specs";

type StatusFilter = "all" | "draft" | "in_review" | "approved";

const STATUS_FILTERS: StatusFilter[] = ["all", "draft", "in_review", "approved"];

interface Row {
  story: Story;
  projectId: string;
  projectName: string;
  repoPath: string;
  specPath: string;
  frontmatter: SpecFrontmatter | null;
  openQuestions: string[];
  loadError: string | null;
}

export function SpecsView() {
  const { t } = useTranslation(["specs", "common"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const addToast = useUIStore((s) => s.addToast);
  const agents = useAgentStore((s) => s.agents);
  const { data: stories } = useStories(workspace?.path);
  const { data: projects } = useProjects(workspace?.id);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [qaReviewing, setQaReviewing] = useState<string | null>(null);

  const baseRows = useMemo<Omit<Row, "frontmatter" | "openQuestions" | "loadError">[]>(() => {
    if (!stories || !projects) return [];
    const projectIndex = new Map(projects.map((p) => [p.id, p]));
    const out: Omit<Row, "frontmatter" | "openQuestions" | "loadError">[] = [];
    for (const story of stories) {
      if (!story.specPath || !story.projectId) continue;
      const project = projectIndex.get(story.projectId);
      if (!project?.repoPath) continue;
      out.push({
        story,
        projectId: story.projectId,
        projectName: project.name,
        repoPath: project.repoPath,
        specPath: story.specPath,
      });
    }
    return out;
  }, [stories, projects]);

  // Lazy-load the frontmatter of each spec so the list reflects the file's
  // real status (draft / in_review / approved) instead of the Story status.
  useEffect(() => {
    let cancelled = false;
    if (baseRows.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    Promise.all(
      baseRows.map(async (b) => {
        try {
          const { frontmatter, raw } = await readSpecFrontmatter(b.repoPath, b.specPath);
          return {
            ...b,
            frontmatter,
            openQuestions: parseOpenQuestions(raw),
            loadError: null,
          } as Row;
        } catch (err) {
          return {
            ...b,
            frontmatter: null,
            openQuestions: [],
            loadError: err instanceof Error ? err.message : String(err),
          } as Row;
        }
      }),
    ).then((loaded) => {
      if (!cancelled) {
        setRows(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseRows]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => (r.frontmatter?.status ?? "draft") === statusFilter);
  }, [rows, statusFilter]);

  const handleOpen = async (row: Row) => {
    try {
      await tauriFiles.open(row.repoPath, row.specPath);
    } catch (err) {
      addToast({
        title: t("specs:openError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  const reloadRow = async (row: Row) => {
    try {
      const { frontmatter, raw } = await readSpecFrontmatter(row.repoPath, row.specPath);
      const openQuestions = parseOpenQuestions(raw);
      setRows((prev) =>
        prev.map((r) =>
          r.story.id === row.story.id ? { ...r, frontmatter, openQuestions } : r,
        ),
      );
    } catch {
      // best-effort; leave the row alone
    }
  };

  const handleResolveQuestion = async (row: Row, question: string) => {
    setResolving(`${row.story.id}:${question}`);
    try {
      await resolveOpenQuestion({
        repoPath: row.repoPath,
        specRelPath: row.specPath,
        question,
        resolver: "user",
      });
      await reloadRow(row);
    } catch (err) {
      addToast({
        title: t("specs:resolveError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setResolving(null);
    }
  };

  const handleQaReview = async (row: Row) => {
    const qa = agents.find((a) => a.configId === QA_AGENT_CONFIG_ID);
    if (!qa) {
      addToast({
        title: t("specs:qaMissingTitle"),
        description: t("specs:qaMissingBody"),
        variant: "error",
      });
      return;
    }
    setQaReviewing(row.story.id);
    try {
      const specRaw = await tauriAgent.readFile(row.repoPath, row.specPath);
      const testsRel = row.frontmatter?.tests_path;
      let testsRaw = "";
      if (testsRel) {
        try {
          testsRaw = await tauriAgent.readFile(row.repoPath, testsRel);
        } catch {
          testsRaw = "";
        }
      }
      const { approve, reasons } = await getEngine().qaReviewSpec(specRaw, testsRaw, {
        agentPath: qa.folderPath,
      });
      if (approve) {
        await approveSpec({
          repoPath: row.repoPath,
          specRelPath: row.specPath,
          approver: QA_AGENT_CONFIG_ID,
        });
        await reloadRow(row);
        addToast({
          title: t("specs:qaApprovedTitle"),
          variant: "success",
        });
      } else {
        addToast({
          title: t("specs:qaRejectedTitle"),
          description: reasons.length > 0 ? reasons.join(" · ") : t("specs:qaRejectedFallback"),
          variant: "error",
        });
      }
    } catch (err) {
      addToast({
        title: t("specs:qaReviewError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setQaReviewing(null);
    }
  };

  const handleApprove = async (row: Row) => {
    setApproving(row.story.id);
    try {
      await approveSpec({
        repoPath: row.repoPath,
        specRelPath: row.specPath,
        approver: "user",
      });
      await reloadRow(row);
    } catch (err) {
      addToast({
        title: t("specs:approveError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setApproving(null);
    }
  };

  if (!workspace) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t("specs:noWorkspace")}</div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <div className="text-sm font-medium">{t("specs:title")}</div>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">({filtered.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Filter className="size-3.5 text-muted-foreground" />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {t(`specs:status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("specs:loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {rows.length === 0 ? t("specs:empty") : t("specs:emptyForFilter")}
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {filtered.map((row) => (
              <SpecRow
                key={row.story.id}
                row={row}
                approving={approving === row.story.id}
                qaReviewing={qaReviewing === row.story.id}
                expanded={!!expanded[row.story.id]}
                resolvingKey={resolving}
                onToggleExpand={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [row.story.id]: !prev[row.story.id],
                  }))
                }
                onOpen={() => handleOpen(row)}
                onApprove={() => handleApprove(row)}
                onQaReview={() => handleQaReview(row)}
                onResolveQuestion={(q) => handleResolveQuestion(row, q)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpecRow({
  row,
  approving,
  qaReviewing,
  expanded,
  resolvingKey,
  onToggleExpand,
  onOpen,
  onApprove,
  onQaReview,
  onResolveQuestion,
}: {
  row: Row;
  approving: boolean;
  qaReviewing: boolean;
  expanded: boolean;
  resolvingKey: string | null;
  onToggleExpand: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onQaReview: () => void;
  onResolveQuestion: (q: string) => void;
}) {
  const { t } = useTranslation("specs");
  const status = row.frontmatter?.status ?? "draft";
  const isApproved = status === "approved";
  const updated = row.frontmatter?.updated_at ?? row.story.updatedAt;
  const questionCount = row.openQuestions.length;
  const canExpand = questionCount > 0;

  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!canExpand}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            !canExpand && "opacity-30 cursor-default",
          )}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{row.story.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            {row.projectName} · <span className="font-mono">{row.specPath}</span>
            {row.frontmatter?.tests_path && (
              <>
                {" · "}
                <span className="font-mono">{row.frontmatter.tests_path}</span>
              </>
            )}
          </div>
          {row.loadError && (
            <div className="text-[11px] text-destructive truncate">{row.loadError}</div>
          )}
        </div>
        {questionCount > 0 && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 shrink-0"
            title={t("openQuestionsTooltip", { count: questionCount })}
          >
            <HelpCircle className="size-3" />
            {t("openQuestionsBadge", { count: questionCount })}
          </button>
        )}
        <div className="hidden sm:block text-[11px] text-muted-foreground tabular-nums shrink-0 w-32">
          {formatDate(updated)}
        </div>
        <div
          className={cn(
            "text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0",
            isApproved && "bg-emerald-500/10 text-emerald-600",
            status === "in_review" && "bg-amber-500/10 text-amber-600",
            status === "draft" && "bg-muted text-muted-foreground",
          )}
        >
          {t(`status.${status}`, { defaultValue: status })}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpen}>
          {t("open")}
        </Button>
        {!isApproved && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={qaReviewing}
            onClick={onQaReview}
            title={t("qaReviewTooltip")}
          >
            <ShieldCheck className="size-3.5" />
            {qaReviewing ? t("qaReviewing") : t("qaReview")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={isApproved || approving}
          onClick={onApprove}
        >
          <CheckCircle2 className="size-3.5" />
          {isApproved ? t("approved") : t("approve")}
        </Button>
      </div>

      {expanded && questionCount > 0 && (
        <div className="pl-11 pr-3 pb-3 bg-accent/20 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-2">
            {t("openQuestionsTitle")}
          </div>
          {row.openQuestions.map((q) => {
            const key = `${row.story.id}:${q}`;
            const isResolving = resolvingKey === key;
            return (
              <div
                key={q}
                className="flex items-start gap-2 text-xs bg-background rounded-md border border-border px-2.5 py-1.5"
              >
                <span className="flex-1 leading-relaxed">{q}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] shrink-0"
                  disabled={isResolving}
                  onClick={() => onResolveQuestion(q)}
                >
                  {t("resolve")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
