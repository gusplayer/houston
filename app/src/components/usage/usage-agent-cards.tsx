import type { AgentUsage } from "@squad/engine-client";
import type { Agent } from "../../lib/types";
import { formatTokens, formatUsd, resolveAgentName } from "./helpers";
import { Section } from "./section";

export interface AgentCardsLabels {
  title: string;
  sessions: string;
  tokens: string;
  empty: string;
}

export function AgentCards({
  agents,
  allAgents,
  totalCost,
  labels,
}: {
  agents: AgentUsage[];
  allAgents: Agent[];
  totalCost: number;
  labels: AgentCardsLabels;
}) {
  if (agents.length === 0) {
    return (
      <Section title={labels.title}>
        <div className="text-sm text-muted-foreground">{labels.empty}</div>
      </Section>
    );
  }
  return (
    <Section title={labels.title}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.agentPath}
            agent={agent}
            displayName={resolveAgentName(allAgents, agent.agentPath)}
            totalCost={totalCost}
            labels={labels}
          />
        ))}
      </div>
    </Section>
  );
}

function AgentCard({
  agent,
  displayName,
  totalCost,
  labels,
}: {
  agent: AgentUsage;
  displayName: string;
  totalCost: number;
  labels: { sessions: string; tokens: string };
}) {
  const totalTokens =
    agent.inputTokens +
    agent.outputTokens +
    agent.cacheCreationInputTokens +
    agent.cacheReadInputTokens;
  const sharePct =
    totalCost > 0 ? Math.round((agent.costUsd / totalCost) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium truncate">{displayName}</div>
        <div className="text-sm font-semibold whitespace-nowrap">
          ≈ {formatUsd(agent.costUsd)}
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex gap-3">
        <span>
          {agent.sessions} {labels.sessions}
        </span>
        <span>
          {formatTokens(totalTokens)} {labels.tokens}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.min(100, sharePct)}%` }}
        />
      </div>
    </div>
  );
}
