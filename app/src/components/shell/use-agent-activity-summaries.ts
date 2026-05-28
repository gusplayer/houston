import { useMemo } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import {
  useSessionStatusStore,
  getSessionStatusKey,
  isActiveSessionStatus,
} from "../../stores/session-status";
import { buildAgentActivitySummaries } from "./agent-activity-summary-model";

export function useAgentActivitySummaries(
  agents: Pick<Agent, "id" | "folderPath">[],
) {
  const agentPaths = useMemo(
    () => agents.map((agent) => agent.folderPath),
    [agents],
  );
  const { data: conversations } = useAllConversations(agentPaths);
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);

  return useMemo(() => {
    const summaries = buildAgentActivitySummaries(agents, conversations ?? []);
    for (const agent of agents) {
      const ptyKey = getSessionStatusKey(agent.folderPath, "pty");
      if (isActiveSessionStatus(sessionStatuses[ptyKey])) {
        const s = summaries[agent.id];
        if (s) s.runningCount += 1;
      }
    }
    return summaries;
  }, [agents, conversations, sessionStatuses]);
}
