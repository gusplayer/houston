import type { SidebarItem } from "@squad/layout";
import type { Agent, AgentConfig } from "../../lib/types";
import { AgentSidebarColorMenu } from "./agent-sidebar-color-menu";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarIcon, NeedsYouChip } from "./agent-sidebar-status";

interface BuildAgentSidebarItemsArgs {
  agents: Agent[];
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
  onChangeColor: (agentId: string, color: string) => void;
  /** Resolves an AgentConfig by config id so role labels can be read from the manifest. */
  getConfig: (configId: string) => AgentConfig | undefined;
}

export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  onChangeColor,
  getConfig,
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
      subtitle: getConfig(agent.configId)?.roleLabel ?? "",
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
