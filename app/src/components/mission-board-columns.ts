import type { KanbanColumnConfig } from "@squad/board";

interface MissionBoardColumnLabels {
  upNext: string;
  running: string;
  needsYou: string;
  done: string;
  newMission: string;
  queueTask: string;
}

export function buildMissionBoardColumns(
  labels: MissionBoardColumnLabels,
  onNewMission: () => void,
  // Per-agent boards pass this to enqueue a task. Cross-agent Mission Control
  // omits it (queueing there would need an agent picker first).
  onQueueTask?: () => void,
): KanbanColumnConfig[] {
  return [
    {
      id: "queued",
      label: labels.upNext,
      statuses: ["queued"],
      onAdd: onQueueTask,
      addLabel: onQueueTask ? labels.queueTask : undefined,
    },
    {
      id: "running",
      label: labels.running,
      statuses: ["running"],
      onAdd: onNewMission,
      addLabel: labels.newMission,
    },
    { id: "needs_you", label: labels.needsYou, statuses: ["needs_you"] },
    { id: "done", label: labels.done, statuses: ["done", "cancelled"] },
  ];
}
