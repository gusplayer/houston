import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { cn } from "@squad/core";
import type { Story, StoryPhase } from "@squad/engine-client";
import type { KanbanItem } from "@squad/board";
import type { Agent } from "../lib/types";
import { useStories, useCreateStory, useUpdateStory } from "../hooks/queries";
import { useWorkspaceStore } from "../stores/workspaces";
import { PhaseStoryCard } from "./phase-story-card";

export const PHASES: { id: StoryPhase; colorClass: string }[] = [
  { id: "discovery", colorClass: "bg-blue-500" },
  { id: "analysis",  colorClass: "bg-cyan-500" },
  { id: "planning",  colorClass: "bg-indigo-500" },
  { id: "coding",    colorClass: "bg-violet-500" },
  { id: "review",    colorClass: "bg-amber-500" },
  { id: "qa",        colorClass: "bg-pink-500" },
  { id: "deploy",    colorClass: "bg-emerald-500" },
  { id: "deliver",   colorClass: "bg-teal-500" },
];

interface PhaseKanbanProps {
  agents: Agent[];
  missionItems: KanbanItem[];
}

export function PhaseKanban({ agents, missionItems }: PhaseKanbanProps) {
  const workspace = useWorkspaceStore((s) => s.current);
  const rootPath = workspace?.path;
  const { data: stories = [] } = useStories(rootPath);
  const createStory = useCreateStory(rootPath);
  const updateStory = useUpdateStory(rootPath);

  const storiesByPhase = useMemo(() => {
    const map = Object.fromEntries(PHASES.map((p) => [p.id, [] as Story[]])) as Record<StoryPhase, Story[]>;
    for (const s of stories) {
      const phase = s.phase && map[s.phase] ? s.phase : "discovery";
      map[phase].push(s);
    }
    return map;
  }, [stories]);

  function moveStory(storyId: string, toPhase: StoryPhase) {
    void updateStory.mutateAsync({ id: storyId, patch: { phase: toPhase } });
  }

  function assignAgent(storyId: string, agentId: string | null) {
    void updateStory.mutateAsync({ id: storyId, patch: { assignedAgentId: agentId } });
  }

  return (
    <div className="flex gap-3 h-full overflow-x-auto px-4 py-4">
      {PHASES.map(({ id, colorClass }) => (
        <PhaseColumn
          key={id}
          phaseId={id}
          colorClass={colorClass}
          stories={storiesByPhase[id]}
          agents={agents}
          missionItems={missionItems}
          onMove={moveStory}
          onAssign={assignAgent}
          onAdd={(title) =>
            void createStory.mutateAsync({ title, status: "todo", phase: id })
          }
        />
      ))}
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────

interface PhaseColumnProps {
  phaseId: StoryPhase;
  colorClass: string;
  stories: Story[];
  agents: Agent[];
  missionItems: KanbanItem[];
  onMove: (storyId: string, to: StoryPhase) => void;
  onAssign: (storyId: string, agentId: string | null) => void;
  onAdd: (title: string) => void;
}

function PhaseColumn({
  phaseId, colorClass, stories, agents, missionItems,
  onMove, onAssign, onAdd,
}: PhaseColumnProps) {
  const { t } = useTranslation("dashboard");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  function commitAdd() {
    const trimmed = newTitle.trim();
    if (trimmed) onAdd(trimmed);
    setNewTitle("");
    setAdding(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    setDragOver(true);
  }

  function handleDragLeave() {
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const storyId = e.dataTransfer.getData("storyId");
    if (storyId) onMove(storyId, phaseId);
  }

  return (
    <div
      className={cn(
        "flex flex-col shrink-0 w-[256px] rounded-xl border overflow-hidden transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/40",
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <span className={cn("size-2 rounded-full shrink-0", colorClass)} />
        <span className="text-xs font-semibold flex-1 truncate">
          {t(`phases.labels.${phaseId}`)}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{stories.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
        {stories.map((story) => (
          <PhaseStoryCard
            key={story.id}
            story={story}
            agents={agents}
            missionItems={missionItems}
            availablePhases={PHASES}
            onMove={(to) => onMove(story.id, to)}
            onAssign={(agentId) => onAssign(story.id, agentId)}
          />
        ))}

        {adding && (
          <div className="rounded-lg border border-ring bg-card p-2">
            <input
              autoFocus
              className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder={t("phases.storyPlaceholder")}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
              }}
              onBlur={commitAdd}
            />
          </div>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-t border-border shrink-0"
      >
        <Plus className="size-3" />
        {t("phases.addStory")}
      </button>
    </div>
  );
}
