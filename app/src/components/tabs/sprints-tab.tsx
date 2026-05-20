import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ChevronDown, Flag, Circle, GitPullRequest } from "lucide-react";
import { Button, Badge, Spinner, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@squad/core";
import type { TabProps } from "../../lib/types";
import {
  useSprints,
  useCreateSprint,
  useUpdateSprint,
  useStories,
  useCreateStory,
  useUpdateStory,
  useDeleteStory,
} from "../../hooks/queries";
import type { Story, StoryStatus, StoryPhase } from "@squad/engine-client";

const STORY_COLUMNS: StoryStatus[] = ["todo", "in_progress", "in_review", "done"];

const STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

const STORY_PHASES: StoryPhase[] = [
  "discovery",
  "analysis",
  "planning",
  "coding",
  "review",
  "qa",
  "deploy",
  "deliver",
];

// Phase dot color — only the dot is colored; chip text stays muted.
// Keeps the UI grayscale-first per the design system guidance.
const PHASE_DOT_COLORS: Record<StoryPhase, string> = {
  discovery: "bg-blue-500",
  analysis: "bg-cyan-500",
  planning: "bg-indigo-500",
  coding: "bg-violet-500",
  review: "bg-amber-500",
  qa: "bg-pink-500",
  deploy: "bg-emerald-500",
  deliver: "bg-teal-500",
};

function StoryCard({
  story,
  onStatusChange,
  onPhaseChange,
  onDelete,
}: {
  story: Story;
  onStatusChange: (id: string, status: StoryStatus) => void;
  onPhaseChange: (id: string, phase: StoryPhase) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("agents");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-background border border-border rounded-lg p-2.5 shadow-sm group">
      <div className="flex items-start gap-1.5">
        <button
          className="shrink-0 mt-0.5"
          onClick={() => setExpanded((v) => !v)}
        >
          <Circle className={cn("size-3.5", story.status === "done" && "text-emerald-500 fill-emerald-500")} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs leading-tight", story.status === "done" && "line-through text-muted-foreground")}>
            {story.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {story.phase && (
              <span className="text-[10px] px-1 rounded bg-accent text-accent-foreground inline-flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", PHASE_DOT_COLORS[story.phase])} />
                {t(`sprints.phases.${story.phase}`)}
              </span>
            )}
            {story.epic && (
              <span className="text-[10px] px-1 rounded bg-accent text-accent-foreground">{story.epic}</span>
            )}
            {story.points != null && (
              <span className="text-[10px] text-muted-foreground">{story.points}pt</span>
            )}
            {story.priority && story.priority !== "medium" && (
              <Flag className={cn("size-3", PRIORITY_COLORS[story.priority] ?? "text-muted-foreground")} />
            )}
            {story.prUrl && (
              <GitPullRequest className="size-3 text-muted-foreground" />
            )}
          </div>
          {expanded && story.description && (
            <p className="text-[11px] text-muted-foreground mt-1">{story.description}</p>
          )}
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0">{t("sprints.statusLabel")}</span>
            <Select
              value={story.status}
              onValueChange={(v) => onStatusChange(story.id, v as StoryStatus)}
            >
              <SelectTrigger className="h-6 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as StoryStatus[]).map((s) => (
                  <SelectItem key={s} value={s} className="text-[10px]">{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0">{t("sprints.phaseLabel")}</span>
            <Select
              value={story.phase ?? ""}
              onValueChange={(v) => onPhaseChange(story.id, v as StoryPhase)}
            >
              <SelectTrigger className="h-6 text-[10px] flex-1">
                <SelectValue placeholder={t("sprints.noPhase")} />
              </SelectTrigger>
              <SelectContent>
                {STORY_PHASES.map((p) => (
                  <SelectItem key={p} value={p} className="text-[10px]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("size-1.5 rounded-full", PHASE_DOT_COLORS[p])} />
                      {t(`sprints.phases.${p}`)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1 text-[10px] text-muted-foreground hover:text-destructive self-end"
            onClick={() => onDelete(story.id)}
          >
            {t("sprints.delete")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SprintsTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;

  const { data: sprints, isLoading: sprintsLoading } = useSprints(path);
  const { data: allStories, isLoading: storiesLoading } = useStories(path);
  const createSprint = useCreateSprint(path);
  const updateSprint = useUpdateSprint(path);
  const createStory = useCreateStory(path);
  const updateStory = useUpdateStory(path);
  const deleteStory = useDeleteStory(path);

  const [selectedSprintId, setSelectedSprintId] = useState<string | "backlog">("backlog");
  const [phaseFilter, setPhaseFilter] = useState<StoryPhase | "all">("all");
  const [showNewStory, setShowNewStory] = useState<StoryStatus | null>(null);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");

  const displaySprintId = selectedSprintId === "backlog" ? null : selectedSprintId;

  const columnStories = (status: StoryStatus): Story[] =>
    (allStories ?? []).filter(
      (s) =>
        s.status === status &&
        (selectedSprintId === "backlog"
          ? !s.sprintId
          : s.sprintId === selectedSprintId) &&
        (phaseFilter === "all" || s.phase === phaseFilter),
    );

  async function handleAddStory(status: StoryStatus) {
    if (!newStoryTitle.trim()) return;
    await createStory.mutateAsync({
      title: newStoryTitle.trim(),
      status,
      sprintId: displaySprintId ?? undefined,
      priority: "medium",
      // If a phase filter is active, new stories inherit it so they
      // appear in the current view. Otherwise start in discovery.
      phase: phaseFilter === "all" ? "discovery" : phaseFilter,
    });
    setNewStoryTitle("");
    setShowNewStory(null);
  }

  async function handleStatusChange(id: string, status: StoryStatus) {
    await updateStory.mutateAsync({ id, patch: { status } });
  }

  async function handlePhaseChange(id: string, phase: StoryPhase) {
    await updateStory.mutateAsync({ id, patch: { phase } });
  }

  async function handleCreateSprint() {
    if (!newSprintName.trim()) return;
    await createSprint.mutateAsync({ name: newSprintName.trim() });
    setNewSprintName("");
    setShowNewSprint(false);
  }

  if (sprintsLoading || storiesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Sprint + phase selectors */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
          <SelectTrigger className="h-7 text-xs w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog" className="text-xs">{t("sprints.backlog")}</SelectItem>
            {(sprints ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name}
                {s.status === "active" && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{t("sprints.active")}</Badge>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as StoryPhase | "all")}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">{t("sprints.allPhases")}</SelectItem>
            {STORY_PHASES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", PHASE_DOT_COLORS[p])} />
                  {t(`sprints.phases.${p}`)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedSprintId !== "backlog" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const sprint = sprints?.find((s) => s.id === selectedSprintId);
              if (sprint) {
                void updateSprint.mutateAsync({
                  id: sprint.id,
                  patch: {
                    status: sprint.status === "active" ? "completed" : "active",
                  },
                });
              }
            }}
          >
            <ChevronDown className="size-3 mr-1" />
            {sprints?.find((s) => s.id === selectedSprintId)?.status === "active"
              ? t("sprints.completeSprint")
              : t("sprints.startSprint")}
          </Button>
        )}

        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setShowNewSprint((v) => !v)}
          >
            <Plus className="size-3 mr-1" />
            {t("sprints.newSprint")}
          </Button>
        </div>
      </div>

      {/* New sprint form */}
      {showNewSprint && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 shrink-0">
          <input
            className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("sprints.sprintName")}
            value={newSprintName}
            onChange={(e) => setNewSprintName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateSprint();
              if (e.key === "Escape") setShowNewSprint(false);
            }}
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => void handleCreateSprint()} disabled={!newSprintName.trim()}>
            {t("sprints.create")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewSprint(false)}>
            {t("sprints.cancel")}
          </Button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        {STORY_COLUMNS.map((status) => {
          const cards = columnStories(status);
          return (
            <div key={status} className="flex flex-col w-56 shrink-0 border-r border-border last:border-r-0">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
                <span className="text-xs font-medium">{STATUS_LABELS[status]}</span>
                {cards.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">{cards.length}</Badge>
                )}
                <button
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewStory(status)}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 p-2 flex-1 overflow-auto">
                {/* Quick-add input */}
                {showNewStory === status && (
                  <div className="flex flex-col gap-1">
                    <input
                      className="w-full h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder={t("sprints.storyTitle")}
                      value={newStoryTitle}
                      onChange={(e) => setNewStoryTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleAddStory(status);
                        if (e.key === "Escape") setShowNewStory(null);
                      }}
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 text-[10px] flex-1"
                        onClick={() => void handleAddStory(status)}
                        disabled={!newStoryTitle.trim()}
                      >
                        {t("sprints.add")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => setShowNewStory(null)}
                      >
                        {t("sprints.cancel")}
                      </Button>
                    </div>
                  </div>
                )}

                {cards.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    onStatusChange={(id, status) => void handleStatusChange(id, status)}
                    onPhaseChange={(id, phase) => void handlePhaseChange(id, phase)}
                    onDelete={(id) => void deleteStory.mutateAsync(id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
