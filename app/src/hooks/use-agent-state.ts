import { useMemo } from "react";
import { useActivity } from "./queries";
import { useSessionStatusStore, getSessionStatusKey, isActiveSessionStatus } from "../stores/session-status";

/**
 * Derived state of an agent — what's it doing right now? Drives the
 * status indicator on the agent avatar. Mapped from session-status
 * events (real-time signal from the engine) and recent activity items
 * (persisted progress).
 */
export type AgentState =
  | "working"   // a session is currently running
  | "needs_you" // an activity needs user input
  | "error"     // last session ended in error
  | "done"      // most recent activity completed cleanly
  | "idle";     // nothing recent

/**
 * Compute the agent's live state from its activities + session statuses.
 * `working` and `needs_you` take precedence because they're actionable.
 */
export function useAgentState(agentPath: string | undefined): AgentState {
  const { data: activities } = useActivity(agentPath);
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);

  return useMemo<AgentState>(() => {
    if (!agentPath) return "idle";

    const list = activities ?? [];
    if (list.length === 0) return "idle";

    // Real-time signal: any session of this agent currently running.
    const anyRunningSession = list.some((a) => {
      const sk = a.session_key ?? `activity-${a.id}`;
      const key = getSessionStatusKey(agentPath, sk);
      return isActiveSessionStatus(sessionStatuses[key]);
    });
    if (anyRunningSession) return "working";

    // Persisted activity status — needs_you is the most actionable.
    if (list.some((a) => a.status === "needs_you")) return "needs_you";
    if (list.some((a) => a.status === "running")) return "working";

    // Most recently updated activity decides between done / error / idle.
    const sorted = [...list].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    );
    const head = sorted[0];
    if (!head) return "idle";
    if (head.status === "error") return "error";
    if (head.status === "done") return "done";
    return "idle";
  }, [agentPath, activities, sessionStatuses]);
}
