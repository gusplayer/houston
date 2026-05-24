import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@squad/core";
import type { Story, StoryPhase, StoryPriority } from "@squad/engine-client";
import type { KanbanItem } from "@squad/board";
import type { Agent } from "../lib/types";
import { AgentStateAvatar } from "./agent-state-avatar";

const PRIORITY_STYLES: Record<StoryPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const LIVE_DOT: Record<string, string> = {
  running: "bg-blue-500",
  needs_you: "bg-amber-500",
  done: "bg-emerald-500",
};

function agentLiveStatus(agent: Agent, items: KanbanItem[]): string | null {
  const mine = items.filter((i) => i.metadata?.agentPath === agent.folderPath);
  if (mine.some((i) => i.status === "needs_you")) return "needs_you";
  if (mine.some((i) => i.status === "running")) return "running";
  if (mine.length > 0) return "done";
  return null;
}

interface PhaseStoryCardProps {
  story: Story;
  agents: Agent[];
  missionItems: KanbanItem[];
  availablePhases: { id: StoryPhase }[];
  onMove: (to: StoryPhase) => void;
  onAssign: (agentId: string | null) => void;
}

export function PhaseStoryCard({
  story, agents, missionItems, availablePhases, onMove, onAssign,
}: PhaseStoryCardProps) {
  const { t } = useTranslation(["agents", "dashboard"]);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);

  const assignedAgent = story.assignedAgentId
    ? agents.find((a) => a.id === story.assignedAgentId)
    : null;
  const liveStatus = assignedAgent ? agentLiveStatus(assignedAgent, missionItems) : null;

  // Close assign dropdown on outside click
  useEffect(() => {
    if (!assignOpen) return;
    function handler(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssignOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assignOpen]);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("storyId", story.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="rounded-lg border border-border bg-card p-2.5 hover:border-foreground/20 transition-colors cursor-grab active:cursor-grabbing active:opacity-60 active:scale-[0.98]"
    >
      {/* Priority + title */}
      <div className="flex items-start gap-1.5 mb-1">
        {story.priority && (
          <span
            className={cn(
              "text-[9px] font-semibold px-1 py-px rounded shrink-0 mt-0.5 uppercase tracking-wide",
              PRIORITY_STYLES[story.priority],
            )}
          >
            {story.priority}
          </span>
        )}
        <span className="text-xs font-medium leading-tight line-clamp-2">{story.title}</span>
      </div>

      {story.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{story.description}</p>
      )}

      {/* Footer: agent assign + live status + move */}
      <div className="flex items-center gap-1.5 mt-2">
        {/* Agent assign button */}
        <div className="relative shrink-0" ref={assignRef}>
          <button
            onClick={() => setAssignOpen((v) => !v)}
            className="relative focus:outline-none focus:ring-1 focus:ring-ring rounded-full"
            title={t("dashboard:phases.assignAgent")}
          >
            {assignedAgent ? (
              <>
                <AgentStateAvatar agent={assignedAgent} diameter={18} />
                {liveStatus && (
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-card",
                      LIVE_DOT[liveStatus],
                    )}
                  />
                )}
              </>
            ) : (
              <span className="size-[18px] rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-muted-foreground transition-colors block" />
            )}
          </button>

          {assignOpen && (
            <div className="absolute left-0 top-6 z-50 w-44 rounded-lg border border-border bg-card shadow-lg p-1">
              {assignedAgent && (
                <button
                  className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded"
                  onClick={() => { onAssign(null); setAssignOpen(false); }}
                >
                  {t("dashboard:phases.unassign")}
                </button>
              )}
              {agents.map((a) => (
                <button
                  key={a.id}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2",
                    a.id === story.assignedAgentId && "bg-accent",
                  )}
                  onClick={() => { onAssign(a.id); setAssignOpen(false); }}
                >
                  <AgentStateAvatar agent={a} diameter={14} />
                  <span className="flex-1 truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-[10px] text-muted-foreground flex-1 truncate min-w-0">
          {assignedAgent?.name ?? t("dashboard:phases.unassigned")}
          {liveStatus === "needs_you" && (
            <span className="ml-1 text-amber-500 font-medium">
              {" · "}{t("dashboard:columns.needsYou")}
            </span>
          )}
        </span>

        {/* Move to phase */}
        <select
          value={story.phase ?? "discovery"}
          onChange={(e) => onMove(e.target.value as StoryPhase)}
          className="text-[10px] h-5 px-1 rounded border border-border bg-card text-muted-foreground cursor-pointer shrink-0 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {availablePhases.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`dashboard:phases.labels.${p.id}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
