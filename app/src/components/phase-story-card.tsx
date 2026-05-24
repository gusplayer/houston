import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@squad/core";
import type { Story, StoryPhase, StoryPriority, StoryStatus } from "@squad/engine-client";
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
const PRIORITIES: StoryPriority[] = ["low", "medium", "high", "critical"];
const STATUSES: StoryStatus[] = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];

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
  onUpdate: (patch: Partial<Story>) => void;
}

export function PhaseStoryCard({
  story, agents, missionItems, availablePhases, onMove, onAssign, onUpdate,
}: PhaseStoryCardProps) {
  const { t } = useTranslation("dashboard");
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [draft, setDraft] = useState({ title: story.title, description: story.description ?? "", priority: story.priority ?? "", status: story.status });
  const assignRef = useRef<HTMLDivElement>(null);

  const assignedAgent = story.assignedAgentId ? agents.find((a) => a.id === story.assignedAgentId) : null;
  const liveStatus = assignedAgent ? agentLiveStatus(assignedAgent, missionItems) : null;

  useEffect(() => {
    if (!assignOpen) return;
    function handler(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assignOpen]);

  function startEdit() { setDraft({ title: story.title, description: story.description ?? "", priority: story.priority ?? "", status: story.status }); setEditing(true); }
  function cancelEdit() { setEditing(false); }
  function saveEdit() {
    const patch: Partial<Story> = { title: draft.title.trim() || story.title, description: draft.description || undefined, status: draft.status };
    if (draft.priority) patch.priority = draft.priority as StoryPriority;
    onUpdate(patch);
    setEditing(false);
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("storyId", story.id);
    e.dataTransfer.effectAllowed = "move";
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-ring bg-card p-2.5 flex flex-col gap-2">
        <input
          autoFocus
          className="w-full text-xs font-medium bg-transparent border-b border-border pb-1 outline-none focus:border-primary"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
        />
        <textarea
          className="w-full text-[11px] bg-transparent resize-none outline-none text-muted-foreground placeholder:text-muted-foreground/60 h-14"
          placeholder={t("phases.descriptionPlaceholder")}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
        <div className="flex gap-1.5">
          <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="flex-1 text-[10px] h-6 px-1 rounded border border-border bg-background text-foreground focus:outline-none">
            <option value="">—</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(`phases.priority.${p}`)}</option>)}
          </select>
          <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as StoryStatus }))} className="flex-1 text-[10px] h-6 px-1 rounded border border-border bg-background text-foreground focus:outline-none">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`phases.status.${s}`)}</option>)}
          </select>
        </div>
        <div className="flex gap-1 justify-end">
          <button onClick={cancelEdit} className="flex items-center gap-0.5 text-[10px] px-2 py-1 rounded text-muted-foreground hover:bg-accent transition-colors"><X className="size-3" />{t("phases.cancel")}</button>
          <button onClick={saveEdit} className="flex items-center gap-0.5 text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Check className="size-3" />{t("phases.save")}</button>
        </div>
      </div>
    );
  }

  return (
    <div draggable onDragStart={handleDragStart} className="rounded-lg border border-border bg-card p-2.5 hover:border-foreground/20 transition-colors cursor-grab active:cursor-grabbing active:opacity-60">
      <div className="flex items-start gap-1.5 mb-1">
        {story.priority && <span className={cn("text-[9px] font-semibold px-1 py-px rounded shrink-0 mt-0.5 uppercase tracking-wide", PRIORITY_STYLES[story.priority])}>{t(`phases.priority.${story.priority}`)}</span>}
        <span className="text-xs font-medium leading-tight line-clamp-2 flex-1">{story.title}</span>
        <button onClick={startEdit} className="shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors" title={t("phases.edit")}><Pencil className="size-3" /></button>
      </div>
      {story.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{story.description}</p>}

      <div className="flex items-center gap-1.5 mt-2">
        <div className="relative shrink-0" ref={assignRef}>
          <button onClick={() => setAssignOpen((v) => !v)} className="relative focus:outline-none rounded-full" title={t("phases.assignAgent")}>
            {assignedAgent ? (
              <><AgentStateAvatar agent={assignedAgent} diameter={18} />{liveStatus && <span className={cn("absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-card", LIVE_DOT[liveStatus])} />}</>
            ) : (
              <span className="size-[18px] rounded-full border-2 border-dashed border-muted-foreground/40 hover:border-muted-foreground transition-colors block" />
            )}
          </button>
          {assignOpen && (
            <div className="absolute left-0 top-6 z-50 w-44 rounded-lg border border-border bg-card shadow-lg p-1">
              {assignedAgent && <button className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded" onClick={() => { onAssign(null); setAssignOpen(false); }}>{t("phases.unassign")}</button>}
              {agents.map((a) => (
                <button key={a.id} className={cn("w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2", a.id === story.assignedAgentId && "bg-accent")} onClick={() => { onAssign(a.id); setAssignOpen(false); }}>
                  <AgentStateAvatar agent={a} diameter={14} /><span className="flex-1 truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground flex-1 truncate min-w-0">
          {assignedAgent?.name ?? t("phases.unassigned")}
          {liveStatus === "needs_you" && <span className="ml-1 text-amber-500 font-medium"> · {t("columns.needsYou")}</span>}
        </span>
        <select value={story.phase ?? "discovery"} onChange={(e) => onMove(e.target.value as StoryPhase)} className="text-[10px] h-5 px-1 rounded border border-border bg-card text-muted-foreground cursor-pointer shrink-0 focus:outline-none">
          {availablePhases.map((p) => <option key={p.id} value={p.id}>{t(`phases.labels.${p.id}`)}</option>)}
        </select>
      </div>
    </div>
  );
}
