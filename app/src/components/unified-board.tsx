/**
 * Unified workspace board (M4).
 *
 * Replaces the old `phase-kanban` (dashboard) + `sprints-tab` (per-agent)
 * dual surfaces. One board, one set of filters, one mental model:
 *
 *   - **Columns** are status: To do / In progress / In review / Done.
 *   - **Rows** are phase, opt-in via the "Show phases" toggle. Off by
 *     default so a vibe coder isn't staring at 8 phase columns on first
 *     open; on for a CTO who wants to see the pipeline.
 *   - **Filters** at the top: sprint, project, agent, phase (when
 *     swimlanes are off). All chips inherit into newly-created stories
 *     so "filter to backend, then + add" lands a backend story.
 *
 * The board is workspace-scoped (`workspace.path` is the I/O root) — it
 * works the same whether rendered as a top-level Dashboard view or
 * inside an agent's Sprints tab, because the underlying stories.json
 * lives at the workspace root either way (F.2).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Columns3, LayoutGrid } from "lucide-react";
import {
  Badge,
  Button,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from "@squad/core";
import type { Project, Story, StoryPhase, StoryStatus } from "@squad/engine-client";
import type { KanbanItem } from "@squad/board";
import type { Agent } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import {
  useSprints,
  useStories,
  useCreateStory,
  useUpdateStory,
  useProjects,
} from "../hooks/queries";
import { AgentStateAvatar } from "./agent-state-avatar";
import { PhaseStoryCard } from "./phase-story-card";

const STATUS_COLUMNS: StoryStatus[] = ["todo", "in_progress", "in_review", "done"];

const PHASES: { id: StoryPhase; colorClass: string }[] = [
  { id: "discovery", colorClass: "bg-blue-500" },
  { id: "analysis", colorClass: "bg-cyan-500" },
  { id: "planning", colorClass: "bg-indigo-500" },
  { id: "coding", colorClass: "bg-violet-500" },
  { id: "review", colorClass: "bg-amber-500" },
  { id: "qa", colorClass: "bg-pink-500" },
  { id: "deploy", colorClass: "bg-emerald-500" },
  { id: "deliver", colorClass: "bg-teal-500" },
];

interface UnifiedBoardProps {
  /** Optional explicit agent list. When omitted, falls back to the
   * workspace agent store — that's the normal path for the agent
   * Sprints tab where TabProps doesn't carry the agent list. */
  agents?: Agent[];
  missionItems?: KanbanItem[];
  onStartStoryMission?: (agent: Agent, prefillText: string) => void;
}

type SprintFilter = "all" | "backlog" | string;
type ProjectFilter = "all" | "__global__" | string;
type PhaseFilter = StoryPhase | "all";

export function UnifiedBoard({
  agents: agentsProp,
  missionItems = [],
  onStartStoryMission,
}: UnifiedBoardProps = {}) {
  const { t } = useTranslation(["agents", "dashboard"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const storeAgents = useAgentStore((s) => s.agents);
  const agents = agentsProp ?? storeAgents;
  const path = workspace?.path;

  const { data: stories, isLoading: storiesLoading } = useStories(path);
  const { data: sprints } = useSprints(path);
  const { data: projects } = useProjects(workspace?.id);
  const createStory = useCreateStory(path);
  const updateStory = useUpdateStory(path);

  const [sprintFilter, setSprintFilter] = useState<SprintFilter>("all");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [showSwimlanes, setShowSwimlanes] = useState(false);
  const [addingTo, setAddingTo] = useState<{ status: StoryStatus; phase?: StoryPhase } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const projectsById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p])),
    [projects],
  );

  const filtered = useMemo(() => {
    let base = stories ?? [];
    if (sprintFilter === "backlog") base = base.filter((s) => !s.sprintId);
    else if (sprintFilter !== "all") base = base.filter((s) => s.sprintId === sprintFilter);
    if (projectFilter === "__global__") base = base.filter((s) => !s.projectId);
    else if (projectFilter !== "all") base = base.filter((s) => s.projectId === projectFilter);
    if (agentFilter) base = base.filter((s) => s.assignedAgentId === agentFilter);
    if (!showSwimlanes && phaseFilter !== "all") {
      base = base.filter((s) => s.phase === phaseFilter);
    }
    return base;
  }, [stories, sprintFilter, projectFilter, agentFilter, phaseFilter, showSwimlanes]);

  const inCell = (status: StoryStatus, phase?: StoryPhase) =>
    filtered.filter((s) => {
      if (s.status !== status) return false;
      if (!phase) return true;
      return (s.phase ?? "discovery") === phase;
    });

  function inheritedProjectId(): string | null {
    if (projectFilter === "all" || projectFilter === "__global__") return null;
    return projectFilter;
  }
  function inheritedSprintId(): string | null {
    if (sprintFilter === "all" || sprintFilter === "backlog") return null;
    return sprintFilter;
  }

  async function commitAdd() {
    if (!addingTo || !draftTitle.trim()) {
      setAddingTo(null);
      setDraftTitle("");
      return;
    }
    const phase: StoryPhase =
      addingTo.phase ??
      (phaseFilter !== "all" ? phaseFilter : "discovery");
    await createStory.mutateAsync({
      title: draftTitle.trim(),
      status: addingTo.status,
      phase,
      sprintId: inheritedSprintId(),
      projectId: inheritedProjectId(),
      assignedAgentId: agentFilter ?? null,
      priority: "medium",
    });
    setDraftTitle("");
    setAddingTo(null);
  }

  function moveStory(id: string, patch: Partial<Story>) {
    void updateStory.mutateAsync({ id, patch });
  }

  function startStoryMission(story: Story) {
    if (!onStartStoryMission || !story.assignedAgentId) return;
    const agent = agents.find((a) => a.id === story.assignedAgentId);
    if (!agent) return;
    const prefill =
      t("agents:phases.missionPrefill", { title: story.title }) +
      (story.description ? `\n\n${story.description}` : "") +
      `\n\n<!-- squad:story=${story.id} -->`;
    onStartStoryMission(agent, prefill);
  }

  if (storiesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  const hasAnyStory = (stories?.length ?? 0) > 0;
  if (!hasAnyStory) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Columns3 className="size-6 text-primary" />
        </div>
        <EmptyHeader>
          <EmptyTitle>{t("dashboard:phases.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("dashboard:phases.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button
          className="rounded-full"
          onClick={() =>
            void createStory.mutateAsync({
              title: t("dashboard:phases.firstStoryTitle"),
              status: "todo",
              phase: "discovery",
              projectId: null,
              priority: "medium",
            })
          }
        >
          <Plus className="size-4" />
          {t("dashboard:phases.emptyCta")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
        {(sprints?.length ?? 0) > 0 && (
          <Select value={sprintFilter} onValueChange={(v) => setSprintFilter(v as SprintFilter)}>
            <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{t("agents:sprints.allSprints")}</SelectItem>
              <SelectItem value="backlog" className="text-xs">{t("agents:sprints.backlog")}</SelectItem>
              {(sprints ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                  {s.status === "active" && (
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{t("agents:sprints.active")}</Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(projects?.length ?? 0) > 0 && (
          <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v as ProjectFilter)}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{t("agents:sprints.allProjects")}</SelectItem>
              <SelectItem value="__global__" className="text-xs">{t("agents:sprints.workspaceGlobal")}</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Agent chips */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          <AgentChip
            label={t("dashboard:phases.allAgents")}
            active={agentFilter === null}
            onClick={() => setAgentFilter(null)}
          />
          {agents.map((a) => (
            <AgentChip
              key={a.id}
              label={a.name}
              avatar={<AgentStateAvatar agent={a} diameter={14} />}
              active={a.id === agentFilter}
              onClick={() => setAgentFilter(a.id === agentFilter ? null : a.id)}
            />
          ))}
        </div>

        {/* Phase filter is only meaningful when swimlanes are off */}
        {!showSwimlanes && (
          <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as PhaseFilter)}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">{t("agents:sprints.allPhases")}</SelectItem>
              {PHASES.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", p.colorClass)} />
                    {t(`agents:sprints.phases.${p.id}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          onClick={() => setShowSwimlanes((v) => !v)}
          className={cn(
            "h-7 px-2 text-xs rounded-md border inline-flex items-center gap-1.5 transition-colors",
            showSwimlanes
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title={t("agents:sprints.swimlaneHint")}
        >
          <LayoutGrid className="size-3" />
          {t("agents:sprints.showPhases")}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {showSwimlanes ? (
          <SwimlaneGrid
            phases={PHASES}
            stories={filtered}
            agents={agents}
            missionItems={missionItems}
            projectsById={projectsById}
            inCell={inCell}
            onMove={moveStory}
            onStartMission={onStartStoryMission ? startStoryMission : undefined}
            addingTo={addingTo}
            setAddingTo={setAddingTo}
            draftTitle={draftTitle}
            setDraftTitle={setDraftTitle}
            commitAdd={commitAdd}
          />
        ) : (
          <StatusRow
            stories={filtered}
            agents={agents}
            missionItems={missionItems}
            projectsById={projectsById}
            inCell={inCell}
            onMove={moveStory}
            onStartMission={onStartStoryMission ? startStoryMission : undefined}
            addingTo={addingTo}
            setAddingTo={setAddingTo}
            draftTitle={draftTitle}
            setDraftTitle={setDraftTitle}
            commitAdd={commitAdd}
          />
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function AgentChip({
  label,
  avatar,
  active,
  onClick,
}: {
  label: string;
  avatar?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 text-[11px] h-7 px-2 rounded-full border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
      )}
    >
      {avatar}
      {label}
    </button>
  );
}

interface CellArgs {
  stories: Story[];
  agents: Agent[];
  missionItems: KanbanItem[];
  /** Workspace projects keyed by id — used to surface the SDD spec
   * affordance on cards scoped to a project. Cards for workspace-global
   * stories simply pass `undefined` and the chip hides itself. */
  projectsById: Map<string, Project>;
  inCell: (status: StoryStatus, phase?: StoryPhase) => Story[];
  onMove: (id: string, patch: Partial<Story>) => void;
  onStartMission?: (story: Story) => void;
  addingTo: { status: StoryStatus; phase?: StoryPhase } | null;
  setAddingTo: (v: { status: StoryStatus; phase?: StoryPhase } | null) => void;
  draftTitle: string;
  setDraftTitle: (v: string) => void;
  commitAdd: () => void;
}

function StatusRow(props: CellArgs) {
  const { t } = useTranslation("agents");
  return (
    <div className="flex gap-3 px-4 py-4 min-h-0 h-full">
      {STATUS_COLUMNS.map((status) => (
        <DropColumn
          key={status}
          label={t(`sprints.columnLabels.${status}` as const)}
          count={props.inCell(status).length}
          accepts={{ status }}
          onAdd={() => props.setAddingTo({ status })}
          onDrop={(storyId) => props.onMove(storyId, { status })}
        >
          {props.inCell(status).map((s) => (
            <CardWrap key={s.id} story={s} {...props} />
          ))}
          {props.addingTo?.status === status && props.addingTo.phase === undefined && (
            <DraftInput
              value={props.draftTitle}
              onChange={props.setDraftTitle}
              onCommit={props.commitAdd}
              onCancel={() => { props.setAddingTo(null); props.setDraftTitle(""); }}
            />
          )}
        </DropColumn>
      ))}
    </div>
  );
}

function SwimlaneGrid({
  phases,
  ...props
}: CellArgs & { phases: { id: StoryPhase; colorClass: string }[] }) {
  const { t } = useTranslation("agents");
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {/* Column headers */}
      <div className="grid grid-cols-[120px_repeat(4,_minmax(0,1fr))] gap-3 px-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("sprints.phaseHeader")}</span>
        {STATUS_COLUMNS.map((status) => (
          <span key={status} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {t(`sprints.columnLabels.${status}` as const)}
          </span>
        ))}
      </div>
      {phases.map((p) => (
        <div key={p.id} className="grid grid-cols-[120px_repeat(4,_minmax(0,1fr))] gap-3">
          <div className="flex items-center gap-2 pt-2">
            <span className={cn("size-2 rounded-full shrink-0", p.colorClass)} />
            <span className="text-xs font-medium truncate">{t(`sprints.phases.${p.id}`)}</span>
          </div>
          {STATUS_COLUMNS.map((status) => (
            <DropColumn
              key={status}
              compact
              count={props.inCell(status, p.id).length}
              accepts={{ status, phase: p.id }}
              onAdd={() => props.setAddingTo({ status, phase: p.id })}
              onDrop={(storyId) => props.onMove(storyId, { status, phase: p.id })}
            >
              {props.inCell(status, p.id).map((s) => (
                <CardWrap key={s.id} story={s} {...props} />
              ))}
              {props.addingTo?.status === status && props.addingTo.phase === p.id && (
                <DraftInput
                  value={props.draftTitle}
                  onChange={props.setDraftTitle}
                  onCommit={props.commitAdd}
                  onCancel={() => { props.setAddingTo(null); props.setDraftTitle(""); }}
                />
              )}
            </DropColumn>
          ))}
        </div>
      ))}
    </div>
  );
}

function CardWrap({ story, agents, missionItems, projectsById, onMove, onStartMission }: CellArgs & { story: Story }) {
  const project = story.projectId ? projectsById.get(story.projectId) ?? null : null;
  return (
    <PhaseStoryCard
      story={story}
      agents={agents}
      missionItems={missionItems}
      availablePhases={PHASES}
      project={project}
      onMove={(phase) => onMove(story.id, { phase })}
      onAssign={(agentId) => onMove(story.id, { assignedAgentId: agentId })}
      onUpdate={(patch) => onMove(story.id, patch)}
      onStartMission={onStartMission ? () => onStartMission(story) : undefined}
    />
  );
}

interface DropColumnProps {
  label?: string;
  count: number;
  accepts: { status: StoryStatus; phase?: StoryPhase };
  onAdd: () => void;
  onDrop: (storyId: string) => void;
  compact?: boolean;
  children: React.ReactNode;
}

function DropColumn({ label, count, onAdd, onDrop, compact, children }: DropColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const counter = useRef(0);
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border overflow-hidden transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/40",
        compact ? "min-h-[80px]" : "w-72 shrink-0",
      )}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); counter.current += 1; setDragOver(true); }}
      onDragLeave={() => { counter.current -= 1; if (counter.current === 0) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        counter.current = 0;
        setDragOver(false);
        const id = e.dataTransfer.getData("storyId");
        if (id) onDrop(id);
      }}
    >
      {label && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold">{label}</span>
          {count > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>}
          <button onClick={onAdd} className="ml-auto text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
        {children}
      </div>
      {!label && (
        <button onClick={onAdd} className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 justify-center">
          <Plus className="size-3" />
        </button>
      )}
    </div>
  );
}

function DraftInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("agents");
  return (
    <div className="rounded-lg border border-ring bg-card p-2">
      <input
        autoFocus
        className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder={t("sprints.storyTitle")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCommit}
      />
    </div>
  );
}
