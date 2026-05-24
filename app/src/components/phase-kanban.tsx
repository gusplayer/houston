import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Columns3 } from "lucide-react";
import { cn, Button, EmptyHeader, EmptyTitle, EmptyDescription } from "@squad/core";
import type { Story, StoryPhase } from "@squad/engine-client";
import type { KanbanItem } from "@squad/board";
import type { Agent } from "../lib/types";
import { useStories, useCreateStory, useUpdateStory } from "../hooks/queries";
import { useWorkspaceStore } from "../stores/workspaces";
import { AgentStateAvatar } from "./agent-state-avatar";
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
  onStartStoryMission?: (agent: Agent, prefillText: string) => void;
}

export function PhaseKanban({ agents, missionItems, onStartStoryMission }: PhaseKanbanProps) {
  const { t } = useTranslation("dashboard");
  const workspace = useWorkspaceStore((s) => s.current);
  const rootPath = workspace?.path;
  const { data: stories = [] } = useStories(rootPath);
  const createStory = useCreateStory(rootPath);
  const updateStory = useUpdateStory(rootPath);
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);

  const hasNoStories = stories.length === 0;

  const storiesByPhase = useMemo(() => {
    const base = filterAgentId ? stories.filter((s) => s.assignedAgentId === filterAgentId) : stories;
    const map = Object.fromEntries(PHASES.map((p) => [p.id, [] as Story[]])) as Record<StoryPhase, Story[]>;
    for (const s of base) {
      const phase = s.phase && map[s.phase] ? s.phase : "discovery";
      map[phase].push(s);
    }
    return map;
  }, [stories, filterAgentId]);

  function moveStory(id: string, to: StoryPhase) { void updateStory.mutateAsync({ id, patch: { phase: to } }); }
  function assignAgent(id: string, agentId: string | null) { void updateStory.mutateAsync({ id, patch: { assignedAgentId: agentId } }); }
  function updateStoryData(id: string, patch: Partial<Story>) { void updateStory.mutateAsync({ id, patch }); }
  function startStoryMission(story: Story) {
    if (!onStartStoryMission || !story.assignedAgentId) return;
    const agent = agents.find((a) => a.id === story.assignedAgentId);
    if (!agent) return;
    // Marker at the end so the agent reads the substance first; UI
    // strips it for display and cross-references with the stories list
    // to surface the story title as a tag on the mission card.
    const prefill = t("phases.missionPrefill", { title: story.title })
      + (story.description ? `\n\n${story.description}` : "")
      + `\n\n<!-- squad:story=${story.id} -->`;
    onStartStoryMission(agent, prefill);
  }

  if (hasNoStories) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Columns3 className="size-6 text-primary" />
        </div>
        <EmptyHeader>
          <EmptyTitle>{t("phases.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("phases.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button
          className="rounded-full"
          onClick={() =>
            void createStory.mutateAsync({ title: t("phases.firstStoryTitle"), status: "todo", phase: "discovery" })
          }
        >
          <Plus className="size-4" />
          {t("phases.emptyCta")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Agent filter bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setFilterAgentId(null)}
          className={cn(
            "text-[11px] px-2.5 py-1 rounded-full border transition-colors shrink-0",
            filterAgentId === null
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
          )}
        >
          {t("phases.allAgents")}
        </button>
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => setFilterAgentId(a.id === filterAgentId ? null : a.id)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors shrink-0",
              a.id === filterAgentId
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            <AgentStateAvatar agent={a} diameter={14} />
            {a.name}
          </button>
        ))}
      </div>

      {/* Columns */}
      <div className="flex gap-3 flex-1 overflow-x-auto px-4 py-4 min-h-0">
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
            onUpdate={updateStoryData}
            onStartMission={onStartStoryMission ? startStoryMission : undefined}
            onAdd={(title) => void createStory.mutateAsync({ title, status: "todo", phase: id })}
          />
        ))}
      </div>
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────

interface PhaseColumnProps {
  phaseId: StoryPhase; colorClass: string; stories: Story[];
  agents: Agent[]; missionItems: KanbanItem[];
  onMove: (id: string, to: StoryPhase) => void;
  onAssign: (id: string, agentId: string | null) => void;
  onUpdate: (id: string, patch: Partial<Story>) => void;
  onStartMission?: (story: Story) => void;
  onAdd: (title: string) => void;
}

function PhaseColumn({ phaseId, colorClass, stories, agents, missionItems, onMove, onAssign, onUpdate, onStartMission, onAdd }: PhaseColumnProps) {
  const { t } = useTranslation("dashboard");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const counter = useRef(0);

  function commitAdd() { const v = newTitle.trim(); if (v) onAdd(v); setNewTitle(""); setAdding(false); }

  return (
    <div
      className={cn("flex flex-col shrink-0 w-[256px] rounded-xl border overflow-hidden transition-colors", dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/40")}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); counter.current += 1; setDragOver(true); }}
      onDragLeave={() => { counter.current -= 1; if (counter.current === 0) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); counter.current = 0; setDragOver(false); const id = e.dataTransfer.getData("storyId"); if (id) onMove(id, phaseId); }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <span className={cn("size-2 rounded-full shrink-0", colorClass)} />
        <span className="text-xs font-semibold flex-1 truncate">{t(`phases.labels.${phaseId}`)}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{stories.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
        {stories.map((s) => (
          <PhaseStoryCard
            key={s.id} story={s} agents={agents} missionItems={missionItems} availablePhases={PHASES}
            onMove={(to) => onMove(s.id, to)} onAssign={(aid) => onAssign(s.id, aid)} onUpdate={(patch) => onUpdate(s.id, patch)}
            onStartMission={onStartMission ? () => onStartMission(s) : undefined}
          />
        ))}
        {adding && (
          <div className="rounded-lg border border-ring bg-card p-2">
            <input autoFocus className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground" placeholder={t("phases.storyPlaceholder")} value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
              onBlur={commitAdd} />
          </div>
        )}
      </div>

      <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-t border-border shrink-0">
        <Plus className="size-3" />{t("phases.addStory")}
      </button>
    </div>
  );
}
