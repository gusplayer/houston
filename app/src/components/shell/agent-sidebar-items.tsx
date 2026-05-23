import type { SidebarItem } from "@squad/layout";
import type { Agent } from "../../lib/types";
import { AgentSidebarColorMenu } from "./agent-sidebar-color-menu";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarIcon, NeedsYouChip } from "./agent-sidebar-status";

/**
 * Short role label shown under each agent's name in the sidebar so the
 * roster reads as a team ("Peter — Frontend Lead") instead of just
 * first names. Keyed by the built-in agent config id; custom / blank
 * agents render with no subtitle.
 *
 * Exported so the agent-creation dialog can reuse it as the subtitle
 * under the avatar when picking a role from the store.
 */
export const ROLE_LABELS: Record<string, string> = {
  "cto-agent": "CTO",
  "mobile-lead-agent": "Mobile Lead",
  "backend-lead-agent": "Backend Lead",
  "frontend-lead-agent": "Frontend Lead",
  "designer-agent": "UI/UX Designer",
  "qa-agent": "QA Engineer",
  "devops-agent": "DevOps",
  "dev-agent": "Dev",
  "personal-assistant": "Assistant",
};

interface BuildAgentSidebarItemsArgs {
  agents: Agent[];
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
  onChangeColor: (agentId: string, color: string) => void;
}

export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  onChangeColor,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
    };
    const hasRunning = summary.runningCount > 0;

    return {
      id: agent.id,
      name: agent.name,
      subtitle: ROLE_LABELS[agent.configId],
      icon: (
        <AgentSidebarIcon
          color={agent.color}
          running={hasRunning}
          runningLabel={runningLabel(summary.runningCount)}
        />
      ),
      trailing:
        summary.needsYouCount > 0 ? (
          <NeedsYouChip
            count={summary.needsYouCount}
            label={needsYouLabel(summary.needsYouCount)}
          />
        ) : undefined,
      menuContent: (
        <AgentSidebarColorMenu
          color={agent.color}
          onChange={(color) => onChangeColor(agent.id, color)}
        />
      ),
    };
  });
}
