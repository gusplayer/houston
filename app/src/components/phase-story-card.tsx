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
}

export function PhaseStoryCard({
  story,
  agents,
  missionItems,
  availablePhases,
  onMove,
}: PhaseStoryCardProps) {
  const { t } = useTranslation(["agents", "dashboard"]);
  const assignedAgent = story.assignedAgentId
    ? agents.find((a) => a.id === story.assignedAgentId)
    : null;
  const liveStatus = assignedAgent ? agentLiveStatus(assignedAgent, missionItems) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 hover:border-foreground/20 transition-colors">
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

      {/* Footer: agent status + move select */}
      <div className="flex items-center gap-1.5 mt-2">
        <div className="relative shrink-0">
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
            <span className="size-[18px] rounded-full border-2 border-dashed border-muted-foreground/30 block" />
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

        <select
          value={story.phase ?? "discovery"}
          onChange={(e) => onMove(e.target.value as StoryPhase)}
          className="text-[10px] h-5 px-1 rounded border border-border bg-card text-muted-foreground cursor-pointer shrink-0 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {availablePhases.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`agents:sprints.phases.${p.id}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
